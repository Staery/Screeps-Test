'use strict';

/**
 * Кэш результатов room.find() в пределах одного тика. Каждый тип поиска
 * выполняется максимум один раз на комнату за тик.
 */
const utils = require('utils');

let tick = -1;
let rooms = {};

function roomCache(room) {
  if (tick !== Game.time) {
    tick = Game.time;
    rooms = {};
  }
  let c = rooms[room.name];
  if (!c) {
    c = {};
    rooms[room.name] = c;
  }
  return c;
}

function find(room, type) {
  const c = roomCache(room);
  const key = 'f' + type;
  if (!c[key]) c[key] = room.find(type);
  return c[key];
}

/** Все постройки комнаты, сгруппированные по structureType. */
function structuresByType(room) {
  const c = roomCache(room);
  if (!c.byType) {
    const byType = {};
    const all = find(room, FIND_STRUCTURES);
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      (byType[s.structureType] || (byType[s.structureType] = [])).push(s);
    }
    c.byType = byType;
  }
  return c.byType;
}

function structures(room, type) {
  return structuresByType(room)[type] || [];
}

/** Свои постройки данного типа (для типов, у которых есть владелец). */
function myStructures(room, type) {
  return structures(room, type).filter(function (s) { return s.my; });
}

/** Враждебные крипы (без союзников), включая силовых крипов. */
function hostiles(room) {
  const c = roomCache(room);
  if (!c.hostiles) {
    const list = find(room, FIND_HOSTILE_CREEPS).concat(find(room, FIND_HOSTILE_POWER_CREEPS));
    c.hostiles = list.filter(function (h) { return !utils.isAlly(h.owner && h.owner.username); });
  }
  return c.hostiles;
}

/** Враждебные крипы, способные наносить урон / лечить / разбирать. */
function dangerousHostiles(room) {
  const c = roomCache(room);
  if (!c.dangerous) {
    c.dangerous = hostiles(room).filter(function (h) {
      if (!h.body) return true; // силовой крип
      for (let i = 0; i < h.body.length; i++) {
        const t = h.body[i].type;
        if (h.body[i].hits > 0 && (t === ATTACK || t === RANGED_ATTACK || t === HEAL || t === WORK || t === CLAIM)) {
          return true;
        }
      }
      return false;
    });
  }
  return c.dangerous;
}

function sites(room) {
  return find(room, FIND_MY_CONSTRUCTION_SITES);
}

function sources(room) {
  return find(room, FIND_SOURCES);
}

/** Произвольное значение, вычисляемое один раз за тик. */
function memo(room, key, fn) {
  const c = roomCache(room);
  if (!(key in c)) c[key] = fn();
  return c[key];
}

let globalTick = -1;
let globalStore = {};
/** Глобальное значение, вычисляемое один раз за тик. */
function perTick(key, fn) {
  if (globalTick !== Game.time) {
    globalTick = Game.time;
    globalStore = {};
  }
  if (!(key in globalStore)) globalStore[key] = fn();
  return globalStore[key];
}

module.exports = {
  find: find,
  structuresByType: structuresByType,
  structures: structures,
  myStructures: myStructures,
  hostiles: hostiles,
  dangerousHostiles: dangerousHostiles,
  sites: sites,
  sources: sources,
  memo: memo,
  perTick: perTick,
};
