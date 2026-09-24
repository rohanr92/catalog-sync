'use client';

import { useEffect, useState } from 'react';
import { loadBest, saveBest, rand } from './util';

const WORDS = ['SANDAL', 'LOAFER', 'SNEAKER', 'BOOTS', 'HEEL', 'BALLET', 'LEATHER', 'SUEDE', 'MARYJANE', 'SLIPPER', 'VILLAGE', 'MARKET', 'BAKERY', 'GARDEN', 'BICYCLE', 'CASTLE', 'HARBOUR', 'STREET', 'BRIDGE', 'LANTERN', 'COTTAGE', 'TRAIN', 'PARCEL', 'SHOEBOX', 'FASHION', 'STYLE', 'CATALOG', 'PRODUCT', 'ORDER', 'SHIPPING', 'COLOUR', 'BUCKLE'];
const shuffle = (w: string) => { let s = w; for (let i = 0; i < 8 && s === w; i++) s = w.split('').sort(() => Math.random() - 0.5).join(''); return s; };

export default function WordScramble() {
  const [word, setWord] = useState('');
  const [tiles, setTiles] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [left, setLeft] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [shake, setShake] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => { setBest(loadBest('words')); }, []);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((s) => s - 1), 1000); return () => clearTimeout(t); }, [left]);
  useEffect(() => { if (left === 0 && started && score > best) { saveBest('words', score); setBest(score); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => { const w = WORDS[rand(WORDS.length)]; setWord(w); setTiles(shuffle(w).split('')); setPicked([]); };
  const start = () => { setScore(0); setLeft(75); setStarted(true); next(); };
  function pick(i: number) {
    if (left <= 0 || picked.includes(i)) return;
    const p = [...picked, i];
    setPicked(p);
    if (p.length === word.length) {
      if (p.map((j) => tiles[j]).join('') === word) { setScore((s) => s + 1); setTimeout(next, 250); }
      else { setShake(true); setTimeout(() => { setShake(false); setPicked([]); }, 400); }
    }
  }
  const typed = picked.map((j) => tiles[j]);
  return (
    <div>
      <div className="g-stats"><span>Time <b>{left}s</b></span><span>Words <b>{score}</b></span><span>Best <b>{best || '—'}</b></span></div>
      {left > 0 ? (
        <>
          <div className={`ws-slots${shake ? ' ws-shake' : ''}`}>
            {word.split('').map((_, i) => <div key={i} className={`ws-slot${typed[i] ? ' f' : ''}`}>{typed[i] ?? ''}</div>)}
          </div>
          <div className="ws-tiles">
            {tiles.map((ch, i) => <button key={i} className={`ws-tile${picked.includes(i) ? ' used' : ''}`} onClick={() => pick(i)}>{ch}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button className="btn" onClick={() => setPicked(picked.slice(0, -1))} disabled={!picked.length}>Undo</button>
            <button className="btn" onClick={next}>Skip</button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          {started && <div className="g-win">{score} words{score >= best && score > 0 ? ' — new best!' : ''}{word ? ` · last one was ${word}` : ''}</div>}
          <button className="btn primary g-btn" onClick={start}>{started ? 'Play again' : 'Start'}</button>
        </div>
      )}
    </div>
  );
}
