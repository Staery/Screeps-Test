'use strict';

/**
 * Общие функции боевых ролей: выбор цели, вражеские постройки, позиция на рампарте.
 */
const cache = require('cache');
const threat = require('threat');
const utils = require('utils');

/** Враждебные крипы, которых стоит атаковать (без Source Keeper'ов). */
function enemies(room) {
  return cache.hostiles(room).filter(function (h) {
    return !(h.owner && h.owner.username === threat.SOURCE_KEEPER);
  });
}

/** Лучшая цель для крипа: опасные ближе — в первую очередь, лекари — приоритетнее. */
function chooseTarget(creep, list) {
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    const danger = h.body ? threat.creepScore(h.body) : 50;
    const heal = h.body ? threat.bodyPower(h.body).heal : 0;
    const score = danger + heal * 3 + 1 - creep.pos.getRangeTo(h) * 10;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

/**
 * Вражеские постройки для штурма (флаг attack) или ядро захватчиков.
 * Порядок: башни → спавны → ядро → прочее (кроме контроллера, стен, дорог, контейнеров).
 */
function hostileStructureTarget(creep, all) {
  const room = creep.room;
  const order = {};
  order[STRUCTURE_TOWER] = 0;
  order[STRUCTURE_SPAWN] = 1;
  order[STRUCTURE_INVADER_CORE] = 2;
  const list = cache.find(room, FIND_HOSTILE_STRUCTURES).filter(function (s) {
    if (s.structureType === STRUCTURE_CONTROLLER || s.structureType === STRUCTURE_KEEPER_LAIR ||
        s.structureType === STRUCTURE_POWER_BANK) return false;
    if (s.owner && utils.isAlly(s.owner.username)) return false;
    if (!all && s.structureType !== STRUCTURE_INVADER_CORE) return false;
    return true;
  });
  let best = null;
  let bestKey = Infinity;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const pr = order[s.structureType] === undefined ? 5 : order[s.structureType];
    const key = pr * 100 + creep.pos.getRangeTo(s);
    if (key < bestKey) {
      bestKey = key;
      best = s;
    }
  }
  if (!best) return null;
  // Если цель под рампартом — сначала рампарт.
  const ramp = best.pos.lookFor(LOOK_STRUCTURES).filter(function (s) {
    return s.structureType === STRUCTURE_RAMPART && !s.my;
  })[0];
  return ramp || best;
}

/** Свободный свой рампарт, ближайший к цели (для обороны дома). */
function rampartNear(creep, target) {
  const ramps = cache.myStructures(creep.room, STRUCTURE_RAMPART).filter(function (r) {
    const occupant = r.pos.lookFor(LOOK_CREEPS)[0];
    if (occupant && occupant.id !== creep.id) return false;
    return !r.pos.lookFor(LOOK_STRUCTURES).some(function (s) {
      return s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_CONTAINER;
    });
  });
  let best = null;
  let bestRange = Infinity;
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i].pos.getRangeTo(target);
    if (r < bestRange) {
      bestRange = r;
      best = ramps[i];
    }
  }
  return best;
}

module.exports = {
  enemies: enemies,
  chooseTarget: chooseTarget,
  hostileStructureTarget: hostileStructureTarget,
  rampartNear: rampartNear,
};
