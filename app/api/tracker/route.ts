import { NextResponse } from 'next/server';
import { buildTracker } from '@/lib/tracker';

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const ch = u.searchParams.get('channel') ?? '';
    const stage = u.searchParams.get('stage') ?? '';
    const stuck = u.searchParams.get('stuck') === '1';
    const q = (u.searchParams.get('q') ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(u.searchParams.get('page') ?? 1));
    const per = 50;
    const { channels, summary, rows } = await buildTracker();
    const list = rows.filter((r) =>
      (!q || `${r.title} ${r.styleCode} ${r.color}`.toLowerCase().includes(q)) &&
      (!stage || (ch ? r.cells[ch]?.stage === stage : channels.some((c) => r.cells[c].stage === stage))) &&
      (!stuck || (ch ? r.cells[ch]?.stuck : channels.some((c) => r.cells[c].stuck))));
    return NextResponse.json({ channels, summary, total: list.length, page, per, rows: list.slice((page - 1) * per, page * per) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
