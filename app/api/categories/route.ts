import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { suggestCategories, channelCategoryList, learnCategoryMaps } from '@/lib/categories';

export async function GET(req: Request) {
  const channelKey = new URL(req.url).searchParams.get('channel') ?? '';
  const ch = await db.channel.findUnique({ where: { key: channelKey } });
  if (!ch) return NextResponse.json({ rows: [], candidates: [] });

  const [products, maps, candidates] = await Promise.all([
    db.product.findMany({ select: { categoryRaw: true } }),
    db.categoryMap.findMany({ where: { channelId: ch.id } }),
    channelCategoryList(channelKey),
  ]);
  const counts = new Map<string, number>();
  for (const p of products) if (p.categoryRaw) counts.set(p.categoryRaw, (counts.get(p.categoryRaw) ?? 0) + 1);
  const mapBy = new Map(maps.map((m) => [m.fromCategory, m]));

  const rows = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([from, count]) => {
    const m = mapBy.get(from);
    return { from, count, to: m?.toCategory ?? '', origin: (m?.requiredAttrs as { origin?: string })?.origin ?? '', suggestions: m ? [] : suggestCategories(from, candidates) };
  });
  return NextResponse.json({ rows, candidates });
}

export async function POST(req: Request) {
  const body = await req.json();
  const ch = await db.channel.findUnique({ where: { key: body.channel } });
  if (!ch) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });

  if (body.learn) return NextResponse.json({ learned: await learnCategoryMaps(body.channel) });

  const { from, to } = body;
  if (!from) return NextResponse.json({ error: 'from required' }, { status: 400 });
  if (!to) { await db.categoryMap.deleteMany({ where: { channelId: ch.id, fromCategory: from } }); return NextResponse.json({ ok: true, removed: true }); }
  await db.categoryMap.upsert({
    where: { channelId_fromCategory: { channelId: ch.id, fromCategory: from } },
    update: { toCategory: to, requiredAttrs: { origin: 'manual' } },
    create: { channelId: ch.id, fromCategory: from, toCategory: to, requiredAttrs: { origin: 'manual' } },
  });
  return NextResponse.json({ ok: true });
}
