'use strict';

/**
 * Менеджер базы (filler): работает от storage. Заполняет спавн, расширения
 * и башни, обслуживает линк у storage (опустошает или наполняет его для
 * контроллера — режим задаёт structure.link), держит запас энергии в терминале.
 */
const actions = require('creep.actions');
const movement = require('movement');
const rooms = require('rooms');
const cache = require('cache');
const config = require('config');

function needsWork(room, info) {
  if (room.energyAvailable < room.energyCapacityAvailable) return 'fill';
  const towers = cache.myStructures(room, STRUCTURE_TOWER);
  for (let i = 0; i < towers.length; i++) {
    if (towers[i].store.getFreeCapacity(RESOURCE_ENERGY) > 200) return 'fill';
  }
  const link = rooms.byId(info.sLink);
  if (link && info.linkMode === 'fill' && link.store.getFreeCapacity(RESOURCE_ENERGY) > 100) return 'link';
  if (room.terminal && room.terminal.my && room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 50000 &&
      room.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < config.terminal.energyTarget &&
      room.terminal.store.getFreeCapacity() > 1000) return 'terminal';
  return null;
}

function run(creep) {
  if (actions.goHome(creep)) return;
  const room = creep.room;
  const storage = room.storage;
  if (!storage) {
    require('role.hauler').run(creep);
    return;
  }
  if (actions.storeMinerals(creep)) return;
  const info = rooms.mem(room.name);
  const link = rooms.byId(info.sLink);
  const m = creep.memory;

  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    m.stationary = false;
    // 1. Опустошить линк у storage.
    if (link && info.linkMode !== 'fill' && link.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.withdraw(link, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) movement.moveTo(creep, link, { range: 1 });
      return;
    }
    // 2. Лишняя энергия в терминале — вернуть в storage.
    const term = room.terminal;
    if (term && term.my && term.store.getUsedCapacity(RESOURCE_ENERGY) > config.terminal.energyTarget * 1.5 &&
        storage.store.getFreeCapacity() > 10000) {
      if (creep.withdraw(term, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) movement.moveTo(creep, term, { range: 1 });
      return;
    }
    // 3. Есть работа — взять энергию из storage (или терминала).
    if (needsWork(room, info)) {
      const src = storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0 ? storage
        : term && term.store.getUsedCapacity(RESOURCE_ENERGY) > 0 ? term : null;
      if (src) {
        if (creep.withdraw(src, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) movement.moveTo(creep, src, { range: 1 });
        return;
      }
    }
    // Ждать у storage, не на дороге.
    if (!creep.pos.inRangeTo(storage, 2)) movement.moveTo(creep, storage, { range: 1 });
    else m.stationary = true;
    return;
  }

  m.stationary = false;
  if (actions.deliverEnergy(creep, { spawn: true, towers: true, towerLevel: 0.9, terminal: true, storage: false })) return;
  if (link && info.linkMode === 'fill' && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.transfer(link, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) movement.moveTo(creep, link, { range: 1 });
    return;
  }
  if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) movement.moveTo(creep, storage, { range: 1 });
}

module.exports = { run: run };
