'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';
import EmptyState from '@/components/EmptyState';
import { postJson } from '@/lib/fetcher';

interface Mis { nordstromUpc: string; marketplaceUpc: string; title: string; color: string; size: string; marketplaceSize: string; marketplaceSku: string; marketplaceTitle: string }
interface Orph { upc: string; title: string; style: string; color: string; size: string; sku: string }
interface Dup { upc: string; rows: number; title: string; color: string; size: string }
interface D { checked: number; mismatches: Mis[]; orphans: Orph[]; duplicates: Dup[] }
type Tab = 'mismatch' | 'orphan' | 'dupe';

const css = `
.uc-wrap { padding: 28px 32px 48px; background: #f5f5f5; min-height: 100%; box-sizing: border-box; }
.uc-inner { max-width: 1320px; margin: 0 auto; }
.uc-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
.uc-card { background: #fff; border: 1px solid #e4e4e4; border-radius: 10px; padding: 16px 18px; cursor: pointer; text-align: left; font: inherit; }
.uc-card.on { border-color: #6d5ce8; box-shadow: 0 0 0 2px rgba(109, 92, 232, 0.15); }
.uc-card .n { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
.uc-card .t { font-size: 13px; font-weight: 600; margin-top: 2px; }
.uc-card .s { font-size: 12px; color: #8a8a8a; margin-top: 4px; }
.uc-box { background: #fff; border: 1px solid #e4e4e4; border-radius: 10px; overflow: hidden; }
.uc-bar { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e4e4e4; font-size: 13px; color: #4a4a4a; flex-wrap: wrap; }
.uc-t { width: 100%; border-collapse: collapse; font-size: 13px; }
.uc-t th { text-align: left; font-weight: 500; color: #4a4a4a; padding: 10px 16px; border-bottom: 1px solid #e4e4e4; background: #fafafa; white-space: nowrap; }
.uc-t td { padding: 10px 16px; border-bottom: 1px solid #f1f1f1; vertical-align: top; }
.uc-t tr:last-child td { border-bottom: 0; }
.mono { font-family: var(--mono); font-size: 12px; }
`;

function csv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const body = [keys.join(','), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  a.download = `${name}.csv`;
  a.click();
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: ch } = useSWR<{ channels: { key: string; name: string }[] }>('/api/channels');
  const channels = ch?.channels ?? [];
  const channel = params.get('channel') ?? channels[0]?.key ?? '';
  const name = channels.find((c) => c.key === channel)?.name ?? channel;
  const { data, mutate } = useSWR<D>(channel ? `/api/upc-check?channel=${channel}` : null);
  const [tab, setTab] = useState<Tab>('mismatch');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function keepOut(gtins: string[]) {
    setBusy(true);
    try { const j = await postJson('/api/upc-check', { action: 'ignore', channel, gtins }); toast.success(`${j.count} kept out of the ${name} queue`); setPicked(new Set()); mutate(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  const cards: { k: Tab; n: number; t: string; s: string; color: string }[] = [
    { k: 'mismatch', n: data?.mismatches.length ?? 0, t: 'Same item, different UPC', s: `Would be listed twice if approved from the queue`, color: '#b42318' },
    { k: 'orphan', n: data?.orphans.length ?? 0, t: `On ${name}, not on Nordstrom`, s: 'Discontinued, or the UPC changed on one side', color: '#8a5a00' },
    { k: 'dupe', n: data?.duplicates.length ?? 0, t: 'Duplicate UPCs', s: `The same UPC on more than one ${name} row`, color: '#4b3fb3' },
  ];

  return (
    <section className="uc-wrap" style={{ overflowY: 'auto', minWidth: 0 }}>
      <style>{css}</style>
      <div className="uc-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, flex: 1 }}>UPC check</h2>
          <div className="filters">{channels.map((c) => <button key={c.key} className="filter" aria-pressed={c.key === channel} onClick={() => { router.push(`/upc-check?channel=${c.key}`); setPicked(new Set()); }}>{c.name}</button>)}</div>
        </div>
        <p className="status-line" style={{ marginBottom: 18 }}>UPC is the only thing that matches across marketplaces, so this checks the UPCs themselves. Based on the last {name} file imported{data ? ` (${data.checked} rows)` : ''}. Nothing here is sent anywhere.</p>

        {!data ? <div className="loading-block"><Spinner /> Checking {name}…</div> : (
          <>
            <div className="uc-cards">
              {cards.map((c) => (
                <button key={c.k} className={`uc-card${tab === c.k ? ' on' : ''}`} onClick={() => { setTab(c.k); setPicked(new Set()); }}>
                  <div className="n" style={{ color: c.n ? c.color : '#16713f' }}>{c.n}</div>
                  <div className="t">{c.t}</div>
                  <div className="s">{c.s}</div>
                </button>
              ))}
            </div>

            <div className="uc-box">
              {tab === 'mismatch' && (data.mismatches.length === 0 ? <EmptyState emoji="✅" title="No UPC mismatches" text={`Every Nordstrom size that ${name} has under this style and colour uses the same UPC.`} /> : (
                <>
                  <div className="uc-bar">
                    <span style={{ flex: 1 }}>Fix the UPC on one side, or keep the Nordstrom UPC out of the {name} queue so it isn&apos;t listed a second time.</span>
                    <button className="btn" onClick={() => csv(`${channel}-upc-mismatches`, data.mismatches as unknown as Record<string, unknown>[])}>Download CSV</button>
                    <button className="btn" disabled={busy || !picked.size} onClick={() => keepOut([...picked])}>Keep {picked.size || ''} out of queue</button>
                  </div>
                  <table className="uc-t">
                    <thead><tr><th><input type="checkbox" checked={picked.size === data.mismatches.length} onChange={(e) => setPicked(e.target.checked ? new Set(data.mismatches.map((m) => m.nordstromUpc)) : new Set())} /></th><th>Product</th><th>Size</th><th>Nordstrom UPC</th><th>{name} UPC</th><th>{name} SKU</th><th /></tr></thead>
                    <tbody>{data.mismatches.map((m) => (
                      <tr key={m.nordstromUpc}>
                        <td><input type="checkbox" checked={picked.has(m.nordstromUpc)} onChange={(e) => setPicked((p) => { const s = new Set(p); if (e.target.checked) s.add(m.nordstromUpc); else s.delete(m.nordstromUpc); return s; })} /></td>
                        <td><div style={{ fontWeight: 500 }}>{m.title}</div><div className="status-line">{m.color}</div></td>
                        <td className="mono">{m.size}{m.marketplaceSize && m.marketplaceSize !== m.size ? ` → ${m.marketplaceSize}` : ''}</td>
                        <td className="mono">{m.nordstromUpc}</td>
                        <td className="mono" style={{ color: '#b42318' }}>{m.marketplaceUpc}</td>
                        <td className="mono">{m.marketplaceSku}</td>
                        <td style={{ textAlign: 'right' }}><button className="filter" disabled={busy} onClick={() => keepOut([m.nordstromUpc])}>Keep out of queue</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </>
              ))}

              {tab === 'orphan' && (data.orphans.length === 0 ? <EmptyState emoji="✅" title={`Everything on ${name} is on Nordstrom`} /> : (
                <>
                  <div className="uc-bar"><span style={{ flex: 1 }}>These UPCs are live on {name} but Nordstrom doesn&apos;t have them. If the product is discontinued, consider removing it from {name}; if the UPC changed, correct it.</span><button className="btn" onClick={() => csv(`${channel}-not-on-nordstrom`, data.orphans as unknown as Record<string, unknown>[])}>Download CSV</button></div>
                  <table className="uc-t">
                    <thead><tr><th>Product on {name}</th><th>Style</th><th>Size</th><th>UPC</th><th>SKU</th></tr></thead>
                    <tbody>{data.orphans.map((o) => (
                      <tr key={o.upc}><td><div style={{ fontWeight: 500 }}>{o.title}</div><div className="status-line">{o.color}</div></td><td className="mono">{o.style}</td><td className="mono">{o.size}</td><td className="mono">{o.upc}</td><td className="mono">{o.sku}</td></tr>
                    ))}</tbody>
                  </table>
                </>
              ))}

              {tab === 'dupe' && (data.duplicates.length === 0 ? <EmptyState emoji="✅" title="No duplicate UPCs" text={`Re-import the ${name} file if you haven't since this update — duplicates are counted during import.`} /> : (
                <>
                  <div className="uc-bar"><span style={{ flex: 1 }}>Each of these UPCs appears on more than one row of the {name} file. Only the first row is used by this tool.</span><button className="btn" onClick={() => csv(`${channel}-duplicate-upcs`, data.duplicates as unknown as Record<string, unknown>[])}>Download CSV</button></div>
                  <table className="uc-t">
                    <thead><tr><th>UPC</th><th>Rows</th><th>Product</th><th>Size</th></tr></thead>
                    <tbody>{data.duplicates.map((d) => (
                      <tr key={d.upc}><td className="mono">{d.upc}</td><td className="mono">{d.rows}</td><td><div style={{ fontWeight: 500 }}>{d.title}</div><div className="status-line">{d.color}</div></td><td className="mono">{d.size}</td></tr>
                    ))}</tbody>
                  </table>
                </>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function UpcCheckPage() {
  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <Suspense fallback={<section style={{ padding: 32 }}><div className="loading-block"><Spinner /> Loading…</div></section>}>
        <Inner />
      </Suspense>
    </main>
  );
}
