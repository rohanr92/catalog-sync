import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signSession, COOKIE, cookieOptions, type Role } from '@/lib/auth';
import { currentUser, passwordProblem, hashPassword } from '@/lib/session';
import { forgetUser } from '@/lib/auth-live';
import { log } from '@/lib/log';

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { current, next } = await req.json();
  const u = await db.user.findUnique({ where: { id: me.sub } });
  if (!u || !(await bcrypt.compare(String(current ?? ''), u.passwordHash))) return NextResponse.json({ error: 'Current password is wrong' }, { status: 400 });
  const bad = passwordProblem(next);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  if (next === current) return NextResponse.json({ error: 'Choose a new password' }, { status: 400 });
  const saved = await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, tokenVersion: { increment: 1 } } });
  forgetUser(u.id);
  await log('system', `${u.name} changed their password`);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await signSession({ sub: u.id, email: u.email, name: u.name, role: u.role as Role, ver: saved.tokenVersion }), cookieOptions());
  return res;
}
