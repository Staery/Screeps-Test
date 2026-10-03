'use strict';

/**
 * Резервирование целей между крипами, чтобы два перевозчика не ехали к одному
 * и тому же контейнеру/расширению.
 *
 * В памяти крипа хранится:
 *   pick / pickAmt — откуда крип забирает ресурс и сколько планирует взять;
 *   drop / dropAmt — куда крип везёт и сколько планирует отдать.
 * Раз в тик реестр собирается заново по памяти живых крипов.
 */

let tick = -1;
let picks = {};
let drops = {};

function rebuild() {
  if (tick === Game.time) return;
  tick = Game.time;
  picks = {};
  drops = {};
  for (const name in Game.creeps) {
    const m = Game.creeps[name].memory;
    if (m.pick) picks[m.pick] = (picks[m.pick] || 0) + (m.pickAmt || 0);
    if (m.drop) drops[m.drop] = (drops[m.drop] || 0) + (m.dropAmt || 0);
  }
}

function pickReserved(id) {
  rebuild();
  return picks[id] || 0;
}

function dropReserved(id) {
  rebuild();
  return drops[id] || 0;
}

function setPick(creep, id, amount) {
  rebuild();
  clearPick(creep);
  if (!id) return;
  creep.memory.pick = id;
  creep.memory.pickAmt = amount;
  picks[id] = (picks[id] || 0) + amount;
}

function clearPick(creep) {
  rebuild();
  const m = creep.memory;
  if (m.pick) {
    picks[m.pick] = Math.max(0, (picks[m.pick] || 0) - (m.pickAmt || 0));
    delete m.pick;
    delete m.pickAmt;
  }
}

function setDrop(creep, id, amount) {
  rebuild();
  clearDrop(creep);
  if (!id) return;
  creep.memory.drop = id;
  creep.memory.dropAmt = amount;
  drops[id] = (drops[id] || 0) + amount;
}

function clearDrop(creep) {
  rebuild();
  const m = creep.memory;
  if (m.drop) {
    drops[m.drop] = Math.max(0, (drops[m.drop] || 0) - (m.dropAmt || 0));
    delete m.drop;
    delete m.dropAmt;
  }
}

/**
 * Выбрать лучшую цель. Чистая функция.
 * @param {Array} items кандидаты
 * @param {function(object): number} available сколько ресурса/места доступно (с учётом резервов)
 * @param {function(object): number} range расстояние до кандидата
 * @param {number} [minAmount] минимально интересный объём
 * @param {number} [want] сколько нужно крипу — больше не ценится
 * @returns {{target: object, amount: number}|null}
 */
function pickBest(items, available, range, minAmount, want) {
  let best = null;
  let bestScore = -Infinity;
  let bestAmount = 0;
  const min = minAmount || 1;
  for (let i = 0; i < items.length; i++) {
    const amount = available(items[i]);
    if (amount < min) continue;
    const useful = want ? Math.min(amount, want) : amount;
    const score = useful / (range(items[i]) + 5);
    if (score > bestScore) {
      bestScore = score;
      best = items[i];
      bestAmount = useful;
    }
  }
  return best ? { target: best, amount: bestAmount } : null;
}

module.exports = {
  pickReserved: pickReserved,
  dropReserved: dropReserved,
  setPick: setPick,
  clearPick: clearPick,
  setDrop: setDrop,
  clearDrop: clearDrop,
  pickBest: pickBest,
};
