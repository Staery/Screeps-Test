'use strict';

/**
 * Общие вспомогательные функции. Большинство из них чистые и покрыты тестами.
 */
const config = require('config');

const lastErrorLog = {};

/** Вывод в консоль с номером тика. */
function log(msg) {
  console.log('[' + Game.time + '] ' + msg);
}

/**
 * Выполнить fn, перехватив исключение. Ошибка печатается не чаще раза в 20 тиков
 * для одной метки, чтобы не засорять консоль.
 */
function safe(label, fn) {
  try {
    return fn();
  } catch (e) {
    const now = typeof Game !== 'undefined' ? Game.time : 0;
    if (!lastErrorLog[label] || now - lastErrorLog[label] >= 20) {
      lastErrorLog[label] = now;
      console.log('<span style="color:#f66">[' + now + '] ERROR in ' + label + ': ' +
        (e && e.stack ? e.stack : e) + '</span>');
    }
    return undefined;
  }
}

let cachedUsername = null;
/** Имя игрока (из config или по своим объектам). */
function myUsername() {
  if (config.username) return config.username;
  if (cachedUsername) return cachedUsername;
  for (const name in Game.spawns) {
    cachedUsername = Game.spawns[name].owner.username;
    return cachedUsername;
  }
  for (const name in Game.creeps) {
    cachedUsername = Game.creeps[name].owner.username;
    return cachedUsername;
  }
  for (const name in Game.rooms) {
    const c = Game.rooms[name].controller;
    if (c && c.my) {
      cachedUsername = c.owner.username;
      return cachedUsername;
    }
  }
  return null;
}

function isAlly(username) {
  return !!username && config.allies.indexOf(username) !== -1;
}

/**
 * Разбор имени комнаты: 'W12N5' → { x: -13, y: -6, wx: 12, wy: 5 }.
 * Для "sim" и неверных имён возвращает null.
 */
function parseRoomName(name) {
  const m = /^([WE])(\d+)([NS])(\d+)$/.exec(name || '');
  if (!m) return null;
  const wx = parseInt(m[2], 10);
  const wy = parseInt(m[4], 10);
  return {
    x: m[1] === 'W' ? -wx - 1 : wx,
    y: m[3] === 'N' ? -wy - 1 : wy,
    wx: wx,
    wy: wy,
  };
}

/** Коридор (highway): одна из координат кратна 10. */
function isHighway(name) {
  const p = parseRoomName(name);
  if (!p) return false;
  return p.wx % 10 === 0 || p.wy % 10 === 0;
}

/** Комната Source Keeper'ов: координаты 4..6 внутри сектора, кроме центра 5,5. */
function isSourceKeeperRoom(name) {
  const p = parseRoomName(name);
  if (!p) return false;
  const fx = p.wx % 10;
  const fy = p.wy % 10;
  if (fx === 5 && fy === 5) return false;
  return fx >= 4 && fx <= 6 && fy >= 4 && fy <= 6;
}

/** Хватает ли CPU в этом тике (с запасом до tickLimit). */
function cpuOk(reserve) {
  const r = reserve === undefined ? config.cpu.tickReserve : reserve;
  return Game.cpu.getUsed() < Game.cpu.tickLimit - r;
}

/** Bucket: 'critical' | 'low' | 'ok'. В симуляции bucket может отсутствовать. */
function bucketLevel() {
  const bucket = Game.cpu.bucket;
  if (bucket === undefined) return 'ok';
  if (bucket < config.cpu.criticalBucket) return 'critical';
  if (bucket < config.cpu.lowBucket) return 'low';
  return 'ok';
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Энергия (или другой ресурс), доступная в объекте: Resource, Source, store. */
function amountOf(obj, resource) {
  const res = resource || RESOURCE_ENERGY;
  if (!obj) return 0;
  if (obj.store) return obj.store[res] || 0;
  if (obj.resourceType !== undefined) return obj.resourceType === res ? obj.amount : 0;
  if (obj.energy !== undefined) return obj.energy;
  return 0;
}

/** Сериализуемая позиция → RoomPosition. */
function toPos(p) {
  if (!p) return null;
  if (p instanceof RoomPosition) return p;
  return new RoomPosition(p.x, p.y, p.roomName || p.room);
}

/** Владелец комнаты (по памяти/видимости), если это не мы. */
function hostileOwner(roomName) {
  const mem = Memory.rooms && Memory.rooms[roomName];
  if (!mem || !mem.owner) return null;
  if (mem.owner === myUsername() || isAlly(mem.owner)) return null;
  return mem.owner;
}

/** Мои комнаты (с контроллером моего уровня ≥ 1). */
function myRooms() {
  const out = [];
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (room.controller && room.controller.my) out.push(room);
  }
  return out;
}

/** Расстояние между комнатами по прямой (без Game.map — для тестов). */
function roomDistance(a, b) {
  if (typeof Game !== 'undefined' && Game.map && Game.map.getRoomLinearDistance) {
    return Game.map.getRoomLinearDistance(a, b);
  }
  const pa = parseRoomName(a);
  const pb = parseRoomName(b);
  if (!pa || !pb) return Infinity;
  return Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
}

module.exports = {
  log: log,
  safe: safe,
  myUsername: myUsername,
  isAlly: isAlly,
  parseRoomName: parseRoomName,
  isHighway: isHighway,
  isSourceKeeperRoom: isSourceKeeperRoom,
  cpuOk: cpuOk,
  bucketLevel: bucketLevel,
  clamp: clamp,
  amountOf: amountOf,
  toPos: toPos,
  hostileOwner: hostileOwner,
  myRooms: myRooms,
  roomDistance: roomDistance,
};
