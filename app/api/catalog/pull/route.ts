import { NextResponse } from 'next/server';
import { getChPullCfg, saveChPullCfg, pullChannel } from '@/lib/channel-pull';
import { log } from '@/lib/log';
import { short } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const { seen, ...cfg } = await getChPullCfg(new URL(req.url).searchParams.get('channel') ?? '');
  return NextResponse.json({ ...cfg, seenCount: seen?.length ?? 0 });
}

export async function POST(req: Request) {
  try {
    const { channel, action, enabled, intervalMin } = await req.json();
    const cfg = await getChPullCfg(channel);
    if (action === 'settings') {
      await saveChPullCfg(channel, { ...cfg, enabled: !!enabled, intervalMin: Number(intervalMin) || cfg.intervalMin || 15, lastRequestDate: enabled && !cfg.enabled ? new Date().toISOString() : cfg.lastRequestDate ?? null });
      await log('settings', `${channel} API pull ${enabled ? 'on — every ' + (Number(intervalMin) || 15) + ' min' : 'off'}`);
      return NextResponse.json({ ok: true });
    }
    if (action === 'run') return NextResponse.json(await pullChannel(channel, 'manual'));
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: short(e) }, { status: 400 }); }
}
