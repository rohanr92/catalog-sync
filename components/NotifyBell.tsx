'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// 🔔 in the top-right corner of every page: task assigned, comments, done, due dates.
// Also shows a computer/phone notification when something new arrives (if you allow it).

interface Note { id: string; text: string; link: string; read: boolean; byName: string; kind: string; createdAt: string }

const css = `
.nb { position: fixed; top: 12px; right: 14px; z-index: 60; }
.nb-btn { position: relative; width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--rule, #e6e6e6); background: var(--paper, #fff); cursor: pointer; font-size: 17px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.nb-count { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: #e2445c; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.nb-box { position: absolute; top: 46px; right: 0; width: min(380px, calc(100vw - 28px)); max-height: 70vh; overflow-y: auto; background: var(--paper, #fff); border: 1px solid var(--rule, #e6e6e6); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.15); }
.nb-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--rule, #eee); font-weight: 700; font-size: 14px; position: sticky; top: 0; background: inherit; }
.nb-head button, .nb-on { background: none; border: none; color: #0073ea; cursor: pointer; font: inherit; font-size: 12px; font-weight: 500; }
.nb-item { display: block; padding: 10px 14px; border-bottom: 1px solid #f2f2f2; font-size: 13px; line-height: 1.4; cursor: pointer; text-align: left; width: 100%; background: none; border-left: 3px solid transparent; color: inherit; font-family: inherit; }
.nb-item.new { background: #f0f6ff; border-left-color: #0073ea; }
.nb-item:hover { background: #f7f9ff; }
.nb-when { font-size: 11px; color: #888; margin-top: 2px; }
.nb-empty { padding: 26px; text-align: center; color: #888; font-size: 13px; }
@media print { .nb { display: none; } }
`;
const ago = (t: string) => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60_000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };

export default function NotifyBell() {
  const router = useRouter();
  const path = usePathname();
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [ok, setOk] = useState(false);
  const [perm, setPerm] = useState<string>('unsupported');
  const seen = useRef<Set<string> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // already on Team tasks → just open the task; anywhere else → go there
  const go = useCallback((link: string) => {
    if (!link) return;
    if (window.location.pathname === '/tasks' && link.startsWith('/tasks')) { window.history.replaceState(null, '', link); window.dispatchEvent(new Event('cs-open-task')); }
    else router.push(link);
  }, [router]);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store' });
      if (!r.ok) { setOk(false); return; }
      const j = (await r.json()) as { items: Note[]; unread: number };
      setItems(j.items); setUnread(j.unread); setOk(true);
      // system notification for anything new since the last check
      if (seen.current && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        for (const n of j.items.filter((x) => !x.read && !seen.current!.has(x.id)).slice(0, 3)) {
          const sys = new Notification('Catalog Sync', { body: n.text, tag: n.id });
          sys.onclick = () => { window.focus(); go(n.link); };
        }
      }
      seen.current = new Set(j.items.map((x) => x.id));
    } catch { /* offline */ }
  }, [go]);

  useEffect(() => {
    if (path?.startsWith('/login')) return;
    if (typeof window !== 'undefined' && 'Notification' in window) setPerm(Notification.permission);
    load();
    const t = setInterval(load, 60_000);
    const f = () => load();
    window.addEventListener('focus', f);
    return () => { clearInterval(t); window.removeEventListener('focus', f); };
  }, [load, path]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const mark = (body: object) => fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(load);

  if (!ok || path?.startsWith('/login')) return null;
  return (
    <div className="nb" ref={box}>
      <style>{css}</style>
      <button className="nb-btn" onClick={() => setOpen(!open)} title="Notifications" aria-label="Notifications">🔔{unread > 0 && <span className="nb-count">{unread > 99 ? '99+' : unread}</span>}</button>
      {open && (
        <div className="nb-box">
          <div className="nb-head">
            <span>Notifications</span>
            {unread > 0 && <button onClick={() => mark({ action: 'readAll' })}>Mark all read</button>}
          </div>
          {perm === 'default' && <div style={{ padding: '8px 14px', fontSize: 12, borderBottom: '1px solid #f2f2f2' }}>Get a pop-up on this computer when something happens · <button className="nb-on" onClick={() => Notification.requestPermission().then(setPerm)}>Turn on</button></div>}
          {items.length === 0 ? <div className="nb-empty">Nothing yet</div> : items.map((n) => (
            <button key={n.id} className={`nb-item${n.read ? '' : ' new'}`} onClick={() => { if (!n.read) mark({ id: n.id }); setOpen(false); go(n.link); }}>
              <div>{n.text}</div>
              <div className="nb-when">{n.byName} · {ago(n.createdAt)}</div>
            </button>
          ))}
          <div style={{ padding: 10, textAlign: 'center' }}><button className="nb-on" onClick={() => { setOpen(false); router.push('/tasks'); }}>Open Team tasks →</button></div>
        </div>
      )}
    </div>
  );
}
