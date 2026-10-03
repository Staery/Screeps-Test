'use strict';

const threat = require('threat');

const part = (type, boost, hits = 100) => ({ type, hits, boost });
const pos = (x, y) => ({ x, y, getRangeTo: (p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) });

describe('threat scoring', () => {
  test('bodyPower counts only active parts and applies boosts', () => {
    const p = threat.bodyPower([part(ATTACK), part(ATTACK, 'XUH2O'), part(ATTACK, undefined, 0), part(HEAL), part(MOVE)]);
    expect(p.attack).toBe(30 + 120);
    expect(p.heal).toBe(12);
  });

  test('boosted TOUGH lowers the tough factor and raises the score', () => {
    const plain = threat.creepScore([part(TOUGH), part(ATTACK)]);
    const boosted = threat.creepScore([part(TOUGH, 'XGHO2'), part(ATTACK)]);
    expect(threat.bodyPower([part(TOUGH, 'XGHO2')]).toughFactor).toBeCloseTo(0.3);
    expect(boosted).toBeGreaterThan(plain);
  });

  test('assess separates invaders, players and ignores keepers / harmless creeps', () => {
    const t = threat.assess([
      { owner: { username: 'Invader' }, body: [part(ATTACK)] },
      { owner: { username: 'Bob' }, body: [part(RANGED_ATTACK)] },
      { owner: { username: 'Source Keeper' }, body: [part(ATTACK), part(ATTACK)] },
      { owner: { username: 'Scout' }, body: [part(MOVE)] },
    ]);
    expect(t.count).toBe(2);
    expect(t.invader).toBe(true);
    expect(t.player).toBe(true);
    expect(t.players).toEqual(['Bob']);
    expect(t.keeper).toBe(true);
    expect(t.score).toBe(40);
  });

  test('towerPower falls off linearly between range 5 and 20', () => {
    expect(threat.towerPower(3, 600)).toBe(600);
    expect(threat.towerPower(20, 600)).toBe(150);
    expect(threat.towerPower(25, 600)).toBe(150);
    expect(threat.towerPower(12.5, 600)).toBeCloseTo(375);
  });

  test('chooseTowerTarget prefers healers and skips out-healed targets far from the core', () => {
    const towers = [{ pos: pos(25, 25) }];
    const healer = { pos: pos(27, 25), body: [part(HEAL), part(HEAL)] };
    const fighter = { pos: pos(26, 25), body: [part(ATTACK)] };
    expect(threat.chooseTowerTarget([fighter, healer], towers, 0)).toBe(healer);
    const tank = { pos: pos(45, 25), body: [part(TOUGH, 'XGHO2'), part(ATTACK)] };
    expect(threat.chooseTowerTarget([tank], towers, 500)).toBeNull();
    expect(threat.chooseTowerTarget([tank], towers, 500, () => true)).toBe(tank);
  });
});
