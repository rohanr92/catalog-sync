'use client';

import { useEffect, useState } from 'react';
import Rail from '@/components/Shell';

interface Val { from: string; count: number; to: string; origin: string; suggestions: string[] }
interface Col { channelCode: string; label: string; nordstromCode: string; allowed: string[]; values: Val[]; missing: number }
interface Opt { key: string; name: string }

export default function ValuesPage() {
  const [channels, setChannels] = useState<Opt[]>([]);
  const [channel, setChannel] = useState('');
  const [cols, setCols] = useState<Col[]>([]);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetch('/api/channels').then((r) => r.json()).then((j) => { setChannels(j.channels); if (j.channels[0]) setChannel(j.channels[0].key); }); }, []);
  useEffect(() => { if (channel) load(); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() { setLoading(true); const j = await fetch(`/api/values?channel=${channel}`).then((r) => r.json()); setCols(j.columns); setLoading(false); }
  async function set(channelCode: string, fromValue: string, toValue: string) { await fetch('/api/values', { method: 'POST', body: JSON.stringify({ channel, channelCode, fromValue, toValue }) }); await load(); }

  const name = channels.find((c) => c.key === channel)?.name ?? channel;
  const missing = cols.reduce((n, c) => n + c.missing, 0);
  const shownCols = cols.map((c) => ({ ...c, values: onlyMissing ? c.values.filter((v) => !v.to) : c.values })).filter((c) => c.values.length);
  const field = { padding: '5px 8px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, background: 'var(--paper)', maxWidth: 300 } as const;
  const originLabel: Record<string, string> = { exact: 'accepted as is', learned: 'learned', manual: 'you set', closest: 'closest match', none: 'no match' };

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section style={{ overflowY: 'auto', padding: '28px 32px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 4px' }}>Values</h2>
        <p style={{ color: 'var(--ink-2)', margin: '0 0 20px', fontSize: 13 }}>
          Every Nordstrom value the tool has to translate into what {name} accepts. Pick once for the red ones; it remembers.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ ...field, width: 160 }}>{channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only what needs me</label>
          <span className={`status-line${missing ? ' fail' : ''}`}>{loading ? 'Loading…' : missing ? `${missing} values need a pick` : cols.length ? 'Every value has a match' : ''}</span>
        </div>

        {shownCols.map((c) => (
          <div key={c.channelCode} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{c.label} <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', fontWeight: 400 }}>{c.channelCode} ← Nordstrom {c.nordstromCode} · {c.allowed.length} accepted values</span></div>
            <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {c.values.map((v) => (
                  <tr key={v.from} style={{ background: v.to ? 'transparent' : 'var(--alert-bg)' }}>
                    <td style={{ padding: '4px 10px 4px 0', fontFamily: 'var(--mono)', minWidth: 220 }}>{v.from}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--ink-3)' }}>{v.count} products</td>
                    <td style={{ padding: '4px 8px' }}>
                      <select value={v.to} onChange={(e) => set(c.channelCode, v.from, e.target.value)} style={field}>
                        <option value="">— pick what {name} should get —</option>
                        {v.suggestions.length > 0 && <optgroup label="Closest">{v.suggestions.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>}
                        <optgroup label="All accepted">{c.allowed.map((a) => <option key={a} value={a}>{a}</option>)}</optgroup>
                      </select>
                    </td>
                    <td style={{ padding: '4px 8px' }}><span className="tag">{originLabel[v.origin]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </main>
  );
}
