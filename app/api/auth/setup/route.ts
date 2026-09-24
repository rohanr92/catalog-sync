import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signSession, COOKIE, cookieOptions } from '@/lib/auth';
import { passwordProblem, hashPassword } from '@/lib/session';
import { log } from '@/lib/log';

// Creates the first (owner) account. Only works while there are no users at all.
export async function POST(req: Request) {
  if ((await db.user.count()) > 0) return NextResponse.json({ error: 'Setup is already done' }, { status: 403 });
  const { name, email, password } = await req.json();
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email ?? '')) return NextResponse.json({ error: 'Name and a valid email are required' }, { status: 400 });
  const bad = passwordProblem(password);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const u = await db.user.create({ data: { name: name.trim(), email: email.trim().toLowerCase(), passwordHash: await hashPassword(password), role: 'owner', lastLoginAt: new Date() } });
  const token = await signSession({ sub: u.id, email: u.email, name: u.name, role: 'owner', ver: u.tokenVersion });
  await log('system', `Owner account created: ${u.name} (${u.email})`);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, cookieOptions());
  return res;
}
