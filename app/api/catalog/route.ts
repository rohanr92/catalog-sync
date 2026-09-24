import { NextResponse } from 'next/server';
import { catalogList, catalogDetail } from '@/lib/channel-catalog';
import { short } from '@/lib/errors';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const channel = u.searchParams.get('channel') ?? '';
  const key = u.searchParams.get('key');
  try {
    if (key) { const d = await catalogDetail(channel, key); return d ? NextResponse.json(d) : NextResponse.json({ error: 'Not found' }, { status: 404 }); }
    return NextResponse.json(await catalogList(channel, u.searchParams.get('q') ?? ''));
  } catch (e) { return NextResponse.json({ error: short(e) }, { status: 503 }); }
}
