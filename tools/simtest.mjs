// Headless balance test: node tools/simtest.mjs [days]. Runs the simulation with a
// simple caretaker and prints water, population and log samples.
import { readFileSync } from 'node:fs';
const base = new URL('../', import.meta.url).href;
const { createWorld, tick, actions, serialize, deserialize } = await import(base + 'src/sim/world.js');
const { setNarrativeData } = await import(base + 'src/sim/narrative.js');
setNarrativeData({
  events: JSON.parse(readFileSync(new URL('assets/data/events.json', base), 'utf8')),
  names: JSON.parse(readFileSync(new URL('assets/data/names.json', base), 'utf8')),
  quirks: JSON.parse(readFileSync(new URL('assets/data/quirks.json', base), 'utf8')),
});
const world = createWorld(42);
const days = Number(process.argv[2] || 120);
const t0 = Date.now();
let lastDay = 0;
for (let h = 0; h < days * 24; h += 0.05) {
  tick(world, 0.05);
  if (world.day !== lastDay) {
    lastDay = world.day;
    // a caretaker: feed daily, water change weekly, occasionally remineralize
    if (world.day % 1 === 0) { for (const t of ['pellet','wafer']) { if (world.inventory[t] <= 0) world.inventory[t] += 10; actions.feed(world, t); } }
    if (world.day % 7 === 0) actions.waterChange(world, 25);
    if (world.water.gh < 6) actions.remineralize(world);
    if (world.day % 20 === 0) {
      const w = world.water;
      console.log(`day ${world.day} pop ${world.shrimp.length} snails ${world.snails.length} $${world.money} | temp ${w.temp.toFixed(1)} pH ${w.ph.toFixed(2)} gh ${w.gh.toFixed(1)} tds ${w.tds.toFixed(0)} nh3 ${w.nh3.toFixed(3)} no2 ${w.no2.toFixed(3)} no3 ${w.no3.toFixed(1)} inst ${w.instability.toFixed(2)} biofilm ${world.biofilm.toFixed(2)} algae ${world.algae.film.toFixed(2)}/${world.algae.hair.toFixed(2)} plants ${world._plantMass.toFixed(1)} food ${world.food.length}`);
    }
  }
}
console.log('ms', Date.now() - t0);
console.log('stats', world.stats);
console.log('dex', Object.keys(world.dex));
const pop = world.shrimp;
const nan = JSON.stringify(world, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NAN!' : k === 'rng' ? undefined : v));
console.log('nan present:', nan.includes('NAN!'));
console.log('actions', Object.fromEntries(Object.entries(pop.reduce((a, s) => (a[s.action] = (a[s.action] || 0) + 1, a), {}))));
console.log('quirks', pop.flatMap(s => s.quirks.map(q => q.id)).reduce((a, q) => (a[q] = (a[q] || 0) + 1, a), {}));
console.log('friends', pop.filter(s => s.friends.length).length, 'nicknames', pop.filter(s => s.nickname).map(s => s.nickname));
console.log('avg stress', (pop.reduce((a, s) => a + s.stress, 0) / pop.length).toFixed(2), 'avg hunger', (pop.reduce((a, s) => a + s.hunger, 0) / pop.length).toFixed(2), 'avg health', (pop.reduce((a, s) => a + s.health, 0) / pop.length).toFixed(2));
console.log('--- last 25 log lines');
for (const l of world.log.slice(-25)) console.log(`d${l.day} [${l.kind}] ${l.text}`);
const json = serialize(world); const w2 = deserialize(json);
console.log('save bytes', json.length, 'roundtrip shrimp', w2.shrimp.length);
