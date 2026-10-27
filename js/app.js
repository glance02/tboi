import data from './data.js?v=12';
import { itemName, itemQuote, matchesItem, startsWithItem, compareItems, wikiUrl } from './localization.js?v=12';
import { PICKUPS, craft, parseSeed, normalizeSeed, bagScore } from './crafting.js?v=12';
import { recipeCost, rankRecipes, packRecipes, TOTAL_BAGS } from './finder.js?v=12';
import { HEALTH_UPS, getFavoriteIds, toggleFavorite, serializeProjectFavorites, parseProjectFavorites, favoriteStateFromPreset } from './collections.js?v=12';

const PICKUP_GROUPS = [
  ['心', [1, 2, 3, 4, 5, 6, 7]],
  ['硬币', [8, 9, 10, 11, 26]],
  ['钥匙', [12, 13, 14, 25]],
  ['炸弹', [15, 16, 17]],
  ['电池', [18, 19, 20, 28]],
  ['其他', [21, 22, 27, 23, 24, 29]],
];

const MODIFIERS = [
  ['lateStage', '子宫及之后的楼层', '第四章起，无法再合成消失的胞胎（贪婪模式除外）。'],
  ['greed', '贪婪／究极贪婪模式', '排除贪婪模式中禁用的道具。'],
  ['daily', '每日挑战', '排除每日挑战中禁用的道具。'],
  ['challenge', '挑战模式', '排除挑战模式中禁用的道具。'],
  ['keeper', '本局有店主或里店主', '联机条件：排除店主无法使用的道具。'],
  ['lostBR', '本局有持有长子名分的游魂', '联机条件：排除游魂无法使用的道具。'],
  ['taintedLost', '本局有里游魂', '联机条件：仅保留进攻型道具，并跳过部分低品质道具。'],
  ['sacredOrb', '持有十字圣球', '排除品质 0、1 的道具，并跳过三分之一的品质 2 道具。'],
  ['goldenNo', '持有金色或叠加的“不！”饰品', '排除品质 0 的道具。'],
];

// Turned off by "Rare ones off" in settings: cracked key, giga bomb, mega and golden
// batteries, golden pill, dice shard, poop.
const RARE_PICKUPS = [25, 17, 20, 28, 27, 24, 29];

const STORAGE_KEY = 'tcain-calculator';
const $ = id => document.getElementById(id);

const state = {
  seedText: '',
  version: 'rep',
  bag: [],
  opts: {},
  previewSort: 'name',
  findTarget: null,
  excluded: [], // pickup ids left out of suggestions
  compactPicker: false,
  favorites: [],
  useProjectFavorites: true,
  excludedProjectFavorites: [],
  collectionTab: 'health',
  ...loadState(),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return {};
    return {
      seedText: typeof saved.seedText === 'string' ? saved.seedText : '',
      version: saved.version in data.versions ? saved.version : 'rep',
      bag: Array.isArray(saved.bag) ? saved.bag.filter(id => PICKUPS[id]).slice(0, 8) : [],
      opts: saved.opts && typeof saved.opts === 'object' ? saved.opts : {},
      previewSort: saved.previewSort === 'quality' ? 'quality' : 'name',
      findTarget: Number.isInteger(saved.findTarget) && data.names[saved.findTarget] ? saved.findTarget : null,
      excluded: Array.isArray(saved.excluded) ? saved.excluded.filter(id => PICKUPS[id]) : [],
      compactPicker: saved.compactPicker === true,
      favorites: Array.isArray(saved.favorites)
        ? [...new Set(saved.favorites.filter(id => Number.isInteger(id) && data.names[id]))] : [],
      useProjectFavorites: saved.useProjectFavorites !== false,
      excludedProjectFavorites: Array.isArray(saved.excludedProjectFavorites)
        ? [...new Set(saved.excludedProjectFavorites.filter(id => Number.isInteger(id) && data.names[id]))] : [],
      collectionTab: saved.collectionTab === 'favorites' ? 'favorites' : 'health',
    };
  } catch {
    return {};
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode); the calculator still works.
  }
}

// ---------- sprites ----------

function pickupIcon(id, size = 32) {
  const el = document.createElement('span');
  el.className = 'pickup-icon';
  el.style.backgroundPosition = `${-(id % 8) * size}px ${-Math.floor(id / 8) * size}px`;
  return el;
}

function itemIcon(id, size = 64) {
  const el = document.createElement('span');
  el.className = 'item-icon' + (size === 64 ? '' : ' small');
  const pos = data.sprites[id];
  if (pos) {
    el.style.backgroundPosition = `${-pos[0] * size}px ${-pos[1] * size}px`;
  } else {
    el.classList.add('missing');
    el.textContent = '?';
  }
  el.setAttribute('aria-hidden', 'true');
  return el;
}



// ---------- seed + version ----------

const seedInput = $('seed');
seedInput.value = normalizeSeed(state.seedText);

seedInput.addEventListener('input', () => {
  // Reformat as "XXXX XXXX" while keeping the caret after the same character.
  const caret = seedInput.selectionStart ?? seedInput.value.length;
  const charsBeforeCaret = seedInput.value.slice(0, caret).replace(/[^a-z0-9]/gi, '').length;
  const formatted = normalizeSeed(seedInput.value).slice(0, 9);
  seedInput.value = formatted;
  let pos = 0;
  for (let seen = 0; pos < formatted.length && seen < charsBeforeCaret; pos++) {
    if (formatted[pos] !== ' ') seen++;
  }
  seedInput.setSelectionRange(pos, pos);
  state.seedText = formatted;
  render();
});

for (const button of document.querySelectorAll('[data-version]')) {
  button.addEventListener('click', () => {
    state.version = button.dataset.version;
    render();
  });
}

// ---------- bag ----------

function addPickup(id) {
  // Like the real bag: once it holds 8, the oldest pickup falls out.
  if (state.bag.length === 8) state.bag.shift();
  state.bag.push(id);
  render();
}

$('clear').addEventListener('click', () => {
  state.bag = [];
  render();
});

function renderBag() {
  const bag = $('bag');
  bag.replaceChildren();
  for (let i = 0; i < 8; i++) {
    const id = state.bag[i];
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'slot' + (id ? ' filled' : '');
    if (id) {
      slot.append(pickupIcon(id));
      slot.title = `移除${PICKUPS[id].name}`;
      slot.setAttribute('aria-label', `移除${PICKUPS[id].name}`);
      slot.addEventListener('click', () => {
        state.bag.splice(i, 1);
        render();
      });
    } else {
      slot.disabled = true;
      slot.setAttribute('aria-label', '空槽位');
    }
    bag.append(slot);
  }
  $('bag-count').textContent = `${state.bag.length}/8`;
  const score = $('bag-score');
  score.hidden = state.bag.length === 0;
  score.textContent = `价值 ${bagScore(state.bag)}`;
}

// ---------- picker ----------

function renderPicker() {
  const picker = $('picker');
  for (const [title, ids] of PICKUP_GROUPS) {
    const group = document.createElement('div');
    group.className = 'group';
    const heading = document.createElement('h3');
    heading.className = 'group-title';
    heading.textContent = title;
    const items = document.createElement('div');
    items.className = 'group-items';
    for (const id of ids) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick';
      button.setAttribute('aria-label', `添加${PICKUPS[id].name}（价值 ${PICKUPS[id].value}）`);
      const name = document.createElement('span');
      name.className = 'pick-name';
      name.textContent = PICKUPS[id].name;
      const icon = document.createElement('span');
      icon.className = 'pick-icon';
      const value = document.createElement('span');
      value.className = 'pick-value';
      value.textContent = PICKUPS[id].value;
      icon.append(pickupIcon(id), value);
      button.append(icon, name);
      button.addEventListener('click', () => addPickup(id));
      items.append(button);
    }
    group.append(heading, items);
    picker.append(group);
  }
}

// ---------- modifiers ----------

function renderModifierList() {
  const list = $('modifier-list');
  for (const [key, label, description] of MODIFIERS) {
    const row = document.createElement('label');
    row.className = 'modifier';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!state.opts[key];
    input.addEventListener('change', () => {
      state.opts[key] = input.checked;
      render();
    });
    const text = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = label;
    const small = document.createElement('small');
    small.textContent = description;
    text.append(strong, small);
    row.append(input, text);
    list.append(row);
  }
}

// ---------- settings ----------

const settings = $('settings');
$('open-settings').addEventListener('click', () => {
  renderSettings();
  settings.showModal();
});
$('close-settings').addEventListener('click', () => settings.close());
// Tapping the backdrop closes the dialog too.
settings.addEventListener('click', event => {
  if (event.target === settings) settings.close();
});

$('compact-picker').addEventListener('change', event => {
  state.compactPicker = event.target.checked;
  render();
});
$('use-project-favorites').addEventListener('change', event => {
  state.useProjectFavorites = event.target.checked;
  $('project-favorites-status').textContent = '';
  render();
});

const PROJECT_FAVORITES_FILE = 'project-favorites.js';

function downloadProjectFavorites() {
  const ids = getFavoriteIds(state);
  const file = new Blob([serializeProjectFavorites(ids, itemName)], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = PROJECT_FAVORITES_FILE;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('project-favorites-status').textContent = `已生成 ${ids.length} 件收藏的预设文件，可通过“导入预设”恢复。`;
}

$('download-project-favorites').addEventListener('click', downloadProjectFavorites);
$('import-project-favorites').addEventListener('click', () => $('import-project-favorites-file').click());
$('import-project-favorites-file').addEventListener('change', async event => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  const button = $('import-project-favorites');
  const status = $('project-favorites-status');
  button.disabled = true;
  try {
    if (file.size > 1024 * 1024) throw new Error('预设文件过大，请选择之前下载的收藏预设。');
    const ids = parseProjectFavorites(await file.text(), id => !!data.names[id]);
    Object.assign(state, favoriteStateFromPreset(ids));
    render();
    status.textContent = `已导入 ${ids.length} 件收藏，已保存在本机。`;
  } catch (error) {
    status.textContent = error.message || '读取预设失败，未修改当前收藏。';
  } finally {
    button.disabled = false;
    input.value = '';
  }
});
$('exclude-none').addEventListener('click', () => {
  state.excluded = [];
  render();
});
$('exclude-rare').addEventListener('click', () => {
  state.excluded = [...RARE_PICKUPS];
  render();
});

const excludeButtons = new Map();

function buildExcludeList() {
  for (const [, ids] of PICKUP_GROUPS) {
    for (const id of ids) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pick exclude';
      const name = document.createElement('span');
      name.className = 'pick-name';
      name.textContent = PICKUPS[id].name;
      button.append(pickupIcon(id), name);
      button.addEventListener('click', () => {
        state.excluded = state.excluded.includes(id) ? state.excluded.filter(p => p !== id) : [...state.excluded, id];
        render();
      });
      excludeButtons.set(id, button);
      $('exclude-list').append(button);
    }
  }
}

function renderSettings() {
  $('compact-picker').checked = state.compactPicker;
  $('use-project-favorites').checked = state.useProjectFavorites;
  $('project-favorites-count').textContent = getFavoriteIds(state).length;
  $('picker').classList.toggle('compact', state.compactPicker);
  for (const [id, button] of excludeButtons) {
    const on = !state.excluded.includes(id);
    button.classList.toggle('off', !on);
    button.setAttribute('aria-pressed', String(on));
    button.title = `${on ? '不再推荐' : '推荐'}${PICKUPS[id].name}`;
  }
}

// ---------- result ----------

function stars(quality) {
  const el = document.createElement('span');
  el.className = 'stars';
  el.textContent = '★'.repeat(quality) + '☆'.repeat(4 - quality);
  el.setAttribute('aria-label', `品质 ${quality}`);
  return el;
}

let lastResultKey = '';

/** Works out what the current bag makes, or why it can't be shown yet. */
function computeOutcome(seed) {
  const missing = 8 - state.bag.length;
  if (missing > 0) {
    return { message: `再添加 ${missing} 个掉落物即可查看合成结果。`, short: `还差 ${missing} 个` };
  }
  if (seed === null && state.seedText.replace(' ', '').length === 8) {
    return { message: '种子无效，请对照暂停界面检查输入。', short: '请检查种子' };
  }
  if (seed === null) return { message: '输入本局种子即可查看合成结果。', short: '输入种子' };
  return craft(data.versions[state.version], seed, state.bag, state.opts);
}

function renderResult(outcome) {
  const box = $('result');
  if (outcome.message) {
    const el = document.createElement('div');
    el.className = 'result-empty';
    el.textContent = outcome.message;
    box.replaceChildren(el);
    lastResultKey = '';
    return;
  }

  const version = data.versions[state.version];
  const { fixed, candidates } = outcome;
  const [id, ...fallbacks] = candidates;

  const main = document.createElement('div');
  main.className = 'result-main';
  const info = document.createElement('div');
  const name = document.createElement('h3');
  name.className = 'result-name';
  name.textContent = itemName(id);
  const quote = document.createElement('p');
  quote.className = 'result-quote';
  quote.textContent = itemQuote(id) || ' ';
  const meta = document.createElement('div');
  meta.className = 'result-meta';
  meta.append(stars(version.items[id][1]));
  if (fixed) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = '固定配方';
    chip.title = '此配方在任意种子下都会产出同一道具';
    meta.append(chip);
  }
  const link = document.createElement('a');
  link.href = wikiUrl(id);
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = '中文维基 ↗';
  meta.append(link);
  info.append(name, quote, meta);
  main.append(itemIcon(id), info);

  const children = [main];
  if (fallbacks.length) {
    const section = document.createElement('div');
    section.className = 'fallbacks';
    section.append(`尚未解锁${itemName(id)}？合成袋会跳过未解锁的道具，改为产出：`);
    const list = document.createElement('ol');
    let previous = id;
    for (const next of fallbacks) {
      const li = document.createElement('li');
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = itemName(next);
      const why = document.createElement('div');
      why.className = 'why';
      why.textContent = `若尚未解锁${itemName(previous)}`;
      text.append(strong, why);
      li.append(itemIcon(next, 40), text);
      list.append(li);
      previous = next;
    }
    section.append(list);
    children.push(section);
  }
  box.replaceChildren(...children);

  // Animate only when the result actually changes.
  const key = candidates.join();
  if (key !== lastResultKey) {
    main.classList.add('result-pop');
    lastResultKey = key;
  }
}

// ---------- preview ----------
// With 6 or 7 pickups in, try every way to fill the bag and list what each one makes.
// 6 pickups means 435 bags to check; at 5 it's 4,495 bags and ~600 distinct items,
// nearly everything in the value range, so the list stops being useful.

const PREVIEW_FROM = 6;
const PREVIEW_PAGE = 10;

/** All multisets of `size` pickup ids from `ids` (ascending), as sorted arrays. */
function pickupCombos(size, ids, from = 0) {
  if (size === 0) return [[]];
  const combos = [];
  for (let i = from; i < ids.length; i++) {
    for (const rest of pickupCombos(size - 1, ids, i)) combos.push([ids[i], ...rest]);
  }
  return combos;
}

let previewCache = { key: '', items: [] };
let previewShowAll = false;

/** Distinct items the bag can still become, each with its easiest completion. */
function previewItems(seed) {
  const key = [state.version, seed, [...state.bag].sort((a, b) => a - b), JSON.stringify(state.opts), state.excluded].join('|');
  if (previewCache.key === key) return previewCache.items;

  const version = data.versions[state.version];
  const allowed = PICKUPS.flatMap((p, id) => p && !state.excluded.includes(id) ? [id] : []);
  const byItem = new Map();
  for (const add of pickupCombos(8 - state.bag.length, allowed)) {
    const id = craft(version, seed, [...state.bag, ...add], state.opts).candidates[0];
    const cost = recipeCost(add);
    const entry = byItem.get(id);
    if (!entry) byItem.set(id, { id, add, cost, ways: 1 });
    else {
      entry.ways++;
      if (cost < entry.cost) Object.assign(entry, { add, cost });
    }
  }
  const items = [...byItem.values()];
  previewCache = { key, items };
  return items;
}

/** Sorts preview entries by name, or best quality first (then by name). */
function sortPreview(items, by) {
  const version = data.versions[state.version];
  const byName = (a, b) => compareItems(a.id, b.id);
  if (by !== 'quality') return [...items].sort(byName);
  return [...items].sort((a, b) => version.items[b.id][1] - version.items[a.id][1] || byName(a, b));
}

function renderPreview(seed) {
  const box = $('preview');
  const show = state.bag.length >= PREVIEW_FROM && state.bag.length < 8;
  box.hidden = !show;
  if (!show) {
    previewShowAll = false;
    return;
  }

  const list = $('preview-list');
  const more = $('preview-more');
  const search = $('preview-search');
  const missing = 8 - state.bag.length;
  if (seed === null) {
    $('preview-count').textContent = '';
    $('preview-note').textContent = '输入有效种子，查看补齐剩余掉落物后可合成的道具。';
    search.hidden = true;
    more.hidden = true;
    list.replaceChildren();
    return;
  }

  const version = data.versions[state.version];
  const items = sortPreview(previewItems(seed), state.previewSort);
  const query = search.value.trim().toLowerCase();
  const matches = query ? items.filter(e => matchesItem(e.id, query)) : items;
  const shown = previewShowAll || query ? matches : matches.slice(0, PREVIEW_PAGE);

  search.hidden = false;
  $('preview-count').textContent = `${items.length} 种道具`;
  $('preview-note').textContent =
    `补齐剩余 ${missing} 个掉落物的所有可能结果`
    + (state.excluded.length ? '（已排除设置中关闭的掉落物）' : '')
    + '。点击即可添加材料。假定所有道具均已解锁。';

  const rows = shown.map(entry => {
    const li = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'preview-row';
    const addNames = entry.add.map(p => PICKUPS[p].name).join('、');
    row.setAttribute('aria-label', `添加${addNames}，合成${itemName(entry.id)}`);
    const info = document.createElement('span');
    info.className = 'preview-info';
    const name = document.createElement('strong');
    name.textContent = itemName(entry.id);
    info.append(name, stars(version.items[entry.id][1]));
    if (entry.ways > 1) {
      const ways = document.createElement('span');
      ways.className = 'preview-ways';
      ways.textContent = `${entry.ways} 种配方`;
      info.append(ways);
    }
    const add = document.createElement('span');
    add.className = 'preview-add';
    add.title = `添加${addNames}`;
    add.append('+', ...entry.add.map(p => pickupIcon(p)));
    row.append(itemIcon(entry.id, 40), info, add);
    row.addEventListener('click', () => {
      state.bag.push(...entry.add);
      search.value = '';
      render();
    });
    li.append(row);
    return li;
  });
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'preview-empty';
    li.textContent = `可合成的道具中没有与“${search.value.trim()}”匹配的结果。`;
    rows.push(li);
  }
  list.replaceChildren(...rows);

  more.hidden = shown.length >= matches.length;
  more.textContent = `显示全部 ${matches.length} 种道具`;
}

$('preview-search').addEventListener('input', () => renderPreview(parseSeed(state.seedText)));
for (const button of document.querySelectorAll('[data-sort]')) {
  button.addEventListener('click', () => {
    state.previewSort = button.dataset.sort;
    render();
  });
}
$('preview-more').addEventListener('click', () => {
  previewShowAll = true;
  renderPreview(parseSeed(state.seedText));
});

// ---------- item finder ----------
// Pick an item and search every possible bag for the ones that make it on this seed.
// The search covers ~30 million bags, so it runs in a worker and takes a few seconds.
// It returns every recipe, so they can be re-ranked against the bag without searching again.

const FINDER_KEEP = 50;
const FINDER_PAGE = 10;
// Pools the bag can draw from (see itemWeights in crafting.js).
const CRAFT_POOLS = [0, 1, 2, 3, 4, 5, 7, 8, 9, 12, 26];

const craftableCache = {};
/** Ids of every item the bag can make in this version. */
function craftableItems(versionKey) {
  if (!craftableCache[versionKey]) {
    const version = data.versions[versionKey];
    const ids = new Set(Object.values(version.fixed));
    for (const pool of CRAFT_POOLS) for (const [id] of version.pools[pool]) ids.add(id);
    craftableCache[versionKey] = [...ids].filter(id => data.names[id]).sort((a, b) => compareItems(a, b));
  }
  return craftableCache[versionKey];
}

let finderWorker = null;
let finderJob = null; // { key, progress }
let finderResult = { key: '', result: null };
let finderShowAll = false;

function startFinderSearch(key, seed) {
  if (finderJob?.key === key) return;
  finderWorker?.terminate();
  const worker = new Worker(new URL('./finder-worker.js?v=12', import.meta.url), { type: 'module' });
  finderWorker = worker;
  finderJob = { key, progress: 0 };
  const finish = result => {
    if (finderWorker !== worker) return;
    finderResult = { key, result };
    stopFinderSearch();
    renderFinder(parseSeed(state.seedText));
  };
  worker.onmessage = ({ data: message }) => {
    if (finderWorker !== worker) return;
    if (message.result) return finish(message.result);
    finderJob.progress = message.progress;
    renderFinder(parseSeed(state.seedText));
  };
  worker.onerror = () => finish({ error: true });
  worker.postMessage({ version: state.version, seed, target: state.findTarget, opts: state.opts });
}

function stopFinderSearch() {
  finderWorker?.terminate();
  finderWorker = null;
  finderJob = null;
}

function selectFindTarget(id) {
  state.findTarget = id;
  finderShowAll = false;
  $('finder-search').value = '';
  $('finder-matches').replaceChildren();
  render();
  $('finder-target').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- health upgrades + personal collection ----------

let collectionExpanded = false;
let collectionJob = null;
const collectionCache = new Map();
let collectionCosts = null;

function favoriteButton(id) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'favorite-button';
  button.dataset.favorite = id;
  const saved = getFavoriteIds(state).includes(id);
  button.textContent = saved ? '★' : '☆';
  button.setAttribute('aria-pressed', String(saved));
  button.title = `${saved ? '取消收藏' : '收藏'}${itemName(id)}`;
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', () => {
    const inCollection = !!button.closest('.collection');
    Object.assign(state, toggleFavorite(state, id));
    $('project-favorites-status').textContent = '';
    saveState();
    renderCollection(parseSeed(state.seedText));
    renderFinder(parseSeed(state.seedText));
    // Preserve keyboard focus when the card survives a collection update.
    const scope = inCollection ? $('collection-list') : document.querySelector('.finder');
    (scope.querySelector(`[data-favorite="${id}"]`) ?? $('collection-favorites')).focus({ preventScroll: true });
  });
  return button;
}

function stopCollectionSearch() {
  if (!collectionJob) return;
  collectionJob.worker.terminate();
  collectionCache.delete(collectionJob.key);
  collectionJob = null;
}

function collectionCostEntries(seed) {
  if (seed === null) {
    stopCollectionSearch();
    return null;
  }
  const available = new Set(craftableItems(state.version));
  const targets = [...new Set([...Object.keys(HEALTH_UPS).map(Number), ...getFavoriteIds(state), state.findTarget])]
    .filter(id => available.has(id)).sort((a, b) => a - b);
  const key = JSON.stringify([state.version, seed, state.opts, [...state.excluded].sort((a, b) => a - b), targets]);
  if (collectionJob && collectionJob.key !== key) stopCollectionSearch();
  if (collectionCache.has(key)) return collectionCache.get(key);
  const entry = { pending: true, entries: new Map(), progress: null, error: false };
  collectionCache.set(key, entry);
  while (collectionCache.size > 6) collectionCache.delete(collectionCache.keys().next().value);
  const worker = new Worker(new URL('./costs-worker.js?v=12', import.meta.url), { type: 'module' });
  collectionJob = { key, worker };
  worker.onmessage = ({ data: message }) => {
    if (collectionJob?.worker !== worker) return;
    if (message.result) {
      entry.pending = false;
      entry.entries = new Map(message.result.map(item => [item.id, item]));
      worker.terminate();
      collectionJob = null;
    } else entry.progress = message.progress;
    renderCollection(parseSeed(state.seedText));
  };
  worker.onerror = () => {
    if (collectionJob?.worker !== worker) return;
    entry.pending = false;
    entry.error = true;
    worker.terminate();
    collectionJob = null;
    renderCollection(parseSeed(state.seedText));
  };
  worker.postMessage({ version: state.version, seed, targets, opts: state.opts, excluded: state.excluded });
  return entry;
}

function renderLowestRecipe() {
  const box = $('finder-cheapest');
  const entry = collectionCosts?.entries.get(state.findTarget);
  box.replaceChildren();
  if (!entry?.recipe) return;
  const header = document.createElement('div');
  header.className = 'collection-heading';
  const title = document.createElement('h3');
  title.textContent = '最低价值配方';
  const cost = document.createElement('span');
  cost.className = 'chip cost-chip';
  cost.textContent = `材料总价值 ${entry.score}`;
  header.append(title, cost);
  const ranked = rankRecipes(packRecipes([entry.recipe]), state.bag, [], 1);
  box.append(header, recipeList(ranked.recipes));
}

function renderCollection(seed) {
  collectionCosts = collectionCostEntries(seed);
  const available = new Set(craftableItems(state.version));
  const favorites = getFavoriteIds(state);
  const ids = (state.collectionTab === 'health' ? Object.keys(HEALTH_UPS).map(Number) : favorites)
    .filter(id => available.has(id));
  const entries = collectionCosts?.entries;
  ids.sort((a, b) => (entries?.get(a)?.score ?? Infinity) - (entries?.get(b)?.score ?? Infinity) || compareItems(a, b));
  $('favorite-count').textContent = favorites.length;
  for (const tab of document.querySelectorAll('[data-collection]')) {
    const selected = tab.dataset.collection === state.collectionTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  $('collection-panel').setAttribute('aria-labelledby', `collection-${state.collectionTab}`);
  const status = $('collection-status');
  if (!ids.length) {
    status.textContent = favorites.length && state.collectionTab === 'favorites'
      ? '收藏的道具在当前版本中无法合成。可切换游戏版本，或搜索其他道具加入收藏。'
      : '还没有收藏。搜索喜欢的道具，点击 ☆，就能在这里快速找到。';
  } else if (!collectionCosts) status.textContent = '输入本局种子，自动计算最低合成价值并排序。';
  else if (collectionCosts.error) status.textContent = '价值计算失败，请刷新页面重试。';
  else if (collectionCosts.pending) {
    const progress = collectionCosts.progress;
    status.textContent = '正在计算当前种子的最低材料价值…' + (progress ? ` 已找到 ${progress.found}/${progress.total} 件。` : '');
  } else status.textContent = `${ids.length} 件道具 · 点击查配方，☆ 加入收藏`;
  const rows = ids.map(id => {
    const li = document.createElement('li');
    li.className = 'collection-card' + (state.findTarget === id ? ' selected' : '');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'collection-item';
    const entry = entries?.get(id);
    const costText = entry?.score != null ? `最低价值 ${entry.score}`
      : collectionCosts?.pending ? '计算中…' : collectionCosts?.error ? '计算失败' : seed === null ? '待输入种子' : '无可用配方';
    button.setAttribute('aria-label', `查询${itemName(id)}的配方，${costText}`);
    button.setAttribute('aria-pressed', String(state.findTarget === id));
    const name = document.createElement('strong');
    name.className = 'collection-name';
    name.textContent = itemName(id);
    const effect = document.createElement('span');
    effect.className = 'collection-effect';
    effect.textContent = HEALTH_UPS[id] ? `+${HEALTH_UPS[id]} 心上限` : `品质 ${data.versions[state.version].items[id][1]}`;
    const cost = document.createElement('span');
    cost.className = 'collection-cost' + (entry?.score != null ? ' known' : '');
    cost.textContent = costText;
    button.append(itemIcon(id, 40), name, effect, cost);
    button.addEventListener('click', () => selectFindTarget(id));
    li.append(button, favoriteButton(id));
    return li;
  });
  const list = $('collection-list');
  list.replaceChildren(...rows);
  list.classList.toggle('expanded', collectionExpanded);
  const more = $('collection-more');
  more.hidden = ids.length <= (narrowScreen.matches ? 6 : 8);
  more.textContent = collectionExpanded ? '收起道具' : `展开全部 ${ids.length} 件`;
  more.setAttribute('aria-expanded', String(collectionExpanded));
  renderLowestRecipe();
}

for (const tab of document.querySelectorAll('[data-collection]')) {
  tab.addEventListener('click', () => {
    state.collectionTab = tab.dataset.collection;
    collectionExpanded = false;
    renderCollection(parseSeed(state.seedText));
    saveState();
  });
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? $('collection-health') : event.key === 'End' ? $('collection-favorites')
      : $(state.collectionTab === 'health' ? 'collection-favorites' : 'collection-health');
    next.click();
    next.focus();
  });
}
$('collection-more').addEventListener('click', () => {
  collectionExpanded = !collectionExpanded;
  renderCollection(parseSeed(state.seedText));
});

function renderFinderMatches() {
  const list = $('finder-matches');
  const raw = $('finder-search').value.trim();
  const query = raw.toLowerCase();
  if (!query) {
    list.replaceChildren();
    return;
  }
  const version = data.versions[state.version];
  const ids = craftableItems(state.version).filter(id => matchesItem(id, query));
  // Names that start with the query first.
  ids.sort((a, b) => startsWithItem(b, query) - startsWithItem(a, query));
  const rows = ids.slice(0, 8).map(id => {
    const li = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'preview-row';
    const info = document.createElement('span');
    info.className = 'preview-info';
    const name = document.createElement('strong');
    name.textContent = itemName(id);
    info.append(name, stars(version.items[id][1]));
    row.append(itemIcon(id, 40), info);
    row.addEventListener('click', () => selectFindTarget(id));
    const match = document.createElement('div');
    match.className = 'finder-match';
    match.append(row, favoriteButton(id));
    li.append(match);
    return li;
  });
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'preview-empty';
    li.textContent = `没有与“${raw}”匹配的可合成道具。`;
    rows.push(li);
  }
  list.replaceChildren(...rows);
}

/** Pickup icons, with ×n for repeats. */
function pickupCounts(pickups) {
  const counts = new Map();
  for (const p of pickups) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts].map(([p, n]) => {
    const group = document.createElement('span');
    group.className = 'recipe-pickup';
    group.title = PICKUPS[p].name;
    group.append(pickupIcon(p));
    if (n > 1) group.append(`×${n}`);
    return group;
  });
}

const pickupNames = pickups => pickups.map(p => PICKUPS[p].name).join('、');

/** One recipe; with pickups in the bag, shows what to add (and drop) instead of the whole recipe. */
function recipeRow({ recipe, add, drop }) {
  const li = document.createElement('li');
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'preview-row recipe-row';
  const icons = document.createElement('span');
  icons.className = 'recipe-icons';
  if (!state.bag.length) {
    row.setAttribute('aria-label', `将${pickupNames(recipe)}放入合成袋`);
    icons.append(...pickupCounts(recipe));
  } else {
    const parts = [];
    if (add.length) parts.push(`添加${pickupNames(add)}`);
    if (drop.length) parts.push(`移除${pickupNames(drop)}`);
    row.setAttribute('aria-label', parts.length ? parts.join('、') : '当前合成袋已可合成此道具');
    if (add.length) icons.append(sign('+'), ...pickupCounts(add));
    if (drop.length) icons.append(sign('−', 'drop'), ...pickupCounts(drop).map(el => (el.classList.add('drop'), el)));
    if (!add.length && !drop.length) icons.append('当前合成袋');
  }
  const use = document.createElement('span');
  use.className = 'recipe-use';
  use.textContent = '使用';
  row.append(icons, use);
  row.addEventListener('click', () => {
    // Keep the bag's order, drop what isn't needed and put the new pickups after it.
    const bag = [...state.bag];
    for (const p of drop) bag.splice(bag.lastIndexOf(p), 1);
    state.bag = [...bag, ...add];
    render();
    document.querySelector('.bag-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  li.append(row);
  return li;
}

function sign(text, extra = '') {
  const el = document.createElement('span');
  el.className = 'recipe-sign ' + extra;
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

let rankCache = { key: '', fixed: null, seeded: null };

/** Fixed and seeded recipes ranked against the current bag and settings. */
function rankedFinder(result) {
  const key = [finderResult.key, state.bag, state.excluded].join('|');
  if (rankCache.key !== key) {
    rankCache = {
      key,
      fixed: rankRecipes(packRecipes(result.fixed), state.bag, state.excluded, Infinity),
      seeded: rankRecipes(result.packed, state.bag, state.excluded, FINDER_KEEP),
    };
  }
  return rankCache;
}

function finderNote(text) {
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = text;
  return p;
}

function finderHeading(text) {
  const h = document.createElement('h3');
  h.className = 'finder-subhead';
  h.textContent = text;
  return h;
}

function recipeList(recipes) {
  const list = document.createElement('ol');
  list.className = 'preview-list';
  list.append(...recipes.map(recipeRow));
  return list;
}

function renderFinder(seed) {
  const target = state.findTarget;
  const results = $('finder-results');
  $('finder-pick').hidden = target !== null;
  $('finder-target').hidden = target === null;
  if (target === null) {
    stopFinderSearch();
    results.replaceChildren(finderNote('查询当前种子下指定道具的所有配方，优先显示材料容易收集的配方。'));
    renderFinderMatches();
    return;
  }

  const version = data.versions[state.version];
  const head = document.createElement('div');
  head.className = 'finder-head';
  const info = document.createElement('div');
  info.className = 'preview-info';
  const name = document.createElement('strong');
  name.textContent = itemName(target);
  info.append(name, stars(version.items[target][1]));
  const change = document.createElement('button');
  change.type = 'button';
  change.className = 'btn-ghost';
  change.textContent = '更换';
  change.addEventListener('click', () => {
    state.findTarget = null;
    render();
    $('finder-search').focus();
  });
  head.append(itemIcon(target, 40), info, favoriteButton(target), change);
  $('finder-target').replaceChildren(head);

  if (!craftableItems(state.version).includes(target)) {
    stopFinderSearch();
    results.replaceChildren(finderNote(`在${version.label.replace('Repentance', '忏悔')}中，合成袋无法产出${itemName(target)}。`));
    return;
  }
  if (seed === null) {
    stopFinderSearch();
    // Recipes depend on the seed, so point at the seed box; the search starts once it's valid.
    const box = document.createElement('div');
    box.className = 'finder-progress finder-needs-seed';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn-ghost';
    go.textContent = '输入种子';
    go.addEventListener('click', () => {
      seedInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      seedInput.focus({ preventScroll: true });
    });
    box.append(finderNote('在上方输入本局种子后，将自动开始搜索。'), go);
    results.replaceChildren(box);
    return;
  }

  const key = [state.version, seed, target, JSON.stringify(state.opts)].join('|');
  if (finderResult.key !== key) {
    startFinderSearch(key, seed);
    const pct = Math.min(100, Math.round((finderJob.progress / TOTAL_BAGS) * 100));
    const status = document.createElement('div');
    status.className = 'finder-progress';
    const bar = document.createElement('progress');
    bar.max = 100;
    bar.value = pct;
    bar.setAttribute('aria-label', '配方搜索进度');
    status.append(finderNote(`正在检查全部 ${TOTAL_BAGS.toLocaleString('zh-CN')} 种材料组合… ${pct}%`), bar);
    results.replaceChildren(status);
    return;
  }

  const result = finderResult.result;
  if (result.error) {
    results.replaceChildren(finderNote('搜索时出现错误，请尝试刷新页面。'));
    return;
  }
  const { fixed, seeded } = rankedFinder(result);
  const children = [];
  if (fixed.recipes.length) {
    children.push(finderHeading('固定配方，适用于任意种子'), recipeList(fixed.recipes));
  }
  if (!result.total) {
    children.push(finderHeading('当前种子下无可用配方'), finderNote(Object.values(state.opts).some(Boolean)
      ? '当前种子和特殊条件下，没有能合成此道具的配方。可尝试关闭部分特殊条件。'
      : '当前种子下，没有能合成此道具的配方。'));
    results.replaceChildren(...children);
    return;
  }
  const hidden = result.total - seeded.eligible;
  const hiddenNote = hidden
    ? ` 另有 ${hidden.toLocaleString('zh-CN')} 种配方需要使用设置中已关闭的掉落物。`
    : '';
  if (!seeded.eligible) {
    children.push(finderHeading(`当前种子下有 ${result.total.toLocaleString('zh-CN')} 种配方`),
      finderNote('所有配方都需要使用设置中已关闭的掉落物。'));
    results.replaceChildren(...children);
    return;
  }

  const recipeCount = n => `${n.toLocaleString('zh-CN')} 种配方`;
  const bagSize = state.bag.length;
  const kept = 8 - seeded.bestAdd;
  if (!bagSize) {
    children.push(
      finderHeading(`当前种子下有 ${recipeCount(seeded.eligible)}`),
      finderNote('优先显示材料容易收集的配方，点击即可填入合成袋。假定所有道具均已解锁。' + hiddenNote),
    );
  } else if (seeded.bestAdd === 0) {
    children.push(finderHeading('当前合成袋可合成此道具'));
  } else if (kept === bagSize) {
    children.push(
      finderHeading(`${recipeCount(seeded.closest)}可利用袋内全部材料`),
      finderNote(`再添加 ${seeded.bestAdd} 个掉落物即可合成，优先显示容易收集的材料。点击即可添加。` + hiddenNote),
    );
  } else {
    children.push(
      finderHeading(`无法保留袋内全部 ${bagSize} 个掉落物完成合成`),
      finderNote(`最接近的 ${seeded.closest.toLocaleString('zh-CN')} 种配方可保留其中 ${kept} 个掉落物。点击即可替换材料。` + hiddenNote),
    );
  }

  const shown = finderShowAll ? seeded.recipes : seeded.recipes.slice(0, FINDER_PAGE);
  if (bagSize && shown.length > seeded.closest) {
    // The closest recipes, then the ones that need more changes.
    children.push(recipeList(shown.slice(0, seeded.closest)),
      finderHeading('其他相近配方'), finderNote('这些配方需要替换更多袋内材料。'),
      recipeList(shown.slice(seeded.closest)));
  } else {
    children.push(recipeList(shown));
  }
  if (shown.length < seeded.recipes.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'btn-ghost preview-more';
    more.textContent = `再显示 ${seeded.recipes.length - shown.length} 种配方`;
    more.addEventListener('click', () => {
      finderShowAll = true;
      renderFinder(parseSeed(state.seedText));
    });
    children.push(more);
  }
  results.replaceChildren(...children);
}

$('finder-search').addEventListener('input', renderFinderMatches);
$('finder-search').addEventListener('keydown', event => {
  if (event.key === 'Enter') $('finder-matches').querySelector('button')?.click();
});

// ---------- bottom dock ----------
// On phones a small dock keeps the bag and result in view while browsing above it.

const dock = $('dock');
const narrowScreen = window.matchMedia('(max-width: 719px)');
let bagCardVisible = true;

function renderDock(outcome) {
  const bag = $('dock-bag');
  bag.replaceChildren();
  for (let i = 0; i < 8; i++) {
    const id = state.bag[i];
    if (id) {
      bag.append(pickupIcon(id, 20));
    } else {
      const empty = document.createElement('span');
      empty.className = 'empty';
      bag.append(empty);
    }
  }

  const result = $('dock-result');
  const label = document.createElement('span');
  label.className = 'label';
  if (outcome.message) {
    label.classList.add('muted');
    label.textContent = outcome.short;
    result.replaceChildren(label);
  } else {
    const id = outcome.candidates[0];
    label.textContent = itemName(id);
    result.replaceChildren(itemIcon(id, 40), label);
  }
  updateDockVisibility();
}

function updateDockVisibility() {
  const show = narrowScreen.matches && !bagCardVisible && state.bag.length > 0;
  dock.hidden = !show;
  document.body.classList.toggle('has-dock', narrowScreen.matches);
}

new IntersectionObserver(([entry]) => {
  bagCardVisible = entry.isIntersecting;
  updateDockVisibility();
}).observe(document.querySelector('.bag-card'));
narrowScreen.addEventListener('change', updateDockVisibility);
narrowScreen.addEventListener('change', () => renderCollection(parseSeed(state.seedText)));
dock.addEventListener('click', () => document.querySelector('.bag-card').scrollIntoView({ behavior: 'smooth', block: 'start' }));

// ---------- render ----------

function render() {
  const text = state.seedText.replace(' ', '');
  const seed = parseSeed(state.seedText);
  const status = $('seed-status');
  seedInput.classList.toggle('valid', seed !== null);
  seedInput.classList.toggle('invalid', seed === null && text.length === 8);
  status.className = 'seed-status' + (seed !== null ? ' valid' : text.length === 8 ? ' invalid' : '');
  status.textContent = seed !== null ? '✓' : text.length === 8 ? '无效' : '';

  for (const button of document.querySelectorAll('[data-version]')) {
    button.setAttribute('aria-checked', String(button.dataset.version === state.version));
  }
  for (const button of document.querySelectorAll('[data-sort]')) {
    button.setAttribute('aria-checked', String(button.dataset.sort === state.previewSort));
  }

  const activeModifiers = MODIFIERS.filter(([key]) => state.opts[key]).length;
  const count = $('modifier-count');
  count.hidden = activeModifiers === 0;
  count.textContent = `已开启 ${activeModifiers} 项`;

  renderSettings();
  renderBag();
  const outcome = computeOutcome(seed);
  renderResult(outcome);
  renderPreview(seed);
  renderCollection(seed);
  renderFinder(seed);
  renderDock(outcome);
  saveState();
}

renderPicker();
renderModifierList();
buildExcludeList();
render();
