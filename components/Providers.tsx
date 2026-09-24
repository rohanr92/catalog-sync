'use client';

import { SWRConfig, type Cache } from 'swr';
import { Toaster, toast } from 'sonner';
import { fetcher } from '@/lib/fetcher';

const PERSIST = ['/api/channels'];

// Small, stable responses are kept in the browser so the app paints instantly on reload.
function browserCache(): Cache {
  const map = new Map();
  if (typeof window !== 'undefined') {
    try { for (const [k, v] of JSON.parse(localStorage.getItem('cs-cache') ?? '[]')) map.set(k, v); } catch { /* ignore */ }
    const save = () => {
      try {
        const keep = [...map.entries()].filter(([k, v]) => PERSIST.some((p) => String(k).startsWith(p)) && v?.data).map(([k, v]) => [k, { data: v.data }]);
        localStorage.setItem('cs-cache', JSON.stringify(keep));
      } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
  }
  return map as Cache;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher,
      provider: browserCache,
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      errorRetryCount: 2,
      keepPreviousData: true,
      onError: (e: Error) => toast.error(e.message, { id: 'load-error' }),
    }}>
      {children}
      <Toaster position="bottom-right" theme="light" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--sans)', fontSize: 13 } }} />
    </SWRConfig>
  );
}
