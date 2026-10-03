'use strict';

// Installs the Screeps constants as globals before every test file.
const C = require('./mocks/constants');

Object.keys(C).forEach(function (k) { global[k] = C[k]; });
global.Memory = {};
global.Game = { time: 1, creeps: {}, rooms: {}, spawns: {}, flags: {}, cpu: { getUsed: () => 0, limit: 20, tickLimit: 500, bucket: 10000 } };
