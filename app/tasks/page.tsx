'use client';
import { getJSON } from '@/lib/client-cache';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

interface Opt { key: string; label: string; color: string }
interface User { id: string; name: string; role: string }
interface Group { id: string; name: string; color: string; position: number }
interface Check { id: string; text: string; done: boolean }
interface Task { id: string; groupId: string; title: string; description: string; status: string; priority: string; ownerId: string | null; dueDate: string | null; link: string; channelKey: string; checklist: Check[]; createdById: string; createdAt: string; doneAt: string | null }
interface Hist { id: string; userId: string; userName: string; kind: string; text: string; createdAt: string }
interface Data { me: User; users: User[]; groups: Group[]; tasks: Task[]; comments: Record<string, number>; doneCount: number; statuses: Opt[]; priorities: Opt[]; channels: { key: string; name: string }[]; error?: string }

const css = `
.tk { padding: 22px 24px 60px; overflow-y: auto; min-width: 0; }
.tk h2 { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
.tk-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 14px 0; }
.tk-bar input[type=search], .tk-bar select { padding: 7px 10px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; background: var(--paper); }
.tk-bar input[type=search] { min-width: 180px; flex: 1; max-width: 280px; }
.tk-tab { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--rule-strong); background: var(--paper); font: inherit; font-size: 13px; cursor: pointer; color: inherit; }
.tk-tab.on { background: #0073ea; border-color: #0073ea; color: #fff; }
.tk-group { margin-bottom: 26px; }
.tk-gh { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.tk-gh input { font: inherit; font-size: 16px; font-weight: 700; border: 1px solid transparent; background: transparent; border-radius: 4px; padding: 2px 4px; min-width: 120px; }
.tk-gh input:hover, .tk-gh input:focus { border-color: var(--rule-strong); background: var(--paper); }
.tk-gh .n { font-size: 12px; color: var(--ink-3); }
.tk-mini { background: none; border: 1px solid transparent; border-radius: 4px; cursor: pointer; color: var(--ink-3); font-size: 12px; padding: 2px 6px; }
.tk-mini:hover { border-color: var(--rule-strong); color: inherit; }
.tk-table { overflow-x: auto; border-radius: 8px; border: 1px solid var(--rule); background: var(--paper); }
.tk-table table { border-collapse: collapse; width: 100%; font-size: 13px; min-width: 860px; }
.tk-table th { text-align: center; font-weight: 500; font-size: 12px; color: var(--ink-3); padding: 7px 6px; border-bottom: 1px solid var(--rule); background: #fafafa; }
.tk-table th:first-child { text-align: left; }
.tk-table td { border-bottom: 1px solid #eee; border-left: 1px solid #f1f1f1; padding: 0; height: 40px; text-align: center; }
.tk-table tr:hover td { background: #f7f9ff; }
.tk-name { display: flex; align-items: center; gap: 8px; padding: 0 10px !important; text-align: left !important; min-width: 280px; position: sticky; left: 0; background: var(--paper); z-index: 1; cursor: pointer; }
.tk-name .stripe { width: 5px; align-self: stretch; margin-left: -10px; }
.tk-name .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tk-name .t.done { text-decoration: line-through; color: var(--ink-3); }
.tk-name .meta { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.tk-sel { width: 100%; height: 40px; border: 0; font: inherit; font-size: 12.5px; text-align: center; text-align-last: center; cursor: pointer; appearance: none; -webkit-appearance: none; padding: 0 6px; background: transparent; color: inherit; }
.tk-sel.color { color: #fff; font-weight: 600; }
.tk-sel option { color: #222; background: #fff; }
.tk-date { border: 0; background: transparent; font: inherit; font-size: 12.5px; text-align: center; height: 40px; width: 100%; cursor: pointer; color: inherit; }
.tk-date.late { color: #e2445c; font-weight: 700; }
.tk-av { width: 26px; height: 26px; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.tk-owner { display: flex; align-items: center; gap: 6px; padding: 0 8px; }
.tk-owner select { flex: 1; min-width: 0; }
.tk-add td { height: 38px; }
.tk-add input { width: 100%; border: 0; background: transparent; font: inherit; font-size: 13px; padding: 0 12px; height: 38px; outline: none; }
.tk-panel-bg { position: fixed; inset: 0; background: rgba(0,0,0,.25); z-index: 50; }
.tk-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 100%); background: var(--paper, #fff); z-index: 51; box-shadow: -8px 0 30px rgba(0,0,0,.12); display: flex; flex-direction: column; }
.tk-panel header { padding: 16px 62px 10px 18px; border-bottom: 1px solid var(--rule); display: flex; gap: 8px; align-items: flex-start; }
.tk-panel header input { flex: 1; font: inherit; font-size: 18px; font-weight: 700; border: 1px solid transparent; border-radius: 6px; padding: 4px 6px; background: transparent; }
.tk-panel header input:focus { border-color: var(--rule-strong); }
.tk-body { overflow-y: auto; padding: 14px 18px 30px; flex: 1; }
.tk-fields { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; align-items: center; font-size: 13px; margin-bottom: 16px; }
.tk-fields label { color: var(--ink-3); font-size: 12px; }
.tk-fields select, .tk-fields input { padding: 7px 9px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; background: var(--paper); width: 100%; box-sizing: border-box; }
.tk-pill { color: #fff !important; font-weight: 600; border: 0 !important; }
.tk-h { font-size: 12px; font-weight: 700; color: var(--ink-3); text-transform: uppercase; letter-spacing: .04em; margin: 18px 0 8px; }
.tk-desc { width: 100%; min-height: 110px; box-sizing: border-box; padding: 10px; border: 1px solid var(--rule-strong); border-radius: 8px; font: inherit; font-size: 13px; resize: vertical; }
.tk-check { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.tk-check.done span { text-decoration: line-through; color: var(--ink-3); }
.tk-check span { flex: 1; }
.tk-row { display: flex; gap: 6px; }
.tk-row input { flex: 1; padding: 7px 9px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; }
.tk-hist { display: flex; gap: 8px; margin: 10px 0; font-size: 12.5px; }
.tk-hist .when { color: var(--ink-3); font-size: 11px; }
.tk-bubble { background: #f3f6fd; border: 1px solid #e3e9f7; border-radius: 8px; padding: 8px 10px; margin-top: 3px; white-space: pre-wrap; }
.tk-dim { opacity: .5; pointer-events: none; }
@media (max-width: 700px) { .tk { padding: 16px 10px 60px; } .tk-fields { grid-template-columns: 90px 1fr; } }
`;

const COLORS = ['#0073ea', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#037f4c', '#ff7575', '#579bfc', '#cab641', '#401694'];
const avColor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
const dayStr = (d: string | null) => (d ? d.slice(0, 10) : '');
const todayStr = () => new Date().toISOString().slice(0, 10);
const ago = (t: string) => { const m = Math.round((Date.now() - new Date(t).getTime()) / 60_000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const okDate = (v: string) => !v || Number(v.slice(0, 4)) >= 2020; // don't save half-typed years
const uid = () => Math.random().toString(36).slice(2, 10);

function Av({ u }: { u: { id: string; name: string } | undefined }) {
  if (!u) return <span className="tk-av" style={{ background: '#d0d4e4' }}>–</span>;
  return <span className="tk-av" title={u.name} style={{ background: avColor(u.id) }}>{initials(u.name)}</span>;
}

async function post(body: object) {
  const r = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `Server error ${r.status}` }));
  if (j.error) throw new Error(j.error);
  return j;
}

export default function TasksPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'board' | 'due'>('board');
  const [person, setPerson] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});

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

  async function act(body: object, okMsg?: string) {
    try { await post(body); if (okMsg) toast.success(okMsg); load(); } catch (e) { toast.error((e as Error).message); }
  }
  const update = async (id: string, patch: Partial<Task>, save = true) => {
    setData((d) => d && { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    if (save) await act({ action: 'update', id, patch });
  };

  const S = useMemo(() => Object.fromEntries((data?.statuses ?? []).map((s) => [s.key, s])), [data]);
  const P = useMemo(() => Object.fromEntries((data?.priorities ?? []).map((s) => [s.key, s])), [data]);
  const userBy = useMemo(() => new Map((data?.users ?? []).map((u) => [u.id, u])), [data]);
  const tasks = (data?.tasks ?? []).filter((t) =>
    (!person || (person === 'none' ? !t.ownerId : t.ownerId === person)) && (!status || t.status === status) &&
    (!q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase())));

  const today = todayStr();
  const row = (t: Task, g?: Group) => {
    const st = S[t.status], pr = P[t.priority];
    const late = !!t.dueDate && dayStr(t.dueDate) < today && t.status !== 'done';
    const checks = t.checklist ?? [];
    return (
      <tr key={t.id}>
        <td className="tk-name" onClick={() => setOpenId(t.id)}>
          <span className="stripe" style={{ background: g?.color ?? '#c4c4c4' }} />
          <span className={`t${t.status === 'done' ? ' done' : ''}`}>{t.title}</span>
          {checks.length > 0 && <span className="meta">☑ {checks.filter((c) => c.done).length}/{checks.length}</span>}
          {(data?.comments[t.id] ?? 0) > 0 && <span className="meta">💬 {data!.comments[t.id]}</span>}
        </td>
        <td style={{ width: 170 }}>
          <div className="tk-owner"><Av u={t.ownerId ? userBy.get(t.ownerId) : undefined} />
            <select className="tk-sel" style={{ textAlign: 'left', textAlignLast: 'left' }} value={t.ownerId ?? ''} onChange={(e) => update(t.id, { ownerId: e.target.value || null })}>
              <option value="">No owner</option>
              {data!.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </td>
        <td style={{ width: 150, background: st?.color }}>
          <select className="tk-sel color" value={t.status} onChange={(e) => update(t.id, { status: e.target.value })}>
            {data!.statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </td>
        <td style={{ width: 120, background: pr?.color }}>
          <select className="tk-sel color" value={t.priority} onChange={(e) => update(t.id, { priority: e.target.value })}>
            {data!.priorities.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </td>
        <td style={{ width: 140 }}>
          <input type="date" className={`tk-date${late ? ' late' : ''}`} value={dayStr(t.dueDate)} onChange={(e) => update(t.id, { dueDate: e.target.value || null }, okDate(e.target.value))} title={late ? 'Overdue' : ''} />
        </td>
        <td style={{ width: 130 }}>
          <select className="tk-sel" value={t.channelKey} onChange={(e) => update(t.id, { channelKey: e.target.value })}>
            <option value="">—</option>
            {data!.channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
        </td>
      </tr>
    );
  };

  const head = <thead><tr><th style={{ textAlign: 'left', paddingLeft: 14 }}>Task</th><th>Owner</th><th>Status</th><th>Priority</th><th>Due date</th><th>Marketplace</th></tr></thead>;

  const buckets = useMemo(() => {
    const t0 = todayStr();
    const tom = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const wk = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
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

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="tk">
        <style>{css}</style>
        <h2>Team tasks</h2>
        <p className="status-line">Click a status, owner, priority or date to change it. Click a task name to open details, checklist and comments. Everyone involved gets a 🔔 notification.</p>

        <div className="tk-bar">
          <button className={`tk-tab${view === 'board' ? ' on' : ''}`} onClick={() => setView('board')}>Board</button>
          <button className={`tk-tab${view === 'due' ? ' on' : ''}`} onClick={() => setView('due')}>Due dates</button>
          <button className={`tk-tab${person === data?.me.id ? ' on' : ''}`} onClick={() => setPerson(person === data?.me.id ? '' : data?.me.id ?? '')}>My tasks</button>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" />
          <select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Everyone</option>
            <option value="none">No owner</option>
            {(data?.users ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Every status</option>
            {(data?.statuses ?? []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done{data ? ` (${data.doneCount})` : ''}</label>
          {view === 'board' && <button className="btn primary" onClick={() => { const name = prompt('Group name'); if (name?.trim()) act({ action: 'addGroup', name }); }}>+ New group</button>}
          {(!data || loading) && <Spinner size={14} />}
        </div>

        {data?.error && <p style={{ color: '#b42318' }}>{data.error}</p>}
        {data && !data.error && view === 'board' && data.groups.map((g, gi) => {
          const items = tasks.filter((t) => t.groupId === g.id);
          return (
            <div key={g.id} className="tk-group">
              <div className="tk-gh">
                <button className="tk-mini" onClick={() => setCollapsed({ ...collapsed, [g.id]: !collapsed[g.id] })} style={{ color: g.color, fontSize: 14 }}>{collapsed[g.id] ? '▶' : '▼'}</button>
                <input defaultValue={g.name} style={{ color: g.color }} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== g.name) act({ action: 'renameGroup', id: g.id, name: e.target.value }); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                <span className="n">{items.length} task{items.length === 1 ? '' : 's'}</span>
                <button className="tk-mini" disabled={gi === 0} onClick={() => act({ action: 'moveGroup', id: g.id, dir: 'up' })} title="Move group up">↑</button>
                <button className="tk-mini" disabled={gi === data.groups.length - 1} onClick={() => act({ action: 'moveGroup', id: g.id, dir: 'down' })} title="Move group down">↓</button>
                {items.length === 0 && <button className="tk-mini" onClick={() => { if (confirm(`Delete group "${g.name}"?`)) act({ action: 'deleteGroup', id: g.id }); }}>Delete group</button>}
              </div>
              {!collapsed[g.id] && (
                <div className={`tk-table${loading ? '' : ''}`}>
                  <table>
                    {head}
                    <tbody>
                      {items.map((t) => row(t, g))}
                      <tr className="tk-add"><td colSpan={6} style={{ textAlign: 'left', borderLeft: `5px solid ${g.color}55` }}>
                        <input placeholder="+ Add task (type and press Enter)" value={adding[g.id] ?? ''} onChange={(e) => setAdding({ ...adding, [g.id]: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (adding[g.id] ?? '').trim()) { act({ action: 'create', title: adding[g.id], groupId: g.id, ownerId: person && person !== 'none' ? person : null }); setAdding({ ...adding, [g.id]: '' }); } }} />
                      </td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {data && !data.error && view === 'due' && buckets.filter((b) => b.items.length).map((b) => (
          <div key={b.name} className="tk-group">
            <div className="tk-gh"><b style={{ color: b.color, fontSize: 16 }}>{b.name}</b><span className="n">{b.items.length}</span></div>
            <div className="tk-table"><table>{head}<tbody>{b.items.map((t) => row(t, data.groups.find((g) => g.id === t.groupId)))}</tbody></table></div>
          </div>
        ))}
        {data && !data.error && view === 'due' && !tasks.length && <div className="cs-empty"><div className="e">🗓️</div><div className="t">No tasks</div></div>}

        {open && data && <TaskPanel key={open.id} task={open} data={data} S={S} P={P} onClose={() => { setOpenId(null); const u = new URL(window.location.href); u.searchParams.delete('open'); window.history.replaceState(null, '', u); }} update={update} act={act} />}
      </section>
    </main>
  );
}

function TaskPanel({ task, data, S, P, onClose, update, act }: { task: Task; data: Data; S: Record<string, Opt>; P: Record<string, Opt>; onClose: () => void; update: (id: string, p: Partial<Task>, save?: boolean) => Promise<void>; act: (b: object, ok?: string) => Promise<void> }) {
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [desc, setDesc] = useState(task.description);
  const [title, setTitle] = useState(task.title);
  const [newCheck, setNewCheck] = useState('');
  const [msg, setMsg] = useState('');
  const loadHist = useCallback(() => { fetch(`/api/tasks?task=${task.id}`).then((r) => r.json()).then((j) => setHist(j.history ?? [])).catch(() => setHist([])); }, [task.id]);
  useEffect(() => { loadHist(); }, [loadHist, task]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const checks = task.checklist ?? [];
  const setChecks = (c: Check[]) => update(task.id, { checklist: c }).then(loadHist);
  const up = (p: Partial<Task>) => update(task.id, p).then(loadHist);
  const owner = data.users.find((u) => u.id === task.ownerId);
  const creator = data.users.find((u) => u.id === task.createdById);

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
            <label>Status</label>
            <select className="tk-pill" style={{ background: S[task.status]?.color }} value={task.status} onChange={(e) => up({ status: e.target.value })}>{data.statuses.map((s) => <option key={s.key} value={s.key} style={{ color: '#222', background: '#fff' }}>{s.label}</option>)}</select>
            <label>Owner</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Av u={owner} /><select value={task.ownerId ?? ''} onChange={(e) => up({ ownerId: e.target.value || null })}><option value="">No owner</option>{data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <label>Priority</label>
            <select className="tk-pill" style={{ background: P[task.priority]?.color }} value={task.priority} onChange={(e) => up({ priority: e.target.value })}>{data.priorities.map((s) => <option key={s.key} value={s.key} style={{ color: '#222', background: '#fff' }}>{s.label}</option>)}</select>
            <label>Due date</label>
            <input type="date" value={dayStr(task.dueDate)} onChange={(e) => update(task.id, { dueDate: e.target.value || null }, okDate(e.target.value)).then(loadHist)} />
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

          <div className="tk-h">What needs to be done</div>
          <textarea className="tk-desc" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== task.description && up({ description: desc })} placeholder="Describe the task: what, where, any details…" />

          <div className="tk-h">Checklist {checks.length ? `· ${checks.filter((c) => c.done).length}/${checks.length}` : ''}</div>
          {checks.map((c) => (
            <div key={c.id} className={`tk-check${c.done ? ' done' : ''}`}>
              <input type="checkbox" checked={c.done} onChange={() => setChecks(checks.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
              <span>{c.text}</span>
              <button className="tk-mini" onClick={() => setChecks(checks.filter((x) => x.id !== c.id))}>✕</button>
            </div>
          ))}
          <div className="tk-row"><input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Add a checklist item" onKeyDown={(e) => { if (e.key === 'Enter' && newCheck.trim()) { setChecks([...checks, { id: uid(), text: newCheck.trim(), done: false }]); setNewCheck(''); } }} />
            <button className="btn" onClick={() => { if (newCheck.trim()) { setChecks([...checks, { id: uid(), text: newCheck.trim(), done: false }]); setNewCheck(''); } }}>Add</button></div>

          <div className="tk-h">Updates</div>
          <div className="tk-row" style={{ alignItems: 'flex-start' }}>
            <textarea className="tk-desc" style={{ minHeight: 60 }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write an update or question — everyone on this task is notified" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn primary" disabled={!msg.trim()} onClick={async () => { await act({ action: 'comment', id: task.id, text: msg }); setMsg(''); loadHist(); }}>Post update</button>
          </div>
          {hist === null ? <Spinner size={14} /> : hist.map((h) => (
            <div key={h.id} className="tk-hist">
              <Av u={{ id: h.userId, name: h.userName }} />
              <div style={{ flex: 1 }}>
                <div><b>{h.userName}</b> {h.kind === 'comment' ? '' : h.text} <span className="when">· {ago(h.createdAt)}</span></div>
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
