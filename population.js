'use strict';

/**
 * Расчёт состава колонии. Чистая функция plan(state, counts, cfg) получает
 * описание комнаты (собирает spawn.manager) и текущие количества крипов по
 * ключам, и возвращает список недостающих крипов в порядке приоритета.
 *
 * Ключ крипа: роль, либо "роль:sourceId", либо "роль:targetRoom" (см. keyOf).
 */
const body = require('body');

/** Ключ учёта крипа по его памяти. */
function keyOf(memory) {
  if (memory.key) return memory.key;
  if (memory.sourceId) return memory.role + ':' + memory.sourceId;
  if (memory.targetRoom) return memory.role + ':' + memory.targetRoom;
  return memory.role;
}

/** Сколько CARRY-частей нужно, чтобы вывозить rate энергии/тик на дистанцию dist (в одну сторону). */
function carryNeeded(rate, dist) {
  return Math.ceil(rate * (dist * 2 + 4) * 1.15 / 50);
}

/**
 * Число и размер перевозчиков для вывоза carry CARRY-частей.
 * @returns {{count:number, carryParts:number}}
 */
function haulerSplit(carry, maxCarryPerCreep, maxCount) {
  if (carry <= 0 || maxCarryPerCreep <= 0) return { count: 0, carryParts: 0 };
  const count = Math.max(1, Math.min(maxCount, Math.ceil(carry / maxCarryPerCreep)));
  let per = Math.ceil(carry / count);
  if (per % 2) per++;
  return { count: count, carryParts: Math.min(per, maxCarryPerCreep) };
}

/** Сила одного защитника (урон за тик) при данной вместимости. */
function defenderPower(energy) {
  const b = body.forRole('defender', energy);
  return b.filter(function (p) { return p === ATTACK; }).length * 30 || 30;
}

/**
 * @param {object} s состояние комнаты (см. spawn.manager.collectState)
 * @param {object} counts { key: число живых крипов }
 * @param {object} cfg config
 * @returns {Array<{role:string, priority:number, memory:object, opts:object, emergency?:boolean}>}
 */
function plan(s, counts, cfg) {
  const out = [];
  const planned = {};
  const rcl = s.rcl;
  const cap = s.energyCapacity;

  function have(key) {
    return (counts[key] || 0) + (planned[key] || 0);
  }

  function need(role, desired, priority, memory, opts, emergency) {
    const mem = Object.assign({ role: role, home: s.room }, memory || {});
    const key = keyOf(mem);
    mem.key = key;
    while (have(key) < desired) {
      planned[key] = (planned[key] || 0) + 1;
      out.push({ role: role, priority: priority, memory: mem, opts: opts || {}, emergency: !!emergency,
        order: out.length });
    }
  }

  const receivingLink = s.ctrlLink || s.storageLink;
  const minable = s.sources.filter(function (x) { return x.container || x.link && receivingLink; });
  const unmined = s.sources.filter(function (x) { return minable.indexOf(x) === -1; });

  // ---- Аварийный режим: некому наполнять спавн.
  const fillersAlive = (counts.harvester || 0) + (counts.hauler || 0) + (counts.filler || 0);
  const minersAlive = s.sources.reduce(function (n, x) { return n + (counts['miner:' + x.id] || 0); }, 0);
  if (fillersAlive === 0) {
    const role = minersAlive > 0 || s.storageEnergy > 1000 ? 'hauler' : 'harvester';
    need(role, 1, 0, {}, role === 'hauler' ? { carryParts: 10 } : {}, true);
  }

  // ---- Добыча
  minable.forEach(function (x, i) {
    need('miner', 1, i === 0 ? 1 : 1.2, { sourceId: x.id }, { link: !!(x.link && receivingLink) });
  });
  let harvesters = 0;
  const perSource = cap < 550 ? cfg.roles.harvestersPerSourceEarly : cfg.roles.harvestersPerSource;
  unmined.forEach(function (x) { harvesters += Math.max(1, Math.min(x.spots || 2, perSource)); });
  need('harvester', harvesters, 1.3);

  // ---- Перевозка
  if (minable.length) {
    let carry = 0;
    minable.forEach(function (x) {
      if (!(x.link && receivingLink)) carry += carryNeeded(10, x.distance || 20);
    });
    if (s.mineral && s.mineral.container) carry += 4;
    const maxCarry = body.maxCarryParts('hauler', cap);
    let split = haulerSplit(carry, maxCarry, cfg.roles.maxHaulers);
    if (split.count === 0) split = { count: 1, carryParts: Math.min(8, maxCarry || 2) };
    need('hauler', 1, 1.1, {}, { carryParts: split.carryParts });
    need('hauler', split.count, 1.4, {}, { carryParts: split.carryParts });
  }

  // ---- Менеджер базы
  if (s.hasStorage && rcl >= 4 && (s.storageEnergy >= 1000 || s.storageLink)) {
    need('filler', 1, 1.5, {}, { units: rcl >= 7 ? 10 : rcl >= 5 ? 6 : 4 });
  }

  // ---- Оборона дома
  const t = s.threat || { score: 0 };
  if (t.score > 0) {
    const towerDmg = s.towers * 300;
    const serious = t.player || s.towers === 0 || t.score * 1.5 > towerDmg;
    if (serious) {
      const per = defenderPower(cap);
      const effective = Math.max(t.score - towerDmg * 0.5, t.player ? t.score * 0.5 : 0);
      const n = Math.max(1, Math.min(6, Math.ceil(effective / per)));
      const melee = Math.ceil(n / 2);
      need('defender', melee, 2);
      need('rangedDefender', n - melee, 2);
      if ((t.heal > 0 || t.player) && n >= 2) need('healer', 1, 2.1);
    }
  }

  // ---- Контроллер
  const maxWork = rcl === 8 ? 15 : 50;
  const upOpts = { static: !!(s.ctrlLink || s.ctrlContainer), maxWork: maxWork };
  let upgraders = cfg.roles.upgraders[rcl] || 1;
  if (s.sites > 0 && rcl < 4) upgraders = Math.max(1, upgraders - 1);
  if (s.hasStorage) {
    if (s.storageEnergy < 20000) upgraders = 1;
    else if (s.storageEnergy > cfg.roles.upgradeBonusStart) {
      upgraders += Math.floor((s.storageEnergy - cfg.roles.upgradeBonusStart) / cfg.roles.upgradeBonusStep) + 1;
    }
  }
  if (rcl === 8) upgraders = 1;
  upgraders = Math.min(upgraders, cfg.roles.maxUpgraders);
  need('upgrader', 1, s.downgradeTicks < 5000 ? 1.6 : 5, {}, upOpts);

  // ---- Строительство и ремонт
  if (s.sites > 0) {
    let builders = 1 + Math.floor(s.sitesProgressLeft / cfg.roles.buildProgressPerBuilder);
    builders = Math.min(builders, cfg.roles.maxBuilders[rcl] || 1);
    if (s.hasStorage && s.storageEnergy < cfg.storage.minForBuilders) builders = 1;
    need('builder', builders, 6);
  }
  if (s.repairTargets >= cfg.repair.minTargets && (s.towers === 0 || s.repairTargets >= cfg.repair.minTargets * 4)) {
    need('repairer', 1, 7);
  }
  if (s.wallsBelowTarget > 0 && rcl >= 2 && (!s.hasStorage || s.storageEnergy >= cfg.storage.minForWalls)) {
    need('wallRepairer', t.player ? 2 : 1, t.player ? 2.2 : 8, {}, { units: Math.min(4 + rcl, 12) });
  }

  // ---- Экспансия
  (s.claims || []).forEach(function (c) {
    if (!c.claimed) need('claimer', 1, 9, { targetRoom: c.room });
    else if (!c.hasSpawn) need('pioneer', cfg.roles.pioneersPerClaim, 9, { targetRoom: c.room });
  });
  (s.attacks || []).forEach(function (a) {
    const sq = cfg.roles.attackSquad;
    need('defender', sq.defender || 0, 10, { targetRoom: a.room, attack: true });
    need('rangedDefender', sq.rangedDefender || 0, 10, { targetRoom: a.room, attack: true });
    need('healer', sq.healer || 0, 10, { targetRoom: a.room, attack: true });
  });

  // ---- Удалённая добыча
  const scoutQueue = [];
  if (rcl >= cfg.remote.minRcl) {
    (s.remotes || []).forEach(function (r) {
      if (!r.known) {
        scoutQueue.push(r.room);
        return;
      }
      if (r.hostile) {
        if (r.threatScore > 0 && r.threatScore <= cfg.remote.maxDefenseScore && !r.player) {
          need('defender', 1, 10, { targetRoom: r.room });
          if (r.threatScore > 100) need('rangedDefender', 1, 10, { targetRoom: r.room });
        }
        return;
      }
      if (r.core === 0 && cfg.toggles.attackInvaderCores) need('defender', 1, 10, { targetRoom: r.room });
      if (r.ownedByOther) return;
      const canReserve = cap >= cfg.remote.reserverMinCapacity;
      if (canReserve && (r.reservedByOther || r.reservedTicks < cfg.remote.reserveBelow)) {
        need('reserver', 1, 11, { targetRoom: r.room }, { claimParts: cap >= 1300 ? 2 : 1 });
      }
      const reserved = canReserve && !r.reservedByOther;
      const maxCarry = body.maxCarryParts('remoteHauler', cap);
      r.sources.forEach(function (src) {
        need('remoteMiner', 1, 11, { targetRoom: r.room, sourceId: src.id }, { works: reserved ? 6 : 3 });
        const split = haulerSplit(carryNeeded(reserved ? 10 : 5, r.distance || 50), maxCarry, 3);
        need('remoteHauler', split.count, 11.5, { targetRoom: r.room, sourceId: src.id }, { carryParts: split.carryParts });
      });
    });
  }
  (s.reserves || []).forEach(function (r) {
    if (!r.known) {
      scoutQueue.push(r.room);
      return;
    }
    if (r.hostile || r.ownedByOther || cap < cfg.remote.reserverMinCapacity) return;
    if (r.reservedByOther || r.reservedTicks < cfg.remote.reserveBelow) {
      need('reserver', 1, 11, { targetRoom: r.room }, { claimParts: cap >= 1300 ? 2 : 1 });
    }
  });
  (s.claims || []).forEach(function (c) { if (!c.known) scoutQueue.push(c.room); });

  // ---- Прочее
  need('upgrader', upgraders, 12, {}, upOpts);
  if (s.mineral && s.mineral.extractor && s.mineral.amount > 0 && s.mineral.container &&
      s.hasStorage && s.storageFree > 50000 && cfg.toggles.mineralMining) {
    need('mineralMiner', 1, 13, {}, { units: 8 });
  }
  if (scoutQueue.length) need('scout', 1, 14, { queue: scoutQueue });

  out.sort(function (a, b) { return a.priority - b.priority || a.order - b.order; });
  return out;
}

module.exports = {
  keyOf: keyOf,
  carryNeeded: carryNeeded,
  haulerSplit: haulerSplit,
  defenderPower: defenderPower,
  plan: plan,
};
