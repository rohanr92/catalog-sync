'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import Link from 'next/link';
import Spinner from './Spinner';
import { postJson } from '@/lib/fetcher';

interface Cfg { enabled?: boolean; intervalMin?: number; lastRunAt?: string | null; lastResult?: string | null; lastOk?: boolean | null; lastRequestDate?: string | null }

export default function NordstromPullCard() {
  const { data, mutate } = useSWR<Cfg>('/api/nordstrom-pull', { refreshInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const interval = data?.intervalMin ?? 15;

  async function save(enabled: boolean, intervalMin: number) {
    try { await postJson('/api/nordstrom-pull', { action: 'settings', enabled, intervalMin }); mutate(); toast.success(enabled ? `Pulling from Nordstrom every ${intervalMin} min` : 'Nordstrom API pull off'); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function run() {
    setBusy(true);
    const t = toast.loading('Pulling from Nordstrom…');
    try { const j = await postJson('/api/nordstrom-pull', { action: 'run' }); toast.success(j.summary, { id: t }); mutate(); }
    catch (e) { toast.error((e as Error).message, { id: t }); }
    setBusy(false);
  }

  const dot = busy ? 'busy' : data?.lastOk === false ? 'fail' : data?.enabled ? 'ok' : '';
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: 16, marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className={`dot ${dot}`} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Nordstrom API pull</div>
          <div className={`status-line${data?.lastOk === false ? ' fail' : ''}`}>
            {data?.lastRunAt ? `${new Date(data.lastRunAt).toLocaleString()} — ${data.lastResult}` : 'Every finished product import on Nordstrom is pulled and runs through the same queue as a manual upload, tagged Auto.'}
          </div>
        </div>
        <select value={interval} onChange={(e) => save(!!data?.enabled, Number(e.target.value))} style={{ padding: '6px 8px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: 'var(--paper)' }}>
          {[5, 15, 30, 60].map((m) => <option key={m} value={m}>Every {m} min</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={!!data?.enabled} onChange={(e) => save(e.target.checked, interval)} /> On
        </label>
        <button className="btn" disabled={busy} onClick={run} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{busy && <Spinner />}Pull now</button>
      </div>
      <div className="status-line" style={{ marginTop: 8 }}>
        Edits made one product at a time inside Nordstrom&apos;s back office don&apos;t appear here — use a manual <Link href="/import" style={{ color: 'var(--ink)' }}>import</Link> for those. History under <Link href="/pulls" style={{ color: 'var(--ink)' }}>Pulls</Link>.
      </div>
    </div>
  );
}
