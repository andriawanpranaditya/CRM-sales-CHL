import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ringkasStok } from '@/lib/stok';
import { siapkanKpr, sinkronKpr, statusKpr } from '@/lib/kpr';
import { siapkanJanjian, perluUpdate, sekarangWIB, namaHari, hitungVisitor, ringkasVisitor } from '@/lib/janjian';

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

// ===== Rapor sales bulan berjalan: follow up, kunjungan, penjualan, data & kegiatan — dengan vonis bagus / cukup / perlu perbaikan =====
async function raporSales(sql, { nama, pp, hariIni, awalBulan, user, jj, due, jual, resLama, kprSaya, target = 2 }) {
  const hariKe = Number(hariIni.slice(8, 10));
  const pct = x => (Math.round(x * 1000) / 10).toLocaleString('id-ID') + '%';
  const v = (x, bagus, cukup, kecil = false) => x === null || x === undefined || Number.isNaN(x) ? '⚪' : kecil ? (x <= bagus ? '🟢' : x <= cukup ? '🟡' : '🔴') : (x >= bagus ? '🟢' : x >= cukup ? '🟡' : '🔴');
  const rows = [];
  const add = (lapis, indikator, hasil, patokan, vonis, saran) => rows.push({ lapis, indikator, hasil, patokan, vonis, saran: vonis === '🟢' ? 'Pertahankan.' : vonis === '⚪' ? 'Data bulan ini belum cukup untuk dinilai.' : saran });
  const sayaUser = nama ? sql`SELECT username FROM users WHERE name = ${nama}` : null;
  const unames = sayaUser ? (await sayaUser).map(u => u.username) : null;
  const [respon, aktif, hariFu, hw, janjiBln, visit, kual, drop, keg] = await Promise.all([
    // Lead dioper bulan ini → dihubungi pertama kali dalam 24 jam
    sql`SELECT a.created_at, (SELECT min(f.created_at) FROM followups f WHERE f.lead_code = a.lead_code AND f.created_at > a.created_at AND COALESCE(f.created_by, '') <> 'auto-wa'
          AND f.created_by IN (SELECT username FROM users WHERE name = a.ke)) AS fu1
        FROM lead_assign a JOIN leads l ON l.lead_code = a.lead_code
        WHERE COALESCE(a.ke, '') <> '' AND (${nama}::text IS NULL OR a.ke = ${nama}) AND (a.created_at AT TIME ZONE 'Asia/Jakarta')::date >= ${awalBulan}::date
          AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`.catch(() => []),
    // Lead aktif (bukan Booking/Drop) yang di-follow up dalam 7 hari terakhir
    sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM followups f WHERE f.lead_code = l.lead_code AND f.created_at > now() - interval '7 days'))::int AS fu7
        FROM leads l WHERE COALESCE(l.sales, '') <> '' AND (${nama}::text IS NULL OR l.sales = ${nama}) AND l.status NOT IN ('Closing', 'Drop', 'Lost', 'Booking')
          AND l.created_at < now() - interval '3 days' AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`,
    // Hari aktif follow up bulan ini
    sql`SELECT count(DISTINCT (f.created_at AT TIME ZONE 'Asia/Jakarta')::date)::int AS n FROM followups f JOIN leads l ON l.lead_code = f.lead_code
        WHERE (f.created_at AT TIME ZONE 'Asia/Jakarta')::date >= ${awalBulan}::date AND COALESCE(f.created_by, '') <> 'auto-wa'
          AND (${unames}::text[] IS NULL OR f.created_by = ANY(${unames}::text[])) AND (${nama}::text IS NULL OR l.sales = ${nama}) AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`,
    // Lead Hot/Warm yang punya janji temu (terjadwal atau datang 30 hari terakhir)
    sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM janjian j WHERE j.lead_code = l.lead_code AND (j.status = 'Terjadwal' OR (j.status = 'Datang' AND j.tgl >= (${hariIni}::date - 30)))))::int AS ada
        FROM leads l WHERE (${nama}::text IS NULL OR l.sales = ${nama}) AND l.status IN ('Hot', 'Warm') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`.catch(() => [{ n: 0, ada: 0 }]),
    // Janji temu bertanggal bulan ini s.d. hari ini
    sql`SELECT status, count(*)::int AS n FROM janjian j WHERE (${nama}::text IS NULL OR j.sales = ${nama}) AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[]))
          AND j.tgl >= ${awalBulan}::date AND j.tgl <= ${hariIni}::date GROUP BY status`.catch(() => []),
    // Kunjungan 90 hari terakhir yang berlanjut ke Booking
    sql`SELECT count(DISTINCT j.lead_code)::int AS n, count(DISTINCT j.lead_code) FILTER (WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = j.lead_code AND t.jenis IN ('Booking', 'Closing') AND t.tgl >= j.tgl))::int AS book
        FROM janjian j WHERE j.status = 'Datang' AND j.tgl >= (${hariIni}::date - 90) AND (${nama}::text IS NULL OR j.sales = ${nama}) AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[]))`.catch(() => [{ n: 0, book: 0 }]),
    // Kelengkapan data kualifikasi lead aktif (≥3 dari domisili, budget, cara bayar, usia, tujuan)
    sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE ((COALESCE(domisili, '') <> '')::int + (COALESCE(budget, 0) > 0)::int + (COALESCE(bayar, '') <> '')::int + (COALESCE(usia, '') <> '')::int + (COALESCE(tujuan, '') <> '')::int) >= 3)::int AS ok
        FROM leads l WHERE COALESCE(l.sales, '') <> '' AND (${nama}::text IS NULL OR l.sales = ${nama}) AND l.status NOT IN ('Closing', 'Drop', 'Lost') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`.catch(() => [{ n: 0, ok: 0 }]),
    // Drop bulan ini & alasannya
    sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE COALESCE(alasan, '') <> '')::int AS ok FROM lead_status_log s JOIN leads l ON l.lead_code = s.lead_code
        WHERE s.ke = 'Drop' AND s.tgl >= ${awalBulan}::date AND (${nama}::text IS NULL OR s.sales_saat = ${nama}) AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`.catch(() => [{ n: 0, ok: 0 }]),
    // Kegiatan (kanvasing, open table, dll.) bulan ini
    sql`SELECT count(*)::int AS n, COALESCE(sum(jml_lead), 0)::int AS lead FROM kegiatan k WHERE k.tgl >= ${awalBulan}::date AND k.tgl <= ${hariIni}::date
          AND (${nama}::text IS NULL OR k.created_by = ANY(${unames || []}::text[]) OR COALESCE(k.pic, '') ILIKE ${'%' + (nama || '') + '%'}) AND (${pp}::text[] IS NULL OR k.project = ANY(${pp}::text[]))`.catch(() => [{ n: 0, lead: 0 }]),
  ]);

  // FOLLOW UP
  const resp = respon.filter(x => x.fu1 || (Date.now() - new Date(x.created_at).getTime()) > 86400000);
  const cepat = resp.filter(x => x.fu1 && (new Date(x.fu1) - new Date(x.created_at)) <= 86400000).length;
  const rResp = resp.length ? cepat / resp.length : null;
  add('Follow up', 'Lead dari Marcom dihubungi < 24 jam', rResp, resp.length ? `${pct(rResp)} (${cepat} dari ${resp.length})` : '—', 'bagus ≥80% · cukup ≥60%', resp.length < 3 ? '⚪' : v(rResp, 0.8, 0.6),
    'Hubungi lead baru dari Marcom di hari yang sama dioper — lead yang dihubungi < 1 jam jauh lebih mungkin membalas. Cek kotak "lead baru dari Marcom" di atas setiap pagi dan siang.');
  const tlt = due.filter(r => r.next_fu < hariIni).length;
  add('Follow up', 'Follow up terlambat (lewat jadwal)', tlt, `${tlt} lead`, 'bagus 0 · cukup ≤3', v(tlt, 0, 3, true),
    'Selesaikan follow up terlambat sebelum yang baru; isi jadwal follow up berikutnya di setiap catatan follow up agar tidak menumpuk.');
  const a0 = aktif[0] || { n: 0, fu7: 0 }, rAktif = a0.n ? a0.fu7 / a0.n : null;
  add('Follow up', 'Lead aktif yang di-follow up dalam 7 hari', rAktif, a0.n ? `${pct(rAktif)} (${a0.fu7} dari ${a0.n})` : '—', 'bagus ≥80% · cukup ≥60%', a0.n < 3 ? '⚪' : v(rAktif, 0.8, 0.6),
    'Sentuh setiap lead aktif minimal sekali seminggu (info promo, progres unit, ajak visit). Lead yang memang tidak berminat diubah ke Drop dengan alasannya.');
  const rHari = hariKe ? Math.min(1, (hariFu[0]?.n || 0) / hariKe) : null;
  add('Follow up', 'Hari aktif follow up bulan ini', rHari, `${hariFu[0]?.n || 0} dari ${hariKe} hari`, 'bagus ≥80% · cukup ≥60% hari', hariKe < 5 ? '⚪' : v(rHari, 0.8, 0.6),
    'Catat follow up setiap hari kerja, sekecil apa pun (chat, telepon, kirim brosur), supaya riwayat lead lengkap dan manager bisa membantu.');

  // KUNJUNGAN
  const h0 = hw[0] || { n: 0, ada: 0 }, rJanji = h0.n ? h0.ada / h0.n : null;
  add('Kunjungan', 'Lead Hot/Warm yang sudah dijadwalkan visit', rJanji, h0.n ? `${pct(rJanji)} (${h0.ada} dari ${h0.n})` : '—', 'bagus ≥50% · cukup ≥30%', h0.n < 2 ? '⚪' : v(rJanji, 0.5, 0.3),
    'Setiap lead Hot/Warm ditawari dua pilihan waktu kunjungan (mis. Sabtu pagi atau Minggu siang) dan langsung dibuatkan janji di menu Janjian & Visitor.');
  const jb = Object.fromEntries(janjiBln.map(x => [x.status, x.n])); const datang = jb['Datang'] || 0, batal = jb['Batal'] || 0;
  const belum = jj.filter(j => j.perlu_update).length, tj = datang + batal + belum, rShow = tj ? datang / tj : null;
  add('Kunjungan', 'Janji temu yang benar-benar datang', rShow, tj ? `${pct(rShow)} (${datang} datang · ${batal} batal)` : '—', 'bagus ≥60% · cukup ≥40% (min. 3 janji)', tj < 3 ? '⚪' : v(rShow, 0.6, 0.4),
    'Konfirmasi H-1 dan pagi hari-H lewat tombol "Ingatkan via WA", kirim lokasi & patokan jalan, dan tawarkan jadwal pengganti saat itu juga bila konsumen berhalangan.');
  add('Kunjungan', 'Janji temu belum di-update hasilnya', belum, `${belum} janji`, 'bagus 0 · cukup ≤1', v(belum, 0, 1, true),
    'Isi hasil janji temu (datang / reschedule / batal + alasan) paling lambat 1 jam setelah jam janji.');

  // PENJUALAN
  const nb = jual[0]?.n || 0;
  add('Penjualan', 'Booking bulan ini', nb, `${nb} unit · Rp ${Number(jual[0]?.nilai || 0).toLocaleString('id-ID')}`, `target ${target} unit per bulan`, !target ? '⚪' : hariKe < 10 && nb < target ? '⚪' : nb >= target ? '🟢' : nb >= Math.ceil(target / 2) ? '🟡' : '🔴',
    'Fokus ke lead Hot dan yang sudah visit: tawarkan Reserved di hari kunjungan, bantu hitung cicilan di Simulasi Cara Bayar, dan libatkan manager untuk negosiasi penutupan.');
  const vs = visit[0] || { n: 0, book: 0 }, rVb = vs.n ? vs.book / vs.n : null;
  add('Penjualan', 'Kunjungan yang berlanjut ke Booking (90 hari)', rVb, vs.n ? `${pct(rVb)} (${vs.book} dari ${vs.n})` : '—', 'bagus ≥20% · cukup ≥10% (min. 5 kunjungan)', vs.n < 5 ? '⚪' : v(rVb, 0.2, 0.1),
    'Siapkan unit yang tersedia, price list, dan simulasi KPR sebelum konsumen datang; tutup kunjungan dengan langkah berikutnya yang jelas (Reserved, BI checking, atau janji kedua).');
  const rl = resLama.length;
  add('Penjualan', 'Reserved lebih dari 7 hari belum Booking', rl, `${rl} unit`, 'bagus 0 · cukup ≤1', v(rl, 0, 1, true),
    'Hubungi konsumen Reserved lama hari ini: pastikan kendala (dana, pasangan, KPR), atur jadwal Booking, atau lepas unit agar bisa dijual lagi.');
  const kd = kprSaya.filter(k => k.diam > 3).length;
  add('Penjualan', 'Proses KPR tidak di-update > 3 hari', kd, `${kd} konsumen`, 'bagus 0 · cukup ≤1', v(kd, 0, 1, true),
    'Tanyakan progres ke AO bank minimal dua kali seminggu dan catat di Proses KPR; kendala berkas segera disampaikan ke konsumen.');

  // DATA & KEGIATAN
  const q0 = kual[0] || { n: 0, ok: 0 }, rKual = q0.n ? q0.ok / q0.n : null;
  add('Data & kegiatan', 'Data kualifikasi lead lengkap (≥3 kolom)', rKual, q0.n ? `${pct(rKual)} (${q0.ok} dari ${q0.n})` : '—', 'bagus ≥70% · cukup ≥40%', q0.n < 3 ? '⚪' : v(rKual, 0.7, 0.4),
    'Lengkapi domisili, budget, cara bayar, usia, dan tujuan beli di setiap lead (Database Lead → Edit) saat follow up.');
  const d0 = drop[0] || { n: 0, ok: 0 }, rDrop = d0.n ? d0.ok / d0.n : null;
  add('Data & kegiatan', 'Lead Drop yang alasannya dicatat', rDrop, d0.n ? `${pct(rDrop)} (${d0.ok} dari ${d0.n})` : '—', 'bagus ≥90% · cukup ≥70%', d0.n < 3 ? '⚪' : v(rDrop, 0.9, 0.7),
    'Selalu pilih alasan saat mengubah lead ke Drop (tidak ada respon, beli di tempat lain, budget/lokasi tidak sesuai) supaya tim marcom bisa memperbaiki iklan.');
  const k0 = keg[0] || { n: 0, lead: 0 };
  add('Data & kegiatan', 'Kegiatan lapangan bulan ini', k0.n, `${k0.n} kegiatan${k0.lead ? ' · ' + k0.lead + ' lead' : ''}`, 'bagus ≥4 · cukup ≥2 per bulan', hariKe < 10 && k0.n < 4 ? '⚪' : v(k0.n, 4, 2),
    'Jadwalkan minimal satu kegiatan per minggu (kanvasing, open table, presentasi kantor/komunitas) dan catat di menu Kegiatan beserta jumlah lead yang didapat.');

  const n = k => rows.filter(r => r.vonis === k).length;
  return { bulan: hariIni.slice(0, 7), rows, target, skor: skorRapor(rows), ringkas: { bagus: n('🟢'), cukup: n('🟡'), kurang: n('🔴'), belum: n('⚪') } };
}
// Skor 0–100 = (2 × hijau + 1 × kuning) ÷ (2 × indikator yang bisa dinilai); ⚪ tidak dihitung
function skorRapor(rows) {
  const g = rows.filter(r => r.vonis === '🟢').length, y = rows.filter(r => r.vonis === '🟡').length, m = rows.filter(r => r.vonis === '🔴').length;
  return g + y + m ? Math.round((2 * g + y) / (2 * (g + y + m)) * 100) : null;
}
async function targetBooking(sql) {
  try { const r = await sql`SELECT items FROM settings WHERE key = 'target_booking'`; const n = Number(r[0]?.items?.n); return Number.isFinite(n) ? n : 2; } catch { return 2; }
}
// ===== Rapor tim: semua akun aktif berperan Sales (sales in-house yang punya login), dihitung dengan aturan yang sama =====
async function raporTim(sql, { pp, hariIni }) {
  const semuaSales = await sql`SELECT name, username, projects, COALESCE(wa, '') AS wa FROM users WHERE role = 'sales' AND active = true ORDER BY name`
    .catch(() => sql`SELECT name, username, null AS projects, '' AS wa FROM users WHERE role = 'sales' AND active = true ORDER BY name`);
  // Hanya sales yang memegang project terpilih (akun tanpa batasan project = semua project)
  const daftar = semuaSales.filter(s => !pp || !Array.isArray(s.projects) || !s.projects.length || s.projects.some(p => pp.includes(p)));
  try { await siapkanKpr(sql); await sinkronKpr(sql); } catch (e) { console.error('sinkron kpr tim', e); }
  const hasil = [];
  for (let i = 0; i < daftar.length; i += 3) { // 3 sales sekaligus agar database tidak terbebani
    const batch = await Promise.all(daftar.slice(i, i + 3).map(u => berandaSales(sql, { name: u.name, username: u.username, role: 'sales', projects: pp }, hariIni, false, { tanpaSync: true })
      .then(b => ({ nama: u.name, wa: u.wa, rapor: b.rapor, jual: b.jual })).catch(e => { console.error('rapor tim ' + u.name, e); return null; })));
    hasil.push(...batch.filter(x => x && x.rapor));
  }
  hasil.sort((a, b) => (b.rapor.skor ?? -1) - (a.rapor.skor ?? -1));
  const skorAda = hasil.filter(x => x.rapor.skor !== null);
  const target = hasil[0]?.rapor.target ?? await targetBooking(sql);
  // Indikator yang merah/kuning di banyak sales sekaligus → bahan briefing
  const per = {};
  hasil.forEach(x => x.rapor.rows.forEach(r => { const p = per[r.indikator] || (per[r.indikator] = { indikator: r.indikator, lapis: r.lapis, merah: [], kuning: [] }); if (r.vonis === '🔴') p.merah.push(x.nama); if (r.vonis === '🟡') p.kuning.push(x.nama); }));
  const umum = Object.values(per).filter(p => p.merah.length + p.kuning.length >= 2).sort((a, b) => (b.merah.length * 2 + b.kuning.length) - (a.merah.length * 2 + a.kuning.length)).slice(0, 4);
  const pendamping = [...hasil].filter(x => x.rapor.ringkas.kurang >= 3).sort((a, b) => (a.rapor.skor ?? 101) - (b.rapor.skor ?? 101))[0] || null;
  return {
    bulan: hariIni.slice(0, 7), target,
    sales: hasil.map((x, i) => ({ peringkat: i + 1, nama: x.nama, wa: x.wa, skor: x.rapor.skor, ringkas: x.rapor.ringkas, rows: x.rapor.rows, booking: x.jual.n, nilai: x.jual.nilai })),
    tim: { rata: skorAda.length ? Math.round(skorAda.reduce((a, x) => a + x.rapor.skor, 0) / skorAda.length) : null, merah: hasil.reduce((a, x) => a + x.rapor.ringkas.kurang, 0),
      booking: hasil.reduce((a, x) => a + x.jual.n, 0), nilai: hasil.reduce((a, x) => a + x.jual.nilai, 0), targetTim: target * hasil.length, jumlah: hasil.length,
      pendamping: pendamping ? { nama: pendamping.nama, merah: pendamping.rapor.ringkas.kurang, skor: pendamping.rapor.skor, lapis: [...new Set(pendamping.rapor.rows.filter(r => r.vonis === '🔴').map(r => r.lapis))] } : null },
    umum,
  };
}

async function berandaSales(sql, user, hariIni, semua, opsi = {}) {
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

  // ===== Peringatan & agenda sales =====
  const geser = (t, n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const now = sekarangWIB();
  let janjian = [], janjiTerakhir = null, hotTanpaJanji = [], resLama = [], kprSaya = [];
  try {
    await siapkanJanjian(sql);
    [janjian, janjiTerakhir, hotTanpaJanji, resLama] = await Promise.all([
      sql`SELECT j.id, j.lead_code, j.jenis, j.lokasi, j.tgl::text AS tgl, j.jam, j.status, j.reschedule_n, j.sales, l.nama, l.wa
        FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code
        WHERE (${nama}::text IS NULL OR j.sales = ${nama}) AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[]))
          AND (j.status = 'Terjadwal' OR (j.tgl >= ${geser(hariIni, -1)}::date AND j.tgl <= ${geser(hariIni, 7)}::date))
        ORDER BY j.tgl, j.jam`,
      sql`SELECT max(created_at) AS t FROM janjian WHERE (${nama}::text IS NULL OR sales = ${nama})`,
      // Lead Hot / Warm tanpa janji temu yang sedang terjadwal & belum pernah datang 14 hari terakhir → ajak visit
      sql`SELECT l.lead_code, l.nama, l.status, l.project FROM leads l
        WHERE (${nama}::text IS NULL OR l.sales = ${nama}) AND l.status IN ('Hot', 'Warm') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
          AND NOT EXISTS (SELECT 1 FROM janjian j WHERE j.lead_code = l.lead_code AND (j.status = 'Terjadwal' OR (j.status = 'Datang' AND j.tgl >= ${geser(hariIni, -14)}::date)))
        ORDER BY CASE l.status WHEN 'Hot' THEN 0 ELSE 1 END, l.updated_at DESC NULLS LAST LIMIT 20`,
      sql`SELECT x.lead_code, x.nama, x.unit, x.tgl::text AS tgl FROM (
          SELECT DISTINCT ON (t.lead_code) t.lead_code, t.jenis, t.tgl, t.unit, l.nama, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
          FROM transactions t JOIN leads l ON l.lead_code = t.lead_code ORDER BY t.lead_code, t.id DESC) x
        WHERE x.jenis = 'Reserved' AND x.tgl <= ${geser(hariIni, -7)}::date AND (${nama}::text IS NULL OR x.sales = ${nama})
          AND (${pp}::text[] IS NULL OR x.project = ANY(${pp}::text[])) ORDER BY x.tgl LIMIT 5`,
    ]);
  } catch (e) { console.error('janjian sales', e); }
  try {
    await siapkanKpr(sql);
    if (!opsi.tanpaSync) await sinkronKpr(sql);
    const kr = await sql`SELECT k.id, k.lead_code, k.unit, k.slik_tgl, k.akad_bank_id, k.akad_tgl::text AS akad_tgl, k.akad_realisasi::text AS akad_realisasi, k.updated_at,
        l.nama, COALESCE(NULLIF(k.project, ''), l.project, '') AS project,
        (SELECT t.jenis FROM transactions t WHERE t.lead_code = k.lead_code ORDER BY t.id DESC LIMIT 1) AS trx_terakhir
      FROM kpr k LEFT JOIN leads l ON l.lead_code = k.lead_code
      WHERE (${nama}::text IS NULL OR l.sales = ${nama}) AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(k.project, ''), l.project, '') = ANY(${pp}::text[]))`;
    const ids = kr.map(k => k.id);
    const bk = ids.length ? await sql`SELECT id, kpr_id, bank, tahap, kendala FROM kpr_bank WHERE kpr_id = ANY(${ids}::int[]) ORDER BY id` : [];
    kprSaya = kr.filter(k => k.trx_terakhir !== 'Batal' && k.trx_terakhir !== 'Reserved').map(k => {
      const b = bk.filter(x => x.kpr_id === k.id);
      return { id: k.id, nama: k.nama, unit: k.unit, project: k.project, akad_tgl: k.akad_tgl, status: statusKpr(k, b, k.trx_terakhir),
        banks: b.map(x => x.bank), kendala: b.filter(x => x.kendala && !['Ditolak', 'Tidak dilanjutkan'].includes(x.tahap)).map(x => `${x.bank}: ${x.kendala}`).join(' · '),
        diam: Math.floor((Date.now() - new Date(k.updated_at).getTime()) / 86400000) };
    }).filter(k => ['berjalan', 'sp3k', 'akad'].includes(k.status.kategori)).sort((a, b) => b.diam - a.diam);
  } catch (e) { console.error('kpr sales', e); }

  const jj = janjian.map(j => ({ ...j, perlu_update: perluUpdate(j, now) }));
  // Akhir pekan wajib ada janji temu: Sabtu & Minggu terdekat (bila hari ini Minggu, Sabtu berikutnya)
  const dow = new Date(hariIni + 'T00:00:00Z').getUTCDay();
  const sabtu = dow === 6 ? hariIni : dow === 0 ? geser(hariIni, 6) : geser(hariIni, 6 - dow);
  const minggu = dow === 0 ? hariIni : geser(sabtu, 1);
  const hitungHari = t => jj.filter(j => j.tgl === t && j.status !== 'Batal').length;
  const akhirPekan = [{ tgl: sabtu, hari: 'Sabtu', n: hitungHari(sabtu) }, { tgl: minggu, hari: 'Minggu', n: hitungHari(minggu) }].sort((a, b) => a.tgl.localeCompare(b.tgl));
  const hariTanpaJanji = janjiTerakhir?.[0]?.t ? Math.floor((Date.now() - new Date(janjiTerakhir[0].t).getTime()) / 86400000) : null;
  const adaJanjiDepan = jj.some(j => j.status === 'Terjadwal' && j.tgl >= hariIni && !j.perlu_update);

  const peringatan = [];
  const tlt = due.filter(r => r.next_fu < hariIni);
  if (tlt.length) peringatan.push({ level: 'merah', judul: `${tlt.length} follow up terlambat`, sub: tlt.slice(0, 3).map(r => `${r.nama} (${Math.round((Date.parse(hariIni) - Date.parse(r.next_fu)) / 86400000)} hari)`).join(' · ') + (tlt.length > 3 ? ` · +${tlt.length - 3} lainnya` : ''), href: '/form?tab=fu&lead=' + encodeURIComponent(tlt[0].lead_code), tombol: 'Follow up' });
  jj.filter(j => j.perlu_update).slice(0, 3).forEach(j => peringatan.push({ level: 'merah', judul: `Janji temu ${j.nama || j.lead_code} belum di-update`, sub: `${namaHari(j.tgl)} ${j.tgl.slice(8, 10)}/${j.tgl.slice(5, 7)} ${j.jam.replace(':', '.')} · isi hasil: datang, reschedule, atau batal`, href: '/janjian', tombol: 'Update' }));
  // Satu peringatan untuk akhir pekan (Sabtu & Minggu digabung)
  const tglPdk = t => `${Number(t.slice(8, 10))}/${Number(t.slice(5, 7))}`;
  // Cukup salah satu (Sabtu ATAU Minggu) terisi janji temu → peringatan hilang
  if (akhirPekan.every(x => x.n === 0)) peringatan.push({ level: 'merah',
    judul: `Janji temu weekend ${akhirPekan.map(x => `${x.hari} ${tglPdk(x.tgl)}`).join(' / ')} belum ada — wajib`,
    sub: 'Wajib ada minimal satu janji temu visit di Sabtu atau Minggu. Ajak lead Hot/Warm datang.',
    href: '/janjian', tombol: 'Buat janji' });
  if (!semua && (hariTanpaJanji === null || hariTanpaJanji > 3) && !adaJanjiDepan) peringatan.push({ level: 'emas', judul: hariTanpaJanji === null ? 'Belum pernah membuat janji temu' : `Sudah ${hariTanpaJanji} hari tanpa janji temu baru`, sub: 'Target minimal satu janji temu baru tiap 3 hari.', href: '/janjian', tombol: 'Buat janji' });
  if (hotTanpaJanji.length) peringatan.push({ level: 'emas', judul: `${hotTanpaJanji.length} lead Hot/Warm belum dijadwalkan visit`, sub: hotTanpaJanji.slice(0, 3).map(l => `${l.nama} (${l.status})`).join(' · ') + (hotTanpaJanji.length > 3 ? ' · …' : ''), href: '/janjian', tombol: 'Ajak visit' });
  resLama.forEach(r => peringatan.push({ level: 'emas', judul: `Reserved ${r.unit || r.nama} sudah ${Math.round((Date.parse(hariIni) - Date.parse(r.tgl)) / 86400000)} hari belum Booking`, sub: r.nama + ' · dorong ke Booking atau konfirmasi rencana konsumen', href: '/leads?lead=' + encodeURIComponent(r.lead_code), tombol: 'Lihat' }));
  kprSaya.filter(k => k.diam > 3).slice(0, 3).forEach(k => peringatan.push({ level: 'emas', judul: `KPR ${k.nama} tidak di-update ${k.diam} hari`, sub: [k.status.label, k.banks.join(', '), k.kendala].filter(Boolean).join(' · '), href: '/kpr-proses?id=' + k.id, tombol: 'Update' }));
  kprSaya.filter(k => k.status.kategori === 'akad' && k.akad_tgl && k.akad_tgl < hariIni).forEach(k => peringatan.push({ level: 'merah', judul: `Akad ${k.nama} (${k.akad_tgl}) sudah lewat — isi tanggal realisasi`, sub: k.unit || '', href: '/kpr-proses?id=' + k.id, tombol: 'Isi' }));

  const rapor = await raporSales(sql, { nama, pp, hariIni, awalBulan, user, jj, due, jual, resLama, kprSaya, target: await targetBooking(sql) }).catch(e => { console.error('rapor sales', e); return null; });

  return {
    peran: 'sales', hariIni, peringatan, akhirPekan, rapor,
    agenda: jj.filter(j => j.status === 'Terjadwal' && (j.tgl === hariIni || j.tgl === geser(hariIni, 1)) && !j.perlu_update),
    kprSaya: kprSaya.slice(0, 6), kprJalan: kprSaya.length,
    baruDioper: baru.map(r => ({ ...r, menit: Math.max(0, Math.round((Date.now() - new Date(r.dioper).getTime()) / 60000)) })),
    fu: { selesai: selesai[0]?.n || 0, sisa: due.length, terlambat: due.filter(r => r.next_fu < hariIni).length,
      daftar: due.slice(0, 6).map(r => ({ ...r, terlambat: r.next_fu < hariIni })) },
    status: Object.fromEntries(status.map(r => [r.status, r.n])), reserved: reserved[0]?.n || 0,
    jual: { n: jual[0]?.n || 0, nilai: Number(jual[0]?.nilai || 0) },
    stok,
  };
}


// Daftar project untuk sumbu grafik: dari data stok (urutan Master Stock)
const daftarProjectSemua = stok => (stok || []).map(x => x.project);

// ===== Beranda Manager & CEO Project =====
function geserBulan(iso, n) { const [y, m] = iso.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10); }

async function berandaPimpinan(sql, user, hariIni, pilihProj) {
  const pp = pilihProj ? [pilihProj] : user.projects; // null = semua project
  const awalBulan = hariIni.slice(0, 8) + '01';
  const d1 = awalBulan < MULAI ? MULAI : awalBulan;
  const lalu1 = geserBulan(awalBulan, -1);
  const akhirLalu = new Date(Date.parse(awalBulan + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const lalu2 = (lalu1.slice(0, 8) + hariIni.slice(8, 10)) > akhirLalu ? akhirLalu : lalu1.slice(0, 8) + hariIni.slice(8, 10);
  const batasResv = new Date(Date.parse(hariIni + 'T00:00:00Z') - 7 * 86400000).toISOString().slice(0, 10); // Reserved > 7 hari
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
    sql`SELECT l.lead_code, l.nama, l.sales, l.project, a.created_at AS dioper, COALESCE(uo.name, a.oleh) AS oleh,
        (SELECT max(f.created_at) FROM followups f WHERE f.lead_code = l.lead_code AND COALESCE(f.created_by, '') <> 'auto-wa') AS fu_terakhir_semua
      FROM leads l
      JOIN LATERAL (SELECT created_at, oleh FROM lead_assign WHERE lead_code = l.lead_code AND ke = l.sales ORDER BY created_at DESC LIMIT 1) a ON true
      LEFT JOIN users uo ON uo.username = a.oleh
      WHERE COALESCE(l.sales, '') <> '' AND l.status NOT IN ('Closing', 'Drop', 'Lost') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
        AND a.created_at < now() - interval '24 hours' AND a.created_at > now() - interval '14 days'
        AND a.oleh NOT IN (SELECT username FROM users WHERE name = l.sales)
        AND NOT EXISTS (SELECT 1 FROM followups f JOIN users s ON s.username = f.created_by AND s.name = l.sales WHERE f.lead_code = l.lead_code AND f.created_at > a.created_at)
      ORDER BY a.created_at`.catch(() => []),
    // Reserved > 7 hari belum naik Booking
    sql`SELECT x.lead_code, x.nama, x.sales, x.unit, x.project, x.tgl::text AS tgl FROM (
        SELECT DISTINCT ON (t.lead_code) t.lead_code, t.jenis, t.tgl, t.unit, l.nama, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
        FROM transactions t JOIN leads l ON l.lead_code = t.lead_code ORDER BY t.lead_code, t.id DESC) x
      WHERE x.jenis = 'Reserved' AND x.tgl <= ${batasResv}::date AND (${pp}::text[] IS NULL OR x.project = ANY(${pp}::text[])) ORDER BY x.tgl LIMIT 6`,
    sql`SELECT count(*)::int AS n FROM leads l JOIN users u ON u.username = l.created_by AND u.role = 'markom'
      WHERE COALESCE(l.sales, '') = '' AND l.status IN ('Hot', 'Site Visit', 'Appointment', 'Warm') AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))`,
    sql`SELECT k.id, k.lead_code, k.unit, k.slik_tgl, k.akad_bank_id, k.akad_tgl::text AS akad_tgl, k.akad_realisasi::text AS akad_realisasi, k.updated_at, l.nama, l.sales,
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
    return { id: k.id, nama: k.nama, unit: k.unit, project: k.project, sales: k.sales, akad_tgl: k.akad_tgl, akad_realisasi: k.akad_realisasi,
      banks: bk.map(b => b.bank), akadBank: (bk.find(b => b.id === k.akad_bank_id) || {}).bank || '', tidakLanjut: bk.filter(b => b.tahap === 'Tidak dilanjutkan').map(b => b.bank),
      status: st, kendala: bk.filter(b => b.kendala && !['Ditolak', 'Tidak dilanjutkan'].includes(b.tahap)).map(b => `${b.bank}: ${b.kendala}`).join(' · '),
      diam: Math.floor((Date.now() - new Date(k.updated_at).getTime()) / 86400000), updated_at: k.updated_at };
  });
  // Yang masih berjalan + yang baru selesai/ditolak 30 hari terakhir (Done dihitung dari tanggal realisasi akad, bukan tanggal data diubah/diimpor)
  const t30 = new Date(Date.parse(hariIni + 'T00:00:00Z') - 30 * 86400000).toISOString().slice(0, 10);
  const kprAktif = kpr.filter(k => ['berjalan', 'sp3k', 'akad'].includes(k.status.kategori) || (k.status.kategori === 'selesai' ? (k.akad_realisasi || '') >= t30 : k.diam <= 30))
    .sort((a, b) => (['selesai', 'ditolak'].includes(a.status.kategori) ? 1 : 0) - (['selesai', 'ditolak'].includes(b.status.kategori) ? 1 : 0));
  // Rencana akad sudah lewat tetapi realisasi belum diisi
  const akadLewat = kpr.filter(k => k.status.kategori === 'akad' && k.akad_tgl && k.akad_tgl < hariIni);
  const kprDiam = kpr.filter(k => ['berjalan', 'sp3k', 'akad'].includes(k.status.kategori) && k.diam > 3); // tidak di-update > 3 hari

  // Performa sales
  const salesPilih = sales.filter(s => !pp || !Array.isArray(s.projects) || !s.projects.length || s.projects.some(p => pp.includes(p))).map(s => s.name);
  let perf = [];
  if (salesPilih.length) {
    const [akt, resp, bks] = await Promise.all([
      sql`SELECT l.sales, count(*) FILTER (WHERE l.status NOT IN ('Closing','Drop','Lost','Booking'))::int AS aktif,
          count(*) FILTER (WHERE l.next_fu IS NOT NULL AND l.next_fu < ${hariIni}::date AND l.status NOT IN ('Closing','Drop','Lost'))::int AS telat
        FROM leads l WHERE l.sales = ANY(${salesPilih}::text[]) AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[])) GROUP BY 1`,
      // Per oper: kapan dioper, oleh siapa, kapan FU pertama oleh sales itu (null = belum di-FU)
      sql`SELECT a.ke AS sales, a.lead_code, l.nama, a.created_at AS dioper, COALESCE(uo.name, a.oleh) AS oleh, f1.waktu AS fu_pertama,
          CASE WHEN f1.waktu IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (f1.waktu - a.created_at)) / 3600 END AS jam
        FROM lead_assign a
          JOIN leads l ON l.lead_code = a.lead_code
          LEFT JOIN users uo ON uo.username = a.oleh
          LEFT JOIN LATERAL (SELECT min(f.created_at) AS waktu FROM followups f JOIN users s ON s.username = f.created_by AND s.name = a.ke
            WHERE f.lead_code = a.lead_code AND f.created_at > a.created_at) f1 ON true
        WHERE a.ke = ANY(${salesPilih}::text[]) AND a.created_at >= ${awalBulan}::date AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[]))
          -- hanya lead yang dioper ORANG LAIN (Marcom/manager); lead walk-in yang diinput sales sendiri tidak dihitung
          AND COALESCE(a.oleh, '') NOT IN (SELECT username FROM users WHERE name = a.ke)
        ORDER BY a.created_at DESC`.catch(() => []),
      sql`SELECT l.sales, count(DISTINCT t.lead_code)::int AS n FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
        WHERE t.jenis = 'Booking' AND t.tgl >= ${awalBulan}::date AND t.tgl <= ${hariIni}::date AND l.sales = ANY(${salesPilih}::text[])
          AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ANY(${pp}::text[])) GROUP BY 1`,
    ]);
    const proyekSales = Object.fromEntries(sales.map(s => [s.name, Array.isArray(s.projects) && s.projects.length ? s.projects : null]));
    perf = salesPilih.map(n => {
      const a = akt.find(x => x.sales === n) || {}, b = bks.find(x => x.sales === n);
      // Respon = MEDIAN jam dari dioper sampai FU pertama (tidak terseret satu-dua lead ekstrem)
      const det = resp.filter(x => x.sales === n);
      const jamList = det.filter(x => x.jam != null).map(x => Number(x.jam)).sort((p, q) => p - q);
      const med = jamList.length ? (jamList.length % 2 ? jamList[(jamList.length - 1) / 2] : (jamList[jamList.length / 2 - 1] + jamList[jamList.length / 2]) / 2) : null;
      const rinci = user.role === 'manager' ? det.map(x => ({ lead_code: x.lead_code, nama: x.nama, dioper: x.dioper, oleh: x.oleh, fu_pertama: x.fu_pertama,
        jam: x.jam != null ? Math.round(Number(x.jam) * 10) / 10 : null })).sort((p, q) => (q.jam ?? 1e9) - (p.jam ?? 1e9)) : undefined;
      return { nama: n, project: proyekSales[n], aktif: a.aktif || 0, telat: a.telat || 0, respon: med != null ? Math.round(med * 10) / 10 : null,
        responN: jamList.length, responBelum: det.length - jamList.length, responRinci: rinci,
        kpr: kpr.filter(k => k.sales === n && ['berjalan', 'sp3k', 'akad'].includes(k.status.kategori)).length, booking: b?.n || 0 };
    }).sort((x, y) => y.booking - x.booking || y.aktif - x.aktif);
  }

  // Perlu perhatian
  const perhatian = [];
  akadLewat.slice(0, 3).forEach(k => perhatian.push({ level: 'merah', judul: `Akad ${k.nama} dijadwalkan ${k.akad_tgl} — realisasi belum diisi`, sub: [k.project, k.unit, k.akadBank, k.sales].filter(Boolean).join(' · '), href: '/kpr-proses?id=' + k.id }));
  kprDiam.slice(0, 3).forEach(k => perhatian.push({ level: 'merah', judul: `KPR ${k.nama} tidak di-update ${k.diam} hari`, sub: [k.project, k.unit, k.banks.join(', ') || 'belum diajukan', k.status.label, k.sales].filter(Boolean).join(' · '), href: '/kpr-proses?id=' + k.id }));
  resLama.forEach(r => {
    const h = Math.round((Date.parse(hariIni) - Date.parse(r.tgl)) / 86400000);
    const kp = kpr.find(k => k.nama === r.nama);
    perhatian.push({ level: 'merah', judul: `Reserved ${r.unit || r.nama} sudah ${h} hari belum Booking`, sub: [r.nama, r.project, r.sales, kp ? 'KPR: ' + kp.status.label : ''].filter(Boolean).join(' · '), href: '/leads' });
  });
  // Lead dari Marcom/manager yang sejak OPER TERAKHIR belum di-FU oleh sales PIC-nya > 24 jam — disebut satu per satu
  const fmtJam = t => new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  belum.slice(0, 5).forEach(r => {
    const jamLalu = Math.round((Date.now() - new Date(r.dioper).getTime()) / 3600000);
    perhatian.push({ level: 'emas', judul: `${r.nama} belum dihubungi ${r.sales} · ${jamLalu} jam sejak dioper`,
      sub: [`dioper ${fmtJam(r.dioper)}` + (r.oleh ? ` oleh ${r.oleh}` : ''), r.project, r.lead_code,
        r.fu_terakhir_semua && new Date(r.fu_terakhir_semua) > new Date(r.dioper) ? `ada FU ${fmtJam(r.fu_terakhir_semua)} tapi bukan dari akun ${r.sales}` : 'belum ada FU dari akun sales sejak oper terakhir'].filter(Boolean).join(' · '),
      href: '/leads?lead=' + encodeURIComponent(r.lead_code) });
  });
  if (belum.length > 5) perhatian.push({ level: 'emas', judul: `dan ${belum.length - 5} lead lain belum dihubungi > 24 jam`, sub: [...new Set(belum.slice(5).map(r => r.sales))].join(', '), href: '/leads' });
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

  // ===== Visitor hari ini (detail di menu Janjian & Visitor) + janji temu yang belum di-update (Perlu perhatian) =====
  let janjian = null;
  try {
    await siapkanJanjian(sql);
    const now = sekarangWIB();
    const t6 = new Date(Date.parse(hariIni + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
    const [vis, jr] = await Promise.all([
      hitungVisitor(sql, { dari: t6, sampai: hariIni, pp, now }),
      sql`SELECT j.id, j.lead_code, j.project, j.sales, j.jenis, j.lokasi, j.tgl::text AS tgl, j.jam, j.status, l.nama
        FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code
        WHERE j.status = 'Terjadwal' AND j.tgl <= ${hariIni}::date AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[])) ORDER BY j.tgl, j.jam`,
    ]);
    const spark = [];
    for (let i = 6; i >= 0; i--) { const t = new Date(Date.parse(hariIni + 'T00:00:00Z') - i * 86400000).toISOString().slice(0, 10); spark.push({ tgl: t, hari: namaHari(t), n: vis.filter(v => v.tgl === t && v.hitung).length }); }
    const lewat = jr.filter(j => perluUpdate(j, now));
    janjian = { visitor: ringkasVisitor(vis.filter(v => v.tgl === hariIni)), spark };
    lewat.slice(0, 3).forEach(j => perhatian.unshift({ level: 'merah', judul: `Janjian ${j.nama || j.lead_code} (${namaHari(j.tgl)} ${j.tgl.slice(8, 10)}/${j.tgl.slice(5, 7)} ${j.jam.replace(':', '.')}) belum di-update`,
      sub: [j.sales, j.jenis, j.lokasi, j.project].filter(Boolean).join(' · ') + ' · isi hasil: datang / reschedule / batal', href: '/janjian?tab=update' }));
  } catch (e) { console.error('janjian beranda', e); }
  // Kolom Janji temu di Performa sales: jumlah janji temu tiap sales bulan ini
  try {
    const jb = await sql`SELECT sales, count(*)::int AS n FROM janjian WHERE tgl >= ${awalBulan}::date AND tgl <= ${hariIni}::date AND jenis <> 'Datang tanpa janji'
      AND (${pp}::text[] IS NULL OR project = ANY(${pp}::text[])) GROUP BY sales`;
    perf.forEach(p => { p.janji = jb.find(x => x.sales === p.nama)?.n || 0; });
  } catch { perf.forEach(p => { p.janji = 0; }); }

  let stok = await ringkasStok(sql).catch(() => []);
  if (pp) stok = stok.filter(x => pp.includes(x.project));

  // ===== Grafik ringkasan: tren booking tahun berjalan, booking harian bulan ini, reserved aktif =====
  const awalTahun = hariIni.slice(0, 4) + '-01-01';
  const [trenRows, harian, resAktif] = await Promise.all([
    sql`SELECT to_char(t.tgl, 'YYYY-MM') AS bln, COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
        count(DISTINCT t.lead_code)::int AS n, COALESCE(sum(COALESCE(t.nilai_jual, t.nilai, 0)), 0)::numeric AS nilai
      FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis = 'Booking' AND t.tgl >= ${awalTahun}::date AND t.tgl <= ${hariIni}::date
        AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ANY(${pp}::text[]))
      GROUP BY 1, 2`.catch(() => []),
    sql`SELECT t.tgl::text AS tgl, count(DISTINCT t.lead_code)::int AS n FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis = 'Booking' AND t.tgl >= ${awalBulan}::date AND t.tgl <= ${hariIni}::date
        AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ANY(${pp}::text[])) GROUP BY 1`.catch(() => []),
    // Reserved aktif = transaksi terakhir lead masih Reserved (belum naik Booking / batal)
    sql`SELECT x.project, count(*)::int AS n, COALESCE(sum(x.nilai), 0)::numeric AS nilai FROM (
        SELECT DISTINCT ON (t.lead_code) t.lead_code, t.jenis, t.nilai, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
        FROM transactions t JOIN leads l ON l.lead_code = t.lead_code ORDER BY t.lead_code, t.id DESC) x
      WHERE x.jenis = 'Reserved' AND (${pp}::text[] IS NULL OR x.project = ANY(${pp}::text[])) GROUP BY 1`.catch(() => []),
  ]);
  const blnSekarang = Number(hariIni.slice(5, 7));
  const projTren = [...new Set([...(pp || daftarProjectSemua(stok)), ...trenRows.map(x => x.project)])].filter(Boolean);
  const tren = { project: projTren, bulan: [] };
  let kum = 0;
  for (let m = 1; m <= blnSekarang; m++) {
    const key = hariIni.slice(0, 4) + '-' + String(m).padStart(2, '0');
    const rows = trenRows.filter(x => x.bln === key);
    const per = Object.fromEntries(projTren.map(p => [p, rows.find(x => x.project === p)?.n || 0]));
    const n = Object.values(per).reduce((a, b) => a + b, 0);
    kum += n;
    tren.bulan.push({ bln: m, per, n, nilai: rows.reduce((a, x) => a + Number(x.nilai || 0), 0), kum });
  }
  const hariKe = Number(hariIni.slice(8, 10));
  let kh = 0; const bookingHarian = [];
  for (let d = 1; d <= hariKe; d++) { const t = hariIni.slice(0, 8) + String(d).padStart(2, '0'); kh += harian.find(x => x.tgl === t)?.n || 0; bookingHarian.push(kh); }
  const reservedAktif = { n: resAktif.reduce((a, x) => a + x.n, 0), nilai: resAktif.reduce((a, x) => a + Number(x.nilai || 0), 0), perProject: resAktif.map(x => ({ project: x.project, n: x.n })) };
  return {
    tren, bookingHarian, reservedAktif,
    peran: 'pimpinan', hariIni, project: pilihProj || null, proyekSaya: user.projects,
    jual: { n: jualN, nilai: jualNilai, perProject: jual, laluN: jualLalu[0]?.n || 0, reservedN: resv[0]?.n || 0, reservedNilai: Number(resv[0]?.nilai || 0) },
    funnel: { l0: F.l0 || 0, l1: F.l1 || 0, l2: F.l2 || 0, l3: F.l3 || 0 },
    biaya: { spend, cpql: F.p2 ? Math.round(spend / F.p2) : null, perBooking: jualN ? Math.round(spend / jualN) : null },
    campaign, kpr: kprAktif.slice(0, 10), kprRingkas: {
      berjalan: kpr.filter(k => k.status.kategori === 'berjalan').length, sp3k: kpr.filter(k => k.status.kategori === 'sp3k').length,
      akad: kpr.filter(k => k.status.kategori === 'akad').length, selesai: kpr.filter(k => k.status.kategori === 'selesai' && k.diam <= 30).length,
      ditolak: kpr.filter(k => k.status.kategori === 'ditolak' && k.diam <= 30).length },
    perhatian, perf, tim, stok, janjian,
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
    // Rapor tim sales (tabel perbandingan) — Manager & CEO; dimuat terpisah agar beranda utama tetap cepat
    if (q.get('rapor_tim')) {
      if (!pimpinan) return Response.json({ error: 'Khusus Manager & CEO' }, { status: 403 });
      const pj = q.get('project') || null;
      if (pj && user.projects && !user.projects.includes(pj)) return Response.json({ error: 'Akun Anda tidak memegang project ' + pj }, { status: 403 });
      return Response.json({ ...(await raporTim(sql, { pp: pj ? [pj] : user.projects, hariIni })), bolehUbah: user.role === 'manager' });
    }
    // Peringkat sales di tim (beranda Sales) — hanya posisi sendiri, tanpa nilai rekan
    if (q.get('peringkat')) {
      if (user.role !== 'sales') return Response.json({ peringkat: null });
      const t = await raporTim(sql, { pp: user.projects, hariIni });
      const saya = t.sales.find(x => x.nama === user.name);
      return Response.json({ peringkat: saya && saya.skor !== null ? saya.peringkat : null, dari: t.sales.filter(x => x.skor !== null).length, skor: saya?.skor ?? null });
    }
    if (peran === 'pimpinan') {
      const pj = q.get('project') || null;
      if (pj && user.projects && !user.projects.includes(pj)) return Response.json({ error: 'Akun Anda tidak memegang project ' + pj }, { status: 403 });
      return Response.json(await berandaPimpinan(sql, user, hariIni, pj));
    }
    if (peran === 'markom') return Response.json({ ...(await berandaMarcom(sql, user, hariIni)), pratinjau: pimpinan });
    if (peran === 'sales') return Response.json({ ...(await berandaSales(sql, user, hariIni, pimpinan)), pratinjau: pimpinan });
    if (peran === 'collection') return Response.json({ peran: 'collection', hariIni }); // isi beranda diambil dari /api/collection
    return Response.json({ error: 'Beranda belum tersedia untuk peran ini' }, { status: 403 });
  } catch (e) {
    console.error('beranda', e);
    return Response.json({ error: 'Gagal memuat beranda: ' + String(e.message || e).slice(0, 200) }, { status: 500 });
  }
}
