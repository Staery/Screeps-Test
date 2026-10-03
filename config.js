'use strict';

/**
 * Центральная конфигурация колонии.
 *
 * Все числа и переключатели собраны здесь, чтобы поведение бота можно было
 * менять без правки логики. Переключатели (toggles) можно также менять прямо
 * из консоли игры: setToggle('planner', false) — значение сохраняется в
 * Memory.settings и имеет приоритет над этим файлом.
 *
 * Массивы "по RCL" индексируются уровнем контроллера: [0, 1, 2, ..., 8].
 */
const config = {
  // Имя игрока. null — определяется автоматически по своим спавнам/крипам.
  username: null,

  // Союзники: их крипов и постройки не атакуем, их крипов лечим башнями.
  allies: [],

  toggles: {
    planner: true, // автоматическая расстановка строительных площадок
    roads: true, // дороги между спавном, источниками и контроллером
    ramparts: true, // рампарты поверх ключевых построек (с rampartsFromRcl)
    remoteMining: true, // добыча в соседних комнатах (флаги remote / config.remotes)
    mineralMining: true, // добыча минерала с RCL6 (экстрактор)
    towerRepair: true, // башни чинят постройки, если энергии много
    safeMode: true, // автоматический safe mode при серьёзной атаке
    terminal: true, // балансировка энергии между терминалами
    pixels: true, // Game.cpu.generatePixel() при полном bucket
    report: true, // периодический отчёт в консоль
    visuals: false, // пути крипов и подписи (тратит CPU)
    signControllers: true, // подписывать контроллеры (если signText не пуст)
    attackInvaderCores: true, // убивать ядра захватчиков (уровень 0) в remote-комнатах
  },

  // Подпись контроллеров. Пустая строка — не подписывать.
  signText: '',

  // Как часто (в тиках) печатать отчёт в консоль.
  reportInterval: 100,

  cpu: {
    criticalBucket: 500, // ниже — работают только жизненно важные роли
    lowBucket: 2000, // ниже — пропускаем планировщик, терминал, разведку
    tickReserve: 30, // запас CPU до Game.cpu.tickLimit, при котором прекращаем работу
  },

  roles: {
    // Базовое число апгрейдеров по RCL (без учёта бонуса за полный storage).
    upgraders: [0, 2, 3, 3, 3, 2, 2, 2, 1],
    // Максимум строителей по RCL (реальное число зависит от объёма стройки).
    maxBuilders: [0, 2, 3, 3, 3, 2, 2, 2, 2],
    // Харвестеров на источник, пока у источника нет контейнера/линка.
    harvestersPerSource: 2,
    // Ранний этап (вместимость < 550): харвестеров на источник.
    harvestersPerSourceEarly: 3,
    maxHaulers: 6,
    // Сколько энергии в storage даёт +1 апгрейдер (сверх upgradeBonusStart).
    upgradeBonusStart: 100000,
    upgradeBonusStep: 50000,
    maxUpgraders: 6,
    // С какой суммой "оставшегося строительства" добавлять строителя.
    buildProgressPerBuilder: 15000,
    pioneersPerClaim: 2,
    // Отряд для флага attack.
    attackSquad: { defender: 2, rangedDefender: 1, healer: 1 },
  },

  // Целевые хиты стен и рампартов по RCL (wallRepairer чинит до этого уровня).
  wallHits: [0, 0, 10000, 50000, 100000, 300000, 1000000, 3000000, 10000000],

  repair: {
    threshold: 0.6, // чинить дороги/контейнеры ниже 60% хитов
    doneRatio: 0.95, // чинить до 95%
    minTargets: 3, // сколько повреждённых построек нужно для отдельного ремонтника
  },

  storage: {
    minForBuilders: 5000, // строители/апгрейдеры не опустошают storage ниже этого
    minForWalls: 20000, // ниже — wallRepairer не спавнится (при наличии storage)
    reserveForSpawn: 2000,
  },

  tower: {
    repairMinEnergy: 600, // башня чинит, только если в ней больше энергии
    repairRampartsBelow: 5000, // свежие рампарты подтягиваем башнями до этого значения
    roadAndContainerRatio: 0.5, // башни чинят дороги/контейнеры ниже этой доли
  },

  links: {
    sendThreshold: 400, // источник-линк отправляет, когда накопил столько
    controllerLow: 400, // контроллер-линк считается пустым ниже этого
  },

  terminal: {
    energyTarget: 20000, // держать в терминале столько энергии
    interval: 100, // как часто балансировать
    richStorage: 150000, // комната-донор: storage выше этого
    poorStorage: 50000, // комната-получатель: storage ниже этого
    sendAmount: 10000,
  },

  // Удалённая добыча: { 'W1N1': ['W2N1', 'W1N2'] } — домашняя комната → список
  // комнат для добычи. Также можно ставить флаги remote* (см. README).
  remotes: {},

  remote: {
    minRcl: 3, // с какого RCL дома начинать удалённую добычу
    maxRoomsPerHome: 3,
    reserverMinCapacity: 650, // CLAIM + MOVE
    reserveBelow: 3000, // заказывать резервера, если резерва меньше
    maxDefenseScore: 400, // не посылать защитников против угрозы сильнее этой
  },

  // Не прокладывать маршруты через комнаты Source Keeper'ов.
  avoidSourceKeeperRooms: true,

  planner: {
    interval: 97, // раз в сколько тиков планировать
    maxSitesPerRoom: 5,
    maxSitesGlobal: 90, // лимит игры — 100 площадок на аккаунт
    roadsFromRcl: 3,
    roadSitesPerRun: 8,
    rampartsFromRcl: 4,
    containersFromRcl: 2,
  },

  movement: {
    reusePath: 20,
    stuckRepath: 2, // столько тиков без движения — пересчитать путь с учётом крипов
    stuckSwap: 3, // столько тиков — поменяться местами с мешающим своим крипом
  },
};

/** Целевые хиты стен/рампартов для уровня контроллера. */
config.wallTarget = function (rcl) {
  const arr = config.wallHits;
  return arr[Math.max(0, Math.min(arr.length - 1, rcl || 0))];
};

/** Включён ли переключатель (с учётом Memory.settings). */
config.isOn = function (name) {
  if (typeof Memory !== 'undefined' && Memory.settings && Memory.settings[name] !== undefined) {
    return !!Memory.settings[name];
  }
  return !!config.toggles[name];
};

module.exports = config;
