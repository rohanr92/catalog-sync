'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

interface Issue { level: 'bad' | 'warn'; text: string }
interface Check { w: number; h: number; kb: number; bg: string; fill: number; sharp: number; err?: string }
interface Img { url: string; check: Check | null; issues: Issue[] }
interface Row { channel: string; name: string; key: string; styleCode: string; color: string; title: string; nordStyle: string | null; nordColor: string | null; images: Img[]; bad: number; warn: number; pending: number }
interface Sum { key: string; name: string; styles: number; images: number; checked: number; bad: number; warn: number }
interface Data { summary: Sum[]; left: number; total: number; page: number; per: number; rows: Row[]; error?: string }

const css = `
.iq { padding: 22px 24px 40px; overflow-y: auto; min-width: 0; }
.iq h2 { font-size: 22px; font-weight: 800; margin: 0 0 4px; display: flex; gap: 8px; align-items: center; }
.iq-q { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--rule-strong); background: var(--paper); font-weight: 800; font-size: 12px; cursor: pointer; color: inherit; }
.iq-help { border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); padding: 12px 14px; margin: 10px 0; font-size: 12.5px; line-height: 1.6; }
.iq-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; margin: 14px 0; }
.iq-card { border: 1px solid var(--rule); border-radius: 10px; padding: 12px; background: var(--paper); font-size: 12px; cursor: pointer; text-align: left; font-family: inherit; color: inherit; }
.iq-card.on { border-color: #6d5ce8; box-shadow: 0 0 0 1px #6d5ce8; }
.iq-card .n { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
.iq-red { color: #b42318; font-weight: 700; }
.iq-orange { color: #b26b00; font-weight: 700; }
.iq-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.iq-tools input[type=search], .iq-tools select { padding: 7px 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; background: var(--paper); }
.iq-tools input[type=search] { flex: 1; min-width: 200px; max-width: 320px; }
.iq-list { display: flex; flex-direction: column; gap: 10px; }
.iq-row { border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); padding: 12px; }
.iq-head { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 10px; }
.iq-head .t { font-weight: 700; font-size: 13.5px; }
.iq-sub { font-size: 11.5px; color: var(--ink-3); }
.iq-imgs { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
.iq-img { font-size: 11px; }
.iq-img .box { position: relative; aspect-ratio: 4 / 5; border-radius: 6px; overflow: hidden; background: #f4f4f4; border: 2px solid transparent; display: block; }
.iq-img .box.bad { border-color: #e5484d; }
.iq-img .box.warn { border-color: #f5a524; }
.iq-img .box.ok { border-color: #30a46c33; }
.iq-img img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
.iq-img .num { position: absolute; top: 4px; left: 4px; background: #0009; color: #fff; border-radius: 9px; padding: 0 6px; font-weight: 700; font-size: 10.5px; }
.iq-img .size { color: var(--ink-3); margin-top: 3px; }
.iq-img .is { margin-top: 2px; line-height: 1.35; }
.iq-img .is.bad { color: #b42318; font-weight: 600; }
.iq-img .is.warn { color: #b26b00; }
.iq-img .re { background: none; border: none; color: #6d5ce8; cursor: pointer; padding: 0; font: inherit; font-size: 10.5px; }
.iq-table-dim { opacity: .45; pointer-events: none; transition: opacity .15s; }
@media (max-width: 700px) { .iq { padding: 16px 12px 40px; } .iq-imgs { grid-template-columns: repeat(3, 1fr); } }
`;

const fixHref = (r: Row) => r.channel === 'nordstrom'
  ? `/nordstrom?q=${encodeURIComponent(r.styleCode)}&color=${encodeURIComponent(r.color)}`
  : `/catalog?channel=${r.channel}&q=${encodeURIComponent(r.styleCode)}&color=${encodeURIComponent(r.color)}`;

export default function ImageQualityPage() {
  const [data, setData] = useState<Data | null>(null);
  const [channel, setChannel] = useState('');
  const [show, setShow] = useState('problems');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [help, setHelp] = useState(false);
  const [busyUrl, setBusyUrl] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/image-quality?${new URLSearchParams({ channel, show, q, page: String(page) })}`).then((r) => r.json()).then(setData).catch(() => toast.error('Could not load')).finally(() => setLoading(false));
  }, [channel, show, q, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  async function scan() {
    setScanning(true);
    try {
      const j = await (await fetch('/api/image-quality', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'scan' }) })).json();
      if (j.error) toast.error(j.error);
      else if (j.left === -1) toast('Already checking in the background — try again in a minute');
      else toast.success(`Checked ${j.checked} images · ${j.left} left`);
      load();
    } finally { setScanning(false); }
  }

  async function recheck(url: string) {
    setBusyUrl(url);
    try {
      const j = await (await fetch('/api/image-quality', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'recheck', url }) })).json();
      if (j.error) toast.error(j.error); else toast.success('Checked again');
      load();
    } finally { setBusyUrl(''); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="iq">
        <style>{css}</style>
        <h2>Image quality <button className="iq-q" title="What is checked?" onClick={() => setHelp(!help)}>?</button></h2>
        <p className="status-line">Every image on every marketplace is checked. <span className="iq-red">Red</span> = must fix · <span className="iq-orange">Orange</span> = should fix. Click <b>Fix images</b> to open the editor.</p>
        {help && (
          <div className="iq-help">
            <b className="iq-red">Broken link</b> — the image can&apos;t be opened.<br />
            <b className="iq-red">Too small</b> — smaller than the marketplace&apos;s image size.<br />
            <b className="iq-red">Main image background not white</b> — the first image must be on white.<br />
            <b className="iq-orange">Wrong shape</b> — big enough, but not the marketplace&apos;s shape (for example square instead of 4:5).<br />
            <b className="iq-orange">Product small in frame</b> — lots of empty space around the product.<br />
            <b className="iq-orange">May be blurry</b> — edges look soft.<br />
            <b className="iq-orange">Same picture as image N</b> — the same photo is used twice.<br />
            New or replaced images are checked automatically in the background.
          </div>
        )}

        <div className="iq-cards">
          {(data?.summary ?? []).map((s) => (
            <button key={s.key} className={`iq-card${channel === s.key ? ' on' : ''}`} onClick={() => { setChannel(channel === s.key ? '' : s.key); setPage(1); }}>
              <div className="n">{s.name}</div>
              <div><span className="iq-red">{s.bad}</span> must fix · <span className="iq-orange">{s.warn}</span> should fix</div>
              <div className="iq-sub">{s.styles} styles · {s.checked}/{s.images} images checked</div>
            </button>
          ))}
        </div>

        <div className="iq-tools">
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search title, style or colour" />
          <select value={show} onChange={(e) => { setShow(e.target.value); setPage(1); }}>
            <option value="problems">Problems only</option>
            <option value="bad">Must fix only</option>
            <option value="all">Everything</option>
          </select>
          <button className="btn" disabled={scanning} onClick={scan}>{scanning ? 'Checking…' : 'Check now'}</button>
          {(!data || loading) && <Spinner size={14} />}
          {data && <span className="status-line">{data.total} styles{data.left > 0 ? ` · ${data.left} images still to check (about ${Math.ceil(data.left / 40)} min)` : ' · all images checked'}</span>}
        </div>

        {data?.error && <p style={{ color: '#b42318' }}>{data.error}</p>}
        {data && !data.error && (data.rows.length === 0 ? (
          <div className="cs-empty"><div className="e">🖼️</div><div className="t">Nothing to fix</div><div className="s">{data.left > 0 ? 'Some images are still being checked.' : 'All images look good.'}</div></div>
        ) : (
          <div className={`iq-list${loading ? ' iq-table-dim' : ''}`}>
            {data.rows.map((r) => (
              <div key={`${r.channel}|${r.key}`} className="iq-row">
                <div className="iq-head">
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="t">{r.title}</div>
                    <div className="iq-sub">{r.name} · {r.styleCode} · {r.color} · {r.images.length} image{r.images.length === 1 ? '' : 's'}
                      {r.bad > 0 && <> · <span className="iq-red">{r.bad} must fix</span></>}
                      {r.warn > 0 && <> · <span className="iq-orange">{r.warn} should fix</span></>}
                      {r.pending > 0 && <> · {r.pending} not checked yet</>}
                    </div>
                  </div>
                  <Link className="btn primary" href={fixHref(r)}>Fix images</Link>
                </div>
                <div className="iq-imgs">
                  {r.images.map((im, i) => {
                    const lvl = !im.check ? '' : im.issues.some((x) => x.level === 'bad') ? 'bad' : im.issues.length ? 'warn' : 'ok';
                    return (
                      <div key={im.url} className="iq-img">
                        <a className={`box ${lvl}`} href={im.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={im.url} alt="" loading="lazy" />
                          <span className="num">{i === 0 ? 'Main' : i + 1}</span>
                        </a>
                        <div className="size">{im.check ? (im.check.err ? '—' : `${im.check.w}×${im.check.h} · ${im.check.kb >= 1024 ? `${(im.check.kb / 1024).toFixed(1)} MB` : `${im.check.kb} KB`}`) : 'Not checked yet'}</div>
                        {im.issues.map((x) => <div key={x.text} className={`is ${x.level}`}>{x.text}</div>)}
                        {im.check && lvl === 'ok' && <div className="is" style={{ color: '#30a46c' }}>✓ Good</div>}
                        <button className="re" disabled={busyUrl === im.url} onClick={() => recheck(im.url)}>{busyUrl === im.url ? 'Checking…' : 'Check again'}</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
