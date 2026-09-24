import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ROLES, type Role } from '@/lib/auth';
import { requireRole, hashPassword, tempPassword } from '@/lib/session';
import { forgetUser } from '@/lib/auth-live';
import { log } from '@/lib/log';

const pub = { id: true, email: true, name: true, role: true, active: true, mustChangePassword: true, lastLoginAt: true, createdAt: true };

export async function GET() {
  const r = await requireRole('admin');
  if (r.error) return r.error;
  return NextResponse.json({ users: await db.user.findMany({ select: pub, orderBy: { createdAt: 'asc' } }), me: r.user.sub, myRole: r.user.role });
}

export async function POST(req: Request) {
  const r = await requireRole('admin');
  if (r.error) return r.error;
  const me = r.user;
  const body = await req.json();
  const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
  const owners = () => db.user.count({ where: { role: 'owner', active: true } });

  if (body.action === 'create') {
    const role = (ROLES.includes(body.role) ? body.role : 'member') as Role;
    if (role === 'owner' && me.role !== 'owner') return bad('Only an owner can add another owner', 403);
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!body.name?.trim() || !/^\S+@\S+\.\S+$/.test(email)) return bad('Name and a valid email are required');
    if (await db.user.findUnique({ where: { email } })) return bad('That email already has an account');
    const temp = tempPassword();
    const u = await db.user.create({ data: { name: body.name.trim(), email, role, passwordHash: await hashPassword(temp), mustChangePassword: true }, select: pub });
    await log('settings', `User added: ${u.name} (${u.email}) as ${role}`);
    return NextResponse.json({ ok: true, user: u, tempPassword: temp });
  }

  const target = await db.user.findUnique({ where: { id: body.id } });
  if (!target) return bad('User not found', 404);
  if (target.role === 'owner' && me.role !== 'owner') return bad('Only an owner can change an owner', 403);

  if (body.action === 'update') {
    const data: Record<string, unknown> = {};
    if (body.name?.trim()) data.name = body.name.trim();
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) return bad('Unknown role');
      if (body.role === 'owner' && me.role !== 'owner') return bad('Only an owner can make someone an owner', 403);
      if (target.role === 'owner' && body.role !== 'owner' && (await owners()) <= 1) return bad('There must always be at least one owner');
      data.role = body.role;
    }
    if (body.active !== undefined) {
      if (target.id === me.sub && !body.active) return bad('You cannot disable yourself');
      if (target.role === 'owner' && !body.active && (await owners()) <= 1) return bad('There must always be at least one owner');
      data.active = !!body.active;
    }
    if (data.role !== undefined || data.active === false) data.tokenVersion = { increment: 1 };
    const u = await db.user.update({ where: { id: target.id }, data, select: pub });
    forgetUser(target.id);
    await log('settings', `User ${u.name}: ${Object.keys(data).filter((k) => k !== 'tokenVersion').map((k) => `${k} → ${String((u as Record<string, unknown>)[k])}`).join(', ')}`);
    return NextResponse.json({ ok: true, user: u });
  }

  if (body.action === 'reset') {
    const temp = tempPassword();
    await db.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(temp), mustChangePassword: true, tokenVersion: { increment: 1 } } });
    forgetUser(target.id);
    await log('settings', `Password reset for ${target.name}`);
    return NextResponse.json({ ok: true, tempPassword: temp });
  }

  if (body.action === 'delete') {
    if (target.id === me.sub) return bad('You cannot delete yourself');
    if (target.role === 'owner' && (await owners()) <= 1) return bad('There must always be at least one owner');
    await db.user.delete({ where: { id: target.id } });
    forgetUser(target.id);
    await log('settings', `User deleted: ${target.name} (${target.email})`);
    return NextResponse.json({ ok: true });
  }

  return bad('Unknown action');
}
