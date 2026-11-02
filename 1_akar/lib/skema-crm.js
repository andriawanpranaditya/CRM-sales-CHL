// ===== Skema tabel modul CRM Sales di Harmoni One =====
// Tabel Analisa Marcom (mi_*), identitas konsumen, dan kolom lead/FU dari CRM. Aman dijalankan berulang.
// Dipanggil oleh /api/setup dan otomatis oleh modul Analisa Marcom / sinkronisasi iklan saat pertama dipakai.
let gagal = 0;
const coba = async f => { try { await f(); } catch (e) { gagal++; console.error('skema crm', e.message); } };
let siap = false;
export async function siapkanSkemaCRM(sql) {
  if (siap) return;
  gagal = 0;
  // ===== Modul Analisa Marcom (tabel berprefix mi_ — blok toleran, aman dijalankan berulang) =====
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_campaigns (
    id serial PRIMARY KEY,
    nama text UNIQUE NOT NULL,
    platform text, project text, tujuan text,
    budget numeric DEFAULT 0,
    status text NOT NULL DEFAULT 'Aktif',
    catatan text, created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_contents (
    id serial PRIMARY KEY,
    tgl date, platform text, project text, format text,
    topik text, hook text, jam text, durasi text, link text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_content_metrics (
    id serial PRIMARY KEY,
    content_id integer NOT NULL,
    tgl date NOT NULL,
    reach integer DEFAULT 0, like_n integer DEFAULT 0, komentar integer DEFAULT 0,
    share_n integer DEFAULT 0, save_n integer DEFAULT 0,
    view3 integer DEFAULT 0, view_full integer DEFAULT 0, klik_bio integer DEFAULT 0,
    UNIQUE (content_id, tgl)
  )`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_ads (
    id serial PRIMARY KEY,
    tgl date, campaign text, kreatif text,
    spend numeric DEFAULT 0,
    impresi integer DEFAULT 0, reach integer DEFAULT 0, klik integer DEFAULT 0, hasil integer DEFAULT 0,
    catatan text, created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  // Jejak campaign & kreatif pada lead — kunci closed-loop iklan -> Booking
  await coba(() => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text`);
  await coba(() => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS konten text`);
  await coba(() => sql`CREATE INDEX IF NOT EXISTS idx_mi_metrics_content ON mi_content_metrics (content_id)`);
  await coba(() => sql`CREATE INDEX IF NOT EXISTS idx_mi_ads_tgl ON mi_ads (tgl)`);
  await coba(() => sql`CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads (campaign)`);

  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_ga4_daily (
    id serial PRIMARY KEY, tgl date NOT NULL, source_medium text NOT NULL,
    sessions integer DEFAULT 0, users integer DEFAULT 0, key_events integer DEFAULT 0,
    UNIQUE (tgl, source_medium)
  )`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_gsc_daily (
    id serial PRIMARY KEY, tgl date NOT NULL, query text NOT NULL,
    clicks integer DEFAULT 0, impressions integer DEFAULT 0, position numeric DEFAULT 0,
    UNIQUE (tgl, query)
  )`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_sync_log (
    id serial PRIMARY KEY, waktu timestamptz NOT NULL DEFAULT now(),
    sumber text, status text, baris integer DEFAULT 0, pesan text
  )`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_amort (
    id serial PRIMARY KEY, campaign text NOT NULL, keterangan text, total numeric NOT NULL,
    mulai date NOT NULL, bulan integer NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await coba(() => sql`ALTER TABLE followups ADD COLUMN IF NOT EXISTS balas boolean`);
  await coba(() => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS usia text`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_ads_breakdown (tgl date NOT NULL, campaign text NOT NULL, dim text NOT NULL, k1 text NOT NULL, k2 text NOT NULL DEFAULT '',
    spend numeric DEFAULT 0, impresi integer DEFAULT 0, klik integer DEFAULT 0, hasil integer DEFAULT 0, PRIMARY KEY (tgl, campaign, dim, k1, k2))`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_adset_targeting (adset_id text PRIMARY KEY, campaign text, nama text, status text, usia_min integer, usia_max integer, gender text,
    lokasi text, minat text, penempatan text, advantage boolean, updated_at timestamptz NOT NULL DEFAULT now())`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_ig_demografi (tgl date NOT NULL, dim text NOT NULL, kunci text NOT NULL, nilai integer, PRIMARY KEY (tgl, dim, kunci))`);
  try { await sql`ALTER TABLE mi_content_metrics ADD COLUMN IF NOT EXISTS avg_watch numeric`; } catch {}
  await coba(() => sql`CREATE TABLE IF NOT EXISTS konsumen (lead_code text PRIMARY KEY, nama_ktp text, nik text, npwp text, email text, alamat text, rt_rw text,
    kel_desa text, kecamatan text, kota_kab text, provinsi text, alamat_domisili text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`);
  try { await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS views3 integer`; await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS thruplay integer`; await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS ad_id text`; } catch {}
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_ad_status (ad_id text PRIMARY KEY, nama text, campaign text, status text, updated_at timestamptz NOT NULL DEFAULT now())`);
  await coba(() => sql`CREATE TABLE IF NOT EXISTS mi_persona (project text PRIMARY KEY, data jsonb NOT NULL, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`);
  await coba(() => sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS sumber text`);
  await coba(() => sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS ext_key text`);
  await coba(() => sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_mi_ads_ext ON mi_ads (ext_key)`);
  await coba(() => sql`ALTER TABLE mi_campaigns ADD COLUMN IF NOT EXISTS sumber text`);
  await coba(() => sql`CREATE INDEX IF NOT EXISTS idx_mi_ga4_tgl ON mi_ga4_daily (tgl)`);
  await coba(() => sql`CREATE INDEX IF NOT EXISTS idx_mi_gsc_tgl ON mi_gsc_daily (tgl)`);
  // Kolom lead dari CRM (asal campaign iklan, konten, usia, detail sumber) — dipakai webhook WhatsApp & form lead
  await coba(() => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign text`);
  await coba(() => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS konten text`);
  await coba(() => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS usia text`);
  await coba(() => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sumber_detail text`);
  // Master Stock: nilai kontrak & sumber tanda (manual / impor laporan) dari CRM
  await coba(() => sql`ALTER TABLE unit_manual ADD COLUMN IF NOT EXISTS nilai numeric`);
  await coba(() => sql`ALTER TABLE unit_manual ADD COLUMN IF NOT EXISTS sumber text`);
  await coba(() => sql`ALTER TABLE unit_manual ADD COLUMN IF NOT EXISTS nama text`);
  await coba(() => sql`ALTER TABLE unit_manual ADD COLUMN IF NOT EXISTS sales text`);
  // Hanya dianggap selesai bila semua perintah berhasil (mis. tabel dasar belum dibuat /api/setup → dicoba lagi nanti)
  siap = gagal === 0;
}
