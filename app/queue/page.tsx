'use client';

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from 'swr';
import { toast } from 'sonner';
import Rail from '@/components/Shell';
import QueueList, { type Filter } from '@/components/QueueList';
import DetailPane from '@/components/DetailPane';
import ImagePanel from '@/components/ImagePanel';
import SheetPreview from '@/components/SheetPreview';
import IgnoredList, { type IgnoredGroup } from '@/components/IgnoredList';
import Spinner from '@/components/Spinner';
import { postJson } from '@/lib/fetcher';
import type { Group } from '@/lib/types';

interface QueueData { groups: Group[]; allowedSizes: string[] }
const names: Record<string, string> = { macys: "Macy's", kohls: "Kohl's", jcpenney: 'JCPenney', debenhams: 'Debenhams', targetplus: 'Target Plus' };

function QueueInner() {
  const channel = useSearchParams().get('channel') ?? '';
  const name = names[channel] ?? channel;
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [imagesFor, setImagesFor] = useState<Group | null>(null);
  const [sheetIds, setSheetIds] = useState<string[] | null>(null);
  const [lastChannel, setLastChannel] = useState(channel);
  if (lastChannel !== channel) { setLastChannel(channel); setSelectedKey(null); setChecked(new Set()); }

  const { data, error, mutate } = useSWR<QueueData>(channel ? `/api/queue?channel=${channel}` : null);
  const { data: ign, mutate: mutateIgnored } = useSWR<{ groups: IgnoredGroup[] }>(channel ? `/api/ignored?channel=${channel}` : null);
  const { data: ch } = useSWR<{ channels: { key: string; name: string }[] }>('/api/channels');
  const groups = data?.groups ?? [];
  const otherChannels = (ch?.channels ?? []).filter((c) => c.key !== channel);
  const router = useRouter();
  useEffect(() => { if (!channel && ch?.channels?.[0]) router.replace("/queue?channel=" + ch.channels[0].key); }, [channel, ch, router]);

  const counts: Record<Filter, number> = {
    all: groups.length,
    fresh: groups.filter((g) => g.newOnNordstrom).length,
    missing: groups.filter((g) => !g.newOnNordstrom).length,
    blocked: groups.filter((g) => g.validation === "blocked").length,
    ignored: ign?.groups.length ?? 0,
  };
  const visible = useMemo(() => groups.filter((g) => filter === "all" ? true : filter === "fresh" ? !!g.newOnNordstrom : filter === "missing" ? !g.newOnNordstrom : filter === "blocked" ? g.validation === "blocked" : false), [groups, filter]);
  const selected = visible.find((g) => g.key === selectedKey) ?? null;
  const idsOf = (list: Group[]) => list.flatMap((g) => g.sizes.map((s) => s.changeId));

  function without(ids: string[]): QueueData | undefined {
    if (!data) return data;
    const done = new Set(ids);
    return { ...data, groups: data.groups.map((g) => ({ ...g, sizes: g.sizes.filter((s) => !done.has(s.changeId)) })).filter((g) => g.sizes.length) };
  }

  async function decide(ids: string[], approval: 'approved' | 'rejected') {
    const ready = approval === 'approved' ? ids.filter((id) => groups.some((g) => g.validation === 'valid' && g.sizes.some((s) => s.changeId === id))) : ids;
    if (!ready.length) { toast.error('Only Ready colours can be approved'); return; }
    const next = without(ready);
    setChecked(new Set());
    try {
      await mutate(async () => { await postJson('/api/queue', { ids: ready, approval }); return next; }, { optimisticData: next, rollbackOnError: true, revalidate: false });
      toast.success(approval === 'approved' ? `Approved ${ready.length} size${ready.length === 1 ? '' : 's'}` : `Skipped ${ready.length}`);
    } catch (e) { toast.error((e as Error).message); }
  }

  async function ignore(ids: string[]) {
    if (!ids.length) return;
    const next = without(ids);
    setChecked(new Set());
    try {
      await mutate(async () => { await postJson('/api/ignored', { channel, action: 'ignore', changeIds: ids }); return next; }, { optimisticData: next, rollbackOnError: true, revalidate: false });
      mutateIgnored();
      toast.success(`Ignored ${ids.length} size${ids.length === 1 ? '' : 's'} on ${name}`);
    } catch (e) { toast.error((e as Error).message); }
  }

  async function revert(gtins: string[]) {
    try {
      const j = await postJson('/api/ignored', { channel, action: 'revert', gtins });
      await Promise.all([mutate(), mutateIgnored()]);
      toast.success(`Reverted ${gtins.length} size${gtins.length === 1 ? '' : 's'} — ${j.requeued} back in the queue`);
    } catch (e) { toast.error((e as Error).message); }
  }

  async function download() {
    const ids = idsOf(groups.filter((g) => checked.has(g.key)));
    if (!ids.length) return;
    const t = toast.loading(`Building ${name} sheet…`);
    try {
      const res = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, changeIds: ids }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Server error ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? `${channel}.xlsx`;
      a.click();
      toast.success(`Downloaded ${ids.length} rows`, { id: t });
    } catch (e) { toast.error((e as Error).message, { id: t }); }
  }

  async function makeSwatches() {
    const t = toast.loading('Making missing swatches…');
    try {
      const j = await postJson('/api/swatch', { bulk: true, channel });
      toast.success(`Swatches made: ${j.done}${j.failed ? `, failed: ${j.failed}` : ''}`, { id: t });
      mutate();
    } catch (e) { toast.error((e as Error).message, { id: t }); }
  }

  if (!channel) return <><section className="list"><div className="loading-block"><Spinner /> Opening your first marketplace…</div></section><aside className="detail" /></>;

  if (!data) {
    return (
      <>
        <section className="list">
          <div className="loading-block">
            {error
              ? <>Could not load {name}. <button className="btn" onClick={() => mutate()}>Retry</button></>
              : <><Spinner /> Loading {name}… the first load builds every row, after that it is instant.</>}
          </div>
        </section>
        <aside className="detail" />
      </>
    );
  }

  return (
    <>
      <QueueList
        title={name}
        groups={visible}
        selectedKey={selectedKey}
        checked={checked}
        filter={filter}
        counts={counts}
        onFilter={(f) => { setFilter(f); setChecked(new Set()); }}
        onSelect={setSelectedKey}
        onCheck={(k, on) => setChecked((prev) => { const n = new Set(prev); if (on) n.add(k); else n.delete(k); return n; })}
        onCheckAll={(on) => setChecked(on ? new Set(visible.filter((g) => g.validation === 'valid').map((g) => g.key)) : new Set())}
        onApproveChecked={() => decide(idsOf(groups.filter((g) => checked.has(g.key))), 'approved')}
        onIgnoreChecked={() => ignore(idsOf(groups.filter((g) => checked.has(g.key))))}
        onMakeSwatches={['macys', 'jcpenney', 'debenhams'].includes(channel) ? makeSwatches : undefined}
        onPreview={() => { const from = checked.size ? groups.filter((g) => checked.has(g.key)) : selected ? [selected] : []; setSheetIds(idsOf(from)); }}
        onDownload={download}
        ignoredView={<IgnoredList groups={ign?.groups} channelName={name} onRevert={revert} />}
      />
      {filter === 'ignored' ? <aside className="detail"><p className="empty">Ignored items are kept out of the queue on every import. Revert brings them back.</p></aside> : (
        <DetailPane
          group={selected}
          allowedSizes={data.allowedSizes ?? []}
          channelKey={channel}
          channelName={name}
          onApprove={(ids) => decide(ids, 'approved')}
          onReject={(ids) => decide(ids, 'rejected')}
          onIgnore={ignore}
          onEditImages={(g) => setImagesFor(g)}
          onReload={() => mutate()}
        />
      )}
      {sheetIds && sheetIds.length > 0 && (
        <SheetPreview channelKey={channel} channelName={name} changeIds={sheetIds} onClose={() => setSheetIds(null)} onSaved={() => { toast.success('Sheet edits saved'); mutate(); }} />
      )}
      {imagesFor && (
        <ImagePanel group={imagesFor} channelKey={channel} channelName={name} otherChannels={otherChannels} onClose={() => setImagesFor(null)} onSaved={() => { toast.success('Images saved'); mutate(); }} />
      )}
    </>
  );
}

export default function QueuePage() {
  return (
    <main className="shell">
      <Rail />
      <Suspense fallback={<section className="list"><div className="loading-block"><Spinner /> Loading…</div></section>}>
        <QueueInner />
      </Suspense>
    </main>
  );
}
