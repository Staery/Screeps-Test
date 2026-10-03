'use strict';

/**
 * Стрелок: держит дистанцию 3 от врагов ближнего боя (кайтинг), использует
 * rangedMassAttack, когда это выгоднее одиночного выстрела.
 */
const actions = require('creep.actions');
const movement = require('movement');
const combat = require('combat');
const config = require('config');

function massDamage(creep, enemies) {
  let dmg = 0;
  for (let i = 0; i < enemies.length; i++) {
    const r = creep.pos.getRangeTo(enemies[i]);
    if (r <= 1) dmg += 10;
    else if (r === 2) dmg += 4;
    else if (r === 3) dmg += 1;
  }
  return dmg;
}

function shoot(creep, target, enemies) {
  const inRange = creep.pos.findInRange(enemies, 3);
  if (!inRange.length) return;
  if (massDamage(creep, inRange) > 10) creep.rangedMassAttack();
  else creep.rangedAttack(target && creep.pos.inRangeTo(target, 3) ? target : inRange[0]);
}

function run(creep) {
  const m = creep.memory;
  const targetRoom = m.targetRoom || m.home;
  if (creep.getActiveBodyparts(HEAL) > 0 && creep.hits < creep.hitsMax) creep.heal(creep);
  if (creep.room.name !== targetRoom) {
    shoot(creep, null, combat.enemies(creep.room));
    movement.travelToRoom(creep, targetRoom);
    return;
  }
  const enemies = combat.enemies(creep.room);
  const target = combat.chooseTarget(creep, enemies);
  if (target) {
    m.idle = 0;
    shoot(creep, target, enemies);
    const meleeNear = enemies.some(function (h) {
      return h.body && creep.pos.getRangeTo(h) <= 2 &&
        h.body.some(function (p) { return p.type === ATTACK && p.hits > 0; });
    });
    if (meleeNear) movement.flee(creep, enemies, 3);
    else if (creep.pos.getRangeTo(target) > 3) movement.moveTo(creep, target, { range: 3, avoidHostiles: false, reusePath: 1 });
    return;
  }
  let structure = null;
  if (m.attack) structure = combat.hostileStructureTarget(creep, true);
  else if (config.isOn('attackInvaderCores')) structure = combat.hostileStructureTarget(creep, false);
  if (structure) {
    m.idle = 0;
    if (creep.rangedAttack(structure) === ERR_NOT_IN_RANGE) movement.moveTo(creep, structure, { range: 3, avoidHostiles: false });
    return;
  }
  m.idle = (m.idle || 0) + 1;
  if (creep.room.name === m.home && m.idle > 300) {
    actions.recycle(creep);
    return;
  }
  actions.park(creep, creep.room.name === m.home ? null : creep.room.controller);
}

module.exports = { run: run };
