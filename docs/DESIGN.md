# The Human Odyssey — Design & Architecture Contract

Browser survival/evolution game inspired by *Ancestors: The Humankind Odyssey*.
Play as a hominid clan in Africa, 10 million years ago. Explore, sense, learn,
survive predators, raise babies, evolve across generations.

Stack: Vite + TypeScript + Three.js (r170). Unit tests: Vitest. E2E: Playwright.
No external assets: all geometry, textures, audio are procedural.

## Core loop
1. **Explore** the open world (jungle, savanna, swamp, lake, cliffs).
2. **Intelligence mode** (hold `Q`): time slows; use *sight*, *smell* (`E`), *hearing* (`R`)
   to detect and identify things. Unknown things must be **identified** (look + interact)
   before they can be used. Discovery gives dopamine and neuronal energy.
3. **Survive**: hunger, thirst, sleep, health. Conditions: bleeding, poisoned, fractured, cold.
   Cure with plants (horsetail, kapok fiber, khat, honey...). Eat, drink, sleep at settlement.
4. **Fear**: unknown territory raises fear. If fear maxes -> panic (vision distorts).
   Overcome fear by finding **glowing lights** (sources of dopamine) while afraid.
5. **Neuronal network**: actions grant neuronal energy; spend in `Tab` to unlock neurons
   (motricity, senses, intelligence, communication, metabolism, dexterity). Babies carried
   multiply energy gain. Neurons must be **reinforced** to survive generation change.
6. **Clan**: recruit outsiders (approach, groom, offer food), mate to produce babies,
   switch controlled hominid at settlement. Settlement = safe zone with sleeping spots.
7. **Generation change** (`G` at settlement, requires babies): children become adults,
   adults become elders, elders die; un-reinforced neurons are lost; babies born with
   **mutations** (genetic neurons) are applied.
8. **Evolution leap**: advance the lineage in time; feats reduce years. Goal: reach
   2 million years ago (from 10M) with a surviving lineage. Death of all clan = lineage lost.

## Data model (src/entities, src/data)
- `Hominid`: id, name, sex, age stage (baby|child|adult|elder), stats {health,energy,hunger,thirst}
  max stats, conditions[], position, state (idle|walk|run|climb|jump|swim|fall|attack|dodge|dead),
  heldItems {left,right}, carriedBaby?, knownNeurons: Set<NeuronId>, mutations.
- `Animal`: species id, aggression, position, ai state (wander|stalk|attack|flee|sleep|eat), health.
- `WorldItem`: item id, position, quantity. Items in `src/data/items.ts`.
- `Plant`: plant id, position, harvest items.
- `Discovery`: any species/item/plant/landmark id, boolean known.

## Systems (src/systems) — pure logic where possible, no Three.js imports
- `survival.ts`: metabolism rates, condition ticking, healing rules.
- `fear.ts`: fear accumulation vs known territory, dopamine, panic.
- `neuronal.ts`: energy, tree unlock rules, reinforcement, generation carry-over.
- `evolution.ts`: generation change, mutations, feats, lineage timeline.
- `crafting.ts`: recipes (item + item -> item), tool usage on plants/animals.
- `intelligence.ts`: sense detection (range, cone), identification.
- `combat.ts`: predator encounter resolution, timed dodge/attack windows.
- `animalAI.ts`: FSM per species.
- `clan.ts`: recruitment, bonding, mating, baby carrying.

## World (src/world) — Three.js
- Terrain: 1024x1024 unit heightmap from layered simplex noise, biome mask, chunked meshes.
- Water level y=0 (lake/river). Vegetation via InstancedMesh; trees climbable.
- Sky dome shader, sun/moon, stars, day/night (1 game day = 12 real minutes), weather (rain).

## Controls
WASD move, Shift run, Space jump/climb, Ctrl drop down, Mouse look, LMB interact/attack,
RMB dodge, Q intelligence, E smell, R hearing, Tab neuronal, I inventory, F use held item,
1/2 swap hands, C call clan, G generation/evolution (at settlement), Esc pause, M map.

## Quality bar
- 60 fps on mid GPU at 1080p. Shadows, fog, tone mapping, procedural animation.
- All systems unit tested; e2e smoke: load, start game, move, sense, open neuronal, save/load.
