#!/usr/bin/env node
// Scans assets/ and writes assets/manifest.json with real byte sizes so the
// loading screen can show accurate progress. Run: node tools/build-manifest.js
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ROOT = new URL('../assets/', import.meta.url).pathname;

// Tiers: "core" must finish before the game starts; "stream" loads in the
// background after the tank is on screen and swaps in when ready.
const STREAM = new Set(['bamboo', 'backdrop', 'mossball', 'hut', 'tube', 'cave', 'boat', 'chest', 'castle', 'sign', 'diver', 'rockwall']);

const assets = [];
for (const dir of ['sprites', 'data']) {
  for (const f of readdirSync(join(ROOT, dir)).sort()) {
    const ext = extname(f);
    const id = basename(f, ext);
    const type = ext === '.svg' ? 'svg' : ext === '.json' ? 'json' : 'blob';
    assets.push({
      id,
      url: `${dir}/${f}`,
      type,
      tier: STREAM.has(id) ? 'stream' : 'core',
      bytes: statSync(join(ROOT, dir, f)).size,
    });
  }
}
const manifest = { version: Date.now().toString(36), assets };
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest: ${assets.length} assets, ${assets.reduce((a, b) => a + b.bytes, 0)} bytes`);
