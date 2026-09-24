'use client';

import { useRef, useState } from 'react';
import { loadBest, saveBest, useWidth, useCanvasLoop, overlay, useKeys, canvasStyle } from './util';

const H = 400, BH = 26;
type B = { x: number; w: number };
const fresh = (W: number) => ({ stack: [{ x: W / 2 - 80, w: 160 }] as B[], cur: { x: 0, w: 160, dir: 1 }, speed: 2.4, cam: 0, perfect: 0, flash: 0 });

export default function StackBoxes() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const w = useWidth(wrap, 560);
  const [, rerender] = useState(0);
  const phase = useRef<'ready' | 'play' | 'over'>('ready');
  const s = useRef(fresh(320));
  const best = useRef(-1);
  const drop = () => {
    const st = s.current;
    if (phase.current !== 'play') { s.current = fresh(w); phase.current = 'play'; rerender((t) => t + 1); return; }
    const top = st.stack[st.stack.length - 1], c = st.cur;
    let l = Math.max(c.x, top.x), r = Math.min(c.x + c.w, top.x + top.w);
    if (Math.abs(c.x - top.x) < 5) { l = top.x; r = top.x + top.w; st.perfect++; st.flash = 1; }
    if (r - l <= 0) {
      phase.current = 'over';
      const sc = st.stack.length - 1;
      if (sc > best.current) { best.current = sc; saveBest('stack', sc); }
      rerender((t) => t + 1);
      return;
    }
    st.stack.push({ x: l, w: r - l });
    st.cur = { x: st.stack.length % 2 ? -(r - l) : w, w: r - l, dir: st.stack.length % 2 ? 1 : -1 };
    st.speed = Math.min(7, st.speed + 0.18);
  };
  useKeys((e) => { if (e.code === 'Space' || e.code === 'ArrowDown') { e.preventDefault(); drop(); } });

  useCanvasLoop(cv, w, H, (ctx, W, dt) => {
    if (best.current < 0) best.current = loadBest('stack');
    const st = s.current, base = H - 40;
    if (phase.current === 'play') {
      const c = st.cur;
      c.x += c.dir * st.speed * dt;
      if (c.x > W - c.w + 30) c.dir = -1;
      if (c.x < -30) c.dir = 1;
    }
    st.cam += (Math.max(0, (st.stack.length - 9) * BH) - st.cam) * Math.min(1, 0.1 * dt);
    st.flash = Math.max(0, st.flash - 0.04 * dt);
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1e1b4b'); sky.addColorStop(1, '#6d28d9');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 30; i++) ctx.fillRect((i * 97) % W, (i * 53 + st.cam * 0.2) % (H - 80), 2, 2);
    ctx.fillStyle = '#312e81';
    for (let x = 0; x < W; x += 36) { const h = 40 + ((x * 7) % 70); ctx.fillRect(x, base + st.cam * 0.3 - h + 40, 30, h); }
    st.stack.forEach((b, i) => {
      const y = base - i * BH + st.cam;
      if (y > H + BH) return;
      ctx.fillStyle = `hsl(${(i * 23) % 360}, 70%, 60%)`; ctx.fillRect(b.x, y - BH, b.w, BH);
      ctx.fillStyle = `hsl(${(i * 23) % 360}, 70%, 45%)`; ctx.fillRect(b.x, y - BH, b.w, 5);
    });
    if (phase.current === 'play') {
      const c = st.cur, y = base - st.stack.length * BH + st.cam;
      ctx.fillStyle = `hsl(${(st.stack.length * 23) % 360}, 70%, 60%)`; ctx.fillRect(c.x, y - BH, c.w, BH);
      ctx.fillStyle = `hsl(${(st.stack.length * 23) % 360}, 70%, 45%)`; ctx.fillRect(c.x, y - BH, c.w, 5);
    }
    ctx.fillStyle = '#fff'; ctx.font = '600 13px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Height ${st.stack.length - 1}   Best ${Math.max(0, best.current)}   Perfect ${st.perfect}`, 10, 20);
    if (st.flash > 0) { ctx.globalAlpha = st.flash; ctx.fillStyle = '#fde68a'; ctx.font = '800 22px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('PERFECT!', W / 2, 60); ctx.globalAlpha = 1; }
    if (phase.current !== 'play') overlay(ctx, W, H, phase.current === 'over' ? `Tower of ${st.stack.length - 1} boxes! Tap to build again` : 'Tap to drop each box on the tower');
  });

  return (
    <div>
      <div className="g-stats"><span>Tap, click or Space to drop. Overhang gets cut off — line them up exactly for a perfect drop.</span></div>
      <div ref={wrap} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}><canvas ref={cv} style={canvasStyle} onPointerDown={(e) => { e.preventDefault(); drop(); }} /></div>
    </div>
  );
}
