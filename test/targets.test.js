'use strict';

const targets = require('targets');

function creep(name, memory) {
  return { name, memory };
}

describe('target reservations', () => {
  beforeEach(() => {
    Game.time += 1;
    Game.creeps = {};
  });

  test('pickBest prefers bigger and closer, honours minAmount', () => {
    const items = [{ id: 'a', amount: 1000, range: 20 }, { id: 'b', amount: 300, range: 1 }, { id: 'c', amount: 10, range: 0 }];
    const best = targets.pickBest(items, (x) => x.amount, (x) => x.range, 50, 300);
    expect(best.target.id).toBe('b');
    expect(best.amount).toBe(300);
    // without a "want" cap a much bigger pile wins even if it is a bit farther
    const near = [{ id: 'a', amount: 1000, range: 5 }, { id: 'b', amount: 300, range: 1 }];
    const greedy = targets.pickBest(near, (x) => x.amount, (x) => x.range, 50);
    expect(greedy.target.id).toBe('a');
    expect(targets.pickBest(items, () => 0, () => 0, 1)).toBeNull();
  });

  test('registry is rebuilt from creep memory every tick', () => {
    Game.creeps = { h1: creep('h1', { pick: 'box', pickAmt: 400 }), h2: creep('h2', { drop: 'ext', dropAmt: 50 }) };
    expect(targets.pickReserved('box')).toBe(400);
    expect(targets.dropReserved('ext')).toBe(50);
    const h3 = creep('h3', {});
    Game.creeps.h3 = h3;
    targets.setPick(h3, 'box', 100);
    expect(targets.pickReserved('box')).toBe(500);
    targets.clearPick(h3);
    expect(targets.pickReserved('box')).toBe(400);
    expect(h3.memory.pick).toBeUndefined();
  });

  test('two haulers do not take the same container when only one load is available', () => {
    const container = { id: 'c1', amount: 500, range: 3 };
    const other = { id: 'c2', amount: 400, range: 10 };
    const a = creep('a', {});
    const b = creep('b', {});
    Game.creeps = { a, b };
    const avail = (x) => x.amount - targets.pickReserved(x.id);
    const first = targets.pickBest([container, other], avail, (x) => x.range, 100, 500);
    targets.setPick(a, first.target.id, first.amount);
    const second = targets.pickBest([container, other], avail, (x) => x.range, 100, 500);
    expect(first.target.id).toBe('c1');
    expect(second.target.id).toBe('c2');
  });
});
