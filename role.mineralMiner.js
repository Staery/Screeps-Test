'use strict';

/**
 * Добытчик минерала (RCL6+, экстрактор): стоит на контейнере у минерала и
 * добывает, когда экстрактор не на перезарядке. Минерал истощён — переработка.
 */
const actions = require('creep.actions');
const movement = require('movement');
const rooms = require('rooms');

function run(creep) {
  const m = creep.memory;
  if (movement.avoidHostiles(creep)) return;
  if (actions.goHome(creep)) return;
  const info = rooms.mem(creep.room.name).min;
  const mineral = info ? Game.getObjectById(info.id) : null;
  const extractor = info ? rooms.byId(info.ex) : null;
  if (!mineral || !extractor || mineral.mineralAmount === 0) {
    m.stationary = false;
    if (creep.store.getUsedCapacity() > 0) actions.storeMinerals(creep);
    else actions.recycle(creep);
    return;
  }
  const container = rooms.byId(info.c);
  if (container && !creep.pos.isEqualTo(container.pos)) {
    movement.moveTo(creep, container, { range: 0 });
    return;
  }
  if (!container && !creep.pos.isNearTo(mineral)) {
    movement.moveTo(creep, mineral, { range: 1 });
    return;
  }
  m.stationary = true;
  if (container && container.store.getFreeCapacity() < creep.getActiveBodyparts(WORK)) return;
  if (extractor.cooldown === 0) creep.harvest(mineral);
}

module.exports = { run: run };
