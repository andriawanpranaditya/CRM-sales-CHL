import { db, siapkanStatusLog } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const KUALITAS = ['Warm', 'Hot', 'Appointment', 'Site Visit'];
const AKTIF = ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit'];

// Ringkasan pergerakan status lead per periode (dari riwayat yang dicatat trigger database)
export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  await siapkanStatusLog(sql);
  const url = new URL(req.url);
  const d1 = url.searchParams.get('d1') || null, d2 = url.searchParams.get('d2') || null;
  const proj = url.searchParams.get('project') || null;
  const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

  const log = await sql`
    SELECT s.*, l.project, l.nama, COALESCE(u.role, '') AS oleh_role
    FROM lead_status_log s JOIN leads l ON l.lead_code = s.lead_code LEFT JOIN users u ON u.username = s.oleh
    WHERE (${d1}::date IS NULL OR s.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR s.tgl <= ${d2}::date)
      AND (${proj}::text IS NULL OR l.project = ${proj})
    ORDER BY s.id`;
  const masuk = await sql`SELECT count(*)::int AS n FROM leads
    WHERE (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date) AND (${proj}::text IS NULL OR project = ${proj})`;
  const aktif = await sql`SELECT status, count(*)::int AS n FROM leads
    WHERE status = ANY(${AKTIF}::text[]) AND (${d2}::date IS NULL OR tgl <= ${d2}::date) AND (${proj}::text IS NULL OR project = ${proj}) GROUP BY status`;
  const agingRows = await sql`SELECT lead_code, nama, sales, created_by, tgl, (${hariIni}::date - tgl)::int AS hari FROM leads
    WHERE status = 'New' AND tgl <= ${hariIni}::date - 7 AND (${proj}::text IS NULL OR project = ${proj}) ORDER BY tgl ASC LIMIT 200`;
  const awal = await sql`SELECT min(created_at) AS mulai FROM lead_status_log`;

  const st = log.filter(r => r.jenis === 'status'), op = log.filter(r => r.jenis === 'oper');
  const transisi = {};
  st.forEach(r => { transisi[r.ke] = (transisi[r.ke] || 0) + 1; });
  const naikKualitas = new Set(st.filter(r => KUALITAS.includes(r.ke)).map(r => r.lead_code)).size;
  const dropRows = st.filter(r => r.ke === 'Drop');
  const posisiMarcom = r => !r.sales_saat || r.oleh_role === 'markom';
  const alasan = {};
  dropRows.forEach(r => { const a = (r.alasan || '').trim() || '(tanpa alasan)'; alasan[a] = (alasan[a] || 0) + 1; });
  const perSales = {};
  const ps = n => { if (!n) return null; perSales[n] = perSales[n] || { sales: n, oper: 0, kualitas: 0, visit: 0, booking: 0, drop: 0 }; return perSales[n]; };
  op.forEach(r => { const x = ps(r.ke); if (x) x.oper++; });
  st.forEach(r => {
    const x = ps(r.sales_saat); if (!x) return;
    if (KUALITAS.includes(r.ke)) x.kualitas++;
    if (r.ke === 'Site Visit') x.visit++;
    if (r.ke === 'Booking' || r.ke === 'Closing') x.booking++;
    if (r.ke === 'Drop') x.drop++;
  });
  return Response.json({
    mulaiRiwayat: awal[0]?.mulai || null,
    masuk: masuk[0]?.n || 0, oper: op.length, transisi, naikKualitas,
    drop: {
      total: dropRows.length,
      marcom: dropRows.filter(posisiMarcom).length,
      sales: dropRows.filter(r => !posisiMarcom(r)).length,
      alasan: Object.entries(alasan).map(([a, n]) => ({ alasan: a, n })).sort((x, y) => y.n - x.n),
      daftar: dropRows.slice(-50).reverse().map(r => ({ lead_code: r.lead_code, nama: r.nama, tgl: r.tgl, posisi: posisiMarcom(r) ? 'Marcom' : (r.sales_saat || 'Sales'), alasan: r.alasan || '' })),
    },
    perSales: Object.values(perSales).sort((a, b) => b.booking - a.booking || b.kualitas - a.kualitas),
    aktifAkhir: Object.fromEntries(AKTIF.map(k => [k, (aktif.find(r => r.status === k) || {}).n || 0])),
    aging: { n7: agingRows.length, n14: agingRows.filter(r => r.hari > 14).length, daftar: agingRows.slice(0, 15) },
    me: user.role,
  });
}
