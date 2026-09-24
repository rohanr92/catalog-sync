'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ListChecks, Images, Send, Loader, Package, ArrowRight } from 'lucide-react';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

interface M { key: string; name: string; pending: number; blocked: number; images: number; ready: number }
interface O {
  marketplaces: M[]; processing: number; products: number;
  recent: { id: string; channelKey: string; kind: string; status: string; rowCount: number; accepted: number; rejected: number; sentAt: string }[];
  logs: { id: string; at: string; kind: string; level: string; message: string; actor: string | null }[];
  pull: { enabled: boolean; intervalMin: number; lastRunAt: string | null; lastResult: string | null; lastOk: boolean | null };
  beats: Record<string, number>; now: number;
}

const palette = ['#6d5ce8', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9'];
const css = `
.ov-wrap { padding: 26px 30px 48px; background: #f6f6f9; min-height: 100%; box-sizing: border-box; }
.ov-inner { max-width: 1280px; margin: 0 auto; }
.ov-hero { position: relative; overflow: hidden; border-radius: 16px; padding: 24px 26px; color: #fff; background: linear-gradient(120deg, #5b4bd6, #3b82f6 55%, #10b981); background-size: 200% 200%; animation: ov-flow 14s ease infinite; box-shadow: 0 14px 40px rgba(91, 75, 214, 0.25); margin-bottom: 18px; }
@keyframes ov-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
.ov-hero h1 { margin: 0 0 4px; font-size: 24px; letter-spacing: -0.02em; }
.ov-hero p { margin: 0; opacity: 0.88; font-size: 13.5px; }
.ov-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 18px; }
.ov-stat { background: #fff; border: 1px solid #ecebf2; border-radius: 14px; padding: 16px 18px; display: flex; gap: 14px; align-items: center; text-decoration: none; color: inherit; transition: transform 0.15s, box-shadow 0.15s; }
.ov-stat:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(20, 20, 40, 0.07); }
.ov-ic { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex: none; }
.ov-n { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.ov-l { font-size: 12.5px; color: #6b6880; margin-top: 4px; }
.ov-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 18px; }
@media (max-width: 1000px) { .ov-grid { grid-template-columns: 1fr; } }
.ov-card { background: #fff; border: 1px solid #ecebf2; border-radius: 14px; overflow: hidden; }
.ov-card h3 { margin: 0; padding: 14px 18px; font-size: 13px; font-weight: 700; border-bottom: 1px solid #f0eff5; display: flex; align-items: center; gap: 8px; }
.ov-mk { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; padding: 16px; }
.ov-m { border: 1px solid #ecebf2; border-radius: 12px; padding: 14px; position: relative; overflow: hidden; }
.ov-m::before { content: ""; position: absolute; left: 0; top: 0; right: 0; height: 4px; background: var(--c); }
.ov-m .t { font-weight: 700; font-size: 14px; margin-bottom: 10px; }
.ov-m .k { display: flex; justify-content: space-between; font-size: 12.5px; padding: 4px 0; color: #4a4760; }
.ov-m .k b { font-family: var(--mono); font-weight: 600; color: #1d1b2c; }
.ov-m .links { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.ov-m .links a { font-size: 11.5px; padding: 4px 9px; border-radius: 999px; background: #f4f3f9; color: #3d3a55; text-decoration: none; }
.ov-m .links a:hover { background: #ebe8fb; color: #3d31a8; }
.ov-li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 18px; border-bottom: 1px solid #f4f3f8; font-size: 12.5px; }
.ov-li:last-child { border-bottom: 0; }
.ov-pill { display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }
@media (max-width: 700px) { .ov-wrap { padding: 14px 12px 32px !important; } .ov-hero { padding: 18px; border-radius: 14px; } .ov-hero h1 { font-size: 20px; } .ov-stats { grid-template-columns: 1fr 1fr; gap: 10px; } .ov-stat { padding: 12px; gap: 8px; flex-direction: column; align-items: flex-start; } .ov-n { font-size: 22px; } .ov-mk { grid-template-columns: 1fr; padding: 12px; } .ov-li { padding: 10px 12px; flex-wrap: wrap; } }
`;

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const sendPill = (r: O['recent'][number]) => r.status === 'processing' ? { t: 'In progress', bg: '#ece9fd', fg: '#4b3fb3' } : r.status === 'failed' ? { t: 'Failed', bg: '#fde8e6', fg: '#b42318' } : r.rejected ? { t: `${r.rejected} rejected`, bg: '#fdf1dc', fg: '#8a5a00' } : { t: 'Complete', bg: '#e3f5ea', fg: '#16713f' };
const JOBS: [string, string, number][] = [['pull', 'Nordstrom pull check', 60_000], ['status', 'Marketplace status check', 60_000], ['autopush', 'Auto-push', 300_000]];

export default function HomePage() {
  const { data: me } = useSWR<{ name: string }>('/api/auth/me');
  const { data: o } = useSWR<O>('/api/overview', { refreshInterval: 30_000 });
  const first = (me?.name ?? '').split(/\s+/)[0];
  const tot = (f: keyof M) => (o?.marketplaces ?? []).reduce((n, m) => n + (m[f] as number), 0);
  const stats = [
    { n: tot('pending'), l: 'Waiting to list', icon: ListChecks, c: '#6d5ce8', bg: '#efeaff', href: o?.marketplaces[0] ? `/queue?channel=${o.marketplaces[0].key}` : '/queue' },
    { n: tot('images'), l: 'Image changes to review', icon: Images, c: '#d97706', bg: '#fdf3de', href: '/images' },
    { n: tot('ready'), l: 'Approved, ready to send', icon: Send, c: '#059669', bg: '#e3f5ea', href: '/results' },
    { n: o?.processing ?? 0, l: 'In progress at marketplaces', icon: Loader, c: '#2563eb', bg: '#e6effc', href: '/results' },
  ];
  const linkStyle = { marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: '#4b3fb3', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 } as const;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="ov-wrap" style={{ overflowY: 'auto', minWidth: 0 }}>
        <style>{css}</style>
        <div className="ov-inner">
          <div className="ov-hero">
            <h1>{greet()}{first ? `, ${first}` : ''} {'\u{1F44B}'}</h1>
            <p>{o ? `${o.products.toLocaleString()} Nordstrom products · ${o.marketplaces.length} marketplace${o.marketplaces.length === 1 ? '' : 's'} connected · ${o.pull.enabled ? `pulling every ${o.pull.intervalMin} min` : 'automatic pull off'}` : 'Loading your catalogue…'}</p>
          </div>
          {!o ? <div className="loading-block"><Spinner /> Loading overview…</div> : (
            <>
              <div className="ov-stats">
                {stats.map((s) => {
                  const I = s.icon;
                  return (
                    <Link key={s.l} href={s.href} className="ov-stat">
                      <div className="ov-ic" style={{ background: s.bg, color: s.c }}><I size={20} /></div>
                      <div><div className="ov-n" style={{ color: s.n ? s.c : '#1d1b2c' }}>{s.n.toLocaleString()}</div><div className="ov-l">{s.l}</div></div>
                    </Link>
                  );
                })}
              </div>
              <div className="ov-grid">
                <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
                  <div className="ov-card">
                    <h3>Marketplaces</h3>
                    <div className="ov-mk">
                      {o.marketplaces.length === 0 && <p className="status-line" style={{ margin: 0 }}>No marketplace connected yet — add one under Connections.</p>}
                      {o.marketplaces.map((m, i) => (
                        <div key={m.key} className="ov-m" style={{ ['--c' as string]: palette[i % palette.length] }}>
                          <div className="t">{m.name}</div>
                          <div className="k"><span>Waiting to list</span><b>{m.pending}</b></div>
                          <div className="k"><span>Blocked</span><b style={{ color: m.blocked ? '#b42318' : undefined }}>{m.blocked}</b></div>
                          <div className="k"><span>Image changes</span><b>{m.images}</b></div>
                          <div className="k"><span>Ready to send</span><b style={{ color: m.ready ? '#059669' : undefined }}>{m.ready}</b></div>
                          <div className="links">
                            <Link href={`/queue?channel=${m.key}`}>Queue</Link>
                            <Link href={`/images?channel=${m.key}`}>Images</Link>
                            <Link href={`/results?channel=${m.key}`}>Send</Link>
                            <Link href={`/catalog?channel=${m.key}`}>Products</Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="ov-card">
                    <h3>Recent sends <Link href="/results" style={linkStyle}>All <ArrowRight size={12} /></Link></h3>
                    {o.recent.length === 0 ? <p className="status-line" style={{ padding: '14px 18px', margin: 0 }}>Nothing sent yet.</p> : o.recent.map((r) => {
                      const p = sendPill(r);
                      return (
                        <div key={r.id} className="ov-li">
                          <span style={{ width: 90, flex: 'none', fontWeight: 600, textTransform: 'capitalize' }}>{r.channelKey}</span>
                          <span style={{ flex: 1, color: '#4a4760' }}>{r.rowCount} rows · {new Date(r.sentAt).toLocaleString()}</span>
                          <span className="ov-pill" style={{ background: p.bg, color: p.fg }}>{p.t}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
                  <div className="ov-card">
                    <h3><Package size={14} color="#4b3fb3" /> Nordstrom</h3>
                    <div style={{ padding: '14px 18px', fontSize: 12.5, color: '#4a4760', lineHeight: 1.6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span className={`dot ${o.pull.lastOk === false ? 'fail' : o.pull.enabled ? 'ok' : ''}`} />
                        <b style={{ color: '#1d1b2c' }}>API pull {o.pull.enabled ? 'on' : 'off'}</b>
                      </div>
                      {o.pull.lastRunAt ? <>{ago(o.now - new Date(o.pull.lastRunAt).getTime())} — {o.pull.lastResult}</> : 'Not run yet.'}
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        <Link className="filter" href="/nordstrom">Edit products</Link>
                        <Link className="filter" href="/pulls">Pull history</Link>
                      </div>
                    </div>
                  </div>
                  <div className="ov-card">
                    <h3>Background jobs</h3>
                    {JOBS.map(([k, label, every]) => {
                      const last = o.beats[k];
                      const alive = !!last && o.now - last < every * 2.5;
                      return (
                        <div key={k} className="ov-li">
                          <span className={`dot ${alive ? 'ok' : 'fail'}`} style={{ marginTop: 4 }} />
                          <span style={{ flex: 1 }}>{label}</span>
                          <span style={{ color: '#8a879c' }}>{last ? ago(o.now - last) : 'not yet'}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="ov-card">
                    <h3>Recent activity <Link href="/logs" style={linkStyle}>Logs <ArrowRight size={12} /></Link></h3>
                    {o.logs.map((l) => (
                      <div key={l.id} className="ov-li">
                        <span className="ov-pill" style={{ background: l.level === 'error' ? '#fde8e6' : l.level === 'warn' ? '#fdf1dc' : '#eef1f5', color: l.level === 'error' ? '#b42318' : l.level === 'warn' ? '#8a5a00' : '#3d4a5c' }}>{l.kind}</span>
                        <span style={{ flex: 1, color: '#2d2a40', wordBreak: 'break-word' }}>{l.message}<div style={{ color: '#9a97ab', fontSize: 11, marginTop: 2 }}>{l.actor ?? 'system'} · {ago(o.now - new Date(l.at).getTime())}</div></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
