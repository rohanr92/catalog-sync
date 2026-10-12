import fs from 'node:fs';
const F = 'lib/health.ts';
let s = fs.readFileSync(F, 'utf8');
if (s.includes('const numeric =')) { console.log('Already fixed.'); process.exit(0); }
const a = `  const isSize = sizeColumns[channel]`;
const b = `if (!list || !list.size || !val) continue;`;
if (!s.includes(a) || !s.includes(b)) { console.log('STOPPED - nothing changed'); process.exit(1); }
s = s.replace(a, `  // Lists that hold names only: a stored number there is the marketplace's own code, not a wrong value.\n  const numeric = new Set([...allowed].filter(([, set]) => [...set].some((x) => /^\\d{3,}$/.test(x))).map(([k]) => k));\n` + a);
s = s.replace(b, `if (!list || !list.size || !val || (/^\\d+$/.test(val) && !numeric.has(c))) continue;`);
fs.writeFileSync(F, s);
console.log('OK - number codes no longer flagged as wrong values');
