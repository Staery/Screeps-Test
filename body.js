'use strict';

/**
 * Построение тел крипов. Чистые функции: зависят только от констант игры
 * (BODYPART_COST, MAX_CREEP_SIZE и т.п.), поэтому легко тестируются.
 */

const MAX_PARTS = typeof MAX_CREEP_SIZE !== 'undefined' ? MAX_CREEP_SIZE : 50;

// Порядок частей в теле: урон приходит в первые части, поэтому TOUGH — первыми,
// MOVE и HEAL — последними (крип дольше сохраняет подвижность и лечение).
const ORDER = {};
['tough', 'work', 'carry', 'claim', 'attack', 'ranged_attack', 'move', 'heal']
  .forEach(function (p, i) { ORDER[p] = i; });

function cost(body) {
  let total = 0;
  for (let i = 0; i < body.length; i++) total += BODYPART_COST[body[i]];
  return total;
}

function sortBody(body) {
  return body.slice().sort(function (a, b) { return ORDER[a] - ORDER[b]; });
}

/**
 * Повторить unit столько раз, сколько позволяет энергия (и maxUnits), добавив
 * prefix/suffix. Возвращает [] если не помещается даже одна единица.
 */
function repeat(unit, energy, maxUnits, prefix, suffix) {
  prefix = prefix || [];
  suffix = suffix || [];
  const fixed = prefix.concat(suffix);
  const fixedCost = cost(fixed);
  const unitCost = cost(unit);
  const bySize = Math.floor((MAX_PARTS - fixed.length) / unit.length);
  const byEnergy = Math.floor((energy - fixedCost) / unitCost);
  const units = Math.min(maxUnits === undefined ? Infinity : maxUnits, bySize, byEnergy);
  if (units < 1) return [];
  let body = prefix.slice();
  for (let i = 0; i < units; i++) body = body.concat(unit);
  return sortBody(body.concat(suffix));
}

/**
 * Жадно добавлять части из последовательности, пока хватает энергии.
 * Останавливается на первой недоступной части (stopOnFail) или пропускает её.
 */
function greedy(sequence, energy, stopOnFail) {
  const body = [];
  let spent = 0;
  for (let i = 0; i < sequence.length && body.length < MAX_PARTS; i++) {
    const c = BODYPART_COST[sequence[i]];
    if (spent + c > energy) {
      if (stopOnFail) break;
      continue;
    }
    body.push(sequence[i]);
    spent += c;
  }
  return sortBody(body);
}

/** Тело стационарного майнера: до `works` WORK, MOVE на каждые 2 WORK, опционально CARRY. */
function minerBody(energy, works, withCarry, moveRatio) {
  works = works || 5;
  const seq = [];
  for (let w = 1; w <= works; w++) {
    seq.push(WORK);
    if ((w - 1) % moveRatio === 0) seq.push(MOVE);
  }
  let body = greedy(seq, energy, true);
  if (body.indexOf(WORK) === -1 || body.indexOf(MOVE) === -1) return [];
  if (withCarry && cost(body) + BODYPART_COST[CARRY] <= energy) {
    body = sortBody(body.concat([CARRY]));
  }
  return body;
}

/**
 * Тело для роли.
 * @param {string} role
 * @param {number} energy доступная энергия (обычно energyCapacityAvailable)
 * @param {object} [opts] уточнения: carryParts, works, link, maxWork, claimParts
 * @returns {string[]} тело или [] если энергии не хватает на минимальное
 */
function forRole(role, energy, opts) {
  opts = opts || {};
  switch (role) {
    case 'harvester':
      if (energy < 400) return greedy([WORK, CARRY, MOVE, WORK], energy, true).length >= 3
        ? greedy([WORK, CARRY, MOVE, WORK], energy, true) : [];
      return repeat([WORK, CARRY, MOVE], energy, opts.units || 5);
    case 'miner':
      return minerBody(energy, opts.works || 5, !!opts.link, 2);
    case 'remoteMiner':
      // Без дорог нужно больше MOVE; CARRY — чтобы строить и чинить контейнер.
      return minerBody(energy, opts.works || 6, true, 2);
    case 'mineralMiner':
      return repeat([WORK, WORK, MOVE], energy, opts.units || 10);
    case 'hauler': {
      const carry = opts.carryParts || 16;
      return repeat([CARRY, CARRY, MOVE], energy, Math.max(1, Math.ceil(carry / 2)));
    }
    case 'remoteHauler': {
      const carry = opts.carryParts || 20;
      const body = repeat([CARRY, CARRY, MOVE], energy, Math.max(1, Math.ceil(carry / 2)), [WORK, CARRY, MOVE]);
      return body.length ? body : repeat([CARRY, CARRY, MOVE], energy, Math.max(1, Math.ceil(carry / 2)));
    }
    case 'filler':
      return repeat([CARRY, CARRY, MOVE], energy, opts.units || 8);
    case 'upgrader': {
      const maxWork = opts.maxWork || 15;
      if (energy < 550 || !opts.static) {
        return repeat([WORK, CARRY, MOVE], energy, Math.min(opts.units || 6, maxWork));
      }
      // Стационарный апгрейдер у линка/контейнера: много WORK, немного CARRY/MOVE.
      return repeat([WORK, WORK, MOVE], energy, Math.max(1, Math.floor(maxWork / 2)), [CARRY]);
    }
    case 'builder':
      return repeat([WORK, CARRY, MOVE], energy, opts.units || 6);
    case 'pioneer': {
      // Пионер идёт в новую комнату без дорог — больше MOVE.
      const b = repeat([WORK, CARRY, MOVE, MOVE], energy, opts.units || 6);
      return b.length ? b : repeat([WORK, CARRY, MOVE], energy, 1);
    }
    case 'repairer':
      return repeat([WORK, CARRY, MOVE], energy, opts.units || 4);
    case 'wallRepairer':
      return repeat([WORK, CARRY, MOVE], energy, opts.units || 8);
    case 'defender': {
      const b = repeat([TOUGH, ATTACK, MOVE, MOVE], energy, opts.units || 8);
      return b.length ? b : repeat([ATTACK, MOVE], energy, 1);
    }
    case 'rangedDefender':
      return repeat([RANGED_ATTACK, MOVE], energy, opts.units || 10);
    case 'healer':
      return repeat([HEAL, MOVE], energy, opts.units || 8);
    case 'claimer':
      return repeat([CLAIM, MOVE], energy, 1);
    case 'reserver':
      return repeat([CLAIM, MOVE], energy, opts.claimParts || 2);
    case 'scout':
      return energy >= BODYPART_COST[MOVE] ? [MOVE] : [];
    default:
      return repeat([WORK, CARRY, MOVE], energy, 3);
  }
}

/** Сколько CARRY частей в теле перевозчика выбранной роли при данной энергии. */
function maxCarryParts(role, energy) {
  return forRole(role, energy).filter(function (p) { return p === CARRY; }).length;
}

module.exports = {
  cost: cost,
  sortBody: sortBody,
  repeat: repeat,
  greedy: greedy,
  minerBody: minerBody,
  forRole: forRole,
  maxCarryParts: maxCarryParts,
};
