'use client';

import { useEffect, useState } from 'react';

export default function ShopifyCard() {
  const [domain, setDomain] = useState('');
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [st, setSt] = useState<{ ok: boolean | null; msg: string | null }>({ ok: null, msg: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/shopify').then((r) => r.json()).then((j) => {
      setDomain(j.domain); setHasToken(j.hasToken); setSt({ ok: j.lastTestOk, msg: j.lastTestMsg });
      if (j.hasToken && j.domain) run(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(save: boolean) {
    setBusy(true);
    const j = await fetch('/api/shopify', { method: 'POST', body: JSON.stringify({ save, domain, token }) }).then((r) => r.json());
    setSt({ ok: j.ok, msg: j.message });
    if (save && token) { setHasToken(true); setToken(''); }
    setBusy(false);
  }

  const field = { width: '100%', padding: '8px 10px', border: '1px solid var(--rule-strong)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: 'var(--paper)' } as const;
  const label = { display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 } as const;
  const dot = busy ? 'busy' : st.ok === true ? 'ok' : st.ok === false ? 'fail' : '';

  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: 16, marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span className={`dot ${dot}`} />
        <span style={{ fontSize: 15, fontWeight: 600 }}>Shopify</span>
        <span className={`status-line${st.ok === false ? ' fail' : ''}`} style={{ flex: 1 }}>{busy ? 'Checking…' : st.msg ?? (hasToken ? 'Not tested' : 'Images are uploaded here to get links for every marketplace')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={label}>Store domain</label><input style={field} placeholder="your-store.myshopify.com" value={domain} onChange={(e) => setDomain(e.target.value)} /></div>
        <div><label style={label}>Admin API token {hasToken && '(leave blank to keep)'}</label><input style={field} type="password" placeholder="shpat_…" value={token} onChange={(e) => setToken(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={() => run(true)}>Save</button>
        <button className="btn" disabled={busy} onClick={() => run(false)}>Test connection</button>
      </div>
    </div>
  );
}
