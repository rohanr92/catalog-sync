import { db } from './db';
import { cachedBy } from './cache';
import { channelColumns, sizeColumns, textColumns, OFFER_COLUMNS } from './channel-specs';

type Row = Record<string, string>;

export interface HealthIssue { kind: 'main-image' | 'images' | 'swatch' | 'description' | 'required' | 'invalid' | 'size'; text: string; points: number }
export interface HealthItem {
  channel: string;
  key: string;            // style|colour on that marketplace
  styleCode: string;
  color: string;
  title: string;
  category: string;
  sizes: { upc: string; size: string }[];
  images: string[];
  slots: number;
  swatchUrl: string | null;
  nordStyle: string | null; // Nordstrom style + colour, used to open the image editor
  nordColor: string | null;
  score: number;
  issues: HealthIssue[];
}

const NAMES: Record<string, string> = { nordstrom: 'Nordstrom', macys: "Macy's", kohls: "Kohl's", jcpenney: 'JCPenney', debenhams: 'Debenhams', targetplus: 'Target Plus' };
export const channelName = (k: string) => NAMES[k] ?? k;

const norm = (u: string) => String(u ?? '').replace(/\D/g, '').replace(/^0+/, '');
const low = (s: unknown) => String(s ?? '').trim().toLowerCase();
const isImageCode = (c: string) => /image|swatch|media/i.test(c);

// Is this column required for this category? Handles the shapes the Columns tab gets stored in.
function requiredFor(requiredBy: unknown, category: string): boolean {
  if (!requiredBy) return false;
  if (Array.isArray(requiredBy)) return requiredBy.map(low).includes(low(category));
  if (typeof requiredBy !== 'object') return false;
  for (const [cat, v] of Object.entries(requiredBy as Record<string, unknown>)) {
    const req = v === true || /required/i.test(String(v ?? '')) && !/not required/i.test(String(v ?? ''));
    if (!req) continue;
    if (['', '*', 'all', 'default'].includes(low(cat)) || low(cat) === low(category)) return true;
  }
  return false;
}

interface Unit { upc: string; size: string; raw: Row; images: string[]; swatch: string | null; category: string; title: string; style: string; color: string; description: string }

async function loadUnits(channel: string): Promise<Unit[]> {
  if (channel === 'nordstrom') {
    const ps = await db.product.findMany({ select: { gtin: true, sku: true, title: true, color: true, description: true, categoryRaw: true, attrs: true, images: { orderBy: { position: 'asc' }, select: { sourceUrl: true, storedUrl: true } } } });
    return ps.map((p) => {
      const raw = (p.attrs ?? {}) as Row;
      return {
        upc: p.gtin, size: raw['size-description'] ?? '', raw, images: p.images.map((i) => i.storedUrl || i.sourceUrl).filter(Boolean),
        swatch: 'n/a', category: p.categoryRaw ?? raw['npt'] ?? '', title: p.title, style: raw['variant-group-code'] || raw['vpn'] || p.sku || p.gtin,
        color: p.color ?? raw['color-description'] ?? '', description: p.description ?? raw['product-description'] ?? '',
      };
    });
  }
  const spec = channelColumns[channel];
  const cps = await db.channelProduct.findMany({ where: { channelKey: channel }, select: { upc: true, styleCode: true, color: true, size: true, category: true, title: true, images: true, swatchUrl: true, raw: true } });
  const descCol = textColumns[channel]?.description;
  return cps.map((c) => {
    const raw = (c.raw ?? {}) as Row;
    return {
      upc: c.upc, size: c.size ?? '', raw, images: ((c.images as string[]) ?? []).filter((u) => typeof u === 'string' && u.startsWith('http')),
      swatch: c.swatchUrl || (spec?.swatch ? raw[spec.swatch] || null : 'n/a'), category: c.category ?? '', title: c.title ?? '',
      style: c.styleCode ?? raw[spec?.style ?? ''] ?? c.upc, color: c.color ?? '', description: descCol ? raw[descCol] ?? '' : '',
    };
  });
}

async function computeChannel(channel: string, nordByUpc: Map<string, { style: string; color: string }>, swatches: Set<string>): Promise<HealthItem[]> {
  const spec = channelColumns[channel];
  const slots = spec?.images.length ?? 8;
  const target = Math.min(4, slots);
  const [units, specs, lists] = await Promise.all([
    loadUnits(channel),
    db.columnSpec.findMany({ where: { channelKey: channel }, select: { code: true, label: true, requiredBy: true } }),
    db.valueList.findMany({ where: { channelKey: channel }, select: { attribute: true, values: true } }),
  ]);
  const label = new Map(specs.map((s) => [s.code, s.label || s.code]));
  const asText = (v: unknown): string[] => (typeof v === 'string' || typeof v === 'number' ? [String(v)] : v && typeof v === 'object' ? ['code', 'label', 'value', 'name'].map((k) => (v as Record<string, unknown>)[k]).filter((x) => typeof x === 'string' || typeof x === 'number').map(String) : []);
  const allowed = new Map<string, Set<string>>(lists.map((l) => [l.attribute, new Set((Array.isArray(l.values) ? (l.values as unknown[]) : []).flatMap(asText).map(low))]));
  // Lists that hold names only: a stored number there is the marketplace's own code, not a wrong value.
  const numeric = new Set([...allowed].filter(([, set]) => [...set].some((x) => /^\d{3,}$/.test(x))).map(([k]) => k));
  const isSize = sizeColumns[channel] ?? ((c: string) => c === 'size-description');
  const reqCache = new Map<string, string[]>();
  const requiredCodes = (cat: string) => {
    if (!reqCache.has(cat)) reqCache.set(cat, specs.filter((s) => !isImageCode(s.code) && !OFFER_COLUMNS.has(s.code) && requiredFor(s.requiredBy, cat)).map((s) => s.code));
    return reqCache.get(cat)!;
  };

  const groups = new Map<string, Unit[]>();
  for (const u of units) { const k = `${u.style}|${u.color}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(u); }

  const out: HealthItem[] = [];
  for (const [key, us] of groups) {
    const first = us.reduce((a, b) => (b.images.length > a.images.length ? b : a), us[0]);
    const issues: HealthIssue[] = [];
    const mainCol = spec?.images[0];
    const hasMain = channel === 'nordstrom' ? first.images.length > 0 : us.some((u) => (mainCol ? !!u.raw[mainCol] : u.images.length > 0));
    if (!hasMain) issues.push({ kind: 'main-image', text: 'No main image', points: 35 });
    const missingImgs = Math.max(0, target - first.images.length);
    if (hasMain && missingImgs) issues.push({ kind: 'images', text: `Only ${first.images.length} image${first.images.length === 1 ? '' : 's'} (aim for ${target}+ of ${slots})`, points: missingImgs * 7 });

    const nord = us.map((u) => nordByUpc.get(norm(u.upc))).find(Boolean) ?? null;
    if (spec?.swatch && !us.some((u) => u.swatch && u.swatch !== 'n/a') && !(nord && swatches.has(`${low(nord.style)}|${low(nord.color)}`)))
      issues.push({ kind: 'swatch', text: 'No swatch', points: 10 });

    const desc = us.map((u) => u.description).sort((a, b) => b.length - a.length)[0] ?? '';
    if (channel === 'nordstrom' || textColumns[channel]) {
      if (!desc.trim()) issues.push({ kind: 'description', text: 'No description', points: 15 });
      else if (desc.trim().length < 150) issues.push({ kind: 'description', text: `Short description (${desc.trim().length} characters)`, points: 8 });
    }

    // Required columns for the category, counted once per column across all sizes.
    const missing = new Map<string, number>();
    for (const u of us) for (const c of requiredCodes(u.category)) if (!String(u.raw[c] ?? '').trim()) missing.set(c, (missing.get(c) ?? 0) + 1);
    if (missing.size) issues.push({ kind: 'required', text: `Missing required: ${[...missing.keys()].slice(0, 6).map((c) => label.get(c) ?? c).join(', ')}${missing.size > 6 ? ` +${missing.size - 6} more` : ''}`, points: Math.min(30, missing.size * 6) });

    // Values the marketplace doesn't accept (its own ReferenceData list).
    const bad = new Map<string, string>();
    const badSizes = new Set<string>();
    for (const u of us) for (const [c, v] of Object.entries(u.raw)) {
      const list = allowed.get(c);
      const val = String(v ?? '').trim();
      if (!list || !list.size || !val || (/^\d+$/.test(val) && !numeric.has(c))) continue;
      const ok = list.has(low(val)) || val.split('|').every((p) => list.has(low(p)));
      if (ok) continue;
      if (isSize(c)) badSizes.add(val); else if (!bad.has(c)) bad.set(c, val);
    }
    if (badSizes.size) issues.push({ kind: 'size', text: `Size not on the ${channelName(channel)} list: ${[...badSizes].slice(0, 5).join(', ')}`, points: 10 });
    if (bad.size) issues.push({ kind: 'invalid', text: `Value not accepted: ${[...bad].slice(0, 4).map(([c, v]) => `${label.get(c) ?? c} = "${v}"`).join(', ')}${bad.size > 4 ? ` +${bad.size - 4} more` : ''}`, points: Math.min(20, bad.size * 5) });

    const score = Math.max(0, 100 - issues.reduce((n, i) => n + i.points, 0));
    out.push({
      channel, key, styleCode: first.style, color: first.color, title: first.title, category: first.category,
      sizes: us.map((u) => ({ upc: u.upc, size: u.size })).sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true })),
      images: first.images, slots, swatchUrl: us.map((u) => u.swatch).find((s) => s && s !== 'n/a') ?? null,
      nordStyle: channel === 'nordstrom' ? first.style : nord?.style ?? null, nordColor: channel === 'nordstrom' ? first.color : nord?.color ?? null,
      score, issues,
    });
  }
  return out;
}

export async function computeHealth(): Promise<{ items: HealthItem[]; channels: string[] }> {
  return cachedBy('health:all', ['Product', 'ProductImage', 'ChannelProduct', 'ColumnSpec', 'ValueList', 'Swatch'], 10 * 60_000, async () => {
    const products = await db.product.findMany({ select: { gtin: true, sku: true, color: true, attrs: true } });
    const nordByUpc = new Map<string, { style: string; color: string }>(products.map((p): [string, { style: string; color: string }] => { const a = (p.attrs ?? {}) as Row; return [norm(p.gtin), { style: a['variant-group-code'] || a['vpn'] || p.sku || p.gtin, color: p.color ?? '' }]; }));
    const swatches = new Set<string>((await db.swatch.findMany({ select: { styleCode: true, color: true } })).map((s) => `${low(s.styleCode)}|${low(s.color)}`));
    const keys = (await db.channelProduct.groupBy({ by: ['channelKey'] })).map((g) => g.channelKey).filter((k) => k !== 'nordstrom');
    const channels = [...(products.length ? ['nordstrom'] : []), ...keys];
    const items: HealthItem[] = [];
    for (const ch of channels) items.push(...(await computeChannel(ch, nordByUpc, swatches)));
    items.sort((a, b) => a.score - b.score);
    return { items, channels };
  });
}
