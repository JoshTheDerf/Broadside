// ═══════════════════════════════════════════════════════════════
// BROADSIDE — audio.js
// Synthesized sound effects (Web Audio API) and haptic feedback.
// All sounds are generated procedurally — no external audio files.
// ═══════════════════════════════════════════════════════════════

let audioCtx  = null;
let audioMuted = false;

function initAudio() {
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { /* Web Audio not supported */ }
}

/** Resume audio context if suspended (required after user gesture on mobile). */
function ensureAudio() {
  if (!audioCtx) initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function toggleMute() { audioMuted = !audioMuted; return audioMuted; }

// ─── Synthesis Primitives ──────────────────────────────

/** Play filtered white noise burst. */
function playNoise(duration, volume, filterFreq, filterQ) {
  if (audioMuted || !audioCtx) return;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const filt = audioCtx.createBiquadFilter(); filt.type = 'lowpass';
  filt.frequency.value = filterFreq || 1000; filt.Q.value = filterQ || 1;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume || 0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  src.connect(filt).connect(gain).connect(audioCtx.destination);
  src.start();
}

/** Play a simple oscillator tone. */
function playTone(freq, duration, type, volume) {
  if (audioMuted || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  osc.type = type || 'sine'; osc.frequency.value = freq;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume || 0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + duration);
}

// ─── Sound Effects ─────────────────────────────────────

function sfxSelect()  { ensureAudio(); playNoise(0.15, 0.12, 600, 3); playTone(180, 0.1, 'triangle', 0.05); }
function sfxMove()    { ensureAudio(); playNoise(0.4, 0.15, 400, 1); playTone(120, 0.3, 'sine', 0.04); }

let _lastDialClickTime = 0;
function sfxDialClick() {
  const now = performance.now();
  if (now - _lastDialClickTime < 60) return;
  _lastDialClickTime = now;
  ensureAudio(); playTone(2200, 0.03, 'square', 0.15); playNoise(0.03, 0.1, 4000, 5);
}

function sfxFire() {
  ensureAudio();
  playNoise(0.5, 0.5, 200, 2); playTone(60, 0.3, 'sine', 0.4); playTone(40, 0.4, 'sine', 0.2);
  setTimeout(() => playNoise(0.3, 0.1, 3000, 1), 100);
}

function sfxWhistle() {
  ensureAudio(); if (!audioCtx) return;
  const osc = audioCtx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.3);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.35);
}

function sfxHitShip()   { ensureAudio(); playNoise(0.35, 0.4, 800, 3); playTone(150, 0.15, 'sawtooth', 0.15); }
function sfxHitTerrain() { ensureAudio(); playNoise(0.2, 0.25, 300, 5); playTone(80, 0.15, 'sine', 0.2); }
function sfxSplash()    { ensureAudio(); playNoise(0.3, 0.2, 2000, 1); playTone(400, 0.1, 'sine', 0.03); }
function sfxCardPlay()  { ensureAudio(); playNoise(0.2, 0.1, 1500, 2); playTone(500, 0.08, 'triangle', 0.04); }
function sfxMastFall()  { ensureAudio(); playNoise(0.25, 0.3, 600, 4); playTone(100, 0.2, 'sawtooth', 0.1); }

function sfxSunk() {
  ensureAudio();
  playTone(80, 0.8, 'sawtooth', 0.15); playTone(60, 1.0, 'sine', 0.1);
  setTimeout(() => { for (let i = 0; i < 6; i++) setTimeout(() => playTone(300 + Math.random() * 200, 0.08, 'sine', 0.06), i * 80); }, 300);
}

function sfxTurnChange() {
  ensureAudio();
  playTone(1200, 0.5, 'sine', 0.15); playTone(1205, 0.5, 'sine', 0.1);
  setTimeout(() => playTone(1200, 0.4, 'sine', 0.08), 250);
}

function sfxVictory() {
  ensureAudio();
  [392, 523, 659, 784].forEach((f, i) => {
    setTimeout(() => { playTone(f, 0.6, 'sawtooth', 0.12); playTone(f * 1.005, 0.6, 'sawtooth', 0.08); }, i * 200);
  });
}

// ─── Haptic Feedback ───────────────────────────────────
function haptic(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) {} }
function hapticTap()    { haptic(10); }
function hapticThud()   { haptic(30); }
function hapticDouble() { haptic([20, 40, 20]); }
function hapticRumble() { haptic([30, 20, 30, 20, 60]); }
