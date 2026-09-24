'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { ArrowLeft } from 'lucide-react';
import Rail from '@/components/Shell';
import BikeRunner from '@/components/games/BikeRunner';
import CatchShoes from '@/components/games/CatchShoes';
import Memory from '@/components/games/Memory';
import Simon from '@/components/games/Simon';
import NumberMemory from '@/components/games/NumberMemory';
import ColourMatch from '@/components/games/ColourMatch';
import QuickMaths from '@/components/games/QuickMaths';
import Reaction from '@/components/games/Reaction';
import { loadBest } from '@/components/games/util';

type Game = { id: string; name: string; desc: string; icon: string; grad: string; unit: string; C: ComponentType };
const GAMES: Game[] = [
  { id: 'bike', name: 'Bike Ride', desc: 'Jump the cones and boxes', icon: '\u{1F6B4}', grad: 'linear-gradient(135deg, #6d5ce8, #3b82f6)', unit: 'pts', C: BikeRunner },
  { id: 'catch', name: 'Catch the Shoes', desc: 'Catch shoes, dodge bombs', icon: '\u{1F9FA}', grad: 'linear-gradient(135deg, #ec4899, #f59e0b)', unit: 'caught', C: CatchShoes },
  { id: 'memory', name: 'Shoe Memory', desc: 'Match all eight pairs', icon: '\u{1F460}', grad: 'linear-gradient(135deg, #8b5cf6, #ec4899)', unit: 'moves', C: Memory },
  { id: 'simon', name: 'Colour Sequence', desc: 'Repeat the growing pattern', icon: '\u{1F3B5}', grad: 'linear-gradient(135deg, #ef4444, #f59e0b)', unit: 'rounds', C: Simon },
  { id: 'number', name: 'Number Memory', desc: 'Remember longer numbers', icon: '\u{1F522}', grad: 'linear-gradient(135deg, #0ea5e9, #10b981)', unit: 'digits', C: NumberMemory },
  { id: 'stroop', name: 'Colour Match', desc: 'Word vs. ink colour', icon: '\u{1F3A8}', grad: 'linear-gradient(135deg, #f97316, #8b5cf6)', unit: 'pts', C: ColourMatch },
  { id: 'maths', name: 'Quick Maths', desc: '60 seconds of sums', icon: '\u2795', grad: 'linear-gradient(135deg, #f59e0b, #ef4444)', unit: 'pts', C: QuickMaths },
  { id: 'reaction', name: 'Reaction Test', desc: 'Tap the moment it turns green', icon: '\u26A1', grad: 'linear-gradient(135deg, #10b981, #0ea5e9)', unit: 'ms', C: Reaction },
];

const css = `
.br-wrap { padding: 26px 30px 48px; background: #f6f6f9; min-height: 100%; box-sizing: border-box; }
.br-inner { max-width: 1100px; margin: 0 auto; }
.br-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 14px; }
.br-tile { border: 0; text-align: left; font: inherit; color: #fff; border-radius: 16px; padding: 18px; min-height: 130px; cursor: pointer; position: relative; overflow: hidden; box-shadow: 0 8px 22px rgba(20, 20, 40, 0.12); transition: transform 0.15s, box-shadow 0.15s; animation: br-in 0.35s ease-out both; }
.br-tile:hover { transform: translateY(-3px) rotate(-0.4deg); box-shadow: 0 14px 30px rgba(20, 20, 40, 0.18); }
.br-tile .ic { font-size: 34px; display: inline-block; animation: br-bob 3s ease-in-out infinite; }
.br-tile .n { font-weight: 800; font-size: 16px; margin-top: 8px; }
.br-tile .d { font-size: 12.5px; opacity: 0.9; margin-top: 2px; }
.br-tile .b { position: absolute; top: 12px; right: 12px; font-size: 11px; font-weight: 700; background: rgba(255, 255, 255, 0.22); padding: 3px 8px; border-radius: 999px; }
@keyframes br-bob { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-5px) rotate(-6deg); } }
@keyframes br-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
.br-panel { background: #fff; border: 1px solid #ecebf2; border-radius: 16px; overflow: hidden; animation: br-in 0.25s ease-out both; }
.br-ph { display: flex; align-items: center; gap: 10px; padding: 14px 16px; color: #fff; font-weight: 800; font-size: 16px; }
.br-ph button { border: 0; background: rgba(255, 255, 255, 0.22); color: #fff; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.br-pb { padding: 16px; }
.g-stats { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: #5b5870; margin-bottom: 12px; }
.g-stats b { color: #1d1b2c; font-family: var(--mono); }
.g-btn { margin-top: 12px; }
.g-win { text-align: center; padding: 10px 0 4px; font-weight: 700; color: #16713f; animation: br-in 0.3s ease-out; }
.g-big { font-size: clamp(28px, 7vw, 40px); font-weight: 800; text-align: center; letter-spacing: -0.02em; margin: 10px 0 14px; font-family: var(--mono); padding: 6px; transition: background 0.12s; }
.g-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.g-choices button { padding: 14px; border-radius: 12px; border: 1px solid #e4e2ee; background: #fff; font: inherit; font-size: 18px; font-weight: 700; cursor: pointer; font-family: var(--mono); transition: transform 0.08s, background 0.12s; }
.g-choices button:active { transform: scale(0.97); }
.g-choices button.ok { background: #e3f5ea; border-color: #9fd9b5; }
.g-choices button.no { background: #fde8e6; border-color: #f3b0a8; }
.g-pad { height: 200px; border-radius: 14px; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 800; font-size: 18px; cursor: pointer; user-select: none; transition: background 0.1s; padding: 12px; touch-action: manipulation; }
.g-bar { height: 6px; background: #eeedf5; border-radius: 6px; overflow: hidden; }
.g-bar div { height: 100%; background: linear-gradient(90deg, #6d5ce8, #3b82f6); animation: g-shrink linear forwards; }
@keyframes g-shrink { from { width: 100%; } to { width: 0; } }
.mem { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-width: 460px; margin: 0 auto; }
.mem button { aspect-ratio: 1; border: 0; padding: 0; background: none; perspective: 600px; cursor: pointer; }
.mem .in { position: relative; width: 100%; height: 100%; transition: transform 0.35s; transform-style: preserve-3d; }
.mem .flip .in { transform: rotateY(180deg); }
.mem .f, .mem .b { position: absolute; inset: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.mem .f { background: linear-gradient(135deg, #6d5ce8, #3b82f6); }
.mem .f::after { content: "CS"; color: rgba(255, 255, 255, 0.55); font-weight: 800; font-size: 12px; }
.mem .b { background: #f4f3fb; transform: rotateY(180deg); font-size: clamp(22px, 6vw, 30px); }
.mem .done .b { background: #e3f5ea; }
.simon { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 320px; margin: 0 auto; }
.simon button { aspect-ratio: 1; border: 0; border-radius: 18px; cursor: pointer; transition: opacity 0.12s, transform 0.12s; touch-action: manipulation; }
@media (max-width: 700px) { .br-wrap { padding: 14px 12px 32px !important; } .br-tiles { grid-template-columns: 1fr 1fr; gap: 10px; } .br-tile { min-height: 116px; padding: 14px; } .br-tile .d { display: none; } }
@media (prefers-reduced-motion: reduce) { .br-tile .ic { animation: none; } }
`;

export default function BreakRoom() {
  const [open, setOpen] = useState<Game | null>(null);
  const [bests, setBests] = useState<Record<string, number>>({});
  useEffect(() => { if (!open) setBests(Object.fromEntries(GAMES.map((g) => [g.id, loadBest(g.id)]))); }, [open]);
  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="br-wrap" style={{ overflowY: 'auto', minWidth: 0 }}>
        <style>{css}</style>
        <div className="br-inner">
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Break room {'\u2615'}</h2>
          <p className="status-line" style={{ marginBottom: 18 }}>A few minutes off. Everything runs in your browser — nothing is sent anywhere, and best scores stay on this device.</p>
          {open ? (
            <div className="br-panel">
              <div className="br-ph" style={{ background: open.grad }}>
                <button onClick={() => setOpen(null)}><ArrowLeft size={14} /> All games</button>
                <span>{open.icon} {open.name}</span>
              </div>
              <div className="br-pb"><open.C /></div>
            </div>
          ) : (
            <div className="br-tiles">
              {GAMES.map((g, i) => (
                <button key={g.id} className="br-tile" style={{ background: g.grad, animationDelay: `${i * 40}ms` }} onClick={() => setOpen(g)}>
                  {bests[g.id] ? <span className="b">Best {bests[g.id]} {g.unit}</span> : null}
                  <span className="ic" style={{ animationDelay: `${i * 0.3}s` }}>{g.icon}</span>
                  <div className="n">{g.name}</div>
                  <div className="d">{g.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
