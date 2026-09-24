import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { parseMiraklExport } from '../lib/import-xlsx';
import { importReference } from '../lib/import-reference';

const db = new PrismaClient();
const dir = path.join(process.cwd(), 'prisma', 'specs');

async function main() {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx')).sort();
  for (const f of files) {
    const channel = f.split('-')[0].replace('.xlsx', '');
    const buffer = fs.readFileSync(path.join(dir, f));
    const { codes } = parseMiraklExport(buffer);
    const ref = await importReference(channel, buffer);
    const cats = (await db.columnSpec.findMany({ where: { channelKey: channel }, select: { requiredBy: true } })).flatMap((c) => Object.keys(c.requiredBy as object));
    const tplKey = `template:${channel}:${f.replace(/[^A-Za-z0-9]+/g, '-')}`;
    await db.setting.upsert({ where: { key: tplKey }, update: { value: { codes, categories: [...new Set(cats)] } }, create: { key: tplKey, value: { codes, categories: [...new Set(cats)] } } });
    console.log(`${channel.padEnd(10)} ${f.padEnd(24)} lists ${String(ref.lists).padStart(4)}  rules ${String(ref.columns).padStart(4)}  template stored`);
  }
}

main().finally(() => db.$disconnect());
