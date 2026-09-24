'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

interface Opt { key: string; name: string }

export default function ImportPage() {
  const [options, setOptions] = useState<Opt[] | null>(null);
  const [channel, setChannel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/channels').then((r) => r.json()).then((j) => {
      const list: Opt[] = [];
      if (j.sourceConnected) list.push({ key: 'nordstrom', name: 'Nordstrom' });
      list.push(...(j.channels ?? []).map((c: Opt) => ({ key: c.key, name: c.name })));
      setOptions(list);
      if (list.length) setChannel(list[0].key);
    }).catch(() => setOptions([]));
  }, []);

  const name = options?.find((o) => o.key === channel)?.name ?? channel;

  function describe(j: Record<string, number>) {
    const parts = [`${j.rows} rows`];
    if (j.newCount != null) parts.push(`${j.newCount} new`, `${j.changedCount} changed`, `${j.queued} queued`);
    if (j.skippedIgnored) parts.push(`${j.skippedIgnored} skipped (ignored)`);
    if (j.skippedNoUpc) parts.push(`${j.skippedNoUpc} skipped (no UPC)`);
    if (j.queuedNew != null) parts.push(`${j.queuedNew} missing vs Nordstrom queued`, `${j.cleared} now listed and cleared`);
    return parts.join(', ');
  }

  async function run() {
    if (!file || !channel) return;
    setBusy(true);
    setLog((l) => [`Importing ${file.name} as ${name}…`, ...l]);
    const form = new FormData();
    form.append('file', file);
    form.append('channel', channel);
    try {
      const res = await fetch('/api/import', { method: 'POST', body: form });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Server error ${res.status}`);
      const line = `${name}: ${describe(j)}`;
      setLog((l) => [line, ...l]);
      toast.success(line);
    } catch (e) {
      setLog((l) => [`Failed: ${(e as Error).message}`, ...l]);
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  async function clear() {
    if (!confirm(`Delete all ${name} data? ${channel === 'nordstrom' ? 'This clears the master catalog and every pending change.' : 'This clears what the system knows is on this marketplace.'}`)) return;
    setBusy(true);
    await fetch('/api/import', { method: 'DELETE', body: JSON.stringify({ channel }) });
    setLog((l) => [`${name}: data cleared`, ...l]);
    toast.success(`${name} data cleared`);
    setBusy(false);
  }

  const field = { width: '100%', padding: 10, border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 14, background: 'var(--paper)' } as const;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section style={{ overflowY: 'auto', padding: '28px 32px', maxWidth: 680 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 4px' }}>Import</h2>
        <p style={{ color: 'var(--ink-2)', margin: '0 0 24px', fontSize: 13 }}>
          Nordstrom updates the master catalog. Any other marketplace records what is live there and is compared against Nordstrom straight away — missing products go to its queue.
        </p>

        {!options && <div className="loading-block"><Spinner /> Loading connections…</div>}
        {options && options.length === 0 && <p style={{ fontSize: 13 }}>No marketplace connected. <Link href="/settings">Connect one</Link> first.</p>}

        {options && options.length > 0 && (
          <>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 }}>Marketplace</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ ...field, marginBottom: 18 }}>
              {options.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>

            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 }}>{name} export (.xlsx)</label>
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: 'block', marginBottom: 22 }} />

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn primary" style={{ flex: 'none', padding: '10px 20px', display: 'flex', gap: 8, alignItems: 'center' }} disabled={!file || busy} onClick={run}>
                {busy && <Spinner />}{busy ? 'Working…' : `Import as ${name}`}
              </button>
              <button className="btn" disabled={busy} onClick={clear}>Clear {name} data</button>
            </div>
          </>
        )}

        {log.length > 0 && <pre className="payload" style={{ marginTop: 28, padding: 14, border: '1px solid var(--rule)', borderRadius: 4, whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>}
      </section>
    </main>
  );
}
