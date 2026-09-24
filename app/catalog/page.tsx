'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';
import ImagePanel from '@/components/ImagePanel';
import NordstromSheet from '@/components/NordstromSheet';
import EmptyState from '@/components/EmptyState';
import Pagination, { usePaged } from '@/components/Pagination';
import { postJson } from '@/lib/fetcher';
import type { Group } from '@/lib/types';

interface G { key: string; styleCode: string; color: string; title: string; category: string; thumb: string; images: number; sizes: string[]; upcs: string[]; edit: string | null }
interface Edit { id: string; status: string; images: string[]; fields: Record<string, Record<string, string>>; sendError: string | null }
interface Detail { key: string; styleCode: string; color: string; title: string; category: string; images: string[]; sizes: { gtin: string; sku: string | null; size: string; values: Record<string, string> }[]; columns: { code: string; label: string; required: boolean; used: boolean; allowed: string[] }[]; edit: Edit | null }
interface Cfg { enabled?: boolean; intervalMin?: number; lastRunAt?: string | null; lastResult?: string | null; lastOk?: boolean | null }
interface Run { id: string; fileName: string; rowCount: number; newCount: number; changedCount: number; queued: number; source: string; createdAt: string }

const statusStyle: Record<string, { bg: string; fg: string; text: string }> = {
  draft: { bg: '#efefef', fg: '#4a4a4a', text: 'Draft' },
  approved: { bg: '#dff5ef', fg: '#0f766e', text: 'Approved — ready to send' },
  sent: { bg: '#ece9fd', fg: '#4b3fb3', text: 'Sent' },
  rejected: { bg: '#fde8e6', fg: '#b42318', text: 'Rejected' },
};
const Badge = ({ s }: { s: string }) => { const st = statusStyle[s]; return st ? <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: st.bg, color: st.fg }}>{st.text}</span> : null; };

function PullCard({ channel, name }: { channel: string; name: string }) {
  const { data, mutate } = useSWR<Cfg>(`/api/catalog/pull?channel=${channel}`, { refreshInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const interval = data?.intervalMin ?? 15;
  async function save(enabled: boolean, intervalMin: number) {
    try { await postJson('/api/catalog/pull', { channel, action: 'settings', enabled, intervalMin }); mutate(); toast.success(enabled ? `${name} pull every ${intervalMin} min` : `${name} pull off`); } catch (e) { toast.error((e as Error).message); }
  }
  async function run() {
    setBusy(true); const t = toast.loading(`Pulling from ${name}…`);
    try { const j = await postJson('/api/catalog/pull', { channel, action: 'run' }); toast.success(j.summary, { id: t }); mutate(); } catch (e) { toast.error((e as Error).message, { id: t }); }
    setBusy(false);
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--rule)', background: '#f7fbfa', fontSize: 12 }}>
      <span className={`dot ${busy ? 'busy' : data?.lastOk === false ? 'fail' : data?.enabled ? 'ok' : ''}`} />
      <span style={{ flex: 1, minWidth: 200, color: '#4a4a4a' }}>{data?.lastRunAt ? `API pull · ${new Date(data.lastRunAt).toLocaleString()} — ${data.lastResult}` : `API pull keeps this ${name} catalogue up to date with every product import that finishes on ${name}.`}</span>
      <select value={interval} onChange={(e) => save(!!data?.enabled, Number(e.target.value))} style={{ padding: '4px 6px', border: '1px solid var(--rule-strong)', borderRadius: 6, fontSize: 12, background: '#fff' }}>
        {[5, 15, 30, 60].map((m) => <option key={m} value={m}>Every {m} min</option>)}
      </select>
      <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={!!data?.enabled} onChange={(e) => save(e.target.checked, interval)} /> On</label>
      <button className="btn" style={{ padding: '4px 10px', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }} disabled={busy} onClick={run}>{busy && <Spinner size={11} />}Pull now</button>
    </div>
  );
}

function Inner() {
  const sp = useSearchParams();
  const channel = sp.get('channel') ?? '';
  const tab = sp.get('tab') === 'pulls' ? 'pulls' : 'products';
  const { data: ch } = useSWR<{ channels: { key: string; name: string }[] }>('/api/channels');
  const name = ch?.channels.find((c) => c.key === channel)?.name ?? channel;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [imgOpen, setImgOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastChannel, setLastChannel] = useState(channel);
  if (lastChannel !== channel) { setLastChannel(channel); setSel(null); setQ(''); }

  const { data, mutate: mList } = useSWR<{ total: number; products: number; groups: G[] }>(channel && tab === 'products' ? `/api/catalog?channel=${channel}&q=${encodeURIComponent(q)}` : null);
  const { pageItems, pager } = usePaged(data?.groups ?? [], channel + '|' + q);
  const { data: d, mutate } = useSWR<Detail>(sel && tab === 'products' ? `/api/catalog?channel=${channel}&key=${encodeURIComponent(sel)}` : null);
  const { data: runs } = useSWR<{ runs: Run[] }>(channel && tab === 'pulls' ? `/api/pulls?channel=${channel}` : null, { refreshInterval: 30_000 });
  const refresh = () => { mutate(); mList(); };

  async function save(payload: { images?: string[]; fields?: Record<string, Record<string, string>> }) {
    if (!d) return;
    await postJson('/api/catalog/edits', { action: 'save', channel, key: d.key, ...payload });
    toast.success(`Saved as a draft for ${name}`); refresh();
  }
  async function act(action: 'approve' | 'discard') {
    if (!d?.edit) return;
    try { await postJson('/api/catalog/edits', { action, id: d.edit.id }); toast.success(action === 'approve' ? `Approved — send it from Send & results → ${name}` : 'Draft discarded'); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }

  if (!channel) return <section style={{ padding: 32 }}><p className="empty">Pick a marketplace under <b>Marketplace products</b>.</p></section>;

  if (tab === 'pulls') {
    return (
      <section style={{ overflowY: 'auto', padding: '24px 28px', background: '#f5f5f5', minWidth: 0, gridColumn: '2 / -1' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 14px' }}>{name} — pull history</h2>
          <div style={{ background: '#fff', border: '1px solid #e4e4e4', borderRadius: 10, overflow: 'hidden' }}>
            <PullCard channel={channel} name={name} />
            {!runs ? <div className="loading-block"><Spinner /> Loading…</div> : runs.runs.length === 0 ? <EmptyState emoji="📭" title={`No ${name} files yet`} text={`Import a ${name} export under Import files, or turn on the API pull above.`} /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#fafafa' }}>{['Created', 'Origin', 'File', 'Rows', 'New', 'Updated', 'Missing vs Nordstrom queued'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 500, color: '#4a4a4a', borderBottom: '1px solid #e4e4e4' }}>{h}</th>)}</tr></thead>
                <tbody>{runs.runs.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f1f1', whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f1f1' }}><span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: r.source === 'auto' ? '#ece9fd' : '#efefef', color: r.source === 'auto' ? '#4b3fb3' : '#4a4a4a' }}>{r.source === 'auto' ? 'Auto' : 'Manual'}</span></td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f1f1', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.fileName}</td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f1f1', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.rowCount}</td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f1f1', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.newCount}</td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f1f1', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.changedCount}</td>
                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f1f1f1', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.queued}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    );
  }

  const shown = d?.edit?.images?.length ? d.edit.images : d?.images ?? [];
  const fieldCount = d?.edit ? Object.values(d.edit.fields ?? {}).reduce((n, f) => n + Object.keys(f).length, 0) : 0;
  const asGroup = d ? ({ key: d.key, styleCode: d.styleCode, color: d.color, title: d.title, category: d.category, thumb: shown[0] ?? '', images: shown, changeType: 'updated', validation: 'valid', basis: 'same-colour', diffs: [], sizes: d.sizes.map((s) => ({ changeId: s.gtin })) } as unknown as Group) : null;

  return (
    <>
      <section className="list">
        <header className="list-head" style={{ gap: 10, flexWrap: 'wrap', height: 'auto', padding: '10px 16px' }}>
          <h2 className="list-title">{name} products</h2>
          <span className="status-line">{data ? `${data.total} colours · ${data.products} products` : ''}</span>
          <div className="spacer" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, style, colour or UPC" style={{ width: 280, padding: '6px 10px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: 'var(--paper)' }} />
        </header>
        <PullCard channel={channel} name={name} />
        <div className="rows">
          {!data && <div className="loading-block"><Spinner /> Loading {name} products…</div>}
          {data && data.groups.length === 0 && <EmptyState emoji="📦" title={`No ${name} products yet`} text={`Import a ${name} export under Import files.`} />}
          {pageItems.map((g) => (
            <div key={g.key} className="row" role="button" aria-selected={g.key === sel} onClick={() => setSel(g.key)} style={{ gridTemplateColumns: '26px 1fr 190px 70px 70px', cursor: 'pointer' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="row-thumb" src={g.thumb} alt="" />
              <span className="row-main"><span className="row-title">{g.title}</span><br /><span className="row-id">{g.styleCode} · {g.color}</span></span>
              <span>{g.edit && <Badge s={g.edit} />}</span>
              <span className="row-kind">{g.sizes.length} sizes</span>
              <span className="row-kind">{g.images} images</span>
            </div>
          ))}
          {data && <Pagination {...pager} />}
        </div>
      </section>

      <aside className="detail">
        {!sel ? <p className="empty">Pick a colour to edit it on {name}.</p> : !d ? <div className="loading-block"><Spinner /> Loading…</div> : (
          <>
            <header className="detail-head">
              <h3 className="detail-title">{d.title}</h3>
              <span className="detail-id">{d.styleCode} · {d.color} · {d.sizes.length} sizes · {d.category}</span>
            </header>
            <div className="detail-body">
              {d.edit && (
                <div className="section">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Badge s={d.edit.status} /><span className="status-line">{d.edit.images?.length ? 'New images' : ''}{d.edit.images?.length && fieldCount ? ' · ' : ''}{fieldCount ? `${fieldCount} field changes` : ''}</span></div>
                  {d.edit.sendError && <p className="notice" style={{ marginTop: 8 }}>{d.edit.sendError}</p>}
                  {d.edit.status === 'approved' && <p className="status-line" style={{ marginTop: 8 }}>Send it from <Link href={`/results?channel=${channel}`} style={{ color: 'var(--ink)' }}>Send &amp; results → {name}</Link>.</p>}
                </div>
              )}
              <div className="section">
                <p className="section-label">Images on {name}{d.edit?.images?.length ? ' — your new set' : ''}</p>
                <div className="imgs">
                  {shown.map((u, i) => (
                    <figure className="img-slot" key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" />
                      <figcaption className="img-note">{i === 0 ? '1 · Primary' : `${i + 1}`}</figcaption>
                    </figure>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => setImgOpen(true)}>Edit images</button>
                  <button className="btn" onClick={() => setSheetOpen(true)}>Edit info</button>
                </div>
              </div>
              <div className="section">
                <p className="section-label">Sizes</p>
                <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
                  <tbody>{d.sizes.map((s) => <tr key={s.gtin}><td style={{ padding: '3px 12px 3px 0', fontFamily: 'var(--mono)' }}>{s.size}</td><td style={{ padding: '3px 12px 3px 0', fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{s.gtin}</td><td style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{s.sku}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <footer className="actions">
              <button className="btn primary" disabled={!d.edit || !['draft', 'rejected'].includes(d.edit.status)} onClick={() => act('approve')}>Approve for {name}</button>
              <button className="btn" disabled={!d.edit || d.edit.status === 'sent'} onClick={() => act('discard')}>Discard</button>
            </footer>
          </>
        )}
      </aside>

      {imgOpen && asGroup && (
        <ImagePanel group={asGroup} channelKey={channel} channelName={name} otherChannels={[]} onClose={() => setImgOpen(false)} onSaved={() => refresh()} onSaveImages={async (images) => { await save({ images }); }} />
      )}
      {sheetOpen && d && (
        <NordstromSheet title={`${d.title} — ${d.color} (${name})`} columns={d.columns} sizes={d.sizes} existing={d.edit?.fields ?? {}} onClose={() => setSheetOpen(false)} onSave={async (fields) => { await save({ fields }); }} />
      )}
    </>
  );
}

export default function CatalogPage() {
  return (
    <main className="shell">
      <Rail />
      <Suspense fallback={<section className="list"><div className="loading-block"><Spinner /> Loading…</div></section>}>
        <Inner />
      </Suspense>
    </main>
  );
}
