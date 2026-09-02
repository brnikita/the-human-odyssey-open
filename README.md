# The Human Odyssey

A browser survival and evolution game inspired by *Ancestors: The Humankind Odyssey*.
Guide a clan of hominids through prehistoric Africa, 10 million years ago. Explore an
unknown world, use your senses to identify everything around you, survive predators,
raise babies, unlock neurons and pass your knowledge on to the next generation.
Reach 2 million years ago with a living lineage to win.

Everything in the game is procedural: terrain, vegetation, creatures, characters, sky,
water and sound. There are no external assets. It runs entirely in the browser.

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build: `npm run build` (output in `dist/`, serve statically).

### Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Run |
| Space | Jump / climb tree (near a trunk) |
| Ctrl / X | Climb down, drop from canopy |
| Mouse | Look (click the game to lock the pointer) |
| Wheel | Camera distance |
| Left click | Interact: pick up, harvest, drink, groom, attack |
| Right click | Dodge (time it with the DODGE! prompt) |
| Q (hold) | Intelligence mode: time slows, senses reveal things |
| E / R | Switch to smell / hearing in intelligence mode |
| Left click (in Q) | Hold to identify the focused thing |
| F | Eat / use held item |
| 1 | Alter a held item, or combine both hands |
| Z / V | Drop left / right item |
| Tab | Neuronal network |
| I / T / M | Knowledge, clan, map panels |
| C | Call the clan, or intimidate a nearby predator |
| N | Sleep (at the settlement) |
| G | Generation change / evolution leap (at the settlement) |
| H | Help |
| Esc | Pause |

### How it plays

- **Fear and dopamine.** Unknown territory raises fear. Discoveries give dopamine.
  If fear maxes out you panic: find the glowing lights to calm down.
- **Intelligence.** Hold Q and look, smell or listen. Unknown things show as dashed
  markers. Identify them for neuronal energy. Smell and hearing identification need
  the matching neurons.
- **Survival.** Hunger, thirst, energy and health. Bleeding, poison, fractures and
  cold have plant cures: horsetail, natal grass, kapok fiber and khat.
- **Tools.** Granite stone altered with `1` becomes a grinder. Stick + grinder
  makes a sharpened stick. Obsidian or basalt + granite makes a chopper. Coconuts
  break with a stone.
- **Predators** telegraph their attack. Dodge with the right mouse button when the
  prompt appears. A perfect dodge with the Counter Attack neuron opens a counter.
- **Clan.** Groom clan members, carry babies to learn faster, feed and groom
  outsiders to recruit them, mate at the settlement.
- **Landmarks.** Six unique places are hidden in the world: the Great Baobab, a stone
  arch, ancient bones, a hot spring that cures the cold, a dark cave and a fallen giant.
  Identify them for a big neuronal energy bonus; they then appear on the map.
- **Settings.** Graphics quality (auto adapts to your GPU), volume, mouse sensitivity
  and inverted look are in the Settings screen and persist between sessions.
- **Generations.** At the settlement with offspring, press G. Babies grow, elders
  pass, un-reinforced neurons are forgotten and newborns may carry mutations.
  An evolution leap also jumps the lineage forward in time, reduced by the feats
  you achieved.

## Development

```bash
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright, headless Chromium)
npm run typecheck
```

### Architecture

- `src/core` — game loop, input, clock, audio, save, orchestrator (`game.ts`).
- `src/systems` — pure logic: survival, fear, intelligence, neuronal, evolution,
  clan, crafting, combat, animal AI, plus the Three.js player controller.
- `src/world` — procedural terrain, vegetation, sky, water and the scene container.
- `src/render` — procedural character, animal and item models with animation.
- `src/data` — items, plants, species, neurons, feats.
- `src/ui` — HUD, screens, neuronal network canvas, panels.
- `tests/unit`, `tests/e2e` — 220+ unit tests, a deterministic Playwright gameplay suite and a visual smoke spec that stores screenshots in `test-results/screens`.

See `docs/DESIGN.md` for the design contract.

Performance adapts automatically: on weak GPUs the render resolution and view
distances are reduced until the frame rate is stable.

## По-русски

«Одиссея человека» — браузерная игра о выживании и эволюции по мотивам
*Ancestors: The Humankind Odyssey*. Вы управляете кланом гоминидов в Африке
10 миллионов лет назад: исследуйте неизвестный мир, распознавайте всё вокруг с помощью
зрения, обоняния и слуха, выживайте среди хищников, растите детёнышей, открывайте
нейроны и передавайте знания следующим поколениям. Цель — довести род до отметки
2 миллиона лет назад.

Язык интерфейса определяется автоматически по языку браузера и переключается в
настройках. Управление: WASD — движение, Shift — бег, пробел — прыжок/лазание,
Q — режим чувств, ЛКМ — взаимодействие/атака, ПКМ — уклонение, F — съесть,
1 — изменить/соединить предметы, Tab — нейронная сеть, I/T/M — знания/клан/карта,
C — позвать клан или запугать хищника, N — спать, G — смена поколения, H — помощь.

Запуск: `npm install && npm run dev`, затем откройте http://localhost:5173.
