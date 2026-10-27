import { PROJECT_FAVORITES } from './project-favorites.js?v=12';

// Permanent red-heart container upgrades, curated by collectible ID.
// Soul hearts, bone hearts, temporary and conditional HP upgrades are omitted.
// Reference: https://bindingofisaacrebirth.wiki.gg/wiki/Health
export const HEALTH_UPS = {
  12: 1, 15: 1, 16: 2, 22: 1, 23: 1, 24: 1, 25: 1, 26: 1,
  92: 1, 101: 1, 119: 1, 121: 1, 129: 2, 138: 1, 176: 1,
  182: 1, 184: 1, 189: 1, 193: 1, 218: 1, 219: 1, 226: 1, 253: 1,
  301: 1, 307: 1, 312: 1, 314: 1, 334: 3, 342: 1, 346: 1, 354: 1, 456: 1,
  573: 1, 591: 1, 614: 1, 664: 1, 669: 1, 707: 1,
};

/** Combine personal favorites with enabled, locally visible project defaults. */
export function getFavoriteIds(state, project = PROJECT_FAVORITES) {
  const hidden = new Set(state.excludedProjectFavorites ?? []);
  const preset = state.useProjectFavorites === false ? [] : project.filter(id => !hidden.has(id));
  return [...new Set([...(state.favorites ?? []), ...preset])];
}

/** Change a star without copying the project defaults into personal storage. */
export function toggleFavorite(state, id, project = PROJECT_FAVORITES) {
  let favorites = [...(state.favorites ?? [])];
  let excludedProjectFavorites = [...(state.excludedProjectFavorites ?? [])];
  const fromProject = state.useProjectFavorites !== false && project.includes(id);
  if (getFavoriteIds(state, project).includes(id)) {
    favorites = favorites.filter(item => item !== id);
    if (fromProject) excludedProjectFavorites = [...new Set([...excludedProjectFavorites, id])];
  } else if (fromProject) {
    excludedProjectFavorites = excludedProjectFavorites.filter(item => item !== id);
  } else {
    favorites.push(id);
  }
  return { favorites, excludedProjectFavorites };
}

/** Generate the project's importable preset file, with readable item names. */
export function serializeProjectFavorites(ids, nameForId = id => `道具 #${id}`) {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  if (unique.some(id => !Number.isInteger(id) || id < 1)) throw new Error('Invalid favorite ID');
  const rows = unique.map(id => `  ${id}, // ${nameForId(id).replace(/[\r\n\u2028\u2029]/g, ' ')}`);
  return '// 收藏预设：通过设置中的“下载预设”备份，使用“导入预设”恢复。\n'
    + '// 开关只决定是否加入此清单，不覆盖浏览器里的个人收藏。\n'
    + 'export const PROJECT_FAVORITES = [\n' + rows.join('\n') + '\n];\n';
}

/** Read our downloaded JS data format without evaluating any JavaScript. */
export function parseProjectFavorites(text, isKnownId = () => true) {
  const source = text.replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n\u2028\u2029]*/g, '').trim();
  const match = /^export\s+const\s+PROJECT_FAVORITES\s*=\s*(\[[\s\S]*\])\s*;?$/.exec(source);
  const formatError = () => new Error('预设格式不正确，请选择之前通过“下载预设”保存的文件。');
  if (!match) throw formatError();
  let ids;
  try {
    ids = JSON.parse(match[1].replace(/,\s*\]$/, ']'));
  } catch {
    throw formatError();
  }
  if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(id) || id < 1 || !isKnownId(id))) {
    throw new Error('预设包含无效或未知的道具，未修改当前收藏。');
  }
  return [...new Set(ids)];
}

/** Restore the exact list, including when project defaults are enabled. */
export function favoriteStateFromPreset(ids, project = PROJECT_FAVORITES) {
  return {
    favorites: [...ids],
    excludedProjectFavorites: project.filter(id => !ids.includes(id)),
  };
}
