'use strict';

/**
 * Статистика и отчёт в консоль: средний CPU, bucket, состояние каждой комнаты.
 */
const utils = require('utils');
const cache = require('cache');
const roles = require('roles');

function tick() {
  if (!Memory.stats) Memory.stats = {};
  const used = Game.cpu.getUsed();
  const s = Memory.stats;
  s.cpu = s.cpu === undefined ? used : s.cpu * 0.95 + used * 0.05;
  s.cpu = Math.round(s.cpu * 100) / 100;
}

function k(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

function creepSummary(roomName) {
  const byRole = {};
  for (const name in Game.creeps) {
    const m = Game.creeps[name].memory;
    if (m.home !== roomName) continue;
    byRole[m.role] = (byRole[m.role] || 0) + 1;
  }
  return Object.keys(byRole).sort().map(function (r) { return roles.short(r) + byRole[r]; }).join(' ');
}

function roomLine(room) {
  const c = room.controller;
  const mem = (Memory.rooms && Memory.rooms[room.name]) || {};
  const progress = c.level < 8 ? ' ' + (c.progress / c.progressTotal * 100).toFixed(1) + '%' : '';
  const storage = room.storage ? ' S:' + k(room.storage.store.getUsedCapacity(RESOURCE_ENERGY)) : '';
  const threat = mem.defense && mem.defense.score ? ' THREAT:' + mem.defense.score : '';
  const sites = cache.sites(room).length;
  const queue = mem.queue && mem.queue.length ? ' next:' + mem.queue.slice(0, 3).join(',') : '';
  return room.name + ' RCL' + c.level + progress + ' E:' + room.energyAvailable + '/' + room.energyCapacityAvailable +
    storage + (sites ? ' sites:' + sites : '') + threat + ' | ' + creepSummary(room.name) + queue;
}

/** Текст отчёта по всем комнатам. */
function report() {
  const lines = [];
  const s = Memory.stats || {};
  lines.push('=== Tick ' + Game.time + ' | GCL ' + Game.gcl.level + ' ' + (Game.gcl.progress / Game.gcl.progressTotal * 100).toFixed(1) +
    '% | CPU ' + (s.cpu || 0) + '/' + Game.cpu.limit + ' bucket ' + Game.cpu.bucket +
    ' | creeps ' + Object.keys(Game.creeps).length + ' ===');
  utils.myRooms().forEach(function (r) { lines.push(roomLine(r)); });
  return lines.join('\n');
}

module.exports = { tick: tick, report: report, roomLine: roomLine, k: k };
