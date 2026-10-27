import assert from 'node:assert/strict';
import data from '../js/data.js';
import { PROJECT_FAVORITES } from '../js/project-favorites.js';
import { getFavoriteIds, toggleFavorite, serializeProjectFavorites, parseProjectFavorites, favoriteStateFromPreset } from '../js/collections.js';
import { itemName } from '../js/localization.js';

assert.equal(new Set(PROJECT_FAVORITES).size, PROJECT_FAVORITES.length, 'project defaults must be unique');
for (const id of PROJECT_FAVORITES) assert.ok(Number.isInteger(id) && data.names[id], `invalid preset ID ${id}`);

const preset = [619, 182];
const original = { favorites: [182, 199], useProjectFavorites: true, excludedProjectFavorites: [] };
assert.deepEqual(getFavoriteIds(original, preset), [182, 199, 619], 'merge and deduplicate sources');
assert.deepEqual(getFavoriteIds({ ...original, useProjectFavorites: false }, preset), [182, 199], 'off preserves personal overlaps');

let state = { favorites: [199], useProjectFavorites: true, excludedProjectFavorites: [] };
state = { ...state, ...toggleFavorite(state, 619, preset) };
assert.deepEqual(getFavoriteIds(state, preset), [199, 182], 'unstar hides a project favorite locally');
assert.deepEqual(state.favorites, [199], 'project items are not copied into personal favorites');
state = { ...state, ...toggleFavorite(state, 619, preset) };
assert.deepEqual(state.excludedProjectFavorites, [], 're-star restores the preset');
assert.deepEqual(state.favorites, [199]);

state = { ...state, useProjectFavorites: false };
state = { ...state, ...toggleFavorite(state, 619, preset) };
assert.deepEqual(state.favorites, [199, 619], 'starring with presets off creates a personal favorite');
assert.deepEqual(getFavoriteIds(state, preset), [199, 619]);
const saved = JSON.parse(JSON.stringify(state));
assert.deepEqual(getFavoriteIds(saved, preset), [199, 619], 'settings and personal stars survive persistence');
assert.deepEqual(getFavoriteIds({ ...saved, useProjectFavorites: true }, preset), [199, 619, 182]);

state = { ...original, ...toggleFavorite(original, 182, preset) };
assert.deepEqual(getFavoriteIds(state, preset), [199, 619], 'unstar removes overlaps from both visible sources');
assert.deepEqual(getFavoriteIds({ ...state, useProjectFavorites: false }, preset), [199]);
assert.deepEqual(original.favorites, [182, 199], 'toggle does not mutate input');
assert.deepEqual(preset, [619, 182], 'toggle does not modify the project file data');
assert.deepEqual(getFavoriteIds({}, []), []);

const generated = serializeProjectFavorites([619, 182, 619], itemName);
const imported = await import('data:text/javascript;base64,' + Buffer.from(generated).toString('base64'));
assert.deepEqual(imported.PROJECT_FAVORITES, [182, 619], 'generated file round-trips with unique IDs');
assert.match(generated, /182, \/\/ 圣心/);
assert.match(generated, /619, \/\/ 长子名分/);
const empty = await import('data:text/javascript;base64,' + Buffer.from(serializeProjectFavorites([])).toString('base64'));
assert.deepEqual(empty.PROJECT_FAVORITES, [], 'empty collections can be saved');
const escaped = serializeProjectFavorites([182], () => 'name\nthrow new Error("bad")\u2028next');
const safe = await import('data:text/javascript;base64,' + Buffer.from(escaped).toString('base64'));
assert.deepEqual(safe.PROJECT_FAVORITES, [182], 'item names cannot break generated JS');
assert.throws(() => serializeProjectFavorites(['182']), /Invalid favorite ID/);
assert.throws(() => serializeProjectFavorites([NaN]), /Invalid favorite ID/);
assert.deepEqual(parseProjectFavorites(generated, id => !!data.names[id]), [182, 619], 'download/import round trip');
assert.deepEqual(parseProjectFavorites('\uFEFF// 旧版备份\r\nexport const PROJECT_FAVORITES = [\r\n  219, // 旧绷带\r\n  219,\r\n  204, // 挎包\r\n];\r\n'), [219, 204], 'legacy exports, BOM, CRLF and duplicates');
assert.deepEqual(parseProjectFavorites(serializeProjectFavorites([])), []);
assert.throws(() => parseProjectFavorites('export const PROJECT_FAVORITES = [182]; globalThis.executed = true;'), /格式不正确/);
assert.throws(() => parseProjectFavorites('export const PROJECT_FAVORITES = [alert(1)];'), /格式不正确/);
assert.throws(() => parseProjectFavorites('export const PROJECT_FAVORITES = ["182"];'), /无效/);
assert.throws(() => parseProjectFavorites('export const PROJECT_FAVORITES = [9999];', id => !!data.names[id]), /未知/);
assert.throws(() => parseProjectFavorites('unrelated file'), /格式不正确/);
const restored = { ...original, ...favoriteStateFromPreset([219, 182], preset) };
assert.deepEqual(getFavoriteIds(restored, preset), [219, 182], 'import replaces the exact list with presets enabled');
assert.deepEqual(getFavoriteIds(JSON.parse(JSON.stringify(restored)), preset), [219, 182], 'import survives refresh');
assert.deepEqual(getFavoriteIds({ ...restored, useProjectFavorites: false }, preset), [219, 182]);
assert.deepEqual(getFavoriteIds({ ...original, ...favoriteStateFromPreset([], preset) }, preset), [], 'empty preset clears current favorites');
console.log('Project defaults, source toggle, deduplication, personal overrides and persistence passed.');
console.log('Generated preset files are importable, deduplicated and include readable item names.');
console.log('Legacy preset parsing, exact restoration and invalid-file rejection passed.');
