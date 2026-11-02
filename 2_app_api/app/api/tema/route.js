import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { siapkanKolomTema, pasangCookieTema } from '@/lib/tema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await getUser();
  if (!u) return Response.json({ error: 'Belum login' }, { status: 401 });
  const sql = db();
  await siapkanKolomTema(sql);
  let tema = '';
  try { tema = (await sql`SELECT tema FROM users WHERE username = ${u.username}`)[0]?.tema || ''; } catch {}
  return Response.json({ tema });
}

export async function POST(req) {
  const u = await getUser();
  if (!u) return Response.json({ error: 'Belum login' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const tema = b.tema === 'light' || b.tema === 'dark' ? b.tema : '';
  const sql = db();
  await siapkanKolomTema(sql);
  try { await sql`UPDATE users SET tema = ${tema || null} WHERE username = ${u.username}`; } catch {}
  pasangCookieTema(tema);
  return Response.json({ ok: true, tema });
}
