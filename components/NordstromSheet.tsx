'use client';

import { useMemo, useState } from 'react';

interface Col { code: string; label: string; required: boolean; used: boolean; allowed: string[] }
interface Size { gtin: string; size: string; values: Record<string, string> }
interface Props { title: string; columns: Col[]; sizes: Size[]; existing: Record<string, Record<string, string>>; onClose: () => void; onSave: (fields: Record<string, Record<string, string>>) => Promise<void> }

export default function NordstromSheet({ title, columns, sizes, existing, onClose, onSave }: Props) {
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const s of sizes) out[s.gtin] = { ...(existing['*'] ?? {}), ...(existing[s.gtin] ?? {}) };
    return out;
  });
  const [mode, setMode] = useState<'used' | 'all'>('used');
  const [saving, setSaving] = useState(false);

  const val = (s: Size, c: string) => edits[s.gtin]?.[c] ?? s.values[c] ?? '';
  const changed = (s: Size, c: string) => edits[s.gtin]?.[c] !== undefined && edits[s.gtin][c] !== (s.values[c] ?? '');
  const visible = useMemo(() => columns.filter((c) => mode === 'all' || c.used || sizes.some((s) => s.values[c.code])), [columns, sizes, mode]);
  const set = (g: string, c: string, v: string) => setEdits((e) => ({ ...e, [g]: { ...(e[g] ?? {}), [c]: v } }));
  const fillColumn = (c: string) => { const v = val(sizes[0], c); sizes.forEach((s) => set(s.gtin, c, v)); };
  const count = sizes.reduce((n, s) => n + visible.filter((c) => changed(s, c.code)).length, 0);

  async function save() {
    const out: Record<string, Record<string, string>> = {};
    for (const s of sizes) for (const c of columns) if (changed(s, c.code)) { out[s.gtin] ??= {}; out[s.gtin][c.code] = edits[s.gtin][c.code]; }
    setSaving(true); await onSave(out); setSaving(false); onClose();
  }

  const cell = { padding: 0, borderBottom: '1px solid var(--rule)', borderRight: '1px solid var(--rule)', minWidth: 160, maxWidth: 340 } as const;
  const inp = { width: '100%', border: 0, padding: '6px 8px', font: '12px var(--mono)', background: 'transparent', color: 'var(--ink)', outline: 'none' } as const;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--paper)', width: '96vw', height: '92vh', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{title} — Nordstrom info, {sizes.length} sizes</div>
            <div className="status-line">Nordstrom&apos;s own columns and values. Double-click a column header to copy the first size to every size.</div>
          </div>
          <div className="filters">
            <button className="filter" aria-pressed={mode === 'used'} onClick={() => setMode('used')}>Columns for this category</button>
            <button className="filter" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>Every column</button>
          </div>
          <span className="status-line">{count ? `${count} changes` : ''}</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" style={{ flex: 'none' }} disabled={saving || !count} onClick={save}>{saving ? 'Saving…' : 'Save as draft'}</button>
        </header>
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, whiteSpace: 'nowrap' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--paper-sunk)', zIndex: 2 }}>
              <tr>
                <th style={{ ...cell, position: 'sticky', left: 0, background: 'var(--paper-sunk)', zIndex: 3, padding: '6px 8px', textAlign: 'left', fontWeight: 500, minWidth: 150 }}>Size</th>
                {visible.map((c) => (
                  <th key={c.code} onDoubleClick={() => fillColumn(c.code)} title={`${c.code}${c.allowed.length ? ` · ${c.allowed.length} Nordstrom values` : ''}`} style={{ ...cell, padding: '6px 8px', textAlign: 'left', fontWeight: 500, cursor: 'pointer' }}>
                    {c.label}{c.required && <span style={{ color: 'var(--alert)' }}> *</span>}{c.allowed.length > 0 && <span style={{ color: 'var(--ink-3)' }}> ▾</span>}
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', fontWeight: 400 }}>{c.code}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => (
                <tr key={s.gtin}>
                  <td style={{ ...cell, position: 'sticky', left: 0, background: 'var(--paper)', zIndex: 1, padding: '6px 8px' }}>
                    <div>{s.size}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{s.gtin}</div>
                  </td>
                  {visible.map((c) => {
                    const v = val(s, c.code);
                    return (
                      <td key={c.code} style={{ ...cell, background: changed(s, c.code) ? '#fff8e1' : c.required && !v ? 'var(--alert-bg)' : 'transparent' }}>
                        {c.allowed.length > 0 && c.allowed.length <= 400 ? (
                          <select value={v} onChange={(e) => set(s.gtin, c.code, e.target.value)} style={{ ...inp, appearance: 'auto', cursor: 'pointer' }}>
                            <option value="">—</option>
                            {v && !c.allowed.includes(v) && <option value={v}>{v} (not in list)</option>}
                            {c.allowed.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        ) : (
                          <input value={v} onChange={(e) => set(s.gtin, c.code, e.target.value)} style={inp} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
