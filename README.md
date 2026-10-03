**English** · [Русский](README.ru.md)

# Screeps colony scripts

A complete colony bot for [Screeps](https://screeps.com) (official MMO server, JavaScript). It grows a room from the first spawn to RCL 8 on its own: mines, hauls, builds, upgrades, repairs, defends, plans the base and expands to new rooms through flags.

**How to play with it step by step — see the [Play guide](GUIDE.md).**

## Contents

- [Installation](#installation)
- [Architecture](#architecture)
- [Roles and when they spawn](#roles-and-when-they-spawn)
- [Configuration (config.js)](#configuration-configjs)
- [Flags](#flags)
- [Console commands](#console-commands)
- [Development: tests and lint](#development-tests-and-lint)
- [Troubleshooting](#troubleshooting)

## Installation

The game only needs the `.js` files from the **repository root**. Everything else (`test/`, `package.json`, `eslint.config.mjs`, `node_modules/`) is development tooling and must not be uploaded.

**Option A — in-game editor (browser or Steam client)**

1. Open the *Script* tab, branch `default` (or create a new branch).
2. For every `.js` file in the repository root create a module with the same name **without** `.js` (`main`, `config`, `role.harvester`, `spawn.manager`, ...) and paste the file contents.
3. Delete the old `spawner` module if it is still there — it is no longer used.
4. Press *Commit*. The bot starts on the next tick.

**Option B — local folder (Steam client)**

1. In the *Script* tab click *Open local folder*. The client opens the folder of the current branch, e.g.
   `%LOCALAPPDATA%\Screeps\scripts\screeps.com\default` (Windows) or
   `~/Library/Application Support/Screeps/scripts/screeps.com/default` (macOS).
2. Copy all `*.js` files from the repository root there (only the root files, no subfolders). The client uploads them automatically.
3. Remove the old `spawner.js` from that folder.

**Option C — upload through the API.** Any uploader (for example `grunt-screeps` or a small script calling `POST /api/user/code` with an auth token) works: send all root `*.js` files as modules named without the extension.

Module names are flat (`require('role.harvester')`), there are no runtime dependencies, and the code is ES2017, which the Screeps server supports.

## Architecture

```
main.js               main loop: cleanup → scouting → rooms → creeps → terminals → report
config.js             all tunables and toggles
utils.js              logging, try/catch wrapper, room-name helpers, CPU helpers
cache.js              per-tick cache of room.find() results
rooms.js              room memory: source/container/link bindings, scouting data
colony.js             flags → directives (claim / reserve / remote / attack / avoid)
body.js               body builder scaled by available energy
population.js         pure "who is missing" calculation for a room
spawn.manager.js      collects room state, spawns by priority on all spawns
targets.js            reservations so two creeps do not go to the same target
movement.js           moveTo with path reuse, stuck detection, swapping, safe routes, fleeing
creep.actions.js      shared creep actions (get/deliver energy, build, repair, upgrade...)
combat.js             target selection for combat roles
threat.js             threat scoring of hostile bodies, tower damage falloff
defense.js            threat assessment of own rooms, automatic safe mode
structure.tower.js    tower fire / heal / repair
structure.link.js     source links → controller / storage link
structure.terminal.js energy balancing between own terminals
planner.layout.js     pure layout helpers (checkerboard, spawn spot)
room.planner.js       places construction sites as the RCL grows
stats.js              CPU stats and the console report
console.commands.js   console helpers (help(), stats(), ...)
roles.js              role registry and CPU priorities
role.*.js             one file per role
```

Every tick: dead creep memory is removed, flags are processed, visible rooms are scanned, each own room runs defence → towers → links → spawning → planner, then creeps run grouped by priority. Each room and each creep runs inside `try/catch`, so a bug in one place does not stop the colony; errors are printed in red at most once per 20 ticks per source.

**CPU.** `room.find` results are cached per tick, paths are reused (`reusePath`), the planner runs every ~100 ticks and stores its plan in memory. When the bucket drops below `cpu.lowBucket` (2000) the planner, terminal, scouts and mineral miners pause; below `cpu.criticalBucket` (500) only vital roles run (harvesters, miners, haulers, filler, defenders). When the bucket is full (10000) it is turned into a pixel (`toggles.pixels`).

## Roles and when they spawn

The spawn manager recalculates the needed population every other tick from the room state and spawns the most important missing creep first. Bodies scale with `energyCapacityAvailable`; in an emergency (nobody can refill the spawn) the body is built from the energy that is available right now. If the room has not been full of energy for 150 ticks (for example an extension is unreachable), bodies are built from what there is instead of waiting forever.

| Role | What it does | When it spawns |
|---|---|---|
| `harvester` | Early-game all-rounder: mines, fills spawn/extensions/towers, builds, upgrades. Works as a hauler once all sources have miners. | For sources without a container/link: 3 per source while capacity < 550, then 2 (limited by free tiles). First creep of an empty colony. |
| `miner` | Static miner on the source container; with a link nearby it has a CARRY part and pushes energy into the link; repairs its container. | One per source that has a container (or a link + receiving link). Replaced in advance before it dies. |
| `hauler` | Moves energy from source containers, drops, tombstones and ruins to spawn/extensions → towers → controller container → storage. Also hauls minerals from the mineral container. | When miners exist; count and size from the distance to the sources (≈ needed CARRY parts / max hauler size, up to 6). |
| `filler` | Base manager working from storage: fills spawn/extensions/towers, empties or fills the storage link, keeps energy in the terminal. | RCL ≥ 4 with storage holding ≥ 1000 energy (or a storage link). |
| `upgrader` | Upgrades the controller using the controller link/container/storage. | `roles.upgraders[RCL]`; with storage: 1 while < 20k energy, + 1 per 50k above 100k; RCL 8: exactly 1 (15 WORK limit). |
| `builder` | Builds sites by priority: spawn → tower → container → extension → storage → link → terminal → extractor → ... → road → rampart → wall. Without sites it repairs, then upgrades. | When there are construction sites: 1 + 1 per 15k of remaining work, up to `roles.maxBuilders[RCL]`. |
| `repairer` | Repairs roads, containers etc. below 60%; never wastes energy on walls. | ≥ 3 damaged structures and no towers (or a lot of damage). |
| `wallRepairer` | Raises ramparts and walls to `wallHits[RCL]`, weakest first. | Walls/ramparts below target, RCL ≥ 2, storage ≥ 20k (if there is storage). 2 during a player attack. |
| `defender` | Melee. At home holds ramparts against players; in other rooms clears hostiles and invader cores. | On threat at home (towers cannot handle it / player attack), for hostile remote rooms, and for `attack` flags. |
| `rangedDefender` | Ranged attacker, keeps distance 3 from melee enemies, uses mass attack when it pays off. | Together with defenders (half of the needed count). |
| `healer` | Heals wounded own creeps, follows the squad. | Player attacks with healing, and `attack` squads. |
| `claimer` | Claims the controller of a `claim` flag room (attacks foreign reservation first). | `claim` flag, home RCL ≥ 3 and capacity ≥ 650. |
| `pioneer` | Goes to the newly claimed room, mines there, builds the spawn, keeps the controller alive. Becomes a local builder at RCL 3. | 2 per claimed room until it has a spawn. |
| `reserver` | Keeps a remote room reserved (sources give 3000 instead of 1500). | `remote` / `reserve` rooms with reservation < 3000 ticks, capacity ≥ 650. |
| `remoteMiner` | Mines a remote source, builds and repairs its container. Leaves when the room is dangerous. | One per remote source (home RCL ≥ 3). |
| `remoteHauler` | Carries remote energy home, repairs roads on the way. | Per remote source, count/size from the distance. |
| `scout` | One MOVE part: visits unknown target rooms, then explores within 3 rooms of home. | When a remote/claim/reserve room has no data yet. |
| `mineralMiner` | Mines the room mineral (extractor) into the container next to it. | RCL ≥ 6, extractor + container built, mineral not depleted, storage has space. |

Order of priority: emergency refill → miners/haulers/harvesters → filler → home defence → first upgrader → builders → repairers → wall repairers → claim/pioneers → attack squads → remote mining → extra upgraders → mineral miner → scout.

## Configuration (config.js)

| Option | Meaning |
|---|---|
| `username` | Your name; `null` = detect automatically. |
| `allies` | Player names that are never attacked; towers heal their creeps. |
| `toggles.*` | `planner`, `roads`, `ramparts`, `remoteMining`, `mineralMining`, `towerRepair`, `safeMode`, `terminal`, `pixels`, `report`, `visuals`, `signControllers`, `attackInvaderCores`. Can be changed live with `setToggle()`. |
| `signText` | Text for signing controllers (empty = do not sign). |
| `reportInterval` | Console report every N ticks. |
| `cpu.criticalBucket` / `cpu.lowBucket` | Bucket thresholds for the economy modes. |
| `roles.upgraders` | Base upgraders per RCL `[0..8]`. |
| `roles.maxBuilders` | Builder limit per RCL. |
| `roles.harvestersPerSource(Early)` | Harvesters per source without a container. |
| `roles.maxHaulers`, `roles.maxUpgraders` | Upper limits. |
| `roles.upgradeBonusStart` / `upgradeBonusStep` | Storage energy that adds upgraders. |
| `roles.buildProgressPerBuilder` | Remaining construction work per extra builder. |
| `roles.pioneersPerClaim`, `roles.attackSquad` | Expansion and attack squad sizes. |
| `wallHits` | Target hits of walls/ramparts per RCL. |
| `repair.*` | Repair threshold (60%) and "repaired" level (95%). |
| `storage.*` | Energy reserved in storage for spawning; minimum storage for builders and walls. |
| `tower.*` | Minimum tower energy for repairs, rampart repair level, road/container level. |
| `links.*`, `terminal.*` | Link thresholds, terminal energy target and balancing. |
| `remotes` | `{ 'W1N1': ['W2N1', 'W1N2'] }` — remote rooms without flags. |
| `remote.*` | Minimum RCL, max remote rooms per home, reservation threshold, max threat to send defenders. |
| `avoidSourceKeeperRooms` | Do not route through Source Keeper rooms. |
| `planner.*` | Planner interval, site limits per room/account, from which RCL roads/ramparts/containers are built. |
| `movement.*` | `reusePath`, ticks before repath and swapping. |

## Flags

Only the **name** matters (case-insensitive prefix, any color). An optional `@ROOM` suffix chooses the home room explicitly.

| Flag name | Effect |
|---|---|
| `claim…` (e.g. `claim1`, `claim@W5N8`) | Claim the room: claimer, then 2 pioneers build the spawn. The flag is removed when the room has its own spawn. |
| `spawn…` | Place inside a claimed room: the first spawn will be built exactly here. |
| `remote…` (e.g. `remote1`, `remote2@W5N8`) | Remote mining: scout → reserver + miner + hauler per source. Max `remote.maxRoomsPerHome` per home. |
| `reserve…` | Only keep the controller reserved. |
| `attack…` | Send the attack squad (`roles.attackSquad`) to clear creeps and hostile structures. Removed automatically when the room stays clear for 20 ticks. |
| `avoid…` | Never route creeps through this room. |
| `rally…` | Idle point for free creeps in that room. |

The home room is the nearest own room with a spawn that meets the requirements (claim: RCL ≥ 3 and 650 energy capacity; remote: RCL ≥ 3).

## Console commands

| Command | Description |
|---|---|
| `help()` | List of commands. |
| `stats()` | Report for all rooms (RCL, energy, storage, creeps by role, spawn queue). |
| `roomInfo('W1N1')` | Details: spawn queue, threat, sources, links, directives. |
| `spawnCreep('W1N1', 'builder')` | Order a creep out of turn (optional 3rd argument: extra memory, e.g. `{targetRoom: 'W2N1'}`). |
| `killRole('W1N1', 'upgrader')` | Kill all creeps of a role in a room. |
| `recycleCreep('name')` | Send a creep to be recycled at the spawn. |
| `resetRoom('W1N1')` | Forget the base plan and bindings (recomputed automatically). |
| `clearSites('W1N1')` | Remove all construction sites in a room. |
| `showPlan('W1N1')` | Draw the planned roads/containers/links/core for 20 ticks. |
| `setToggle('planner', false)` | Change a toggle; `null` returns to the config.js value. |
| `toggles()` | Current toggles. |
| `directives()` | Flags/targets grouped by home room. |
| `roleList()` | All roles. |

## Development: tests and lint

Requires Node.js 18+.

```bash
npm install
npx jest        # unit tests + full-loop simulations on a mock Screeps runtime
npx eslint .    # lint (ES2017 for game files)
```

`@types/screeps` gives editor autocompletion (`jsconfig.json`). Tests use hand-written mocks of the game globals (`test/mocks/`); the simulation runs the real `main.loop` for thousands of ticks in a fake room. None of this is needed by the game.

## Troubleshooting

- **Red `ERROR in ...` lines.** The failing creep/room is isolated; the rest keeps working. The message contains the stack trace — fix or report it.
- **Nothing spawns.** `roomInfo('W1N1')` shows the queue. Large bodies wait for full energy; after 150 ticks without full energy the colony spawns with what it has. A claimer needs 650 capacity.
- **Creeps are stuck.** Stuck detection repaths after 2 ticks and swaps with a blocking own creep after 3. Check `avoid` flags; `resetRoom()` rebuilds the plan.
- **Sites in a bad place.** `clearSites('W1N1')` and `resetRoom('W1N1')`. For a new room put a `spawn` flag before claiming.
- **Old creeps from the previous script** (harvester/builder/upgrader) keep working; unknown roles are recycled.

More scenarios — in the [Play guide](GUIDE.md#troubleshooting-faq).
