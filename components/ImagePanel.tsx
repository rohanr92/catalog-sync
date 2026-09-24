'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Group } from '@/lib/types';
import { imageSpecs } from '@/lib/image-specs';
import { channelColumns } from '@/lib/channel-specs';
import Spinner from './Spinner';
import ImageGuide from "./ImageGuide";

interface Props {
  group: Group;
  channelKey: string;
  channelName: string;
  otherChannels: { key: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  onSaveImages?: (images: string[]) => Promise<void>;
  changedSlots?: number[]; // 1-based slots Nordstrom changed
}

const clean = (s: string) => (s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const onShopify = (u: string) => /cdn\.shopify\.com/.test(u);

const css = `
.ip-tile { border: 1px solid var(--rule); border-radius: 6px; padding: 8px; background: var(--paper); position: relative; }
.ip-tile.sel { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.ip-tile.empty { background: var(--paper-sunk); }
.ip-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; min-height: 20px; }
.ip-num { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--ink); color: var(--paper); font-size: 11px; font-weight: 600; }
.ip-tag { display: inline-flex; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; line-height: 1.3; }
.ip-changed { background: #fdf1dc; color: #8a5a00; }
.ip-shop { background: #e3f5ea; color: #16713f; }
.ip-ext { background: #efefef; color: #555; }
.ip-img { aspect-ratio: 3/4; background: #f4f4f4; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: grab; }
.ip-img img { width: 100%; height: 100%; object-fit: cover; }
.ip-acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.ip-acts button { font-size: 11px; padding: 3px 6px; }
.ip-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; font-size: 13px; }
`;

export default function ImagePanel({ group, channelKey, channelName, otherChannels, onClose, onSaved, onSaveImages, changedSlots }: Props) {
  const spec = imageSpecs[channelKey];
  const max = channelColumns[channelKey]?.images.length ?? spec?.max ?? 8;
  const initial = Array.from({ length: max }, (_, i) => group.images[i] ?? null);
  const [slots, setSlots] = useState<(string | null)[]>(initial);
  const [changed, setChanged] = useState<Set<string>>(() => new Set((changedSlots ?? []).map((n) => initial[n - 1]).filter(Boolean) as string[]));
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [also, setAlso] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioSlots, setStudioSlots] = useState<number[]>([]);
  const dims = spec ? [{ w: spec.w, h: spec.h }, ...(spec.alt ?? [])] : [];
  const [dim, setDim] = useState(0);
  const [swatch, setSwatch] = useState<{ url?: string; source?: string }>({ url: group.swatchUrl, source: group.swatchSource });
  const hasSwatchColumn = !!channelColumns[channelKey]?.swatch;
  const dragFrom = useRef<number | null>(null);
  const fileFor = useRef<number>(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const swatchFile = useRef<HTMLInputElement>(null);
  const slotsRef = useRef(slots); slotsRef.current = slots;
  const studioRef = useRef(studioSlots); studioRef.current = studioSlots;
  const formatRef = useRef(format); formatRef.current = format;

  const baseName = () => `${clean(group.category.split('/').pop() ?? '')}_${clean(group.styleCode)}_${clean(group.color)}`;
  const replaceAt = (i: number, url: string) => setSlots((prev) => {
    const n = [...prev];
    const old = n[i];
    if (old && changed.has(old)) setChanged((c) => new Set(c).add(url)); // the Changed tag follows the replacement
    n[i] = url;
    return n;
  });

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.source !== 'image-studio') return;
      if (e.data.type === 'export' && Array.isArray(e.data.files)) receiveFromStudio(e.data.files as File[]);
      if (e.data.type === 'close') setStudioOpen(false);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFiles(files: File[], positions: number[]): Promise<string[]> {
    const form = new FormData();
    form.append('format', formatRef.current);
    files.forEach((f, i) => { form.append('files', f); form.append('names', `${baseName()}_${positions[i]}`); });
    const res = await fetch('/api/shopify/upload', { method: 'POST', body: form });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error);
    return j.urls;
  }

  function openStudio() {
    const filledNow = slots.map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
    const target = picked.size ? [...picked].sort((a, b) => a - b) : filledNow;
    if (!target.length) return;
    setStudioSlots(target);
    setStudioOpen(true);
  }

  // Only the images sent to the studio come back; each goes back into its own slot.
  async function receiveFromStudio(files: File[]) {
    setStudioOpen(false);
    const sent = studioRef.current;
    const empties = slotsRef.current.map((u, i) => (u ? -1 : i)).filter((i) => i >= 0 && !sent.includes(i));
    const targets: number[] = [];
    files.forEach((_, k) => { const t = k < sent.length ? sent[k] : empties.shift(); if (t !== undefined) targets.push(t); });
    const use = files.slice(0, targets.length);
    if (files.length > targets.length) toast.error(`${files.length - targets.length} extra image(s) had no free slot and were left out`);
    if (!use.length) return;
    setBusy(`Uploading ${use.length} edited image${use.length === 1 ? '' : 's'} to Shopify as ${formatRef.current.toUpperCase()}…`);
    try {
      const urls = await uploadFiles(use, targets.map((t) => t + 1));
      urls.forEach((u, k) => replaceAt(targets[k], u));
      toast.success(`Updated slot${targets.length === 1 ? '' : 's'} ${targets.map((t) => t + 1).join(', ')}`);
      setPicked(new Set());
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  async function addFileToSlot(i: number, file: File) {
    setBusy(`Uploading slot ${i + 1}…`);
    try { const [u] = await uploadFiles([file], [i + 1]); replaceAt(i, u); toast.success(`Slot ${i + 1} uploaded`); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  async function uploadSlots(indices: number[]) {
    const todo = indices.filter((i) => slots[i] && !onShopify(slots[i]!));
    if (!todo.length) { toast.message('Those are already on Shopify'); return; }
    setBusy(`Uploading ${todo.length} image${todo.length === 1 ? '' : 's'} to Shopify as ${format.toUpperCase()}…`);
    try {
      const res = await fetch('/api/shopify/upload-urls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format, items: todo.map((i) => ({ url: slots[i], name: `${baseName()}_${i + 1}` })) }) });
      const j = await res.json();
      let ok = 0;
      (j.results as { url?: string; error?: string }[]).forEach((r, k) => { if (r.url) { replaceAt(todo[k], r.url); ok++; } else toast.error(`Slot ${todo[k] + 1}: ${r.error}`); });
      if (ok) toast.success(`${ok} uploaded to Shopify`);
      setPicked(new Set());
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  async function downloadSlots(indices: number[]) {
    const items = indices.filter((i) => slots[i]).map((i) => ({ url: slots[i]!, name: `${baseName()}_${i + 1}` }));
    if (!items.length) return;
    setBusy(`Preparing ${items.length} image${items.length === 1 ? '' : 's'} as ${format.toUpperCase()}…`);
    try {
      const res = await fetch('/api/images/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, format, zipName: baseName() }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Server error ${res.status}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = `${baseName()}.zip`;
      a.click();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  async function makeSwatch(mode: 'auto' | 'reuse' | 'file' | 'link', file?: File, link?: string) {
    setBusy('Making swatch…');
    try {
      let res: Response;
      if (mode === 'file' && file) {
        const fd = new FormData(); fd.append('style', group.styleCode); fd.append('color', group.color); fd.append('file', file);
        res = await fetch('/api/swatch', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/swatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style: group.styleCode, color: group.color, mode: mode === 'link' ? 'link' : mode === 'auto' ? 'auto' : undefined, url: link, primaryUrl: slots.find(Boolean) ?? group.images[0] }) });
      }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setSwatch({ url: j.url, source: j.source });
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  function move(from: number, to: number) {
    if (from === to) return;
    setSlots((prev) => { const n = [...prev]; const [it] = n.splice(from, 1); n.splice(to, 0, it); return n; });
    setPicked(new Set());
  }

  async function save() {
    const images = slots.filter(Boolean) as string[];
    setBusy('Saving…');
    try {
      if (onSaveImages) await onSaveImages(images);
      else {
        const res = await fetch('/api/images', { method: 'POST', body: JSON.stringify({ channel: channelKey, style: group.styleCode, color: group.color, images, alsoChannels: [...also] }) });
        const j = await res.json();
        if (j.liveSizesQueued) toast.message(`${j.liveSizesQueued} size${j.liveSizesQueued === 1 ? '' : 's'} of this colour already live — a draft is ready under Marketplace products → Edit products to update them too`);
      }
      onSaved(); onClose();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  const studioUrl = () => {
    const q = new URLSearchParams({ group: group.key, w: String(dims[dim]?.w ?? 1000), h: String(dims[dim]?.h ?? 1000) });
    q.set('images', btoa(JSON.stringify(studioSlots.map((i) => slots[i]).filter(Boolean))));
    return `/studio/index.html?${q.toString()}`;
  };

  const filled = slots.map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
  const pickedList = [...picked].sort((a, b) => a - b);
  const notOnShopify = filled.filter((i) => !onShopify(slots[i]!)).length;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <style>{css}</style>
      <div style={{ background: 'var(--paper)', width: studioOpen ? '96vw' : 980, maxWidth: '96vw', height: studioOpen ? '94vh' : 'auto', maxHeight: '94vh', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{group.title} — {group.color}</div>
            <div className="status-line">
              {studioOpen
                ? `Editing slot${studioSlots.length === 1 ? '' : 's'} ${studioSlots.map((i) => i + 1).join(', ')} — only these are uploaded back`
                : `${channelName} · ${max} image slots${spec ? ` · ${spec.w}×${spec.h}` : ''} · one image set for all ${group.sizes.length} sizes of ${group.color}${changed.size ? ` · ${changed.size} changed on Nordstrom` : ''}`}
            </div>
          </div>
          {studioOpen && <button className="btn" onClick={() => setStudioOpen(false)}>Back to slots</button>}
          <button className="btn" onClick={onClose}>Close</button>
        </header>

        {studioOpen ? (
          <iframe src={studioUrl()} title="Image Studio" style={{ flex: 1, border: 0, width: '100%' }} />
        ) : (
          <>
            <div style={{ padding: 18, overflowY: 'auto' }}>
              <ImageGuide channelKey={channelKey} channelName={channelName} />
              <div className="ip-bar">
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={filled.length > 0 && filled.every((i) => picked.has(i))} onChange={(e) => setPicked(e.target.checked ? new Set(filled) : new Set())} /> Select all
                </label>
                <span className="status-line">{picked.size ? `${picked.size} selected — slot${picked.size === 1 ? '' : 's'} ${pickedList.map((i) => i + 1).join(', ')}` : `Tick images to edit, upload or download only those · ${notOnShopify} not on Shopify yet`}</span>
                <span style={{ flex: 1 }} />
                <button className="btn" disabled={!!busy || !picked.size} onClick={() => uploadSlots(pickedList)}>Upload selected to Shopify</button>
                <button className="btn" disabled={!!busy || !picked.size} onClick={() => downloadSlots(pickedList)}>Download selected</button>
                <select value={format} onChange={(e) => setFormat(e.target.value as 'jpeg' | 'png')} style={{ padding: '6px 8px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: 'var(--paper)' }}>
                  <option value="jpeg">JPG</option>
                  <option value="png">PNG</option>
                </select>
                {dims.length > 1 && <select value={dim} onChange={(e) => setDim(Number(e.target.value))} title="Canvas size in Image Studio" style={{ padding: "6px 8px", border: "1px solid var(--rule-strong)", borderRadius: 4, fontFamily: "inherit", fontSize: 13, background: "var(--paper)" }}>{dims.map((d, i) => <option key={i} value={i}>{d.w} x {d.h}</option>)}</select>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {slots.map((url, i) => (
                  <div key={i} className={`ip-tile${url ? '' : ' empty'}${picked.has(i) ? ' sel' : ''}`}
                    draggable={!!url} onDragStart={() => (dragFrom.current = i)} onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragFrom.current != null) move(dragFrom.current, i); dragFrom.current = null; }}>
                    <div className="ip-top">
                      {url && <input type="checkbox" checked={picked.has(i)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />}
                      <span className="ip-num">{i + 1}</span>
                      {i === 0 && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Primary</span>}
                      <span style={{ flex: 1 }} />
                      {url && changed.has(url) && <span className="ip-tag ip-changed">Changed</span>}
                      {url && <span className={`ip-tag ${onShopify(url) ? 'ip-shop' : 'ip-ext'}`}>{onShopify(url) ? 'Shopify' : 'Not on Shopify'}</span>}
                    </div>
                    <div className="ip-img" onClick={() => url && setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {url ? <img src={url} alt="" /> : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Empty slot</span>}
                    </div>
                    <div className="ip-acts">
                      {url && i > 0 && <button className="filter" title="Move left" onClick={() => move(i, i - 1)}>←</button>}
                      {url && i < slots.length - 1 && <button className="filter" title="Move right" onClick={() => move(i, i + 1)}>→</button>}
                      <button className="filter" onClick={() => { fileFor.current = i; fileInput.current?.click(); }}>{url ? 'Replace' : 'Add'}</button>
                      {url && !onShopify(url) && <button className="filter" disabled={!!busy} onClick={() => uploadSlots([i])}>Upload</button>}
                      {url && <button className="filter" disabled={!!busy} onClick={() => downloadSlots([i])}>Download</button>}
                      {url && <button className="filter" onClick={() => { setSlots((p) => { const n = [...p]; n[i] = null; return n; }); setPicked((p) => { const n = new Set(p); n.delete(i); return n; }); }}>Delete</button>}
                    </div>
                  </div>
                ))}
              </div>
              <input ref={fileInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) addFileToSlot(fileFor.current, f); e.target.value = ''; }} />
              <p className="status-line" style={{ marginTop: 10 }}>Click an image to select it. Drag a tile onto another slot to reorder. Slot 1 is the primary image; each slot is that image column in {channelName}&apos;s sheet, for every size of {group.color}.</p>

              {hasSwatchColumn && (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--rule)', display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ width: 72, height: 72, border: '1px solid var(--rule)', borderRadius: 4, background: '#f4f4f4', overflow: 'hidden', flex: 'none' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {swatch.url && <img src={swatch.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Swatch — 1000×1000, one per colour</div>
                    <div className="status-line">{swatch.url ? `Source: ${swatch.source}` : 'None yet. Auto crops the middle of the primary image.'}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <button className="filter" style={{ fontSize: 12 }} disabled={!!busy} onClick={() => makeSwatch('reuse')}>Find existing</button>
                      <button className="filter" style={{ fontSize: 12 }} disabled={!!busy} onClick={() => makeSwatch('auto')}>Auto from primary</button>
                      <button className="filter" style={{ fontSize: 12 }} disabled={!!busy} onClick={() => swatchFile.current?.click()}>Upload</button>
                      <button className="filter" style={{ fontSize: 12 }} disabled={!!busy} onClick={() => { const u = prompt('Swatch image URL'); if (u) makeSwatch('link', undefined, u); }}>Paste link</button>
                    </div>
                    <input ref={swatchFile} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) makeSwatch('file', f); e.target.value = ''; }} />
                  </div>
                </div>
              )}

              {!onSaveImages && otherChannels.length > 0 && (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 13 }}>Also use these images for {group.color} on:</p>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {otherChannels.map((c) => (
                      <label key={c.key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                        <input type="checkbox" checked={also.has(c.key)} onChange={(e) => setAlso((p) => { const n = new Set(p); if (e.target.checked) n.add(c.key); else n.delete(c.key); return n; })} /> {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <footer style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderTop: '1px solid var(--rule)' }}>
              <button className="btn" disabled={!!busy || !filled.length} onClick={openStudio}>
                {picked.size ? `Edit ${picked.size} selected in Image Studio` : 'Edit all in Image Studio'}
              </button>
              <span className="status-line" style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>{busy && <Spinner size={12} />}{busy ?? ''}</span>
              <button className="btn primary" style={{ flex: 'none' }} disabled={!!busy} onClick={save}>Save images</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
