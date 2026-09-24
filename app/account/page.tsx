'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import { postJson } from '@/lib/fetcher';

function AccountInner() {
  const first = useSearchParams().get('first') === '1';
  const { data: me } = useSWR<{ name: string; email: string; role: string }>('/api/auth/me');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { toast.error('The two new passwords do not match'); return; }
    setBusy(true);
    try { await postJson('/api/auth/password', { current, next }); toast.success('Password changed'); setCurrent(''); setNext(''); setConfirm(''); if (first) window.location.href = '/'; }
    catch (err) { toast.error((err as Error).message); }
    setBusy(false);
  }

  const field = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--rule-strong)', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, marginBottom: 14, background: 'var(--paper)' } as const;
  return (
    <section style={{ overflowY: 'auto', padding: '28px 32px', maxWidth: 520 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Your account</h2>
      <p className="status-line" style={{ marginBottom: 24 }}>{me ? `${me.name} · ${me.email} · ${me.role}` : ''}</p>
      {first && <p className="notice" style={{ marginBottom: 20 }}>You signed in with a temporary password. Choose your own to continue.</p>}
      <form onSubmit={save} style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Change password</div>
        <label className="status-line">{first ? 'Temporary password' : 'Current password'}</label>
        <input type="password" style={field} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        <label className="status-line">New password — at least 10 characters, with a number</label>
        <input type="password" style={field} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        <label className="status-line">Repeat new password</label>
        <input type="password" style={field} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        <button className="btn primary" style={{ flex: 'none' }} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        <p className="status-line" style={{ marginTop: 12 }}>Changing your password signs you out everywhere else.</p>
      </form>
    </section>
  );
}

export default function AccountPage() {
  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <Suspense fallback={null}><AccountInner /></Suspense>
    </main>
  );
}
