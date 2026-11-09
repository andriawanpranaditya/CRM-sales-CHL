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

// Kalimat slide yang diedit (disimpan di settings 'presentasi_teks': { kunci: teks })
async function ambilTeks(sql) { const r = await sql`SELECT items FROM settings WHERE key = 'presentasi_teks'`.catch(() => []); return r[0]?.items || {}; }
export async function POST(req) {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  if (!bolehPresentasi(user)) return Response.json({ error: 'Menu ini khusus akun Head of Sales & Marketing' }, { status: 403 });
  const sql = db();
  const b = await req.json().catch(() => ({}));
  if (b.aksi !== 'teks' || !b.k || String(b.k).length > 200) return Response.json({ error: 'Permintaan tidak dikenal' }, { status: 400 });
  const isi = { ...(await ambilTeks(sql)) };
  if (b.teks == null || !String(b.teks).trim()) delete isi[b.k]; else isi[b.k] = String(b.teks).slice(0, 2000);
  await sql`INSERT INTO settings (key, items) VALUES ('presentasi_teks', ${JSON.stringify(isi)}) ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(isi)}`;
  return Response.json({ ok: true, teks: isi });
}

export async function GET(req) {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  if (!bolehPresentasi(user)) return Response.json({ error: 'Menu ini khusus akun Head of Sales & Marketing' }, { status: 403 });
  const sql = db();
  const q = new URL(req.url).searchParams;
  if (q.get('teks')) return Response.json({ teks: await ambilTeks(sql) });
  const pj = q.get('project');
  if (!pj) return Response.json({ error: 'project wajib' }, { status: 400 });
  const today = hariIniWIB();
  const dari = /^\d{4}-\d{2}-\d{2}$/.test(q.get('dari') || '') ? q.get('dari') : today.slice(0, 4) + '-01-01';
  const awalTahun = today.slice(0, 4) + '-01-01';
  await siapkanJanjian(sql);

  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS usia text`; await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS domisili text`; } catch {}
  const leads = await sql`SELECT l.lead_code, l.tgl::text AS tgl, l.created_at, l.status, l.sales, l.sumber, l.walkin_info, l.campaign, u.role AS creator_role,
      ((COALESCE(l.domisili, '') <> '')::int + (COALESCE(l.budget, 0) > 0)::int + (COALESCE(l.bayar, '') <> '')::int + (COALESCE(l.usia, '') <> '')::int + (COALESCE(l.tujuan, '') <> '')::int) AS nkual
    , l.nama, l.created_by FROM leads l LEFT JOIN users u ON u.username = l.created_by
    WHERE l.project = ${pj} AND COALESCE(l.tgl, l.created_at::date) >= ${awalTahun}::date
      AND COALESCE(l.sumber, '') NOT ILIKE 'import%'`; // lead hasil impor buku penjualan / Report Detail bukan lead pemasaran
  const tglLead = l => l.tgl || tglStr(l.created_at);
  const periode = leads.filter(l => tglLead(l) >= dari && tglLead(l) <= today);
  const codes = periode.map(l => l.lead_code);
  const [fu7, fuAda, dropLog, bookAktif, sentuhLain, trxLead, janjiLead] = codes.length ? await Promise.all([
    sql`SELECT DISTINCT f.lead_code FROM followups f LEFT JOIN users u ON u.username = f.created_by
      WHERE f.lead_code = ANY(${codes}::text[]) AND f.created_at > now() - interval '7 days' AND COALESCE(u.role, '') <> 'markom' AND COALESCE(f.created_by, '') <> 'auto-wa'`,
    sql`SELECT DISTINCT f.lead_code FROM followups f LEFT JOIN users u ON u.username = f.created_by
      WHERE f.lead_code = ANY(${codes}::text[]) AND COALESCE(u.role, '') <> 'markom' AND COALESCE(f.created_by, '') <> 'auto-wa' AND COALESCE(f.detail, '') NOT LIKE 'Leads to Sales%'`,
    sql`SELECT DISTINCT ON (lead_code) lead_code, alasan FROM lead_status_log WHERE lead_code = ANY(${codes}::text[]) AND ke = 'Drop' ORDER BY lead_code, created_at DESC`.catch(() => []),
    sql`SELECT DISTINCT t.lead_code FROM transactions t WHERE t.lead_code = ANY(${codes}::text[]) AND t.jenis IN ('Booking', 'Closing')
      AND NOT EXISTS (SELECT 1 FROM transactions bx WHERE bx.lead_code = t.lead_code AND COALESCE(bx.unit, '') = COALESCE(t.unit, '') AND bx.jenis = 'Batal' AND bx.tgl > t.tgl)`,
    sql`SELECT DISTINCT lead_code FROM janjian WHERE lead_code = ANY(${codes}::text[]) UNION SELECT DISTINCT lead_code FROM transactions WHERE lead_code = ANY(${codes}::text[])`.catch(() => []),
    sql`SELECT lead_code, jenis, tgl::text AS tgl, unit FROM transactions WHERE lead_code = ANY(${codes}::text[]) ORDER BY tgl, id`.catch(() => []),
    sql`SELECT lead_code, tgl::text AS tgl, status, created_at FROM janjian WHERE lead_code = ANY(${codes}::text[])`.catch(() => []),
  ]) : [[], [], [], [], [], [], []];
  const setSentuh = new Set(sentuhLain.map(x => x.lead_code));
  const set7 = new Set(fu7.map(x => x.lead_code)), setFu = new Set(fuAda.map(x => x.lead_code)), setBook = new Set(bookAktif.map(x => x.lead_code));
  const SELESAI = ['Drop', 'Lost', 'Booking', 'Closing'];
  const umurHari = l => (Date.parse(today) - Date.parse(tglLead(l))) / 86400000;
  // Belum di-follow up = lead aktif (bukan Drop/Reserved/Booking), sudah ≥ 2 hari di tangan sales, tanpa catatan FU sales, janji temu, maupun transaksi
  const belumFuList = periode.filter(l => l.sales && !SELESAI.includes(l.status) && l.status !== 'Reserved' && umurHari(l) >= 2
    && !setFu.has(l.lead_code) && !setSentuh.has(l.lead_code))
    .map(l => ({ lead_code: l.lead_code, nama: l.nama, sumber: l.sumber || '', sales: l.sales, status: l.status, tgl: tglLead(l), oleh: l.creator_role || '' }));
  const marcom = periode.filter(l => l.creator_role === 'markom');
  const dioper = periode.filter(l => l.sales);
  const aktif = dioper.filter(l => !SELESAI.includes(l.status));
  const warmPlus = ['Warm', 'Hot', 'Appointment', 'Site Visit', 'Reserved', 'Booking', 'Closing'];
  const alasan = {}; dropLog.forEach(d => { const a = String(d.alasan || 'Tanpa alasan').replace(/\s+/g, ' ').trim(); alasan[a] = (alasan[a] || 0) + 1; });
  const lead = {
    dari, sampai: today, masuk: periode.length, marcom: marcom.length, dioper: dioper.length,
    marcomBelumOper: marcom.filter(l => !l.sales && l.status === 'New').length,
    aktif: aktif.length, aktifFu7: aktif.filter(l => set7.has(l.lead_code)).length,
    belumFu: belumFuList.length, belumFuList,
    cold: dioper.filter(l => l.status === 'Cold').length, warmPlus: dioper.filter(l => warmPlus.includes(l.status)).length,
    drop: periode.filter(l => ['Drop', 'Lost'].includes(l.status)).length, booking: periode.filter(l => setBook.has(l.lead_code)).length,
    // Lead yang masuk di luar jam kerja (sebelum 08.00 / sesudah 17.00 WIB) atau di hari Minggu — hanya lead digital yang jam masuknya tercatat
    luarJam: (() => { const dig = periode.filter(l => l.creator_role === 'markom' && l.created_at); const n = dig.filter(l => { const d = new Date(new Date(l.created_at).getTime() + 7 * 3600000); const j = d.getUTCHours(); return j < 8 || j >= 17 || d.getUTCDay() === 0; }).length; return { n, dari: dig.length }; })(),
    kualLengkap: periode.filter(l => Number(l.nkual) >= 3).length,
    alasanDrop: Object.entries(alasan).sort((a, b) => b[1] - a[1]).slice(0, 5),
    perSumber: Object.entries(periode.reduce((a, l) => { const k = l.sumber || 'Lainnya'; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]),
    kualitasSumber: Object.values(periode.reduce((a, l) => { const k = l.sumber || 'Lainnya'; const o = a[k] || (a[k] = { sumber: k, lead: 0, warm: 0, booking: 0, drop: 0 });
      o.lead++; if (warmPlus.includes(l.status)) o.warm++; if (setBook.has(l.lead_code)) o.booking++; if (['Drop', 'Lost'].includes(l.status)) o.drop++; return a; }, {})).sort((a, b) => b.lead - a.lead),
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
    visitor.total = vis.length; visitor._rows = vis.map(v => ({ tgl: v.tgl, lead_code: v.lead_code, kategori: v.kategori }));
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
  // Pergerakan per bulan (periode laporan): lead masuk, janji temu dibuat, visitor, Reserved & Booking dari lead periode ini
  const bulanList = []; { let m = dari.slice(0, 7); while (m <= today.slice(0, 7)) { bulanList.push(m); const [y, mo] = m.split('-').map(Number); m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; } }
  const visRows = visitor._rows || [];
  const pergerakan = bulanList.map(m => ({ bulan: m,
    lead: periode.filter(l => tglLead(l).startsWith(m)).length,
    janji: janjiLead.filter(j => tglStr(j.created_at).startsWith(m)).length,
    visitor: visRows.filter(v => v.tgl.startsWith(m)).length,
    reserved: trxLead.filter(t => t.jenis === 'Reserved' && t.tgl.startsWith(m)).length,
    booking: trxLead.filter(t => (t.jenis === 'Booking' || t.jenis === 'Closing') && t.tgl.startsWith(m)).length }));
  const adaJanji = new Set(janjiLead.map(j => j.lead_code)), datang = new Set(visRows.map(v => v.lead_code));
  const resv = new Set(trxLead.filter(t => t.jenis === 'Reserved').map(t => t.lead_code)), book = new Set(trxLead.filter(t => t.jenis === 'Booking' || t.jenis === 'Closing').map(t => t.lead_code));
  const funnel = { masuk: periode.length, dioper: dioper.length, janji: periode.filter(l => adaJanji.has(l.lead_code)).length, datang: periode.filter(l => datang.has(l.lead_code)).length,
    reserved: periode.filter(l => resv.has(l.lead_code) || book.has(l.lead_code)).length, booking: periode.filter(l => setBook.has(l.lead_code)).length };
  // Visitor & lead periode yang menjadi Reserved / Booking
  const namaLead = Object.fromEntries(periode.map(l => [l.lead_code, l]));
  const jadi = [...new Set([...resv, ...book])].filter(k => namaLead[k]).map(k => { const l = namaLead[k]; const t = trxLead.filter(x => x.lead_code === k); const akhir = t[t.length - 1];
    const v = visRows.filter(x => x.lead_code === k)[0];
    return { nama: l.nama, sumber: l.sumber || '', sales: l.sales || '', masuk: tglLead(l), datang: v ? v.tgl : '', kategori: v ? v.kategori : '', status: akhir.jenis, tgl: akhir.tgl, unit: akhir.unit || '' }; })
    .sort((a, b) => b.tgl.localeCompare(a.tgl));
  const visitorJadi = visRows.filter(v => resv.has(v.lead_code) || book.has(v.lead_code)).length;
  delete visitor._rows;
  return Response.json({ project: pj, today, lead, visitor: { ...visitor, jadi: visitorJadi }, kprBaru, pergerakan, funnel, jadi });
}
