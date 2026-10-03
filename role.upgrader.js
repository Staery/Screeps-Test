'use strict';

/**
 * Апгрейдер: улучшает контроллер. Энергию берёт в первую очередь из линка и
 * контейнера у контроллера, затем из storage и других контейнеров; в ранней
 * игре (нет контейнеров) добывает сам.
 */
const actions = require('creep.actions');
const movement = require('movement');
const cache = require('cache');
const rooms = require('rooms');
const config = require('config');

function run(creep) {
  if (movement.avoidHostiles(creep)) return;
  if (actions.goHome(creep)) return;
  const room = creep.room;
  const info = rooms.mem(room.name);
  const ctrlInfo = info.ctrl || {};
  const link = rooms.byId(ctrlInfo.l);
  const container = rooms.byId(ctrlInfo.c);

  if (actions.updateWorking(creep)) {
    actions.upgrade(creep);
    // Подзаправка без потери тика: забрать из соседнего линка/контейнера.
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) <= creep.getActiveBodyparts(WORK) * 2) {
      const src = [link, container].filter(function (s) {
        return s && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && creep.pos.isNearTo(s);
      })[0];
      if (src) creep.withdraw(src, RESOURCE_ENERGY);
    }
    return;
  }

  const noContainers = cache.structures(room, STRUCTURE_CONTAINER).length === 0 && !room.storage;
  const ok = actions.getEnergy(creep, {
    links: link ? [link.id] : null,
    storageMin: config.storage.reserveForSpawn,
    minAmount: 25,
    harvest: noContainers || room.energyCapacityAvailable < 550,
  });
  if (!ok) {
    // Энергии нет: подождать у контроллера, чтобы не мешать.
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) creep.memory.working = true;
    else if (room.controller && !creep.pos.inRangeTo(room.controller, 3)) {
      movement.moveTo(creep, room.controller, { range: 3 });
    }
  }
}

module.exports = { run: run };
