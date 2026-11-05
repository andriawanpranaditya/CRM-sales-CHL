import { db } from '@/lib/db';
import { requireUser, lihatBaris } from '@/lib/auth';
import { siapkanFuWajib, riwayatFU } from '@/lib/fuwajib-db';
import { statusFU, hariIniWIB } from '@/lib/fuwajib';
import { siapkanJanjian } from '@/lib/janjian';

export const dynamic = 'force-dynamic';

// ===== Laporan "Leads ke Sales" (Report): lead yang sudah dipegang sales + ringkasan hasil follow up terakhir =====
// Marcom, Manager, CEO: semua lead (sesuai akses project) · Sales: hanya lead miliknya.
// Periode = tanggal lead masuk; nomor urut mulai dari 1 di setiap periode.
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tglStr = v => !v ? '' : (v instanceof Date ? new Date(v.getTime() + 7 * 3600000).toISOString().slice(0, 10) : String(v).slice(0, 10));
const hariDari = t => t ? HARI[new Date(t + 'T00:00:00Z').getUTCDay()] : '';
const tglPendek = t => t ? `${Number(t.slice(8, 10))} ${BLN[Number(t.slice(5, 7)) - 1]}` : '';
const ddmm = t => t ? `${Number(t.slice(8, 10))}/${Number(t.slice(5, 7))}` : '';
// Ringkas catatan follow up: buang baris sistem, rapikan spasi, batasi panjang
const ringkas = (s, n = 170) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

export async function GET(req) {
  const { user, err } = await requireUser(['manager', 'ceo', 'markom', 'sales']); if (err) return err;
  const sql = db();
  const q = new URL(req.url).searchParams;
  const tglOk = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const d1 = tglOk(q.get('d1')) ? q.get('d1') : null, d2 = tglOk(q.get('d2')) ? q.get('d2') : null;
  const pj = q.get('project') || null, fSales = q.get('sales') || null;
  await siapkanFuWajib(sql); await siapkanJanjian(sql);
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS domisili text`; } catch {}

  let leads = await sql`SELECT lead_code, tgl::text AS tgl, nama, wa, sumber, sales, COALESCE(domisili, '') AS domisili, status, project, created_by, created_at,
      fu_mulai::text AS fu_mulai, fu_jalur, next_fu::text AS next_fu
    FROM leads
    WHERE COALESCE(sales, '') <> ''
      AND (${d1}::date IS NULL OR COALESCE(tgl, created_at::date) >= ${d1}::date) AND (${d2}::date IS NULL OR COALESCE(tgl, created_at::date) <= ${d2}::date)
      AND (${pj}::text IS NULL OR project = ${pj})
    ORDER BY COALESCE(tgl, created_at::date), created_at, id`;
  leads = leads.filter(l => lihatBaris(user, l));
  if (user.role === 'sales') leads = leads.filter(l => l.sales === user.name); // sales hanya lead miliknya
  else if (fSales) leads = leads.filter(l => l.sales === fSales);
  const codes = leads.map(l => l.lead_code);
  const [riw, janji, drop] = codes.length ? await Promise.all([
    riwayatFU(sql, codes),
    sql`SELECT lead_code, tgl::text AS tgl, jam, lokasi, status, batal_alasan, hasil, updated_at, id FROM janjian WHERE lead_code = ANY(${codes}::text[]) ORDER BY tgl, id`.catch(() => []),
    sql`SELECT DISTINCT ON (lead_code) lead_code, alasan, tgl::text AS tgl FROM lead_status_log WHERE lead_code = ANY(${codes}::text[]) AND ke = 'Drop' ORDER BY lead_code, created_at DESC`.catch(() => []),
  ]) : [[], [], []];
  const today = hariIniWIB();
  const alasanDrop = Object.fromEntries(drop.map(d => [d.lead_code, d.alasan]));
  const janjiPer = {}; janji.forEach(j => { (janjiPer[j.lead_code] ||= []).push(j); });

  const rows = leads.map((l, i) => {
    // Follow up sales (bukan Marcom, bukan balasan otomatis, bukan catatan oper)
    const fu = riw.filter(f => f.lead_code === l.lead_code && (f.oleh_role || '') !== 'markom' && f.created_by !== 'auto-wa' && !String(f.detail || '').startsWith('Leads to Sales'));
    const last = fu[fu.length - 1] || null;
    const st = statusFU(l, riw, today);
    const js = janjiPer[l.lead_code] || [];
    const jAkhir = js[js.length - 1] || null;
    const jAkan = js.filter(j => j.status === 'Terjadwal' && j.tgl >= today).at(-1) || null;
    const catatan = last ? ringkas([last.detail, last.objection ? 'Objection: ' + last.objection : ''].filter(Boolean).join(' · ')) : '';
    let ket, warna = '';
    if (['Drop', 'Lost'].includes(l.status)) {
      ket = [catatan, `Drop: ${alasanDrop[l.lead_code] || 'alasan belum diisi'}`].filter(Boolean).join(' — ');
      warna = 'merah';
    } else if (jAkan) {
      ket = [`Janjian ${hariDari(jAkan.tgl)} ${ddmm(jAkan.tgl)} pukul ${jAkan.jam}${jAkan.lokasi ? ' · ' + jAkan.lokasi : ''}`, catatan].filter(Boolean).join(' · ');
      warna = 'kuning';
    } else if (jAkhir && jAkhir.status === 'Batal') {
      ket = [`Janjian ${hariDari(jAkhir.tgl)} ${ddmm(jAkhir.tgl)} ${jAkhir.jam} batal${jAkhir.batal_alasan ? ' · alasan: ' + jAkhir.batal_alasan : ''}`, catatan].filter(Boolean).join(' · ');
      warna = 'merah';
    } else if (jAkhir && jAkhir.status === 'Datang') {
      ket = [`Sudah datang ${ddmm(jAkhir.tgl)}${jAkhir.hasil ? ' · ' + jAkhir.hasil : ''}`, catatan].filter(Boolean).join(' · ');
      warna = 'kuning';
    } else {
      ket = [catatan, st.aktif && st.label ? st.label : ''].filter(Boolean).join(' · ') || 'Belum ada follow up dari sales';
    }
    if (!warna && ['Hot', 'Appointment', 'Site Visit', 'Reserved', 'Booking', 'Closing'].includes(l.status)) warna = 'kuning';
    const tglLead = l.tgl || tglStr(l.created_at);
    const updFu = last ? (last.tgl || tglStr(last.created_at)) : '';
    const updJ = jAkhir ? tglStr(jAkhir.updated_at) : '';
    const update = [updFu, updJ].filter(Boolean).sort().at(-1) || '';
    return { no: i + 1, lead_code: l.lead_code, hari: hariDari(tglLead), tgl: tglLead, sumber: l.sumber || '', wa: l.wa || '', nama: l.nama, sales: l.sales, domisili: l.domisili || '',
      status: l.status, project: l.project, keterangan: ket, warna, update, nFu: fu.length, tglPendek: tglPendek(update) };
  });
  const per = {}; rows.forEach(r => { per[r.sales] = (per[r.sales] || 0) + 1; });
  const ringkasan = { total: rows.length, perSales: per, kuning: rows.filter(r => r.warna === 'kuning').length, merah: rows.filter(r => r.warna === 'merah').length,
    drop: rows.filter(r => ['Drop', 'Lost'].includes(r.status)).length, janjiBatal: rows.filter(r => r.warna === 'merah' && !['Drop', 'Lost'].includes(r.status)).length,
    tanpaDomisili: rows.filter(r => !r.domisili).length, belumFu: rows.filter(r => !r.nFu).length };
  return Response.json({ d1, d2, project: pj, rows, ringkasan, peran: user.role });
}
