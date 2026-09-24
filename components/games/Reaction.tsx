'use client';

import { useEffect, useRef, useState } from 'react';
import { loadBest, saveBest } from './util';

export default function Reaction() {
  const [state, setState] = useState<'idle' | 'wait' | 'go' | 'result' | 'early'>('idle');
  const [ms, setMs] = useState(0);
  const [best, setBest] = useState(0);
  const t0 = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setBest(loadBest('reaction')); return () => { if (timer.current) clearTimeout(timer.current); }; }, []);
  function click() {
    if (state === 'idle' || state === 'result' || state === 'early') {
      setState('wait');
      timer.current = setTimeout(() => { t0.current = performance.now(); setState('go'); }, 1500 + Math.random() * 2500);
    } else if (state === 'wait') {
      if (timer.current) clearTimeout(timer.current);
      setState('early');
    } else {
      const r = Math.round(performance.now() - t0.current);
      setMs(r); setState('result');
      if (!best || r < best) { saveBest('reaction', r); setBest(r); }
    }
  }
  const look = { idle: ['#eef1f5', '#3d4a5c', 'Tap to start'], wait: ['#fde8e6', '#b42318', 'Wait for green…'], go: ['#10b981', '#fff', 'TAP!'], result: ['#e6effc', '#1f5fbf', `${ms} ms — tap to try again`], early: ['#fdf1dc', '#8a5a00', 'Too soon! Tap to try again'] }[state];
  return (
    <div>
      <div className="g-stats"><span>Last <b>{ms ? `${ms} ms` : '—'}</b></span><span>Best <b>{best ? `${best} ms` : '—'}</b></span></div>
      <div className="g-pad" style={{ background: look[0], color: look[1] }} onPointerDown={(e) => { e.preventDefault(); click(); }} role="button">{look[2]}</div>
    </div>
  );
}
