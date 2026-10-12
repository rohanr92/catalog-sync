// Sales page: show "Loading…" instead of 0 units while the first load runs.
import fs from 'node:fs';
const f = 'app/sales/page.tsx';
let s = fs.readFileSync(f, 'utf8');
const reps = [
  ['        <div className="sa-cards">\n', '        {!data && <p className="status-line">Loading sales… the first time can take up to a minute.</p>}\n        {data && <div className="sa-cards">\n'],
  ['          ); })}\n        </div>\n\n        <div className="sa-tabs">', '          ); })}\n        </div>}\n\n        <div className="sa-tabs">'],
];
for (const [a, b] of reps) {
  if (s.includes(b)) continue;
  if (s.split(a).length !== 2) { console.log('STOPPED — page not changed'); process.exit(1); }
  s = s.replace(a, () => b);
}
fs.copyFileSync(f, f + '.bak'); fs.writeFileSync(f, s); console.log('OK', f);
