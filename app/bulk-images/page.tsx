'use client';
import { getJSON } from '@/lib/client-cache';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';
import ImagePanel from '@/components/ImagePanel';
import { imageSpecs } from '@/lib/image-specs';
import type { Group } from '@/lib/types';

interface Item { id: string; groupKey: string; styleCode: string; color: string; title: string; position: number; sourceUrl: string; status: string; flag: string | null; error: string | null; resultUrl: string | null }
interface G { groupKey: string; styleCode: string; color: string; title: string; items: Item[] }
interface Job { id: string; width: number; height: number; status: string; total: number; done: number; failed: number; createdAt: string }
interface Data { jobs: Job[]; counts: Record<string, number>; groups: G[]; error?: string }

const css = `
.bi { padding: 22px 24px 40px; overflow-y: auto; min-width: 0; }
.bi h2 { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
.bi-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }
.bi-tab { padding: 6px 14px; border-radius: 16px; border: 1px solid var(--rule); background: var(--paper); cursor: pointer; font: inherit; font-size: 13px; color: inherit; }
.bi-tab.on { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.bi-card { border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); padding: 12px 14px; margin-bottom: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 13px; }
.bi-card select { padding: 5px 8px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; }
.bi-bar { height: 8px; border-radius: 4px; background: #eee; overflow: hidden; flex: 1; min-width: 160px; }
.bi-bar div { height: 100%; background: linear-gradient(90deg, #6d5ce8, #3b82f6); }
.bi-g { border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); margin-bottom: 12px; }
.bi-g > header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 12px; border-bottom: 1px solid #f1f1f1; }
.bi-g > header .t { flex: 1; min-width: 180px; font-size: 14px; font-weight: 600; }
.bi-g > header .t span { font-weight: 400; color: var(--ink-3); font-size: 12px; }
.bi-strip { display: flex; gap: 10px; overflow-x: auto; padding: 10px 12px; -webkit-overflow-scrolling: touch; }
.bi-it { flex: none; width: 116px; font-size: 11px; }
.bi-it .im { width: 116px; height: 140px; border-radius: 6px; background: #f4f4f4; overflow: hidden; border: 2px solid transparent; display: flex; align-items: center; justify-content: center; cursor: zoom-in; }
.bi-it .im img { max-width: 100%; max-height: 100%; object-fit: contain; }
.bi-it .im.before { height: 70px; opacity: 0.85; margin-bottom: 4px; }
.bi-it.approved .im.after, .bi-it.applied .im.after { border-color: #30a46c; }
.bi-it.rejected .im.after { border-color: #e5484d; opacity: 0.45; }
.bi-it .row { display: flex; gap: 4px; align-items: center; margin-top: 4px; flex-wrap: wrap; }
.bi-it .row button { padding: 1px 7px; font-size: 12px; }
.bi-tag { display: inline-block; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; }
.bi-warn { background: #fdf1dc; color: #8a5a00; }
.bi-ok { background: #e3f5ea; color: #16713f; }
.bi-bad { background: #fde8e6; color: #b42318; }
.bi-zoom { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 70; display: flex; align-items: center; justify-content: center; gap: 16px; padding: 20px; flex-wrap: wrap; }
.bi-zoom figure { margin: 0; text-align: center; color: #fff; font-size: 13px; }
.bi-zoom img { max-height: 80vh; max-width: 44vw; background: #fff; border-radius: 6px; }
@media (max-width: 700px) { .bi { padding: 16px 12px 40px; } .bi-zoom img { max-width: 90vw; max-height: 40vh; } }
`;

const fileUrl = (id: string) => `/api/bulk-images/file?id=${id}`;

export default function BulkImagesPage() {
  const [channels, setChannels] = useState<{ key: string; name: string }[]>([]);
  const [channel, setChannel] = useState('');
  const [tab, setTab] = useState<'review' | 'approved' | 'rejected'>('review');
  const [data, setData] = useState<Data | null>(null);
  const [size, setSize] = useState(0);
  const [skipSaved, setSkipSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<Item | null>(null);
  const [editing, setEditing] = useState<G | null>(null);

  useEffect(() => {
    getJSON('/api/channels', (j) => { const cs = (j.channels ?? []) as { key: string; name: string }[]; setChannels(cs); setChannel(cs[0]?.key ?? ''); });
  }, []);

  const load = useCallback(() => {
    if (!channel) return;
    getJSON(`/api/bulk-images?channel=${channel}&status=${tab}`, setData).catch(() => {});
  }, [channel, tab]);
  useEffect(() => { setData(null); load(); }, [load]);

  const running = data?.jobs.some((j) => j.status === 'running') || (data?.counts.approved ?? 0) > 0;
  useEffect(() => { if (!running) return; const t = setInterval(load, 3000); return () => clearInterval(t); }, [running, load]);

  async function post(body: object) {
    const r = await fetch('/api/bulk-images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, ...body }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  }
  const spec = imageSpecs[channel];
  const sizes = spec ? [{ w: spec.w, h: spec.h }, ...(spec.alt ?? [])] : [{ w: 1600, h: 1600 }];
  const name = channels.find((c) => c.key === channel)?.name ?? channel;

  async function start(groupKeys?: string[]) {
    setBusy(true);
    try {
      const j = await post({ action: 'start', w: sizes[size].w, h: sizes[size].h, skipSaved, groupKeys });
      toast.success(`Making ${j.images} preview(s) for ${j.colours} colour(s) — they appear below as they finish`);
      setTab('review'); load();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }
  async function act(action: 'approve' | 'reject' | 'undo', ids: string[]) {
    if (!ids.length) return;
    try { await post({ action, ids }); if (action === 'approve') toast.success(`${ids.length} approved — uploading to Shopify and saving to the listing`); load(); }
    catch (e) { toast.error((e as Error).message); }
  }
  const groupFor = (g: G): Group => ({
    key: g.groupKey, styleCode: g.styleCode, color: g.color, title: g.title, category: '', thumb: g.items[0]?.sourceUrl ?? '',
    images: g.items.map((i) => i.sourceUrl), changeType: 'new', validation: 'valid', basis: 'none', sizes: [], diffs: [],
  });

  const job = data?.jobs[0];
  const c = data?.counts ?? {};
  const reviewIds = (data?.groups ?? []).flatMap((g) => g.items.filter((i) => i.status === 'ready' && !i.flag).map((i) => i.id));

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="bi">
        <style>{css}</style>
        <h2>Bulk images</h2>
        <p className="status-line">Resizes every image of products not yet sent to the marketplace size and extends the background — nothing is cropped. Nothing changes until you approve; approved images are uploaded to Shopify and saved to that colour&apos;s listing.</p>

        <div className="bi-tabs">
          {channels.map((x) => <button key={x.key} className={`bi-tab${x.key === channel ? ' on' : ''}`} onClick={() => { setChannel(x.key); setSize(0); }}>{x.name}</button>)}
        </div>

        <div className="bi-card">
          <b>{name}</b>
          <span>size</span>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>{sizes.map((s, i) => <option key={i} value={i}>{s.w} × {s.h}{i === 0 ? ' (main)' : ''}</option>)}</select>
          <span>· extend background</span>
          <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={skipSaved} onChange={(e) => setSkipSaved(e.target.checked)} /> skip colours I already edited by hand</label>
          <span style={{ flex: 1 }} />
          <button className="btn primary" disabled={busy || job?.status === 'running'} onClick={() => start()}>{busy ? 'Starting…' : 'Make previews for new products'}</button>
        </div>

        {job && job.status === 'running' && (
          <div className="bi-card">
            <Spinner size={12} /> <span>Working on {job.width}×{job.height}: {job.done + job.failed} of {job.total}{job.failed ? ` · ${job.failed} failed` : ''}</span>
            <div className="bi-bar"><div style={{ width: `${Math.round(((job.done + job.failed) / Math.max(1, job.total)) * 100)}%` }} /></div>
          </div>
        )}

        <div className="bi-tabs">
          <button className={`bi-tab${tab === 'review' ? ' on' : ''}`} onClick={() => setTab('review')}>To review · {(c.ready ?? 0) + (c.failed ?? 0) + (c.queued ?? 0)}</button>
          <button className={`bi-tab${tab === 'approved' ? ' on' : ''}`} onClick={() => setTab('approved')}>Approved · {(c.approved ?? 0) + (c.applied ?? 0)}</button>
          <button className={`bi-tab${tab === 'rejected' ? ' on' : ''}`} onClick={() => setTab('rejected')}>Rejected / by hand · {(c.rejected ?? 0) + (c.manual ?? 0)}</button>
          <span style={{ flex: 1 }} />
          {tab === 'review' && reviewIds.length > 0 && <button className="btn primary" onClick={() => { if (confirm(`Approve ${reviewIds.length} image(s) that have no ⚠ warning?`)) act('approve', reviewIds); }}>Approve all without ⚠ ({reviewIds.length})</button>}
        </div>

        {!data ? <div className="loading-block"><Spinner /> Loading…</div> : data.groups.length === 0 ? (
          <div className="cs-empty"><div className="e">🖼️</div><div className="t">{tab === 'review' ? 'Nothing waiting for review' : 'Nothing here yet'}</div><div className="s">{tab === 'review' ? `Click "Make previews for new products" to process ${name}'s listing queue.` : ''}</div></div>
        ) : data.groups.map((g) => {
          const ready = g.items.filter((i) => i.status === 'ready').map((i) => i.id);
          return (
            <div key={g.groupKey} className="bi-g">
              <header>
                <div className="t">{g.title || g.styleCode} — {g.color} <span>· {g.styleCode} · {g.items.length} image{g.items.length === 1 ? '' : 's'}</span></div>
                {ready.length > 0 && <button className="btn primary" onClick={() => act('approve', ready)}>Approve all</button>}
                {ready.length > 0 && <button className="btn" onClick={() => act('reject', ready)}>Reject all</button>}
                <button className="btn" onClick={() => setEditing(g)}>Edit by hand</button>
                {tab !== 'approved' && <button className="btn" disabled={busy} onClick={() => start([g.groupKey])} title="Make the previews again">Redo</button>}
              </header>
              <div className="bi-strip">
                {g.items.map((it) => (
                  <div key={it.id} className={`bi-it ${it.status}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="im before" title="Before" onClick={() => setZoom(it)}><img src={it.sourceUrl} alt="" loading="lazy" /></div>
                    <div className="im after" title="After" onClick={() => setZoom(it)}>
                      {it.status === 'queued' ? <Spinner size={14} /> : it.status === 'applied' && it.resultUrl ? <img src={it.resultUrl} alt="" loading="lazy" /> : ['ready', 'approved', 'rejected'].includes(it.status) ? <img src={fileUrl(it.id)} alt="" loading="lazy" /> : <span className="bi-tag bi-bad">failed</span>} {/* eslint-disable-line @next/next/no-img-element */}
                    </div>
                    <div className="row">
                      <b>{it.position + 1}</b>
                      {it.flag && <span className="bi-tag bi-warn" title={it.flag}>⚠ check</span>}
                      {it.status === 'applied' && <span className="bi-tag bi-ok">✓ saved</span>}
                      {it.status === 'approved' && <span className="bi-tag bi-ok">uploading…</span>}
                      {it.status === 'manual' && <span className="bi-tag">by hand</span>}
                    </div>
                    {it.error && <div style={{ color: '#b42318', fontSize: 10 }} title={it.error}>{it.error.slice(0, 60)}</div>}
                    <div className="row">
                      {it.status === 'ready' && <><button className="filter" title="Approve" onClick={() => act('approve', [it.id])}>✓</button><button className="filter" title="Reject" onClick={() => act('reject', [it.id])}>✕</button></>}
                      {(it.status === 'rejected' || (it.status === 'failed' && !it.error?.startsWith('Upload'))) && <button className="filter" onClick={() => act('undo', [it.id])}>Undo</button>}
                      {it.status === 'failed' && it.error?.startsWith('Upload') && <button className="filter" onClick={() => act('approve', [it.id])}>Retry</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {zoom && (
        <div className="bi-zoom" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <figure><img src={zoom.sourceUrl} alt="" /><figcaption>Before</figcaption></figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <figure><img src={zoom.status === 'applied' && zoom.resultUrl ? zoom.resultUrl : fileUrl(zoom.id)} alt="" /><figcaption>After{zoom.flag ? ` — ⚠ ${zoom.flag}` : ''}</figcaption></figure>
        </div>
      )}

      {editing && (
        <ImagePanel group={groupFor(editing)} channelKey={channel} channelName={name} otherChannels={[]}
          onClose={() => setEditing(null)}
          onSaved={async () => { await post({ action: 'manual', groupKey: editing.groupKey }).catch(() => {}); setEditing(null); toast.success('Saved by hand — this colour is taken out of the bulk list'); load(); }} />
      )}
    </main>
  );
}
