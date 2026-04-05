// ═══════════════════════════════════════════════════════════════
// BROADSIDE — animations.js
// Animation queue with factory functions and canvas rendering.
// Each animation is an object with {type, duration, progress, ...params}.
// The game loop calls updateAnimations() then drawAnimations(ctx).
// ═══════════════════════════════════════════════════════════════

let animations = [];
let wavePhase  = 0;  // continuous time value for wave/pulse effects (seconds)

// ─── Update ────────────────────────────────────────────

/** Advance all animations. Called once per frame with the rAF timestamp. */
function updateAnimations(timestamp) {
  wavePhase = timestamp * 0.001;
  animations.forEach(a => {
    if (!a.startTime) a.startTime = timestamp;
    a.progress = Math.min(1, (timestamp - a.startTime) / a.duration);
    if (a.progress >= 1 && a.onComplete && !a.completed) {
      a.completed = true;
      a.onComplete();
    }
  });
  animations = animations.filter(a => a.progress < 1);
}

/** True if any animations are playing (used to block input during fire animations). */
function isAnimating() { return animations.length > 0; }

// ─── Factory Functions ─────────────────────────────────
// Each creates an animation object and pushes it into the queue.

/** Cannonball flying from (sx,sy) to (ex,ey) with arc based on elevation. Returns a Promise. */
function animCannonball(sx, sy, ex, ey, ghostly, elevation) {
  const elev = elevation || 2;
  return new Promise(resolve => {
    animations.push({
      type: 'cannonball', sx, sy, ex, ey,
      ghostly: !!ghostly, elevation: elev,
      duration: 350 + elev * 60,
      progress: 0, startTime: null, onComplete: resolve,
    });
    sfxWhistle();
  });
}

function animSplash(x, y)      { animations.push({ type: 'splash',      x, y, duration: 600, progress: 0, startTime: null }); sfxSplash(); }
function animHitFlash(x, y)    { animations.push({ type: 'hit_flash',   x, y, duration: 400, progress: 0, startTime: null }); sfxHitShip(); hapticDouble(); }
function animTerrainHit(x, y)  { animations.push({ type: 'terrain_hit', x, y, duration: 400, progress: 0, startTime: null }); sfxHitTerrain(); }
function animSparkle(x, y)     { animations.push({ type: 'sparkle',     x, y, duration: 700, progress: 0, startTime: null }); }
function animSinking(x, y)     { animations.push({ type: 'sinking',     x, y, duration: 1500, progress: 0, startTime: null }); sfxSunk(); hapticRumble(); }
function animGoldenRing(x, y)  { animations.push({ type: 'golden_ring', x, y, duration: 800, progress: 0, startTime: null }); }
function animFlags(x, y)       { animations.push({ type: 'flags',       x, y, duration: 900, progress: 0, startTime: null }); }
function animSmoke(x, y)       { animations.push({ type: 'smoke_cloud', x, y, duration: 600, progress: 0, startTime: null }); }
function animBoarding(x1, y1, x2, y2)         { animations.push({ type: 'boarding',     x1, y1, x2, y2, duration: 700, progress: 0, startTime: null }); }
function animDottedLine(x1, y1, x2, y2, dist)  { animations.push({ type: 'dotted_line',  x1, y1, x2, y2, distance: dist, duration: 1500, progress: 0, startTime: null }); }
function animDamageNumber(x, y, text)          { animations.push({ type: 'damage_number', x, y, text, duration: 800, progress: 0, startTime: null }); }

// ─── Rendering ─────────────────────────────────────────

/** Draw all active animations onto the canvas. */
function drawAnimations(ctx) {
  animations.forEach(a => {
    const p = a.progress || 0;

    switch (a.type) {

      // ── Cannonball with parabolic arc ──
      case 'cannonball': {
        const elev = a.elevation || 2;
        const gx = a.sx + (a.ex - a.sx) * p;
        const gy = a.sy + (a.ey - a.sy) * p;
        const arcH = (elev + 1) * 18;
        const h = 4 * arcH * p * (1 - p);
        const bx = gx, by = gy - h;
        const baseR = a.ghostly ? 3 : 3.5;
        const scale = 1 + (1 + (elev + 1) * 0.45 - 1) * 4 * p * (1 - p);
        const br = baseR * scale;

        // Shadow on ground
        ctx.fillStyle = `rgba(0,0,0,${0.15 * (1 - 0.4 * (h / arcH || 0))})`;
        ctx.beginPath(); ctx.ellipse(gx, gy + 2, br * 1.5, br * 0.6, 0, 0, Math.PI * 2); ctx.fill();

        // Smoke trail
        ctx.strokeStyle = `rgba(100,100,100,${a.ghostly ? 0.1 : 0.2})`;
        ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.beginPath();
        for (let i = 0; i <= Math.floor(p * 12); i++) {
          const tp = i / 12;
          const tx = a.sx + (a.ex - a.sx) * tp;
          const ty = a.sy + (a.ey - a.sy) * tp - 4 * arcH * tp * (1 - tp) * 0.3;
          i === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
        }
        ctx.stroke(); ctx.setLineDash([]);

        // Ball
        if (a.ghostly) {
          ctx.fillStyle = 'rgba(180,180,220,0.3)';
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        } else {
          const grad = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0, bx, by, br);
          grad.addColorStop(0, '#4a4a4a'); grad.addColorStop(0.5, '#1a1a1a'); grad.addColorStop(1, '#0a0a0a');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          if (p < 0.15 || p > 0.85) {
            ctx.fillStyle = `rgba(255,140,40,0.3)`;
            ctx.beginPath(); ctx.arc(bx, by, br * 2, 0, Math.PI * 2); ctx.fill();
          }
          if (h > arcH * 0.3) {
            ctx.strokeStyle = `rgba(255,180,80,${0.12 * h / arcH})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(bx, by, br + 2, 0, Math.PI * 2); ctx.stroke();
          }
        }
        break;
      }

      // ── Water splash ──
      case 'splash': {
        const r = 20 * p;
        ctx.strokeStyle = `rgba(100,180,240,${1 - p})`; ctx.lineWidth = 2.5 - p * 2;
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(180,220,255,${0.6 - p * 0.6})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(a.x, a.y, r * 0.5, 0, Math.PI * 2); ctx.stroke();
        break;
      }

      // ── Hit flash ──
      case 'hit_flash': {
        ctx.fillStyle = `rgba(255,140,0,${(1 - p) * 0.8})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, 14 * (1 + p * 0.5), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,255,200,${(1 - p) * 0.5})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, 6, 0, Math.PI * 2); ctx.fill();
        break;
      }

      // ── Terrain hit (dust puff) ──
      case 'terrain_hit': {
        ctx.fillStyle = `rgba(160,140,100,${(1 - p) * 0.6})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, 10 * (1 + p), 0, Math.PI * 2); ctx.fill();
        break;
      }

      // ── Sparkle (repair) ──
      case 'sparkle': {
        for (let i = 0; i < 8; i++) {
          const ang = i * Math.PI * 2 / 8 + p * 3;
          const r = 6 + p * 16;
          ctx.fillStyle = `rgba(100,255,180,${(1 - p) * 0.8})`;
          ctx.beginPath(); ctx.arc(a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, 2.5 - p * 1.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }

      // ── Sinking ──
      case 'sinking': {
        const r = 20 + p * 15;
        ctx.fillStyle = `rgba(10,30,60,${(1 - p) * 0.4})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill();
        if (p > 0.2) {
          for (let i = 0; i < 5; i++) {
            ctx.fillStyle = `rgba(150,200,240,${Math.max(0, 1 - p - 0.2) * 0.5})`;
            ctx.beginPath();
            ctx.arc(a.x + Math.sin(p * 10 + i * 2) * r * 0.6, a.y - p * 20 + Math.cos(p * 8 + i * 3) * 5, 2 + i * 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }

      // ── Golden ring (brace) ──
      case 'golden_ring': {
        const rp = 0.5 + Math.sin(p * Math.PI) * 0.5;
        ctx.strokeStyle = `rgba(241,196,15,${rp * 0.8})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(a.x, a.y, 18 + p * 6, 0, Math.PI * 2); ctx.stroke();
        break;
      }

      // ── Signal flags ──
      case 'flags': {
        for (let i = 0; i < 3; i++) {
          const fx = a.x + (i - 1) * 10, fy = a.y - 12 - p * 15;
          ctx.fillStyle = `rgba(${i === 0 ? '255,80,80' : i === 1 ? '255,255,80' : '80,80,255'},${1 - p})`;
          ctx.fillRect(fx - 3, fy - 2, 6, 4);
        }
        break;
      }

      // ── Smoke cloud ──
      case 'smoke_cloud': {
        ctx.fillStyle = `rgba(60,60,60,${(1 - p) * 0.5})`;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.arc(a.x + Math.cos(i * 1.5) * 8, a.y + Math.sin(i * 1.5) * 6, 10 + p * 5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }

      // ── Boarding swords ──
      case 'boarding': {
        const mx = a.x1 + (a.x2 - a.x1) * Math.min(1, p * 2);
        const my = a.y1 + (a.y2 - a.y1) * Math.min(1, p * 2);
        ctx.fillStyle = `rgba(255,200,50,${p < 0.5 ? 1 : 2 * (1 - p)})`;
        ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚔', mx, my);
        break;
      }

      // ── Lookout dotted line ──
      case 'dotted_line': {
        const lp = Math.min(1, p * 2);
        const ex = a.x1 + (a.x2 - a.x1) * lp, ey = a.y1 + (a.y2 - a.y1) * lp;
        ctx.strokeStyle = `rgba(200,200,100,${1 - p * 0.3})`; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        if (p > 0.3) {
          ctx.fillStyle = `rgba(255,255,200,${Math.min(1, (p - 0.3) * 3)})`;
          ctx.font = 'bold 14px "Cinzel",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(a.distance.toFixed(1), (a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2 - 10);
        }
        break;
      }

      // ── Floating damage number ──
      case 'damage_number': {
        ctx.fillStyle = `rgba(255,80,80,${1 - p})`;
        ctx.font = 'bold 16px "Cinzel",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(a.text, a.x, a.y - p * 25);
        break;
      }
    }
  });
}
