'use strict';

/**
 * Захватчик комнаты (флаг claim*): идёт в комнату и захватывает контроллер.
 * Чужой/зарезервированный контроллер сначала атакует. Если не хватает GCL —
 * резервирует комнату и пишет об этом в консоль.
 */
const actions = require('creep.actions');
const movement = require('movement');
const utils = require('utils');

function run(creep) {
  const m = creep.memory;
  if (creep.room.name !== m.targetRoom) {
    movement.travelToRoom(creep, m.targetRoom);
    return;
  }
  const ctrl = creep.room.controller;
  if (!ctrl) {
    utils.log('claimer ' + creep.name + ': в комнате ' + m.targetRoom + ' нет контроллера');
    creep.suicide();
    return;
  }
  if (ctrl.my) {
    if (!actions.signIfNeeded(creep, ctrl)) creep.suicide();
    return;
  }
  if (!creep.pos.isNearTo(ctrl)) {
    movement.moveTo(creep, ctrl, { range: 1 });
    return;
  }
  actions.signIfNeeded(creep, ctrl);
  const me = utils.myUsername();
  const foreign = ctrl.owner && !ctrl.my || ctrl.reservation && ctrl.reservation.username !== me;
  if (foreign) {
    if (!ctrl.upgradeBlocked) creep.attackController(ctrl);
    return;
  }
  const r = creep.claimController(ctrl);
  if (r === ERR_GCL_NOT_ENOUGH) {
    if (!m.gclWarned) {
      utils.log('Недостаточно GCL для захвата ' + m.targetRoom + ' — резервирую.');
      m.gclWarned = true;
    }
    creep.reserveController(ctrl);
  } else if (r === OK) {
    utils.log('Комната ' + m.targetRoom + ' захвачена.');
  }
}

module.exports = { run: run };
