// World state, the tick loop, the daily pass and all player actions.
import { RNG, clamp } from '../rng.js';
import { presetGenome, phenotype } from './genetics.js';
import * as Shrimp from './shrimp.js';
import * as Eco from './ecology.js';
import { TANK, DECOR, PLANTS, FOODS, SNAILS, TANK_MODELS, BACKGROUNDS, floorY, zOf, initAlgaeCells, scrubAt } from './ecology.js';
import { narrate, displayName, nounFor } from './narrative.js';

export { TANK, DECOR, PLANTS, FOODS, SNAILS, TANK_MODELS, BACKGROUNDS };
export const SAVE_VERSION = 2;

export const SHRIMP_PACKS = {
  cherry: { price: 10, preset: 'cherry', label: 'Red Cherry pair', desc: 'Hardy starter reds.', species: 'neocaridina' },
  blue: { price: 24, preset: 'blue', label: 'Blue Dream pair', desc: 'Recessive blue. Cross with your reds.', species: 'neocaridina' },
  yellow: { price: 18, preset: 'yellow', label: 'Yellow pair', desc: 'Bright yellow line.', species: 'neocaridina' },
  orange: { price: 20, preset: 'orange', label: 'Orange Sakura pair', desc: 'Warm orange line.', species: 'neocaridina' },
  green: { price: 28, preset: 'green', label: 'Green Jade pair', desc: 'Uncommon green pigment.', species: 'neocaridina' },
  black: { price: 30, preset: 'black', label: 'Black Rose pair', desc: 'Dominant black pigment.', species: 'neocaridina' },
  snow: { price: 22, preset: 'snow', label: 'Snowball pair', desc: 'White. Shows every other colour it carries.', species: 'neocaridina' },
  rili: { price: 20, preset: 'rili', label: 'Red Rili pair', desc: 'Clear-bodied pattern gene.', species: 'neocaridina' },
  crystalRed: { price: 38, preset: 'crystalRed', label: 'Crystal Red pair', desc: 'Caridina. White-striped. Needs soft, acidic water and cannot breed with Neocaridina.', species: 'caridina' },
  crystalBlack: { price: 38, preset: 'crystalBlack', label: 'Crystal Black pair', desc: 'Caridina. Black bands on white. Soft water only.', species: 'caridina' },
  mystery: { price: 16, preset: 'mystery', label: 'Mystery bag', desc: 'Two random Neocaridina. Could carry anything.', species: 'neocaridina' },
};

export function createWorld(seed = (Date.now() % 1000000) | 0) {
  const world = {
    v: SAVE_VERSION, seed, rng: new RNG(seed),
    day: 1, hour: 8, time: 8, tankAge: 30, money: 40,
    water: { temp: 22, gh: 7, kh: 3, tds: 180, ph: 7.2, nh3: 0, no2: 0, no3: 8, o2: 0.85, tannin: 0, bacteria: 0.75, instability: 0.05, base: { temp: 22, ph: 7.2, tds: 180 } },
    light: { hours: 8, start: 9, intensity: 2, on: false },
    heater: { on: false, target: 23 },
    biofilm: 0.35, algae: { film: 0.08, hair: 0, diatom: 0.1, cells: initAlgaeCells(0.08) },
    tank: { model: 'standard', background: 'jungle' }, owned: { tanks: ['standard'], backgrounds: ['jungle'] }, pace: 0.7,
    decor: [], plants: [], snails: [], food: [], molts: [], shrimp: [],
    inventory: { pellet: 8, wafer: 4, zucchini: 2, leaf: 1, pollen: 0 },
    log: [], dex: {}, stats: { births: 0, deaths: 0, sold: 0, molts: 0, earned: 0 },
    nextId: 1, flags: {}, pendingHitchhikers: [], nextIdleAt: 12, lastWaterWarn: 0,
    savedAt: Date.now(),
  };
  const rng = world.rng;
  addDecor(world, 'filter', TANK.x1 - 60);
  addDecor(world, 'driftwood', 300);
  addDecor(world, 'cholla', 560);
  addDecor(world, 'rock', 120);
  addPlant(world, 'moss', 240, { size: 0.8, silent: true });
  addPlant(world, 'moss', 640, { size: 0.6, silent: true });
  addPlant(world, 'anubias', 420, { size: 0.9, silent: true });
  addPlant(world, 'javafern', 760, { size: 0.8, silent: true });
  addPlant(world, 'stem', 850, { size: 0.7, silent: true });
  Eco.createSnail(world, 'nerite');

  // Starter colony: cherry shrimp with a few hidden recessives so the first
  // generations already hold surprises.
  const presets = ['cherry', 'cherry', 'cherry', 'cherry', 'cherry', 'cherry', 'fire', 'cherry', 'cherry', 'cherry'];
  const sexes = ['F', 'F', 'F', 'F', 'F', 'F', 'M', 'M', 'M', 'M'];
  presets.forEach((preset, i) => {
    const genome = presetGenome(rng, preset);
    if (i === 2 || i === 6) genome.C = ['r', 'b'];  // two blue carriers, one of each sex
    if (i === 4) genome.P = ['S', 'r'];         // carries rili
    if (i === 7) genome.E = ['N', 'e'];         // carries orange eye
    if (i === 8) genome.P = ['S', 'r'];
    if (i === 9) genome.C = ['r', 'y'];         // carries yellow
    const s = Shrimp.createShrimp(world, { genome, sex: sexes[i], age: rng.int(45, 120) });
    world.shrimp.push(s);
  });
  Eco.buildSpots(world);
  registerDex(world);
  world.log.push({ day: 1, hour: 8, kind: 'info', text: 'Welcome to your tank. Ten cherry shrimp, a nerite, and a lot of biofilm. Keep the water steady.' });
  return world;
}

export function registerDex(world) {
  for (const k in world.dex) world.dex[k].count = 0;
  for (const s of world.shrimp) {
    const nm = s.pheno.name;
    if (!world.dex[nm]) world.dex[nm] = { first: world.day, stars: s.pheno.stars, count: 0 };
    world.dex[nm].count++;
  }
}

// ---- tick ----------------------------------------------------------------------------------
export function tick(world, dt) {
  world.hour += dt; world.time += dt;
  let newDay = false;
  if (world.hour >= 24) { world.hour -= 24; world.day++; newDay = true; }
  const L = world.light;
  L.on = world.hour >= L.start && world.hour < L.start + L.hours;

  Eco.buildSpots(world);
  Eco.updatePlants(world, dt);
  Eco.updateWater(world, dt);
  Eco.updateAlgae(world, dt);
  Eco.updateFood(world, dt);
  Eco.updateSnails(world, dt);
  for (const s of world.shrimp) Shrimp.update(s, world, dt);
  Shrimp.separate(world);
  Shrimp.computeHearts(world);
  if (world.shrimp.some((s) => s.dead)) {
    world.shrimp = world.shrimp.filter((s) => !s.dead);
  }
  if (newDay) onNewDay(world);
  if (world.time >= world.nextIdleAt) {
    world.nextIdleAt = world.time + world.rng.range(5, 10);
    idleFlavour(world);
  }
}

function onNewDay(world) {
  world.tankAge++;
  for (const s of world.shrimp) Shrimp.dailyShrimp(s, world);
  Eco.dailySnails(world);
  registerDex(world);
  const w = world.water;
  if (world.day - world.lastWaterWarn >= 2) {
    let idx = -1;
    if (w.nh3 > 0.25) idx = 0; else if (w.no2 > 0.25) idx = 1; else if (w.no3 > 40) idx = 2;
    if (idx >= 0) { narrate(world, 'waterWarn', {}, { index: idx, toast: true }); world.lastWaterWarn = world.day; }
  }
}

function idleFlavour(world) {
  if (!world.shrimp.length) return;
  const rng = world.rng;
  const s = rng.pick(world.shrimp);
  const others = world.shrimp.filter((o) => o !== s);
  const other = others.length ? rng.pick(others) : s;
  const spots = (world._spots || []).filter((sp) => !sp.floor);
  const fav = spots.find((sp) => sp.id === s.favSpot);
  const spot = fav || (spots.length ? rng.pick(spots) : null);
  narrate(world, 'idle', { name: displayName(s), other: displayName(other), object: spot ? nounFor(spot.kind) : 'substrate', ids: [s.id, other.id] });
}

// ---- placement helpers ------------------------------------------------------------------------
function freeX(world, w, preferred) {
  const rng = world.rng;
  const taken = [...world.decor.map((d) => ({ x: d.x, w: DECOR[d.type].w })), ...world.plants.filter((p) => p.type !== 'floating').map((p) => ({ x: p.x, w: PLANTS[p.type].w * 0.6 }))];
  let best = preferred ?? rng.range(TANK.x0 + w / 2 + 10, TANK.x1 - w / 2 - 10), bestScore = -Infinity;
  for (let i = 0; i < 14; i++) {
    const x = i === 0 && preferred != null ? preferred : rng.range(TANK.x0 + w / 2 + 10, TANK.x1 - w / 2 - 10);
    let score = Infinity;
    for (const t of taken) score = Math.min(score, Math.abs(t.x - x) - (t.w + w) / 2);
    if (score > bestScore) { bestScore = score; best = x; }
    if (bestScore > 10) break;
  }
  return clamp(best, TANK.x0 + w / 2 + 6, TANK.x1 - w / 2 - 6);
}

export function addDecor(world, type, x) {
  const t = DECOR[type];
  const d = { id: world.nextId++, type, x: freeX(world, t.w, x), y: TANK.floor + 8 };
  world.decor.push(d);
  return d;
}

export function addPlant(world, type, x, opts = {}) {
  const t = PLANTS[type];
  const p = { id: world.nextId++, type, x: t.floating ? world.rng.range(TANK.x0 + 60, TANK.x1 - 60) : freeX(world, t.w * 0.6, x), y: t.floating ? TANK.top + 2 : TANK.floor + 4, size: opts.size ?? 0.35 };
  world.plants.push(p);
  if (!opts.silent && world.rng.chance(0.25)) world.pendingHitchhikers.push({ day: world.day + world.rng.int(3, 8), object: nounFor(type) });
  return p;
}

// ---- player actions -------------------------------------------------------------------------------
export const actions = {
  feed(world, type, x, y) {
    if ((world.inventory[type] || 0) <= 0) return { ok: false, msg: 'None left. Buy more in the shop.' };
    const t = FOODS[type];
    world.inventory[type]--;
    const rng = world.rng;
    const fx = clamp(x ?? rng.range(TANK.x0 + 60, TANK.x1 - 60), TANK.x0 + 16, TANK.x1 - 16);
    // Clicking within the substrate band picks the depth; higher up gets a random depth.
    const z = y != null && y >= TANK.floorBack - 6 ? zOf(y) : rng.next();
    const fy = t.leaf ? floorY(z) - 4 : clamp(y ?? floorY(z) - 4, TANK.top + 20, floorY(z) - 3);
    const item = { id: world.nextId++, type, x: fx, y: fy, z, amount: t.amount, age: 0 };
    world.food.push(item);
    // hungry shrimp that like this food notice it immediately and head over
    for (const s of world.shrimp) {
      if (s.action === 'mate' || s.moltRecent > 0 || !Shrimp.likesFood(s, type)) continue;
      if (s.hunger > 0.25 - s.p.greedy * 0.15 && Math.hypot(s.x - fx, s.y - fy) < 520) { s.decideIn = Math.min(s.decideIn, rng.range(0, 0.08)); s.noFoodUntil = 0; }
    }
    return { ok: true, msg: `${t.name} dropped in.` };
  },
  waterChange(world, pct) {
    const w = world.water; const f = 1 - pct / 100;
    const tap = { temp: 20, gh: 6, kh: 3, tds: 150, no3: 0, nh3: 0, no2: 0, tannin: 0 };
    for (const k of ['gh', 'kh', 'tds', 'no3', 'nh3', 'no2', 'tannin']) w[k] = w[k] * f + tap[k] * (1 - f);
    w.temp = w.temp * f + tap.temp * (1 - f);
    if (pct >= 30) Shrimp.triggerMoltWave(world);
    world.stats.waterChanges = (world.stats.waterChanges || 0) + 1;
    return { ok: true, msg: `${pct}% water change done.` };
  },
  scrubAt(world, x, y) { const removed = scrubAt(world, x, y); world.algae.diatom = Math.max(0, world.algae.diatom - removed * 0.02); return { ok: true, removed }; },
  trimAt(world, id, frac) {
    const p = world.plants.find((x) => x.id === id); if (!p) return { ok: false };
    const t = PLANTS[p.type];
    const before = p.size;
    p.size = Math.max(0.15, t.floating ? p.size * 0.6 : p.size * clamp(frac, 0.15, 0.95));
    p.overgrown = false;
    const cut = before - p.size;
    const cash = Math.round(cut * 4);
    world.money += cash;
    if (cash > 0) narrate(world, 'trim', { object: nounFor(p.type), n: cash });
    return { ok: true, msg: cash > 0 ? `Trimmed ${t.name.toLowerCase()}. Cutting sold for $${cash}.` : `Trimmed ${t.name.toLowerCase()}.`, cut };
  },
  heart(world, fId, mId) { const baby = Shrimp.heartBaby(world, fId, mId); registerDex(world); return baby ? { ok: true } : { ok: false }; },
  setPace(world, pace) { world.pace = clamp(pace, 0.25, 2); return { ok: true }; },
  buyTank(world, key) {
    const m = TANK_MODELS[key]; if (!m) return { ok: false };
    if (!world.owned.tanks.includes(key)) { if (world.money < m.price) return { ok: false, msg: 'Not enough money.' }; world.money -= m.price; world.owned.tanks.push(key); }
    if (world.tank.model !== key) { world.tank.model = key; for (const s of world.shrimp) s.stress = Math.max(s.stress, 0.45); narrate(world, 'newTank', { object: m.name }); }
    return { ok: true, msg: `Now using the ${m.name}.` };
  },
  setBackground(world, key) {
    const b = BACKGROUNDS[key]; if (!b) return { ok: false };
    if (!world.owned.backgrounds.includes(key)) { if (world.money < b.price) return { ok: false, msg: 'Not enough money.' }; world.money -= b.price; world.owned.backgrounds.push(key); }
    world.tank.background = key; return { ok: true, msg: `${b.name} background.` };
  },
  remineralize(world) {
    const w = world.water; w.gh += 1; w.kh += 0.5; w.tds += 25;
    return { ok: true, msg: 'Minerals added: GH +1, KH +0.5, TDS +25.' };
  },
  setLight(world, hours, intensity) { world.light.hours = clamp(hours, 0, 16); world.light.intensity = clamp(intensity, 1, 3); return { ok: true }; },
  setHeater(world, on, target) { world.heater.on = on; if (target != null) world.heater.target = clamp(target, 18, 28); return { ok: true }; },
  buy(world, kind, key) {
    let price = 0; let msg = '';
    if (kind === 'food') { const t = FOODS[key]; price = t.price; if (world.money < price) return { ok: false, msg: 'Not enough money.' }; world.inventory[key] = (world.inventory[key] || 0) + t.pack; msg = `Bought ${t.pack} ${t.name.toLowerCase()}.`; }
    else if (kind === 'plant') { const t = PLANTS[key]; price = t.price; if (world.money < price) return { ok: false, msg: 'Not enough money.' }; if (world.plants.length >= 14) return { ok: false, msg: 'No room for more plants.' }; addPlant(world, key); msg = `Planted ${t.name.toLowerCase()}.`; }
    else if (kind === 'decor') { const t = DECOR[key]; price = t.price; if (world.money < price) return { ok: false, msg: 'Not enough money.' }; if (world.decor.length >= 9) return { ok: false, msg: 'The tank is full of hardscape.' }; addDecor(world, key); msg = `Added ${t.name.toLowerCase()}.`; }
    else if (kind === 'snail') { const t = SNAILS[key]; price = t.price; if (world.money < price) return { ok: false, msg: 'Not enough money.' }; if (world.snails.length >= 30) return { ok: false, msg: 'Enough snails.' }; Eco.createSnail(world, key); msg = `Added a ${t.name.toLowerCase()}.`; }
    else if (kind === 'shrimp') {
      const pk = SHRIMP_PACKS[key]; if (!pk) return { ok: false }; price = pk.price;
      if (world.money < price) return { ok: false, msg: 'Not enough money.' };
      if (world.shrimp.length >= 66) return { ok: false, msg: 'The tank is at capacity.' };
      for (const sex of ['F', 'M']) {
        const s = Shrimp.createShrimp(world, { genome: presetGenome(world.rng, pk.preset), sex, age: world.rng.int(45, 90), species: pk.species });
        s.stress = 0.5; world.shrimp.push(s);
      }
      registerDex(world);
      msg = `${pk.label} added. They'll be stressed for a day.`;
    }
    world.money -= price;
    return { ok: true, msg };
  },
  sell(world, id) {
    const i = world.shrimp.findIndex((s) => s.id === id);
    if (i < 0) return { ok: false };
    const s = world.shrimp[i];
    const price = s.stage === 'adult' ? s.pheno.price : Math.max(1, Math.round(s.pheno.price * 0.4));
    world.shrimp.splice(i, 1);
    for (const o of world.shrimp) { const j = o.friends.indexOf(id); if (j >= 0) o.friends.splice(j, 1); }
    world.money += price; world.stats.sold++; world.stats.earned += price;
    registerDex(world);
    return { ok: true, msg: `Sold ${displayName(s)} for $${price}.` };
  },
  trim(world, id) {
    const p = world.plants.find((x) => x.id === id); if (!p) return { ok: false };
    p.size = Math.min(p.size, 0.6); p.overgrown = false; return { ok: true, msg: 'Trimmed.' };
  },
  remove(world, kind, id) {
    const list = world[kind]; const i = list.findIndex((x) => x.id === id);
    if (i < 0) return { ok: false };
    list.splice(i, 1);
    for (const s of world.shrimp) { if (s.favSpot === id) s.favSpot = null; if (s.obsession === id) { s.obsession = null; s.quirks = s.quirks.filter((q) => q.id !== 'obsessed'); } }
    return { ok: true, msg: 'Removed.' };
  },
  rename(world, id, name) { const s = world.shrimp.find((x) => x.id === id); if (s) s.nickname = name ? name.slice(0, 16) : null; return { ok: !!s }; },
};

// ---- save / load ------------------------------------------------------------------------------------
export function serialize(world) {
  return JSON.stringify(world, (k, v) => {
    if (k.startsWith('_')) return undefined;
    if (k === 'rng') return { s: v.s };
    return v;
  });
}

export function deserialize(json) {
  const w = JSON.parse(json);
  w.rng = new RNG(0); w.rng.s = w.rng.s >>> 0;
  if (!w.water.base) w.water.base = { temp: w.water.temp, ph: w.water.ph, tds: w.water.tds };
  for (const s of w.shrimp) {
    s.pheno = phenotype(s.genome, s.sex); s.dead = false;
    if (s.z == null) { s.z = w.rng.next(); s.y = Math.min(s.y, floorY(s.z) - 4); if (s.target) s.target.z = s.z; } // saves from before depth
  }
  for (const o of [...w.snails, ...w.food, ...w.molts]) if (o.z == null) { o.z = w.rng.next(); o.y = Math.min(o.y, floorY(o.z) - 2); }
  if (!w.algae.cells) w.algae.cells = initAlgaeCells(w.algae.film);
  if (!w.tank) w.tank = { model: 'standard', background: 'jungle' };
  if (!w.owned) w.owned = { tanks: ['standard'], backgrounds: ['jungle'] };
  if (w.pace == null) w.pace = 0.7;
  for (const s of w.shrimp) if (!s.species) s.species = s.genome.P[0] === 'b' && s.genome.P[1] === 'b' ? 'caridina' : 'neocaridina';
  w.v = SAVE_VERSION;
  Eco.buildSpots(w);
  return w;
}

// Coarse catch-up for time that passed while the tab was closed.
export function simulateOffline(world, hours) {
  const before = { births: world.stats.births, deaths: world.stats.deaths, day: world.day };
  const step = 0.25;
  for (let t = 0; t < hours; t += step) tick(world, step);
  const days = world.day - before.day;
  if (hours >= 6) narrate(world, 'away', { days, births: world.stats.births - before.births, deaths: world.stats.deaths - before.deaths });
  world._toasts = (world._toasts || []).slice(-1);
  return { days };
}
