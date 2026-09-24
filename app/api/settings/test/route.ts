import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

async function record(channelKey: string, ok: boolean, message: string) {
  await db.channelConnection.upsert({
    where: { channelKey },
    update: { lastTestOk: ok, lastTestAt: new Date(), lastTestMsg: message },
    create: { channelKey, lastTestOk: ok, lastTestAt: new Date(), lastTestMsg: message },
  });
  return NextResponse.json({ ok, message, testedAt: new Date().toISOString() });
}

export async function POST(req: Request) {
  const { channelKey, apiUrl, apiKey } = await req.json();

  let url = (apiUrl || '').trim().replace(/\/+$/, '');
  let key = (apiKey || '').trim();

  if (!key || !url) {
    const saved = await db.channelConnection.findUnique({ where: { channelKey } });
    url = url || saved?.apiUrl?.replace(/\/+$/, '') || '';
    key = key || saved?.apiKey || '';
  }

  if (!url || !key) return record(channelKey, false, 'API URL and key required');

  try {
    const res = await fetch(`${url}/api/account`, {
      headers: { Authorization: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 || res.status === 403) return record(channelKey, false, 'Key rejected');
    if (!res.ok) return record(channelKey, false, `Mirakl returned ${res.status}`);
    const j = await res.json();
    return record(channelKey, true, `Connected as ${j.shop_name || j.name || 'shop'}`);
  } catch (e) {
    return record(channelKey, false, `Unreachable: ${(e as Error).message}`);
  }
}
