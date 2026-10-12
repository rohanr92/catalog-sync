'use client';
import { getJSON } from '@/lib/client-cache';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

interface Opt { key: string; label: string; color: string }
interface User { id: string; name: string; role: string; email?: string }
interface Group { id: string; name: string; color: string; position: number }
interface Check { id: string; text: string; done: boolean }
interface Task { id: string; groupId: string; title: string; description: string; status: string; priority: string; ownerId: string | null; dueDate: string | null; link: string; channelKey: string; checklist: Check[]; createdById: string; createdAt: string; updatedAt?: string; doneAt: string | null }
interface Hist { id: string; userId: string; userName: string; kind: string; text: string; createdAt: string }
interface Data { me: User; users: User[]; groups: Group[]; tasks: Task[]; comments: Record<string, number>; doneCount: number; statuses: Opt[]; priorities: Opt[]; channels: { key: string; name: string }[]; error?: string }
type PopKind = 'status' | 'priority' | 'owner' | 'date' | 'group';
interface PopState { kind: PopKind; taskId: string; x: number; y: number; w: number }

const css = `
.tk { padding: 22px 24px 60px; overflow-y: auto; min-width: 0; }
.tk h2 { font-size: 24px; font-weight: 800; margin: 0 0 2px; }
.tk-views { display: flex; gap: 2px; border-bottom: 1px solid var(--rule); margin: 12px 0 12px; overflow-x: auto; }
.tk-view { padding: 8px 14px; border: 0; background: none; font: inherit; font-size: 14px; cursor: pointer; color: var(--ink-3); border-bottom: 2px solid transparent; white-space: nowrap; }
.tk-view.on { color: #0073ea; border-bottom-color: #0073ea; font-weight: 600; }
.tk-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
.tk-new { background: #0073ea; color: #fff; border: 0; border-radius: 6px; padding: 9px 16px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.tk-new:hover { background: #0060c2; }
.tk-bar input[type=search] { padding: 8px 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; background: var(--paper); min-width: 170px; flex: 1; max-width: 260px; }
.tk-chip { display: inline-flex; gap: 6px; align-items: center; padding: 6px 10px; border: 1px solid var(--rule-strong); border-radius: 6px; background: var(--paper); font: inherit; font-size: 13px; cursor: pointer; color: inherit; }
.tk-chip.on { background: #cce5ff; border-color: #0073ea; color: #0060c2; }
.tk-people { display: flex; gap: 2px; align-items: center; }
.tk-people button { border: 2px solid transparent; border-radius: 50%; padding: 0; background: none; cursor: pointer; }
.tk-people button.on { border-color: #0073ea; }
.tk-group { margin-bottom: 30px; }
.tk-gh { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.tk-gh input { font: inherit; font-size: 17px; font-weight: 700; border: 1px solid transparent; background: transparent; border-radius: 4px; padding: 2px 4px; min-width: 120px; }
.tk-gh input:hover, .tk-gh input:focus { border-color: var(--rule-strong); background: var(--paper); }
.tk-gh .n { font-size: 12px; color: var(--ink-3); }
.tk-mini { background: none; border: 1px solid transparent; border-radius: 4px; cursor: pointer; color: var(--ink-3); font-size: 12px; padding: 2px 6px; }
.tk-mini:hover { border-color: var(--rule-strong); color: inherit; }
.tk-table { overflow-x: auto; border-radius: 8px; border: 1px solid var(--rule); background: var(--paper); }
.tk-table table { border-collapse: collapse; width: 100%; font-size: 13px; min-width: 900px; table-layout: fixed; }
.tk-table th { text-align: center; font-weight: 500; font-size: 12.5px; color: var(--ink-3); padding: 8px 6px; border-bottom: 1px solid var(--rule); border-left: 1px solid #eee; background: var(--paper); }
.tk-table th:first-child { text-align: left; border-left: 0; }
.tk-table td { border-bottom: 1px solid #e9e9ef; border-left: 1px solid #e9e9ef; padding: 0; height: 40px; text-align: center; }
.tk-table tr:hover td { background: #f5f6f8; }
.tk-name { padding: 0 8px 0 0 !important; text-align: left !important; position: sticky; left: 0; background: var(--paper); z-index: 1; cursor: pointer; }
.tk-name > div { display: flex; align-items: center; gap: 8px; height: 40px; }
.tk-name .stripe { width: 6px; align-self: stretch; flex: none; }
.tk-name .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-name .t.done { text-decoration: line-through; color: var(--ink-3); }
.tk-name .meta { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.tk-name .open { font-size: 11px; color: #0073ea; border: 1px solid #0073ea55; border-radius: 4px; padding: 1px 6px; opacity: 0; }
.tk-table tr:hover .open { opacity: 1; }
.tk-cell { width: 100%; height: 40px; border: 0; font: inherit; font-size: 13px; cursor: pointer; background: transparent; color: inherit; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 6px; }
.tk-cell.color { color: #fff; font-weight: 500; }
.tk-cell.color:hover { filter: brightness(.95); }
.tk-cell.late { color: #e2445c; font-weight: 700; }
.tk-av { width: 28px; height: 28px; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.tk-av.sm { width: 24px; height: 24px; font-size: 10px; }
.tk-add input { width: 100%; border: 0; background: transparent; font: inherit; font-size: 13px; padding: 0 12px; height: 40px; outline: none; }
.tk-pop { position: fixed; z-index: 80; background: var(--paper, #fff); border: 1px solid var(--rule, #e6e6e6); border-radius: 10px; box-shadow: 0 10px 34px rgba(0,0,0,.18); padding: 10px; }
.tk-labels { display: grid; gap: 6px; }
.tk-label { border: 0; border-radius: 4px; color: #fff; font: inherit; font-size: 13px; padding: 8px; cursor: pointer; text-align: center; }
.tk-label:hover { filter: brightness(.92); }
.tk-label.sel { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #0073ea; }
.tk-plist { max-height: 240px; overflow-y: auto; margin-top: 6px; }
.tk-pitem { display: flex; gap: 8px; align-items: center; width: 100%; border: 0; background: none; padding: 7px 6px; border-radius: 6px; font: inherit; font-size: 13px; cursor: pointer; text-align: left; color: inherit; }
.tk-pitem:hover { background: #f0f3ff; }
.tk-pitem.sel { background: #cce5ff; }
.tk-pop input[type=search], .tk-pop input[type=date] { width: 100%; box-sizing: border-box; padding: 7px 9px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; }
.tk-quick { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
.tk-quick button { border: 1px solid var(--rule-strong); background: var(--paper); border-radius: 6px; padding: 6px; font: inherit; font-size: 12px; cursor: pointer; color: inherit; }
.tk-kan { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 10px; align-items: flex-start; }
.tk-col { flex: 0 0 270px; background: #f5f6f8; border-radius: 10px; padding: 8px; min-height: 120px; }
.tk-col.over { outline: 2px dashed #0073ea; }
.tk-colh { color: #fff; font-weight: 600; font-size: 13px; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; display: flex; justify-content: space-between; }
.tk-card { background: var(--paper, #fff); border-radius: 8px; padding: 10px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); cursor: pointer; font-size: 13px; }
.tk-card:hover { box-shadow: 0 3px 10px rgba(0,0,0,.12); }
.tk-card .row { display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-3); }
.tk-tag { color: #fff; border-radius: 4px; padding: 1px 6px; font-size: 11px; }
.tk-colnew { width: 100%; border: 1px dashed var(--rule-strong); background: none; border-radius: 6px; padding: 7px; font: inherit; font-size: 12.5px; color: var(--ink-3); cursor: pointer; }
.tk-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 70; display: flex; align-items: flex-start; justify-content: center; padding: 6vh 12px; overflow-y: auto; }
.tk-modal { width: min(560px, 100%); background: var(--paper, #fff); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); padding: 20px 22px; }
.tk-modal h3 { margin: 0 0 14px; font-size: 18px; }
.tk-form { display: grid; grid-template-columns: 110px 1fr; gap: 10px 12px; align-items: center; font-size: 13px; }
.tk-form label { color: var(--ink-3); font-size: 12.5px; }
.tk-form input, .tk-form select, .tk-form textarea { padding: 8px 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; background: var(--paper); width: 100%; box-sizing: border-box; }
.tk-form textarea { min-height: 80px; resize: vertical; }
.tk-pick { display: flex; flex-wrap: wrap; gap: 6px; }
.tk-pick button { border: 0; border-radius: 4px; color: #fff; padding: 6px 10px; font: inherit; font-size: 12.5px; cursor: pointer; opacity: .55; }
.tk-pick button.sel { opacity: 1; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #0073ea; }
.tk-ppl { display: flex; flex-wrap: wrap; gap: 6px; }
.tk-ppl button { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--rule-strong); border-radius: 18px; padding: 3px 10px 3px 3px; background: var(--paper); font: inherit; font-size: 12.5px; cursor: pointer; color: inherit; }
.tk-ppl button.sel { border-color: #0073ea; background: #cce5ff; }
.tk-panel-bg { position: fixed; inset: 0; background: rgba(0,0,0,.25); z-index: 50; }
.tk-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(600px, 100%); background: var(--paper, #fff); z-index: 51; box-shadow: -8px 0 30px rgba(0,0,0,.12); display: flex; flex-direction: column; }
.tk-panel header { padding: 16px 62px 10px 18px; border-bottom: 1px solid var(--rule); display: flex; gap: 8px; align-items: flex-start; }
.tk-panel header input { flex: 1; font: inherit; font-size: 19px; font-weight: 700; border: 1px solid transparent; border-radius: 6px; padding: 4px 6px; background: transparent; }
.tk-panel header input:focus { border-color: var(--rule-strong); }
.tk-body { overflow-y: auto; padding: 14px 18px 30px; flex: 1; }
.tk-fields { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; align-items: center; font-size: 13px; margin-bottom: 14px; }
.tk-fields label { color: var(--ink-3); font-size: 12.5px; }
.tk-fields .tk-cell { border: 1px solid var(--rule-strong); border-radius: 6px; height: 36px; justify-content: flex-start; padding: 0 10px; }
.tk-fields .tk-cell.color { border: 0; justify-content: center; }
.tk-fields select, .tk-fields input { padding: 8px 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; background: var(--paper); width: 100%; box-sizing: border-box; }
.tk-h { font-size: 12px; font-weight: 700; color: var(--ink-3); text-transform: uppercase; letter-spacing: .04em; margin: 18px 0 8px; }
.tk-desc { width: 100%; min-height: 100px; box-sizing: border-box; padding: 10px; border: 1px solid var(--rule-strong); border-radius: 8px; font: inherit; font-size: 13px; resize: vertical; }
.tk-check { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.tk-check.done span { text-decoration: line-through; color: var(--ink-3); }
.tk-check span { flex: 1; }
.tk-row { display: flex; gap: 6px; }
.tk-row input { flex: 1; padding: 7px 9px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; }
.tk-hist { display: flex; gap: 8px; margin: 10px 0; font-size: 12.5px; }
.tk-hist .when { color: var(--ink-3); font-size: 11px; }
.tk-bubble { background: #f3f6fd; border: 1px solid #e3e9f7; border-radius: 8px; padding: 8px 10px; margin-top: 3px; white-space: pre-wrap; }
.tk-help { background: #f0f6ff; border: 1px solid #cce0ff; border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.6; margin-bottom: 14px; }
@media (max-width: 700px) { .tk { padding: 16px 10px 60px; } .tk-fields, .tk-form { grid-template-columns: 90px 1fr; } .tk-col { flex-basis: 82vw; } }
`;

const COLORS = ['#0073ea', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#037f4c', '#ff7575', '#579bfc', '#cab641', '#401694'];
const avColor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
const dayStr = (d: string | null) => (d ? d.slice(0, 10) : '');
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const todayStr = () => plusDays(0);
const nice = (d: string | null) => { if (!d) return ''; const s = dayStr(d); if (s === todayStr()) return 'Today'; if (s === plusDays(1)) return 'Tomorrow'; if (s === plusDays(-1)) return 'Yesterday'; return new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const ago = (t: string) => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60_000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const uid = () => Math.random().toString(36).slice(2, 10);

function Av({ u, sm }: { u: { id: string; name: string } | undefined; sm?: boolean }) {
  if (!u) return <span className={`tk-av${sm ? ' sm' : ''}`} style={{ background: '#d0d4e4' }} title="No one">👤</span>;
  return <span className={`tk-av${sm ? ' sm' : ''}`} title={u.name} style={{ background: avColor(u.id) }}>{initials(u.name)}</span>;
}

async function post(body: object) {
  const r = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `Server error ${r.status}` }));
  if (j.error) throw new Error(j.error);
  return j;
}

// one floating picker for the whole page (status / priority / person / date / group)
function Pop({ pop, width, onClose, children }: { pop: PopState; width: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', out);
    document.addEventListener('scroll', out, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('scroll', out, true); window.removeEventListener('resize', onClose); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  const left = Math.max(8, Math.min(pop.x + pop.w / 2 - width / 2, (typeof window !== 'undefined' ? window.innerWidth : 1200) - width - 8));
  const top = Math.max(8, Math.min(pop.y + 4, (typeof window !== 'undefined' ? window.innerHeight : 800) - 330));
  return <div ref={ref} className="tk-pop" style={{ left, top, width }}>{children}</div>;
}

export default function TasksPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'table' | 'kanban' | 'due'>('table');
  const [person, setPerson] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [pop, setPop] = useState<PopState | null>(null);
  const [pq, setPq] = useState('');
  const [creating, setCreating] = useState<Partial<Task> | null>(null);
  const [dragOver, setDragOver] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getJSON(`/api/tasks?done=${showDone ? 1 : 0}`, setData).catch((e: Error) => toast.error(e.message)).finally(() => setLoading(false));
  }, [showDone]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const read = () => { const id = new URLSearchParams(window.location.search).get('open'); if (id) { setOpenId(id); load(); } };
    read();
    window.addEventListener('cs-open-task', read);
    return () => window.removeEventListener('cs-open-task', read);
  }, [load]);
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { try { const v = localStorage.getItem('cs-tasks-view'); if (v === 'table' || v === 'kanban' || v === 'due') setView(v); } catch { /* ignore */ } }, []);
  const pickView = (v: 'table' | 'kanban' | 'due') => { setView(v); try { localStorage.setItem('cs-tasks-view', v); } catch { /* ignore */ } };

  async function act(body: object, okMsg?: string) {
    try { const j = await post(body); if (okMsg) toast.success(okMsg); load(); return j; } catch (e) { toast.error((e as Error).message); return null; }
  }
  const update = useCallback(async (id: string, patch: Partial<Task>) => {
    setData((d) => d && { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    try { await post({ action: 'update', id, patch }); load(); } catch (e) { toast.error((e as Error).message); load(); }
  }, [load]);

  const S = useMemo(() => Object.fromEntries((data?.statuses ?? []).map((s) => [s.key, s])), [data]);
  const P = useMemo(() => Object.fromEntries((data?.priorities ?? []).map((s) => [s.key, s])), [data]);
  const userBy = useMemo(() => new Map((data?.users ?? []).map((u) => [u.id, u])), [data]);
  const tasks = (data?.tasks ?? []).filter((t) =>
    (!person || (person === 'none' ? !t.ownerId : t.ownerId === person)) && (!status || t.status === status) &&
    (!q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase())));
  const today = todayStr();
  const openPop = (kind: PopKind, taskId: string, e: React.MouseEvent<HTMLElement>) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setPq(''); setPop({ kind, taskId, x: r.left, y: r.bottom, w: r.width }); };
  const closePop = useCallback(() => setPop(null), []);
  const popTask = pop ? data?.tasks.find((t) => t.id === pop.taskId) : undefined;

  const cells = (t: Task) => {
    const st = S[t.status], pr = P[t.priority];
    const late = !!t.dueDate && dayStr(t.dueDate) < today && t.status !== 'done';
    const owner = t.ownerId ? userBy.get(t.ownerId) : undefined;
    return {
      owner: <button className="tk-cell" onClick={(e) => openPop('owner', t.id, e)} title="Click to choose who does this"><Av u={owner} sm /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{owner?.name ?? ''}</span></button>,
      status: <button className="tk-cell color" style={{ background: st?.color }} onClick={(e) => openPop('status', t.id, e)}>{st?.label}</button>,
      priority: <button className="tk-cell color" style={{ background: pr?.color }} onClick={(e) => openPop('priority', t.id, e)}>{pr?.label}</button>,
      date: <button className={`tk-cell${late ? ' late' : ''}`} onClick={(e) => openPop('date', t.id, e)}>{t.dueDate ? <>{late ? '⚠ ' : ''}{nice(t.dueDate)}</> : <span style={{ color: '#bbb' }}>📅</span>}</button>,
    };
  };

  const row = (t: Task, g?: Group) => {
    const c = cells(t);
    const checks = t.checklist ?? [];
    return (
      <tr key={t.id}>
        <td className="tk-name" onClick={() => setOpenId(t.id)}>
          <div>
            <span className="stripe" style={{ background: g?.color ?? '#c4c4c4' }} />
            <span className={`t${t.status === 'done' ? ' done' : ''}`}>{t.title}</span>
            {checks.length > 0 && <span className="meta">☑ {checks.filter((x) => x.done).length}/{checks.length}</span>}
            {(data?.comments[t.id] ?? 0) > 0 && <span className="meta">💬 {data!.comments[t.id]}</span>}
            <span className="open">Open</span>
          </div>
        </td>
        <td>{c.owner}</td>
        <td>{c.status}</td>
        <td>{c.priority}</td>
        <td>{c.date}</td>
        <td><select className="tk-cell" style={{ textAlign: 'center' }} value={t.channelKey} onChange={(e) => update(t.id, { channelKey: e.target.value })}><option value="">—</option>{data!.channels.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></td>
      </tr>
    );
  };

  const head = (
    <colgroup><col style={{ width: '34%' }} /><col style={{ width: '17%' }} /><col style={{ width: '13%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '14%' }} /></colgroup>
  );
  const thead = <thead><tr><th style={{ paddingLeft: 14 }}>Task</th><th>Person</th><th>Status</th><th>Priority</th><th>Due date</th><th>Marketplace</th></tr></thead>;

  const buckets = useMemo(() => {
    const t0 = todayStr(), tom = plusDays(1), wk = plusDays(7);
    const b: { name: string; color: string; items: Task[] }[] = [
      { name: 'Overdue', color: '#e2445c', items: [] }, { name: 'Today', color: '#fdab3d', items: [] }, { name: 'Tomorrow', color: '#579bfc', items: [] },
      { name: 'Next 7 days', color: '#a25ddc', items: [] }, { name: 'Later', color: '#037f4c', items: [] }, { name: 'No due date', color: '#c4c4c4', items: [] },
    ];
    for (const t of tasks) {
      const d = dayStr(t.dueDate);
      const i = !d ? 5 : t.status !== 'done' && d < t0 ? 0 : d === t0 ? 1 : d === tom ? 2 : d <= wk ? 3 : 4;
      b[i].items.push(t);
    }
    for (const x of b) x.items.sort((a, c) => dayStr(a.dueDate).localeCompare(dayStr(c.dueDate)));
    return b;
  }, [tasks]);

  const open = data?.tasks.find((t) => t.id === openId) ?? null;
  const newTask = (extra: Partial<Task> = {}) => setCreating({ title: '', groupId: data?.groups[0]?.id, status: 'not_started', priority: 'medium', ownerId: person && person !== 'none' ? person : null, dueDate: null, channelKey: '', description: '', ...extra });

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="tk">
        <style>{css}</style>
        <h2>Team tasks</h2>

        <div className="tk-views">
          <button className={`tk-view${view === 'table' ? ' on' : ''}`} onClick={() => pickView('table')}>▦ Main table</button>
          <button className={`tk-view${view === 'kanban' ? ' on' : ''}`} onClick={() => pickView('kanban')}>▥ Kanban</button>
          <button className={`tk-view${view === 'due' ? ' on' : ''}`} onClick={() => pickView('due')}>🗓 Due dates</button>
        </div>

        <div className="tk-bar">
          <button className="tk-new" disabled={!data || !!data.error} onClick={() => newTask()}>+ New task</button>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search" />
          <div className="tk-people" title="Show one person's tasks">
            {(data?.users ?? []).map((u) => <button key={u.id} className={person === u.id ? 'on' : ''} onClick={() => setPerson(person === u.id ? '' : u.id)} title={u.name}><Av u={u} /></button>)}
          </div>
          <select className="tk-chip" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(data?.statuses ?? []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className={`tk-chip${showDone ? ' on' : ''}`} onClick={() => setShowDone(!showDone)}>✓ Show done{data ? ` (${data.doneCount})` : ''}</button>
          {view === 'table' && <button className="tk-chip" onClick={() => { const name = prompt('New group name (for example: Kohl\'s launch, Photos, This month)'); if (name?.trim()) act({ action: 'addGroup', name }); }}>+ New group</button>}
          {(person || status || q) && <button className="tk-chip" onClick={() => { setPerson(''); setStatus(''); setQ(''); }}>✕ Clear filters</button>}
          {(!data || loading) && <Spinner size={14} />}
        </div>

        {data && !data.error && data.tasks.length === 0 && (
          <div className="tk-help">
            <b>How it works</b><br />
            1. Click <b>+ New task</b> (or type in “+ Add task” under a group).<br />
            2. Choose the <b>person</b> who should do it, the <b>priority</b> and the <b>due date</b>. They get a 🔔 notification.<br />
            3. They change the <b>Status</b> (Working on it → Done). You get a 🔔 when it is done.<br />
            Click any coloured box in the table to change it. Click a task name to open details, checklist and updates.
          </div>
        )}

        {data?.error && <p style={{ color: '#b42318' }}>{data.error}</p>}

        {data && !data.error && view === 'table' && data.groups.map((g, gi) => {
          const items = tasks.filter((t) => t.groupId === g.id);
          return (
            <div key={g.id} className="tk-group">
              <div className="tk-gh">
                <button className="tk-mini" onClick={() => setCollapsed({ ...collapsed, [g.id]: !collapsed[g.id] })} style={{ color: g.color, fontSize: 14 }}>{collapsed[g.id] ? '▶' : '▼'}</button>
                <input defaultValue={g.name} style={{ color: g.color }} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== g.name) act({ action: 'renameGroup', id: g.id, name: e.target.value }); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                <span className="n">{items.length} task{items.length === 1 ? '' : 's'}</span>
                <button className="tk-mini" disabled={gi === 0} onClick={() => act({ action: 'moveGroup', id: g.id, dir: 'up' })} title="Move group up">↑</button>
                <button className="tk-mini" disabled={gi === data.groups.length - 1} onClick={() => act({ action: 'moveGroup', id: g.id, dir: 'down' })} title="Move group down">↓</button>
                {items.length === 0 && data.groups.length > 1 && <button className="tk-mini" onClick={() => { if (confirm(`Delete group "${g.name}"?`)) act({ action: 'deleteGroup', id: g.id }); }}>Delete group</button>}
              </div>
              {!collapsed[g.id] && (
                <div className="tk-table">
                  <table>
                    {head}{thead}
                    <tbody>
                      {items.map((t) => row(t, g))}
                      <tr className="tk-add"><td colSpan={6} style={{ textAlign: 'left', borderLeft: `6px solid ${g.color}66` }}>
                        <input placeholder="+ Add task" value={adding[g.id] ?? ''} onChange={(e) => setAdding({ ...adding, [g.id]: e.target.value })}
                          onKeyDown={async (e) => {
                            if (e.key !== 'Enter' || !(adding[g.id] ?? '').trim()) return;
                            const title = adding[g.id]; setAdding({ ...adding, [g.id]: '' });
                            const j = await act({ action: 'create', title, groupId: g.id, ownerId: person && person !== 'none' ? person : null });
                            if (j?.task?.id) toast.success('Task added — click the Person box to give it to someone');
                          }} />
                      </td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {data && !data.error && view === 'kanban' && (
          <div className="tk-kan">
            {data.statuses.map((s) => {
              const items = tasks.filter((t) => t.status === s.key);
              return (
                <div key={s.key} className={`tk-col${dragOver === s.key ? ' over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(s.key); }} onDragLeave={() => setDragOver('')}
                  onDrop={(e) => { e.preventDefault(); setDragOver(''); const id = e.dataTransfer.getData('text/task'); const t = data.tasks.find((x) => x.id === id); if (t && t.status !== s.key) update(id, { status: s.key }); }}>
                  <div className="tk-colh" style={{ background: s.color }}><span>{s.label}</span><span>{items.length}</span></div>
                  {items.map((t) => {
                    const late = !!t.dueDate && dayStr(t.dueDate) < today && t.status !== 'done';
                    const pr = P[t.priority];
                    return (
                      <div key={t.id} className="tk-card" draggable onDragStart={(e) => e.dataTransfer.setData('text/task', t.id)} onClick={() => setOpenId(t.id)}>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        <div className="row">
                          <Av u={t.ownerId ? userBy.get(t.ownerId) : undefined} sm />
                          {pr && <span className="tk-tag" style={{ background: pr.color }}>{pr.label}</span>}
                          {t.dueDate && <span style={late ? { color: '#e2445c', fontWeight: 700 } : undefined}>📅 {nice(t.dueDate)}</span>}
                          {(t.checklist ?? []).length > 0 && <span>☑ {t.checklist.filter((x) => x.done).length}/{t.checklist.length}</span>}
                          {(data.comments[t.id] ?? 0) > 0 && <span>💬 {data.comments[t.id]}</span>}
                        </div>
                      </div>
                    );
                  })}
                  <button className="tk-colnew" onClick={() => newTask({ status: s.key })}>+ Add task</button>
                </div>
              );
            })}
          </div>
        )}

        {data && !data.error && view === 'due' && buckets.filter((b) => b.items.length).map((b) => (
          <div key={b.name} className="tk-group">
            <div className="tk-gh"><b style={{ color: b.color, fontSize: 17 }}>{b.name}</b><span className="n">{b.items.length}</span></div>
            <div className="tk-table"><table>{head}{thead}<tbody>{b.items.map((t) => row(t, data.groups.find((g) => g.id === t.groupId)))}</tbody></table></div>
          </div>
        ))}
        {data && !data.error && view === 'due' && !tasks.length && <div className="cs-empty"><div className="e">🗓️</div><div className="t">No tasks</div></div>}

        {pop && popTask && data && (
          <Pop pop={pop} width={pop.kind === 'owner' ? 260 : pop.kind === 'date' ? 250 : 200} onClose={closePop}>
            {(pop.kind === 'status' || pop.kind === 'priority') && (
              <div className="tk-labels">
                {(pop.kind === 'status' ? data.statuses : data.priorities).map((o) => {
                  const cur = pop.kind === 'status' ? popTask.status : popTask.priority;
                  return <button key={o.key} className={`tk-label${cur === o.key ? ' sel' : ''}`} style={{ background: o.color }} onClick={() => { update(popTask.id, pop.kind === 'status' ? { status: o.key } : { priority: o.key }); closePop(); }}>{o.label}</button>;
                })}
              </div>
            )}
            {pop.kind === 'owner' && (
              <>
                <input type="search" autoFocus placeholder="Search names" value={pq} onChange={(e) => setPq(e.target.value)} />
                <div className="tk-plist">
                  {data.users.filter((u) => !pq || `${u.name} ${u.email ?? ''}`.toLowerCase().includes(pq.toLowerCase())).map((u) => (
                    <button key={u.id} className={`tk-pitem${popTask.ownerId === u.id ? ' sel' : ''}`} onClick={() => { update(popTask.id, { ownerId: u.id }); closePop(); }}>
                      <Av u={u} sm /><span style={{ flex: 1 }}>{u.name}{u.id === data.me.id ? ' (you)' : ''}</span>{popTask.ownerId === u.id && '✓'}
                    </button>
                  ))}
                  {popTask.ownerId && <button className="tk-pitem" style={{ color: '#b42318' }} onClick={() => { update(popTask.id, { ownerId: null }); closePop(); }}>✕ Remove person</button>}
                  {data.users.length <= 1 && <div className="status-line" style={{ padding: 6 }}>Only you are here. Add your team under <b>Users</b> in the menu, then pick them here.</div>}
                </div>
              </>
            )}
            {pop.kind === 'date' && (
              <>
                <input type="date" autoFocus defaultValue={dayStr(popTask.dueDate)} onChange={(e) => { const v = e.target.value; if (v && Number(v.slice(0, 4)) >= 2020) { update(popTask.id, { dueDate: v }); closePop(); } }} />
                <div className="tk-quick">
                  <button onClick={() => { update(popTask.id, { dueDate: plusDays(0) }); closePop(); }}>Today</button>
                  <button onClick={() => { update(popTask.id, { dueDate: plusDays(1) }); closePop(); }}>Tomorrow</button>
                  <button onClick={() => { update(popTask.id, { dueDate: plusDays(7) }); closePop(); }}>In 1 week</button>
                  <button onClick={() => { update(popTask.id, { dueDate: null }); closePop(); }}>No date</button>
                </div>
              </>
            )}
          </Pop>
        )}

        {creating && data && !data.error && <NewTaskModal data={data} init={creating} onClose={() => setCreating(null)} onCreate={async (t) => { const j = await act({ action: 'create', ...t }, 'Task created'); if (j) setCreating(null); }} />}
        {open && data && <TaskPanel key={open.id} task={open} data={data} S={S} P={P} openPop={openPop} onClose={() => { setOpenId(null); const u = new URL(window.location.href); u.searchParams.delete('open'); window.history.replaceState(null, '', u); }} update={update} act={act} />}
      </section>
    </main>
  );
}

function NewTaskModal({ data, init, onClose, onCreate }: { data: Data; init: Partial<Task>; onClose: () => void; onCreate: (t: Partial<Task>) => Promise<void> }) {
  const [t, setT] = useState<Partial<Task>>(init);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Task>) => setT({ ...t, ...p });
  const submit = async () => { if (!t.title?.trim()) { toast.error('Write what needs to be done'); return; } setBusy(true); await onCreate(t); setBusy(false); };
  return (
    <div className="tk-modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tk-modal">
        <h3>New task</h3>
        <div className="tk-form">
          <label>Task *</label>
          <input autoFocus value={t.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="For example: Fix Kohl's images for CLAR Burgundy" onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          <label>Give it to</label>
          <div className="tk-ppl">
            {data.users.map((u) => <button key={u.id} type="button" className={t.ownerId === u.id ? 'sel' : ''} onClick={() => set({ ownerId: t.ownerId === u.id ? null : u.id })}><Av u={u} sm />{u.name}{u.id === data.me.id ? ' (you)' : ''}</button>)}
          </div>
          <label>Priority</label>
          <div className="tk-pick">{data.priorities.map((p) => <button key={p.key} type="button" className={t.priority === p.key ? 'sel' : ''} style={{ background: p.color }} onClick={() => set({ priority: p.key })}>{p.label}</button>)}</div>
          <label>Status</label>
          <div className="tk-pick">{data.statuses.map((p) => <button key={p.key} type="button" className={t.status === p.key ? 'sel' : ''} style={{ background: p.color }} onClick={() => set({ status: p.key })}>{p.label}</button>)}</div>
          <label>Due date</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" style={{ maxWidth: 170 }} value={dayStr(t.dueDate ?? null)} onChange={(e) => set({ dueDate: e.target.value || null })} />
            <button type="button" className="tk-chip" onClick={() => set({ dueDate: plusDays(0) })}>Today</button>
            <button type="button" className="tk-chip" onClick={() => set({ dueDate: plusDays(1) })}>Tomorrow</button>
            <button type="button" className="tk-chip" onClick={() => set({ dueDate: plusDays(7) })}>1 week</button>
          </div>
          <label>Group</label>
          <select value={t.groupId} onChange={(e) => set({ groupId: e.target.value })}>{data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <label>Marketplace</label>
          <select value={t.channelKey ?? ''} onChange={(e) => set({ channelKey: e.target.value })}><option value="">—</option>{data.channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
          <label>Details</label>
          <textarea value={t.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="What exactly needs to be done, links, style codes…" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="tk-new" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create task'}</button>
        </div>
      </div>
    </div>
  );
}

function TaskPanel({ task, data, S, P, openPop, onClose, update, act }: { task: Task; data: Data; S: Record<string, Opt>; P: Record<string, Opt>; openPop: (k: PopKind, id: string, e: React.MouseEvent<HTMLElement>) => void; onClose: () => void; update: (id: string, p: Partial<Task>) => Promise<void>; act: (b: object, ok?: string) => Promise<unknown> }) {
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [desc, setDesc] = useState(task.description);
  const [title, setTitle] = useState(task.title);
  const [newCheck, setNewCheck] = useState('');
  const [msg, setMsg] = useState('');
  const loadHist = useCallback(() => { fetch(`/api/tasks?task=${task.id}`).then((r) => r.json()).then((j) => setHist(j.history ?? [])).catch(() => setHist([])); }, [task.id]);
  useEffect(() => { loadHist(); }, [loadHist, task]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.tk-pop')) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const checks = task.checklist ?? [];
  const setChecks = (c: Check[]) => update(task.id, { checklist: c }).then(loadHist);
  const up = (p: Partial<Task>) => update(task.id, p).then(loadHist);
  const owner = data.users.find((u) => u.id === task.ownerId);
  const creator = data.users.find((u) => u.id === task.createdById);
  const late = !!task.dueDate && dayStr(task.dueDate) < todayStr() && task.status !== 'done';

  return (
    <>
      <div className="tk-panel-bg" onClick={onClose} />
      <aside className="tk-panel">
        <header>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== task.title && up({ title })} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          <button className="btn" onClick={onClose}>✕</button>
        </header>
        <div className="tk-body">
          <div className="tk-fields">
            <label>Person</label>
            <button className="tk-cell" onClick={(e) => openPop('owner', task.id, e)}><Av u={owner} sm />{owner?.name ?? <span style={{ color: '#999' }}>Choose a person</span>}</button>
            <label>Status</label>
            <button className="tk-cell color" style={{ background: S[task.status]?.color }} onClick={(e) => openPop('status', task.id, e)}>{S[task.status]?.label}</button>
            <label>Priority</label>
            <button className="tk-cell color" style={{ background: P[task.priority]?.color }} onClick={(e) => openPop('priority', task.id, e)}>{P[task.priority]?.label}</button>
            <label>Due date</label>
            <button className={`tk-cell${late ? ' late' : ''}`} onClick={(e) => openPop('date', task.id, e)}>📅 {task.dueDate ? nice(task.dueDate) : <span style={{ color: '#999' }}>Choose a date</span>}</button>
            <label>Group</label>
            <select value={task.groupId} onChange={(e) => up({ groupId: e.target.value })}>{data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
            <label>Marketplace</label>
            <select value={task.channelKey} onChange={(e) => up({ channelKey: e.target.value })}><option value="">—</option>{data.channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
            <label>Link</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input defaultValue={task.link} placeholder="Paste a page link or style code" onBlur={(e) => e.target.value !== task.link && up({ link: e.target.value })} />
              {task.link && <a className="btn" href={/^https?:|^\//.test(task.link) ? task.link : `/catalog?q=${encodeURIComponent(task.link)}`} target={/^https?:/.test(task.link) ? '_blank' : undefined} rel="noreferrer">Open</a>}
            </div>
          </div>
          <div className="status-line">Created by {creator?.name ?? '—'} · {ago(task.createdAt)}{task.doneAt ? ` · Done ${ago(task.doneAt)}` : ''}</div>

          <div className="tk-h">Details</div>
          <textarea className="tk-desc" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== task.description && up({ description: desc })} placeholder="What exactly needs to be done, links, style codes…" />

          <div className="tk-h">Checklist {checks.length ? `· ${checks.filter((c) => c.done).length}/${checks.length}` : ''}</div>
          {checks.map((c) => (
            <div key={c.id} className={`tk-check${c.done ? ' done' : ''}`}>
              <input type="checkbox" checked={c.done} onChange={() => setChecks(checks.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
              <span>{c.text}</span>
              <button className="tk-mini" onClick={() => setChecks(checks.filter((x) => x.id !== c.id))}>✕</button>
            </div>
          ))}
          <div className="tk-row"><input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Add a step" onKeyDown={(e) => { if (e.key === 'Enter' && newCheck.trim()) { setChecks([...checks, { id: uid(), text: newCheck.trim(), done: false }]); setNewCheck(''); } }} />
            <button className="btn" onClick={() => { if (newCheck.trim()) { setChecks([...checks, { id: uid(), text: newCheck.trim(), done: false }]); setNewCheck(''); } }}>Add</button></div>

          <div className="tk-h">Updates</div>
          <textarea className="tk-desc" style={{ minHeight: 60 }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write an update or a question — everyone on this task gets a 🔔" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="tk-new" disabled={!msg.trim()} onClick={async () => { await act({ action: 'comment', id: task.id, text: msg }); setMsg(''); loadHist(); }}>Post update</button>
          </div>
          <div className="tk-h">Activity</div>
          {hist === null ? <Spinner size={14} /> : hist.map((h) => (
            <div key={h.id} className="tk-hist">
              <Av u={{ id: h.userId, name: h.userName }} sm />
              <div style={{ flex: 1 }}>
                <div><b>{h.userName}</b> {h.kind === 'comment' ? 'wrote' : h.text} <span className="when">· {ago(h.createdAt)}</span></div>
                {h.kind === 'comment' && <div className="tk-bubble">{h.text}</div>}
              </div>
            </div>
          ))}

          <div style={{ marginTop: 28, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
            <button className="btn" style={{ color: '#b42318' }} onClick={async () => { if (confirm(`Delete "${task.title}"? This can't be undone.`)) { await act({ action: 'delete', id: task.id }, 'Task deleted'); onClose(); } }}>Delete task</button>
          </div>
        </div>
      </aside>
    </>
  );
}
