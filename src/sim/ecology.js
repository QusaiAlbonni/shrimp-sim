// Water chemistry, plants, algae, biofilm, food and snails.
import { clamp } from '../rng.js';
import { narrate } from './narrative.js';

// The substrate is a band with depth: z=0 is the front glass, z=1 the back.
export const TANK = { x0: 24, x1: 936, top: 56, floor: 470, floorBack: 452, floorFront: 492, depth: 40, bottom: 540, w: 960, h: 540 };
export const floorY = (z) => TANK.floorFront - clamp(z, 0, 1) * TANK.depth; // ground line on screen for a depth
export const zOf = (y) => clamp((TANK.floorFront - y) / TANK.depth, 0, 1);  // depth of an object whose base sits at y
export const grounded = (o) => o.y > floorY(o.z) - 10;
// Change depth while keeping a grounded object on its ground line.
export function setZ(o, z) {
  const g0 = floorY(o.z), wasGrounded = grounded(o);
  o.z = clamp(z, 0, 1);
  if (wasGrounded) o.y += floorY(o.z) - g0;
  o.y = Math.min(o.y, floorY(o.z) - 3);
}

export const DECOR = {
  filter:    { name: 'Sponge filter', sprite: 'filter', w: 64, h: 130, hide: 2, biofilm: 0.5, price: 0, obsessable: true },
  driftwood: { name: 'Driftwood', sprite: 'driftwood', w: 240, h: 120, hide: 3, biofilm: 0.6, price: 15, obsessable: true },
  cholla:    { name: 'Cholla wood', sprite: 'cholla', w: 130, h: 60, hide: 3, biofilm: 0.7, price: 6, obsessable: true },
  rock:      { name: 'Rock', sprite: 'rock', w: 110, h: 76, hide: 1, biofilm: 0.3, price: 5, obsessable: true },
  cave:      { name: 'Cave', sprite: 'cave', w: 150, h: 96, hide: 4, biofilm: 0.3, price: 12, obsessable: true },
  tube:      { name: 'Ceramic tube', sprite: 'tube', w: 96, h: 56, hide: 3, biofilm: 0.2, price: 8, obsessable: true },
  hut:       { name: 'Coconut hut', sprite: 'hut', w: 120, h: 104, hide: 4, biofilm: 0.4, price: 10, obsessable: true },
  bamboo:    { name: 'Bamboo', sprite: 'bamboo', w: 70, h: 210, hide: 1, biofilm: 0.3, price: 9, obsessable: true },
  mossball:  { name: 'Moss ball', sprite: 'mossball', w: 60, h: 60, hide: 2, biofilm: 0.8, price: 7, obsessable: true, mossy: true },
};

export const PLANTS = {
  moss:     { name: 'Java moss', rate: 0.06, max: 1.6, hide: 3, biofilm: 0.7, uptake: 0.5, h: 60, w: 90, price: 8, mossy: true },
  anubias:  { name: 'Anubias', rate: 0.015, max: 1.2, hide: 2, biofilm: 0.3, uptake: 0.3, h: 70, w: 80, price: 10 },
  javafern: { name: 'Java fern', rate: 0.02, max: 1.3, hide: 2, biofilm: 0.3, uptake: 0.4, h: 120, w: 70, price: 9 },
  stem:     { name: 'Rotala', rate: 0.09, max: 1.5, hide: 1, biofilm: 0.2, uptake: 0.8, h: 200, w: 50, price: 6 },
  floating: { name: 'Water lettuce', rate: 0.1, max: 2.0, hide: 1, biofilm: 0.3, uptake: 1.0, floating: true, h: 40, w: 90, price: 5 },
};

export const FOODS = {
  pellet:   { name: 'Shrimp pellet', amount: 1, decayH: 20, ammonia: 0.12, rot: 0.004, price: 3, pack: 10, color: '#8a6a3a' },
  wafer:    { name: 'Algae wafer', amount: 1.6, decayH: 26, ammonia: 0.12, rot: 0.005, veg: true, price: 3, pack: 8, color: '#3a5a2a' },
  zucchini: { name: 'Blanched zucchini', amount: 3, decayH: 30, ammonia: 0.08, rot: 0.01, veg: true, price: 2, pack: 5, color: '#b8d46a' },
  leaf:     { name: 'Almond leaf', amount: 2, decayH: 120, ammonia: 0.02, rot: 0.003, veg: true, leaf: true, price: 4, pack: 3, color: '#8a5a2a' },
  pollen:   { name: 'Bee pollen', amount: 0.5, decayH: 8, ammonia: 0.15, rot: 0.02, treat: true, price: 5, pack: 6, color: '#f0c040' },
};

export const SNAILS = {
  nerite:   { name: 'Nerite snail', sprite: 'nerite', graze: 0.004, breeds: false, foodEat: 0.2, price: 5, w: 44, h: 32 },
  ramshorn: { name: 'Ramshorn snail', sprite: 'ramshorn', graze: 0.0015, breeds: true, foodEat: 1, price: 3, w: 34, h: 34 },
  bladder:  { name: 'Bladder snail', sprite: 'bladder', graze: 0.001, breeds: true, foodEat: 1, price: 0, w: 24, h: 28 },
};
const SNAIL_PERSONALITIES = ['glass', 'wander', 'plant', 'food'];

// ---- spots: every object a shrimp can care about --------------------------
export function buildSpots(world) {
  const spots = [];
  for (const d of world.decor) {
    const t = DECOR[d.type];
    spots.push({ id: d.id, kind: d.type, x: d.x, y: d.y, w: t.w * (d.scale || 1), h: t.h * (d.scale || 1), hide: t.hide, biofilm: t.biofilm, obsessable: t.obsessable, mossy: !!t.mossy, floating: false });
  }
  for (const p of world.plants) {
    const t = PLANTS[p.type];
    const sz = Math.min(p.size, t.max);
    spots.push({ id: p.id, kind: p.type, x: p.x, y: p.y, w: t.w * (0.5 + sz * 0.5), h: t.h * sz, hide: t.hide * Math.min(1, sz), biofilm: t.biofilm * sz, obsessable: true, mossy: !!t.mossy, floating: !!t.floating, plant: true });
  }
  spots.push({ id: 'floor', kind: 'substrate', x: (TANK.x0 + TANK.x1) / 2, y: TANK.floorFront, w: TANK.x1 - TANK.x0, h: 6, hide: 0, biofilm: 0.3, obsessable: false, floor: true });
  world._spots = spots;
  world._hideCap = spots.reduce((s, sp) => s + sp.hide, 0);
  world._mossFactor = Math.min(1, spots.filter((s) => s.mossy).reduce((a, s) => a + (s.plant ? s.h / 60 : 1) * 0.35, 0));
  return spots;
}

// Targets carry a depth. `behind` pushes the point behind the object (used for hiding).
export function pointIn(spot, rng, behind = false) {
  if (spot.floor) { const z = rng.next(); return { x: rng.range(TANK.x0 + 20, TANK.x1 - 20), y: floorY(z) - 4, z }; }
  if (spot.floating) return { x: spot.x + rng.range(-0.4, 0.4) * spot.w, y: spot.y + rng.range(4, 24), z: rng.next() };
  const zObj = zOf(spot.y);
  const z = clamp(zObj + (behind ? rng.range(0.08, 0.4) : rng.range(-0.35, 0.35)), 0, 1);
  return { x: spot.x + rng.range(-0.38, 0.38) * spot.w, y: spot.y - rng.range(0.05, 0.65) * spot.h, z };
}

export function spotTop(spot) {
  if (spot.floating) return { x: spot.x, y: spot.y + 10, z: 0.5 };
  return { x: spot.x, y: spot.y - spot.h * 0.95, z: zOf(spot.y) };
}

// ---- water ------------------------------------------------------------------
export function updateWater(world, dt) {
  const w = world.water;
  const pop = world.shrimp.length;
  const room = 22 + 1.6 * Math.sin(((world.hour - 14) / 24) * Math.PI * 2);
  w.temp += (room - w.temp) * 0.08 * dt;
  if (world.heater.on && w.temp < world.heater.target) w.temp += Math.min(world.heater.target - w.temp, 0.5 * dt);

  let waste = 0;
  for (const s of world.shrimp) waste += s.size * 0.0012;
  waste += world.snails.length * 0.0015;
  waste += world._foodRot || 0; world._foodRot = 0;
  w.nh3 += waste * dt;

  const demand = w.nh3 + w.no2;
  w.bacteria = clamp(w.bacteria + (demand > 0.05 ? 0.004 : -0.0008) * dt, 0.05, 1);
  const n1 = Math.min(w.nh3, w.bacteria * 0.09 * dt); w.nh3 -= n1; w.no2 += n1;
  const n2 = Math.min(w.no2, w.bacteria * 0.11 * dt); w.no2 -= n2; w.no3 += n2 * 3.5;

  const up = world._uptake || 0; world._uptake = 0;
  w.no3 = Math.max(0, w.no3 - up);
  w.nh3 = Math.max(0, w.nh3 - up * 0.05);

  w.tds += (0.05 + pop * 0.002) * dt;
  w.tannin = Math.max(0, w.tannin * (1 - 0.01 * dt));
  const swing = w.kh < 2 ? 0.35 : w.kh < 4 ? 0.12 : 0.05;
  const phTarget = 7.0 + w.kh * 0.07 - w.tannin * 0.4 - w.no3 / 400 + (world.light.on ? swing : -swing) * 0.5;
  w.ph += (phTarget - w.ph) * 0.15 * dt;

  const plantMass = world._plantMass || 0;
  const o2Target = clamp(0.55 + (world.light.on ? plantMass * 0.06 : -plantMass * 0.015) + 0.2 - pop * 0.004 - Math.max(0, w.temp - 24) * 0.02, 0.1, 1);
  w.o2 += (o2Target - w.o2) * 0.2 * dt;

  // Stability: deviation from a slow 48h baseline of each parameter.
  const b = w.base;
  for (const k of ['temp', 'ph', 'tds']) b[k] += (w[k] - b[k]) * Math.min(1, dt / 48);
  const dev = Math.abs(w.temp - b.temp) / 4 + Math.abs(w.ph - b.ph) / 0.5 + Math.abs(w.tds - b.tds) / 60;
  w.instability = clamp(dev * 0.8, 0, 1);
}

// ---- plants -------------------------------------------------------------------
export function updatePlants(world, dt) {
  const w = world.water;
  const L = world.light.on ? world.light.intensity / 3 : 0;
  let uptake = 0, mass = 0, shade = 0;
  for (const p of world.plants) {
    if (p.type === 'floating') shade += p.size * 0.22;
  }
  shade = Math.min(0.65, shade);
  for (const p of world.plants) {
    const t = PLANTS[p.type];
    const light = L * (t.floating ? 1 : 1 - shade);
    const nutrient = w.no3 / (w.no3 + 6);
    const growth = (t.rate / 24) * light * nutrient * (1 - p.size / t.max) * dt;
    p.size = clamp(p.size + growth, 0.1, t.max);
    if (w.no3 < 1) p.size = Math.max(0.15, p.size - 0.0005 * dt);
    uptake += p.size * t.uptake * 0.07 * (0.3 + light) * dt;
    mass += p.size;
    if (p.size >= t.max - 0.01 && !p.overgrown) {
      p.overgrown = true;
      if (t.floating) narrate(world, 'overgrown', {}, { index: 0 });
      else if (t.mossy) narrate(world, 'overgrown', {}, { index: 1 });
    }
    if (p.size < t.max - 0.3) p.overgrown = false;
  }
  world._uptake = (world._uptake || 0) + uptake;
  world._plantMass = mass;
  world._shade = shade;
}

// ---- algae + biofilm -------------------------------------------------------------
export function updateAlgae(world, dt) {
  const a = world.algae, w = world.water;
  const L = world.light.on ? world.light.intensity / 3 : 0;
  const shade = world._shade || 0;
  const pop = world.shrimp.length;
  const growth = L * (1 - shade) * 0.008 * (0.4 + w.no3 / 25) + 0.0002;
  let graze = pop * 0.00005;
  for (const s of world.snails) graze += SNAILS[s.type].graze * s.size;
  a.film = clamp(a.film + (growth - graze * (0.3 + a.film)) * dt, 0, 1);
  if (a.film > 0.55 && w.no3 > 20 && L > 0) a.hair += 0.0025 * L * dt;
  a.hair = clamp(a.hair - (pop * 0.0004 + world.snails.length * 0.0003 + (a.film < 0.3 ? 0.001 : 0)) * (0.3 + a.hair) * dt, 0, 1);
  const diatomTarget = world.tankAge < 45 ? 0.4 * (1 - world.tankAge / 45) : 0;
  a.diatom += (diatomTarget - a.diatom) * 0.02 * dt;
  if (a.film > 0.7 && !world.flags.algaeBloom) { world.flags.algaeBloom = true; narrate(world, 'algaeBloom', {}, { index: a.hair > 0.3 ? 1 : 0, toast: true }); }
  if (a.film < 0.4) world.flags.algaeBloom = false;

  const spots = world._spots || [];
  const surface = spots.reduce((s, sp) => s + sp.biofilm, 0) + 1;
  const mature = Math.min(1, world.tankAge / 25 + 0.3);
  const leaf = world.food.some((f) => f.type === 'leaf');
  const cap = Math.min(1, 0.4 + surface * 0.08);
  world.biofilm = clamp(world.biofilm + (0.02 * mature * (0.3 + surface * 0.12) * (1 - world.biofilm / cap) + (leaf ? 0.004 : 0)) * dt, 0, cap);
}

// ---- food + molts -------------------------------------------------------------------
export function updateFood(world, dt) {
  const w = world.water;
  let rot = 0;
  for (let i = world.food.length - 1; i >= 0; i--) {
    const f = world.food[i]; const t = FOODS[f.type];
    f.age += dt;
    if (f.z == null) f.z = 0.5;
    const sinkY = floorY(f.z) - 3;
    if (f.y < sinkY) f.y = Math.min(sinkY, f.y + 500 * dt); // sinks to the substrate
    const r = Math.min(f.amount, t.rot * dt);
    f.amount -= r; rot += r * t.ammonia * 0.5 / dt;
    if (t.leaf) w.tannin = Math.min(1, w.tannin + 0.003 * dt);
    if (f.age > t.decayH || f.amount <= 0.02) {
      if (f.amount > 0) w.nh3 += f.amount * t.ammonia;
      world.food.splice(i, 1);
    }
  }
  world._foodRot = (world._foodRot || 0) + rot;
  for (let i = world.molts.length - 1; i >= 0; i--) {
    const m = world.molts[i]; m.age += dt;
    if (m.age > 60 || m.amount <= 0.05) world.molts.splice(i, 1);
  }
}

// ---- snails -------------------------------------------------------------------
export function createSnail(world, type, x, y, z) {
  const rng = world.rng;
  const z0 = z ?? rng.next();
  const s = {
    id: world.nextId++, type, x: x ?? rng.range(TANK.x0 + 30, TANK.x1 - 30), y: y ?? floorY(z0) - 2, z: z0,
    size: type === 'bladder' ? rng.range(0.4, 0.8) : rng.range(0.7, 1), age: 0,
    personality: rng.pick(SNAIL_PERSONALITIES), target: null, onGlass: false, facing: 1,
  };
  world.snails.push(s);
  return s;
}

export function updateSnails(world, dt) {
  const rng = world.rng;
  for (const s of world.snails) {
    const t = SNAILS[s.type];
    s.age += dt / 24;
    if (s.type !== 'nerite') s.size = Math.min(1, s.size + 0.002 * dt);
    if (s.z == null) s.z = 0.5;
    if (!s.target) s.target = pickSnailTarget(s, world);
    const dx = s.target.x - s.x, dy = s.target.y - s.y;
    const dist = Math.hypot(dx, dy);
    const speed = 9 * (0.5 + s.size * 0.5);
    if (dist < 3) {
      s.target = rng.chance(0.15 * dt) ? pickSnailTarget(s, world) : s.target;
      if (s.target.food) {
        const f = world.food.find((x) => x.id === s.target.food);
        if (f) { f.amount -= 0.03 * t.foodEat * dt; world._snailFed = (world._snailFed || 0) + 0.03 * t.foodEat * dt; } else s.target = null;
      }
    } else {
      const step = Math.min(dist, speed * dt);
      s.x += (dx / dist) * step; s.y += (dy / dist) * step;
      if (s.target.z != null) s.z += (s.target.z - s.z) * Math.min(1, step / dist);
      s.facing = dx < 0 ? -1 : 1;
    }
    s.onGlass = s.x < TANK.x0 + 12 || s.x > TANK.x1 - 12;
  }
}

function pickSnailTarget(s, world) {
  const rng = world.rng;
  const p = s.personality;
  if (p === 'food' || (p !== 'glass' && rng.chance(0.3))) {
    if (world.food.length) { const f = rng.pick(world.food); return { x: f.x, y: f.y, food: f.id }; }
  }
  if (p === 'glass' || rng.chance(0.25)) {
    const left = rng.chance(0.5);
    return { x: left ? TANK.x0 + 6 : TANK.x1 - 6, y: rng.range(TANK.top + 30, TANK.floorBack - 6), z: 0.5 };
  }
  if (p === 'plant' && world._spots) {
    const cands = world._spots.filter((sp) => !sp.floor && !sp.floating);
    if (cands.length) return pointIn(rng.pick(cands), rng);
  }
  const z = rng.next();
  return { x: rng.range(TANK.x0 + 20, TANK.x1 - 20), y: floorY(z) - 2, z };
}

export function dailySnails(world) {
  const rng = world.rng;
  const breeders = world.snails.filter((s) => SNAILS[s.type].breeds);
  const leftover = Math.min(3, world.food.reduce((a, f) => a + f.amount, 0) + (world._snailFed || 0) * 4);
  world._snailFed = 0;
  if (breeders.length && world.snails.length < 30) {
    const expected = breeders.length * 0.05 * (0.4 + leftover);
    const n = Math.floor(expected + rng.next());
    for (let i = 0; i < n; i++) { const parent = rng.pick(breeders); createSnail(world, parent.type, parent.x + rng.range(-20, 20), undefined, parent.z); }
    if (n > 0 && rng.chance(0.25)) narrate(world, 'snailBreed');
    if (world.snails.length >= 20 && !world.flags.snailBoom) { world.flags.snailBoom = true; narrate(world, 'snailBoom'); }
    if (world.snails.length < 12) world.flags.snailBoom = false;
  }
  for (let i = world.pendingHitchhikers.length - 1; i >= 0; i--) {
    const h = world.pendingHitchhikers[i];
    if (world.day >= h.day) {
      world.pendingHitchhikers.splice(i, 1);
      createSnail(world, 'bladder');
      narrate(world, 'snailArrive', { object: h.object }, { toast: true });
    }
  }
  // old snails die quietly
  for (let i = world.snails.length - 1; i >= 0; i--) {
    const s = world.snails[i];
    const life = s.type === 'nerite' ? 700 : 300;
    if (s.age > life && rng.chance(0.1)) world.snails.splice(i, 1);
  }
}
