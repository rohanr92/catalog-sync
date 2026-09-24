import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'radial-gradient(900px 500px at 90% 110%, #e3f5ea 0%, transparent 55%), #f7f7f8' }}>
      <div style={{ maxWidth: 420, background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: '30px 28px', textAlign: 'center', boxShadow: '0 20px 60px rgba(20,20,40,0.08)' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden>🧭</div>
        <h1 style={{ fontSize: 19, margin: '0 0 6px' }}>This page doesn&apos;t exist</h1>
        <p style={{ fontSize: 13, color: '#6b6b6b', margin: '0 0 18px' }}>The address may be mistyped, or the page moved.</p>
        <Link className="btn primary" href="/home">Go to Overview</Link>
      </div>
    </div>
  );
}
