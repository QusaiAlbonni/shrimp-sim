// Game orchestration: world lifecycle, main loop, input, saves, offline catch-up.
import { createWorld, tick, actions, serialize, deserialize, simulateOffline, TANK } from './sim/world.js';
import { setNarrativeData, displayName } from './sim/narrative.js';
import { Renderer } from './render/renderer.js';
import { UI } from './ui/ui.js';
import { Ambience } from './audio.js';

const SAVE_KEY = 'shrimptank.save.v1';
export const HOURS_PER_SEC = 0.1; // at 1x: 10 real seconds per game hour, 4 minutes per day
const MAX_STEP = 0.05; // sim sub-step cap in game hours; per frame we advance exactly the elapsed time

export async function createGame({ loader, data, onStatus = () => {} }) {
  setNarrativeData(data);
  onStatus('Restoring your tank');
  let world = null, away = null;
  const saved = safeGet(SAVE_KEY);
  if (saved) {
    try {
      world = deserialize(saved);
      const elapsed = (Date.now() - (world.savedAt || Date.now())) / 1000;
      const hours = Math.min(72, elapsed * HOURS_PER_SEC);
      if (hours > 0.5) { onStatus('Catching up on what happened while you were away'); await yieldFrame(); away = simulateOffline(world, hours); }
    } catch (err) { console.warn('save unreadable', err); world = null; }
  }
  if (!world) { world = createWorld(); world._fresh = true; }

  const state = { selectedId: null, hoverId: null, feedMode: null, speed: 1, paused: false, nameOf: displayName, sound: false };
  const canvas = document.getElementById('tank');
  const renderer = new Renderer(canvas, loader);
  const audio = new Ambience();
  const game = { world, state, renderer, loader, audio, act, save, reset, exportSave, importSave, select, setSpeed, start };
  const ui = new UI(game);
  game.ui = ui;

  function act(name, ...args) {
    const r = actions[name](world, ...args);
    if (r && r.msg) ui.toast(r.msg, r.ok ? 'info' : 'bad');
    ui.dirty();
    return r;
  }
  function select(id) { state.selectedId = id; ui.dirty(); if (id != null) ui.showTab('shrimp'); }
  function setSpeed(v) { if (v === 0) state.paused = true; else { state.paused = false; state.speed = v; } ui.dirty(); }
  function save() {
    world.savedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, serialize(world)); ui.savedFlash(); return true; } catch (err) { console.warn('save failed', err); ui.toast('Could not save (storage full or blocked).', 'bad'); return false; }
  }
  function reset() {
    localStorage.removeItem(SAVE_KEY);
    world = createWorld(); game.world = world; state.selectedId = null; state.feedMode = null;
    ui.toast('Fresh tank set up.', 'info'); ui.dirty();
  }
  function exportSave() {
    const blob = new Blob([serialize(world)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `shrimp-tank-day${world.day}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function importSave(text) {
    try { const w = deserialize(text); world = w; game.world = w; state.selectedId = null; save(); ui.toast('Tank imported.', 'info'); }
    catch (err) { ui.toast('That file is not a valid tank save.', 'bad'); }
  }

  // ---- input ----
  const nearestShrimp = (pt, r = 30) => { let best = null, bd = r; for (const s of world.shrimp) { const d = Math.hypot(s.x - pt.x, s.y - pt.y); if (d < bd) { bd = d; best = s; } } return best; };
  canvas.addEventListener('pointermove', (e) => { const pt = renderer.toWorld(e.clientX, e.clientY); const s = nearestShrimp(pt); state.hoverId = s ? s.id : null; canvas.style.cursor = state.feedMode ? 'crosshair' : s ? 'pointer' : 'default'; });
  canvas.addEventListener('pointerleave', () => { state.hoverId = null; });
  canvas.addEventListener('pointerdown', (e) => {
    const pt = renderer.toWorld(e.clientX, e.clientY);
    if (state.feedMode) {
      if (e.button === 2) { state.feedMode = null; return; }
      if (pt.y < TANK.top || pt.y > TANK.floorFront + 6) return;
      const r = act('feed', state.feedMode, pt.x, pt.y);
      if (!r.ok || world.inventory[state.feedMode] <= 0) state.feedMode = null;
      audio.blip(500);
      return;
    }
    const s = nearestShrimp(pt);
    select(s ? s.id : null);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'Escape') { state.feedMode = null; select(null); }
    if (e.key === ' ') { e.preventDefault(); setSpeed(state.paused ? state.speed : 0); }
    if (e.key === '1') setSpeed(1); if (e.key === '2') setSpeed(3); if (e.key === '3') setSpeed(10);
  });
  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', () => save());

  // ---- loop ----
  let last = performance.now(), saveTimer = 0, running = false;
  function frame(now) {
    if (!running) return;
    const dtReal = Math.min(0.25, (now - last) / 1000); last = now;
    if (!state.paused) {
      let hours = dtReal * HOURS_PER_SEC * state.speed;
      let n = 0;
      while (hours > 1e-6 && n < 400) { const h = Math.min(MAX_STEP, hours); tick(world, h); hours -= h; n++; }
    }
    renderer.resize();
    renderer.draw(world, state, now / 1000);
    if (state.selectedId != null && !world.shrimp.some((s) => s.id === state.selectedId)) select(null);
    if (world._toasts && world._toasts.length) {
      for (const t of world._toasts.splice(0)) { ui.toast(t.text, t.level); if (t.level === 'rare') audio.chime(); }
    }
    ui.update(dtReal);
    saveTimer += dtReal; if (saveTimer > 20) { saveTimer = 0; save(); }
    requestAnimationFrame(frame);
  }
  function start() {
    running = true; last = performance.now();
    renderer.resize();
    ui.mount();
    if (world._fresh) ui.toast('Ten cherry shrimp, one nerite. Feed sparingly, change water weekly, and watch the log.', 'info');
    requestAnimationFrame(frame);
  }
  return game;
}

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
