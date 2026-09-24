'use client';

import { useEffect, useState, type RefObject } from 'react';

export const loadBest = (k: string) => { try { return Number(localStorage.getItem('cs-best-' + k)) || 0; } catch { return 0; } };
export const saveBest = (k: string, v: number) => { try { localStorage.setItem('cs-best-' + k, String(v)); } catch { /* ignore */ } };
export const rand = (n: number) => Math.floor(Math.random() * n);

// Width of the game area, following the screen size.
export function useWidth(ref: RefObject<HTMLElement | null>, max = 760) {
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setW(Math.max(240, Math.min(max, el.clientWidth)));
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, max]);
  return w;
}
