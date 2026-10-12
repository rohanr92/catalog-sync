import fs from 'node:fs';
const F = 'components/Shell.tsx';
let s = fs.readFileSync(F, 'utf8');
if (s.includes('/inventory')) { console.log('Already done.'); process.exit(0); }
const a = 'ScrollText, Activity, Wrench, type LucideIcon';
const b = '      { href: "/fix-rules", label: "Auto-fix rules"';
if (!s.includes(a) || !s.includes(b)) { console.log('STOPPED - nothing changed'); process.exit(1); }
s = s.replace(a, () => 'ScrollText, Activity, Wrench, Boxes, type LucideIcon');
s = s.replace(b, () => '      { href: "/inventory", label: "Inventory", icon: Boxes, desc: "Marketplace stock vs Shopify, matched by UPC" },\n' + b);
fs.writeFileSync(F, s);
console.log('OK - Inventory added to the menu');
