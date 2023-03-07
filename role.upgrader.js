// Функция для доставки ресурсов из хранилищ
function withdraw(creep, resourceType) {
  // Ищем все доступные хранилища ресурсов
  let targets = creep.room.find(FIND_STRUCTURES, {
    filter: (structure) => {
      return (structure.structureType == STRUCTURE_CONTAINER ||
              structure.structureType == STRUCTURE_STORAGE ||
              structure.structureType == STRUCTURE_SPAWN ||
              structure.structureType == STRUCTURE_TERMINAL) &&
              structure.store.getUsedCapacity(resourceType) > 0;
    }
  });

  if (targets.length > 0) {
    // Если хранилища найдены, достаем ресурсы из первого из списка
    if (creep.withdraw(targets[0], resourceType) == ERR_NOT_IN_RANGE) {
      creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
      creep.say('🚚');
    }
  }
}
// Функция улучшения контроллера
function upgrade(creep, controller) {
  // Если крип не рядом с контроллером, перемещаем его к нему
  if (creep.pos.inRangeTo(controller, 3) == false) {
    creep.moveTo(controller);
    creep.say('🚶 Moving to controller');
    // Выводим путь к контроллеру на экран
    const path = creep.pos.findPathTo(controller);
    const visual = new RoomVisual(creep.room.name);
    visual.poly(path, {lineStyle: 'dashed', strokeWidth: 0.1, opacity: 0.5});
  } else {
    // Если крип рядом с контроллером, улучшаем его
    creep.upgradeController(controller);
    creep.say('⚡ Upgrading');
  }
}

// Функция поиска контроллера
function findController(creep) {
  // Ищем контроллер в комнате
  let controller = creep.room.controller;
  if (controller) {
    return controller;
  } else {
    return null;
  }
}

// Функция выполнения роли
function run(creep) {
  // Получаем контроллер
  let controller = findController(creep);
  if (controller) {
    // Проверяем, есть ли у крипа ресурсы для улучшения контроллера
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      upgrade(creep, controller);
    } else {
      // Если у крипа нет ресурсов, забираем их из хранилища
      resourceManager.withdraw(creep, RESOURCE_ENERGY);
    }
  } else {
    console.log('Upgrader ' + creep.name + ' cannot find controller');
  }
}

module.exports = {
  run: run
};
