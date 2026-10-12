import { NextResponse } from 'next/server';
import { buildImageQuality, scanSome, recheck } from '@/lib/image-quality';

export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const ch = u.searchParams.get('channel') ?? '';
    const show = u.searchParams.get('show') ?? 'problems'; // problems | bad | all
    const q = (u.searchParams.get('q') ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(u.searchParams.get('page') ?? 1));
    const per = 40;
    const { rows, summary } = await buildImageQuality();
    const list = rows.filter((r) =>
      (!ch || r.channel === ch) &&
      (show === 'all' || (show === 'bad' ? r.bad > 0 : r.bad + r.warn > 0)) &&
      (!q || `${r.title} ${r.styleCode} ${r.color}`.toLowerCase().includes(q)));
    const left = summary.reduce((n, s) => n + s.images - s.checked, 0);
    return NextResponse.json({ summary, left, total: list.length, page, per, rows: list.slice((page - 1) * per, page * per) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (b.action === 'scan') return NextResponse.json(await scanSome(60, 50_000));
    if (b.action === 'recheck' && b.url) return NextResponse.json({ check: await recheck(String(b.url)) });
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
