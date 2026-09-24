import fs from 'fs';
import path from 'path';
import { db } from './db';

interface Trained { maps: Record<string, string[]>; values: Record<string, Record<string, string>>; defaults: Record<string, Record<string, string>> }

function load(): Record<string, Trained> {
  const p = path.join(process.cwd(), 'prisma', 'trained-maps.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}

// Seeds the trained mapping into the database as origin "builtin". Manual entries are never touched.
export async function seedBuiltinMaps(channelKey: string) {
  const t = load()[channelKey];
  if (!t) return { maps: 0, values: 0, defaults: 0 };

  const manualMaps = new Set((await db.attributeMap.findMany({ where: { channelKey, origin: 'manual' } })).map((m) => m.channelCode));
  const manualValues = new Set((await db.attrValueMap.findMany({ where: { channelKey, origin: 'manual' } })).map((v) => `${v.channelCode}|${v.fromValue}`));
  const manualDefaults = new Set((await db.categoryDefault.findMany({ where: { channelKey, share: 1 } })).map((d) => `${d.category}|${d.code}`));

  const ops = [];
  let maps = 0, values = 0, defaults = 0;
  for (const [channelCode, sources] of Object.entries(t.maps)) {
    if (manualMaps.has(channelCode)) continue;
    const nordstromCode = sources.join('|');
    ops.push(db.attributeMap.upsert({ where: { channelKey_channelCode: { channelKey, channelCode } }, update: { nordstromCode, origin: 'builtin', confidence: 0.9 }, create: { channelKey, channelCode, nordstromCode, origin: 'builtin', confidence: 0.9 } }));
    maps++;
  }
  for (const [channelCode, table] of Object.entries(t.values)) {
    for (const [fromValue, toValue] of Object.entries(table)) {
      if (manualValues.has(`${channelCode}|${fromValue}`)) continue;
      ops.push(db.attrValueMap.upsert({ where: { channelKey_channelCode_fromValue: { channelKey, channelCode, fromValue } }, update: { toValue, origin: 'builtin' }, create: { channelKey, channelCode, fromValue, toValue, origin: 'builtin' } }));
      values++;
    }
  }
  for (const [category, table] of Object.entries(t.defaults)) {
    for (const [code, value] of Object.entries(table)) {
      if (manualDefaults.has(`${category}|${code}`)) continue;
      ops.push(db.categoryDefault.upsert({ where: { channelKey_category_code: { channelKey, category, code } }, update: { value, share: 0.9 }, create: { channelKey, category, code, value, share: 0.9 } }));
      defaults++;
    }
  }
  for (let i = 0; i < ops.length; i += 150) await db.$transaction(ops.slice(i, i + 150));
  return { maps, values, defaults };
}
