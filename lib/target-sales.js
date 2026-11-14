// Target bulanan & pengingat harian sales (pop-up 09.00 · 13.00 · 16.00)
import { hitungVisitor } from './janjian';
import { PROMO } from './presentasi';

export const TARGET_DEFAULT = { booking: 2, kunjungan: 8, janji: 12, lead: 20 };
const tglWIB = (d = new Date()) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const geser = (t, n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const hariMinggu = t => new Date(t + 'T00:00:00Z').getUTCDay() === 0;
const depan = n => String(n || '').trim().split(/\s+/)[0] || 'kamu';

export async function ambilTarget(sql) {
  try {
    const r = await sql`SELECT items FROM settings WHERE key = 'target_sales'`;
    const v = r[0]?.items;
    if (v && typeof v === 'object') return { ...TARGET_DEFAULT, ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Math.max(0, Number(x) || 0)])) };
    const lama = await sql`SELECT items FROM settings WHERE key = 'target_booking'`;
    const n = Number(lama[0]?.items?.n);
    return { ...TARGET_DEFAULT, ...(Number.isFinite(n) ? { booking: n } : {}) };
  } catch { return { ...TARGET_DEFAULT }; }
}
export async function simpanTarget(sql, t) {
  const v = Object.fromEntries(Object.keys(TARGET_DEFAULT).map(k => [k, Math.max(0, Math.min(999, Math.round(Number(t?.[k]) || 0)))]));
  await sql`INSERT INTO settings (key, items) VALUES ('target_sales', ${JSON.stringify(v)}) ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
  await sql`INSERT INTO settings (key, items) VALUES ('target_booking', ${JSON.stringify({ n: v.booking })}) ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`; // dipakai rapor Beranda
  return v;
}

// Hari kerja = Senin–Sabtu
function hariKerja(awal, akhirBulan, hariIni) {
  let total = 0, lewat = 0;
  for (let t = awal; t <= akhirBulan; t = geser(t, 1)) if (!hariMinggu(t)) { total++; if (t <= hariIni) lewat++; }
  return { total, lewat, sisa: total - lewat + (hariMinggu(hariIni) ? 0 : 1) };
}
const kemarinKerja = t => { let k = geser(t, -1); while (hariMinggu(k)) k = geser(k, -1); return k; };

export async function hitungSales(sql, { nama, username, projects }, target) {
  const hariIni = tglWIB(), awal = hariIni.slice(0, 8) + '01';
  const [y, m] = hariIni.split('-').map(Number), akhirBulan = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const kmrn = kemarinKerja(hariIni), dariHarian = kmrn < awal ? kmrn : awal;
  const hk = hariKerja(awal, akhirBulan, hariIni);
  try { await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ganti_kontrak boolean`; } catch {}
  const [bk, jj, ld, fu, jadwal, janjiHari, prio, vis] = await Promise.all([
    sql`SELECT t.tgl::text AS tgl, count(*)::int AS n FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis IN ('Booking', 'Closing') AND t.tgl >= ${dariHarian}::date AND t.tgl <= ${hariIni}::date AND l.sales = ${nama} AND COALESCE(t.ganti_kontrak, false) = false
      GROUP BY t.tgl`.catch(() => []),
    sql`SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date::text AS tgl, count(*)::int AS n FROM janjian
      WHERE (sales = ${nama} OR created_by = ${username}) AND (created_at AT TIME ZONE 'Asia/Jakarta')::date >= ${geser(hariIni, -7) < dariHarian ? geser(hariIni, -7) : dariHarian}::date
      GROUP BY 1`.catch(() => []),
    sql`SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date::text AS tgl, count(*)::int AS n FROM leads
      WHERE created_by = ${username} AND COALESCE(sumber, '') NOT ILIKE 'walk%' AND COALESCE(sumber, '') NOT ILIKE 'import%'
        AND (created_at AT TIME ZONE 'Asia/Jakarta')::date >= ${dariHarian}::date GROUP BY 1`.catch(() => []),
    sql`SELECT tgl::text AS tgl, count(*)::int AS n FROM followups
      WHERE created_by = ${username} AND tgl >= ${kmrn}::date AND tgl <= ${hariIni}::date AND COALESCE(detail, '') NOT LIKE 'Leads to Sales%' GROUP BY tgl`.catch(() => []),
    sql`SELECT nama, next_fu::text AS next_fu FROM leads WHERE sales = ${nama} AND next_fu IS NOT NULL AND next_fu <= ${hariIni}::date
      AND COALESCE(status, '') NOT IN ('Drop', 'Lost', 'Booking', 'Closing', 'Reserved') ORDER BY next_fu, id LIMIT 40`.catch(() => []),
    sql`SELECT j.jam, l.nama FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code
      WHERE j.sales = ${nama} AND j.tgl = ${hariIni}::date AND j.status = 'Terjadwal' ORDER BY j.jam`.catch(() => []),
    sql`SELECT l.lead_code, l.nama, l.wa, l.tipe, l.status,
        (SELECT f.detail FROM followups f WHERE f.lead_code = l.lead_code AND f.created_by <> 'auto-wa' ORDER BY f.id DESC LIMIT 1) AS upd,
        (SELECT f.tgl::text FROM followups f WHERE f.lead_code = l.lead_code AND f.created_by <> 'auto-wa' ORDER BY f.id DESC LIMIT 1) AS tgl_upd
      FROM leads l WHERE l.sales = ${nama} AND l.status IN ('Hot', 'Site Visit', 'Appointment', 'Warm')
        AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Reserved', 'Booking', 'Closing'))
      ORDER BY CASE l.status WHEN 'Hot' THEN 0 WHEN 'Site Visit' THEN 1 WHEN 'Appointment' THEN 2 ELSE 3 END, l.updated_at DESC NULLS LAST LIMIT 6`.catch(() => []),
    hitungVisitor(sql, { dari: dariHarian, sampai: hariIni, sales: nama }).catch(() => []),
  ]);
  const per = (rows, t) => rows.filter(r => r.tgl === t).reduce((a, r) => a + r.n, 0);
  const bulan = (rows) => rows.filter(r => r.tgl >= awal && r.tgl <= hariIni).reduce((a, r) => a + r.n, 0);
  const visHit = vis.filter(v => v.hitung);
  const capaian = { booking: bulan(bk), kunjungan: visHit.filter(v => v.tgl >= awal).length, janji: bulan(jj), lead: bulan(ld) };
  const harian = d => ({ fu: per(fu, d), janji: per(jj, d), visit: visHit.filter(v => v.tgl === d).length, lead: per(ld, d), booking: per(bk, d) });
  const janji7 = jj.filter(r => r.tgl > geser(hariIni, -7)).reduce((a, r) => a + r.n, 0);
  const porsi = hk.total ? hk.lewat / hk.total : 1;
  const status = k => { const t = target[k]; if (!t) return 'hijau'; const harus = t * porsi; const r = harus ? capaian[k] / harus : 1; return capaian[k] >= t || r >= 0.9 ? 'hijau' : r >= 0.6 ? 'kuning' : 'merah'; };
  const proj = (Array.isArray(projects) && projects[0]) || null;
  const reward = proj && PROMO[proj]?.sales?.cash ? PROMO[proj].sales.cash : null;
  const prioritas = prio.map(p => ({ ...p, basi: p.tgl_upd ? (Date.parse(hariIni) - Date.parse(p.tgl_upd)) / 86400000 > 14 : true }));
  const d = { nama, depan: depan(nama), hariIni, kemarin: kmrn, bulan: hariIni.slice(0, 7), hk, target, capaian,
    status: Object.fromEntries(Object.keys(TARGET_DEFAULT).map(k => [k, status(k)])), harian: { ini: harian(hariIni), kemarin: harian(kmrn) },
    jadwalFu: jadwal.map(x => x.nama), janjiHariIni: janjiHari.map(x => ({ nama: x.nama, jam: x.jam })), prioritas, janji7, reward,
    leadHarian: Math.max(1, Math.ceil((target.lead || 0) / Math.max(1, hk.total))) };
  d.pesan = susunPesan(d);
  return d;
}

const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const daftar = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' & ' + a[a.length - 1];

// Kalimat pengingat — santai, to the point, nyelekit saat tertinggal, apresiasi saat jualan; selalu ada langkah konkret
export function susunPesan(d) {
  const n = d.depan, c = d.capaian, t = d.target, tgl = Number(d.hariIni.slice(8, 10)), bln = BLN[Number(d.hariIni.slice(5, 7)) - 1];
  const panas = d.prioritas.slice(0, 2).map(p => p.nama), adaPanas = panas.length ? daftar(panas) : null;
  const reward = d.reward ? `komisi & cash reward ${d.reward}` : 'komisi';
  let bulanan;
  if (t.booking && c.booking >= t.booking * 1.5) bulanan = { nada: 'top', judul: 'Melampaui target 🏆', isi: `Gila, ${c.booking} Booking — ${Math.round(c.booking / t.booking * 100)}% dari target 🔥 Pertahankan, jangan kasih kendor. Lead panas di tanganmu itu Booking bulan depan.` };
  else if (t.booking && c.booking >= t.booking) bulanan = { nada: 'selamat', judul: 'Target tercapai 🎉', isi: `Mantap, ${n}! Target ${bln} tembus (${c.booking}/${t.booking}) 🎉 Tapi jangan langsung santai — tiap Booking tambahan = ${reward} tambahan. Gas terus sampai akhir bulan.` };
  else if (c.booking > 0) bulanan = { nada: 'apresiasi', judul: 'Sudah jualan, kejar sisanya', isi: `Nice, ${c.booking} Booking udah masuk 👏 Tapi jangan cepat puas — target masih kurang ${t.booking - c.booking}. Sisa ${d.hk.sisa} hari kerja, momentumnya lagi bagus${adaPanas ? ` — kejar ${adaPanas} minggu ini` : ''}.` };
  else if (tgl >= 20) bulanan = { nada: 'bahaya', judul: 'Booking masih 0', isi: `Tinggal ${d.hk.sisa} hari kerja, Booking masih 0. Ini bukan waktunya santai — ${reward} bulan ini bisa lewat begitu aja kalau kamu masih nunggu. ${adaPanas ? `Telepon ${adaPanas} hari ini` : 'Telepon 3 lead terpanasmu hari ini'} — jangan cuma chat terus nunggu dibalas.` };
  else bulanan = { nada: 'warning', judul: 'Booking masih 0', isi: `${n}, udah tanggal ${tgl} dan Booking masih 0. Konsumen nggak akan beli kalau kamu cuma diam nunggu chat dibalas. Sisa ${d.hk.sisa} hari kerja — ${adaPanas ? `angkat telepon sekarang: ${adaPanas}, ajak visit weekend ini` : 'angkat telepon sekarang dan ajak lead terbaikmu visit weekend ini'}.` };
  const tambahan = [];
  if (!d.janji7 && tgl > 7) tambahan.push({ nada: 'warning', isi: `Seminggu nggak ada janji temu baru? Jangan malas, ${n}. Nggak ada visit = nggak ada Booking. Minimal 2 janji temu minggu ini, mulai dari yang udah pernah nanya harga.` });
  if (t.lead && d.status.lead !== 'hijau') tambahan.push({ nada: 'warning', isi: `Lead mandiri baru ${c.lead} dari ${t.lead}. Jangan cuma ngandelin lead dari Marcom — sales yang jago cari lead sendiri. Minta referensi ke konsumen lama atau turun kanvasing hari ini.` });

  const h = d.harian.ini, k = d.harian.kemarin, nFu = d.jadwalFu.length;
  const janjiTeks = d.janjiHariIni.length ? d.janjiHariIni.map(j => `${j.nama} jam ${j.jam}`).join(', ') : '';
  const pagi = (nFu || janjiTeks)
    ? `Pagi, ${n}! Hari ini ada ${nFu ? `${nFu} jadwal follow up` : ''}${nFu && janjiTeks ? ', ' : ''}${janjiTeks ? `janji temu ${janjiTeks}` : ''}, dan target ${d.leadHarian} lead mandiri. Jangan buka HP cuma buat scroll — buka CRM dulu, beresin yang jatuh tempo.`
    : `Pagi, ${n}! Hari ini belum ada jadwal follow up maupun janji temu — justru ini waktunya cari lead baru dan bikin janji. Target hari ini minimal ${d.leadHarian} lead mandiri. Jangan cuma nunggu.`;
  const siang = (h.fu >= Math.max(1, nFu) && h.lead >= 1)
    ? `Mantap, sampai siang udah ${h.fu} follow up dan ${h.lead} lead mandiri baru. Pertahankan ritmenya sampai sore — satu janji temu lagi bakal bikin hari ini sempurna.`
    : `Udah jam 1 siang. Baru ${h.fu}${nFu ? ` dari ${nFu}` : ''} follow up yang dikerjain${h.lead ? `, lead mandiri ${h.lead}` : ', lead mandiri belum ada'}. Habis makan siang langsung gas — jangan sampai sore cuma diam.`;
  const skor = x => x.fu + x.janji * 3 + x.visit * 4 + x.lead * 2 + x.booking * 10;
  const sHi = skor(h), sKm = skor(k);
  const sore = sHi > sKm
    ? { nada: 'naik', isi: `Hari ini lebih produktif dari kemarin 👍 Follow up ${h.fu} (kemarin ${k.fu}), janji temu ${h.janji} (kemarin ${k.janji}). Pertahankan — besok tambah lagi.` }
    : sHi < sKm
      ? { nada: 'turun', isi: `Hari ini lebih kendor dari kemarin. ${h.fu < k.fu ? `Follow up turun dari ${k.fu} jadi ${h.fu}` : `Aktivitas turun`}${!h.janji ? ' dan nggak ada janji temu baru' : ''}. Jangan biarkan jadi kebiasaan — besok kejar ketinggalannya${nFu ? `, mulai dari ${nFu} FU yang masih tertunda` : ''}.` }
      : { nada: 'sama', isi: sHi ? `Hari ini sama seperti kemarin — cukup, tapi belum naik kelas. Besok tambah minimal 1 janji temu dan 1 lead mandiri.` : `Hari ini belum ada aktivitas tercatat sama sekali. Jangan diam aja, ${n} — besok pagi langsung follow up dan cari lead baru.` };
  return { bulanan, tambahan, pagi, siang, sore };
}
