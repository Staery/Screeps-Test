var spawner = {
  spawnCreeps: function () {
    var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == "harvester");
    var builders = _.filter(Game.creeps, (creep) => creep.memory.role == "builder");
    var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == "upgrader");
    var sources = Game.spawns.Spawn1.room.find(FIND_SOURCES);
    
    if (harvesters.length < sources.length) {
      var newName = "Harvester" + Game.time;
      var spawnResult = Game.spawns.Spawn1.spawnCreep([WORK, CARRY, MOVE], newName, {
        memory: { role: "harvester" },
      });
      if (spawnResult == OK) {
        console.log("Spawning new harvester: " + newName);
      }
    }
    else if (builders.length < 2) {
      var newName = "Builder" + Game.time;
      var spawnResult = Game.spawns.Spawn1.spawnCreep([WORK, CARRY, MOVE], newName, {
        memory: { role: "builder" },
      });
      if (spawnResult == OK) {
        console.log("Spawning new builder: " + newName);
      }
    }
    else if (upgraders.length < 2) {
      var newName = "Upgrader" + Game.time;
      var spawnResult = Game.spawns.Spawn1.spawnCreep([WORK,  CARRY, MOVE], newName, {
        memory: { role: "upgrader" },
      });
      if (spawnResult == OK) {
        console.log("Spawning new upgrader: " + newName);
      }
    }

  },
};

module.exports = spawner;