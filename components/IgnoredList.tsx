'use client';

import { useState } from 'react';
import Spinner from './Spinner';

export interface IgnoredGroup { key: string; title: string; styleCode: string; color: string; thumb: string; at: string; items: { gtin: string; size: string }[] }

interface Props { groups: IgnoredGroup[] | undefined; channelName: string; onRevert: (gtins: string[]) => Promise<void> }

export default function IgnoredList({ groups, channelName, onRevert }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  if (!groups) return <div className="loading-block"><Spinner /> Loading ignored items…</div>;
  if (groups.length === 0) return <p className="empty">Nothing ignored on {channelName}. Ignored items stay out of the queue on every future import until you revert them.</p>;

  const gtinsOf = (keys: Set<string>) => groups.filter((g) => keys.has(g.key)).flatMap((g) => g.items.map((i) => i.gtin));
  async function revert(gtins: string[]) { setBusy(true); await onRevert(gtins); setChecked(new Set()); setBusy(false); }
  const all = groups.length > 0 && groups.every((g) => checked.has(g.key));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--rule)', background: 'var(--paper-sunk)', position: 'sticky', top: 0, zIndex: 1 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)' }}>
          <input type="checkbox" checked={all} onChange={(e) => setChecked(e.target.checked ? new Set(groups.map((g) => g.key)) : new Set())} /> Select all
        </label>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="status-line">These never come back to the queue on import until reverted.</span>
        <button className="btn" disabled={busy || checked.size === 0} onClick={() => revert(gtinsOf(checked))}>
          {busy ? 'Reverting…' : `Revert ${checked.size || ''} ${checked.size === 1 ? 'colour' : 'colours'}`.replace('  ', ' ')}
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.key} className="row" style={{ gridTemplateColumns: '18px 26px 1fr 110px 120px 80px' }}>
          <input type="checkbox" checked={checked.has(g.key)} onChange={(e) => setChecked((p) => { const n = new Set(p); if (e.target.checked) n.add(g.key); else n.delete(g.key); return n; })} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="row-thumb" src={g.thumb} alt="" />
          <span className="row-main">
            <span className="row-title">{g.title}</span><br />
            <span className="row-id">{g.styleCode} · {g.color}</span>
          </span>
          <span className="row-kind" title={g.items.map((i) => i.size).join(', ')}>{g.items.length} {g.items.length === 1 ? 'size' : 'sizes'}: {g.items.map((i) => i.size).slice(0, 4).join(', ')}{g.items.length > 4 ? '…' : ''}</span>
          <span className="row-kind">{new Date(g.at).toLocaleDateString()}</span>
          <span><button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy} onClick={() => revert(g.items.map((i) => i.gtin))}>Revert</button></span>
        </div>
      ))}
    </>
  );
}
