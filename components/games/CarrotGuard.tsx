'use client';

import { useEffect, useRef, useState } from 'react';
import { loadBest, saveBest, rand } from './util';

const BUNNY = '\u{1F430}', BEE = '\u{1F41D}', CARROT = '\u{1F955}';
type Hole = { k: 'b' | 'e'; id: number; hit?: boolean } | null;

export default function CarrotGuard() {
  const [holes, setHoles] = useState<Hole[]>(Array(9).fill(null));
  const [left, setLeft] = useState(0);
  const [score, setScore] = useState(0);
  const [carrots, setCarrots] = useState(5);
  const [best, setBest] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const holesRef = useRef(holes); holesRef.current = holes;
  const scoreRef = useRef(score); scoreRef.current = score;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const idc = useRef(0);
  const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => { setBest(loadBest('carrot')); return clearAll; }, []);

  const start = () => { clearAll(); setHoles(Array(9).fill(null)); setScore(0); setCarrots(5); setLeft(45); setPhase('play'); };
  const end = () => { clearAll(); setPhase('over'); if (scoreRef.current > best) { saveBest('carrot', scoreRef.current); setBest(scoreRef.current); } };

  useEffect(() => { if (phase !== 'play') return; if (left <= 0) { end(); return; } const t = setTimeout(() => setLeft((s) => s - 1), 1000); return () => clearTimeout(t); }, [left, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'play' && carrots <= 0) end(); }, [carrots]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== 'play') return;
    const iv = setInterval(() => {
      const free = holesRef.current.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
      if (!free.length) return;
      const i = free[rand(free.length)], k = Math.random() < 0.2 ? 'e' : 'b', id = ++idc.current;
      setHoles((h) => { const n = [...h]; n[i] = { k, id }; return n; });
      timers.current.push(setTimeout(() => {
        const h = holesRef.current[i];
        if (h?.id !== id) return;
        if (h.k === 'b' && !h.hit) setCarrots((c) => c - 1);
        setHoles((p) => { const n = [...p]; if (n[i]?.id === id) n[i] = null; return n; });
      }, Math.max(650, 1300 - scoreRef.current * 15)));
    }, 520);
    return () => clearInterval(iv);
  }, [phase]);

  function tap(i: number) {
    const h = holes[i];
    if (phase !== 'play' || !h || h.hit) return;
    if (h.k === 'b') setScore((s) => s + 1); else setScore((s) => Math.max(0, s - 2));
    setHoles((p) => { const n = [...p]; n[i] = { ...h, hit: true }; return n; });
    timers.current.push(setTimeout(() => setHoles((p) => { const n = [...p]; if (n[i]?.id === h.id) n[i] = null; return n; }), 250));
  }

  return (
    <div>
      <div className="g-stats"><span>Time <b>{left}s</b></span><span>Bunnies <b>{score}</b></span><span>Best <b>{best || '—'}</b></span><span>Don&apos;t tap the bees (−2)</span></div>
      <div className="cg-field">
        <div className="cg-grid">
          {holes.map((h, i) => (
            <button key={i} className="cg-hole" onPointerDown={(e) => { e.preventDefault(); tap(i); }} aria-label={`hole ${i + 1}`}>
              {h && <span key={h.id} className={h.hit ? 'hit' : ''}>{h.k === 'b' ? BUNNY : BEE}</span>}
            </button>
          ))}
        </div>
        <div className="cg-carrots">{CARROT.repeat(Math.max(0, carrots))}</div>
      </div>
      {phase !== 'play' && (
        <div style={{ textAlign: 'center' }}>
          {phase === 'over' && <div className="g-win">{carrots > 0 ? `You saved the garden — ${score} bunnies caught!` : `The bunnies got the carrots — ${score} caught`}</div>}
          <button className="btn primary g-btn" onClick={start}>{phase === 'over' ? 'Play again' : 'Start'}</button>
        </div>
      )}
    </div>
  );
}
