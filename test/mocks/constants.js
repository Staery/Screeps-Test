'use strict';

// Hand-written copies of the Screeps constants used by the code (real values).
const C = {
  OK: 0, ERR_NOT_OWNER: -1, ERR_NO_PATH: -2, ERR_NAME_EXISTS: -3, ERR_BUSY: -4, ERR_NOT_FOUND: -5,
  ERR_NOT_ENOUGH_ENERGY: -6, ERR_NOT_ENOUGH_RESOURCES: -6, ERR_INVALID_TARGET: -7, ERR_FULL: -8,
  ERR_NOT_IN_RANGE: -9, ERR_INVALID_ARGS: -10, ERR_TIRED: -11, ERR_NO_BODYPART: -12,
  ERR_RCL_NOT_ENOUGH: -14, ERR_GCL_NOT_ENOUGH: -15,

  FIND_EXIT_TOP: 1, FIND_EXIT_RIGHT: 3, FIND_EXIT_BOTTOM: 5, FIND_EXIT_LEFT: 7, FIND_EXIT: 10,
  FIND_CREEPS: 101, FIND_MY_CREEPS: 102, FIND_HOSTILE_CREEPS: 103, FIND_SOURCES_ACTIVE: 104, FIND_SOURCES: 105,
  FIND_DROPPED_RESOURCES: 106, FIND_STRUCTURES: 107, FIND_MY_STRUCTURES: 108, FIND_HOSTILE_STRUCTURES: 109,
  FIND_FLAGS: 110, FIND_CONSTRUCTION_SITES: 111, FIND_MY_SPAWNS: 112, FIND_HOSTILE_SPAWNS: 113,
  FIND_MY_CONSTRUCTION_SITES: 114, FIND_HOSTILE_CONSTRUCTION_SITES: 115, FIND_MINERALS: 116, FIND_NUKES: 117,
  FIND_TOMBSTONES: 118, FIND_POWER_CREEPS: 119, FIND_MY_POWER_CREEPS: 120, FIND_HOSTILE_POWER_CREEPS: 121,
  FIND_DEPOSITS: 122, FIND_RUINS: 123,

  TOP: 1, TOP_RIGHT: 2, RIGHT: 3, BOTTOM_RIGHT: 4, BOTTOM: 5, BOTTOM_LEFT: 6, LEFT: 7, TOP_LEFT: 8,

  LOOK_CREEPS: 'creep', LOOK_ENERGY: 'energy', LOOK_RESOURCES: 'resource', LOOK_SOURCES: 'source',
  LOOK_MINERALS: 'mineral', LOOK_STRUCTURES: 'structure', LOOK_FLAGS: 'flag',
  LOOK_CONSTRUCTION_SITES: 'constructionSite', LOOK_TERRAIN: 'terrain',

  MOVE: 'move', WORK: 'work', CARRY: 'carry', ATTACK: 'attack', RANGED_ATTACK: 'ranged_attack',
  TOUGH: 'tough', HEAL: 'heal', CLAIM: 'claim',
  BODYPART_COST: { move: 50, work: 100, attack: 80, carry: 50, heal: 250, ranged_attack: 150, tough: 10, claim: 600 },
  MAX_CREEP_SIZE: 50, CREEP_SPAWN_TIME: 3, CREEP_LIFE_TIME: 1500, CREEP_CLAIM_LIFE_TIME: 600,

  STRUCTURE_SPAWN: 'spawn', STRUCTURE_EXTENSION: 'extension', STRUCTURE_ROAD: 'road',
  STRUCTURE_WALL: 'constructedWall', STRUCTURE_RAMPART: 'rampart', STRUCTURE_KEEPER_LAIR: 'keeperLair',
  STRUCTURE_PORTAL: 'portal', STRUCTURE_CONTROLLER: 'controller', STRUCTURE_LINK: 'link',
  STRUCTURE_STORAGE: 'storage', STRUCTURE_TOWER: 'tower', STRUCTURE_OBSERVER: 'observer',
  STRUCTURE_POWER_BANK: 'powerBank', STRUCTURE_POWER_SPAWN: 'powerSpawn', STRUCTURE_EXTRACTOR: 'extractor',
  STRUCTURE_LAB: 'lab', STRUCTURE_TERMINAL: 'terminal', STRUCTURE_CONTAINER: 'container',
  STRUCTURE_NUKER: 'nuker', STRUCTURE_FACTORY: 'factory', STRUCTURE_INVADER_CORE: 'invaderCore',

  RESOURCE_ENERGY: 'energy',
  TERRAIN_MASK_WALL: 1, TERRAIN_MASK_SWAMP: 2,

  TOWER_POWER_ATTACK: 600, TOWER_POWER_HEAL: 400, TOWER_POWER_REPAIR: 800,
  TOWER_OPTIMAL_RANGE: 5, TOWER_FALLOFF_RANGE: 20, TOWER_FALLOFF: 0.75, TOWER_CAPACITY: 1000,
  PIXEL_CPU_COST: 10000,
  EXTENSION_ENERGY_CAPACITY: { 0: 50, 1: 50, 2: 50, 3: 50, 4: 50, 5: 50, 6: 50, 7: 100, 8: 200 },
  CONTROLLER_LEVELS: { 1: 200, 2: 45000, 3: 135000, 4: 405000, 5: 1215000, 6: 3645000, 7: 10935000 },

  OBSTACLE_OBJECT_TYPES: ['spawn', 'creep', 'powerCreep', 'source', 'mineral', 'deposit', 'controller',
    'constructedWall', 'extension', 'link', 'storage', 'tower', 'observer', 'powerSpawn', 'powerBank', 'lab',
    'terminal', 'nuker', 'factory', 'invaderCore'],

  CONTROLLER_STRUCTURES: {
    spawn: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 3 },
    extension: { 0: 0, 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 },
    link: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3, 7: 4, 8: 6 },
    road: { 0: 2500, 1: 2500, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
    constructedWall: { 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
    rampart: { 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
    storage: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
    tower: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 },
    observer: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
    powerSpawn: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
    extractor: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
    terminal: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
    lab: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 3, 7: 6, 8: 10 },
    container: { 0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5 },
    nuker: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
    factory: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 1 },
  },

  BOOSTS: {
    work: { ZD: { dismantle: 2 }, ZD2: { dismantle: 3 }, XZH2O: { dismantle: 4 } },
    attack: { UH: { attack: 2 }, UH2O: { attack: 3 }, XUH2O: { attack: 4 } },
    ranged_attack: { KO: { rangedAttack: 2, rangedMassAttack: 2 }, XKHO2: { rangedAttack: 4, rangedMassAttack: 4 } },
    heal: { LO: { heal: 2, rangedHeal: 2 }, LHO2: { heal: 3, rangedHeal: 3 }, XLHO2: { heal: 4, rangedHeal: 4 } },
    tough: { GO: { damage: 0.7 }, GHO2: { damage: 0.5 }, XGHO2: { damage: 0.3 } },
  },
};

module.exports = C;
