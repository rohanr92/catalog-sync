import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildSales, syncStatus, salesTick } from '@/lib/sales';

export const maxDuration = 300;

// Plain-English reason when something is not set up yet.
function explain(e: unknown) {
  const m = String((e as Error)?.message ?? e);
  if (!(db as unknown as Record<string, unknown>).saleLine || /saleLine|SaleLine|does not exist|relation/i.test(m))
    return 'The sales table is not in the database yet. In the VS Code terminal run: npx prisma migrate deploy && npx prisma generate — then restart the app.';
  return m;
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const days = [7, 30, 90, 365].includes(Number(u.searchParams.get('days'))) ? Number(u.searchParams.get('days')) : 30;
    const group = u.searchParams.get('group') === 'style' ? 'style' : 'color';
    const view = u.searchParams.get('view') ?? 'all'; // all | best | rising | falling | slow | none
    const ch = u.searchParams.get('channel') ?? '';
    const q = (u.searchParams.get('q') ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(u.searchParams.get('page') ?? 1));
    const per = 50;
    const [{ channels, summary, rows }, status] = await Promise.all([buildSales(days, group), syncStatus()]);
    const inCh = rows.filter((r) => !ch || r.byChannel[ch] || r.liveOn.includes(ch));
    const counts = { all: inCh.length, best: 0, rising: 0, falling: 0, slow: 0, none: 0 } as Record<string, number>;
    for (const r of inCh) if (r.label in counts) counts[r.label]++;
    let list = inCh.filter((r) => (view === 'all' || r.label === view) && (!q || `${r.title} ${r.styleCode} ${r.color}`.toLowerCase().includes(q)));
    if (ch) list = [...list].sort((a, b) => (b.byChannel[ch]?.units ?? 0) - (a.byChannel[ch]?.units ?? 0) || b.units - a.units);
    return NextResponse.json({ days, group, channels, summary, status, counts, total: list.length, page, per, rows: list.slice((page - 1) * per, page * per) });
  } catch (e) {
    console.error('sales GET', e);
    return NextResponse.json({ error: explain(e), days: 30, channels: [], summary: {}, status: {}, counts: {}, total: 0, page: 1, per: 50, rows: [] });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (b.action === 'sync') {
      await salesTick(2); // a quick step; the background job does the rest every 2 minutes
      const status = await syncStatus();
      const errors = Object.values(status).filter((s) => s.error).map((s) => `${s.name}: ${s.error}`);
      return NextResponse.json(errors.length ? { status, error: errors.join(' · ') } : { status });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('sales POST', e);
    return NextResponse.json({ error: explain(e) });
  }
}
