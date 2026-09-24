import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'cs_session';
export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export const ROLES: Role[] = ['owner', 'admin', 'member', 'viewer'];
export const rank: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
export interface Session { sub: string; email: string; name: string; role: Role; ver: number }

const secret = () => {
  const s = process.env.AUTH_SECRET ?? '';
  if (s.length < 32) throw new Error('AUTH_SECRET missing in .env');
  return new TextEncoder().encode(s);
};

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setIssuer('catalog-sync').setAudience('catalog-sync').setExpirationTime('12h').sign(secret());
}

export async function verifySession(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: 'catalog-sync', audience: 'catalog-sync', algorithms: ['HS256'] });
    return payload as unknown as Session;
  } catch { return null; }
}

export const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 3600 });
