import assert from 'node:assert/strict';
import data from '../js/data.js';
import { HEALTH_UPS } from '../js/collections.js';
import { craft, bagScore, PICKUPS } from '../js/crafting.js';
import { findLowestCosts, findRecipes } from '../js/finder.js';

// Compare batch minima to the independent exhaustive single-target finder.
// Covers both versions, zero-value ingredients, fixed recipes and run filters.
for (const [versionKey, seed, targets, opts, excluded] of [
  ['rep', 1302889765, [22, 182, 177], {}, []],
  ['repplus', 987654321, [25, 219, 619], { greed: true, sacredOrb: true }, [29, 17, 25]],
]) {
  const version = data.versions[versionKey];
  const actual = findLowestCosts(version, seed, targets, opts, excluded);
  for (const entry of actual) {
    const { fixed, packed } = findRecipes(version, seed, entry.id, opts);
    let minimum = Infinity;
    const consider = recipe => {
      if (!recipe.some(p => excluded.includes(p))) minimum = Math.min(minimum, bagScore(recipe));
    };
    fixed.forEach(consider);
    for (let i = 0; i < packed.length; i += 8) consider(Array.from(packed.subarray(i, i + 8)));
    assert.equal(entry.score, minimum === Infinity ? null : minimum, `${versionKey} minimum for ${entry.id}`);
    if (entry.recipe) {
      assert.equal(bagScore(entry.recipe), entry.score);
      assert.equal(craft(version, seed, entry.recipe, opts).candidates[0], entry.id);
      assert.ok(entry.recipe.every(p => !excluded.includes(p)));
    }
  }
  console.log(`${versionKey}: batch minimum values match exhaustive lookup (${targets.join(', ')})`);
}

// A small palette permits a completely independent craft()-based enumeration,
// including the exact floating-point draws and fixed-recipe overrides.
for (const [versionKey, opts] of [['rep', {}], ['repplus', { keeper: true, goldenNo: true }]]) {
  const version = data.versions[versionKey], seed = 2345678901;
  const allowed = [1, 4, 6, 8, 29];
  const excluded = PICKUPS.flatMap((p, id) => p && !allowed.includes(id) ? [id] : []);
  const oracle = new Map();
  function visit(bag, from) {
    if (bag.length === 8) {
      const id = craft(version, seed, bag, opts).candidates[0];
      oracle.set(id, Math.min(oracle.get(id) ?? Infinity, bagScore(bag)));
      return;
    }
    for (let i = from; i < allowed.length; i++) visit([...bag, allowed[i]], i);
  }
  visit([], 0);
  const targets = [...new Set([...oracle.keys(), 9999])];
  for (const entry of findLowestCosts(version, seed, targets, opts, excluded)) {
    assert.equal(entry.score, oracle.get(entry.id) ?? null, `${versionKey} independent oracle for ${entry.id}`);
    assert.equal(craft(version, seed, entry.recipe, opts).candidates[0], entry.id);
  }
  console.log(`${versionKey}: all ${oracle.size} reachable items match independent craft() enumeration`);
}

const noPickups = PICKUPS.flatMap((p, id) => p ? [id] : []);
assert.deepEqual(findLowestCosts(data.versions.rep, 1, [22], {}, noPickups), [{ id: 22, score: null, recipe: null }]);
assert.deepEqual(findLowestCosts(data.versions.rep, 1, [], {}), []);
for (const [id, hp] of Object.entries(HEALTH_UPS)) {
  assert.ok(data.names[id] && data.sprites[id], `missing item data for health upgrade ${id}`);
  assert.ok(Number.isInteger(hp) && hp >= 1 && hp <= 3);
}
console.log('Collection metadata and empty/unavailable cases passed.');
