'use client';

import { useEffect, useRef, useState } from 'react';
import { loadBest, saveBest, useWidth } from './util';

const H = 320;
const GOOD = ['\u{1F460}', '\u{1F45F}', '\u{1F97F}', '\u{1F462}', '\u{1F461}'];
const BAD = '\u{1F4A3}';
type It = { x: number; y: number; v: number; e: string; bad: boolean };
type S = { bx: number; target: number; items: It[]; lives: number; score: number; next: number };
const fresh = (w: number): S => ({ bx: w / 2, target: w / 2, items: [], lives: 3, score: 0, next: 30 });

export default function CatchShoes() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const w = useWidth(wrap);
  const wRef = useRef(w); wRef.current = w;
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const phaseRef = useRef(phase);
  const bestRef = useRef(0);
  const s = useRef<S>(fresh(320));
  useEffect(() => { bestRef.current = loadBest('catch'); s.current = fresh(wRef.current); }, []);

  const start = () => { s.current = fresh(wRef.current); phaseRef.current = 'play'; setPhase('play'); };
  const aim = (clientX: number) => { const r = cv.current?.getBoundingClientRect(); if (r) s.current.target = clientX - r.left; };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') { e.preventDefault(); s.current.target -= 40; }
      if (e.code === 'ArrowRight') { e.preventDefault(); s.current.target += 40; }
      if (e.code === 'Space' && phaseRef.current !== 'play') { e.preventDefault(); start(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    let raf = 0, prev = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const W = wRef.current, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (document.hidden) { prev = now; return; }
      const dt = Math.min(2.5, (now - prev) / 16.67); prev = now;
      const st = s.current;
      st.target = Math.max(40, Math.min(W - 40, st.target));
      st.bx += (st.target - st.bx) * Math.min(1, 0.25 * dt);
      if (phaseRef.current === 'play') {
        st.next -= dt;
        if (st.next <= 0) {
          const bad = Math.random() < 0.18;
          st.items.push({ x: 24 + Math.random() * (W - 48), y: -20, v: 2.2 + Math.random() * 1.5 + st.score * 0.05, e: bad ? BAD : GOOD[Math.floor(Math.random() * GOOD.length)], bad });
          st.next = Math.max(14, 42 - st.score * 0.6);
        }
        for (const it of st.items) it.y += it.v * dt;
        const keep: It[] = [];
        for (const it of st.items) {
          const caught = it.y > H - 58 && it.y < H - 22 && Math.abs(it.x - st.bx) < 42;
          if (caught) { if (it.bad) st.lives--; else st.score++; continue; }
          if (it.y > H + 20) { if (!it.bad) st.lives--; continue; }
          keep.push(it);
        }
        st.items = keep;
        if (st.lives <= 0) {
          phaseRef.current = 'over'; setPhase('over');
          if (st.score > bestRef.current) { bestRef.current = st.score; saveBest('catch', st.score); }
        }
      }
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#fff1f2'); bg.addColorStop(1, '#fef3c7');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '30px sans-serif';
      for (const it of st.items) ctx.fillText(it.e, it.x, it.y);
      const g = ctx.createLinearGradient(st.bx - 44, 0, st.bx + 44, 0);
      g.addColorStop(0, '#6d5ce8'); g.addColorStop(1, '#3b82f6');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(st.bx - 44, H - 34, 88, 22, 8); ctx.fill();
      ctx.fillStyle = '#1f2937'; ctx.font = '600 13px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`Caught ${st.score}   Best ${bestRef.current}`, 12, 22);
      ctx.textAlign = 'right'; ctx.fillStyle = '#e11d48'; ctx.fillText('\u2665 '.repeat(Math.max(0, st.lives)).trim(), W - 12, 22);
      if (phaseRef.current !== 'play') {
        ctx.fillStyle = 'rgba(17, 24, 39, 0.5)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 18px Inter, sans-serif';
        ctx.fillText(phaseRef.current === 'over' ? `Game over — ${st.score} caught. Tap to play` : 'Tap to start', W / 2, H / 2);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div>
      <div className="g-stats"><span>Catch the shoes, avoid the bombs. Drag, move the mouse, or use the arrow keys.</span></div>
      <div ref={wrap} style={{ width: '100%' }}>
        <canvas ref={cv}
          onPointerDown={(e) => { e.preventDefault(); if (phaseRef.current !== 'play') start(); aim(e.clientX); }}
          onPointerMove={(e) => aim(e.clientX)}
          style={{ display: 'block', borderRadius: 12, touchAction: 'none', cursor: 'pointer', maxWidth: '100%' }} />
      </div>
      {phase === 'over' && <div className="g-win">Nice catching!</div>}
    </div>
  );
}
