import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { learnDefaults, allowedSizes } from "@/lib/sizes";
import { kohlsSizeFor } from '@/lib/channel-specs';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const channelKey = u.searchParams.get('channel') ?? '';
  const styleCode = u.searchParams.get('style');
  const rows = await db.sizeMap.findMany({ where: { channelKey, styleCode: styleCode ?? null }, orderBy: { sourceSize: 'asc' } });
  const allowed = await allowedSizes(channelKey);
  return NextResponse.json({ rows, allowed });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.learn) {
    const learned = await learnDefaults(body.channel, body.channel === 'kohls' ? kohlsSizeFor : undefined);
    return NextResponse.json({ learned });
  }
  const { channel, style, sourceSize, targetSize } = body;
  if (!channel || !sourceSize) return NextResponse.json({ error: 'channel and sourceSize required' }, { status: 400 });
  const existing = await db.sizeMap.findFirst({ where: { channelKey: channel, styleCode: style ?? null, sourceSize } });
  if (!targetSize) {
    if (existing) await db.sizeMap.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, removed: true });
  }
  if (existing) await db.sizeMap.update({ where: { id: existing.id }, data: { targetSize, origin: 'manual' } });
  else await db.sizeMap.create({ data: { channelKey: channel, styleCode: style ?? null, sourceSize, targetSize, origin: 'manual' } });
  return NextResponse.json({ ok: true });
}
