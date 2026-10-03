'use strict';

/**
 * Защитник ближнего боя. Цель — memory.targetRoom (флаг attack / remote-комната)
 * или домашняя комната. Атакует самых опасных врагов; при атаке игрока дома
 * держится на рампартах. На штурме (memory.attack) разрушает вражеские постройки,
 * в remote-комнатах — ядра захватчиков.
 */
const actions = require('creep.actions');
const movement = require('movement');
const combat = require('combat');
const config = require('config');

function run(creep) {
  const m = creep.memory;
  const targetRoom = m.targetRoom || m.home;
  if (creep.hits < creep.hitsMax * 0.35 && m.targetRoom && creep.room.name === targetRoom) {
    // Сильно ранен в чужой комнате — отступить.
    movement.travelToRoom(creep, m.home);
    return;
  }
  if (creep.room.name !== targetRoom) {
    // По дороге атакуем тех, кто рядом.
    const near = creep.pos.findInRange(combat.enemies(creep.room), 1)[0];
    if (near) creep.attack(near);
    movement.travelToRoom(creep, targetRoom);
    return;
  }

  const room = creep.room;
  const enemies = combat.enemies(room);
  const target = combat.chooseTarget(creep, enemies);
  if (target) {
    m.idle = 0;
    const atHome = room.name === m.home;
    const isPlayer = target.owner && target.owner.username !== 'Invader';
    if (atHome && isPlayer) {
      const ramp = combat.rampartNear(creep, target);
      if (ramp && ramp.pos.getRangeTo(target) <= 3) {
        if (!creep.pos.isEqualTo(ramp.pos)) movement.moveTo(creep, ramp, { range: 0, avoidHostiles: false });
        if (creep.pos.isNearTo(target)) creep.attack(target);
        else {
          const adj = creep.pos.findInRange(enemies, 1)[0];
          if (adj) creep.attack(adj);
        }
        return;
      }
    }
    if (creep.attack(target) === ERR_NOT_IN_RANGE) {
      movement.moveTo(creep, target, { range: 1, avoidHostiles: false, reusePath: 1 });
      const adj = creep.pos.findInRange(enemies, 1)[0];
      if (adj) creep.attack(adj);
    }
    return;
  }

  let structure = null;
  if (m.attack) structure = combat.hostileStructureTarget(creep, true);
  else if (config.isOn('attackInvaderCores')) structure = combat.hostileStructureTarget(creep, false);
  if (structure) {
    m.idle = 0;
    if (creep.attack(structure) === ERR_NOT_IN_RANGE) movement.moveTo(creep, structure, { range: 1, avoidHostiles: false });
    return;
  }

  // Делать нечего. В чужой комнате ждём (даём обзор), дома — после простоя переработка.
  m.idle = (m.idle || 0) + 1;
  if (creep.room.name === m.home && m.idle > 300) {
    actions.recycle(creep);
    return;
  }
  actions.park(creep, creep.room.name === m.home ? null : creep.room.controller);
}

module.exports = { run: run };
