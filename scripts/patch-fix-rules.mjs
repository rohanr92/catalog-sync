import fs from 'node:fs';

const edits = [
  { f: 'lib/dispatch.ts', done: 'applyFixRules', parts: [
    [`import { log } from "./log";`, `import { log } from "./log";\nimport { applyFixRules } from "./fix-rules";`],
    [`  if (!picked.length) return { submissions: 0, rows: 0, skipped, errors: [] as string[] };\n`,
     `  if (!picked.length) return { submissions: 0, rows: 0, skipped, errors: [] as string[] };\n  try { await applyFixRules(channelKey, picked); } catch (e) { await log("push", "Auto-fix rules skipped for " + channelKey + ": " + (e as Error).message, "warn"); }\n`],
  ] },
  { f: 'components/Shell.tsx', done: '/fix-rules', parts: [
    [`ScrollText, Activity, type LucideIcon`, `ScrollText, Activity, Wrench, type LucideIcon`],
    [`      { href: "/health", label: "Listing health"`, `      { href: "/fix-rules", label: "Auto-fix rules", icon: Wrench, desc: "Fix the same marketplace errors automatically before every send" },\n      { href: "/health", label: "Listing health"`],
  ] },
];

const bad = [];
for (const { f, done, parts } of edits) {
  const s = fs.readFileSync(f, 'utf8');
  if (s.includes(done)) continue;
  parts.forEach(([a], i) => { if (s.split(a).length !== 2) bad.push(`${f} part ${i}`); });
}
if (bad.length) { console.log('STOPPED - nothing changed. Not found: ' + bad.join(', ')); process.exit(1); }
for (const { f, done, parts } of edits) {
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes(done)) { console.log('Already done: ' + f); continue; }
  fs.writeFileSync(f + '.bak', s);
  for (const [a, b] of parts) s = s.replace(a, () => b);
  fs.writeFileSync(f, s);
  console.log('OK - ' + f);
}
