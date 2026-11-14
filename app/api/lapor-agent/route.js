import { db } from '@/lib/db';
import { siapkanAgent } from '@/lib/agent-laporan';
import { driveSiap, simpanFoto } from '@/lib/foto-drive';

export const dynamic = 'force-dynamic';

// PUBLIK (tanpa login) — dipakai agent lewat link /lapor/<token>
async function ambilLink(sql, token) {
  if (!/^[a-z]{1,4}-[A-Za-z0-9]{5,12}$/.test(String(token || ''))) return null;
  await siapkanAgent(sql);
  return (await sql`SELECT * FROM agent_link WHERE token = ${token} AND aktif = true LIMIT 1`)[0] || null;
}
export async function GET(req) {
  const sql = db();
  const l = await ambilLink(sql, new URL(req.url).searchParams.get('token'));
  if (!l) return Response.json({ ok: false, error: 'Link tidak berlaku. Minta link terbaru ke lead agent Anda.' }, { status: 404 });
  return Response.json({ ok: true, project: l.project, leadAgent: l.nama, fotoWajib: driveSiap(l.project) });
}
export async function POST(req) {
  const sql = db();
  const b = await req.json().catch(() => ({}));
  if (b.website) return Response.json({ ok: true }); // jebakan bot
  const l = await ambilLink(sql, b.token);
  if (!l) return Response.json({ error: 'Link tidak berlaku. Minta link terbaru ke lead agent Anda.' }, { status: 404 });
  const t = (x, n = 200) => String(x ?? '').trim().slice(0, n);
  const d = { agent_nama: t(b.agent_nama, 80), agent_kantor: t(b.agent_kantor, 100), agent_hp: t(b.agent_hp, 30), konsumen: t(b.konsumen, 100),
    tgl: /^\d{4}-\d{2}-\d{2}$/.test(b.tgl || '') ? b.tgl : null, jam: t(b.jam, 10), tipe: t(b.tipe, 60), bayar: t(b.bayar, 40), domisili: t(b.domisili, 80), budget: t(b.budget, 60), catatan: t(b.catatan, 600) };
  if (!d.agent_nama || !d.agent_kantor || !d.agent_hp || !d.konsumen || !d.tgl) return Response.json({ error: 'Lengkapi nama agent, kantor, no. HP agent, nama konsumen, dan tanggal kunjungan' }, { status: 400 });
  const hari = (await sql`SELECT count(*)::int AS n FROM agent_laporan WHERE token = ${l.token} AND created_at > now() - interval '1 day'`)[0]?.n || 0;
  if (hari >= 40) return Response.json({ error: 'Terlalu banyak laporan dari link ini hari ini — hubungi lead agent Anda' }, { status: 429 });
  let foto = null;
  if (driveSiap(l.project)) {
    if (!b.foto?.data) return Response.json({ error: 'Foto kunjungan wajib dilampirkan' }, { status: 400 });
    try { foto = await simpanFoto(l.project, { nama: `agent ${d.tgl} ${d.konsumen}`, data: b.foto.data, folder: 'Agent ' + l.nama }); }
    catch (e) { return Response.json({ error: e.message }, { status: 502 }); }
  }
  await sql`INSERT INTO agent_laporan (token, lead_agent, project, agent_nama, agent_kantor, agent_hp, konsumen, tgl, jam, tipe, bayar, domisili, budget, catatan, foto)
    VALUES (${l.token}, ${l.nama}, ${l.project}, ${d.agent_nama}, ${d.agent_kantor}, ${d.agent_hp}, ${d.konsumen}, ${d.tgl}, ${d.jam}, ${d.tipe}, ${d.bayar}, ${d.domisili}, ${d.budget}, ${d.catatan}, ${foto})`;
  return Response.json({ ok: true });
}
