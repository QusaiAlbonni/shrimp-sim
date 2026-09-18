// Game orchestration: world lifecycle, main loop, input, saves, offline catch-up.
import { createWorld, tick, actions, serialize, deserialize, simulateOffline, TANK, PLANTS } from './sim/world.js';
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

  const state = { selectedId: null, hoverId: null, feedMode: null, tool: 'inspect', pointer: null, speed: 1, paused: false, nameOf: displayName, sound: false };
  const canvas = document.getElementById('tank');
  const renderer = new Renderer(canvas, loader);
  const audio = new Ambience();
  const game = { world, state, renderer, loader, audio, act, save, reset, exportSave, importSave, select, setSpeed, setTool, start };
  const ui = new UI(game);
  game.ui = ui;

  function act(name, ...args) {
    const r = actions[name](world, ...args);
    if (r && r.msg) ui.toast(r.msg, r.ok ? 'info' : 'bad');
    ui.dirty();
    return r;
  }
  function select(id) { state.selectedId = id; ui.dirty(); if (id != null) ui.showTab('shrimp'); }
  function setTool(tool, food) {
    state.tool = tool;
    if (tool === 'feed') { state.feedMode = food || state.feedMode || Object.keys(world.inventory).find((k) => world.inventory[k] > 0) || null; if (!state.feedMode) state.tool = 'inspect'; }
    canvas.style.cursor = { feed: 'crosshair', scrub: 'grab', trim: 'crosshair' }[state.tool] || 'default';
    ui.dirty();
  }
  // ⏸ toggles: pause, or resume at 1× when already paused. Speed buttons always resume.
  function setSpeed(v) {
    if (v === 0) { if (state.paused) { state.paused = false; state.speed = 1; } else state.paused = true; }
    else { state.paused = false; state.speed = v; }
    ui.dirty();
  }
  function save() {
    world.savedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, serialize(world)); ui.savedFlash(); return true; } catch (err) { console.warn('save failed', err); ui.toast('Could not save (storage full or blocked).', 'bad'); return false; }
  }
  function reset() {
    localStorage.removeItem(SAVE_KEY);
    world = createWorld(); game.world = world; state.selectedId = null; state.feedMode = null; state.tool = 'inspect';
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
  let drag = null; // { tool, last, trimmed:Set }
  const heartAt = (pt) => (world._hearts || []).find((h) => Math.hypot(h.x - pt.x, h.y - pt.y) < 18);
  const plantsUnder = (pt) => world.plants.filter((p) => {
    const t = PLANTS[p.type]; const h = t.floating ? 30 : t.h * Math.min(p.size, t.max); const w = t.w * (0.5 + Math.min(p.size, t.max) * 0.5);
    return Math.abs(pt.x - p.x) < w / 2 && (t.floating ? pt.y > p.y - 4 && pt.y < p.y + h : pt.y < p.y && pt.y > p.y - h);
  });
  function scrubStroke(pt) {
    const r = act('scrubAt', pt.x, pt.y);
    if (r.removed > 0.02) { renderer.burst(pt.x, pt.y, 'rgba(90,160,60,0.9)', Math.min(10, Math.round(r.removed * 30)), 2.5); if (Math.random() < 0.3) audio.blip(300 + Math.random() * 200); }
  }
  function trimStroke(pt) {
    for (const p of plantsUnder(pt)) {
      if (drag.trimmed.has(p.id)) continue;
      drag.trimmed.add(p.id);
      const t = PLANTS[p.type]; const h = t.h * Math.min(p.size, t.max);
      const frac = t.floating ? 0.6 : (p.y - pt.y) / h;
      const r = act('trimAt', p.id, frac);
      if (r.ok && r.cut > 0.01) { renderer.burst(pt.x, pt.y, 'rgba(120,200,90,0.95)', 12, 3); audio.blip(900); }
    }
  }
  canvas.addEventListener('pointermove', (e) => {
    const pt = renderer.toWorld(e.clientX, e.clientY); state.pointer = pt;
    if (drag) {
      // interpolate along the segment so fast drags (few move events) still cover the path
      const d = Math.hypot(pt.x - drag.last.x, pt.y - drag.last.y);
      const steps = Math.max(1, Math.ceil(d / 10));
      for (let i = 1; i <= steps; i++) {
        const q = { x: drag.last.x + ((pt.x - drag.last.x) * i) / steps, y: drag.last.y + ((pt.y - drag.last.y) * i) / steps };
        if (drag.tool === 'scrub') scrubStroke(q); else trimStroke(q);
      }
      drag.last = pt;
      return;
    }
    const s = state.tool === 'inspect' ? nearestShrimp(pt) : null; state.hoverId = s ? s.id : null;
    if (state.tool === 'inspect') canvas.style.cursor = heartAt(pt) || s ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { state.hoverId = null; state.pointer = null; });
  canvas.addEventListener('pointerdown', (e) => {
    const pt = renderer.toWorld(e.clientX, e.clientY);
    if (e.button === 2) { setTool('inspect'); return; }
    const heart = heartAt(pt);
    if (heart) { const r = act('heart', heart.f, heart.m); if (r.ok) { renderer.burst(heart.x, heart.y, 'rgba(255,120,150,0.95)', 14, 3); audio.chime(); } return; }
    if (pt.y < TANK.top - 4 || pt.y > TANK.floorFront + 12) return;
    switch (state.tool) {
      case 'feed': {
        if (!state.feedMode) { setTool('inspect'); return; }
        const r = act('feed', state.feedMode, pt.x, pt.y);
        if (!r.ok || world.inventory[state.feedMode] <= 0) setTool('inspect');
        audio.blip(500);
        return;
      }
      case 'scrub': drag = { tool: 'scrub', last: pt, trimmed: new Set() }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; scrubStroke(pt); return;
      case 'trim': drag = { tool: 'trim', last: pt, trimmed: new Set() }; canvas.setPointerCapture(e.pointerId); trimStroke(pt); return;
      default: { const s = nearestShrimp(pt); select(s ? s.id : null); }
    }
  });
  const endDrag = (e) => { if (!drag) return; drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch {} canvas.style.cursor = state.tool === 'scrub' ? 'grab' : 'crosshair'; ui.dirty(); };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'Escape') { setTool('inspect'); select(null); }
    if (e.key === 'f' || e.key === 'F') setTool(state.tool === 'feed' ? 'inspect' : 'feed');
    if (e.key === 's' || e.key === 'S') setTool(state.tool === 'scrub' ? 'inspect' : 'scrub');
    if (e.key === 't' || e.key === 'T') setTool(state.tool === 'trim' ? 'inspect' : 'trim');
    if (e.key === ' ') { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); setSpeed(0); }
    if (e.key === '1') setSpeed(1); if (e.key === '2') setSpeed(3); if (e.key === '3') setSpeed(10);
  });
  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', () => save());

  // ---- loop ----
  let last = performance.now(), saveTimer = 0, running = false, animT = 0; // animT only advances while unpaused
  function frame(now) {
    if (!running) return;
    const dtReal = Math.min(0.25, (now - last) / 1000); last = now;
    if (!state.paused) {
      let hours = dtReal * HOURS_PER_SEC * state.speed;
      let n = 0;
      while (hours > 1e-6 && n < 400) { const h = Math.min(MAX_STEP, hours); tick(world, h); hours -= h; n++; }
    }
    if (!state.paused) animT += dtReal;
    renderer.resize();
    renderer.draw(world, state, animT);
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
