import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-ganti-di-produksi');
const PUBLIC = ['/login', '/api/auth/login', '/api/setup'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get('crm_session')?.value;
  let user = null;
  if (token) {
    try { user = (await jwtVerify(token, secret())).payload; } catch {}
  }

  if (!user) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Role sales: hanya boleh halaman Form Input (API tetap divalidasi per-route)
  if (user.role === 'sales' && !pathname.startsWith('/api/') && !pathname.startsWith('/form')) {
    return NextResponse.redirect(new URL('/form', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|logo|.*\\.png$).*)'],
};
