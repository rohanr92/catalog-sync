'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, ArrowLeft } from 'lucide-react';

const mobileCss = `
.mbar, .rl-scrim { display: none; }
@media (max-width: 900px) {
  /* The whole page scrolls like a normal website on a phone. */
  html, body { height: auto !important; min-height: 100% !important; overflow-x: hidden !important; overflow-y: auto !important; }
  main, .shell, .list, .rows, main.shell > section, main.shell > div { height: auto !important; max-height: none !important; overflow: visible !important; }
  .shell { display: block !important; min-height: 100vh; }
  main.shell > section, .list { width: auto !important; max-width: 100vw !important; border-right: 0 !important; }

  /* Top bar and slide-in menu */
  .mbar { display: flex; position: sticky; top: 0; z-index: 40; align-items: center; gap: 10px; padding: 10px 14px; padding-top: calc(10px + env(safe-area-inset-top)); background: rgba(251,251,251,0.95); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid var(--rule); }
  .mbtn { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--rule); background: #fff; border-radius: 8px; padding: 6px 8px; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; }
  .mbtn.mback { display: none; }
  body.detail-open .mbtn.mback { display: inline-flex; }
  .mbar .mt { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
  .rl { position: fixed !important; top: 0; bottom: 0; left: 0; width: 280px !important; max-width: 86vw; height: 100vh !important; overflow-y: auto !important; z-index: 60; transform: translateX(-100%); transition: transform 0.22s ease; box-shadow: 0 0 40px rgba(0,0,0,0.15); }
  body.nav-open { overflow: hidden !important; }
  body.nav-open .rl { transform: none; }
  body.nav-open .rl-scrim { display: block; position: fixed; inset: 0; background: rgba(10,10,10,0.35); z-index: 55; }

  /* List headers */
  .list-head { flex-wrap: wrap; height: auto !important; min-height: 0 !important; gap: 8px; padding: 12px 14px !important; }
  .list-head .spacer { display: none; }
  .list-head input[type="text"], .list-head input:not([type]), .list-head input[placeholder] { width: 100% !important; max-width: none !important; box-sizing: border-box; }
  .filters { flex-wrap: wrap; }

  /* Rows: natural height, text wraps instead of overlapping */
  .row { display: flex !important; flex-wrap: wrap; align-items: flex-start; gap: 4px 10px; height: auto !important; min-height: 0 !important; padding: 12px 14px !important; }
  .row > * { min-width: 0; }
  .row .row-thumb { flex: none; }
  .row .row-main { flex: 1 1 calc(100% - 70px); }
  .row .row-title, .row .row-id { display: inline; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; }
  .row > .row-kind, .row > span:not(.row-main) { font-size: 12px; }

  /* Detail opens full-screen over the list */
  .detail { display: none !important; }
  body.detail-open .detail { display: flex !important; flex-direction: column; position: fixed; left: 0; right: 0; bottom: 0; top: calc(53px + env(safe-area-inset-top)); z-index: 45; background: var(--paper); overflow-y: auto !important; height: auto !important; width: auto !important; border-left: 0 !important; }
  body.detail-open { overflow: hidden !important; }
  .detail-body { overflow: visible !important; height: auto !important; }
  .actions { position: sticky; bottom: 0; background: var(--paper); flex-wrap: wrap; padding-bottom: calc(10px + env(safe-area-inset-bottom)) !important; }
  .imgs { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }

  /* Tables scroll sideways inside their box; forms stack */
  table { display: block; overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch; }
  div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
  .uc-cards { grid-template-columns: 1fr !important; }
  .lg-jobs { grid-template-columns: 1fr 1fr !important; }
  .rs-wrap, .pl-wrap, .lg-wrap, .uc-wrap { padding: 16px 14px 40px !important; min-height: 0 !important; }
  .rs-ready { flex-direction: column; align-items: stretch !important; }
  main.shell > section[style*="max-width"] { max-width: none !important; padding: 18px 14px !important; }

  /* Pager */
  .pgbar { justify-content: center; }
  .pgbar .info { width: 100%; text-align: center; margin: 0 0 4px !important; }
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
      if (t.closest('.row') && !t.closest('input, button, a, select, label') && document.querySelector('.detail')) {
        document.body.classList.add('detail-open');
        document.querySelector('.detail')?.scrollTo({ top: 0 });
      }
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
