'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import ImagePanel from '@/components/ImagePanel';
import ImageChangePreview from "@/components/ImageChangePreview";
import Pagination, { usePaged } from "@/components/Pagination";
import Spinner from '@/components/Spinner';
import { postJson } from '@/lib/fetcher';
import type { Group } from '@/lib/types';

interface Item { processing?: boolean; id: string; sendError?: string | null; styleCode: string; color: string; title: string; category: string; status: string; source: string; detectedAt: string; gtins: string[]; positions: number[]; oldImages: string[]; newImages: string[]; images: string[]; proposed: string[] }
type Status = 'pending' | 'approved' | 'rejected';

function Strip({ label, list, slots, mark }: { label: string; list: string[]; slots: number; mark?: number[] }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p className="section-label" style={{ marginBottom: 6 }}>{label}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Array.from({ length: slots }, (_, i) => (
          <figure key={i} style={{ margin: 0, width: 70 }}>
            <div style={{ width: 70, height: 88, border: `1px solid ${mark?.includes(i + 1) ? 'var(--ink)' : 'var(--rule)'}`, borderWidth: mark?.includes(i + 1) ? 2 : 1, borderRadius: 3, background: '#f4f4f4', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {list[i] && <img src={list[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <figcaption className="img-note">{i === 0 ? 'Primary' : `Image ${i + 1}`}{mark?.includes(i + 1) ? ' · changed' : ''}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function ImagesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: ch } = useSWR<{ channels: { key: string; name: string }[] }>('/api/channels');
  const channels = ch?.channels ?? [];
  const channel = params.get('channel') ?? channels[0]?.key ?? '';
  const name = channels.find((c) => c.key === channel)?.name ?? channel;
  const [status, setStatus] = useState<Status>('pending');
  const [selId, setSelId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Item | null>(null);
  const [allNordstrom, setAllNordstrom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);

  const { data: counts } = useSWR<Record<string, number>>('/api/image-changes?counts=1');
  const { data, mutate } = useSWR<{ items: Item[]; slots: number }>(channel ? `/api/image-changes?channel=${channel}&status=${status}` : null);
  const items = data?.items ?? [];
  const { pageItems, pager } = usePaged(items, channel + "|" + status);
  const slots = data?.slots ?? 5;
  const sel = items.find((i) => i.id === selId) ?? null;
  const refresh = () => { mutate(); globalMutate('/api/image-changes?counts=1'); };

  async function act(action: 'approve' | 'reject' | 'restore', ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    const t = toast.loading(action === 'approve' ? 'Approving — re-hosting changed images on Shopify…' : 'Saving…');
    try {
      const j = await postJson('/api/image-changes', { action, ids });
      toast.success(action === 'approve' ? `Approved ${j.count}${j.rehosted ? `, ${j.rehosted} images re-hosted on Shopify` : ''}` : `${action === 'reject' ? 'Rejected' : 'Restored'} ${j.count}`, { id: t });
      setChecked(new Set()); refresh();
    } catch (e) { toast.error((e as Error).message, { id: t }); }
    setBusy(false);
  }

  async function download(ids: string[]) {
    const t = toast.loading(`Building ${name} image update sheet…`);
    try {
      const res = await fetch('/api/image-changes/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Server error ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? `${channel}-images.xlsx`;
      a.click();
      toast.success('Downloaded', { id: t });
    } catch (e) { toast.error((e as Error).message, { id: t }); }
  }

  const asGroup = (it: Item) => ({
    key: it.id, styleCode: it.styleCode, color: it.color, title: it.title, category: it.category,
    thumb: it.newImages[0] ?? '', images: allNordstrom ? it.newImages : it.images.length ? it.images : it.proposed,
    changeType: 'updated', validation: 'valid', basis: 'same-colour', diffs: [],
    sizes: it.gtins.map((g) => ({ changeId: g, gtin: g, sku: '', size: '', channelSize: '', sizeSource: 'manual', changeType: 'updated', outputRow: {} })),
  }) as unknown as Group;

  if (!ch) return <section className="list"><div className="loading-block"><Spinner /> Loading…</div></section>;
  if (!channels.length) return <section className="list"><p className="empty">No marketplace connected.</p></section>;

  const all = items.length > 0 && items.every((i) => checked.has(i.id));
  const selectedIds = [...checked];

  return (
    <>
      <section className="list">
        <header className="list-head" style={{ flexWrap: 'wrap', height: 'auto', padding: '10px 16px', gap: 10 }}>
          <div className="filters">
            {channels.map((c) => (
              <button key={c.key} className="filter" aria-pressed={c.key === channel} onClick={() => { router.push(`/images?channel=${c.key}`); setSelId(null); setChecked(new Set()); }}>
                {c.name} <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{counts?.[c.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="filters" style={{ marginLeft: 12 }}>
            {(['pending', 'approved', 'rejected'] as Status[]).map((s) => (
              <button key={s} className="filter" aria-pressed={status === s} onClick={() => { setStatus(s); setSelId(null); setChecked(new Set()); }}>{s[0].toUpperCase() + s.slice(1)}</button>
            ))}
          </div>
          <div className="spacer" />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={all} onChange={(e) => setChecked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} /> Select all
          </label>
          {status === 'pending' && <>
            <button className="btn" disabled={busy || !checked.size} onClick={() => act('reject', selectedIds)}>Reject</button>
            <button className="btn" disabled={busy || !checked.size} onClick={() => act('approve', selectedIds)}>Approve {checked.size || ''}</button>
          </>}
          {status !== 'pending' && <button className="btn" disabled={busy || !checked.size} onClick={() => act('restore', selectedIds)}>Back to pending</button>}
          <button className="btn" disabled={!checked.size} onClick={() => setPreviewIds(selectedIds)}>Preview sheet</button>
          <button className="btn" disabled={!checked.size} onClick={() => download(selectedIds)}>Download sheet</button>
        </header>

        <div className="rows">
          {!data && <div className="loading-block"><Spinner /> Loading {name} image changes…</div>}
          {data && items.length === 0 && <p className="empty">No {status} image changes for {name}. Turn on <b>Watch Nordstrom image changes</b> under Connections; changes appear after the next Nordstrom import or pull.</p>}
          {pageItems.map((it) => (
            <div key={it.id} className="row" role="button" aria-selected={it.id === selId} onClick={() => setSelId(it.id)} style={{ gridTemplateColumns: '18px 26px 1fr 130px 70px 70px 90px', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked.has(it.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setChecked((p) => { const n = new Set(p); if (e.target.checked) n.add(it.id); else n.delete(it.id); return n; })} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="row-thumb" src={it.newImages[0] ?? ''} alt="" />
              <span className="row-main"><span className="row-title">{it.title}</span><br /><span className="row-id">{it.styleCode} · {it.color}</span>{it.processing && <span style={{ marginLeft: 8, display: "inline-flex", padding: "1px 7px", borderRadius: 4, fontSize: 10.5, fontWeight: 600, background: "#fdf1dc", color: "#8a5a00" }}>Nordstrom: still processing</span>}</span>
              <span className="row-kind">Changed: {it.positions.map((p) => (p === 1 ? 'primary' : `#${p}`)).join(', ')}</span>
              <span className="row-kind">{it.gtins.length} sizes</span>
              <span><span className="tag">{it.source === 'auto' ? 'Auto' : 'Manual'}</span></span>
              <span className="row-kind">{new Date(it.detectedAt).toLocaleDateString()}</span>
            </div>
          ))}
          {data && <Pagination {...pager} />}
        </div>
      </section>

      <aside className="detail">
        {!sel ? <p className="empty">Pick a colour to compare images.</p> : (
          <>
            <header className="detail-head">
              <h3 className="detail-title">{sel.title}</h3>
              <span className="detail-id">{sel.styleCode} · {sel.color} · {sel.gtins.length} sizes on {name}</span>
            </header>
            <div className="detail-body">
              {sel.sendError && <div className="section"><p className="notice">Rejected by {name}: {sel.sendError}</p></div>}
              <div className="section">
                <Strip label={`Now on ${name}`} list={sel.oldImages} slots={slots} />
                <Strip label="New on Nordstrom" list={sel.newImages} slots={slots} mark={sel.positions} />
                <Strip label={sel.images.length ? 'Will send — your edited set' : `Will send — ${name}'s images, changed slots from Nordstrom`} list={sel.images.length ? sel.images : sel.proposed} slots={slots} mark={sel.images.length ? undefined : sel.positions} />
                <p className="status-line">Only the image columns change. Every other column comes from {name}&apos;s own current row for each UPC. Changed slots are re-hosted on Shopify when you approve.</p>
                {status === "pending" && <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}><button className="btn" onClick={() => { setAllNordstrom(false); setEditing(sel); }}>Edit — keep {name}'s images, replace changed</button><button className="btn" onClick={() => { setAllNordstrom(true); setEditing(sel); }}>Edit with all Nordstrom images</button></div>}
              </div>
            </div>
            <footer className="actions">
              {status === 'pending' ? <>
                <button className="btn primary" disabled={busy} onClick={() => act('approve', [sel.id])}>Approve for {name}</button>
                <button className="btn" disabled={busy} onClick={() => act('reject', [sel.id])}>Reject</button>
              </> : <button className="btn" disabled={busy} onClick={() => act('restore', [sel.id])}>Back to pending</button>}
              <button className="btn" onClick={() => setPreviewIds([sel.id])}>Preview</button>
              <button className="btn" onClick={() => download([sel.id])}>Sheet</button>
            </footer>
          </>
        )}
      </aside>

      {previewIds && <ImageChangePreview ids={previewIds} channelName={name} onClose={() => setPreviewIds(null)} />}
      {editing && (
        <ImagePanel
          group={asGroup(editing)}
          changedSlots={allNordstrom || !editing.images.length ? editing.positions : []}
          channelKey={channel}
          channelName={name}
          otherChannels={[]}
          onClose={() => setEditing(null)}
          onSaved={() => { toast.success('Images saved'); refresh(); }}
          onSaveImages={async (images) => { await postJson('/api/image-changes', { action: 'setImages', id: editing.id, images }); }}
        />
      )}
    </>
  );
}

export default function ImagesPage() {
  return (
    <main className="shell">
      <Rail />
      <Suspense fallback={<section className="list"><div className="loading-block"><Spinner /> Loading…</div></section>}>
        <ImagesInner />
      </Suspense>
    </main>
  );
}
