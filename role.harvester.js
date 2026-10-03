'use strict';

/**
 * Харвестер — универсал ранней игры: сам добывает энергию и заполняет
 * спавн/расширения/башни; если заполнять нечего — строит, иначе улучшает контроллер.
 * Когда у всех источников появились майнеры, работает как перевозчик.
 */
const actions = require('creep.actions');
const movement = require('movement');
const cache = require('cache');
const rooms = require('rooms');

function assignSource(creep) {
  const room = creep.room;
  const info = rooms.mem(room.name).srcs || {};
  const sources = cache.sources(room);
  const harvesters = {};
  const mined = {};
  for (const name in Game.creeps) {
    const m = Game.creeps[name].memory;
    if (m.home !== room.name || !m.sourceId) continue;
    if (m.role === 'harvester') harvesters[m.sourceId] = (harvesters[m.sourceId] || 0) + 1;
    else if (m.role === 'miner') mined[m.sourceId] = true;
  }
  let best = null;
  let bestLoad = Infinity;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (mined[s.id]) continue;
    const spots = info[s.id] && info[s.id].spots ? info[s.id].spots : 2;
    const load = (harvesters[s.id] || 0) / spots;
    if (load < bestLoad) {
      bestLoad = load;
      best = s;
    }
  }
  return best;
}

function run(creep) {
  if (movement.avoidHostiles(creep)) return;
  if (actions.goHome(creep)) return;

  if (actions.updateWorking(creep)) {
    if (actions.deliverEnergy(creep, { towerLevel: 0.5, controllerContainer: false })) return;
    if (actions.build(creep)) return;
    actions.upgrade(creep);
    return;
  }

  // Подобрать энергию, выпавшую рядом (например, у источника).
  const near = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {
    filter: function (r) { return r.resourceType === RESOURCE_ENERGY && r.amount >= 30; },
  })[0];
  if (near) {
    if (creep.pickup(near) === ERR_NOT_IN_RANGE) movement.moveTo(creep, near, { range: 1 });
    return;
  }

  // Периодически пересматриваем источник: у него мог появиться майнер.
  if (Game.time % 50 === 0) creep.memory.sourceId = null;
  let source = creep.memory.sourceId ? Game.getObjectById(creep.memory.sourceId) : null;
  if (!source || source.pos.roomName !== creep.room.name) {
    source = assignSource(creep);
    creep.memory.sourceId = source ? source.id : null;
  }
  if (!source) {
    // Все источники заняты майнерами — работаем перевозчиком.
    actions.getEnergy(creep, { storage: false, minAmount: 50, harvest: true });
    return;
  }
  if (source.energy === 0) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) creep.memory.working = true;
    else if (!creep.pos.inRangeTo(source, 2)) movement.moveTo(creep, source, { range: 2 });
    return;
  }
  actions.harvest(creep, source);
}

module.exports = { run: run };
