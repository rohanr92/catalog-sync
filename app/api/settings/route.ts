import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const keys = ['nordstrom', 'macys', 'kohls', 'jcpenney', 'debenhams', 'targetplus'];

export async function GET() {
  const rows = await db.channelConnection.findMany();
  const match = await db.setting.findUnique({ where: { key: 'match' } });
  const connections = keys.map((k) => {
    const r = rows.find((x) => x.channelKey === k);
    return {
      channelKey: k,
      enabled: r?.enabled ?? true,
      apiUrl: r?.apiUrl ?? '',
      hasKey: Boolean(r?.apiKey),
      lastTestOk: r?.lastTestOk ?? null,
      lastTestAt: r?.lastTestAt ?? null,
      lastTestMsg: r?.lastTestMsg ?? null,
    };
  });
  return NextResponse.json({ connections, match: match?.value ?? { byUpc: true, bySku: false } });
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.match) {
    await db.setting.upsert({ where: { key: 'match' }, update: { value: body.match }, create: { key: 'match', value: body.match } });
  }

  if (body.connection) {
    const c = body.connection;
    const data: Record<string, unknown> = { enabled: c.enabled, apiUrl: c.apiUrl || null };
    if (c.apiKey) data.apiKey = c.apiKey;
    await db.channelConnection.upsert({
      where: { channelKey: c.channelKey },
      update: data as never,
      create: { channelKey: c.channelKey, ...data } as never,
    });
  }

  return NextResponse.json({ ok: true });
}
