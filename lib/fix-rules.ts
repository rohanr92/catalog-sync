import * as XLSX from 'xlsx';
import { db } from './db';
import { channelColumns } from './channel-specs';
import { ensureSwatch } from './swatch';
import { log } from './log';

type Row = Record<string, string>;
export type FixAction = 'images' | 'swatch' | 'default' | 'map' | 'copy';
export interface FixRule {
  id: string;
  column: string;         // marketplace column code the rule fills
  action: FixAction;
  value?: string;         // default / map-to value, or source column for copy
  from?: string;          // map: only when the current value equals this ('' = always)
  codes: string[];        // error codes / messages this rule answers
  label: string;          // the error text it came from
  enabled: boolean;
  applied: number;        // rows fixed so far
  createdAt: string;
}
export interface ErrorGroup { sig: string; code: string; column: string; columnLabel: string; message: string; count: number; lastSeen: string; suggest: FixAction; ruleId: string | null }

const key = (ch: string) => `fixRules:${ch}`;
const low = (s: unknown) => String(s ?? '').trim().toLowerCase();
const digits = (u: string) => String(u ?? '').replace(/\D/g, '').replace(/^0+/, '');

export async function getRules(ch: string): Promise<FixRule[]> {
  return ((await db.setting.findUnique({ where: { key: key(ch) } }))?.value as unknown as FixRule[]) ?? [];
}
export async function saveRules(ch: string, rules: FixRule[]) {
  await db.setting.upsert({ where: { key: key(ch) }, update: { value: rules as never }, create: { key: key(ch), value: rules as never } });
}

// ---------- reading Mirakl error reports ----------

interface Hit { code: string; column: string; label: string; message: string }

function grid(buf: Buffer): string[][] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }).map((r) => r.map((c) => String(c ?? '').trim()));
}

function fromMessage(text: string): Hit[] {
  // "2010|The attribute 'main_image' is required" or "MCM-05000: ..." — one or more per cell
  return text.split(/\s*[;\n]\s*|,(?=\s*[A-Z]{2,}-?\d|\s*\d{3,}\|)/).map((t) => t.trim()).filter(Boolean).map((t) => {
    const code = (t.match(/^([A-Z]{2,}-?\d+|\d{3,})\s*[|:-]/) ?? [])[1] ?? '';
    const column = (t.match(/'([A-Za-z0-9_:()\-. ]+)'/) ?? [])[1] ?? '';
    return { code, column, label: '', message: t.replace(/^([A-Z]{2,}-?\d+|\d{3,})\s*[|:-]\s*/, '') };
  });
}

export function parseErrorReport(buf: Buffer): Hit[] {
  const g = grid(buf);
  const out: Hit[] = [];
  for (let h = 0; h < Math.min(6, g.length); h++) {
    const head = g[h].map(low);
    const ci = head.findIndex((c) => /error[-_ ]?code/.test(c));
    const mi = head.findIndex((c) => /error[-_ ]?message|^message$/.test(c));
    const ai = head.findIndex((c) => /attribute[-_ ]?code/.test(c));
    const li = head.findIndex((c) => /attribute[-_ ]?label/.test(c));
    const ei = head.findIndex((c) => /^errors?$|^error[-_ ]?(lines?|details?)$/.test(c));
    if (ci >= 0 || mi >= 0) {
      for (const r of g.slice(h + 1)) {
        const message = mi >= 0 ? r[mi] : '';
        if (!message && !(ci >= 0 && r[ci])) continue;
        const col = (ai >= 0 ? r[ai] : '') || ((message.match(/'([A-Za-z0-9_:()\-. ]+)'/) ?? [])[1] ?? '');
        out.push({ code: ci >= 0 ? r[ci] : '', column: col.split(/[,|]/)[0].trim(), label: li >= 0 ? r[li] : '', message });
      }
      return out;
    }
    if (ei >= 0) {
      for (const r of g.slice(h + 1)) if (r[ei]) out.push(...fromMessage(r[ei]));
      return out;
    }
  }
  return out;
}

// ---------- grouping errors from recent sends ----------

export async function errorGroups(ch: string): Promise<ErrorGroup[]> {
  const spec = channelColumns[ch];
  const rules = await getRules(ch);
  const subs = await db.submission.findMany({ where: { channelKey: ch, OR: [{ rejected: { gt: 0 } }, { status: 'failed' }] }, orderBy: { sentAt: 'desc' }, take: 40, select: { sentAt: true, reports: true, reportFile: true, errorReport: true } });
  const labels = new Map<string, string>((await db.columnSpec.findMany({ where: { channelKey: ch }, select: { code: true, label: true } })).map((c: { code: string; label: string }): [string, string] => [c.code, c.label]));
  const groups = new Map<string, ErrorGroup>();

  const specCols = new Set<string>(spec ? [spec.upc, spec.sku, spec.style, spec.color, spec.category, spec.title, ...spec.images, spec.swatch ?? '', spec.size ?? ''].filter(Boolean) : []);
  const add = (raw: Hit, at: Date) => {
    // A quoted word that is not a column (e.g. the category value itself) is not the column.
    const hit = raw.column && !labels.has(raw.column) && !specCols.has(raw.column) ? { ...raw, column: '' } : raw;
    const norm = hit.message.replace(/\d{6,}/g, '#').replace(/"[^"]*"/g, '"…"').slice(0, 160);
    const sig = hit.code || hit.column ? `${hit.code}|${hit.column}` : `msg|${low(norm)}`;
    const g = groups.get(sig);
    if (g) { g.count++; if (at.toISOString() > g.lastSeen) g.lastSeen = at.toISOString(); return; }
    const isImg = !!spec && spec.images.includes(hit.column);
    const suggest: FixAction = isImg || /main_?image|image.*required/i.test(hit.message) ? 'images'
      : spec?.swatch && (hit.column === spec.swatch || /swatch/i.test(hit.message)) ? 'swatch'
      : /category/i.test(hit.message) && !hit.column ? 'map' : 'default';
    const column = hit.column || (suggest === 'images' ? spec?.images[0] ?? '' : suggest === 'swatch' ? spec?.swatch ?? '' : suggest === 'map' ? spec?.category ?? '' : '');
    groups.set(sig, { sig, code: hit.code, column, columnLabel: hit.label || labels.get(column) || column, message: hit.message || hit.code, count: 1, lastSeen: at.toISOString(), suggest, ruleId: null });
  };

  for (const s of subs) {
    const files = ((s.reports as unknown as { file: string }[] | null) ?? []).map((r) => r.file).filter(Boolean);
    if (!files.length && s.reportFile) files.push(s.reportFile);
    let found = 0;
    for (const f of files) { try { const hits = parseErrorReport(Buffer.from(f, 'base64')); hits.forEach((h) => add(h, s.sentAt)); found += hits.length; } catch { /* unreadable file */ } }
    if (!found) for (const r of ((s.errorReport as unknown as { message: string }[] | null) ?? [])) add(fromMessage(r.message)[0] ?? { code: '', column: '', label: '', message: r.message }, s.sentAt);
  }
  for (const g of groups.values()) {
    const r = rules.find((x) => x.codes.includes(g.sig) || (g.column && x.column === g.column && x.action === g.suggest));
    g.ruleId = r?.id ?? null;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// ---------- applying rules before a send ----------

export async function applyFixRules(ch: string, items: { row: Row; category: string; ref: { upc: string } }[]) {
  const spec = channelColumns[ch];
  const rules = (await getRules(ch)).filter((r) => r.enabled);
  if (!spec || !rules.length || !items.length) return 0;

  // Nordstrom product per UPC, for images / swatch rules
  const need = rules.some((r) => r.action === 'images' || r.action === 'swatch');
  const nord = new Map<string, { style: string; color: string; images: string[] }>();
  if (need) {
    const wanted = [...new Set(items.map((i) => digits(i.ref.upc)))];
    const variants = wanted.flatMap((d) => [d, d.padStart(12, '0'), d.padStart(13, '0'), d.padStart(14, '0')]);
    const ps = await db.product.findMany({ where: { gtin: { in: variants } }, select: { gtin: true, sku: true, color: true, attrs: true, images: { orderBy: { position: 'asc' }, select: { sourceUrl: true, storedUrl: true } } } });
    for (const p of ps) {
      const a = (p.attrs ?? {}) as Row;
      nord.set(digits(p.gtin), { style: a['variant-group-code'] || a['vpn'] || p.sku || p.gtin, color: p.color ?? '', images: p.images.map((i) => i.storedUrl || i.sourceUrl).filter(Boolean) });
    }
  }

  const hits = new Map<string, number>();
  const swatchCache = new Map<string, string>();
  for (const it of items) {
    const row = it.row;
    const n = nord.get(digits(it.ref.upc));
    for (const r of rules) {
      let changed = false;
      if (r.action === 'images') {
        if (!row[spec.images[0]] && n?.images.length) { spec.images.forEach((c, i) => { if (!row[c] && n.images[i]) row[c] = n.images[i]; }); changed = true; }
      } else if (r.action === 'swatch') {
        if (spec.swatch && !row[spec.swatch]) {
          const style = n?.style ?? row[spec.style] ?? '', color = n?.color ?? row[spec.color] ?? '';
          const k = `${style}|${color}`;
          if (!swatchCache.has(k)) swatchCache.set(k, (await ensureSwatch(style, color, row[spec.images[0]] || n?.images[0]).catch(() => null))?.url ?? '');
          const url = swatchCache.get(k)!;
          if (url) { row[spec.swatch] = url; changed = true; }
        }
      } else if (r.action === 'default') {
        if (!String(row[r.column] ?? '').trim() && r.value) { row[r.column] = r.value; changed = true; }
      } else if (r.action === 'map') {
        if (r.value && (!r.from ? low(row[r.column]) !== low(r.value) : low(row[r.column]) === low(r.from))) { row[r.column] = r.value; changed = true; }
      } else if (r.action === 'copy') {
        if (!String(row[r.column] ?? '').trim() && r.value && row[r.value]) { row[r.column] = row[r.value]; changed = true; }
      }
      if (changed) hits.set(r.id, (hits.get(r.id) ?? 0) + 1);
    }
    it.category = row[spec.category] || it.category;
  }

  const total = [...hits.values()].reduce((a, b) => a + b, 0);
  if (total) {
    const all = await getRules(ch);
    all.forEach((r) => { r.applied = (r.applied ?? 0) + (hits.get(r.id) ?? 0); });
    await saveRules(ch, all);
    await log('push', `Auto-fix rules filled ${total} value(s) on ${ch} before sending`);
  }
  return total;
}
