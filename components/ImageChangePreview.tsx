'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Spinner from './Spinner';

interface D { rows: { upc: string; size: string; title: string; color: string; values: Record<string, string>; changed: string[] }[]; columns: { code: string; label: string }[]; swatchMissing: boolean }

export default function ImageChangePreview({ ids, channelName, onClose }: { ids: string[]; channelName: string; onClose: () => void }) {
  const { data, error } = useSWR<D>(`/api/image-changes/preview?ids=${ids.join(',')}`);
  const [mode, setMode] = useState<'changed' | 'filled' | 'all'>('changed');
  const changedCodes = useMemo(() => new Set((data?.rows ?? []).flatMap((r) => r.changed)), [data]);
  const cols = (data?.columns ?? []).filter((c) => mode === 'all' || (mode === 'changed' ? changedCodes.has(c.code) : (data?.rows ?? []).some((r) => r.values[c.code])));
  const cell = { padding: '6px 10px', borderBottom: '1px solid var(--rule)', borderRight: '1px solid var(--rule)', verticalAlign: 'top', maxWidth: 280, fontSize: 12 } as const;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--paper)', width: '96vw', height: '90vh', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--rule)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Preview — rows to {channelName}{data ? ` · ${data.rows.length} sizes` : ''}</div>
            <div className="status-line">{channelName}&apos;s own row for each size; highlighted cells are what changes.</div>
          </div>
          <div className="filters">
            <button className="filter" aria-pressed={mode === 'changed'} onClick={() => setMode('changed')}>Changed columns</button>
            <button className="filter" aria-pressed={mode === 'filled'} onClick={() => setMode('filled')}>All filled</button>
            <button className="filter" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>Every column</button>
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </header>
        {data?.swatchMissing && <p style={{ margin: 0, padding: '8px 16px', fontSize: 12.5, background: '#fdf1dc', color: '#8a5a00' }}>No swatch yet for this colour — one is made automatically from the primary image when you send (or make it now under Edit → Swatch).</p>}
        <div style={{ overflow: 'auto', flex: 1 }}>
          {error ? <p className="notice" style={{ margin: 16 }}>{(error as Error).message}</p> : !data ? <div className="loading-block"><Spinner /> Building preview…</div> : (
            <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--paper-sunk)', zIndex: 2 }}>
                <tr>
                  <th style={{ ...cell, position: 'sticky', left: 0, background: 'var(--paper-sunk)', zIndex: 3, textAlign: 'left', minWidth: 170 }}>Size / UPC</th>
                  {cols.map((c) => <th key={c.code} style={{ ...cell, textAlign: 'left', fontWeight: 500, minWidth: 140 }}>{c.label}<div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', fontWeight: 400 }}>{c.code}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.upc}>
                    <td style={{ ...cell, position: 'sticky', left: 0, background: 'var(--paper)', zIndex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{r.size || '—'} · {r.color}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{r.upc}</div>
                    </td>
                    {cols.map((c) => {
                      const v = r.values[c.code] ?? '';
                      const hot = r.changed.includes(c.code);
                      return (
                        <td key={c.code} style={{ ...cell, background: hot ? '#fff8e1' : 'transparent' }}>
                          {v.startsWith('http') ? (
                            <a href={v} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--ink)', textDecoration: 'none' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={v} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, flex: 'none' }} />
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{v.split('/').pop()}</span>
                            </a>
                          ) : hot && !v ? <span style={{ color: 'var(--alert)' }}>(empty)</span> : <span style={{ whiteSpace: 'pre-wrap' }}>{v.length > 160 ? v.slice(0, 160) + '…' : v}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
