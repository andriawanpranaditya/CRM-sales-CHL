// ===== Monitoring Proses KPR =====
// Alur: Verifikasi & SLIK (per konsumen) → Diajukan ke bank → Kumpul berkas → Analisa kredit → SP3K terbit / Ditolak (per bank)
// → pilih bank untuk akad + rencana tanggal akad (bank lain yang juga SP3K otomatis "Tidak dilanjutkan").

export const BANK_KPR = ['BTN', 'BCA', 'BNI', 'BRI', 'Mandiri', 'BSI', 'BJB', 'Danamon', 'Permata', 'UOB', 'CIMB Niaga', 'OCBC', 'Lainnya'];
export const TAHAP_BANK = ['Diajukan', 'Kumpul berkas', 'Analisa kredit', 'SP3K terbit', 'Ditolak', 'Tidak dilanjutkan'];
export const PROFIL = ['Karyawan', 'Wiraswasta', 'Corporate', 'Expatriate', 'Subsidi — Karyawan', 'Subsidi — Wirausaha'];
export const BERKAS_DEFAULT = {
  Karyawan: ['KTP pemohon & pasangan', 'Kartu Keluarga', 'Surat nikah', 'NPWP', 'Slip gaji 3 bulan terakhir', 'Surat keterangan kerja / SK', 'Rekening koran 3 bulan'],
  Wiraswasta: ['KTP pemohon & pasangan', 'Kartu Keluarga', 'Surat nikah', 'NPWP', 'NIB / SIUP / surat keterangan usaha', 'Laporan keuangan usaha', 'Rekening koran 6 bulan'],
  Corporate: ['Akta pendirian & perubahan + SK Kemenkumham', 'NIB', 'NPWP perusahaan', 'KTP & NPWP direksi', 'Laporan keuangan 2 tahun', 'Rekening koran perusahaan 6 bulan', 'Persetujuan direksi / komisaris'],
  Expatriate: ['Paspor', 'KITAS / KITAP', 'NPWP', 'Kontrak kerja / surat keterangan kerja', 'Slip gaji 3 bulan', 'Rekening koran 3 bulan', 'Perjanjian pranikah (bila menikah dengan WNI)'],
  // Rumah subsidi (KPR FLPP / BTN subsidi) — mengikuti Ceklis Dokumen KPR Permai Indah
  'Subsidi — Karyawan': ['KTP', 'KTP Pasangan', 'NPWP', 'SPT PPh 21', 'KK', 'Surat Nikah', 'SK Domisili', 'Pas Foto', 'BPJS', 'Slip Gaji', 'Rekening Koran', 'SKK (Surat Keterangan Kerja)', 'SKTB (Surat Keterangan Tidak Memiliki Rumah)', 'SKBM (Surat Keterangan Belum Menikah)', 'Form FLPP', 'SKBMR (Surat Keterangan Belum Menerima Subsidi)', 'Form KPR Bank', 'SPBPMS'],
  'Subsidi — Wirausaha': ['KTP', 'KTP Pasangan', 'NPWP', 'SPT PPh 21', 'KK', 'Surat Nikah', 'SK Domisili', 'Pas Foto', 'BPJS', 'Rekening Koran', 'SKTB (Surat Keterangan Tidak Memiliki Rumah)', 'SKBM (Surat Keterangan Belum Menikah)', 'Form FLPP', 'SKBMR (Surat Keterangan Belum Menerima Subsidi)', 'Form KPR Bank', 'SPBPMS', 'SKDU (Surat Keterangan Domisili Usaha)', 'SKU (Surat Keterangan Usaha)', 'Foto Usaha'],
};

let siap = false;
export async function siapkanKpr(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS kpr (
    id serial PRIMARY KEY, lead_code text UNIQUE NOT NULL, project text, unit text,
    profil text DEFAULT 'Karyawan', berkas jsonb DEFAULT '[]'::jsonb, plafon numeric, tenor integer,
    slik_status text, slik_tgl date, slik_catatan text, catatan text,
    akad_bank_id integer, akad_tgl date, akad_catatan text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
  await sql`CREATE TABLE IF NOT EXISTS kpr_bank (
    id serial PRIMARY KEY, kpr_id integer NOT NULL, bank text NOT NULL, ao_nama text, ao_wa text, cabang text,
    tgl_ajukan date, tahap text NOT NULL DEFAULT 'Diajukan', kendala text, plafon_setuju numeric,
    dok_nama text, dok_mime text, dok_data text, dok_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS kpr_log (id serial PRIMARY KEY, kpr_id integer NOT NULL, waktu timestamptz NOT NULL DEFAULT now(), oleh text, isi text)`;
  try { await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS akad_realisasi date`; } catch {}
  // Kolom rumah subsidi (Permai Indah): hasil BI checking, pinjaman, update sertifikat, LPA/SLF/surat pernyataan, alamat KTP
  try {
    await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS bi_hasil text`; await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS bi_pinjaman text`;
    await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS bi_status text`; await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS sertifikat text`;
    await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS lpa boolean`; await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS slf boolean`;
    await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS surat_pernyataan boolean`; await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS alamat_ktp text`; await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS kota text`;
  } catch {}
  try { await sql`CREATE INDEX IF NOT EXISTS idx_kpr_bank_kpr ON kpr_bank (kpr_id)`; } catch {}
  try { await sql`CREATE INDEX IF NOT EXISTS idx_kpr_log_kpr ON kpr_log (kpr_id, waktu DESC)`; } catch {}
  siap = true;
}

export async function daftarBerkas(sql) {
  try {
    const r = await sql`SELECT items FROM settings WHERE key = 'kpr_berkas'`;
    const v = r[0]?.items;
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ...BERKAS_DEFAULT, ...v };
  } catch {}
  return BERKAS_DEFAULT;
}

// Proses KPR mulai dihitung setelah konsumen BOOKING: kartu KPR otomatis terbentuk untuk transaksi Booking ber-cara bayar KPR
export async function sinkronKpr(sql) {
  try {
    await sql`INSERT INTO kpr (lead_code, project, unit)
      SELECT x.lead_code, x.project, x.unit FROM (
        SELECT DISTINCT ON (t.lead_code) t.lead_code, t.jenis, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, t.unit,
               COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar
        FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
        ORDER BY t.lead_code, t.id DESC) x
      WHERE x.jenis IN ('Booking', 'Closing') AND x.bayar ILIKE '%kpr%'
      ON CONFLICT (lead_code) DO NOTHING`;
  } catch (e) { console.error('sinkron kpr', e); }
}

const URUT = { 'Diajukan': 2, 'Kumpul berkas': 3, 'Analisa kredit': 4, 'SP3K terbit': 5 };
// Status konsumen = tahap bank yang paling maju
export function statusKpr(k, banks, trxTerakhir) {
  // Kartu lama yang dibuat saat masih Reserved: belum dihitung berjalan sampai Booking
  if (trxTerakhir === 'Reserved') return { label: 'Menunggu Booking', kategori: 'menunggu', langkah: 0, bankUtama: '' };
  const aktif = banks.filter(b => !['Ditolak', 'Tidak dilanjutkan'].includes(b.tahap));
  const akad = k.akad_bank_id ? banks.find(b => b.id === k.akad_bank_id) : null;
  // Akad sudah terealisasi → proses KPR selesai (Done)
  if (akad && k.akad_realisasi) return { label: 'Done', kategori: 'selesai', langkah: 5, bankUtama: akad.bank };
  if (akad) return { label: 'Akad', kategori: 'akad', langkah: 5, bankUtama: akad.bank };
  if (banks.length && !aktif.length) return { label: 'Ditolak', kategori: 'ditolak', langkah: 5, bankUtama: banks[0].bank };
  if (!banks.length) return { label: k.slik_tgl ? 'Siap diajukan ke bank' : 'Verifikasi & SLIK', kategori: 'berjalan', langkah: k.slik_tgl ? 1 : 0, bankUtama: '' };
  const terjauh = aktif.reduce((a, b) => (URUT[b.tahap] || 0) > (URUT[a.tahap] || 0) ? b : a, aktif[0]);
  const lg = URUT[terjauh.tahap] || 2;
  return { label: terjauh.tahap, kategori: terjauh.tahap === 'SP3K terbit' ? 'sp3k' : 'berjalan', langkah: lg, bankUtama: terjauh.bank };
}
