// Импорт модулей
const resourceManager = require('resourceManager');

// Функция улучшения контроллера
function upgrade(creep, controller) {
  // Если крип не рядом с контроллером, перемещаем его к нему
  if (creep.pos.inRangeTo(controller, 3) == false) {
    creep.moveTo(controller, {visualizePathStyle: {stroke: '#ffffff'}});
    creep.say('🚶', true);
  } else {
    // Если крип рядом с контроллером, улучшаем его
    creep.upgradeController(controller);
    creep.say('🔨', true);
  }
}

// Функция поиска контроллера для улучшения
function findUpgradeController(creep) {
  // Ищем контроллер в комнате
  let controller = creep.room.controller;
  if (controller && controller.my) {
    // Если контроллер найден и он принадлежит крипу, возвращаем его
    return controller;
  } else {
    // Если контроллер не найден или он не принадлежит крипу, возвращаем null
    return null;
  }
}

// Функция выполнения роли
function run(creep) {
  // Получаем контроллер для улучшения
  let controller = findUpgradeController(creep);
  // Если контроллер найден, улучшаем его
  if (controller) {
    upgrade(creep, controller);
  } else {
    // Иначе достаем ресурсы из хранилища
    resourceManager.withdraw(creep, RESOURCE_ENERGY);
    creep.say('🔋', true);
  }
}

// Экспортируем функцию выполнения роли
module.exports = {
  run: run
};