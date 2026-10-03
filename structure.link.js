'use strict';

/**
 * Линки: линки у источников отправляют энергию в линк контроллера (если он
 * пустеет) или в линк у storage. Линк у storage при пустом линке контроллера
 * может подкачивать энергию из storage (режим "fill", его обслуживает filler).
 */
const config = require('config');
const rooms = require('rooms');

function send(from, to) {
  if (!from || !to || from.cooldown > 0) return false;
  const amount = Math.min(from.store.getUsedCapacity(RESOURCE_ENERGY), to.store.getFreeCapacity(RESOURCE_ENERGY));
  if (amount < 100) return false;
  return from.transferEnergy(to, amount) === OK;
}

function run(room) {
  const info = rooms.mem(room.name);
  const ctrlLink = info.ctrl ? rooms.byId(info.ctrl.l) : null;
  const storageLink = rooms.byId(info.sLink);
  const low = config.links.controllerLow;
  const ctrlNeeds = !!ctrlLink && ctrlLink.store.getUsedCapacity(RESOURCE_ENERGY) < low;

  let receivedCtrl = false;
  const srcs = info.srcs || {};
  for (const id in srcs) {
    const link = rooms.byId(srcs[id].l);
    if (!link || link.cooldown > 0 || link.store.getUsedCapacity(RESOURCE_ENERGY) < config.links.sendThreshold) continue;
    if (ctrlLink && !receivedCtrl && ctrlLink.store.getFreeCapacity(RESOURCE_ENERGY) >= 200 && send(link, ctrlLink)) {
      receivedCtrl = true;
      continue;
    }
    if (storageLink) send(link, storageLink);
  }

  // Режим линка у storage.
  const storage = room.storage;
  const fill = !!(storageLink && ctrlLink && ctrlNeeds && !receivedCtrl &&
    storage && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 20000);
  info.linkMode = fill ? 'fill' : 'empty';
  if (fill && storageLink.store.getUsedCapacity(RESOURCE_ENERGY) >= 200) send(storageLink, ctrlLink);
}

module.exports = { run: run };
