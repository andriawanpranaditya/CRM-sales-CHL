import { db } from '@/lib/db';
import { requireUser, lihatBaris, pesanProyek } from '@/lib/auth';
import { siapkanKpr, statusKpr } from '@/lib/kpr';

export const dynamic = 'force-dynamic';

// ===== Laporan Penjualan: perjalanan tiap konsumen/unit dari Reserved → Booking / Batal, cara bayar, dan update status terakhir =====
const tglOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const tglStr = t => (t instanceof Date ? t.toISOString() : String(t || '')).slice(0, 10);
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tglId = t => { const d = tglStr(t); return d ? `${Number(d.slice(8, 10))} ${BLN[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : ''; };

function teksUpdate(r) {
  if (r.status === 'Batal') return `Batal ${tglId(r.tgl_batal)}` + (r.alasan_batal ? ` — ${r.alasan_batal}` : '');
  if (/kpr/i.test(r.bayar || '')) {
    const k = r.kpr;
    if (k?.akad_realisasi) return `Akad terealisasi ${tglId(k.akad_realisasi)}` + (k.akad_bank ? ` (${k.akad_bank})` : '');
    if (k?.akad_tgl) return `Rencana akad ${tglId(k.akad_tgl)}` + (k.akad_bank ? ` (${k.akad_bank})` : '') + ' — SP3K terbit';
    if (r.status === 'Reserved') return 'Reserved — KPR ' + (k?.label && k.label !== 'Menunggu Booking' ? k.label : 'belum dimulai') + ' (dihitung setelah Booking)';
    if (!k) return 'Booking — proses KPR belum dicatat';
    return `Proses KPR: ${k.label}` + (k.banks.length ? ` (${k.banks.join(', ')})` : '') + (k.updated_at ? ` · update ${tglId(k.updated_at)}` : '');
  }
  const awal = r.status === 'Booking' ? 'Booking — ' : 'Reserved — ';
  if (/bertahap/i.test(r.bayar || '')) return awal + `Cash bertahap${r.cicilan ? ' ' + r.cicilan + 'x' : ''}` + (r.catatan ? ` · ${r.catatan}` : '');
  if (/cash/i.test(r.bayar || '')) return awal + 'Cash keras' + (r.catatan ? `, ${r.catatan}` : '');
  return awal + (r.bayar || 'cara bayar belum diisi') + (r.catatan ? ` · ${r.catatan}` : '');
}

export async function GET(req) {
  const { user, err } = await requireUser(['manager', 'ceo']); if (err) return err;
  const sql = db();
  const q = new URL(req.url).searchParams;
  const d1 = tglOk(q.get('d1')) ? q.get('d1') : null, d2 = tglOk(q.get('d2')) ? q.get('d2') : null;
  const pj = q.get('project') || null, sales = q.get('sales') || null;
  if (pj && user.projects && !user.projects.includes(pj)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  try { await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cicilan integer`; } catch {}
  await siapkanKpr(sql);

  const trx = await sql`SELECT t.id, t.lead_code, t.jenis, t.tgl::text AS tgl, t.nilai, t.nilai_jual, t.catatan, t.unit, t.cicilan, t.created_at,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar,
      l.nama, l.tipe, l.sales, l.sumber, l.walkin_info, l.campaign, l.created_by AS lead_by
    FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
    WHERE (${pj}::text IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ${pj}) AND (${sales}::text IS NULL OR l.sales = ${sales})
    ORDER BY t.lead_code, t.id`;
  // Gabungkan per konsumen + unit
  const grup = new Map();
  for (const t of trx) {
    if (!lihatBaris(user, { project: t.project, sales: t.sales, created_by: t.lead_by })) continue;
    const k = t.lead_code + '|' + (t.unit || '');
    const g = grup.get(k) || { lead_code: t.lead_code, nama: t.nama, project: t.project, unit: t.unit || '', tipe: t.tipe || '', sales: t.sales || '', sumber: t.sumber || '',
      walkin_info: t.walkin_info || '', campaign: t.campaign || '', tgl_reserved: null, nilai_reserved: 0, tgl_booking: null, nilai_booking: 0, harga: null, bayar: '', cicilan: null,
      tgl_batal: null, alasan_batal: '', catatan: '', terakhir: '', updated: null };
    if (t.jenis === 'Reserved' && !g.tgl_reserved) { g.tgl_reserved = t.tgl; g.nilai_reserved = Number(t.nilai || 0); }
    if ((t.jenis === 'Booking' || t.jenis === 'Closing') && !g.tgl_booking) { g.tgl_booking = t.tgl; g.nilai_booking = Number(t.nilai || 0); }
    if (t.jenis === 'Batal') { g.tgl_batal = t.tgl; g.alasan_batal = t.catatan || ''; }
    if (t.nilai_jual) g.harga = Number(t.nilai_jual);
    if (t.bayar) g.bayar = t.bayar;
    if (t.cicilan) g.cicilan = t.cicilan;
    if (t.jenis !== 'Batal' && t.catatan) g.catatan = t.catatan;
    g.terakhir = t.jenis; g.updated = t.created_at;
    grup.set(k, g);
  }
  let rows = [...grup.values()].map(g => {
    g.status = g.terakhir === 'Batal' ? 'Batal' : g.tgl_booking ? 'Booking' : 'Reserved';
    if (g.status !== 'Batal') { g.tgl_batal = null; g.alasan_batal = ''; }
    g.lama = g.tgl_reserved && g.tgl_booking ? Math.round((Date.parse(g.tgl_booking) - Date.parse(g.tgl_reserved)) / 86400000) : (g.tgl_booking ? 0 : null);
    return g;
  });
  // Filter periode: ada kejadian (Reserved / Booking / Batal) di dalam rentang
  const dalam = t => t && (!d1 || t >= d1) && (!d2 || t <= d2);
  if (d1 || d2) rows = rows.filter(g => dalam(g.tgl_reserved) || dalam(g.tgl_booking) || dalam(g.tgl_batal));

  // Status KPR per lead
  const kodes = [...new Set(rows.map(g => g.lead_code))];
  if (kodes.length) {
    const ks = await sql`SELECT k.id, k.lead_code, k.slik_tgl, k.akad_bank_id, k.akad_tgl::text AS akad_tgl, k.akad_realisasi::text AS akad_realisasi, k.updated_at FROM kpr k WHERE k.lead_code = ANY(${kodes}::text[])`;
    const ids = ks.map(k => k.id);
    const bk = ids.length ? await sql`SELECT id, kpr_id, bank, tahap FROM kpr_bank WHERE kpr_id = ANY(${ids}::int[]) ORDER BY id` : [];
    const peta = {};
    ks.forEach(k => { const b = bk.filter(x => x.kpr_id === k.id); const st = statusKpr(k, b, 'Booking');
      peta[k.lead_code] = { label: st.label, kategori: st.kategori, banks: b.filter(x => !['Ditolak', 'Tidak dilanjutkan'].includes(x.tahap)).map(x => x.bank),
        akad_bank: (b.find(x => x.id === k.akad_bank_id) || {}).bank || '', akad_tgl: k.akad_tgl, akad_realisasi: k.akad_realisasi, updated_at: tglStr(k.updated_at) }; });
    rows.forEach(g => { g.kpr = peta[g.lead_code] || null; });
  }
  rows.forEach(g => { g.update_terakhir = teksUpdate(g); g.cara_bayar = /bertahap/i.test(g.bayar || '') && g.cicilan ? `${g.bayar} ${g.cicilan}x` : g.bayar; });
  rows.sort((a, b) => String(a.tgl_reserved || a.tgl_booking || '').localeCompare(String(b.tgl_reserved || b.tgl_booking || '')) || a.lead_code.localeCompare(b.lead_code));
  return Response.json({ d1, d2, project: pj, sales, dibuat: new Date().toISOString(), oleh: user.name, rows });
}
