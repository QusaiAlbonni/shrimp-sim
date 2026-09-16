// Canvas renderer. Logical size is 960x540; scaled to the element with DPR.
import { TANK, DECOR, PLANTS, FOODS, SNAILS } from '../sim/world.js';
import { floorY, zOf } from '../sim/ecology.js';
import { drawShrimp, drawShrimpShadow } from './shrimpSprite.js';
import { drawPlant } from './plants.js';

export class Renderer {
  constructor(canvas, loader) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.loader = loader;
    this.bubbles = []; this.scale = 1; this.dpr = 1; this.substrate = null;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = rect.width / TANK.w;
    const w = Math.round(rect.width * this.dpr), h = Math.round((rect.width * TANK.h / TANK.w) * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  toWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / this.scale, y: (clientY - rect.top) / this.scale };
  }

  sprite(id) { return this.loader.get(id) || null; }

  makeSubstrate() {
    const top = TANK.floorBack - 8;
    const c = document.createElement('canvas'); c.width = TANK.w; c.height = TANK.bottom - top;
    const g = c.getContext('2d');
    const bandH = TANK.floorFront - top;
    // walkable band: darker and hazier at the back, lit at the front edge
    const grad = g.createLinearGradient(0, 0, 0, bandH);
    grad.addColorStop(0, '#3a3a30'); grad.addColorStop(0.35, '#584634'); grad.addColorStop(1, '#6e583f');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, bandH);
    // front cross-section seen through the glass
    const cs = g.createLinearGradient(0, bandH, 0, c.height);
    cs.addColorStop(0, '#4a3826'); cs.addColorStop(1, '#241a10');
    g.fillStyle = cs; g.fillRect(0, bandH, c.width, c.height - bandH);
    g.fillStyle = 'rgba(255,235,200,0.22)'; g.fillRect(0, bandH - 1, c.width, 2);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * c.width, y = rnd() * c.height, r = 0.6 + rnd() * 2.2 * (y < bandH ? 0.6 + 0.6 * (y / bandH) : 1);
      const v = 40 + Math.floor(rnd() * 70);
      g.fillStyle = `rgba(${v + 30},${v + 10},${v - 10},${y < bandH ? 0.5 + 0.4 * (y / bandH) : 0.8})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 40; i++) {
      const x = rnd() * c.width, y = 6 + rnd() * (c.height - 12), r = (3 + rnd() * 4) * (y < bandH ? 0.6 + 0.5 * (y / bandH) : 1);
      const v = 70 + Math.floor(rnd() * 60);
      g.fillStyle = `rgb(${v + 20},${v + 8},${v - 6})`; g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.25, 0, 0, Math.PI * 2); g.fill();
    }
    const back = g.createLinearGradient(0, 0, 0, 16); back.addColorStop(0, 'rgba(0,10,20,0.55)'); back.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = back; g.fillRect(0, 0, c.width, 16);
    this.substrate = c;
  }

  draw(world, state, t) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    const L = world.light;
    const lightAmt = L.on ? 0.35 + (L.intensity / 3) * 0.65 : 0;
    const roomLight = 0.5 + 0.5 * Math.sin(((world.hour - 6) / 24) * Math.PI * 2);

    // water
    const grad = ctx.createLinearGradient(0, 0, 0, TANK.h);
    grad.addColorStop(0, L.on ? '#1a6f86' : '#0d3b4c');
    grad.addColorStop(1, L.on ? '#0a3a4a' : '#051c26');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, TANK.w, TANK.h);
    const backdrop = this.sprite('backdrop');
    if (backdrop) { ctx.globalAlpha = 0.9; ctx.drawImage(backdrop, 0, TANK.floorBack - 306, TANK.w, 320); ctx.globalAlpha = 1; }

    // light beams
    if (L.on) {
      ctx.save(); ctx.globalAlpha = 0.06 * L.intensity;
      ctx.fillStyle = '#fff8d0';
      for (let i = 0; i < 5; i++) {
        const x = 120 + i * 190 + Math.sin(t * 0.3 + i) * 20;
        ctx.beginPath(); ctx.moveTo(x - 30, TANK.top); ctx.lineTo(x + 30, TANK.top); ctx.lineTo(x + 120, TANK.floorFront); ctx.lineTo(x - 80, TANK.floorFront); ctx.fill();
      }
      ctx.restore();
    }

    // substrate
    if (!this.substrate) this.makeSubstrate();
    ctx.drawImage(this.substrate, 0, TANK.floorBack - 8);

    // scene objects sorted by base y
    const items = [];
    for (const d of world.decor) items.push({ y: d.y - 2, draw: () => this.drawDecor(ctx, d, t) });
    for (const p of world.plants) items.push({ y: p.type === 'floating' ? 9999 : p.y - 1, draw: () => drawPlant(ctx, p, PLANTS[p.type], t) });
    const depthAlpha = (z) => 1 - 0.32 * (z ?? 0.5);
    for (const f of world.food) items.push({ y: floorY(f.z ?? 0.5), draw: () => { ctx.save(); ctx.globalAlpha = depthAlpha(f.z); this.drawFood(ctx, f, t); ctx.restore(); } });
    for (const m of world.molts) items.push({ y: floorY(m.z ?? 0.5), draw: () => drawShrimp(ctx, { ...m, pheno: { rgb: [230, 230, 240], opacity: 0.4 }, mode: 'walk', arrived: true, moltRecent: 0 }, t, { ghost: true }) });
    for (const s of world.snails) items.push({ y: floorY(s.z ?? 0.5) + (s.onGlass ? -200 : 0), draw: () => this.drawSnail(ctx, s) });
    // Shrimp sort by their ground line, so a shrimp behind the driftwood draws
    // before it (and gets an x-ray ghost) while one in front draws over it.
    const occluded = [];
    for (const s of world.shrimp) {
      const behind = world.decor.some((d) => { const tp = DECOR[d.type]; return s.z > zOf(d.y) + 0.02 && Math.abs(s.x - d.x) < tp.w * 0.45 && s.y < d.y && s.y > d.y - tp.h * 0.95; });
      if (behind) occluded.push(s);
      items.push({ y: floorY(s.z), draw: () => { drawShrimpShadow(ctx, s, floorY(s.z)); ctx.save(); ctx.globalAlpha = depthAlpha(s.z); drawShrimp(ctx, s, t); ctx.restore(); } });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    // x-ray ghosts for shrimp tucked behind hardscape so hiding stays visible
    for (const s of occluded) {
      ctx.save(); ctx.globalAlpha = 0.38 * depthAlpha(s.z); drawShrimp(ctx, s, t); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.setLineDash([2, 4]); ctx.lineWidth = 0.8;
      const k = 1 - 0.2 * s.z;
      ctx.beginPath(); ctx.ellipse(s.x + 2 * s.facing, s.y, 34 * s.size * k, 13 * s.size * k, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }

    // hair algae on top of decor
    if (world.algae.hair > 0.03) {
      ctx.strokeStyle = `rgba(90,160,60,${Math.min(0.8, world.algae.hair)})`; ctx.lineWidth = 1;
      for (const d of world.decor) {
        const tp = DECOR[d.type]; const n = Math.round(world.algae.hair * 14);
        for (let i = 0; i < n; i++) { const x = d.x - tp.w * 0.4 + (i / n) * tp.w * 0.8; const y = d.y - tp.h * (0.75 + 0.2 * Math.sin(i)); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.sin(t + i) * 5, y - 12, x + 4, y - 22 * world.algae.hair - 4); ctx.stroke(); }
      }
    }

    // bubbles from filter
    this.updateBubbles(world, t);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    for (const b of this.bubbles) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke(); }

    // selection ring & labels
    const sel = state.selectedId != null ? world.shrimp.find((s) => s.id === state.selectedId) : null;
    if (sel) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sel.x, sel.y, (26 * sel.size + 8) * (1 - 0.2 * sel.z) + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); ctx.stroke();
      this.label(ctx, sel.x, sel.y - 30 * sel.size - 12, state.nameOf(sel));
    }
    if (state.hoverId != null && state.hoverId !== state.selectedId) {
      const h = world.shrimp.find((s) => s.id === state.hoverId);
      if (h) this.label(ctx, h.x, h.y - 30 * h.size - 12, state.nameOf(h));
    }

    // algae film on glass + diatoms
    const film = world.algae.film, dia = world.algae.diatom;
    if (film > 0.02 || dia > 0.02) {
      ctx.fillStyle = `rgba(70,140,50,${film * 0.45})`;
      ctx.fillRect(0, TANK.top, 18, TANK.floorFront - TANK.top); ctx.fillRect(TANK.w - 18, TANK.top, 18, TANK.floorFront - TANK.top);
      ctx.fillStyle = `rgba(60,130,40,${film * 0.14 + dia * 0.08})`; ctx.fillRect(0, TANK.top, TANK.w, TANK.floorFront - TANK.top);
      if (dia > 0.02) { ctx.fillStyle = `rgba(120,90,40,${dia * 0.35})`; ctx.fillRect(0, TANK.top, 18, TANK.floorFront - TANK.top); ctx.fillRect(TANK.w - 18, TANK.top, 18, TANK.floorFront - TANK.top); }
    }

    // water surface
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= TANK.w; x += 12) { const y = TANK.top + Math.sin(x * 0.03 + t * 1.5) * 1.5; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(8,22,30,0.85)'; ctx.fillRect(0, 0, TANK.w, TANK.top - 4);

    // darkness
    const dark = (1 - lightAmt) * (0.55 - roomLight * 0.35);
    if (dark > 0.01) { ctx.fillStyle = `rgba(2,8,18,${dark})`; ctx.fillRect(0, 0, TANK.w, TANK.h); }

    // glass reflection + vignette
    const refl = ctx.createLinearGradient(0, 0, TANK.w * 0.5, TANK.h);
    refl.addColorStop(0, 'rgba(255,255,255,0.10)'); refl.addColorStop(0.25, 'rgba(255,255,255,0.03)'); refl.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = refl; ctx.fillRect(0, 0, TANK.w, TANK.h);
    const vig = ctx.createRadialGradient(TANK.w / 2, TANK.h / 2, TANK.h * 0.55, TANK.w / 2, TANK.h / 2, TANK.w * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, TANK.w, TANK.h);
    // glass frame
    ctx.strokeStyle = 'rgba(180,220,235,0.35)'; ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, TANK.w - 3, TANK.h - 3);

    if (state.feedMode) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`Click in the tank to drop ${FOODS[state.feedMode].name.toLowerCase()} (Esc to stop)`, TANK.w / 2, TANK.top + 22);
    }
  }

  label(ctx, x, y, text) {
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 14, w, 18, 5); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(text, x, y);
  }

  drawDecor(ctx, d, t) {
    const tp = DECOR[d.type]; const img = this.sprite(tp.sprite);
    if (img) { ctx.drawImage(img, d.x - tp.w / 2, d.y - tp.h, tp.w, tp.h); return; }
    // placeholder while the stream tier is still downloading
    ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(t * 3) * 0.15;
    ctx.fillStyle = '#4a4a4a'; ctx.beginPath(); ctx.roundRect(d.x - tp.w / 2, d.y - tp.h, tp.w, tp.h, 12); ctx.fill();
    ctx.fillStyle = '#ddd'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('loading…', d.x, d.y - tp.h / 2);
    ctx.restore();
  }

  drawFood(ctx, f, t) {
    const tp = FOODS[f.type]; const k = Math.max(0.3, f.amount / tp.amount);
    if (tp.leaf) { const img = this.sprite('leaf'); if (img) { ctx.globalAlpha = 0.5 + k * 0.5; ctx.drawImage(img, f.x - 32, f.y - 14, 64, 32); ctx.globalAlpha = 1; return; } }
    ctx.fillStyle = tp.color;
    if (f.type === 'zucchini') { ctx.beginPath(); ctx.ellipse(f.x, f.y, 14 * k, 6 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#5a7a2a'; ctx.lineWidth = 2; ctx.stroke(); return; }
    if (f.type === 'pollen') { for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(f.x + Math.sin(i * 2.1) * 8, f.y + Math.cos(i * 1.7) * 3, 1.6 * k, 0, Math.PI * 2); ctx.fill(); } return; }
    ctx.beginPath(); ctx.ellipse(f.x, f.y, (f.type === 'wafer' ? 9 : 5) * k, (f.type === 'wafer' ? 4 : 3) * k, 0, 0, Math.PI * 2); ctx.fill();
  }

  drawSnail(ctx, s) {
    const tp = SNAILS[s.type]; const img = this.sprite(tp.sprite);
    const k = s.onGlass ? 1 : 1 - 0.2 * (s.z ?? 0.5);
    const w = tp.w * s.size * k, h = tp.h * s.size * k;
    ctx.save(); ctx.translate(s.x, s.y);
    if (!s.onGlass) ctx.globalAlpha = 1 - 0.3 * (s.z ?? 0.5);
    if (s.onGlass) ctx.rotate(s.x < TANK.w / 2 ? Math.PI / 2 : -Math.PI / 2);
    if (s.facing > 0) ctx.scale(-1, 1);
    if (img) ctx.drawImage(img, -w / 2, -h, w, h);
    else { ctx.fillStyle = '#b08a50'; ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  updateBubbles(world, t) {
    const f = world.decor.find((d) => d.type === 'filter');
    if (f && Math.random() < 0.25) this.bubbles.push({ x: f.x + (Math.random() - 0.5) * 6, y: f.y - 128, r: 1 + Math.random() * 2.5, vy: 0.8 + Math.random() * 1.2, ph: Math.random() * 6 });
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]; b.y -= b.vy; b.x += Math.sin(t * 3 + b.ph) * 0.3;
      if (b.y < TANK.top + 2) this.bubbles.splice(i, 1);
    }
  }
}
