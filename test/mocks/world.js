'use strict';

/**
 * A tiny hand-written imitation of the Screeps runtime, good enough to run the
 * whole main loop for thousands of ticks in a single room. Intents are applied
 * immediately and movement ignores most collisions; the goal is to catch
 * runtime errors (undefined access, wrong API usage) and gross logic bugs,
 * not to reproduce the game exactly.
 */

const C = require('./constants');

const SITE_COST = {
  spawn: 15000, extension: 3000, road: 300, constructedWall: 1, rampart: 1, link: 5000, storage: 30000,
  tower: 5000, observer: 8000, powerSpawn: 100000, extractor: 5000, lab: 50000, terminal: 100000,
  container: 5000, nuker: 100000, factory: 100000,
};
const HITS = {
  spawn: 5000, extension: 1000, road: 5000, constructedWall: 1, rampart: 1, link: 1000, storage: 10000,
  tower: 3000, extractor: 500, terminal: 3000, container: 250000, lab: 500,
};
const DIRS = { 1: [0, -1], 2: [1, -1], 3: [1, 0], 4: [1, 1], 5: [0, 1], 6: [-1, 1], 7: [-1, 0], 8: [-1, -1] };

function makeStore(capacity, contents, energyOnly) {
  const s = {};
  Object.assign(s, contents || {});
  const used = () => Object.keys(s).reduce((n, k) => n + (s[k] || 0), 0);
  Object.defineProperty(s, 'getCapacity', { value: (r) => (energyOnly && r && r !== 'energy' ? null : capacity) });
  Object.defineProperty(s, 'getUsedCapacity', { value: (r) => (r ? s[r] || 0 : used()) });
  Object.defineProperty(s, 'getFreeCapacity', {
    value: (r) => (energyOnly && r && r !== 'energy' ? null : capacity - used()),
  });
  Object.defineProperty(s, 'add', {
    value: (r, n) => { s[r] = (s[r] || 0) + n; if (!s[r] && r !== 'energy') delete s[r]; },
  });
  return s;
}

function createWorld(options) {
  const opts = Object.assign({ levels: { 1: 200, 2: 3000, 3: 8000, 4: 20000, 5: 40000, 6: 80000, 7: 160000 } }, options);
  const world = { rooms: {}, objects: {}, pendingCreeps: [], nextId: 1, logs: [] };
  const id = () => 'id' + (world.nextId++).toString(16);
  const me = { username: 'Staery' };

  global.Memory = { creeps: {}, rooms: {}, flags: {} };

  class RoomPosition {
    constructor(x, y, roomName) {
      this.x = x;
      this.y = y;
      this.roomName = roomName;
    }

    static norm(a, b) {
      if (typeof a === 'number') return { x: a, y: b, roomName: null };
      return a && a.pos ? a.pos : a;
    }

    getRangeTo(a, b) {
      const p = RoomPosition.norm(a, b);
      if (p.roomName && p.roomName !== this.roomName) return Infinity;
      return Math.max(Math.abs(p.x - this.x), Math.abs(p.y - this.y));
    }

    inRangeTo(a, b, c) {
      if (typeof a === 'number') return this.getRangeTo(a, b) <= c;
      return this.getRangeTo(a) <= b;
    }

    isNearTo(a, b) {
      return typeof a === 'number' ? this.inRangeTo(a, b, 1) : this.inRangeTo(a, 1);
    }

    isEqualTo(a, b) {
      const p = RoomPosition.norm(a, b);
      return p.x === this.x && p.y === this.y && (!p.roomName || p.roomName === this.roomName);
    }

    getDirectionTo(a, b) {
      const p = RoomPosition.norm(a, b);
      const dx = Math.sign(p.x - this.x);
      const dy = Math.sign(p.y - this.y);
      for (const d in DIRS) if (DIRS[d][0] === dx && DIRS[d][1] === dy) return Number(d);
      return 1;
    }

    _list(typeOrList, o) {
      const room = world.rooms[this.roomName];
      let list = Array.isArray(typeOrList) ? typeOrList : room.find(typeOrList);
      if (o && o.filter) list = list.filter(o.filter);
      return list;
    }

    findInRange(typeOrList, range, o) {
      return this._list(typeOrList, o).filter((x) => this.inRangeTo(x, range));
    }

    findClosestByRange(typeOrList, o) {
      let best = null;
      let bestR = Infinity;
      this._list(typeOrList, o).forEach((x) => {
        const r = this.getRangeTo(x);
        if (r < bestR) {
          bestR = r;
          best = x;
        }
      });
      return best;
    }

    findClosestByPath(typeOrList, o) {
      return this.findClosestByRange(typeOrList, o);
    }

    lookFor(type) {
      return world.rooms[this.roomName].lookForAt(type, this.x, this.y);
    }
  }
  global.RoomPosition = RoomPosition;

  class CostMatrix {
    constructor() { this._bits = new Uint8Array(2500); }
    set(x, y, v) { this._bits[y * 50 + x] = v; }
    get(x, y) { return this._bits[y * 50 + x]; }
    clone() { const m = new CostMatrix(); m._bits.set(this._bits); return m; }
  }

  global.PathFinder = {
    CostMatrix,
    search(origin, goals, o) {
      const list = Array.isArray(goals) ? goals : [goals];
      const goal = list[0].pos ? list[0] : { pos: list[0], range: 0 };
      if (o && o.roomCallback) o.roomCallback(origin.roomName);
      const path = [];
      let cur = { x: origin.x, y: origin.y };
      for (let i = 0; i < 100; i++) {
        const r = Math.max(Math.abs(goal.pos.x - cur.x), Math.abs(goal.pos.y - cur.y));
        if (o && o.flee ? r >= goal.range : r <= goal.range) break;
        const sx = Math.sign(goal.pos.x - cur.x) * (o && o.flee ? -1 : 1);
        const sy = Math.sign(goal.pos.y - cur.y) * (o && o.flee ? -1 : 1);
        cur = { x: Math.max(1, Math.min(48, cur.x + sx)), y: Math.max(1, Math.min(48, cur.y + sy)) };
        path.push(new RoomPosition(cur.x, cur.y, origin.roomName));
      }
      return { path, ops: path.length, cost: path.length, incomplete: false };
    },
  };

  const visual = { text() {}, circle() {}, poly() {}, line() {}, rect() {} };

  class Room {
    constructor(name, terrainFn) {
      this.name = name;
      this._terrain = terrainFn;
      this.visual = visual;
      world.rooms[name] = this;
    }

    get memory() {
      if (!Memory.rooms[this.name]) Memory.rooms[this.name] = {};
      return Memory.rooms[this.name];
    }

    _objects() {
      return Object.values(world.objects).filter((o) => o.pos.roomName === this.name && !o._dead);
    }

    _structures() {
      return this._objects().filter((o) => o.structureType && !o._kind);
    }

    get storage() { return this._structures().find((o) => o.structureType === 'storage'); }
    get terminal() { return this._structures().find((o) => o.structureType === 'terminal'); }
    get controller() { return this._structures().find((o) => o.structureType === 'controller'); }

    get energyAvailable() {
      return this._structures().filter((o) => o.structureType === 'spawn' || o.structureType === 'extension')
        .reduce((n, s) => n + (s.store.energy || 0), 0);
    }

    get energyCapacityAvailable() {
      return this._structures().filter((o) => o.structureType === 'spawn' || o.structureType === 'extension')
        .reduce((n, s) => n + s.store.getCapacity('energy'), 0);
    }

    getTerrain() {
      return { get: (x, y) => this._terrain(x, y) };
    }

    find(type, o) {
      const all = this._objects();
      let list;
      switch (type) {
        case C.FIND_SOURCES: list = all.filter((x) => x._kind === 'source'); break;
        case C.FIND_SOURCES_ACTIVE: list = all.filter((x) => x._kind === 'source' && x.energy > 0); break;
        case C.FIND_MINERALS: list = all.filter((x) => x._kind === 'mineral'); break;
        case C.FIND_STRUCTURES: list = this._structures(); break;
        case C.FIND_MY_STRUCTURES: list = this._structures().filter((x) => x.my); break;
        case C.FIND_HOSTILE_STRUCTURES: list = this._structures().filter((x) => x.my === false); break;
        case C.FIND_MY_SPAWNS: list = this._structures().filter((x) => x.structureType === 'spawn' && x.my); break;
        case C.FIND_CREEPS: list = all.filter((x) => x._kind === 'creep'); break;
        case C.FIND_MY_CREEPS: list = all.filter((x) => x._kind === 'creep' && x.my); break;
        case C.FIND_HOSTILE_CREEPS: list = all.filter((x) => x._kind === 'creep' && !x.my); break;
        case C.FIND_CONSTRUCTION_SITES:
        case C.FIND_MY_CONSTRUCTION_SITES: list = all.filter((x) => x._kind === 'site'); break;
        case C.FIND_DROPPED_RESOURCES: list = all.filter((x) => x._kind === 'resource'); break;
        case C.FIND_FLAGS: list = all.filter((x) => x._kind === 'flag'); break;
        default: list = [];
      }
      return o && o.filter ? list.filter(o.filter) : list;
    }

    lookForAt(type, a, b) {
      const p = typeof a === 'number' ? { x: a, y: b } : (a.pos || a);
      const here = this._objects().filter((o) => o.pos.x === p.x && o.pos.y === p.y);
      switch (type) {
        case C.LOOK_CREEPS: return here.filter((o) => o._kind === 'creep');
        case C.LOOK_STRUCTURES: return here.filter((o) => o.structureType && !o._kind);
        case C.LOOK_CONSTRUCTION_SITES: return here.filter((o) => o._kind === 'site');
        case C.LOOK_FLAGS: return here.filter((o) => o._kind === 'flag');
        default: return [];
      }
    }

    lookForAtArea() { return []; }

    findExitTo() { return C.FIND_EXIT_TOP; }

    createConstructionSite(a, b, c) {
      let x = a;
      let y = b;
      let type = c;
      if (typeof a === 'object') {
        x = a.x; y = a.y; type = b;
      }
      if (this._terrain(x, y) === C.TERRAIN_MASK_WALL && type !== 'road') return C.ERR_INVALID_TARGET;
      const here = this.lookForAt(C.LOOK_STRUCTURES, x, y);
      if (this.lookForAt(C.LOOK_CONSTRUCTION_SITES, x, y).length) return C.ERR_INVALID_TARGET;
      if (here.some((s) => s.structureType === type)) return C.ERR_INVALID_TARGET;
      if (type !== 'rampart' && here.some((s) => s.structureType !== 'road' && s.structureType !== 'rampart' &&
          !(s.structureType === 'container' && type === 'road') && !(s.structureType === 'road' && type === 'container'))) {
        return C.ERR_INVALID_TARGET;
      }
      if (type !== 'road' && type !== 'container' && type !== 'rampart' && here.some((s) => s.structureType === 'road')) {
        return C.ERR_INVALID_TARGET;
      }
      const ctrl = this.controller;
      const limit = C.CONTROLLER_STRUCTURES[type][ctrl ? ctrl.level : 0] || 0;
      const existing = this._objects().filter((o) => o.structureType === type || (o._kind === 'site' && o.structureType === type)).length;
      if (existing >= limit) return C.ERR_RCL_NOT_ENOUGH;
      if (Object.keys(Game.constructionSites).length >= 100) return C.ERR_FULL;
      const site = {
        id: id(), _kind: 'site', structureType: type, pos: new RoomPosition(x, y, this.name), my: true, owner: me,
        progress: 0, progressTotal: SITE_COST[type] || 1000,
        get room() { return world.rooms[this.pos.roomName]; },
        remove() { this._dead = true; delete world.objects[this.id]; },
      };
      world.objects[site.id] = site;
      return C.OK;
    }
  }

  function structure(type, roomName, x, y, extra) {
    const s = Object.assign({
      id: id(), structureType: type, pos: new RoomPosition(x, y, roomName), my: true, owner: me,
      hits: HITS[type] || 1000, hitsMax: HITS[type] || 1000, cooldown: 0,
      isActive() { return true; },
    }, extra || {});
    Object.defineProperty(s, 'room', { get() { return world.rooms[s.pos.roomName]; } });
    if (type === 'road' || type === 'container' || type === 'constructedWall') {
      delete s.owner;
      s.my = undefined;
    }
    switch (type) {
      case 'spawn': s.store = makeStore(300, { energy: 300 }, true); s.name = 'Spawn' + s.id; addSpawnApi(s); break;
      case 'extension': s.store = makeStore(50, { energy: 0 }, true); break;
      case 'tower': s.store = makeStore(1000, { energy: 0 }, true); addTowerApi(s); break;
      case 'container': s.store = makeStore(2000, {}); break;
      case 'storage': s.store = makeStore(1000000, { energy: 0 }); break;
      case 'terminal': s.store = makeStore(300000, { energy: 0 }); break;
      case 'link': s.store = makeStore(800, { energy: 0 }, true); s.transferEnergy = (t, n) => { t.store.add('energy', n); s.store.add('energy', -n); return C.OK; }; break;
      default: break;
    }
    world.objects[s.id] = s;
    return s;
  }

  function bodyCost(body) {
    return body.reduce((n, p) => n + C.BODYPART_COST[p], 0);
  }

  function addSpawnApi(spawn) {
    spawn.spawning = null;
    spawn.spawnCreep = function (body, name, o) {
      if (Game.creeps[name] || world.pendingCreeps.some((c) => c.name === name)) return C.ERR_NAME_EXISTS;
      if (this.spawning) return C.ERR_BUSY;
      if (!body.length || body.length > 50) return C.ERR_INVALID_ARGS;
      let cost = bodyCost(body);
      if (this.room.energyAvailable < cost) return C.ERR_NOT_ENOUGH_ENERGY;
      if (o && o.dryRun) return C.OK;
      const fill = this.room.find(C.FIND_MY_STRUCTURES).filter((s) => s.structureType === 'spawn' || s.structureType === 'extension');
      for (const s of fill) {
        const take = Math.min(cost, s.store.energy);
        s.store.add('energy', -take);
        cost -= take;
      }
      const creep = createCreep(name, body, this.pos.x, this.pos.y + 1, this.pos.roomName, me, (o && o.memory) || {});
      creep.spawning = true;
      creep._spawnLeft = body.length * 3;
      this.spawning = { name, needTime: body.length * 3, remainingTime: body.length * 3 };
      world.stats.spawned++;
      return C.OK;
    };
    spawn.recycleCreep = function (creep) {
      if (!this.pos.isNearTo(creep)) return C.ERR_NOT_IN_RANGE;
      killCreep(creep);
      return C.OK;
    };
    spawn.renewCreep = () => C.OK;
  }

  function addTowerApi(t) {
    t.attack = (target) => { t.store.add('energy', -10); damage(target, 300); return C.OK; };
    t.heal = (target) => { t.store.add('energy', -10); target.hits = Math.min(target.hitsMax, target.hits + 200); return C.OK; };
    t.repair = (target) => { t.store.add('energy', -10); target.hits = Math.min(target.hitsMax, target.hits + 400); return C.OK; };
  }

  function damage(target, n) {
    target.hits -= n;
    if (target.hits <= 0) {
      if (target._kind === 'creep') killCreep(target);
      else {
        target._dead = true;
        delete world.objects[target.id];
      }
    }
  }

  function killCreep(c) {
    c._dead = true;
    delete world.objects[c.id];
    delete Game.creeps[c.name];
  }

  function completeSite(site) {
    site._dead = true;
    delete world.objects[site.id];
    const s = structure(site.structureType, site.pos.roomName, site.pos.x, site.pos.y);
    if (s.structureType === 'spawn') Game.spawns[s.name] = s;
    world.stats.built++;
  }

  function createCreep(name, body, x, y, roomName, owner, memory) {
    const c = {
      id: id(), _kind: 'creep', name, pos: new RoomPosition(x, y, roomName), owner, my: owner === me,
      body: body.map((t) => ({ type: t, hits: 100 })), hits: body.length * 100, hitsMax: body.length * 100,
      fatigue: 0, ticksToLive: 1500, spawning: false,
      store: makeStore(body.filter((p) => p === 'carry').length * 50, {}),
      saying: null,
    };
    Object.defineProperty(c, 'room', { get() { return world.rooms[c.pos.roomName]; } });
    if (c.my) {
      Memory.creeps[name] = memory;
      Object.defineProperty(c, 'memory', {
        get() { return Memory.creeps[name] || (Memory.creeps[name] = {}); },
        set(v) { Memory.creeps[name] = v; },
      });
    } else {
      c.memory = {};
    }
    const work = () => c.body.filter((p) => p.type === 'work').length;
    const inRange = (t, r) => t && c.pos.inRangeTo(t, r);
    const useEnergy = (n) => { const u = Math.min(n, c.store.energy || 0); c.store.add('energy', -u); return u; };
    const check = (t) => { if (!t || !t.pos) throw new Error('invalid target passed to creep action: ' + JSON.stringify(t)); };

    Object.assign(c, {
      getActiveBodyparts: (t) => c.body.filter((p) => p.type === t && p.hits > 0).length,
      say() { return C.OK; },
      suicide() { killCreep(c); return C.OK; },
      move(dir) {
        if (typeof dir === 'object') dir = c.pos.getDirectionTo(dir);
        const d = DIRS[dir];
        if (!d) return C.ERR_INVALID_ARGS;
        const nx = c.pos.x + d[0];
        const ny = c.pos.y + d[1];
        if (nx < 0 || ny < 0 || nx > 49 || ny > 49) return C.ERR_INVALID_ARGS;
        if (c.room._terrain(nx, ny) === C.TERRAIN_MASK_WALL) return C.OK;
        const blocked = c.room.lookForAt(C.LOOK_STRUCTURES, nx, ny).some((s) => C.OBSTACLE_OBJECT_TYPES.includes(s.structureType));
        if (blocked) return C.OK;
        c.pos = new RoomPosition(nx, ny, c.pos.roomName);
        return C.OK;
      },
      moveTo(a, b, o) {
        const target = typeof a === 'number' ? new RoomPosition(a, b, c.pos.roomName) : (a.pos || a);
        const opt = (typeof a === 'number' ? o : b) || {};
        if (!target || target.x === undefined) throw new Error('moveTo without target');
        if (opt.costCallback) opt.costCallback(c.pos.roomName, new CostMatrix());
        if (target.roomName !== c.pos.roomName) return C.OK; // single-room simulation
        const range = opt.range || 0;
        if (c.pos.getRangeTo(target) <= range) return C.OK;
        // try direct direction then its neighbours
        const dir = c.pos.getDirectionTo(target);
        for (const d of [dir, (dir % 8) + 1, ((dir + 6) % 8) + 1]) {
          const before = c.pos;
          c.move(d);
          if (c.pos !== before) break;
        }
        return C.OK;
      },
      harvest(src) {
        check(src);
        if (!inRange(src, 1)) return C.ERR_NOT_IN_RANGE;
        if (src._kind === 'mineral') {
          const n = work();
          if (c.store.getCapacity() > 0) c.store.add(src.mineralType, Math.min(n, c.store.getFreeCapacity()));
          return C.OK;
        }
        if (src.energy <= 0) return C.ERR_NOT_ENOUGH_RESOURCES;
        const n = Math.min(work() * 2, src.energy);
        src.energy -= n;
        const fit = Math.min(n, c.store.getFreeCapacity());
        c.store.add('energy', fit);
        if (n - fit > 0) dropAt(c.pos, n - fit);
        world.stats.harvested += n;
        return C.OK;
      },
      transfer(t, res, amount) {
        check(t);
        if (!inRange(t, 1)) return C.ERR_NOT_IN_RANGE;
        const have = c.store[res] || 0;
        if (!have) return C.ERR_NOT_ENOUGH_RESOURCES;
        const free = t.store.getFreeCapacity(res);
        if (free === null || free <= 0) return C.ERR_FULL;
        const n = Math.min(amount || have, have, free);
        c.store.add(res, -n);
        t.store.add(res, n);
        return C.OK;
      },
      withdraw(t, res, amount) {
        check(t);
        if (!inRange(t, 1)) return C.ERR_NOT_IN_RANGE;
        const have = t.store[res] || 0;
        if (!have) return C.ERR_NOT_ENOUGH_RESOURCES;
        const free = c.store.getFreeCapacity();
        if (free <= 0) return C.ERR_FULL;
        const n = Math.min(amount || have, have, free);
        t.store.add(res, -n);
        c.store.add(res, n);
        return C.OK;
      },
      pickup(r) {
        check(r);
        if (!inRange(r, 1)) return C.ERR_NOT_IN_RANGE;
        const n = Math.min(r.amount, c.store.getFreeCapacity());
        if (n <= 0) return C.ERR_FULL;
        r.amount -= n;
        c.store.add(r.resourceType, n);
        if (r.amount <= 0) { r._dead = true; delete world.objects[r.id]; }
        return C.OK;
      },
      drop(res, amount) {
        const n = amount || c.store[res] || 0;
        c.store.add(res, -n);
        if (res === 'energy') dropAt(c.pos, n);
        return C.OK;
      },
      build(site) {
        check(site);
        if (site._dead) return C.ERR_INVALID_TARGET;
        if (!inRange(site, 3)) return C.ERR_NOT_IN_RANGE;
        if (!c.store.energy) return C.ERR_NOT_ENOUGH_RESOURCES;
        const n = useEnergy(Math.min(work() * 5, site.progressTotal - site.progress));
        site.progress += n;
        if (site.progress >= site.progressTotal) completeSite(site);
        return C.OK;
      },
      repair(t) {
        check(t);
        if (!inRange(t, 3)) return C.ERR_NOT_IN_RANGE;
        if (!c.store.energy) return C.ERR_NOT_ENOUGH_RESOURCES;
        const n = useEnergy(work());
        t.hits = Math.min(t.hitsMax, t.hits + n * 100);
        return C.OK;
      },
      upgradeController(ctrl) {
        check(ctrl);
        if (!inRange(ctrl, 3)) return C.ERR_NOT_IN_RANGE;
        if (!c.store.energy) return C.ERR_NOT_ENOUGH_RESOURCES;
        const n = useEnergy(work());
        ctrl.progress += n;
        world.stats.upgraded += n;
        if (ctrl.level < 8 && ctrl.progress >= ctrl.progressTotal) {
          ctrl.level++;
          ctrl.progress = 0;
          ctrl.progressTotal = opts.levels[ctrl.level] || 1e9;
        }
        return C.OK;
      },
      signController(ctrl) { check(ctrl); return inRange(ctrl, 1) ? C.OK : C.ERR_NOT_IN_RANGE; },
      claimController(ctrl) { check(ctrl); return inRange(ctrl, 1) ? C.OK : C.ERR_NOT_IN_RANGE; },
      reserveController(ctrl) { check(ctrl); return inRange(ctrl, 1) ? C.OK : C.ERR_NOT_IN_RANGE; },
      attackController(ctrl) { check(ctrl); return inRange(ctrl, 1) ? C.OK : C.ERR_NOT_IN_RANGE; },
      attack(t) { check(t); if (!inRange(t, 1)) return C.ERR_NOT_IN_RANGE; damage(t, 30 * c.getActiveBodyparts('attack')); return C.OK; },
      rangedAttack(t) { check(t); if (!inRange(t, 3)) return C.ERR_NOT_IN_RANGE; damage(t, 10 * c.getActiveBodyparts('ranged_attack')); return C.OK; },
      rangedMassAttack() { return C.OK; },
      heal(t) { check(t); return inRange(t, 1) ? C.OK : C.ERR_NOT_IN_RANGE; },
      rangedHeal(t) { check(t); return inRange(t, 3) ? C.OK : C.ERR_NOT_IN_RANGE; },
      dismantle(t) { check(t); return inRange(t, 1) ? C.OK : C.ERR_NOT_IN_RANGE; },
    });
    world.objects[c.id] = c;
    world.pendingCreeps.push(c);
    return c;
  }

  function dropAt(pos, n) {
    const room = world.rooms[pos.roomName];
    const existing = room.find(C.FIND_DROPPED_RESOURCES).find((r) => r.pos.isEqualTo(pos));
    const container = room.lookForAt(C.LOOK_STRUCTURES, pos.x, pos.y).find((s) => s.structureType === 'container');
    if (container) {
      const fit = Math.min(n, container.store.getFreeCapacity());
      container.store.add('energy', fit);
      n -= fit;
      if (n <= 0) return;
    }
    if (existing) {
      existing.amount += n;
      return;
    }
    const r = { id: id(), _kind: 'resource', resourceType: 'energy', amount: n, pos: new RoomPosition(pos.x, pos.y, pos.roomName) };
    world.objects[r.id] = r;
  }

  global.Room = Room;
  Room.deserializePath = () => [];

  global.Game = {
    time: 1,
    creeps: {},
    spawns: {},
    rooms: world.rooms,
    flags: {},
    get constructionSites() {
      const out = {};
      Object.values(world.objects).filter((o) => o._kind === 'site' && !o._dead).forEach((s) => { out[s.id] = s; });
      return out;
    },
    gcl: { level: 1, progress: 0, progressTotal: 1000000 },
    cpu: { limit: 20, tickLimit: 500, bucket: 10000, getUsed: () => 3, generatePixel: () => { world.stats.pixels++; return C.OK; } },
    shard: { name: 'shard3' },
    market: { calcTransactionCost: () => 1000 },
    map: {
      findRoute: (a, b) => [{ exit: 1, room: b }],
      getRoomLinearDistance: () => 1,
      describeExits: () => ({}),
      getRoomStatus: () => ({ status: 'normal' }),
    },
    getObjectById: (oid) => {
      const o = world.objects[oid];
      return o && !o._dead ? o : null;
    },
  };

  world.stats = { spawned: 0, built: 0, harvested: 0, upgraded: 0, pixels: 0 };

  world.addRoom = function (name, terrainFn) {
    return new Room(name, terrainFn);
  };
  world.addSource = function (roomName, x, y) {
    const s = { id: id(), _kind: 'source', energy: 3000, energyCapacity: 3000, ticksToRegeneration: 300, pos: new RoomPosition(x, y, roomName) };
    Object.defineProperty(s, 'room', { get() { return world.rooms[roomName]; } });
    world.objects[s.id] = s;
    return s;
  };
  world.addMineral = function (roomName, x, y) {
    const m = { id: id(), _kind: 'mineral', mineralType: 'H', mineralAmount: 50000, pos: new RoomPosition(x, y, roomName) };
    world.objects[m.id] = m;
    return m;
  };
  world.addController = function (roomName, x, y, level) {
    return structure('controller', roomName, x, y, {
      level, progress: 0, progressTotal: opts.levels[level], ticksToDowngrade: 20000,
      safeModeAvailable: 1, safeMode: undefined, safeModeCooldown: undefined, upgradeBlocked: undefined,
      activateSafeMode() { this.safeMode = 20000; world.stats.safeMode = true; return C.OK; },
      reservation: undefined, sign: undefined, hits: undefined, hitsMax: undefined,
    });
  };
  world.addStructure = structure;
  world.addSpawn = function (roomName, x, y) {
    const s = structure('spawn', roomName, x, y);
    Game.spawns[s.name] = s;
    return s;
  };
  world.addCreep = function (name, body, x, y, roomName, owner, memory) {
    const c = createCreep(name, body, x, y, roomName, owner || me, memory || {});
    world.pendingCreeps = world.pendingCreeps.filter((p) => p !== c);
    if (c.my) Game.creeps[name] = c;
    return c;
  };
  world.addFlag = function (name, roomName, x, y) {
    const f = { id: id(), _kind: 'flag', name, pos: new RoomPosition(x, y, roomName), color: 1, secondaryColor: 1 };
    Object.defineProperty(f, 'room', { get() { return world.rooms[roomName]; } });
    Object.defineProperty(f, 'memory', { get() { return Memory.flags[name] || (Memory.flags[name] = {}); } });
    f.remove = () => { delete Game.flags[name]; f._dead = true; delete world.objects[f.id]; return C.OK; };
    world.objects[f.id] = f;
    Game.flags[name] = f;
    return f;
  };

  /** End-of-tick processing. */
  world.tick = function () {
    Game.time++;
    world.pendingCreeps.forEach((c) => { if (!c._dead) Game.creeps[c.name] = c; });
    world.pendingCreeps = [];
    Object.values(Game.creeps).forEach((c) => {
      if (c.spawning) {
        c._spawnLeft--;
        if (c._spawnLeft <= 0) c.spawning = false;
        return;
      }
      c.ticksToLive--;
      if (c.ticksToLive <= 0) killCreep(c);
    });
    Object.values(Game.spawns).forEach((s) => {
      if (s.spawning) {
        s.spawning.remainingTime--;
        if (s.spawning.remainingTime <= 0) s.spawning = null;
      }
      if (s.room.energyAvailable < 300 && s.store.energy < 300) s.store.add('energy', 1);
    });
    if (opts.refill) {
      Object.values(world.rooms).forEach((r) => r._structures()
        .filter((o) => o.structureType === 'spawn' || o.structureType === 'extension')
        .forEach((o) => o.store.add('energy', o.store.getFreeCapacity('energy'))));
    }
    if (Game.time % 300 === 0) {
      Object.values(world.objects).filter((o) => o._kind === 'source').forEach((s) => { s.energy = 3000; });
    }
  };

  return world;
}

module.exports = { createWorld, makeStore };
