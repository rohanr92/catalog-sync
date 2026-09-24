import { NextResponse, type NextRequest } from 'next/server';
import { verifySession, COOKIE, rank, type Role } from './lib/auth';
import { liveUser } from './lib/auth-live';

const PUBLIC = ['/login', '/api/auth/login', '/api/auth/setup', '/api/auth/status'];
// Changes only an owner or admin may make.
const ADMIN_ONLY = [/^\/api\/users(\/|$)/, /^\/api\/settings(\/|$)/, /^\/api\/shopify$/, /^\/api\/nordstrom-pull$/, /^\/api\/logs$/];

function secure(res: NextResponse) {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');
  if (PUBLIC.includes(pathname)) return secure(NextResponse.next());

  const deny = (status: number, error: string) => secure(NextResponse.json({ error }, { status }));
  const toLogin = () => {
    if (isApi) return deny(401, 'Not signed in');
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + search);
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  const s = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!s) return toLogin();
  const live = await liveUser(s.sub);
  if (live && (!live.active || live.ver !== s.ver)) return toLogin();
  const role = (live?.role ?? s.role) as Role;

  // First sign-in with a temporary password: change it before anything else.
  if (live?.mcp && !pathname.startsWith('/account') && !pathname.startsWith('/api/auth/')) {
    return isApi ? deny(403, 'Change your password first') : NextResponse.redirect(new URL('/account?first=1', req.url));
  }

  if (!isApi && pathname.startsWith('/users') && rank[role] < rank.admin) return NextResponse.redirect(new URL('/', req.url));
  if (isApi && pathname.startsWith('/api/users') && rank[role] < rank.admin) return deny(403, 'Your role does not allow this');

  if (isApi && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin) {
      const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host).split(",")[0].trim();
      let originHost = "";
      try { originHost = new URL(origin).host; } catch { /* malformed origin */ }
      if (originHost !== host) return deny(403, "Cross-site request refused");
    }
    if (role === 'viewer' && !pathname.startsWith('/api/auth/')) return deny(403, 'Viewers cannot make changes');
    if (ADMIN_ONLY.some((r) => r.test(pathname)) && rank[role] < rank.admin) return deny(403, 'Only an owner or admin can change this');
  }

  // Tell the server who is asking — never trust these headers from the browser.
  const h = new Headers(req.headers);
  h.delete('x-user-id'); h.delete('x-user-name'); h.delete('x-user-role');
  h.set('x-user-id', s.sub);
  h.set('x-user-name', encodeURIComponent(live?.name || s.name));
  h.set('x-user-role', role);
  return secure(NextResponse.next({ request: { headers: h } }));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'] };
