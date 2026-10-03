'use strict';

/**
 * Укрепитель стен: поднимает хиты рампартов и стен до цели по RCL
 * (config.wallHits), всегда начиная с самого слабого сегмента.
 */
const actions = require('creep.actions');
const movement = require('movement');
const config = require('config');

function run(creep) {
  if (movement.avoidHostiles(creep, 3)) return;
  if (actions.goHome(creep)) return;
  if (actions.updateWorking(creep)) {
    if (actions.repairWalls(creep)) return;
    if (actions.repair(creep)) return;
    if (actions.build(creep)) return;
    actions.upgrade(creep);
    return;
  }
  if (!actions.getEnergy(creep, {
    storageMin: config.storage.minForBuilders,
    terminal: true,
    harvest: !creep.room.storage,
  })) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) creep.memory.working = true;
    else actions.park(creep);
  }
}

module.exports = { run: run };
