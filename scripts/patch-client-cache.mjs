// Makes tabs open instantly with their last data, then refresh quietly.
import fs from 'node:fs';
if (!fs.existsSync('lib/client-cache.ts')) { console.log('STOPPED: lib/client-cache.ts missing — run step 1 first'); process.exit(1); }
const pages = ['app/inventory/page.tsx', 'app/tracker/page.tsx', 'app/image-quality/page.tsx', 'app/health/page.tsx', 'app/fix-rules/page.tsx', 'app/bulk-images/page.tsx'];
const re = /fetch\((`[^`]*`|'[^']*')\)\.then\(\(r\) => r\.json\(\)\)\.then\(/g;
for (const f of pages) {
  if (!fs.existsSync(f)) { console.log(`skip ${f} (not found)`); continue; }
  let s = fs.readFileSync(f, 'utf8');
  const n = (s.match(re) ?? []).length;
  if (!n && s.includes('getJSON(')) { console.log(`already done ${f}`); continue; }
  if (!n) { console.log(`skip ${f} (nothing to change)`); continue; }
  s = s.replace(re, (_m, url) => `getJSON(${url}, `);
  if (!s.includes("from '@/lib/client-cache'")) {
    if (!s.startsWith("'use client';")) { console.log(`STOPPED: ${f} does not start with 'use client'`); process.exit(1); }
    s = s.replace("'use client';", () => "'use client';\nimport { getJSON } from '@/lib/client-cache';");
  }
  fs.copyFileSync(f, f + '.bak');
  fs.writeFileSync(f, s);
  console.log(`OK ${f} (${n} loads)`);
}
console.log('All done.');
