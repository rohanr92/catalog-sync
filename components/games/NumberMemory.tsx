'use client';

import { useEffect, useRef, useState } from 'react';
import { loadBest, saveBest, rand } from './util';

const makeNum = (len: number) => String(1 + rand(9)) + Array.from({ length: len - 1 }, () => rand(10)).join('');

export default function NumberMemory() {
  const [len, setLen] = useState(3);
  const [num, setNum] = useState('');
  const [phase, setPhase] = useState<'ready' | 'show' | 'input' | 'over'>('ready');
  const [answer, setAnswer] = useState('');
  const [best, setBest] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMs = 1000 + len * 450;
  useEffect(() => { setBest(loadBest('number')); return () => { if (timer.current) clearTimeout(timer.current); }; }, []);

  function show(l: number) {
    setNum(makeNum(l)); setAnswer(''); setPhase('show');
    timer.current = setTimeout(() => setPhase('input'), 1000 + l * 450);
  }
  function start() { setLen(3); show(3); }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (answer.trim() === num) { const l = len + 1; setLen(l); show(l); }
    else { setPhase('over'); const reached = len - 1; if (reached > best) { saveBest('number', reached); setBest(reached); } }
  }

  return (
    <div>
      <div className="g-stats"><span>Digits <b>{phase === 'ready' ? '—' : len}</b></span><span>Best <b>{best ? `${best} digits` : '—'}</b></span></div>
      {phase === 'show' && (
        <div style={{ textAlign: 'center' }}>
          <div className="g-big" style={{ letterSpacing: '0.12em' }}>{num}</div>
          <div className="g-bar"><div style={{ animationDuration: `${showMs}ms` }} /></div>
        </div>
      )}
      {phase === 'input' && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input autoFocus inputMode="numeric" value={answer} onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ''))} placeholder="Type the number" style={{ flex: 1, minWidth: 0, padding: '12px 14px', fontSize: 20, fontFamily: 'var(--mono)', border: '1px solid #d6d4e4', borderRadius: 10 }} />
          <button className="btn primary">Check</button>
        </form>
      )}
      {(phase === 'ready' || phase === 'over') && (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          {phase === 'over' && <div className="g-win" style={{ color: '#b42318' }}>It was {num} — you remembered {len - 1} digits</div>}
          <button className="btn primary g-btn" onClick={start}>{phase === 'over' ? 'Play again' : 'Start'}</button>
        </div>
      )}
    </div>
  );
}
