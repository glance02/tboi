import assert from 'node:assert/strict';
import data from '../js/data.js';
import chinese from '../js/zh-cn.js';
import { itemName, itemQuote, matchesItem, startsWithItem, compareItems, wikiUrl } from '../js/localization.js';

// Check every ID rather than only the items visible in a few sample recipes.
for (const [id, [name, quote]] of Object.entries(data.names)) {
  assert.equal(chinese[id]?.length, 2, `道具 ${id} 缺少翻译`);
  assert.ok(itemName(id), `道具 ${id} 缺少名称`);
  if (!['11', '15'].includes(id)) {
    assert.match(itemName(id), /\p{Script=Han}/u, `道具 ${id} 的名称不是中文`);
  }
  assert.ok(matchesItem(id, name.toUpperCase()), `无法按英文名搜索道具 ${id}`);
  assert.ok(matchesItem(id, itemName(id)), `无法按中文名搜索道具 ${id}`);
  if (quote) assert.ok(itemQuote(id), `道具 ${id} 缺少拾取提示`);
  assert.ok(!/[a-z]/i.test(itemQuote(id)), `道具 ${id} 的拾取提示仍有英文`);
}

assert.equal(itemName(182), '圣心');
assert.ok(matchesItem(182, ' 圣心 '));
assert.ok(matchesItem(182, 'SACRED heart'));
assert.ok(startsWithItem(182, 'sacred'));
assert.ok(startsWithItem(182, '圣'));
assert.ok(!matchesItem(182, '不存在的道具'));
assert.equal(itemName(9999), '道具 #9999');
assert.equal(itemQuote(9999), '');
assert.equal(wikiUrl(182), 'https://isaac.huijiwiki.com/wiki/C182');
assert.ok(compareItems(37, 182) > 0, '应按中文拼音排列圣心与炸弹先生');

console.log(`已验证 ${Object.keys(data.names).length} 个道具的中文翻译、中英文搜索及拼音排序。`);
