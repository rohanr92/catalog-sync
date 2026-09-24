import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { liveUser } from '@/lib/auth-live';
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const l = await liveUser(u.sub);
  return NextResponse.json({ id: u.sub, name: u.name, email: u.email, role: u.role, mustChangePassword: !!l?.mcp });
}
