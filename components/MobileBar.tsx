'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, ArrowLeft } from 'lucide-react';

const BAR = 54;

const mobileCss = `
.mbar, .rl-scrim { display: none; }
@media (max-width: 900px) {
  /* Page scrolls like a normal website; the top bar stays fixed. */
  html, body { height: auto !important; min-height: 100% !important; overflow-x: hidden !important; overflow-y: auto !important; }
  html.cs-lock, html.cs-lock body { overflow: hidden !important; }
  body { padding-top: calc(${BAR}px + env(safe-area-inset-top)) !important; }
  main, .shell, .list, .rows, main.shell > section, main.shell > div { height: auto !important; max-height: none !important; overflow: visible !important; }
  .shell { display: block !important; min-height: calc(100dvh - ${BAR}px); }
  main.shell > section, .list { width: auto !important; max-width: 100vw !important; border-right: 0 !important; }

  .mbar { display: flex; position: fixed; top: 0; left: 0; right: 0; z-index: 70; height: ${BAR}px; box-sizing: border-box; align-items: center; gap: 10px; padding: 0 14px; padding-top: env(safe-area-inset-top); height: calc(${BAR}px + env(safe-area-inset-top)); background: rgba(251,251,251,0.96); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid var(--rule); }
  .mbtn { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--rule); background: #fff; border-radius: 8px; padding: 7px 10px; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; }
  .mbtn.mback { display: none; }
  body.detail-open .mbtn.mback { display: inline-flex; }
  body.detail-open .mbtn.mmenu { display: none; }
  .mbar .mt { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }

  .rl { position: fixed !important; top: 0; bottom: 0; left: 0; width: 280px !important; max-width: 86vw; height: 100dvh !important; overflow-y: auto !important; z-index: 90; transform: translateX(-100%); transition: transform 0.22s ease; box-shadow: 0 0 40px rgba(0,0,0,0.15); }
  body.nav-open .rl { transform: none; }
  body.nav-open .rl-scrim { display: block; position: fixed; inset: 0; background: rgba(10,10,10,0.35); z-index: 85; }

  /* List headers */
  .list-head { flex-wrap: wrap; height: auto !important; min-height: 0 !important; gap: 8px; padding: 12px 14px !important; }
  .list-head .spacer { display: none; }
  .list-head input { max-width: none !important; }
  .list-head input[placeholder] { width: 100% !important; box-sizing: border-box; }
  .filters { flex-wrap: wrap; }

  /* Rows: natural height, text wraps */
  .row { display: flex !important; flex-wrap: wrap; align-items: flex-start; gap: 4px 10px; height: auto !important; min-height: 0 !important; padding: 12px 14px !important; }
  .row > * { min-width: 0; }
  .row .row-thumb { flex: none; }
  .row .row-main { flex: 1 1 calc(100% - 70px); }
  .row .row-title, .row .row-id { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; word-break: break-word; }
  .row > span:not(.row-main) { font-size: 12px; }

  /* Product detail: full-screen panel under the top bar, own scroll, buttons pinned to the bottom */
  .detail { display: none !important; }
  body.detail-open .detail {
    display: block !important; position: fixed !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    top: calc(${BAR}px + env(safe-area-inset-top)) !important; height: calc(100dvh - ${BAR}px - env(safe-area-inset-top)) !important;
    width: 100vw !important; max-width: 100vw !important; z-index: 60; background: var(--paper); overflow-y: auto !important; overflow-x: hidden !important;
    border-left: 0 !important; transform: none !important;
  }
  body.detail-open .detail .detail-body { overflow: visible !important; height: auto !important; max-height: none !important; }
  body.detail-open .detail .actions { position: sticky !important; bottom: 0 !important; z-index: 2; background: var(--paper); flex-wrap: wrap; border-top: 1px solid var(--rule); padding: 10px 14px calc(10px + env(safe-area-inset-bottom)) !important; }
  body.detail-open .detail .actions .btn { flex: 1 1 auto; }
  .imgs { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }

  /* Pop-up editors (images, Preview sheet, Edit info): full-screen, header wraps */
  div[style*="position: fixed"][style*="inset: 0"] { align-items: stretch !important; justify-content: stretch !important; z-index: 100 !important; }
  div[style*="position: fixed"][style*="inset: 0"] > div { width: 100vw !important; max-width: 100vw !important; height: 100dvh !important; max-height: 100dvh !important; border-radius: 0 !important; }
  div[style*="position: fixed"][style*="inset: 0"] > div > header,
  div[style*="position: fixed"][style*="inset: 0"] > div > footer { flex-wrap: wrap !important; gap: 8px !important; padding: 12px 14px !important; padding-top: calc(12px + env(safe-area-inset-top)) !important; }
  div[style*="position: fixed"][style*="inset: 0"] > div > footer { padding-top: 12px !important; padding-bottom: calc(12px + env(safe-area-inset-bottom)) !important; }
  div[style*="position: fixed"][style*="inset: 0"] > div > header > div:first-child { flex: 1 1 100% !important; }
  div[style*="position: fixed"][style*="inset: 0"] > div > header .filters { flex: 1 1 100%; }

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

function set(cls: 'nav-open' | 'detail-open', on: boolean) {
  document.body.classList.toggle(cls, on);
  const locked = document.body.classList.contains('nav-open') || document.body.classList.contains('detail-open');
  document.documentElement.classList.toggle('cs-lock', locked);
}

export default function MobileBar() {
  const path = usePathname();
  useEffect(() => { set('nav-open', false); set('detail-open', false); }, [path]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!window.matchMedia('(max-width: 900px)').matches) return;
      const t = e.target as Element;
      if (t.closest('.rl a')) { set('nav-open', false); return; }
      if (t.closest('.row') && !t.closest('input, button, a, select, label') && document.querySelector('.detail')) {
        set('detail-open', true);
        requestAnimationFrame(() => document.querySelector('.detail')?.scrollTo({ top: 0 }));
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <>
      <style>{mobileCss}</style>
      <div className="mbar">
        <button className="mbtn mmenu" aria-label="Open menu" onClick={() => set('nav-open', true)}><Menu size={18} /></button>
        <button className="mbtn mback" onClick={() => set('detail-open', false)}><ArrowLeft size={16} /> Back</button>
        <span className="mt">Catalog Sync</span>
      </div>
      <div className="rl-scrim" onClick={() => set('nav-open', false)} />
    </>
  );
}
