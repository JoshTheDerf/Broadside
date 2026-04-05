// ═══════════════════════════════════════════════════════════════
// BROADSIDE — renderer.js
// Canvas rendering for the game board. Handles world↔screen
// coordinate mapping, ocean, terrain, ships, and UI overlays.
// ═══════════════════════════════════════════════════════════════

let canvas, ctx;
let canvasW = 0, canvasH = 0;
let worldScale = 1, worldOffX = 0, worldOffY = 0;

// ─── Initialization ────────────────────────────────────

function initCanvas() {
  canvas = document.getElementById('boardCanvas');
  ctx = canvas.getContext('2d');
}

/**
 * Measure available space and fit the world into the canvas.
 * Uses visualViewport when available (mobile browser chrome awareness).
 * Only resets the canvas buffer if dimensions actually changed (prevents flash).
 */
function resizeCanvas() {
  const vv = window.visualViewport;
  const screenW = vv ? vv.width : window.innerWidth;
  const screenH = vv ? vv.height : window.innerHeight;
  const p2h = document.getElementById('p2Area')?.offsetHeight || 0;
  const p1h = document.getElementById('p1Area')?.offsetHeight || 0;
  const availH = Math.max(80, screenH - p2h - p1h);
  const dpr = window.devicePixelRatio || 1;
  const newW = Math.round(screenW * dpr);
  const newH = Math.round(availH * dpr);

  if (canvas.width !== newW || canvas.height !== newH) {
    canvas.width = newW;
    canvas.height = newH;
    canvas.style.width = screenW + 'px';
    canvas.style.height = availH + 'px';
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvasW = screenW;
  canvasH = availH;

  // Fit world — width is the primary constraint
  const padX = 8, padY = 8;
  worldScale = Math.min((screenW - padX * 2) / WORLD_W, (availH - padY * 2) / WORLD_H);
  worldOffX = Math.round((screenW - WORLD_W * worldScale) / 2);
  worldOffY = Math.round((availH - WORLD_H * worldScale) / 2);
}

// ─── Coordinate Conversion ─────────────────────────────

/** World coords → screen pixels */
function w2s(wx, wy) {
  return { x: worldOffX + wx * worldScale, y: worldOffY + wy * worldScale };
}

/** World radius → screen pixels */
function w2r(wr) { return wr * worldScale; }

/** Screen pixels → world coords */
function s2w(sx, sy) {
  return { x: (sx - worldOffX) / worldScale, y: (sy - worldOffY) / worldScale };
}

// ═══════════════════════════════════════════════════════════════
// MAIN DRAW
// ═══════════════════════════════════════════════════════════════

function drawFrame() {
  ctx.clearRect(0, 0, canvasW, canvasH);
  drawOcean();
  drawChartLines();
  if (G.phase === 'terrain')    drawTerrainZones();
  if (G.phase === 'deployment') drawDeployZone();
  drawTerrain();
  drawMoveRings();
  drawAimPreview();
  drawShips();
  drawAnimations(ctx);
  if (G.phase === 'playing') drawTurnEdgeGlow();
}

// ─── Ocean Background ──────────────────────────────────

function drawOcean() {
  const grad = ctx.createRadialGradient(canvasW / 2, canvasH / 2, 0, canvasW / 2, canvasH / 2, canvasW * 0.7);
  grad.addColorStop(0, COLORS.ocean_mid);
  grad.addColorStop(1, COLORS.ocean_deep);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Animated wave lines
  ctx.strokeStyle = COLORS.wave_line;
  ctx.lineWidth = 1;
  for (let y = 0; y < canvasH; y += 16) {
    ctx.beginPath();
    for (let x = 0; x < canvasW; x += 3) {
      const wy = y + Math.sin(x * 0.02 + wavePhase + y * 0.008) * 2.5;
      x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
}

// ─── Chart Reference Lines ─────────────────────────────

function drawChartLines() {
  ctx.strokeStyle = COLORS.chart_line;
  ctx.lineWidth = 0.5;
  for (let r = 2; r < WORLD_H; r += 2) {
    const { y } = w2s(0, r);
    ctx.beginPath(); ctx.moveTo(worldOffX, y); ctx.lineTo(worldOffX + WORLD_W * worldScale, y); ctx.stroke();
  }
  for (let c = 2; c < WORLD_W; c += 2) {
    const { x } = w2s(c, 0);
    ctx.beginPath(); ctx.moveTo(x, worldOffY); ctx.lineTo(x, worldOffY + WORLD_H * worldScale); ctx.stroke();
  }
  // Border
  ctx.strokeStyle = 'rgba(200,220,240,.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(worldOffX, worldOffY, WORLD_W * worldScale, WORLD_H * worldScale);
  // Compass
  const cr = w2s(WORLD_W - 0.6, 0.6);
  ctx.fillStyle = 'rgba(212,168,83,.2)';
  ctx.font = `bold ${Math.max(9, worldScale * 0.35)}px "Cinzel",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', cr.x, cr.y - 8);
}

// ─── Terrain ───────────────────────────────────────────

function drawTerrain() {
  if (!G) return;
  G.terrain.forEach(t => {
    const def = TERRAIN_DEFS[t.type] || {};
    const { x: sx, y: sy } = w2s(t.x, t.y);
    const sr = w2r(t.r);

    switch (t.type) {
      case 'island':
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = COLORS.terrain_sand; ctx.lineWidth = sr * 0.15;
        ctx.beginPath(); ctx.arc(sx, sy, sr * 0.9, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(60,130,60,.5)';
        ctx.beginPath(); ctx.arc(sx - sr * .3, sy - sr * .2, sr * .2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + sr * .2, sy + sr * .1, sr * .15, 0, Math.PI * 2); ctx.fill();
        break;
      case 'rocks':
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a6a6a';
        ctx.beginPath(); ctx.arc(sx - sr * .3, sy - sr * .2, sr * .45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a4a4a';
        ctx.beginPath(); ctx.arc(sx + sr * .25, sy + sr * .3, sr * .35, 0, Math.PI * 2); ctx.fill();
        break;
      case 'reef':
        ctx.fillStyle = 'rgba(160,120,60,.2)';
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(160,120,60,.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'sea_fort':
        ctx.fillStyle = (G.fortHp[t.id] || 0) > 0 ? '#6a6a5a' : 'rgba(80,80,70,.3)';
        ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
        break;
    }
  });
}

// ─── Phase Overlays ────────────────────────────────────

function drawTerrainZones() {
  const { x: x0, y: yt } = w2s(0, 0);
  const { x: x1, y: yb } = w2s(WORLD_W, WORLD_H);
  const { y: exTop } = w2s(0, TERRAIN_EXCL_Y);
  const { y: exBot } = w2s(0, WORLD_H - TERRAIN_EXCL_Y);
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.fillRect(x0, yt, x1 - x0, exTop - yt);
  ctx.fillRect(x0, exBot, x1 - x0, yb - exBot);
  ctx.fillStyle = 'rgba(212,168,83,.15)';
  ctx.font = `${Math.max(10, worldScale * 0.3)}px "Cinzel",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const mid = w2s(WORLD_W / 2, WORLD_H / 2);
  ctx.fillText('Tap to place terrain', mid.x, mid.y);
}

function drawDeployZone() {
  const z = HOME_ZONE[G.activePlayer];
  const { x: x0, y: y0 } = w2s(0, z.yMin);
  const { x: x1, y: y1 } = w2s(WORLD_W, z.yMax);
  ctx.fillStyle = `rgba(46,204,113,${0.05 + Math.sin(wavePhase * 2) * 0.03})`;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = 'rgba(46,204,113,.25)'; ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

// ─── Movement Rings ────────────────────────────────────

function drawMoveRings() {
  if (actionMode !== 'move' || !selectedShip || !moveRings.length) return;
  const { x: sx, y: sy } = w2s(selectedShip.x, selectedShip.y);
  const outerR = Math.max(...moveRings);
  const outerSR = w2r(outerR);

  // Light fill
  const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, outerSR);
  grad.addColorStop(0, 'rgba(46,204,113,.02)');
  grad.addColorStop(0.5, 'rgba(46,204,113,.04)');
  grad.addColorStop(1, 'rgba(46,204,113,.01)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(sx, sy, outerSR, 0, Math.PI * 2); ctx.fill();

  // Each ring
  moveRings.forEach(r => {
    const sr = w2r(r);
    const isOuter = r === outerR;
    ctx.strokeStyle = isOuter ? COLORS.move_ring_border : 'rgba(46,204,113,.35)';
    ctx.lineWidth = isOuter ? 2.5 : 1.5;
    ctx.setLineDash(isOuter ? [8, 4] : [4, 4]);
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Glow
    ctx.strokeStyle = `rgba(46,204,113,${isOuter ? 0.12 : 0.06})`;
    ctx.lineWidth = isOuter ? 8 : 4;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.stroke();
    // Distance label (multi-ring only)
    if (moveRings.length > 1) {
      ctx.fillStyle = 'rgba(46,204,113,.5)';
      ctx.font = `${Math.max(8, worldScale * 0.25)}px "IM Fell English",serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(r.toFixed(0), sx + sr + 4, sy);
    }
  });

  // Compass ticks on outer ring
  ctx.strokeStyle = 'rgba(46,204,113,.15)'; ctx.lineWidth = 1;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    ctx.beginPath();
    ctx.moveTo(sx + Math.sin(a) * (outerSR - 6), sy - Math.cos(a) * (outerSR - 6));
    ctx.lineTo(sx + Math.sin(a) * (outerSR + 3), sy - Math.cos(a) * (outerSR + 3));
    ctx.stroke();
  }
}

// ─── Aim Preview ───────────────────────────────────────

function drawAimPreview() {
  if (!aimPreviewData) return;
  const { x: px, y: py } = w2s(aimPreviewData.cx, aimPreviewData.cy);
  const pr = w2r(aimPreviewData.radius);
  ctx.strokeStyle = 'rgba(220,220,220,.25)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(220,220,220,.18)'; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py);
  ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4);
  ctx.stroke();
}

// ─── Ships ─────────────────────────────────────────────

function drawShips() {
  if (!G) return;
  [1, 2].forEach(p => {
    G.players[p].ships.forEach(s => {
      if (s.hp <= 0 || s.x < 0) return;
      drawShip(s, p);
    });
  });
}

function drawShip(ship, player) {
  const { x: cx, y: cy } = w2s(ship.x, ship.y);
  const isActive = player === G.activePlayer;
  const isSelected = selectedShip && selectedShip.id === ship.id;
  const sz = w2r(SHIP_RADIUS) * 1.3;
  const alpha = isActive ? 1 : 0.45;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ship.heading);

  // Hull
  const [hR, hG, hB] = player === 1 ? [180, 50, 50] : [50, 80, 180];
  ctx.beginPath();
  ctx.moveTo(0, -sz * 1.25);
  ctx.quadraticCurveTo(sz * .7, -sz * .5, sz * .55, sz * .3);
  ctx.lineTo(sz * .45, sz * .85);
  ctx.quadraticCurveTo(0, sz, -sz * .45, sz * .85);
  ctx.lineTo(-sz * .55, sz * .3);
  ctx.quadraticCurveTo(-sz * .7, -sz * .5, 0, -sz * 1.25);
  ctx.closePath();
  ctx.fillStyle = `rgba(${hR},${hG},${hB},${alpha})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(212,168,83,${alpha * 0.5})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Deck
  const [dR, dG, dB] = player === 1 ? [140, 90, 50] : [70, 90, 130];
  ctx.beginPath();
  ctx.moveTo(0, -sz * .85);
  ctx.quadraticCurveTo(sz * .4, -sz * .2, sz * .32, sz * .5);
  ctx.lineTo(-sz * .32, sz * .5);
  ctx.quadraticCurveTo(-sz * .4, -sz * .2, 0, -sz * .85);
  ctx.closePath();
  ctx.fillStyle = `rgba(${dR},${dG},${dB},${alpha * 0.8})`;
  ctx.fill();

  // Masts + sails (one per HP)
  const mastY = [-sz * .55, 0, sz * .4];
  const [sR, sG, sB] = player === 1 ? [220, 80, 80] : [80, 120, 220];
  for (let i = 0; i < ship.maxHp; i++) {
    const my = mastY[i];
    if (i < ship.hp) {
      ctx.beginPath(); ctx.arc(0, my, sz * .13, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,230,200,${alpha})`; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, my - sz * .14); ctx.lineTo(sz * .28, my + sz * .02); ctx.lineTo(0, my + sz * .14);
      ctx.closePath();
      ctx.fillStyle = `rgba(${sR},${sG},${sB},${alpha * 0.65})`; ctx.fill();
    } else {
      ctx.strokeStyle = `rgba(100,100,100,${alpha})`; ctx.lineWidth = 1.5;
      const xsz = sz * .1;
      ctx.beginPath();
      ctx.moveTo(-xsz, my - xsz); ctx.lineTo(xsz, my + xsz);
      ctx.moveTo(xsz, my - xsz); ctx.lineTo(-xsz, my + xsz);
      ctx.stroke();
    }
  }

  // Bowsprit
  ctx.strokeStyle = `rgba(212,168,83,${alpha * 0.4})`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -sz * 1.25); ctx.lineTo(0, -sz * 1.65); ctx.stroke();

  // Damage cracks at 1 HP
  if (ship.hp === 1) {
    ctx.strokeStyle = `rgba(200,50,50,${alpha * 0.5})`; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-sz * .25, -sz * .6); ctx.lineTo(sz * .15, sz * .4);
    ctx.moveTo(sz * .2, -sz * .5); ctx.lineTo(-sz * .1, sz * .3);
    ctx.stroke();
  }

  ctx.restore();

  // Selection pulse
  if (isSelected) {
    ctx.strokeStyle = `rgba(212,168,83,${0.5 + Math.sin(wavePhase * 4) * 0.35})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, sz * 1.6, 0, Math.PI * 2); ctx.stroke();
  }
  // Smoke overlay
  if (ship.smoked) {
    ctx.fillStyle = 'rgba(60,60,60,.3)';
    ctx.beginPath(); ctx.arc(cx, cy, sz * 1.4, 0, Math.PI * 2); ctx.fill();
  }
  // Brace ring
  if (ship.braced) {
    ctx.strokeStyle = `rgba(241,196,15,${0.3 + Math.sin(wavePhase * 5) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, sz * 1.5, 0, Math.PI * 2); ctx.stroke();
  }
  // Acted checkmark
  if (ship.hasActed && isActive && G.phase === 'playing') {
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath(); ctx.arc(cx, cy, sz * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(46,204,113,.5)';
    ctx.font = `${sz * 0.9}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✓', cx, cy);
  }
  // Ship name
  if (worldScale > 25) {
    ctx.fillStyle = `rgba(200,200,200,${alpha * 0.4})`;
    ctx.font = `${Math.max(7, worldScale * 0.17)}px "IM Fell English",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(ship.name, cx, cy + sz * 1.4);
  }
}

// ─── Turn Edge Glow ────────────────────────────────────

function drawTurnEdgeGlow() {
  const ap = G.activePlayer;
  const y = ap === 1 ? worldOffY + WORLD_H * worldScale : worldOffY;
  const col = ap === 1 ? '180,50,50' : '50,80,180';
  const grad = ctx.createLinearGradient(worldOffX, y - 3, worldOffX, y + 3);
  grad.addColorStop(0, `rgba(${col},0)`);
  grad.addColorStop(0.5, `rgba(${col},.4)`);
  grad.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(worldOffX, y - 3, WORLD_W * worldScale, 6);
}
