'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

interface Run { id: string; fileName: string; rowCount: number; newCount: number; changedCount: number; queued: number; imageChanges: number; source: string; createdAt: string }
interface Cfg { enabled?: boolean; intervalMin?: number; lastRunAt?: string | null; lastResult?: string | null; lastOk?: boolean | null }
type Tab = 'all' | 'manual' | 'auto';

const css = `
.pl-wrap { padding: 28px 32px 48px; background: #f5f5f5; min-height: 100%; box-sizing: border-box; }
.pl-inner { max-width: 1320px; margin: 0 auto; }
.pl-card { background: #fff; border: 1px solid #e4e4e4; border-radius: 8px; }
.pl-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
.pl-table th { text-align: left; font-weight: 500; color: #4a4a4a; padding: 12px 20px; border-bottom: 1px solid #e4e4e4; white-space: nowrap; }
.pl-table td { padding: 13px 20px; border-bottom: 1px solid #efefef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pl-table tbody tr:last-child td { border-bottom: 0; }
.src { display: inline-flex; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500; }
.src-auto { background: #ece9fd; color: #4b3fb3; }
.src-manual { background: #efefef; color: #4a4a4a; }
.num { font-family: var(--mono); font-size: 12px; }
`;

function PullsInner() {
  const [tab, setTab] = useState<Tab>('all');
  const { data } = useSWR<{ runs: Run[]; counts: Record<string, number> }>(`/api/pulls?source=${tab}`, { refreshInterval: 30_000 });
  const { data: cfg } = useSWR<Cfg>('/api/nordstrom-pull', { refreshInterval: 30_000 });
  const total = (data?.counts.manual ?? 0) + (data?.counts.auto ?? 0);
  const label: Record<Tab, string> = { all: `All ${total}`, manual: `Manual ${data?.counts.manual ?? 0}`, auto: `Auto ${data?.counts.auto ?? 0}` };

  return (
    <section className="pl-wrap" style={{ overflowY: 'auto', minWidth: 0 }}>
      <style>{css}</style>
      <div className="pl-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, flex: 1 }}>Nordstrom pulls</h2>
          <div className="filters">
            {(['all', 'manual', 'auto'] as Tab[]).map((t) => <button key={t} className="filter" aria-pressed={tab === t} onClick={() => setTab(t)}>{label[t]}</button>)}
          </div>
        </div>

        <div className="pl-card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
          <span className={`dot ${cfg?.lastOk === false ? 'fail' : cfg?.enabled ? 'ok' : ''}`} />
          <span style={{ flex: 1, color: '#4a4a4a' }}>
            {cfg?.enabled ? `API pull on — every ${cfg.intervalMin ?? 15} min.` : 'API pull off.'}{' '}
            {cfg?.lastRunAt ? `Last check ${new Date(cfg.lastRunAt).toLocaleString()}: ${cfg.lastResult}` : ''}
          </span>
          <Link href="/settings" className="filter">Settings</Link>
        </div>

        <div className="pl-card">
          {!data ? <div className="loading-block"><Spinner /> Loading…</div> : data.runs.length === 0 ? (
            <div style={{ padding: '28px 20px', color: '#8a8a8a', fontSize: 13 }}>No {tab === 'all' ? '' : `${tab} `}Nordstrom imports yet.</div>
          ) : (
            <table className="pl-table">
              <colgroup><col style={{ width: 190 }} /><col style={{ width: 110 }} /><col /><col style={{ width: 90 }} /><col style={{ width: 90 }} /><col style={{ width: 100 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /></colgroup>
              <thead><tr><th>Created</th><th>Origin</th><th>File</th><th>Rows</th><th>New</th><th>Changed</th><th>Listings queued</th><th>Image changes</th></tr></thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td><span className={`src ${r.source === 'auto' ? 'src-auto' : 'src-manual'}`}>{r.source === 'auto' ? 'Auto' : 'Manual'}</span></td>
                    <td className="num" title={r.fileName}>{r.fileName}</td>
                    <td className="num">{r.rowCount}</td>
                    <td className="num">{r.newCount}</td>
                    <td className="num">{r.changedCount}</td>
                    <td className="num">{r.queued}</td>
                    <td className="num">{r.imageChanges ? <Link href="/images" style={{ color: 'var(--ink)' }}>{r.imageChanges}</Link> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

export default function PullsPage() {
  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <Suspense fallback={<section style={{ padding: 32 }}><div className="loading-block"><Spinner /> Loading…</div></section>}>
        <PullsInner />
      </Suspense>
    </main>
  );
}
