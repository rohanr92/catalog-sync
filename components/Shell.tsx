'use client';

import MarketplaceNav from "./MarketplaceNav";
import MobileBar from "./MobileBar";
import UserBox from "./UserBox";
import Link from 'next/link';
import { Suspense } from 'react';
import useSWR from 'swr';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, Package, Download, ScanBarcode, ListChecks, Images, Send, FolderTree, Tags, ListFilter, Ruler, Upload, Plug, ScrollText, type LucideIcon } from 'lucide-react';
import Spinner from './Spinner';
import { useMounted } from '@/lib/use-mounted';
import type { ChannelSummary } from '@/lib/types';

interface RailData { channels: ChannelSummary[]; sourceConnected: boolean }
interface Item { href: string; label: string; icon: LucideIcon; desc: string; badge?: number; marketplaces?: boolean }
interface Section { title: string; color: string; bg: string; items: Item[]; source?: boolean }

const css = `
.rl { background: #fbfbfb; border-right: 1px solid var(--rule); display: flex; flex-direction: column; overflow-y: auto; font-size: 13px; }
.rl-brand { display: flex; gap: 10px; align-items: center; padding: 18px 16px 14px; border-bottom: 1px solid var(--rule); }
.rl-logo { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #6d5ce8 0%, #3b82f6 55%, #10b981 100%); color: #fff; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(109, 92, 232, 0.35); }
.rl-name { font-weight: 700; font-size: 14px; letter-spacing: -0.01em; }
.rl-meta { font-size: 11px; color: var(--ink-3); display: flex; gap: 5px; align-items: center; margin-top: 1px; }
.rl-sec { padding: 12px 10px 4px; }
.rl-sec-h { display: flex; align-items: center; gap: 6px; padding: 0 8px 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.rl-item { display: flex; align-items: center; gap: 9px; padding: 7px 8px; border-radius: 7px; color: var(--ink-2); text-decoration: none; transition: background 0.12s, color 0.12s; }
.rl-item:hover { background: #f0f0f0; color: var(--ink); }
.rl-item .ic { flex: none; opacity: 0.75; }
.rl-item .lb { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl-badge { font-family: var(--mono); font-size: 10.5px; padding: 1px 6px; border-radius: 9px; background: #efefef; color: var(--ink-2); }
.rl-sub { margin: 2px 0 4px 26px; border-left: 1px solid var(--rule); padding-left: 6px; }
.rl-sub a { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; color: var(--ink-2); text-decoration: none; font-size: 12.5px; }
.rl-sub a:hover { background: #f0f0f0; }
.rl-flag { width: 6px; height: 6px; border-radius: 50%; background: #e5484d; }
.rl-foot { margin-top: auto; padding: 12px 16px; font-size: 11px; color: var(--ink-3); border-top: 1px solid var(--rule); }

/* app-wide colour touches */
.tag.ready { background: #e3f5ea !important; color: #16713f !important; border-color: transparent !important; font-weight: 600; }
.tag.blocked { background: #fde8e6 !important; color: #b42318 !important; border-color: transparent !important; font-weight: 600; }
.row[aria-selected="true"] { box-shadow: inset 3px 0 0 #6d5ce8; background: #f7f5ff !important; }
.btn.primary { background: linear-gradient(180deg, #1a1a1a, #0a0a0a); }
@keyframes cs-float { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-6px) rotate(-6deg); } }
@keyframes cs-pop { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.cs-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 56px 20px; text-align: center; animation: cs-pop 0.35s ease-out; }
.cs-empty .e { font-size: 44px; animation: cs-float 2.6s ease-in-out infinite; }
.cs-empty .t { font-size: 15px; font-weight: 600; }
.cs-empty .s { font-size: 13px; color: var(--ink-3); max-width: 360px; }
@media (prefers-reduced-motion: reduce) { .cs-empty .e, .cs-empty { animation: none; } }
`;

function RailInner() {
  const path = usePathname();
  const active = useSearchParams().get('channel');
  const mounted = useMounted();
  const { data: live, isValidating } = useSWR<RailData>('/api/channels', { refreshInterval: 60_000 });
  const { data: img } = useSWR<Record<string, number>>('/api/image-changes?counts=1', { refreshInterval: 60_000 });
  const data = mounted ? live : undefined;
  const channels = data?.channels ?? [];
  const total = channels.reduce((n, c) => n + c.pending, 0);
  const imgTotal = mounted && img ? Object.values(img).reduce((a, b) => a + b, 0) : 0;
  const firstQueue = channels[0] ? `/queue?channel=${channels[0].key}` : '/queue';

  const sections: Section[] = [
    { title: "Home", color: "#6d5ce8", bg: "#efeaff", items: [
      { href: "/home", label: "Overview", icon: LayoutDashboard, desc: "Everything waiting, sending and running, at a glance" },
    ] },
    { title: 'Nordstrom', color: '#4b3fb3', bg: '#ece9fd', source: true, items: [
      { href: '/nordstrom', label: 'Edit products', icon: Package, desc: 'Every Nordstrom product — edit images and info, then send to Nordstrom' },
      { href: '/pulls', label: 'Pull history', icon: Download, desc: 'Every Nordstrom import, manual or automatic' },
    ] },
    { title: 'Marketplaces', color: '#1f5fbf', bg: '#e6effc', items: [
      { href: firstQueue, label: 'Listing queue', icon: ListChecks, desc: 'Products to list on each marketplace — review and approve', marketplaces: true },
      { href: '/images', label: 'Image changes', icon: Images, desc: 'Nordstrom image changes waiting for each marketplace', badge: imgTotal },
      { href: '/results', label: 'Send & results', icon: Send, desc: 'Send approved items and see what each marketplace accepted' },
      { href: "/upc-check", label: "UPC check", icon: ScanBarcode, desc: "UPCs that do not line up between Nordstrom and each marketplace" },
    ] },
    { title: 'Mapping', color: '#8a5a00', bg: '#fdf1dc', items: [
      { href: '/categories', label: 'Categories', icon: FolderTree, desc: 'Nordstrom category → each marketplace category' },
      { href: '/attributes', label: 'Attributes', icon: Tags, desc: 'Which Nordstrom field fills each marketplace column' },
      { href: '/values', label: 'Values', icon: ListFilter, desc: 'Nordstrom values translated to what each marketplace accepts' },
      { href: '/sizes', label: 'Sizes', icon: Ruler, desc: 'Nordstrom sizes → each marketplace size' },
    ] },
    { title: 'Setup', color: '#4a4a4a', bg: '#efefef', items: [
      { href: '/import', label: 'Import files', icon: Upload, desc: 'Upload Nordstrom or marketplace exports by hand' },
      { href: '/settings', label: 'Connections', icon: Plug, desc: 'API keys, Shopify, automatic pull and watch settings' },
      { href: '/logs', label: 'Logs', icon: ScrollText, desc: 'What the background jobs did, and any errors' },
    ] },
  ];

  const isActive = (href: string) => {
    const base = href.split('?')[0];
    return base === '/queue' ? path.startsWith('/queue') : path.startsWith(base);
  };

  return (
    <>
    <MobileBar />
    <nav className="rail rl">
      <style>{css}</style>
      <Link href="/home" style={{ textDecoration: "none", color: "inherit" }}>
      <div className="rl-brand">
        <div className="rl-logo">CS</div>
        <div>
          <div className="rl-name">Catalog Sync</div>
          <div className="rl-meta">
            {!data ? <><Spinner size={10} /> Loading</> : total > 0 ? `${total} changes waiting` : 'Nothing waiting'}
            {data && isValidating && <Spinner size={10} />}
          </div>
        </div>
      </div>
      </Link>

      {sections.map((s) => (
        <div className="rl-sec" key={s.title}>
          <div className="rl-sec-h" style={{ color: s.color }}>
            {s.source && <span className={`dot ${!data ? 'busy' : data.sourceConnected ? 'ok' : 'fail'}`} title={data?.sourceConnected ? 'Nordstrom connected' : 'Nordstrom not connected'} />}
            {s.title}
            {s.source && <span style={{ fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--ink-3)' }}>· source</span>}
          </div>
          {s.items.map((it) => {
            const on = isActive(it.href);
            const Icon = it.icon;
            return (
              <div key={it.label}>
                <Link href={it.href} className="rl-item" title={it.desc} style={on ? { background: s.bg, color: s.color, fontWeight: 600 } : undefined}>
                  <Icon size={15} className="ic" />
                  <span className="lb">{it.label}</span>
                  {!!it.badge && <span className="rl-badge" style={{ background: s.bg, color: s.color }}>{it.badge}</span>}
                </Link>
                {it.marketplaces && (
                  <div className="rl-sub">
                    {data && channels.length === 0 && <Link href="/settings" style={{ color: 'var(--ink-3)' }}>Connect a marketplace</Link>}
                    {channels.map((c) => {
                      const cur = path.startsWith('/queue') && c.key === active;
                      return (
                        <Link key={c.key} href={`/queue?channel=${c.key}`} style={cur ? { background: s.bg, color: s.color, fontWeight: 600 } : undefined}>
                          <span style={{ flex: 1 }}>{c.name}</span>
                          {c.blocked > 0 && <span className="rl-flag" title={`${c.blocked} blocked`} />}
                          <span className="rl-badge">{c.pending}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <MarketplaceNav />
      <UserBox />
    </nav>
    </>
  );
}

export default function Rail() {
  return <Suspense fallback={<nav className="rail" />}><RailInner /></Suspense>;
}
