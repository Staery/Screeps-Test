'use strict';

/**
 * Перевозчик: забирает энергию из контейнеров у источников, с земли, из
 * надгробий и руин и развозит её: спавн/расширения → башни → контейнер у
 * контроллера → storage. Два перевозчика не едут к одной цели (резервирование).
 * Если в комнате есть filler, заполнение спавна оставляется ему.
 * Также вывозит минералы из контейнера у минерала в терминал/storage.
 */
const actions = require('creep.actions');
const movement = require('movement');
const cache = require('cache');
const rooms = require('rooms');
const targets = require('targets');

function fillerAlive(roomName) {
  return cache.perTick('filler:' + roomName, function () {
    for (const name in Game.creeps) {
      const m = Game.creeps[name].memory;
      if (m.role === 'filler' && m.home === roomName && !Game.creeps[name].spawning) return true;
    }
    return false;
  });
}

/** Забрать минералы из контейнера у минерала (если там много). */
function collectMinerals(creep, info) {
  const room = creep.room;
  if (!info.min || !info.min.c || !(room.storage || room.terminal)) return false;
  const c = Game.getObjectById(info.min.c);
  if (!c) return false;
  const used = c.store.getUsedCapacity() - (c.store[RESOURCE_ENERGY] || 0);
  const claimed = targets.pickReserved(c.id);
  if (used - claimed < Math.min(1000, creep.store.getFreeCapacity())) return false;
  if (creep.memory.pick !== c.id) targets.setPick(creep, c.id, creep.store.getFreeCapacity());
  if (!creep.pos.isNearTo(c)) {
    movement.moveTo(creep, c, { range: 1 });
    return true;
  }
  for (const r in c.store) {
    if (r !== RESOURCE_ENERGY && c.store[r] > 0) {
      creep.withdraw(c, r);
      break;
    }
  }
  targets.clearPick(creep);
  return true;
}

/** Если везти некуда — отдать энергию работающим крипам (апгрейдер/строитель). */
function feedWorkers(creep) {
  const workers = creep.room.find(FIND_MY_CREEPS, {
    filter: function (c) {
      return (c.memory.role === 'upgrader' || c.memory.role === 'builder') &&
        c.store.getFreeCapacity(RESOURCE_ENERGY) > 20;
    },
  });
  const t = creep.pos.findClosestByRange(workers);
  if (!t) return false;
  if (creep.transfer(t, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) movement.moveTo(creep, t, { range: 1 });
  return true;
}

function run(creep) {
  if (movement.avoidHostiles(creep)) return;
  if (actions.goHome(creep)) return;
  const room = creep.room;
  const m = creep.memory;
  const info = rooms.mem(room.name);

  // Минералы в трюме — сначала сложить.
  if (creep.store.getUsedCapacity() > creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
    actions.storeMinerals(creep);
    return;
  }

  const used = creep.store.getUsedCapacity();
  if (m.working && used === 0) {
    m.working = false;
    targets.clearDrop(creep);
  } else if (!m.working && creep.store.getFreeCapacity() === 0) {
    m.working = true;
    targets.clearPick(creep);
  }

  const filler = fillerAlive(room.name);
  if (!m.working) {
    const ctrlContainer = info.ctrl && info.ctrl.c;
    const exclude = [];
    if (ctrlContainer) exclude.push(ctrlContainer);
    if (info.min && info.min.c) exclude.push(info.min.c);
    const spawnNeeds = room.energyAvailable < room.energyCapacityAvailable;
    if (actions.getEnergy(creep, {
      storage: spawnNeeds && !filler,
      storageMin: 0,
      exclude: exclude,
      minAmount: 100,
    })) return;
    if (collectMinerals(creep, info)) return;
    // Нечего забирать: если что-то везём — отвезём, иначе ждём.
    if (used > 0) m.working = true;
    else {
      actions.park(creep);
      return;
    }
  }

  const delivered = actions.deliverEnergy(creep, {
    spawn: !filler || room.energyAvailable < room.energyCapacityAvailable * 0.5,
    towers: !filler,
    towerLevel: 0.7,
    controllerContainer: !(info.ctrl && info.ctrl.l),
    storage: true,
  });
  if (delivered) return;
  if (feedWorkers(creep)) return;
  actions.park(creep);
}

module.exports = { run: run, fillerAlive: fillerAlive };
