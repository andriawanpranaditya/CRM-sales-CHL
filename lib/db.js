import { neon } from '@neondatabase/serverless';

let _sql = null;
export function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum di-set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// ===== Riwayat perubahan status lead (dicatat otomatis oleh trigger database) =====
let statusLogSiap = false;
export async function siapkanStatusLog(sql) {
  if (statusLogSiap) return;
  try {
    await sql`CREATE TABLE IF NOT EXISTS lead_status_log (
      id serial PRIMARY KEY, lead_code text, jenis text NOT NULL DEFAULT 'status', dari text, ke text,
      sales_saat text, oleh text, alasan text, tgl date NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS idx_lsl_lead ON lead_status_log (lead_code)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_lsl_tgl ON lead_status_log (tgl)`;
    await sql`CREATE OR REPLACE FUNCTION catat_status_lead() RETURNS trigger AS $$
      BEGIN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          INSERT INTO lead_status_log (lead_code, jenis, dari, ke, sales_saat, tgl)
          VALUES (NEW.lead_code, 'status', OLD.status, NEW.status, COALESCE(NEW.sales, ''), (now() + interval '7 hours')::date);
        END IF;
        IF COALESCE(OLD.sales, '') = '' AND COALESCE(NEW.sales, '') <> '' THEN
          INSERT INTO lead_status_log (lead_code, jenis, dari, ke, sales_saat, tgl)
          VALUES (NEW.lead_code, 'oper', '', NEW.sales, NEW.sales, (now() + interval '7 hours')::date);
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`;
    await sql`DROP TRIGGER IF EXISTS trg_catat_status_lead ON leads`;
    await sql`CREATE TRIGGER trg_catat_status_lead AFTER UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION catat_status_lead()`;
    statusLogSiap = true;
  } catch (e) { console.error('siapkanStatusLog', e); }
}
// Lengkapi catatan riwayat terbaru lead dengan siapa yang mengubah & alasannya (dipanggil setelah UPDATE leads)
export async function tandaiOleh(sql, lead_code, oleh, alasan) {
  try {
    await sql`UPDATE lead_status_log SET oleh = ${oleh}, alasan = COALESCE(NULLIF(${alasan || ''}, ''), alasan)
      WHERE lead_code = ${lead_code} AND oleh IS NULL AND created_at > now() - interval '2 minutes'`;
  } catch {}
}

function seq(prefix, n) {
  return Array.from({ length: n }, (_, i) => `${prefix} no.${String(i + 1).padStart(2, '0')}`);
}
// Daftar unit awal (hasil pembacaan siteplan — bisa dirapikan Manager di Settings)
export const DEFAULT_UNITS = {
  'BIO DISTRICT': [
    ...seq('Bio Ave 1', 8), ...seq('Bio Ave 2', 8), ...seq('Bio Ave 3', 20),
    ...seq('Bio Ave 5', 16), ...seq('Bio Ave 6', 7), ...seq('Bio Ave 7', 3),
    ...seq('Bio Blv', 17),
  ],
  'PERMAI INDAH': [
    ...['A1','A2','A3','A4','A5','A6','A7','A8'].flatMap(b => seq('Blok ' + b, 18)),
    ...['B1','B2','B3','B4','B5','B7'].flatMap(b => seq('Blok ' + b, 10)),
    ...seq('Blok C1', 7), ...seq('Blok C2', 18), ...seq('Blok BLV', 17),
  ],
};

export const DEFAULT_SETTINGS = {
  status: ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Booking', 'Closing', 'Drop'],
  sumber: ['Walk In', 'Website', 'Instagram', 'Facebook Ads', 'Google Ads', 'WhatsApp', 'Referral', 'Pameran / Event', 'Kanvasing', 'Marketplace Properti', 'Lainnya'],
  project: ['BIO DISTRICT', 'PERMAI INDAH'],
  tipe: ['TIPE A', 'TIPE B', 'TIPE C', 'TIPE B CORNER', 'TIPE C CORNER', 'KAVLING', '22,5/60'],
  tujuan: ['Hunian', 'Investasi', 'Usaha'],
  bayar: ['Cash Keras', 'Cash Bertahap', 'KPR', 'In-House'],
  domisili: ['BSD', 'Gading Serpong', 'Alam Sutera', 'Serpong', 'Karawaci', 'Tangerang Kota', 'Tangerang Selatan', 'Kabupaten Tangerang', 'Bintaro', 'Jakarta Barat', 'Jakarta Selatan', 'Jakarta Pusat', 'Jakarta Utara', 'Jakarta Timur', 'Depok', 'Bogor', 'Bekasi', 'Luar Jabodetabek'],
  topik: ['Promo & Harga', 'Desain & Fasilitas', 'Lokasi & Akses', 'Lifestyle & Suasana', 'Progres Pembangunan', 'Testimoni', 'Event', 'Edukasi KPR'],
};
