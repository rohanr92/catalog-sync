import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { short } from '@/lib/errors';

export async function GET(req: Request) {
  const source = new URL(req.url).searchParams.get('source') ?? 'all';
  const channel = new URL(req.url).searchParams.get("channel") ?? "nordstrom";
  try {
    const runs = await db.importRun.findMany({
      where: { channelKey: channel, ...(source === 'all' ? {} : { source }) },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
    const counts = await db.importRun.groupBy({ by: ['source'], where: { channelKey: channel }, _count: { _all: true } });
    return NextResponse.json({ runs, counts: Object.fromEntries(counts.map((c) => [c.source, c._count._all])) });
  } catch (e) {
    return NextResponse.json({ runs: [], counts: {}, error: short(e) }, { status: 503 });
  }
}
