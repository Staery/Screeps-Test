'use strict';

/**
 * Разведчик (одна MOVE-часть): посещает комнаты без данных в памяти
 * (remote/claim-цели), затем обходит окрестности дома, обновляя сведения
 * о владельцах, источниках и угрозах (их собирает rooms.scan).
 */
const movement = require('movement');
const actions = require('creep.actions');
const utils = require('utils');
const config = require('config');

const RANGE = 3; // как далеко от дома разведывать

function roomOk(name, home) {
  if (config.avoidSourceKeeperRooms && utils.isSourceKeeperRoom(name)) return false;
  if (utils.roomDistance(name, home) > RANGE) return false;
  try {
    const st = Game.map.getRoomStatus(name);
    const hs = Game.map.getRoomStatus(home);
    if (st && hs && st.status !== hs.status) return false;
  } catch (e) {
    return true;
  }
  return true;
}

function nextRoom(creep) {
  const m = creep.memory;
  if (m.queue && m.queue.length) return m.queue.shift();
  const exits = Game.map.describeExits(creep.room.name) || {};
  let best = null;
  let oldest = Infinity;
  for (const dir in exits) {
    const name = exits[dir];
    if (!roomOk(name, m.home)) continue;
    const mem = Memory.rooms && Memory.rooms[name];
    const seen = mem && mem.seen ? mem.seen : 0;
    const score = seen + (name === m.prev ? 1000 : 0);
    if (score < oldest) {
      oldest = score;
      best = name;
    }
  }
  return best;
}

function run(creep) {
  const m = creep.memory;
  if (!m.targetRoom || creep.room.name === m.targetRoom && !movement.isEdge(creep.pos)) {
    if (m.targetRoom && creep.room.controller && !creep.room.controller.owner) {
      if (actions.signIfNeeded(creep, creep.room.controller)) return;
    }
    m.prev = creep.room.name;
    m.targetRoom = nextRoom(creep);
    if (!m.targetRoom) {
      actions.park(creep);
      return;
    }
  }
  const r = movement.travelToRoom(creep, m.targetRoom);
  if (r === ERR_NO_PATH) m.targetRoom = null;
}

module.exports = { run: run };
