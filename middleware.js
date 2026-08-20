import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC = ['/login', '/api/auth/login', '/api/setup', '/_next', '/favicon', '/logo'];

export async function middleware(req) {
  try {
    const { pathname } = req.nextUrl;
    if (PUBLIC.some(p => pathname.startsWith(p)) || pathname.includes('.')) {
      return NextResponse.next();
    }
    const token = req.cookies.get('crm_session')?.value;
    let user = null;
    if (token) {
      try {
        const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-ganti-di-produksi');
        user = (await jwtVerify(token, secret)).payload;
      } catch {}
    }
    if (!user) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', req.url));
    }
    if (user.role === 'sales' && !pathname.startsWith('/api/') && !pathname.startsWith('/form')) {
      return NextResponse.redirect(new URL('/form', req.url));
    }
    return NextResponse.next();
  } catch (e) {
    return NextResponse.next();
  }
}

export const config = { matcher: ['/((?!_next).*)'] };
