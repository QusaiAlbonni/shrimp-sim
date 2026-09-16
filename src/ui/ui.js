// Side panel UI. Rendered as innerHTML templates on a throttle; controls use
// event delegation with data-* attributes so re-rendering never loses handlers.
import { DECOR, PLANTS, FOODS, SNAILS } from '../sim/world.js';
import { swatchShrimp } from '../render/shrimpSprite.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (v) => Math.round(v * 100);
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

const RANGES = {
  temp: { good: [20, 25.5], warn: [18, 27.5], unit: '°C', fmt: (v) => v.toFixed(1), label: 'Temp' },
  ph: { good: [6.8, 7.8], warn: [6.4, 8.2], unit: '', fmt: (v) => v.toFixed(2), label: 'pH' },
  gh: { good: [5, 10], warn: [4, 12], unit: '°dGH', fmt: (v) => v.toFixed(1), label: 'GH' },
  kh: { good: [2, 6], warn: [1, 8], unit: '°dKH', fmt: (v) => v.toFixed(1), label: 'KH' },
  tds: { good: [120, 250], warn: [90, 320], unit: 'ppm', fmt: (v) => v.toFixed(0), label: 'TDS' },
  nh3: { good: [0, 0.1], warn: [0, 0.25], unit: 'ppm', fmt: (v) => v.toFixed(2), label: 'Ammonia' },
  no2: { good: [0, 0.1], warn: [0, 0.25], unit: 'ppm', fmt: (v) => v.toFixed(2), label: 'Nitrite' },
  no3: { good: [0, 20], warn: [0, 40], unit: 'ppm', fmt: (v) => v.toFixed(0), label: 'Nitrate' },
  o2: { good: [0.6, 1], warn: [0.45, 1], unit: '', fmt: (v) => pct(v) + '%', label: 'Oxygen' },
};
const status = (k, v) => { const r = RANGES[k]; return v >= r.good[0] && v <= r.good[1] ? 'good' : v >= r.warn[0] && v <= r.warn[1] ? 'warn' : 'bad'; };

export class UI {
  constructor(game) {
    this.game = game; this.tab = 'tank'; this.timers = {}; this._dirty = true; this.logSeen = 0; this.logImportant = false;
    this.el = {
      app: document.getElementById('app'), clock: document.getElementById('clock'), money: document.getElementById('money'),
      stream: document.getElementById('streamStatus'), toasts: document.getElementById('toasts'), panel: document.querySelector('.panel'),
      tabs: { tank: document.getElementById('tab-tank'), shrimp: document.getElementById('tab-shrimp'), shop: document.getElementById('tab-shop'), log: document.getElementById('tab-log'), dex: document.getElementById('tab-dex'), guide: document.getElementById('tab-guide') },
      more: document.getElementById('moreMenu'), speedBtns: [...document.querySelectorAll('[data-speed]')], saveBtn: document.getElementById('btnSave'),
    };
  }

  dirty() { this._dirty = true; }
  get world() { return this.game.world; }

  mount() {
    const { el } = this;
    el.app.classList.remove('hidden');
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => this.showTab(b.dataset.tab)));
    el.speedBtns.forEach((b) => b.addEventListener('click', () => this.game.setSpeed(Number(b.dataset.speed))));
    document.getElementById('btnSound').addEventListener('click', (e) => { const on = this.game.audio.toggle(); e.currentTarget.textContent = on ? '🔊' : '🔇'; });
    el.saveBtn.addEventListener('click', () => this.game.save());
    document.getElementById('btnMore').addEventListener('click', () => el.more.classList.toggle('hidden'));
    document.getElementById('btnExport').addEventListener('click', () => { this.game.exportSave(); el.more.classList.add('hidden'); });
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) this.game.importSave(await f.text()); e.target.value = ''; el.more.classList.add('hidden'); });
    document.getElementById('btnReset').addEventListener('click', () => { if (confirm('Start over with a brand new tank? This deletes the current save.')) this.game.reset(); el.more.classList.add('hidden'); });
    el.panel.addEventListener('click', (e) => this.onPanelClick(e));
    el.panel.addEventListener('input', (e) => this.onPanelInput(e));
    el.panel.addEventListener('change', (e) => this.onPanelInput(e));
    this.game.loader.onProgress((p) => {
      if (p.tier !== 'stream') return;
      el.stream.textContent = p.done ? '' : `streaming extras ${p.finished}/${p.count}`;
      if (p.done) this.dirty();
    });
    this.renderAll();
  }

  showTab(name) {
    this.tab = name;
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    for (const k in this.el.tabs) this.el.tabs[k].classList.toggle('active', k === name);
    this.renderTab(name, true);
  }

  savedFlash() { const b = this.el.saveBtn; b.textContent = 'Saved ✓'; clearTimeout(this._saveT); this._saveT = setTimeout(() => (b.textContent = 'Save'), 1500); }

  toast(text, level = 'info') {
    const d = document.createElement('div'); d.className = `toast ${level}`; d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, level === 'rare' ? 9000 : 5500);
  }

  update(dt) {
    const w = this.world, st = this.game.state;
    const h = Math.floor(w.hour), m = Math.floor((w.hour - h) * 60);
    this.el.clock.textContent = `Day ${w.day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${w.light.on ? '☀' : '☾'}`;
    this.el.money.textContent = `$${w.money}`;
    this.el.speedBtns.forEach((b) => b.classList.toggle('active', st.paused ? b.dataset.speed === '0' : Number(b.dataset.speed) === st.speed));
    this.timers.tab = (this.timers.tab || 0) + dt;
    const interval = this.tab === 'dex' ? 2 : this.tab === 'log' ? 0.5 : 0.7;
    if (this._dirty || this.timers.tab > interval) { this.timers.tab = 0; this.renderTab(this.tab, this._dirty); this._dirty = false; }
  }

  renderAll() { for (const k in this.el.tabs) this.renderTab(k, true); }

  renderTab(name, full) {
    const w = this.world;
    switch (name) {
      case 'tank': this.renderTank(full); break;
      case 'shrimp': this.renderShrimp(); break;
      case 'shop': this.renderShop(); break;
      case 'log': this.renderLog(); break;
      case 'dex': this.renderDex(); break;
      case 'guide': if (!this._guideDone) { this.renderGuide(); this._guideDone = true; } break;
    }
  }

  // ---- Tank tab ----
  renderTank(full) {
    const w = this.world, st = this.game.state;
    const root = this.el.tabs.tank;
    if (!root.querySelector('#readings')) root.innerHTML = '<div id="readings"></div><div id="controls"></div>';
    const wa = w.water;
    const rows = Object.keys(RANGES).map((k) => { const r = RANGES[k]; const s = status(k, wa[k]); return `<div class="reading ${s}"><span class="rl">${r.label}</span><span class="rv">${r.fmt(wa[k])} <small>${r.unit}</small></span><span class="dot"></span></div>`; }).join('');
    const stab = 1 - wa.instability; const stabS = stab > 0.8 ? 'good' : stab > 0.5 ? 'warn' : 'bad';
    const f = w.shrimp.filter((s) => s.sex === 'F' && s.stage === 'adult').length, m = w.shrimp.filter((s) => s.sex === 'M' && s.stage === 'adult').length, j = w.shrimp.length - f - m;
    const berried = w.shrimp.filter((s) => s.berried).length;
    const hideCap = Math.round((w._hideCap || 0) * 4);
    root.querySelector('#readings').innerHTML = `
      <h3>Water test</h3>
      <div class="readings">${rows}<div class="reading ${stabS}"><span class="rl">Stability</span><span class="rv">${pct(stab)}%</span><span class="dot"></span></div></div>
      <h3>Tank</h3>
      <div class="stats">
        <div><b>${w.shrimp.length}</b> shrimp <small>${f}♀ ${m}♂ ${j} juv${berried ? ` · ${berried} berried` : ''}</small></div>
        <div><b>${w.snails.length}</b> snails</div>
        <div>Biofilm <b>${pct(w.biofilm)}%</b> <small>shrimplet food</small></div>
        <div>Algae <b>${pct(w.algae.film)}%</b> <small>${w.algae.hair > 0.1 ? 'hair algae!' : w.algae.diatom > 0.1 ? 'brown diatoms' : 'film'}</small></div>
        <div>Hiding room for <b>${hideCap}</b> <small class="${w.shrimp.length > hideCap ? 'bad' : ''}">${w.shrimp.length > hideCap ? 'crowded' : 'ok'}</small></div>
        <div>Light <b>${w.light.on ? 'on' : 'off'}</b> <small>${w.light.hours}h/day</small></div>
      </div>`;
    if (!full && document.activeElement && root.contains(document.activeElement)) return;
    const inv = Object.keys(FOODS).map((k) => `<button class="chip ${st.feedMode === k ? 'active' : ''}" data-action="feedmode" data-key="${k}" ${w.inventory[k] > 0 ? '' : 'disabled'}><span class="sw" style="background:${FOODS[k].color}"></span>${FOODS[k].name} <b>×${w.inventory[k] || 0}</b></button>`).join('');
    const plants = w.plants.map((p) => `<li>${PLANTS[p.type].name} <small>${Math.round((p.size / PLANTS[p.type].max) * 100)}%${p.size >= PLANTS[p.type].max - 0.05 ? ' · overgrown' : ''}</small> <button class="mini" data-action="trim" data-id="${p.id}">Trim</button><button class="mini" data-action="removeplant" data-id="${p.id}">✕</button></li>`).join('');
    const decor = w.decor.map((d) => `<li>${DECOR[d.type].name} <small>hides ${DECOR[d.type].hide}</small> ${d.type === 'filter' ? '' : `<button class="mini" data-action="removedecor" data-id="${d.id}">✕</button>`}</li>`).join('');
    root.querySelector('#controls').innerHTML = `
      <h3>Feed <small>then click in the tank</small></h3>
      <div class="chips">${inv}</div>
      <h3>Maintenance</h3>
      <div class="btnrow">
        <button data-action="wc" data-key="20">Water change 20%</button>
        <button data-action="wc" data-key="40">Water change 40%</button>
        <button data-action="scrub">Scrub glass</button>
        <button data-action="remin">Add minerals</button>
      </div>
      <h3>Light &amp; heat</h3>
      <label class="row">Light hours <input type="range" min="0" max="16" step="1" value="${w.light.hours}" data-input="lighthours"><b>${w.light.hours}h</b></label>
      <label class="row">Intensity <select data-input="lightint"><option value="1" ${w.light.intensity === 1 ? 'selected' : ''}>Low</option><option value="2" ${w.light.intensity === 2 ? 'selected' : ''}>Medium</option><option value="3" ${w.light.intensity === 3 ? 'selected' : ''}>High</option></select></label>
      <label class="row"><input type="checkbox" data-input="heater" ${w.heater.on ? 'checked' : ''}> Heater to <input type="range" min="18" max="28" step="0.5" value="${w.heater.target}" data-input="heatertarget"><b>${w.heater.target}°C</b></label>
      <h3>Plants</h3><ul class="things">${plants || '<li><small>None. Plants eat nitrate and hide shrimplets.</small></li>'}</ul>
      <h3>Hardscape</h3><ul class="things">${decor}</ul>`;
  }

  // ---- Shrimp tab ----
  renderShrimp() {
    const w = this.world, st = this.game.state;
    const sel = w.shrimp.find((s) => s.id === st.selectedId);
    const card = sel ? this.shrimpCard(sel) : '<p class="hint">Click a shrimp in the tank or in the list to see who it is.</p>';
    const list = w.shrimp.slice().sort((a, b) => a.id - b.id).map((s) => {
      const [r, g, b] = s.pheno.rgb;
      const flags = [s.berried ? '🥚' : '', s.moltRecent > 0 ? '👻' : '', s.stress > 0.6 ? '⚠' : '', s.hunger > 0.75 ? '🍽' : '', s.health < 0.5 ? '💔' : ''].join('');
      return `<li class="${s.id === st.selectedId ? 'sel' : ''}" data-action="select" data-id="${s.id}"><span class="dot" style="background:rgba(${r},${g},${b},${s.pheno.opacity})"></span><span class="nm">${esc(st.nameOf(s))}</span><span class="mo">${esc(s.pheno.name)}</span><span class="fl">${s.sex === 'F' ? '♀' : '♂'}${s.stage === 'juvenile' ? '·juv' : ''} ${flags}</span></li>`;
    }).join('');
    this.el.tabs.shrimp.innerHTML = `${card}<h3>Colony <small>${w.shrimp.length}</small></h3><ul class="shrimplist">${list}</ul>`;
  }

  shrimpCard(s) {
    const w = this.world, st = this.game.state;
    const ph = s.pheno; const [r, g, b] = ph.rgb;
    const bar = (label, v, cls = '') => `<div class="bar"><span>${label}</span><i><b class="${cls}" style="width:${pct(v)}%"></b></i></div>`;
    const trait = (label, v) => `<div class="trait"><span>${label}</span><i><b style="width:${pct(v)}%"></b></i></div>`;
    const friends = s.friends.map((id) => w.shrimp.find((o) => o.id === id)).filter(Boolean).map((o) => `<button class="link" data-action="select" data-id="${o.id}">${esc(st.nameOf(o))}</button>`).join(', ');
    const quirks = s.quirks.map((q) => `<li><b>${esc(q.label)}</b> <small>${esc(q.desc)}</small></li>`).join('');
    const spot = (w._spots || []).find((sp) => sp.id === s.favSpot);
    const parents = s.parents ? s.parents.map((id) => { const o = w.shrimp.find((x) => x.id === id); return o ? `<button class="link" data-action="select" data-id="${o.id}">${esc(st.nameOf(o))}</button>` : `#${id}`; }).join(' × ') : 'original colony';
    const action = { hide: 'hiding', eat: 'eating', graze: 'grazing on biofilm', social: 'hanging out', explore: 'exploring', rest: 'resting', mate: 'chasing a female', zoom: 'zooming around', bubble: 'chasing bubbles', snail: 'riding a snail' }[s.action] || s.action;
    const price = s.stage === 'adult' ? ph.price : Math.max(1, Math.round(ph.price * 0.4));
    return `<div class="card">
      <div class="cardhead"><span class="bigdot" style="background:rgba(${r},${g},${b},${ph.opacity})"></span>
        <div><div class="cardname">${esc(st.nameOf(s))} <button class="mini" data-action="rename" data-id="${s.id}">rename</button></div>
        <div class="morph">${esc(ph.name)} <span class="stars">${stars(ph.stars)}</span></div></div></div>
      <div class="meta">${s.sex === 'F' ? 'Female' : 'Male'} · ${s.stage} · ${Math.floor(s.age)} days · gen ${s.gen} · ${action}${s.berried ? ` · <b>berried</b> (${Math.round((s.berried.days / s.berried.hatchAt) * 100)}%)` : ''}${s.moltRecent > 0 ? ' · just molted' : ''}</div>
      ${bar('Health', s.health, s.health < 0.4 ? 'bad' : '')}${bar('Hunger', s.hunger, s.hunger > 0.75 ? 'warn' : '')}${bar('Stress', s.stress, s.stress > 0.6 ? 'bad' : '')}
      <h4>Personality</h4>
      <div class="traits">${trait('Bold', s.p.bold)}${trait('Social', s.p.social)}${trait('Curious', s.p.curious)}${trait('Greedy', s.p.greedy)}${trait('Lazy', s.p.lazy)}${trait('Fussy', s.p.fussy)}</div>
      ${quirks ? `<h4>Quirks</h4><ul class="quirks">${quirks}</ul>` : '<p class="hint">No quirks noticed yet. Watch and wait.</p>'}
      <div class="meta">${friends ? `Friends: ${friends}<br>` : ''}${spot ? `Favourite spot: ${esc(DECOR[spot.kind]?.name || PLANTS[spot.kind]?.name || spot.kind)}<br>` : ''}Parents: ${parents}${ph.hidden.length ? `<br>Carries hidden: <b>${esc(ph.hidden.join(', '))}</b>` : ''}</div>
      <div class="btnrow"><button data-action="sell" data-id="${s.id}">Sell for $${price}</button><button data-action="deselect">Close</button></div>
    </div>`;
  }

  // ---- Shop ----
  renderShop() {
    const w = this.world;
    const item = (kind, key, name, price, desc) => `<div class="item"><div><b>${esc(name)}</b><small>${esc(desc)}</small></div><button data-action="buy" data-kind="${kind}" data-key="${key}" ${w.money < price ? 'disabled' : ''}>$${price}</button></div>`;
    const foods = Object.entries(FOODS).map(([k, t]) => item('food', k, `${t.name} ×${t.pack}`, t.price, t.leaf ? 'Lasts days, grows biofilm, softens water' : t.treat ? 'Protein treat, boosts health' : t.veg ? 'Veggie. Picky eaters approve' : 'Staple food')).join('');
    const plants = Object.entries(PLANTS).map(([k, t]) => item('plant', k, t.name, t.price, t.mossy ? 'Shrimplet nursery, hides 3' : t.floating ? 'Eats nitrate fast, shades algae' : `Hides ${t.hide}, eats nitrate`)).join('');
    const decor = Object.entries(DECOR).filter(([k]) => k !== 'filter').map(([k, t]) => item('decor', k, t.name, t.price, `Hides ${t.hide}, biofilm ${Math.round(t.biofilm * 10)}/10`)).join('');
    const snails = Object.entries(SNAILS).filter(([k]) => k !== 'bladder').map(([k, t]) => item('snail', k, t.name, t.price, t.breeds ? 'Eats algae and leftovers. Breeds.' : 'Algae machine. Cannot breed here.')).join('');
    const packs = [['blue', 'Blue Dream pair', 24, 'Recessive blue. Cross with your reds.'], ['yellow', 'Yellow pair', 18, 'Bright yellow line'], ['black', 'Black Rose pair', 30, 'Dominant black pigment'], ['rili', 'Red Rili pair', 20, 'Clear-bodied pattern gene'], ['mystery', 'Mystery bag', 16, 'Two random shrimp. Could carry anything.']]
      .map(([k, n, p, d]) => item('shrimp', k, n, p, d)).join('');
    this.el.tabs.shop.innerHTML = `<h3>Food</h3>${foods}<h3>Plants</h3>${plants}<h3>Hardscape</h3>${decor}<h3>Snails</h3>${snails}<h3>Shrimp</h3>${packs}<p class="hint">Sell shrimp from their card. Rare morphs fetch far more.</p>`;
  }

  // ---- Log ----
  renderLog() {
    const w = this.world;
    const key = `${w.log.length}:${this.logImportant}`;
    if (this._logKey === key) return; this._logKey = key;
    const important = new Set(['newMorph', 'moltFail', 'berried', 'hatch', 'hatchNone', 'death', 'oldAge', 'obsession', 'friend', 'nickname', 'quirk', 'snailArrive', 'snailBoom', 'waterWarn', 'moltWave', 'mutation', 'algaeBloom', 'away']);
    const lines = w.log.slice().reverse().filter((l) => !this.logImportant || important.has(l.kind)).slice(0, 150)
      .map((l) => `<li class="k-${l.kind}"><small>d${l.day}</small> ${esc(l.text)}</li>`).join('');
    this.el.tabs.log.innerHTML = `<label class="row"><input type="checkbox" data-input="logfilter" ${this.logImportant ? 'checked' : ''}> Important only</label><ul class="log">${lines}</ul>`;
  }

  // ---- Dex ----
  renderDex() {
    const w = this.world;
    const entries = Object.entries(w.dex).sort((a, b) => b[1].stars - a[1].stars || a[0].localeCompare(b[0]));
    const alive = new Map(); for (const s of w.shrimp) { if (!alive.has(s.pheno.name)) alive.set(s.pheno.name, s.pheno); }
    const cards = entries.map(([name, e]) => `<div class="dexcard"><canvas width="90" height="40" data-dex="${esc(name)}"></canvas><div><b>${esc(name)}</b><div class="stars">${stars(e.stars)}</div><small>first seen day ${e.first} · ${e.count} in tank</small></div></div>`).join('');
    this.el.tabs.dex.innerHTML = `<p class="hint">${entries.length} morphs discovered. Hidden alleles surface when two carriers breed, and every clutch has a small mutation chance.</p><div class="dex">${cards}</div>`;
    for (const c of this.el.tabs.dex.querySelectorAll('canvas[data-dex]')) {
      const ph = alive.get(c.dataset.dex) || this._dexCache?.[c.dataset.dex];
      if (!ph) continue;
      this._dexCache = this._dexCache || {}; this._dexCache[c.dataset.dex] = ph;
      const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 90, 40); ctx.fillStyle = '#0b3140'; ctx.fillRect(0, 0, 90, 40);
      ctx.save(); ctx.scale(1.6, 1.6); swatchShrimp(ctx, 30, 13, 1, ph.rgb, ph.opacity, ph); ctx.restore();
    }
  }

  // ---- Guide ----
  renderGuide() {
    this.el.tabs.guide.innerHTML = `
      <div class="guide">
        <h3>The loop</h3>
        <p>Keep the water steady, feed a little, and let the colony breed. Every shrimp has a personality and a genome, and the point of the game is discovering both: watch the <b>Log</b> for quirks, friendships and nicknames, and breed carriers together to reveal hidden colour morphs for the <b>Dex</b>.</p>
        <p><b>Time:</b> at 1× a game day takes 4 minutes. Use 3× or 10× to fast-forward (keys 1/2/3, space pauses). The tank keeps running while you are away, up to 3 days, and autosaves every 20 seconds.</p>

        <h3>Feeding</h3>
        <p>Pick a food on the <b>Tank</b> tab, then click in the tank to drop it; clicking inside the substrate band chooses how far back it lands. Uneaten food rots into ammonia, so feed lightly: a pellet or two per 10 shrimp per day is plenty. Shrimp mostly graze <b>biofilm</b> anyway, and shrimplets depend on it entirely.</p>
        <ul>
          <li><b>Pellets</b> are the staple. Picky eaters refuse them.</li>
          <li><b>Algae wafers</b> and <b>zucchini</b> are vegetable foods everyone accepts.</li>
          <li><b>Almond leaves</b> last for days, grow biofilm and release tannins that soften pH slightly.</li>
          <li><b>Bee pollen</b> is a protein treat that restores health.</li>
        </ul>

        <h3>Water</h3>
        <p>The Tank tab shows a live test kit. Green is fine, amber needs attention, red is hurting the shrimp.</p>
        <ul>
          <li><b>Ammonia → nitrite → nitrate</b>: waste becomes ammonia, bacteria turn it into nitrite then nitrate. Ammonia and nitrite above 0.25 ppm poison shrimp. Nitrate builds up slowly and is removed by plants and water changes; keep it under 20–40.</li>
          <li><b>Temperature</b>: 20–25 °C is ideal. The room swings a little day and night; a heater holds a target and makes the water steadier.</li>
          <li><b>GH</b> (hardness) is what shells are made of. Below 5 molts start to fail. <b>Add minerals</b> raises GH and KH, and water changes with soft tap water lower them.</li>
          <li><b>KH</b> buffers pH. Under 2, pH swings between day and night and stresses everyone.</li>
          <li><b>TDS</b> creeps up with feeding and waste. Water changes reset it.</li>
          <li><b>Stability</b> measures how much parameters have moved in the last two days. Shrimp hate sudden change more than slightly wrong numbers. A 40% water change gives a big stability hit; 20% weekly is gentler.</li>
        </ul>

        <h3>Molting and breeding</h3>
        <p>Shrimp molt every few weeks (every few days as juveniles) and hide until the new shell hardens, leaving a white ghost shell others eat for calcium. A molt can fail if GH is low, water is unstable or the shrimp is weak. Big water changes trigger a tank-wide molting wave.</p>
        <p>After an adult female molts she releases pheromones and every male chases her. If one reaches her she becomes <b>berried</b> and carries 15–30 eggs for about a month. Hatchling survival depends on biofilm, moss and clean water, and drops when the tank is crowded.</p>

        <h3>Genetics and morphs</h3>
        <p>Every shrimp carries two copies of each gene. Colour (red, blue, yellow, black, chocolate, orange, green, snow, wild), intensity, pattern (solid, rili, tiger), orange eyes, metallic sheen and the very rare galaxy spotting. Many are recessive: a shrimp can <b>carry</b> blue and look red. The shrimp card lists what it carries. Breed two carriers and a quarter of the clutch shows the trait.</p>
        <p>Every clutch also has a small chance of a spontaneous <b>mutation</b>, so a colour nobody bought can appear. New morphs are announced and added to the Dex. Rarer morphs sell for much more; males show weaker colour than females. Mixing many colours drifts back toward wild brown, so keep the lines you like separate by selling.</p>

        <h3>Personalities</h3>
        <p>Each shrimp has six traits (bold, social, curious, greedy, lazy, fussy) that shape what it does: shy ones hide under bright light, greedy ones rush food, curious ones explore. Shrimp remember where they spend time and who they are near, so over days they develop <b>obsessions</b> with a favourite object, <b>friendships</b>, quirks and nicknames. Click any shrimp to read its card; hidden ones show as faded x-ray outlines behind the hardscape.</p>

        <h3>Plants, algae, snails and cover</h3>
        <ul>
          <li><b>Plants</b> eat nitrate and provide hiding room. Moss is a shrimplet nursery. Floating water lettuce eats nitrate fastest but shades everything below; trim it when it takes over.</li>
          <li><b>Light</b> feeds plants and algae alike. More hours and intensity mean more algae film on the glass, and hair algae when nitrate is high. Scrub the glass or add a nerite.</li>
          <li><b>Snails</b>: nerites are algae machines that cannot breed here. Ramshorn and bladder snails breed on leftover food, and bladder snails hitchhike in on new plants. Too many snails means you are feeding too much.</li>
          <li><b>Hiding room</b>: each piece of hardscape and each plant shelters a few shrimp. When the colony outgrows it, stress rises. Sell shrimp or add cover.</li>
        </ul>

        <h3>Money</h3>
        <p>You start with $40. Sell shrimp from their card (adults fetch full price, juveniles 40%) and spend it on food, plants, hardscape, snails, or new breeding pairs and mystery bags in the <b>Shop</b>.</p>

        <h3>Shortcuts</h3>
        <p>Space: pause. 1/2/3: speed. Esc: cancel feeding and deselect. Right-click while feeding also cancels.</p>
      </div>`;
  }

  // ---- events ----
  onPanelClick(e) {
    const b = e.target.closest('[data-action]'); if (!b) return;
    const g = this.game, w = this.world, id = Number(b.dataset.id);
    switch (b.dataset.action) {
      case 'feedmode': g.state.feedMode = g.state.feedMode === b.dataset.key ? null : b.dataset.key; this.dirty(); break;
      case 'wc': g.act('waterChange', Number(b.dataset.key)); break;
      case 'scrub': g.act('scrub'); break;
      case 'remin': g.act('remineralize'); break;
      case 'trim': g.act('trim', id); break;
      case 'removeplant': if (confirm('Remove this plant?')) g.act('remove', 'plants', id); break;
      case 'removedecor': if (confirm('Remove this piece of hardscape?')) g.act('remove', 'decor', id); break;
      case 'select': g.select(id); break;
      case 'deselect': g.select(null); break;
      case 'rename': { const s = w.shrimp.find((x) => x.id === id); const n = prompt('Nickname for this shrimp:', s?.nickname || ''); if (n !== null) g.act('rename', id, n.trim()); break; }
      case 'sell': { const s = w.shrimp.find((x) => x.id === id); if (s && confirm(`Sell ${g.state.nameOf(s)} (${s.pheno.name})?`)) { g.act('sell', id); g.select(null); } break; }
      case 'buy': g.act('buy', b.dataset.kind, b.dataset.key); this.showTab('shop'); break;
    }
  }

  onPanelInput(e) {
    const i = e.target.closest('[data-input]'); if (!i) return;
    const g = this.game, w = this.world;
    switch (i.dataset.input) {
      case 'lighthours': g.act('setLight', Number(i.value), w.light.intensity); i.nextElementSibling.textContent = `${i.value}h`; break;
      case 'lightint': g.act('setLight', w.light.hours, Number(i.value)); break;
      case 'heater': g.act('setHeater', i.checked, w.heater.target); break;
      case 'heatertarget': g.act('setHeater', w.heater.on, Number(i.value)); i.nextElementSibling.textContent = `${i.value}°C`; break;
      case 'logfilter': this.logImportant = i.checked; this.renderLog(); break;
    }
    this._dirty = false; // keep the slider being dragged alive
  }
}
