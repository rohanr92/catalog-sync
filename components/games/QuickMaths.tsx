'use client';

import { useEffect, useState } from 'react';
import { loadBest, saveBest, rand } from './util';

type Q = { text: string; ans: number; choices: number[] };
function makeQ(): Q {
  const op = ['+', '\u2212', '\u00d7'][rand(3)];
  let a = 2 + rand(40), b = 2 + rand(40);
  if (op === '\u00d7') { a = 2 + rand(11); b = 2 + rand(11); }
  if (op === '\u2212' && b > a) [a, b] = [b, a];
  const ans = op === '+' ? a + b : op === '\u2212' ? a - b : a * b;
  const set = new Set([ans]);
  while (set.size < 4) set.add(ans + (rand(11) - 5 || 7));
  return { text: `${a} ${op} ${b}`, ans, choices: [...set].sort(() => Math.random() - 0.5) };
}

export default function QuickMaths() {
  const [left, setLeft] = useState(0);
  const [q, setQ] = useState<Q | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [flash, setFlash] = useState<{ v: number; ok: boolean } | null>(null);
  useEffect(() => { setBest(loadBest('maths')); }, []);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((s) => s - 1), 1000); return () => clearTimeout(t); }, [left]);
  useEffect(() => { if (left === 0 && q && score > best) { saveBest('maths', score); setBest(score); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => { setScore(0); setLeft(60); setQ(makeQ()); setFlash(null); };
  function pick(v: number) {
    if (!q || left <= 0) return;
    const ok = v === q.ans;
    setFlash({ v, ok });
    if (ok) setScore((s) => s + 1);
    setTimeout(() => { setFlash(null); setQ(makeQ()); }, ok ? 150 : 450);
  }
  return (
    <div>
      <div className="g-stats"><span>Time <b>{left}s</b></span><span>Score <b>{score}</b></span><span>Best <b>{best || '—'}</b></span></div>
      {left > 0 && q ? (
        <>
          <div className="g-big">{q.text}</div>
          <div className="g-choices">{q.choices.map((c) => <button key={c} className={flash?.v === c ? (flash.ok ? 'ok' : 'no') : ''} onClick={() => pick(c)}>{c}</button>)}</div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          {q && <div className="g-win">{score} correct{score >= best && score > 0 ? ' — new best!' : ''}</div>}
          <button className="btn primary g-btn" onClick={start}>{q ? 'Play again' : 'Start'}</button>
        </div>
      )}
    </div>
  );
}
