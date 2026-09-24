'use client';

import { useEffect, useState } from 'react';
import { loadBest, saveBest, rand } from './util';

const COLS: [string, string][] = [['RED', '#ef4444'], ['BLUE', '#3b82f6'], ['GREEN', '#10b981'], ['YELLOW', '#eab308'], ['PURPLE', '#8b5cf6'], ['ORANGE', '#f97316']];
const round = () => { const w = rand(COLS.length); const ink = Math.random() < 0.5 ? w : (w + 1 + rand(COLS.length - 1)) % COLS.length; return { w, ink }; };

export default function ColourMatch() {
  const [left, setLeft] = useState(0);
  const [r, setR] = useState<{ w: number; ink: number } | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [flash, setFlash] = useState<'' | 'ok' | 'no'>('');
  useEffect(() => { setBest(loadBest('stroop')); }, []);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((s) => s - 1), 1000); return () => clearTimeout(t); }, [left]);
  useEffect(() => { if (left === 0 && r && score > best) { saveBest('stroop', score); setBest(score); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => { setScore(0); setStreak(0); setLeft(45); setR(round()); };
  function answer(yes: boolean) {
    if (!r || left <= 0) return;
    const ok = (r.ink === r.w) === yes;
    setFlash(ok ? 'ok' : 'no');
    if (ok) { setScore((s) => s + 1); setStreak((s) => s + 1); } else setStreak(0);
    setTimeout(() => { setFlash(''); setR(round()); }, ok ? 120 : 400);
  }
  return (
    <div>
      <div className="g-stats"><span>Time <b>{left}s</b></span><span>Score <b>{score}</b></span><span>Streak <b>{streak}</b></span><span>Best <b>{best || '—'}</b></span></div>
      {left > 0 && r ? (
        <>
          <p className="status-line" style={{ textAlign: 'center', margin: '4px 0 0' }}>Does the word match its colour?</p>
          <div className="g-big" style={{ color: COLS[r.ink][1], background: flash === 'ok' ? '#e3f5ea' : flash === 'no' ? '#fde8e6' : 'transparent', borderRadius: 12 }}>{COLS[r.w][0]}</div>
          <div className="g-choices"><button onClick={() => answer(true)}>Match</button><button onClick={() => answer(false)}>No match</button></div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          {r && <div className="g-win">{score} correct{score >= best && score > 0 ? ' — new best!' : ''}</div>}
          <button className="btn primary g-btn" onClick={start}>{r ? 'Play again' : 'Start'}</button>
        </div>
      )}
    </div>
  );
}
