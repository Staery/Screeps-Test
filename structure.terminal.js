'use strict';

/**
 * Терминалы: раз в config.terminal.interval тиков богатая энергией комната
 * отправляет энергию в свою же бедную комнату. Рынок не используется.
 */
const config = require('config');
const utils = require('utils');

function run() {
  if (!config.isOn('terminal') || Game.time % config.terminal.interval !== 0) return;
  const cfg = config.terminal;
  const list = utils.myRooms().filter(function (r) {
    return r.terminal && r.terminal.my && r.storage && r.storage.my && r.terminal.isActive();
  });
  if (list.length < 2) return;
  const donors = list.filter(function (r) {
    return r.storage.store.getUsedCapacity(RESOURCE_ENERGY) > cfg.richStorage && r.terminal.cooldown === 0 &&
      r.terminal.store.getUsedCapacity(RESOURCE_ENERGY) > cfg.sendAmount;
  }).sort(function (a, b) { return b.storage.store.getUsedCapacity(RESOURCE_ENERGY) - a.storage.store.getUsedCapacity(RESOURCE_ENERGY); });
  const receivers = list.filter(function (r) {
    return r.storage.store.getUsedCapacity(RESOURCE_ENERGY) < cfg.poorStorage && r.terminal.store.getFreeCapacity() > cfg.sendAmount;
  }).sort(function (a, b) { return a.storage.store.getUsedCapacity(RESOURCE_ENERGY) - b.storage.store.getUsedCapacity(RESOURCE_ENERGY); });

  for (let i = 0; i < receivers.length && donors.length; i++) {
    const donor = donors.shift();
    const to = receivers[i];
    const cost = Game.market.calcTransactionCost(cfg.sendAmount, donor.name, to.name);
    const amount = Math.min(cfg.sendAmount, donor.terminal.store.getUsedCapacity(RESOURCE_ENERGY) - cost);
    if (amount < 1000) continue;
    const r = donor.terminal.send(RESOURCE_ENERGY, amount, to.name, 'balance');
    utils.log('Терминал: ' + donor.name + ' → ' + to.name + ' ' + amount + ' энергии (' + r + ')');
  }
}

module.exports = { run: run };
