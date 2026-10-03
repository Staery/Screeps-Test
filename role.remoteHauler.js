'use strict';

/**
 * Удалённый перевозчик: возит энергию от источника remote-комнаты домой
 * (в storage, а без него — в спавн/расширения/контейнер контроллера).
 * По пути чинит дорогу под собой (есть WORK). При опасности — домой.
 */
const actions = require('creep.actions');
const movement = require('movement');
const rooms = require('rooms');
const cache = require('cache');

function repairRoad(creep) {
  if (!creep.store[RESOURCE_ENERGY] || !creep.getActiveBodyparts(WORK)) return;
  const road = creep.pos.lookFor(LOOK_STRUCTURES).filter(function (s) {
    return s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.8;
  })[0];
  if (road) creep.repair(road);
}

function sourcePos(m) {
  const mem = Memory.rooms[m.targetRoom];
  const info = mem && mem.sources ? mem.sources.filter(function (s) { return s.id === m.sourceId; })[0] : null;
  return info ? new RoomPosition(info.x, info.y, m.targetRoom) : new RoomPosition(25, 25, m.targetRoom);
}

function collect(creep, m) {
  const pos = sourcePos(m);
  if (creep.room.name !== m.targetRoom || !creep.pos.inRangeTo(pos, 3)) {
    movement.moveTo(creep, pos, { range: 2 });
    return;
  }
  // У источника: сначала то, что лежит, потом контейнер.
  const dropped = pos.findInRange(FIND_DROPPED_RESOURCES, 2, {
    filter: function (r) { return r.resourceType === RESOURCE_ENERGY && r.amount >= 50; },
  })[0];
  if (dropped) {
    if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) movement.moveTo(creep, dropped, { range: 1 });
    return;
  }
  const grave = pos.findInRange(FIND_TOMBSTONES, 3, { filter: function (t) { return t.store.getUsedCapacity(RESOURCE_ENERGY) > 0; } })[0];
  if (grave) {
    if (creep.withdraw(grave, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) movement.moveTo(creep, grave, { range: 1 });
    return;
  }
  const container = cache.structures(creep.room, STRUCTURE_CONTAINER).filter(function (c) {
    return c.pos.inRangeTo(pos, 1);
  })[0];
  if (container) {
    if (!creep.pos.isNearTo(container)) {
      movement.moveTo(creep, container, { range: 1 });
      return;
    }
    if (container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) creep.withdraw(container, RESOURCE_ENERGY);
    // Заполнены наполовину и в контейнере пусто — едем, не ждём.
    if (container.store.getUsedCapacity(RESOURCE_ENERGY) < 50 && creep.store.getUsedCapacity() >= creep.store.getCapacity() * 0.5) {
      m.working = true;
    }
  }
}

function run(creep) {
  const m = creep.memory;
  const used = creep.store.getUsedCapacity();
  if (m.working && used === 0) m.working = false;
  if (!m.working && creep.store.getFreeCapacity() === 0) m.working = true;

  if (rooms.isHostile(m.targetRoom) && !m.working) {
    if (used > 0) m.working = true;
    else {
      if (!actions.goHome(creep)) actions.park(creep);
      return;
    }
  }
  if (movement.avoidHostiles(creep)) return;

  if (!m.working) {
    // Не успеем вернуться — переработаться.
    if (creep.ticksToLive < (m.trip || 100) * 2 + 20) {
      actions.recycle(creep);
      return;
    }
    if (!m.leftHome && creep.room.name === m.home) m.leftHome = Game.time;
    collect(creep, m);
    return;
  }

  repairRoad(creep);
  if (creep.room.name !== m.home) {
    movement.travelToRoom(creep, m.home);
    return;
  }
  if (m.leftHome) {
    m.trip = Math.round(((m.trip || (Game.time - m.leftHome) / 2) + (Game.time - m.leftHome) / 2) / 2);
    delete m.leftHome;
  }
  if (actions.storeMinerals(creep)) return;
  const room = creep.room;
  if (actions.deliverEnergy(creep, {
    spawn: !room.storage || room.energyAvailable < room.energyCapacityAvailable * 0.5,
    towers: !room.storage,
    controllerContainer: !room.storage,
    storage: true,
  })) return;
  actions.park(creep);
}

module.exports = { run: run };
