'use strict';

/**
 * Планировщик базы: по мере роста RCL расставляет строительные площадки.
 *
 * Якорь — первый спавн. Расширения, башни, доп. спавны ставятся "шахматкой"
 * вокруг него; storage/терминал/линк у storage — заранее зарезервированные
 * клетки рядом со спавном. Контейнеры — в конце путей к источникам,
 * контроллеру и минералу; дороги — по этим же путям (PathFinder, результат
 * хранится в памяти). Соблюдаются CONTROLLER_STRUCTURES и лимит площадок.
 *
 * План хранится в Memory.rooms[room].plan; resetRoom(name) его сбрасывает.
 */
const config = require('config');
const utils = require('utils');
const cache = require('cache');
const rooms = require('rooms');
const layout = require('planner.layout');

const PLAN_VERSION = 1;

function terrainOf(room) {
  return room.getTerrain();
}

/** Сетка занятости: стены, постройки (кроме дорог), площадки. */
function occupancy(room) {
  const terrain = terrainOf(room);
  // 0 свободно, 1 стена, 2 постройка-препятствие, 3 дорога, 4 площадка, 5 проходимая постройка
  const grid = new Uint8Array(2500);
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) grid[y * 50 + x] = 1;
    }
  }
  const structs = cache.find(room, FIND_STRUCTURES);
  for (let i = 0; i < structs.length; i++) {
    const s = structs[i];
    const idx = s.pos.y * 50 + s.pos.x;
    if (s.structureType === STRUCTURE_ROAD) {
      if (!grid[idx]) grid[idx] = 3;
    } else if (s.structureType === STRUCTURE_CONTAINER) {
      if (grid[idx] !== 2) grid[idx] = 5;
    } else if (s.structureType !== STRUCTURE_RAMPART) {
      grid[idx] = 2;
    }
  }
  const sites = cache.find(room, FIND_CONSTRUCTION_SITES);
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].structureType === STRUCTURE_RAMPART) continue;
    grid[sites[i].pos.y * 50 + sites[i].pos.x] = 4;
  }
  return grid;
}

function costMatrix(room, grid, roadSet) {
  const m = new PathFinder.CostMatrix();
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const v = grid[y * 50 + x];
      if (v === 2) m.set(x, y, 255);
      else if (v === 3 || roadSet[layout.key(x, y)]) m.set(x, y, 1);
    }
  }
  return m;
}

/** Путь от якоря до цели; возвращает массив {x,y} (последняя клетка — у цели). */
function planPath(room, from, to, rangeTo, matrix) {
  const res = PathFinder.search(from, { pos: to, range: rangeTo }, {
    maxRooms: 1,
    plainCost: 2,
    swampCost: 4,
    roomCallback: function (name) { return name === room.name ? matrix : false; },
  });
  if (res.incomplete) return null;
  return res.path.map(function (p) { return { x: p.x, y: p.y }; });
}

/** Построить план (дороги, контейнеры, линки, ядро). Вызывается редко. */
function buildPlan(room, anchor) {
  const grid = occupancy(room);
  const plan = { v: PLAN_VERSION, anchor: { x: anchor.x, y: anchor.y }, at: Game.time,
    roads: [], srcC: {}, srcL: {}, ctrlC: null, ctrlL: null, minC: null, core: {} };
  const roadSet = {};
  const blocked = {};
  const addRoads = function (path, skipLast) {
    const n = skipLast ? path.length - 1 : path.length;
    for (let i = 0; i < n; i++) {
      const k = layout.key(path[i].x, path[i].y);
      if (!roadSet[k]) {
        roadSet[k] = true;
        plan.roads.push(k);
      }
    }
  };
  const matrix = costMatrix(room, grid, roadSet);
  const from = new RoomPosition(anchor.x, anchor.y, room.name);
  const setRoad = function (path) {
    for (let i = 0; i < path.length; i++) matrix.set(path[i].x, path[i].y, 1);
  };

  // Ядро: storage рядом со спавном, терминал и линк — рядом со storage.
  const isFreeCore = function (x, y) {
    const v = grid[y * 50 + x];
    return v === 0 && !blocked[layout.key(x, y)] && !nearKeyObjects(room, x, y);
  };
  const storagePos = room.storage ? room.storage.pos : layout.checkerboardSlots(anchor, isFreeCore, 1, 6, 2)[0];
  if (storagePos) {
    plan.core.storage = layout.key(storagePos.x, storagePos.y);
    blocked[plan.core.storage] = true;
    const term = room.terminal ? room.terminal.pos : layout.pickNear(storagePos, 2, function (x, y) {
      return isFreeCore(x, y) && (x + y) % 2 === (anchor.x + anchor.y) % 2;
    }, anchor);
    if (term) {
      plan.core.terminal = layout.key(term.x, term.y);
      blocked[plan.core.terminal] = true;
    }
    const sl = layout.pickNear(storagePos, 2, function (x, y) {
      return isFreeCore(x, y) && (x + y) % 2 === (anchor.x + anchor.y) % 2;
    }, anchor);
    if (sl) {
      plan.core.sLink = layout.key(sl.x, sl.y);
      blocked[plan.core.sLink] = true;
    }
  }
  for (const k in blocked) {
    const p = layout.parseKey(k);
    matrix.set(p.x, p.y, 255);
  }

  const containers = cache.structures(room, STRUCTURE_CONTAINER);
  const existingContainer = function (pos, r) {
    return containers.filter(function (c) { return c.pos.inRangeTo(pos, r); })[0];
  };
  // Путь к объекту; если рядом уже стоит контейнер — путь ведёт к нему.
  const pathTo = function (pos, r, existingRange) {
    const c = existingContainer(pos, existingRange || r);
    return c ? planPath(room, from, c.pos, 0, matrix) : planPath(room, from, pos, r, matrix);
  };

  // Источники: путь → контейнер в конце → линк рядом с контейнером.
  const sources = cache.sources(room).slice().sort(function (a, b) {
    return b.pos.getRangeTo(from) - a.pos.getRangeTo(from); // дальние первыми (их линк важнее)
  });
  plan.srcOrder = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const path = pathTo(s.pos, 1);
    if (!path || !path.length) continue;
    const end = path[path.length - 1];
    plan.srcC[s.id] = layout.key(end.x, end.y);
    plan.srcOrder.push(s.id);
    addRoads(path, true);
    setRoad(path.slice(0, -1));
    matrix.set(end.x, end.y, 255);
  }

  // Контроллер
  const ctrl = room.controller;
  if (ctrl) {
    const path = pathTo(ctrl.pos, 2, 3);
    if (path && path.length) {
      const end = path[path.length - 1];
      plan.ctrlC = layout.key(end.x, end.y);
      addRoads(path, true);
      setRoad(path.slice(0, -1));
      matrix.set(end.x, end.y, 255);
    }
  }

  // Минерал
  const mineral = cache.find(room, FIND_MINERALS)[0];
  if (mineral) {
    const path = pathTo(mineral.pos, 1);
    if (path && path.length) {
      const end = path[path.length - 1];
      plan.minC = layout.key(end.x, end.y);
      addRoads(path, true);
      setRoad(path.slice(0, -1));
    }
  }

  // Дорога к storage
  if (storagePos) {
    const sp = new RoomPosition(storagePos.x, storagePos.y, room.name);
    const path = planPath(room, from, sp, 1, matrix);
    if (path) addRoads(path, false);
  }

  // Линки у контейнеров (не на дорогах, не на заблокированных клетках)
  const linkFree = function (x, y) {
    const v = grid[y * 50 + x];
    const k = layout.key(x, y);
    return v === 0 && !roadSet[k] && !blocked[k] && !isPlannedContainer(plan, k);
  };
  for (const id in plan.srcC) {
    const c = layout.parseKey(plan.srcC[id]);
    const l = layout.pickNear(c, 1, linkFree, anchor);
    if (l) {
      plan.srcL[id] = layout.key(l.x, l.y);
      blocked[plan.srcL[id]] = true;
    }
  }
  if (plan.ctrlC && ctrl) {
    const c = layout.parseKey(plan.ctrlC);
    const l = layout.pickNear(c, 1, function (x, y) {
      return linkFree(x, y) && layout.range({ x: x, y: y }, ctrl.pos) <= 3;
    }, anchor);
    if (l) plan.ctrlL = layout.key(l.x, l.y);
  }
  return plan;
}

function isPlannedContainer(plan, k) {
  if (plan.ctrlC === k || plan.minC === k) return true;
  for (const id in plan.srcC) if (plan.srcC[id] === k) return true;
  return false;
}

/** Не загораживать клетки вокруг источников, минерала и контроллера. */
function nearKeyObjects(room, x, y) {
  return cache.memo(room, 'keyObjects', function () {
    const set = {};
    const mark = function (pos, r) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) set[layout.key(pos.x + dx, pos.y + dy)] = true;
      }
    };
    cache.sources(room).forEach(function (s) { mark(s.pos, 2); });
    cache.find(room, FIND_MINERALS).forEach(function (m) { mark(m.pos, 1); });
    if (room.controller) mark(room.controller.pos, 2);
    return set;
  })[layout.key(x, y)] === true;
}

/** Счётчик построек и площадок по типам. */
function countByType(room) {
  const counts = {};
  const structs = cache.find(room, FIND_STRUCTURES);
  for (let i = 0; i < structs.length; i++) {
    const t = structs[i].structureType;
    if (structs[i].my === false) continue;
    counts[t] = (counts[t] || 0) + 1;
  }
  const sites = cache.find(room, FIND_MY_CONSTRUCTION_SITES);
  const siteCounts = {};
  for (let i = 0; i < sites.length; i++) {
    const t = sites[i].structureType;
    siteCounts[t] = (siteCounts[t] || 0) + 1;
  }
  return { built: counts, sites: siteCounts };
}

/** Поставить спавн в только что захваченной комнате. */
function placeFirstSpawn(room) {
  if (cache.find(room, FIND_MY_CONSTRUCTION_SITES).some(function (s) { return s.structureType === STRUCTURE_SPAWN; })) {
    return;
  }
  const flag = cache.find(room, FIND_FLAGS).filter(function (f) { return /^spawn/i.test(f.name); })[0];
  let pos = flag ? flag.pos : null;
  if (!pos) {
    const terrain = terrainOf(room);
    const p = layout.chooseSpawnPos(function (x, y) {
      return x < 1 || y < 1 || x > 48 || y > 48 || terrain.get(x, y) === TERRAIN_MASK_WALL;
    }, cache.sources(room).map(function (s) { return s.pos; }), room.controller ? room.controller.pos : null);
    if (p) pos = new RoomPosition(p.x, p.y, room.name);
  }
  if (!pos) return;
  const r = room.createConstructionSite(pos.x, pos.y, STRUCTURE_SPAWN);
  utils.log(room.name + ': площадка первого спавна ' + pos.x + ',' + pos.y + ' (' + r + ')');
}

function run(room) {
  if (!config.isOn('planner')) return;
  const ctrl = room.controller;
  if (!ctrl || !ctrl.my) return;
  const mem = rooms.mem(room.name);
  const rcl = ctrl.level;
  if (mem.planAt && Game.time - mem.planAt < config.planner.interval && mem.planRcl === rcl) return;
  mem.planAt = Game.time;
  mem.planRcl = rcl;

  const spawn = cache.myStructures(room, STRUCTURE_SPAWN)[0];
  if (!spawn) {
    placeFirstSpawn(room);
    return;
  }

  const globalSites = Object.keys(Game.constructionSites).length;
  let budget = Math.min(config.planner.maxSitesPerRoom - cache.sites(room).length,
    config.planner.maxSitesGlobal - globalSites);
  if (budget <= 0) return;

  const old = mem.plan;
  const anchorOk = !!(old && old.anchor && cache.myStructures(room, STRUCTURE_SPAWN).some(function (s) {
    return s.pos.x === old.anchor.x && s.pos.y === old.anchor.y;
  }));
  if (!old || old.v !== PLAN_VERSION || Game.time - old.at > 20000 || !anchorOk) {
    mem.plan = buildPlan(room, spawn.pos);
  }
  const plan = mem.plan;
  const anchor = plan.anchor;
  const limits = CONTROLLER_STRUCTURES;
  const counts = countByType(room);
  const grid = occupancy(room);
  const reserved = {};
  plan.roads.forEach(function (k) { reserved[k] = true; });
  for (const k in plan.core) reserved[plan.core[k]] = true;
  for (const id in plan.srcC) reserved[plan.srcC[id]] = true;
  for (const id in plan.srcL) reserved[plan.srcL[id]] = true;
  if (plan.ctrlC) reserved[plan.ctrlC] = true;
  if (plan.ctrlL) reserved[plan.ctrlL] = true;
  if (plan.minC) reserved[plan.minC] = true;

  const placed = {};
  const isFree = function (x, y) {
    const k = layout.key(x, y);
    return grid[y * 50 + x] === 0 && !reserved[k] && !placed[k] && !nearKeyObjects(room, x, y);
  };
  const remaining = function (type) {
    return layout.remainingAllowed(limits, type, rcl, counts.built[type] || 0, counts.sites[type] || 0);
  };
  const place = function (x, y, type) {
    if (budget <= 0) return false;
    const r = room.createConstructionSite(x, y, type);
    if (r === OK) {
      budget--;
      placed[layout.key(x, y)] = true;
      counts.sites[type] = (counts.sites[type] || 0) + 1;
      return true;
    }
    return false;
  };
  const placeAtKey = function (k, type) {
    if (!k || remaining(type) <= 0) return;
    const p = layout.parseKey(k);
    const v = grid[p.y * 50 + p.x];
    if (v === 0 || (v === 3 && type === STRUCTURE_CONTAINER)) place(p.x, p.y, type);
  };
  const placeSlots = function (type) {
    const n = Math.min(remaining(type), budget);
    if (n <= 0) return;
    const slots = layout.checkerboardSlots(anchor, isFree, n);
    for (let i = 0; i < slots.length; i++) place(slots[i].x, slots[i].y, type);
  };

  // 1. Спавны и башни
  placeSlots(STRUCTURE_SPAWN);
  placeSlots(STRUCTURE_TOWER);
  // 2. Контейнеры у источников — основа экономики майнеров
  if (rcl >= config.planner.containersFromRcl) {
    (plan.srcOrder || Object.keys(plan.srcC)).forEach(function (id) { placeAtKey(plan.srcC[id], STRUCTURE_CONTAINER); });
  }
  // 3. Расширения, storage, контейнер у контроллера
  placeSlots(STRUCTURE_EXTENSION);
  placeAtKey(plan.core.storage, STRUCTURE_STORAGE);
  if (rcl >= config.planner.containersFromRcl) placeAtKey(plan.ctrlC, STRUCTURE_CONTAINER);
  // 4. Линки: дальний источник, контроллер, storage, остальные источники
  if (rcl >= 5) {
    const order = plan.srcOrder || Object.keys(plan.srcL);
    if (order[0]) placeAtKey(plan.srcL[order[0]], STRUCTURE_LINK);
    placeAtKey(plan.ctrlL, STRUCTURE_LINK);
    placeAtKey(plan.core.sLink, STRUCTURE_LINK);
    for (let i = 1; i < order.length; i++) placeAtKey(plan.srcL[order[i]], STRUCTURE_LINK);
  }
  // 5. Терминал, экстрактор и контейнер у минерала
  if (rcl >= 6) {
    placeAtKey(plan.core.terminal, STRUCTURE_TERMINAL);
    if (config.isOn('mineralMining')) {
      const mineral = cache.find(room, FIND_MINERALS)[0];
      if (mineral && remaining(STRUCTURE_EXTRACTOR) > 0 &&
          !mineral.pos.lookFor(LOOK_STRUCTURES).length) {
        place(mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR);
      }
      placeAtKey(plan.minC, STRUCTURE_CONTAINER);
    }
  }
  // 6. Дороги
  if (config.isOn('roads') && rcl >= config.planner.roadsFromRcl) {
    let n = Math.min(config.planner.roadSitesPerRun, budget);
    for (let i = 0; i < plan.roads.length && n > 0; i++) {
      const p = layout.parseKey(plan.roads[i]);
      if (grid[p.y * 50 + p.x] !== 0) continue;
      if (place(p.x, p.y, STRUCTURE_ROAD)) n--;
    }
  }
  // 7. Рампарты на ключевых постройках
  if (config.isOn('ramparts') && rcl >= config.planner.rampartsFromRcl) {
    const key = cache.find(room, FIND_MY_STRUCTURES).filter(function (s) {
      return s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_TOWER ||
        s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL;
    });
    const ramparts = {};
    cache.structures(room, STRUCTURE_RAMPART).forEach(function (r) { ramparts[layout.key(r.pos.x, r.pos.y)] = true; });
    cache.find(room, FIND_MY_CONSTRUCTION_SITES).forEach(function (s) {
      if (s.structureType === STRUCTURE_RAMPART) ramparts[layout.key(s.pos.x, s.pos.y)] = true;
    });
    for (let i = 0; i < key.length && budget > 0; i++) {
      const k = layout.key(key[i].pos.x, key[i].pos.y);
      if (!ramparts[k]) place(key[i].pos.x, key[i].pos.y, STRUCTURE_RAMPART);
    }
  }
}

/** Показать план комнаты (RoomVisual) — для консоли showPlan(). */
function visualize(room) {
  const plan = rooms.mem(room.name).plan;
  if (!plan) return false;
  const v = room.visual;
  plan.roads.forEach(function (k) {
    const p = layout.parseKey(k);
    v.circle(p.x, p.y, { radius: 0.15, fill: '#888' });
  });
  const mark = function (k, text, color) {
    if (!k) return;
    const p = layout.parseKey(k);
    v.text(text, p.x, p.y + 0.25, { color: color, font: 0.6 });
  };
  for (const id in plan.srcC) mark(plan.srcC[id], 'C', '#fc0');
  for (const id in plan.srcL) mark(plan.srcL[id], 'L', '#0cf');
  mark(plan.ctrlC, 'C', '#fc0');
  mark(plan.ctrlL, 'L', '#0cf');
  mark(plan.minC, 'C', '#fc0');
  mark(plan.core.storage, 'S', '#ff0');
  mark(plan.core.terminal, 'T', '#f0f');
  mark(plan.core.sLink, 'L', '#0cf');
  return true;
}

module.exports = { run: run, buildPlan: buildPlan, visualize: visualize };
