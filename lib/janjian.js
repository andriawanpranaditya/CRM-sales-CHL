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
    if (!jj.length) return 0;
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
