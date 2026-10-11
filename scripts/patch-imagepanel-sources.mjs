import fs from 'node:fs';

const FILE = 'components/ImagePanel.tsx';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('SourceImageRows')) { console.log('Already added. Nothing to do.'); process.exit(0); }

const edits = [
  [
    `import ImageGuide from "./ImageGuide";`,
    `import ImageGuide from "./ImageGuide";\nimport SourceImageRows, { SOURCE_DRAG_TYPE } from './SourceImageRows';`,
  ],
  [
    `onDrop={() => { if (dragFrom.current != null) move(dragFrom.current, i); dragFrom.current = null; }}>`,
    `onDrop={(e) => { const src = e.dataTransfer.getData(SOURCE_DRAG_TYPE); if (src) { e.preventDefault(); dragFrom.current = null; placeFromSource(i, src); return; } if (dragFrom.current != null) move(dragFrom.current, i); dragFrom.current = null; }}>`,
  ],
  [
    `  function move(from: number, to: number) {`,
    `  function placeFromSource(i: number, url: string) {\n    replaceAt(i, url);\n    setPicked(new Set([i]));\n    toast.success(\`Slot \${i + 1} replaced — it's ticked, press "Edit 1 selected in Image Studio" to resize it\`);\n  }\n\n  function move(from: number, to: number) {`,
  ],
  [
    `for every size of {group.color}.</p>`,
    `for every size of {group.color}.</p>\n\n              <SourceImageRows group={group} channelKey={channelKey} slotCount={slots.length} onPlace={placeFromSource} />`,
  ],
];

const missing = edits.map(([a], i) => (s.split(a).length === 2 ? -1 : i)).filter((i) => i >= 0);
if (missing.length) { console.log('STOPPED - nothing changed. Could not find part(s): ' + missing.join(', ')); process.exit(1); }

fs.writeFileSync(FILE + '.bak', s);
for (const [a, b] of edits) s = s.replace(a, () => b);
fs.writeFileSync(FILE, s);
console.log('OK - Nordstrom / marketplace image rows added to ImagePanel (4 parts). Backup: ' + FILE + '.bak');
