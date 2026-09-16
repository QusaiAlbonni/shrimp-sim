// Turns simulation events into log lines using the templates in events.json.
let DATA = { events: {}, names: { objectNouns: {} }, quirks: { quirks: [] } };
export function setNarrativeData(data) { DATA = data; }
export const data = () => DATA;

export function displayName(s) {
  return s.nickname ? `${s.nickname} (#${s.id})` : `Shrimp #${s.id}`;
}

export function nounFor(kind) { return DATA.names.objectNouns[kind] || kind; }

const IMPORTANT = new Set(['newMorph', 'moltFail', 'berried', 'hatch', 'hatchNone', 'death', 'oldAge', 'snailBoom', 'away', 'obsession', 'nickname', 'moltWave']);

export function narrate(world, kind, vars = {}, opts = {}) {
  const templates = DATA.events[kind];
  if (!templates || !templates.length) return null;
  const t = opts.index != null ? templates[opts.index % templates.length] : world.rng.pick(templates);
  const text = t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  const entry = { day: world.day, hour: Math.floor(world.hour), kind, text, ids: vars.ids || [] };
  world.log.push(entry);
  if (world.log.length > 400) world.log.splice(0, world.log.length - 400);
  if (IMPORTANT.has(kind) || opts.toast) {
    world._toasts = world._toasts || [];
    world._toasts.push({ text, kind, level: kind === 'newMorph' ? 'rare' : kind === 'death' || kind === 'moltFail' ? 'bad' : 'info' });
  }
  return entry;
}
