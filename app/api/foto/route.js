import { requireUser } from '@/lib/auth';
import { ambilFoto, driveSiap } from '@/lib/foto-drive';

export const dynamic = 'force-dynamic';

// Tampilkan foto kunjungan dari Google Drive (khusus pengguna CRM yang login): /api/foto?ref=drive:<project>:<id>
export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const q = new URL(req.url).searchParams;
  if (q.get('siap')) return Response.json({ 'BIO DISTRICT': driveSiap('BIO DISTRICT'), 'PERMAI INDAH': driveSiap('PERMAI INDAH') });
  const ref = q.get('ref') || '';
  if (ref.startsWith('db:')) {
    if (user.role !== 'manager') return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
    const { db } = await import('@/lib/db'); const sql = db();
    const r = await sql`SELECT mime, data FROM other_dok WHERE id = ${Number(ref.slice(3))}`.catch(() => []);
    if (!r.length) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });
    return new Response(Buffer.from(r[0].data, 'base64'), { headers: { 'Content-Type': r[0].mime || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
  }
  const proj = (/^drive:([^:]+):/.exec(ref) || [])[1];
  if (proj && user.projects && !user.projects.includes(proj)) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
  const f = await ambilFoto(ref);
  if (!f) return Response.json({ error: 'Foto tidak ditemukan' }, { status: 404 });
  return new Response(f.data, { headers: { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400' } });
}
