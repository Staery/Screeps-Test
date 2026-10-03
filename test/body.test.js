'use strict';

const body = require('body');

function count(b, part) {
  return b.filter((p) => p === part).length;
}

describe('body builder', () => {
  test('cost sums part prices', () => {
    expect(body.cost([WORK, CARRY, MOVE])).toBe(200);
    expect(body.cost([])).toBe(0);
  });

  test('repeat respects energy, maxUnits and the 50-part limit', () => {
    expect(body.repeat([WORK, CARRY, MOVE], 1000, 3)).toHaveLength(9);
    expect(body.repeat([WORK, CARRY, MOVE], 550)).toHaveLength(6);
    expect(body.repeat([CARRY, MOVE], 100000).length).toBe(50);
    expect(body.repeat([WORK, CARRY, MOVE], 199)).toEqual([]);
  });

  test('parts are ordered: TOUGH first, MOVE and HEAL last', () => {
    const b = body.sortBody([MOVE, HEAL, ATTACK, TOUGH, MOVE]);
    expect(b[0]).toBe(TOUGH);
    expect(b[b.length - 1]).toBe(HEAL);
    expect(b.indexOf(MOVE)).toBeGreaterThan(b.indexOf(ATTACK));
  });

  test.each([
    'harvester', 'miner', 'remoteMiner', 'mineralMiner', 'hauler', 'remoteHauler', 'filler', 'upgrader',
    'builder', 'pioneer', 'repairer', 'wallRepairer', 'defender', 'rangedDefender', 'healer', 'claimer',
    'reserver', 'scout',
  ])('%s body never exceeds energy or 50 parts', (role) => {
    [300, 550, 800, 1300, 1800, 2300, 5600, 12900].forEach((energy) => {
      const b = body.forRole(role, energy);
      expect(body.cost(b)).toBeLessThanOrEqual(energy);
      expect(b.length).toBeLessThanOrEqual(50);
    });
  });

  test('harvester at 300 energy is WORK WORK CARRY MOVE; nothing below 200', () => {
    expect(body.forRole('harvester', 300).sort()).toEqual([WORK, WORK, CARRY, MOVE].sort());
    expect(body.forRole('harvester', 200)).toHaveLength(3);
    expect(body.forRole('harvester', 150)).toEqual([]);
  });

  test('miner caps at 5 WORK and adds CARRY only with a link', () => {
    const small = body.forRole('miner', 300);
    expect(count(small, WORK)).toBe(2);
    const full = body.forRole('miner', 2000);
    expect(count(full, WORK)).toBe(5);
    expect(count(full, CARRY)).toBe(0);
    expect(count(body.forRole('miner', 2000, { link: true }), CARRY)).toBe(1);
    expect(count(body.forRole('miner', 550), WORK)).toBe(4);
  });

  test('claimer needs 650 energy', () => {
    expect(body.forRole('claimer', 600)).toEqual([]);
    expect(body.forRole('claimer', 650).sort()).toEqual([CLAIM, MOVE].sort());
  });

  test('hauler size follows requested carry parts', () => {
    const b = body.forRole('hauler', 5000, { carryParts: 6 });
    expect(count(b, CARRY)).toBe(6);
    expect(count(b, MOVE)).toBe(3);
  });

  test('static upgrader at RCL8 respects maxWork', () => {
    const b = body.forRole('upgrader', 12900, { static: true, maxWork: 15 });
    expect(count(b, WORK)).toBeLessThanOrEqual(15);
    expect(count(b, CARRY)).toBeGreaterThanOrEqual(1);
  });

  test('defender falls back to ATTACK+MOVE at low energy', () => {
    expect(body.forRole('defender', 150).sort()).toEqual([ATTACK, MOVE].sort());
  });

  test('maxCarryParts', () => {
    expect(body.maxCarryParts('hauler', 300)).toBe(4);
    expect(body.maxCarryParts('hauler', 100000)).toBe(16);
  });
});
