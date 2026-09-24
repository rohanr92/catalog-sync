export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.DISABLE_JOBS === "1") { console.log("Background jobs disabled (DISABLE_JOBS=1)"); return; }
  const g = globalThis as unknown as { __schedulers?: boolean };
  if (g.__schedulers) return;
  g.__schedulers = true;

  const job = (name: string, every: number, fn: () => Promise<void>) => {
    setInterval(async () => {
      const { beat, log } = await import('./lib/log');
      beat(name);
      try { await fn(); } catch (e) { await log('system', `${name} job error: ${String((e as Error).message).split('\n').pop()}`, 'error'); }
    }, every);
  };

  setTimeout(async () => {
    const { log } = await import('./lib/log');
    await log('system', 'Background jobs started — Nordstrom pull check every 1 min, status check every 1 min, auto-push every 5 min, log cleanup every hour');
    try {
      const { db } = await import('./lib/db');
      const { getProducts, getChannelProducts, getColumnSpecs, getValueLists } = await import('./lib/static-data');
      const { getGroups } = await import('./lib/groups-cache');
      const started = Date.now();
      await getProducts();
      const conns = await db.channelConnection.findMany({ where: { enabled: true, lastTestOk: true } });
      for (const c of conns) {
        if (c.channelKey === 'nordstrom') continue;
        await Promise.all([getChannelProducts(c.channelKey), getColumnSpecs(c.channelKey), getValueLists(c.channelKey)]);
        await getGroups(c.channelKey);
      }
      console.log(`✓ Catalog cache warm in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (e) {
      await log('system', `Cache warm-up skipped: ${String((e as Error).message).split('\n').pop()}`, 'warn');
    }
  }, 500);

  job('pull', 60_000, async () => { const { pullTick } = await import('./lib/nordstrom-pull'); await pullTick(); });
  job('status', 60_000, async () => { const { pollOpen } = await import('./lib/dispatch'); await pollOpen(); });
  job('autopush', 5 * 60_000, async () => { const { autoPushTick } = await import('./lib/dispatch'); await autoPushTick(); });

  const cleanup = async () => {
    const { db } = await import('./lib/db');
    const days = ((await db.setting.findUnique({ where: { key: 'logRetention' } }))?.value as { days?: number })?.days ?? 2;
    await db.activityLog.deleteMany({ where: { at: { lt: new Date(Date.now() - days * 86_400_000) } } });
  };
  job('cleanup', 60 * 60_000, cleanup);
  setTimeout(() => { cleanup().catch(() => {}); }, 5_000);
}
