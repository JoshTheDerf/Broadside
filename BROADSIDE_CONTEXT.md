# Broadside — Project Context

This document provides the context needed to continue development on **Broadside**, a digital companion to Joshua's physical 3D-printed Age of Sail tabletop naval combat game. The previous development chat reached its length limit; this document captures the essential state so a new chat can pick up where it left off.

## Project Overview

**Broadside** is a two-player mobile web game (single HTML file) that serves as a digital implementation of a physical tabletop game of the same name. It's designed for shared-device play: one phone or tablet laid flat between two players, with Player 1 at the bottom and Player 2 at the top (the P2 UI is inverted 180°). Pirate-age Age of Sail theme — tall ships, broadside cannons, crew cards.

The original design spec describes a 3D-printed physical game with a spring-loaded cannon that fires disc projectiles at ship models on a grid mat. The digital version adapts those mechanics into a touchscreen-native experience.

## Deliverable Format

- **Primary output:** a single `broadside.html` file (~80KB) that renders as a live Claude artifact and can also be opened standalone in any browser
- **Secondary output:** a `broadside.zip` containing the single-file build plus the modular source tree
- **Build process:** Node.js script (`build.js`) concatenates modular source files into the single HTML bundle

## Architecture

The project uses a **modular-source / single-file-bundle** architecture. Source files are kept separate for maintainability but bundled into one HTML file for delivery.

### Source Tree

```
broadside/
├── build.js                    # Node script: concatenate + zip
├── src/
│   ├── index.html              # HTML template with placeholders
│   ├── styles.css              # All styles
│   ├── constants.js            # World constants, firing tables, card defs, colors
│   ├── state.js                # Game state creation, UI state vars, turn mgmt
│   ├── audio.js                # Web Audio API synthesized SFX + haptics
│   ├── animations.js           # Cannonball arcs, splashes, explosions
│   ├── renderer.js             # Canvas drawing (ocean, ships, terrain, UI overlays)
│   ├── cards.js                # 10 crew card effect implementations
│   └── main.js                 # Entry point, event handlers, turn flow, aim UI
└── build/
    ├── broadside.html          # Bundled output
    └── broadside.zip           # Source tree + bundled HTML
```

### Build Process

`build.js`:
1. Reads `src/index.html` as template
2. Reads `src/styles.css`, injects into `<!-- STYLES_PLACEHOLDER -->`
3. Concatenates JS files in dependency order, injects into `<!-- SCRIPTS_PLACEHOLDER -->`
4. Writes `build/broadside.html`
5. Zips `build/broadside.html` + `src/` into `build/broadside.zip`

**JS concatenation order (matters — dependencies flow downward):**
`constants.js` → `state.js` → `audio.js` → `animations.js` → `renderer.js` → `cards.js` → `main.js`

### Scope model

All files share a single global scope when concatenated. Variables are declared with plain `const`/`let` at the top level of each file — **no ES modules, no IIFE wrappers around the whole file, no imports/exports**. This is a deliberate choice to keep the bundle simple. If a variable is declared with `let` in one file and referenced from another, the declaring file must come earlier in the concatenation order.

## Core Game Mechanics

### Setup

- **World size:** 8×8 continuous world space (floating-point coordinates, no grid)
- **Ships:** 3 per player, each with 3 HP visualized as removable masts
- **Cards:** Shared deck of 40 cards (4 of each of 10 types), `HAND_SIZE = 3`
- **Home zones:** Bottom 2 units for P1, top 2 units for P2 (used during deployment)

### Turn Structure

Each ship gets **one action per turn**: Move, Fire, or Play Card. Players alternate turns. A "turn" means all three of your ships have had a chance to act (or you chose to skip).

- **Free-action cards** (marked with ⚡): don't consume a ship's action
- At end of turn, hand refills to `HAND_SIZE`

### Movement

- Tap a ship → radial menu appears (Move / Fire / Card)
- Tap Move → a **movement ring** appears around the ship at radius `SHIP_MOVE_RADIUS` (2.0 units)
- Tap **on the ring edge** (not inside) to set new position and heading
- Ship auto-rotates to face direction of travel
- Full Sail card: multi-ring `moveRings = [1, 2, 3, 4]` for flexible range
- Evasive Maneuvers card: single tight ring at `SHIP_EVASIVE_DIST` (1.0) for sideways slide

### Broadside Firing System (CRITICAL)

**Cannons fire from the SIDES only — no forward or aft fire.** This is the single most important mechanic and was the result of a major mid-development pivot.

Three-dial aiming:
1. **Side** — Port (left) or Starboard (right)
2. **Bearing** — Fore / Fore-Mid / Abeam / Aft-Mid / Aft (angle along the hull)
3. **Elevation** — Flat / Low Arc / Medium / High Arc / Steep Lob (controls range)

Firing computation (in `state.js` → `computeFiringSolution`):
1. Look up `FIRING_TABLE_PORT[bearing, elevation]` → `{dx, dy}` offset
2. If starboard selected, mirror the dx sign
3. Rotate the offset by the ship's heading (so a ship facing east fires north/south, not east/west)
4. Add Gaussian scatter that scales with elevation (higher arc = more scatter)

Firing table values (bearing 0-4 × elevation 0-4):
- Lateral range: `[1, 2, 3.5, 5.5, 7.5]` units (elevation)
- Bearing offset multipliers: `[-0.8, -0.4, 0, 0.4, 0.8]` (fore to aft along the hull)

### Aiming UI

- **Horizontal swipe sliders** with skeuomorphic detents for Bearing and Elevation (the earlier circular rotary knobs were too small on mobile)
- **Port/Starboard toggle buttons** color-coded red/green
- **Layout mirrors** based on selected side — controls feel spatially connected to firing direction
- **Fuzzy aim preview zone** on the board: a vague pulsing radial gradient showing approximate landing area, color-matched to selected side, deliberately imprecise

### Cannonball Animation

- Parabolic arc with height simulation
- Ball grows at arc peak (simulating altitude/depth perception)
- Ground shadow follows true trajectory below the ball
- Smoke trail follows curved path
- Higher elevation = taller arc = bigger peak size = slower flight
- Fiery glow at launch and impact moments
- Ghost balls (from Spotter card) rendered translucent

### Hit Detection

Distance-based, not cell-based: `dist(landing_point, ship_center) <= HIT_RADIUS` where `HIT_RADIUS ≈ 0.55` units. Boarding Party uses `dist <= 1.5`.

### The 10 Crew Cards

| Card | Icon | Free? | Effect |
|------|------|-------|--------|
| Lookout | 🔭 | ⚡ | Show distance to nearest enemy |
| Brace for Impact | 🛡️ | | Reduce next hit on this ship by 1 |
| Signal Flags | 🚩 | ⚡ | Give allied ship a bonus action |
| Full Sail | ⛵ | | Extended movement (4-ring) |
| Evasive Maneuvers | ↔️ | | Slide sideways without turning |
| Skilled Gunner | 🎯 | | Fire twice from one ship |
| Repair Crew | 🔧 | | Restore 1 HP (mast reappears) |
| Boarding Party | ⚔️ | | 1 damage to adjacent enemy (dist ≤ 1.5) |
| Spotter | 👁️ | | Ghost shot preview, then real shot |
| Smokescreen | 💨 | ⚡ | 50% miss chance vs this ship for 1 turn |

### Terrain

Circular zones with position + radius:
- **Island** (blocks movement, green/sand)
- **Rocks** (blocks movement, grey)
- **Reef** (non-blocking hazard, translucent brown)
- **Sea Fort** (blocks, destructible, HP 3)

Collision is radius-based: `dist(ship, terrain) < terrain.r + ship.r`.

Current implementation uses `TERRAIN_PRESETS` (fixed positions) — terrain placement phase was simplified out during the gridless rewrite.

## Key Visual/UX Details

- **Nautical chart aesthetic:** Very subtle reference lines every 2 units, compass rose, animated ocean waves. NO visible grid.
- **Player colors:** P1 red (`#b03232` hull, `#dc5050` sail), P2 blue (`#3250b0` hull, `#5078dc` sail)
- **Typography:** Cinzel (headings), IM Fell English (body) — both from Google Fonts
- **Gold accent color:** `#d4a853` for Victorian maritime feel
- **P2 UI inverted 180°** so both players see their own ship at the bottom of their view
- **Canvas sizing:** uses `100vh` viewport units, width-first scaling, resizes on phase transitions

## Major Development Milestones (History)

The game went through these major phases:

1. **Phase 1 MVP** — Single HTML file, 12×12 grid, basic movement/firing/HP/turns, P2 inverted UI
2. **Modularization** — Split into source modules with build script, added all 10 cards, tutorial, sound effects
3. **Broadside aiming pivot** — Replaced bow-firing with side-firing (Port/Starboard + Bearing + Elevation)
4. **Skeuomorphic dials** — Physical-feeling aim controls with detents, aim preview zone, arcing cannonball animation
5. **Horizontal swipe sliders** — Dials redesigned to be larger and mobile-friendly, mirror-layout based on side
6. **Gridless rewrite** — Coordinate system changed from integer grid to continuous float positions with ring-based movement
7. **World shrink** — 12×12 → 8×8 during gridless rewrite (required fixing stranded coordinates)
8. **Mobile layout fixes** — Viewport unit sizing, deferred canvas resize, ship scale tuning

## Known Open Issues

- **`aimPreviewData` declaration location:** Currently declared with `let` in `main.js` but referenced from `state.js`'s `deselectAll()`. Since `state.js` concatenates BEFORE `main.js`, this causes a reference error. **Fix:** move `let aimPreviewData = null;` to `state.js` (after `let deployFacing = 0;`) and remove the duplicate from `main.js`.

## What to Ask Joshua When Continuing

If Joshua wants to continue development, useful clarifying questions:

- Does he have the current HTML file to upload for disassembly into source modules?
- What's the next feature priority? (terrain placement phase, AI opponent, online play, sinking animations, etc.)
- Any bugs he's encountered in current build?
- Does the aiming feel right or need further tuning?

## How to Disassemble the Current HTML

If Joshua uploads `broadside.html`, the disassembly process is:

1. Extract everything between `<style>` and `</style>` → `src/styles.css`
2. Extract everything between `<script>` and `</script>` → split by `// ── filename.js ──` comment markers back into the 7 JS files
3. The remaining HTML (with `<style>` and `<script>` contents replaced by `<!-- STYLES_PLACEHOLDER -->` and `<!-- SCRIPTS_PLACEHOLDER -->`) → `src/index.html`
4. Recreate `build.js` from the structure described above

The build script's concatenation includes `// ── filename.js ──` header comments before each module, which makes disassembly straightforward.

## Joshua's Context

- COO at Creation Ministries International, comfortable with TypeScript, Python, SQL, Linux, wide range of web tech
- Designed the physical "Broadside" tabletop game with 3D-printed spring-loaded cannon mechanic
- This digital version is a companion to the physical game, not a replacement
- Prefers modular architecture with clean separation of concerns
- Appreciates thoughtful UX and skeuomorphic physicality in controls
