'use client';
import { getJSON } from '@/lib/client-cache';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

type Money = Record<string, number>;
type Label = 'best' | 'rising' | 'falling' | 'slow' | 'none' | 'ok';
interface Row { key: string; styleCode: string; color: string; title: string; thumb: string; units: number; prevUnits: number; change: number | null; revenue: Money; orders: number; returns: number; byChannel: Record<string, { units: number; revenue: Money }>; sizes: Record<string, number>; liveOn: string[]; stock: number | null; weeksLeft: number | null; label: Label }
interface Card { name: string; units: number; prevUnits: number; revenue: Money; orders: number; daily: number[]; change: number | null; top: { title: string; color: string; units: number }[] }
interface Status { name: string; backfilled: boolean; total: number; lastSync: string | null; error: string | null }
interface Data { days: number; channels: string[]; summary: Record<string, Card>; status: Record<string, Status>; counts: Record<string, number>; total: number; page: number; per: number; rows: Row[]; error?: string }

const LABELS: Record<string, { text: string; color: string; help: string }> = {
  best: { text: '🔥 Best seller', color: '#30a46c', help: 'In your top 10% by units sold.' },
  rising: { text: '📈 Rising', color: '#0f9b8e', help: 'Selling at least 50% more than the period before.' },
  falling: { text: '📉 Falling', color: '#f5a524', help: 'Selling half or less than the period before.' },
  slow: { text: '🐢 Slow', color: '#9b59d0', help: 'Live with stock but only 1–2 sold.' },
  none: { text: '⛔ Not selling', color: '#e5484d', help: 'Live with stock and nothing sold.' },
};
const SYMBOL: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', CAD: 'C$' };
const money = (m: Money) => { const e = Object.entries(m).filter(([, v]) => Math.abs(v) >= 0.5); return e.length ? e.map(([c, v]) => `${SYMBOL[c] ?? c + ' '}${Math.round(v).toLocaleString()}`).join(' + ') : '—'; };
const pct = (n: number | null) => n === null ? '' : n > 0 ? `▲ ${n}%` : n < 0 ? `▼ ${Math.abs(n)}%` : '= 0%';
const ago = (t: string | null) => { if (!t) return 'never'; const m = Math.round((Date.now() - new Date(t).getTime()) / 60_000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

function Spark({ v }: { v: number[] }) {
  const max = Math.max(1, ...v), w = 160, h = 34;
  const pts = v.map((y, i) => `${(i / Math.max(1, v.length - 1)) * w},${h - (y / max) * (h - 4) - 2}`).join(' ');
  return <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: 34, display: 'block', marginTop: 6 }}><polyline points={pts} fill="none" stroke="#6d5ce8" strokeWidth="1.6" /></svg>;
}

const css = `
.sa { padding: 22px 24px 40px; overflow-y: auto; min-width: 0; }
.sa h2 { font-size: 22px; font-weight: 800; margin: 0 0 4px; display: flex; gap: 8px; align-items: center; }
.sa-q { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--rule-strong); background: var(--paper); font-weight: 800; font-size: 12px; cursor: pointer; color: inherit; }
.sa-help { border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); padding: 12px 14px; margin: 10px 0; font-size: 12.5px; line-height: 1.7; }
.sa-period { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0 4px; }
.sa-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin: 12px 0; }
.sa-card { border: 1px solid var(--rule); border-radius: 10px; padding: 12px; background: var(--paper); font-size: 12px; cursor: pointer; text-align: left; font-family: inherit; color: inherit; }
.sa-card.on { border-color: #6d5ce8; box-shadow: 0 0 0 1px #6d5ce8; }
.sa-card .n { font-size: 13px; font-weight: 700; color: var(--ink-3); }
.sa-card .big { font-size: 20px; font-weight: 800; margin: 2px 0; }
.sa-up { color: #1f8a4c; font-weight: 700; }
.sa-down { color: #b42318; font-weight: 700; }
.sa-sub { font-size: 11.5px; color: var(--ink-3); }
.sa-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.sa-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.sa-tools input[type=search] { padding: 7px 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; background: var(--paper); flex: 1; min-width: 200px; max-width: 320px; }
.sa-table { overflow-x: auto; border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); }
.sa-table table { border-collapse: collapse; width: 100%; font-size: 12px; }
.sa-table th { position: sticky; top: 0; background: #fafafa; text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); white-space: nowrap; font-weight: 600; }
.sa-table td { padding: 8px 10px; border-bottom: 1px solid #f2f2f2; vertical-align: top; white-space: nowrap; }
.sa-table tr.click { cursor: pointer; }
.sa-table tr.click:hover td { background: #fafafe; }
.sa-chip { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10.5px; font-weight: 700; color: #fff; margin-top: 3px; }
.sa-thumb { width: 34px; height: 44px; border-radius: 4px; object-fit: cover; background: #f4f4f4; flex: none; }
.sa-dim { opacity: .45; pointer-events: none; transition: opacity .15s; }
.sa-sizes { display: flex; gap: 6px; flex-wrap: wrap; white-space: normal; }
.sa-sizes span { border: 1px solid var(--rule); border-radius: 6px; padding: 2px 7px; }
@media (max-width: 700px) { .sa { padding: 16px 12px 40px; } }
`;

export default function SalesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [days, setDays] = useState(30);
  const [group, setGroup] = useState<'color' | 'style'>('color');
  const [view, setView] = useState('all');
  const [channel, setChannel] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [help, setHelp] = useState(false);
  const [open, setOpen] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getJSON(`/api/sales?${new URLSearchParams({ days: String(days), group, view, channel, q, page: String(page) })}`, setData).catch((e: Error) => setData((d) => ({ ...(d ?? { days, channels: [], summary: {}, status: {}, counts: {}, total: 0, page: 1, per: 50, rows: [] }), error: e.message }))).finally(() => setLoading(false));
  }, [days, group, view, channel, q, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  async function sync() {
    setSyncing(true);
    try {
      const j = await (await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) })).json();
      if (j.error) toast.error(j.error); else toast.success('Orders updated');
      load();
    } finally { setSyncing(false); }
  }

  const chs = data?.channels ?? [];
  const cards = chs.map((c) => data!.summary[c]).filter(Boolean);
  const all = cards.reduce((a, c) => { a.units += c.units; a.prevUnits += c.prevUnits; a.orders += c.orders; for (const [k, v] of Object.entries(c.revenue)) a.revenue[k] = (a.revenue[k] ?? 0) + v; c.daily.forEach((v, i) => { a.daily[i] = (a.daily[i] ?? 0) + v; }); return a; }, { units: 0, prevUnits: 0, orders: 0, revenue: {} as Money, daily: [] as number[] });
  const loadingHistory = Object.values(data?.status ?? {}).filter((s) => !s.backfilled);
  const errors = Object.values(data?.status ?? {}).filter((s) => s.error);
  const lastSync = Object.values(data?.status ?? {}).map((s) => s.lastSync).filter(Boolean).sort().pop() ?? null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;
  const shown = channel ? [channel] : chs;
  const up = (n: number | null) => <span className={n === null ? 'sa-sub' : n >= 0 ? 'sa-up' : 'sa-down'}>{n === null ? 'new' : pct(n)}</span>;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="sa">
        <style>{css}</style>
        <h2>Sales <button className="sa-q" title="What do the labels mean?" onClick={() => setHelp(!help)}>?</button></h2>
        <p className="status-line">Units sold per style on every marketplace, compared with the period before. Cancelled orders and returns are taken out.</p>
        {help && (
          <div className="sa-help">
            {Object.values(LABELS).map((l) => <div key={l.text}><b>{l.text}</b> — {l.help}</div>)}
            <div><b>▲ / ▼ %</b> — compared with the same number of days before.</div>
            <div><b>Weeks left</b> — Shopify stock ÷ how fast it sells now.</div>
          </div>
        )}

        <div className="sa-period">
          {[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '12 months']].map(([d, t]) => (
            <button key={d} className={`filter${days === d ? ' on' : ''}`} style={days === d ? { background: '#6d5ce8', color: '#fff', borderColor: '#6d5ce8' } : undefined} onClick={() => { setDays(Number(d)); setPage(1); }}>{t}</button>
          ))}
          <span className="status-line" style={{ marginLeft: 6 }}>Orders updated {ago(lastSync)}</span>
          <button className="btn" disabled={syncing} onClick={sync}>{syncing ? 'Updating…' : 'Update now'}</button>
        </div>
        {loadingHistory.length > 0 && <p className="status-line">Loading order history (last 12 months): {loadingHistory.map((s) => `${s.name} ${s.total.toLocaleString()} orders so far`).join(' · ')}. Numbers fill in over the next minutes.</p>}
        {errors.length > 0 && <p style={{ color: '#b42318', fontSize: 12 }}>{errors.map((s) => `${s.name}: ${s.error}`).join(' · ')}</p>}

        {!data && <p className="status-line">Loading sales… the first time can take up to a minute.</p>}
        {data && <div className="sa-cards">
          <button className={`sa-card${channel === '' ? ' on' : ''}`} onClick={() => { setChannel(''); setPage(1); }}>
            <div className="n">All marketplaces</div>
            <div className="big">{all.units.toLocaleString()} units</div>
            <div>{money(all.revenue)} · {all.orders.toLocaleString()} orders · {up(all.prevUnits ? Math.round(((all.units - all.prevUnits) / all.prevUnits) * 100) : null)}</div>
            <Spark v={all.daily} />
          </button>
          {chs.map((c) => { const s = data!.summary[c]; if (!s) return null; return (
            <button key={c} className={`sa-card${channel === c ? ' on' : ''}`} onClick={() => { setChannel(channel === c ? '' : c); setPage(1); }}>
              <div className="n">{s.name}</div>
              <div className="big">{s.units.toLocaleString()} units</div>
              <div>{money(s.revenue)} · {s.orders.toLocaleString()} orders · {up(s.change)}</div>
              <Spark v={s.daily} />
              {s.top.length > 0 && <div className="sa-sub" style={{ marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Top: {s.top.map((t) => `${t.title}${t.color ? ` (${t.color})` : ''} ${t.units}`).join(' · ')}</div>}
            </button>
          ); })}
        </div>}

        <div className="sa-tabs">
          {[['all', 'All'], ['best', LABELS.best.text], ['rising', LABELS.rising.text], ['falling', LABELS.falling.text], ['slow', LABELS.slow.text], ['none', LABELS.none.text]].map(([k, t]) => (
            <button key={k} className="filter" style={view === k ? { background: '#6d5ce8', color: '#fff', borderColor: '#6d5ce8' } : undefined} onClick={() => { setView(k); setPage(1); }}>{t} {data?.counts?.[k] ?? ''}</button>
          ))}
        </div>

        <div className="sa-tools">
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search title, style or colour" />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={group === 'style'} onChange={(e) => { setGroup(e.target.checked ? 'style' : 'color'); setPage(1); }} /> Group colours together</label>
          {(!data || loading) && <Spinner size={14} />}
          {data && <span className="status-line">{data.total} {group === 'style' ? 'styles' : 'styles/colours'}</span>}
        </div>

        {data?.error && <p style={{ color: '#b42318' }}>{data.error}</p>}
        {data && !data.error && (data.rows.length === 0 ? (
          <div className="cs-empty"><div className="e">📊</div><div className="t">No sales here yet</div><div className="s">{loadingHistory.length ? 'Order history is still loading.' : 'Try a longer period or another tab.'}</div></div>
        ) : (
          <div className={`sa-table${loading ? ' sa-dim' : ''}`}>
            <table>
              <thead><tr><th>Style{group === 'color' ? ' · colour' : ''}</th><th>Units</th><th>Revenue</th>{shown.map((c) => <th key={c}>{data.summary[c]?.name ?? c}</th>)}<th>Returns</th><th>Shopify stock</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <Fragment key={r.key}>
                    <tr className="click" onClick={() => setOpen(open === r.key ? '' : r.key)}>
                      <td style={{ minWidth: 240, whiteSpace: 'normal' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {r.thumb ? <img className="sa-thumb" src={r.thumb} alt="" loading="lazy" /> : <span className="sa-thumb" />}
                          <div>
                            <div style={{ fontWeight: 600 }}>{r.title}</div>
                            <div className="sa-sub">{r.styleCode}{r.color ? ` · ${r.color}` : ''}</div>
                            {LABELS[r.label] && <span className="sa-chip" style={{ background: LABELS[r.label].color }}>{LABELS[r.label].text}</span>}
                          </div>
                        </div>
                      </td>
                      <td><b style={{ fontSize: 14 }}>{r.units}</b><div className="sa-sub">before {r.prevUnits} {r.change !== null && <span className={r.change >= 0 ? 'sa-up' : 'sa-down'}>{pct(r.change)}</span>}</div></td>
                      <td>{money(r.revenue)}</td>
                      {shown.map((c) => <td key={c}>{r.byChannel[c]?.units ? <b>{r.byChannel[c].units}</b> : r.liveOn.includes(c) ? <span className="sa-sub">0 · live</span> : <span className="sa-sub">—</span>}</td>)}
                      <td>{r.returns ? `${r.returns} (${Math.round((r.returns / Math.max(1, r.units + r.returns)) * 100)}%)` : '—'}</td>
                      <td>{r.stock === null ? '—' : r.stock}{r.weeksLeft !== null && <div className="sa-sub">{r.weeksLeft} weeks left</div>}</td>
                    </tr>
                    {open === r.key && (
                      <tr><td colSpan={5 + shown.length} style={{ background: '#fafafa', whiteSpace: 'normal' }}>
                        <div className="sa-sub" style={{ marginBottom: 6 }}>Sizes sold</div>
                        <div className="sa-sizes">{Object.keys(r.sizes).length ? Object.entries(r.sizes).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([s, n]) => <span key={s}>{s}: <b>{n}</b></span>) : <span>No sizes sold</span>}</div>
                        <div className="sa-sub" style={{ margin: '10px 0 6px' }}>Revenue per marketplace</div>
                        <div className="sa-sizes">{Object.entries(r.byChannel).map(([c, v]) => <span key={c}>{data.summary[c]?.name ?? c}: <b>{v.units}</b> · {money(v.revenue)}</span>)}</div>
                        {r.liveOn.length > 0 && <div className="sa-sub" style={{ marginTop: 8 }}>Live with stock on: {r.liveOn.map((c) => data.summary[c]?.name ?? c).join(', ')}</div>}
                      </td></tr>
                    )}
                  </Fragment>
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
