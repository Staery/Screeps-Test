'use strict';

/**
 * Резервер: держит резерв контроллера remote-комнаты (флаги reserve... и remote...),
 * чтобы источники давали 3000 энергии вместо 1500. Чужой резерв атакует.
 */
const actions = require('creep.actions');
const movement = require('movement');
const rooms = require('rooms');
const utils = require('utils');

function run(creep) {
  const m = creep.memory;
  if (rooms.isHostile(m.targetRoom) && creep.room.name !== m.targetRoom) {
    if (!actions.goHome(creep)) actions.park(creep);
    return;
  }
  if (creep.room.name !== m.targetRoom) {
    const mem = Memory.rooms[m.targetRoom];
    const pos = mem && mem.ctrlPos ? new RoomPosition(mem.ctrlPos.x, mem.ctrlPos.y, m.targetRoom) : null;
    if (pos) movement.moveTo(creep, pos, { range: 1 });
    else movement.travelToRoom(creep, m.targetRoom);
    return;
  }
  if (movement.avoidHostiles(creep)) return;
  const ctrl = creep.room.controller;
  if (!ctrl || ctrl.owner) {
    creep.suicide();
    return;
  }
  if (!creep.pos.isNearTo(ctrl)) {
    movement.moveTo(creep, ctrl, { range: 1 });
    return;
  }
  m.stationary = true;
  actions.signIfNeeded(creep, ctrl);
  if (ctrl.reservation && ctrl.reservation.username !== utils.myUsername()) creep.attackController(ctrl);
  else creep.reserveController(ctrl);
}

module.exports = { run: run };
