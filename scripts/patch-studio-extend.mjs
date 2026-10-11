import fs from 'node:fs';

const FILE = 'public/studio/index.html';
const PATCH = 'scripts/studio-extend.txt';

let html = fs.readFileSync(FILE, 'utf8');
if (html.includes('function placeForExtend')) {
  console.log('Already added. Nothing to do.');
  process.exit(0);
}

const seq = fs.readFileSync(PATCH, 'utf8').split(/^@@@(?:FIND|WITH|END)[^\n]*\n/m).slice(1);
const pairs = [];
for (let i = 0; i + 1 < seq.length; i += 2) pairs.push([seq[i], seq[i + 1]]);

const missing = [];
pairs.forEach(([find], i) => { if (html.split(find).length !== 2) missing.push(i); });
if (missing.length) {
  console.log('STOPPED - nothing changed. Could not find part(s): ' + missing.join(', '));
  process.exit(1);
}

fs.writeFileSync(FILE + '.bak', html);
for (const [find, rep] of pairs) html = html.replace(find, () => rep);
fs.writeFileSync(FILE, html);
console.log('OK - Extend background added (' + pairs.length + ' parts). Backup: ' + FILE + '.bak');
