'use client';

import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'radial-gradient(900px 500px at 10% -10%, #ece9fd 0%, transparent 60%), #f7f7f8' }}>
      <div style={{ maxWidth: 440, background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: '30px 28px', textAlign: 'center', boxShadow: '0 20px 60px rgba(20,20,40,0.08)' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden>🛠️</div>
        <h1 style={{ fontSize: 19, margin: '0 0 6px' }}>Something went wrong on this page</h1>
        <p style={{ fontSize: 13, color: '#6b6b6b', margin: '0 0 18px' }}>Nothing was lost. Try again — if it keeps happening, check Logs.{error.digest ? ` (ref ${error.digest})` : ''}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => reset()}>Try again</button>
          <Link className="btn" href="/home">Go to Overview</Link>
        </div>
      </div>
    </div>
  );
}
