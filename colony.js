'use strict';

/**
 * Директивы колонии из флагов и config.remotes.
 *
 * Флаги (регистр не важен, после префикса — любое продолжение):
 *   claim...   — захватить комнату (claimer + пионеры строят спавн)
 *   reserve... — только резервировать контроллер
 *   remote...  — удалённая добыча (резерв + майнеры + перевозчики)
 *   attack...  — отправить отряд зачистить комнату
 *   avoid...   — не прокладывать маршруты через комнату
 *   spawn...   — место для первого спавна в захваченной комнате
 *   rally...   — точка сбора/ожидания свободных крипов в комнате
 * Домашнюю комнату можно указать суффиксом "@ИМЯ": например remote1@W5N8.
 */
const config = require('config');
const utils = require('utils');
const cache = require('cache');

const TYPES = ['claim', 'reserve', 'remote', 'attack', 'avoid'];

function flagType(name) {
  const lower = name.toLowerCase();
  for (let i = 0; i < TYPES.length; i++) {
    if (lower.indexOf(TYPES[i]) === 0) return TYPES[i];
  }
  return null;
}

/** Домашняя комната из имени флага ("remote1@W5N8") или null. */
function explicitHome(name) {
  const at = name.lastIndexOf('@');
  return at === -1 ? null : name.slice(at + 1);
}

function hasSpawn(room) {
  return cache.myStructures(room, STRUCTURE_SPAWN).length > 0;
}

/** Ближайшая подходящая домашняя комната. */
function chooseHome(targetRoom, minRcl, minCapacity, explicit) {
  if (explicit) {
    const r = Game.rooms[explicit];
    if (r && r.controller && r.controller.my && hasSpawn(r)) return explicit;
  }
  let best = null;
  let bestDist = Infinity;
  const mine = utils.myRooms();
  for (let i = 0; i < mine.length; i++) {
    const r = mine[i];
    if (r.name === targetRoom) continue;
    if (r.controller.level < minRcl || r.energyCapacityAvailable < minCapacity || !hasSpawn(r)) continue;
    const d = utils.roomDistance(r.name, targetRoom);
    if (d < bestDist) {
      bestDist = d;
      best = r.name;
    }
  }
  return best;
}

function emptyHome() {
  return { remotes: [], reserves: [], claims: [], attacks: [] };
}

/** Все директивы, сгруппированные по домашним комнатам. Пересчитывается раз в тик. */
function directives() {
  return cache.perTick('directives', function () {
    const byHome = {};
    const avoid = {};
    const get = function (home) { return byHome[home] || (byHome[home] = emptyHome()); };

    for (const name in Game.flags) {
      const flag = Game.flags[name];
      const type = flagType(name);
      if (!type) continue;
      const roomName = flag.pos.roomName;
      if (type === 'avoid') {
        avoid[roomName] = true;
        continue;
      }
      const explicit = explicitHome(name);
      if (type === 'claim') {
        const home = chooseHome(roomName, 3, 650, explicit);
        if (home) get(home).claims.push({ room: roomName, flag: name });
      } else if (type === 'attack') {
        const home = chooseHome(roomName, 3, 550, explicit);
        if (home) get(home).attacks.push({ room: roomName, flag: name });
      } else if (type === 'reserve') {
        const home = chooseHome(roomName, config.remote.minRcl, 650, explicit);
        if (home) get(home).reserves.push(roomName);
      } else if (type === 'remote' && config.isOn('remoteMining')) {
        const home = chooseHome(roomName, config.remote.minRcl, 550, explicit);
        if (home && get(home).remotes.indexOf(roomName) === -1) get(home).remotes.push(roomName);
      }
    }

    if (config.isOn('remoteMining')) {
      for (const home in config.remotes) {
        const r = Game.rooms[home];
        if (!r || !r.controller || !r.controller.my || r.controller.level < config.remote.minRcl) continue;
        const list = config.remotes[home] || [];
        for (let i = 0; i < list.length; i++) {
          if (get(home).remotes.indexOf(list[i]) === -1) get(home).remotes.push(list[i]);
        }
      }
    }
    for (const home in byHome) {
      byHome[home].remotes = byHome[home].remotes.slice(0, config.remote.maxRoomsPerHome);
    }
    return { byHome: byHome, avoid: avoid };
  });
}

function forHome(roomName) {
  return directives().byHome[roomName] || emptyHome();
}

/** Комнаты, о которых нужно помнить (для очистки памяти). */
function keepRooms() {
  const keep = {};
  const d = directives();
  for (const home in d.byHome) {
    const h = d.byHome[home];
    keep[home] = true;
    h.remotes.forEach(function (r) { keep[r] = true; });
    h.reserves.forEach(function (r) { keep[r] = true; });
    h.claims.forEach(function (c) { keep[c.room] = true; });
    h.attacks.forEach(function (a) { keep[a.room] = true; });
  }
  for (const r in d.avoid) keep[r] = true;
  return keep;
}

/**
 * Обслуживание флагов: отметки avoid в памяти комнат, автоудаление
 * выполненных claim/attack флагов.
 */
function maintain() {
  const d = directives();
  if (Game.time % 10 === 0 && Memory.rooms) {
    for (const name in Memory.rooms) {
      const m = Memory.rooms[name];
      if (d.avoid[name]) m.avoid = true;
      else if (m.avoid) delete m.avoid;
    }
    for (const name in d.avoid) {
      if (!Memory.rooms[name]) Memory.rooms[name] = { avoid: true };
    }
  }
  for (const name in Game.flags) {
    const flag = Game.flags[name];
    const type = flagType(name);
    const room = flag.room;
    if (!room) continue;
    if (type === 'claim' && room.controller && room.controller.my && hasSpawn(room)) {
      utils.log('Колония ' + room.name + ' основана, флаг ' + name + ' снят.');
      flag.remove();
    } else if (type === 'attack') {
      const enemies = cache.hostiles(room).filter(function (h) {
        return !(h.owner && h.owner.username === 'Source Keeper');
      });
      const structures = cache.find(room, FIND_HOSTILE_STRUCTURES).filter(function (s) {
        return s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_KEEPER_LAIR &&
          s.structureType !== STRUCTURE_POWER_BANK;
      });
      const fm = flag.memory;
      if (!enemies.length && !structures.length) {
        fm.clear = (fm.clear || 0) + 1;
        if (fm.clear > 20) {
          utils.log('Комната ' + room.name + ' зачищена, флаг ' + name + ' снят.');
          flag.remove();
        }
      } else {
        fm.clear = 0;
      }
    }
  }
  // Память несуществующих флагов
  if (Memory.flags && Game.time % 100 === 0) {
    for (const name in Memory.flags) {
      if (!Game.flags[name]) delete Memory.flags[name];
    }
  }
}

module.exports = {
  flagType: flagType,
  explicitHome: explicitHome,
  directives: directives,
  forHome: forHome,
  keepRooms: keepRooms,
  maintain: maintain,
  chooseHome: chooseHome,
};
