import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ringkasStok } from '@/lib/stok';
import { siapkanKpr, sinkronKpr, statusKpr } from '@/lib/kpr';

export const dynamic = 'force-dynamic';

// Beranda per peran — semua angka diambil dari data CRM asli, definisi sama dengan Panduan Kerja v1.3:
// L0 lead masuk · L1 tersentuh FU orang · L2 pernah Warm/Hot/Appointment/Site Visit/Booking, Walk In, atau bertransaksi
// CPL/CPQL = spend ÷ lead ber-campaign (sama dengan Analisa Marcom). Data analisa mulai 1 Sep 2026.
const MULAI = process.env.MI_ANALISA_MULAI || '2026-09-01';
const AKTIF = ['Closing', 'Drop', 'Lost'];
const tglWIB = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

// Biaya berulang (amortisasi) disebar rata per bulan, pro-rata hari untuk bulan berjalan — sama dengan Analisa Marcom
function spendAmort(amort, d1, d2, hariIni) {
  let tot = 0;
  const hariMs = 86400000, batasHariIni = Date.parse(hariIni + 'T00:00:00Z');
  for (const a of amort) {
    const n = Math.max(1, Number(a.bulan) || 1), total = Number(a.total) || 0, dasar = Math.floor(total / n);
    const [yy, mm] = (a.mulai instanceof Date ? a.mulai.toISOString() : String(a.mulai)).slice(0, 7).split('-').map(Number);
    for (let i = 0; i < n; i++) {
      const awal = Date.UTC(yy, mm - 1 + i, 1), akhir = Date.UTC(yy, mm + i, 0);
      if (awal > batasHariIni) break;
      const dari = Math.max(awal, Date.parse(d1 + 'T00:00:00Z'));
      const sampai = Math.min(akhir, Date.parse(d2 + 'T00:00:00Z'), batasHariIni);
      if (sampai < dari) continue;
      const jumlahHari = Math.round((akhir - awal) / hariMs) + 1, hari = Math.round((sampai - dari) / hariMs) + 1;
      const porsi = i === n - 1 ? total - dasar * (n - 1) : dasar;
      tot += Math.round(porsi * hari / jumlahHari);
    }
  }
  return tot;
}

async function berandaMarcom(sql, user, hariIni) {
  const pp = user.projects; // akun per project (null = semua)
  const awalBulan = hariIni.slice(0, 8) + '01';
  const d1 = awalBulan < MULAI ? MULAI : awalBulan;
  const [funnel, spendRows, amort, camp, siap, siapN, due, selesai, stok] = await Promise.all([
    sql`SELECT count(*)::int AS l0,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM followups f WHERE f.lead_code = l.lead_code AND COALESCE(f.created_by, '') <> 'auto-wa'))::int AS l1,
        count(*) FILTER (WHERE (l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.l2_at IS NOT NULL OR l.sumber ILIKE '%walk%')
          OR EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Reserved','Booking','Closing')))::int AS l2,
        count(*) FILTER (WHERE COALESCE(l.campaign, '') <> '')::int AS p0,
        count(*) FILTER (WHERE COALESCE(l.campaign, '') <> '' AND ((l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.l2_at IS NOT NULL OR l.sumber ILIKE '%walk%')
          OR EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Reserved','Booking','Closing'))))::int AS p2,
        count(*) FILTER (WHERE l.tgl = ${hariIni}::date)::int AS hari_ini
      FROM leads l WHERE l.tgl >= ${d1}::date AND l.tgl <= ${hariIni}::date AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`.catch(async () =>
      // l2_at belum ada (Analisa Marcom belum pernah dibuka) — hitung tanpa jejak l2_at
      sql`SELECT count(*)::int AS l0, 0 AS l1, count(*) FILTER (WHERE l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.sumber ILIKE '%walk%')::int AS l2,
        count(*) FILTER (WHERE COALESCE(l.campaign, '') <> '')::int AS p0, 0 AS p2, count(*) FILTER (WHERE l.tgl = ${hariIni}::date)::int AS hari_ini
        FROM leads l WHERE l.tgl >= ${d1}::date AND l.tgl <= ${hariIni}::date AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`),
    sql`SELECT COALESCE(sum(spend), 0)::numeric AS spend FROM mi_ads WHERE tgl >= ${d1}::date AND tgl <= ${hariIni}::date
      AND (${pp}::text[] IS NULL OR EXISTS (SELECT 1 FROM mi_campaigns mc WHERE mc.nama = mi_ads.campaign AND mc.project = ANY(${pp}::text[])))`.catch(() => [{ spend: 0 }]),
    sql`SELECT a.*, c.project FROM mi_amort a LEFT JOIN mi_campaigns c ON c.nama = a.campaign`.catch(() => []),
    sql`SELECT count(*) FILTER (WHERE status = 'Aktif')::int AS tayang,
        count(*) FILTER (WHERE COALESCE(meta_info, '') LIKE 'Belum tersambung%' AND status <> 'Selesai')::int AS belum
      FROM mi_campaigns WHERE (${pp}::text[] IS NULL OR project = ANY(${pp}::text[]))`.catch(() => sql`SELECT count(*) FILTER (WHERE status = 'Aktif')::int AS tayang, 0 AS belum FROM mi_campaigns WHERE (${pp}::text[] IS NULL OR project = ANY(${pp}::text[]))`.catch(() => [{ tayang: 0, belum: 0 }])),
    // Lead tim Marcom yang sudah hangat tetapi belum punya sales (PIC)
    sql`SELECT l.id, l.lead_code, l.nama, l.project, l.status, COALESCE(l.tipe, '') AS tipe,
        (SELECT f.detail FROM followups f WHERE f.lead_code = l.lead_code ORDER BY f.id DESC LIMIT 1) AS fu_terakhir,
        (SELECT COALESCE(u2.name, f.created_by) FROM followups f LEFT JOIN users u2 ON u2.username = f.created_by
          WHERE f.lead_code = l.lead_code AND COALESCE(f.created_by, '') <> 'auto-wa' ORDER BY f.id DESC LIMIT 1) AS fu_oleh
      FROM leads l JOIN users u ON u.username = l.created_by AND u.role = 'markom'
      WHERE COALESCE(l.sales, '') = '' AND l.status IN ('Hot', 'Site Visit', 'Appointment', 'Warm') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
      ORDER BY CASE l.status WHEN 'Hot' THEN 0 WHEN 'Site Visit' THEN 1 WHEN 'Appointment' THEN 2 ELSE 3 END, l.updated_at DESC
      LIMIT 6`,
    sql`SELECT count(*)::int AS n FROM leads l JOIN users u ON u.username = l.created_by AND u.role = 'markom'
      WHERE COALESCE(l.sales, '') = '' AND l.status IN ('Hot', 'Site Visit', 'Appointment', 'Warm') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`,
    // Follow up jatuh tempo (hari ini & terlambat) seluruh lead tim Marcom
    sql`SELECT l.lead_code, l.nama, l.status, l.next_fu::text AS next_fu, COALESCE(u.name, l.created_by) AS penginput, l.created_by
      FROM leads l JOIN users u ON u.username = l.created_by AND u.role = 'markom'
      WHERE l.next_fu IS NOT NULL AND l.next_fu <= ${hariIni}::date AND l.status NOT IN ('Closing', 'Drop', 'Lost') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
      ORDER BY l.next_fu, l.id`,
    sql`SELECT count(DISTINCT f.lead_code)::int AS n FROM followups f
      JOIN leads l ON l.lead_code = f.lead_code JOIN users u ON u.username = l.created_by AND u.role = 'markom'
      WHERE (f.created_at AT TIME ZONE 'Asia/Jakarta')::date = ${hariIni}::date AND COALESCE(f.created_by, '') <> 'auto-wa' AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`,
    ringkasStok(sql).then(r => pp ? r.filter(x => pp.includes(x.project)) : r).catch(e => { console.error('stok beranda', e); return []; }),
  ]);
  const F = funnel[0] || {};
  const spend = Math.round(Number(spendRows[0]?.spend || 0) + spendAmort(pp ? amort.filter(a => pp.includes(a.project)) : amort, d1, hariIni, hariIni));
  return {
    peran: 'markom', d1, hariIni,
    funnel: { l0: F.l0 || 0, l1: F.l1 || 0, l2: F.l2 || 0, p0: F.p0 || 0, p2: F.p2 || 0, hariIni: F.hari_ini || 0 },
    spend, cpl: F.p0 ? Math.round(spend / F.p0) : null, cpql: F.p2 ? Math.round(spend / F.p2) : null,
    campaign: camp[0] || { tayang: 0, belum: 0 },
    siapOper: siap, siapOperTotal: siapN[0]?.n || 0, stok,
    fu: { selesai: selesai[0]?.n || 0, sisa: due.length, terlambat: due.filter(r => r.next_fu < hariIni).length,
      daftar: due.slice(0, 6).map(r => ({ ...r, terlambat: r.next_fu < hariIni, milikSaya: r.created_by === user.username })) },
  };
}

async function berandaSales(sql, user, hariIni, semua) {
  const pp = user.projects;
  const awalBulan = hariIni.slice(0, 8) + '01';
  const nama = semua ? null : user.name;
  const [baru, due, selesai, status, reserved, jual, stok] = await Promise.all([
    // Lead yang dioper ke saya (bukan input saya sendiri) dan belum saya hubungi sejak dioper
    sql`SELECT l.id, l.lead_code, l.nama, l.wa, l.project, l.status, a.created_at AS dioper, COALESCE(u.name, a.oleh) AS oleh
      FROM leads l
      JOIN LATERAL (SELECT created_at, oleh FROM lead_assign WHERE lead_code = l.lead_code AND ke = l.sales ORDER BY created_at DESC LIMIT 1) a ON true
      LEFT JOIN users u ON u.username = a.oleh
      WHERE (${nama}::text IS NULL OR l.sales = ${nama}) AND COALESCE(l.sales, '') <> '' AND l.status NOT IN ('Closing', 'Drop', 'Lost')
        AND a.created_at > now() - interval '14 days' AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
        AND a.oleh NOT IN (SELECT username FROM users WHERE name = l.sales)
        AND NOT EXISTS (SELECT 1 FROM followups f JOIN users s ON s.username = f.created_by AND s.name = l.sales
          WHERE f.lead_code = l.lead_code AND f.created_at > a.created_at)
      ORDER BY a.created_at DESC LIMIT 5`.catch(() => []),
    sql`SELECT l.lead_code, l.nama, l.wa, l.status, l.project, l.next_fu::text AS next_fu
      FROM leads l WHERE (${nama}::text IS NULL OR l.sales = ${nama})
        AND l.next_fu IS NOT NULL AND l.next_fu <= ${hariIni}::date AND l.status NOT IN ('Closing', 'Drop', 'Lost') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
      ORDER BY l.next_fu, CASE l.status WHEN 'Hot' THEN 0 WHEN 'Site Visit' THEN 1 WHEN 'Appointment' THEN 2 WHEN 'Warm' THEN 3 ELSE 4 END`,
    sql`SELECT count(DISTINCT f.lead_code)::int AS n FROM followups f JOIN leads l ON l.lead_code = f.lead_code
      WHERE (${nama}::text IS NULL OR l.sales = ${nama}) AND (f.created_at AT TIME ZONE 'Asia/Jakarta')::date = ${hariIni}::date
        AND COALESCE(f.created_by, '') <> 'auto-wa' AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
        AND (${nama}::text IS NULL OR f.created_by IN (SELECT username FROM users WHERE name = ${nama}))`,
    sql`SELECT status, count(*)::int AS n FROM leads l WHERE (${nama}::text IS NULL OR l.sales = ${nama}) AND l.status NOT IN ('Closing', 'Drop', 'Lost', 'Booking') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[])) GROUP BY l.status`,
    // Reserved aktif: transaksi terakhir lead adalah Reserved
    sql`SELECT count(*)::int AS n FROM leads l WHERE (${nama}::text IS NULL OR l.sales = ${nama}) AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
      AND (SELECT t.jenis FROM transactions t WHERE t.lead_code = l.lead_code ORDER BY t.id DESC LIMIT 1) = 'Reserved'`,
    // Penjualan diakui pada tanggal Booking (bulan berjalan), satu lead dihitung sekali
    sql`SELECT count(DISTINCT t.lead_code)::int AS n, COALESCE(sum(x.nilai), 0)::numeric AS nilai FROM transactions t
      JOIN leads l ON l.lead_code = t.lead_code
      JOIN LATERAL (SELECT COALESCE(t.nilai_jual, t.nilai, 0) AS nilai) x ON true
      WHERE (${nama}::text IS NULL OR l.sales = ${nama}) AND t.jenis = 'Booking' AND t.tgl >= ${awalBulan}::date AND t.tgl <= ${hariIni}::date AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`,
    // Stok unit: perhitungan yang sama persis dengan halaman Master Stock (lib/stok.js)
    ringkasStok(sql).then(r => pp ? r.filter(x => pp.includes(x.project)) : r).catch(e => { console.error('stok beranda', e); return []; }),
  ]);
  return {
    peran: 'sales', hariIni,
    baruDioper: baru.map(r => ({ ...r, menit: Math.max(0, Math.round((Date.now() - new Date(r.dioper).getTime()) / 60000)) })),
    fu: { selesai: selesai[0]?.n || 0, sisa: due.length, terlambat: due.filter(r => r.next_fu < hariIni).length,
      daftar: due.slice(0, 6).map(r => ({ ...r, terlambat: r.next_fu < hariIni })) },
    status: Object.fromEntries(status.map(r => [r.status, r.n])), reserved: reserved[0]?.n || 0,
    jual: { n: jual[0]?.n || 0, nilai: Number(jual[0]?.nilai || 0) },
    stok,
  };
}


// ===== Beranda Manager & CEO Project =====
function geserBulan(iso, n) { const [y, m] = iso.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10); }

async function berandaPimpinan(sql, user, hariIni, pilihProj) {
  const pp = pilihProj ? [pilihProj] : user.projects; // null = semua project
  const awalBulan = hariIni.slice(0, 8) + '01';
  const d1 = awalBulan < MULAI ? MULAI : awalBulan;
  const lalu1 = geserBulan(awalBulan, -1);
  const akhirLalu = new Date(Date.parse(awalBulan + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const lalu2 = (lalu1.slice(0, 8) + hariIni.slice(8, 10)) > akhirLalu ? akhirLalu : lalu1.slice(0, 8) + hariIni.slice(8, 10);
  const batas14 = new Date(Date.parse(hariIni + 'T00:00:00Z') - 14 * 86400000).toISOString().slice(0, 10);
  await siapkanKpr(sql); await sinkronKpr(sql);

  const [jual, jualLalu, resv, funnel, spendRows, amort, camps, l2Camp, bookCamp, spendCamp, belum, resLama, hangat, kprRows, sales] = await Promise.all([
    sql`SELECT COALESCE(NULLIF(t.project, ''), l.project, '') AS project, count(DISTINCT t.lead_code)::int AS n,
        COALESCE(sum(COALESCE(t.nilai_jual, t.nilai, 0)), 0)::numeric AS nilai
      FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis = 'Booking' AND t.tgl >= ${awalBulan}::date AND t.tgl <= ${hariIni}::date
        AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ANY(${pp}::text[]))
      GROUP BY 1`,
    sql`SELECT count(DISTINCT t.lead_code)::int AS n FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis = 'Booking' AND t.tgl >= ${lalu1}::date AND t.tgl <= ${lalu2}::date
        AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ANY(${pp}::text[]))`,
    sql`SELECT count(DISTINCT t.lead_code)::int AS n, COALESCE(sum(t.nilai), 0)::numeric AS nilai FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis = 'Reserved' AND t.tgl >= ${awalBulan}::date AND t.tgl <= ${hariIni}::date
        AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ANY(${pp}::text[]))`,
    sql`SELECT count(*)::int AS l0,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM followups f WHERE f.lead_code = l.lead_code AND COALESCE(f.created_by, '') <> 'auto-wa'))::int AS l1,
        count(*) FILTER (WHERE (l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.sumber ILIKE '%walk%'
          OR EXISTS (SELECT 1 FROM transactions t2 WHERE t2.lead_code = l.lead_code AND t2.jenis IN ('Reserved','Booking','Closing'))))::int AS l2,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM transactions t3 WHERE t3.lead_code = l.lead_code AND t3.jenis IN ('Booking','Closing')))::int AS l3,
        count(*) FILTER (WHERE COALESCE(l.campaign, '') <> '' AND (l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.sumber ILIKE '%walk%'
          OR EXISTS (SELECT 1 FROM transactions t2 WHERE t2.lead_code = l.lead_code AND t2.jenis IN ('Reserved','Booking','Closing'))))::int AS p2
      FROM leads l WHERE l.tgl >= ${d1}::date AND l.tgl <= ${hariIni}::date AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`,
    sql`SELECT COALESCE(sum(spend), 0)::numeric AS spend FROM mi_ads WHERE tgl >= ${d1}::date AND tgl <= ${hariIni}::date
      AND (${pp}::text[] IS NULL OR EXISTS (SELECT 1 FROM mi_campaigns mc WHERE mc.nama = mi_ads.campaign AND mc.project = ANY(${pp}::text[])))
      AND NOT (COALESCE(mi_ads.sumber, 'manual') = 'manual' AND EXISTS (SELECT 1 FROM mi_ads b WHERE b.sumber IN ('meta-api', 'google-api') AND lower(b.campaign) = lower(mi_ads.campaign)))`.catch(() => [{ spend: 0 }]),
    sql`SELECT a.*, c.project FROM mi_amort a LEFT JOIN mi_campaigns c ON c.nama = a.campaign`.catch(() => []),
    sql`SELECT nama, project, platform FROM mi_campaigns WHERE status = 'Aktif' AND (${pp}::text[] IS NULL OR project = ANY(${pp}::text[]))`.catch(() => []),
    sql`SELECT l.campaign AS c, count(*)::int AS n FROM leads l WHERE COALESCE(l.campaign, '') <> '' AND l.tgl >= ${d1}::date AND l.tgl <= ${hariIni}::date
      AND (l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.sumber ILIKE '%walk%'
        OR EXISTS (SELECT 1 FROM transactions t2 WHERE t2.lead_code = l.lead_code AND t2.jenis IN ('Reserved','Booking','Closing'))) GROUP BY 1`,
    sql`SELECT l.campaign AS c, count(DISTINCT t.lead_code)::int AS n FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
      WHERE COALESCE(l.campaign, '') <> '' AND t.jenis = 'Booking' AND t.tgl >= ${awalBulan}::date AND t.tgl <= ${hariIni}::date GROUP BY 1`,
    sql`SELECT campaign AS c, COALESCE(sum(spend), 0)::numeric AS s FROM mi_ads WHERE tgl >= ${d1}::date AND tgl <= ${hariIni}::date GROUP BY 1`.catch(() => []),
    // Lead yang dioper ke sales > 24 jam tetapi belum dihubungi sales itu
    sql`SELECT l.sales, count(*)::int AS n FROM leads l
      JOIN LATERAL (SELECT created_at, oleh FROM lead_assign WHERE lead_code = l.lead_code AND ke = l.sales ORDER BY created_at DESC LIMIT 1) a ON true
      WHERE COALESCE(l.sales, '') <> '' AND l.status NOT IN ('Closing', 'Drop', 'Lost') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
        AND a.created_at < now() - interval '24 hours' AND a.created_at > now() - interval '14 days'
        AND a.oleh NOT IN (SELECT username FROM users WHERE name = l.sales)
        AND NOT EXISTS (SELECT 1 FROM followups f JOIN users s ON s.username = f.created_by AND s.name = l.sales WHERE f.lead_code = l.lead_code AND f.created_at > a.created_at)
      GROUP BY l.sales ORDER BY 2 DESC`.catch(() => []),
    // Reserved > 14 hari belum naik Booking
    sql`SELECT x.lead_code, x.nama, x.sales, x.unit, x.project, x.tgl::text AS tgl FROM (
        SELECT DISTINCT ON (t.lead_code) t.lead_code, t.jenis, t.tgl, t.unit, l.nama, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
        FROM transactions t JOIN leads l ON l.lead_code = t.lead_code ORDER BY t.lead_code, t.id DESC) x
      WHERE x.jenis = 'Reserved' AND x.tgl <= ${batas14}::date AND (${pp}::text[] IS NULL OR x.project = ANY(${pp}::text[])) ORDER BY x.tgl LIMIT 6`,
    sql`SELECT count(*)::int AS n FROM leads l JOIN users u ON u.username = l.created_by AND u.role = 'markom'
      WHERE COALESCE(l.sales, '') = '' AND l.status IN ('Hot', 'Site Visit', 'Appointment', 'Warm') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`,
    sql`SELECT k.id, k.lead_code, k.unit, k.slik_tgl, k.akad_bank_id, k.akad_tgl::text AS akad_tgl, k.updated_at, l.nama, l.sales,
        COALESCE(NULLIF(k.project, ''), l.project, '') AS project,
        (SELECT t.jenis FROM transactions t WHERE t.lead_code = k.lead_code ORDER BY t.id DESC LIMIT 1) AS trx_terakhir
      FROM kpr k LEFT JOIN leads l ON l.lead_code = k.lead_code
      WHERE (${pp}::text[] IS NULL OR COALESCE(NULLIF(k.project, ''), l.project, '') = ANY(${pp}::text[])) ORDER BY k.updated_at DESC`.catch(() => []),
    sql`SELECT name, projects FROM users WHERE role = 'sales' AND active = true ORDER BY name`.catch(() => sql`SELECT name, null AS projects FROM users WHERE role = 'sales' AND active = true ORDER BY name`),
  ]);

  // Uang & biaya
  const jualN = jual.reduce((a, r) => a + r.n, 0), jualNilai = jual.reduce((a, r) => a + Number(r.nilai || 0), 0);
  const amortPilih = pp ? amort.filter(a => pp.includes(a.project)) : amort;
  const spend = Math.round(Number(spendRows[0]?.spend || 0) + spendAmort(amortPilih, d1, hariIni, hariIni));
  const F = funnel[0] || {};
  // Campaign aktif: spend (iklan + biaya berulang) per campaign, lead berkualitas, booking
  const peta = (rows, k = 'n') => Object.fromEntries(rows.map(r => [r.c, Number(r[k] || 0)]));
  const l2C = peta(l2Camp), bkC = peta(bookCamp), spC = peta(spendCamp, 's');
  const campaign = camps.map(c => {
    const s = (spC[c.nama] || 0) + spendAmort(amort.filter(a => a.campaign === c.nama), d1, hariIni, hariIni);
    const l2 = l2C[c.nama] || 0;
    return { nama: c.nama, project: c.project, platform: c.platform, spend: Math.round(s), l2, cpql: l2 ? Math.round(s / l2) : null, booking: bkC[c.nama] || 0 };
  }).sort((a, b) => (a.cpql ?? 9e15) - (b.cpql ?? 9e15));

  // KPR: status terakhir tiap konsumen
  const ids = kprRows.map(k => k.id);
  const banks = ids.length ? await sql`SELECT id, kpr_id, bank, ao_nama, tahap, kendala FROM kpr_bank WHERE kpr_id = ANY(${ids}::int[]) ORDER BY id` : [];
  // Hanya konsumen yang sudah Booking (proses KPR baru dihitung setelah Booking)
  const kpr = kprRows.filter(k => k.trx_terakhir !== 'Batal' && k.trx_terakhir !== 'Reserved').map(k => {
    const bk = banks.filter(b => b.kpr_id === k.id);
    const st = statusKpr(k, bk, k.trx_terakhir);
    return { id: k.id, nama: k.nama, unit: k.unit, project: k.project, sales: k.sales, akad_tgl: k.akad_tgl,
      banks: bk.map(b => b.bank), akadBank: (bk.find(b => b.id === k.akad_bank_id) || {}).bank || '', tidakLanjut: bk.filter(b => b.tahap === 'Tidak dilanjutkan').map(b => b.bank),
      status: st, kendala: bk.filter(b => b.kendala && !['Ditolak', 'Tidak dilanjutkan'].includes(b.tahap)).map(b => `${b.bank}: ${b.kendala}`).join(' · '),
      diam: Math.floor((Date.now() - new Date(k.updated_at).getTime()) / 86400000), updated_at: k.updated_at };
  });
  const kprAktif = kpr.filter(k => k.status.kategori === 'berjalan' || k.status.kategori === 'sp3k' || k.diam <= 30);
  const kprDiam = kpr.filter(k => (k.status.kategori === 'berjalan' || k.status.kategori === 'sp3k') && k.diam > 5);

  // Performa sales
  const salesPilih = sales.filter(s => !pp || !Array.isArray(s.projects) || !s.projects.length || s.projects.some(p => pp.includes(p))).map(s => s.name);
  let perf = [];
  if (salesPilih.length) {
    const [akt, resp, bks] = await Promise.all([
      sql`SELECT l.sales, count(*) FILTER (WHERE l.status NOT IN ('Closing','Drop','Lost','Booking'))::int AS aktif,
          count(*) FILTER (WHERE l.next_fu IS NOT NULL AND l.next_fu < ${hariIni}::date AND l.status NOT IN ('Closing','Drop','Lost'))::int AS telat
        FROM leads l WHERE l.sales = ANY(${salesPilih}::text[]) AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[])) GROUP BY 1`,
      sql`SELECT a.ke AS sales, avg(EXTRACT(EPOCH FROM (f1.waktu - a.created_at)) / 3600)::numeric AS jam FROM lead_assign a
          JOIN leads l ON l.lead_code = a.lead_code
          JOIN LATERAL (SELECT min(f.created_at) AS waktu FROM followups f JOIN users s ON s.username = f.created_by AND s.name = a.ke
            WHERE f.lead_code = a.lead_code AND f.created_at > a.created_at) f1 ON f1.waktu IS NOT NULL
        WHERE a.ke = ANY(${salesPilih}::text[]) AND a.created_at >= ${awalBulan}::date AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[])) GROUP BY 1`.catch(() => []),
      sql`SELECT l.sales, count(DISTINCT t.lead_code)::int AS n FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
        WHERE t.jenis = 'Booking' AND t.tgl >= ${awalBulan}::date AND t.tgl <= ${hariIni}::date AND l.sales = ANY(${salesPilih}::text[])
          AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ANY(${pp}::text[])) GROUP BY 1`,
    ]);
    const proyekSales = Object.fromEntries(sales.map(s => [s.name, Array.isArray(s.projects) && s.projects.length ? s.projects : null]));
    perf = salesPilih.map(n => {
      const a = akt.find(x => x.sales === n) || {}, r = resp.find(x => x.sales === n), b = bks.find(x => x.sales === n);
      return { nama: n, project: proyekSales[n], aktif: a.aktif || 0, telat: a.telat || 0, respon: r ? Math.round(Number(r.jam) * 10) / 10 : null,
        kpr: kpr.filter(k => k.sales === n && (k.status.kategori === 'berjalan' || k.status.kategori === 'sp3k')).length, booking: b?.n || 0 };
    }).sort((x, y) => y.booking - x.booking || y.aktif - x.aktif);
  }

  // Perlu perhatian
  const perhatian = [];
  kprDiam.slice(0, 3).forEach(k => perhatian.push({ level: 'merah', judul: `KPR ${k.nama} tidak di-update ${k.diam} hari`, sub: [k.project, k.unit, k.banks.join(', ') || 'belum diajukan', k.status.label, k.sales].filter(Boolean).join(' · '), href: '/kpr-proses?id=' + k.id }));
  resLama.forEach(r => {
    const h = Math.round((Date.parse(hariIni) - Date.parse(r.tgl)) / 86400000);
    const kp = kpr.find(k => k.nama === r.nama);
    perhatian.push({ level: 'merah', judul: `Reserved ${r.unit || r.nama} sudah ${h} hari belum Booking`, sub: [r.nama, r.project, r.sales, kp ? 'KPR: ' + kp.status.label : ''].filter(Boolean).join(' · '), href: '/leads' });
  });
  const totBelum = belum.reduce((a, r) => a + r.n, 0);
  if (totBelum) perhatian.push({ level: 'emas', judul: `${totBelum} lead dari Marcom belum dihubungi > 24 jam`, sub: belum.map(r => `${r.sales} ${r.n}`).join(' · '), href: '/leads' });
  if (hangat[0]?.n) perhatian.push({ level: 'emas', judul: `${hangat[0].n} lead hangat belum dioper ke sales`, sub: 'Warm/Hot input tim Marcom tanpa PIC', href: '/leads' });

  // Tim hari ini (khusus manager)
  let tim = null;
  if (user.role === 'manager') {
    try {
      const [aktifHari, semua, gagal, input] = await Promise.all([
        sql`SELECT DISTINCT username FROM activity_log WHERE waktu >= (${hariIni}::date::timestamp AT TIME ZONE 'Asia/Jakarta') AND username IS NOT NULL`,
        sql`SELECT username, name FROM users WHERE active = true`,
        sql`SELECT count(*)::int AS n FROM activity_log WHERE aksi = 'Login gagal' AND waktu >= (${hariIni}::date::timestamp AT TIME ZONE 'Asia/Jakarta')`,
        sql`SELECT count(*)::int AS n FROM activity_log WHERE aksi IN ('Input', 'Update', 'Upload') AND waktu >= (${hariIni}::date::timestamp AT TIME ZONE 'Asia/Jakarta')`,
      ]);
      const set = new Set(aktifHari.map(r => r.username));
      tim = { aktif: semua.filter(u => set.has(u.username)).length, total: semua.length, belum: semua.filter(u => !set.has(u.username)).map(u => u.name), gagal: gagal[0]?.n || 0, input: input[0]?.n || 0 };
    } catch { tim = null; }
  }

  let stok = await ringkasStok(sql).catch(() => []);
  if (pp) stok = stok.filter(x => pp.includes(x.project));
  return {
    peran: 'pimpinan', hariIni, project: pilihProj || null, proyekSaya: user.projects,
    jual: { n: jualN, nilai: jualNilai, perProject: jual, laluN: jualLalu[0]?.n || 0, reservedN: resv[0]?.n || 0, reservedNilai: Number(resv[0]?.nilai || 0) },
    funnel: { l0: F.l0 || 0, l1: F.l1 || 0, l2: F.l2 || 0, l3: F.l3 || 0 },
    biaya: { spend, cpql: F.p2 ? Math.round(spend / F.p2) : null, perBooking: jualN ? Math.round(spend / jualN) : null },
    campaign, kpr: kprAktif.slice(0, 10), kprRingkas: {
      berjalan: kpr.filter(k => k.status.kategori === 'berjalan').length, sp3k: kpr.filter(k => k.status.kategori === 'sp3k').length,
      akad: kpr.filter(k => k.status.kategori === 'akad' && k.diam <= 30).length, ditolak: kpr.filter(k => k.status.kategori === 'ditolak' && k.diam <= 30).length },
    perhatian, perf, tim, stok,
  };
}

export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const hariIni = tglWIB();
  const q = new URL(req.url).searchParams;
  // Manager & CEO bisa melihat pratinjau beranda tiap peran (?sebagai=markom|sales); data sales = seluruh tim
  const pimpinan = ['manager', 'ceo'].includes(user.role);
  const peran = pimpinan ? (['sales', 'markom'].includes(q.get('sebagai')) ? q.get('sebagai') : 'pimpinan') : user.role;
  try {
    if (peran === 'pimpinan') {
      const pj = q.get('project') || null;
      if (pj && user.projects && !user.projects.includes(pj)) return Response.json({ error: 'Akun Anda tidak memegang project ' + pj }, { status: 403 });
      return Response.json(await berandaPimpinan(sql, user, hariIni, pj));
    }
    if (peran === 'markom') return Response.json({ ...(await berandaMarcom(sql, user, hariIni)), pratinjau: pimpinan });
    if (peran === 'sales') return Response.json({ ...(await berandaSales(sql, user, hariIni, pimpinan)), pratinjau: pimpinan });
    return Response.json({ error: 'Beranda belum tersedia untuk peran ini' }, { status: 403 });
  } catch (e) {
    console.error('beranda', e);
    return Response.json({ error: 'Gagal memuat beranda: ' + String(e.message || e).slice(0, 200) }, { status: 500 });
  }
}
