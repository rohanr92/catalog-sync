import fs from 'node:fs';
const F = 'lib/dispatch.ts';
let s = fs.readFileSync(F, 'utf8');
if (s.includes('smartFill')) { console.log('Already done.'); process.exit(0); }
const a = `import { applyFixRules } from "./fix-rules";`;
const b = `  try { await applyFixRules(channelKey, picked); } catch (e) { await log("push", "Auto-fix rules skipped for " + channelKey + ": " + (e as Error).message, "warn"); }\n`;
if (!s.includes(a) || !s.includes(b)) { console.log('STOPPED - nothing changed (run the auto-fix rules step first)'); process.exit(1); }
fs.writeFileSync(F + '.bak2', s);
s = s.replace(a, () => a + `\nimport { smartOn, smartFill } from "./smart-fix";`);
s = s.replace(b, () => b + `  try { if (await smartOn(channelKey)) await smartFill(channelKey, picked); } catch (e) { await log("push", "Smart fix skipped for " + channelKey + ": " + (e as Error).message, "warn"); }\n`);
fs.writeFileSync(F, s);
console.log('OK - smart fix runs before every send');
