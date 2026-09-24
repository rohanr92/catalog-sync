'use client';

import { useEffect, useMemo, useState } from 'react';

export const PER_PAGE = [15, 25, 40, 50, 100];

export interface Pager { total: number; page: number; pages: number; per: number; setPage: (n: number) => void; setPer: (n: number) => void }

// Pages any list on the client. resetKey: when it changes (tab, search, marketplace), go back to page 1.
export function usePaged<T>(items: T[], resetKey = ''): { pageItems: T[]; pager: Pager } {
  const [page, setPageRaw] = useState(1);
  const [per, setPerRaw] = useState(50);
  useEffect(() => { try { const s = Number(localStorage.getItem('cs-per-page')); if (PER_PAGE.includes(s)) setPerRaw(s); } catch { /* ignore */ } }, []);
  useEffect(() => { setPageRaw(1); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / per));
  const cur = Math.min(page, pages);
  const pageItems = useMemo(() => items.slice((cur - 1) * per, cur * per), [items, cur, per]);
  const toTop = () => document.querySelectorAll('.rows').forEach((el) => el.scrollTo({ top: 0 }));
  return {
    pageItems,
    pager: {
      total: items.length, page: cur, pages, per,
      setPage: (n) => { setPageRaw(Math.max(1, Math.min(pages, n))); toTop(); },
      setPer: (n) => { setPerRaw(n); setPageRaw(1); toTop(); try { localStorage.setItem('cs-per-page', String(n)); } catch { /* ignore */ } },
    },
  };
}

const css = `
.pgbar { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 16px; background: var(--paper); border-top: 1px solid var(--rule); font-size: 12px; box-shadow: 0 -4px 12px rgba(0,0,0,0.03); }
.pgbar .info { color: var(--ink-3); margin-right: auto; }
.pgbar button { min-width: 30px; height: 28px; padding: 0 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper); font: inherit; font-size: 12px; color: var(--ink-2); cursor: pointer; }
.pgbar button:hover:not(:disabled) { border-color: var(--ink-3); color: var(--ink); }
.pgbar button.on { background: #6d5ce8; border-color: #6d5ce8; color: #fff; font-weight: 600; }
.pgbar button:disabled { opacity: 0.4; cursor: default; }
.pgbar .gap { color: var(--ink-3); padding: 0 2px; }
.pgbar select { height: 28px; margin-left: 8px; padding: 0 6px; border: 1px solid var(--rule); border-radius: 6px; font: inherit; font-size: 12px; background: var(--paper); }
`;

export default function Pagination({ total, page, pages, per, setPage, setPer }: Pager) {
  if (!total) return null;
  const from = (page - 1) * per + 1, to = Math.min(total, page * per);
  const nums: (number | 'gap')[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== 'gap') nums.push('gap');
  }
  return (
    <div className="pgbar">
      <style>{css}</style>
      <span className="info">Showing {from}–{to} of {total}</span>
      <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
      {nums.map((n, i) => n === 'gap'
        ? <span key={`g${i}`} className="gap">…</span>
        : <button key={n} className={n === page ? 'on' : ''} onClick={() => setPage(n)}>{n}</button>)}
      <button disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
      <select value={per} onChange={(e) => setPer(Number(e.target.value))} aria-label="Rows per page">
        {PER_PAGE.map((n) => <option key={n} value={n}>{n} per page</option>)}
      </select>
    </div>
  );
}
