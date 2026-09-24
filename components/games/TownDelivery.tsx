'use client';

import { useRef, useState } from 'react';
import { loadBest, saveBest, useWidth, useCanvasLoop, overlay, useKeys, canvasStyle, rand } from './util';

const H = 380;
type It = { lane: number; y: number; t: 'car' | 'box'; c: string };
const CAR = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const HOUSE = ['#fca5a5', '#fde68a', '#a7f3d0', '#bfdbfe', '#ddd6fe', '#fbcfe8'];
const fresh = () => ({ lane: 1, x: 1, items: [] as It[], off: 0, score: 0, next: 60, dist: 0 });

function house(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  ctx.fillStyle = c; ctx.fillRect(x, y + s * 0.4, s, s * 0.6);
  ctx.fillStyle = '#9a3412'; ctx.beginPath(); ctx.moveTo(x - 4, y + s * 0.42); ctx.lineTo(x + s / 2, y); ctx.lineTo(x + s + 4, y + s * 0.42); ctx.fill();
  ctx.fillStyle = '#78350f'; ctx.fillRect(x + s * 0.42, y + s * 0.7, s * 0.18, s * 0.3);
  ctx.fillStyle = '#e0f2fe'; ctx.fillRect(x + s * 0.12, y + s * 0.55, s * 0.2, s * 0.16); ctx.fillRect(x + s * 0.68, y + s * 0.55, s * 0.2, s * 0.16);
}

export default function TownDelivery() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const w = useWidth(wrap, 520);
  const [, rerender] = useState(0);
  const phase = useRef<'ready' | 'play' | 'over'>('ready');
  const s = useRef(fresh());
  const best = useRef(-1);
  const start = () => { s.current = fresh(); phase.current = 'play'; rerender((t) => t + 1); };
  const move = (d: number) => { if (phase.current !== 'play') { start(); return; } s.current.lane = Math.max(0, Math.min(2, s.current.lane + d)); };
  useKeys((e) => {
    if (e.code === 'ArrowLeft') { e.preventDefault(); move(-1); }
    if (e.code === 'ArrowRight') { e.preventDefault(); move(1); }
    if (e.code === 'Space' && phase.current !== 'play') { e.preventDefault(); start(); }
  });

  useCanvasLoop(cv, w, H, (ctx, W, dt) => {
    if (best.current < 0) best.current = loadBest('town');
    const st = s.current;
    const road = Math.min(W * 0.62, 300), rx = (W - road) / 2, lw = road / 3, vy = H - 90;
    const speed = 4 + Math.min(6, st.dist / 2500);
    if (phase.current === 'play') {
      st.off += speed * dt; st.dist += speed * dt;
      st.x += (st.lane - st.x) * Math.min(1, 0.3 * dt);
      st.next -= speed * dt;
      if (st.next <= 0) { const box = Math.random() < 0.35; st.items.push({ lane: rand(3), y: -60, t: box ? 'box' : 'car', c: CAR[rand(CAR.length)] }); st.next = 90 + rand(90); }
      for (const it of st.items) it.y += (it.t === 'car' ? speed * 0.55 : speed) * dt;
      const keep: It[] = [];
      for (const it of st.items) {
        if (Math.abs(it.lane - st.x) < 0.5 && it.y + 50 > vy && it.y < vy + 60) {
          if (it.t === 'box') { st.score++; continue; }
          phase.current = 'over';
          if (st.score > best.current) { best.current = st.score; saveBest('town', st.score); }
          rerender((t) => t + 1);
        }
        if (it.y < H + 80) keep.push(it);
      }
      st.items = keep;
    }
    ctx.fillStyle = '#86efac'; ctx.fillRect(0, 0, W, H);
    const gap = 120, o = st.off % gap, hs = Math.max(20, Math.min(44, rx - 16));
    for (let i = -1; i < H / gap + 1; i++) {
      const y = i * gap + o, k = ((Math.floor(st.off / gap) - i) % 6 + 6) % 6;
      if (rx > 34) { house(ctx, rx / 2 - hs / 2, y, hs, HOUSE[k]); house(ctx, W - rx / 2 - hs / 2, y + 50, hs, HOUSE[(k + 3) % 6]); }
      ctx.fillStyle = '#15803d'; ctx.beginPath(); ctx.arc(rx - 10, y + 80, 9, 0, 7); ctx.arc(rx + road + 10, y + 20, 9, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#6b7280'; ctx.fillRect(rx, 0, road, H);
    ctx.strokeStyle = '#f9fafb'; ctx.lineWidth = 3; ctx.setLineDash([22, 18]); ctx.lineDashOffset = -st.off;
    for (let l = 1; l < 3; l++) { ctx.beginPath(); ctx.moveTo(rx + lw * l, 0); ctx.lineTo(rx + lw * l, H); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const it of st.items) {
      const cx = rx + lw * (it.lane + 0.5);
      if (it.t === 'car') {
        ctx.fillStyle = it.c; ctx.beginPath(); ctx.roundRect(cx - 17, it.y, 34, 54, 8); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(cx - 12, it.y + 8, 24, 10); ctx.fillRect(cx - 12, it.y + 36, 24, 8);
      } else {
        ctx.fillStyle = '#c2410c'; ctx.fillRect(cx - 15, it.y + 14, 30, 26);
        ctx.fillStyle = '#fde68a'; ctx.fillRect(cx - 2, it.y + 14, 4, 26); ctx.fillRect(cx - 15, it.y + 25, 30, 4);
      }
    }
    const vx = rx + lw * (st.x + 0.5);
    const g = ctx.createLinearGradient(vx - 20, 0, vx + 20, 0); g.addColorStop(0, '#6d5ce8'); g.addColorStop(1, '#3b82f6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(vx - 20, vy, 40, 64, 9); ctx.fill();
    ctx.fillStyle = '#e0e7ff'; ctx.fillRect(vx - 14, vy + 6, 28, 12);
    ctx.fillStyle = '#fff'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CS', vx, vy + 44);
    ctx.fillStyle = '#1f2937'; ctx.font = '600 13px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Parcels ${st.score}   Best ${Math.max(0, best.current)}`, 10, 20);
    if (phase.current !== 'play') overlay(ctx, W, H, phase.current === 'over' ? `Crash! ${st.score} parcels. Tap to drive again` : 'Tap to start your deliveries');
  });

  return (
    <div>
      <div className="g-stats"><span>Tap the left or right side (or arrow keys) to change lane. Grab parcels, avoid cars.</span></div>
      <div ref={wrap} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <canvas ref={cv} style={canvasStyle} onPointerDown={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); move(e.clientX - r.left < r.width / 2 ? -1 : 1); }} />
      </div>
    </div>
  );
}
