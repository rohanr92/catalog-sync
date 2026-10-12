import fs from 'node:fs';
const F = 'components/Shell.tsx';
let s = fs.readFileSync(F, 'utf8');
if (s.includes('/tracker')) { console.log('Already done.'); process.exit(0); }
const a = 'type LucideIcon }', b = '      { href: "/upc-check"';
if (s.split(a).length !== 2 || s.split(b).length !== 2) { console.log('STOPPED - menu not changed'); process.exit(1); }
s = s.replace(a, () => 'Route, type LucideIcon }');
s = s.replace(b, () => '      { href: "/tracker", label: "Go-live tracker", icon: Route, desc: "Where every style/colour stands on each marketplace: queue → sent → live" },\n' + b);
fs.writeFileSync(F, s);
console.log('OK - Go-live tracker added to the menu');
