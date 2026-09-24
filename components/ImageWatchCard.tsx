'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { postJson } from '@/lib/fetcher';

export default function ImageWatchCard() {
  const { data, mutate } = useSWR<{ enabled: boolean; since: string | null }>('/api/settings/image-watch');
  async function toggle(on: boolean) {
    try {
      const j = await postJson('/api/settings/image-watch', { enabled: on });
      mutate(j, false);
      toast.success(on ? 'Watching Nordstrom image changes from now on' : 'Image change watch turned off');
    } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 4, padding: 16, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span className={`dot ${data?.enabled ? 'ok' : ''}`} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Watch Nordstrom image changes</div>
        <div className="status-line">
          {data?.enabled
            ? `On since ${data.since ? new Date(data.since).toLocaleString() : '—'}. Changed images go to Image changes for every marketplace that has that colour.`
            : 'Off. When on, every Nordstrom import or pull compares images slot by slot.'}
        </div>
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" checked={!!data?.enabled} onChange={(e) => toggle(e.target.checked)} /> On
      </label>
    </div>
  );
}
