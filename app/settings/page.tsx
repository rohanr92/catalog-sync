'use client';

import { useEffect, useState } from 'react';
import Rail from "@/components/Shell";
import ShopifyCard from "@/components/ShopifyCard";
import ImageWatchCard from "@/components/ImageWatchCard";
import NordstromPullCard from "@/components/NordstromPullCard";

const names: Record<string, string> = {
  nordstrom: 'Nordstrom', macys: "Macy's", kohls: "Kohl's", jcpenney: 'JCPenney', debenhams: 'Debenhams', targetplus: 'Target Plus',
};

interface Conn {
  channelKey: string; enabled: boolean; apiUrl: string; hasKey: boolean; apiKey?: string;
  lastTestOk: boolean | null; lastTestAt: string | null; lastTestMsg: string | null;
}

function ago(iso: string | null) {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export default function SettingsPage() {
  const [conns, setConns] = useState<Conn[]>([]);
  const [match, setMatch] = useState({ byUpc: true, bySku: false });
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((j) => {
      setConns(j.connections);
      setMatch(j.match);
      j.connections.filter((c: Conn) => c.hasKey && c.apiUrl).forEach((c: Conn) => test(c, true));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(key: string, patch: Partial<Conn>) {
    setConns((prev) => prev.map((c) => (c.channelKey === key ? { ...c, ...patch } : c)));
  }

  function mark(key: string, on: boolean) {
    setBusy((b) => { const n = new Set(b); on ? n.add(key) : n.delete(key); return n; });
  }

  async function save(c: Conn) {
    mark(c.channelKey, true);
    await fetch('/api/settings', { method: 'POST', body: JSON.stringify({ connection: c }) });
    update(c.channelKey, { apiKey: '', hasKey: c.hasKey || Boolean(c.apiKey) });
    mark(c.channelKey, false);
    await test({ ...c, apiKey: '' }, true);
  }

  async function test(c: Conn, silent = false) {
    mark(c.channelKey, true);
    const res = await fetch('/api/settings/test', {
      method: 'POST',
      body: JSON.stringify({ channelKey: c.channelKey, apiUrl: c.apiUrl, apiKey: silent ? '' : c.apiKey }),
    });
    const j = await res.json();
    update(c.channelKey, { lastTestOk: j.ok, lastTestMsg: j.message, lastTestAt: j.testedAt });
    mark(c.channelKey, false);
  }

  async function saveMatch(next: typeof match) {
    setMatch(next);
    await fetch('/api/settings', { method: 'POST', body: JSON.stringify({ match: next }) });
  }

  const field = { width: '100%', padding: '8px 10px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: 'var(--paper)' } as const;
  const label = { display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 } as const;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section style={{ overflowY: 'auto', padding: '28px 32px', maxWidth: 820 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 4px' }}>Connections</h2>
        <p style={{ color: 'var(--ink-2)', margin: '0 0 28px', fontSize: 13 }}>
          Every saved connection is re-checked when this page opens.
        </p>

        <ShopifyCard />
        <NordstromPullCard />
        <ImageWatchCard />

        <div style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: 16, marginBottom: 28 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 500 }}>How products are matched across marketplaces</p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
            <input type="checkbox" checked={match.byUpc} onChange={(e) => saveMatch({ ...match, byUpc: e.target.checked })} /> By UPC / EAN
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={match.bySku} onChange={(e) => saveMatch({ ...match, bySku: e.target.checked })} /> By SKU
          </label>
        </div>

        {conns.map((c) => {
          const isBusy = busy.has(c.channelKey);
          const dot = isBusy ? 'busy' : c.lastTestOk === true ? 'ok' : c.lastTestOk === false ? 'fail' : '';
          return (
            <div key={c.channelKey} style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: 16, marginBottom: 12, opacity: c.enabled ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span className={`dot ${dot}`} />
                <span style={{ fontSize: 15, fontWeight: 600 }}>{names[c.channelKey]}</span>
                <span className={`status-line${c.lastTestOk === false ? ' fail' : ''}`} style={{ flex: 1 }}>
                  {isBusy ? 'Checking…' : c.lastTestMsg ? `${c.lastTestMsg} · ${ago(c.lastTestAt)}` : c.hasKey ? 'Not tested' : 'No API key'}
                </span>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={c.enabled} onChange={(e) => update(c.channelKey, { enabled: e.target.checked })} /> Enabled
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={label}>Mirakl API URL</label>
                  <input style={field} placeholder="https://xxx.mirakl.net" value={c.apiUrl} onChange={(e) => update(c.channelKey, { apiUrl: e.target.value })} />
                </div>
                <div>
                  <label style={label}>API key {c.hasKey && '(leave blank to keep)'}</label>
                  <input style={field} type="password" value={c.apiKey ?? ''} onChange={(e) => update(c.channelKey, { apiKey: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn" disabled={isBusy} onClick={() => save(c)}>Save</button>
                <button className="btn" disabled={isBusy} onClick={() => test(c)}>Test connection</button>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
