'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';
import { postJson } from '@/lib/fetcher';

interface Sub {
  id: string; kind: string; source: string; status: string; statusDetail: string | null; rowCount: number;
  accepted: number; rejected: number; importId: string | null; sentAt: string; completedAt: string | null;
  errorReport: { upc: string; title: string; message: string }[] | null; reportName: string | null; fileUrl: string | null; reports?: { i: number; kind: string; name: string }[];
}
interface D { ready: { sizes: number; images: number }; nextAllowedAt: string | null; autoPush: boolean; connected: boolean; submissions: Sub[] }

const css = `
.rs-wrap { padding: 28px 32px 48px; background: #f5f5f5; min-height: 100%; box-sizing: border-box; }
.rs-inner { max-width: 1320px; margin: 0 auto; }
.rs-top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.rs-top h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; margin: 0; flex: 1; min-width: 200px; }
.rs-card { background: #fff; border: 1px solid #e4e4e4; border-radius: 8px; }
.rs-ready { display: flex; align-items: center; gap: 18px; padding: 16px 20px; margin-bottom: 20px; flex-wrap: wrap; }
.rs-ready .t { font-size: 15px; font-weight: 600; }
.rs-ready .s { font-size: 12px; color: #8a8a8a; margin-top: 2px; }
.rs-bar { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid #e4e4e4; font-size: 13px; color: #4a4a4a; }
.rs-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
.rs-table th { text-align: left; font-weight: 500; color: #4a4a4a; padding: 12px 20px; border-bottom: 1px solid #e4e4e4; white-space: nowrap; }
.rs-table td { padding: 14px 20px; border-bottom: 1px solid #efefef; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rs-table tbody tr:last-child td { border-bottom: 0; }
.rs-table tr.open > td { background: #fafafa; }
.rs-file { font-family: var(--mono); font-size: 12px; }
.rs-details { padding: 4px 20px 18px !important; white-space: normal !important; background: #fafafa; }
.rs-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 12px; color: #4a4a4a; margin-bottom: 12px; }
.rs-meta b { font-weight: 500; color: #0a0a0a; }
.rs-errs { width: 100%; border-collapse: collapse; font-size: 12px; background: #fff; border: 1px solid #e4e4e4; border-radius: 6px; }
.rs-errs td { padding: 8px 12px; border-bottom: 1px solid #efefef; vertical-align: top; }
.rs-errs tr:last-child td { border-bottom: 0; }
.st { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500; line-height: 1; }
.st-progress { background: #ece9fd; color: #4b3fb3; }
.st-complete { background: #e3f5ea; color: #16713f; }
.st-errors { background: #fdf1dc; color: #8a5a00; }
.st-failed { background: #fde8e6; color: #b42318; }
.st-cancelled { background: #efefef; color: #555; }
.rs-btn { padding: 6px 14px; font-size: 12px; border: 1px solid #c9c9c9; border-radius: 6px; background: #fff; cursor: pointer; color: #0a0a0a; }
.rs-btn:hover { border-color: #0a0a0a; }
.rs-empty { padding: 28px 20px; color: #8a8a8a; font-size: 13px; }
`;

function status(s: Sub): { text: string; cls: string } {
  const raw = (s.statusDetail ?? '').toUpperCase();
  if (s.status === 'processing') return { text: 'In progress', cls: 'st-progress' };
  if (raw === 'CANCELLED') return { text: 'Cancelled', cls: 'st-cancelled' };
  if (s.status === 'failed') return { text: 'Failed', cls: 'st-failed' };
  if (s.rejected > 0) return { text: 'Complete', cls: 'st-errors' };
  return { text: 'Complete', cls: 'st-complete' };
}
const kindLabel: Record<string, string> = { "nordstrom-edit": "Nordstrom edits", listing: 'New listings', images: 'Image updates', mixed: 'Listings + images' };
const fmt = (d: string) => new Date(d).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function ResultsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: ch } = useSWR<{ channels: { key: string; name: string }[] }>('/api/channels');
  const channels = [...(ch?.channels ?? []), { key: "nordstrom", name: "Nordstrom" }];
  const channel = params.get('channel') ?? channels[0]?.key ?? '';
  const name = channels.find((c) => c.key === channel)?.name ?? channel;
  const { data, mutate, isValidating } = useSWR<D>(channel ? `/api/dispatch?channel=${channel}` : null, { refreshInterval: 20_000 });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    const t = toast.loading(`Sending to ${name}…`);
    try {
      const j = await postJson('/api/dispatch', { action: 'send', channel });
      if (j.errors?.length) toast.error(j.errors[0], { id: t });
      else toast.success(j.rows ? `Sent ${j.rows} rows in ${j.submissions} file${j.submissions === 1 ? '' : 's'}${j.skipped ? ` · ${j.skipped} approved before this update — re-approve them` : ''}` : 'Nothing approved to send', { id: t });
      mutate();
    } catch (e) { toast.error((e as Error).message, { id: t }); }
    setBusy(false);
  }
  async function auto(on: boolean) {
    try { await postJson('/api/dispatch', { action: 'autopush', channel, enabled: on }); toast.success(on ? `Auto-push on for ${name}` : `Auto-push off for ${name}`); mutate(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function checkNow() {
    try { await postJson('/api/dispatch', { action: 'poll', channel }); await mutate(); toast.success(`Checked with ${name}`); } catch (e) { toast.error((e as Error).message); }
  }

  const waiting = (data?.ready.sizes ?? 0) + (data?.ready.images ?? 0);
  const nextAt = data?.nextAllowedAt ? new Date(data.nextAllowedAt) : null;

  return (
    <section className="rs-wrap" style={{ overflowY: 'auto', minWidth: 0 }}>
      <style>{css}</style>
      <div className="rs-inner">
        <div className="rs-top">
          <h2>Product imports</h2>
          <div className="filters">
            {channels.map((c) => <button key={c.key} className="filter" aria-pressed={c.key === channel} onClick={() => { router.push(`/results?channel=${c.key}`); setOpen(null); }}>{c.name}</button>)}
          </div>
        </div>

        {!ch || !data ? <div className="loading-block"><Spinner /> Loading{name ? ` ${name}` : ''}…</div> : (
          <>
            <div className="rs-card rs-ready">
              <div style={{ flex: 1, minWidth: 260 }}>
                <div className="t">Ready to send to {name}</div>
                <div className="s">
                  {data.ready.sizes} approved listing rows · {data.ready.images} approved image updates
                  {nextAt ? ` · next send allowed at ${nextAt.toLocaleTimeString()} (15-minute limit)` : ''}
                  {!data.connected && <> · <Link href="/settings" style={{ color: 'var(--alert)' }}>API not connected</Link></>}
                </div>
              </div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }} title="Sends approved items automatically as soon as the 15-minute window allows">
                <input type="checkbox" checked={data.autoPush} onChange={(e) => auto(e.target.checked)} /> Auto-push
              </label>
              <button className="btn primary" style={{ flex: 'none', display: 'flex', gap: 8, alignItems: 'center' }} disabled={busy || !waiting || !!nextAt || !data.connected} onClick={send}>
                {busy && <Spinner />} Send {waiting ? `${waiting} ` : ''}now
              </button>
            </div>

            <div className="rs-card">
              <div className="rs-bar">
                <span style={{ flex: 1 }}>{data.submissions.length} results · checked with {name} every minute</span>
                <button className="rs-btn" onClick={checkNow} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{isValidating && <Spinner size={11} />}Check now</button>
              </div>

              {data.submissions.length === 0 ? <div className="rs-empty">Nothing sent to {name} yet.</div> : (
                <table className="rs-table">
                  <colgroup>
                    <col style={{ width: 190 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 160 }} /><col style={{ width: 140 }} /><col style={{ width: 140 }} /><col style={{ width: 130 }} />
                  </colgroup>
                  <thead>
                    <tr><th>Created</th><th>File name</th><th>Origin</th><th>Type</th><th>Status</th><th>Lines with errors</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.submissions.map((s) => {
                      const st = status(s);
                      const rows = s.errorReport ?? [];
                      const isOpen = open === s.id;
                      const errCount = s.status === 'processing' ? '-' : s.rejected || (s.status === 'failed' ? s.rowCount : 0);
                      return [
                        <tr key={s.id} className={isOpen ? 'open' : ''}>
                          <td>{fmt(s.sentAt)}</td>
                          <td className="rs-file" title={s.fileUrl ?? ''}>{s.fileUrl ?? '—'}</td>
                          <td>{s.source === 'auto' ? 'Auto-push' : 'Manual'}</td>
                          <td>{kindLabel[s.kind] ?? s.kind} · {s.rowCount}</td>
                          <td><span className={`st ${st.cls}`}>{s.status === 'processing' && <Spinner size={11} />}{st.text}</span></td>
                          <td>{errCount}</td>
                          <td style={{ textAlign: 'right' }}><button className="rs-btn" onClick={() => setOpen(isOpen ? null : s.id)}>{isOpen ? 'Hide details' : 'View details'}</button></td>
                        </tr>,
                        isOpen && (
                          <tr key={`${s.id}-d`} className="open">
                            <td colSpan={7} className="rs-details">
                              <div className="rs-meta">
                                <span>Import <b style={{ fontFamily: 'var(--mono)' }}>{s.importId ?? '—'}</b></span>
                                <span>{name} status <b>{s.statusDetail ?? '—'}</b></span>
                                {s.status === 'complete' && <span><b>{s.accepted}</b> accepted · <b>{s.rejected}</b> rejected</span>}
                                {s.completedAt && <span>Finished <b>{fmt(s.completedAt)}</b></span>}
                                {(s.reports?.length ? s.reports : s.reportName ? [{ i: -1, kind: "error_report", name: s.reportName }] : []).map((r) => <a key={r.i} href={"/api/dispatch/report?id=" + s.id + (r.i >= 0 ? "&n=" + r.i : "")} style={{ color: "var(--ink)", textDecoration: "underline" }}>{r.kind === "transformation_error_report" ? "Template check report" : "Integration error report"}</a>)}
                              </div>
                              {s.status === 'processing' && <div style={{ fontSize: 12, color: '#8a8a8a' }}>{name} is still processing this file. SENT means it has been handed to {name}&apos;s catalogue team for integration — it moves to Complete when they finish.</div>}
                              {rows.length > 0 && (
                                <>
                                  <div style={{ fontSize: 12, color: '#4a4a4a', marginBottom: 8 }}>Rejected rows are back in the queue with these messages.</div>
                                  <table className="rs-errs">
                                    <tbody>
                                      {rows.map((r, i) => (
                                        <tr key={i}>
                                          <td style={{ fontFamily: 'var(--mono)', color: '#8a8a8a', width: 140 }}>{r.upc}</td>
                                          <td style={{ width: 340 }}>{r.title}</td>
                                          <td style={{ color: 'var(--alert)' }}>{r.message}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              )}
                              {s.status === 'failed' && !rows.length && <p className="notice" style={{ margin: 0 }}>{s.statusDetail}</p>}
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function ResultsPage() {
  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <Suspense fallback={<section style={{ padding: 32 }}><div className="loading-block"><Spinner /> Loading…</div></section>}>
        <ResultsInner />
      </Suspense>
    </main>
  );
}
