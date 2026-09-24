'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { usePathname, useSearchParams } from 'next/navigation';
import { Store } from 'lucide-react';

export default function MarketplaceNav() {
  const path = usePathname();
  const sp = useSearchParams();
  const active = sp.get('channel');
  const tab = sp.get('tab');
  const { data } = useSWR<{ channels: { key: string; name: string }[] }>('/api/channels');
  const channels = data?.channels ?? [];
  if (!channels.length) return null;
  const on = { background: '#dff5ef', color: '#0f766e', fontWeight: 600 };
  return (
    <div className="rl-sec">
      <div className="rl-sec-h" style={{ color: '#0f766e' }}>Marketplace products</div>
      {channels.map((c) => {
        const here = path.startsWith('/catalog') && active === c.key;
        return (
          <div key={c.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 2px', fontSize: 13, fontWeight: 600, color: here ? '#0f766e' : 'var(--ink)' }}><Store size={14} style={{ opacity: 0.75 }} />{c.name}</div>
            <div className="rl-sub">
              <Link href={`/catalog?channel=${c.key}`} style={here && tab !== 'pulls' ? on : undefined}>Edit products</Link>
              <Link href={`/catalog?channel=${c.key}&tab=pulls`} style={here && tab === 'pulls' ? on : undefined}>Pull history</Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
