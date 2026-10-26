import data from './data.js?v=6';
import chinese from './zh-cn.js?v=6';

// Keep translations separate so rebuilding game data cannot overwrite them.
export const itemName = id => chinese[id]?.[0] ?? data.names[id]?.[0] ?? `道具 #${id}`;
export const itemQuote = id => chinese[id]?.[1] ?? data.names[id]?.[1] ?? '';

const namesFor = id => [itemName(id), data.names[id]?.[0] ?? ''];
const normalize = text => text.trim().toLocaleLowerCase('zh-CN');

export const matchesItem = (id, query) => namesFor(id).some(name => normalize(name).includes(normalize(query)));
export const startsWithItem = (id, query) => namesFor(id).some(name => normalize(name).startsWith(normalize(query)));

const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { numeric: true });
export const compareItems = (a, b) => collator.compare(itemName(a), itemName(b)) || a - b;

// Numeric wiki redirects stay valid even if a translated name changes.
export const wikiUrl = id => `https://isaac.huijiwiki.com/wiki/C${id}`;
