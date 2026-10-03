'use strict';

/**
 * Ремонтник: чинит дороги, контейнеры и прочие постройки ниже порога
 * (config.repair.threshold), не тратя энергию на стены. Когда чинить нечего —
 * укрепляет стены, строит, улучшает контроллер.
 */
const actions = require('creep.actions');
const movement = require('movement');
const config = require('config');

function run(creep) {
  if (movement.avoidHostiles(creep)) return;
  if (actions.goHome(creep)) return;
  if (actions.updateWorking(creep)) {
    if (actions.repair(creep)) return;
    if (actions.build(creep)) return;
    if (actions.repairWalls(creep)) return;
    actions.upgrade(creep);
    return;
  }
  if (!actions.getEnergy(creep, {
    storageMin: config.storage.minForBuilders,
    harvest: creep.room.energyCapacityAvailable < 550 || !creep.room.storage,
  })) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) creep.memory.working = true;
    else actions.park(creep);
  }
}

module.exports = { run: run };
