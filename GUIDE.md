**English** · [Русский](GUIDE.ru.md)

# Play guide

A practical guide to playing Screeps with these scripts: what happens on its own, what you do by hand, and how to fix things when they go wrong. For the reference tables (roles, config, commands) see the [README](README.md).

## Contents

1. [Before you start: choosing a room and the first spawn](#1-before-you-start-choosing-a-room-and-the-first-spawn)
2. [First steps: upload and the first minutes](#2-first-steps-upload-and-the-first-minutes)
3. [What happens at each RCL](#3-what-happens-at-each-rcl)
4. [Expansion with flags](#4-expansion-with-flags)
5. [Defence](#5-defence)
6. [Economy tips](#6-economy-tips)
7. [CPU, bucket and pixels](#7-cpu-bucket-and-pixels)
8. [Console commands with examples](#8-console-commands-with-examples)
9. [Tuning config.js](#9-tuning-configjs)
10. [Troubleshooting FAQ](#troubleshooting-faq)

---

## 1. Before you start: choosing a room and the first spawn

**Checklist for a good starting room**

- [ ] **Two sources** (one-source rooms grow at half speed).
- [ ] Sources and controller not too far from each other (ideally within ~15 tiles of the spot you want for the spawn).
- [ ] Not much swamp between them (swamp roads are expensive, creeps are slow there).
- [ ] No strong player right next door (look at the neighbours' RCL on the world map).
- [ ] Not a Source Keeper room (lairs in the middle of a sector) and not next to a highway with heavy traffic if you can avoid it.
- [ ] A mineral you like is a bonus, not a requirement.

**Where to put the first spawn**

The base planner builds everything around the first spawn in a checkerboard pattern (structures on every other tile, free paths between them). So the spawn needs space:

- [ ] Open ground of roughly **7×7 tiles or more** around the spawn (no walls).
- [ ] At least ~4 tiles from the controller and 3 tiles from sources (the planner keeps 2 tiles around sources and the controller free).
- [ ] Not on the edge: 6+ tiles from the room exits.
- [ ] Roughly in the middle between the two sources and the controller.

Name of the spawn does not matter. In claimed rooms (later) you can mark the spot in advance with a `spawn` flag, otherwise the bot picks an open spot itself.

## 2. First steps: upload and the first minutes

**Checklist**

1. [ ] Place your first spawn (game UI).
2. [ ] Upload all `*.js` files from the repository root (see [Installation](README.md#installation)). Remove the old `spawner` module if you had one.
3. [ ] Optionally edit `config.js`: `signText` (controller sign), `allies`.
4. [ ] Open the *Console* tab and type `help()` — if you see the command list, the code is loaded.

**What happens automatically**

| When | What you will see |
|---|---|
| Tick 1 | `спавн harvester-1 ... (аварийно)` — the first creep is spawned from whatever energy is there ("emergency" mode). |
| First ~5 minutes | More harvesters (3 per source while you have only 300 energy), then upgraders. Harvesters fill the spawn, then upgrade. |
| Every 100 ticks | A status report: `W1N1 RCL1 45.0% E:300/300 | hv5 up2 next:upgrader`. `hv5` = 5 harvesters, `next:` = spawn queue. |
| RCL 2 (≈ 10–20 minutes) | Construction sites appear: containers at sources, then 5 extensions, controller container. Builders are spawned. |

You do not need to do anything by hand in the first hours. Just check `stats()` from time to time.

## 3. What happens at each RCL

| RCL | What the bot does automatically | What you might do by hand |
|---|---|---|
| **1** | Harvesters (3 per source), upgraders. | Nothing. |
| **2** | Source containers → 5 extensions → controller container. When a source has a container, a static **miner** and **haulers** replace harvesters for it. | Nothing. Optional: decide where you want walls/ramparts later. |
| **3** | First tower, 10 extensions, **roads** (spawn ↔ sources ↔ controller ↔ mineral). Remote mining becomes possible. Claiming new rooms becomes possible (needs 650 energy capacity). | Place `remote` flags in 1–2 neighbouring rooms (see [section 4](#4-expansion-with-flags)). |
| **4** | Storage next to the spawn, 20 extensions, **ramparts** on spawn/towers/storage/terminal, **filler** (base manager) once storage has energy. Wall repairer keeps ramparts at the RCL target. | If you want a perimeter wall, place `constructedWall`/`rampart` sites yourself — the wall repairer will maintain them. |
| **5** | 2nd tower, 30 extensions, **links**: far source → controller. Upgraders take energy from the controller link. | Nothing. |
| **6** | 40 extensions, 3rd link (at storage), **terminal**, **extractor** + mineral container, **mineral miner**. | Labs are **not** built automatically — build them yourself if you plan boosts/reactions. |
| **7** | 2nd spawn, 3rd tower, 50 extensions, 4th link (second source). Bodies get much bigger. | Factory is not automated. |
| **8** | 3rd spawn, 6 towers, 60 extensions. Upgraders drop to 1 (controller accepts max 15 energy/tick). Energy accumulates in storage; extra upgraders are no longer useful. | Observer, power spawn, nuker, labs, factory — by hand if you want them. Use the surplus energy for expansion. |

The planner runs every ~100 ticks and immediately when the RCL changes, and places at most 5 sites per room at a time (account limit is 100). Roads are placed in batches of 8.

## 4. Expansion with flags

Flags are created in the game UI (Flag tool on the room view). **Only the name matters**, color is irrelevant. Names must be unique, so number them: `remote1`, `remote2`. Add `@ROOM` to choose the home room explicitly, e.g. `remote1@W5N8`.

### 4.1 Remote mining (`remote…`)

Remote mining doubles or triples your income at RCL 3–6.

1. [ ] Home room is RCL 3+ (better RCL 4 with storage).
2. [ ] Pick an adjacent room **without an owner**, not a Source Keeper room, preferably with 2 sources.
3. [ ] Put a flag named `remote1` anywhere in that room.
4. [ ] What follows automatically: a **scout** visits the room (if it was never seen) → a **reserver** (from 650 energy capacity) → one **remoteMiner** per source (builds its own container) → **remoteHaulers** carry energy home.
5. [ ] Check: `directives()` should list the room under your home; `stats()` shows `rs`, `rm`, `rh` creeps.

Up to 3 remote rooms per home (`remote.maxRoomsPerHome`). Without flags you can list them in `config.js`: `remotes: { W1N1: ['W2N1', 'W1N2'] }`.

When invaders appear in a remote room, miners and haulers go home, and a defender is sent if the threat is small enough (`remote.maxDefenseScore`). Invader cores (level 0) are destroyed automatically.

### 4.2 Reserving only (`reserve…`)

Same as remote but without mining: `reserve1` — keeps the controller reserved (blocks others from claiming it).

### 4.3 Claiming a new room (`claim…`)

1. [ ] Your **GCL** must be higher than the number of rooms you own (GCL 2 = 2 rooms). If GCL is too low, the claimer only reserves and prints a message.
2. [ ] A home room within a few rooms with RCL 3+ and 650+ energy capacity.
3. [ ] Optional: put a `spawn1` flag in the new room on the tile where you want the spawn (see [section 1](#1-before-you-start-choosing-a-room-and-the-first-spawn)).
4. [ ] Put a flag `claim1` (or `claim1@W5N8` to choose the home) in the target room.
5. [ ] Automatically: claimer → claims the controller → the planner places the spawn site → 2 **pioneers** walk there, mine and build the spawn → once the spawn exists the `claim1` flag is removed → the new room runs on its own. Pioneers become local builders at RCL 3.

Typical time: claimer travel (~50 ticks per room) + spawn construction (15 000 energy; a few thousand ticks with 2 pioneers).

### 4.4 Attacking (`attack…`)

1. [ ] Put `attack1` in the target room.
2. [ ] A squad of 2 defenders, 1 ranged defender and 1 healer (`roles.attackSquad`) is spawned and goes there. It kills hostile creeps, then hostile structures (towers → spawns → invader core → the rest; ramparts on top of targets first).
3. [ ] The flag is removed automatically when the room has been clear for 20 ticks.

**Warning:** the squad is designed for invaders, abandoned rooms and weak players. Do not send it into a room with active towers and energy — it will die. Remove the flag to stop.

### 4.5 Other flags

- `avoid…` — creeps never path through this room (dangerous neighbour).
- `rally…` — idle creeps in this room wait here instead of near the storage/spawn.

## 5. Defence

**What happens on an invasion**

1. The room log shows `W1N1: враги! угроза 120 (захватчики)` (enemies, threat score, invaders or player name).
2. **Towers** focus fire on the most dangerous target (healers first), accounting for distance falloff and enemy healing. They skip targets that are healed faster than damaged unless those are near the spawn/controller.
3. Civilian creeps flee from armed enemies (except when standing on own ramparts).
4. **Defenders** are spawned if there are no towers, the towers are not enough, or it is a player attack. Against players, defenders stand on ramparts and wall repairers are doubled.
5. **Safe mode** activates automatically if a spawn/tower/storage/terminal is being damaged and your defence is weaker than the attack (or a spawn is below 60% hits, or someone tries to attack the controller). It is used only when available and not on cooldown.

**Checklist for being well defended**

- [ ] Get to RCL 3 quickly (first tower).
- [ ] Keep towers filled (haulers/filler do this; towers repair only above 600 energy, so attack energy is kept).
- [ ] RCL 4+: ramparts on key structures are automatic; raise `wallHits` if you have a dangerous neighbour.
- [ ] Add friends to `allies` in `config.js` — their creeps are never attacked and towers heal them:
  ```js
  allies: ['FriendName', 'AnotherFriend'],
  ```
- [ ] Manual safe mode if needed: `Game.rooms.W1N1.controller.activateSafeMode()`.
- [ ] Disable automatic safe mode: `setToggle('safeMode', false)`.

## 6. Economy tips

- **Storage** (RCL 4) is the heart of the economy: haulers dump energy there, the filler feeds the spawn from it, and extra upgraders appear when it gets full (+1 per 50k above 100k). If storage keeps growing, you can raise `roles.maxUpgraders` or expand.
- **Links** (RCL 5+) save haulers: the far source sends energy straight to the controller link; with a storage link (RCL 6) the filler moves link energy into storage, or fills the storage link when the controller link runs dry.
- **Terminal** (RCL 6): the filler keeps `terminal.energyTarget` (20k) energy there. With 2+ rooms that have terminals, rich rooms (storage > 150k) send 10k energy to poor rooms (< 50k) every 100 ticks.
- **Market**: the scripts do **not** trade. Sell minerals manually in the Market tab, or from the console, e.g. `Game.market.deal(orderId, amount, 'W1N1')`. Terminal sends cost energy.
- **Minerals** are mined into the terminal/storage from RCL 6; they are useful for selling or for labs (manual).
- **Remote mining** is the biggest income boost at RCL 3–6; use 2–3 remote rooms per home.
- **Roads** halve travel time and are repaired by towers/repairers automatically.

## 7. CPU, bucket and pixels

- Each tick you get `Game.cpu.limit` CPU (depends on your account and shard; shard3 is capped at 20). Unused CPU goes to the **bucket** (max 10 000).
- The report line shows `CPU 6.5/20 bucket 10000`. If the average CPU is near the limit and the bucket drops, the bot saves CPU:
  - bucket < 2000: planner, terminal balancing, scouts and mineral miners pause;
  - bucket < 500 (and CPU really over budget): only harvesters, miners, haulers, filler and defenders run.
- **Pixels**: when the bucket is full (10 000), `Game.cpu.generatePixel()` turns it into 1 pixel (tradeable in the market). After that the bucket starts from 0 and refills; the planner waits until it is above 2000 again. If you are short on CPU or want the planner to never pause, turn it off: `setToggle('pixels', false)`.
- CPU savers: `setToggle('visuals', false)` (default off), fewer remote rooms, `setToggle('report', false)`.

## 8. Console commands with examples

```js
help()                                   // all commands
stats()                                  // report for all rooms
roomInfo('W1N1')                         // spawn queue, threat, sources, links, flags
spawnCreep('W1N1', 'builder')            // order a builder out of turn
spawnCreep('W1N1', 'defender', { targetRoom: 'W2N1' })  // defender for a remote room
spawnCreep('W1N1', 'scout', { queue: ['W3N1', 'W3N2'] }) // scout specific rooms
killRole('W1N1', 'upgrader')             // kill all upgraders in W1N1 (they will be respawned per plan)
recycleCreep('builder-42')               // send a creep to the spawn to be recycled
resetRoom('W1N1')                        // forget the base plan; it is rebuilt automatically
clearSites('W1N1')                       // remove all construction sites in W1N1
showPlan('W1N1')                         // draw planned roads/containers/links for 20 ticks
setToggle('remoteMining', false)         // stop spawning remote creeps
setToggle('remoteMining', null)          // back to the value from config.js
toggles()                                // show all toggles
directives()                             // flags grouped by home room
roleList()                               // all role names
```

Creep names look like `miner-17`; the role short names in the report: `hv` harvester, `mn` miner, `hl` hauler, `fl` filler, `up` upgrader, `bd` builder, `rp` repairer, `wr` wallRepairer, `df` defender, `rd` rangedDefender, `he` healer, `cl` claimer, `pi` pioneer, `rs` reserver, `rm` remoteMiner, `rh` remoteHauler, `mm` mineralMiner, `sc` scout.

## 9. Tuning config.js

After editing `config.js`, upload it again (toggles can also be changed live with `setToggle`).

| I want... | Change |
|---|---|
| More upgraders (faster RCL) | `roles.upgraders: [0, 2, 4, 4, 4, 3, 3, 3, 1]` and/or `roles.maxUpgraders: 8`. With storage, lower `roles.upgradeBonusStart` (e.g. `50000`). |
| Fewer builders | `roles.maxBuilders: [0, 1, 1, 2, 2, 2, 1, 1, 1]` or increase `roles.buildProgressPerBuilder`. |
| Stronger walls | `wallHits: [0, 0, 20000, 100000, 300000, 1000000, 3000000, 10000000, 30000000]`. Lower `storage.minForWalls` to let the wall repairer work with less storage. |
| Weaker walls (save energy) | Lower the `wallHits` numbers; or `setToggle('ramparts', false)` to stop placing ramparts. |
| No remote mining | `setToggle('remoteMining', false)`. |
| Remote mining earlier | `remote.minRcl: 2` (reservers still need 650 capacity). |
| More remote rooms | `remote.maxRoomsPerHome: 4` (watch CPU). |
| Plan my own base layout | `setToggle('planner', false)` and place sites yourself; builders still build them in priority order. |
| No roads | `setToggle('roads', false)`. |
| Towers should not repair | `setToggle('towerRepair', false)`, or raise `tower.repairMinEnergy`. |
| Bigger attack squad | `roles.attackSquad: { defender: 3, rangedDefender: 2, healer: 2 }`. |
| Sign my controllers | `signText: 'My colony'`. |
| Report less often | `reportInterval: 500` or `setToggle('report', false)`. |

## Troubleshooting FAQ

**Creeps are stuck / dance in place**
- The bot repaths after 2 ticks without movement and swaps places with a blocking own creep after 3 ticks. Static creeps (miners) are not swapped.
- Check that nothing walls off a path (your own construction sites of walls, or extensions placed by hand).
- `resetRoom('W1N1')` rebuilds the plan; `clearSites('W1N1')` removes bad sites.

**Nothing spawns**
- `roomInfo('W1N1')` → look at the spawn queue. Empty queue = nothing is needed (fine).
- Queue not empty: the top request waits for full energy. If the room has not been full for 150 ticks, the bot spawns with what it has.
- A `claimer` needs 650 energy capacity, a `reserver` too — at RCL 2 they are skipped.
- Are there red `ERROR` lines in the console? They show which module fails.

**Not enough energy**
- Check `stats()`: are there miners (`mn`) for each source and enough haulers (`hl`)? `next:` shows what is missing.
- Too many builders/upgraders for the income: lower `roles.upgraders` / `roles.maxBuilders`.
- Energy lying on the ground near sources = not enough haulers: raise `roles.maxHaulers` or wait for bigger bodies.
- Add remote rooms (section 4.1).

**Colony wiped out (no creeps)**
- If the spawn is alive, nothing to do: the bot spawns an emergency harvester as soon as there are 200 energy (the spawn regenerates to 300 by itself).
- If miners survived but haulers died, an emergency hauler is spawned first.
- **Spawn destroyed, but you have another room:** put a `claim…` flag in the destroyed room (the controller is still yours). Pioneers come from the other room and rebuild the spawn (the planner places the site automatically).
- **Spawn destroyed and no other room:** you have to respawn.

**Respawn**
1. [ ] Press *Respawn* in the game UI and place a new spawn.
2. [ ] Clear old memory in the console: `for (const k in Memory) delete Memory[k]`.
3. [ ] Remove old flags. The code stays as it is.

**The room plan looks wrong**
- `showPlan('W1N1')` draws it. `resetRoom('W1N1')` + `clearSites('W1N1')` start over.
- The plan is built around the first spawn; if the spawn is in a tight place, the base will be stretched.

**CPU limit exceeded / bucket at 0**
- `setToggle('pixels', false)`, fewer remote rooms, fewer creeps (bigger bodies), `setToggle('visuals', false)`.

**Old creeps from the previous script**
- `harvester`, `builder`, `upgrader` keep working with the new code; creeps with unknown roles are recycled automatically.
