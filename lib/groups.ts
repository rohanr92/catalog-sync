import { upcCheck } from "./upc-check";
import { db } from './db';
import { channelColumns, textColumns, sizeColumns, channelSizeOf } from './channel-specs';
import { loadSizeResolver, sourceSizeOf, isShoeCategory, type SizeSource } from './sizes';
import { loadFiller, type FillIssue } from './attributes';
import { getProducts, getChannelProducts } from './static-data';
import type { Group, SizeRow, FieldDiff } from './types';

type Row = Record<string, string>;
const pickImages = (row: Row, keys: string[]) => keys.map((k) => row[k]).filter((v) => v && v.startsWith('http'));

export async function buildGroups(channelKey: string): Promise<Group[]> {
  const ch = await db.channel.findUnique({ where: { key: channelKey } });
  const spec = channelColumns[channelKey];
  if (!ch || !spec) return [];
  const isSizeCol = sizeColumns[channelKey] ?? ((c: string) => c === spec.size);

  const [sizes, filler, products, onChannel, pending, imageSets, swatches, categoryMaps, firstRun] = await Promise.all([
    loadSizeResolver(channelKey),
    loadFiller(channelKey),
    getProducts(),
    getChannelProducts(channelKey),
    db.pendingChange.findMany({ where: { channelId: ch.id, approval: 'pending' }, select: { id: true, productId: true, changeType: true, fieldDiffs: true, outputRow: true, sendError: true, originImport: true } }),
    db.imageSet.findMany({ where: { channelKey } }),
    db.swatch.findMany(),
    db.categoryMap.findMany({ where: { channelId: ch.id } }),
    db.importRun.findFirst({ where: { channelKey: "nordstrom" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const overrides = await db.rowOverride.findMany({ where: { changeId: { in: pending.map((p) => p.id) } } });
  const overrideBy = new Map(overrides.map((o) => [o.changeId, o.values as Row]));
  const awaiting = new Set((((await db.setting.findUnique({ where: { key: "nordstromPull" } }))?.value as { awaitingFinal?: number[] } | undefined)?.awaitingFinal ?? []).map(String));
  const dupBy = new Map((await upcCheck(channelKey)).mismatches.map((m) => [m.nordstromUpc, m]));

  const byId = new Map(products.map((p) => [p.id, p]));
  const byGtin = new Map(products.map((p) => [p.gtin, p]));
  const chByUpc = new Map(onChannel.map((c) => [c.upc, c]));
  const byCategory = new Map<string, typeof onChannel>();
  for (const c of onChannel) { if (!c.category) continue; if (!byCategory.has(c.category)) byCategory.set(c.category, []); byCategory.get(c.category)!.push(c); }
  const customImages = new Map(imageSets.map((s) => [`${s.styleCode}|${s.color}`, s.images as string[]]));
  const swatchByKey = new Map(swatches.map((s) => [`${s.styleCode}|${s.color}`, s]));
  const catMap = new Map(categoryMaps.map((m) => [m.fromCategory, m.toCategory]));
  const vgc = (p: (typeof products)[number]) => (p.attrs as Row)['variant-group-code'] || (p.attrs as Row)['vpn'] || p.sku || p.gtin;
  const familyByVgc = new Map<string, typeof products>();
  for (const x of products) { const k = vgc(x); if (!familyByVgc.has(k)) familyByVgc.set(k, []); familyByVgc.get(k)!.push(x); }

  const categoryTemplate = new Map<string, Row | undefined>();
  function templateFor(category: string): Row | undefined {
    if (categoryTemplate.has(category)) return categoryTemplate.get(category);
    const rows = byCategory.get(category) ?? [];
    if (!rows.length) { categoryTemplate.set(category, undefined); return undefined; }
    const freq = new Map<string, number>();
    for (const r of rows) for (const [k, v] of Object.entries(r.raw as Row)) if (v) freq.set(`${k}=${v}`, (freq.get(`${k}=${v}`) ?? 0) + 1);
    let best = rows[0].raw as Row, bestScore = -1;
    for (const r of rows) { let s = 0; for (const [k, v] of Object.entries(r.raw as Row)) if (v) s += freq.get(`${k}=${v}`) ?? 0; if (s > bestScore) { bestScore = s; best = r.raw as Row; } }
    categoryTemplate.set(category, best);
    return best;
  }
  const sizePairsFor = (rows: typeof onChannel) => rows
    .map((c) => { const src = byGtin.get(c.upc); return { source: src ? sourceSizeOf(src.attrs as Row) : '', channel: c.size ?? channelSizeOf(channelKey, c.raw as Row) ?? '' }; })
    .filter((x) => x.source && x.channel);
  const sizeIn = (row: Row) => Object.entries(row).find(([k, v]) => isSizeCol(k) && v)?.[1] ?? '';

  type Ext = Group & { _template?: Row; _pairs?: { source: string; channel: string }[]; _catBlocked?: boolean };
  const groups = new Map<string, Ext>();
  const blockingIds = new Set<string>();

  for (const pc of pending) {
    const p = byId.get(pc.productId);
    if (!p) continue;
    const attrs = p.attrs as Row;
    const style = vgc(p);
    const color = p.color ?? '';
    const key = `${style}|${color}`;
    const targetCategory = catMap.get(p.categoryRaw ?? '') ?? '';

    let g = groups.get(key);
    if (!g) {
      const family = familyByVgc.get(style) ?? [];
      const sameColour = family.filter((x) => x.color === color).map((x) => chByUpc.get(x.gtin)).filter(Boolean) as typeof onChannel;
      const otherColour = family.filter((x) => x.color !== color).map((x) => chByUpc.get(x.gtin)).filter(Boolean) as typeof onChannel;
      const catTemplate = targetCategory ? templateFor(targetCategory) : undefined;
      const basis = sameColour.length ? 'same-colour' : otherColour.length ? 'other-colour' : catTemplate ? 'same-category' : 'none';
      const template = sameColour[0] ?? otherColour[0] ?? null;
      const nordstromImages = p.images.map((i) => i.sourceUrl);
      const images = customImages.get(key) ?? (basis === 'same-colour' && template ? pickImages(template.raw as Row, spec.images) : nordstromImages);
      const sw = swatchByKey.get(key);

      g = {
        key, styleCode: style, color, title: p.title, category: p.categoryRaw ?? '',
        thumb: images[0] ?? nordstromImages[0] ?? '', images,
        changeType: 'new', validation: 'valid', basis, basisSku: template?.channelSku ?? undefined,
        swatchUrl: sw?.url ?? (spec.swatch && template ? ((template.raw as Row)[spec.swatch] || undefined) : undefined),
        swatchSource: sw?.source ?? (spec.swatch && template && (template.raw as Row)[spec.swatch] ? 'existing' : undefined),
        sizes: [], diffs: pc.fieldDiffs as unknown as FieldDiff[],
        _template: (template?.raw as Row) ?? undefined,
        _pairs: sizePairsFor(sameColour.concat(otherColour)),
        newOnNordstrom: !!firstRun && new Date((p as unknown as { firstSeenAt?: Date }).firstSeenAt ?? 0).getTime() > firstRun.createdAt.getTime() + 60_000,
        _catBlocked: !template && !targetCategory,
      };
      if (g._catBlocked) {
        g.validation = 'blocked';
        g.blockedReason = `Nordstrom category "${p.categoryRaw}" is not mapped for ${channelKey}. Go to Categories and pick one.`;
      }
      groups.set(key, g);
    }

    const srcSize = sourceSizeOf(attrs);
    const isShoe = isShoeCategory(p.categoryRaw ?? '');
    const pairs = g._pairs?.length ? g._pairs : sizePairsFor(targetCategory ? byCategory.get(targetCategory) ?? [] : []);
    const resolved = sizes.resolve(style, srcSize, pairs, isShoe);

    let outputRow: Row;
    let note: string | undefined;
    let issueList: FillIssue[] = [];

    if (g._template) {
      // Existing row for this style on the marketplace: copy it, change identity and size only.
      outputRow = { ...g._template };
      outputRow[spec.upc] = p.gtin;
      if (spec.altUpc) outputRow[spec.altUpc] = p.gtin;
      outputRow[spec.sku] = p.sku ?? p.gtin;
      let placed = false;
      for (const k of Object.keys(outputRow)) if (isSizeCol(k) && outputRow[k]) { outputRow[k] = resolved.size; placed = true; }
      if (!placed && spec.size) outputRow[spec.size] = resolved.size;
      spec.images.forEach((col, i) => { outputRow[col] = g!.images[i] ?? ''; });
      if (spec.swatch) outputRow[spec.swatch] = g.swatchUrl ?? '';
      if (g.basis === 'other-colour') { outputRow[spec.color] = color; note = 'Copied from another colour — check images'; }
      if (spec.swatch && !g.swatchUrl) note = (note ? note + '; ' : '') + 'Swatch missing — make one';
      if (resolved.source === 'none') issueList.push({ code: '__size', label: 'Size', problem: `"${srcSize}" has no ${channelKey} size — pick one`, required: true });
    } else if (targetCategory) {
      // Style not on the marketplace: build from Nordstrom on the category's own rows and columns.
      const tx = textColumns[channelKey];
      const tpl = templateFor(targetCategory);
      const base: Row = {};
      base[spec.category] = targetCategory;
      base[spec.upc] = p.gtin;
      if (spec.altUpc) base[spec.altUpc] = p.gtin;
      base[spec.sku] = p.sku ?? p.gtin;
      base[spec.style] = style;
      base[spec.title] = p.title;
      base[spec.color] = color;
      if (tx) { base[tx.description] = attrs['copy-description'] ?? ''; base[tx.brand] = attrs['product-label-name'] ?? 'Menina Step'; }
      spec.images.forEach((col, i) => { base[col] = g!.images[i] ?? ''; });
      if (spec.swatch) base[spec.swatch] = g.swatchUrl ?? '';
      if (channelKey === 'kohls') base['style_description'] = p.title.replace(/[^A-Za-z ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

      const filled = filler.fill(targetCategory, attrs, base, tpl, resolved.size || srcSize);
      outputRow = filled.row;
      issueList = filled.issues;
      note = g.basis === 'same-category' ? `Not on ${channelKey} yet — built on its existing ${targetCategory.split('/').pop()} rows` : 'Built from Nordstrom via attribute mapping';
    } else {
      outputRow = { ...(pc.outputRow as Row) };
    }

    if (pc.sendError) issueList.unshift({ code: "__rejected", label: `Rejected by ${channelKey}`, problem: pc.sendError, required: false });
    const ov = overrideBy.get(pc.id);
    if (ov) Object.assign(outputRow, ov);
    const sizeNow = sizeIn(outputRow);
    issueList = issueList.filter((i) => (i.code === '__size' ? !sizeNow : !outputRow[i.code]));
    if (issueList.some((i) => i.required)) blockingIds.add(pc.id);
    if (issueList.length) note = (note ? note + ' · ' : '') + `${issueList.length} field issue${issueList.length === 1 ? '' : 's'}`;

    let sizeSource: SizeSource = resolved.source;
    let channelSize = resolved.size;
    if (sizeNow && sizeNow !== resolved.size) { sizeSource = resolved.source === 'none' || ov ? 'manual' : resolved.source; channelSize = sizeNow; }

    const dupe = dupBy.get(p.gtin);
    if (dupe) (g.possibleDuplicates ??= []).push({ size: srcSize, upc: dupe.marketplaceUpc, sku: dupe.marketplaceSku, nordstromUpc: p.gtin });
    if (pc.originImport && awaiting.has(pc.originImport)) g.nordstromProcessing = true;
    if (pc.changeType === 'updated') g.changeType = 'updated';
    g.sizes.push({
      changeId: pc.id, gtin: p.gtin, sku: p.sku ?? '', size: srcSize || channelSize, channelSize,
      sizeSource: sizeSource as SizeRow['sizeSource'], changeType: pc.changeType as SizeRow['changeType'],
      outputRow, note, issues: issueList.map((i) => `${i.label}: ${i.problem}`),
    });
  }

  const out = [...groups.values()].map((g) => {
    if (!g._catBlocked) {
      const blocked = g.sizes.filter((s) => blockingIds.has(s.changeId)).length;
      if (blocked) { g.validation = 'blocked'; g.blockedReason = `Required ${channelKey} fields missing on ${blocked} of ${g.sizes.length} sizes — see the list below, or fill them in Preview sheet.`; }
      else { g.validation = 'valid'; g.blockedReason = undefined; }
    }
    delete g._template; delete g._pairs; delete g._catBlocked;
    g.sizes.sort((a, b) => parseFloat(a.size) - parseFloat(b.size) || a.size.localeCompare(b.size));
    return g as Group;
  });
  out.sort((a, b) => (a.validation === b.validation ? a.title.localeCompare(b.title) || a.color.localeCompare(b.color) : a.validation === 'blocked' ? 1 : -1));
  return out;
}
