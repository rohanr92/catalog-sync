import { db } from './db';

export type LogKind = 'pull' | 'push' | 'status' | 'import' | 'settings' | 'system' | 'approval';

export async function log(kind: LogKind, message: string, level: 'info' | 'warn' | 'error' = 'info') {
  let actor: string | null = null;
  try {
    const { headers } = await import('next/headers');
    const n = (await headers()).get('x-user-name');
    actor = n ? decodeURIComponent(n) : null;
  } catch { /* background job — no signed-in person */ }
  try { await db.activityLog.create({ data: { kind, level, message: message.slice(0, 2000), actor: actor ?? 'system' } }); } catch { /* logging never breaks the app */ }
}

export function beat(job: string) {
  const g = globalThis as unknown as { __beats?: Record<string, number> };
  g.__beats ??= {};
  g.__beats[job] = Date.now();
}
export function beats(): Record<string, number> {
  return (globalThis as unknown as { __beats?: Record<string, number> }).__beats ?? {};
}
