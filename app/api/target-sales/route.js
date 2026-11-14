import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ambilTarget, simpanTarget, hitungSales } from '@/lib/target-sales';

export const dynamic = 'force-dynamic';

// Sales: target & pengingat miliknya · Manager: target + pencapaian seluruh sales aktif
export async function GET() {
  const { user, err } = await requireUser(['sales', 'manager']); if (err) return err;
  const sql = db();
  const target = await ambilTarget(sql);
  if (user.role === 'sales') return Response.json({ target, saya: await hitungSales(sql, { nama: user.name, username: user.username, projects: user.projects }, target) });
  const akun = await sql`SELECT name, username, projects FROM users WHERE role = 'sales' AND COALESCE(active, true) = true ORDER BY name`.catch(() => sql`SELECT name, username, projects FROM users WHERE role = 'sales' ORDER BY name`);
  const tim = [];
  for (const a of akun) { try { tim.push(await hitungSales(sql, { nama: a.name, username: a.username, projects: a.projects }, target)); } catch (e) { console.error('target', a.name, e); } }
  return Response.json({ target, tim });
}
export async function POST(req) {
  const { err } = await requireUser(['manager']); if (err) return err;
  const sql = db();
  const b = await req.json().catch(() => ({}));
  return Response.json({ ok: true, target: await simpanTarget(sql, b.target || {}) });
}
