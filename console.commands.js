'use strict';

/**
 * Команды консоли (вводятся во вкладке Console игры). help() — список.
 */
const config = require('config');
const utils = require('utils');
const stats = require('stats');
const roles = require('roles');
const colony = require('colony');
const rooms = require('rooms');

const HELP = [
  'help()                          — эта справка',
  'stats()                         — отчёт по всем комнатам',
  'roomInfo("W1N1")                — подробности по комнате',
  'spawnCreep("W1N1", "builder")   — заказать крипа вне очереди (3-й аргумент — доп. memory)',
  'killRole("W1N1", "upgrader")    — убить всех крипов роли в комнате',
  'recycleCreep("имя")             — отправить крипа на переработку',
  'resetRoom("W1N1")               — сбросить план и кэш комнаты (пересчитаются)',
  'clearSites("W1N1")              — удалить все строительные площадки комнаты',
  'showPlan("W1N1")                — показать план базы на 20 тиков',
  'setToggle("planner", false)     — переключатель (null — вернуть значение из config.js)',
  'toggles()                       — текущие переключатели',
  'directives()                    — флаги/цели экспансии по домашним комнатам',
  'roleList()                      — список ролей',
].join('\n');

global.help = function () { return HELP; };

global.stats = function () { return stats.report(); };

global.roomInfo = function (name) {
  const room = Game.rooms[name];
  if (!room) return 'Нет видимости комнаты ' + name;
  const m = Memory.rooms[name] || {};
  const out = [stats.roomLine(room)];
  out.push('Очередь спавна: ' + JSON.stringify(m.queue || []));
  out.push('Угроза: ' + JSON.stringify(m.defense || {}));
  out.push('Источники: ' + JSON.stringify(m.srcs || {}));
  out.push('Контроллер: ' + JSON.stringify(m.ctrl || {}) + ' storageLink: ' + m.sLink + ' linkMode: ' + m.linkMode);
  out.push('Директивы: ' + JSON.stringify(colony.forHome(name)));
  return out.join('\n');
};

global.spawnCreep = function (roomName, role, memory) {
  if (!roles.ROLES[role]) return 'Неизвестная роль ' + role + '. Есть: ' + roles.names.join(', ');
  const room = Game.rooms[roomName];
  if (!room || !room.controller || !room.controller.my) return 'Комната ' + roomName + ' не ваша';
  const m = rooms.mem(roomName);
  if (!m.spawnQueue) m.spawnQueue = [];
  m.spawnQueue.push({ role: role, memory: memory || {} });
  return 'В очереди: ' + m.spawnQueue.map(function (q) { return q.role; }).join(', ');
};

global.killRole = function (roomName, role) {
  let n = 0;
  for (const name in Game.creeps) {
    const c = Game.creeps[name];
    if (c.memory.role === role && c.memory.home === roomName) {
      c.suicide();
      n++;
    }
  }
  return 'Убито: ' + n;
};

global.recycleCreep = function (name) {
  const c = Game.creeps[name];
  if (!c) return 'Нет крипа ' + name;
  c.memory.recycle = true;
  return name + ' идёт на переработку';
};

global.resetRoom = function (name) {
  const m = Memory.rooms && Memory.rooms[name];
  if (!m) return 'Нет памяти комнаты ' + name;
  ['plan', 'planAt', 'planRcl', 'infoAt', 'sig', 'srcs', 'ctrl', 'sLink', 'min', 'wait', 'queue']
    .forEach(function (key) { delete m[key]; });
  return 'Комната ' + name + ' сброшена — план и привязки пересчитаются.';
};

global.clearSites = function (name) {
  let n = 0;
  for (const id in Game.constructionSites) {
    const s = Game.constructionSites[id];
    if (s.pos.roomName === name) {
      s.remove();
      n++;
    }
  }
  return 'Удалено площадок: ' + n;
};

global.showPlan = function (name) {
  rooms.mem(name).showPlanUntil = Game.time + 20;
  return 'План ' + name + ' будет показан 20 тиков';
};

global.setToggle = function (name, value) {
  if (!(name in config.toggles)) return 'Нет переключателя ' + name + '. Есть: ' + Object.keys(config.toggles).join(', ');
  if (!Memory.settings) Memory.settings = {};
  if (value === null || value === undefined) delete Memory.settings[name];
  else Memory.settings[name] = !!value;
  return name + ' = ' + config.isOn(name);
};

global.toggles = function () {
  return Object.keys(config.toggles).map(function (k) { return k + ': ' + config.isOn(k); }).join('\n');
};

global.directives = function () {
  return JSON.stringify(colony.directives().byHome, null, 1);
};

global.roleList = function () {
  return roles.names.join(', ');
};

module.exports = { installed: true, log: utils.log };
