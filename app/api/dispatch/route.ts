import { log } from "@/lib/log";
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readyToSend, nextAllowedAt, sendChannel, pollOpen, autoPushMap } from '@/lib/dispatch';
import { short } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const channel = new URL(req.url).searchParams.get('channel') ?? '';
  try {
    await pollOpen(channel).catch(() => {});
    const [ready, next, auto, conn, subs] = await Promise.all([
      readyToSend(channel),
      nextAllowedAt(channel),
      autoPushMap(),
      db.channelConnection.findUnique({ where: { channelKey: channel }, select: { apiUrl: true, apiKey: true, lastTestOk: true } }),
      db.submission.findMany({
        where: { channelKey: channel }, orderBy: { sentAt: 'desc' }, take: 50,
        select: { id: true, kind: true, source: true, status: true, statusDetail: true, rowCount: true, accepted: true, rejected: true, importId: true, sentAt: true, completedAt: true, errorReport: true, reportName: true, fileUrl: true, reports: true },
      }),
    ]);
    return NextResponse.json({ ready, nextAllowedAt: next, autoPush: !!auto[channel], connected: !!(conn?.apiUrl && conn?.apiKey && conn?.lastTestOk), submissions: subs.map((s) => ({ ...s, reports: (((s.reports as { kind: string; name: string }[] | null) ?? [])).map((r, i) => ({ i, kind: r.kind, name: r.name })) })) });
  } catch (e) {
    return NextResponse.json({ error: `Could not load — ${short(e)}` }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const { action, channel, enabled } = await req.json();
    if (action === 'send') return NextResponse.json(await sendChannel(channel, 'manual'));
    if (action === 'autopush') {
      const map = await autoPushMap();
      map[channel] = !!enabled;
      await db.setting.upsert({ where: { key: 'autoPush' }, update: { value: map }, create: { key: 'autoPush', value: map } });
      await log("settings", "Auto-push " + (map[channel] ? "on" : "off") + " for " + channel);
      return NextResponse.json({ ok: true, autoPush: map[channel] });
    }
    if (action === 'poll') { await pollOpen(channel); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 400 });
  }
}
