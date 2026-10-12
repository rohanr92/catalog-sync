'use client';
import { getJSON } from '@/lib/client-cache';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import Spinner from '@/components/Spinner';

type Action = 'images' | 'swatch' | 'default' | 'map' | 'copy';
interface Rule { id: string; column: string; action: Action; value?: string; from?: string; codes: string[]; label: string; enabled: boolean; applied: number; createdAt: string }
interface ErrGroup { sig: string; code: string; column: string; columnLabel: string; message: string; count: number; lastSeen: string; suggest: Action; ruleId: string | null }
interface Data { errors: ErrGroup[]; rules: Rule[]; columns: { code: string; label: string }[]; error?: string }
interface Preview { on: boolean; items: number; total: number; byColumn: Record<string, { label: string; count: number; sources: Record<string, number> }>; sample: { upc: string; title: string; column: string; label: string; value: string; source: string }[] }
interface Draft { id?: string; column: string; action: Action; value: string; from: string; codes: string[]; label: string }

const ACTIONS: { key: Action; label: string; help: string }[] = [
  { key: 'images', label: 'Fill images from Nordstrom', help: 'When the main image is empty, use the Nordstrom images for that UPC.' },
  { key: 'swatch', label: 'Make the swatch automatically', help: 'When the swatch is empty, make one from the colour (the same way as Auto from primary).' },
  { key: 'default', label: 'Fill empty with a value', help: 'When this column is empty, put this value.' },
  { key: 'map', label: 'Replace a value', help: 'When this column has the first value, change it to the second. Leave "when it is" empty to always set it.' },
  { key: 'copy', label: 'Copy from another column', help: 'When this column is empty, copy what is in another column of the same row.' },
];
const actionLabel = (a: Action) => ACTIONS.find((x) => x.key === a)?.label ?? a;

const css = `
.fx { padding: 22px 24px 40px; overflow-y: auto; min-width: 0; }
.fx h2 { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
.fx-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 14px 0; }
.fx-tab { padding: 6px 14px; border-radius: 16px; border: 1px solid var(--rule); background: var(--paper); cursor: pointer; font: inherit; font-size: 13px; color: inherit; }
.fx-tab.on { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.fx-card { border: 1px solid var(--rule); border-radius: 10px; background: var(--paper); margin-bottom: 18px; overflow: hidden; }
.fx-card > header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--rule); background: #fafafa; }
.fx-card > header h3 { margin: 0; font-size: 15px; flex: 1; }
.fx-row { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-bottom: 1px solid #f1f1f1; flex-wrap: wrap; }
.fx-row:last-child { border-bottom: 0; }
.fx-count { flex: none; min-width: 46px; padding: 4px 8px; border-radius: 8px; background: #fde8e6; color: #b42318; font-weight: 800; text-align: center; font-size: 14px; }
.fx-main { flex: 1; min-width: 220px; font-size: 13px; }
.fx-main .m { font-weight: 600; }
.fx-main .s { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
.fx-ok { font-size: 12px; font-weight: 600; color: #16713f; background: #e3f5ea; padding: 4px 10px; border-radius: 6px; }
.fx-form { width: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; padding: 12px; background: #f7f5ff; border-radius: 8px; margin-top: 4px; }
.fx-form label { font-size: 11px; color: var(--ink-3); display: flex; flex-direction: column; gap: 4px; }
.fx-form select, .fx-form input { padding: 7px 8px; border: 1px solid var(--rule-strong); border-radius: 6px; font: inherit; font-size: 13px; background: #fff; color: inherit; }
.fx-form .help { grid-column: 1 / -1; font-size: 12px; color: #4b3fb3; }
.fx-form .btns { grid-column: 1 / -1; display: flex; gap: 8px; }
.fx-rule-off { opacity: 0.5; }
@media (max-width: 700px) { .fx { padding: 16px 12px 40px; } }
`;

function RuleForm({ channel, columns, draft, onDone }: { channel: string; columns: { code: string; label: string }[]; draft: Draft; onDone: (saved: boolean) => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const needsColumn = !['images', 'swatch'].includes(d.action);
  const valueIsColumn = d.action === 'copy';

  useEffect(() => {
    if (!needsColumn || !d.column || valueIsColumn) { setValues([]); return; }
    getJSON(`/api/fix-rules?channel=${channel}&values=${encodeURIComponent(d.column)}`, (j) => setValues(j.values ?? [])).catch(() => setValues([]));
  }, [channel, d.column, needsColumn, valueIsColumn]);

  async function save() {
    setBusy(true);
    try {
      const r = await fetch('/api/fix-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, action: 'save', rule: d }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast.success('Rule saved — it runs on every send from now on');
      onDone(true);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  const listId = `fxv-${d.column}`;
  return (
    <div className="fx-form">
      <label>Fix
        <select value={d.action} onChange={(e) => setD({ ...d, action: e.target.value as Action })}>
          {ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
      </label>
      {needsColumn && (
        <label>Column
          <select value={d.column} onChange={(e) => setD({ ...d, column: e.target.value })}>
            <option value="">Pick a column…</option>
            {columns.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.code})</option>)}
          </select>
        </label>
      )}
      {d.action === 'map' && (
        <label>When it is (empty = always)
          <input value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} list={listId} placeholder="current value" />
        </label>
      )}
      {needsColumn && (
        <label>{d.action === 'copy' ? 'Copy from column' : d.action === 'map' ? 'Change it to' : 'Value'}
          {valueIsColumn
            ? <select value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })}><option value="">Pick a column…</option>{columns.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.code})</option>)}</select>
            : <input value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} list={listId} placeholder={values.length ? `${values.length} accepted values — start typing` : 'value'} />}
        </label>
      )}
      <datalist id={listId}>{values.slice(0, 1500).map((v) => <option key={v} value={v} />)}</datalist>
      <div className="help">{ACTIONS.find((a) => a.key === d.action)?.help}</div>
      <div className="btns">
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save rule'}</button>
        <button className="btn" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </div>
  );
}

export default function FixRulesPage() {
  const [channels, setChannels] = useState<{ key: string; name: string }[]>([]);
  const [channel, setChannel] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<string | null>(null); // error sig or 'new'
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState<Preview | null>(null);

  useEffect(() => {
    getJSON('/api/channels', (j) => {
      const cs = (j.channels ?? []) as { key: string; name: string }[];
      setChannels(cs);
      const want = new URLSearchParams(window.location.search).get('channel');
      setChannel(cs.find((c) => c.key === want)?.key ?? cs[0]?.key ?? '');
    });
  }, []);

  const load = useCallback(() => {
    if (!channel) return;
    setData(null); setPrev(null);
    getJSON(`/api/fix-rules?channel=${channel}&preview=1`, (j) => setPrev(j.error ? null : j)).catch(() => setPrev(null));
    getJSON(`/api/fix-rules?channel=${channel}`, setData).catch(() => setData({ errors: [], rules: [], columns: [], error: 'Could not load' }));
  }, [channel]);
  useEffect(load, [load]);

  async function post(body: object) {
    const r = await fetch('/api/fix-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, ...body }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  }
  async function reapprove() {
    if (!confirm('Put every rejected item on this marketplace back to "approved"? The fixes are applied when it sends.')) return;
    setBusy(true);
    try { const j = await post({ action: 'reapprove' }); toast.success(`${j.count} item(s) re-approved — send them from Send & results`); load(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  async function toggleSmart(on: boolean) {
    try { await post({ action: 'smart', on }); toast.success(on ? 'Smart fix on' : 'Smart fix off'); load(); } catch (e) { toast.error((e as Error).message); }
  }
  async function fixLiveNow() {
    if (!confirm('Fill missing images and required values on every live listing from your other products? This only makes drafts — you review and approve them under Edit products.')) return;
    setBusy(true);
    const t = toast.loading('Looking through your live listings…');
    try { const j = await post({ action: 'fixLive' }); toast.success(`${j.fills} value(s) filled on ${j.drafted} colour(s) — review and approve them under ${name} → Edit products`, { id: t }); }
    catch (e) { toast.error((e as Error).message, { id: t }); }
    setBusy(false);
  }

  const name = channels.find((c) => c.key === channel)?.name ?? channel;
  const colLabel = (code: string) => data?.columns.find((c) => c.code === code)?.label ?? code;
  const describe = (r: Rule) =>
    r.action === 'images' ? 'Main image empty → fill images from Nordstrom'
    : r.action === 'swatch' ? 'Swatch empty → make it automatically'
    : r.action === 'default' ? `${colLabel(r.column)} empty → "${r.value}"`
    : r.action === 'map' ? `${colLabel(r.column)} ${r.from ? `"${r.from}"` : '(any value)'} → "${r.value}"`
    : `${colLabel(r.column)} empty → copy from ${colLabel(r.value ?? '')}`;

  return (
    <main className="shell" style={{ gridTemplateColumns: 'var(--rail) minmax(0, 1fr)' }}>
      <Rail />
      <section className="fx">
        <style>{css}</style>
        <h2>Auto-fix rules</h2>
        <p className="status-line">Smart fix fills empty images, swatches and required values from your other products automatically. For anything it can&apos;t work out, set a rule once and every send to {name || 'that marketplace'} fixes it before the file goes out.</p>

        <div className="fx-tabs">
          {channels.map((c) => <button key={c.key} className={`fx-tab${c.key === channel ? ' on' : ''}`} onClick={() => { setChannel(c.key); setOpen(null); }}>{c.name}</button>)}
        </div>

        {!data ? <div className="loading-block"><Spinner /> Reading {name} error reports…</div> : data.error ? <p style={{ color: '#b42318' }}>{data.error}</p> : (
          <>
            <div className="fx-card" style={{ borderColor: '#c9bfff' }}>
              <header style={{ background: '#f7f5ff' }}>
                <h3>✨ Smart fix — automatic, no rules needed</h3>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={prev?.on ?? true} onChange={(e) => toggleSmart(e.target.checked)} /> On for {name}
                </label>
                <button className="btn primary" disabled={busy} onClick={fixLiveNow}>Fix live listings</button>
              </header>
              <div style={{ padding: '12px 16px', fontSize: 13 }}>
                <p style={{ margin: '0 0 8px' }}>Before every send, anything empty is filled by looking at your other products — in this order:</p>
                <ol style={{ margin: '0 0 10px', paddingLeft: 20, lineHeight: 1.7 }}>
                  <li><b>Images</b> — the same colour&apos;s other sizes, then your saved image set, then Nordstrom&apos;s images for that UPC.</li>
                  <li><b>Swatch</b> — the same colour&apos;s other sizes, then the saved swatch, then made automatically from the main image.</li>
                  <li><b>Required columns</b> — the same colour&apos;s other sizes, then the same style&apos;s other colours (never colour or size fields), then what 60%+ of that category&apos;s listings on {name} use (never descriptions).</li>
                </ol>
                <p className="status-line" style={{ margin: 0 }}>Your own rules below run first. <b>Fix live listings</b> does the same for products already live on {name} and saves drafts for you to approve.</p>
                {!prev ? <div className="loading-block" style={{ padding: '10px 0' }}><Spinner size={12} /> Checking waiting items…</div> : (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{prev.total ? `On the next send: ${prev.total} value(s) filled across ${prev.items} waiting or rejected row(s)` : `Nothing to fill on the ${prev.items} waiting or rejected row(s) right now`}</div>
                    {Object.entries(prev.byColumn).map(([code, c]) => (
                      <div key={code} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '4px 0', borderTop: '1px solid #f1f1f1' }}>
                        <span style={{ minWidth: 160, fontWeight: 500 }}>{c.label}</span>
                        <span className="fx-ok" style={{ background: '#ece9fd', color: '#4b3fb3' }}>{c.count}×</span>
                        {Object.entries(c.sources).map(([src, n]) => <span key={src} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: '#f3f3f3' }}>{n} from {src}</span>)}
                      </div>
                    ))}
                    {prev.sample.length > 0 && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 12 }}>See each value</summary>
                        <div style={{ maxHeight: 260, overflowY: 'auto', fontSize: 12, marginTop: 6 }}>
                          {prev.sample.map((f, i) => <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}><b>{f.title || f.upc}</b> · {f.label}: <span style={{ fontFamily: 'var(--mono)' }}>{f.value.length > 60 ? f.value.slice(0, 60) + '…' : f.value}</span> <span className="status-line">— {f.source}</span></div>)}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="fx-card">
              <header>
                <h3>Errors from recent {name} sends</h3>
                <button className="btn" disabled={busy} onClick={reapprove}>Re-approve rejected items</button>
              </header>
              {data.errors.length === 0 && <div className="cs-empty"><div className="e">✅</div><div className="t">No errors in recent sends</div><div className="s">When {name} rejects rows, the errors show up here grouped.</div></div>}
              {data.errors.map((g) => (
                <div key={g.sig} className="fx-row">
                  <div className="fx-count" title="rows">{g.count}×</div>
                  <div className="fx-main">
                    <div className="m">{g.message}</div>
                    <div className="s">{g.code && <>{g.code} · </>}{g.column ? <>Column: {g.columnLabel}{g.columnLabel !== g.column ? ` (${g.column})` : ''} · </> : null}last seen {new Date(g.lastSeen).toLocaleString()}</div>
                  </div>
                  {g.ruleId ? <span className="fx-ok">✓ Rule on</span>
                    : (prev?.on !== false && (g.suggest === 'images' || g.suggest === 'swatch' || (g.column && prev?.byColumn[g.column]))) ? <span className="fx-ok" style={{ background: '#ece9fd', color: '#4b3fb3' }}>✓ Smart fix handles this</span>
                    : open !== g.sig && <button className="btn primary" onClick={() => setOpen(g.sig)}>Make rule</button>}
                  {open === g.sig && (
                    <RuleForm channel={channel} columns={data.columns}
                      draft={{ column: g.column, action: g.suggest, value: '', from: '', codes: [g.sig, ...(g.code ? [g.code] : [])], label: g.message }}
                      onDone={(saved) => { setOpen(null); if (saved) load(); }} />
                  )}
                </div>
              ))}
            </div>

            <div className="fx-card">
              <header>
                <h3>Rules for {name}</h3>
                {open !== 'new' && <button className="btn" onClick={() => setOpen('new')}>+ Add rule</button>}
              </header>
              {open === 'new' && <div className="fx-row"><RuleForm channel={channel} columns={data.columns} draft={{ column: '', action: 'default', value: '', from: '', codes: [], label: 'Added by hand' }} onDone={(saved) => { setOpen(null); if (saved) load(); }} /></div>}
              {data.rules.length === 0 && open !== 'new' && <p className="status-line" style={{ padding: 16 }}>No rules yet — Smart fix covers most errors. Click <b>Make rule</b> only on an error it can&apos;t handle.</p>}
              {data.rules.map((r) => (
                <div key={r.id} className={`fx-row${r.enabled ? '' : ' fx-rule-off'}`}>
                  <div className="fx-main">
                    <div className="m">{describe(r)}</div>
                    <div className="s">{actionLabel(r.action)} · fixed {r.applied ?? 0} row{r.applied === 1 ? '' : 's'} so far{r.label ? ` · from: ${r.label.slice(0, 90)}` : ''}</div>
                  </div>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={r.enabled} onChange={async () => { await post({ action: 'toggle', id: r.id }); load(); }} /> On
                  </label>
                  <button className="btn" onClick={async () => { if (confirm('Delete this rule?')) { await post({ action: 'delete', id: r.id }); load(); } }}>Delete</button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
