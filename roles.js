'use strict';

/**
 * Реестр ролей. priority определяет, какие роли работают при нехватке CPU:
 *   1 — жизненно важные (всегда), 2 — обычные, 3 — второстепенные.
 */
const ROLES = {
  harvester: { module: 'role.harvester', priority: 1, short: 'hv' },
  miner: { module: 'role.miner', priority: 1, short: 'mn' },
  hauler: { module: 'role.hauler', priority: 1, short: 'hl' },
  filler: { module: 'role.filler', priority: 1, short: 'fl' },
  defender: { module: 'role.defender', priority: 1, short: 'df' },
  rangedDefender: { module: 'role.rangedDefender', priority: 1, short: 'rd' },
  healer: { module: 'role.healer', priority: 1, short: 'he' },
  upgrader: { module: 'role.upgrader', priority: 2, short: 'up' },
  builder: { module: 'role.builder', priority: 2, short: 'bd' },
  repairer: { module: 'role.repairer', priority: 2, short: 'rp' },
  wallRepairer: { module: 'role.wallRepairer', priority: 2, short: 'wr' },
  claimer: { module: 'role.claimer', priority: 2, short: 'cl' },
  pioneer: { module: 'role.pioneer', priority: 2, short: 'pi' },
  reserver: { module: 'role.reserver', priority: 2, short: 'rs' },
  remoteMiner: { module: 'role.remoteMiner', priority: 2, short: 'rm' },
  remoteHauler: { module: 'role.remoteHauler', priority: 2, short: 'rh' },
  mineralMiner: { module: 'role.mineralMiner', priority: 3, short: 'mm' },
  scout: { module: 'role.scout', priority: 3, short: 'sc' },
};

const loaded = {};

/** Модуль роли (require выполняется лениво и кэшируется). */
function get(role) {
  const def = ROLES[role];
  if (!def) return null;
  if (!loaded[role]) loaded[role] = require(def.module);
  return loaded[role];
}

function priority(role) {
  return ROLES[role] ? ROLES[role].priority : 2;
}

function short(role) {
  return ROLES[role] ? ROLES[role].short : role.slice(0, 2);
}

module.exports = {
  ROLES: ROLES,
  names: Object.keys(ROLES),
  get: get,
  priority: priority,
  short: short,
};
