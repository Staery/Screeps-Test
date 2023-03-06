const roleHarvester = {
    run: function(creep) {
        if(creep.store.getFreeCapacity() > 0) {
            const sources = creep.room.find(FIND_SOURCES);
            if(creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(sources[0], {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            creep.say('🔄 ' + creep.store.getUsedCapacity() + '/' + creep.store.getCapacity());
        }
        else {
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return (structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_TOWER) &&
                            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });
            if(targets.length > 0) {
                if(creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
                }
                creep.say('🚚 ' + creep.store.getUsedCapacity() + '/' + creep.store.getCapacity());
            }
            else {
                const closestSpawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
                if(creep.transfer(closestSpawn, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(closestSpawn);
                }
                creep.say('🏠');
            }
        }
    }
};

module.exports = roleHarvester;
