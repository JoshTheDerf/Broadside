// ═══════════════════════════════════════════════════════════════
// BROADSIDE — constants.js
// World configuration, math utilities, data tables, and theme
// ═══════════════════════════════════════════════════════════════

// ─── World ─────────────────────────────────────────────
// Continuous coordinate space. Origin (0,0) is top-left.
// P1 deploys at the bottom (high Y), P2 at the top (low Y).
const WORLD_W = 10;
const WORLD_H = 10;

// ─── Game Rules ────────────────────────────────────────
const SHIP_HP    = 3;   // hit points per ship (displayed as masts)
const HAND_SIZE  = 3;   // cards drawn per turn
const P1 = 1, P2 = 2;  // player identifiers

// ─── Ship Properties ──────────────────────────────────
const SHIP_RADIUS        = 0.35; // collision & visual radius
const SHIP_MOVE_RADIUS   = 1.8;  // normal movement distance (ring radius)
const SHIP_FULL_SAIL     = 3.5;  // Full Sail card movement distance
const SHIP_EVASIVE_DIST  = 0.9;  // Evasive Maneuvers sideslip distance
const SHIP_ADJACENT_DIST = 1.3;  // max distance for Boarding Party
const SHIP_MIN_SEP       = 0.7;  // minimum allowed distance between any two ships
const HIT_RADIUS         = 0.45; // how close a cannonball must land to hit a ship

// ─── Zones ─────────────────────────────────────────────
// Home zones for fleet deployment
const HOME_ZONE = {
  1: { yMin: WORLD_H - 2.2, yMax: WORLD_H - 0.3 },
  2: { yMin: 0.3,           yMax: 2.2 },
};
// Terrain cannot be placed within this distance of the top/bottom edges
const TERRAIN_EXCL_Y = 2.2;

// ─── Math Utilities ────────────────────────────────────
// All angles are radians: 0 = North (screen up), clockwise positive.

/** Normalize angle to [0, 2π) */
function normAngle(a) {
  a = a % (Math.PI * 2);
  return a < 0 ? a + Math.PI * 2 : a;
}

/** Heading angle from a delta vector. 0=N, π/2=E, π=S, 3π/2=W */
function angleDelta(dx, dy) {
  return normAngle(Math.atan2(dx, -dy));
}

/** Rotate vector (dx,dy) by heading h. Used to transform ship-local offsets to world coords. */
function rotVec(dx, dy, h) {
  const c = Math.cos(h), s = Math.sin(h);
  return { dx: c * dx - s * dy, dy: s * dx + c * dy };
}

/** Euclidean distance between two points */
function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ─── Broadside Aiming System ───────────────────────────
// Cannons fire from the SIDES of the ship (port/starboard), never the bow or stern.
// Three controls: Side, Bearing (fore/aft angle along hull), Elevation (arc height = range).
const SIDE_LABELS    = ['Port', 'Starboard'];
const BEARING_LABELS = ['Fore', 'Fore-Mid', 'Abeam', 'Aft-Mid', 'Aft'];
const ELEV_LABELS    = ['Flat', 'Low Arc', 'Medium', 'High Arc', 'Steep Lob'];

// Firing table: key "bearing,elevation" → {dx, dy} offset for PORT side, heading=0 (North).
// Port fires to the LEFT (negative dx). Starboard mirrors dx at runtime.
// Bearing shifts the shot fore (negative dy) or aft (positive dy).
// Elevation controls lateral range (how far the ball travels sideways from the ship).
const FIRING_TABLE_PORT = {};
(function buildFiringTable() {
  const lateralRange = [0.8, 1.6, 2.8, 4.5, 6.2]; // distance per elevation step
  const bearingShift = [-0.8, -0.4, 0, 0.4, 0.8];  // fore/aft factor, multiplied by range
  for (let b = 0; b < 5; b++) {
    for (let e = 0; e < 5; e++) {
      const range = lateralRange[e];
      FIRING_TABLE_PORT[`${b},${e}`] = {
        dx: -range,                    // port = left = negative X
        dy: bearingShift[b] * range,   // fore = negative Y, aft = positive Y
      };
    }
  }
})();

// ─── Crew Cards ────────────────────────────────────────
// Cards marked free:true are free actions (⚡) — they don't consume a ship's turn.
const CARD_DEFS = {
  lookout:        { name: 'Lookout',           icon: '🔭', desc: 'Measure distance to nearest enemy',    free: true  },
  brace:          { name: 'Brace for Impact',  icon: '🛡️', desc: 'Reduce next hit by 1',                 free: false },
  signal_flags:   { name: 'Signal Flags',      icon: '🚩', desc: 'Give ally a bonus action',             free: true  },
  full_sail:      { name: 'Full Sail',         icon: '⛵', desc: 'Extended movement range',              free: false },
  evasive:        { name: 'Evasive Maneuvers', icon: '↔️', desc: 'Slide sideways without turning',       free: false },
  skilled_gunner: { name: 'Skilled Gunner',    icon: '🎯', desc: 'Fire twice from one ship',             free: false },
  repair_crew:    { name: 'Repair Crew',       icon: '🔧', desc: 'Restore 1 HP',                        free: false },
  boarding_party: { name: 'Boarding Party',    icon: '⚔️', desc: 'Damage a nearby enemy',                free: false },
  spotter:        { name: 'Spotter',           icon: '👁️', desc: 'Ghost shot then real shot',             free: false },
  smokescreen:    { name: 'Smokescreen',       icon: '💨', desc: 'Harder to hit for 1 turn',             free: true  },
};
const ALL_CARD_IDS = Object.keys(CARD_DEFS);

// ─── Terrain ───────────────────────────────────────────
// Terrain pieces are circles defined by {type, x, y, r}.
// "blocks" means ships cannot enter and cannonballs are stopped.
const TERRAIN_DEFS = {
  island:   { name: 'Island',   blocks: true,  color: '#3a7a3a', sand: '#c4a265' },
  rocks:    { name: 'Rocks',    blocks: true,  color: '#555'                      },
  reef:     { name: 'Reef',     blocks: false, color: 'rgba(160,120,60,.3)'       },
  sea_fort: { name: 'Sea Fort', blocks: true,  color: '#6a6a5a', hp: 3, destructible: true },
};

// Default terrain layout for Quick Play / Solo Play
const TERRAIN_PRESETS = [
  { type: 'island', x: 3.0, y: 4.8, r: 1.0  },
  { type: 'island', x: 7.2, y: 5.5, r: 0.95 },
  { type: 'rocks',  x: 5.0, y: 3.5, r: 0.45 },
  { type: 'rocks',  x: 4.2, y: 6.8, r: 0.45 },
  { type: 'reef',   x: 8.0, y: 4.0, r: 0.55 },
  { type: 'reef',   x: 2.0, y: 6.0, r: 0.55 },
];

// ─── Theme Colors ──────────────────────────────────────
const COLORS = {
  ocean_deep:      '#0d2a42',
  ocean_mid:       '#1a4a6e',
  wave_line:       'rgba(120,180,220,.06)',
  chart_line:      'rgba(200,220,240,.04)',
  chart_label:     'rgba(200,220,240,.12)',
  gold:            '#d4a853',
  gold_dim:        'rgba(212,168,83,.4)',
  p1_hull:         '#b03232',
  p1_sail:         '#dc5050',
  p1_banner:       'rgba(140,30,30,.85)',
  p2_hull:         '#3250b0',
  p2_sail:         '#5078dc',
  p2_banner:       'rgba(30,60,140,.85)',
  move_ring:       'rgba(46,204,113,.2)',
  move_ring_border:'rgba(46,204,113,.6)',
  smoke_trail:     'rgba(120,120,120,.3)',
  cannonball:      '#1a1a1a',
  terrain_sand:    '#c4a265',
};
