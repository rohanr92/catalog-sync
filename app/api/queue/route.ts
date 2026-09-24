import { log } from "@/lib/log";
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cached } from '@/lib/cache';
import { getGroups } from '@/lib/groups-cache';
import { allowedSizes } from '@/lib/sizes';
import { short } from '@/lib/errors';

export async function GET(req: Request) {
  const channel = new URL(req.url).searchParams.get('channel') ?? '';
  try {
    const [groups, allowed] = await Promise.all([getGroups(channel), cached(`sizes:${channel}`, 10 * 60_000, () => allowedSizes(channel))]);
    return NextResponse.json({ groups, allowedSizes: allowed });
  } catch (e) {
    return NextResponse.json({ error: `Could not load the queue — ${short(e)}` }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const { ids, approval } = await req.json();
    if (!Array.isArray(ids) || !['approved', 'rejected'].includes(approval)) return NextResponse.json({ error: 'ids and approval required' }, { status: 400 });

    if (approval === 'approved') {
      // Freeze exactly what was reviewed (built row + sheet edits) so that is what gets sent.
      const rows = await db.pendingChange.findMany({ where: { id: { in: ids } }, select: { id: true, channel: { select: { key: true } } } });
      const byChannel = new Map<string, string[]>();
      for (const r of rows) { if (!byChannel.has(r.channel.key)) byChannel.set(r.channel.key, []); byChannel.get(r.channel.key)!.push(r.id); }
      const ops = [];
      for (const [channelKey, changeIds] of byChannel) {
        const groups = await getGroups(channelKey);
        const outBy = new Map(groups.flatMap((g) => g.sizes.map((s) => [s.changeId, s.outputRow] as const)));
        for (const id of changeIds) {
          ops.push(db.pendingChange.update({ where: { id }, data: { outputRow: outBy.get(id) ?? {}, approval: 'approved', decidedAt: new Date(), submissionId: null, sendStatus: null, sendError: null } }));
        }
      }
      for (let i = 0; i < ops.length; i += 100) await db.$transaction(ops.slice(i, i + 100));
      await log("approval", "Approved " + ops.length + " listing rows");
      return NextResponse.json({ ok: true, count: ops.length });
    }

    await db.pendingChange.updateMany({ where: { id: { in: ids } }, data: { approval, decidedAt: new Date() } });
    await log("approval", (approval === "rejected" ? "Skipped " : "Updated ") + ids.length + " listing rows");
    return NextResponse.json({ ok: true, count: ids.length });
  } catch (e) {
    return NextResponse.json({ error: `Could not save — ${short(e)}` }, { status: 503 });
  }
}
