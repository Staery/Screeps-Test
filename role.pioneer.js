'use strict';

/**
 * Пионер: отправляется в только что захваченную комнату (флаг claim*),
 * добывает энергию сам, строит спавн и держит контроллер. Когда в комнате
 * появился свой спавн и RCL ≥ 3, становится местным строителем.
 */
const actions = require('creep.actions');
const movement = require('movement');
const cache = require('cache');

function run(creep) {
  const m = creep.memory;
  if (creep.room.name !== m.targetRoom) {
    movement.travelToRoom(creep, m.targetRoom);
    return;
  }
  if (movement.avoidHostiles(creep)) return;
  const room = creep.room;
  const ctrl = room.controller;
  if (ctrl && ctrl.my && ctrl.level >= 3 && cache.myStructures(room, STRUCTURE_SPAWN).length) {
    m.role = 'builder';
    m.home = room.name;
    m.key = 'builder';
    delete m.targetRoom;
    return;
  }
  if (actions.updateWorking(creep)) {
    if (ctrl && ctrl.my && (ctrl.ticksToDowngrade < 4000 || ctrl.level < 2)) {
      actions.upgrade(creep);
      return;
    }
    if (actions.deliverEnergy(creep, { towerLevel: 0.5, storage: false })) return;
    if (actions.build(creep)) return;
    if (actions.repair(creep)) return;
    actions.upgrade(creep);
    return;
  }
  actions.getEnergy(creep, { harvest: true, minAmount: 50 });
}

module.exports = { run: run };
