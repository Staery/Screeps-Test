const Harvester = require("role.harvester");
const Builder = require("role.builder");
const Upgrader = require("role.upgrader");
const Spawner = require("spawner");

module.exports.loop = function () {
  // Clear memory of dead creeps
  for (var name in Memory.creeps) {
    if (!Game.creeps[name]) {
      delete Memory.creeps[name];
    }
  }

  // Run Spawner module to spawn new creeps
  Spawner.spawnCreeps();

  // Run Harvester module for each creep with the "harvester" role
  for (var name in Game.creeps) {
    var creep = Game.creeps[name];
    if (creep.memory.role == "harvester") {
      Harvester.run(creep);
    }
    // Run Builder module for each creep with the "builder" role
    else if (creep.memory.role == "builder") {
      Builder.run(creep);
    }
    // Run Upgrader module for each creep with the "upgrader" role
    else if (creep.memory.role == "upgrader") {
      Upgrader.run(creep);
    }
  }
};