type Entry = { v: string; at: number; value: unknown };
const g = globalThis as unknown as { __cache?: Map<string, Entry>; __ver?: number; __mver?: Map<string, number>; __inflight?: Map<string, Promise<unknown>> };
g.__cache ??= new Map();
g.__ver ??= 0;
g.__mver ??= new Map();
g.__inflight ??= new Map();

// Called on every database write. `model` lets caches that depend on specific tables survive unrelated writes.
export function bumpVersion(model?: string) {
  g.__ver = (g.__ver ?? 0) + 1;
  if (model) g.__mver!.set(model, (g.__mver!.get(model) ?? 0) + 1);
}

const allVersion = () => String(g.__ver);
const modelVersion = (models: string[]) => models.map((m) => `${m}:${g.__mver!.get(m) ?? 0}`).join('|');

async function run<T>(key: string, version: () => string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = g.__cache!.get(key);
  if (hit && hit.v === version() && Date.now() - hit.at < ttlMs) return hit.value as T;
  const running = g.__inflight!.get(key);
  if (running) return running as Promise<T>;
  const v = version();
  const p = fn()
    .then((value) => { g.__cache!.set(key, { v, at: Date.now(), value }); return value; })
    .catch((e) => { if (hit) return hit.value as T; throw e; })
    .finally(() => g.__inflight!.delete(key));
  g.__inflight!.set(key, p);
  return p;
}

// Invalidated by any write.
export const cached = <T,>(key: string, ttlMs: number, fn: () => Promise<T>) => run(key, allVersion, ttlMs, fn);
// Invalidated only by writes to the listed tables.
export const cachedBy = <T,>(key: string, models: string[], ttlMs: number, fn: () => Promise<T>) => run(key, () => modelVersion(models), ttlMs, fn);
