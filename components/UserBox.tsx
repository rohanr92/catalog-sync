'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { LogOut, UserCog, Users } from 'lucide-react';

export default function UserBox() {
  const { data: me } = useSWR<{ name: string; email: string; role: string }>('/api/auth/me');
  const initials = (me?.name ?? '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  async function signOut() { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }
  const link = { display: 'flex', alignItems: 'center', gap: 7, padding: '5px 6px', borderRadius: 6, color: 'var(--ink-2)', textDecoration: 'none', fontSize: 12.5 } as const;
  return (
    <div style={{ marginTop: 'auto', borderTop: '1px solid var(--rule)', padding: '12px 12px 14px' }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #6d5ce8, #3b82f6)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.name ?? '…'}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'capitalize' }}>{me?.role ?? ''}</div>
        </div>
      </div>
      <Link href="/account" style={link}><UserCog size={14} /> Account</Link>
      {me && ['owner', 'admin'].includes(me.role) && <Link href="/users" style={link}><Users size={14} /> Users</Link>}
      <button onClick={signOut} style={{ ...link, border: 0, background: 'none', cursor: 'pointer', width: '100%', font: 'inherit', fontSize: 12.5 }}><LogOut size={14} /> Sign out</button>
    </div>
  );
}
