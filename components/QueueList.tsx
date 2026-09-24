'use client';

import type { ReactNode } from 'react';
import type { Group } from '@/lib/types';
import Pagination, { usePaged } from "./Pagination";

export type Filter = 'all' | 'fresh' | 'missing' | 'blocked' | 'ignored';

interface Props {
  title: string;
  groups: Group[];
  selectedKey: string | null;
  checked: Set<string>;
  filter: Filter;
  counts: Record<Filter, number>;
  onFilter: (f: Filter) => void;
  onSelect: (key: string) => void;
  onCheck: (key: string, on: boolean) => void;
  onCheckAll: (on: boolean) => void;
  onApproveChecked: () => void;
  onIgnoreChecked: () => void;
  onMakeSwatches?: () => void;
  onDownload: () => void;
  onPreview: () => void;
  ignoredView?: ReactNode;
}

const filters: Filter[] = ['all', 'fresh', 'missing', 'blocked', 'ignored'];

export default function QueueList(p: Props) {
  const { title, groups, selectedKey, checked, filter, counts } = p;
  const labels: Record<Filter, string> = { all: 'All', fresh: 'New on Nordstrom', missing: `Missing on ${title}`, blocked: 'Blocked', ignored: 'Ignored' };
  const checkable = groups.filter((g) => g.validation === 'valid');
  const allChecked = checkable.length > 0 && checkable.every((g) => checked.has(g.key));
  const checkedSizes = groups.filter((g) => checked.has(g.key)).reduce((n, g) => n + g.sizes.length, 0);
  const inIgnored = filter === 'ignored';
  const { pageItems, pager } = usePaged(groups, filter + "|" + title);

  return (
    <section className="list">
      <header className="list-head" style={{ flexWrap: 'wrap', height: 'auto', minHeight: 52, padding: '8px 16px', gap: 10 }}>
        <h2 className="list-title">{title}</h2>
        <div className="filters">
          {filters.map((f) => (
            <button key={f} className="filter" aria-pressed={filter === f} onClick={() => p.onFilter(f)}>
              {labels[f]} <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: f === 'blocked' && counts[f] ? 'var(--alert)' : f === 'fresh' && counts[f] ? '#4b3fb3' : 'var(--ink-3)' }}>{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="spacer" />
        {!inIgnored && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={allChecked} onChange={(e) => p.onCheckAll(e.target.checked)} /> Select all ready
            </label>
            <button className="btn" onClick={p.onPreview} disabled={checked.size === 0 && !selectedKey}>Preview sheet</button>
            <button className="btn" onClick={p.onDownload} disabled={checked.size === 0}>Download sheet</button>
            {p.onMakeSwatches && <button className="btn" onClick={p.onMakeSwatches}>Make missing swatches</button>}
            <button className="btn" onClick={p.onIgnoreChecked} disabled={checked.size === 0}>Ignore</button>
            <button className="btn" onClick={p.onApproveChecked} disabled={checked.size === 0}>
              Approve {checked.size} {checked.size === 1 ? 'colour' : 'colours'}{checkedSizes ? ` (${checkedSizes} sizes)` : ''}
            </button>
          </>
        )}
      </header>

      <div className="rows">
        {inIgnored ? p.ignoredView : (
          <>
            {groups.length === 0 && <p className="empty">Nothing here.</p>}
            {pageItems.map((g) => (
              <div key={g.key} className="row" role="button" aria-selected={g.key === selectedKey} onClick={() => p.onSelect(g.key)} style={{ gridTemplateColumns: '18px 26px 1fr 130px 72px 88px', cursor: 'pointer' }}>
                <input type="checkbox" checked={checked.has(g.key)} onClick={(e) => e.stopPropagation()} onChange={(e) => p.onCheck(g.key, e.target.checked)} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="row-thumb" src={g.thumb} alt="" />
                <span className="row-main">
                  <span className="row-title">{g.title}</span><br />
                  <span className="row-id">{g.styleCode} · {g.color}</span>{g.nordstromProcessing && <span style={{ marginLeft: 8, display: "inline-flex", padding: "1px 7px", borderRadius: 4, fontSize: 10.5, fontWeight: 600, background: "#fdf1dc", color: "#8a5a00" }}>Nordstrom: still processing</span>}{g.possibleDuplicates?.length ? <span style={{ marginLeft: 8, display: "inline-flex", padding: "1px 7px", borderRadius: 4, fontSize: 10.5, fontWeight: 600, background: "#fde8e6", color: "#b42318" }}>Possible duplicate · {g.possibleDuplicates.length} size{g.possibleDuplicates.length === 1 ? "" : "s"}</span> : null}
                </span>
                <span>{g.newOnNordstrom
                  ? <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: '#ece9fd', color: '#4b3fb3' }}>New on Nordstrom</span>
                  : <span className="row-kind">Missing here</span>}</span>
                <span className="row-kind">{g.sizes.length} {g.sizes.length === 1 ? 'size' : 'sizes'}</span>
                <span>{g.validation === 'blocked' ? <span className="tag blocked">Blocked</span> : <span className="tag ready">Ready</span>}</span>
              </div>
            ))}
            {groups.length > 0 && <Pagination {...pager} />}
          </>
        )}
      </div>
    </section>
  );
}
