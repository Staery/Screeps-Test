'use strict';

const layout = require('planner.layout');

describe('planner layout helpers', () => {
  test('checkerboard slots keep anchor parity, avoid edges and are sorted by distance', () => {
    const anchor = { x: 25, y: 25 };
    const slots = layout.checkerboardSlots(anchor, () => true, 20);
    expect(slots).toHaveLength(20);
    slots.forEach((s) => {
      expect((s.x + s.y) % 2).toBe(0);
      expect(s.x === 25 && s.y === 25).toBe(false);
    });
    for (let i = 1; i < slots.length; i++) {
      expect(layout.range(slots[i], anchor)).toBeGreaterThanOrEqual(layout.range(slots[i - 1], anchor));
    }
    // orthogonal neighbours of the spawn stay free
    expect(slots.some((s) => s.x === 25 && s.y === 24)).toBe(false);
    const edge = layout.checkerboardSlots({ x: 3, y: 3 }, () => true, 50);
    edge.forEach((s) => {
      expect(s.x).toBeGreaterThanOrEqual(3);
      expect(s.y).toBeGreaterThanOrEqual(3);
    });
  });

  test('checkerboard respects isFree and minRange', () => {
    const blocked = new Set(['24,24', '26,26']);
    const slots = layout.checkerboardSlots({ x: 25, y: 25 }, (x, y) => !blocked.has(x + ',' + y), 10, 12, 2);
    slots.forEach((s) => {
      expect(blocked.has(s.x + ',' + s.y)).toBe(false);
      expect(layout.range(s, { x: 25, y: 25 })).toBeGreaterThanOrEqual(2);
    });
  });

  test('pickNear chooses the free tile closest to "from"', () => {
    const p = layout.pickNear({ x: 10, y: 10 }, 1, (x, y) => !(x === 11 && y === 10), { x: 20, y: 10 });
    expect(p.x).toBe(11);
    expect(p.y).not.toBe(10);
    expect(layout.pickNear({ x: 10, y: 10 }, 1, () => false)).toBeNull();
  });

  test('chooseSpawnPos finds open ground near sources and controller', () => {
    const isWall = (x, y) => x < 1 || y < 1 || x > 48 || y > 48 || (x >= 20 && x <= 30 && y === 20);
    const pos = layout.chooseSpawnPos(isWall, [{ x: 10, y: 10 }, { x: 40, y: 10 }], { x: 25, y: 40 });
    expect(pos).not.toBeNull();
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) expect(isWall(pos.x + dx, pos.y + dy)).toBe(false);
    expect(layout.range(pos, { x: 25, y: 40 })).toBeGreaterThanOrEqual(4);
  });

  test('remainingAllowed uses CONTROLLER_STRUCTURES', () => {
    expect(layout.remainingAllowed(CONTROLLER_STRUCTURES, STRUCTURE_EXTENSION, 2, 3, 1)).toBe(1);
    expect(layout.remainingAllowed(CONTROLLER_STRUCTURES, STRUCTURE_TOWER, 2, 0, 0)).toBe(0);
    expect(layout.remainingAllowed(CONTROLLER_STRUCTURES, STRUCTURE_EXTENSION, 8, 70, 0)).toBe(0);
    expect(layout.remainingAllowed(CONTROLLER_STRUCTURES, 'unknown', 8, 0, 0)).toBe(0);
  });

  test('key round trip', () => {
    expect(layout.parseKey(layout.key(7, 42))).toEqual({ x: 7, y: 42 });
  });
});
