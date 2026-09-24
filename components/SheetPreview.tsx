'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface Col { code: string; label: string; required: boolean; used: boolean; example: string; allowed: string[] }
interface RowT { changeId: string; title: string; color: string; size: string; category: string; values: Record<string, string> }
interface Props { channelKey: string; channelName: string; changeIds: string[]; onClose: () => void; onSaved: () => void }
interface Picker { r: number; c: string; q: string; x: number; y: number; w: number }

const SELECT_MAX = 300; // longer marketplace lists use the searchable picker over the full list

export default function SheetPreview({ channelKey, channelName, changeIds, onClose, onSaved }: Props) {
  const [cols, setCols] = useState<Col[]>([]);
  const [rows, setRows] = useState<RowT[]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'used' | 'filled' | 'all'>('used');
  const [sel, setSel] = useState<{ r: number; c: string } | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [saving, setSaving] = useState(false);
  const dragFrom = useRef<{ r: number; c: string } | null>(null);

  useEffect(() => {
    fetch(`/api/sheet?channel=${channelKey}&ids=${changeIds.join(',')}`).then((r) => r.json()).then((j) => { setCols(j.columns ?? []); setRows(j.rows ?? []); setLoading(false); });
  }, [channelKey, changeIds]);

  const colBy = useMemo(() => new Map(cols.map((c) => [c.code, c])), [cols]);
  const val = (r: RowT, c: string) => edits[r.changeId]?.[c] ?? r.values[c] ?? '';
  const visible = useMemo(() => cols.filter((c) => mode === 'all' ? true : mode === 'used' ? c.used || rows.some((r) => val(r, c.code)) : rows.some((r) => val(r, c.code))), [cols, rows, mode, edits]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(r: number, c: string, v: string) { const id = rows[r].changeId; setEdits((e) => ({ ...e, [id]: { ...(e[id] ?? {}), [c]: v } })); }
  function fillDown(r: number, c: string) { const v = val(rows[r], c); for (let i = r; i < rows.length; i++) set(i, c, v); }
  function fillColumn(c: string, v: string) { rows.forEach((_, i) => set(i, c, v)); }
  function fillRange(from: { r: number; c: string }, to: { r: number; c: string }) {
    if (from.c !== to.c) return;
    const v = val(rows[from.r], from.c);
    const [a, b] = from.r < to.r ? [from.r, to.r] : [to.r, from.r];
    for (let i = a; i <= b; i++) set(i, from.c, v);
  }
  async function save() { setSaving(true); await fetch('/api/sheet', { method: 'POST', body: JSON.stringify({ edits }) }); setSaving(false); onSaved(); onClose(); }

  const matches = useMemo(() => {
    if (!picker) return { list: [] as string[], total: 0 };
    const all = colBy.get(picker.c)?.allowed ?? [];
    const q = picker.q.trim().toLowerCase();
    const hits = q ? all.filter((a) => a.toLowerCase().includes(q)) : all;
    const starts = q ? hits.filter((a) => a.toLowerCase().startsWith(q)) : [];
    const ordered = q ? [...starts, ...hits.filter((a) => !a.toLowerCase().startsWith(q))] : hits;
    return { list: ordered.slice(0, 100), total: hits.length };
  }, [picker, colBy]);

  function openPicker(el: HTMLElement, r: number, c: string) {
    const rect = el.getBoundingClientRect();
    setSel({ r, c });
    setPicker({ r, c, q: '', x: rect.left, y: rect.bottom, w: Math.max(rect.width, 280) });
  }
  function choose(v: string) { if (!picker) return; set(picker.r, picker.c, v); setPicker(null); }
  function closePicker() {
    if (!picker) return;
    const all = colBy.get(picker.c)?.allowed ?? [];
    const exact = all.find((a) => a.toLowerCase() === picker.q.trim().toLowerCase());
    if (exact) set(picker.r, picker.c, exact); // only values from the marketplace list are accepted
    setPicker(null);
  }

  const changed = Object.values(edits).reduce((n, e) => n + Object.keys(e).length, 0);
  const cell = { padding: 0, borderBottom: '1px solid var(--rule)', borderRight: '1px solid var(--rule)', minWidth: 150, maxWidth: 320, position: 'relative' } as const;
  const inp = { width: '100%', border: 0, padding: '6px 8px', font: '12px var(--mono)', background: 'transparent', color: 'var(--ink)', outline: 'none' } as const;

  function renderEditor(r: RowT, i: number, c: Col) {
    const v = val(r, c.code);
    const bad = c.allowed.length > 0 && v !== '' && !c.allowed.includes(v);
    const style = { ...inp, color: bad ? 'var(--alert)' : 'var(--ink)' };

    if (c.allowed.length > 0 && c.allowed.length <= SELECT_MAX) {
      return (
        <select value={v} onChange={(e) => set(i, c.code, e.target.value)} onFocus={() => setSel({ r: i, c: c.code })} style={{ ...style, appearance: 'auto', cursor: 'pointer' }}>
          <option value="">{c.required ? '— required —' : '—'}</option>
          {bad && <option value={v}>{v} (not accepted)</option>}
          {c.allowed.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      );
    }
    if (c.allowed.length > SELECT_MAX) {
      const open = picker?.r === i && picker?.c === c.code;
      return (
        <input
          value={open ? picker!.q : v}
          placeholder={open ? `Search ${c.allowed.length.toLocaleString()} values…` : c.required ? '— required —' : ''}
          onFocus={(e) => openPicker(e.currentTarget, i, c.code)}
          onChange={(e) => setPicker((p) => (p ? { ...p, q: e.target.value } : p))}
          onBlur={closePicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (matches.list[0]) choose(matches.list[0]); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { setPicker(null); (e.target as HTMLInputElement).blur(); }
          }}
          style={{ ...style, cursor: 'pointer' }}
        />
      );
    }
    return (
      <input value={v} onChange={(e) => set(i, c.code, e.target.value)} onFocus={() => setSel({ r: i, c: c.code })} style={style}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); fillDown(i, c.code); } }} />
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--paper)', width: '96vw', height: '92vh', borderRadius: 6, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{channelName} sheet — {rows.length} rows</div>
            <div className="status-line">Columns and values come from {channelName}&apos;s own spec file. ▾ columns only accept {channelName}&apos;s listed values. Drag the small square to fill down · Shift+Enter fills down · double-click a header fills the column.</div>
          </div>
          <div className="filters">
            {(['used', 'filled', 'all'] as const).map((m) => <button key={m} className="filter" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === 'used' ? 'Columns for these categories' : m === 'filled' ? 'Filled only' : 'Every column'}</button>)}
          </div>
          <span className="status-line">{changed ? `${changed} edits` : ''}</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" style={{ flex: 'none' }} disabled={saving || !changed} onClick={save}>{saving ? 'Saving…' : 'Save edits'}</button>
        </header>

        <div style={{ overflow: 'auto', flex: 1 }} onMouseUp={() => (dragFrom.current = null)} onScroll={() => picker && setPicker(null)}>
          {loading ? <p className="empty">Building the sheet…</p> : (
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--paper-sunk)', zIndex: 2 }}>
                <tr>
                  <th style={{ ...cell, position: 'sticky', left: 0, background: 'var(--paper-sunk)', zIndex: 3, padding: '6px 8px', textAlign: 'left', fontWeight: 500, minWidth: 220 }}>Product</th>
                  {visible.map((c) => (
                    <th key={c.code} title={`${c.code}${c.allowed.length ? ` · ${c.allowed.length} values from ${channelName}` : ''}${c.example ? ' · e.g. ' + c.example : ''}\nDouble-click to fill column from first row`} onDoubleClick={() => rows[0] && fillColumn(c.code, val(rows[0], c.code))}
                      style={{ ...cell, padding: '6px 8px', textAlign: 'left', fontWeight: 500, cursor: 'pointer', color: c.required ? 'var(--ink)' : 'var(--ink-2)' }}>
                      {c.label}{c.required && <span style={{ color: 'var(--alert)' }}> *</span>}{c.allowed.length > 0 && <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> ▾</span>}
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', fontWeight: 400 }}>{c.code}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.changeId}>
                    <td style={{ ...cell, position: 'sticky', left: 0, background: 'var(--paper)', zIndex: 1, padding: '6px 8px' }}>
                      <div style={{ fontSize: 12 }}>{r.title}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{r.color} · {r.size}</div>
                    </td>
                    {visible.map((c) => {
                      const v = val(r, c.code);
                      const edited = edits[r.changeId]?.[c.code] !== undefined;
                      const isSel = sel?.r === i && sel?.c === c.code;
                      return (
                        <td key={c.code} style={{ ...cell, background: edited ? '#fff8e1' : c.required && !v ? 'var(--alert-bg)' : 'transparent', outline: isSel ? '2px solid var(--ink)' : 'none', outlineOffset: -2 }}
                          onMouseEnter={() => { if (dragFrom.current) fillRange(dragFrom.current, { r: i, c: c.code }); }}>
                          {renderEditor(r, i, c)}
                          {isSel && !picker && <div title="Drag down to fill" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); dragFrom.current = { r: i, c: c.code }; }}
                            style={{ position: 'absolute', right: -3, bottom: -3, width: 8, height: 8, background: 'var(--ink)', cursor: 'crosshair', zIndex: 2 }} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {picker && (
          <div style={{ position: 'fixed', left: picker.x, top: picker.y, width: picker.w, maxHeight: 280, overflowY: 'auto', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 4, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', zIndex: 80, fontSize: 12 }}>
            <div style={{ padding: '6px 10px', color: 'var(--ink-3)', borderBottom: '1px solid var(--rule)' }}>
              {matches.total.toLocaleString()} of {(colBy.get(picker.c)?.allowed.length ?? 0).toLocaleString()} {channelName} values{matches.total > 100 ? ' — keep typing to narrow' : ''}
            </div>
            <div onMouseDown={(e) => { e.preventDefault(); choose(''); }} style={{ padding: '6px 10px', cursor: 'pointer', color: 'var(--ink-3)' }}>— clear —</div>
            {matches.list.map((a) => (
              <div key={a} onMouseDown={(e) => { e.preventDefault(); choose(a); }}
                style={{ padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--mono)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-sunk)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>{a}</div>
            ))}
            {matches.total === 0 && <div style={{ padding: '8px 10px', color: 'var(--alert)' }}>Not a {channelName} value</div>}
          </div>
        )}
      </div>
    </div>
  );
}
