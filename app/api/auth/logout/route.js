import { clearSession, getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { catat } from '@/lib/log';
export const dynamic = 'force-dynamic';
export async function POST(req) {
  const u = await getUser();
  if (u) await catat(db(), { user: u, aksi: 'Logout', modul: 'Akses', detail: 'keluar aplikasi', req });
  clearSession();
  return Response.json({ ok: true });
}
