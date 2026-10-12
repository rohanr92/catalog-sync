// Sales: shows the real error instead of "Could not load sales", Mirakl date format, quicker "Update now".
import fs from 'node:fs';
const edits = [
  ['lib/client-cache.ts', [
    ["    const text = await r.text();\n    const data = JSON.parse(text) as { error?: unknown };",
     "    const text = await r.text();\n    let data: { error?: unknown };\n    try { data = JSON.parse(text); }\n    catch { throw new Error(`Server error ${r.status}: ${text.replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 200) || 'no answer'}`); }"],
  ]],
  ['app/sales/page.tsx', [
    [".catch(() => toast.error('Could not load sales'))",
     ".catch((e: Error) => setData((d) => ({ ...(d ?? { days, channels: [], summary: {}, status: {}, counts: {}, total: 0, page: 1, per: 50, rows: [] }), error: e.message })))"],
  ]],
  ['lib/sales.ts', [
    ["const DEAD = new Set(['CANCELED', 'CANCELLED', 'REFUSED']);\n",
     "const DEAD = new Set(['CANCELED', 'CANCELLED', 'REFUSED']);\nconst iso = (d: Date | string) => new Date(d).toISOString().replace(/\\.\\d{3}Z$/, 'Z'); // Mirakl date format: 2026-10-12T08:00:00Z\n"],
    ["return { from: new Date(Date.now() - HISTORY_DAYS * DAY).toISOString(),", "return { from: iso(new Date(Date.now() - HISTORY_DAYS * DAY)),"],
    ["const j = await getOrders(ch, { start_date: s.from,", "const j = await getOrders(ch, { start_date: iso(s.from),"],
    ["const since = new Date(new Date(s.lastSync ?? started).getTime() - 5 * 60_000).toISOString();", "const since = iso(new Date(new Date(s.lastSync ?? started).getTime() - 5 * 60_000));"],
    ["export async function salesTick() {", "export async function salesTick(maxPages = 5) {"],
    ["const s = await syncChannel(ch);", "const s = await syncChannel(ch, maxPages);"],
  ]],
];
const out = {};
for (const [file, reps] of edits) {
  if (!fs.existsSync(file)) { console.log(`STOPPED: ${file} not found`); process.exit(1); }
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of reps) {
    if (s.includes(b)) continue;
    const n = s.split(a).length - 1;
    if (n !== 1) { console.log(`STOPPED: ${file} — anchor found ${n} times: ${a.trim().slice(0, 70)}`); process.exit(1); }
    s = s.replace(a, () => b);
  }
  out[file] = s;
}
for (const [file, s] of Object.entries(out)) { fs.copyFileSync(file, file + '.bak'); fs.writeFileSync(file, s); console.log('OK', file); }
console.log('All done.');
