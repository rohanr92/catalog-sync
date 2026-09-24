import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { beats, log } from '@/lib/log';
import { short } from '@/lib/errors';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const kind = u.searchParams.get('kind') ?? 'all';
  const level = u.searchParams.get('level') ?? 'all';
  try {
    const where = { ...(kind === 'all' ? {} : { kind }), ...(level === 'all' ? {} : { level }) };
    const [logs, byLevel, retention, total] = await Promise.all([
      db.activityLog.findMany({ where, orderBy: { at: 'desc' }, take: 500 }),
      db.activityLog.groupBy({ by: ['level'], _count: { _all: true } }),
      db.setting.findUnique({ where: { key: 'logRetention' } }),
      db.activityLog.count(),
    ]);
    return NextResponse.json({
      logs, total, beats: beats(), now: Date.now(),
      retentionDays: (retention?.value as { days?: number })?.days ?? 2,
      byLevel: Object.fromEntries(byLevel.map((b) => [b.level, b._count._all])),
    });
  } catch (e) {
    return NextResponse.json({ logs: [], error: short(e) }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === 'clear') {
    const n = (await db.activityLog.deleteMany({})).count;
    await log('system', `Logs cleared (${n} entries)`);
    return NextResponse.json({ ok: true, cleared: n });
  }
  if (body.action === 'retention') {
    const days = [1, 2, 7].includes(Number(body.days)) ? Number(body.days) : 2;
    await db.setting.upsert({ where: { key: 'logRetention' }, update: { value: { days } }, create: { key: 'logRetention', value: { days } } });
    await db.activityLog.deleteMany({ where: { at: { lt: new Date(Date.now() - days * 86_400_000) } } });
    await log('settings', `Logs kept for ${days} day${days === 1 ? '' : 's'}`);
    return NextResponse.json({ ok: true, days });
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
