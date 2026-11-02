import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { reservasiLewat } from '@/lib/reservasi';
import { siapkanJanjian, perluUpdate, sekarangWIB } from '@/lib/janjian';
import { lihatBaris } from '@/lib/auth';
import { siapkanFuWajib, riwayatFU } from '@/lib/fuwajib-db';
import { statusFU } from '@/lib/fuwajib';
import { saring } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// Pengingat FU untuk user yang sedang login:
// sales -> hanya lead miliknya; manager -> semua lead
export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

  try { await siapkanFuWajib(sql); } catch (e) { console.error('fu wajib', e); }
  let rows = user.role === 'markom'
    // Marcom: pengingat FU seluruh lead tim marcom (nama penginput ikut ditampilkan)
    ? await sql`SELECT l.lead_code, l.nama, l.wa, l.project, l.sales, l.next_fu::text AS next_fu,
          CASE WHEN l.created_by <> ${user.username} THEN u.name ELSE NULL END AS markom
        FROM leads l JOIN users u ON u.username = l.created_by AND u.role = 'markom'
        WHERE l.next_fu IS NOT NULL AND l.next_fu::date <= ${today}
          AND l.status NOT IN ('Closing', 'Drop', 'Lost')
        ORDER BY l.next_fu`
    : user.role !== 'sales'
    ? await sql`SELECT l.lead_code, l.nama, l.wa, l.project, l.sales, l.next_fu::text AS next_fu,
          CASE WHEN u.role = 'markom' THEN u.name ELSE NULL END AS markom
        FROM leads l LEFT JOIN users u ON u.username = l.created_by
        WHERE l.next_fu IS NOT NULL AND l.next_fu::date <= ${today}
          AND l.status NOT IN ('Closing', 'Drop', 'Lost')
        ORDER BY l.next_fu`
    : await sql`SELECT lead_code, nama, wa, project, sales, next_fu::text AS next_fu
        FROM leads
        WHERE sales = ${user.name}
          AND next_fu IS NOT NULL AND next_fu::date <= ${today}
          AND status NOT IN ('Closing', 'Drop', 'Lost')
        ORDER BY next_fu`;

  // ===== Standar FU wajib (dari CRM Sales) =====
  // Label sentuhan (mis. "Sentuhan 3 dari 9 · Hari 3") untuk tiap pengingat follow up
  if (user.role !== 'markom' && rows.length) {
    try {
      const codes = rows.map(r => r.lead_code);
      const info = await sql`SELECT lead_code, sales, status, fu_mulai::text AS fu_mulai, fu_jalur, created_at, next_fu::text AS next_fu FROM leads WHERE lead_code = ANY(${codes}::text[])`;
      const riw = await riwayatFU(sql, codes);
      const m = Object.fromEntries(info.map(l => [l.lead_code, statusFU(l, riw, today)]));
      rows = rows.map(r => ({ ...r, fu_label: m[r.lead_code]?.aktif ? m[r.lead_code].label : '' }));
    } catch (e) { console.error('label fu', e); }
  }
  // Lead baru di tangan sales yang belum disentuh > 1 jam sejak diterima
  let belumDisentuh = [];
  if (['sales', 'administrator', 'headsales', 'salesmanager'].includes(user.role)) {
    try {
      const pemilik = user.role === 'sales' ? user.name : null;
      belumDisentuh = await sql`SELECT l.lead_code, l.nama, l.wa, l.project, l.sales, l.created_by, a.created_at AS sejak,
          floor(extract(epoch FROM now() - a.created_at) / 3600)::int AS jam
        FROM leads l
        JOIN LATERAL (SELECT created_at FROM lead_assign WHERE lead_code = l.lead_code AND ke = l.sales ORDER BY created_at DESC LIMIT 1) a ON true
        WHERE l.fu_jalur = 'baru' AND COALESCE(l.sales, '') <> '' AND l.status NOT IN ('Booking', 'Closing', 'Drop', 'Lost')
          AND a.created_at < now() - interval '1 hour' AND a.created_at > now() - interval '14 days'
          AND (${pemilik}::text IS NULL OR l.sales = ${pemilik})
          AND NOT EXISTS (SELECT 1 FROM followups f LEFT JOIN users u ON u.username = f.created_by
            WHERE f.lead_code = l.lead_code AND f.created_at > a.created_at AND COALESCE(u.role, '') <> 'markom'
              AND COALESCE(f.created_by, '') <> 'auto-wa' AND f.detail NOT LIKE 'Leads to Sales%')
        ORDER BY a.created_at LIMIT 30`;
      const ada = new Set(belumDisentuh.map(r => r.lead_code));
      rows = rows.filter(r => !ada.has(r.lead_code));
    } catch (e) { console.error('belum disentuh', e); }
  }
  // Janjian visit: sales → miliknya hari ini & besok + yang perlu di-update; administrator → yang perlu di-update
  let janjian = [];
  if (['sales', 'administrator', 'headsales', 'salesmanager'].includes(user.role)) {
    try {
      await siapkanJanjian(sql);
      const now = sekarangWIB();
      const besok = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
      const jr = await sql`SELECT j.id, j.lead_code, j.project, j.sales, j.jenis, j.lokasi, j.tgl::text AS tgl, j.jam, j.status, l.nama, l.wa, l.created_by
        FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code
        WHERE j.status = 'Terjadwal' AND j.tgl <= ${besok}::date
          AND (${user.role === 'sales' ? user.name : null}::text IS NULL OR j.sales = ${user.role === 'sales' ? user.name : null})
        ORDER BY j.tgl, j.jam`;
      janjian = jr.map(j => ({ ...j, perlu_update: perluUpdate(j, now) })).filter(j => user.role === 'sales' ? true : j.perlu_update);
    } catch (e) { console.error('janjian bell', e); }
  }

  // ===== Collection & KPR versi CRM (tabel crm_*): tunggakan, jatuh tempo, akad, kendala =====
  let tunggakanCrm = [], jatuhTempoCrm = [], akadCrm = [], kendalaCrm = [];
  if (user.role === 'collection') {
   try {
    const { daftarTagihan } = await import('@/lib/collection');
    const { siapkanKpr, statusKpr } = await import('@/lib/kpr');
    const pp = user.projects;
    const besok = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    let tagihan = [];
    try { tagihan = (await daftarTagihan(sql, { pp, hariIni: today })).filter(r => r.sisa > 0 && lihatBaris(user, { project: r.project, sales: r.sales, created_by: r.lead_by })); } catch (e) { console.error('reminder tagihan', e); }
    const tunggakan = tagihan.filter(r => r.jatuh_tempo && r.jatuh_tempo < today).sort((a, b) => b.hariLewat - a.hariLewat);
    const jatuhTempo = tagihan.filter(r => r.jatuh_tempo === today || r.jatuh_tempo === besok);
    let akad = [], kendala = [];
    try {
      await siapkanKpr(sql);
      const ks = await sql`SELECT k.id, k.lead_code, k.unit, k.akad_bank_id, k.akad_tgl::text AS akad_tgl, k.akad_realisasi::text AS akad_realisasi, k.updated_at, l.nama, l.sales, l.created_by AS lead_by, COALESCE(NULLIF(k.project, ''), l.project, '') AS project,
          (SELECT t.jenis FROM transactions t WHERE t.lead_code = k.lead_code ORDER BY t.id DESC LIMIT 1) AS trx_terakhir
        FROM crm_kpr k LEFT JOIN leads l ON l.lead_code = k.lead_code WHERE (${pp}::text[] IS NULL OR COALESCE(NULLIF(k.project, ''), l.project, '') = ANY(${pp}::text[]))`;
      const ids = ks.map(k => k.id);
      const bk = ids.length ? await sql`SELECT id, kpr_id, bank, tahap, kendala FROM crm_kpr_bank WHERE kpr_id = ANY(${ids}::int[])` : [];
      ks.filter(k => k.trx_terakhir !== 'Batal' && lihatBaris(user, { project: k.project, sales: k.sales, created_by: k.lead_by })).forEach(k => {
        const b = bk.filter(x => x.kpr_id === k.id), st = statusKpr(k, b, k.trx_terakhir);
        if (st.kategori === 'akad' && k.akad_tgl && !k.akad_realisasi && k.akad_tgl <= besok) akad.push({ id: k.id, nama: k.nama, unit: k.unit, tgl: k.akad_tgl, lewat: k.akad_tgl < today, bank: (b.find(x => x.id === k.akad_bank_id) || {}).bank || '' });
        const kd = b.filter(x => x.kendala && !['Ditolak', 'Tidak dilanjutkan'].includes(x.tahap)).map(x => `${x.bank}: ${x.kendala}`).join(' · ');
        if (st.kategori === 'berjalan' && kd) kendala.push({ id: k.id, nama: k.nama, unit: k.unit, kendala: kd, hari: Math.floor((Date.now() - new Date(k.updated_at).getTime()) / 86400000) });
      });
    } catch (e) { console.error('reminder kpr', e); }
    const ringkas = r => ({ id: r.id, lead_code: r.lead_code, nama: r.nama, unit: r.unit, ket: r.ket, sisa: r.sisa, jatuh_tempo: r.jatuh_tempo, hariLewat: r.hariLewat, wa: r.wa });
    tunggakanCrm = tunggakan.slice(0, 30).map(ringkas); jatuhTempoCrm = jatuhTempo.map(ringkas); akadCrm = akad; kendalaCrm = kendala.slice(0, 20);
   } catch (e) { console.error('pengingat collection crm', e); }
  }

  // ===== Lead masuk belum tercatat (dari CRM Sales, versi ringkas: satu baris per sumber) =====
  // Lead masuk tapi belum tercatat: bandingkan angka platform (Meta: percakapan WA dari iklan; GA4: klik WA website)
  // dengan lead yang diinput ke CRM pada hari yang sama. Hanya untuk marcom & manager/admin.
  let celah = [], celahTotal = null;
  if (['administrator', 'headsales', 'markom'].includes(user.role)) {
    try {
      const hari = await sql`SELECT d::date AS tgl FROM generate_series(${today}::date - 3, ${today}::date - 1, interval '1 day') d`;
      const meta = await sql`SELECT tgl, sum(COALESCE(hasil, 0))::int AS n FROM mi_ads
        WHERE sumber = 'meta-api' AND tgl BETWEEN ${today}::date - 3 AND ${today}::date - 1 GROUP BY tgl`;
      let ga = [];
      try { ga = await sql`SELECT tgl, sum(key_events)::int AS n FROM mi_ga4_daily
        WHERE tgl BETWEEN ${today}::date - 3 AND ${today}::date - 1 GROUP BY tgl`; } catch {}
      const crm = await sql`SELECT tgl,
          count(*) FILTER (WHERE sumber ~* '(facebook|instagram|whatsapp|meta)')::int AS meta,
          count(*) FILTER (WHERE sumber ~* 'website')::int AS web
        FROM leads WHERE tgl BETWEEN ${today}::date - 3 AND ${today}::date - 1 GROUP BY tgl`;
      const k = d => new Date(d).toISOString().slice(0, 10);
      const mM = Object.fromEntries(meta.map(r => [k(r.tgl), r.n]));
      const mG = Object.fromEntries(ga.map(r => [k(r.tgl), r.n]));
      const mC = Object.fromEntries(crm.map(r => [k(r.tgl), r]));
      for (const h of hari) {
        const t = k(h.tgl), c = mC[t] || { meta: 0, web: 0 };
        if ((mM[t] || 0) - c.meta >= 2) celah.push({ tgl: t, sumber: 'Iklan Meta (chat WA)', platform: mM[t], crm: c.meta });
        if ((mG[t] || 0) - c.web >= 3) celah.push({ tgl: t, sumber: 'Website (klik WA)', platform: mG[t], crm: c.web });
      }
      // Ringkas: satu baris per sumber (bukan per hari) — rentang tanggal ditulis sekali, angka dijumlahkan
      const ringkas = {};
      for (const c of celah) {
        const r = ringkas[c.sumber] || (ringkas[c.sumber] = { sumber: c.sumber, dari: c.tgl, sampai: c.tgl, platform: 0, crm: 0, hari: 0 });
        r.platform += c.platform || 0; r.crm += c.crm || 0; r.hari += 1;
        if (c.tgl < r.dari) r.dari = c.tgl;
        if (c.tgl > r.sampai) r.sampai = c.tgl;
      }
      celah = Object.values(ringkas).sort((a, b) => (b.platform - b.crm) - (a.platform - a.crm));
      // Total 7 hari terakhir (termasuk hari ini) — supaya angka per hari tidak disalahartikan sebagai total
      try {
        const m7 = await sql`SELECT COALESCE(sum(hasil), 0)::int AS n FROM mi_ads WHERE sumber = 'meta-api' AND tgl BETWEEN ${today}::date - 6 AND ${today}::date`;
        const g7 = await sql`SELECT COALESCE(sum(key_events), 0)::int AS n FROM mi_ga4_daily WHERE tgl BETWEEN ${today}::date - 6 AND ${today}::date`;
        const c7 = await sql`SELECT count(*) FILTER (WHERE sumber ~* '(facebook|instagram|whatsapp|meta)')::int AS meta,
          count(*) FILTER (WHERE sumber ~* 'website')::int AS web FROM leads WHERE tgl BETWEEN ${today}::date - 6 AND ${today}::date`;
        celahTotal = { dari: new Date(new Date(today).getTime() - 6 * 86400000).toISOString().slice(0, 10), sampai: today,
          meta: { platform: m7[0]?.n || 0, crm: c7[0]?.meta || 0 }, web: { platform: g7[0]?.n || 0, crm: c7[0]?.web || 0 } };
      } catch {}
    } catch (e) { console.error('celah lead', e); }
  }

  // Pengingat follow up lead hanya untuk peran yang melakukan / mengawasi follow up
  if (!['administrator', 'headsales', 'salesmanager', 'ceo', 'ceogrup', 'admin', 'sales', 'markom'].includes(user.role)) rows = [];
  const hariIni = rows.filter(r => r.next_fu === today);
  const terlambat = rows.filter(r => r.next_fu < today);

  // Khusus manager: unit bertransaksi/berstatus yang BELUM ditandai di peta Master Stock
  let stok = [];
  if (user.role !== 'sales') {
    const trx = await sql`
      SELECT t.id, t.jenis, t.unit, t.tgl_expire::text AS tgl_expire,
             COALESCE(NULLIF(t.project, ''), l.project, '') AS project
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.unit IS NOT NULL AND t.unit <> ''
      ORDER BY t.id`;
    const manual = await sql`SELECT project, unit, status FROM unit_manual`;
    const posRows = await sql`SELECT project, unit FROM unit_positions`;
    const posSet = new Set(posRows.map(p => p.project + '|' + p.unit));
    const m = {};
    trx.forEach(t => {
      if (!t.project) return;
      const key = t.project + '|' + t.unit;
      if (t.jenis === 'Batal') m[key] = null;
      else if (t.jenis === 'Reserved' && reservasiLewat(t.tgl_expire, today)) m[key] = null;
      else m[key] = t.jenis === 'Reserved' ? 'kuning' : 'merah';
    });
    manual.forEach(x => {
      const key = x.project + '|' + x.unit;
      m[key] = x.status === 'Terjual' ? 'merah' : x.status === 'Reserved' ? 'kuning' : null;
    });
    stok = Object.entries(m)
      .filter(([k, v]) => v && !posSet.has(k))
      .map(([k, v]) => ({ project: k.split('|')[0], unit: k.split('|')[1], warna: v }));
  }

  // Pekerjaan divisi yang jatuh tempo (Collection, KPR, Finance, Project, Marcom, Estate)
  // Pengingat pekerjaan divisi: yang mendekati jatuh tempo (3 hari ke depan)
  // dan yang sudah terlambat. Inilah satu-satunya pengingat rutin tiap divisi.
  let tugas = [];
  const DIV = ['collection', 'finance', 'project', 'markom', 'estate'];
  const batas = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  if (['administrator', 'headsales', 'salesmanager'].includes(user.role) || DIV.includes(user.role)) {
    tugas = ['administrator', 'headsales', 'salesmanager'].includes(user.role)
      ? await sql`SELECT p.id, p.judul, p.divisi, p.deadline::text AS deadline, p.lead_code,
            l.nama, t.unit, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
          FROM proses p JOIN transactions t ON t.id = p.trx_id
          LEFT JOIN leads l ON l.lead_code = p.lead_code
          WHERE t.batal_at IS NULL AND p.status <> 'Selesai' AND p.deadline IS NOT NULL AND p.deadline <= ${batas}
          ORDER BY p.deadline LIMIT 30`
      : await sql`SELECT p.id, p.judul, p.divisi, p.deadline::text AS deadline, p.lead_code,
            l.nama, t.unit, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
          FROM proses p JOIN transactions t ON t.id = p.trx_id
          LEFT JOIN leads l ON l.lead_code = p.lead_code
          WHERE t.batal_at IS NULL AND p.divisi = ${user.role} AND p.status <> 'Selesai'
            AND p.deadline IS NOT NULL AND p.deadline <= ${batas}
          ORDER BY p.deadline LIMIT 30`;
  }

  // Batas tujuh hari penandatanganan konsumen — mendekati atau melewati tenggat
  let ttd = [];
  if (['sales', 'adminsales', 'administrator', 'headsales', 'salesmanager'].includes(user.role)) {
    const batasTtd = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    ttd = user.role === 'sales'
      ? await sql`SELECT t.id, t.lead_code, t.unit, t.ttd_deadline::text AS ttd_deadline,
            l.nama, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
          FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
          WHERE t.tahap = 3 AND t.ttd_selesai_at IS NULL AND t.ttd_deadline IS NOT NULL
            AND t.ttd_deadline <= ${batasTtd} AND l.sales = ${user.name}
          ORDER BY t.ttd_deadline LIMIT 20`
      : await sql`SELECT t.id, t.lead_code, t.unit, t.ttd_deadline::text AS ttd_deadline,
            l.nama, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
          FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
          WHERE t.tahap = 3 AND t.ttd_selesai_at IS NULL AND t.ttd_deadline IS NOT NULL
            AND t.ttd_deadline <= ${batasTtd}
          ORDER BY t.ttd_deadline LIMIT 20`;
  }

  // Reservasi yang sedang berjalan dan hampir (2 hari) / sudah melewati batas waktunya.
  // Sales hanya melihat reservasi lead miliknya; Administrator & Admin Sales melihat semuanya.
  let reservasi = [];
  if (['sales', 'adminsales', 'administrator', 'headsales', 'salesmanager'].includes(user.role)) {
    const batasR = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const semua = await sql`SELECT t.id, t.unit, t.lead_code, t.tgl_expire::text AS tgl_expire, l.sales,
          COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama
        FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
        WHERE t.jenis = 'Reserved' AND t.tgl_expire IS NOT NULL AND t.tgl_expire <= ${batasR}
          AND NOT EXISTS (SELECT 1 FROM transactions t2 LEFT JOIN leads l2 ON l2.lead_code = t2.lead_code
            WHERE t2.unit = t.unit AND t2.id > t.id AND COALESCE(NULLIF(t2.project, ''), l2.project, '') = COALESCE(NULLIF(t.project, ''), l.project, ''))
        ORDER BY t.tgl_expire LIMIT 30`;
    reservasi = user.role === 'sales' ? semua.filter(r => r.sales === user.name) : semua;
  }

  // Tagihan mendekati (3 hari) atau melewati jatuh tempo — Collection, Finance, Admin Sales
  let tagihan = [];
  if (['collection', 'finance', 'adminsales', 'administrator', 'headsales', 'salesmanager'].includes(user.role)) {
    tagihan = await sql`SELECT g.id, g.nama, g.jatuh_tempo::text AS jatuh_tempo, (g.nilai - g.dibayar)::bigint AS sisa,
          t.lead_code, t.unit, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama_konsumen
        FROM tagihan g JOIN transactions t ON t.id = g.trx_id LEFT JOIN leads l ON l.lead_code = t.lead_code
        WHERE t.batal_at IS NULL AND g.status <> 'Lunas' AND g.jatuh_tempo <= ${batas}
        ORDER BY g.jatuh_tempo LIMIT 30`;
  }

  // Akun per project: semua daftar pengingat disaring ke project yang dipegang akun, lalu total dihitung ulang
  const d = saring(user, { hariIni, terlambat, belumDisentuh, janjian, celah, stok, tugas, ttd, tagihan, reservasi, tunggakanCrm, jatuhTempoCrm, akadCrm, kendalaCrm });
  const total = Object.values(d).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  return Response.json({ today, ...d, celahTotal, total });
}
