'use client';

import { useEffect, useRef, useState } from 'react';
import { loadBest, saveBest, useWidth } from './util';

const H = 240;
type Ob = { x: number; w: number; h: number; k: number };
type S = { y: number; vy: number; obs: Ob[]; dist: number; next: number; clouds: { x: number; y: number }[] };
const fresh = (): S => ({ y: 0, vy: 0, obs: [], dist: 0, next: 420, clouds: [{ x: 120, y: 40 }, { x: 400, y: 64 }, { x: 650, y: 30 }] });

export default function BikeRunner() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const w = useWidth(wrap);
  const wRef = useRef(w); wRef.current = w;
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const phaseRef = useRef(phase);
  const [last, setLast] = useState(0);
  const bestRef = useRef(0);
  const s = useRef<S>(fresh());
  useEffect(() => { bestRef.current = loadBest('bike'); }, []);

  const action = () => {
    if (phaseRef.current !== 'play') { s.current = fresh(); phaseRef.current = 'play'; setPhase('play'); return; }
    if (s.current.y <= 0.5) s.current.vy = 12.5;
  };
  const actionRef = useRef(action); actionRef.current = action;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); actionRef.current(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    let raf = 0, prev = performance.now();

    const draw = (W: number, st: S, ground: number, bx: number) => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#c7d7fe'); sky.addColorStop(1, '#eef2ff');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(W - 60, 42, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const cl of st.clouds) { ctx.beginPath(); ctx.arc(cl.x, cl.y, 13, 0, 7); ctx.arc(cl.x + 15, cl.y - 6, 16, 0, 7); ctx.arc(cl.x + 32, cl.y, 12, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#a7f3d0'; ctx.beginPath(); ctx.moveTo(0, ground);
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, ground - 30 - Math.sin((x + st.dist * 0.3) / 70) * 14);
      ctx.lineTo(W, ground); ctx.fill();
      ctx.fillStyle = '#4b5563'; ctx.fillRect(0, ground, W, H - ground);
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 3; ctx.setLineDash([18, 16]); ctx.lineDashOffset = st.dist % 34;
      ctx.beginPath(); ctx.moveTo(0, ground + 20); ctx.lineTo(W, ground + 20); ctx.stroke(); ctx.setLineDash([]);
      for (const o of st.obs) {
        if (o.k === 0) {
          ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(o.x, ground); ctx.lineTo(o.x + o.w / 2, ground - o.h); ctx.lineTo(o.x + o.w, ground); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillRect(o.x + o.w * 0.3, ground - o.h * 0.55, o.w * 0.4, 4);
        } else {
          ctx.fillStyle = '#b45309'; ctx.fillRect(o.x, ground - o.h, o.w, o.h);
          ctx.fillStyle = '#92400e'; ctx.fillRect(o.x - 2, ground - o.h, o.w + 4, 5);
        }
      }
      const by = ground - st.y, a = st.dist / 12;
      const wheel = (x: number, y: number) => {
        ctx.strokeStyle = '#111827'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) { const t = a + (i * Math.PI) / 4; ctx.beginPath(); ctx.moveTo(x - Math.cos(t) * 11, y - Math.sin(t) * 11); ctx.lineTo(x + Math.cos(t) * 11, y + Math.sin(t) * 11); ctx.stroke(); }
      };
      wheel(bx - 14, by - 12); wheel(bx + 20, by - 12);
      ctx.strokeStyle = '#6d5ce8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx - 14, by - 12); ctx.lineTo(bx - 2, by - 30); ctx.lineTo(bx + 16, by - 32); ctx.lineTo(bx + 20, by - 12); ctx.moveTo(bx - 2, by - 30); ctx.lineTo(bx + 2, by - 12); ctx.lineTo(bx - 14, by - 12); ctx.stroke();
      const px = bx + 2 + Math.cos(a) * 7, py = by - 12 + Math.sin(a) * 7;
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx - 2, by - 32); ctx.lineTo(bx + 8, by - 52); ctx.lineTo(bx + 16, by - 34); ctx.moveTo(bx - 2, by - 32); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(bx + 11, by - 60, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6d5ce8'; ctx.beginPath(); ctx.arc(bx + 11, by - 62, 8, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#1f2937'; ctx.font = '600 13px Inter, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`Score ${Math.floor(st.dist / 10)}   Best ${bestRef.current}`, W - 12, 20);
      if (phaseRef.current !== 'play') {
        ctx.fillStyle = 'rgba(17, 24, 39, 0.55)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 18px Inter, sans-serif';
        ctx.fillText(phaseRef.current === 'over' ? 'Crash! Tap to ride again' : 'Tap or press Space to ride', W / 2, H / 2);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const W = wRef.current, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (document.hidden) { prev = now; return; }
      const dt = Math.min(2.5, (now - prev) / 16.67); prev = now;
      const st = s.current, ground = H - 40, bx = 80;
      const speed = 5.5 + Math.min(7, st.dist / 1500);
      if (phaseRef.current === 'play') {
        st.dist += speed * dt;
        st.vy -= 0.7 * dt; st.y += st.vy * dt; if (st.y < 0) { st.y = 0; st.vy = 0; }
        st.next -= speed * dt;
        if (st.next <= 0) { const k = Math.random() < 0.55 ? 0 : 1; st.obs.push({ x: W + 30, w: k ? 26 : 20, h: k ? 22 + Math.random() * 10 : 24 + Math.random() * 18, k }); st.next = 260 + Math.random() * 280 + speed * 14; }
        for (const o of st.obs) o.x -= speed * dt;
        st.obs = st.obs.filter((o) => o.x + o.w > -20);
        const by = ground - st.y;
        for (const o of st.obs) {
          if (o.x < bx + 22 && o.x + o.w > bx - 18 && by > ground - o.h + 4) {
            phaseRef.current = 'over'; setPhase('over');
            const sc = Math.floor(st.dist / 10); setLast(sc);
            if (sc > bestRef.current) { bestRef.current = sc; saveBest('bike', sc); }
            break;
          }
        }
      }
      for (const cl of st.clouds) { cl.x -= (phaseRef.current === 'play' ? speed : 1) * 0.2 * dt; if (cl.x < -70) { cl.x = W + 50; cl.y = 20 + Math.random() * 50; } }
      draw(W, st, ground, bx);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div>
      <div className="g-stats"><span>Last <b>{last || '—'}</b></span><span>{phase === 'play' ? 'Tap, click or Space to jump' : 'Tap the road to start'}</span></div>
      <div ref={wrap} style={{ width: '100%' }}>
        <canvas ref={cv} onPointerDown={(e) => { e.preventDefault(); action(); }} style={{ display: 'block', borderRadius: 12, touchAction: 'none', cursor: 'pointer', maxWidth: '100%' }} />
      </div>
    </div>
  );
}
