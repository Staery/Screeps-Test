'use strict';

/**
 * Главный цикл колонии.
 *
 * Порядок тика:
 *  1. очистка памяти умерших крипов, флаги;
 *  2. разведка видимых комнат;
 *  3. свои комнаты: оборона → башни → линки → спавн → планировщик;
 *  4. крипы по приоритету ролей (при нехватке CPU второстепенные пропускаются);
 *  5. терминалы, очистка памяти, отчёт, пиксели.
 * Каждая комната и каждый крип выполняются в try/catch: ошибка в одном месте
 * не останавливает остальную колонию.
 */
const config = require('config');
const utils = require('utils');
const rooms = require('rooms');
const roles = require('roles');
const colony = require('colony');
const actions = require('creep.actions');
const defense = require('defense');
const towers = require('structure.tower');
const links = require('structure.link');
const terminal = require('structure.terminal');
const spawnManager = require('spawn.manager');
const planner = require('room.planner');
const stats = require('stats');
require('console.commands');

const warnedRoles = {};

function cleanupCreeps() {
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) delete Memory.creeps[name];
  }
}

function runRoom(room, level) {
  rooms.refreshInfo(room);
  defense.run(room);
  towers.run(room);
  links.run(room);
  spawnManager.run(room);
  if (level === 'ok' && utils.cpuOk(100)) planner.run(room);
  const m = Memory.rooms[room.name];
  if (m && m.showPlanUntil && m.showPlanUntil >= Game.time) planner.visualize(room);
}

function runCreep(creep) {
  const m = creep.memory;
  if (m.recycle) {
    actions.recycle(creep);
    return;
  }
  const role = roles.get(m.role);
  if (!role) {
    if (!warnedRoles[m.role]) {
      warnedRoles[m.role] = true;
      utils.log('Неизвестная роль "' + m.role + '" у ' + creep.name + ' — отправляю на переработку.');
    }
    m.recycle = true;
    return;
  }
  role.run(creep);
}

function runCreeps(level) {
  const groups = [[], [], []];
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (creep.spawning) continue;
    // Крипы старой версии скрипта: проставить дом.
    if (!creep.memory.home) creep.memory.home = creep.room.name;
    if (!creep.memory.role) creep.memory.role = 'harvester';
    const p = roles.priority(creep.memory.role);
    groups[Math.max(0, Math.min(2, p - 1))].push(creep);
  }
  for (let g = 0; g < groups.length; g++) {
    if (level === 'critical' && g > 0) break;
    if (level === 'low' && g > 1) break;
    const list = groups[g];
    for (let i = 0; i < list.length; i++) {
      if (g > 0 && !utils.cpuOk()) return;
      const creep = list[i];
      utils.safe('creep ' + creep.name + ' (' + creep.memory.role + ')', function () { runCreep(creep); });
    }
  }
}

module.exports.loop = function () {
  cleanupCreeps();

  let level = utils.bucketLevel();
  // Bucket мал, но тратим заметно меньше лимита (например, после генерации
  // пикселя) — работаем почти в полном режиме, пропуская только второстепенное.
  const avg = Memory.stats && Memory.stats.cpu ? Memory.stats.cpu : 0;
  if (level === 'critical' && Game.cpu.limit && avg < Game.cpu.limit * 0.7) level = 'low';

  utils.safe('colony', function () { colony.maintain(); });

  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    utils.safe('scan ' + name, function () { rooms.scan(room); });
  }

  const mine = utils.myRooms();
  for (let i = 0; i < mine.length; i++) {
    const room = mine[i];
    utils.safe('room ' + room.name, function () { runRoom(room, level); });
  }

  runCreeps(level);

  if (level === 'ok') utils.safe('terminal', function () { terminal.run(); });

  if (Game.time % 1000 === 0) {
    utils.safe('memory', function () { rooms.cleanup(colony.keepRooms()); });
  }

  utils.safe('stats', function () {
    stats.tick();
    if (config.isOn('report') && Game.time % config.reportInterval === 0) console.log(stats.report());
  });

  // Пиксели: только когда bucket полный и функция существует (на приватных
  // серверах её может не быть).
  if (config.isOn('pixels') && typeof Game.cpu.generatePixel === 'function') {
    const cost = typeof PIXEL_CPU_COST !== 'undefined' ? PIXEL_CPU_COST : 10000;
    if (Game.cpu.bucket >= cost) Game.cpu.generatePixel();
  }
};
