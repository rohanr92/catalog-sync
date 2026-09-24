'use client';

import { useRef, useState } from 'react';
import { loadBest, saveBest, useWidth, useCanvasLoop, overlay, useKeys, canvasStyle } from './util';

const H = 320, GAP = 124, BX = 80, R = 15;
type Col = { x: number; gy: number; passed: boolean; hue: number };
const fresh = () => ({ y: H / 2, vy: 0, cols: [] as Col[], next: 0, score: 0, dist: 0 });

export default function BalloonFlight() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const w = useWidth(wrap);
  const [, rerender] = useState(0);
  const phase = useRef<'ready' | 'play' | 'over'>('ready');
  const s = useRef(fresh());
  const best = useRef(-1);
  const flap = () => {
    if (phase.current !== 'play') { s.current = fresh(); phase.current = 'play'; rerender((t) => t + 1); }
    s.current.vy = -5.8;
  };
  useKeys((e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); } });

  useCanvasLoop(cv, w, H, (ctx, W, dt) => {
    if (best.current < 0) best.current = loadBest('balloon');
    const st = s.current, speed = 2.6 + Math.min(2, st.score * 0.06);
    if (phase.current === 'play') {
      st.dist += speed * dt;
      st.vy += 0.3 * dt; st.y += st.vy * dt;
      st.next -= speed * dt;
      if (st.next <= 0) { st.cols.push({ x: W + 20, gy: 70 + Math.random() * (H - 170), passed: false, hue: Math.random() * 360 }); st.next = 190; }
      for (const c of st.cols) {
        c.x -= speed * dt;
        if (!c.passed && c.x + 50 < BX) { c.passed = true; st.score++; }
        const inX = BX + R > c.x && BX - R < c.x + 50;
        if (inX && (st.y - R < c.gy - GAP / 2 || st.y + R > c.gy + GAP / 2)) phase.current = 'over';
      }
      st.cols = st.cols.filter((c) => c.x > -60);
      if (st.y > H - 22 || st.y < 0) phase.current = 'over';
      if (phase.current === 'over') { if (st.score > best.current) { best.current = st.score; saveBest('balloon', st.score); } rerender((t) => t + 1); }
    }
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#fbcfe8'); sky.addColorStop(0.6, '#fde68a'); sky.addColorStop(1, '#fed7aa');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(124, 58, 237, 0.18)';
    for (let x = -((st.dist * 0.3) % 60); x < W; x += 60) { const h = 50 + ((Math.floor((x + st.dist * 0.3) / 60) * 37) % 60); ctx.fillRect(x, H - 20 - h, 44, h); }
    for (const c of st.cols) {
      const top = c.gy - GAP / 2, bot = c.gy + GAP / 2;
      ctx.fillStyle = `hsl(${c.hue}, 45%, 62%)`; ctx.fillRect(c.x, bot, 50, H - bot);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let yy = bot + 10; yy < H - 26; yy += 18) { ctx.fillRect(c.x + 8, yy, 10, 9); ctx.fillRect(c.x + 30, yy, 10, 9); }
      ctx.fillStyle = `hsl(${c.hue}, 45%, 45%)`; ctx.fillRect(c.x - 4, bot, 58, 6);
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.roundRect(c.x - 6, -10, 62, top + 10, 14); ctx.fill();
      ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.arc(c.x + 10, top - 4, 12, 0, 7); ctx.arc(c.x + 30, top, 14, 0, 7); ctx.arc(c.x + 48, top - 4, 11, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#65a30d'; ctx.fillRect(0, H - 20, W, 20);
    const by = st.y;
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(BX - 10, by + 8); ctx.lineTo(BX - 6, by + R + 12); ctx.moveTo(BX + 10, by + 8); ctx.lineTo(BX + 6, by + R + 12); ctx.stroke();
    ctx.fillStyle = '#92400e'; ctx.fillRect(BX - 7, by + R + 11, 14, 9);
    const bg = ctx.createLinearGradient(BX - R, 0, BX + R, 0); bg.addColorStop(0, '#6d5ce8'); bg.addColorStop(0.5, '#ec4899'); bg.addColorStop(1, '#f59e0b');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(BX, by, R + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(BX - 6, by - 7, 4, 7, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#1f2937'; ctx.font = '600 13px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Score ${st.score}   Best ${Math.max(0, best.current)}`, 10, 20);
    if (phase.current !== 'play') overlay(ctx, W, H, phase.current === 'over' ? `Bump! ${st.score} points. Tap to fly again` : 'Tap to lift off');
  });

  return (
    <div>
      <div className="g-stats"><span>Tap, click or Space to rise. Fly between the buildings and clouds.</span></div>
      <div ref={wrap} style={{ width: '100%' }}><canvas ref={cv} style={canvasStyle} onPointerDown={(e) => { e.preventDefault(); flap(); }} /></div>
    </div>
  );
}
