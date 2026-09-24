import { db } from './db';
import { getChannelProducts, getColumnSpecs, getValueLists } from './static-data';
import { channelColumns, OFFER_COLUMNS } from './channel-specs';

type Row = Record<string, string>;
type CP = { upc: string; channelSku: string | null; styleCode: string | null; title: string | null; color: string | null; size: string | null; category: string | null; raw: unknown };

export const groupKeyOf = (r: { styleCode: string | null; title: string | null; color: string | null }) => `${r.styleCode || r.title || ''}|${r.color ?? ''}`;
const imagesOf = (channelKey: string, raw: Row) => (channelColumns[channelKey]?.images ?? []).map((c) => raw[c]).filter((v) => v && v.startsWith('http'));

// The marketplace's current row for this UPC, with your edits on top.
export function applyChannelEdit(raw: Row, upc: string, images: string[], fields: Record<string, Row>, imageCols: string[]): Row {
  const row: Row = { ...raw };
  if (images.length) imageCols.forEach((col, i) => { row[col] = images[i] ?? ''; });
  Object.assign(row, fields['*'] ?? {}, fields[upc] ?? {});
  return row;
}

export async function catalogList(channelKey: string, q: string) {
  const rows = (await getChannelProducts(channelKey)) as CP[];
  const groups = new Map<string, { key: string; styleCode: string; color: string; title: string; category: string; thumb: string; images: number; sizes: string[]; upcs: string[] }>();
  for (const r of rows) {
    const k = groupKeyOf(r);
    if (!groups.has(k)) {
      const imgs = imagesOf(channelKey, r.raw as Row);
      groups.set(k, { key: k, styleCode: r.styleCode ?? '', color: r.color ?? '', title: r.title ?? '', category: r.category ?? '', thumb: imgs[0] ?? '', images: imgs.length, sizes: [], upcs: [] });
    }
    const g = groups.get(k)!;
    g.sizes.push(r.size ?? '');
    g.upcs.push(r.upc);
  }
  const edits = await db.channelEdit.findMany({ where: { channelKey, status: { in: ['draft', 'approved', 'sent', 'rejected'] } }, select: { groupKey: true, status: true } });
  const editBy = new Map(edits.map((e) => [e.groupKey, e.status]));
  let list = [...groups.values()].map((g) => ({ ...g, edit: editBy.get(g.key) ?? null }));
  const s = q.trim().toLowerCase();
  if (s) list = list.filter((g) => `${g.title} ${g.styleCode} ${g.color} ${g.upcs.join(' ')}`.toLowerCase().includes(s));
  list.sort((a, b) => a.title.localeCompare(b.title) || a.color.localeCompare(b.color));
  return { total: list.length, products: rows.length, groups: list };
}

export async function catalogDetail(channelKey: string, key: string) {
  const rows = ((await getChannelProducts(channelKey)) as CP[]).filter((r) => groupKeyOf(r) === key);
  if (!rows.length) return null;
  const cat = rows[0].category ?? '';
  const [tplRows, specs, lists, edit] = await Promise.all([
    db.setting.findMany({ where: { key: { startsWith: `template:${channelKey}:` } } }),
    getColumnSpecs(channelKey),
    getValueLists(channelKey),
    db.channelEdit.findFirst({ where: { channelKey, groupKey: key, status: { in: ['draft', 'approved', 'sent', 'rejected'] } }, orderBy: { updatedAt: 'desc' } }),
  ]);
  const tpls = tplRows.map((t) => t.value as { codes: string[]; categories: string[] });
  const tpl = tpls.find((t) => t.categories.includes(cat)) ?? tpls[0];
  const specBy = new Map(specs.map((s) => [s.code, s]));
  const listBy = new Map(lists.map((l) => [l.attribute, l.values as string[]]));
  const columns = (tpl?.codes ?? Object.keys(rows[0].raw as Row)).filter((c) => c && !OFFER_COLUMNS.has(c)).map((code) => {
    const req = (specBy.get(code)?.requiredBy as Row) ?? {};
    return { code, label: specBy.get(code)?.label ?? code, required: req[cat] === 'REQUIRED', used: req[cat] === 'REQUIRED' || req[cat] === 'OPTIONAL', allowed: listBy.get(code) ?? [] };
  });
  return {
    key, styleCode: rows[0].styleCode ?? '', color: rows[0].color ?? '', title: rows[0].title ?? '', category: cat,
    images: imagesOf(channelKey, rows[0].raw as Row),
    sizes: rows.map((r) => ({ gtin: r.upc, sku: r.channelSku, size: r.size ?? '', values: r.raw as Row })),
    columns, edit,
  };
}

// After the marketplace accepts an edit, store the new values as its current rows.
export async function commitChannelEdit(ed: { channelKey: string; upcs: unknown; images: unknown; fields: unknown }) {
  const spec = channelColumns[ed.channelKey];
  if (!spec) return;
  const cps = await db.channelProduct.findMany({ where: { channelKey: ed.channelKey, upc: { in: ed.upcs as string[] } }, select: { id: true, upc: true, raw: true } });
  for (const cp of cps) {
    const row = applyChannelEdit(cp.raw as Row, cp.upc, ed.images as string[], ed.fields as Record<string, Row>, spec.images);
    await db.channelProduct.update({ where: { id: cp.id }, data: { raw: row, images: spec.images.map((c) => row[c]).filter(Boolean), title: row[spec.title] || undefined, color: row[spec.color] || undefined } });
  }
}
