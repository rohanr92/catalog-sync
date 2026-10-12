// Small in-memory cache for heavy pages (Inventory, Go-live tracker).
// • First visit builds the data, every page/filter/search after that is instant.
// • When the data is older than `ttl`, you still get it instantly and it rebuilds in the background.
// • Any inventory change (pull, buffer, mapping, fix) clears it, so you never see old numbers after an action.

type Entry = { at: number; val?: unknown; p?: Promise<unknown>; gen: number };
const g = globalThis as unknown as { __csMemo?: Map<string, Entry>; __csMemoGen?: number };
const store = (g.__csMemo ??= new Map<string, Entry>());
const gen = () => g.__csMemoGen ?? 0;

function build<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const myGen = gen();
  const e: Entry = store.get(key) ?? { at: 0, gen: myGen };
  const p = fn().then((val) => {
    if (gen() === myGen) store.set(key, { at: Date.now(), val, gen: myGen });
    else { const cur = store.get(key); if (cur?.p === p) cur.p = undefined; }
    return val;
  }, (err) => { const cur = store.get(key); if (cur?.p === p) cur.p = undefined; throw err; });
  e.p = p;
  store.set(key, e);
  return p;
}

export async function memo<T>(key: string, ttl: number, fn: () => Promise<T>, fresh = false): Promise<T> {
  const e = store.get(key);
  if (!fresh && e && e.val !== undefined && e.gen === gen()) {
    if (Date.now() - e.at > ttl && !e.p) build(key, fn).catch(() => {}); // refresh quietly
    return e.val as T;
  }
  if (!fresh && e?.p && e.gen === gen()) return e.p as Promise<T>;
  return build(key, fn);
}

// Something changed → next request builds fresh data.
export function forget() {
  g.__csMemoGen = gen() + 1;
  store.clear();
}
