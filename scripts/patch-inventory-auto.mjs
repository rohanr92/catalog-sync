import fs from 'node:fs';

const edits = [
  { f: 'lib/inventory.ts', done: 'autoMinutes', parts: [
    ['export interface InvCfg { buffers: Record<string, number> } // units kept back per marketplace',
     'export interface InvCfg { buffers: Record<string, number>; autoMinutes?: number; orderTrigger?: boolean; orderDelay?: number } // buffers = units kept back per marketplace'],
  ] },
  { f: 'app/api/inventory/route.ts', done: 'getJob', parts: [
    [`import { log } from '@/lib/log';`, `import { log } from '@/lib/log';\nimport { getJob } from '@/lib/inventory-jobs';`],
    [`    return NextResponse.json({ cols: ['shopify', ...marketplaces],`, `    const cfg = await getCfg();\n    const auto = { every: cfg.autoMinutes ?? 10, onOrder: cfg.orderTrigger !== false, delay: cfg.orderDelay ?? 2, job: await getJob() };\n    return NextResponse.json({ auto, cols: ['shopify', ...marketplaces],`],
    [`    if (b.action === 'fix')`, `    if (b.action === 'auto') {\n      const cfg = await getCfg();\n      cfg.autoMinutes = Math.max(0, Math.floor(Number(b.every) || 0));\n      cfg.orderTrigger = !!b.onOrder;\n      cfg.orderDelay = Math.min(30, Math.max(1, Math.floor(Number(b.delay) || 2)));\n      await saveCfg(cfg);\n      await log('settings', \`Inventory auto-refresh: every \${cfg.autoMinutes || 'off'} min, after orders \${cfg.orderTrigger ? cfg.orderDelay + ' min later' : 'off'}\`);\n      return NextResponse.json({ ok: true });\n    }\n    if (b.action === 'fix')`],
  ] },
  { f: 'app/inventory/page.tsx', done: 'Auto refresh', parts: [
    [`interface Data { cols: string[];`, `interface Auto { every: number; onOrder: boolean; delay: number; job: { lastFull: string | null; lastReason: string | null; pendingAt: string | null; pendingWhy: string | null } }\ninterface Data { auto?: Auto; cols: string[];`],
    [`  const [editing, setEditing] = useState<Editing | null>(null);\n`, `  const [editing, setEditing] = useState<Editing | null>(null);\n  const [auto, setAuto] = useState<{ every: string; onOrder: boolean; delay: string } | null>(null);\n`],
    [`  async function check(ch: string)`, `  async function saveAuto() {\n    if (!auto) return;\n    try { await post({ action: 'auto', ...auto }); toast.success('Auto refresh saved'); setAuto(null); load(); } catch (e) { toast.error((e as Error).message); }\n  }\n  async function check(ch: string)`],
    [`        <div className="iv-cards">`, `        {data?.auto && (() => { const a = auto ?? { every: String(data.auto.every), onOrder: data.auto.onOrder, delay: String(data.auto.delay) }; const j = data.auto.job; return (
          <div className="iv-card" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>Auto refresh</b>
            <span>every</span>
            <select value={a.every} onChange={(e) => setAuto({ ...a, every: e.target.value })} style={{ padding: '4px 6px', border: '1px solid var(--rule-strong)', borderRadius: 5, font: 'inherit', fontSize: 12 }}>
              {['0', '5', '10', '15', '30', '60'].map((m) => <option key={m} value={m}>{m === '0' ? 'off' : \`\${m} min\`}</option>)}
            </select>
            <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={a.onOrder} onChange={(e) => setAuto({ ...a, onOrder: e.target.checked })} /> and after a new marketplace order, pull</label>
            <select value={a.delay} disabled={!a.onOrder} onChange={(e) => setAuto({ ...a, delay: e.target.value })} style={{ padding: '4px 6px', border: '1px solid var(--rule-strong)', borderRadius: 5, font: 'inherit', fontSize: 12 }}>
              {['1', '2', '3', '5', '10'].map((m) => <option key={m} value={m}>{m} min later</option>)}
            </select>
            {auto && <button className="btn primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={saveAuto}>Save</button>}
            <span className="status-line" style={{ flex: 1, minWidth: 200 }}>{j.pendingAt ? \`⏳ \${j.pendingWhy} — pulling at \${new Date(j.pendingAt).toLocaleTimeString()}\` : j.lastFull ? \`Last auto pull \${ago(j.lastFull)} (\${j.lastReason})\` : 'Runs on the live server (Railway), not on your Mac.'}</span>
          </div>
        ); })()}

        <div className="iv-cards">`],
  ] },
  { f: 'instrumentation.ts', done: 'inventoryTick', parts: [
    [`  job('autopush', 5 * 60_000, async () => { const { autoPushTick } = await import('./lib/dispatch'); await autoPushTick(); });`,
     `  job('autopush', 5 * 60_000, async () => { const { autoPushTick } = await import('./lib/dispatch'); await autoPushTick(); });\n  job('inventory', 60_000, async () => { const { inventoryTick } = await import('./lib/inventory-jobs'); await inventoryTick(); });`],
  ] },
];

const bad = [];
for (const { f, done, parts } of edits) {
  if (!fs.existsSync(f)) { bad.push(`${f} (missing — run the Inventory steps first)`); continue; }
  const s = fs.readFileSync(f, 'utf8');
  if (s.includes(done)) continue;
  parts.forEach(([a], i) => { if (s.split(a).length !== 2) bad.push(`${f} part ${i}`); });
}
if (bad.length) { console.log('STOPPED - nothing changed. Not found: ' + bad.join(', ')); process.exit(1); }
for (const { f, done, parts } of edits) {
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes(done)) { console.log('Already done: ' + f); continue; }
  for (const [a, b] of parts) s = s.replace(a, () => b);
  fs.writeFileSync(f, s);
  console.log('OK - ' + f);
}
