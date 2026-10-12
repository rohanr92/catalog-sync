import fs from 'node:fs';
const F = 'lib/inventory.ts';
let s = fs.readFileSync(F, 'utf8');
if (s.includes('class Limited')) { console.log('Already done.'); process.exit(0); }
const start = s.indexOf('// OF21 — every offer in the shop.');
const end = s.indexOf('// ---------- Shopify ----------');
const snapA = 'export interface Snap { pulledAt: string | null; error: string | null; items: SnapItem[] }';
if (start < 0 || end < 0 || !s.includes(snapA)) { console.log('STOPPED - nothing changed'); process.exit(1); }
fs.writeFileSync(F + '.bak', s);
s = s.slice(0, start) + fs.readFileSync('scripts/inventory-pull.txt', 'utf8') + s.slice(end);
s = s.replace(snapA, () => 'export interface Snap { pulledAt: string | null; error: string | null; items: SnapItem[]; limitedUntil?: string }');
fs.writeFileSync(F, s);
console.log('OK - offers now come from one export call, with retries and a 10-minute cool-down');
