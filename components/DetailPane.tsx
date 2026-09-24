'use client';

import type { Group } from '@/lib/types';

interface Props {
  group: Group | null;
  allowedSizes: string[];
  channelKey: string;
  channelName: string;
  onApprove: (ids: string[]) => void;
  onReject: (ids: string[]) => void;
  onIgnore: (ids: string[]) => void;
  onEditImages: (group: Group) => void;
  onReload: () => void;
}

const sourceLabel: Record<string, string> = { manual: 'you set', siblings: 'from existing sizes', default: 'default table', list: 'from marketplace list', none: 'no mapping' };

export default function DetailPane({ group: g, allowedSizes, channelKey, channelName, onApprove, onReject, onIgnore, onEditImages, onReload }: Props) {
  if (!g) return <aside className="detail"><p className="empty">Pick a colour to see its sizes and what will be sent.</p></aside>;

  const blocked = g.validation === 'blocked';
  const ids = g.sizes.map((s) => s.changeId);
  const keys = Object.keys(g.sizes[0]?.outputRow ?? {}).filter((k) => g.sizes.some((s) => s.outputRow[k]));
  const isShoe = /^shoes/i.test(g.category);
  const issues = g.sizes[0]?.issues ?? [];

  async function override(sourceSize: string, targetSize: string) {
    await fetch('/api/sizes', { method: 'POST', body: JSON.stringify({ channel: channelKey, style: g!.styleCode, sourceSize, targetSize }) });
    onReload();
  }

  return (
    <aside className="detail">
      <header className="detail-head">
        <h3 className="detail-title">{g.title}</h3>
        <span className="detail-id">{g.styleCode} · {g.color} · {g.sizes.length} sizes</span>
      </header>

      <div className="detail-body">
        {blocked && <div className="section"><p className="notice">{g.blockedReason}</p></div>}
        {(g.possibleDuplicates?.length ?? 0) > 0 && <div className="section"><div style={{ fontSize: 13, background: "#fde8e6", color: "#b42318", padding: "10px 12px", borderRadius: 6 }}><b style={{ fontWeight: 600 }}>Possible duplicate on {channelName}.</b> These sizes already look listed on {channelName} under a different UPC. Approving would list them a second time:<ul style={{ margin: "6px 0 10px", paddingLeft: 18 }}>{g.possibleDuplicates!.map((d) => <li key={d.nordstromUpc} style={{ fontFamily: "var(--mono)", fontSize: 12 }}>Size {d.size}: Nordstrom {d.nordstromUpc}, on {channelName} as {d.upc}{d.sku ? " (" + d.sku + ")" : ""}</li>)}</ul><button className="btn" onClick={async () => { await fetch("/api/upc-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ignore", channel: channelKey, gtins: g.possibleDuplicates!.map((d) => d.nordstromUpc) }) }); onReload(); }}>Keep these sizes out of the queue</button></div></div>}
        {g.nordstromProcessing && <div className="section"><p style={{ margin: 0, fontSize: 13, background: "#fdf1dc", color: "#8a5a00", padding: "10px 12px", borderRadius: 6 }}>Nordstrom is still processing the import this came from. If Nordstrom rejects it, it is removed from here automatically — you may want to wait before approving.</p></div>}

        <div className="section">
          <p className="section-label">Built from</p>
          <p style={{ margin: 0, fontSize: 13 }}>
            {g.basis === 'same-colour' && <>{channelName}&apos;s existing <b style={{ fontWeight: 500 }}>{g.color}</b> rows for this style. Only UPC, SKU and size change.</>}
            {g.basis === 'other-colour' && <>{channelName}&apos;s rows for another colour of this style (<code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{g.basisSku}</code>). Colour and images swapped in.</>}
            {g.basis === 'same-category' && <>This style is <b style={{ fontWeight: 500 }}>not on {channelName}</b> yet. Built on {channelName}&apos;s existing rows of the same category, with this product&apos;s own title, description, colour, size, images and features from Nordstrom.</>}
            {g.basis === 'none' && <>Nordstrom&apos;s data, every column filled through the attribute mapping for this category.</>}
            {g.sizes[0]?.note && <span style={{ color: 'var(--ink-3)' }}> {g.sizes[0].note}</span>}
          </p>
          {issues.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--alert)' }}>
              {issues.map((i) => <li key={i}>{i}</li>)}
            </ul>
          )}
        </div>

        <div className="section">
          <p className="section-label">Sizes{isShoe ? ` — Nordstrom → ${channelName}` : ''}</p>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {g.sizes.map((s) => (
                <tr key={s.changeId}>
                  <td style={{ padding: '3px 10px 3px 0', fontFamily: 'var(--mono)' }}>{s.size}</td>
                  {isShoe && (
                    <>
                      <td style={{ padding: '3px 6px', color: 'var(--ink-3)' }}>→</td>
                      <td style={{ padding: '3px 6px' }}>
                        <select value={s.channelSize} onChange={(e) => e.target.value && override(s.size, e.target.value)}
                          style={{ width: 130, padding: '4px 8px', border: `1px solid ${s.sizeSource === 'none' ? 'var(--alert)' : 'var(--rule-strong)'}`, borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 13, background: 'var(--paper)' }}>
                          <option value="">{allowedSizes.length ? 'Pick a size' : 'No list loaded'}</option>
                          {(allowedSizes.length ? allowedSizes : [s.channelSize]).map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '3px 6px' }}><span className={`status-line${s.sizeSource === 'none' ? ' fail' : ''}`}>{sourceLabel[s.sizeSource] ?? s.sizeSource}</span></td>
                    </>
                  )}
                  {!isShoe && s.channelSize && s.channelSize !== s.size && <td style={{ padding: '3px 6px', color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>→ {s.channelSize}</td>}
                  <td style={{ padding: '3px 6px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>{s.gtin}</td>
                  <td style={{ padding: '3px 0 3px 6px' }}>
                    <button className="filter" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => onIgnore([s.changeId])}>Ignore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {g.changeType === 'updated' && g.diffs.length > 0 && (
          <div className="section">
            <p className="section-label">What changed on Nordstrom</p>
            {g.diffs.map((d) => (
              <div className="diff" key={d.field}>
                <div className="diff-field">{d.label}</div>
                {d.before && <div className="diff-old">{d.before}</div>}
                <div className="diff-new">{d.after}</div>
              </div>
            ))}
          </div>
        )}

        <div className="section">
          <p className="section-label">Images for {g.color} — shared by all sizes</p>
          <div className="imgs">
            {g.images.map((url, i) => (
              <figure className="img-slot" key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" />
                <figcaption className="img-note">{i === 0 ? 'Primary' : `Image ${i + 1}`}</figcaption>
              </figure>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => onEditImages(g)}>Edit images for this colour</button>
        </div>

        <div className="section">
          <p className="section-label">Rows that will be sent to {channelName} — {keys.length} columns</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11.5, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
              <thead><tr>{keys.map((k) => <th key={k} style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--rule)', color: 'var(--ink-3)', fontWeight: 500 }}>{k}</th>)}</tr></thead>
              <tbody>
                {g.sizes.map((s) => (
                  <tr key={s.changeId}>{keys.map((k) => <td key={k} style={{ padding: '4px 8px', borderBottom: '1px solid var(--rule)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.outputRow[k]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <footer className="actions">
        <button className="btn primary" disabled={blocked || (isShoe && g.sizes.some((s) => s.sizeSource === 'none'))} onClick={() => onApprove(ids)}>
          {blocked ? 'Fix the block first' : `Approve ${g.sizes.length} sizes`}
        </button>
        <button className="btn" onClick={() => onIgnore(ids)}>Ignore</button>
        <button className="btn" onClick={() => onReject(ids)}>Skip</button>
      </footer>
    </aside>
  );
}
