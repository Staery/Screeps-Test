'use strict';

/**
 * Майнер — стационарный добытчик на источнике. Стоит на контейнере (энергия
 * падает прямо в него), при наличии линка у источника с CARRY-частью сдаёт
 * энергию в линк. Чинит свой контейнер и достраивает его площадку.
 */
const movement = require('movement');
const rooms = require('rooms');

function run(creep) {
  const m = creep.memory;
  const source = Game.getObjectById(m.sourceId);
  if (!source) {
    // Нет видимости источника (не та комната) — идём домой.
    if (m.home && creep.room.name !== m.home) movement.travelToRoom(creep, m.home);
    return;
  }
  const info = (rooms.mem(source.room.name).srcs || {})[source.id] || {};
  const container = info.c ? Game.getObjectById(info.c) : null;
  const link = info.l ? Game.getObjectById(info.l) : null;

  // Встать на контейнер (если он свободен), иначе — рядом с источником.
  if (container && !creep.pos.isEqualTo(container.pos)) {
    const occupied = container.pos.lookFor(LOOK_CREEPS).length > 0;
    if (!occupied || !creep.pos.isNearTo(source)) {
      movement.moveTo(creep, occupied ? source : container, { range: occupied ? 1 : 0 });
      return;
    }
  } else if (!container && !creep.pos.isNearTo(source)) {
    movement.moveTo(creep, source, { range: 1 });
    return;
  }
  m.stationary = true;

  const carrying = creep.store.getCapacity() > 0;
  const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

  if (carrying && energy > 0) {
    if (container && container.hits < container.hitsMax * 0.7) {
      creep.repair(container);
      return;
    }
    if (!container) {
      const site = creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {
        filter: function (s) { return s.structureType === STRUCTURE_CONTAINER; },
      })[0];
      if (site && energy >= creep.getActiveBodyparts(WORK) * 5) {
        creep.build(site);
        return;
      }
    }
    if (link && creep.store.getFreeCapacity() < creep.getActiveBodyparts(WORK) * 2 + 1 &&
        link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.pos.isNearTo(link)) creep.transfer(link, RESOURCE_ENERGY);
    }
  }
  if (source.energy > 0) creep.harvest(source);
}

module.exports = { run: run };
