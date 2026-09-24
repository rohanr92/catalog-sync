'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';
import ImagePanel from '@/components/ImagePanel';
import NordstromSheet from '@/components/NordstromSheet';
import Pagination, { usePaged } from "@/components/Pagination";
import { postJson } from '@/lib/fetcher';
import type { Group } from '@/lib/types';

interface G { key: string; styleCode: string; color: string; title: string; category: string; thumb: string; images: number; sizes: string[]; gtins: string[]; edit: string | null }
interface Edit { id: string; status: string; images: string[]; fields: Record<string, Record<string, string>>; sendError: string | null }
interface Detail { styleCode: string; color: string; title: string; category: string; images: string[]; sizes: { gtin: string; sku: string | null; size: string; values: Record<string, string> }[]; columns: { code: string; label: string; required: boolean; used: boolean; allowed: string[] }[]; edit: Edit | null }

const statusStyle: Record<string, { bg: string; fg: string; text: string }> = {
  draft: { bg: '#efefef', fg: '#4a4a4a', text: 'Draft' },
  approved: { bg: '#ece9fd', fg: '#4b3fb3', text: 'Approved — ready to send' },
  sent: { bg: '#ece9fd', fg: '#4b3fb3', text: 'Sent to Nordstrom' },
  rejected: { bg: '#fde8e6', fg: '#b42318', text: 'Rejected by Nordstrom' },
};
const Badge = ({ s }: { s: string }) => { const st = statusStyle[s]; return st ? <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: st.bg, color: st.fg }}>{st.text}</span> : null; };

export default function NordstromPage() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [imgOpen, setImgOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data, mutate: mutateList } = useSWR<{ total: number; products: number; groups: G[] }>(`/api/nordstrom/catalog?q=${encodeURIComponent(q)}`);
  const { pageItems, pager } = usePaged(data?.groups ?? [], q);
  const { data: d, mutate } = useSWR<Detail>(sel ? `/api/nordstrom/catalog?key=${encodeURIComponent(sel)}` : null);
  const refresh = () => { mutate(); mutateList(); };

  async function save(payload: { images?: string[]; fields?: Record<string, Record<string, string>> }) {
    if (!d) return;
    await postJson('/api/nordstrom/edits', { action: 'save', styleCode: d.styleCode, color: d.color, ...payload });
    toast.success('Saved as a draft for Nordstrom');
    refresh();
  }
  async function act(action: 'approve' | 'discard') {
    if (!d?.edit) return;
    try { await postJson('/api/nordstrom/edits', { action, id: d.edit.id }); toast.success(action === 'approve' ? 'Approved — send it from Send & results → Nordstrom' : 'Draft discarded'); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }

  const shownImages = d?.edit?.images?.length ? d.edit.images : d?.images ?? [];
  const fieldCount = d?.edit ? Object.values(d.edit.fields ?? {}).reduce((n, f) => n + Object.keys(f).length, 0) : 0;
  const asGroup = d ? ({ key: sel, styleCode: d.styleCode, color: d.color, title: d.title, category: d.category, thumb: shownImages[0] ?? '', images: shownImages, changeType: 'updated', validation: 'valid', basis: 'same-colour', diffs: [], sizes: d.sizes.map((s) => ({ changeId: s.gtin })) } as unknown as Group) : null;

  return (
    <main className="shell">
      <Rail />
      <section className="list">
        <header className="list-head" style={{ gap: 10 }}>
          <h2 className="list-title">Nordstrom catalogue</h2>
          <span className="status-line">{data ? `${data.total} colours · ${data.products} products` : ''}</span>
          <div className="spacer" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, style, colour or UPC" style={{ width: 280, padding: '6px 10px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: 'var(--paper)' }} />
        </header>
        <div className="rows">
          {!data && <div className="loading-block"><Spinner /> Loading Nordstrom products…</div>}
          {pageItems.map((g) => (
            <div key={g.key} className="row" role="button" aria-selected={g.key === sel} onClick={() => setSel(g.key)} style={{ gridTemplateColumns: '26px 1fr 170px 70px 70px', cursor: 'pointer' }}>
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
        {!sel ? <p className="empty">Pick a colour to edit it on Nordstrom.</p> : !d ? <div className="loading-block"><Spinner /> Loading…</div> : (
          <>
            <header className="detail-head">
              <h3 className="detail-title">{d.title}</h3>
              <span className="detail-id">{d.styleCode} · {d.color} · {d.sizes.length} sizes · {d.category}</span>
            </header>
            <div className="detail-body">
              {d.edit && (
                <div className="section">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Badge s={d.edit.status} /><span className="status-line">{d.edit.images?.length ? 'New images' : ''}{d.edit.images?.length && fieldCount ? ' · ' : ''}{fieldCount ? `${fieldCount} field changes` : ''}</span></div>
                  {d.edit.sendError && <p className="notice" style={{ marginTop: 8 }}>{d.edit.sendError}</p>}
                  {d.edit.status === 'approved' && <p className="status-line" style={{ marginTop: 8 }}>Send it from <Link href="/results?channel=nordstrom" style={{ color: 'var(--ink)' }}>Send &amp; results → Nordstrom</Link>.</p>}
                </div>
              )}
              <div className="section">
                <p className="section-label">Images on Nordstrom{d.edit?.images?.length ? ' — your new set' : ''}</p>
                <div className="imgs">
                  {shownImages.map((u, i) => (
                    <figure className="img-slot" key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" />
                      <figcaption className="img-note">{i === 0 ? '1 · Primary' : `${i + 1}`}</figcaption>
                    </figure>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
              <button className="btn primary" disabled={!d.edit || !['draft', 'rejected'].includes(d.edit.status)} onClick={() => act('approve')}>Approve for Nordstrom</button>
              <button className="btn" disabled={!d.edit || d.edit.status === 'sent'} onClick={() => act('discard')}>Discard</button>
            </footer>
          </>
        )}
      </aside>

      {imgOpen && asGroup && (
        <ImagePanel group={asGroup} channelKey="nordstrom" channelName="Nordstrom" otherChannels={[]} onClose={() => setImgOpen(false)} onSaved={() => refresh()} onSaveImages={async (images) => { await save({ images }); }} />
      )}
      {sheetOpen && d && (
        <NordstromSheet title={`${d.title} — ${d.color}`} columns={d.columns} sizes={d.sizes} existing={d.edit?.fields ?? {}} onClose={() => setSheetOpen(false)} onSave={async (fields) => { await save({ fields }); }} />
      )}
    </main>
  );
}
