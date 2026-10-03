'use strict';

/**
 * Передвижение: кэширование путей (reusePath), обнаружение застревания,
 * обмен местами со своими крипами, маршруты между комнатами в обход опасных
 * комнат и комнат Source Keeper'ов, бегство от врагов.
 */
const config = require('config');
const utils = require('utils');
const cache = require('cache');

/** Стоимость прохода через комнату для Game.map.findRoute. */
function roomRouteCost(roomName, targetRoom) {
  if (roomName === targetRoom) return 1;
  const m = Memory.rooms && Memory.rooms[roomName];
  if (m && m.avoid) return Infinity;
  if (utils.hostileOwner(roomName) && m && m.towers > 0) return Infinity;
  if (config.avoidSourceKeeperRooms && utils.isSourceKeeperRoom(roomName)) return Infinity;
  if (m && m.hostileUntil && m.hostileUntil > Game.time) return 5;
  if (utils.isHighway(roomName)) return 1;
  // Свои комнаты — дешевле (есть дороги)
  const room = Game.rooms[roomName];
  if (room && room.controller && room.controller.my) return 1;
  return 1.5;
}

/** Список комнат маршрута (без исходной). null — пути нет. */
function findRoute(from, to) {
  if (from === to) return [];
  const res = Game.map.findRoute(from, to, { routeCallback: function (roomName) { return roomRouteCost(roomName, to); } });
  if (res === ERR_NO_PATH || !Array.isArray(res)) return null;
  return res.map(function (step) { return step.room; });
}

function isEdge(pos) {
  return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
}

/** Шаг внутрь комнаты, если крип стоит на краю (иначе он "прыгает" обратно). */
function stepOffEdge(creep) {
  if (!isEdge(creep.pos)) return false;
  const terrain = creep.room.getTerrain();
  const dirs = [];
  if (creep.pos.x === 0) dirs.push(RIGHT, TOP_RIGHT, BOTTOM_RIGHT);
  else if (creep.pos.x === 49) dirs.push(LEFT, TOP_LEFT, BOTTOM_LEFT);
  if (creep.pos.y === 0) dirs.push(BOTTOM, BOTTOM_LEFT, BOTTOM_RIGHT);
  else if (creep.pos.y === 49) dirs.push(TOP, TOP_LEFT, TOP_RIGHT);
  const offsets = {};
  offsets[TOP] = [0, -1]; offsets[TOP_RIGHT] = [1, -1]; offsets[RIGHT] = [1, 0]; offsets[BOTTOM_RIGHT] = [1, 1];
  offsets[BOTTOM] = [0, 1]; offsets[BOTTOM_LEFT] = [-1, 1]; offsets[LEFT] = [-1, 0]; offsets[TOP_LEFT] = [-1, -1];
  for (let i = 0; i < dirs.length; i++) {
    const o = offsets[dirs[i]];
    const x = creep.pos.x + o[0];
    const y = creep.pos.y + o[1];
    if (x < 1 || x > 48 || y < 1 || y > 48) continue;
    if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
    if (creep.room.lookForAt(LOOK_CREEPS, x, y).length) continue;
    creep.move(dirs[i]);
    return true;
  }
  return false;
}

/** Штраф клеток рядом с опасными врагами для мирных крипов. */
function hostileCostCallback(roomName, matrix) {
  const room = Game.rooms[roomName];
  if (!room) return matrix;
  const danger = cache.dangerousHostiles(room);
  for (let i = 0; i < danger.length; i++) {
    const h = danger[i];
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const x = h.pos.x + dx;
        const y = h.pos.y + dy;
        if (x < 0 || x > 49 || y < 0 || y > 49) continue;
        matrix.set(x, y, Math.max(matrix.get(x, y), 40));
      }
    }
  }
  return matrix;
}

/** Попытаться поменяться местами со своим крипом, стоящим на пути. */
function trySwap(creep) {
  const mv = creep.memory._move;
  if (!mv || !mv.path) return false;
  let steps;
  try {
    steps = Room.deserializePath(mv.path);
  } catch (e) {
    return false;
  }
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (Math.abs(s.x - creep.pos.x) > 1 || Math.abs(s.y - creep.pos.y) > 1) continue;
    if (s.x === creep.pos.x && s.y === creep.pos.y) continue;
    const others = creep.room.lookForAt(LOOK_CREEPS, s.x, s.y);
    if (!others.length) return false;
    const other = others[0];
    if (!other.my || other.memory.stationary || other.fatigue > 0 || other.spawning) return false;
    other.move(other.pos.getDirectionTo(creep.pos));
    creep.move(creep.pos.getDirectionTo(s.x, s.y));
    return true;
  }
  return false;
}

/**
 * Двигаться к цели.
 * @param {Creep} creep
 * @param {RoomObject|RoomPosition} target
 * @param {object} [opts] range (по умолчанию 1), flee (избегать врагов), reusePath
 * @returns {number} код результата (OK, ERR_TIRED, ERR_NO_PATH, ...)
 */
function moveTo(creep, target, opts) {
  opts = opts || {};
  const pos = target && target.pos ? target.pos : target;
  if (!pos) return ERR_INVALID_TARGET;
  const range = opts.range === undefined ? 1 : opts.range;
  if (pos.roomName === creep.room.name && creep.pos.inRangeTo(pos, range)) {
    delete creep.memory._st;
    return OK;
  }
  if (creep.fatigue > 0) return ERR_TIRED;

  // Другая комната — идём по маршруту комната за комнатой.
  if (pos.roomName !== creep.room.name) {
    return travelToRoom(creep, pos.roomName, pos, range);
  }

  const st = creep.memory._st || (creep.memory._st = { x: -1, y: -1, n: 0 });
  if (st.x === creep.pos.x && st.y === creep.pos.y) st.n++;
  else st.n = 0;
  st.x = creep.pos.x;
  st.y = creep.pos.y;

  if (st.n >= config.movement.stuckSwap && trySwap(creep)) return OK;

  const stuck = st.n >= config.movement.stuckRepath;
  const room = creep.room;
  const avoid = opts.avoidHostiles !== false && cache.dangerousHostiles(room).length > 0;
  const moveOpts = {
    range: range,
    reusePath: stuck ? 3 : (opts.reusePath || config.movement.reusePath),
    ignoreCreeps: !stuck,
    maxRooms: 1,
  };
  if (avoid) moveOpts.costCallback = hostileCostCallback;
  if (config.isOn('visuals')) moveOpts.visualizePathStyle = { stroke: '#ffffff', opacity: 0.3, lineStyle: 'dashed' };
  const res = creep.moveTo(pos, moveOpts);
  if (res === ERR_NO_PATH && !stuck) {
    st.n = config.movement.stuckRepath; // в следующий тик пересчитаем с учётом крипов
  }
  return res;
}

/** Путь в другую комнату. */
function travelToRoom(creep, roomName, finalPos, range) {
  if (creep.room.name === roomName) {
    if (stepOffEdge(creep)) return OK;
    if (finalPos) return moveTo(creep, finalPos, { range: range });
    return OK;
  }
  if (creep.fatigue > 0) return ERR_TIRED;
  const mem = creep.memory;
  let rt = mem._rt;
  if (!rt || rt.to !== roomName || rt.path.indexOf(creep.room.name) === -1 && rt.from !== creep.room.name ||
      Game.time - rt.t > 500) {
    const path = findRoute(creep.room.name, roomName);
    if (!path) {
      // Маршрута нет (все пути "дорогие") — пробуем напрямую.
      return creep.moveTo(new RoomPosition(25, 25, roomName), { reusePath: 20, range: 20 });
    }
    rt = mem._rt = { to: roomName, from: creep.room.name, path: path, t: Game.time };
  }
  const idx = rt.path.indexOf(creep.room.name);
  const next = rt.path[idx + 1] || rt.path[0];
  if (!next) return ERR_NO_PATH;
  const target = next === roomName && finalPos ? finalPos : new RoomPosition(25, 25, next);
  const moveOpts = { reusePath: 30, range: next === roomName && finalPos ? range : 22, maxRooms: 2, ignoreCreeps: true };
  const st = creep.memory._st || (creep.memory._st = { x: -1, y: -1, n: 0 });
  if (st.x === creep.pos.x && st.y === creep.pos.y) st.n++;
  else st.n = 0;
  st.x = creep.pos.x;
  st.y = creep.pos.y;
  if (st.n >= config.movement.stuckRepath) {
    moveOpts.ignoreCreeps = false;
    moveOpts.reusePath = 5;
  }
  if (config.isOn('visuals')) moveOpts.visualizePathStyle = { stroke: '#88f', opacity: 0.3 };
  return creep.moveTo(target, moveOpts);
}

/**
 * Убегать от врагов (PathFinder flee).
 * @returns {boolean} true если крип бежит
 */
function flee(creep, hostiles, range) {
  if (!hostiles.length) return false;
  const goals = hostiles.map(function (h) { return { pos: h.pos, range: range }; });
  const res = PathFinder.search(creep.pos, goals, {
    flee: true,
    maxRooms: 2,
    plainCost: 2,
    swampCost: 10,
    roomCallback: function (roomName) {
      const room = Game.rooms[roomName];
      if (!room) return undefined;
      const m = new PathFinder.CostMatrix();
      const all = cache.find(room, FIND_STRUCTURES);
      for (let i = 0; i < all.length; i++) {
        const s = all[i];
        if (s.structureType === STRUCTURE_ROAD) m.set(s.pos.x, s.pos.y, 1);
        else if (s.structureType !== STRUCTURE_CONTAINER && !(s.structureType === STRUCTURE_RAMPART && s.my)) {
          m.set(s.pos.x, s.pos.y, 255);
        }
      }
      return m;
    },
  });
  if (res.path.length) {
    creep.move(creep.pos.getDirectionTo(res.path[0]));
    return true;
  }
  return false;
}

/**
 * Мирный крип: если рядом опасный враг — убегаем.
 * @returns {boolean} true если крип занят бегством
 */
function avoidHostiles(creep, radius) {
  const r = radius || 4;
  const danger = cache.dangerousHostiles(creep.room);
  if (!danger.length) return false;
  const near = danger.filter(function (h) {
    if (!h.body) return creep.pos.inRangeTo(h, r);
    const armed = h.body.some(function (p) { return p.hits > 0 && (p.type === ATTACK || p.type === RANGED_ATTACK); });
    return armed && creep.pos.inRangeTo(h, r);
  });
  if (!near.length) return false;
  // Под своим рампартом безопасно
  const onRampart = creep.pos.lookFor(LOOK_STRUCTURES).some(function (s) { return s.structureType === STRUCTURE_RAMPART && s.my; });
  if (onRampart) return false;
  creep.say('flee');
  return flee(creep, near, r + 2);
}

module.exports = {
  moveTo: moveTo,
  travelToRoom: travelToRoom,
  flee: flee,
  avoidHostiles: avoidHostiles,
  stepOffEdge: stepOffEdge,
  findRoute: findRoute,
  roomRouteCost: roomRouteCost,
  isEdge: isEdge,
};
