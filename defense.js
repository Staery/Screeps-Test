'use strict';

/**
 * Оборона своей комнаты: оценка угрозы (Memory.rooms[room].defense) и
 * автоматический safe mode, когда ключевые постройки или контроллер
 * атакованы, а своей обороны не хватает.
 */
const config = require('config');
const utils = require('utils');
const cache = require('cache');
const threat = require('threat');
const rooms = require('rooms');

const CRITICAL = {};
[STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_STORAGE, STRUCTURE_TERMINAL]
  .forEach(function (t) { CRITICAL[t] = true; });

function ourDefense(room) {
  let power = 0;
  const towers = cache.myStructures(room, STRUCTURE_TOWER);
  for (let i = 0; i < towers.length; i++) {
    if (towers[i].store.getUsedCapacity(RESOURCE_ENERGY) >= 10) power += 300; // средний урон с учётом дистанции
  }
  const mine = cache.find(room, FIND_MY_CREEPS);
  for (let i = 0; i < mine.length; i++) {
    const r = mine[i].memory.role;
    if (r === 'defender' || r === 'rangedDefender' || r === 'healer') power += threat.creepScore(mine[i].body);
  }
  return power;
}

function trySafeMode(room, danger, t) {
  if (!config.isOn('safeMode')) return;
  const ctrl = room.controller;
  if (!ctrl || ctrl.safeMode || !ctrl.safeModeAvailable || ctrl.safeModeCooldown || ctrl.upgradeBlocked) return;

  const critical = cache.find(room, FIND_MY_STRUCTURES).filter(function (s) { return CRITICAL[s.structureType]; });
  let underAttack = false;
  let severe = false;
  for (let i = 0; i < critical.length && !severe; i++) {
    const s = critical[i];
    if (s.hits >= s.hitsMax) continue;
    const near = danger.some(function (h) { return h.pos.inRangeTo(s, 3); });
    if (!near) continue;
    underAttack = true;
    if (s.structureType === STRUCTURE_SPAWN && s.hits < s.hitsMax * 0.6) severe = true;
  }
  // Атака на контроллер (CLAIM-части рядом)
  const claimers = danger.filter(function (h) {
    return h.pos.inRangeTo(ctrl, 1) && h.body && h.body.some(function (p) { return p.type === CLAIM && p.hits > 0; });
  });
  if (claimers.length) underAttack = true;
  if (!underAttack) return;
  // Захватчиков (Invader) обычно хватает башен; без башен — тоже safe mode.
  const towers = cache.myStructures(room, STRUCTURE_TOWER).length;
  if (!t.player && towers > 0 && !severe) return;
  const weak = ourDefense(room) < t.score;
  if (severe || weak || claimers.length) {
    const r = ctrl.activateSafeMode();
    utils.log('<span style="color:#f80">' + room.name + ': SAFE MODE (' + r + '), угроза ' + t.score +
      (t.players.length ? ' от ' + t.players.join(',') : '') + '</span>');
  }
}

/** Оценить угрозу в своей комнате и при необходимости включить safe mode. */
function run(room) {
  const mem = rooms.mem(room.name);
  const danger = cache.dangerousHostiles(room);
  if (!danger.length) {
    if (mem.defense && mem.defense.score > 0) utils.log(room.name + ': угроза устранена.');
    mem.defense = { score: 0 };
    return mem.defense;
  }
  const t = threat.assess(danger);
  if (!mem.defense || !mem.defense.score) {
    utils.log('<span style="color:#f66">' + room.name + ': враги! угроза ' + t.score +
      (t.player ? ' (игрок ' + t.players.join(',') + ')' : ' (захватчики)') + '</span>');
  }
  mem.defense = { score: t.score, player: t.player, invader: t.invader, heal: t.heal, count: t.count,
    players: t.players, at: Game.time };
  trySafeMode(room, danger, t);
  return mem.defense;
}

module.exports = { run: run, ourDefense: ourDefense };
