'use strict';

/**
 * Чистые функции планировки базы. Не обращаются к Game — получают функции
 * проверки клеток, поэтому легко тестируются.
 */

/** Ключ клетки "x,y". */
function key(x, y) {
  return x + ',' + y;
}

function parseKey(k) {
  const p = k.split(',');
  return { x: parseInt(p[0], 10), y: parseInt(p[1], 10) };
}

function range(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Клетки "шахматки" вокруг якоря (спавна), отсортированные по удалённости.
 * Постройки ставятся на клетки той же чётности, что и якорь, остальные
 * остаются проходами — база всегда проходима, спавн не замурован.
 * @param {{x:number,y:number}} anchor
 * @param {function(number, number): boolean} isFree можно ли строить на клетке
 * @param {number} count сколько клеток нужно
 * @param {number} [maxRadius] радиус поиска (по умолчанию 12)
 * @param {number} [minRange] минимальная дистанция от якоря (по умолчанию 1)
 */
function checkerboardSlots(anchor, isFree, count, maxRadius, minRange) {
  const out = [];
  const parity = (anchor.x + anchor.y) % 2;
  const maxR = maxRadius || 12;
  const minR = minRange || 1;
  for (let r = minR; r <= maxR && out.length < count; r++) {
    const ring = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = anchor.x + dx;
        const y = anchor.y + dy;
        if (x < 3 || x > 46 || y < 3 || y > 46) continue;
        if ((x + y) % 2 !== parity) continue;
        if (!isFree(x, y)) continue;
        ring.push({ x: x, y: y, d: Math.abs(dx) + Math.abs(dy) });
      }
    }
    ring.sort(function (a, b) { return a.d - b.d || a.y - b.y || a.x - b.x; });
    for (let i = 0; i < ring.length && out.length < count; i++) out.push({ x: ring[i].x, y: ring[i].y });
  }
  return out;
}

/**
 * Свободная клетка в радиусе rad от center, ближайшая к from.
 * @param {function(number, number): boolean} isFree
 */
function pickNear(center, rad, isFree, from) {
  let best = null;
  let bestD = Infinity;
  for (let dx = -rad; dx <= rad; dx++) {
    for (let dy = -rad; dy <= rad; dy++) {
      if (!dx && !dy) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 1 || x > 48 || y < 1 || y > 48 || !isFree(x, y)) continue;
      const d = from ? range({ x: x, y: y }, from) * 10 + Math.abs(x - from.x) + Math.abs(y - from.y) : 0;
      if (d < bestD) {
        bestD = d;
        best = { x: x, y: y };
      }
    }
  }
  return best;
}

/**
 * Позиция первого спавна в новой комнате: открытая площадка 5×5 (без стен),
 * минимизирующая суммарную дистанцию до источников и контроллера.
 * @param {function(number, number): boolean} isWall
 * @param {{x:number,y:number}[]} sources
 * @param {{x:number,y:number}} controller
 */
function chooseSpawnPos(isWall, sources, controller) {
  let best = null;
  let bestScore = Infinity;
  for (let x = 6; x <= 43; x++) {
    for (let y = 6; y <= 43; y++) {
      let open = true;
      for (let dx = -2; dx <= 2 && open; dx++) {
        for (let dy = -2; dy <= 2 && open; dy++) {
          if (isWall(x + dx, y + dy)) open = false;
        }
      }
      if (!open) continue;
      const p = { x: x, y: y };
      let score = controller ? range(p, controller) : 0;
      let tooClose = controller && range(p, controller) < 4;
      for (let i = 0; i < sources.length; i++) {
        const r = range(p, sources[i]);
        if (r < 3) tooClose = true;
        score += r;
      }
      if (tooClose) continue;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  return best;
}

/** Сколько ещё построек типа можно поставить: лимит по RCL минус построенные и площадки. */
function remainingAllowed(limits, type, rcl, existing, sites) {
  const byType = limits[type];
  const max = byType ? byType[rcl] || 0 : 0;
  return Math.max(0, max - existing - sites);
}

module.exports = {
  key: key,
  parseKey: parseKey,
  range: range,
  checkerboardSlots: checkerboardSlots,
  pickNear: pickNear,
  chooseSpawnPos: chooseSpawnPos,
  remainingAllowed: remainingAllowed,
};
