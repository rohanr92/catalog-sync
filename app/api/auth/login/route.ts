import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signSession, COOKIE, cookieOptions, type Role } from '@/lib/auth';
import { log } from '@/lib/log';

const MAX = 5, LOCK_MS = 15 * 60_000;
const g = globalThis as unknown as { __attempts?: Map<string, { n: number; until: number }> };
g.__attempts ??= new Map();
const DUMMY = bcrypt.hashSync('no-such-user-password-0', 12); // equal timing whether or not the email exists

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const mail = String(email ?? '').trim().toLowerCase();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const key = `${ip}|${mail}`;
  const a = g.__attempts!.get(key);
  if (a && a.until > Date.now()) return NextResponse.json({ error: `Too many attempts. Try again in ${Math.ceil((a.until - Date.now()) / 60_000)} min.` }, { status: 429 });

  const u = mail ? await db.user.findUnique({ where: { email: mail } }) : null;
  const ok = (await bcrypt.compare(String(password ?? ''), u?.passwordHash ?? DUMMY)) && !!u?.active;
  if (!ok || !u) {
    const n = (a?.n ?? 0) + 1;
    g.__attempts!.set(key, { n: n >= MAX ? 0 : n, until: n >= MAX ? Date.now() + LOCK_MS : 0 });
    await log('system', `Failed sign-in for ${mail || '(empty)'} from ${ip}${n >= MAX ? ' — locked for 15 min' : ''}`, 'warn');
    return NextResponse.json({ error: 'Email or password is wrong' }, { status: 401 });
  }

  g.__attempts!.delete(key);
  await db.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
  const token = await signSession({ sub: u.id, email: u.email, name: u.name, role: u.role as Role, ver: u.tokenVersion });
  await log('system', `${u.name} signed in`);
  const res = NextResponse.json({ ok: true, mustChangePassword: u.mustChangePassword });
  res.cookies.set(COOKIE, token, cookieOptions());
  return res;
}
