'use client';

// Keeps the last answer of every page's data in the browser.
// Going back to a tab shows it instantly, then quietly swaps in fresh data.
// Any save/action (POST, PUT, DELETE to /api/…) clears it, so you never see old numbers after a change.

type Entry = { at: number; data: unknown; text: string };
const mem = new Map<string, Entry>();
const latest = new Map<string, string>();
const SS = 'cs-cache:';
const parse = (url: string) => new URL(url, 'http://local');
const slot = (url: string) => { const u = parse(url); return `${u.pathname}|${[...u.searchParams.keys()].sort().join(',')}`; };

function read(url: string): Entry | null {
  const m = mem.get(url);
  if (m) return m;
  try {
    const s = sessionStorage.getItem(SS + url);
    if (s) { const e = JSON.parse(s) as Entry; mem.set(url, e); return e; }
  } catch { /* storage not available */ }
  return null;
}

function write(url: string, data: unknown, text: string) {
  const e: Entry = { at: Date.now(), data, text };
  mem.set(url, e);
  try { if (text.length < 1_500_000) sessionStorage.setItem(SS + url, JSON.stringify(e)); } catch { /* full or blocked */ }
}

export function forgetAllJSON() {
  mem.clear();
  try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k?.startsWith(SS)) sessionStorage.removeItem(k); } } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  const w = window as unknown as { __csFetchWrapped?: boolean; fetch: typeof fetch };
  if (!w.__csFetchWrapped) {
    w.__csFetchWrapped = true;
    const orig = window.fetch.bind(window);
    w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (parse(u).pathname.startsWith('/api/')) forgetAllJSON();
      }
      return orig(input, init);
    };
  }
}

// Shows the saved answer right away (if there is one), then the fresh one when it arrives.
// The promise ends as soon as something is on screen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getJSON<T = any>(url: string, cb: (data: T) => void): Promise<void> {
  const s = slot(url);
  latest.set(s, url);
  const hit = read(url);
  const fresh = fetch(url).then(async (r) => {
    const text = await r.text();
    const data = JSON.parse(text) as { error?: unknown };
    if (hit && hit.text === text) return;            // nothing changed
    if (!data?.error) write(url, data, text);
    if (latest.get(s) === url) cb(data as T);       // only if you're still looking at it
  });
  if (hit) { cb(hit.data as T); fresh.catch(() => {}); return; }
  await fresh;
}
