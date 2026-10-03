'use strict';

/**
 * Лекарь: лечит раненых своих крипов (сначала боевых), следует за отрядом.
 */
const actions = require('creep.actions');
const movement = require('movement');
const combat = require('combat');

const COMBAT = { defender: true, rangedDefender: true, healer: true };

function run(creep) {
  const m = creep.memory;
  const targetRoom = m.targetRoom || m.home;
  const friends = creep.room.find(FIND_MY_CREEPS);
  let patient = null;
  let worst = 1;
  for (let i = 0; i < friends.length; i++) {
    const f = friends[i];
    const ratio = f.hits / f.hitsMax - (COMBAT[f.memory.role] ? 0.1 : 0);
    if (f.hits < f.hitsMax && ratio < worst) {
      worst = ratio;
      patient = f;
    }
  }
  if (patient) {
    if (creep.pos.isNearTo(patient)) creep.heal(patient);
    else if (creep.pos.inRangeTo(patient, 3)) creep.rangedHeal(patient);
    // Не лезем в ближний бой без нужды.
    const danger = combat.enemies(creep.room).filter(function (h) { return creep.pos.inRangeTo(h, 2); });
    if (danger.length && patient.id === creep.id) movement.flee(creep, danger, 4);
    else movement.moveTo(creep, patient, { range: 1, reusePath: 1 });
    return;
  }

  if (creep.room.name !== targetRoom) {
    movement.travelToRoom(creep, targetRoom);
    return;
  }
  // Держаться рядом с бойцами.
  const buddy = creep.pos.findClosestByRange(friends, {
    filter: function (f) { return f.id !== creep.id && (f.memory.role === 'defender' || f.memory.role === 'rangedDefender'); },
  });
  if (buddy) {
    m.idle = 0;
    movement.moveTo(creep, buddy, { range: 1, reusePath: 2 });
    return;
  }
  m.idle = (m.idle || 0) + 1;
  if (creep.room.name === m.home && m.idle > 300) actions.recycle(creep);
  else actions.park(creep);
}

module.exports = { run: run };
