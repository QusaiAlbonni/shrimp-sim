// Diploid genetics for Neocaridina-style colour morphs.
// Every shrimp carries two alleles per locus. Recessive alleles can ride along
// invisibly for generations and then surface, and every gamete has a small
// chance to mutate, so new morphs can appear in a closed tank.
import { clamp } from '../rng.js';

export const LOCI = {
  C:  { alleles: ['w', 'n', 'g', 'y', 'o', 'b', 'r', 'c', 'k'], mut: 0.010 }, // pigment colour
  I1: { alleles: [0, 1, 2, 3], mut: 0.020 }, // intensity (additive)
  I2: { alleles: [0, 1, 2, 3], mut: 0.020 }, // intensity (additive)
  P:  { alleles: ['S', 'r', 't', 'b'], mut: 0.008 }, // S solid (dom), rr/rt rili, tt tiger, bb crystal banding
  E:  { alleles: ['N', 'e'], mut: 0.004 }, // ee = orange eyes
  H:  { alleles: ['N', 'h'], mut: 0.003 }, // hh = metallic sheen
  G:  { alleles: ['N', 'g'], mut: 0.0015 }, // gg = galaxy pinto spotting (legendary)
};

export const COLORS = {
  w: { name: 'Wild', rank: 0, rgb: [140, 122, 92], rarity: 0 },
  n: { name: 'Snow', rank: 1, rgb: [242, 242, 236], rarity: 3 },
  g: { name: 'Green', rank: 2, rgb: [62, 150, 72], rarity: 2 },
  y: { name: 'Yellow', rank: 3, rgb: [246, 206, 44], rarity: 1 },
  o: { name: 'Orange', rank: 4, rgb: [250, 138, 34], rarity: 2 },
  b: { name: 'Blue', rank: 5, rgb: [58, 98, 228], rarity: 1 },
  r: { name: 'Red', rank: 6, rgb: [216, 38, 38], rarity: 0 },
  c: { name: 'Chocolate', rank: 7, rgb: [88, 50, 30], rarity: 2 },
  k: { name: 'Black', rank: 8, rgb: [30, 24, 36], rarity: 2 },
};

const GRADE_NAMES = {
  r: ['Cherry', 'Sakura', 'Fire Red', 'Painted Fire Red', 'Bloody Mary'],
  b: ['Blue Jelly', 'Blue Dream', 'Blue Velvet', 'Blue Diamond', 'Blue Sapphire'],
  k: ['Smoky', 'Black Rose', 'Black Rose', 'Onyx', 'Black Diamond'],
  c: ['Cocoa', 'Chocolate', 'Chocolate', 'Dark Chocolate', 'Black Chocolate'],
  y: ['Pale Yellow', 'Yellow', 'Yellow Goldenback', 'Neon Yellow', '24K Gold'],
  o: ['Peach', 'Orange', 'Orange Sunkist', 'Orange Sakura', 'Pumpkin'],
  g: ['Mint', 'Green Jade', 'Green Jade', 'Emerald', 'Deep Emerald'],
  n: ['Ghost', 'Snowball', 'Snowball', 'White Pearl', 'Ivory Pearl'],
  w: ['Wild Type', 'Wild Type', 'Wild Brown', 'Wild Brown', 'Wild Bronze'],
};

export function makeGamete(genome, rng) {
  const g = {};
  for (const [locus, def] of Object.entries(LOCI)) {
    let a = genome[locus][rng.int(0, 1)];
    let mutated = false;
    if (rng.chance(def.mut)) {
      const others = def.alleles.filter((x) => x !== a);
      a = rng.pick(others);
      mutated = true;
    }
    g[locus] = { a, mutated };
  }
  return g;
}

export function combine(gm, gf) {
  const genome = {}; const mutations = [];
  for (const locus of Object.keys(LOCI)) {
    genome[locus] = [gm[locus].a, gf[locus].a];
    if (gm[locus].mutated || gf[locus].mutated) mutations.push(locus);
  }
  return { genome, mutations };
}

export function phenotype(genome, sex) {
  const [c1, c2] = genome.C;
  const top = COLORS[c1].rank >= COLORS[c2].rank ? c1 : c2;
  const other = top === c1 ? c2 : c1;
  let grade = genome.I1[0] + genome.I1[1] + genome.I2[0] + genome.I2[1]; // 0..12
  if (c1 !== c2) grade -= other === 'w' ? 3 : 1;
  if (sex === 'M') grade -= 2;
  grade = clamp(grade, 0, 12);
  const tier = grade <= 2 ? 0 : grade <= 5 ? 1 : grade <= 8 ? 2 : grade <= 10 ? 3 : 4;

  const p = genome.P;
  const solid = p.includes('S');
  const tiger = !solid && p[0] === 't' && p[1] === 't';
  const crystal = !solid && p[0] === 'b' && p[1] === 'b';
  const rili = !solid && !tiger && !crystal;
  const orangeEye = genome.E[0] === 'e' && genome.E[1] === 'e';
  const sheen = genome.H[0] === 'h' && genome.H[1] === 'h';
  const galaxy = genome.G[0] === 'g' && genome.G[1] === 'g';

  const colour = COLORS[top];
  let name;
  if (galaxy) name = `${colour.name} Galaxy Pinto`;
  else if (crystal) name = `Crystal ${colour.name}${tier >= 4 ? ' SSS' : tier >= 2 ? ' S+' : ''}`;
  else if (tiger) name = `${colour.name} Tiger`;
  else if (rili) name = top === 'k' ? 'Carbon Rili' : `${colour.name} Rili`;
  else name = GRADE_NAMES[top][tier];
  if (sheen) name = `Metallic ${name}`;
  if (orangeEye) name = `Orange Eye ${name}`;

  const rarity = tier + colour.rarity + (rili ? 2 : 0) + (tiger ? 3 : 0) + (crystal ? 3 : 0) + (orangeEye ? 4 : 0) + (sheen ? 4 : 0) + (galaxy ? 8 : 0);
  const price = Math.round(2 + Math.pow(rarity, 1.6) * 1.4);
  const stars = rarity <= 1 ? 1 : rarity <= 3 ? 2 : rarity <= 6 ? 3 : rarity <= 10 ? 4 : 5;
  const opacity = top === 'w' ? 0.35 + tier * 0.08 : 0.42 + tier * 0.145;

  return {
    name, colour: top, rgb: colour.rgb, tier, grade, solid, rili, tiger, crystal, orangeEye, sheen, galaxy,
    rarity, stars, price, opacity,
    hidden: hiddenAlleles(genome),
  };
}

// Alleles that are carried but not expressed, shown in the shrimp card as
// "carries: blue, rili". This is the breeding puzzle.
function hiddenAlleles(genome) {
  const out = [];
  const [c1, c2] = genome.C;
  if (c1 !== c2) { const low = COLORS[c1].rank < COLORS[c2].rank ? c1 : c2; out.push(COLORS[low].name.toLowerCase()); }
  if (genome.P.includes('S') && genome.P.includes('r')) out.push('rili');
  if (genome.P.includes('S') && genome.P.includes('t')) out.push('tiger');
  if (genome.P.includes('S') && genome.P.includes('b')) out.push('crystal banding');
  if (genome.E.includes('e') && genome.E.includes('N')) out.push('orange eye');
  if (genome.H.includes('h') && genome.H.includes('N')) out.push('sheen');
  if (genome.G.includes('g') && genome.G.includes('N')) out.push('galaxy');
  return out;
}

const pair = (rng, list) => [rng.pick(list), rng.pick(list)];

export function presetGenome(rng, preset = 'cherry') {
  const g = {
    C: ['r', 'r'], I1: [rng.int(0, 2), rng.int(1, 2)], I2: [rng.int(0, 2), rng.int(1, 2)],
    P: ['S', 'S'], E: ['N', 'N'], H: ['N', 'N'], G: ['N', 'N'],
  };
  const hi = () => [rng.int(2, 3), rng.int(2, 3)];
  switch (preset) {
    case 'cherry': if (rng.chance(0.3)) g.C = ['r', 'w']; break;
    case 'fire': g.I1 = hi(); g.I2 = hi(); break;
    case 'blue': g.C = ['b', 'b']; g.I1 = [rng.int(1, 3), rng.int(1, 3)]; g.I2 = [rng.int(1, 3), rng.int(1, 3)]; break;
    case 'yellow': g.C = ['y', 'y']; g.I1 = hi(); break;
    case 'black': g.C = ['k', 'k']; g.I1 = hi(); g.I2 = [rng.int(1, 3), rng.int(1, 3)]; break;
    case 'rili': g.C = ['r', 'r']; g.P = ['r', 'r']; g.I1 = hi(); break;
    case 'wild': g.C = ['w', 'w']; g.I1 = pair(rng, [0, 1]); g.I2 = pair(rng, [0, 1]); break;
    case 'snow': g.C = ['n', 'n']; g.I1 = hi(); g.I2 = [rng.int(1, 3), rng.int(1, 3)]; break;
    case 'green': g.C = ['g', 'g']; g.I1 = hi(); g.I2 = [rng.int(1, 3), rng.int(1, 3)]; break;
    case 'orange': g.C = ['o', 'o']; g.I1 = hi(); g.I2 = [rng.int(1, 3), rng.int(1, 3)]; break;
    case 'crystalRed': g.C = ['r', 'r']; g.P = ['b', 'b']; g.I1 = hi(); g.I2 = [rng.int(1, 3), rng.int(1, 3)]; break;
    case 'crystalBlack': g.C = ['k', 'k']; g.P = ['b', 'b']; g.I1 = hi(); g.I2 = [rng.int(1, 3), rng.int(1, 3)]; break;
    case 'mystery': {
      g.C = [rng.pick(LOCI.C.alleles), rng.pick(LOCI.C.alleles)];
      g.I1 = pair(rng, LOCI.I1.alleles); g.I2 = pair(rng, LOCI.I2.alleles);
      g.P = [rng.pick(LOCI.P.alleles), rng.chance(0.5) ? 'S' : rng.pick(LOCI.P.alleles)];
      if (rng.chance(0.35)) g.E = ['N', 'e'];
      if (rng.chance(0.25)) g.H = ['N', 'h'];
      if (rng.chance(0.06)) g.G = ['N', 'g'];
      break;
    }
  }
  return g;
}

export function cloneGenome(g) { const o = {}; for (const k of Object.keys(g)) o[k] = g[k].slice(); return o; }
