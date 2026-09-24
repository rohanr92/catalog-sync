import { log } from "@/lib/log";
import { NextResponse } from 'next/server';
import { getPullCfg, savePullCfg, pullNordstrom } from '@/lib/nordstrom-pull';
import { short } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  const { seen, ...cfg } = await getPullCfg();
  return NextResponse.json({ ...cfg, seenCount: seen?.length ?? 0 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cfg = await getPullCfg();
    if (body.action === 'settings') {
      const enabled = !!body.enabled;
      await savePullCfg({
        ...cfg, enabled, intervalMin: Number(body.intervalMin) || cfg.intervalMin || 15,
        lastRequestDate: enabled && !cfg.enabled ? new Date().toISOString() : cfg.lastRequestDate ?? null, // start from now, don't replay history
      });
      await log("settings", "Nordstrom API pull " + (enabled ? "on — every " + (Number(body.intervalMin) || 15) + " min" : "off"));
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'run') return NextResponse.json(await pullNordstrom('manual'));
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 400 });
  }
}
