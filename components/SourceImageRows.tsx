'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Group } from '@/lib/types';

type Found = { source: string; title: string; color: string; style: string; upc: string; images: string[]; matchedBy: string };
type RowData = { source: string; name: string; found: Found | null };

interface Props {
  group: Group;
  channelKey: string;
  slotCount: number;
  onPlace: (slot: number, url: string) => void;
}

export const SOURCE_DRAG_TYPE = 'text/x-cs-src';

const css = `
.sr-wrap { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--rule); }
.sr-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.sr-row { border: 1px solid var(--rule); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; background: var(--paper); }
.sr-row.nord { border-color: #c9a227; background: #fffaf0; }
.sr-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.sr-name { font-weight: 600; }
.sr-meta { font-size: 11px; color: var(--ink-3); flex: 1; min-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-x { border: 1px solid var(--rule); background: var(--paper); border-radius: 4px; width: 26px; height: 26px; cursor: pointer; font-size: 14px; line-height: 1; }
.sr-strip { display: flex; gap: 8px; overflow-x: auto; padding: 8px 0 2px; -webkit-overflow-scrolling: touch; }
.sr-th { flex: none; width: 84px; position: relative; }
.sr-th .im { width: 84px; aspect-ratio: 3/4; border-radius: 4px; overflow: hidden; background: #f4f4f4; cursor: grab; border: 2px solid transparent; }
.sr-th.on .im { border-color: var(--ink); }
.sr-th img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.sr-th .n { position: absolute; top: 3px; left: 3px; background: rgba(0,0,0,.65); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 8px; }
.sr-put { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; margin-top: 6px; font-size: 12px; }
.sr-put button { min-width: 28px; padding: 3px 6px; font-size: 12px; }
.sr-search { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.sr-search input { flex: 1; min-width: 160px; padding: 6px 8px; border: 1px solid var(--rule-strong); border-radius: 4px; font: inherit; font-size: 13px; background: var(--paper); color: inherit; }
.sr-res { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; margin-top: 8px; max-height: 260px; overflow-y: auto; }
.sr-cand { display: flex; gap: 8px; align-items: center; text-align: left; border: 1px solid var(--rule); border-radius: 6px; padding: 6px; background: var(--paper); cursor: pointer; font: inherit; color: inherit; }
.sr-cand:hover { border-color: var(--ink); }
.sr-cand img { width: 40px; height: 52px; object-fit: cover; border-radius: 3px; background: #f4f4f4; flex: none; }
.sr-cand .t { font-size: 12px; line-height: 1.35; overflow: hidden; }
.sr-chip { font-size: 12px; padding: 3px 8px; border: 1px dashed var(--rule-strong); border-radius: 12px; background: none; cursor: pointer; color: inherit; }
`;

const HIDE_KEY = 'cs-src-hidden';
const pickKey = (g: string, s: string) => `cs-src-pick:${g}:${s}`;
function readLS<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } }
function writeLS(k: string, v: unknown) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } }

function gtinsOf(group: Group): string[] {
  const out: string[] = [];
  const sizes = ((group as unknown as { sizes?: unknown[] }).sizes ?? []) as unknown[];
  for (const s of sizes) {
    if (s && typeof s === 'object') for (const k of ['gtin', 'upc', 'ean']) { const v = (s as Record<string, unknown>)[k]; if (typeof v === 'string' || typeof v === 'number') out.push(String(v)); }
  }
  for (const k of ['gtin', 'upc', 'gtins', 'upcs']) {
    const v = (group as unknown as Record<string, unknown>)[k];
    if (Array.isArray(v)) v.forEach((x) => out.push(String(x))); else if (typeof v === 'string') out.push(v);
  }
  return [...new Set(out.filter((x) => /\d{8,}/.test(x)))];
}

export default function SourceImageRows({ group, channelKey, slotCount, onPlace }: Props) {
  const [rows, setRows] = useState<RowData[] | null>(null);
  const [hidden, setHidden] = useState<string[]>(() => readLS<string[]>(HIDE_KEY, []));
  const [picks, setPicks] = useState<Record<string, Found>>({});
  const [chosen, setChosen] = useState<{ source: string; url: string } | null>(null);
  const [searching, setSearching] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Found[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams({ style: group.styleCode ?? '', color: group.color ?? '', title: group.title ?? '', channel: channelKey, gtins: gtinsOf(group).join(',') });
    fetch(`/api/source-images?${p}`).then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error);
      const rs = j.rows as RowData[];
      setRows(rs);
      const saved: Record<string, Found> = {};
      rs.forEach((r) => { const f = readLS<Found | null>(pickKey(group.key, r.source), null); if (f) saved[r.source] = f; });
      setPicks(saved);
    }).catch((e) => { setRows([]); toast.error('Other images: ' + (e as Error).message); });
  }, [group, channelKey]);

  function hide(source: string, on: boolean) {
    setHidden((h) => { const n = on ? [...new Set([...h, source])] : h.filter((x) => x !== source); writeLS(HIDE_KEY, n); return n; });
  }

  function openSearch(r: RowData) {
    setSearching(r.source);
    setResults(null);
    setQ(`${group.title ?? ''} ${group.color ?? ''}`.trim());
  }

  async function runSearch(source: string) {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const j = await fetch(`/api/source-images?${new URLSearchParams({ q: q.trim(), source })}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setResults(j.results);
    } catch (e) { toast.error((e as Error).message); }
    setLoading(false);
  }

  function choose(source: string, f: Found | null) {
    setPicks((p) => { const n = { ...p }; if (f) n[source] = f; else delete n[source]; return n; });
    writeLS(pickKey(group.key, source), f);
    setSearching(null); setResults(null);
  }

  function place(slot: number, url: string) {
    onPlace(slot, url);
    setChosen(null);
  }

  if (!rows) return <div className="sr-wrap status-line">Loading Nordstrom and other marketplace images…</div>;
  const visible = rows.filter((r) => !hidden.includes(r.source));
  const hiddenRows = rows.filter((r) => hidden.includes(r.source));

  return (
    <div className="sr-wrap">
      <style>{css}</style>
      <div className="sr-head">
        <span style={{ fontSize: 13, fontWeight: 600 }}>Images from Nordstrom and other marketplaces</span>
        <span className="status-line" style={{ flex: 1 }}>Drag an image onto a slot above, or tap it and pick the slot number. Then tick that slot and edit it in Image Studio.</span>
      </div>
      {hiddenRows.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span className="status-line">Hidden:</span>
          {hiddenRows.map((r) => <button key={r.source} className="sr-chip" onClick={() => hide(r.source, false)}>+ Show {r.name}</button>)}
        </div>
      )}

      {visible.map((r) => {
        const f = picks[r.source] ?? r.found;
        const isNord = r.source === 'nordstrom';
        return (
          <div key={r.source} className={`sr-row${isNord ? ' nord' : ''}`}>
            <div className="sr-top">
              <span className="sr-name">{r.name}</span>
              <span className="sr-meta" title={f ? `${f.title} · ${f.color} · ${f.style} · UPC ${f.upc}` : ''}>
                {f ? `${f.images.length} image${f.images.length === 1 ? '' : 's'} · ${f.title} · ${f.color} · ${picks[r.source] ? 'picked by search' : `matched by ${f.matchedBy}`}` : 'Not found for this product'}
              </span>
              {picks[r.source] && <button className="filter" style={{ fontSize: 12 }} onClick={() => choose(r.source, null)}>Use auto match</button>}
              <button className="filter" style={{ fontSize: 12 }} onClick={() => (searching === r.source ? setSearching(null) : openSearch(r))}>{searching === r.source ? 'Close search' : 'Search'}</button>
              <button className="sr-x" title={`Hide ${r.name}`} onClick={() => hide(r.source, true)}>✕</button>
            </div>

            {searching === r.source && (
              <div>
                <div className="sr-search">
                  <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runSearch(r.source); }} placeholder="UPC, title, colour or style" autoFocus />
                  <button className="btn" disabled={loading} onClick={() => runSearch(r.source)}>{loading ? 'Searching…' : 'Search'}</button>
                </div>
                {results && (results.length === 0
                  ? <p className="status-line" style={{ marginTop: 8 }}>Nothing found on {r.name}. Try the UPC or fewer words.</p>
                  : <div className="sr-res">
                      {results.map((c, k) => (
                        <button key={k} className="sr-cand" onClick={() => choose(r.source, c)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.images[0]} alt="" />
                          <span className="t"><b>{c.title}</b><br />{c.color} · {c.style}<br />UPC {c.upc} · {c.images.length} img</span>
                        </button>
                      ))}
                    </div>)}
              </div>
            )}

            {f && f.images.length > 0 && (
              <div className="sr-strip">
                {f.images.map((url, k) => (
                  <div key={url + k} className={`sr-th${chosen?.url === url && chosen.source === r.source ? ' on' : ''}`}>
                    <div className="im" draggable
                      onDragStart={(e) => { e.dataTransfer.setData(SOURCE_DRAG_TYPE, url); e.dataTransfer.effectAllowed = 'copy'; }}
                      onClick={() => setChosen(chosen?.url === url && chosen.source === r.source ? null : { source: r.source, url })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" loading="lazy" />
                    </div>
                    <span className="n">{k + 1}</span>
                  </div>
                ))}
              </div>
            )}

            {chosen && chosen.source === r.source && (
              <div className="sr-put">
                <span className="status-line">Put this image in slot:</span>
                {Array.from({ length: slotCount }, (_, i) => <button key={i} className="filter" onClick={() => place(i, chosen.url)}>{i + 1}</button>)}
                <button className="filter" onClick={() => setChosen(null)}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
