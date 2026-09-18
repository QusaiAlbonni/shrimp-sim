// Procedural plant drawing so plants can grow continuously.
export function drawPlant(ctx, p, type, t, extras = {}) {
  const sz = Math.min(p.size, type.max);
  const sway = Math.sin(t * 0.8 + p.x * 0.01) * 3;
  ctx.save();
  ctx.translate(p.x, p.y);
  switch (p.type) {
    case 'moss': drawMoss(ctx, sz, t, p); break;
    case 'anubias': drawAnubias(ctx, sz, sway); break;
    case 'javafern': drawFern(ctx, sz, sway); break;
    case 'stem': drawStem(ctx, sz, sway, t); break;
    case 'floating': drawFloating(ctx, sz, t, p); break;
    case 'crypt': drawCrypt(ctx, sz, sway); break;
    case 'buce': drawBuce(ctx, sz, sway, p); break;
    case 'hairgrass': drawHairgrass(ctx, sz, t, p); break;
  }
  ctx.restore();
}

function drawMoss(ctx, sz, t, p) {
  const w = 45 * (0.5 + sz * 0.5), h = 60 * sz;
  const seed = p.id * 7919;
  ctx.fillStyle = 'rgba(46,110,40,0.9)';
  ctx.beginPath(); ctx.ellipse(0, -h * 0.35, w, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 26; i++) {
    const a = ((seed + i * 131) % 100) / 100;
    const b = ((seed + i * 71) % 100) / 100;
    const x = (a - 0.5) * 2 * w * 0.9, y = -h * 0.35 - (b - 0.5) * 2 * h * 0.36;
    const rr = 4 + (i % 4) * 2.5;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(96,170,60,0.85)' : i % 3 === 1 ? 'rgba(60,130,44,0.85)' : 'rgba(120,190,80,0.7)';
    ctx.beginPath(); ctx.arc(x, y + Math.sin(t + i) * 0.6, rr, 0, Math.PI * 2); ctx.fill();
  }
  // fine fronds
  ctx.strokeStyle = 'rgba(150,215,110,0.55)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < 40; i++) {
    const a = ((seed + i * 197) % 100) / 100, b = ((seed + i * 53) % 100) / 100;
    const x = (a - 0.5) * 2 * w * 0.95, y = -h * 0.35 - (b - 0.5) * 2 * h * 0.38;
    const sw = Math.sin(t * 1.3 + i) * 1.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw, y - 3, x + sw * 2 + (a - 0.5) * 3, y - 6 - b * 3); ctx.stroke();
  }
}

function drawAnubias(ctx, sz, sway) {
  const n = 3 + Math.round(sz * 3);
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42;
    const len = 40 * sz * (0.7 + (i % 2) * 0.3);
    const ex = Math.cos(ang) * len + sway * 0.4, ey = Math.sin(ang) * len;
    ctx.strokeStyle = '#2f5d24'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(ex * 0.4, ey * 0.7, ex, ey); ctx.stroke();
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = i % 2 ? '#2e7a2e' : '#256b28';
    ctx.beginPath(); ctx.ellipse(0, -14 * sz, 12 * sz, 18 * sz, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(160,220,140,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -28 * sz); ctx.stroke();
    ctx.restore();
  }
}

function drawFern(ctx, sz, sway) {
  const n = 4 + Math.round(sz * 3);
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.28;
    const len = 110 * sz * (0.75 + ((i * 37) % 10) / 40);
    const ex = Math.cos(ang) * len + sway, ey = Math.sin(ang) * len;
    ctx.fillStyle = i % 2 ? 'rgba(52,125,58,0.92)' : 'rgba(40,105,50,0.92)';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(ex * 0.5 - 9, ey * 0.5, ex, ey);
    ctx.quadraticCurveTo(ex * 0.5 + 9, ey * 0.5, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,230,150,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(ex * 0.5, ey * 0.5, ex, ey); ctx.stroke();
  }
}

function drawStem(ctx, sz, sway, t) {
  for (let k = -1; k <= 1; k++) {
    const h = 190 * sz * (k === 0 ? 1 : 0.8);
    const x0 = k * 9;
    ctx.strokeStyle = '#4a7a2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.quadraticCurveTo(x0 + sway * 0.5, -h * 0.5, x0 + sway, -h); ctx.stroke();
    const leaves = Math.floor(h / 14);
    for (let i = 1; i <= leaves; i++) {
      const f = i / leaves;
      const lx = x0 + sway * f * f, ly = -h * f;
      const red = 0.5 + 0.5 * f;
      ctx.fillStyle = `rgba(${Math.round(120 + 100 * red)},${Math.round(150 - 60 * red)},${Math.round(60)},0.9)`;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(lx + side * 6, ly, 7, 2.2, side * 0.3 + Math.sin(t + i) * 0.05, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

function drawFloating(ctx, sz, t, p) {
  const n = 2 + Math.round(sz * 3);
  const spread = 20 * sz;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * spread + Math.sin(t * 0.5 + i) * 2;
    const r = 10 + (i % 2) * 4;
    // roots
    ctx.strokeStyle = 'rgba(230,230,220,0.55)'; ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * 3 - 3, 4); ctx.quadraticCurveTo(x + k * 3 - 3 + Math.sin(t + k + i) * 4, 20 + k * 6, x + k * 4 - 6, 34 + k * 8 * sz); ctx.stroke(); }
    ctx.fillStyle = i % 2 ? '#7cc45a' : '#69b34a';
    ctx.beginPath(); ctx.ellipse(x, 2, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, 0, r * 0.4, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawCrypt(ctx, sz, sway) {
  const n = 4 + Math.round(sz * 3);
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.34;
    const len = 80 * sz * (0.7 + ((i * 29) % 10) / 30);
    const ex = Math.cos(ang) * len + sway * 0.8, ey = Math.sin(ang) * len;
    ctx.fillStyle = i % 2 ? 'rgba(96,110,52,0.92)' : 'rgba(120,92,58,0.92)';
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let k = 1; k <= 4; k++) { const f = k / 4; const wob = Math.sin(k * 2.1 + i) * 4; ctx.quadraticCurveTo(ex * (f - 0.12) - 10 - wob, ey * (f - 0.12), ex * f - 6 * (1 - f), ey * f); }
    for (let k = 4; k >= 1; k--) { const f = k / 4; const wob = Math.sin(k * 2.1 + i + 1) * 4; ctx.quadraticCurveTo(ex * (f - 0.12) + 10 + wob, ey * (f - 0.12), ex * (f - 0.25) + 6 * (1 - f), ey * (f - 0.25)); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(200,190,120,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(ex * 0.5, ey * 0.5, ex, ey); ctx.stroke();
  }
}

function drawBuce(ctx, sz, sway, p) {
  const n = 5 + Math.round(sz * 5);
  ctx.fillStyle = '#3a2a1c'; ctx.beginPath(); ctx.ellipse(0, -4, 14 * sz + 6, 5, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < n; i++) {
    const a = ((p.id * 7 + i * 131) % 100) / 100;
    const ang = -Math.PI / 2 + (a - 0.5) * 1.8;
    const len = 26 * sz * (0.6 + a * 0.6);
    const ex = Math.cos(ang) * len + sway * 0.3, ey = Math.sin(ang) * len - 4;
    ctx.strokeStyle = '#2f3a24'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(ex * 0.7, ey * 0.7); ctx.stroke();
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = i % 3 === 0 ? '#2f5a3a' : i % 3 === 1 ? '#264a3a' : '#3a5a48';
    ctx.beginPath(); ctx.ellipse(0, -7 * sz, 5.5 * sz, 10 * sz, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(140,200,220,0.28)'; ctx.beginPath(); ctx.ellipse(-1.5 * sz, -9 * sz, 2 * sz, 4 * sz, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawHairgrass(ctx, sz, t, p) {
  const w = 60 * (0.5 + sz * 0.5), h = 30 * sz;
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const a = ((p.id * 13 + i * 197) % 100) / 100, b = ((p.id * 3 + i * 53) % 100) / 100;
    const x = (a - 0.5) * 2 * w;
    const len = h * (0.6 + b * 0.5);
    const sway = Math.sin(t * 1.4 + i * 0.3 + p.x * 0.01) * 3 * (len / h);
    ctx.strokeStyle = i % 3 ? 'rgba(110,190,70,0.9)' : 'rgba(70,140,50,0.9)';
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + sway * 0.5, -len * 0.6, x + sway + (a - 0.5) * 4, -len); ctx.stroke();
  }
}
