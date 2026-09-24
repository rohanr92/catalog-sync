const css = `
:root { --font-sans: var(--font-inter), -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; --mono: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace; }
body { font-family: var(--font-sans) !important; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
::selection { background: #e4defd; }

.btn { border-radius: 8px !important; transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s, background 0.12s; }
.btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(20, 20, 40, 0.08); }
.btn:active:not(:disabled) { transform: translateY(0); }
.btn.primary:not(:disabled) { background: linear-gradient(135deg, #6d5ce8, #3b82f6) !important; border-color: transparent !important; color: #fff !important; box-shadow: 0 4px 14px rgba(109, 92, 232, 0.28); }
.btn.primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(109, 92, 232, 0.38); }
.btn:focus-visible, .filter:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(109, 92, 232, 0.25) !important; border-color: #6d5ce8 !important; }

.filter { border-radius: 999px !important; transition: background 0.12s, color 0.12s, box-shadow 0.12s; }
.filter[aria-pressed="true"] { background: linear-gradient(135deg, #efeaff, #e6effc) !important; color: #3d31a8 !important; font-weight: 600; box-shadow: inset 0 0 0 1px #d9d2fb; }

.row { transition: background 0.12s, box-shadow 0.12s; }
.row:hover { background: #faf9ff !important; }
.row-thumb { border-radius: 6px !important; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05); }
.img-slot img { border-radius: 6px; }
.tag, .notice { border-radius: 6px !important; }
.list-title, .detail-title { letter-spacing: -0.015em; }
.section-label { text-transform: uppercase; letter-spacing: 0.06em; font-size: 10.5px !important; font-weight: 700 !important; color: #7a7690 !important; }

.rl-name { background: linear-gradient(90deg, #4b3fb3, #3b82f6 60%, #10b981); -webkit-background-clip: text; background-clip: text; color: transparent !important; font-weight: 800 !important; letter-spacing: -0.02em !important; }
.rl-logo { position: relative; overflow: hidden; }
.rl-logo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.5) 50%, transparent 70%); transform: translateX(-120%); animation: cs-shine 7s ease-in-out infinite; }
@keyframes cs-shine { 0%, 82% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }

@keyframes cs-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
main.shell > section, main.shell > aside, .detail-body > .section { animation: cs-fade 0.25s ease-out both; }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: #d8d6e3; border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background-color: #bdb8d6; }

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; } }
`;

export default function Theme() {
  return <style>{css}</style>;
}
