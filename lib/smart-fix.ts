import { db } from './db';
import { channelColumns } from './channel-specs';
import { ensureSwatch } from './swatch';
import { groupKeyOf } from './channel-catalog';
import { log } from './log';

// Smart fix: fills empty images, swatch and required columns by looking at your other products —
// the same colour's other sizes, the same style's other colours, then what most listings in that
// category use on that marketplace. No rules to set up.

type Row = Record<string, string>;
export interface Fill { upc: string; title: string; column: string; label: string; value: string; source: string }
type Item = { row: Row; category: string; ref: { upc: string } };

const NEVER = /(^|[^a-z])(upc|ean|gtin|sku|uid|barcode|price|quantity|stock)([^a-z]|$)|product[_-]?id|shop[_-]?sku|unique/i;
const TEXT = /desc|feature|bullet|care|title|name|detail|keyword|copy|story/i;
const COLOUR = /colou?r|swatch|image|media|size/i;
const low = (s: unknown) => String(s ?? '').trim().toLowerCase();
const digits = (u: string) => String(u ?? '').replace(/\D/g, '').replace(/^0+/, '');
const empty = (v: unknown) => !String(v ?? '').trim();

const key = (ch: string) => `smartFix:${ch}`;
export async function smartOn(ch: string) { return ((await db.setting.findUnique({ where: { key: key(ch) } }))?.value as { on?: boolean } | null)?.on !== false; }
export async function setSmart(ch: string, on: boolean) { await db.setting.upsert({ where: { key: key(ch) }, update: { value: { on } }, create: { key: key(ch), value: { on } } }); }

function requiredFor(requiredBy: unknown, category: string): boolean {
  if (!requiredBy) return false;
  if (Array.isArray(requiredBy)) return requiredBy.map(low).includes(low(category));
  if (typeof requiredBy !== 'object') return false;
  for (const [cat, v] of Object.entries(requiredBy as Record<string, unknown>)) {
    const req = v === true || (/required/i.test(String(v ?? '')) && !/not required/i.test(String(v ?? '')));
    if (req && (['', '*', 'all', 'default'].includes(low(cat)) || low(cat) === low(category))) return true;
  }
  return false;
}

export async function smartFill(ch: string, items: Item[], opts: { dryRun?: boolean } = {}): Promise<Fill[]> {
  const spec = channelColumns[ch];
  if (!spec || !items.length) return [];

  const [specs, cps, catDefaults] = await Promise.all([
    db.columnSpec.findMany({ where: { channelKey: ch }, select: { code: true, label: true, requiredBy: true } }),
    db.channelProduct.findMany({ where: { channelKey: ch }, select: { upc: true, styleCode: true, color: true, category: true, title: true, raw: true, swatchUrl: true } }),
    db.categoryDefault.findMany({ where: { channelKey: ch, share: { gte: 0.6 } }, select: { category: true, code: true, value: true, share: true } }),
  ]);
  const label = new Map<string, string>(specs.map((s: { code: string; label: string }): [string, string] => [s.code, s.label || s.code]));
  const imgCols = new Set([...spec.images, spec.swatch ?? '']);

  // Every known row on this marketplace, plus the rows in this send — grouped by style.
  type Sib = { upc: string; color: string; category: string; raw: Row; swatch: string };
  const byStyle = new Map<string, Sib[]>();
  const addSib = (style: string, s: Sib) => { const k = low(style); if (!k) return; if (!byStyle.has(k)) byStyle.set(k, []); byStyle.get(k)!.push(s); };
  for (const c of cps) addSib(c.styleCode ?? '', { upc: c.upc, color: c.color ?? '', category: c.category ?? '', raw: (c.raw ?? {}) as Row, swatch: c.swatchUrl || (spec.swatch ? ((c.raw ?? {}) as Row)[spec.swatch] ?? '' : '') });
  for (const it of items) addSib(it.row[spec.style] ?? '', { upc: it.ref.upc, color: it.row[spec.color] ?? '', category: it.category, raw: it.row, swatch: spec.swatch ? it.row[spec.swatch] ?? '' : '' });

  // Most common value per category + column (needs 5+ listings and 60%+ agreeing)
  const catCache = new Map<string, { value: string; share: number } | null>();
  const byCat = new Map<string, Row[]>();
  for (const c of cps) { const k = low(c.category); if (!byCat.has(k)) byCat.set(k, []); byCat.get(k)!.push((c.raw ?? {}) as Row); }
  const catValue = (category: string, code: string) => {
    const k = `${low(category)}|${code}`;
    if (!catCache.has(k)) {
      const rows = byCat.get(low(category)) ?? [];
      const counts = new Map<string, number>(); let n = 0;
      for (const r of rows) { const v = String(r[code] ?? '').trim(); if (v) { n++; counts.set(v, (counts.get(v) ?? 0) + 1); } }
      const top = [...counts].sort((a, b) => b[1] - a[1])[0];
      let best = top && n >= 5 && top[1] / n >= 0.6 ? { value: top[0], share: top[1] / n } : null;
      if (!best) { const d = catDefaults.find((x: { category: string; code: string }) => low(x.category) === low(category) && x.code === code); if (d) best = { value: d.value, share: d.share }; }
      catCache.set(k, best);
    }
    return catCache.get(k)!;
  };

  // Nordstrom products by UPC (for images / swatch)
  const wanted = [...new Set(items.map((i) => digits(i.ref.upc)))];
  const variants = wanted.flatMap((d) => [d, d.padStart(12, '0'), d.padStart(13, '0'), d.padStart(14, '0')]);
  const ps = await db.product.findMany({ where: { gtin: { in: variants } }, select: { gtin: true, sku: true, color: true, attrs: true, images: { orderBy: { position: 'asc' }, select: { sourceUrl: true, storedUrl: true } } } });
  const nord = new Map<string, { style: string; color: string; images: string[] }>();
  for (const p of ps) { const a = (p.attrs ?? {}) as Row; nord.set(digits(p.gtin), { style: a['variant-group-code'] || a['vpn'] || p.sku || p.gtin, color: p.color ?? '', images: p.images.map((i: { sourceUrl: string; storedUrl: string | null }) => i.storedUrl || i.sourceUrl).filter(Boolean) }); }
  const sets = new Map<string, string[]>((await db.imageSet.findMany({ where: { channelKey: ch }, select: { styleCode: true, color: true, images: true } })).map((s: { styleCode: string; color: string; images: unknown }): [string, string[]] => [`${low(s.styleCode)}|${low(s.color)}`, (s.images as string[]) ?? []]));
  const swatches = new Map<string, string>((await db.swatch.findMany({ select: { styleCode: true, color: true, url: true } })).map((s: { styleCode: string; color: string; url: string }): [string, string] => [`${low(s.styleCode)}|${low(s.color)}`, s.url]));

  const reqCache = new Map<string, string[]>();
  const required = (cat: string) => {
    if (!reqCache.has(cat)) reqCache.set(cat, specs.filter((s: { code: string; requiredBy: unknown }) => !imgCols.has(s.code) && !NEVER.test(s.code) && requiredFor(s.requiredBy, cat)).map((s: { code: string }) => s.code));
    return reqCache.get(cat)!;
  };

  const fills: Fill[] = [];
  const madeSwatch = new Map<string, string>();
  for (const it of items) {
    const row = it.row;
    const style = row[spec.style] ?? '', color = row[spec.color] ?? '';
    const sibs = (byStyle.get(low(style)) ?? []).filter((s) => s.raw !== row && digits(s.upc) !== digits(it.ref.upc));
    const sameColour = sibs.filter((s) => low(s.color) === low(color));
    const n = nord.get(digits(it.ref.upc));
    const title = row[spec.title] ?? '';
    const put = (column: string, value: string, source: string) => { row[column] = value; fills.push({ upc: it.ref.upc, title: `${title} ${color}`.trim(), column, label: label.get(column) ?? column, value, source }); };

    // 1. Images
    if (empty(row[spec.images[0]])) {
      const sib = sameColour.find((s) => !empty(s.raw[spec.images[0]]));
      const fromSet = n ? sets.get(`${low(n.style)}|${low(n.color)}`) : undefined;
      const imgs = sib ? spec.images.map((c) => sib.raw[c] ?? '') : fromSet?.length ? fromSet : n?.images ?? [];
      const source = sib ? `same colour, other size (UPC ${sib.upc})` : fromSet?.length ? 'your saved image set' : 'Nordstrom images';
      spec.images.forEach((c, i) => { if (empty(row[c]) && imgs[i]) put(c, imgs[i], source); });
    }

    // 2. Swatch
    if (spec.swatch && empty(row[spec.swatch])) {
      const sib = sameColour.find((s) => s.swatch);
      const saved = n ? swatches.get(`${low(n.style)}|${low(n.color)}`) : undefined;
      if (sib) put(spec.swatch, sib.swatch, `same colour, other size (UPC ${sib.upc})`);
      else if (saved) put(spec.swatch, saved, 'saved swatch for this colour');
      else if (opts.dryRun) fills.push({ upc: it.ref.upc, title: `${title} ${color}`.trim(), column: spec.swatch, label: label.get(spec.swatch) ?? spec.swatch, value: '(made when sending)', source: 'made automatically from the main image' });
      else {
        const k = `${n?.style ?? style}|${n?.color ?? color}`;
        if (!madeSwatch.has(k)) madeSwatch.set(k, (await ensureSwatch(n?.style ?? style, n?.color ?? color, row[spec.images[0]] || n?.images[0]).catch(() => null))?.url ?? '');
        if (madeSwatch.get(k)) put(spec.swatch, madeSwatch.get(k)!, 'made automatically from the main image');
      }
    }

    // 3. Required columns for the category
    for (const code of required(it.category)) {
      if (!empty(row[code])) continue;
      const kind = `${code} ${label.get(code) ?? ''}`;
      const s1 = sameColour.find((s) => !empty(s.raw[code]));
      if (s1) { put(code, s1.raw[code], 'same colour, other size'); continue; }
      if (!COLOUR.test(kind)) {
        const s2 = sibs.find((s) => !empty(s.raw[code]));
        if (s2) { put(code, s2.raw[code], `same style, ${s2.color || 'other colour'}`); continue; }
      }
      if (!COLOUR.test(kind) && !TEXT.test(kind)) {
        const c = catValue(it.category, code);
        if (c) put(code, c.value, `${Math.round(c.share * 100)}% of ${it.category.split('/').pop()} listings`);
      }
    }
    it.category = row[spec.category] || it.category;
  }

  if (!opts.dryRun && fills.length) await log('push', `Smart fix filled ${fills.length} value(s) on ${ch} from your other products before sending`);
  return fills;
}

// Rows that are waiting or were rejected, for the preview.
export async function waitingItems(ch: string): Promise<Item[]> {
  const spec = channelColumns[ch];
  if (!spec) return [];
  const chan = await db.channel.findUnique({ where: { key: ch } });
  const out: Item[] = [];
  if (chan) {
    const ls = await db.pendingChange.findMany({ where: { channelId: chan.id, OR: [{ approval: 'approved', submissionId: null }, { sendStatus: 'rejected' }] }, select: { outputRow: true, product: { select: { gtin: true } } } });
    for (const l of ls) { const row = { ...((l.outputRow ?? {}) as Row) }; out.push({ row, category: row[spec.category] ?? '', ref: { upc: l.product.gtin } }); }
  }
  const upcs = [
    ...(await db.channelEdit.findMany({ where: { channelKey: ch, status: { in: ['approved', 'rejected'] } }, select: { upcs: true } })).flatMap((e: { upcs: unknown }) => e.upcs as string[]),
    ...(await db.imageChange.findMany({ where: { channelKey: ch, OR: [{ status: 'approved' }, { sendStatus: 'rejected' }] }, select: { gtins: true } })).flatMap((e: { gtins: unknown }) => e.gtins as string[]),
  ];
  if (upcs.length) for (const c of await db.channelProduct.findMany({ where: { channelKey: ch, upc: { in: upcs } }, select: { upc: true, raw: true, category: true } })) out.push({ row: { ...((c.raw ?? {}) as Row) }, category: c.category ?? '', ref: { upc: c.upc } });
  return out;
}

// Live listings: fill what is missing and save it as Edit-products drafts to review and approve.
export async function fixLive(ch: string) {
  const spec = channelColumns[ch];
  if (!spec) throw new Error('Unknown marketplace');
  const cps = await db.channelProduct.findMany({ where: { channelKey: ch }, select: { upc: true, styleCode: true, color: true, title: true, images: true, category: true, raw: true } });
  const items: Item[] = cps.map((c: { upc: string; category: string | null; raw: unknown }) => ({ row: { ...((c.raw ?? {}) as Row) }, category: c.category ?? '', ref: { upc: c.upc } }));
  const fills = (await smartFill(ch, items, { dryRun: true })).filter((f) => f.value !== '(made when sending)');
  const byUpc = new Map<string, Fill[]>();
  for (const f of fills) { if (!byUpc.has(f.upc)) byUpc.set(f.upc, []); byUpc.get(f.upc)!.push(f); }

  const groups = new Map<string, { cp: (typeof cps)[number]; upcs: string[]; fields: Record<string, Row>; images: string[] }>();
  for (const cp of cps) {
    const fs = byUpc.get(cp.upc);
    if (!fs) continue;
    const gk = groupKeyOf(cp as never);
    if (!groups.has(gk)) groups.set(gk, { cp, upcs: [], fields: {}, images: [] });
    const g = groups.get(gk)!;
    g.upcs.push(cp.upc);
    const imgFills = fs.filter((f) => spec.images.includes(f.column));
    if (imgFills.length && !g.images.length) { const merged = spec.images.map((c) => ((cp.raw ?? {}) as Row)[c] || imgFills.find((f) => f.column === c)?.value || ''); g.images = merged.filter(Boolean); }
    const other = fs.filter((f) => !spec.images.includes(f.column));
    if (other.length) g.fields[cp.upc] = Object.fromEntries(other.map((f) => [f.column, f.value]));
  }

  let drafted = 0;
  for (const [groupKey, g] of groups) {
    const open = await db.channelEdit.findFirst({ where: { channelKey: ch, groupKey, status: { in: ['draft', 'approved', 'rejected'] } } });
    if (open?.status === 'approved') continue; // never undo something you approved
    const fields = { ...((open?.fields ?? {}) as Record<string, Row>) };
    for (const [u, f] of Object.entries(g.fields)) fields[u] = { ...(fields[u] ?? {}), ...f };
    const upcs = [...new Set([...((open?.upcs as string[]) ?? []), ...g.upcs])];
    const images = ((open?.images as string[]) ?? []).length ? (open!.images as string[]) : g.images;
    const data = { title: g.cp.title ?? '', color: g.cp.color ?? '', upcs, images, fields, status: 'draft', sendError: null };
    if (open) await db.channelEdit.update({ where: { id: open.id }, data: data as never });
    else await db.channelEdit.create({ data: { channelKey: ch, groupKey, ...data } as never });
    drafted++;
  }
  await log('approval', `Smart fix: ${fills.length} value(s) filled on ${drafted} live ${ch} colour(s) — drafts ready under Edit products`);
  return { fills: fills.length, drafted };
}
