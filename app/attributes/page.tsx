'use client';

import { useEffect, useState } from 'react';
import Rail from '@/components/Shell';

interface Row { code: string; base: string; label: string; fixed: boolean; required: boolean; requiredIn: number; usedIn: number; source: string; origin: string; confidence: number; defaultValue: string; allowedCount: number; example: string }
interface Opt { key: string; name: string }

export default function AttributesPage() {
  const [channels, setChannels] = useState<Opt[]>([]);
  const [channel, setChannel] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [nord, setNord] = useState<{ code: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [onlyRed, setOnlyRed] = useState(false);

  useEffect(() => { fetch('/api/channels').then((r) => r.json()).then((j) => { setChannels(j.channels); if (j.channels[0]) setChannel(j.channels[0].key); }); }, []);
  useEffect(() => { if (channel) load(); }, [channel, category]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const j = await fetch(`/api/attributes?channel=${channel}&category=${encodeURIComponent(category)}`).then((r) => r.json());
    setRows(j.rows); setCategories(j.categories); setNord(j.nordstromAttrs);
  }
  async function learnAll() {
    setBusy(true); setMsg('Learning for every connected marketplace… a few minutes.');
    const res = await fetch('/api/attributes', { method: 'POST', body: JSON.stringify({ learnEverything: true }) });
    const j = await res.json();
    setMsg(res.ok ? 'Done: ' + Object.entries(j).map(([k, v]) => { const x = v as Record<string, number>; return `${k}: ${x.maps} pairings, ${x.values} translations, ${x.defaults} defaults`; }).join(' · ') : `Failed: ${j.error}`);
    await load(); setBusy(false);
  }
  async function setSource(channelCode: string, setSource: string) { await fetch('/api/attributes', { method: 'POST', body: JSON.stringify({ channel, channelCode, setSource }) }); await load(); }
  async function setDefault(code: string, setDefault: string) { await fetch('/api/attributes', { method: 'POST', body: JSON.stringify({ channel, category, code, setDefault }) }); await load(); }

  const name = channels.find((c) => c.key === channel)?.name ?? channel;
  const isRed = (r: Row) => r.required && !r.fixed && !r.source && !r.defaultValue;
  const red = rows.filter(isRed).length;
  const shown = onlyRed ? rows.filter(isRed) : rows;
  const field = { padding: '5px 8px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, background: 'var(--paper)', maxWidth: 260 } as const;
  const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)', fontWeight: 500, fontSize: 12 } as const;
  const td = { padding: '5px 8px', borderBottom: '1px solid var(--rule)', verticalAlign: 'top', fontSize: 12 } as const;
  const how = (r: Row) => r.fixed ? 'automatic' : r.origin === 'manual' ? 'you set' : r.origin === 'builtin' ? 'built in' : r.origin === 'learned' ? `learned ${Math.round(r.confidence * 100)}%` : r.defaultValue ? 'default' : '';

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section style={{ overflowY: 'auto', padding: '28px 32px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 4px' }}>Attributes</h2>
        <p style={{ color: 'var(--ink-2)', margin: '0 0 20px', fontSize: 13 }}>
          Set a column's source once — it applies to every category. Only red rows need you.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn primary" style={{ flex: 'none' }} disabled={busy} onClick={learnAll}>{busy ? 'Learning…' : 'Learn everything, all marketplaces'}</button>
          <select value={channel} onChange={(e) => { setChannel(e.target.value); setCategory(''); }} style={{ ...field, width: 160 }}>{channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...field, width: 340, maxWidth: 340 }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyRed} onChange={(e) => setOnlyRed(e.target.checked)} /> Only what needs me</label>
        </div>
        <p className={`status-line${red ? ' fail' : ''}`} style={{ marginBottom: 14 }}>{msg || (red ? `${red} required ${name} columns have no source yet` : rows.length ? `Every required ${name} column has a source` : '')}</p>

        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th style={th}>{name} column</th><th style={th}>{category ? 'Need' : 'Required in'}</th><th style={th}>Filled from Nordstrom</th><th style={th}>How</th><th style={th}>{category ? "Default for this category" : "Custom value (all categories)"}</th><th style={th}>Allowed values</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.code} style={{ background: isRed(r) ? 'var(--alert-bg)' : 'transparent' }}>
                <td style={td}><div style={{ fontWeight: 500 }}>{r.label}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{r.base}</div></td>
                <td style={td}>{category ? (r.required ? <span className="tag ready">Required</span> : <span className="tag">Optional</span>) : (r.requiredIn ? <span className="tag ready">{r.requiredIn} categories</span> : <span className="tag">optional</span>)}</td>
                <td style={td}>
                  {r.fixed ? <span style={{ color: 'var(--ink-3)' }}>handled automatically</span> : (
                    <select value={r.source} onChange={(e) => setSource(r.base, e.target.value)} style={field}>
                      <option value="">— nothing —</option>
                      {nord.map((n) => <option key={n.code} value={n.code}>{n.label}</option>)}
                    </select>
                  )}
                </td>
                <td style={td}>{how(r) && <span className="tag">{how(r)}</span>}</td>
                <td style={td}>{!r.fixed && <input defaultValue={r.defaultValue} placeholder={category ? r.example : "custom value, all categories"} onBlur={(e) => e.target.value !== r.defaultValue && setDefault(category ? r.code : r.base, e.target.value)} style={{ ...field, width: 200 }} />}</td>
                <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{r.allowedCount ? `${r.allowedCount} values` : 'free text'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
