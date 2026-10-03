'use strict';

/**
 * Оценка угрозы по телам враждебных крипов. Чистые функции.
 *
 * Оценка ≈ урон/лечение за тик с учётом бустов:
 *   ATTACK 30, RANGED_ATTACK 10, HEAL 12, WORK (dismantle) 50 × 0.25.
 * TOUGH с бустом уменьшает входящий урон — это учитывается в toughFactor.
 */

const INVADER = 'Invader';
const SOURCE_KEEPER = 'Source Keeper';

function boostMultiplier(part, action) {
  if (!part.boost || typeof BOOSTS === 'undefined') return 1;
  const byType = BOOSTS[part.type];
  const effect = byType && byType[part.boost];
  if (!effect || effect[action] === undefined) return 1;
  return effect[action];
}

/**
 * Сила одного крипа.
 * @param {{type:string,hits:number,boost?:string}[]} body
 */
function bodyPower(body) {
  const p = { attack: 0, ranged: 0, heal: 0, dismantle: 0, claim: 0, tough: 0, toughFactor: 1, parts: 0 };
  if (!body) return p;
  for (let i = 0; i < body.length; i++) {
    const part = body[i];
    if (!(part.hits > 0)) continue;
    p.parts++;
    switch (part.type) {
      case ATTACK: p.attack += 30 * boostMultiplier(part, 'attack'); break;
      case RANGED_ATTACK: p.ranged += 10 * boostMultiplier(part, 'rangedAttack'); break;
      case HEAL: p.heal += 12 * boostMultiplier(part, 'heal'); break;
      case WORK: p.dismantle += 50 * boostMultiplier(part, 'dismantle'); break;
      case CLAIM: p.claim += 1; break;
      case TOUGH:
        p.tough++;
        p.toughFactor = Math.min(p.toughFactor, boostMultiplier(part, 'damage'));
        break;
      default: break;
    }
  }
  return p;
}

/** Единое число "опасности" крипа. */
function creepScore(body) {
  const p = bodyPower(body);
  const raw = p.attack + p.ranged + p.heal * 1.5 + p.dismantle * 0.25 + p.claim * 5;
  return raw / Math.max(0.3, p.toughFactor);
}

/**
 * Сводная угроза по списку враждебных крипов.
 * @param {Array<{owner:{username:string},body:Array}>} hostiles
 */
function assess(hostiles) {
  const t = { score: 0, attack: 0, ranged: 0, heal: 0, dismantle: 0, claim: 0, count: 0,
    player: false, invader: false, keeper: false, players: [] };
  for (let i = 0; i < hostiles.length; i++) {
    const h = hostiles[i];
    const owner = h.owner ? h.owner.username : '';
    if (owner === SOURCE_KEEPER) {
      t.keeper = true;
      continue;
    }
    const p = bodyPower(h.body);
    const s = h.body ? creepScore(h.body) : 100; // силовой крип без тела — условно опасен
    if (s <= 0) continue;
    t.count++;
    t.score += s;
    t.attack += p.attack;
    t.ranged += p.ranged;
    t.heal += p.heal;
    t.dismantle += p.dismantle;
    t.claim += p.claim;
    if (owner === INVADER) {
      t.invader = true;
    } else {
      t.player = true;
      if (t.players.indexOf(owner) === -1) t.players.push(owner);
    }
  }
  t.score = Math.round(t.score);
  return t;
}

/** Урон/лечение/ремонт башни на дистанции range (линейное затухание 5..20). */
function towerPower(range, base) {
  const optimal = typeof TOWER_OPTIMAL_RANGE !== 'undefined' ? TOWER_OPTIMAL_RANGE : 5;
  const falloffRange = typeof TOWER_FALLOFF_RANGE !== 'undefined' ? TOWER_FALLOFF_RANGE : 20;
  const falloff = typeof TOWER_FALLOFF !== 'undefined' ? TOWER_FALLOFF : 0.75;
  if (range <= optimal) return base;
  if (range >= falloffRange) return base * (1 - falloff);
  return base * (1 - falloff * (range - optimal) / (falloffRange - optimal));
}

/**
 * Выбор цели для башен: максимизируем (опасность × ожидаемый урон),
 * приоритет лекарям; цели, которых враги перелечивают, пропускаем,
 * если они не у самых важных построек.
 * @param {Array} hostiles крипы с полями pos, body
 * @param {Array} towers башни с полем pos
 * @param {number} healAround суммарное лечение врагов (для оценки "перелечивания")
 * @param {function} [isNearCore] true — цель рядом со спавном/контроллером, стрелять в любом случае
 */
function chooseTowerTarget(hostiles, towers, healAround, isNearCore) {
  let best = null;
  let bestScore = -Infinity;
  const attackPower = typeof TOWER_POWER_ATTACK !== 'undefined' ? TOWER_POWER_ATTACK : 600;
  for (let i = 0; i < hostiles.length; i++) {
    const h = hostiles[i];
    let dmg = 0;
    for (let j = 0; j < towers.length; j++) {
      dmg += towerPower(towers[j].pos.getRangeTo(h.pos), attackPower);
    }
    const p = bodyPower(h.body);
    dmg *= p.toughFactor;
    const net = dmg - (healAround || 0);
    const danger = h.body ? creepScore(h.body) + p.heal * 2 + 1 : 50;
    const score = danger * Math.max(net, dmg * 0.1);
    if (net <= 0 && !(isNearCore && isNearCore(h))) continue;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

module.exports = {
  INVADER: INVADER,
  SOURCE_KEEPER: SOURCE_KEEPER,
  bodyPower: bodyPower,
  creepScore: creepScore,
  assess: assess,
  towerPower: towerPower,
  chooseTowerTarget: chooseTowerTarget,
};
