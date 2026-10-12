import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorGroups, getRules, saveRules, type FixRule } from '@/lib/fix-rules';
import { log } from '@/lib/log';
import { smartOn, setSmart, smartFill, waitingItems, fixLive } from '@/lib/smart-fix';

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const channel = u.searchParams.get('channel') ?? '';
    const values = u.searchParams.get('values');
    if (!channel) return NextResponse.json({ error: 'channel required' }, { status: 400 });
    if (values) {
      const vl = await db.valueList.findUnique({ where: { channelKey_attribute: { channelKey: channel, attribute: values } } });
      const list = (Array.isArray(vl?.values) ? (vl!.values as unknown[]) : []).map((v) => (typeof v === 'string' ? v : String((v as Record<string, unknown>)?.label ?? (v as Record<string, unknown>)?.code ?? ''))).filter(Boolean);
      return NextResponse.json({ values: list.slice(0, 3000) });
    }
    if (u.searchParams.get('preview')) {
      const items = await waitingItems(channel);
      const fills = await smartFill(channel, items, { dryRun: true });
      const byColumn: Record<string, { label: string; count: number; sources: Record<string, number> }> = {};
      for (const f of fills) { const c = (byColumn[f.column] ??= { label: f.label, count: 0, sources: {} }); c.count++; c.sources[f.source.replace(/ \(UPC .*\)/, '')] = (c.sources[f.source.replace(/ \(UPC .*\)/, '')] ?? 0) + 1; }
      return NextResponse.json({ on: await smartOn(channel), items: items.length, total: fills.length, byColumn, sample: fills.slice(0, 150) });
    }
    const [errors, rules, columns] = await Promise.all([
      errorGroups(channel),
      getRules(channel),
      db.columnSpec.findMany({ where: { channelKey: channel }, select: { code: true, label: true }, orderBy: { label: 'asc' } }),
    ]);
    return NextResponse.json({ errors, rules, columns });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const channel: string = b.channel;
    if (!channel) return NextResponse.json({ error: 'channel required' }, { status: 400 });
    const rules = await getRules(channel);

    if (b.action === 'save') {
      const r = b.rule as Partial<FixRule>;
      if (!r.action || (!r.column && !['images', 'swatch'].includes(r.action))) return NextResponse.json({ error: 'Pick a column and a fix' }, { status: 400 });
      if (['default', 'map', 'copy'].includes(r.action) && !r.value) return NextResponse.json({ error: 'Enter the value to use' }, { status: 400 });
      const ex = rules.find((x) => x.id === r.id);
      if (ex) Object.assign(ex, { column: r.column ?? ex.column, action: r.action, value: r.value, from: r.from, codes: [...new Set([...ex.codes, ...(r.codes ?? [])])] });
      else rules.push({ id: Math.random().toString(36).slice(2, 10), column: r.column ?? '', action: r.action, value: r.value, from: r.from ?? '', codes: r.codes ?? [], label: r.label ?? '', enabled: true, applied: 0, createdAt: new Date().toISOString() });
      await saveRules(channel, rules);
      await log('settings', `Auto-fix rule saved for ${channel}: ${r.action} ${r.column ?? ''}`);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'toggle' || b.action === 'delete') {
      const next = b.action === 'delete' ? rules.filter((r) => r.id !== b.id) : rules.map((r) => (r.id === b.id ? { ...r, enabled: !r.enabled } : r));
      await saveRules(channel, next);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'smart') {
      await setSmart(channel, !!b.on);
      await log('settings', `Smart fix ${b.on ? 'on' : 'off'} for ${channel}`);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'fixLive') {
      const r = await fixLive(channel);
      return NextResponse.json({ ok: true, ...r });
    }
    if (b.action === 'reapprove') {
      // Rejected items go back to "approved" so the next send picks them up — with the fixes applied.
      const ch = await db.channel.findUnique({ where: { key: channel } });
      const reset = { submissionId: null };
      const [a, i, e] = await Promise.all([
        ch ? db.pendingChange.updateMany({ where: { channelId: ch.id, sendStatus: 'rejected', approval: 'pending' }, data: { ...reset, approval: 'approved', sendStatus: null, sendError: null } }) : { count: 0 },
        db.imageChange.updateMany({ where: { channelKey: channel, sendStatus: 'rejected', status: 'pending' }, data: { ...reset, status: 'approved', sendStatus: null, sendError: null } }),
        db.channelEdit.updateMany({ where: { channelKey: channel, status: 'rejected' }, data: { ...reset, status: 'approved', sendError: null } }),
      ]);
      const n = a.count + i.count + e.count;
      await log('approval', `${n} rejected ${channel} item(s) re-approved — fixes apply on the next send`);
      return NextResponse.json({ ok: true, count: n });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
