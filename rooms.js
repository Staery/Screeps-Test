'use strict';

/**
 * Постоянная информация о комнатах в Memory.rooms[name]:
 *  - для своих комнат: привязка контейнеров/линков к источникам и контроллеру;
 *  - для любых видимых комнат: владелец, резерв, источники, угроза (разведка).
 */
const cache = require('cache');
const utils = require('utils');
const threat = require('threat');

const INFO_INTERVAL = 100;
const SCAN_INTERVAL = 5;

function mem(roomName) {
  if (!Memory.rooms) Memory.rooms = {};
  if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
  return Memory.rooms[roomName];
}

function walkableSpots(room, pos) {
  const terrain = room.getTerrain();
  let n = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const x = pos.x + dx;
      const y = pos.y + dy;
      if (x < 1 || x > 48 || y < 1 || y > 48) continue;
      if (terrain.get(x, y) !== TERRAIN_MASK_WALL) n++;
    }
  }
  return n;
}

function firstInRange(list, pos, range, exclude) {
  for (let i = 0; i < list.length; i++) {
    if (exclude && exclude.indexOf(list[i].id) !== -1) continue;
    if (list[i].pos.inRangeTo(pos, range)) return list[i];
  }
  return null;
}

function pathDistance(from, to) {
  const res = PathFinder.search(from, { pos: to, range: 1 }, { maxRooms: 1, swampCost: 5, plainCost: 2 });
  return res.incomplete ? from.getRangeTo(to) * 2 : res.path.length;
}

/** Обновить привязки построек своей комнаты. */
function refreshInfo(room, force) {
  const m = mem(room.name);
  const structCount = cache.find(room, FIND_STRUCTURES).length;
  if (!force && m.infoAt && Game.time - m.infoAt < INFO_INTERVAL && m.sig === structCount) return m;
  m.infoAt = Game.time;
  m.sig = structCount;

  const containers = cache.structures(room, STRUCTURE_CONTAINER);
  const links = cache.myStructures(room, STRUCTURE_LINK);
  const spawn = cache.myStructures(room, STRUCTURE_SPAWN)[0];
  const anchor = spawn ? spawn.pos : (room.storage ? room.storage.pos : null);
  const used = [];

  const srcs = m.srcs || {};
  const sources = cache.sources(room);
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const old = srcs[s.id] || {};
    const c = firstInRange(containers, s.pos, 1, used);
    if (c) used.push(c.id);
    const l = firstInRange(links, s.pos, 2, used);
    if (l) used.push(l.id);
    srcs[s.id] = {
      x: s.pos.x,
      y: s.pos.y,
      c: c ? c.id : null,
      l: l ? l.id : null,
      spots: old.spots || walkableSpots(room, s.pos),
      d: old.d && old.anchor === (anchor ? anchor.x * 50 + anchor.y : -1)
        ? old.d : (anchor ? pathDistance(anchor, s.pos) : 25),
      anchor: anchor ? anchor.x * 50 + anchor.y : -1,
    };
  }
  m.srcs = srcs;

  const ctrl = room.controller;
  if (ctrl) {
    const cc = firstInRange(containers, ctrl.pos, 3, used);
    if (cc) used.push(cc.id);
    const cl = firstInRange(links, ctrl.pos, 3, used);
    if (cl) used.push(cl.id);
    m.ctrl = { c: cc ? cc.id : null, l: cl ? cl.id : null,
      d: anchor ? (m.ctrl && m.ctrl.d ? m.ctrl.d : pathDistance(anchor, ctrl.pos)) : 20 };
  }

  m.sLink = null;
  if (room.storage) {
    const sl = firstInRange(links, room.storage.pos, 2, used);
    if (sl) {
      used.push(sl.id);
      m.sLink = sl.id;
    }
  }

  const minerals = cache.find(room, FIND_MINERALS);
  if (minerals.length) {
    const mineral = minerals[0];
    const ex = cache.structures(room, STRUCTURE_EXTRACTOR)[0];
    const mc = firstInRange(containers, mineral.pos, 1, used);
    m.min = { id: mineral.id, type: mineral.mineralType, x: mineral.pos.x, y: mineral.pos.y,
      c: mc ? mc.id : null, ex: ex ? ex.id : null };
  }
  return m;
}

/** Получить объект по id, сохранённому в памяти (или null). */
function byId(id) {
  return id ? Game.getObjectById(id) : null;
}

/**
 * Разведка видимой комнаты: владелец, резерв, источники, враги.
 * Вызывается для всех видимых комнат (свои — тоже, но реже).
 */
function scan(room) {
  const m = mem(room.name);
  if (m.seen && Game.time - m.seen < SCAN_INTERVAL && !(m.hostileUntil > Game.time)) return m;
  m.seen = Game.time;
  const ctrl = room.controller;
  if (ctrl) {
    m.owner = ctrl.owner ? ctrl.owner.username : null;
    m.rcl = ctrl.level;
    m.reserved = ctrl.reservation ? { u: ctrl.reservation.username, t: ctrl.reservation.ticksToEnd, at: Game.time } : null;
    m.ctrlPos = { x: ctrl.pos.x, y: ctrl.pos.y };
  } else {
    m.owner = null;
    m.reserved = null;
  }
  if (!m.sources) {
    m.sources = cache.sources(room).map(function (s) { return { id: s.id, x: s.pos.x, y: s.pos.y }; });
  }
  const lairs = cache.structures(room, STRUCTURE_KEEPER_LAIR);
  m.sk = lairs.length > 0;

  const towers = cache.structures(room, STRUCTURE_TOWER).filter(function (t) { return !t.my; });
  m.towers = towers.length;

  const cores = cache.structures(room, STRUCTURE_INVADER_CORE);
  m.core = cores.length ? cores[0].level : -1;

  if (!(ctrl && ctrl.my)) {
    const danger = cache.dangerousHostiles(room);
    const t = threat.assess(danger);
    m.threat = t.score;
    if (t.score > 0) {
      let ttl = 0;
      for (let i = 0; i < danger.length; i++) ttl = Math.max(ttl, danger[i].ticksToLive || 0);
      m.hostileUntil = Game.time + Math.min(1500, Math.max(50, ttl));
      m.hostilePlayer = t.player;
    } else {
      m.hostileUntil = 0;
      m.hostilePlayer = false;
    }
    // Ядро захватчиков уровня >0 (крепость) — комната опасна надолго.
    if (m.core > 0) m.hostileUntil = Math.max(m.hostileUntil || 0, Game.time + 5000);
  }
  return m;
}

/** Опасна ли комната (по последним данным). */
function isHostile(roomName) {
  const m = Memory.rooms && Memory.rooms[roomName];
  if (!m) return false;
  if (m.hostileUntil && m.hostileUntil > Game.time) return true;
  return !!utils.hostileOwner(roomName) && m.towers > 0;
}

/** Удалить память давно не виденных и не используемых комнат. */
function cleanup(keep) {
  if (!Memory.rooms) return;
  for (const name in Memory.rooms) {
    if (keep[name]) continue;
    const m = Memory.rooms[name];
    if (Game.rooms[name] && Game.rooms[name].controller && Game.rooms[name].controller.my) continue;
    if (!m || !m.seen || Game.time - m.seen > 20000) delete Memory.rooms[name];
  }
}

module.exports = {
  mem: mem,
  refreshInfo: refreshInfo,
  byId: byId,
  scan: scan,
  isHostile: isHostile,
  cleanup: cleanup,
  walkableSpots: walkableSpots,
};
