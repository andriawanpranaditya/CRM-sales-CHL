import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const COOKIE = 'crm_session';
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-ganti-di-produksi');

export async function createSession(user) {
  const token = await new SignJWT({ id: user.id, username: user.username, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getUser() {
  const t = cookies().get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    return payload;
  } catch { return null; }
}

export function clearSession() {
  cookies().delete(COOKIE);
}

export async function requireUser(role) {
  const u = await getUser();
  if (!u) return { err: Response.json({ error: 'Belum login' }, { status: 401 }) };
  if (role && u.role !== role) return { err: Response.json({ error: 'Tidak punya akses' }, { status: 403 }) };
  return { user: u };
}
