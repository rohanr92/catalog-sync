import * as XLSX from 'xlsx';
import { db } from './db';

function grid(ws: XLSX.WorkSheet): string[][] {
  const r = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  r.s.r = 0; r.s.c = 0;
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', range: XLSX.utils.encode_range(r) }).map((row) => row.map((v) => String(v ?? '').trim()));
}

export async function importReference(channelKey: string, buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  let lists = 0, columns = 0;

  const rd = wb.Sheets['ReferenceData'];
  if (rd) {
    const g = grid(rd);
    const headers = g[0] ?? [];
    for (let c = 0; c < headers.length; c++) {
      const attribute = headers[c];
      if (!attribute) continue;
      const values = [...new Set(g.slice(1).map((row) => row[c]).filter(Boolean))];
      if (values.length === 0) continue;
      const existing = await db.valueList.findUnique({ where: { channelKey_attribute: { channelKey, attribute } } });
      const merged = [...new Set([...((existing?.values as string[]) ?? []), ...values])];
      await db.valueList.upsert({
        where: { channelKey_attribute: { channelKey, attribute } },
        update: { values: merged },
        create: { channelKey, attribute, values: merged },
      });
      lists++;
    }
  }

  const cs = wb.Sheets['Columns'];
  if (cs) {
    const g = grid(cs);
    const head = g[0] ?? [];
    const catStart = head.findIndex((h, i) => i > 3 && h);
    const categories = catStart >= 0 ? head.slice(catStart) : [];
    for (const row of g.slice(1)) {
      const [code, label, description, example] = row;
      if (!code) continue;
      const requiredBy: Record<string, string> = {};
      categories.forEach((cat, i) => { const v = row[catStart + i]; if (cat && v) requiredBy[cat] = v; });
      await db.columnSpec.upsert({
        where: { channelKey_code: { channelKey, code } },
        update: { label: label || code, description: description || null, example: example || null, requiredBy },
        create: { channelKey, code, label: label || code, description: description || null, example: example || null, requiredBy },
      });
      columns++;
    }
  }

  return { lists, columns };
}
