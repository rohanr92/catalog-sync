'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

export const loadBest = (k: string) => { try { return Number(localStorage.getItem('cs-best-' + k)) || 0; } catch { return 0; } };
export const saveBest = (k: string, v: number) => { try { localStorage.setItem('cs-best-' + k, String(v)); } catch { /* ignore */ } };
export const rand = (n: number) => Math.floor(Math.random() * n);
export const canvasStyle = { display: 'block', borderRadius: 12, touchAction: 'none', cursor: 'pointer', maxWidth: '100%' } as const;

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

// One animation loop per game: pauses when the tab is hidden, stops when the game closes.
export function useCanvasLoop(cv: RefObject<HTMLCanvasElement | null>, width: number, H: number, frame: (ctx: CanvasRenderingContext2D, W: number, dt: number) => void) {
  const f = useRef(frame); f.current = frame;
  const w = useRef(width); w.current = width;
  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    let raf = 0, prev = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const W = w.current, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (document.hidden) { prev = now; return; }
      const dt = Math.min(2.5, (now - prev) / 16.67); prev = now;
      f.current(ctx, W, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cv, H]);
}

export function overlay(ctx: CanvasRenderingContext2D, W: number, H: number, text: string) {
  ctx.fillStyle = 'rgba(17, 24, 39, 0.5)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 17px Inter, sans-serif';
  ctx.fillText(text, W / 2, H / 2); ctx.textBaseline = 'alphabetic';
}

export function useKeys(fn: (e: KeyboardEvent) => void) {
  const r = useRef(fn); r.current = fn;
  useEffect(() => {
    const h = (e: KeyboardEvent) => r.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}
