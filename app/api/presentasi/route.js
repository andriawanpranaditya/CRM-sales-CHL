import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { hitungVisitor, siapkanJanjian } from '@/lib/janjian';
import { bolehPresentasi } from '@/lib/presentasi';

export const dynamic = 'force-dynamic';

// ===== Data tambahan untuk Presentasi Project (khusus akun Andriawan) =====
// Penjualan & KPR diambil halaman dari /api/laporan-penjualan (aturan sama dengan Laporan Penjualan);
// di sini: lead & visitor, catatan/riwayat KPR terbaru, dan lead per bulan untuk pembanding promo.
const hariIniWIB = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const tglStr = v => !v ? '' : (v instanceof Date ? new Date(v.getTime() + 7 * 3600000).toISOString().slice(0, 10) : String(v).slice(0, 10));

export async function GET(req) {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  if (!bolehPresentasi(user)) return Response.json({ error: 'Menu ini khusus akun Head of Sales & Marketing' }, { status: 403 });
  const sql = db();
  const q = new URL(req.url).searchParams;
  const pj = q.get('project');
  if (!pj) return Response.json({ error: 'project wajib' }, { status: 400 });
  const today = hariIniWIB();
  const dari = /^\d{4}-\d{2}-\d{2}$/.test(q.get('dari') || '') ? q.get('dari') : today.slice(0, 4) + '-01-01';
  const awalTahun = today.slice(0, 4) + '-01-01';
  await siapkanJanjian(sql);

  const leads = await sql`SELECT l.lead_code, l.tgl::text AS tgl, l.created_at, l.status, l.sales, l.sumber, l.walkin_info, l.campaign, u.role AS creator_role
    FROM leads l LEFT JOIN users u ON u.username = l.created_by WHERE l.project = ${pj} AND COALESCE(l.tgl, l.created_at::date) >= ${awalTahun}::date`;
  const tglLead = l => l.tgl || tglStr(l.created_at);
  const periode = leads.filter(l => tglLead(l) >= dari && tglLead(l) <= today);
  const codes = periode.map(l => l.lead_code);
  const [fu7, fuAda, dropLog, bookAktif] = codes.length ? await Promise.all([
    sql`SELECT DISTINCT f.lead_code FROM followups f LEFT JOIN users u ON u.username = f.created_by
      WHERE f.lead_code = ANY(${codes}::text[]) AND f.created_at > now() - interval '7 days' AND COALESCE(u.role, '') <> 'markom' AND COALESCE(f.created_by, '') <> 'auto-wa'`,
    sql`SELECT DISTINCT f.lead_code FROM followups f LEFT JOIN users u ON u.username = f.created_by
      WHERE f.lead_code = ANY(${codes}::text[]) AND COALESCE(u.role, '') <> 'markom' AND COALESCE(f.created_by, '') <> 'auto-wa' AND COALESCE(f.detail, '') NOT LIKE 'Leads to Sales%'`,
    sql`SELECT DISTINCT ON (lead_code) lead_code, alasan FROM lead_status_log WHERE lead_code = ANY(${codes}::text[]) AND ke = 'Drop' ORDER BY lead_code, created_at DESC`.catch(() => []),
    sql`SELECT DISTINCT t.lead_code FROM transactions t WHERE t.lead_code = ANY(${codes}::text[]) AND t.jenis IN ('Booking', 'Closing')
      AND NOT EXISTS (SELECT 1 FROM transactions bx WHERE bx.lead_code = t.lead_code AND COALESCE(bx.unit, '') = COALESCE(t.unit, '') AND bx.jenis = 'Batal' AND bx.tgl > t.tgl)`,
  ]) : [[], [], [], []];
  const set7 = new Set(fu7.map(x => x.lead_code)), setFu = new Set(fuAda.map(x => x.lead_code)), setBook = new Set(bookAktif.map(x => x.lead_code));
  const SELESAI = ['Drop', 'Lost', 'Booking', 'Closing'];
  const marcom = periode.filter(l => l.creator_role === 'markom');
  const dioper = periode.filter(l => l.sales);
  const aktif = dioper.filter(l => !SELESAI.includes(l.status));
  const warmPlus = ['Warm', 'Hot', 'Appointment', 'Site Visit', 'Reserved', 'Booking', 'Closing'];
  const alasan = {}; dropLog.forEach(d => { const a = String(d.alasan || 'Tanpa alasan').replace(/\s+/g, ' ').trim(); alasan[a] = (alasan[a] || 0) + 1; });
  const lead = {
    dari, sampai: today, masuk: periode.length, marcom: marcom.length, dioper: dioper.length,
    marcomBelumOper: marcom.filter(l => !l.sales && l.status === 'New').length,
    aktif: aktif.length, aktifFu7: aktif.filter(l => set7.has(l.lead_code)).length, belumFu: dioper.filter(l => !setFu.has(l.lead_code)).length,
    cold: dioper.filter(l => l.status === 'Cold').length, warmPlus: dioper.filter(l => warmPlus.includes(l.status)).length,
    drop: periode.filter(l => ['Drop', 'Lost'].includes(l.status)).length, booking: periode.filter(l => setBook.has(l.lead_code)).length,
    alasanDrop: Object.entries(alasan).sort((a, b) => b[1] - a[1]).slice(0, 5),
    perSumber: Object.entries(periode.reduce((a, l) => { const k = l.sumber || 'Lainnya'; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]),
    perBulan: Object.entries(leads.reduce((a, l) => { const m = tglLead(l).slice(0, 7); a[m] = (a[m] || 0) + 1; return a; }, {})).sort(),
  };
  // Visitor (aturan sama dengan menu Janjian & Visitor)
  let visitor = { total: 0, walkin: 0, janji: 0, tanpaJanji: 0, trx: 0, offline: 0, perInfo: [] };
  try {
    const vis = (await hitungVisitor(sql, { dari, sampai: today, pp: [pj] })).filter(v => v.hitung);
    const info = {};
    vis.forEach(v => {
      if (v.kategori === 'walkin') { visitor.walkin++; const k = String(v.walkin_info || 'tidak diisi').trim() || 'tidak diisi'; info[k] = (info[k] || 0) + 1; }
      else if (v.kategori === 'janji') visitor.janji++; else if (v.kategori === 'tanpa') visitor.tanpaJanji++; else visitor.trx++;
    });
    visitor.total = vis.length;
    visitor.perInfo = Object.entries(info).sort((a, b) => b[1] - a[1]);
    visitor.offline = Object.entries(info).filter(([k]) => /banner|spanduk|billboard|baliho|brosur|pameran|event|lewat|papan/i.test(k)).reduce((a, [, n]) => a + n, 0);
  } catch (e) { console.error('visitor presentasi', e); }
  // Catatan & riwayat KPR terbaru untuk konsumen yang masih proses KPR
  const kprBaru = {};
  try {
    const kp = await sql`SELECT k.id, k.lead_code, k.catatan, k.updated_at,
        (SELECT json_build_object('isi', x.isi, 'waktu', x.waktu) FROM kpr_log x WHERE x.kpr_id = k.id ORDER BY x.waktu DESC LIMIT 1) AS log
      FROM kpr k JOIN leads l ON l.lead_code = k.lead_code WHERE l.project = ${pj} AND k.akad_realisasi IS NULL`;
    kp.forEach(k => { kprBaru[k.lead_code] = { catatan: String(k.catatan || '').trim(), log: k.log ? String(k.log.isi || '').trim() : '', logTgl: k.log ? tglStr(new Date(k.log.waktu)) : '', update: tglStr(k.updated_at) }; });
  } catch (e) { console.error('kpr presentasi', e); }
  return Response.json({ project: pj, today, lead, visitor, kprBaru });
}
