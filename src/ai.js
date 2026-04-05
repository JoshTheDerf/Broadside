// ═══════════════════════════════════════════════════════════════
// BROADSIDE — ai.js
// Tactical AI for computer-controlled players.
//
// Decision loop per ship:
//   1. Pick target (prefer damaged / close enemies)
//   2. Evaluate current position (broadside angle, flanking, range, LOS)
//   3. If good position + decent hit probability + clear LOS → fire
//   4. Otherwise → move to a better position (scored across 24 candidates)
//   5. After 2 consecutive misses → forced repositioning
// ═══════════════════════════════════════════════════════════════

const AI_DELAY = 500;  // ms between AI actions
const AI_THINK = 400;  // ms before first action

// Position scoring weights
const AI_OPTIMAL_RANGE   = 3.0;
const AI_MAX_RANGE       = 6.0;
const AI_FLANKING_BONUS  = 60;  // bonus for being at enemy bow/stern (they can't shoot back)
const AI_BROADSIDE_BONUS = 50;  // bonus for having enemy on our beam (we can shoot them)

// ─── Entry Point ───────────────────────────────────────

/** Check if the active player is AI-controlled and start their turn. */
function checkAiTurn() {
  if (G.phase === 'gameOver' || aiRunning) return;
  const ap = G.activePlayer;
  if (!aiControlled[ap]) return;

  aiRunning = true;
  if (G.phase === 'terrain')         setTimeout(() => aiPlaceTerrain(ap), AI_THINK);
  else if (G.phase === 'deployment') setTimeout(() => aiDeploy(ap), AI_THINK);
  else if (G.phase === 'playing')    setTimeout(() => aiPlayTurn(ap), AI_THINK);
  else aiRunning = false;
}

// ═══════════════════════════════════════════════════════════════
// TERRAIN PLACEMENT
// ═══════════════════════════════════════════════════════════════

function aiPlaceTerrain(ap) {
  if (!G.terrainPieces.length || G.phase !== 'terrain') {
    aiRunning = false;
    setTimeout(checkAiTurn, AI_DELAY);
    return;
  }
  const piece = G.terrainPieces[0];
  let placed = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = 1 + Math.random() * (WORLD_W - 2);
    const y = TERRAIN_EXCL_Y + 0.5 + Math.random() * (WORLD_H - TERRAIN_EXCL_Y * 2 - 1);
    if (canPlaceTerrainAt(x, y, piece.r)) {
      placeTerrainPiece(0, x, y);
      sfxSelect();
      placed = true;
      break;
    }
  }
  if (!placed) {
    G.terrainPieces = [];
    G.phase = 'deployment';
    G.activePlayer = 1;
  }
  refreshAllUI();
  aiRunning = false;
  setTimeout(checkAiTurn, AI_DELAY);
}

// ═══════════════════════════════════════════════════════════════
// FLEET DEPLOYMENT
// ═══════════════════════════════════════════════════════════════

function aiDeploy(ap) {
  const unplaced = G.players[ap].ships.filter(s => s.x < 0);
  if (!unplaced.length) {
    confirmDeployment();
    aiRunning = false;
    setTimeout(checkAiTurn, AI_DELAY);
    return;
  }
  const ship = unplaced[0];
  const zone = HOME_ZONE[ap];
  const idx = G.players[ap].ships.indexOf(ship);
  // Spread ships across width, angled for broadside readiness
  const angles = [ap === 1 ? -0.3 : 0.3, 0, ap === 1 ? 0.3 : -0.3];
  const heading = normAngle((ap === 1 ? 0 : Math.PI) + (angles[idx] || 0));
  const tx = WORLD_W * (0.25 + idx * 0.25) + (Math.random() - 0.5) * 0.6;
  const ty = (zone.yMin + zone.yMax) / 2 + (Math.random() - 0.5) * 0.4;
  if (canDeploy(tx, ty, ap)) {
    ship.x = tx; ship.y = ty; ship.heading = heading;
    sfxSelect();
  }
  refreshAllUI();
  setTimeout(() => aiDeploy(ap), AI_DELAY);
}

// ═══════════════════════════════════════════════════════════════
// TURN LOOP
// ═══════════════════════════════════════════════════════════════

function aiPlayTurn(ap) {
  if (G.phase === 'gameOver') { aiRunning = false; return; }
  const ships = G.players[ap].ships.filter(s => s.hp > 0 && !s.hasActed);
  if (!ships.length) {
    endTurn(); sfxTurnChange(); refreshAllUI();
    aiRunning = false;
    setTimeout(checkAiTurn, AI_DELAY);
    return;
  }

  const ship = ships[0];
  const enemy = ap === 1 ? 2 : 1;
  const enemies = G.players[enemy].ships.filter(s => s.hp > 0);
  if (!enemies.length) { aiRunning = false; return; }

  const target = aiPickTarget(ship, enemies);
  const posScore = aiScorePosition(ship, target);
  const bestShot = aiBestShot(ship, target);
  const hasLOS = !shotPathCheck(ship.x, ship.y, target.x, target.y);
  const misses = ship._aiMisses || 0;

  // Fire only with: clear LOS, good broadside, decent hitProb, not forced to reposition
  const shouldFire = misses < 2
    && hasLOS
    && bestShot.hitProb > 0.25
    && posScore.broadside > 0.7
    && posScore.distance < AI_MAX_RANGE;

  if (shouldFire) {
    aiFireAtTarget(ship, target, bestShot, ap);
  } else {
    if (misses >= 2) ship._aiMisses = 0;
    aiTacticalMove(ship, target, enemies, ap);
  }
}

// ═══════════════════════════════════════════════════════════════
// TARGET SELECTION
// ═══════════════════════════════════════════════════════════════

/** Pick the best target: prefer damaged ships and close targets. */
function aiPickTarget(ship, enemies) {
  let best = null, bestScore = -Infinity;
  enemies.forEach(es => {
    let score = (SHIP_HP - es.hp) * 20 - dist(ship.x, ship.y, es.x, es.y) * 5;
    if (es.hp === 1) score += 30;  // finish them off
    if (score > bestScore) { bestScore = score; best = es; }
  });
  return best;
}

// ═══════════════════════════════════════════════════════════════
// POSITION SCORING
// ═══════════════════════════════════════════════════════════════

/**
 * Score a ship's position relative to a target.
 * @returns {{ broadside: number, flanking: number, rangeScore: number, distance: number }}
 *   broadside: 0–1, how perpendicular the target is to our heading (1 = perfect beam)
 *   flanking:  0–1, how much we're at the enemy's bow/stern (1 = can't return fire)
 *   rangeScore: 0–1, how close to optimal firing distance
 *   distance: raw distance
 */
function aiScorePosition(ship, target) {
  const d = dist(ship.x, ship.y, target.x, target.y);
  const angleToTarget = normAngle(Math.atan2(target.x - ship.x, -(target.y - ship.y)));
  const relAngle = normAngle(angleToTarget - ship.heading);
  const broadside = Math.abs(Math.sin(relAngle));
  const enemyAngle = normAngle(Math.atan2(ship.x - target.x, -(ship.y - target.y)) - target.heading);
  const flanking = 1 - Math.abs(Math.sin(enemyAngle));
  const rangeScore = Math.max(0, 1 - Math.abs(d - AI_OPTIMAL_RANGE) / AI_OPTIMAL_RANGE);
  return { broadside, flanking, rangeScore, distance: d };
}

// ═══════════════════════════════════════════════════════════════
// BEST FIRING SOLUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Find the dial settings that land closest to the target, accounting for scatter.
 * @returns {{ side, bearing, elevation, accuracy, hitProb }}
 */
function aiBestShot(ship, target) {
  let bestSide = 0, bestB = 2, bestE = 2, bestDist = Infinity;

  for (let side = 0; side < 2; side++) {
    for (let b = 0; b < 5; b++) {
      for (let e = 0; e < 5; e++) {
        const base = FIRING_TABLE_PORT[`${b},${e}`];
        if (!base) continue;
        const mir = { dx: side === 1 ? -base.dx : base.dx, dy: base.dy };
        const off = rotVec(mir.dx, mir.dy, ship.heading);
        const rawD = dist(ship.x + off.dx, ship.y + off.dy, target.x, target.y);
        const scatter = 0.25 + e * 0.18;
        const effective = rawD + scatter * 1.2;  // penalize high-scatter shots
        if (effective < bestDist) {
          bestDist = effective; bestSide = side; bestB = b; bestE = e;
        }
      }
    }
  }

  // Estimate hit probability
  const scatter = 0.25 + bestE * 0.18;
  const base = FIRING_TABLE_PORT[`${bestB},${bestE}`] || { dx: 0, dy: 0 };
  const mir = { dx: bestSide === 1 ? -base.dx : base.dx, dy: base.dy };
  const off = rotVec(mir.dx, mir.dy, ship.heading);
  const rawD = dist(ship.x + off.dx, ship.y + off.dy, target.x, target.y);
  const hitProb = Math.max(0, Math.min(0.9, HIT_RADIUS / (rawD + scatter + 0.1)));

  return { side: bestSide, bearing: bestB, elevation: bestE, accuracy: bestDist, hitProb };
}

// ═══════════════════════════════════════════════════════════════
// TACTICAL MOVEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate 24 candidate positions around the movement ring and pick the best one.
 * Scoring factors: closing distance, broadside alignment, flanking, LOS, friendly spacing.
 */
function aiTacticalMove(ship, target, allEnemies, ap) {
  const moveR = SHIP_MOVE_RADIUS;
  const currentDist = dist(ship.x, ship.y, target.x, target.y);
  let bestCandidate = null, bestScore = -Infinity;

  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    let cx = ship.x + Math.sin(angle) * moveR;
    let cy = ship.y - Math.cos(angle) * moveR;
    cx = Math.max(0.5, Math.min(WORLD_W - 0.5, cx));
    cy = Math.max(0.5, Math.min(WORLD_H - 0.5, cy));
    if (!canMoveTo(ship, cx, cy)) continue;

    const heading = angleDelta(cx - ship.x, cy - ship.y);
    const virt = { x: cx, y: cy, heading };
    const ps = aiScorePosition(virt, target);
    let score = 0;

    // Close the distance — primary goal when maneuvering
    const closingDelta = currentDist - ps.distance;
    if (ps.distance > AI_OPTIMAL_RANGE) {
      score += closingDelta * 30;
      score -= Math.max(0, ps.distance - AI_OPTIMAL_RANGE) * 10;
    } else {
      score += ps.rangeScore * 25;
    }

    // Broadside & flanking
    score += ps.broadside * AI_BROADSIDE_BONUS;
    score += ps.flanking * AI_FLANKING_BONUS;

    // "Ready to fire next turn" — only if LOS is clear
    const shot = aiBestShot(virt, target);
    const los = !shotPathCheck(cx, cy, target.x, target.y);
    if (los && shot.hitProb > 0.3 && ps.broadside > 0.7) score += 40;
    else if (los && shot.hitProb > 0.15) score += 10;
    else if (!los) score -= 10;

    // Avoid clustering with friendlies
    G.players[ap].ships.forEach(fs => {
      if (fs.id === ship.id || fs.hp <= 0) return;
      const fd = dist(cx, cy, fs.x, fs.y);
      if (fd < 2.0) score -= (2.0 - fd) * 12;
    });

    // Don't ram enemies
    allEnemies.forEach(es => {
      const ed = dist(cx, cy, es.x, es.y);
      if (ed < 1.2) score -= (1.2 - ed) * 18;
    });

    // Slight center preference + randomness
    score -= dist(cx, cy, WORLD_W / 2, WORLD_H / 2) * 0.3;
    score += (Math.random() - 0.5) * 4;

    if (score > bestScore) { bestScore = score; bestCandidate = { x: cx, y: cy }; }
  }

  if (bestCandidate) {
    ship.heading = angleDelta(bestCandidate.x - ship.x, bestCandidate.y - ship.y);
    ship.x = bestCandidate.x;
    ship.y = bestCandidate.y;
    sfxMove();
  }
  ship.hasActed = true;
  refreshAllUI();
  setTimeout(() => aiPlayTurn(ap), AI_DELAY);
}

// ═══════════════════════════════════════════════════════════════
// FIRE EXECUTION
// ═══════════════════════════════════════════════════════════════

function aiFireAtTarget(ship, target, shot, ap) {
  const enemy = ap === 1 ? 2 : 1;

  // Slight imperfection (25% chance of ±1 on each dial)
  let b = shot.bearing, e = shot.elevation;
  if (Math.random() < 0.25) b = Math.max(0, Math.min(4, b + (Math.random() < 0.5 ? -1 : 1)));
  if (Math.random() < 0.25) e = Math.max(0, Math.min(4, e + (Math.random() < 0.5 ? -1 : 1)));

  aimSide = shot.side; aimBearing = b; aimElev = e;
  selectedShip = ship; actionMode = 'fire';

  const landing = computeFiringSolution(ship, aimSide, aimBearing, aimElev);
  const s = w2s(ship.x, ship.y);
  const ep = w2s(landing.x, landing.y);
  stats[ap].shots++;
  sfxFire();
  ship.hasActed = true;

  animCannonball(s.x, s.y, ep.x, ep.y, false, aimElev).then(() => {
    // Terrain interception
    const pathHit = shotPathCheck(ship.x, ship.y, landing.x, landing.y);
    if (pathHit) {
      const hp = w2s(pathHit.hitX, pathHit.hitY);
      animTerrainHit(hp.x, hp.y);
      ship._aiMisses = (ship._aiMisses || 0) + 1;
      deselectAll(); refreshAllUI();
      setTimeout(() => aiPlayTurn(ap), AI_DELAY);
      return;
    }

    // Ship hit check
    const hitShip = G.players[enemy].ships.find(es =>
      es.hp > 0 && dist(landing.x, landing.y, es.x, es.y) <= HIT_RADIUS
    );

    if (hitShip) {
      ship._aiMisses = 0;
      let dmg = 1;
      if (hitShip.braced) { dmg = Math.max(0, dmg - 1); hitShip.braced = false; }
      if (hitShip.smoked && Math.random() < 0.5) dmg = 0;
      if (dmg > 0) {
        hitShip.hp = Math.max(0, hitShip.hp - dmg);
        stats[ap].hits++;
        animHitFlash(ep.x, ep.y);
        animDamageNumber(ep.x, ep.y, `-${dmg}`);
        if (hitShip.hp <= 0) {
          stats[ap].shipsSunk++;
          setTimeout(() => animSinking(ep.x, ep.y), 200);
          if (allShipsSunk(enemy)) { setTimeout(() => triggerGameOver(ap), 1800); aiRunning = false; return; }
        } else { sfxMastFall(); }
      } else {
        ship._aiMisses = (ship._aiMisses || 0) + 1;
        animDamageNumber(ep.x, ep.y, 'Blocked!');
        animSplash(ep.x, ep.y);
      }
    } else {
      ship._aiMisses = (ship._aiMisses || 0) + 1;
      animSplash(ep.x, ep.y);
    }

    deselectAll(); refreshAllUI();
    setTimeout(() => aiPlayTurn(ap), AI_DELAY);
  });

  deselectAll(); refreshAllUI();
}
