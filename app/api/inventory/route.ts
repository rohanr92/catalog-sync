import { NextResponse } from 'next/server';
import { buildGrid, pullAll, pullOffers, pullShopify, getCfg, saveCfg, fixOne, checkPushes, getPushes } from '@/lib/inventory';
import { log } from '@/lib/log';
import { getJob } from '@/lib/inventory-jobs';

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const q = (u.searchParams.get('q') ?? '').trim().toLowerCase();
    const show = u.searchParams.get('show') ?? 'diff'; // diff | all
    const ch = u.searchParams.get('channel') ?? '';
    const page = Math.max(1, Number(u.searchParams.get('page') ?? 1));
    const per = 100;
    const { marketplaces, status, summary, rows } = await buildGrid();
    const fixes = Object.fromEntries(await Promise.all(marketplaces.map(async (c) => [c, (await getPushes(c)).slice(0, 5)] as const)));
    const list = rows.filter((r) => {
      if (ch && !r.cells[ch]) return false;
      if (show === 'diff') { const cs = ch ? [r.cells[ch]] : Object.values(r.cells); if (!cs.some((x) => x && x.state !== 'ok')) return false; }
      return !q || `${r.upc} ${r.title} ${r.color} ${r.size} ${Object.values(r.cells).map((c) => c?.sku ?? '').join(' ')}`.toLowerCase().includes(q);
    });
    const cfg = await getCfg();
    const auto = { every: cfg.autoMinutes ?? 10, onOrder: cfg.orderTrigger !== false, delay: cfg.orderDelay ?? 2, job: await getJob() };
    return NextResponse.json({ auto, cols: ['shopify', ...marketplaces], marketplaces, status, summary, fixes, total: list.length, page, per, rows: list.slice((page - 1) * per, page * per) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (b.action === 'pull') {
      if (b.channel === 'shopify') return NextResponse.json({ result: { shopify: `${(await pullShopify()).count} variants` } });
      if (b.channel) return NextResponse.json({ result: { [b.channel]: `${(await pullOffers(b.channel)).count} offers` } });
      return NextResponse.json({ result: await pullAll() });
    }
    if (b.action === 'buffer') {
      const cfg = await getCfg();
      cfg.buffers[b.channel] = Math.max(0, Math.floor(Number(b.buffer) || 0));
      await saveCfg(cfg);
      await log('settings', `Inventory buffer for ${b.channel} set to ${cfg.buffers[b.channel]}`);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'auto') {
      const cfg = await getCfg();
      cfg.autoMinutes = Math.max(0, Math.floor(Number(b.every) || 0));
      cfg.orderTrigger = !!b.onOrder;
      cfg.orderDelay = Math.min(30, Math.max(1, Math.floor(Number(b.delay) || 2)));
      await saveCfg(cfg);
      await log('settings', `Inventory auto-refresh: every ${cfg.autoMinutes || 'off'} min, after orders ${cfg.orderTrigger ? cfg.orderDelay + ' min later' : 'off'}`);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'fix') return NextResponse.json(await fixOne(b.channel, String(b.sku), Number(b.qty)));
    if (b.action === 'check') return NextResponse.json({ fixes: await checkPushes(b.channel) });
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
