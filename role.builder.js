const resourceManager = require('resourceManager');

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
    build(creep, target);
  } else {
    resourceManager.withdraw(creep, RESOURCE_ENERGY);
  }
}

// Экспортируем функцию выполнения роли
module.exports = {
  run: run
};