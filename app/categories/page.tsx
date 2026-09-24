'use client';

import { useEffect, useState } from 'react';
import Rail from '@/components/Shell';

interface Row { from: string; count: number; to: string; origin: string; suggestions: string[] }
interface Opt { key: string; name: string }

export default function CategoriesPage() {
  const [channels, setChannels] = useState<Opt[]>([]);
  const [channel, setChannel] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { fetch('/api/channels').then((r) => r.json()).then((j) => { setChannels(j.channels); if (j.channels[0]) setChannel(j.channels[0].key); }); }, []);
  useEffect(() => { if (channel) load(); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setBusy(true);
    const j = await fetch(`/api/categories?channel=${channel}`).then((r) => r.json());
    setRows(j.rows); setCandidates(j.candidates); setBusy(false);
  }
  async function learn() {
    setBusy(true);
    const j = await fetch('/api/categories', { method: 'POST', body: JSON.stringify({ learn: true, channel }) }).then((r) => r.json());
    setMsg(`Learned ${j.learned} categories from products already on both sides.`); await load();
  }
  async function set(from: string, to: string) {
    await fetch('/api/categories', { method: 'POST', body: JSON.stringify({ channel, from, to }) }); await load();
  }

  const name = channels.find((c) => c.key === channel)?.name ?? channel;
  const unmapped = rows.filter((r) => !r.to).length;
  const field = { padding: '6px 8px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: 'var(--paper)', maxWidth: 420 } as const;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section style={{ overflowY: 'auto', padding: '28px 32px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 4px' }}>Categories</h2>
        <p style={{ color: 'var(--ink-2)', margin: '0 0 20px', fontSize: 13 }}>
          Nordstrom category → {name} category. Learned from products already on both. Where nothing is learned, the closest matches are suggested — pick one, it will not guess.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ ...field, width: 200 }}>
            {channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <button className="btn" disabled={busy || !channel} onClick={learn}>Learn from matched products</button>
          <span className={`status-line${unmapped ? ' fail' : ''}`}>{msg || (unmapped ? `${unmapped} categories need your pick` : rows.length ? 'All mapped' : '')}</span>
        </div>

        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
          <thead><tr>{['Nordstrom category', 'Products', name, 'From'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)', fontWeight: 500 }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.from} style={{ background: r.to ? 'transparent' : 'var(--alert-bg)' }}>
                <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.from}</td>
                <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-3)' }}>{r.count}</td>
                <td style={{ padding: '6px 10px' }}>
                  <select value={r.to} onChange={(e) => set(r.from, e.target.value)} style={field}>
                    <option value="">{r.suggestions.length ? "— pick one —" : `— nothing close in the loaded ${name} spec files. Upload the ${name} spec file for this category family on Import —`}</option>
                    {r.suggestions.length > 0 && <optgroup label="Suggested">{r.suggestions.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>}
                    <optgroup label={`All ${name} categories`}>{candidates.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
                  </select>
                </td>
                <td style={{ padding: '6px 10px' }}>{r.origin && <span className="tag">{r.origin}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
