'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';
import { postJson } from '@/lib/fetcher';

interface L { id: string; at: string; kind: string; level: string; message: string; actor?: string | null }
interface D { logs: L[]; total: number; beats: Record<string, number>; now: number; retentionDays: number; byLevel: Record<string, number> }

const css = `
.lg-wrap { padding: 28px 32px 48px; background: #f5f5f5; min-height: 100%; box-sizing: border-box; }
.lg-inner { max-width: 1320px; margin: 0 auto; }
.lg-card { background: #fff; border: 1px solid #e4e4e4; border-radius: 8px; }
.lg-jobs { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0; }
.lg-job { padding: 14px 18px; border-right: 1px solid #efefef; font-size: 13px; }
.lg-job:last-child { border-right: 0; }
.lg-job .n { font-weight: 600; display: flex; gap: 8px; align-items: center; }
.lg-job .s { color: #8a8a8a; font-size: 12px; margin-top: 3px; }
.lg-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
.lg-table th { text-align: left; font-weight: 500; color: #4a4a4a; padding: 11px 18px; border-bottom: 1px solid #e4e4e4; }
.lg-table td { padding: 10px 18px; border-bottom: 1px solid #f1f1f1; vertical-align: top; }
.lg-table tbody tr:last-child td { border-bottom: 0; }
.lv { display: inline-flex; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
.lv-info { background: #eef1f5; color: #3d4a5c; }
.lv-warn { background: #fdf1dc; color: #8a5a00; }
.lv-error { background: #fde8e6; color: #b42318; }
.kd { display: inline-flex; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: #f3f3f3; color: #4a4a4a; }
`;

const jobs = [
  { key: 'pull', name: 'Nordstrom pull check', every: 60_000, note: 'every 1 min — pulls when your interval is due' },
  { key: 'status', name: 'Marketplace status check', every: 60_000, note: 'every 1 min' },
  { key: 'autopush', name: 'Auto-push', every: 5 * 60_000, note: 'every 5 min' },
  { key: 'cleanup', name: 'Log cleanup', every: 60 * 60_000, note: 'every hour' },
];
const kinds = [
  { key: 'all', label: 'All' }, { key: 'pull', label: 'Nordstrom pull' }, { key: 'push', label: 'Sends' },
  { key: 'status', label: 'Marketplace results' }, { key: "approval", label: "Approvals & edits" }, { key: 'import', label: 'Manual imports' }, { key: 'settings', label: 'Settings' }, { key: 'system', label: 'System' },
];
const ago = (ms: number) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };

export default function LogsPage() {
  const [kind, setKind] = useState('all');
  const [level, setLevel] = useState('all');
  const { data, mutate } = useSWR<D>(`/api/logs?kind=${kind}&level=${level}`, { refreshInterval: 10_000 });

  async function clearAll() {
    if (!confirm('Delete every log entry?')) return;
    try { const j = await postJson('/api/logs', { action: 'clear' }); toast.success(`Cleared ${j.cleared} entries`); mutate(); } catch (e) { toast.error((e as Error).message); }
  }
  async function retention(days: number) {
    try { await postJson('/api/logs', { action: 'retention', days }); toast.success(`Logs kept for ${days} day${days === 1 ? '' : 's'}`); mutate(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="lg-wrap" style={{ overflowY: 'auto', minWidth: 0 }}>
        <style>{css}</style>
        <div className="lg-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, flex: 1 }}>Activity log</h2>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>Keep logs for
              <select value={data?.retentionDays ?? 2} onChange={(e) => retention(Number(e.target.value))} style={{ padding: '6px 8px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' }}>
                <option value={1}>1 day</option><option value={2}>2 days</option><option value={7}>7 days</option>
              </select>
            </label>
            <button className="btn" onClick={clearAll}>Clear all logs</button>
          </div>

          <div className="lg-card" style={{ marginBottom: 20 }}>
            <div className="lg-jobs">
              {jobs.map((j) => {
                const last = data?.beats[j.key];
                const age = last && data ? data.now - last : null;
                const alive = age !== null && age < j.every * 2.5;
                return (
                  <div className="lg-job" key={j.key}>
                    <div className="n"><span className={`dot ${!data ? 'busy' : alive ? 'ok' : 'fail'}`} />{j.name}</div>
                    <div className="s">{!data ? 'Checking…' : age === null ? 'Not run yet since the server started' : alive ? `Ran ${ago(age)} · ${j.note}` : `Not running — last ${ago(age)}`}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: '1px solid #efefef', padding: '10px 18px', fontSize: 12, color: '#8a8a8a' }}>
              Background jobs run inside the app server. On your Mac that&apos;s only while <code>npm run dev</code> is open and the Mac is awake; once deployed, around the clock.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <div className="filters">{kinds.map((k) => <button key={k.key} className="filter" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</button>)}</div>
            <span style={{ flex: 1 }} />
            <div className="filters">
              {['all', 'info', 'warn', 'error'].map((l) => (
                <button key={l} className="filter" aria-pressed={level === l} onClick={() => setLevel(l)}>
                  {l === 'all' ? 'All levels' : l[0].toUpperCase() + l.slice(1)}{l !== 'all' && data?.byLevel[l] ? ` ${data.byLevel[l]}` : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="lg-card">
            {!data ? <div className="loading-block"><Spinner /> Loading…</div> : data.logs.length === 0 ? (
              <div style={{ padding: '28px 18px', color: '#8a8a8a', fontSize: 13 }}>No log entries{kind !== 'all' || level !== 'all' ? ' for this filter' : ''}.</div>
            ) : (
              <table className="lg-table">
                <colgroup><col style={{ width: 190 }} /><col style={{ width: 160 }} /><col style={{ width: 90 }} /><col style={{ width: 140 }} /><col /></colgroup>
                <thead><tr><th>Time</th><th>Area</th><th>Level</th><th>Who</th><th>What happened</th></tr></thead>
                <tbody>
                  {data.logs.map((l) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'nowrap', color: '#4a4a4a' }}>{new Date(l.at).toLocaleString()}</td>
                      <td><span className="kd">{kinds.find((k) => k.key === l.kind)?.label ?? l.kind}</span></td>
                      <td><span className={`lv lv-${l.level}`}>{l.level}</span></td>
                      <td style={{ color: "#4a4a4a" }}>{l.actor ?? "system"}</td>
                      <td style={{ wordBreak: 'break-word' }}>{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
