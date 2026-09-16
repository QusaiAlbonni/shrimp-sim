// Boot: loading screen → stream core assets → import the game → offline
// catch-up → enter. The stream tier loads in the background after that.
import { AssetLoader } from './loader.js';
import { swatchShrimp } from './render/shrimpSprite.js';

const $ = (id) => document.getElementById(id);
const bar = $('loaderBar'), statusEl = $('loaderStatus'), detailEl = $('loaderDetail'), factEl = $('loaderFact'), enterBtn = $('loaderEnter'), errEl = $('loaderError');

const FALLBACK_FACTS = [
  'Shrimp molt every few weeks and eat the old shell for the calcium.',
  'A berried female carries her eggs for about a month, fanning them constantly.',
  'Most of what a shrimp eats is biofilm you cannot see.',
];
let facts = FALLBACK_FACTS;
let factI = 0;
function rotateFact() { factEl.textContent = facts[factI % facts.length]; factI++; }
rotateFact();
const factTimer = setInterval(rotateFact, 4200);

// A little swimming shrimp on the loading screen, drawn without any assets.
const lc = $('loaderCanvas').getContext('2d');
let animT = 0, animRunning = true;
function loaderAnim() {
  if (!animRunning) return;
  animT += 0.03;
  lc.clearRect(0, 0, 220, 90);
  lc.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 4; i++) { lc.beginPath(); lc.arc(30 + i * 55 + Math.sin(animT + i) * 4, 70 - ((animT * 30 + i * 25) % 80), 2 + i, 0, Math.PI * 2); lc.fill(); }
  const x = 110 + Math.sin(animT * 0.7) * 60, y = 45 + Math.sin(animT * 1.3) * 8;
  const dir = Math.cos(animT * 0.7) < 0 ? -1 : 1;
  swatchShrimp(lc, x, y, 1, [220, 60, 60], 0.85, { tier: 3 }, dir, animT * 12, true);
  requestAnimationFrame(loaderAnim);
}
loaderAnim();

function setProgress(frac, text, detail = '') {
  bar.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  if (text) statusEl.textContent = text;
  detailEl.textContent = detail;
}
const fmtKB = (b) => `${(b / 1024).toFixed(1)} KB`;

async function boot() {
  const loader = new AssetLoader('./assets/');
  try {
    setProgress(0.02, 'Reading manifest');
    const manifest = await loader.loadManifest();
    const core = manifest.assets.filter((a) => a.tier === 'core');
    const stream = manifest.assets.filter((a) => a.tier === 'stream');

    // Stage 1: core assets → 0..65%
    const off = loader.onProgress((p) => {
      if (p.tier !== 'core') return;
      const f = p.total ? p.loaded / p.total : 1;
      setProgress(0.02 + f * 0.63, `Streaming core assets (${p.finished}/${p.count})`, p.current ? `${p.current} · ${fmtKB(p.loaded)} of ${fmtKB(p.total)}` : '');
    });
    await loader.loadTier('core');
    off();
    const names = loader.get('names');
    if (names?.facts?.length) facts = names.facts;

    // Stage 2: simulation code → 65..85%
    setProgress(0.68, 'Loading simulation module', 'genetics, water chemistry, behaviour AI');
    const { createGame } = await import('./game.js');

    // Stage 3: world → 85..100%
    setProgress(0.86, 'Setting up the tank');
    const data = { events: loader.get('events'), names: loader.get('names'), quirks: loader.get('quirks') };
    const game = await createGame({ loader, data, onStatus: (s) => setProgress(0.9, s) });
    setProgress(1, 'Ready', `${core.length} core assets loaded · ${stream.length} extras will stream in the background`);
    window.__game = game;

    enterBtn.classList.remove('hidden');
    const enter = () => {
      enterBtn.disabled = true;
      clearInterval(factTimer); animRunning = false;
      $('loader').classList.add('fade');
      setTimeout(() => $('loader').remove(), 600);
      game.start();
      loader.loadTier('stream', { concurrency: 3 });
    };
    enterBtn.addEventListener('click', enter, { once: true });
    window.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !enterBtn.disabled) enter(); }, { once: true });
  } catch (err) {
    console.error(err);
    errEl.classList.remove('hidden');
    errEl.innerHTML = `Something went wrong while loading: <code>${String(err.message || err)}</code><br><button id="retry">Retry</button>`;
    $('retry').addEventListener('click', () => location.reload());
  }
}
boot();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
