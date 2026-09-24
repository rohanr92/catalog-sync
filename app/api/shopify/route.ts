import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface ShopifyCfg { domain?: string; token?: string; lastTestOk?: boolean; lastTestMsg?: string; lastTestAt?: string }

async function read(): Promise<ShopifyCfg> {
  const s = await db.setting.findUnique({ where: { key: 'shopify' } });
  return (s?.value as ShopifyCfg) ?? {};
}
async function write(v: ShopifyCfg) {
  await db.setting.upsert({ where: { key: 'shopify' }, update: { value: v as never }, create: { key: 'shopify', value: v as never } });
}

export async function GET() {
  const c = await read();
  return NextResponse.json({ domain: c.domain ?? '', hasToken: Boolean(c.token), lastTestOk: c.lastTestOk ?? null, lastTestMsg: c.lastTestMsg ?? null, lastTestAt: c.lastTestAt ?? null });
}

export async function POST(req: Request) {
  const body = await req.json();
  const cur = await read();

  if (body.save) {
    const next = { ...cur, domain: (body.domain || cur.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') };
    if (body.token) next.token = body.token.trim();
    await write(next);
  }

  const cfg = await read();
  const domain = (body.domain || cfg.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const token = (body.token || cfg.token || '').trim();
  if (!domain || !token) {
    const r = { ...cfg, lastTestOk: false, lastTestMsg: 'Store domain and Admin API token required', lastTestAt: new Date().toISOString() };
    await write(r); return NextResponse.json({ ok: false, message: r.lastTestMsg, testedAt: r.lastTestAt });
  }

  try {
    const res = await fetch(`https://${domain}/admin/api/2025-07/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: '{ shop { name myshopifyDomain } }' }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json().catch(() => ({}));
    const ok = res.ok && j?.data?.shop?.name;
    const message = ok ? `Connected to ${j.data.shop.name}` : res.status === 401 ? 'Token rejected' : `Shopify returned ${res.status}`;
    const r = { ...cfg, lastTestOk: Boolean(ok), lastTestMsg: message, lastTestAt: new Date().toISOString() };
    await write(r); return NextResponse.json({ ok: Boolean(ok), message, testedAt: r.lastTestAt });
  } catch (e) {
    const r = { ...cfg, lastTestOk: false, lastTestMsg: `Unreachable: ${(e as Error).message}`, lastTestAt: new Date().toISOString() };
    await write(r); return NextResponse.json({ ok: false, message: r.lastTestMsg, testedAt: r.lastTestAt });
  }
}
