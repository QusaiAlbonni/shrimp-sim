// Procedural shrimp drawing. Local frame faces LEFT (head at -x); we mirror
// for facing > 0. Colour, opacity, pattern and specials come from the phenotype.

// Catmull-Rom → bezier path through points (closed = false)
function curve(ctx, pts, close = false) {
  const n = pts.length;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (close) ctx.closePath();
}

// Body contours (size 1 ≈ 34 units long before the 1.7 render scale).
const TOP = [[-14, -1.5], [-10, -6], [-4, -7.5], [2, -7], [7, -5.5], [11.5, -2.5], [15, 1.5], [17, 5]];
const BOT = [[17, 7.5], [14, 5], [10.5, 2], [6, 1], [1, 1.5], [-5, 2.5], [-10, 2.5], [-14, 1]];
const BODY = [...TOP, ...BOT];
const HEAD = [[-14, -1.5], [-10, -6], [-4, -7.5], [1, -7], [2.5, -3], [1.5, 1.5], [-5, 2.5], [-10, 2.5], [-14, 1]];
const TAILSEG = [[11.5, -2.5], [15, 1.5], [17, 5], [17, 7.5], [14, 5], [10.5, 2]];
const SEGS = [[2, -7, 1, 1.5], [5.5, -6.2, 4.5, 1], [8.8, -4.6, 7.8, 1.3], [11.6, -2.6, 10.6, 2], [14, 0.5, 13, 3.8]]; // x1,y1,x2,y2 of tergite lines

export function drawShrimp(ctx, s, t, opts = {}) {
  const ph = s.pheno;
  const scale = 1.7 * s.size * (1 - 0.2 * (s.z ?? 0.5)); // further back draws smaller
  const swim = s.mode === 'swim' && !s.arrived;
  const moving = !!s.moving && !s.arrived;
  const ghost = !!opts.ghost;
  const wig = t * (swim ? 26 : moving ? 11 : 2.5) + (s.id || 0) * 1.7;

  ctx.save();
  ctx.translate(s.x, s.y);
  if (s.facing > 0) ctx.scale(-1, 1);
  ctx.scale(scale, scale);
  if (swim) ctx.rotate(0.15);
  if (moving && !swim) ctx.translate(0, Math.sin(wig) * 0.3);

  const [r, g, b] = ghost ? [235, 235, 240] : ph.rgb;
  const alpha = ghost ? 0.3 : ph.opacity * (s.moltRecent > 0 ? 0.85 : 1);
  const rgba = (a) => `rgba(${r},${g},${b},${a})`;
  const dark = (a) => `rgba(${Math.round(r * 0.45)},${Math.round(g * 0.45)},${Math.round(b * 0.45)},${a})`;
  const outline = ghost ? 'rgba(255,255,255,0.35)' : dark(Math.min(0.9, alpha + 0.25));
  const limb = ghost ? 'rgba(255,255,255,0.3)' : rgba(Math.min(1, alpha * 0.8 + 0.1));

  // ---- appendages behind the body ----
  ctx.lineCap = 'round';
  ctx.strokeStyle = limb;
  // long antennae (2) + short antennules (2)
  ctx.lineWidth = 0.55;
  for (const sgn of [-1, 1]) {
    const w1 = Math.sin(wig * 0.45 + sgn) * 2, w2 = Math.sin(wig * 0.3 + sgn * 2) * 3;
    ctx.beginPath(); ctx.moveTo(-14, -2);
    ctx.bezierCurveTo(-20, -5 - 2 * sgn + w1, -28, -3 * sgn + w1, -36, -1 - 4 * sgn + w2);
    ctx.stroke();
  }
  ctx.lineWidth = 0.5;
  for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-15, -3); ctx.quadraticCurveTo(-19, -5 - sgn * 1.5, -22, -4 - sgn * 3 + Math.sin(wig * 0.6) * 0.8); ctx.stroke(); }
  // walking legs: 5 pairs, two segments each, offset pairs for depth
  for (let i = 0; i < 5; i++) {
    const lx = -10 + i * 2.6;
    const ph1 = wig + i * 1.25;
    const sw = swim ? Math.sin(ph1) * 0.6 : moving ? Math.sin(ph1) * 1.6 : Math.sin(ph1) * 0.25;
    for (const depth of [0, 1]) {
      ctx.lineWidth = depth ? 0.5 : 0.7;
      ctx.strokeStyle = depth ? dark(alpha * 0.5 + 0.15) : limb;
      const k = depth ? -sw * 0.8 : sw;
      ctx.beginPath(); ctx.moveTo(lx, 2.2); ctx.lineTo(lx + k * 0.6 - 0.8, 5.2 + depth * 0.3); ctx.lineTo(lx + k - 1.6, 8 + depth * 0.4); ctx.stroke();
    }
  }
  // pleopods (swimmerets) under the abdomen
  ctx.strokeStyle = limb; ctx.lineWidth = 0.6;
  for (let i = 0; i < 5; i++) {
    const px = 2.5 + i * 2.4, py = 1.6 + i * 0.35;
    const fl = swim ? Math.sin(wig * 1.6 + i * 0.8) * 2.2 : moving ? Math.sin(wig * 0.8 + i) * 0.6 : Math.sin(wig * 0.5 + i) * 0.3;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px - 0.6 + fl * 0.5, py + 2.4, px - 1.2 + fl, py + 4); ctx.stroke();
  }
  // tail fan: telson + two uropods each side
  ctx.fillStyle = ghost ? 'rgba(235,235,240,0.3)' : rgba(alpha * 0.85);
  ctx.strokeStyle = outline; ctx.lineWidth = 0.4;
  for (const [ang, len, w] of [[0.95, 6.5, 2.2], [0.7, 6, 1.9], [1.2, 5.8, 1.9], [0.5, 5, 1.5], [1.4, 5, 1.5]]) {
    ctx.save(); ctx.translate(16.5, 6); ctx.rotate(ang);
    ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, w / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---- body ----
  const clear = ghost ? 'rgba(235,235,240,0.22)' : 'rgba(210,200,180,0.35)';
  ctx.beginPath(); curve(ctx, BODY, true); ctx.fillStyle = clear; ctx.fill();

  const grad = ctx.createLinearGradient(0, -8, 0, 8);
  grad.addColorStop(0, `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},${alpha})`);
  grad.addColorStop(0.45, rgba(alpha));
  grad.addColorStop(1, dark(alpha));
  const paint = (pts, a = 1) => {
    ctx.beginPath(); curve(ctx, pts, true);
    if (a === 1) ctx.fillStyle = grad; else ctx.fillStyle = rgba(alpha * a);
    ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 0.5; ctx.stroke();
  };
  if (ph.rili && !ghost) { paint(BODY, 0.1); paint(HEAD); paint(TAILSEG); }
  else paint(BODY);

  // tergite (segment) lines with a light rim so segments read as overlapping plates
  for (const [x1, y1, x2, y2] of SEGS) {
    ctx.strokeStyle = outline; ctx.lineWidth = 0.45;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(x1 - 1.6, (y1 + y2) / 2, x2, y2); ctx.stroke();
    if (!ghost) { ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(x1 + 0.6, y1 + 0.3); ctx.quadraticCurveTo(x1 - 1, (y1 + y2) / 2, x2 + 0.6, y2); ctx.stroke(); }
  }
  // carapace edge
  ctx.strokeStyle = outline; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(1, -7); ctx.quadraticCurveTo(2.8, -3, 1.5, 1.5); ctx.stroke();

  if (ph.tiger && !ghost) {
    ctx.fillStyle = `rgba(22,16,26,${alpha * 0.85})`;
    for (const [x1, y1, x2, y2] of SEGS.slice(0, 4)) { ctx.beginPath(); ctx.moveTo(x1 + 1.2, y1 + 0.6); ctx.quadraticCurveTo(x1 - 0.4, (y1 + y2) / 2, x2 + 1.2, y2 - 0.2); ctx.lineTo(x2 + 2.2, y2 - 0.3); ctx.quadraticCurveTo(x1 + 0.6, (y1 + y2) / 2, x1 + 2.2, y1 + 0.9); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-8, -5.5); ctx.quadraticCurveTo(-9.5, -1, -8, 2); ctx.lineTo(-7, 2); ctx.quadraticCurveTo(-8.5, -1, -7, -5.5); ctx.fill();
  }
  if (ph.galaxy && !ghost) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const [px, py, rr] of [[-8, -2, 1], [-4, 0.5, 0.8], [0, -4, 1.1], [4, -2.5, 0.9], [7, 0, 0.7], [10, -1.5, 1], [13, 2, 0.8], [-11, 0.5, 0.6], [2, 0, 0.6]]) { ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill(); }
  }
  if (ph.sheen && !ghost) {
    const gl = ctx.createLinearGradient(0, -7, 0, 3);
    gl.addColorStop(0, 'rgba(255,255,255,0.6)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.08)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); curve(ctx, BODY, true); ctx.fillStyle = gl; ctx.fill();
  }
  // dorsal highlight
  if (!ghost) {
    ctx.strokeStyle = `rgba(255,255,255,${0.18 + ph.tier * 0.04})`; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-10, -5); ctx.quadraticCurveTo(-2, -7, 6, -5); ctx.stroke();
  }

  // rostrum with serrations, stalked eye
  ctx.strokeStyle = outline; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-14, -1.8); ctx.lineTo(-19.5, -3.5); ctx.stroke();
  ctx.lineWidth = 0.45;
  for (let i = 0; i < 3; i++) { const x = -15.5 - i * 1.3; ctx.beginPath(); ctx.moveTo(x, -2.3 - i * 0.4); ctx.lineTo(x - 0.4, -3.4 - i * 0.4); ctx.stroke(); }
  ctx.strokeStyle = limb; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(-11.5, -3.5); ctx.lineTo(-13.6, -5.2); ctx.stroke();
  ctx.fillStyle = ghost ? 'rgba(255,255,255,0.4)' : ph.orangeEye ? '#ff8c1a' : '#141018';
  ctx.beginPath(); ctx.arc(-14, -5.6, 1.25, 0, Math.PI * 2); ctx.fill();
  if (!ghost) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-14.4, -6, 0.4, 0, Math.PI * 2); ctx.fill(); }

  // eggs tucked under the abdomen
  if (s.berried && !ghost) {
    const ripe = s.berried.days / s.berried.hatchAt;
    ctx.fillStyle = ripe > 0.7 ? 'rgba(120,110,60,0.95)' : 'rgba(222,200,70,0.95)';
    for (let i = 0; i < 11; i++) {
      const ex = 2 + (i % 6) * 1.8, ey = 2.2 + Math.floor(i / 6) * 1.6 + (i % 2) * 0.5;
      ctx.beginPath(); ctx.arc(ex, ey, 1.05, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.3;
    for (let i = 0; i < 11; i++) { const ex = 2 + (i % 6) * 1.8, ey = 2.2 + Math.floor(i / 6) * 1.6 + (i % 2) * 0.5; ctx.beginPath(); ctx.arc(ex, ey, 1.05, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}

// Soft ground shadow, drawn before the body when a shrimp is near the substrate.
export function drawShrimpShadow(ctx, s, floorY) {
  const h = floorY - s.y;
  if (h > 40) return;
  const k = 1 - h / 40, dz = 1 - 0.2 * (s.z ?? 0.5);
  ctx.fillStyle = `rgba(0,0,0,${0.26 * k})`;
  ctx.beginPath(); ctx.ellipse(s.x + 2 * s.facing, floorY - 1, 26 * s.size * dz * (0.8 + 0.2 * k), 3.2 * s.size * dz, 0, 0, Math.PI * 2); ctx.fill();
}

// Small standalone shrimp for the loading screen and dex swatches.
export function swatchShrimp(ctx, x, y, size, rgb, opacity, extras = {}, facing = -1, t = 0, moving = false) {
  const fake = { id: 0, x, y, size, facing, mode: 'walk', arrived: !moving, moving, moltRecent: 0, berried: null,
    pheno: { rgb, opacity, tier: extras.tier || 2, rili: !!extras.rili, tiger: !!extras.tiger, galaxy: !!extras.galaxy, sheen: !!extras.sheen, orangeEye: !!extras.orangeEye } };
  drawShrimp(ctx, fake, t);
}
