'use client';

import { useRef, useState } from 'react';
import { loadBest, saveBest, useWidth, useCanvasLoop, overlay, useKeys, canvasStyle, rand } from './util';

const COLS = 16, ROWS = 12;
type P = { x: number; y: number };
const fresh = () => ({ snake: [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }] as P[], dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 }, food: { x: 11, y: 6 } as P, acc: 0, step: 150, score: 0 });

export default function ParkSnake() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const w = useWidth(wrap, 640);
  const cs = Math.floor(w / COLS), W2 = cs * COLS, H = cs * ROWS;
  const [, rerender] = useState(0);
  const phase = useRef<'ready' | 'play' | 'over'>('ready');
  const s = useRef(fresh());
  const best = useRef(-1);
  const touch = useRef<P | null>(null);
  const start = () => { s.current = fresh(); phase.current = 'play'; rerender((t) => t + 1); };
  const turn = (x: number, y: number) => {
    if (phase.current !== 'play') { start(); return; }
    const d = s.current.dir;
    if (d.x === -x && d.y === -y) return;
    s.current.nextDir = { x, y };
  };
  useKeys((e) => {
    const m: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (m[e.code]) { e.preventDefault(); turn(...m[e.code]); }
    if (e.code === 'Space' && phase.current !== 'play') { e.preventDefault(); start(); }
  });

  useCanvasLoop(cv, W2, H, (ctx, W, dt) => {
    if (best.current < 0) best.current = loadBest('snake');
    const st = s.current;
    if (phase.current === 'play') {
      st.acc += dt * 16.67;
      while (st.acc >= st.step && phase.current === 'play') {
        st.acc -= st.step;
        st.dir = st.nextDir;
        const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || st.snake.some((p) => p.x === head.x && p.y === head.y)) {
          phase.current = 'over';
          if (st.score > best.current) { best.current = st.score; saveBest('snake', st.score); }
          rerender((t) => t + 1);
          break;
        }
        st.snake.unshift(head);
        if (head.x === st.food.x && head.y === st.food.y) {
          st.score++; st.step = Math.max(65, st.step - 4);
          do { st.food = { x: rand(COLS), y: rand(ROWS) }; } while (st.snake.some((p) => p.x === st.food.x && p.y === st.food.y));
        } else st.snake.pop();
      }
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { ctx.fillStyle = (x + y) % 2 ? '#bbf7d0' : '#a7f3d0'; ctx.fillRect(x * cs, y * cs, cs, cs); }
    ctx.font = `${Math.floor(cs * 0.8)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('\u{1F34E}', st.food.x * cs + cs / 2, st.food.y * cs + cs / 2 + 1);
    st.snake.forEach((p, i) => {
      ctx.fillStyle = `hsl(${250 - i * 4}, 70%, ${i === 0 ? 50 : 60}%)`;
      ctx.beginPath(); ctx.roundRect(p.x * cs + 1, p.y * cs + 1, cs - 2, cs - 2, cs * 0.3); ctx.fill();
    });
    const h = st.snake[0];
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(h.x * cs + cs * 0.35, h.y * cs + cs * 0.38, cs * 0.12, 0, 7); ctx.arc(h.x * cs + cs * 0.65, h.y * cs + cs * 0.38, cs * 0.12, 0, 7); ctx.fill();
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#14532d'; ctx.font = '600 13px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Apples ${st.score}   Best ${Math.max(0, best.current)}`, 8, 18);
    if (phase.current !== 'play') overlay(ctx, W, H, phase.current === 'over' ? `Oops! ${st.score} apples. Tap to play again` : 'Tap to start, then swipe to turn');
  });

  return (
    <div>
      <div className="g-stats"><span>Swipe on the lawn or use the arrow keys. Eat the apples, don&apos;t hit the fence or yourself.</span></div>
      <div ref={wrap} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <canvas ref={cv} style={canvasStyle}
          onPointerDown={(e) => { e.preventDefault(); touch.current = { x: e.clientX, y: e.clientY }; if (phase.current !== 'play') start(); }}
          onPointerUp={(e) => {
            const t = touch.current; touch.current = null;
            if (!t) return;
            const dx = e.clientX - t.x, dy = e.clientY - t.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
            if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0); else turn(0, dy > 0 ? 1 : -1);
          }} />
      </div>
    </div>
  );
}
