'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

type Stage = 'not_started' | 'ignored' | 'queue' | 'approved' | 'sent' | 'accepted' | 'rejected' | 'listed' | 'oos' | 'live';
interface Cell { stage: Stage; counts: Partial<Record<Stage, number>>; since: string | null; stuck: boolean; error: string | null }
interface Row { key: string; styleCode: string; color: string; title: string; thumb: string; sizes: number; cells: Record<string, Cell> }
interface Sum { name: string; counts: Partial<Record<Stage, number>>; stuck: number; offersPulled: boolean }
interface Data { channels: string[]; summary: Record<string, Sum>; total: number; page: number; per: number; rows: Row[]; error?: string }

const STAGES: { key: Stage; label: string; color: string; help: string }[] = [
  { key: 'not_started', label: 'Not sent', color: '#c9c9c9', help: 'Never sent to this marketplace.' },
  { key: 'ignored', label: 'Ignored', color: '#9e9e9e', help: 'You chose to skip it for this marketplace.' },
  { key: 'queue', label: 'In queue', color: '#3b82f6', help: 'Waiting for your approval in the Queue.' },
  { key: 'approved', label: 'Approved', color: '#6d5ce8', help: 'You approved it — waiting to be sent.' },
  { key: 'sent', label: 'Processing', color: '#9b59d0', help: 'Sent — the marketplace is checking it.' },
  { key: 'accepted', label: 'Accepted', color: '#0f9b8e', help: 'Marketplace accepted it — waiting for the offer to show.' },
  { key: 'rejected', label: 'Rejected', color: '#e5484d', help: 'Marketplace rejected it — click to see the error.' },
  { key: 'listed', label: 'No offer', color: '#14b8a6', help: 'In their catalogue, but there is no offer (price/stock) yet.' },
  { key: 'oos', label: 'No stock', color: '#f5a524', help: 'Live, but stock is 0 — customers cannot buy.' },
  { key: 'live', label: 'Selling', color: '#30a46c', help: 'Live with stock — customers can buy.' },
];
const ago = (t: string | null) => { if (!t) return ''; const d = Math.floor((Date.now() - new Date(t).getTime()) / 86_400_000); return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`; };
const whereToGo = (ch: string, st: Stage) => st === 'queue' || st === 'not_started' ? `/queue?channel=${ch}` : st === 'approved' || st === 'sent' || st === 'rejected' || st === 'accepted' ? `/results?channel=${ch}` : st === 'oos' ? '/inventory' : `/catalog?channel=${ch}`;

const css = `
.tr { padding: 22px 24px 40px; overflow-y: auto; min-width: 0; }
.tr h2 { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
.tr-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; margin: 14px 0; }
.tr-card { border: 1px solid var(--rule); border-radius: 10px; padding: 12px; background: var(--paper); font-size: 12px; cursor: pointer; text-align: left; font-family: inherit; color: inherit; }
.tr-card.on { border-color: #6d5ce8; box-shadow: 0 0 0 1px #6d5ce8; }
.tr-card .n { font-size: 14px; font-weight: 700; display: flex; gap: 6px; align-items: center; }
.tr-bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: #eee; margin: 8px 0 6px; }
.tr-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; }
.tr-legend span { display: inline-flex; gap: 4px; align-items: center; }
.tr-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.tr-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.tr-tools input[type=search], .tr-tools select { padding: 7px 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; background: var(--paper); }
.tr-tools input[type=search] { flex: 1; min-width: 200px; max-width: 320px; }
.tr-table { overflow-x: auto; border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); }
.tr-table table { border-collapse: collapse; width: 100%; font-size: 12px; }
.tr-table th { position: sticky; top: 0; background: #fafafa; text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); white-space: nowrap; font-weight: 600; }
.tr-table td { padding: 8px 10px; border-bottom: 1px solid #f2f2f2; vertical-align: top; }
.tr-chip { display: inline-flex; gap: 5px; align-items: center; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; color: #fff; text-decoration: none; white-space: nowrap; }
.tr-sub { font-size: 10.5px; color: var(--ink-3); margin-top: 3px; }
.tr-stuck { color: #b42318; font-weight: 700; }
.tr-cell { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.tr-q { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--rule-strong); background: var(--paper); font-weight: 800; font-size: 12px; cursor: pointer; color: inherit; }
.tr-help { border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); padding: 12px 14px; margin: 10px 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px 16px; font-size: 12.5px; }
.tr-help div { display: flex; gap: 8px; align-items: flex-start; }
.tr-help b { white-space: nowrap; }
.tr-thumb { width: 36px; height: 46px; border-radius: 4px; object-fit: cover; background: #f4f4f4; flex: none; }
@media (max-width: 700px) { .tr { padding: 16px 12px 40px; } }
`;

export default function TrackerPage() {
  const [data, setData] = useState<Data | null>(null);
  const [channel, setChannel] = useState('');
  const [stage, setStage] = useState('');
  const [stuck, setStuck] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [help, setHelp] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/tracker?${new URLSearchParams({ channel, stage, stuck: stuck ? '1' : '0', q, page: String(page) })}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [channel, stage, stuck, q, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const chs = data?.channels ?? [];
  const shown = channel ? [channel] : chs;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="tr">
        <style>{css}</style>
        <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Go-live tracker <button className="tr-q" title="What do the colours mean?" onClick={() => setHelp(!help)}>?</button></h2>
        <p className="status-line">Each box shows how many sizes are in each status — for example <b>4 · Selling</b> and <b>1 · No stock</b>. Click a status to fix it. Press <b>?</b> to see what each colour means.</p>
        {help && (
          <div className="tr-help">
            {[...STAGES].reverse().map((x) => <div key={x.key}><i className="tr-dot" style={{ background: x.color, marginTop: 4, flex: 'none' }} /><span><b>{x.label}</b> — {x.help}</span></div>)}
            <div><span className="tr-stuck" style={{ flex: 'none' }}>⚠</span><span><b>Stuck</b> — too many days in one step, or rejected.</span></div>
          </div>
        )}

        <div className="tr-cards">
          {chs.map((c) => { const s = data!.summary[c]; const total = Object.values(s.counts).reduce((a, b) => a + (b ?? 0), 0) || 1; return (
            <button key={c} className={`tr-card${channel === c ? ' on' : ''}`} onClick={() => { setChannel(channel === c ? '' : c); setPage(1); }}>
              <div className="n"><span style={{ flex: 1 }}>{s.name}</span>{s.stuck > 0 && <span className="tr-stuck">{s.stuck} stuck</span>}</div>
              <div className="tr-bar">{STAGES.filter((x) => s.counts[x.key]).map((x) => <div key={x.key} title={`${x.label}: ${s.counts[x.key]}`} style={{ width: `${((s.counts[x.key] ?? 0) / total) * 100}%`, background: x.color }} />)}</div>
              <div className="tr-legend">{STAGES.filter((x) => s.counts[x.key]).map((x) => <span key={x.key}><i className="tr-dot" style={{ background: x.color }} />{x.label} {s.counts[x.key]}</span>)}</div>
              {!s.offersPulled && <div className="status-line" style={{ marginTop: 6 }}>Pull offers on Inventory to see live / 0-stock.</div>}
            </button>
          ); })}
        </div>

        <div className="tr-tools">
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search title, style or colour" />
          <select value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}>
            <option value="">Every status</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={stuck} onChange={(e) => { setStuck(e.target.checked); setPage(1); }} /> Stuck only</label>
          {channel && <button className="filter" onClick={() => setChannel('')}>{data?.summary[channel]?.name} ✕</button>}
          <span className="status-line">{data ? `${data.total} colours` : ''}</span>
          {!data && <Spinner size={14} />}
        </div>

        {data?.error && <p style={{ color: '#b42318' }}>{data.error}</p>}
        {data && !data.error && (data.rows.length === 0 ? <div className="cs-empty"><div className="e">🧭</div><div className="t">Nothing here</div><div className="s">No colours match these filters.</div></div> : (
          <div className="tr-table">
            <table>
              <thead><tr><th>Style · colour</th>{shown.map((c) => <th key={c}>{data.summary[c].name}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key}>
                    <td style={{ minWidth: 220 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.thumb ? <img className="tr-thumb" src={r.thumb} alt="" loading="lazy" /> : <span className="tr-thumb" />}
                        <div><div style={{ fontWeight: 600 }}>{r.title}</div><div className="tr-sub">{r.styleCode} · {r.color} · {r.sizes} size{r.sizes === 1 ? '' : 's'}</div></div>
                      </div>
                    </td>
                    {shown.map((c) => { const x = r.cells[c]; const parts = STAGES.slice().reverse().filter((s) => (x.counts[s.key] ?? 0) > 0).map((s) => ({ s, n: x.counts[s.key] ?? 0 })); return (
                      <td key={c} style={{ minWidth: 130 }}>
                        <div className="tr-cell">
                          {parts.map(({ s, n }) => (
                            <Link key={s.key} href={whereToGo(c, s.key)} className="tr-chip" style={{ background: s.color }} title={`${n} of ${r.sizes} size${r.sizes === 1 ? '' : 's'}: ${s.help}`}>
                              {n === r.sizes ? `All · ${s.label}` : `${n} · ${s.label}`}
                            </Link>
                          ))}
                        </div>
                        {x.since && ['queue', 'approved', 'sent', 'accepted', 'rejected'].includes(x.stage) && <div className={`tr-sub${x.stuck ? ' tr-stuck' : ''}`}>{x.stuck ? '⚠ ' : ''}{ago(x.since)} in this step</div>}
                        {x.error && <div className="tr-sub tr-stuck" title={x.error}>{x.error.slice(0, 70)}</div>}
                      </td>
                    ); })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {data && data.total > data.per && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12, fontSize: 13 }}>
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span>Page {page} of {pages}</span>
            <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        )}
      </section>
    </main>
  );
}
