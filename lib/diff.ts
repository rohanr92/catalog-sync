type Row = Record<string, string>;

export interface FieldDiff { field: string; label: string; before: string | null; after: string }

const watched: [string, string][] = [
  ['product-title', 'Product title'],
  ['copy-description', 'Description'],
  ['copy-features', 'Details and care'],
  ['color-description', 'Colour'],
  ['color-family', 'Colour family'],
  ['npt', 'Category'],
  ['material-shoe-upper', 'Upper material'],
  ['material-shoe-lining', 'Lining material'],
  ['material-shoe-sole', 'Sole material'],
  ['material-1', 'Material 1'],
  ['measurement-heel-height-in-inches', 'Heel height'],
  ['shoe-style', 'Shoe style'],
  ['toe-style', 'Toe style'],
  ['size-description', 'Size'],
  ['country-of-manufacture-primary', 'Country of manufacture'],
];

function clean(u: string) { return (u || '').split('?')[0]; }

export function diffRows(prev: Row | null, next: Row, prevImages: string[], nextImages: string[]): FieldDiff[] {
  const out: FieldDiff[] = [];

  for (const [code, label] of watched) {
    const a = prev?.[code] ?? '';
    const b = next[code] ?? '';
    if (a !== b && (a || b)) out.push({ field: code, label, before: prev ? a || null : null, after: b });
  }

  const max = Math.max(prevImages.length, nextImages.length);
  for (let i = 0; i < max; i++) {
    const a = clean(prevImages[i]), b = clean(nextImages[i]);
    if (a === b) continue;
    const slot = i === 0 ? 'Primary image' : `Image ${i + 1}`;
    if (!a && b) out.push({ field: `image-${i}`, label: `${slot} added`, before: null, after: b });
    else if (a && !b) out.push({ field: `image-${i}`, label: `${slot} removed`, before: a, after: '' });
    else out.push({ field: `image-${i}`, label: `${slot} changed`, before: a, after: b });
  }

  return out;
}

export function primaryImageChanged(diffs: FieldDiff[]) {
  return diffs.some((d) => d.field === 'image-0');
}
