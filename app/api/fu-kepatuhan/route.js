import { db } from '@/lib/db';
import { requireUser, lihatBaris } from '@/lib/auth';
import { siapkanFuWajib, riwayatFU } from '@/lib/fuwajib-db';
import { statusFU, riwayatKepatuhan, hariIniWIB, tambahHari } from '@/lib/fuwajib';

export const dynamic = 'force-dynamic';

// ===== Kepatuhan standar FU wajib per sales (manager & CEO) =====
export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  if (!['manager', 'ceo'].includes(user.role)) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
  const sql = db();
  await siapkanFuWajib(sql);
  const today = hariIniWIB(), dari = tambahHari(today, -30);
  let leads = await sql`SELECT lead_code, nama, wa, project, sales, status, created_by, created_at, fu_mulai::text AS fu_mulai, fu_jalur, next_fu::text AS next_fu
    FROM leads WHERE COALESCE(sales, '') <> '' AND status NOT IN ('Booking', 'Closing', 'Drop', 'Lost')`;
  leads = leads.filter(l => lihatBaris(user, l));
  const riw = await riwayatFU(sql, leads.map(l => l.lead_code));
  const per = {}, terlambat = [];
  const baris = n => (per[n] ||= { sales: n, aktif: 0, wajib: 0, undangan: 0, percakapan: 0, tuntas: 0, nurture: 0, terlambat: 0, belumDisentuh: 0, fuTepat: 0, fuTotal: 0 });
  for (const l of leads) {
    const st = statusFU(l, riw, today);
    if (!st.aktif) continue;
    const r = baris(l.sales);
    r.aktif++; r[st.mode] = (r[st.mode] || 0) + 1;
    if (st.telat > 0) {
      r.terlambat++;
      terlambat.push({ lead_code: l.lead_code, nama: l.nama, wa: l.wa, project: l.project, sales: l.sales, label: st.label, jatuh: st.jatuh, telat: st.telat, mode: st.mode });
    }
    if (st.jalur === 'baru' && st.nFu === 0 && st.telat >= 0) r.belumDisentuh++;
    for (const k of riwayatKepatuhan(l, riw)) if (k.tgl >= dari) { r.fuTotal++; if (k.tepat) r.fuTepat++; }
  }
  const sales = Object.values(per).map(r => ({ ...r, persen: r.fuTotal ? Math.round(r.fuTepat / r.fuTotal * 100) : null }))
    .sort((a, b) => b.terlambat - a.terlambat || b.aktif - a.aktif);
  terlambat.sort((a, b) => b.telat - a.telat);
  return Response.json({ today, dari, sales, terlambat: terlambat.slice(0, 100), totalTerlambat: terlambat.length });
}
