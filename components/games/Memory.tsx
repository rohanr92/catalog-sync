'use client';

import { useEffect, useState } from 'react';
import { loadBest, saveBest } from './util';

const FACES = ['\u{1F460}', '\u{1F45F}', '\u{1F97F}', '\u{1F462}', '\u{1F461}', '\u{1FA74}', '\u{1F45E}', '\u{1F9E6}'];

export default function Memory() {
  const [cards, setCards] = useState<string[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [best, setBest] = useState(0);
  const deal = () => { setCards([...FACES, ...FACES].sort(() => Math.random() - 0.5)); setOpen([]); setDone(new Set()); setMoves(0); };
  useEffect(() => { deal(); setBest(loadBest('memory')); }, []);
  const won = cards.length > 0 && done.size === cards.length;
  useEffect(() => { if (won && (!best || moves < best)) { saveBest('memory', moves); setBest(moves); } }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div>
      <div className="g-stats"><span>Moves <b>{moves}</b></span><span>Best <b>{best || '—'}</b></span></div>
      <div className="mem">
        {cards.map((f, i) => (
          <button key={i} className={`${open.includes(i) || done.has(i) ? 'flip' : ''} ${done.has(i) ? 'done' : ''}`} onClick={() => flip(i)} aria-label="card">
            <div className="in"><div className="f" /><div className="b">{f}</div></div>
          </button>
        ))}
      </div>
      {won && <div className="g-win">All pairs in {moves} moves{moves === best ? ' — new best!' : ''}</div>}
      <button className="btn g-btn" onClick={deal}>New game</button>
    </div>
  );
}
