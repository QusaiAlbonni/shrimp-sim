# Shrimp Tank

A small aquarium simulator that runs entirely in the browser. No build step,
no dependencies: plain ES modules and a canvas.

You manage a shrimp tank: water chemistry, plants, algae on the glass you
scrub by hand, hiding spots, food, snails and lighting. The shrimp have
personalities, memories, quirks and friendships, and their genetics carry
hidden alleles that surface as new colour morphs (or, rarely, brand-new
mutations). Neocaridina and Caridina (crystal) lines never interbreed.

Tools on the tank: Inspect, Feed (click to drop), Scrub (drag across the
glass), Trim (drag across a plant). Hearts appear over courting pairs and can
be clicked for an instant shrimplet. The shop sells food, shrimp lines, plants,
hardscape, novelty decorations, snails, tank models and backgrounds. A Pace
setting in the ⋯ menu scales all biological timers.

## Run locally

Any static server works. For example:

```
python3 -m http.server 8080
```

then open http://localhost:8080. Opening `index.html` directly from the file
system will not work because ES modules and `fetch` need an HTTP origin.

## Deploy to GitHub Pages

1. Push this folder to a repository (branch `main`).
2. In the repository settings, under Pages, set the source to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` rebuilds the asset manifest,
   stamps the service worker version and deploys on every push.

Every path is relative, so the game works from `https://<user>.github.io/<repo>/`
without any configuration.

## Asset streaming

`assets/manifest.json` lists every asset with its byte size and a tier:

- `core` assets are streamed with a byte-accurate progress bar on the loading
  screen (via `fetch` + `ReadableStream`).
- `stream` assets download in the background after you enter the tank. Until
  they arrive, the renderer draws placeholders and the top bar shows
  "streaming extras".

Run `node tools/build-manifest.js` after adding or changing files in `assets/`.
A service worker caches everything after the first visit so the game works
offline.

## Project layout

```
index.html, styles.css      shell + loading screen
src/main.js                 boot sequence and loading UI
src/loader.js               manifest-driven streaming loader
src/game.js                 main loop, input, saves, offline catch-up
src/sim/genetics.js         loci, alleles, mutation, phenotype → morph names
src/sim/shrimp.js           needs, utility AI, memory, quirks, molting, breeding
src/sim/ecology.js          water chemistry, plants, algae, biofilm, food, snails
src/sim/world.js            world state, tick, daily pass, player actions, save format
src/sim/narrative.js        event log text from assets/data/events.json
src/render/*                canvas renderer, procedural shrimp and plant drawing
src/ui/ui.js                side panel (tank, shrimp, shop, log, dex, guide)
assets/                     sprites (SVG), data (JSON), manifest.json
tools/build-manifest.js     regenerates the manifest with byte sizes
```

## Headless simulation

The simulation has no DOM dependencies, so it can be run in Node for balance
testing (see the module exports in `src/sim/world.js`).
# shrimp-sim
