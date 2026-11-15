import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanOther, linkOther, daftarkanOther, tokenOther } from '@/lib/other-sales';

export const dynamic = 'force-dynamic';

// Manager: kiriman Other Sales → setujui (jadi lead dengan PIC Other Sales) / tolak / hapus yang ditolak · kelola link
export async function GET() {
  const { err } = await requireUser(['manager']); if (err) return err;
  const sql = db(); await siapkanOther(sql);
  const links = await linkOther(sql);
  const laporan = await sql`SELECT o.*, o.tgl::text AS tgl, EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = o.lead_code AND t.jenis IN ('Booking', 'Closing')) AS booking
    FROM other_laporan o ORDER BY (o.status = 'Menunggu') DESC, o.created_at DESC LIMIT 300`;
  const daftar = await sql`SELECT s.*, (SELECT count(*)::int FROM leads l WHERE l.other_id = s.id) AS lead,
      (SELECT count(*)::int FROM leads l JOIN transactions t ON t.lead_code = l.lead_code WHERE l.other_id = s.id AND t.jenis IN ('Booking', 'Closing')) AS booking
    FROM other_sales s ORDER BY s.created_at DESC LIMIT 200`;
  return Response.json({ links, laporan, daftar, menunggu: laporan.filter(x => x.status === 'Menunggu').length });
}
export async function POST(req) {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  const sql = db(); await siapkanOther(sql);
  const b = await req.json().catch(() => ({}));
  if (b.aksi === 'link-baru') {
    await sql`UPDATE other_link SET aktif = false WHERE project = ${b.project}`;
    await sql`INSERT INTO other_link (project, token) VALUES (${b.project}, ${tokenOther(b.project)})`;
    return Response.json({ ok: true });
  }
  if (b.aksi === 'hapus-ditolak') {
    const r = b.semua ? await sql`DELETE FROM other_laporan WHERE status = 'Ditolak' RETURNING id` : await sql`DELETE FROM other_laporan WHERE id = ${Number(b.id)} AND status = 'Ditolak' RETURNING id`;
    if (!r.length) return Response.json({ error: 'Hanya kiriman yang ditolak yang bisa dihapus' }, { status: 400 });
    return Response.json({ ok: true, terhapus: r.length });
  }
  const lap = (await sql`SELECT *, tgl::text AS tgl FROM other_laporan WHERE id = ${Number(b.id)}`)[0];
  if (!lap) return Response.json({ error: 'Kiriman tidak ditemukan' }, { status: 404 });
  if (lap.status !== 'Menunggu') return Response.json({ error: 'Kiriman ini sudah ' + lap.status.toLowerCase() }, { status: 400 });
  if (b.aksi === 'tolak') {
    await sql`UPDATE other_laporan SET status = 'Ditolak', alasan = ${String(b.alasan || '').slice(0, 300)}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${lap.id}`;
    return Response.json({ ok: true });
  }
  if (b.aksi !== 'setujui') return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
  const os = await daftarkanOther(sql, lap.project, { nama: lap.nama, jenis: lap.jenis, divisi: lap.divisi, hp: lap.hp, ktp: lap.ktp, npwp: lap.npwp }, user.username);
  const catatan = [`Other Sales: ${lap.nama} (${lap.jenis}${lap.divisi ? ' – ' + lap.divisi : ''}, HP ${lap.hp})`, lap.budget ? 'Budget: ' + lap.budget : '', lap.catatan].filter(Boolean).join(' · ');
  const ins = await sql`INSERT INTO leads (tgl, nama, wa, sumber, project, tipe, bayar, domisili, budget, sales, status, catatan, created_by)
    VALUES (${lap.tgl || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)}, ${lap.konsumen}, ${lap.konsumen_wa || ''}, 'Other Sales', ${lap.project}, ${lap.tipe || ''}, ${lap.bayar || ''}, ${lap.domisili || ''}, 0, ${os.nama}, 'Warm', ${catatan}, ${user.username}) RETURNING id`;
  const kode = 'LEAD-' + String(ins[0].id).padStart(4, '0');
  await sql`UPDATE leads SET lead_code = ${kode}, other_id = ${os.id}, sales_tipe = ${lap.jenis === 'External' ? 'other-external' : 'other-internal'} WHERE id = ${ins[0].id}`;
  await sql`UPDATE other_laporan SET status = 'Disetujui', lead_code = ${kode}, other_id = ${os.id}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${lap.id}`;
  return Response.json({ ok: true, lead_code: kode });
}
