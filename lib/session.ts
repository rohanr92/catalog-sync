import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { verifySession, COOKIE, rank, type Role, type Session } from './auth';
import { liveUser } from './auth-live';

export async function currentUser(): Promise<Session | null> {
  const s = await verifySession((await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  const l = await liveUser(s.sub);
  if (l && (!l.active || l.ver !== s.ver)) return null;
  return { ...s, role: (l?.role ?? s.role) as Role, name: l?.name || s.name };
}

export async function requireRole(min: Role): Promise<{ user: Session; error?: undefined } | { user?: undefined; error: NextResponse }> {
  const u = await currentUser();
  if (!u) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (rank[u.role] < rank[min]) return { error: NextResponse.json({ error: 'Your role does not allow this' }, { status: 403 }) };
  return { user: u };
}

export function passwordProblem(p: string): string | null {
  if (!p || p.length < 10) return 'Use at least 10 characters';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use letters and at least one number';
  return null;
}
export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const tempPassword = () => randomBytes(9).toString('base64url') + '7a';
