'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Spinner from '@/components/Spinner';

const css = `
.lg-bg { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: radial-gradient(1200px 600px at 10% -10%, #ece9fd 0%, transparent 60%), radial-gradient(900px 500px at 110% 110%, #e3f5ea 0%, transparent 55%), #f7f7f8; }
.lg-card { width: 100%; max-width: 400px; background: #fff; border: 1px solid #e6e6e6; border-radius: 14px; padding: 32px 30px; box-shadow: 0 20px 60px rgba(20, 20, 40, 0.08); }
.lg-logo { width: 44px; height: 44px; border-radius: 11px; background: linear-gradient(135deg, #6d5ce8 0%, #3b82f6 55%, #10b981 100%); color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(109, 92, 232, 0.35); margin-bottom: 18px; }
.lg-card h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
.lg-card p { font-size: 13px; color: #6b6b6b; margin: 0 0 22px; }
.lg-card label { display: block; font-size: 12px; color: #6b6b6b; margin: 0 0 5px; }
.lg-card input { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #d6d6d6; border-radius: 8px; font: inherit; font-size: 14px; margin-bottom: 14px; outline: none; }
.lg-card input:focus { border-color: #6d5ce8; box-shadow: 0 0 0 3px rgba(109, 92, 232, 0.15); }
.lg-btn { width: 100%; padding: 12px; border: 0; border-radius: 8px; background: #0a0a0a; color: #fff; font: inherit; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; gap: 8px; align-items: center; justify-content: center; }
.lg-btn:disabled { opacity: 0.6; cursor: default; }
.lg-err { background: #fde8e6; color: #b42318; font-size: 13px; padding: 9px 12px; border-radius: 8px; margin-bottom: 14px; }
.lg-foot { font-size: 11px; color: #9a9a9a; text-align: center; margin-top: 18px; }
`;

function LoginInner() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/';
  const [setup, setSetup] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch('/api/auth/status').then((r) => r.json()).then((j) => setSetup(!!j.needsSetup)).catch(() => setSetup(false)); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (setup && password !== confirm) { setError('The two passwords do not match'); return; }
    setBusy(true);
    try {
      const res = await fetch(setup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setup ? { name, email, password } : { email, password }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Sign-in failed');
      router.replace(j.mustChangePassword ? '/account?first=1' : next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <div className="lg-bg">
      <style>{css}</style>
      <form className="lg-card" onSubmit={submit}>
        <div className="lg-logo">CS</div>
        {setup === null ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><Spinner /> Loading…</div> : (
          <>
            <h1>{setup ? 'Create the owner account' : 'Sign in to Catalog Sync'}</h1>
            <p>{setup ? 'First time here. This account can add the rest of your team.' : 'Menina Step · Nordstrom → marketplaces'}</p>
            {error && <div className="lg-err">{error}</div>}
            {setup && <><label>Your name</label><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></>}
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
            <label>Password{setup ? ' — at least 10 characters, with a number' : ''}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} required />
            {setup && <><label>Repeat password</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></>}
            <button className="lg-btn" disabled={busy}>{busy && <Spinner />}{setup ? 'Create account' : 'Sign in'}</button>
            <div className="lg-foot">Five wrong attempts lock sign-in for 15 minutes.</div>
          </>
        )}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginInner /></Suspense>;
}
