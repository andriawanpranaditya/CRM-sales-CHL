import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ringkasStok } from '@/lib/stok';

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

export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const hariIni = tglWIB();
  const q = new URL(req.url).searchParams;
  // Manager & CEO bisa melihat pratinjau beranda tiap peran (?sebagai=markom|sales); data sales = seluruh tim
  const pimpinan = ['manager', 'ceo'].includes(user.role);
  const peran = pimpinan ? (q.get('sebagai') === 'sales' ? 'sales' : 'markom') : user.role;
  try {
    if (peran === 'markom') return Response.json({ ...(await berandaMarcom(sql, user, hariIni)), pratinjau: pimpinan });
    if (peran === 'sales') return Response.json({ ...(await berandaSales(sql, user, hariIni, pimpinan)), pratinjau: pimpinan });
    return Response.json({ error: 'Beranda belum tersedia untuk peran ini' }, { status: 403 });
  } catch (e) {
    console.error('beranda', e);
    return Response.json({ error: 'Gagal memuat beranda: ' + String(e.message || e).slice(0, 200) }, { status: 500 });
  }
}
