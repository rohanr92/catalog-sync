import { NextResponse } from 'next/server';
import { computeHealth, channelName } from '@/lib/health';

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const channel = u.searchParams.get('channel') ?? '';
    const issue = u.searchParams.get('issue') ?? '';
    const q = (u.searchParams.get('q') ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(u.searchParams.get('page') ?? 1));
    const per = 50;
    const { items, channels } = await computeHealth();

    const summary = channels.map((ch) => {
      const xs = items.filter((i) => i.channel === ch);
      const avg = xs.length ? Math.round(xs.reduce((n, i) => n + i.score, 0) / xs.length) : 100;
      return { key: ch, name: channelName(ch), total: xs.length, avg, poor: xs.filter((i) => i.score < 60).length, fair: xs.filter((i) => i.score >= 60 && i.score < 85).length, good: xs.filter((i) => i.score >= 85).length };
    });
    const issueCounts: Record<string, number> = {};
    for (const i of items) if (!channel || i.channel === channel) for (const is of i.issues) issueCounts[is.kind] = (issueCounts[is.kind] ?? 0) + 1;

    const list = items.filter((i) =>
      (!channel || i.channel === channel) &&
      (!issue || i.issues.some((x) => x.kind === issue)) &&
      (!q || `${i.title} ${i.styleCode} ${i.color} ${i.sizes.map((s) => s.upc).join(' ')}`.toLowerCase().includes(q)));
    return NextResponse.json({ summary, issueCounts, total: list.length, page, per, items: list.slice((page - 1) * per, page * per) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
