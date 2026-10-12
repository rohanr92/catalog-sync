import { NextResponse } from 'next/server';
import { overview, startJob, setStatus, markManual, applyApproved } from '@/lib/bulk-images';

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const channel = u.searchParams.get('channel') ?? '';
    if (!channel) return NextResponse.json({ error: 'channel required' }, { status: 400 });
    return NextResponse.json(await overview(channel, u.searchParams.get('status') ?? 'review'));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (b.action === 'start') return NextResponse.json(await startJob(b.channel, { w: Number(b.w), h: Number(b.h), skipSaved: b.skipSaved !== false, groupKeys: b.groupKeys }));
    if (b.action === 'approve' || b.action === 'reject' || b.action === 'undo') {
      await setStatus(b.ids ?? [], b.action === 'approve' ? 'approved' : b.action === 'reject' ? 'rejected' : 'ready');
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'manual') { await markManual(b.channel, b.groupKey); return NextResponse.json({ ok: true }); }
    if (b.action === 'retry') { void applyApproved(); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
