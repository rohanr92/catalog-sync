import { db } from './db';

// Current state of a user, checked every 30 s, so disabling someone or resetting a password signs them out quickly.
type Live = { active: boolean; ver: number; role: string; mcp: boolean; name: string; at: number };
const g = globalThis as unknown as { __liveUsers?: Map<string, Live> };
g.__liveUsers ??= new Map();

export async function liveUser(id: string): Promise<Live | null> {
  const hit = g.__liveUsers!.get(id);
  if (hit && Date.now() - hit.at < 30_000) return hit;
  try {
    const u = await db.user.findUnique({ where: { id }, select: { active: true, tokenVersion: true, role: true, mustChangePassword: true, name: true } });
    const l: Live = u ? { active: u.active, ver: u.tokenVersion, role: u.role, mcp: u.mustChangePassword, name: u.name, at: Date.now() } : { active: false, ver: -1, role: 'viewer', mcp: false, name: '', at: Date.now() };
    g.__liveUsers!.set(id, l);
    return l;
  } catch { return hit ?? null; }
}

export function forgetUser(id: string) { g.__liveUsers!.delete(id); }
