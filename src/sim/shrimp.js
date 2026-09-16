// Shrimp entities: needs, utility-based decisions, movement, memory, molting,
// breeding, quirks. Everything on a shrimp is plain JSON so saves are trivial.
import { clamp } from '../rng.js';
import { phenotype, makeGamete, combine } from './genetics.js';
import { TANK, FOODS, pointIn, spotTop, floorY, setZ, grounded } from './ecology.js';
import { narrate, displayName, nounFor, data } from './narrative.js';

const TRAITS = ['bold', 'social', 'curious', 'greedy', 'lazy', 'fussy'];

export function createShrimp(world, opts = {}) {
  const rng = world.rng;
  const sex = opts.sex || (rng.chance(0.5) ? 'F' : 'M');
  const genome = opts.genome;
  const age = opts.age ?? 60;
  const p = {};
  for (const t of TRAITS) {
    const base = opts.parents ? (opts.parentTraits[0][t] + opts.parentTraits[1][t]) / 2 : 0.5;
    p[t] = clamp(base + rng.gauss() * (opts.parents ? 0.14 : 0.22), 0.05, 0.95);
  }
  const s = {
    id: world.nextId++, nickname: null, sex, genome, pheno: phenotype(genome, sex),
    born: world.day - age, age, stage: age >= 40 ? 'adult' : 'juvenile',
    size: opts.size ?? (age >= 40 ? (sex === 'F' ? rng.range(0.85, 1) : rng.range(0.7, 0.85)) : 0.15 + age * 0.014),
    health: 1, hunger: rng.range(0.2, 0.5), stress: 0.1, energy: rng.range(0.6, 1),
    z: opts.z ?? rng.next(),
    x: opts.x ?? rng.range(TANK.x0 + 40, TANK.x1 - 40), y: opts.y ?? floorY(opts.z ?? 0.5) - 6,
    facing: rng.chance(0.5) ? 1 : -1, mode: 'walk', action: 'rest', target: null, arrived: true,
    decideIn: rng.range(0, 0.5), dwell: 0, hiding: false, atSpot: null, foodTarget: null,
    p, quirks: [], obsession: null, favSpot: null, friends: [], mem: { spots: {}, near: {}, samples: 0 },
    moltIn: age >= 40 ? rng.range(4, 24) : rng.range(2, 5), moltRecent: 0, moltCount: 0, moltSpots: {},
    berried: null, receptiveUntil: 0, lifespan: 230 + rng.range(0, 150),
    parents: opts.parents || null, gen: opts.gen || 0, noFoodUntil: 0, friendNear: false, crowdNear: 0,
    wiggle: rng.range(0, Math.PI * 2), dead: false,
  };
  if (rng.chance(opts.parents ? 0.3 : 0.4)) addInnateQuirk(s, world);
  return s;
}

function addInnateQuirk(s, world) {
  const pool = data().quirks.quirks.filter((q) => q.innate && !s.quirks.some((x) => x.id === q.id));
  if (!pool.length) return;
  const q = world.rng.weighted(pool, (x) => x.weight);
  s.quirks.push({ id: q.id, label: q.label, desc: q.desc });
}

export const hasQ = (s, id) => s.quirks.some((q) => q.id === id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function likesFood(s, type) {
  const t = FOODS[type];
  if (hasQ(s, 'picky')) return !!t.veg;
  if (s.p.fussy > 0.85 && type === 'pellet') return false;
  return true;
}

// ---- per-tick update ----------------------------------------------------------
export function update(s, world, dt) {
  const rng = world.rng, w = world.water;
  s.age += dt / 24;
  s.hunger = clamp(s.hunger + dt * 0.012 * (1 + 0.6 * s.p.greedy) * (s.stage === 'juvenile' ? 1.3 : 1), 0, 1);
  const resting = s.action === 'rest' || (s.action === 'hide' && s.arrived);
  s.energy = clamp(s.energy + dt * (resting ? 0.08 : s.mode === 'swim' ? -0.08 : -0.025), 0, 1);
  if (s.moltRecent > 0) s.moltRecent -= dt;
  if (s.noFoodUntil > 0) s.noFoodUntil -= dt;

  updateStress(s, world, dt);
  updateHealth(s, world, dt);
  if (s.dead) return;

  // growth & stage
  if (s.stage === 'juvenile' && s.age >= 40 && s.size >= 0.68) {
    s.stage = 'adult'; s.pheno = phenotype(s.genome, s.sex);
    if (rng.chance(0.3)) narrate(world, 'stageUp', { name: displayName(s), ids: [s.id] });
  }
  // old age
  if (s.age > s.lifespan && rng.chance(0.02 * dt)) { die(s, world, 'oldAge'); return; }

  // molting
  s.moltIn -= dt / 24;
  if (s.moltIn <= 0) { attemptMolt(s, world); if (s.dead) return; }

  // eggs
  if (s.berried) updateBerried(s, world, dt);

  s.decideIn -= dt;
  if (s.decideIn <= 0) decide(s, world);
  move(s, world, dt);
  act(s, world, dt);
}

function updateStress(s, world, dt) {
  const w = world.water;
  let t = 0;
  t += Math.max(0, w.nh3 - 0.1) * 1.2 + Math.max(0, w.no2 - 0.1) * 1.2 + Math.max(0, w.no3 - 40) / 80;
  if (w.temp > 27) t += (w.temp - 27) * 0.12;
  if (w.temp < 18) t += (18 - w.temp) * 0.08;
  t += w.instability * 0.6;
  const crowd = world.shrimp.length / Math.max(1, (world._hideCap || 1) * 4);
  if (crowd > 1) t += (crowd - 1) * 0.3;
  if (world.light.on && !(s.hiding && s.arrived) && s.p.bold < 0.5) t += (0.5 - s.p.bold) * 0.3 * (world.light.intensity / 3);
  if (w.o2 < 0.5) t += 0.5 - w.o2;
  if (hasQ(s, 'grumpy') && s.crowdNear >= 3) t += 0.2;
  if (s.hiding && s.arrived) t -= 0.2;
  if (s.friendNear) t -= 0.1;
  t -= (world._mossFactor || 0) * 0.1;
  t = clamp(t, 0, 1);
  s.stress += (t - s.stress) * Math.min(1, 0.25 * dt);
}

function updateHealth(s, world, dt) {
  const w = world.water;
  let dh = 0; let worst = null; let worstV = 0;
  const hit = (v, cause) => { dh -= v; if (v > worstV) { worstV = v; worst = cause; } };
  if (w.nh3 > 0.25) hit((w.nh3 - 0.25) * 0.03, 'Ammonia poisoning.');
  if (w.no2 > 0.25) hit((w.no2 - 0.25) * 0.04, 'Nitrite poisoning.');
  if (w.no3 > 60) hit(((w.no3 - 60) / 60) * 0.01, 'Nitrates were far too high.');
  if (w.temp > 29) hit((w.temp - 29) * 0.02, 'The water got too warm.');
  if (w.temp < 14) hit((14 - w.temp) * 0.02, 'The water got too cold.');
  if (w.o2 < 0.4) hit((0.4 - w.o2) * 0.05, 'Not enough oxygen.');
  if (s.hunger > 0.9) hit(0.012, 'It starved.');
  if (s.stress > 0.75) hit((s.stress - 0.75) * 0.04, 'Chronic stress.');
  if (dh === 0 && s.stress < 0.5 && s.hunger < 0.7) dh += 0.01;
  s.health = clamp(s.health + dh * dt, 0, 1);
  s.lastCause = worst;
  if (s.health <= 0) die(s, world, 'death', worst || 'Cause unknown.');
}

export function die(s, world, kind, cause) {
  s.dead = true;
  s.deathCause = kind === 'oldAge' ? 'Old age.' : cause;
  world.stats.deaths++;
  if (kind === 'oldAge') narrate(world, 'oldAge', { name: displayName(s), n: Math.floor(s.age), ids: [s.id] });
  else narrate(world, kind, { name: displayName(s), cause, ids: [s.id] });
  for (const o of world.shrimp) { const i = o.friends.indexOf(s.id); if (i >= 0) o.friends.splice(i, 1); }
}

// ---- molting -----------------------------------------------------------------------
function attemptMolt(s, world) {
  const rng = world.rng, w = world.water;
  let fail = 0.01 + w.instability * 0.2;
  if (w.gh < 4) fail += 0.2; else if (w.gh < 5.5) fail += 0.04;
  if (w.gh > 14) fail += 0.1;
  if (w.tds < 80) fail += 0.1;
  if (s.health < 0.5) fail += 0.15;
  if (rng.chance(fail)) { die(s, world, 'moltFail'); return; }
  world.molts.push({ id: world.nextId++, x: s.x, y: s.y, z: s.z, amount: 1, age: 0, size: s.size, facing: s.facing });
  s.moltRecent = 12;
  s.moltCount++;
  world.stats.molts++;
  const spot = nearestSpot(s, world, 60);
  if (spot && !spot.floor) s.moltSpots[spot.id] = (s.moltSpots[spot.id] || 0) + 1;
  s.moltIn = s.stage === 'juvenile' ? rng.range(2.5, 5) : rng.range(16, 32);
  const max = s.sex === 'F' ? 1.0 : 0.85;
  s.size = Math.min(max, s.size + (s.stage === 'juvenile' ? 0.07 : 0.02));
  if (s.stage === 'adult' && rng.chance(0.35)) narrate(world, 'molt', { name: displayName(s), ids: [s.id] });
  if (s.sex === 'F' && s.stage === 'adult' && s.health > 0.5 && !s.berried && w.temp >= 19 && w.temp <= 27.5) {
    s.receptiveUntil = world.time + 20;
  }
  s.decideIn = 0;
}

export function triggerMoltWave(world) {
  let n = 0;
  for (const s of world.shrimp) if (s.moltIn < 6 && world.rng.chance(0.5)) { s.moltIn = world.rng.range(0.05, 0.4); n++; }
  if (n >= 3) narrate(world, 'moltWave');
}

// ---- breeding -------------------------------------------------------------------------
function fertilize(f, m, world) {
  const rng = world.rng;
  const count = Math.round(8 + f.size * 16 + rng.range(-3, 5));
  const eggs = [];
  let mutated = false;
  for (let i = 0; i < count; i++) {
    const { genome, mutations } = combine(makeGamete(m.genome, rng), makeGamete(f.genome, rng));
    if (mutations.length) mutated = true;
    eggs.push(genome);
  }
  f.berried = { days: 0, hatchAt: rng.range(22, 30), eggs, father: m.id, fatherTraits: { ...m.p } };
  f.receptiveUntil = 0;
  narrate(world, 'berried', { name: displayName(f), n: count, ids: [f.id] });
  if (mutated && rng.chance(0.5)) narrate(world, 'mutation', { name: displayName(f), ids: [f.id] });
}

function updateBerried(s, world, dt) {
  const w = world.water, rng = world.rng;
  s.berried.days += dt / 24;
  const risk = (w.instability > 0.6 ? 0.02 : 0) + (w.nh3 > 0.5 ? 0.03 : 0) + (s.stress > 0.8 ? 0.01 : 0);
  if (risk && rng.chance(risk * dt)) {
    s.berried = null;
    narrate(world, 'hatchNone', { name: displayName(s), ids: [s.id] }, { index: 1 });
    return;
  }
  if (s.berried.days >= s.berried.hatchAt) hatch(s, world);
}

function hatch(mother, world) {
  const rng = world.rng, w = world.water;
  const b = mother.berried; mother.berried = null;
  const pop = world.shrimp.length;
  const crowd = Math.max(0, (pop - 25) / 35);
  const survival = clamp(0.15 + world.biofilm * 0.35 + (world._mossFactor || 0) * 0.2 - (w.nh3 > 0.25 ? 0.3 : 0) - (w.no2 > 0.25 ? 0.3 : 0) - crowd, 0.02, 0.9);
  const father = world.shrimp.find((x) => x.id === b.father);
  const fatherTraits = father ? father.p : b.fatherTraits;
  let n = 0; const newMorphs = new Set();
  for (const genome of b.eggs) {
    if (!rng.chance(survival)) continue;
    if (world.shrimp.length >= 70) break;
    const baby = createShrimp(world, {
      genome, age: 0, size: 0.15, parents: [mother.id, b.father], parentTraits: [mother.p, fatherTraits],
      gen: Math.max(mother.gen, father ? father.gen : 0) + 1,
      x: mother.x + rng.range(-30, 30), y: mother.y + rng.range(-10, 10), z: clamp(mother.z + rng.range(-0.2, 0.2), 0, 1),
    });
    world.shrimp.push(baby);
    n++;
    const nm = baby.pheno.name;
    if (!world.dex[nm]) { world.dex[nm] = { first: world.day, stars: baby.pheno.stars, count: 0 }; newMorphs.add(nm); }
  }
  world.stats.births += n;
  if (n === 0) narrate(world, 'hatchNone', { name: displayName(mother), ids: [mother.id] }, { index: 0 });
  else narrate(world, 'hatch', { name: displayName(mother), n, ids: [mother.id] });
  for (const nm of newMorphs) narrate(world, 'newMorph', { morph: nm });
}

// ---- decisions ---------------------------------------------------------------------------
function nearestSpot(s, world, maxD = Infinity) {
  let best = null, bd = maxD;
  for (const sp of world._spots || []) {
    if (sp.floor) continue;
    const dx = Math.abs(sp.x - s.x) - sp.w * 0.4, dy = Math.abs((sp.y - sp.h * 0.4) - s.y) - sp.h * 0.4;
    const d = Math.hypot(Math.max(0, dx), Math.max(0, dy));
    if (d < bd) { bd = d; best = sp; }
  }
  return best;
}

function decide(s, world) {
  const rng = world.rng;
  const spots = world._spots || [];
  const L = world.light.on ? world.light.intensity / 3 : 0.1;

  // sample surroundings for memory (cheap: once per decision, not per tick)
  const near = nearestSpot(s, world, 45);
  s.mem.samples++;
  if (near) s.mem.spots[near.id] = (s.mem.spots[near.id] || 0) + 1;
  let crowd = 0; s.friendNear = false;
  for (const o of world.shrimp) {
    if (o === s) continue;
    if (dist(o, s) < 38) {
      crowd++;
      s.mem.near[o.id] = (s.mem.near[o.id] || 0) + 1;
      if (s.friends.includes(o.id)) s.friendNear = true;
    }
  }
  s.crowdNear = crowd;

  const sc = {};
  sc.hide = s.stress * (1.3 - s.p.bold) + L * (0.6 - s.p.bold) * 0.6 + (s.moltRecent > 0 ? 1.2 : 0)
    + (hasQ(s, 'hermit') ? 0.7 : 0) + (hasQ(s, 'nocturnal') && L > 0.3 ? 0.6 : 0) - (hasQ(s, 'brave') ? 0.3 : 0);
  let food = null, fd = Infinity;
  if (s.noFoodUntil <= 0) for (const f of world.food) {
    if (f.amount < 0.05 || !likesFood(s, f.type)) continue;
    const d = dist(f, s); if (d < fd) { fd = d; food = f; }
  }
  const eaters = food ? world.shrimp.filter((o) => o.foodTarget === food.id).length : 0;
  sc.eat = food ? s.hunger * (0.7 + s.p.greedy * 0.8) * (hasQ(s, 'glutton') ? 1.4 : 1) * (hasQ(s, 'early_bird') ? 1.25 : 1) * (1 - fd / 2500)
    - L * (0.5 - s.p.bold) * 0.3 - (eaters >= 4 && !hasQ(s, 'bully') ? 0.15 : 0) : -9;
  sc.graze = 0.25 + s.hunger * 0.5 * (0.3 + world.biofilm) + (hasQ(s, 'filter_hugger') ? 0.2 : 0);
  sc.social = s.p.social * 0.45 + (s.friends.length ? 0.25 : 0);
  sc.explore = s.p.curious * 0.5 + (s.obsession ? 0.55 : 0) + (hasQ(s, 'climber') ? 0.25 : 0) + (hasQ(s, 'wallflower') ? 0.25 : 0);
  sc.rest = (1 - s.energy) * 1.3 + s.p.lazy * 0.3 + (hasQ(s, 'nocturnal') && L > 0.3 ? 0.3 : 0) + (world.light.on ? 0 : 0.15);
  const receptive = s.sex === 'M' && s.stage === 'adult' ? world.shrimp.filter((f) => f.receptiveUntil > world.time && !f.berried) : [];
  sc.mate = receptive.length ? 1.6 * (0.5 + s.p.bold) : -9;
  sc.zoom = (hasQ(s, 'zoomer') ? 0.35 : 0.02) + (hasQ(s, 'dancer') ? 0.25 : 0) + (s.energy > 0.8 ? 0.05 : 0);
  sc.bubble = hasQ(s, 'bubble_chaser') && world.decor.some((d) => d.type === 'filter') ? 0.35 : -9;
  sc.snail = hasQ(s, 'snail_rider') && world.snails.length ? 0.35 : -9;

  let best = 'graze', bv = -Infinity;
  for (const k in sc) { const v = sc[k] + rng.next() * 0.3; if (v > bv) { bv = v; best = k; } }

  s.action = best; s.hiding = false; s.foodTarget = null; s.arrived = false; s.mode = 'walk'; s.atSpot = null;
  const hideSpots = spots.filter((sp) => sp.hide > 0);
  const fav = spots.find((sp) => sp.id === s.favSpot);
  const obs = spots.find((sp) => sp.id === s.obsession);
  switch (best) {
    case 'hide': {
      let spot = fav && fav.hide > 0 && rng.chance(0.7) ? fav : null;
      if (!spot && hideSpots.length) {
        spot = rng.weighted(hideSpots, (sp) => sp.hide / (1 + dist(sp, s) / 300));
      }
      if (spot) { s.target = pointIn(spot, rng, !spot.floating && rng.chance(0.7)); s.atSpot = spot.id; } else { const z = rng.range(0.5, 1); s.target = { x: rng.chance(0.5) ? TANK.x0 + 20 : TANK.x1 - 20, y: floorY(z) - 4, z }; }
      s.hiding = true; s.dwell = rng.range(1, 4); break;
    }
    case 'eat': {
      s.target = { x: food.x + rng.range(-8, 8), y: food.y + rng.range(-3, 3), z: clamp((food.z ?? 0.5) + rng.range(-0.15, 0.15), 0, 1) };
      s.foodTarget = food.id; s.dwell = rng.range(1, 3);
      if (Math.abs(food.y - s.y) > 50 || fd > 350) s.mode = 'swim';
      break;
    }
    case 'graze': {
      let spot;
      if (hasQ(s, 'filter_hugger') && rng.chance(0.6)) spot = spots.find((sp) => sp.kind === 'filter');
      if (!spot && fav && rng.chance(0.4)) spot = fav;
      if (!spot) spot = rng.weighted(spots, (sp) => sp.biofilm + 0.1);
      s.target = pointIn(spot, rng); s.atSpot = spot.id; s.dwell = rng.range(0.5, 2); break;
    }
    case 'social': {
      const friendId = s.friends.length ? rng.pick(s.friends) : null;
      const other = (friendId && world.shrimp.find((o) => o.id === friendId)) || rng.pick(world.shrimp);
      { const z = clamp(other.z + rng.range(-0.3, 0.3), 0, 1); s.target = { x: other.x + rng.range(-16, 16), y: other.y + (floorY(z) - floorY(other.z)), z }; } s.dwell = rng.range(0.5, 1.5); break;
    }
    case 'explore': {
      let spot = obs && rng.chance(0.75) ? obs : null;
      if (!spot && hasQ(s, 'climber') && rng.chance(0.5)) {
        const tall = spots.filter((sp) => sp.plant && !sp.floating).sort((a, b) => b.h - a.h)[0];
        if (tall) { const t = spotTop(tall); s.target = { x: t.x + rng.range(-6, 6), y: t.y, z: t.z }; s.atSpot = tall.id; s.mode = 'swim'; s.dwell = rng.range(1, 3); break; }
      }
      if (!spot && hasQ(s, 'wallflower') && rng.chance(0.5)) { s.target = { x: rng.range(TANK.x0 + 30, TANK.x1 - 30), y: floorY(0.02) - 3, z: 0.02 }; s.dwell = rng.range(1, 3); s.wall = true; break; }
      if (!spot) spot = rng.pick(spots.filter((sp) => !sp.floor)) || spots[0];
      s.target = pointIn(spot, rng); s.atSpot = spot.id; s.dwell = rng.range(1, 3);
      if (spot.floating || Math.abs(s.target.y - s.y) > 80) s.mode = 'swim';
      break;
    }
    case 'rest': s.target = { x: s.x, y: s.y, z: s.z }; s.arrived = true; s.dwell = rng.range(1, 3); s.atSpot = near ? near.id : null; break;
    case 'mate': {
      const f = rng.weighted(receptive, (x) => 1 / (1 + dist(x, s) / 200));
      s.target = { x: f.x, y: f.y, z: f.z }; s.chasing = f.id; s.mode = 'swim'; s.dwell = 0.5; break;
    }
    case 'zoom': s.target = { x: rng.range(TANK.x0 + 40, TANK.x1 - 40), y: rng.range(TANK.top + 40, TANK.floorBack - 40), z: rng.next() }; s.mode = 'swim'; s.dwell = 0.1; break;
    case 'bubble': {
      const f = world.decor.find((d) => d.type === 'filter');
      s.target = { x: f.x + rng.range(-10, 10), y: f.y - 120 + rng.range(-10, 30), z: rng.range(0, 0.4) }; s.mode = 'swim'; s.dwell = 0.3; break;
    }
    case 'snail': { const sn = rng.pick(world.snails); s.target = { x: sn.x, y: sn.y - 6, z: sn.z ?? 0.5 }; s.riding = sn.id; s.dwell = rng.range(0.5, 1.5); break; }
  }
  if (best !== 'snail') s.riding = null;
  if (best !== 'mate') s.chasing = null;
  s.decideIn = s.dwell + rng.range(0.2, 0.8);
}

function move(s, world, dt) {
  if (!s.target) return;
  // moving targets
  if (s.chasing) { const f = world.shrimp.find((o) => o.id === s.chasing); if (f) { s.target.x = f.x; s.target.y = f.y; s.target.z = f.z; } }
  if (s.riding) { const sn = world.snails.find((o) => o.id === s.riding); if (sn) { s.target.x = sn.x; s.target.y = sn.y - 6 * sn.size; s.target.z = sn.z ?? 0.5; } }
  const dx = s.target.x - s.x, dy = s.target.y - s.y;
  const d = Math.hypot(dx, dy);
  if (s.arrived && d < 26) { s.moving = false; return; }
  if (d < 5) { s.arrived = true; s.moving = false; return; }
  s.arrived = false; s.moving = true;
  const lazy = 1.15 - 0.5 * s.p.lazy;
  const speed = (s.mode === 'swim' ? 260 : 75) * (0.55 + 0.6 * s.size) * lazy;
  const step = Math.min(d, speed * dt);
  s.x += (dx / d) * step; s.y += (dy / d) * step;
  if (s.target.z != null) s.z = clamp(s.z + (s.target.z - s.z) * Math.min(1, step / d), 0, 1);
  if (Math.abs(dx) > 1) s.facing = dx < 0 ? -1 : 1;
  s.x = clamp(s.x, TANK.x0 + 8, TANK.x1 - 8);
  s.y = clamp(s.y, TANK.top + 12, floorY(s.z) - 3);
}

function act(s, world, dt) {
  const rng = world.rng;
  if (!s.arrived) {
    // interrupt: fresh food nearby and hungry
    if (s.hunger > 0.5 && s.action !== 'eat' && s.action !== 'mate' && s.noFoodUntil <= 0 && rng.chance(0.3 * dt)) {
      for (const f of world.food) if (f.age < 2 && likesFood(s, f.type) && dist(f, s) < 300) { s.decideIn = 0; break; }
    }
    return;
  }
  switch (s.action) {
    case 'eat': {
      const f = world.food.find((x) => x.id === s.foodTarget);
      if (!f || f.amount <= 0) { s.decideIn = 0; break; }
      const t = FOODS[f.type];
      s.hunger = clamp(s.hunger - 0.25 * dt * (1 + s.p.greedy * 0.4), 0, 1);
      f.amount -= 0.05 * dt;
      if (t.treat) s.health = clamp(s.health + 0.02 * dt, 0, 1);
      if (!hasQ(s, 'bully') && s.p.bold < 0.6) {
        const bully = world.shrimp.some((o) => o !== s && o.foodTarget === f.id && o.arrived && hasQ(o, 'bully'));
        if (bully && rng.chance(0.4 * dt)) { s.stress = clamp(s.stress + 0.05, 0, 1); s.noFoodUntil = 1.5; s.decideIn = 0; }
      }
      if (s.hunger <= 0.05) s.decideIn = 0;
      break;
    }
    case 'graze': case 'explore': case 'hide': case 'social': case 'rest': case 'snail': {
      s.hunger = clamp(s.hunger - 0.06 * dt * (0.2 + world.biofilm * 1.5), 0, 1);
      world.biofilm = Math.max(0, world.biofilm - 0.0015 * dt * s.size * world.biofilm);
      if (world.algae.hair > 0.05) { s.hunger = clamp(s.hunger - 0.03 * dt, 0, 1); world.algae.hair = Math.max(0, world.algae.hair - 0.0006 * dt); }
      for (const m of world.molts) if (m.amount > 0 && dist(m, s) < 20) { m.amount -= 0.04 * dt; s.hunger = clamp(s.hunger - 0.05 * dt, 0, 1); s.health = clamp(s.health + 0.005 * dt, 0, 1); break; }
      if (s.action === 'rest') s.energy = clamp(s.energy + 0.05 * dt, 0, 1);
      break;
    }
    case 'mate': {
      const f = world.shrimp.find((o) => o.id === s.chasing);
      if (!f || f.receptiveUntil <= world.time || f.berried) { s.decideIn = 0; break; }
      if (dist(f, s) < 62 && rng.chance(1.2 * dt)) { fertilize(f, s, world); s.decideIn = 0; }
      break;
    }
    case 'zoom': case 'bubble': s.decideIn = Math.min(s.decideIn, 0.15); break;
  }
}

// ---- personal space: push overlapping shrimp apart --------------------------------------------
// Elliptical zone (shrimp are long and flat) so they spread sideways along the substrate.
export function separate(world) {
  const list = world.shrimp, rng = world.rng;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (a.chasing === b.id || b.chasing === a.id) continue;
      // Overlap is judged in screen projection; it is resolved sideways (x) and
      // in depth (z), so a crowd spreads into rows instead of one line.
      const rx = 26 * (a.size + b.size), ry = 9 * (a.size + b.size);
      let dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > rx || Math.abs(dy) > ry) continue;
      let ux = dx / rx, uy = dy / ry;
      let nd = Math.hypot(ux, uy);
      if (nd < 1e-3) { ux = rng.chance(0.5) ? 1 : -1; uy = rng.chance(0.5) ? 0.5 : -0.5; nd = Math.hypot(ux, uy); }
      if (nd >= 1) continue;
      const push = (1 - nd) * 0.25;
      const px = (ux / nd) * push * rx, py = (uy / nd) * push * ry;
      a.x -= px; b.x += px;
      if (grounded(a) && grounded(b)) { setZ(a, a.z + py / TANK.depth); setZ(b, b.z - py / TANK.depth); }
      else { a.y -= py; b.y += py; }
      for (const s of [a, b]) { s.x = clamp(s.x, TANK.x0 + 8, TANK.x1 - 8); s.y = clamp(s.y, TANK.top + 12, floorY(s.z) - 3); }
    }
  }
}

// ---- daily: memory → quirks, friendships, nicknames ---------------------------------------
export function dailyShrimp(s, world) {
  const rng = world.rng;
  const spots = world._spots || [];
  const total = s.mem.samples;
  if (total >= 8) {
    let topId = null, topV = 0;
    for (const id in s.mem.spots) if (s.mem.spots[id] > topV) { topV = s.mem.spots[id]; topId = id; }
    const spot = spots.find((sp) => String(sp.id) === String(topId));
    const frac = topV / total;
    if (spot && spot.obsessable) {
      if (!s.obsession && frac > 0.6 && s.p.curious > 0.45 && rng.chance(0.2)) {
        s.obsession = spot.id; s.favSpot = spot.id;
        const q = data().quirks.quirks.find((x) => x.id === 'obsessed');
        s.quirks.push({ id: 'obsessed', label: 'Obsessed', desc: `Obsessed with the ${nounFor(spot.kind)}.`, object: spot.id });
        narrate(world, 'obsession', { name: displayName(s), object: nounFor(spot.kind), ids: [s.id] });
      } else if (!s.favSpot && frac > 0.35) s.favSpot = spot.id;
    }
    for (const id in s.mem.near) {
      const oid = Number(id);
      if (s.mem.near[id] / total > 0.4 && !s.friends.includes(oid) && rng.chance(0.35)) {
        const o = world.shrimp.find((x) => x.id === oid);
        if (o && s.friends.length < 2 && o.friends.length < 2) {
          s.friends.push(oid); if (!o.friends.includes(s.id)) o.friends.push(s.id);
          narrate(world, 'friend', { name: displayName(s), other: displayName(o), ids: [s.id, o.id] });
        }
      }
    }
  }
  // emergent quirks
  if (s.quirks.length < 3 && rng.chance(0.025)) {
    const cands = [];
    if (!hasQ(s, 'brave') && s.p.bold > 0.75) cands.push('brave');
    if (!hasQ(s, 'early_bird') && s.p.greedy > 0.6 && s.p.bold > 0.55) cands.push('early_bird');
    if (!hasQ(s, 'snail_rider') && world.snails.length && s.p.curious > 0.8) cands.push('snail_rider');
    if (!hasQ(s, 'molt_spot') && s.moltCount >= 5 && Object.values(s.moltSpots).some((n) => n >= 4 && n / s.moltCount > 0.6)) cands.push('molt_spot');
    if (!hasQ(s, 'hermit') && s.p.bold < 0.2) cands.push('hermit');
    if (!hasQ(s, 'glutton') && s.p.greedy > 0.85) cands.push('glutton');
    if (cands.length) {
      const pickId = rng.pick(cands);
      const q = data().quirks.quirks.find((x) => x.id === pickId);
      if (q) { s.quirks.push({ id: q.id, label: q.label, desc: q.desc }); narrate(world, 'quirk', { name: displayName(s), quirk: q.desc, ids: [s.id] }); }
    }
  }
  if (!s.nickname && s.quirks.length >= 2 && rng.chance(0.15)) {
    const used = new Set(world.shrimp.map((x) => x.nickname).filter(Boolean));
    const q = rng.pick(s.quirks);
    const def = data().quirks.quirks.find((x) => x.id === q.id);
    const nicks = (def?.nick || []).filter((n) => !used.has(n));
    if (nicks.length) {
      const nick = rng.pick(nicks);
      narrate(world, 'nickname', { name: displayName(s), nick, ids: [s.id] });
      s.nickname = nick;
    }
  }
  // decay memories so recent days matter more
  for (const id in s.mem.spots) s.mem.spots[id] *= 0.6;
  for (const id in s.mem.near) { s.mem.near[id] *= 0.6; if (s.mem.near[id] < 0.2) delete s.mem.near[id]; }
  s.mem.samples *= 0.6;
}
