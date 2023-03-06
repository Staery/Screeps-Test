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

// Экспортируем функцию
module.exports = {
  withdraw: withdraw
};
