'use strict';

/**
 * Runs the real main loop against the mock engine (test/mocks/world.js) and
 * checks that the colony grows without runtime errors.
 */
const { createWorld } = require('./mocks/world');

function terrain(x, y) {
  if (x === 0 || y === 0 || x === 49 || y === 49) return TERRAIN_MASK_WALL;
  if (x >= 30 && x <= 33 && y >= 18 && y <= 22) return TERRAIN_MASK_WALL; // small rock
  if (x >= 5 && x <= 8 && y >= 30 && y <= 34) return TERRAIN_MASK_SWAMP;
  return 0;
}

function setup(level, options) {
  jest.resetModules();
  const world = createWorld(options);
  world.addRoom('W1N1', terrain);
  world.addController('W1N1', 25, 42, level || 1);
  world.addSource('W1N1', 10, 10);
  world.addSource('W1N1', 42, 12);
  world.addMineral('W1N1', 40, 40);
  world.addSpawn('W1N1', 25, 25);
  const errors = [];
  const logs = [];
  jest.spyOn(console, 'log').mockImplementation((msg) => {
    const text = String(msg);
    logs.push(text);
    if (text.indexOf('ERROR') !== -1) errors.push(text);
  });
  const main = require('main');
  return { world, main, errors, logs };
}

function run(env, ticks, each) {
  for (let i = 0; i < ticks; i++) {
    env.main.loop();
    if (each) each(i);
    env.world.tick();
    if (env.errors.length) break;
  }
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('full loop simulation', () => {
  test('a fresh colony boots, spawns, builds and upgrades without errors', () => {
    const env = setup(1);
    run(env, 3000);
    expect(env.errors).toEqual([]);
    const room = Game.rooms.W1N1;
    const roles = Object.values(Game.creeps).map((c) => c.memory.role);
    expect(env.world.stats.spawned).toBeGreaterThan(5);
    // early harvesters are replaced by static miners + haulers once containers exist
    expect(roles.some((r) => r === 'harvester' || r === 'miner')).toBe(true);
    expect(roles).toContain('upgrader');
    expect(room.controller.level).toBeGreaterThanOrEqual(2);
    expect(env.world.stats.built).toBeGreaterThanOrEqual(3); // containers and extensions were constructed
    const types = room.find(FIND_STRUCTURES).map((s) => s.structureType);
    expect(types).toContain('extension');
    expect(types).toContain('container');
    // report printed periodically
    expect(env.logs.some((l) => l.indexOf('=== Tick') !== -1)).toBe(true);
  });

  test('old-script creeps without "home" keep working', () => {
    const env = setup(1);
    env.world.addCreep('Harvester1', [WORK, CARRY, MOVE], 20, 20, 'W1N1', undefined, { role: 'harvester' });
    env.world.addCreep('Builder1', [WORK, CARRY, MOVE], 21, 20, 'W1N1', undefined, { role: 'builder' });
    env.world.addCreep('Odd1', [MOVE], 22, 20, 'W1N1', undefined, { role: 'mystery' });
    run(env, 50);
    expect(env.errors).toEqual([]);
    expect(Memory.creeps.Harvester1.home).toBe('W1N1');
    // unknown role: sent to the spawn and recycled
    expect(Game.creeps.Odd1 === undefined || Memory.creeps.Odd1.recycle === true).toBe(true);
  });

  test('invaders trigger defence and towers fire', () => {
    const env = setup(4);
    env.world.addStructure('tower', 'W1N1', 27, 27).store.add('energy', 1000);
    env.world.addStructure('storage', 'W1N1', 23, 27).store.add('energy', 50000);
    run(env, 200);
    const invader = env.world.addCreep('inv1', [TOUGH, ATTACK, MOVE, ATTACK], 30, 30, 'W1N1', { username: 'Invader' });
    invader.memory = {};
    run(env, 5);
    expect(env.errors).toEqual([]);
    expect(Memory.rooms.W1N1.defense).toBeDefined();
    expect(Game.getObjectById(invader.id)).toBeNull(); // shot down
    run(env, 100);
    expect(env.errors).toEqual([]);
  });

  test('player attack on the spawn with no defence activates safe mode', () => {
    const env = setup(2);
    run(env, 50);
    const spawn = Object.values(Game.spawns)[0];
    const enemy = env.world.addCreep('bad1', Array(10).fill(ATTACK).concat([MOVE]), 25, 27, 'W1N1', { username: 'Enemy' });
    enemy.memory = {};
    env.world.tick();
    spawn.hits = 2000;
    run(env, 3);
    expect(env.errors).toEqual([]);
    expect(env.world.stats.safeMode).toBe(true);
  });

  test('flags: remote, claim, attack and avoid directives do not crash', () => {
    const env = setup(4, { refill: true }); // unlimited spawn energy: we test directives, not economy
    env.world.addStructure('storage', 'W1N1', 23, 27).store.add('energy', 200000);
    for (let i = 0; i < 10; i++) env.world.addStructure('extension', 'W1N1', 15 + i * 2, 20).store.add('energy', 50);
    env.world.addFlag('remote1', 'W2N1', 25, 25);
    env.world.addFlag('claim@W1N1', 'W3N1', 25, 25);
    env.world.addFlag('attack1', 'W4N1', 25, 25);
    env.world.addFlag('avoidMe', 'W5N1', 25, 25);
    env.world.addFlag('reserveX', 'W6N1', 25, 25);
    run(env, 1500);
    expect(env.errors).toEqual([]);
    const spawned = env.logs.filter((l) => l.indexOf('спавн') !== -1).join('\n');
    expect(spawned).toContain('scout-');
    expect(spawned).toContain('claimer-');
    expect(Memory.rooms.W5N1.avoid).toBe(true);
    // console helpers are installed and safe to call
    expect(typeof global.help()).toBe('string');
    expect(global.stats()).toContain('W1N1');
    expect(global.roomInfo('W1N1')).toContain('W1N1');
    expect(global.spawnCreep('W1N1', 'builder')).toContain('builder');
    expect(global.setToggle('planner', false)).toContain('false');
    expect(global.resetRoom('W1N1')).toContain('W1N1');
    expect(global.directives()).toContain('W2N1');
    run(env, 20);
    expect(env.errors).toEqual([]);
  });

  test('high RCL room with storage, links and terminal runs cleanly', () => {
    const env = setup(6);
    const w = env.world;
    w.addStructure('storage', 'W1N1', 23, 27).store.add('energy', 300000);
    w.addStructure('terminal', 'W1N1', 23, 29);
    w.addStructure('link', 'W1N1', 22, 26);
    w.addStructure('link', 'W1N1', 26, 40);
    w.addStructure('link', 'W1N1', 11, 12).store.add('energy', 800);
    w.addStructure('container', 'W1N1', 11, 11);
    w.addStructure('container', 'W1N1', 41, 13);
    w.addStructure('container', 'W1N1', 25, 40);
    w.addStructure('container', 'W1N1', 39, 39);
    w.addStructure('extractor', 'W1N1', 40, 40);
    w.addStructure('tower', 'W1N1', 27, 27).store.add('energy', 1000);
    for (let i = 0; i < 20; i++) w.addStructure('extension', 'W1N1', 15 + (i % 10) * 2, 20 + Math.floor(i / 10) * 2).store.add('energy', 50);
    run(env, 1500);
    expect(env.errors).toEqual([]);
    const roles = Object.values(Game.creeps).map((c) => c.memory.role);
    expect(roles).toContain('miner');
    expect(roles).toContain('hauler');
    expect(roles).toContain('filler');
    expect(roles).toContain('upgrader');
    expect(roles).toContain('mineralMiner');
    expect(Memory.rooms.W1N1.sLink).toBeTruthy();
  });

  test('pixels are produced when the bucket is full', () => {
    const env = setup(1);
    run(env, 3);
    expect(env.world.stats.pixels).toBeGreaterThan(0);
  });
});
