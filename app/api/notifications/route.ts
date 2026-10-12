import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';

export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: me.sub }, orderBy: { createdAt: 'desc' }, take: 40 }),
    db.notification.count({ where: { userId: me.sub, read: false } }),
  ]);
  return NextResponse.json({ items, unread });
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b.action === 'readAll') await db.notification.updateMany({ where: { userId: me.sub, read: false }, data: { read: true } });
  else if (b.id) await db.notification.updateMany({ where: { id: String(b.id), userId: me.sub }, data: { read: true } });
  // keep the list short: drop read ones older than 60 days
  await db.notification.deleteMany({ where: { userId: me.sub, read: true, createdAt: { lt: new Date(Date.now() - 60 * 86_400_000) } } });
  return NextResponse.json({ ok: true });
}
