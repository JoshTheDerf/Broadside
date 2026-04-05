// ═══════════════════════════════════════════════════════════════
// BROADSIDE — state.js
// Game state, spatial queries, validation, and turn management
// ═══════════════════════════════════════════════════════════════

// ─── Core State ────────────────────────────────────────
let G = null;  // the game state object — set by createGameState()
let stats = { 1: { shots: 0, hits: 0, shipsSunk: 0 }, 2: { shots: 0, hits: 0, shipsSunk: 0 } };

// ─── UI State (shared across modules) ──────────────────
let selectedShip    = null;   // currently selected ship object, or null
let actionMode      = null;   // null | 'move' | 'fire' | 'card' | 'deploy' | 'terrain_place'
let moveRings       = [];     // array of radii for ring-snap movement
let aimSide         = 0;      // 0=port, 1=starboard
let aimBearing      = 2;      // 0–4 (Fore → Aft)
let aimElev         = 2;      // 0–4 (Flat → Steep)
let selectedCard    = null;   // index into active player's hand, or null
let aimPreviewData  = null;   // {cx, cy, radius, side} for aim zone preview
let deployFacing    = 0;      // heading in radians for fleet deployment
let selectedTerrainIdx = -1;  // index into G.terrainPieces during placement

// ─── AI State ──────────────────────────────────────────
let aiControlled = { 1: false, 2: false };
let aiRunning    = false;

// ═══════════════════════════════════════════════════════════════
// DECK
// ═══════════════════════════════════════════════════════════════

/** Create a shuffled deck containing 4 copies of each card type. */
function shuffleDeck() {
  const d = [];
  for (let i = 0; i < 4; i++) ALL_CARD_IDS.forEach(c => d.push(c));
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ═══════════════════════════════════════════════════════════════
// GAME STATE CREATION
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new game state.
 * @param {boolean} skipSetup  If true, use preset terrain/positions and go straight to 'playing'.
 *                             If false, start at 'terrain' placement phase.
 */
function createGameState(skipSetup) {
  const deck = shuffleDeck();

  function makeShip(id, heading, name) {
    return {
      id, x: -1, y: -1, heading,
      hp: SHIP_HP, maxHp: SHIP_HP,
      hasActed: false, braced: false, smoked: false, signaled: false,
      name,
    };
  }

  const state = {
    phase: skipSetup ? 'playing' : 'terrain',
    activePlayer: 1,
    terrain: [],
    terrainPieces: skipSetup ? [] : [
      { type: 'island', r: 1.0  },
      { type: 'island', r: 0.9  },
      { type: 'rocks',  r: 0.45 },
      { type: 'rocks',  r: 0.45 },
      { type: 'reef',   r: 0.5  },
      { type: 'reef',   r: 0.5  },
    ],
    players: {
      1: {
        ships: [
          makeShip('p1_s1', 0, 'Vanguard'),
          makeShip('p1_s2', 0, 'Resolute'),
          makeShip('p1_s3', 0, 'Defiance'),
        ],
        hand: [deck.pop(), deck.pop(), deck.pop()],
      },
      2: {
        ships: [
          makeShip('p2_s1', Math.PI, 'Sovereign'),
          makeShip('p2_s2', Math.PI, 'Tempest'),
          makeShip('p2_s3', Math.PI, 'Stormchaser'),
        ],
        hand: [deck.pop(), deck.pop(), deck.pop()],
      },
    },
    deck,
    fortHp: {},  // key "x,y" → remaining HP for destructible sea forts
    turn: 1,
  };

  // Quick Play: preset positions
  if (skipSetup) {
    state.terrain = TERRAIN_PRESETS.map(t => ({ type: t.type, x: t.x, y: t.y, r: t.r }));
    const s1 = state.players[1].ships, s2 = state.players[2].ships;
    s1[0].x = 2.5; s1[0].y = 8.8;
    s1[1].x = 5.0; s1[1].y = 9.0;
    s1[2].x = 7.5; s1[2].y = 8.8;
    s2[0].x = 2.5; s2[0].y = 1.2;
    s2[1].x = 5.0; s2[1].y = 1.0;
    s2[2].x = 7.5; s2[2].y = 1.2;
  }

  return state;
}

// ═══════════════════════════════════════════════════════════════
// SPATIAL QUERIES
// ═══════════════════════════════════════════════════════════════

/** Find a living ship near world coords (wx,wy). Returns {ship, player} or null. */
function findShipNear(wx, wy, player, radius) {
  const r = radius || SHIP_RADIUS * 2;
  const players = player ? [player] : [1, 2];
  for (const p of players) {
    for (const s of G.players[p].ships) {
      if (s.hp <= 0 || s.x < 0) continue;
      if (dist(s.x, s.y, wx, wy) <= r) return { ship: s, player: p };
    }
  }
  return null;
}

/** Check if all of a player's ships are sunk. */
function allShipsSunk(p) {
  return G.players[p].ships.every(s => s.hp <= 0);
}

/** Get array of living ships for a player. */
function livingShips(p) {
  return G.players[p].ships.filter(s => s.hp > 0);
}

/** Find terrain circle at a world point. */
function terrainAt(wx, wy) {
  return G.terrain.find(t => dist(t.x, t.y, wx, wy) <= t.r);
}

/** Check if a world point is inside blocking terrain. */
function isBlockedAt(wx, wy) {
  const t = terrainAt(wx, wy);
  return t ? (TERRAIN_DEFS[t.type] && TERRAIN_DEFS[t.type].blocks) : false;
}

/** Check if a world point is within the play area. */
function inBounds(wx, wy) {
  return wx >= 0 && wx <= WORLD_W && wy >= 0 && wy <= WORLD_H;
}

// ═══════════════════════════════════════════════════════════════
// LINE-OF-SIGHT & PATH COLLISION
// ═══════════════════════════════════════════════════════════════

/**
 * Test if line segment (x1,y1)→(x2,y2) intersects circle (cx,cy,r).
 * Uses quadratic formula on parametric ray vs circle.
 */
function lineIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 0.0001) return dist(x1, y1, cx, cy) < r;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}

/** Check if a straight path is clear of blocking terrain. */
function pathClear(ax, ay, bx, by) {
  for (const t of G.terrain) {
    if (!TERRAIN_DEFS[t.type] || !TERRAIN_DEFS[t.type].blocks) continue;
    if (lineIntersectsCircle(ax, ay, bx, by, t.x, t.y, t.r + SHIP_RADIUS * 0.5)) return false;
  }
  return true;
}

/**
 * Check if a cannonball's path from (sx,sy) to (lx,ly) crosses blocking terrain.
 * Returns { terrain, hitX, hitY } of the first intersection, or null if clear.
 */
function shotPathCheck(sx, sy, lx, ly) {
  let closest = null, closestT = Infinity;
  for (const t of G.terrain) {
    if (!TERRAIN_DEFS[t.type] || !TERRAIN_DEFS[t.type].blocks) continue;
    const dx = lx - sx, dy = ly - sy;
    const fx = sx - t.x, fy = sy - t.y;
    const a = dx * dx + dy * dy;
    if (a < 0.0001) continue;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - t.r * t.r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const sqrtD = Math.sqrt(disc);
    const t1 = (-b - sqrtD) / (2 * a);
    if (t1 > 0.05 && t1 < 1 && t1 < closestT) {
      closestT = t1;
      closest = { terrain: t, hitX: sx + dx * t1, hitY: sy + dy * t1 };
    }
  }
  return closest;
}

// ═══════════════════════════════════════════════════════════════
// MOVEMENT VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a ship can move to (tx,ty).
 * Validates: bounds, blocking terrain at destination, ship separation,
 * and that the path doesn't cross any blocking terrain.
 */
function canMoveTo(ship, tx, ty) {
  if (!inBounds(tx, ty)) return false;
  for (const t of G.terrain) {
    if (TERRAIN_DEFS[t.type] && TERRAIN_DEFS[t.type].blocks) {
      if (dist(tx, ty, t.x, t.y) < t.r + SHIP_RADIUS) return false;
    }
  }
  for (const p of [1, 2]) {
    for (const s of G.players[p].ships) {
      if (s.id === ship.id || s.hp <= 0 || s.x < 0) continue;
      if (dist(tx, ty, s.x, s.y) < SHIP_MIN_SEP) return false;
    }
  }
  if (ship.x >= 0 && !pathClear(ship.x, ship.y, tx, ty)) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════
// FIRING
// ═══════════════════════════════════════════════════════════════

/** Box-Muller gaussian random number (mean 0, stddev 1). */
function gaussRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Compute where a cannonball lands given ship state and dial settings.
 * Looks up the base offset from the firing table, mirrors for starboard,
 * rotates by ship heading, and applies gaussian scatter.
 * @returns {{x: number, y: number}} world-space landing point
 */
function computeFiringSolution(ship, side, bearing, elev) {
  const base = FIRING_TABLE_PORT[`${bearing},${elev}`] || { dx: -3, dy: 0 };
  const mirrored = { dx: side === 1 ? -base.dx : base.dx, dy: base.dy };
  const offset = rotVec(mirrored.dx, mirrored.dy, ship.heading);
  const scatter = 0.25 + elev * 0.18;
  return {
    x: ship.x + offset.dx + gaussRandom() * scatter,
    y: ship.y + offset.dy + gaussRandom() * scatter,
  };
}

// ═══════════════════════════════════════════════════════════════
// TURN MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/** End the active player's turn: reset ship flags, draw cards, switch player. */
function endTurn() {
  const ap = G.activePlayer;
  G.players[ap].ships.forEach(s => {
    s.hasActed = false;
    s.smoked = false;
    s.signaled = false;
  });
  while (G.players[ap].hand.length < HAND_SIZE && G.deck.length > 0) {
    G.players[ap].hand.push(G.deck.pop());
  }
  if (G.deck.length < 5) G.deck = G.deck.concat(shuffleDeck());
  G.activePlayer = ap === 1 ? 2 : 1;
  G.turn++;
  deselectAll();
}

/** Clear all UI selection state. */
function deselectAll() {
  selectedShip = null;
  actionMode = null;
  selectedCard = null;
  aimPreviewData = null;
  moveRings = [];
}

// ═══════════════════════════════════════════════════════════════
// DEPLOYMENT VALIDATION
// ═══════════════════════════════════════════════════════════════

/** Check if a ship can be placed at (x,y) during deployment. */
function canDeploy(x, y, player) {
  const z = HOME_ZONE[player];
  if (y < z.yMin || y > z.yMax) return false;
  if (!inBounds(x, y)) return false;
  if (isBlockedAt(x, y)) return false;
  for (const s of G.players[player].ships) {
    if (s.x >= 0 && dist(x, y, s.x, s.y) < SHIP_MIN_SEP) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// TERRAIN PLACEMENT VALIDATION
// ═══════════════════════════════════════════════════════════════

/** Check if terrain of radius r can be placed at (x,y). */
function canPlaceTerrainAt(x, y, r) {
  if (!inBounds(x, y)) return false;
  if (y < TERRAIN_EXCL_Y || y > WORLD_H - TERRAIN_EXCL_Y) return false;
  for (const t of G.terrain) {
    if (dist(x, y, t.x, t.y) < r + t.r + 0.2) return false;
  }
  return true;
}

/** Place a terrain piece from the terrainPieces queue at (x,y). Returns true on success. */
function placeTerrainPiece(idx, x, y) {
  const piece = G.terrainPieces[idx];
  if (!piece || !canPlaceTerrainAt(x, y, piece.r)) return false;
  G.terrain.push({ type: piece.type, x, y, r: piece.r });
  G.terrainPieces.splice(idx, 1);
  G.activePlayer = G.activePlayer === 1 ? 2 : 1;
  selectedTerrainIdx = -1;
  if (G.terrainPieces.length === 0) {
    G.phase = 'deployment';
    G.activePlayer = 1;
  }
  return true;
}
