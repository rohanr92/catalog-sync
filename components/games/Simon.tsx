'use client';

import { useEffect, useRef, useState } from 'react';
import { loadBest, saveBest, rand } from './util';

const PADS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

export default function Simon() {
  const [seq, setSeq] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [lit, setLit] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [best, setBest] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => { setBest(loadBest('simon')); return () => timers.current.forEach(clearTimeout); }, []);

  function play(list: number[]) {
    setBusy(true);
    list.forEach((p, i) => { later(() => setLit(p), 600 * i + 400); later(() => setLit(-1), 600 * i + 800); });
    later(() => { setBusy(false); setPos(0); }, 600 * list.length + 400);
  }
  function start() { const first = [rand(4)]; setSeq(first); setPhase('play'); play(first); }
  function press(p: number) {
    if (busy || phase !== 'play') return;
    setLit(p); later(() => setLit(-1), 180);
    if (p !== seq[pos]) {
      setPhase('over');
      const score = seq.length - 1;
      if (score > best) { saveBest('simon', score); setBest(score); }
      return;
    }
    if (pos + 1 === seq.length) { const next = [...seq, rand(4)]; setSeq(next); later(() => play(next), 700); }
    else setPos(pos + 1);
  }

  return (
    <div>
      <div className="g-stats"><span>Round <b>{phase === 'ready' ? '—' : seq.length}</b></span><span>Best <b>{best || '—'}</b></span><span>{busy ? 'Watch…' : phase === 'play' ? 'Your turn' : ''}</span></div>
      <div className="simon">
        {PADS.map((c, i) => <button key={i} onPointerDown={(e) => { e.preventDefault(); press(i); }} style={{ background: c, opacity: lit === i ? 1 : 0.45, transform: lit === i ? 'scale(1.04)' : 'none' }} aria-label={`pad ${i + 1}`} />)}
      </div>
      {phase !== 'play' && (
        <div style={{ textAlign: 'center' }}>
          {phase === 'over' && <div className="g-win">You reached round {seq.length}</div>}
          <button className="btn primary g-btn" onClick={start}>{phase === 'over' ? 'Play again' : 'Start'}</button>
        </div>
      )}
    </div>
  );
}
