'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

interface Cell { qty: number; price: number | null; sku: string; want: number | null; state: 'ok' | 'diff' | 'no-shopify' }
interface Row { upc: string; title: string; color: string; size: string; shopify: { qty: number; sku: string; price: number | null } | null; cells: Record<string, Cell | null> }
interface Status { name: string; pulledAt: string | null; error: string | null; count: number; noUpc: number }
interface Sum { offers: number; ok: number; diff: number; noShopify: number; buffer: number }
interface Fix { id: string; sku: string; from: number; to: number; at: string; status: string; ok?: number; failed?: number }
interface Auto { every: number; onOrder: boolean; delay: number; job: { lastFull: string | null; lastReason: string | null; pendingAt: string | null; pendingWhy: string | null } }
interface Data { auto?: Auto; cols: string[]; marketplaces: string[]; status: Record<string, Status>; summary: Record<string, Sum>; fixes: Record<string, Fix[]>; total: number; page: number; per: number; rows: Row[]; error?: string }
interface Editing { channel: string; sku: string; title: string; qty: number; want: number | null; value: string }

const css = `
.iv { padding: 22px 24px 40px; overflow-y: auto; min-width: 0; }
.iv h2 { font-size: 22px; font-weight: 800; margin: 0; }
.iv-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin: 14px 0; }
.iv-card { border: 1px solid var(--rule); border-radius: 10px; padding: 12px; background: var(--paper); font-size: 12px; }
.iv-card.on { border-color: #6d5ce8; box-shadow: 0 0 0 1px #6d5ce8; }
.iv-card .t { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 14px; }
.iv-card .big { font-size: 24px; font-weight: 800; margin: 4px 0 2px; }
.iv-card .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.iv-card input { width: 54px; padding: 4px 6px; border: 1px solid var(--rule-strong); border-radius: 5px; font: inherit; font-size: 12px; }
.iv-err { color: #b42318; }
.iv-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 5px; white-space: nowrap; }
.iv-tag.diff { background: #fde8e6; color: #b42318; }
.iv-tag.ok { background: #e3f5ea; color: #16713f; }
.iv-tag.none { background: #fdf1dc; color: #8a5a00; }
.iv-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0 10px; }
.iv-tools input[type=search] { flex: 1; min-width: 200px; max-width: 340px; padding: 7px 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; }
.iv-chip { font-size: 12px; padding: 4px 10px; border-radius: 14px; border: 1px solid var(--rule); background: var(--paper); cursor: pointer; color: inherit; }
.iv-chip.on { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.iv-table { overflow-x: auto; border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); }
.iv-table table { border-collapse: collapse; width: 100%; font-size: 12px; }
.iv-table th { position: sticky; top: 0; background: #fafafa; text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); white-space: nowrap; font-weight: 600; }
.iv-table td { padding: 7px 10px; border-bottom: 1px solid #f2f2f2; vertical-align: top; }
.iv-q { font-family: var(--mono); font-weight: 700; font-size: 13px; }
.iv-p { font-family: var(--mono); color: var(--ink-3); font-size: 11px; }
.iv-fixbtn { font-size: 11px; padding: 1px 7px; margin-left: 4px; }
.iv-modal { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 60; display: flex; align-items: center; justify-content: center; padding: 16px; }
.iv-modal > div { background: var(--paper); border-radius: 10px; width: 420px; max-width: 100%; padding: 18px; }
@media (max-width: 700px) { .iv { padding: 16px 12px 40px; } }
`;

const ago = (t: string | null) => { if (!t) return 'never'; const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
const money = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2));

export default function InventoryPage() {
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'diff' | 'all'>('diff');
  const [channel, setChannel] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [auto, setAuto] = useState<{ every: string; onOrder: boolean; delay: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/inventory?${new URLSearchParams({ q, show, channel, page: String(page) })}`).then((r) => r.json()).then((j: Data) => setData(j)).catch(() => toast.error('Could not load inventory'));
  }, [q, show, channel, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  async function post(body: object) {
    const r = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  }
  async function refresh(ch?: string) {
    setBusy(ch ?? 'all');
    const t = toast.loading(ch ? `Pulling ${data?.status[ch]?.name ?? ch}…` : 'Pulling Shopify and every marketplace… (about a minute)');
    try {
      const j = await post({ action: 'pull', channel: ch });
      const failed = Object.entries(j.result as Record<string, string>).filter(([, v]) => v.startsWith('Failed'));
      if (failed.length) toast.error(failed.map(([k, v]) => `${data?.status[k]?.name ?? k}: ${v}`).join('\n'), { id: t, duration: 10000 });
      else toast.success('Inventory refreshed', { id: t });
      load();
    } catch (e) { toast.error((e as Error).message, { id: t }); }
    setBusy(null);
  }
  async function saveBuffer(ch: string) {
    try { await post({ action: 'buffer', channel: ch, buffer: buffers[ch] }); toast.success(`${data?.status[ch]?.name} buffer saved`); setBuffers((b) => { const n = { ...b }; delete n[ch]; return n; }); load(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function sendFix() {
    if (!editing) return;
    const qty = Number(editing.value);
    if (!Number.isInteger(qty) || qty < 0) { toast.error('Enter a whole number, 0 or more'); return; }
    setBusy('fix');
    try { await post({ action: 'fix', channel: editing.channel, sku: editing.sku, qty }); toast.success(`${editing.sku} set to ${qty} on ${data?.status[editing.channel]?.name} — Mirakl applies it in a minute or two`); setEditing(null); load(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }
  async function saveAuto() {
    if (!auto) return;
    try { await post({ action: 'auto', ...auto }); toast.success('Auto refresh saved'); setAuto(null); load(); } catch (e) { toast.error((e as Error).message); }
  }
  async function check(ch: string) { try { await post({ action: 'check', channel: ch }); load(); } catch (e) { toast.error((e as Error).message); } }

  const mk = data?.marketplaces ?? [];
  const shopS = data?.status.shopify;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;
  const shown = channel ? [channel] : mk;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="iv">
        <style>{css}</style>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ flex: 1 }}>Inventory</h2>
          <button className="btn primary" disabled={!!busy} onClick={() => refresh()}>{busy === 'all' ? 'Refreshing…' : 'Refresh all'}</button>
        </div>
        <p className="status-line">Each marketplace&apos;s live offers against Shopify, matched by UPC (SKU formats and leading zeros don&apos;t matter). Expected = Shopify stock minus that marketplace&apos;s buffer. View only — your sync platform keeps updating stock; use <b>Fix</b> only for the odd one.</p>

        {shopS && (
          <div style={{ fontSize: 12, marginTop: 8 }} className={shopS.error ? 'iv-err' : 'status-line'}>
            <b>Shopify</b> · {shopS.count} variants{shopS.noUpc ? ` (${shopS.noUpc} without barcode)` : ''} · {ago(shopS.pulledAt)}{shopS.error ? ` · ${shopS.error}` : ''}
            {' '}<button className="filter" style={{ fontSize: 11, padding: '1px 6px' }} disabled={!!busy} onClick={() => refresh('shopify')}>↻</button>
          </div>
        )}

        {data?.auto && (() => { const a = auto ?? { every: String(data.auto.every), onOrder: data.auto.onOrder, delay: String(data.auto.delay) }; const j = data.auto.job; return (
          <div className="iv-card" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>Auto refresh</b>
            <span>every</span>
            <select value={a.every} onChange={(e) => setAuto({ ...a, every: e.target.value })} style={{ padding: '4px 6px', border: '1px solid var(--rule-strong)', borderRadius: 5, font: 'inherit', fontSize: 12 }}>
              {['0', '5', '10', '15', '30', '60'].map((m) => <option key={m} value={m}>{m === '0' ? 'off' : `${m} min`}</option>)}
            </select>
            <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={a.onOrder} onChange={(e) => setAuto({ ...a, onOrder: e.target.checked })} /> and after a new marketplace order, pull</label>
            <select value={a.delay} disabled={!a.onOrder} onChange={(e) => setAuto({ ...a, delay: e.target.value })} style={{ padding: '4px 6px', border: '1px solid var(--rule-strong)', borderRadius: 5, font: 'inherit', fontSize: 12 }}>
              {['1', '2', '3', '5', '10'].map((m) => <option key={m} value={m}>{m} min later</option>)}
            </select>
            {auto && <button className="btn primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={saveAuto}>Save</button>}
            <span className="status-line" style={{ flex: 1, minWidth: 200 }}>{j.pendingAt ? `⏳ ${j.pendingWhy} — pulling at ${new Date(j.pendingAt).toLocaleTimeString()}` : j.lastFull ? `Last auto pull ${ago(j.lastFull)} (${j.lastReason})` : 'Runs on the live server (Railway), not on your Mac.'}</span>
          </div>
        ); })()}

        <div className="iv-cards">
          {mk.map((c) => { const s = data!.summary[c]; const st = data!.status[c]; return (
            <div key={c} className={`iv-card${channel === c ? ' on' : ''}`}>
              <div className="t" style={{ cursor: 'pointer' }} onClick={() => { setChannel(channel === c ? '' : c); setPage(1); }}>
                <span style={{ flex: 1 }}>{st.name}</span>
                <button className="filter" style={{ fontSize: 11, padding: '1px 6px' }} disabled={!!busy} onClick={(e) => { e.stopPropagation(); refresh(c); }}>↻</button>
              </div>
              <div className="big" style={{ color: s.diff ? '#b42318' : '#16713f' }}>{s.diff ? `${s.diff} mismatched` : 'All match'}</div>
              <div>{s.offers} offers · {s.ok} match{s.noShopify ? ` · ${s.noShopify} not on Shopify` : ''}{st.noUpc ? ` · ${st.noUpc} without UPC` : ''}</div>
              <div className={st.error ? 'iv-err' : 'status-line'} style={{ marginTop: 2 }}>{st.error ? st.error.slice(0, 120) : `pulled ${ago(st.pulledAt)}`}</div>
              <div className="row">
                <span>Buffer</span>
                <input type="number" min={0} value={buffers[c] ?? String(s.buffer)} onChange={(e) => setBuffers({ ...buffers, [c]: e.target.value })} />
                <span className="status-line">kept back</span>
                {buffers[c] != null && buffers[c] !== String(s.buffer) && <button className="btn primary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => saveBuffer(c)}>Save</button>}
              </div>
              {(data!.fixes[c] ?? []).length > 0 && (
                <div className="status-line" style={{ fontSize: 11, marginTop: 6 }}>
                  {(data!.fixes[c] ?? []).slice(0, 3).map((f) => <div key={f.id}>{f.sku}: {f.from} → {f.to} · {ago(f.at)} · <b>{f.status}</b>{f.failed ? ` · failed` : ''}</div>)}
                  <button className="filter" style={{ fontSize: 11, padding: '1px 6px', marginTop: 3 }} onClick={() => check(c)}>Check status</button>
                </div>
              )}
            </div>
          ); })}
        </div>

        <div className="iv-tools">
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search title, colour, size, UPC or SKU" />
          <button className={`iv-chip${show === 'diff' ? ' on' : ''}`} onClick={() => { setShow('diff'); setPage(1); }}>Mismatched only</button>
          <button className={`iv-chip${show === 'all' ? ' on' : ''}`} onClick={() => { setShow('all'); setPage(1); }}>Everything</button>
          {channel && <button className="iv-chip" onClick={() => setChannel('')}>{data?.status[channel]?.name} ✕</button>}
          {!data && <Spinner size={14} />}
        </div>

        {data?.error && <p className="iv-err">{data.error}</p>}
        {data && !data.error && (mk.every((c) => !data.status[c].pulledAt)
          ? <div className="cs-empty"><div className="e">📦</div><div className="t">Nothing pulled yet</div><div className="s">Click <b>Refresh all</b> to pull Shopify and every connected marketplace&apos;s offers.</div></div>
          : data.rows.length === 0
            ? <div className="cs-empty"><div className="e">✅</div><div className="t">Nothing mismatched</div><div className="s">Every offer matches Shopify minus its buffer.</div></div>
            : (
          <div className="iv-table">
            <table>
              <thead><tr><th>Product</th><th>Shopify</th>{shown.map((c) => <th key={c}>{data.status[c].name}{data.summary[c].buffer ? ` (−${data.summary[c].buffer})` : ''}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.upc}>
                    <td style={{ minWidth: 200 }}><div style={{ fontWeight: 600 }}>{r.title || '—'}</div><div className="iv-p">{[r.color, r.size].filter(Boolean).join(' · ')} · {r.upc}</div></td>
                    <td>{r.shopify ? <><span className="iv-q">{r.shopify.qty}</span><div className="iv-p">{money(r.shopify.price)}</div></> : <span className="status-line">—</span>}</td>
                    {shown.map((c) => { const x = r.cells[c]; if (!x) return <td key={c} className="status-line">not listed</td>; return (
                      <td key={c} title={`SKU ${x.sku}`}>
                        <span className="iv-q">{x.qty}</span>{' '}
                        {x.state === 'ok' && <span className="iv-tag ok">✓</span>}
                        {x.state === 'diff' && <span className="iv-tag diff">should be {x.want}</span>}
                        {x.state === 'no-shopify' && <span className="iv-tag none">not on Shopify</span>}
                        {x.state !== 'ok' && <button className="filter iv-fixbtn" onClick={() => setEditing({ channel: c, sku: x.sku, title: `${r.title} ${r.color} ${r.size}`.trim(), qty: x.qty, want: x.want, value: String(x.want ?? x.qty) })}>Fix</button>}
                        <div className="iv-p">{x.sku}{x.price != null ? ` · ${money(x.price)}` : ''}</div>
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
            <span>Page {page} of {pages} · {data.total} UPCs</span>
            <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        )}
      </section>

      {editing && (
        <div className="iv-modal" onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Fix stock on {data?.status[editing.channel]?.name}</div>
            <div className="status-line" style={{ margin: '4px 0 12px' }}>{editing.title} · SKU {editing.sku}</div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>Now <b>{editing.qty}</b>{editing.want != null ? <> · expected <b>{editing.want}</b> (Shopify minus buffer)</> : ' · not on Shopify'}</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>Set to
              <input type="number" min={0} value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} autoFocus style={{ width: 90, padding: '6px 8px', border: '1px solid var(--rule-strong)', borderRadius: 6, font: 'inherit' }} />
            </label>
            <p className="status-line" style={{ fontSize: 12 }}>Only this one offer&apos;s quantity is sent (Mirakl partial update). Your sync platform may change it again on its next run.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" disabled={busy === 'fix'} onClick={sendFix}>{busy === 'fix' ? 'Sending…' : 'Send'}</button>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
