// Manifest-driven asset streaming.
// - loadTier('core') is awaited by the loading screen.
// - loadTier('stream') runs after the game starts; renderers ask `get(id)`
//   every frame and draw a placeholder until the real asset arrives.
export class AssetLoader {
  constructor(base = './assets/') {
    this.base = base;
    this.manifest = null;
    this.assets = new Map();
    this.listeners = new Set();
    this.tierState = new Map();
  }

  onProgress(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) fn(ev); }

  async loadManifest() {
    const res = await fetch(`${this.base}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    this.manifest = await res.json();
    return this.manifest;
  }

  get(id) { return this.assets.get(id); }
  has(id) { return this.assets.has(id); }
  tierDone(tier) { return this.tierState.get(tier)?.done === true; }

  async loadTier(tier, { concurrency = 6 } = {}) {
    if (!this.manifest) await this.loadManifest();
    const items = this.manifest.assets.filter((a) => a.tier === tier && !this.assets.has(a.id));
    const state = { tier, total: items.reduce((s, a) => s + (a.bytes || 1), 0), loaded: 0, count: items.length, finished: 0, current: '', done: false };
    this.tierState.set(tier, state);
    this.emit({ ...state });

    const queue = items.slice();
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        state.current = item.url.split('/').pop();
        let seen = 0;
        try {
          const blob = await this.fetchWithProgress(`${this.base}${item.url}?v=${this.manifest.version}`, (bytes) => {
            // Progress is weighted by manifest bytes so partial content-length
            // reporting on some CDNs can't push the bar past 100%.
            const capped = Math.min(bytes, item.bytes || bytes);
            state.loaded += capped - seen; seen = capped;
            this.emit({ ...state });
          });
          const value = await this.decode(item, blob);
          this.assets.set(item.id, value);
        } catch (err) {
          console.warn('asset failed', item.id, err);
          this.assets.set(item.id, null);
        }
        state.loaded += (item.bytes || 0) - seen;
        state.finished++;
        this.emit({ ...state });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    state.done = true;
    state.current = '';
    this.emit({ ...state });
  }

  async fetchWithProgress(url, onBytes) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    if (!res.body || !res.body.getReader) {
      const b = await res.blob(); onBytes(b.size); return b;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onBytes(received);
    }
    return new Blob(chunks, { type: res.headers.get('content-type') || '' });
  }

  async decode(item, blob) {
    if (item.type === 'json') return JSON.parse(await blob.text());
    if (item.type === 'svg') {
      const text = await blob.text();
      const svgBlob = new Blob([text], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      try {
        return await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('svg decode ' + item.id));
          img.src = url;
        });
      } finally {
        // Revoke lazily so the image has time to decode on slow devices.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    }
    return blob;
  }
}
