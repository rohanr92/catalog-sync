import { sizeColumns } from "./channel-specs";
import { getColumnSpecs, getValueLists } from "./static-data";
import { db } from './db';
import { channelColumns } from './channel-specs';
import { seedBuiltinMaps } from './builtin-maps';

type Row = Record<string, string>;

export const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const suffixRe = /-\d+(_\d+)+$/;
export const baseCode = (channelKey: string, code: string) => (channelKey === 'kohls' ? code.replace(suffixRe, '') : code);

function skipCodes(channelKey: string): Set<string> {
  const s = channelColumns[channelKey];
  return new Set([s.upc, s.altUpc ?? '', s.sku, s.style, s.category, s.title, ...s.images, s.swatch ?? ''].filter(Boolean));
}

const opsColumn = /^(ai_|Priority$|last-republish|Do not complete|Appeal|onboarding|gemrules|isCABattery|Hazmat)|offer|price|quantity|msrp|lead[_ ]?time|shipping/i;
export const isOpsColumn = (code: string, label = '', description = '') =>
  opsColumn.test(code) || opsColumn.test(label) || /^(sku|product-id|product-id-type|state|price|price-additional-info)$/.test(code) || /offer creation|of the offer/i.test(description);

export const listColumns: Record<string, { prefix: string; source: string; max: number }> = {
  kohls: { prefix: 'feature_', source: 'copy-features', max: 20 },
  macys: { prefix: 'fnb', source: 'copy-features', max: 5 },
};

export const productSpecific: Record<string, string[]> = {
  kohls: ['style_number', 'style_description', 'fabric_material', 'color_family', 'meta_description', 'title', 'display_color', 'consumer_material', 'consumer_pattern', 'consumer_silhouette', 'consumer_sleeve_length', 'collar_type/neckline', 'consumer_closure', 'consumer_fit', 'consumer_length', 'heel_height_qty', 'nrf_size'],
  macys: ['pid', 'productName', 'productLongDescription', 'fabricContent', 'nrfColorCode', 'siteColorDesc', 'nrfSizeCode', 'msrp', 'productDimensions1', 'productDimensions2', 'harmonizeTitle'],
  jcpenney: ['VARIANT_GROUP_CODE', 'name', 'product_description', 'color', 'pdb_color_family', 'hFiberContent', 'hMaterial_clothing', 'hBaseMaterial', 'hPrimarySize', 'hShoeSize', 'hSleeveLength', 'hNeckline', 'hPrintPattern', 'hToeShape', 'hHeelStyle', 'hShoeHeelHeight', 'hShoeStyles', 'hLength', 'hFit_bottoms', 'hRise', 'hInseam', 'hLegStyle'],
  debenhams: ['parent_product_id', 'product_title_us', 'long_description_us', 'details_and_care_us', 'colour', 'colourfacet', 'fabrication_clothingacc', 'fabrication_type', 'size_footwear_us', 'toe', 'heel_shape', 'heel_height', 'design_clothingacc'],
};

const firstSource = (attrs: Row, codes: string) => { for (const c of codes.split('|')) if (attrs[c]) return attrs[c]; return ''; };

export async function learnAttributes(channelKey: string) {
  const seeded = await seedBuiltinMaps(channelKey);
  const [products, onChannel, maps] = await Promise.all([
    db.product.findMany({ select: { gtin: true, attrs: true } }),
    db.channelProduct.findMany({ where: { channelKey }, select: { upc: true, category: true, raw: true } }),
    db.attributeMap.findMany({ where: { channelKey } }),
  ]);
  const byGtin = new Map(products.map((p) => [p.gtin, p.attrs as Row]));
  const skip = skipCodes(channelKey);
  const manualValues = new Set((await db.attrValueMap.findMany({ where: { channelKey, origin: 'manual' } })).map((v) => `${v.channelCode}|${v.fromValue}`));
  const pairs = onChannel.map((c) => ({ n: byGtin.get(c.upc), r: c.raw as Row })).filter((p) => p.n) as { n: Row; r: Row }[];

  const ops = [];
  let values = 0;
  for (const m of maps) {
    const tally = new Map<string, Map<string, number>>();
    for (const p of pairs) {
      const cv = Object.keys(p.r).find((k) => baseCode(channelKey, k) === m.channelCode && p.r[k]);
      const a = firstSource(p.n, m.nordstromCode), b = cv ? p.r[cv] : '';
      if (!a || !b) continue;
      if (!tally.has(a)) tally.set(a, new Map());
      tally.get(a)!.set(b, (tally.get(a)!.get(b) ?? 0) + 1);
    }
    for (const [from, t] of tally) {
      const [to, count] = [...t.entries()].sort((x, y) => y[1] - x[1])[0];
      if (count < 2 || norm(from) === norm(to) || manualValues.has(`${m.channelCode}|${from}`)) continue;
      ops.push(db.attrValueMap.upsert({ where: { channelKey_channelCode_fromValue: { channelKey, channelCode: m.channelCode, fromValue: from } }, update: { toValue: to, origin: 'learned' }, create: { channelKey, channelCode: m.channelCode, fromValue: from, toValue: to, origin: 'learned' } }));
      values++;
    }
  }

  const byCat = new Map<string, Row[]>();
  for (const c of onChannel) { if (!c.category) continue; if (!byCat.has(c.category)) byCat.set(c.category, []); byCat.get(c.category)!.push(c.raw as Row); }
  const manualDefaults = new Set((await db.categoryDefault.findMany({ where: { channelKey, share: 1 } })).map((d) => `${d.category}|${d.code}`));
  let defaults = 0;
  for (const [category, rows] of byCat) {
    if (rows.length < 2) continue;
    const codes = new Set(rows.flatMap((r) => Object.keys(r)));
    for (const code of codes) {
      if (skip.has(code) || manualDefaults.has(`${category}|${code}`)) continue;
      const t = new Map<string, number>();
      for (const r of rows) if (r[code]) t.set(r[code], (t.get(r[code]) ?? 0) + 1);
      if (!t.size) continue;
      const [value, count] = [...t.entries()].sort((a, b) => b[1] - a[1])[0];
      if (count / rows.length >= 0.7) { ops.push(db.categoryDefault.upsert({ where: { channelKey_category_code: { channelKey, category, code } }, update: { value, share: 0.9 }, create: { channelKey, category, code, value, share: 0.9 } })); defaults++; }
    }
  }
  for (let i = 0; i < ops.length; i += 150) await db.$transaction(ops.slice(i, i + 150));
  return { ...seeded, learnedValues: values, learnedDefaults: defaults, matchedProducts: pairs.length, maps: maps.length, values: values + seeded.values, defaults: defaults + seeded.defaults };
}

export interface FillIssue { code: string; label: string; problem: string; required: boolean }
export interface Filler { fill(targetCategory: string, attrs: Row, base: Row, template?: Row, sizeValue?: string): { row: Row; issues: FillIssue[] } }

export async function loadFiller(channelKey: string): Promise<Filler> {
  let maps = await db.attributeMap.findMany({ where: { channelKey } });
  if (maps.length === 0) { await seedBuiltinMaps(channelKey); maps = await db.attributeMap.findMany({ where: { channelKey } }); }
  const [specs, vmaps, defaults, lists] = await Promise.all([
    getColumnSpecs(channelKey),
    db.attrValueMap.findMany({ where: { channelKey } }),
    db.categoryDefault.findMany({ where: { channelKey } }),
    getValueLists(channelKey),
  ]);
  const mapBy = new Map(maps.map((m) => [m.channelCode, m.nordstromCode]));
  const vmapBy = new Map(vmaps.map((v) => [`${v.channelCode}|${v.fromValue}`, v.toValue]));
  const defBy = new Map<string, Map<string, string>>();
  for (const d of defaults) { if (!defBy.has(d.category)) defBy.set(d.category, new Map()); defBy.get(d.category)!.set(d.code, d.value); }
  const globalDefs = defBy.get('*') ?? new Map<string, string>();
  const listBy = new Map(lists.map((l) => [l.attribute, l.values as string[]]));
  const listCfg = listColumns[channelKey];
  const labelBy = new Map(specs.map((s) => [s.code, s.label]));
  const specific = new Set(productSpecific[channelKey] ?? []);
  const skip = skipCodes(channelKey);

  function toAllowed(code: string, value: string): { value: string; ok: boolean } {
    const allowed = listBy.get(code);
    if (!allowed || !allowed.length || !value) return { value, ok: true };
    if (allowed.includes(value)) return { value, ok: true };
    const nv = norm(value);
    const exact = allowed.find((a) => norm(a) === nv);
    if (exact) return { value: exact, ok: true };
    const starts = allowed.filter((a) => norm(a).startsWith(nv) || nv.startsWith(norm(a)));
    if (starts.length === 1) return { value: starts[0], ok: true };
    const toks = new Set(nv.split(' '));
    const scored = allowed.map((a) => ({ a, s: norm(a).split(' ').filter((t) => toks.has(t)).length / Math.max(toks.size, 1) })).filter((x) => x.s >= 0.6).sort((x, y) => y.s - x.s);
    if (scored.length === 1 || (scored.length > 1 && scored[0].s > scored[1].s)) return { value: scored[0].a, ok: true };
    return { value: '', ok: false };
  }

  return {
    fill(targetCategory, attrs, base, template, sizeValue) {
      const row: Row = {};
      if (template) for (const [k, v] of Object.entries(template)) { if (!v || skip.has(k) || specific.has(baseCode(channelKey, k)) || (listCfg && k.startsWith(listCfg.prefix))) continue; row[k] = v; }
      Object.assign(row, base);
      const issues: FillIssue[] = [];
      const cols = specs.filter((s) => { const r = (s.requiredBy as Record<string, string>)[targetCategory]; return r === 'REQUIRED' || r === 'OPTIONAL'; });
      const defs = defBy.get(targetCategory) ?? new Map<string, string>();

      if (listCfg && attrs[listCfg.source]) {
        attrs[listCfg.source].split('|').map((x) => x.trim()).filter(Boolean).slice(0, listCfg.max).forEach((v, i) => { row[`${listCfg.prefix}${i + 1}`] = v; });
      }

      for (const s of cols) {
        const code = s.code;
        if (base[code]) continue;
        const bc = baseCode(channelKey, code);
        if (isOpsColumn(bc, s.label, s.description ?? '')) continue; // offer-stage columns are not product data
        const required = (s.requiredBy as Record<string, string>)[targetCategory] === 'REQUIRED';
        const label = labelBy.get(code) ?? code;

        // Size column for this category (Kohl's keeps one per category).
        if (sizeColumns[channelKey]?.(code)) {
          delete row[code];
          if (sizeValue) { const chk = toAllowed(code, sizeValue); if (chk.ok && chk.value) { row[code] = chk.value; continue; } }
          if (required) issues.push({ code, label, problem: sizeValue ? `"${sizeValue}" is not an accepted size here — pick one` : 'No size — pick one', required });
          continue;
        }

        let value = '';
        const src = mapBy.get(bc);
        const raw = src ? firstSource(attrs, src) : '';
        if (raw) value = vmapBy.get(`${bc}|${raw}`) ?? raw;
        if (!value && row[code]) continue;
        if (!value && globalDefs.has(bc)) value = globalDefs.get(bc)!;
        if (!value && defs.has(code)) value = defs.get(code)!;
        if (value) {
          const chk = toAllowed(code, value);
          if (chk.ok) row[code] = chk.value;
          else if (row[code]) continue;
          else if (required) issues.push({ code, label, problem: `"${value}" is not accepted — pick under Values`, required });
        } else if (required) {
          issues.push({ code, label, problem: 'No source — set one or a custom value under Attributes', required });
        }
      }
      return { row, issues };
    },
  };
}
