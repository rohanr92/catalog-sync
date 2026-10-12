import fs from 'node:fs';

const block = `
  // Opened from Listing health: ?q=<style>&color=<colour>&open=info|images
  const [want, setWant] = useState<{ style: string; color: string; open: string } | null>(null);
  const [openWhat, setOpenWhat] = useState('');
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const style = p.get('q');
    if (!style) return;
    setQ(style);
    setWant({ style: style.toLowerCase(), color: (p.get('color') ?? '').toLowerCase(), open: p.get('open') ?? '' });
  }, []);
  useEffect(() => {
    if (!want || !data) return;
    const gs = data.groups;
    const g = gs.find((x) => x.styleCode.toLowerCase() === want.style && (!want.color || x.color.toLowerCase() === want.color))
      ?? gs.find((x) => x.styleCode.toLowerCase() === want.style)
      ?? (gs.length === 1 ? gs[0] : undefined);
    if (g) { setSel(g.key); setOpenWhat(want.open); }
    if (g || data.groups.length < 400) setWant(null);
  }, [want, data]);
  useEffect(() => {
    if (!d || !openWhat) return;
    if (openWhat === 'info') setSheetOpen(true);
    if (openWhat === 'images') setImgOpen(true);
    setOpenWhat('');
  }, [d, openWhat]);
`;

const files = [
  { f: 'app/nordstrom/page.tsx', edits: [
    [`import { useState } from 'react';`, `import { useEffect, useState } from 'react';`],
    [`  const refresh = () => { mutate(); mutateList(); };\n`, `  const refresh = () => { mutate(); mutateList(); };\n` + block],
  ] },
  { f: 'app/catalog/page.tsx', edits: [
    [`import { Suspense, useState } from 'react';`, `import { Suspense, useEffect, useState } from 'react';`],
    [`  const refresh = () => { mutate(); mList(); };\n`, `  const refresh = () => { mutate(); mList(); };\n` + block],
  ] },
  { f: 'app/health/page.tsx', edits: [
    ["  const detailsHref = (it: Item) => (it.channel === 'nordstrom' ? `/nordstrom?q=${encodeURIComponent(it.styleCode)}` : `/catalog?channel=${it.channel}&q=${encodeURIComponent(it.styleCode)}`);",
     "  const detailsHref = (it: Item) => {\n    const p = new URLSearchParams({ q: it.styleCode, color: it.color, open: 'info' });\n    return it.channel === 'nordstrom' ? `/nordstrom?${p}` : `/catalog?channel=${it.channel}&${p}`;\n  };"],
  ] },
];

const bad = [];
for (const { f, edits } of files) {
  const s = fs.readFileSync(f, 'utf8');
  if (s.includes('Opened from Listing health') || s.includes("open: 'info'")) continue;
  edits.forEach(([a], i) => { if (s.split(a).length !== 2) bad.push(`${f} part ${i}`); });
}
if (bad.length) { console.log('STOPPED - nothing changed. Not found: ' + bad.join(', ')); process.exit(1); }

for (const { f, edits } of files) {
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('Opened from Listing health') || s.includes("open: 'info'")) { console.log('Already done: ' + f); continue; }
  fs.writeFileSync(f + '.bak', s);
  for (const [a, b] of edits) s = s.replace(a, () => b);
  fs.writeFileSync(f, s);
  console.log('OK - ' + f);
}
