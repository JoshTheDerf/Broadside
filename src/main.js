// ═══════════════════════════════════════════════════════════════
// BROADSIDE — main.js
// Game controller: initialization, game loop, DOM UI building,
// canvas input handling, aiming panel, and turn flow.
// ═══════════════════════════════════════════════════════════════

let gameStarted = false;

// ═══════════════════════════════════════════════════════════════
// GAME INITIALIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Start a new game.
 * @param {boolean} skipSetup     Skip terrain/deployment phases (Quick Play)
 * @param {boolean} keepAiState   Don't reset AI toggles (used by startSolo)
 */
function startGame(skipSetup, keepAiState) {
  document.getElementById('titleScreen').style.display = 'none';
  document.getElementById('gameContainer').style.display = 'flex';
  document.getElementById('gameOverScreen').style.display = 'none';
  if (!keepAiState) { aiControlled[1] = false; aiControlled[2] = false; aiRunning = false; }
  G = createGameState(skipSetup);
  stats = { 1: { shots: 0, hits: 0, shipsSunk: 0 }, 2: { shots: 0, hits: 0, shipsSunk: 0 } };
  initCanvas(); initAudio(); buildAllUI(); resizeCanvas();
  canvas.addEventListener('pointerdown', onCanvasTap);
  window.addEventListener('resize', resizeCanvas);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);
  document.addEventListener('fullscreenchange', () => setTimeout(resizeCanvas, 100));
  document.addEventListener('webkitfullscreenchange', () => setTimeout(resizeCanvas, 100));
  gameStarted = true;
  requestAnimationFrame(() => { resizeCanvas(); requestAnimationFrame(gameLoop); });
}

/** Start a solo game (P1=human, P2=AI, Quick Play). */
function startSolo() {
  aiControlled[1] = false; aiControlled[2] = true; aiRunning = false;
  startGame(true, true);
}

function gameLoop(ts) {
  if (!gameStarted) return;
  updateAnimations(ts);
  drawFrame();
  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════════════════════════
// DOM UI BUILDING
// ═══════════════════════════════════════════════════════════════

function buildAllUI() { buildPlayerAreaUI(1); buildPlayerAreaUI(2); updateTurnBanner(); }
function refreshAllUI() { buildAllUI(); }

/** Build the control strip for one player. Content depends on game phase. */
function buildPlayerAreaUI(p) {
  const area = document.getElementById(p === 1 ? 'p1Area' : 'p2Area');
  area.innerHTML = '';
  if (G.phase === 'terrain')         { buildTerrainUI(p, area); buildAiToggle(p, area); }
  else if (G.phase === 'deployment') { buildDeployUI(p, area);  buildAiToggle(p, area); }
  else if (G.phase === 'playing')    { buildCardHandUI(p, area); buildEndTurnBtn(p, area); buildAiToggle(p, area); buildMuteBtn(p, area); }
}

// ─── Card Hand ─────────────────────────────────────────

function buildCardHandUI(p, area) {
  G.players[p].hand.forEach((cid, i) => {
    const def = CARD_DEFS[cid];
    if (!def) return;
    const el = document.createElement('div');
    el.className = 'cardSlot' + (def.free ? ' freeAction' : '') +
      (selectedCard === i && actionMode === 'card' && G.activePlayer === p ? ' selected' : '');
    el.innerHTML = `<span class="cardIcon">${def.icon}</span><span class="cardName">${def.name}</span>` +
      (def.free ? '<span class="freeTag">⚡</span>' : '');
    el.title = def.desc;
    el.addEventListener('pointerdown', e => { e.stopPropagation(); onCardTap(p, i); });
    area.appendChild(el);
  });
}

// ─── End Turn Button ───────────────────────────────────

function buildEndTurnBtn(p, area) {
  const btn = document.createElement('button');
  btn.className = 'endTurnBtn';
  btn.textContent = 'End Turn';
  btn.disabled = (G.activePlayer !== p || G.phase !== 'playing');
  btn.addEventListener('pointerdown', e => { e.stopPropagation(); onEndTurn(p); });
  area.appendChild(btn);
}

// ─── Mute & Fullscreen ─────────────────────────────────

function buildMuteBtn(p, area) {
  if (p !== 1) return;
  const mute = document.createElement('button');
  mute.className = 'muteBtn';
  mute.textContent = audioMuted ? '🔇' : '🔊';
  mute.addEventListener('pointerdown', e => { e.stopPropagation(); toggleMute(); mute.textContent = audioMuted ? '🔇' : '🔊'; });
  area.appendChild(mute);

  const fs = document.createElement('button');
  fs.className = 'muteBtn';
  fs.textContent = document.fullscreenElement ? '⊡' : '⛶';
  fs.addEventListener('pointerdown', e => { e.stopPropagation(); toggleFullscreen(); });
  area.appendChild(fs);
}

function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el)
      .then(() => setTimeout(resizeCanvas, 100)).catch(() => {});
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      .then(() => setTimeout(resizeCanvas, 100)).catch(() => {});
  }
}

// ─── AI Toggle ─────────────────────────────────────────

function buildAiToggle(p, area) {
  const btn = document.createElement('button');
  btn.className = 'aiToggleBtn' + (aiControlled[p] ? ' active' : '');
  btn.textContent = aiControlled[p] ? '🤖' : '👤';
  btn.title = aiControlled[p] ? 'AI Controlled' : 'Human';
  btn.addEventListener('pointerdown', e => {
    e.stopPropagation();
    aiControlled[p] = !aiControlled[p];
    refreshAllUI();
    hapticTap();
    if (aiControlled[p] && G.activePlayer === p) setTimeout(checkAiTurn, AI_DELAY);
  });
  area.appendChild(btn);
}

// ─── Terrain Placement UI ──────────────────────────────

function buildTerrainUI(p, area) {
  if (p !== G.activePlayer) {
    area.appendChild(Object.assign(document.createElement('div'), { className: 'phaseLabel', textContent: 'Waiting...' }));
    return;
  }
  area.appendChild(Object.assign(document.createElement('div'), {
    className: 'phaseLabel', textContent: `Place terrain (${G.terrainPieces.length} left)`,
  }));
  G.terrainPieces.forEach((piece, i) => {
    const btn = document.createElement('button');
    btn.className = 'endTurnBtn';
    btn.textContent = TERRAIN_DEFS[piece.type]?.name || piece.type;
    if (selectedTerrainIdx === i) { btn.style.background = '#d4a853'; btn.style.color = '#0a1628'; }
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation(); selectedTerrainIdx = i; actionMode = 'terrain_place';
      refreshAllUI(); hapticTap();
    });
    area.appendChild(btn);
  });
  const skip = document.createElement('button');
  skip.className = 'endTurnBtn'; skip.textContent = 'Skip';
  skip.addEventListener('pointerdown', e => {
    e.stopPropagation();
    G.terrainPieces = []; G.phase = 'deployment'; G.activePlayer = 1;
    selectedTerrainIdx = -1; actionMode = null;
    refreshAllUI();
  });
  area.appendChild(skip);
}

// ─── Fleet Deployment UI ───────────────────────────────

function buildDeployUI(p, area) {
  if (p !== G.activePlayer) {
    area.appendChild(Object.assign(document.createElement('div'), { className: 'phaseLabel', textContent: 'Waiting...' }));
    return;
  }
  const unplaced = G.players[G.activePlayer].ships.filter(s => s.x < 0);
  if (!unplaced.length) {
    area.appendChild(Object.assign(document.createElement('div'), { className: 'phaseLabel', textContent: 'Fleet deployed!' }));
    const btn = document.createElement('button'); btn.className = 'endTurnBtn'; btn.textContent = 'Confirm';
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); confirmDeployment(); });
    area.appendChild(btn);
    return;
  }
  area.appendChild(Object.assign(document.createElement('div'), {
    className: 'phaseLabel', textContent: `Tap to deploy: ${unplaced[0].name}`,
  }));
  const fl = document.createElement('div'); fl.className = 'phaseLabel small';
  fl.textContent = `Heading: ${Math.round(deployFacing * 180 / Math.PI)}°`;
  area.appendChild(fl);
  const rb = document.createElement('button'); rb.className = 'endTurnBtn'; rb.textContent = '↻ Rotate';
  rb.addEventListener('pointerdown', e => { e.stopPropagation(); deployFacing = normAngle(deployFacing + Math.PI / 4); refreshAllUI(); hapticTap(); });
  area.appendChild(rb);
  actionMode = 'deploy';
}

function confirmDeployment() {
  const other = G.activePlayer === 1 ? 2 : 1;
  if (G.players[other].ships.some(s => s.x < 0)) {
    G.activePlayer = other;
    deployFacing = other === 1 ? 0 : Math.PI;
  } else {
    G.phase = 'playing'; G.activePlayer = 1; sfxTurnChange();
  }
  deselectAll(); refreshAllUI();
  setTimeout(checkAiTurn, AI_DELAY);
}

// ─── Turn Banner ───────────────────────────────────────

function updateTurnBanner() {
  const b = document.getElementById('turnBanner');
  const p = G.activePlayer;
  const labels = { terrain: 'Place Terrain', deployment: 'Deploy Fleet', playing: `Player ${p}'s Turn` };
  b.textContent = `⚓ ${labels[G.phase] || ''} ⚓`;
  b.style.color = p === 1 ? '#e74c3c' : '#3498db';
  b.style.background = p === 1 ? COLORS.p1_banner : COLORS.p2_banner;
  b.style.border = `1px solid ${p === 1 ? '#e74c3c' : '#3498db'}`;
  const p2h = document.getElementById('p2Area')?.offsetHeight || 0;
  const p1h = document.getElementById('p1Area')?.offsetHeight || 0;
  if (p === 1) { b.style.bottom = (p1h + 4) + 'px'; b.style.top = 'auto'; b.style.transform = 'translateX(-50%)'; }
  else { b.style.top = (p2h + 4) + 'px'; b.style.bottom = 'auto'; b.style.transform = 'translateX(-50%) rotate(180deg)'; }
}

// ═══════════════════════════════════════════════════════════════
// CANVAS INPUT
// ═══════════════════════════════════════════════════════════════

function onCanvasTap(e) {
  if (isAnimating()) return;
  const rect = canvas.getBoundingClientRect();
  const { x: wx, y: wy } = s2w(e.clientX - rect.left, e.clientY - rect.top);
  const ap = G.activePlayer;

  // ── Terrain placement ──
  if (G.phase === 'terrain' && actionMode === 'terrain_place' && selectedTerrainIdx >= 0) {
    const piece = G.terrainPieces[selectedTerrainIdx];
    if (piece && canPlaceTerrainAt(wx, wy, piece.r)) {
      placeTerrainPiece(selectedTerrainIdx, wx, wy);
      hapticTap(); sfxSelect(); refreshAllUI();
      setTimeout(checkAiTurn, AI_DELAY);
    }
    return;
  }
  if (G.phase === 'terrain') return;

  // ── Fleet deployment ──
  if (G.phase === 'deployment' && actionMode === 'deploy') {
    const unplaced = G.players[ap].ships.filter(s => s.x < 0);
    if (unplaced.length && canDeploy(wx, wy, ap)) {
      unplaced[0].x = wx; unplaced[0].y = wy; unplaced[0].heading = deployFacing;
      hapticTap(); sfxSelect(); refreshAllUI();
    }
    return;
  }
  if (G.phase !== 'playing') return;

  // ── Movement: snap to nearest ring edge ──
  if (actionMode === 'move' && selectedShip && moveRings.length) {
    const dx = wx - selectedShip.x, dy = wy - selectedShip.y;
    const tapDist = Math.sqrt(dx * dx + dy * dy);
    if (tapDist < 0.15) return; // tapped on the ship itself
    const heading = Math.atan2(dx, -dy);
    const dirX = Math.sin(heading), dirY = -Math.cos(heading);
    // Find closest ring to tap distance
    let bestRing = moveRings[0];
    moveRings.forEach(r => { if (Math.abs(tapDist - r) < Math.abs(tapDist - bestRing)) bestRing = r; });
    const tx = selectedShip.x + dirX * bestRing;
    const ty = selectedShip.y + dirY * bestRing;
    if (canMoveTo(selectedShip, tx, ty)) { executeMove(selectedShip, tx, ty); return; }
    return; // blocked — let player try another direction
  }

  // ── Card targeting ──
  if (actionMode === 'card' && selectedCard !== null) { executeCardPlay(wx, wy); return; }

  // ── Ship selection ──
  const hit = findShipNear(wx, wy, ap, SHIP_RADIUS * 3.5);
  if (hit && hit.ship.hp > 0 && (!hit.ship.hasActed || hit.ship.signaled)) {
    selectShip(hit.ship, e.clientX - rect.left, e.clientY - rect.top);
    return;
  }

  // ── Deselect ──
  deselectAll(); hideRadialMenu(); hideAimPanel(); refreshAllUI();
}

// ═══════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════

function selectShip(ship, sx, sy) {
  selectedShip = ship; actionMode = null; selectedCard = null; moveRings = [];
  hideAimPanel(); showRadialMenu(sx, sy);
  sfxSelect(); hapticTap(); refreshAllUI();
}

function chooseAction(action) {
  hideRadialMenu();
  if (!selectedShip) return;
  actionMode = action;
  if (action === 'move') moveRings = [SHIP_MOVE_RADIUS];
  else if (action === 'fire') showAimPanel();
  refreshAllUI();
}

function executeMove(ship, tx, ty) {
  const newHeading = angleDelta(tx - ship.x, ty - ship.y);
  if (ship._evasive) {
    // Evasive: only allow roughly perpendicular movement
    const diff1 = Math.abs(normAngle(newHeading - ship.heading) - Math.PI / 2);
    const diff2 = Math.abs(normAngle(newHeading - ship.heading) - Math.PI * 1.5);
    if (Math.min(diff1, diff2) > Math.PI / 4) return;
    delete ship._evasive;
  } else {
    ship.heading = newHeading;
  }
  ship.x = tx; ship.y = ty; ship.hasActed = true;
  sfxMove(); hapticTap();
  deselectAll(); hideRadialMenu(); refreshAllUI();
}

// ─── Firing ────────────────────────────────────────────

function fireCannon() {
  if (!selectedShip || actionMode !== 'fire') return;
  const ship = selectedShip, ap = G.activePlayer, enemy = ap === 1 ? 2 : 1;
  const landing = computeFiringSolution(ship, aimSide, aimBearing, aimElev);
  const s = w2s(ship.x, ship.y), e = w2s(landing.x, landing.y);
  const isGhost = ship._spotterShot && !ship._spotterFired;
  const isDouble = ship._doubleShot && !ship._doubleFired;

  stats[ap].shots++; sfxFire(); hapticThud();
  if (!isGhost) ship.hasActed = true;
  hideAimPanel(); aimPreviewData = null;

  animCannonball(s.x, s.y, e.x, e.y, isGhost, aimElev).then(() => {
    // Terrain interception
    const pathHit = shotPathCheck(ship.x, ship.y, landing.x, landing.y);
    if (pathHit) {
      const hp = w2s(pathHit.hitX, pathHit.hitY);
      animTerrainHit(hp.x, hp.y);
      finishShot(ship, isGhost, isDouble); return;
    }
    // Terrain hit at landing point
    const th = G.terrain.find(t => dist(landing.x, landing.y, t.x, t.y) <= t.r);
    if (th) { animTerrainHit(e.x, e.y); finishShot(ship, isGhost, isDouble); return; }
    // Ship hit
    let hitShip = null;
    G.players[enemy].ships.forEach(es => {
      if (es.hp > 0 && dist(landing.x, landing.y, es.x, es.y) <= HIT_RADIUS) hitShip = es;
    });
    if (hitShip) {
      let dmg = 1;
      if (hitShip.braced) { dmg = Math.max(0, dmg - 1); hitShip.braced = false; }
      if (hitShip.smoked && Math.random() < 0.5) dmg = 0;
      if (dmg > 0) {
        hitShip.hp = Math.max(0, hitShip.hp - dmg); stats[ap].hits++;
        animHitFlash(e.x, e.y); animDamageNumber(e.x, e.y, `-${dmg}`);
        if (hitShip.hp <= 0) {
          stats[ap].shipsSunk++;
          setTimeout(() => animSinking(e.x, e.y), 200);
          if (allShipsSunk(enemy)) setTimeout(() => triggerGameOver(ap), 1800);
        } else { sfxMastFall(); }
      } else { animDamageNumber(e.x, e.y, 'Blocked!'); animSplash(e.x, e.y); }
    } else { animSplash(e.x, e.y); }
    finishShot(ship, isGhost, isDouble);
  });

  const saved = ship; deselectAll(); selectedShip = saved; refreshAllUI();
}

function finishShot(ship, isGhost, isDouble) {
  if (isGhost)  { ship._spotterFired = true; selectedShip = ship; actionMode = 'fire'; setTimeout(showAimPanel, 300); return; }
  if (isDouble && !ship._doubleFired) { ship._doubleFired = true; selectedShip = ship; actionMode = 'fire'; setTimeout(showAimPanel, 300); return; }
  delete ship._doubleShot; delete ship._doubleFired;
  delete ship._spotterShot; delete ship._spotterFired;
  ship.hasActed = true;
  deselectAll(); refreshAllUI();
}

// ─── Card Play ─────────────────────────────────────────

function onCardTap(player, index) {
  if (player !== G.activePlayer || G.phase !== 'playing') return;
  if (selectedCard === index && actionMode === 'card') { selectedCard = null; actionMode = null; refreshAllUI(); return; }
  selectedCard = index; actionMode = 'card'; hapticTap(); refreshAllUI();
}

function executeCardPlay(wx, wy) {
  const ap = G.activePlayer, hand = G.players[ap].hand;
  if (selectedCard === null || selectedCard >= hand.length) return;
  const cid = hand[selectedCard], cidx = selectedCard;
  if (resolveCard(cid, wx, wy, ap)) {
    const ca = actionMode;
    hand.splice(cidx, 1);
    selectedCard = null;
    if (ca === 'card') actionMode = null;
    refreshAllUI();
  }
}

function onEndTurn(p) {
  if (p !== G.activePlayer || G.phase !== 'playing') return;
  endTurn(); sfxTurnChange(); hapticTap(); refreshAllUI();
  setTimeout(checkAiTurn, AI_DELAY);
}

// ═══════════════════════════════════════════════════════════════
// RADIAL MENU (Move / Fire / Card)
// ═══════════════════════════════════════════════════════════════

function showRadialMenu(x, y) {
  const rm = document.getElementById('radialMenu');
  rm.style.display = 'block';
  const p2h = document.getElementById('p2Area')?.offsetHeight || 0;
  rm.style.left = (x - 60) + 'px';
  rm.style.top = (p2h + y - 60) + 'px';
  const btns = rm.querySelectorAll('.radBtn');
  const ap = G.activePlayer;
  const off = [
    { x: -50, y: ap === 1 ? -16 : 16 },
    { x: 0,   y: ap === 1 ? -58 : 58 },
    { x: 50,  y: ap === 1 ? -16 : 16 },
  ];
  btns.forEach((b, i) => {
    b.style.left = (60 + off[i].x - 26) + 'px';
    b.style.top = (60 + off[i].y - 26) + 'px';
  });
}

function hideRadialMenu() { document.getElementById('radialMenu').style.display = 'none'; }

// ═══════════════════════════════════════════════════════════════
// AIMING PANEL (Side / Bearing / Elevation sliders)
// ═══════════════════════════════════════════════════════════════

function showAimPanel() {
  const panel = document.getElementById('aimPanel');
  const ap = G.activePlayer;
  panel.className = ap === 1 ? 'p1' : 'p2';
  panel.style.bottom = ap === 1 ? '0' : 'auto';
  panel.style.top = ap === 1 ? 'auto' : '0';
  panel.style.display = 'block';
  aimSide = 0; aimBearing = 2; aimElev = 2;
  buildDials();
}

function hideAimPanel() { document.getElementById('aimPanel').style.display = 'none'; }

function dismissAiming() {
  hideAimPanel(); aimPreviewData = null; actionMode = null;
  if (selectedShip) {
    delete selectedShip._doubleShot; delete selectedShip._doubleFired;
    delete selectedShip._spotterShot; delete selectedShip._spotterFired;
  }
  deselectAll(); refreshAllUI();
}

// ─── Dial Building (debounce-guarded) ──────────────────

let _dialsBusy = false;

function buildDials() {
  buildSideToggle();
  const bLabels = aimSide === 0 ? BEARING_LABELS : [...BEARING_LABELS].reverse();
  const bIdx = aimSide === 0 ? aimBearing : (4 - aimBearing);
  buildSlider('bearingTrack', 'bearingVal', bLabels, bIdx, di => {
    if (_dialsBusy) return; _dialsBusy = true;
    aimBearing = aimSide === 0 ? di : (4 - di);
    buildDials(); sfxDialClick(); hapticTap(); _dialsBusy = false;
  });
  buildSlider('elevTrack', 'elevVal', ELEV_LABELS, aimElev, v => {
    if (_dialsBusy) return; _dialsBusy = true;
    aimElev = v; buildDials(); sfxDialClick(); hapticTap(); _dialsBusy = false;
  });
  document.getElementById('bearingVal').textContent = BEARING_LABELS[aimBearing];
  document.getElementById('elevVal').textContent = ELEV_LABELS[aimElev];
  updateAimPreview();
}

function buildSideToggle() {
  const c = document.getElementById('sideToggle');
  c.innerHTML = '';
  function mk(cls, txt, val) {
    const b = document.createElement('div');
    b.className = 'sideBtn ' + cls + (aimSide === val ? ' active' : '');
    b.textContent = txt;
    b.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      if (_dialsBusy || aimSide === val) return; _dialsBusy = true;
      aimSide = val; buildDials(); sfxDialClick(); hapticTap(); _dialsBusy = false;
    });
    return b;
  }
  const div = document.createElement('span'); div.className = 'sideDivider'; div.textContent = '·';
  c.appendChild(mk('port', '◂ Port', 0));
  c.appendChild(div);
  c.appendChild(mk('stbd', 'Stbd ▸', 1));
}

function buildSlider(trackId, valId, labels, currentVal, onChange) {
  const track = document.getElementById(trackId);
  track.innerHTML = '';
  const n = labels.length, pad = 6;
  for (let i = 0; i < n; i++) {
    const pct = pad + i * (100 - 2 * pad) / (n - 1);
    // Visual notch line + label
    const notch = document.createElement('div');
    notch.className = 'trackNotch' + (i === currentVal ? ' active' : '');
    notch.style.left = pct + '%';
    const lbl = document.createElement('span'); lbl.className = 'trackNotchLabel'; lbl.textContent = labels[i];
    notch.appendChild(lbl);
    track.appendChild(notch);
    // Invisible tap zone
    const segStart = i === 0 ? 0 : pad + (i - 0.5) * (100 - 2 * pad) / (n - 1);
    const segEnd = i === n - 1 ? 100 : pad + (i + 0.5) * (100 - 2 * pad) / (n - 1);
    const tz = document.createElement('div');
    tz.style.cssText = `position:absolute;top:0;bottom:0;left:${segStart}%;width:${segEnd - segStart}%;cursor:pointer;z-index:1;`;
    tz.addEventListener('pointerdown', ((idx) => e => {
      e.stopPropagation(); e.preventDefault();
      if (idx !== currentVal) onChange(idx);
    })(i));
    track.appendChild(tz);
  }
  // Thumb
  const thumb = document.createElement('div'); thumb.className = 'sliderThumb';
  thumb.style.left = `calc(${pad + currentVal * (100 - 2 * pad) / (n - 1)}% - 15px)`;
  track.appendChild(thumb);
}

function updateAimPreview() {
  if (!selectedShip || actionMode !== 'fire') { aimPreviewData = null; return; }
  const base = FIRING_TABLE_PORT[`${aimBearing},${aimElev}`] || { dx: -3, dy: 0 };
  const mir = { dx: aimSide === 1 ? -base.dx : base.dx, dy: base.dy };
  const off = rotVec(mir.dx, mir.dy, selectedShip.heading);
  aimPreviewData = {
    cx: selectedShip.x + off.dx,
    cy: selectedShip.y + off.dy,
    radius: 0.8 + aimElev * 0.5,
    side: aimSide,
  };
}

// ═══════════════════════════════════════════════════════════════
// GAME OVER
// ═══════════════════════════════════════════════════════════════

function triggerGameOver(winner) {
  G.phase = 'gameOver'; sfxVictory(); hapticRumble();
  document.getElementById('gameOverScreen').style.display = 'flex';
  document.getElementById('winnerText').textContent = `Player ${winner} Wins!`;
  const s1 = stats[1], s2 = stats[2];
  document.getElementById('statsText').innerHTML =
    `<b style="color:#e74c3c">P1:</b> ${s1.shots} shots · ${s1.hits} hits · ${s1.shots ? Math.round(s1.hits / s1.shots * 100) : 0}% · ${s1.shipsSunk} sunk<br>` +
    `<b style="color:#3498db">P2:</b> ${s2.shots} shots · ${s2.hits} hits · ${s2.shots ? Math.round(s2.hits / s2.shots * 100) : 0}% · ${s2.shipsSunk} sunk<br><br>` +
    `Game lasted ${G.turn} turns`;
}

// ─── Tutorial ──────────────────────────────────────────

function showTutorial() { document.getElementById('tutorialOverlay').style.display = 'flex'; }
function hideTutorial() { document.getElementById('tutorialOverlay').style.display = 'none'; }
