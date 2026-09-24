'use client';

import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { imageSpecs } from '@/lib/image-specs';
import { channelColumns } from '@/lib/channel-specs';
import { T, LANGS, type Lang } from '@/lib/image-guide';

export default function ImageGuide({ channelKey, channelName }: { channelKey: string; channelName: string }) {
  const [lang, setLang] = useState<Lang>('en');
  const [open, setOpen] = useState(true);
  useEffect(() => { try { const l = localStorage.getItem('cs-guide-lang') as Lang | null; if (l && T[l]) setLang(l); if (localStorage.getItem('cs-guide-open') === '0') setOpen(false); } catch { /* ignore */ } }, []);
  const pick = (l: Lang) => { setLang(l); try { localStorage.setItem('cs-guide-lang', l); } catch { /* ignore */ } };
  const toggle = () => { setOpen((o) => { try { localStorage.setItem('cs-guide-open', o ? '0' : '1'); } catch { /* ignore */ } return !o; }); };

  const t = T[lang];
  const spec = imageSpecs[channelKey];
  const slots = channelColumns[channelKey]?.images.length ?? spec?.max ?? 0;
  const hasSwatch = !!channelColumns[channelKey]?.swatch;
  const sizes = spec ? [{ w: spec.w, h: spec.h }, ...(spec.alt ?? [])].map((d) => `${d.w} × ${d.h} px`).join(` ${t.or} `) : '';
  const extra = (t as Record<string, string>)[channelKey];

  return (
    <div dir="auto" style={{ border: '1px solid #d9d4fb', background: '#f7f5ff', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Info size={15} color="#4b3fb3" />
        <button onClick={toggle} style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#4b3fb3', cursor: 'pointer', flex: 1, textAlign: 'left' }}>
          {t.title.replace('{m}', channelName)} {open ? '▾' : '▸'}
        </button>
        <select value={lang} onChange={(e) => pick(e.target.value as Lang)} aria-label="Language" style={{ padding: '3px 6px', border: '1px solid #d9d4fb', borderRadius: 6, fontSize: 12, background: '#fff' }}>
          {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
      </div>
      {open && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.6, color: '#2d2a4a' }}>
          {sizes && <li><b style={{ fontWeight: 600 }}>{t.size}:</b> {sizes}</li>}
          {spec && <li><b style={{ fontWeight: 600 }}>{t.shape}:</b> {spec.ratio} · <b style={{ fontWeight: 600 }}>{t.format}:</b> {spec.format.toUpperCase()}</li>}
          {slots > 0 && <li>{t.count.replace('{n}', String(slots))}</li>}
          <li>{hasSwatch ? t.swatch : t.noSwatch}</li>
          {extra && <li>{extra}</li>}
          {spec && <li style={{ color: '#6b6690' }}>{t.editor}</li>}
        </ul>
      )}
    </div>
  );
}
