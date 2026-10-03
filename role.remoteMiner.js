'use strict';

/**
 * Удалённый майнер: добывает источник в remote-комнате, стоя на контейнере.
 * Сам ставит и строит контейнер, чинит его. При опасности уходит домой.
 */
const actions = require('creep.actions');
const movement = require('movement');
const rooms = require('rooms');
const cache = require('cache');

function sourcePos(m) {
  const mem = Memory.rooms[m.targetRoom];
  const info = mem && mem.sources ? mem.sources.filter(function (s) { return s.id === m.sourceId; })[0] : null;
  return info ? new RoomPosition(info.x, info.y, m.targetRoom) : new RoomPosition(25, 25, m.targetRoom);
}

function run(creep) {
  const m = creep.memory;
  if (rooms.isHostile(m.targetRoom)) {
    m.stationary = false;
    if (!actions.goHome(creep)) actions.park(creep);
    return;
  }
  if (movement.avoidHostiles(creep)) return;
  if (creep.room.name !== m.targetRoom) {
    movement.moveTo(creep, sourcePos(m), { range: 1 });
    return;
  }
  const source = Game.getObjectById(m.sourceId);
  if (!source) return;

  const container = cache.structures(creep.room, STRUCTURE_CONTAINER).filter(function (c) {
    return c.pos.isNearTo(source);
  })[0];
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

  const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
  const works = creep.getActiveBodyparts(WORK);
  if (!container && creep.store.getCapacity() > 0) {
    let site = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
    if (!site) {
      site = creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
        filter: function (s) { return s.structureType === STRUCTURE_CONTAINER; },
      })[0];
    }
    if (!site) {
      if (!m.siteTry || Game.time - m.siteTry > 50) {
        m.siteTry = Game.time;
        creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER);
      }
    } else if (energy >= works * 5 || creep.store.getFreeCapacity() === 0) {
      creep.build(site);
      return;
    }
  } else if (container && energy > 0 && container.hits < container.hitsMax * 0.6) {
    creep.repair(container);
    return;
  }
  if (source.energy > 0) creep.harvest(source);
}

module.exports = { run: run };
