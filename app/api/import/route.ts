import { log } from "@/lib/log";
import { NextResponse } from 'next/server';
import { importNordstrom, importChannel, parseMiraklExport } from "@/lib/import-xlsx";
import { importReference } from "@/lib/import-reference";
import { channelColumns } from '@/lib/channel-specs';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const channel = String(form.get('channel') ?? '');
  if (!file || !channel) return NextResponse.json({ error: 'file and channel required' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const spec = channelColumns[channel];
  const { codes } = parseMiraklExport(buffer);
  if (!spec || !codes.includes(spec.upc)) {
    const looksLike = Object.entries(channelColumns).find(([, s]) => codes.includes(s.upc) && codes.includes(s.title))?.[0];
    return NextResponse.json({ error: `This file is not a ${channel} export${looksLike ? ` — it looks like ${looksLike}` : ''}. Nothing was changed.` }, { status: 400 });
  }

  try {
    const result = channel === "nordstrom" ? await importNordstrom(buffer, file.name) : await importChannel(channel, buffer, file.name);
    await log("import", "Manual import " + channel + " — " + file.name + ": " + Object.entries(result).map(([k, v]) => k + " " + v).join(", "));
    const ref = await importReference(channel, buffer);
    const cats = (await db.columnSpec.findMany({ where: { channelKey: channel }, select: { requiredBy: true } })).flatMap((c) => Object.keys(c.requiredBy as object));
    const tplKey = `template:${channel}:${file.name.replace(/[^A-Za-z0-9]+/g, "-")}`;
    await db.setting.upsert({ where: { key: tplKey }, update: { value: { codes, categories: [...new Set(cats)] } }, create: { key: tplKey, value: { codes, categories: [...new Set(cats)] } } });
    return NextResponse.json({ ok: true, channel, ...result, valueLists: ref.lists, columnRules: ref.columns });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { channel } = await req.json();
  if (channel === 'nordstrom') {
    await db.pendingChange.deleteMany({});
    await db.snapshot.deleteMany({});
    await db.productImage.deleteMany({});
    await db.product.deleteMany({});
  } else if (channel) {
    await db.channelProduct.deleteMany({ where: { channelKey: channel } });
    const ch = await db.channel.findUnique({ where: { key: channel } });
    if (ch) await db.pendingChange.deleteMany({ where: { channelId: ch.id } });
  }
  await db.importRun.deleteMany({ where: { channelKey: channel } });
  return NextResponse.json({ ok: true });
}
