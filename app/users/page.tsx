'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';
import { postJson } from '@/lib/fetcher';

interface U { id: string; email: string; name: string; role: string; active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string }
const roleInfo: Record<string, { label: string; desc: string; bg: string; fg: string }> = {
  owner: { label: 'Owner', desc: 'Everything, including other owners', bg: '#ece9fd', fg: '#4b3fb3' },
  admin: { label: 'Admin', desc: 'Everything except owners — connections, keys, users', bg: '#e6effc', fg: '#1f5fbf' },
  member: { label: 'Member', desc: 'Works the queue: approve, edit, send', bg: '#e3f5ea', fg: '#16713f' },
  viewer: { label: 'Viewer', desc: 'Can look, cannot change anything', bg: '#efefef', fg: '#4a4a4a' },
};

export default function UsersPage() {
  const { data, mutate } = useSWR<{ users: U[]; me: string; myRole: string }>('/api/users');
  const [form, setForm] = useState({ name: '', email: '', role: 'member' });
  const [secret, setSecret] = useState<{ who: string; pw: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(body: Record<string, unknown>, done?: string) {
    setBusy(true);
    try {
      const j = await postJson('/api/users', body);
      if (j.tempPassword) setSecret({ who: j.user?.email ?? data?.users.find((u) => u.id === body.id)?.email ?? '', pw: j.tempPassword });
      if (done) toast.success(done);
      mutate();
      return j;
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  const roles = data?.myRole === 'owner' ? ['owner', 'admin', 'member', 'viewer'] : ['admin', 'member', 'viewer'];
  const field = { padding: '8px 10px', border: '1px solid var(--rule-strong)', borderRadius: 6, fontFamily: 'inherit', fontSize: 13, background: 'var(--paper)' } as const;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section style={{ overflowY: 'auto', padding: '28px 32px', background: '#f5f5f5', minWidth: 0 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Users</h2>
          <p className="status-line" style={{ marginBottom: 20 }}>Everyone who can open Catalog Sync. Each action they take is recorded under their name in Logs.</p>

          <form onSubmit={async (e) => { e.preventDefault(); const j = await act({ action: 'create', ...form }, 'User added'); if (j) setForm({ name: '', email: '', role: 'member' }); }}
            style={{ background: '#fff', border: '1px solid #e4e4e4', borderRadius: 10, padding: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <span style={{ fontWeight: 600, fontSize: 14, marginRight: 6 }}>Add someone</span>
            <input style={{ ...field, width: 180 }} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input style={{ ...field, width: 240 }} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <select style={field} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roles.map((r) => <option key={r} value={r}>{roleInfo[r].label} — {roleInfo[r].desc}</option>)}
            </select>
            <button className="btn primary" style={{ flex: 'none' }} disabled={busy}>Add user</button>
          </form>

          {secret && (
            <div style={{ background: '#fff8e1', border: '1px solid #f0d58a', borderRadius: 10, padding: 16, marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260, fontSize: 13 }}>
                One-time password for <b>{secret.who}</b>. Share it privately — it won&apos;t be shown again, and they must change it at first sign-in.
              </div>
              <code style={{ fontFamily: 'var(--mono)', fontSize: 15, padding: '6px 10px', background: '#fff', border: '1px solid #e4e4e4', borderRadius: 6 }}>{secret.pw}</code>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(secret.pw); toast.success('Copied'); }}>Copy</button>
              <button className="btn" onClick={() => setSecret(null)}>Done</button>
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #e4e4e4', borderRadius: 10, overflow: 'hidden' }}>
            {!data ? <div className="loading-block"><Spinner /> Loading…</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#fafafa' }}>{['Person', 'Role', 'Status', 'Last sign-in', ''].map((h) => <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontWeight: 500, color: '#4a4a4a', borderBottom: '1px solid #e4e4e4' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.users.map((u) => {
                    const ri = roleInfo[u.role] ?? roleInfo.viewer;
                    const isMe = u.id === data.me;
                    const locked = u.role === 'owner' && data.myRole !== 'owner';
                    return (
                      <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f1f1' }}>
                          <div style={{ fontWeight: 600 }}>{u.name}{isMe && <span className="status-line"> · you</span>}</div>
                          <div className="status-line">{u.email}</div>
                        </td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f1f1' }}>
                          {locked || isMe ? <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: ri.bg, color: ri.fg }}>{ri.label}</span> : (
                            <select style={field} value={u.role} disabled={busy} onChange={(e) => act({ action: 'update', id: u.id, role: e.target.value }, 'Role changed')}>
                              {roles.map((r) => <option key={r} value={r}>{roleInfo[r].label}</option>)}
                            </select>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f1f1' }}>{!u.active ? 'Disabled' : u.mustChangePassword ? 'Waiting for first sign-in' : 'Active'}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f1f1', color: '#4a4a4a' }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f1f1', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!locked && !isMe && <>
                            <button className="filter" disabled={busy} onClick={() => act({ action: 'reset', id: u.id }, 'Password reset')}>Reset password</button>{' '}
                            <button className="filter" disabled={busy} onClick={() => act({ action: 'update', id: u.id, active: !u.active }, u.active ? 'User disabled' : 'User enabled')}>{u.active ? 'Disable' : 'Enable'}</button>{' '}
                            <button className="filter" disabled={busy} onClick={() => confirm(`Delete ${u.name}? This cannot be undone.`) && act({ action: 'delete', id: u.id }, 'User deleted')}>Delete</button>
                          </>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
