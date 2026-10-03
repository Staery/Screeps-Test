'use strict';

/**
 * Менеджер спавна: собирает состояние комнаты, считает живых крипов,
 * получает список недостающих крипов от population.plan и спавнит их по
 * приоритету на всех свободных спавнах комнаты.
 *
 * - тело масштабируется по energyCapacityAvailable; в аварийном режиме
 *   (некому наполнять спавн) — по текущей energyAvailable;
 * - если комната давно не заполнялась энергией до конца (недостижимое
 *   расширение, слабый доход), тела строятся из того, что есть;
 * - майнеры/резерверы/filler заменяются заранее (pre-spawn);
 * - ручные заявки из консоли (spawnCreep) идут первыми.
 */
const config = require('config');
const utils = require('utils');
const cache = require('cache');
const rooms = require('rooms');
const body = require('body');
const population = require('population');
const colony = require('colony');
const actions = require('creep.actions');
const roles = require('roles');
const movement = require('movement');

const PRESPAWN = { miner: true, filler: true, remoteMiner: true, reserver: true };
const SPAWN_TIME = typeof CREEP_SPAWN_TIME !== 'undefined' ? CREEP_SPAWN_TIME : 3;
const MAX_WAIT = 150;

/** Количество крипов по домашним комнатам и ключам (раз в тик). */
function allCounts() {
  return cache.perTick('counts', function () {
    const byHome = {};
    for (const name in Game.creeps) {
      const c = Game.creeps[name];
      const m = c.memory;
      if (!m.role) continue;
      const home = m.home || c.room.name;
      if (PRESPAWN[m.role] && !c.spawning &&
          c.ticksToLive < c.body.length * SPAWN_TIME + (m.prespawn || 30)) continue;
      const counts = byHome[home] || (byHome[home] = { _total: 0 });
      const key = population.keyOf(m);
      counts[key] = (counts[key] || 0) + 1;
      if (key !== m.role) counts['@' + m.role] = (counts['@' + m.role] || 0) + 1;
      counts._total++;
    }
    return byHome;
  });
}

function countsFor(roomName) {
  return allCounts()[roomName] || { _total: 0 };
}

/** Число живых крипов роли в комнате (включая целевых). */
function roleCount(roomName, role) {
  const c = countsFor(roomName);
  return (c[role] || 0) + (c['@' + role] || 0);
}

function remoteDistance(m, home, roomName) {
  if (m.dist && m.dist.home === home) return m.dist.d;
  const route = movement.findRoute(home, roomName);
  const d = route ? route.length * 50 : utils.roomDistance(home, roomName) * 50;
  m.dist = { home: home, d: d };
  return d;
}

function remoteState(roomName, home) {
  const me = utils.myUsername();
  const m = Memory.rooms && Memory.rooms[roomName];
  if (!m || !m.sources) return { room: roomName, known: false };
  const res = m.reserved;
  const resLeft = res ? res.t - (Game.time - res.at) : 0;
  return {
    room: roomName,
    known: true,
    hostile: !!(m.hostileUntil && m.hostileUntil > Game.time),
    threatScore: m.threat || 0,
    player: !!m.hostilePlayer,
    core: m.core === undefined ? -1 : m.core,
    ownedByOther: !!(m.owner && m.owner !== me),
    reservedByOther: !!(res && res.u !== me && resLeft > 0),
    reservedTicks: res && res.u === me ? Math.max(0, resLeft) : 0,
    sources: m.sources,
    distance: remoteDistance(m, home, roomName),
  };
}

/** Описание комнаты для population.plan. */
function collectState(room) {
  const info = rooms.refreshInfo(room);
  const srcInfo = info.srcs || {};
  const storage = room.storage && room.storage.my ? room.storage : null;
  const sites = cache.sites(room);
  let progressLeft = 0;
  for (let i = 0; i < sites.length; i++) progressLeft += sites[i].progressTotal - sites[i].progress;

  const sources = cache.sources(room).map(function (s) {
    const si = srcInfo[s.id] || {};
    return {
      id: s.id,
      container: !!rooms.byId(si.c),
      link: !!rooms.byId(si.l),
      distance: si.d || 20,
      spots: si.spots || 2,
    };
  });

  let mineral = null;
  if (info.min) {
    const mo = Game.getObjectById(info.min.id);
    mineral = {
      extractor: !!rooms.byId(info.min.ex),
      container: !!rooms.byId(info.min.c),
      amount: mo ? mo.mineralAmount : 0,
    };
  }

  const ctrl = room.controller;
  const d = colony.forHome(room.name);
  const me = utils.myUsername();
  const claims = d.claims.map(function (c) {
    const r = Game.rooms[c.room];
    const m = Memory.rooms && Memory.rooms[c.room];
    return {
      room: c.room,
      known: !!(m && m.seen),
      claimed: r ? !!(r.controller && r.controller.my) : !!(m && m.owner === me),
      hasSpawn: r ? cache.myStructures(r, STRUCTURE_SPAWN).length > 0 : false,
    };
  });

  return {
    room: room.name,
    rcl: ctrl.level,
    energyCapacity: room.energyCapacityAvailable,
    energyAvailable: room.energyAvailable,
    sources: sources,
    hasStorage: !!storage,
    storageEnergy: storage ? storage.store.getUsedCapacity(RESOURCE_ENERGY) : 0,
    storageFree: storage ? storage.store.getFreeCapacity() : 0,
    ctrlLink: !!(info.ctrl && rooms.byId(info.ctrl.l)),
    ctrlContainer: !!(info.ctrl && rooms.byId(info.ctrl.c)),
    storageLink: !!rooms.byId(info.sLink),
    sites: sites.length,
    sitesProgressLeft: progressLeft,
    repairTargets: actions.repairTargets(room).length,
    wallsBelowTarget: actions.wallTargets(room).length,
    towers: cache.myStructures(room, STRUCTURE_TOWER).length,
    threat: info.defense || { score: 0 },
    downgradeTicks: ctrl.ticksToDowngrade || 100000,
    mineral: mineral,
    remotes: d.remotes.map(function (r) { return remoteState(r, room.name); }),
    reserves: d.reserves.map(function (r) { return remoteState(r, room.name); }),
    claims: claims,
    attacks: d.attacks,
  };
}

/** config с учётом переключателей из Memory.settings. */
function effectiveConfig() {
  const toggles = {};
  for (const k in config.toggles) toggles[k] = config.isOn(k);
  return Object.assign({}, config, { toggles: toggles });
}

function nextName(role) {
  if (!Memory.spawnSeq) Memory.spawnSeq = 0;
  let name;
  do {
    Memory.spawnSeq = (Memory.spawnSeq + 1) % 1000000;
    name = role + '-' + Memory.spawnSeq;
  } while (Game.creeps[name]);
  return name;
}

/** Ручные заявки из консоли: Memory.rooms[room].spawnQueue = [{role, memory}] */
function manualRequests(room) {
  const m = rooms.mem(room.name);
  if (!m.spawnQueue || !m.spawnQueue.length) return [];
  return m.spawnQueue.map(function (q) {
    return { role: q.role, priority: -1, memory: Object.assign({ role: q.role, home: room.name, key: 'manual:' + q.role }, q.memory || {}),
      opts: q.opts || {}, manual: true };
  });
}

/** Основная функция: спавн для одной комнаты. */
function run(room) {
  const spawns = cache.myStructures(room, STRUCTURE_SPAWN).filter(function (s) { return !s.spawning; });
  if (config.isOn('visuals')) showSpawning(room);
  const mem0 = rooms.mem(room.name);
  if (room.energyAvailable >= room.energyCapacityAvailable || !mem0.fullAt) mem0.fullAt = Game.time;
  if (!spawns.length) return;
  const counts = countsFor(room.name);
  // Экономим CPU: план считаем через тик, если колония жива.
  if (counts._total > 2 && Game.time % 2 === 1) return;

  const state = collectState(room);
  const queue = manualRequests(room).concat(population.plan(state, counts, effectiveConfig()));
  const mem = rooms.mem(room.name);
  mem.queue = queue.slice(0, 5).map(function (q) { return q.memory.key || q.role; });
  if (!queue.length) return;

  let energy = room.energyAvailable;
  // Комната долго не набирает полную энергию — не ждём, строим из того, что есть.
  const stale = Game.time - (mem.fullAt || Game.time) > MAX_WAIT;
  let spawnIdx = 0;
  for (let qi = 0; qi < queue.length && spawnIdx < spawns.length; qi++) {
    const req = queue[qi];
    let budget = room.energyCapacityAvailable;
    if (req.emergency) budget = energy;
    else if (stale) {
      if (energy < Math.min(300, budget)) break;
      budget = energy;
    }
    const b = body.forRole(req.role, budget, req.opts);
    if (!b.length) {
      if (req.emergency) break; // ждём хотя бы минимального тела
      continue; // роль недоступна при такой энергии/вместимости
    }
    const cost = body.cost(b);
    if (cost > energy) break; // копим энергию на приоритетную заявку
    const spawn = spawns[spawnIdx];
    const name = nextName(req.role);
    const memory = Object.assign({}, req.memory, { born: Game.time });
    if (PRESPAWN[req.role]) memory.prespawn = req.role === 'miner' || req.role === 'filler' ? 30 : 120;
    const r = spawn.spawnCreep(b, name, { memory: memory });
    if (r === OK) {
      energy -= cost;
      spawnIdx++;
      if (req.manual) mem.spawnQueue.shift();
      utils.log(room.name + ': спавн ' + name + ' [' + b.length + ' частей, ' + cost + ']' +
        (req.emergency ? ' (аварийно)' : ''));
    } else if (r === ERR_NOT_ENOUGH_ENERGY) {
      break;
    } else {
      utils.log(room.name + ': spawnCreep(' + req.role + ') вернул ' + r);
      if (req.manual) mem.spawnQueue.shift();
      spawnIdx++;
    }
  }
}

function showSpawning(room) {
  const spawns = cache.myStructures(room, STRUCTURE_SPAWN);
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i];
    if (!s.spawning) continue;
    const c = Game.creeps[s.spawning.name];
    const role = c ? c.memory.role : s.spawning.name;
    room.visual.text(roles.short(role) + ' ' + Math.round(100 - s.spawning.remainingTime / s.spawning.needTime * 100) + '%',
      s.pos.x, s.pos.y - 1, { font: 0.5, opacity: 0.8 });
  }
}

module.exports = {
  run: run,
  collectState: collectState,
  countsFor: countsFor,
  roleCount: roleCount,
  allCounts: allCounts,
  effectiveConfig: effectiveConfig,
};
