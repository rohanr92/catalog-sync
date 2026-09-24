'use client';

import { useEffect, useRef, useState } from 'react';
import Rail from '@/components/Shell';

const css = `
.br-wrap { padding: 26px 30px 48px; background: #f6f6f9; min-height: 100%; box-sizing: border-box; }
.br-inner { max-width: 1200px; margin: 0 auto; }
.br-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
.br-card { background: #fff; border: 1px solid #ecebf2; border-radius: 16px; overflow: hidden; }
.br-head { padding: 14px 18px; color: #fff; font-weight: 700; display: flex; align-items: center; gap: 10px; }
.br-head small { font-weight: 500; opacity: 0.85; margin-left: auto; font-size: 12px; }
.br-body { padding: 16px 18px 18px; }
.br-stats { display: flex; gap: 14px; font-size: 12.5px; color: #5b5870; margin-bottom: 12px; flex-wrap: wrap; }
.br-stats b { color: #1d1b2c; font-family: var(--mono); }
.mem { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.mem button { aspect-ratio: 1; border: 0; padding: 0; background: none; perspective: 600px; cursor: pointer; }
.mem .in { position: relative; width: 100%; height: 100%; transition: transform 0.35s; transform-style: preserve-3d; }
.mem .flip .in { transform: rotateY(180deg); }
.mem .f, .mem .b { position: absolute; inset: 0; border-radius: 10px; display: flex; align-items: center; justify-content: center; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.mem .f { background: linear-gradient(135deg, #6d5ce8, #3b82f6); box-shadow: inset 0 0 0 2px rgba(255,255,255,0.25); }
.mem .f::after { content: "CS"; color: rgba(255,255,255,0.55); font-weight: 800; font-size: 12px; }
.mem .b { background: #f4f3fb; transform: rotateY(180deg); font-size: 28px; }
.mem .done .b { background: #e3f5ea; }
.qm-q { font-size: 34px; font-weight: 800; text-align: center; letter-spacing: -0.02em; margin: 8px 0 14px; font-family: var(--mono); }
.qm-a { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.qm-a button { padding: 14px; border-radius: 10px; border: 1px solid #e4e2ee; background: #fff; font: inherit; font-size: 18px; font-weight: 700; cursor: pointer; font-family: var(--mono); transition: transform 0.08s, background 0.12s; }
.qm-a button:active { transform: scale(0.97); }
.qm-a button.ok { background: #e3f5ea; border-color: #9fd9b5; }
.qm-a button.no { background: #fde8e6; border-color: #f3b0a8; }
.rx { height: 170px; border-radius: 12px; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 700; font-size: 17px; cursor: pointer; user-select: none; transition: background 0.1s; padding: 12px; }
.br-btn { margin-top: 12px; }
@keyframes br-pop { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.br-win { text-align: center; padding: 10px 0 4px; font-weight: 700; color: #16713f; animation: br-pop 0.3s ease-out; }
`;

const load = (k: string) => { try { return Number(localStorage.getItem('cs-best-' + k)) || 0; } catch { return 0; } };
const save = (k: string, v: number) => { try { localStorage.setItem('cs-best-' + k, String(v)); } catch { /* ignore */ } };
const FACES = ['\u{1F460}', '\u{1F45F}', '\u{1F97F}', '\u{1F462}', '\u{1F461}', '\u{1FA74}', '\u{1F45E}', '\u{1F9E6}'];

function Memory() {
  const [cards, setCards] = useState<string[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [best, setBest] = useState(0);
  const deal = () => { setCards([...FACES, ...FACES].sort(() => Math.random() - 0.5)); setOpen([]); setDone(new Set()); setMoves(0); };
  useEffect(() => { deal(); setBest(load('memory')); }, []);
  const won = cards.length > 0 && done.size === cards.length;
  useEffect(() => { if (won && (!best || moves < best)) { save('memory', moves); setBest(moves); } }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  function flip(i: number) {
    if (open.length === 2 || open.includes(i) || done.has(i)) return;
    const n = [...open, i];
    setOpen(n);
    if (n.length === 2) {
      setMoves((m) => m + 1);
      if (cards[n[0]] === cards[n[1]]) setTimeout(() => { setDone((d) => new Set([...d, n[0], n[1]])); setOpen([]); }, 350);
      else setTimeout(() => setOpen([]), 800);
    }
  }

  return (
    <div className="br-card">
      <div className="br-head" style={{ background: 'linear-gradient(120deg, #6d5ce8, #3b82f6)' }}>Shoe Memory <small>match all 8 pairs</small></div>
      <div className="br-body">
        <div className="br-stats"><span>Moves <b>{moves}</b></span><span>Best <b>{best || '—'}</b></span></div>
        <div className="mem">
          {cards.map((f, i) => (
            <button key={i} className={`${open.includes(i) || done.has(i) ? 'flip' : ''} ${done.has(i) ? 'done' : ''}`} onClick={() => flip(i)} aria-label="card">
              <div className="in"><div className="f" /><div className="b">{f}</div></div>
            </button>
          ))}
        </div>
        {won && <div className="br-win">All pairs in {moves} moves{moves === best ? ' — new best!' : ''}</div>}
        <button className="btn br-btn" onClick={deal}>New game</button>
      </div>
    </div>
  );
}

type Q = { text: string; ans: number; choices: number[] };
function makeQ(): Q {
  const op = ['+', '−', '×'][Math.floor(Math.random() * 3)];
  let a = 2 + Math.floor(Math.random() * 40), b = 2 + Math.floor(Math.random() * 40);
  if (op === '×') { a = 2 + Math.floor(Math.random() * 11); b = 2 + Math.floor(Math.random() * 11); }
  if (op === '−' && b > a) [a, b] = [b, a];
  const ans = op === '+' ? a + b : op === '−' ? a - b : a * b;
  const set = new Set([ans]);
  while (set.size < 4) set.add(ans + (Math.floor(Math.random() * 11) - 5 || 7));
  return { text: `${a} ${op} ${b}`, ans, choices: [...set].sort(() => Math.random() - 0.5) };
}

function QuickMaths() {
  const [left, setLeft] = useState(0);
  const [q, setQ] = useState<Q | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [flash, setFlash] = useState<{ v: number; ok: boolean } | null>(null);
  useEffect(() => { setBest(load('maths')); }, []);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  useEffect(() => { if (left === 0 && q && score > best) { save('maths', score); setBest(score); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => { setScore(0); setLeft(60); setQ(makeQ()); setFlash(null); };
  function pick(v: number) {
    if (!q || left <= 0) return;
    const ok = v === q.ans;
    setFlash({ v, ok });
    if (ok) setScore((s) => s + 1);
    setTimeout(() => { setFlash(null); setQ(makeQ()); }, ok ? 150 : 450);
  }
  return (
    <div className="br-card">
      <div className="br-head" style={{ background: 'linear-gradient(120deg, #f59e0b, #ec4899)' }}>Quick Maths <small>60 seconds</small></div>
      <div className="br-body">
        <div className="br-stats"><span>Time <b>{left}s</b></span><span>Score <b>{score}</b></span><span>Best <b>{best || '—'}</b></span></div>
        {left > 0 && q ? (
          <>
            <div className="qm-q">{q.text}</div>
            <div className="qm-a">{q.choices.map((c) => <button key={c} className={flash?.v === c ? (flash.ok ? 'ok' : 'no') : ''} onClick={() => pick(c)}>{c}</button>)}</div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            {q && <div className="br-win" style={{ color: '#8a5a00' }}>{score} correct{score >= best && score > 0 ? ' — new best!' : ''}</div>}
            <button className="btn primary br-btn" onClick={start}>{q ? 'Play again' : 'Start'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Reaction() {
  const [state, setState] = useState<'idle' | 'wait' | 'go' | 'result' | 'early'>('idle');
  const [ms, setMs] = useState(0);
  const [best, setBest] = useState(0);
  const t0 = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setBest(load('reaction')); return () => { if (timer.current) clearTimeout(timer.current); }; }, []);
  function click() {
    if (state === 'idle' || state === 'result' || state === 'early') {
      setState('wait');
      timer.current = setTimeout(() => { t0.current = performance.now(); setState('go'); }, 1500 + Math.random() * 2500);
    } else if (state === 'wait') {
      if (timer.current) clearTimeout(timer.current);
      setState('early');
    } else if (state === 'go') {
      const r = Math.round(performance.now() - t0.current);
      setMs(r); setState('result');
      if (!best || r < best) { save('reaction', r); setBest(r); }
    }
  }
  const look = { idle: ['#eef1f5', '#3d4a5c', 'Tap to start'], wait: ['#fde8e6', '#b42318', 'Wait for green…'], go: ['#10b981', '#fff', 'TAP!'], result: ['#e6effc', '#1f5fbf', `${ms} ms — tap to try again`], early: ['#fdf1dc', '#8a5a00', 'Too soon! Tap to try again'] }[state];
  return (
    <div className="br-card">
      <div className="br-head" style={{ background: 'linear-gradient(120deg, #10b981, #0ea5e9)' }}>Reaction test <small>tap on green</small></div>
      <div className="br-body">
        <div className="br-stats"><span>Last <b>{ms ? `${ms} ms` : '—'}</b></span><span>Best <b>{best ? `${best} ms` : '—'}</b></span></div>
        <div className="rx" style={{ background: look[0], color: look[1] }} onClick={click} role="button">{look[2]}</div>
      </div>
    </div>
  );
}

export default function BreakRoom() {
  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="br-wrap" style={{ overflowY: 'auto', minWidth: 0 }}>
        <style>{css}</style>
        <div className="br-inner">
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Break room {'\u2615'}</h2>
          <p className="status-line" style={{ marginBottom: 18 }}>A few minutes off. Everything here runs in your browser — nothing is sent anywhere, and best scores stay on this device.</p>
          <div className="br-grid"><Memory /><QuickMaths /><Reaction /></div>
        </div>
      </section>
    </main>
  );
}
