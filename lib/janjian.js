// ===== Janjian / Appointment visit =====
// Status: Terjadwal → Datang | Batal. Reschedule menambah hitungan & riwayat, status tetap Terjadwal.
// "Perlu update" = masih Terjadwal tetapi jam janjian + 1 jam sudah lewat.
export const JENIS_JANJIAN = ['Site visit', 'Lihat show unit', 'Online meeting', 'Ketemu di luar'];
export const HASIL_VISIT = ['Tertarik, lanjut negosiasi', 'Siap Reserved', 'Perlu pertimbangan', 'Kurang tertarik'];
export const LOKASI_DEFAULT = {
  'BIO DISTRICT': ['Marketing Gallery Bio District', 'Show unit Bio District'],
  'PERMAI INDAH': ['Marketing Gallery Permai Indah', 'Show unit Permai Indah'],
};
// Status lead yang boleh dinaikkan otomatis (tidak menurunkan Booking / Closing dst.)
export const NAIK_KE_APPOINTMENT = ['New', 'Cold', 'Warm', 'Hot'];
export const NAIK_KE_SITEVISIT = ['New', 'Cold', 'Warm', 'Hot', 'Appointment'];

let siap = false;
export async function siapkanJanjian(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS janjian (
    id serial PRIMARY KEY, lead_code text NOT NULL, project text, sales text,
    jenis text, lokasi text, tgl date NOT NULL, jam text NOT NULL, peserta text, catatan text,
    status text NOT NULL DEFAULT 'Terjadwal', reschedule_n integer NOT NULL DEFAULT 0,
    jam_datang text, unit_dilihat text, hasil text, hasil_catatan text,
    batal_alasan text, lanjut text,
    created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS janjian_log (id serial PRIMARY KEY, janjian_id integer NOT NULL, waktu timestamptz NOT NULL DEFAULT now(), oleh text, aksi text, isi text)`;
  try { await sql`CREATE INDEX IF NOT EXISTS idx_janjian_tgl ON janjian (tgl, sales)`; } catch {}
  try { await sql`CREATE INDEX IF NOT EXISTS idx_janjian_log ON janjian_log (janjian_id, waktu DESC)`; } catch {}
  siap = true;
}

export async function lokasiJanjian(sql) {
  try {
    const r = await sql`SELECT items FROM settings WHERE key = 'lokasi_janjian'`;
    const v = r[0]?.items;
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ...LOKASI_DEFAULT, ...v };
  } catch {}
  return LOKASI_DEFAULT;
}

// Waktu sekarang di WIB
export function sekarangWIB() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { tgl: `${p.year}-${p.month}-${p.day}`, jam: `${p.hour}:${p.minute}` };
}
const tglStr = t => (t instanceof Date ? t.toISOString() : String(t || '')).slice(0, 10);
// Terjadwal & sudah lewat 1 jam dari jam janjian → perlu diisi hasilnya
export function perluUpdate(j, now = sekarangWIB()) {
  if (j.status !== 'Terjadwal') return false;
  const t = tglStr(j.tgl);
  if (t < now.tgl) return true;
  if (t > now.tgl) return false;
  const [h, m] = String(j.jam || '00:00').split(':').map(Number);
  const [nh, nm] = now.jam.split(':').map(Number);
  return nh * 60 + nm >= h * 60 + m + 60;
}
export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const namaHari = t => HARI[new Date(tglStr(t) + 'T00:00:00Z').getUTCDay()];

// Update lead DI LUAR menu Janjian (ubah status / form follow up) ikut menutup janji temu yang jadwalnya sudah tiba,
// supaya hasil kunjungan tetap terekam & tampil di beranda Manager/CEO:
//  · status Site Visit / Booking / Closing → janji temu dicatat "Datang"
//  · status Drop / Lost                     → janji temu dicatat "Batal" (lead Drop)
export async function sinkronJanjianLead(sql, leadCode, { status, catatan, oleh, dari }) {
  try {
    await siapkanJanjian(sql);
    const now = sekarangWIB();
    const jj = await sql`SELECT id, jenis, tgl::text AS tgl, jam FROM janjian WHERE lead_code = ${leadCode} AND status = 'Terjadwal' AND tgl <= ${now.tgl}::date ORDER BY tgl, jam`;
    if (!jj.length) {
      // Tidak ada janji temu, tetapi status lead berubah ke Site Visit → konsumen datang tanpa janji (masuk daily visitor)
      if (status === 'Site Visit') {
        // Tidak dicatat lagi bila konsumen sudah tercatat datang dalam 7 hari terakhir (kunjungan ulang dicatat manual lewat "Catat visitor")
        const sudah = await sql`SELECT 1 FROM janjian WHERE lead_code = ${leadCode} AND status = 'Datang' AND tgl >= ${now.tgl}::date - 7 LIMIT 1`;
        if (!sudah.length) {
          const l = await sql`SELECT project, sales FROM leads WHERE lead_code = ${leadCode}`;
          const r = await sql`INSERT INTO janjian (lead_code, project, sales, jenis, lokasi, tgl, jam, status, jam_datang, hasil_catatan, created_by)
            VALUES (${leadCode}, ${l[0]?.project || ''}, ${l[0]?.sales || ''}, ${JENIS_TANPA_JANJI}, '', ${now.tgl}, ${now.jam}, 'Datang', ${now.jam},
                    ${String(catatan || '').slice(0, 500) || 'Status lead → Site Visit'}, ${oleh || ''}) RETURNING id`;
          await sql`INSERT INTO janjian_log (janjian_id, oleh, aksi, isi) VALUES (${r[0].id}, ${oleh || ''}, 'Datang', ${'(otomatis dari ' + dari + ') datang tanpa janji temu'})`;
        }
      }
      return 0;
    }
    const ket = String(catatan || '').trim();
    for (const j of jj) {
      if (['Site Visit', 'Booking', 'Closing'].includes(status)) {
        const isi = (ket || `Ditandai otomatis dari ${dari} (status lead → ${status})`).slice(0, 500);
        await sql`UPDATE janjian SET status = 'Datang', jam_datang = COALESCE(jam_datang, jam), hasil_catatan = ${isi}, updated_at = now() WHERE id = ${j.id}`;
        await sql`INSERT INTO janjian_log (janjian_id, oleh, aksi, isi) VALUES (${j.id}, ${oleh || ''}, 'Datang', ${'(otomatis dari ' + dari + ') ' + isi})`;
      } else if (['Drop', 'Lost'].includes(status)) {
        const alasan = (ket || `Lead ${status} (otomatis dari ${dari})`).slice(0, 500);
        await sql`UPDATE janjian SET status = 'Batal', batal_alasan = ${alasan}, lanjut = 'drop', updated_at = now() WHERE id = ${j.id}`;
        await sql`INSERT INTO janjian_log (janjian_id, oleh, aksi, isi) VALUES (${j.id}, ${oleh || ''}, 'Batal', ${'(otomatis dari ' + dari + ') alasan: ' + alasan})`;
      }
    }
    return jj.length;
  } catch (e) { console.error('sinkron janjian', e); return 0; }
}

// ===== Daily visitor =====
// Satu orang (lead) dihitung SEKALI per hari, dari gabungan:
//  · janji temu berstatus Datang (termasuk "Datang tanpa janji")
//  · lead baru bersumber Walk In yang masuk hari itu
//  · transaksi Reserved / Booking yang diinput hari itu
// Janji temu yang masih Terjadwal ikut ditampilkan (akan datang / perlu update) tetapi tidak dihitung visitor.
export const JENIS_TANPA_JANJI = 'Datang tanpa janji';
const URUT_ST = { Booking: 5, Reserved: 4, Datang: 3, 'Walk in': 3, 'Perlu update': 1, 'Akan datang': 0 };
const jamWIB = t => t ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)) : '';
const tglWIB = t => t ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(t)) : '';

export async function hitungVisitor(sql, { dari, sampai, pp = null, sales = null, now = sekarangWIB() }) {
  await siapkanJanjian(sql);
  const [jj, walk, trx] = await Promise.all([
    sql`SELECT j.id, j.lead_code, j.sales, j.project, j.jenis, j.lokasi, j.tgl::text AS tgl, j.jam, j.status, j.reschedule_n, j.jam_datang, j.unit_dilihat,
        j.hasil, j.hasil_catatan, j.catatan, l.nama, l.sumber, l.walkin_info, l.campaign, l.created_by AS lead_by
      FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code
      WHERE j.tgl >= ${dari}::date AND j.tgl <= ${sampai}::date AND j.status <> 'Batal'
        AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[])) AND (${sales}::text IS NULL OR j.sales = ${sales})`,
    sql`SELECT l.lead_code, l.nama, l.sales, l.project, l.sumber, l.walkin_info, l.sumber_detail, l.campaign, l.catatan, l.tgl::text AS tgl, l.created_at, l.created_by AS lead_by
      FROM leads l WHERE l.sumber ILIKE 'walk%' AND l.tgl >= ${dari}::date AND l.tgl <= ${sampai}::date
        AND (${pp}::text[] IS NULL OR l.project = ANY(${pp}::text[])) AND (${sales}::text IS NULL OR l.sales = ${sales})`.catch(() => []),
    sql`SELECT t.lead_code, t.jenis, t.unit, t.catatan, t.tgl::text AS tgl, t.created_at, COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
        l.nama, l.sales, l.sumber, l.walkin_info, l.campaign, l.created_by AS lead_by
      FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis IN ('Reserved', 'Booking') AND t.tgl >= ${dari}::date AND t.tgl <= ${sampai}::date
        AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ANY(${pp}::text[])) AND (${sales}::text IS NULL OR l.sales = ${sales})`,
  ]);
  const peta = new Map(); // kunci: tgl|lead_code
  const tambah = (tgl, x, e) => {
    const k = tgl + '|' + x.lead_code;
    const v = peta.get(k) || { tgl, lead_code: x.lead_code, nama: x.nama, sales: x.sales, project: x.project, sumber: x.sumber, walkin_info: x.walkin_info,
      campaign: x.campaign, lead_by: x.lead_by, asal: [], catatan: [], jam: '', status: 'Akan datang', hitung: false, janjianId: null };
    v.asal.push({ jam: e.jam || '', label: e.asal });
    if (e.catatan) v.catatan.push(e.catatan);
    if (e.hitung) { v.hitung = true; if (!v.jam || (e.jam && e.jam < v.jam)) v.jam = e.jam; }
    else if (!v.hitung && e.jam && (!v.jam || e.jam < v.jam)) v.jam = e.jam;
    if ((URUT_ST[e.status] ?? 0) >= (URUT_ST[v.status] ?? 0)) v.status = e.status;
    if (e.janjianId && !v.janjianId) v.janjianId = e.janjianId;
    peta.set(k, v);
  };
  jj.forEach(j => {
    if (j.status === 'Datang') tambah(j.tgl, j, { asal: j.jenis === JENIS_TANPA_JANJI ? 'Datang tanpa janji' : 'Janji temu · ' + j.jenis, jam: j.jam_datang || j.jam,
      status: 'Datang', hitung: true, catatan: [j.unit_dilihat, j.hasil, j.hasil_catatan].filter(Boolean).join(' · '), janjianId: j.id });
    else tambah(j.tgl, j, { asal: 'Janji temu · ' + j.jenis + (j.reschedule_n ? ` · reschedule ${j.reschedule_n}×` : ''), jam: j.jam,
      status: perluUpdate(j, now) ? 'Perlu update' : 'Akan datang', hitung: false, catatan: j.catatan || '', janjianId: j.id });
  });
  walk.forEach(l => tambah(l.tgl, l, { asal: 'Walk in baru' + (l.walkin_info ? ' · tahu dari ' + l.walkin_info : ''), jam: jamWIB(l.created_at), status: 'Walk in', hitung: true,
    catatan: [l.sumber_detail, l.catatan].filter(Boolean).join(' · ') }));
  trx.forEach(t => tambah(t.tgl, t, { asal: t.jenis + (t.unit ? ' · ' + t.unit : ''), jam: jamWIB(t.created_at), status: t.jenis, hitung: true, catatan: t.catatan || '' }));
  return [...peta.values()].map(v => {
    v.asal.sort((a, b) => (a.jam || '99').localeCompare(b.jam || '99'));
    const jenisAsal = v.asal.map(a => a.label.split(' · ')[0]);
    v.asalTeks = v.asal.map(a => a.label).join(' → ');
    v.kategori = jenisAsal.some(a => a === 'Reserved' || a === 'Booking') ? 'trx' : jenisAsal.includes('Walk in baru') ? 'walkin'
      : jenisAsal.includes('Datang tanpa janji') ? 'tanpa' : 'janji';
    v.catatanTeks = [...new Set(v.catatan)].join(' · ');
    return v;
  }).sort((a, b) => a.tgl.localeCompare(b.tgl) || (a.jam || '99').localeCompare(b.jam || '99'));
}
export function ringkasVisitor(list) {
  const datang = list.filter(v => v.hitung);
  const by = k => datang.filter(v => v.kategori === k).length;
  return { total: datang.length, janji: by('janji'), walkin: by('walkin'), tanpa: by('tanpa'), trx: by('trx'),
    akanDatang: list.filter(v => !v.hitung && v.status === 'Akan datang').length, perluUpdate: list.filter(v => !v.hitung && v.status === 'Perlu update').length };
}
export { tglWIB };
