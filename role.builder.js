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

function build(creep, target) {
  if (creep.pos.isNearTo(target) == false) {
    creep.moveTo(target);
    creep.say('🚶 Moving to target');
    const path = creep.pos.findPathTo(target);
    const visual = new RoomVisual(creep.room.name);
    visual.poly(path, {lineStyle: 'dashed', strokeWidth: 0.1, opacity: 0.5});
  } else {
    creep.build(target);
    creep.say('🔨 Building');
  }
}

function findBuildTarget(creep) {
  let targets = creep.room.find(FIND_CONSTRUCTION_SITES);
  if (targets.length > 0) {
    return targets[0];
  } else {
    return null;
  }
}

function run(creep) {
  let target = findBuildTarget(creep);
  if (target) {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0){
      build(creep, target);
    } else {
      resourceManager.withdraw(creep, RESOURCE_ENERGY);
    }
    
    
  } else {
    console.log('Builder ' + creep.name + ' cannot find e');
  }
}

// Экспортируем функцию выполнения роли
module.exports = {
  run: run
};