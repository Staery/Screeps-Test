'use strict';

/**
 * Общие действия крипов: добыть/забрать энергию, отвезти, строить, чинить,
 * улучшать контроллер, отойти с дороги, переработка у спавна.
 *
 * Все функции возвращают true, если крип в этом тике чем-то занят
 * (идёт к цели или выполняет действие), и false, если делать нечего.
 */
const config = require('config');
const utils = require('utils');
const cache = require('cache');
const targets = require('targets');
const movement = require('movement');
const rooms = require('rooms');

const BUILD_PRIORITY = {};
[STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_CONTAINER, STRUCTURE_EXTENSION, STRUCTURE_STORAGE,
  STRUCTURE_LINK, STRUCTURE_TERMINAL, STRUCTURE_EXTRACTOR, STRUCTURE_LAB, STRUCTURE_FACTORY,
  STRUCTURE_ROAD, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_OBSERVER, STRUCTURE_POWER_SPAWN,
  STRUCTURE_NUKER].forEach(function (t, i) { BUILD_PRIORITY[t] = i; });

const OBSTACLES = {};
(typeof OBSTACLE_OBJECT_TYPES !== 'undefined' ? OBSTACLE_OBJECT_TYPES : [])
  .forEach(function (t) { OBSTACLES[t] = true; });

/** Переключение режима работы: true — тратим ресурс, false — набираем. */
function updateWorking(creep) {
  const m = creep.memory;
  if (!creep.store.getCapacity()) {
    m.working = false; // нет CARRY-частей
    return false;
  }
  if (m.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    m.working = false;
    targets.clearDrop(creep);
  } else if (!m.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
    m.working = true;
    targets.clearPick(creep);
  }
  return m.working;
}

function home(creep) {
  return Game.rooms[creep.memory.home] || creep.room;
}

// ---------------------------------------------------------------- энергия

function energyCandidates(creep, opts) {
  const room = creep.room;
  const min = opts.minAmount;
  const list = [];
  const exclude = opts.exclude || [];
  if (opts.dropped) {
    const dropped = cache.find(room, FIND_DROPPED_RESOURCES);
    for (let i = 0; i < dropped.length; i++) {
      const r = dropped[i];
      if (r.resourceType === RESOURCE_ENERGY && r.amount >= min) list.push(r);
    }
  }
  if (opts.ruins) {
    const graves = cache.find(room, FIND_TOMBSTONES).concat(cache.find(room, FIND_RUINS));
    for (let i = 0; i < graves.length; i++) {
      if ((graves[i].store[RESOURCE_ENERGY] || 0) >= min) list.push(graves[i]);
    }
  }
  if (opts.containers) {
    const cs = cache.structures(room, STRUCTURE_CONTAINER);
    for (let i = 0; i < cs.length; i++) {
      if (exclude.indexOf(cs[i].id) === -1 && cs[i].store.getUsedCapacity(RESOURCE_ENERGY) >= min) list.push(cs[i]);
    }
  }
  if (opts.storage && room.storage && room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > opts.storageMin) list.push(room.storage);
  if (opts.terminal && room.terminal && room.terminal.store.getUsedCapacity(RESOURCE_ENERGY) > opts.storageMin) list.push(room.terminal);
  if (opts.links) {
    for (let i = 0; i < opts.links.length; i++) {
      const l = rooms.byId(opts.links[i]);
      if (l && l.store.getUsedCapacity(RESOURCE_ENERGY) > 0) list.push(l);
    }
  }
  return list;
}

function availableEnergy(obj, creep, storageMin) {
  let amount = utils.amountOf(obj, RESOURCE_ENERGY);
  if (obj.structureType === STRUCTURE_STORAGE || obj.structureType === STRUCTURE_TERMINAL) amount -= storageMin;
  let reserved = targets.pickReserved(obj.id);
  if (creep.memory.pick === obj.id) reserved -= creep.memory.pickAmt || 0;
  return amount - reserved;
}

/** Забрать ресурс из объекта (Resource, store-объект или Source). */
function takeFrom(creep, target, resource) {
  const res = resource || RESOURCE_ENERGY;
  if (!creep.pos.isNearTo(target)) {
    movement.moveTo(creep, target, { range: 1 });
    return OK;
  }
  let r;
  if (target.resourceType !== undefined) r = creep.pickup(target);
  else if (target.store) r = creep.withdraw(target, res);
  else r = creep.harvest(target);
  targets.clearPick(creep);
  return r;
}

/**
 * Получить энергию.
 * @param {Creep} creep
 * @param {object} [o] storage, containers, dropped, ruins, terminal (bool), links (id[]),
 *   exclude (id[]), storageMin, minAmount, harvest (добывать самому, если больше негде)
 */
function getEnergy(creep, o) {
  const opts = Object.assign({ storage: true, containers: true, dropped: true, ruins: true, terminal: false,
    links: null, exclude: null, storageMin: 0, minAmount: 50, harvest: false }, o || {});
  const want = creep.store.getFreeCapacity(RESOURCE_ENERGY);
  if (want === 0) return false;

  let target = creep.memory.pick ? Game.getObjectById(creep.memory.pick) : null;
  if (target && (target.pos.roomName !== creep.room.name || availableEnergy(target, creep, opts.storageMin) <= 0)) {
    target = null;
  }
  if (!target) {
    targets.clearPick(creep);
    const best = targets.pickBest(energyCandidates(creep, opts),
      function (x) { return availableEnergy(x, creep, opts.storageMin); },
      function (x) { return creep.pos.getRangeTo(x); },
      Math.min(opts.minAmount, want), want);
    if (best) {
      target = best.target;
      targets.setPick(creep, target.id, best.amount);
    }
  }
  if (target) {
    takeFrom(creep, target);
    return true;
  }
  if (opts.harvest) return harvestAny(creep);
  return false;
}

/** Добывать из любого активного источника комнаты (ранняя игра / аварийно). */
function harvestAny(creep) {
  let source = creep.memory.hsrc ? Game.getObjectById(creep.memory.hsrc) : null;
  if (!source || source.energy === 0 || source.pos.roomName !== creep.room.name) {
    source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, { ignoreCreeps: true });
    creep.memory.hsrc = source ? source.id : null;
  }
  if (!source) return false;
  harvest(creep, source);
  return true;
}

function harvest(creep, source) {
  const r = creep.harvest(source);
  if (r === ERR_NOT_IN_RANGE) movement.moveTo(creep, source, { range: 1 });
  return r;
}

/** Постройки, которые нужно заполнить энергией для спавна. */
function spawnFillTargets(room) {
  return cache.memo(room, 'fill', function () {
    return cache.myStructures(room, STRUCTURE_SPAWN).concat(cache.myStructures(room, STRUCTURE_EXTENSION))
      .filter(function (s) { return s.store.getFreeCapacity(RESOURCE_ENERGY) > 0; });
  });
}

function freeFor(s, creep) {
  let reserved = targets.dropReserved(s.id);
  if (creep.memory.drop === s.id) reserved -= creep.memory.dropAmt || 0;
  return s.store.getFreeCapacity(RESOURCE_ENERGY) - reserved;
}

function deliveryTiers(creep, opts) {
  const room = creep.room;
  const tiers = [];
  if (opts.spawn) tiers.push(spawnFillTargets(room));
  if (opts.towers) {
    tiers.push(cache.myStructures(room, STRUCTURE_TOWER).filter(function (t) {
      return t.store.getUsedCapacity(RESOURCE_ENERGY) < t.store.getCapacity(RESOURCE_ENERGY) * opts.towerLevel;
    }));
  }
  if (opts.controllerContainer) {
    const info = Memory.rooms[room.name] && Memory.rooms[room.name].ctrl;
    const cc = info && info.c ? Game.getObjectById(info.c) : null;
    if (cc && cc.store.getFreeCapacity(RESOURCE_ENERGY) >= 200) tiers.push([cc]);
  }
  if (opts.terminal && room.terminal && room.terminal.my &&
      room.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < config.terminal.energyTarget) {
    tiers.push([room.terminal]);
  }
  if (opts.storage && room.storage && room.storage.my) tiers.push([room.storage]);
  return tiers;
}

function chooseDelivery(creep, opts, carried, excludeId) {
  const tiers = deliveryTiers(creep, opts);
  for (let t = 0; t < tiers.length; t++) {
    let best = null;
    let bestRange = Infinity;
    for (let i = 0; i < tiers[t].length; i++) {
      const s = tiers[t][i];
      if (s.id === excludeId || freeFor(s, creep) <= 0) continue;
      const r = creep.pos.getRangeTo(s);
      if (r < bestRange) {
        bestRange = r;
        best = s;
      }
    }
    if (best) return { target: best, amount: Math.min(carried, freeFor(best, creep)) };
  }
  return null;
}

/**
 * Отвезти энергию. Порядок: спавн/расширения → башни → контейнер контроллера →
 * терминал (до цели) → storage.
 * @param {object} [o] spawn, towers, towerLevel, controllerContainer, terminal, storage
 */
function deliverEnergy(creep, o) {
  const opts = Object.assign({ spawn: true, towers: true, towerLevel: 0.8, controllerContainer: false,
    terminal: false, storage: true }, o || {});
  let carried = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  if (!carried) return false;

  let target = creep.memory.drop ? Game.getObjectById(creep.memory.drop) : null;
  if (target && (target.pos.roomName !== creep.room.name || freeFor(target, creep) <= 0)) target = null;
  if (!target) {
    targets.clearDrop(creep);
    const choice = chooseDelivery(creep, opts, carried);
    if (!choice) return false;
    target = choice.target;
    targets.setDrop(creep, target.id, choice.amount);
  }
  if (!creep.pos.isNearTo(target)) {
    movement.moveTo(creep, target, { range: 1 });
    return true;
  }
  const amount = Math.min(carried, target.store.getFreeCapacity(RESOURCE_ENERGY));
  const r = creep.transfer(target, RESOURCE_ENERGY);
  targets.clearDrop(creep);
  if (r === OK) {
    carried -= amount;
    // Сразу двигаемся к следующей цели (экономит тики на заполнении расширений).
    if (carried > 0) {
      const next = chooseDelivery(creep, opts, carried, target.id);
      if (next && !creep.pos.isNearTo(next.target)) {
        targets.setDrop(creep, next.target.id, next.amount);
        movement.moveTo(creep, next.target, { range: 1 });
      }
    }
  }
  return true;
}

/** Сложить все не-энергетические ресурсы в терминал/storage. */
function storeMinerals(creep) {
  let resource = null;
  for (const r in creep.store) {
    if (r !== RESOURCE_ENERGY && creep.store[r] > 0) {
      resource = r;
      break;
    }
  }
  if (!resource) return false;
  const room = home(creep);
  let target = null;
  if (room.terminal && room.terminal.my && room.terminal.store.getFreeCapacity() > 5000) target = room.terminal;
  else if (room.storage && room.storage.my && room.storage.store.getFreeCapacity() > 0) target = room.storage;
  if (!target) {
    creep.drop(resource);
    return true;
  }
  if (creep.transfer(target, resource) === ERR_NOT_IN_RANGE) movement.moveTo(creep, target, { range: 1 });
  return true;
}

// ---------------------------------------------------------------- работа

function chooseSite(creep) {
  const sites = cache.sites(creep.room);
  let best = null;
  let bestKey = Infinity;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const pr = BUILD_PRIORITY[s.structureType] === undefined ? 20 : BUILD_PRIORITY[s.structureType];
    // Почти готовые площадки — в первую очередь внутри одного приоритета.
    const key = pr * 1000 + creep.pos.getRangeTo(s) - (s.progress / s.progressTotal) * 10;
    if (key < bestKey) {
      bestKey = key;
      best = s;
    }
  }
  return best;
}

/** Строить площадку с наивысшим приоритетом в текущей комнате. */
function build(creep) {
  let site = creep.memory.buildId ? Game.getObjectById(creep.memory.buildId) : null;
  if (!site) {
    // Только что достроенный рампарт — сразу подтянуть хиты, иначе он распадётся.
    if (creep.memory.buildPos && creep.memory.buildType === STRUCTURE_RAMPART) {
      const p = creep.memory.buildPos;
      const ramp = creep.room.lookForAt(LOOK_STRUCTURES, p.x, p.y)
        .filter(function (s) { return s.structureType === STRUCTURE_RAMPART && s.hits < 20000; })[0];
      if (ramp) {
        if (creep.repair(ramp) === ERR_NOT_IN_RANGE) movement.moveTo(creep, ramp, { range: 3 });
        return true;
      }
    }
    site = chooseSite(creep);
    creep.memory.buildId = site ? site.id : null;
    if (site) {
      creep.memory.buildPos = { x: site.pos.x, y: site.pos.y };
      creep.memory.buildType = site.structureType;
    } else {
      delete creep.memory.buildPos;
      delete creep.memory.buildType;
    }
  }
  if (!site) return false;
  if (creep.pos.isEqualTo(site.pos) && OBSTACLES[site.structureType]) {
    // Нельзя строить препятствие под собой — отходим.
    movement.moveTo(creep, home(creep).controller || site, { range: 3 });
    return true;
  }
  const r = creep.build(site);
  if (r === ERR_NOT_IN_RANGE) movement.moveTo(creep, site, { range: 3 });
  else if (r !== OK) creep.memory.buildId = null;
  return true;
}

function needsRepair(s) {
  if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) return false;
  if (s.hits === undefined || s.hitsMax === undefined) return false;
  if (s.owner && !s.my) return false;
  return s.hits < s.hitsMax * config.repair.threshold;
}

/** Повреждённые дороги/контейнеры/прочее (без стен и рампартов). */
function repairTargets(room) {
  return cache.memo(room, 'repair', function () {
    return cache.find(room, FIND_STRUCTURES).filter(needsRepair);
  });
}

/** Чинить постройки (не стены). */
function repair(creep) {
  let t = creep.memory.repId ? Game.getObjectById(creep.memory.repId) : null;
  if (t && t.hits >= t.hitsMax * config.repair.doneRatio) t = null;
  if (!t) {
    const list = repairTargets(creep.room);
    let best = null;
    let bestKey = Infinity;
    for (let i = 0; i < list.length; i++) {
      const key = list[i].hits / list[i].hitsMax * 50 + creep.pos.getRangeTo(list[i]);
      if (key < bestKey) {
        bestKey = key;
        best = list[i];
      }
    }
    t = best;
    creep.memory.repId = t ? t.id : null;
  }
  if (!t) return false;
  if (creep.repair(t) === ERR_NOT_IN_RANGE) movement.moveTo(creep, t, { range: 3 });
  return true;
}

/** Стены и рампарты ниже целевого уровня. */
function wallTargets(room) {
  return cache.memo(room, 'walls', function () {
    const goal = config.wallTarget(room.controller ? room.controller.level : 0);
    if (!goal) return [];
    return cache.myStructures(room, STRUCTURE_RAMPART).concat(cache.structures(room, STRUCTURE_WALL))
      .filter(function (s) { return s.hits !== undefined && s.hits < Math.min(goal, s.hitsMax); });
  });
}

/** Чинить самую слабую стену/рампарт порциями (до цели по RCL). */
function repairWalls(creep) {
  const room = creep.room;
  const goal = config.wallTarget(room.controller ? room.controller.level : 0);
  let t = creep.memory.wallId ? Game.getObjectById(creep.memory.wallId) : null;
  if (t && t.hits >= (creep.memory.wallGoal || goal)) t = null;
  if (!t) {
    const list = wallTargets(room);
    let best = null;
    for (let i = 0; i < list.length; i++) {
      if (!best || list[i].hits < best.hits ||
          list[i].hits === best.hits && creep.pos.getRangeTo(list[i]) < creep.pos.getRangeTo(best)) {
        best = list[i];
      }
    }
    t = best;
    creep.memory.wallId = t ? t.id : null;
    if (t) {
      const rcl = room.controller ? room.controller.level : 1;
      creep.memory.wallGoal = Math.min(goal, t.hits + 10000 * rcl);
    }
  }
  if (!t) return false;
  if (creep.repair(t) === ERR_NOT_IN_RANGE) movement.moveTo(creep, t, { range: 3 });
  return true;
}

/** Улучшать контроллер (и подписать его, если настроено). */
function upgrade(creep) {
  const ctrl = creep.room.controller;
  if (!ctrl || !ctrl.my) return false;
  if (signIfNeeded(creep, ctrl)) return true;
  const r = creep.upgradeController(ctrl);
  if (r === ERR_NOT_IN_RANGE) movement.moveTo(creep, ctrl, { range: 3 });
  return r === OK || r === ERR_NOT_IN_RANGE;
}

/** Подписать контроллер текстом config.signText. */
function signIfNeeded(creep, ctrl) {
  const text = config.signText;
  if (!text || !config.isOn('signControllers') || !ctrl) return false;
  if (ctrl.sign && ctrl.sign.text === text) return false;
  if (creep.memory.signTried && Game.time - creep.memory.signTried < 500) return false;
  const r = creep.signController(ctrl, text);
  if (r === ERR_NOT_IN_RANGE) {
    movement.moveTo(creep, ctrl, { range: 1 });
    return true;
  }
  creep.memory.signTried = Game.time;
  return false;
}

/** Отойти с дороги и подождать. */
function park(creep, anchor) {
  const room = creep.room;
  let target = anchor;
  if (!target) {
    const flag = cache.find(room, FIND_FLAGS).filter(function (f) { return /^rally/i.test(f.name); })[0];
    target = flag || room.storage || cache.myStructures(room, STRUCTURE_SPAWN)[0] || room.controller;
  }
  if (!target) return false;
  if (!creep.pos.inRangeTo(target, 4)) {
    movement.moveTo(creep, target, { range: 3 });
    return true;
  }
  const onRoad = creep.pos.lookFor(LOOK_STRUCTURES).some(function (s) { return s.structureType === STRUCTURE_ROAD; });
  if (onRoad || creep.pos.inRangeTo(target, 1)) {
    creep.move(1 + Math.floor(Math.random() * 8));
  }
  return true;
}

/** Идти к ближайшему спавну и переработаться (вернуть часть энергии). */
function recycle(creep) {
  const room = Game.rooms[creep.memory.home] || creep.room;
  const spawn = cache.myStructures(room, STRUCTURE_SPAWN)[0];
  if (!spawn) {
    creep.suicide();
    return true;
  }
  if (creep.room.name !== spawn.room.name || !creep.pos.isNearTo(spawn)) {
    movement.moveTo(creep, spawn, { range: 1 });
    return true;
  }
  spawn.recycleCreep(creep);
  return true;
}

/** Вернуться в домашнюю комнату. true — ещё в пути. */
function goHome(creep) {
  const h = creep.memory.home;
  if (!h || creep.room.name === h) return movement.stepOffEdge(creep);
  movement.travelToRoom(creep, h);
  return true;
}

module.exports = {
  BUILD_PRIORITY: BUILD_PRIORITY,
  updateWorking: updateWorking,
  home: home,
  getEnergy: getEnergy,
  harvestAny: harvestAny,
  harvest: harvest,
  takeFrom: takeFrom,
  spawnFillTargets: spawnFillTargets,
  deliverEnergy: deliverEnergy,
  storeMinerals: storeMinerals,
  chooseSite: chooseSite,
  build: build,
  repairTargets: repairTargets,
  needsRepair: needsRepair,
  repair: repair,
  wallTargets: wallTargets,
  repairWalls: repairWalls,
  upgrade: upgrade,
  signIfNeeded: signIfNeeded,
  park: park,
  recycle: recycle,
  goHome: goHome,
};
