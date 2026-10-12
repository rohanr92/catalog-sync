// Adds "Image quality" to the menu and the background checker (1 minute job).
import fs from 'node:fs';
const steps = [
  ['components/Shell.tsx', [
    ['type LucideIcon }', 'ScanSearch as IqIcon, type LucideIcon }'],
    ['      { href: "/upc-check"', '      { href: "/image-quality", label: "Image quality", icon: IqIcon, desc: "Too small, wrong shape, not-white background, blurry, duplicate or broken images" },\n      { href: "/upc-check"'],
  ]],
  ['instrumentation.ts', [
    ["  job('inventory', 60_000, async () => { const { inventoryTick } = await import('./lib/inventory-jobs'); await inventoryTick(); });\n",
     "  job('inventory', 60_000, async () => { const { inventoryTick } = await import('./lib/inventory-jobs'); await inventoryTick(); });\n  job('imagequality', 60_000, async () => { const { imageQualityTick } = await import('./lib/image-quality'); await imageQualityTick(); });\n"],
  ]],
];
const out = {};
for (const [file, reps] of steps) {
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
