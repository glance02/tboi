// Reverse lookup: every bag of 8 pickups that crafts a given item on a given seed.
//
// There are 30,260,340 possible bags (multisets of 8 from 29 pickups), too many to run
// craft() on each. Two things make it fast enough:
//  - The weighted item table only depends on the bag's quality range and on the counts of
//    the pickups that add pools, so it is built once per distinct "signature", and
//    signatures whose table can't produce the target are skipped outright.
//  - Bags are visited in ascending pickup id order, which is the order the game advances
//    the rng in, so the rng is carried along the search instead of recomputed per bag.
// A draw is resolved with a binary search over the table; draws that land too close to a
// boundary for float rounding to be ignored fall back to the exact scan in drawItem().

import { PICKUPS, PICKUP_COUNT, rngNext, qualityRange, poolFilterOk, itemWeights, drawItem, drawPoint, rollFilterOk } from './crafting.js?v=12';

export const TOTAL_BAGS = 30260340;

// Rough rarity of each pickup, used to rank recipes by how easy they are to collect.
// 0 = common, 1 = uncommon, 2 = rare.
export const RARITY = [
  0,
  0, 0, 1, 1, 1, 1, 1, // hearts: red, soul, black, eternal, gold, bone, rotten
  0, 1, 1, 2, // coins: penny, nickel, dime, lucky penny
  0, 2, 1, // keys: key, golden key, charged key
  0, 2, 2, // bombs: bomb, golden bomb, giga bomb
  1, 1, 2, // batteries: micro, lil', mega
  0, 0, 1, 2, // card, pill, rune, dice shard
  1, 2, 2, 2, // cracked key, golden penny, golden pill, golden battery
  0, // poop
];

/** Easiest first: lowest total rarity, then fewest different pickups. */
export function recipeCost(bag) {
  return bag.reduce((sum, p) => sum + RARITY[p], 0) * 16 + new Set(bag).size;
}

// Pickups that add a pool, and their slot in the packed signature (4 bits each).
const SPECIAL_SLOT = new Array(PICKUP_COUNT).fill(-1);
[3, 4, 5, 6, 7, 23, 25, 29].forEach((id, slot) => { SPECIAL_SLOT[id] = slot; });
// Red hearts, pennies, keys and bombs shut off the planetarium pool.
const BLOCKS_PLANETARIUM = new Array(PICKUP_COUNT).fill(0);
for (const id of [1, 8, 12, 15]) BLOCKS_PLANETARIUM[id] = 1;

const rangeIndex = score => qualityRange(score).join();
const RANGE_KEYS = [...new Set(Array.from({ length: 90 }, (_, s) => rangeIndex(s - 5)))];
// score -> small integer identifying [quality range, quality range with the 5 point penalty]
const SCORE_KEY = Array.from({ length: 81 }, (_, s) =>
  RANGE_KEYS.indexOf(rangeIndex(s)) * RANGE_KEYS.length + RANGE_KEYS.indexOf(rangeIndex(s - 5)));
const SCORE_KEY_PLAIN = SCORE_KEY.map(key => key - key % RANGE_KEYS.length);
const SCORE_KEYS = RANGE_KEYS.length ** 2;

/**
 * @param {object} version  one entry of data.versions
 * @param {number} seed     32-bit start seed
 * @param {number} target   collectible id
 * @param {object} [opts]   run options, as for craft()
 * @param {object} [settings]
 * @param {(done: number) => void} [settings.onProgress]  called with the number of bags checked so far
 * @returns {{ fixed: number[][], packed: Uint8Array, total: number }}
 *   fixed: seed independent recipes for the item, as sorted pickup id arrays.
 *   packed: every seeded recipe, 8 sorted pickup ids each, back to back (rank them with
 *   rankRecipes()). total: how many seeded recipes there are.
 */
export function findRecipes(version, seed, target, opts = {}, { onProgress } = {}) {
  const fixedBags = new Set(Object.keys(version.fixed));
  const fixed = Object.entries(version.fixed)
    .filter(([, id]) => id === target)
    .map(([key]) => key.split(',').map(Number));

  // The run filters can reject a draw and force a redraw; without them the first draw decides.
  const canReject = (opts.lateStage && !opts.greed) || opts.keeper || opts.lostBR
    || opts.taintedLost || opts.sacredOrb || opts.goldenNo;

  // The pools that can hold the target, and the pickup each one needs (0 = always on).
  // Mirrors itemWeights(), so most tables that can't produce the target are never built.
  const POOL_GATES = { 0: 0, 1: 0, 2: 0, 4: 4, 3: 3, 5: 6, 8: 5, 12: 7, 9: 25, 7: 29, 26: 23 };
  const quality = version.items[target][1];
  const targetPools = poolFilterOk(version.items[target], opts)
    ? Object.entries(POOL_GATES)
      .filter(([pool]) => version.pools[pool].some(([id]) => id === target))
      .map(([pool, gate]) => [Number(pool), gate])
    : [];
  function reachable(counts, blocked, score) {
    for (const [pool, gate] of targetPools) {
      if (gate && counts[gate] === 0) continue;
      if (pool === 26 && blocked) continue;
      const [qmin, qmax] = qualityRange(pool === 3 || pool === 4 || pool === 5 ? score - 5 : score);
      if (quality >= qmin && quality <= qmax) return true;
    }
    return false;
  }

  const tables = new Map();
  function table(counts, specials, blocked, score) {
    // Leave out what can't matter, so equivalent bags share a table: the planetarium
    // block without runes, and the penalized quality range without angel/devil/secret pools.
    const runes = counts[23] > 0;
    const penalized = counts[3] + counts[4] + counts[6] > 0;
    const key = ((specials * 2 + (runes && blocked ? 1 : 0)) * SCORE_KEYS)
      + (penalized ? SCORE_KEY[score] : SCORE_KEY_PLAIN[score]);
    let entry = tables.get(key);
    if (entry !== undefined) return entry;
    entry = null;
    const { weights, total } = reachable(counts, blocked, score)
      ? itemWeights(version, counts, score, opts)
      : { weights: null, total: 0 };
    if (weights && weights[target] > 0) {
      const ids = [], cum = [];
      let sum = 0, lo = 0;
      for (let id = 0; id < weights.length; id++) {
        if (weights[id] <= 0) continue;
        if (id === target) lo = sum;
        sum += weights[id];
        ids.push(id);
        cum.push(sum);
      }
      entry = {
        weights, total, ids, cum,
        lo, hi: lo + weights[target],
        // Generous bound on how far the game's float32 running subtraction can drift.
        margin: total * 1e-4,
      };
    }
    tables.set(key, entry);
    return entry;
  }

  // Which item a draw landing at `point` picks.
  function select(entry, point, rng) {
    const { cum, ids, margin } = entry;
    let a = 0, b = cum.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (cum[mid] > point) b = mid; else a = mid + 1;
    }
    const below = a === 0 ? 0 : cum[a - 1];
    if (a === cum.length || point - below < margin || cum[a] - point < margin) {
      return drawItem(entry.weights, entry.total, rng);
    }
    return ids[a];
  }

  function makes(entry, rng) {
    if (!canReject) {
      rng = rngNext(rng, 6);
      const point = drawPoint(entry.total, rng);
      const { lo, hi, margin } = entry;
      if (point < lo - margin || point >= hi + margin) return false;
      if (point >= lo + margin && point < hi - margin) return true;
      return drawItem(entry.weights, entry.total, rng) === target;
    }
    let selected = -1;
    for (let attempt = 1; attempt <= 20; attempt++) {
      rng = rngNext(rng, 6);
      selected = select(entry, drawPoint(entry.total, rng), rng);
      if (rollFilterOk(version.items[selected], selected, seed, opts)) break;
    }
    return selected === target;
  }

  // The most common items have around a million recipes, so pack them as bytes.
  let packed = new Uint8Array(8 * 4096);
  let total = 0;
  let checked = 0, reported = 0;
  const bag = new Array(8);
  const counts = new Array(PICKUP_COUNT).fill(0);

  function found() {
    const recipe = bag.slice();
    if (fixedBags.has(recipe.join(','))) return; // a fixed recipe overrides the seed
    if ((total + 1) * 8 > packed.length) {
      const grown = new Uint8Array(packed.length * 2);
      grown.set(packed);
      packed = grown;
    }
    packed.set(recipe, total * 8);
    total++;
  }

  function visit(depth, from, rng, score, specials, blocked) {
    if (depth === 7) {
      // Last slot: check each finished bag directly rather than recursing once more.
      for (let id = from; id < 30; id++) {
        bag[7] = id;
        counts[id]++;
        const slot = SPECIAL_SLOT[id];
        const entry = table(counts, slot < 0 ? specials : specials + 16 ** slot,
          blocked + BLOCKS_PLANETARIUM[id], score + PICKUPS[id].value);
        if (entry !== null && makes(entry, rngNext(rng, id))) found();
        counts[id]--;
      }
      checked += 30 - from;
      if (checked - reported >= 1 << 20) onProgress?.(reported = checked);
      return;
    }
    for (let id = from; id < 30; id++) {
      bag[depth] = id;
      counts[id]++;
      const slot = SPECIAL_SLOT[id];
      visit(depth + 1, id, rngNext(rng, id), score + PICKUPS[id].value,
        slot < 0 ? specials : specials + 16 ** slot, blocked + BLOCKS_PLANETARIUM[id]);
      counts[id]--;
    }
  }
  visit(0, 1, seed, 0, 0, 0);
  onProgress?.(checked);
  return { fixed, packed: packed.slice(0, total * 8), total };
}

/**
 * Exact minimum TOTAL pickup value for several items in one search. Bags are
 * visited by increasing score, so the first match for an item proves its minimum.
 * Exclusions apply to the whole recipe, independently of the current bag.
 * Returns one { id, score, recipe } per target; score/recipe are null if unreachable.
 */
export function findLowestCosts(version, seed, targets, opts = {}, excluded = [], { onProgress } = {}) {
  const ids = [...new Set(targets)].filter(id => version.items[id]);
  const result = new Map(ids.map(id => [id, { id, score: null, recipe: null }]));
  const banned = new Set(excluded);
  const allowed = PICKUPS.flatMap((p, id) => p && !banned.has(id) ? [id] : []);
  if (!allowed.length || !ids.length) return [...result.values()];

  const fixedBags = new Set(Object.keys(version.fixed));
  const fixed = Object.entries(version.fixed).flatMap(([key, id]) => {
    const recipe = key.split(',').map(Number);
    return result.has(id) && recipe.every(p => !banned.has(p))
      ? [{ id, score: recipe.reduce((sum, p) => sum + PICKUPS[p].value, 0), recipe }] : [];
  });
  const gates = { 0: 0, 1: 0, 2: 0, 4: 4, 3: 3, 5: 6, 8: 5, 12: 7, 9: 25, 7: 29, 26: 23 };
  const pools = ids.flatMap(id => poolFilterOk(version.items[id], opts)
    ? Object.entries(gates).filter(([pool]) => version.pools[pool].some(([item]) => item === id))
      .map(([pool, gate]) => ({ id, pool: Number(pool), gate, quality: version.items[id][1] })) : []);
  const pending = new Set([...pools.map(p => p.id), ...fixed.map(p => p.id)]);
  const min = new Array(allowed.length), max = new Array(allowed.length);
  for (let i = allowed.length - 1; i >= 0; i--) {
    min[i] = Math.min(PICKUPS[allowed[i]].value, min[i + 1] ?? Infinity);
    max[i] = Math.max(PICKUPS[allowed[i]].value, max[i + 1] ?? -Infinity);
  }
  const counts = new Array(PICKUP_COUNT).fill(0);
  const bag = new Array(8);

  for (let score = min[0] * 8; score <= max[0] * 8 && pending.size; score++) {
    for (const entry of fixed) if (entry.score === score && pending.has(entry.id)) {
      result.set(entry.id, entry);
      pending.delete(entry.id);
    }
    const relevant = pools.filter(p => {
      const [low, high] = qualityRange([3, 4, 5].includes(p.pool) ? score - 5 : score);
      return pending.has(p.id) && p.quality >= low && p.quality <= high;
    });
    // A new cache per score bounds memory even for large collections.
    const tables = new Map();
    function table(specials, blocked) {
      const key = specials * 2 + (counts[23] && blocked ? 1 : 0);
      if (tables.has(key)) return tables.get(key);
      if (!relevant.some(p => (!p.gate || counts[p.gate]) && (p.pool !== 26 || !blocked))) {
        tables.set(key, null);
        return null;
      }
      const { weights, total } = itemWeights(version, counts, score, opts);
      if (!relevant.some(p => weights[p.id] > 0)) {
        tables.set(key, null);
        return null;
      }
      const itemIds = [], cumulative = [];
      let sum = 0;
      for (let id = 0; id < weights.length; id++) if (weights[id] > 0) {
        sum += weights[id];
        itemIds.push(id);
        cumulative.push(sum);
      }
      const entry = { weights, total, itemIds, cumulative, margin: total * 1e-4 };
      tables.set(key, entry);
      return entry;
    }
    function select(entry, rng) {
      const point = drawPoint(entry.total, rng);
      const { cumulative, itemIds, margin } = entry;
      let lo = 0, hi = cumulative.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumulative[mid] > point) hi = mid; else lo = mid + 1;
      }
      const below = lo === 0 ? 0 : cumulative[lo - 1];
      return lo === cumulative.length || point - below < margin || cumulative[lo] - point < margin
        ? drawItem(entry.weights, entry.total, rng) : itemIds[lo];
    }
    function visit(depth, from, rng, value, specials, blocked) {
      const slots = 8 - depth;
      if (!pending.size || from === allowed.length || value + slots * min[from] > score
          || value + slots * max[from] < score) return;
      for (let i = from; i < allowed.length; i++) {
        const id = allowed[i], nextValue = value + PICKUPS[id].value;
        if (nextValue > score) continue;
        bag[depth] = id;
        counts[id]++;
        const slot = SPECIAL_SLOT[id];
        const signature = slot < 0 ? specials : specials + 16 ** slot;
        const nextBlocked = blocked + BLOCKS_PLANETARIUM[id];
        let nextRng = rngNext(rng, id);
        if (depth < 7) {
          visit(depth + 1, i, nextRng, nextValue, signature, nextBlocked);
        } else if (nextValue === score) {
          const entry = table(signature, nextBlocked);
          if (entry) {
            let selected;
            for (let attempt = 1; attempt <= 20; attempt++) {
              nextRng = rngNext(nextRng, 6);
              selected = select(entry, nextRng);
              if (rollFilterOk(version.items[selected], selected, seed, opts)) break;
            }
            if (pending.has(selected) && !fixedBags.has(bag.join(','))) {
              result.set(selected, { id: selected, score, recipe: bag.slice() });
              pending.delete(selected);
            }
          }
        }
        counts[id]--;
      }
    }
    if (relevant.length) visit(0, 0, seed, 0, 0, 0);
    onProgress?.({ score, found: [...result.values()].filter(e => e.recipe).length, total: ids.length });
  }
  return [...result.values()];
}

/** Packs recipes (arrays of 8 pickup ids) the way findRecipes() does. */
export function packRecipes(recipes) {
  const packed = new Uint8Array(recipes.length * 8);
  recipes.forEach((recipe, i) => packed.set([...recipe].sort((a, b) => a - b), i * 8));
  return packed;
}

/**
 * Ranks packed recipes against the pickups already in the bag: fewest pickups to add
 * first, then the easiest ones to collect. Recipes that need an excluded pickup are left
 * out, unless the bag already holds enough of it.
 *
 * @param {Uint8Array} packed  recipes from findRecipes() or packRecipes()
 * @param {number[]} bag       pickup ids in the bag now (0 to 8)
 * @param {Iterable<number>} [excluded]  pickup ids not to suggest
 * @param {number} [keep]      how many recipes to return
 * @returns {{ recipes: { recipe: number[], add: number[], drop: number[] }[], eligible: number, closest: number, bestAdd: number }}
 *   recipes: the best ones, with the pickups to add to (and drop from) the bag.
 *   eligible: recipes left after exclusions. closest: how many need only bestAdd pickups.
 */
export function rankRecipes(packed, bag, excluded = [], keep = 50) {
  const have = new Array(PICKUP_COUNT).fill(0);
  for (const p of bag) have[p]++;
  const banned = new Array(PICKUP_COUNT).fill(false);
  for (const p of excluded) banned[p] = true;

  // cost = pickups to add * 1024 + rarity cost of those pickups (always under 1024).
  const n = packed.length / 8;
  const costs = new Int32Array(n);
  const buckets = new Uint32Array(9 * 1024);
  const need = new Array(PICKUP_COUNT).fill(0);
  let eligible = 0;
  for (let i = 0; i < n; i++) {
    let add = 0, rarity = 0, distinct = 0, ok = true;
    for (let j = i * 8; j < i * 8 + 8; j++) {
      const p = packed[j];
      if (++need[p] > have[p]) {
        if (banned[p]) ok = false;
        add++;
        rarity += RARITY[p];
        if (need[p] - have[p] === 1) distinct++;
      }
    }
    for (let j = i * 8; j < i * 8 + 8; j++) need[packed[j]] = 0;
    if (!ok) {
      costs[i] = -1;
      continue;
    }
    costs[i] = add * 1024 + rarity * 16 + distinct;
    buckets[costs[i]]++;
    eligible++;
  }

  // Take the cheapest `keep` without sorting everything.
  let limit = 0, taken = 0;
  while (limit < buckets.length && taken < keep) taken += buckets[limit++];
  const best = [];
  for (let i = 0; i < n; i++) if (costs[i] >= 0 && costs[i] < limit) best.push(i);
  best.sort((a, b) => costs[a] - costs[b] || a - b);
  best.length = Math.min(best.length, keep);

  let bestAdd = 0, closest = 0;
  if (best.length) {
    bestAdd = costs[best[0]] >> 10;
    for (let c = bestAdd * 1024; c < (bestAdd + 1) * 1024; c++) closest += buckets[c];
  }

  const recipes = best.map(i => {
    const recipe = Array.from(packed.subarray(i * 8, i * 8 + 8));
    const left = have.slice();
    const add = [];
    for (const p of recipe) {
      if (left[p] > 0) left[p]--;
      else add.push(p);
    }
    const drop = [];
    for (const p of bag) {
      if (left[p] > 0) {
        left[p]--;
        drop.push(p);
      }
    }
    return { recipe, add, drop };
  });
  return { recipes, eligible, closest, bestAdd };
}
