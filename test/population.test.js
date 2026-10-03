'use strict';

const population = require('population');
const config = require('config');

function state(over) {
  return Object.assign({
    room: 'W1N1', rcl: 1, energyCapacity: 300, energyAvailable: 300,
    sources: [{ id: 's1', container: false, link: false, distance: 15, spots: 3 },
      { id: 's2', container: false, link: false, distance: 25, spots: 2 }],
    hasStorage: false, storageEnergy: 0, storageFree: 0,
    ctrlLink: false, ctrlContainer: false, storageLink: false,
    sites: 0, sitesProgressLeft: 0, repairTargets: 0, wallsBelowTarget: 0, towers: 0,
    threat: { score: 0 }, downgradeTicks: 20000, mineral: null,
    remotes: [], reserves: [], claims: [], attacks: [],
  }, over || {});
}

const roles = (list) => list.map((r) => r.role);
const countOf = (list, role) => list.filter((r) => r.role === role).length;

describe('population.plan', () => {
  test('fresh room: emergency harvester first, then harvesters and an upgrader', () => {
    const plan = population.plan(state(), {}, config);
    expect(plan[0].role).toBe('harvester');
    expect(plan[0].emergency).toBe(true);
    // 3 per source early, capped by free spots: 3 + 2
    expect(countOf(plan, 'harvester')).toBe(5);
    expect(roles(plan)).toContain('upgrader');
    expect(roles(plan)).not.toContain('miner');
    expect(roles(plan)).not.toContain('builder');
  });

  test('existing creeps are not requested again', () => {
    const plan = population.plan(state(), { harvester: 5, upgrader: 2 }, config);
    expect(countOf(plan, 'harvester')).toBe(0);
    expect(plan.every((r) => !r.emergency)).toBe(true);
  });

  test('containers switch the room to miners + haulers', () => {
    const s = state({ rcl: 3, energyCapacity: 800,
      sources: [{ id: 's1', container: true, distance: 15, spots: 3 }, { id: 's2', container: true, distance: 30, spots: 2 }] });
    const plan = population.plan(s, { hauler: 0, harvester: 1 }, config);
    expect(plan.filter((r) => r.role === 'miner').map((r) => r.memory.sourceId).sort()).toEqual(['s1', 's2']);
    expect(countOf(plan, 'harvester')).toBe(0);
    expect(countOf(plan, 'hauler')).toBeGreaterThanOrEqual(1);
    // first miner and first hauler come before upgraders
    const firstUp = roles(plan).indexOf('upgrader');
    expect(roles(plan).indexOf('miner')).toBeLessThan(firstUp);
    expect(roles(plan).indexOf('hauler')).toBeLessThan(firstUp);
    plan.forEach((r) => expect(r.memory.key).toBeTruthy());
  });

  test('miner keys are per source: one missing miner is requested', () => {
    const s = state({ rcl: 3, energyCapacity: 800,
      sources: [{ id: 's1', container: true, distance: 15 }, { id: 's2', container: true, distance: 30 }] });
    const plan = population.plan(s, { 'miner:s1': 1, hauler: 2 }, config);
    const miners = plan.filter((r) => r.role === 'miner');
    expect(miners).toHaveLength(1);
    expect(miners[0].memory.sourceId).toBe('s2');
  });

  test('when no creep can refill the spawn but miners live, an emergency hauler is first', () => {
    const s = state({ rcl: 3, energyCapacity: 800,
      sources: [{ id: 's1', container: true, distance: 15 }, { id: 's2', container: true, distance: 30 }] });
    const plan = population.plan(s, { 'miner:s1': 1, 'miner:s2': 1 }, config);
    expect(plan[0].role).toBe('hauler');
    expect(plan[0].emergency).toBe(true);
  });

  test('builders scale with remaining construction work', () => {
    const one = population.plan(state({ rcl: 3, energyCapacity: 800, sites: 2, sitesProgressLeft: 3000 }), { harvester: 5 }, config);
    const many = population.plan(state({ rcl: 3, energyCapacity: 800, sites: 20, sitesProgressLeft: 60000 }), { harvester: 5 }, config);
    expect(countOf(one, 'builder')).toBe(1);
    expect(countOf(many, 'builder')).toBe(config.roles.maxBuilders[3]);
  });

  test('storage energy adds upgraders, RCL8 keeps one', () => {
    const base = { rcl: 6, energyCapacity: 2300, hasStorage: true, storageFree: 500000,
      sources: [{ id: 's1', container: true, distance: 15 }] };
    const poor = population.plan(state(Object.assign({}, base, { storageEnergy: 10000 })), {}, config);
    const rich = population.plan(state(Object.assign({}, base, { storageEnergy: 300000 })), {}, config);
    expect(countOf(poor, 'upgrader')).toBe(1);
    expect(countOf(rich, 'upgrader')).toBeGreaterThan(2);
    const rcl8 = population.plan(state(Object.assign({}, base, { rcl: 8, storageEnergy: 900000 })), {}, config);
    expect(countOf(rcl8, 'upgrader')).toBe(1);
    expect(roles(rich)).toContain('filler');
  });

  test('threat: invaders vs towers, players always get defenders', () => {
    const weak = population.plan(state({ rcl: 4, energyCapacity: 1300, towers: 1, threat: { score: 30, invader: true } }), { harvester: 5 }, config);
    expect(countOf(weak, 'defender')).toBe(0);
    const noTowers = population.plan(state({ rcl: 2, energyCapacity: 550, towers: 0, threat: { score: 30, invader: true } }), { harvester: 5 }, config);
    expect(countOf(noTowers, 'defender')).toBe(1);
    const player = population.plan(state({ rcl: 5, energyCapacity: 1800, towers: 2,
      threat: { score: 900, player: true, heal: 100 }, wallsBelowTarget: 5 }), { harvester: 5 }, config);
    expect(countOf(player, 'defender') + countOf(player, 'rangedDefender')).toBeGreaterThanOrEqual(2);
    expect(roles(player)).toContain('healer');
    expect(countOf(player, 'wallRepairer')).toBe(2);
    // defence comes before upgraders
    expect(roles(player).indexOf('defender')).toBeLessThan(roles(player).indexOf('upgrader'));
  });

  test('remote mining: reserver, miner and hauler per source; scout for unknown rooms', () => {
    const s = state({ rcl: 4, energyCapacity: 1300, remotes: [
      { room: 'W2N1', known: true, hostile: false, sources: [{ id: 'r1' }, { id: 'r2' }], reservedTicks: 0, distance: 60, core: -1 },
      { room: 'W3N1', known: false },
    ] });
    const plan = population.plan(s, { harvester: 5 }, config);
    expect(plan.filter((r) => r.role === 'reserver').map((r) => r.memory.targetRoom)).toEqual(['W2N1']);
    expect(plan.filter((r) => r.role === 'remoteMiner').map((r) => r.memory.sourceId).sort()).toEqual(['r1', 'r2']);
    expect(countOf(plan, 'remoteHauler')).toBeGreaterThanOrEqual(2);
    const scout = plan.filter((r) => r.role === 'scout');
    expect(scout).toHaveLength(1);
    expect(scout[0].memory.queue).toEqual(['W3N1']);
  });

  test('hostile remote: only a defender if the threat is beatable', () => {
    const remote = { room: 'W2N1', known: true, hostile: true, threatScore: 60, player: false, sources: [{ id: 'r1' }], distance: 50 };
    const plan = population.plan(state({ rcl: 4, energyCapacity: 1300, remotes: [remote] }), { harvester: 5 }, config);
    expect(plan.filter((r) => r.role === 'defender').map((r) => r.memory.targetRoom)).toEqual(['W2N1']);
    expect(roles(plan)).not.toContain('remoteMiner');
    const strong = Object.assign({}, remote, { threatScore: 5000 });
    const plan2 = population.plan(state({ rcl: 4, energyCapacity: 1300, remotes: [strong] }), { harvester: 5 }, config);
    expect(roles(plan2)).not.toContain('defender');
  });

  test('remotes are ignored below the minimum RCL', () => {
    const s = state({ rcl: 2, energyCapacity: 550, remotes: [{ room: 'W2N1', known: true, sources: [{ id: 'r1' }], distance: 50 }] });
    expect(roles(population.plan(s, { harvester: 5 }, config))).not.toContain('remoteMiner');
  });

  test('claim flag: claimer, then pioneers until the spawn exists', () => {
    const claim = population.plan(state({ rcl: 4, energyCapacity: 1300, claims: [{ room: 'W5N5', known: true, claimed: false }] }), { harvester: 5 }, config);
    expect(claim.filter((r) => r.role === 'claimer')[0].memory.targetRoom).toBe('W5N5');
    const pioneers = population.plan(state({ rcl: 4, energyCapacity: 1300, claims: [{ room: 'W5N5', known: true, claimed: true, hasSpawn: false }] }), { harvester: 5 }, config);
    expect(countOf(pioneers, 'pioneer')).toBe(config.roles.pioneersPerClaim);
    const done = population.plan(state({ rcl: 4, energyCapacity: 1300, claims: [{ room: 'W5N5', known: true, claimed: true, hasSpawn: true }] }), { harvester: 5 }, config);
    expect(roles(done)).not.toContain('pioneer');
  });

  test('attack flag sends the configured squad', () => {
    const plan = population.plan(state({ rcl: 5, energyCapacity: 1800, attacks: [{ room: 'W9N9' }] }), { harvester: 5 }, config);
    const squad = plan.filter((r) => r.memory.attack);
    expect(squad).toHaveLength(4);
    squad.forEach((r) => expect(r.memory.targetRoom).toBe('W9N9'));
  });

  test('mineral miner only with extractor, container and storage space', () => {
    const base = { rcl: 6, energyCapacity: 2300, hasStorage: true, storageEnergy: 50000, storageFree: 400000 };
    const yes = population.plan(state(Object.assign({}, base, { mineral: { extractor: true, container: true, amount: 5000 } })), {}, config);
    const empty = population.plan(state(Object.assign({}, base, { mineral: { extractor: true, container: true, amount: 0 } })), {}, config);
    expect(roles(yes)).toContain('mineralMiner');
    expect(roles(empty)).not.toContain('mineralMiner');
  });

  test('plan is sorted by priority', () => {
    const plan = population.plan(state({ rcl: 4, energyCapacity: 1300, sites: 5, sitesProgressLeft: 20000,
      repairTargets: 10, wallsBelowTarget: 3 }), {}, config);
    for (let i = 1; i < plan.length; i++) expect(plan[i].priority).toBeGreaterThanOrEqual(plan[i - 1].priority);
  });

  test('helpers: keyOf, carryNeeded, haulerSplit', () => {
    expect(population.keyOf({ role: 'miner', sourceId: 'a' })).toBe('miner:a');
    expect(population.keyOf({ role: 'reserver', targetRoom: 'W1N1' })).toBe('reserver:W1N1');
    expect(population.keyOf({ role: 'scout', targetRoom: 'W1N1', key: 'scout' })).toBe('scout');
    expect(population.carryNeeded(10, 20)).toBe(11);
    expect(population.haulerSplit(30, 16, 6)).toEqual({ count: 2, carryParts: 16 });
    expect(population.haulerSplit(5, 16, 6)).toEqual({ count: 1, carryParts: 6 });
    expect(population.haulerSplit(0, 16, 6).count).toBe(0);
  });
});
