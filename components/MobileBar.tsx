'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, ArrowLeft } from 'lucide-react';

const mobileCss = `
.mbar, .rl-scrim, .mback { display: none; }
@media (max-width: 900px) {
  html, body { overflow-x: hidden; }
  .shell { display: block !important; height: auto !important; min-height: 100vh; }
  .mbar { display: flex; position: sticky; top: 0; z-index: 40; align-items: center; gap: 10px; padding: 10px 14px; padding-top: calc(10px + env(safe-area-inset-top)); background: rgba(251,251,251,0.94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid var(--rule); }
  .mbtn { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--rule); background: #fff; border-radius: 8px; padding: 6px 8px; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; }
  .mbar .mt { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
  .rl { position: fixed !important; top: 0; bottom: 0; left: 0; width: 280px !important; max-width: 86vw; z-index: 60; transform: translateX(-100%); transition: transform 0.22s ease; box-shadow: 0 0 40px rgba(0,0,0,0.15); }
  body.nav-open .rl { transform: none; }
  body.nav-open .rl-scrim { display: block; position: fixed; inset: 0; background: rgba(10,10,10,0.35); z-index: 55; }
  .list, main.shell > section { width: auto !important; max-width: 100vw; }
  .list { height: auto !important; min-height: calc(100vh - 56px); border-right: 0 !important; }
  .rows { overflow: visible !important; }
  .row { display: flex !important; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 12px 14px !important; }
  .row .row-main { flex: 1 1 calc(100% - 70px); min-width: 0; }
  .list-head { flex-wrap: wrap; height: auto !important; gap: 8px; padding: 10px 14px !important; }
  .list-head .spacer { display: none; }
  .filters { flex-wrap: wrap; }
  .detail { display: none !important; }
  body.detail-open .detail { display: flex !important; flex-direction: column; position: fixed; left: 0; right: 0; bottom: 0; top: calc(53px + env(safe-area-inset-top)); z-index: 45; background: var(--paper); overflow-y: auto; width: auto !important; border-left: 0 !important; }
  body.detail-open .mback { display: inline-flex; }
  .actions { position: sticky; bottom: 0; background: var(--paper); flex-wrap: wrap; padding-bottom: calc(10px + env(safe-area-inset-bottom)) !important; }
  table { display: block; overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch; }
  div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
  .uc-cards { grid-template-columns: 1fr !important; }
  .rs-wrap, .pl-wrap, .lg-wrap, .uc-wrap { padding: 16px 14px 40px !important; }
  .rs-ready { flex-direction: column; align-items: stretch !important; }
  .lg-jobs { grid-template-columns: 1fr 1fr !important; }
  .pgbar { justify-content: center; }
  .pgbar .info { width: 100%; text-align: center; margin: 0 0 4px !important; }
  main.shell > section[style*="max-width"] { max-width: none !important; padding: 18px 14px !important; }
}
`;

export default function MobileBar() {
  const path = usePathname();
  useEffect(() => { document.body.classList.remove('nav-open', 'detail-open'); }, [path]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!window.matchMedia('(max-width: 900px)').matches) return;
      const t = e.target as Element;
      if (t.closest('.rl a')) { document.body.classList.remove('nav-open'); return; }
      if (t.closest('.row') && !t.closest('input, button, a, select, label') && document.querySelector('.detail')) document.body.classList.add('detail-open');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <>
      <style>{mobileCss}</style>
      <div className="mbar">
        <button className="mbtn" aria-label="Open menu" onClick={() => document.body.classList.add('nav-open')}><Menu size={18} /></button>
        <button className="mbtn mback" onClick={() => document.body.classList.remove('detail-open')}><ArrowLeft size={16} /> Back</button>
        <span className="mt">Catalog Sync</span>
      </div>
      <div className="rl-scrim" onClick={() => document.body.classList.remove('nav-open')} />
    </>
  );
}
