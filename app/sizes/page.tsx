'use client';

import { useEffect, useState } from 'react';
import Rail from '@/components/Shell';

interface Row { id?: string; sourceSize: string; targetSize: string; origin: string }
interface Opt { key: string; name: string }

export default function SizesPage() {
  const [channels, setChannels] = useState<Opt[]>([]);
  const [channel, setChannel] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/channels').then((r) => r.json()).then((j) => { setChannels(j.channels); if (j.channels[0]) setChannel(j.channels[0].key); });
  }, []);

  useEffect(() => { if (channel) load(); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const j = await fetch(`/api/sizes?channel=${channel}`).then((r) => r.json());
    setRows(j.rows);
  }

  async function learn() {
    setBusy(true); setMsg('');
    const j = await fetch('/api/sizes', { method: 'POST', body: JSON.stringify({ learn: true, channel }) }).then((r) => r.json());
    setMsg(`Learned ${j.learned.length} sizes from matched UPCs. Manual entries were kept.`);
    await load(); setBusy(false);
  }

  async function save(sourceSize: string, targetSize: string) {
    await fetch('/api/sizes', { method: 'POST', body: JSON.stringify({ channel, sourceSize, targetSize }) });
    await load();
  }

  const name = channels.find((c) => c.key === channel)?.name ?? channel;
  const field = { padding: '6px 8px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 13, background: 'var(--paper)', width: 120 } as const;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section style={{ overflowY: 'auto', padding: '28px 32px', maxWidth: 720 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 4px' }}>Size mapping</h2>
        <p style={{ color: 'var(--ink-2)', margin: '0 0 24px', fontSize: 13 }}>
          Default Nordstrom size → {name} size. Used only when a style has no existing sizes on {name} to copy from. Per-style overrides are set from the queue.
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ ...field, width: 200, fontFamily: 'inherit' }}>
            {channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <button className="btn" disabled={busy || !channel} onClick={learn}>{busy ? 'Learning…' : 'Learn from imported data'}</button>
          {msg && <span className="status-line">{msg}</span>}
        </div>

        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Nordstrom', name, 'From', ''].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)', fontWeight: 500 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sourceSize}>
                <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)' }}>{r.sourceSize}</td>
                <td style={{ padding: '6px 10px' }}>
                  <input style={field} defaultValue={r.targetSize} onBlur={(e) => e.target.value !== r.targetSize && save(r.sourceSize, e.target.value)} />
                </td>
                <td style={{ padding: '6px 10px' }}><span className="tag">{r.origin}</span></td>
                <td style={{ padding: '6px 10px' }}><button className="filter" onClick={() => save(r.sourceSize, '')}>Remove</button></td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: '6px 10px' }}><input style={field} placeholder="e.g. 43" id="newSrc" /></td>
              <td style={{ padding: '6px 10px' }}><input style={field} placeholder="e.g. 12" id="newDst" /></td>
              <td colSpan={2} style={{ padding: '6px 10px' }}>
                <button className="btn" onClick={() => {
                  const s = (document.getElementById('newSrc') as HTMLInputElement).value.trim();
                  const t = (document.getElementById('newDst') as HTMLInputElement).value.trim();
                  if (s && t) save(s, t);
                }}>Add</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
