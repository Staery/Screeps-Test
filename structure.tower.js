'use strict';

/**
 * Башни: огонь по самому опасному врагу (все башни по одной цели, с учётом
 * затухания урона и вражеского лечения), лечение своих и союзных крипов,
 * ремонт — только при достаточном запасе энергии и без врагов в комнате.
 */
const config = require('config');
const cache = require('cache');
const threat = require('threat');
const utils = require('utils');

function repairList(room) {
  const ctrl = room.controller;
  const list = [];
  const all = cache.find(room, FIND_STRUCTURES);
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (s.hits === undefined || s.hits >= s.hitsMax) continue;
    if (s.owner && !s.my) continue;
    const t = s.structureType;
    if (t === STRUCTURE_RAMPART) {
      if (s.hits < config.tower.repairRampartsBelow) list.push({ s: s, k: s.hits / 1000 });
    } else if (t === STRUCTURE_WALL) {
      if (s.hits < 1000 && ctrl && ctrl.level >= 2) list.push({ s: s, k: 1 + s.hits / 1000 });
    } else if (t === STRUCTURE_ROAD || t === STRUCTURE_CONTAINER) {
      if (s.hits < s.hitsMax * config.tower.roadAndContainerRatio) list.push({ s: s, k: 2 + s.hits / s.hitsMax });
    } else {
      list.push({ s: s, k: s.hits / s.hitsMax });
    }
  }
  list.sort(function (a, b) { return a.k - b.k; });
  return list.map(function (x) { return x.s; });
}

function run(room) {
  const towers = cache.myStructures(room, STRUCTURE_TOWER).filter(function (t) {
    return t.store.getUsedCapacity(RESOURCE_ENERGY) >= 10;
  });
  if (!towers.length) return;

  const hostiles = cache.hostiles(room);
  if (hostiles.length) {
    let heal = 0;
    for (let i = 0; i < hostiles.length; i++) heal += threat.bodyPower(hostiles[i].body).heal;
    const spawns = cache.myStructures(room, STRUCTURE_SPAWN);
    const ctrl = room.controller;
    const nearCore = function (h) {
      if (ctrl && h.pos.inRangeTo(ctrl, 3)) return true;
      return spawns.some(function (s) { return h.pos.inRangeTo(s, 5); });
    };
    const target = threat.chooseTowerTarget(hostiles, towers, heal, nearCore);
    if (target) {
      for (let i = 0; i < towers.length; i++) towers[i].attack(target);
      return;
    }
  }

  // Лечение
  const patients = cache.find(room, FIND_MY_CREEPS).concat(
    cache.find(room, FIND_HOSTILE_CREEPS).filter(function (c) { return utils.isAlly(c.owner.username); }))
    .filter(function (c) { return c.hits < c.hitsMax; })
    .sort(function (a, b) { return a.hits / a.hitsMax - b.hits / b.hitsMax; });
  let used = 0;
  if (patients.length) {
    for (let i = 0; i < towers.length; i++) {
      towers[i].heal(patients[i % patients.length]);
    }
    return;
  }

  // Ремонт
  if (!config.isOn('towerRepair') || hostiles.length || Game.time % 3) return;
  const reserve = config.tower.repairMinEnergy;
  const fit = towers.filter(function (t) { return t.store.getUsedCapacity(RESOURCE_ENERGY) > reserve; });
  if (!fit.length) return;
  const list = repairList(room);
  for (let i = 0; i < fit.length && used < list.length; i++, used++) {
    fit[i].repair(list[used]);
  }
}

module.exports = { run: run, repairList: repairList };
