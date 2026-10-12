// Speeds up Inventory + Go-live tracker pages (cache + loading indicator).
import fs from 'node:fs';
const edits = [
  ['lib/inventory.ts', [
    ["import { channelColumns } from './channel-specs';\n", "import { channelColumns } from './channel-specs';\nimport { memo, forget } from './memo';\n"],
    ["create: { key, value: value as never } }); }\n", "create: { key, value: value as never } }); forget(); }\n"],
    ["export async function buildGrid() {\n", "export const buildGrid = (fresh = false) => memo('inv-grid', 120_000, buildGridNow, fresh);\nasync function buildGridNow() {\n"],
  ]],
  ['lib/tracker.ts', [
    ["import { getSnap, normUpc, nameOf } from './inventory';\n", "import { getSnap, normUpc, nameOf } from './inventory';\nimport { memo } from './memo';\n"],
    ["export async function buildTracker() {\n", "export const buildTracker = (fresh = false) => memo('tracker', 60_000, buildTrackerNow, fresh);\nasync function buildTrackerNow() {\n"],
  ]],
  ['lib/inventory-jobs.ts', [
    ["import { getCfg, pullAll, connectedChannels, nameOf } from './inventory';\n", "import { getCfg, pullAll, connectedChannels, nameOf, buildGrid } from './inventory';\nimport { buildTracker } from './tracker';\n"],
    ["    await saveJob(s);\n", "    await saveJob(s);\n    await Promise.allSettled([buildGrid(), buildTracker()]); // keep both pages ready\n"],
  ]],
  ['app/inventory/page.tsx', [
    ["  const [maps, setMaps] = useState<Record<string, string>>({});\n", "  const [maps, setMaps] = useState<Record<string, string>>({});\n  const [loading, setLoading] = useState(false);\n"],
    ["  const load = useCallback(() => {\n    fetch(`/api/inventory?", "  const load = useCallback(() => {\n    setLoading(true);\n    fetch(`/api/inventory?"],
    [".catch(() => toast.error('Could not load inventory'));\n  }, [q, show, channel, page]);", ".catch(() => toast.error('Could not load inventory')).finally(() => setLoading(false));\n  }, [q, show, channel, page]);"],
    ["          {!data && <Spinner size={14} />}\n", "          {(!data || loading) && <Spinner size={14} />}\n          {loading && <style>{'.iv-table { opacity: .45; pointer-events: none; transition: opacity .15s; }'}</style>}\n"],
  ]],
  ['app/tracker/page.tsx', [
    ["  const [help, setHelp] = useState(false);\n", "  const [help, setHelp] = useState(false);\n  const [loading, setLoading] = useState(false);\n"],
    ["  const load = useCallback(() => {\n    fetch(`/api/tracker?", "  const load = useCallback(() => {\n    setLoading(true);\n    fetch(`/api/tracker?"],
    [".then(setData).catch(() => {});\n", ".then(setData).catch(() => {}).finally(() => setLoading(false));\n"],
    ["          {!data && <Spinner size={14} />}\n", "          {(!data || loading) && <Spinner size={14} />}\n          {loading && <style>{'.tr-table { opacity: .45; pointer-events: none; transition: opacity .15s; }'}</style>}\n"],
  ]],
];
if (!fs.existsSync('lib/memo.ts')) { console.log('STOPPED: lib/memo.ts missing — run step 1 first'); process.exit(1); }
const out = {};
for (const [file, reps] of edits) {
  if (!fs.existsSync(file)) { console.log(`STOPPED: ${file} not found`); process.exit(1); }
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of reps) {
    if (s.includes(b)) continue; // already done
    const n = s.split(a).length - 1;
    if (n !== 1) { console.log(`STOPPED: ${file} — anchor found ${n} times:\n${a.slice(0, 80)}`); process.exit(1); }
    s = s.replace(a, b);
  }
  out[file] = s;
}
for (const [file, s] of Object.entries(out)) { fs.copyFileSync(file, file + '.bak'); fs.writeFileSync(file, s); console.log('OK', file); }
console.log('All done.');
