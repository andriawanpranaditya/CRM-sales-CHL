import { db, DEFAULT_SETTINGS } from '@/lib/db';
import { siapkanSkemaCRM } from '@/lib/skema-crm';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

// Semua peran Harmoni One (alur penjualan lintas divisi)
const ROLES = ['administrator', 'admin', 'markom', 'sales', 'adminsales', 'collection', 'kpr', 'finance', 'project', 'estate'];

export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (!process.env.SETUP_KEY || key !== process.env.SETUP_KEY) {
    return Response.json({ error: 'Kunci setup salah. Buka /api/setup?key=SETUP_KEY sesuai environment variable.' }, { status: 403 });
  }
  const sql = db();
  const jejak = [];
  let seeded = false;

  // Setiap langkah dicatat. Bila gagal, nama langkah + pesan asli dikembalikan
  // supaya ketahuan persis di mana macetnya (tanpa perlu buka log Vercel).
  async function step(nama, fn) {
    try {
      await fn();
      jejak.push('OK · ' + nama);
    } catch (e) {
      const pesan = e && e.message ? e.message : String(e);
      jejak.push('GAGAL · ' + nama + ' -> ' + pesan);
      const err = new Error(pesan);
      err.langkah = nama;
      throw err;
    }
  }

  try {
    // ---------- 1. Tabel inti ----------
    await step('tabel users', () => sql`CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY,
      username text UNIQUE NOT NULL,
      name text NOT NULL,
      role text NOT NULL,
      password_hash text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);

    await step('tabel settings', () => sql`CREATE TABLE IF NOT EXISTS settings (
      key text PRIMARY KEY,
      items jsonb NOT NULL
    )`);

    await step('tabel leads', () => sql`CREATE TABLE IF NOT EXISTS leads (
      id serial PRIMARY KEY,
      lead_code text UNIQUE,
      tgl date,
      nama text NOT NULL,
      wa text, email text, domisili text, kerja text,
      sumber text, project text, tipe text, tujuan text,
      budget bigint DEFAULT 0,
      bayar text, sales text,
      status text NOT NULL DEFAULT 'New',
      catatan text,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);

    await step('tabel followups', () => sql`CREATE TABLE IF NOT EXISTS followups (
      id serial PRIMARY KEY,
      lead_code text NOT NULL,
      tgl date,
      detail text NOT NULL,
      objection text,
      next_action text,
      next_tgl date,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);

    await step('tabel transactions', () => sql`CREATE TABLE IF NOT EXISTS transactions (
      id serial PRIMARY KEY,
      lead_code text NOT NULL,
      jenis text NOT NULL,
      tgl date,
      nilai bigint DEFAULT 0,
      catatan text,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);

    // ---------- 2. Kolom tambahan (aman diulang) ----------
    await step('kolom leads.next_fu', () => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_fu date`);
    await step('kolom leads.walkin_info', () => sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS walkin_info text`);
    await step('kolom users.email', () => sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email text`);
    await step('kolom users.password_plain', () => sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_plain text`);
    await step('kolom users.wa', () => sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS wa text`);
    await step('kolom followups.wa_pesan', () => sql`ALTER TABLE followups ADD COLUMN IF NOT EXISTS wa_pesan text`);
    // Kolom transactions WAJIB ada sebelum index yang memakainya
    await step('kolom transactions.project', () => sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project text`);
    await step('kolom transactions.unit', () => sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit text`);
    await step('kolom transactions.bayar', () => sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bayar text`);

    // ---------- 2b. Kolom alur verifikasi & dokumen (Tahap B) ----------
    await step('kolom verifikasi transaksi', async () => {
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS verif_status text NOT NULL DEFAULT 'Menunggu'`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS verif_catatan text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS verif_by text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS verif_at timestamptz`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS no_sp text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS no_ppjb text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS harga_unit bigint DEFAULT 0`;
    });

    await step('tabel notifikasi', async () => {
      await sql`CREATE TABLE IF NOT EXISTS notifikasi (
        id serial PRIMARY KEY,
        role_tujuan text NOT NULL,
        judul text NOT NULL,
        pesan text,
        lead_code text,
        trx_id integer,
        dibaca boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_notif_role ON notifikasi (role_tujuan, dibaca)`;
    });

    // ---------- 2c. Modul kerja divisi (Tahap C) ----------
    await step('tabel proses divisi', async () => {
      await sql`CREATE TABLE IF NOT EXISTS proses (
        id serial PRIMARY KEY,
        trx_id integer NOT NULL,
        lead_code text NOT NULL,
        divisi text NOT NULL,
        judul text NOT NULL,
        catatan text,
        nilai bigint DEFAULT 0,
        deadline date,
        status text NOT NULL DEFAULT 'Belum',
        urutan integer NOT NULL DEFAULT 0,
        selesai_at timestamptz,
        selesai_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_proses_divisi ON proses (divisi, status)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_proses_trx ON proses (trx_id)`;
    });

    await step('tabel komisi', async () => {
      await sql`CREATE TABLE IF NOT EXISTS komisi (
        id serial PRIMARY KEY,
        trx_id integer NOT NULL UNIQUE,
        lead_code text NOT NULL,
        sales text,
        dasar text,
        nilai_transaksi bigint DEFAULT 0,
        rate numeric(5,2) DEFAULT 0,
        nilai_komisi bigint DEFAULT 0,
        status text NOT NULL DEFAULT 'Layak',
        catatan text,
        diajukan_by text, diajukan_at timestamptz,
        approval_by text, approval_at timestamptz,
        dibayar_by text, dibayar_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_komisi_status ON komisi (status)`;
    });

    await step('kolom serah terima', async () => {
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tgl_serah_terima date`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bast_at timestamptz`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS clear_at timestamptz`;
    });

    // KPR Officer berada di dalam divisi Collection — data lama dialihkan
    await step('gabungkan KPR ke Collection', async () => {
      await sql`UPDATE proses SET divisi = 'collection',
                  judul = CASE WHEN judul ILIKE 'KPR%' THEN judul ELSE 'KPR - ' || judul END
                WHERE divisi = 'kpr'`;
      await sql`UPDATE notifikasi SET role_tujuan = 'collection' WHERE role_tujuan = 'kpr'`;
      await sql`UPDATE users SET role = 'collection' WHERE role = 'kpr'`;
    });

    await step('kolom tahap alur', async () => {
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tahap integer NOT NULL DEFAULT 1`;
      await sql`CREATE TABLE IF NOT EXISTS alur_log (
        id serial PRIMARY KEY,
        trx_id integer NOT NULL,
        lead_code text NOT NULL,
        dari_tahap integer, ke_tahap integer,
        dari_divisi text, ke_divisi text,
        oleh text, catatan text,
        jenis text NOT NULL DEFAULT 'maju',
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_alurlog_trx ON alur_log (trx_id)`;
      // Selaraskan tahap transaksi lama dengan kondisi yang sudah tercatat
      await sql`UPDATE transactions SET tahap = 2 WHERE tahap < 2 AND verif_status = 'Terverifikasi'`;
      await sql`UPDATE transactions SET tahap = 3 WHERE tahap < 3 AND verif_status = 'Terverifikasi'`;
      // Nomor tahap mengikuti alur 10 tahap: 7 Persiapan Serah Terima, 9 Pengelolaan Estate.
      // Sekaligus memulihkan berkas ber-BAST yang sempat tertahan di tahap 7.
      await sql`UPDATE transactions SET tahap = 7 WHERE tahap < 7 AND tgl_serah_terima IS NOT NULL`;
      await sql`UPDATE transactions SET tahap = 9 WHERE tahap < 9 AND bast_at IS NOT NULL`;
    });

    // ---------- 2d. Modul IOM (pengajuan pengeluaran dana) ----------
    await step('jabatan IOM pada users', async () => {
      // Jabatan approval terpisah dari peran divisi: satu orang bisa memegang
      // peran operasional sekaligus wewenang approval IOM.
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS jabatan text`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS divisi text`;
    });

    await step('tabel iom', async () => {
      await sql`CREATE TABLE IF NOT EXISTS iom (
        id serial PRIMARY KEY,
        no text UNIQUE NOT NULL,
        jenis text NOT NULL,
        divisi text NOT NULL,
        perihal text NOT NULL,
        uraian text,
        nominal bigint NOT NULL DEFAULT 0,
        ref_budget text,
        lampiran text,
        lampiran_nama text,
        tahap integer NOT NULL DEFAULT 1,
        status text NOT NULL DEFAULT 'Berjalan',
        revisi boolean NOT NULL DEFAULT false,
        catatan_revisi text,
        pengaju text NOT NULL,
        pengaju_username text,
        masuk_pos_at timestamptz NOT NULL DEFAULT now(),
        selesai_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_iom_tahap ON iom (tahap, status)`;
      await sql`CREATE TABLE IF NOT EXISTS iom_log (
        id serial PRIMARY KEY,
        iom_id integer NOT NULL,
        tahap integer,
        pos text,
        oleh text,
        jabatan text,
        keputusan text NOT NULL,
        alasan text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_iomlog ON iom_log (iom_id)`;
    });

    await step('tabel lampiran IOM', async () => {
      await sql`CREATE TABLE IF NOT EXISTS iom_files (
        id serial PRIMARY KEY,
        iom_id integer NOT NULL,
        filename text NOT NULL,
        mime text,
        ukuran integer,
        data text NOT NULL,
        uploaded_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_iomfiles ON iom_files (iom_id)`;
      // Sidik digital (SHA-256) menjamin lampiran tidak tertukar setelah diunggah
      await sql`ALTER TABLE iom_files ADD COLUMN IF NOT EXISTS sidik text`;
      // Lampiran yang terunggah sebelum fitur ini ada dihitungkan sidiknya sekali
      const belum = await sql`SELECT id, data FROM iom_files WHERE sidik IS NULL LIMIT 200`;
      for (const f of belum) {
        const sd = createHash('sha256').update(Buffer.from(f.data, 'base64')).digest('hex').slice(0, 16).toUpperCase();
        await sql`UPDATE iom_files SET sidik = ${sd} WHERE id = ${f.id}`;
      }
    });

    // ---------- 2e. Kelengkapan prosedur penjualan (gerbang tambahan) ----------
    await step('kolom gerbang prosedur', async () => {
      // Cross-check Booking Fee oleh Finance
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS finance_konfirmasi_at timestamptz`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS finance_konfirmasi_by text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS finance_catatan text`;
      // Penandatanganan konsumen — batas 7 hari kalender
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ttd_deadline date`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ttd_selesai_at timestamptz`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ttd_by text`;
      // Sign Approval Manajemen atas Surat Pesanan & PPJB
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS approval_mgmt_at timestamptz`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS approval_mgmt_by text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS approval_mgmt_catatan text`;
      // NPWP konsumen
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS npwp text`;
    });

    // Dua tahap baru disisipkan setelah Verifikasi Berkas: Penandatanganan
    // Dokumen dan Sign Approval Manajemen. Transaksi lama digeser sekali saja.
    await step('migrasi nomor tahap', async () => {
      const tanda = await sql`SELECT items FROM settings WHERE key = 'migrasi_tahap_v2'`;
      if (!tanda.length) {
        await sql`UPDATE transactions SET tahap = tahap + 2 WHERE tahap >= 3`;
        await sql`UPDATE alur_log SET dari_tahap = dari_tahap + 2 WHERE dari_tahap >= 3`;
        await sql`UPDATE alur_log SET ke_tahap = ke_tahap + 2 WHERE ke_tahap >= 3`;
        await sql`INSERT INTO settings (key, items) VALUES ('migrasi_tahap_v2', '["selesai"]'::jsonb)
                  ON CONFLICT (key) DO NOTHING`;
      }
    });

    // Peran akses penuh berganti nama: manager -> administrator
    await step('migrasi peran administrator', async () => {
      // Database dari CRM Sales punya batasan peran lama (manager, ceo, admin, markom, sales, collection) yang menolak
      // 'administrator'. Lepas dulu semua batasan peran; batasan lengkap Harmoni One dipasang lagi di langkah berikutnya.
      await sql`DO $$ DECLARE r record; BEGIN
        FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%role%' LOOP
          EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(r.conname); END LOOP; END $$`;
      await sql`UPDATE users SET role = 'administrator' WHERE role = 'manager'`;
      await sql`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('administrator','ceogrup','ceo','headsales','salesmanager','admin','markom','sales','adminsales','collection','finance','project','estate'))`;
    });

    // ---------- 2f. Otorisasi berjenjang ----------
    await step('kolom otorisasi pada users', async () => {
      // Kode petugas unik, tercetak pada dokumen dan jejak audit
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS kode_petugas text`;
      // PIN otorisasi — terpisah dari kata sandi, disimpan terenkripsi
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash text`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_diubah_at timestamptz`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kode ON users (kode_petugas)
                WHERE kode_petugas IS NOT NULL`;
    });

    await step('tabel otorisasi', async () => {
      await sql`CREATE TABLE IF NOT EXISTS otorisasi (
        id serial PRIMARY KEY,
        jenis text NOT NULL,
        objek text NOT NULL,
        objek_id integer NOT NULL,
        ringkas text,
        nilai bigint DEFAULT 0,
        jabatan text NOT NULL,
        divisi text,
        status text NOT NULL DEFAULT 'Menunggu',
        diminta_oleh_id integer,
        diminta_oleh text,
        diminta_kode text,
        diminta_at timestamptz NOT NULL DEFAULT now(),
        oleh_id integer,
        oleh text,
        oleh_kode text,
        oleh_jabatan text,
        mewakili text,
        mewakili_kode text,
        delegasi_id integer,
        keputusan text,
        alasan text,
        kode text,
        sidik text,
        sidik_sebelum text,
        ip text,
        diputus_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_otorisasi_objek ON otorisasi (objek, objek_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_otorisasi_status ON otorisasi (status, jabatan)`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_otorisasi_kode ON otorisasi (kode)
                WHERE kode IS NOT NULL`;
    });

    await step('tabel delegasi', async () => {
      await sql`CREATE TABLE IF NOT EXISTS delegasi (
        id serial PRIMARY KEY,
        pemberi_id integer NOT NULL,
        pengganti_id integer NOT NULL,
        jabatan text NOT NULL,
        divisi text,
        mulai date NOT NULL,
        selesai date NOT NULL,
        alasan text,
        darurat boolean NOT NULL DEFAULT false,
        dibuka_oleh text,
        aktif boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_delegasi ON delegasi (jabatan, aktif)`;
    });

    await step('kode petugas otomatis', async () => {
      // Format KODE: dua huruf divisi + urutan, mis. SM-001
      const KODE = { 'Sales & Marketing': 'SM', 'HRGA': 'HR', 'Finance': 'FN', 'Legal': 'LG',
        'Project': 'PR', 'Estate': 'ES', 'IT': 'IT', 'Umum': 'UM' };
      // Kode kosong disamakan dengan belum berkode agar tidak bentrok pada indeks unik
      await sql`UPDATE users SET kode_petugas = NULL WHERE trim(COALESCE(kode_petugas, '')) = ''`;

      const belum = await sql`SELECT id, divisi, role FROM users WHERE kode_petugas IS NULL ORDER BY id`;
      for (const u of belum) {
        const pre = KODE[u.divisi] || (u.role === 'administrator' ? 'AD' : 'UM');
        // Nomor tertinggi yang sudah terpakai, bukan jumlah barisnya — jumlah bisa
        // meleset bila ada nomor yang terlewat atau dihapus.
        const maks = await sql`SELECT COALESCE(MAX(NULLIF(regexp_replace(kode_petugas, '^.*-', ''), '')::int), 0) AS m
          FROM users WHERE kode_petugas ~ ${'^' + pre + '-[0-9]+$'}`;
        let urut = Number(maks[0].m) + 1;
        // Bila tetap bentrok (mis. dua proses berjalan bersamaan), coba nomor berikutnya
        for (let coba = 0; coba < 50; coba++) {
          const kode = pre + '-' + String(urut).padStart(3, '0');
          try {
            await sql`UPDATE users SET kode_petugas = ${kode} WHERE id = ${u.id}`;
            break;
          } catch (e) {
            if (!/unique|duplicate/i.test(e && e.message ? e.message : '')) throw e;
            urut += 1;
          }
        }
      }
    });

    // Pencatatan kegiatan Sales (kanvasing, open table, pameran) beserta
    // biaya dan perolehan lead — dasar perhitungan biaya per lead.
    await step('tabel kegiatan', async () => {
      await sql`CREATE TABLE IF NOT EXISTS kegiatan (
        id serial PRIMARY KEY,
        tgl date,
        jenis text NOT NULL,
        project text,
        lokasi text,
        pic text,
        jml_lead integer DEFAULT 0,
        biaya numeric DEFAULT 0,
        catatan text,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_kegiatan_tgl ON kegiatan (tgl)`;
    });

    // =============== FASE 1 · Fondasi (PRD CHL Biodistrict) ===============

    // Data perusahaan per project — kop dokumen & kode penomoran (ref_pers + ref_data)
    await step('tabel perusahaan', async () => {
      await sql`CREATE TABLE IF NOT EXISTS perusahaan (
        project text PRIMARY KEY,
        pers text NOT NULL,
        nama_pt text, npwp text, alamat text, alamat_npwp text, alamat_project text,
        telp text, fax text, email text,
        rek_bank text, rek_no text, rek_an text, rek_cabang text,
        penomoran_aktif boolean NOT NULL DEFAULT false,
        updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    });

    // Urutan nomor dokumen legal. Dinaikkan dengan satu perintah atomik sehingga
    // dua pengguna yang menerbitkan dokumen bersamaan tidak mendapat nomor sama.
    await step('tabel urutan nomor dokumen', async () => {
      await sql`CREATE TABLE IF NOT EXISTS document_sequences (
        project text NOT NULL,
        jenis text NOT NULL,
        tahun integer NOT NULL,
        last_no integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project, jenis, tahun)
      )`;
      // Setiap perubahan manual urutan dicatat — nomor dokumen legal wajib dapat ditelusuri
      await sql`CREATE TABLE IF NOT EXISTS penomoran_log (
        id serial PRIMARY KEY,
        project text, jenis text, tahun integer,
        dari integer, ke integer, alasan text,
        oleh text, created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS no_rsv text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS no_bast text`;
    });

    // Tabel berkas versi awal hanya mengizinkan jenis ktp & transfer; batasan itu
    // tertinggal di database lama dan menolak unggahan NPWP serta dokumen lain.
    await step('lepas batasan jenis berkas', async () => {
      // Hanya bila tabelnya sudah ada (pada database baru, tabel dibuat di langkah berikutnya)
      await sql`DO $$
        DECLARE r record;
        BEGIN
          IF to_regclass('trx_files') IS NULL THEN RETURN; END IF;
          FOR r IN SELECT conname FROM pg_constraint
                   WHERE conrelid = 'trx_files'::regclass AND contype = 'c' LOOP
            EXECUTE 'ALTER TABLE trx_files DROP CONSTRAINT ' || quote_ident(r.conname);
          END LOOP;
        END $$`;
    });

    // NIK konsumen — kunci utama pencegahan data ganda
    await step('anti-duplikat konsumen', async () => {
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS no_ktp text`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS npwp text`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_ktp ON leads (no_ktp)
                WHERE no_ktp IS NOT NULL AND no_ktp <> ''`;
      // NPWP ganda pada data lama tidak boleh menggagalkan pembaruan database;
      // indeks unik baru dipasang bila datanya sudah bersih.
      const ganda = await sql`SELECT regexp_replace(npwp, '[^0-9]', '', 'g') AS n, count(*)::int AS c
        FROM leads WHERE COALESCE(npwp, '') <> ''
        GROUP BY 1 HAVING count(*) > 1 LIMIT 1`;
      if (!ganda.length) {
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_npwp
          ON leads ((regexp_replace(npwp, '[^0-9]', '', 'g')))
          WHERE npwp IS NOT NULL AND npwp <> ''`;
      }
    });

    // Daftar harga per unit — Harga Standar & Harga All In (awal dari master unit PRD Fase 2)
    await step('tabel harga unit', async () => {
      await sql`CREATE TABLE IF NOT EXISTS unit_harga (
        project text NOT NULL,
        unit text NOT NULL,
        harga_standar bigint NOT NULL DEFAULT 0,
        harga_allin bigint NOT NULL DEFAULT 0,
        updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project, unit)
      )`;
      // Skema harga yang dipilih saat transaksi dibuat (Standar / All In)
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS skema_harga text`;
    });

    // =============== FASE 2 · Master (PRD CHL Biodistrict) ===============

    // Master unit: atribut fisik & harga per unit. Unit standar mewarisi harga dari
    // tipenya; unit hoek/irregular memakai harga sendiri (harga_* > 0).
    await step('master unit', async () => {
      await sql`ALTER TABLE unit_harga ADD COLUMN IF NOT EXISTS tipe text`;
      await sql`ALTER TABLE unit_harga ADD COLUMN IF NOT EXISTS lb numeric`;
      await sql`ALTER TABLE unit_harga ADD COLUMN IF NOT EXISTS lt numeric`;
      await sql`ALTER TABLE unit_harga ADD COLUMN IF NOT EXISTS dimensi text`;
      await sql`ALTER TABLE unit_harga ADD COLUMN IF NOT EXISTS arah text`;
      await sql`ALTER TABLE unit_harga ADD COLUMN IF NOT EXISTS hoek boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE unit_harga ADD COLUMN IF NOT EXISTS ppn_dtp boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE unit_harga ADD COLUMN IF NOT EXISTS harga_list bigint NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE unit_harga ADD COLUMN IF NOT EXISTS keterangan text`;
    });

    // Master tipe: harga & atribut standar per tipe (mis. A/B/C) — sumber harga unit standar
    await step('master tipe unit', async () => {
      await sql`CREATE TABLE IF NOT EXISTS tipe_unit (
        project text NOT NULL, tipe text NOT NULL,
        keterangan text, sub_tipe text, lb numeric, lt numeric, dimensi text, arah text,
        ppn_dtp boolean NOT NULL DEFAULT false,
        harga_list bigint NOT NULL DEFAULT 0, harga_standar bigint NOT NULL DEFAULT 0, harga_allin bigint NOT NULL DEFAULT 0,
        booking_fee bigint NOT NULL DEFAULT 0, uang_muka bigint NOT NULL DEFAULT 0, plafon_kpr bigint NOT NULL DEFAULT 0,
        urutan integer NOT NULL DEFAULT 0, updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project, tipe)
      )`;
    });

    // Master skema cara bayar — susunan BF / DP / angsuran / pelunasan (fondasi jadwal tagihan Fase 3)
    await step('master skema bayar', async () => {
      await sql`CREATE TABLE IF NOT EXISTS skema_bayar (
        project text NOT NULL, kode text NOT NULL, nama text NOT NULL,
        jenis text NOT NULL DEFAULT 'cash',
        bf_nominal bigint NOT NULL DEFAULT 0,
        dp_persen numeric NOT NULL DEFAULT 0, dp_nominal bigint NOT NULL DEFAULT 0, dp_termin integer NOT NULL DEFAULT 1, dp_hari integer NOT NULL DEFAULT 14,
        angsuran_jumlah integer NOT NULL DEFAULT 0, angsuran_interval_hari integer NOT NULL DEFAULT 30,
        pelunasan_hari integer NOT NULL DEFAULT 30, subsidi_dp boolean NOT NULL DEFAULT false,
        keterangan text, aktif boolean NOT NULL DEFAULT true, lengkap boolean NOT NULL DEFAULT false,
        urutan integer NOT NULL DEFAULT 0, updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project, kode)
      )`;
      await sql`ALTER TABLE skema_bayar ADD COLUMN IF NOT EXISTS dp_nominal bigint NOT NULL DEFAULT 0`;
    });

    // Data awal dari price list 13 Mei 2026 (Bio District) & price list Permai Indah.
    // Dimasukkan SEKALI (tidak menimpa suntingan) — angka dari pindaian, wajib diperiksa.
    await step('data awal master (price list Mei 2026)', async () => {
      const sudah = await sql`SELECT 1 FROM settings WHERE key = 'seed_master_v1'`;
      if (sudah.length) return;
      const B = 'BIO DISTRICT', P = 'PERMAI INDAH';
      const tipe = [
        [B, 'A', 'NON PPN DTP', 'Badan', 74, 60, '6 x 10', 'TIMUR', false, 1902000000, 1553778000, 1670000000, 5000000, 1],
        [B, 'B', 'PPN DTP', 'Badan', 102, 72, '6 x 12', 'BARAT', true, 2840000000, 2097000000, 2271000000, 5000000, 2],
        [B, 'C', 'PPN DTP', 'Badan', 130, 84, '7 x 12', 'SELATAN', true, 3422000000, 2595417445, 2806527243, 5000000, 3],
        [P, '22,5/60', 'KPR Subsidi', 'Badan', 22.5, 60, '', '', false, 185000000, 185000000, 0, 500000, 1],
      ];
      for (const t of tipe) {
        await sql`INSERT INTO tipe_unit (project, tipe, keterangan, sub_tipe, lb, lt, dimensi, arah, ppn_dtp,
            harga_list, harga_standar, harga_allin, booking_fee, urutan, updated_by)
          VALUES (${t[0]}, ${t[1]}, ${t[2]}, ${t[3]}, ${t[4]}, ${t[5]}, ${t[6]}, ${t[7]}, ${t[8]}, ${t[9]}, ${t[10]}, ${t[11]}, ${t[12]}, ${t[13]}, 'setup')
          ON CONFLICT DO NOTHING`;
      }
      await sql`UPDATE tipe_unit SET uang_muka = 1350000, plafon_kpr = 179150000 WHERE project = ${P} AND tipe = '22,5/60'`;
      // 12 unit hoek/irregular Bio — nama unit mengikuti penamaan Master Stock (Bio Ave 1 no.06, Bio Blv no.07)
      const hoek = [
        ['Bio Ave 1 no.06', 'C', 140, 108, '9 x 12', 'UTARA', 4256000000, 3280421823, 3543756850],
        ['Bio Ave 1 no.08', 'C', 140, 119, '9.9 x 12 (IRR)', 'SELATAN', 4429000000, 3422708235, 3695942183],
        ['Bio Ave 2 no.02', 'B', 109, 107, '8.9 x 12 (IRR)', 'UTARA', 3762000000, 2870357023, 3102099378],
        ['Bio Ave 2 no.03', 'B', 109, 137, '11.4 x 12 (IRR)', 'UTARA', 4566000000, 3528323578, 3810009189],
        ['Bio Blv no.07', 'B', 109, 138, '11.5 x 12 (IRR)', 'BARAT', 4464000000, 3445808649, 3720794422],
        ['Bio Blv no.08', 'B', 109, 143, '8.4 x 17 (IRR)', 'BARAT', 4621000000, 3573474308, 3858972641],
        ['Bio Blv no.09', 'B', 109, 126, '7.4 x 17 (IRR)', 'BARAT', 4188000000, 3219159189, 3477143546],
        ['Bio Blv no.17', 'B', 109, 138, '8.6 x 16 (IRR)', 'BARAT', 5586000000, 4363629575, 4707732405],
        ['Bio Ave 3 no.02', 'B', 109, 142, '12 x 12 (IRR)', 'UTARA', 4550000000, 3515189279, 3795887387],
        ['Bio Ave 3 no.08', 'B', 109, 105, '8.7 x 12 (IRR)', 'UTARA', 3855000000, 2946051829, 3183172351],
        ['Bio Ave 5 no.11', 'C', 140, 105, '8.7 x 12 (IRR)', 'UTARA', 4067000000, 3126825431, 3377726589],
        ['Bio Ave 5 no.16', 'C', 140, 107, '8.9 x 12 (IRR)', 'SELATAN', 5252000000, 4096731600, 4420737921],
      ];
      for (const h of hoek) {
        await sql`INSERT INTO unit_harga (project, unit, tipe, lb, lt, dimensi, arah, hoek, ppn_dtp, harga_list, harga_standar, harga_allin, keterangan, updated_by)
          VALUES (${B}, ${h[0]}, ${h[1]}, ${h[2]}, ${h[3]}, ${h[4]}, ${h[5]}, true, true, ${h[6]}, ${h[7]}, ${h[8]}, 'Hoek — price list 13 Mei 2026 (periksa)', 'setup')
          ON CONFLICT (project, unit) DO UPDATE SET tipe = EXCLUDED.tipe, lb = EXCLUDED.lb, lt = EXCLUDED.lt, dimensi = EXCLUDED.dimensi,
            arah = EXCLUDED.arah, hoek = true, ppn_dtp = true, harga_list = EXCLUDED.harga_list,
            harga_standar = CASE WHEN unit_harga.harga_standar > 0 THEN unit_harga.harga_standar ELSE EXCLUDED.harga_standar END,
            harga_allin = CASE WHEN unit_harga.harga_allin > 0 THEN unit_harga.harga_allin ELSE EXCLUDED.harga_allin END,
            keterangan = EXCLUDED.keterangan`;
      }
      // Skema cara bayar — nama mengikuti price list; aturan yang belum diketahui ditandai belum lengkap
      const skema = [
        ['CASH', 'CASH KERAS', 'cash', 5000000, 0, 1, 14, 0, 30, 30, true, 'Booking fee 5 jt · DP 0% (subsidi) hari ke-14 · pelunasan 100% − BF 1 bulan setelah DP', true],
        ['CIC12', 'CICILAN 12X', 'cicilan', 5000000, 0, 1, 14, 12, 30, 30, false, '', false],
        ['CIC18', 'CICILAN 18X', 'cicilan', 5000000, 0, 1, 14, 18, 30, 30, false, '', false],
        ['CIC24', 'CICILAN 24X', 'cicilan', 5000000, 0, 1, 14, 24, 30, 30, false, '', false],
        ['CIC30', 'CICILAN 30X', 'cicilan', 5000000, 0, 1, 14, 30, 30, 30, false, '', false],
        ['KPRSE', 'KPR SUPER EXPRESS', 'kpr', 5000000, 0, 1, 14, 0, 30, 30, true, 'BF 5 jt · DP subsidi · akad 100% − BF 1 bulan setelah DP', false],
        ['KPRUE', 'KPR ULTRA EXPRESS', 'kpr', 5000000, 0, 1, 14, 0, 30, 30, true, '', false],
        ['KPR10', 'KPR DP 10% - 4X', 'kpr', 5000000, 10, 4, 14, 0, 30, 30, false, '', false],
        ['KPR20', 'KPR DP 20% - 6X', 'kpr', 5000000, 20, 6, 14, 0, 30, 30, false, '', false],
        ['KPREE', 'KPR EXTRA EXPRESS', 'kpr', 5000000, 0, 1, 14, 0, 30, 30, true, '', false],
      ];
      let u = 0;
      for (const k of skema) {
        u += 1;
        await sql`INSERT INTO skema_bayar (project, kode, nama, jenis, bf_nominal, dp_persen, dp_termin, dp_hari, angsuran_jumlah,
            angsuran_interval_hari, pelunasan_hari, subsidi_dp, keterangan, lengkap, urutan, updated_by)
          VALUES (${B}, ${k[0]}, ${k[1]}, ${k[2]}, ${k[3]}, ${k[4]}, ${k[5]}, ${k[6]}, ${k[7]}, ${k[8]}, ${k[9]}, ${k[10]}, ${k[11]}, ${k[12]}, ${u}, 'setup')
          ON CONFLICT DO NOTHING`;
      }
      await sql`INSERT INTO skema_bayar (project, kode, nama, jenis, bf_nominal, dp_persen, dp_nominal, dp_termin, dp_hari, keterangan, lengkap, urutan, updated_by)
        VALUES (${P}, 'KPRSUB', 'KPR SUBSIDI', 'kpr', 500000, 0, 1350000, 1, 14, 'Booking fee 500 rb · uang muka nominal tetap Rp 1.350.000 (bukan persentase) · sisa dibiayai KPR bersubsidi', true, 1, 'setup')
        ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO settings (key, items) VALUES ('seed_master_v1', '["selesai"]'::jsonb) ON CONFLICT (key) DO NOTHING`;
    });

    // Permai Indah: DP KPR Subsidi adalah nominal TETAP (bukan persentase dari
    // nilai kontrak) — mengoreksi baris yang sempat ter-seed sebelum dp_nominal ada,
    // dan menyelaraskan kode/nama lama 'KPRBTN' (khusus bank BTN) ke 'KPRSUB' (umum,
    // tidak terikat satu bank) untuk database yang sempat menjalankan seed sebelumnya.
    await step('perbaiki & selaraskan skema KPR Subsidi Permai Indah', async () => {
      await sql`UPDATE skema_bayar SET kode = 'KPRSUB', nama = 'KPR SUBSIDI' WHERE project = 'PERMAI INDAH' AND kode = 'KPRBTN'`;
      await sql`UPDATE skema_bayar SET dp_nominal = 1350000, dp_persen = 0, subsidi_dp = false, lengkap = true,
          keterangan = 'Booking fee 500 rb · uang muka nominal tetap Rp 1.350.000 (bukan persentase) · sisa dibiayai KPR bersubsidi'
        WHERE project = 'PERMAI INDAH' AND kode = 'KPRSUB' AND dp_nominal = 0`;
      await sql`UPDATE tipe_unit SET keterangan = 'KPR Subsidi' WHERE project = 'PERMAI INDAH' AND keterangan = 'KPR BTN Subsidi'`;
    });

    // Kesembilan skema Bio District selain Cash Keras sudah punya susunan yang
    // benar sejak awal (jumlah angsuran & persen DP mengikuti namanya sendiri)
    // — mengikuti Terms & Conditions price list yang berlaku untuk SEMUA skema
    // (Booking Fee 5 jt, DP hari ke-14, pelunasan/akad 1 bulan setelah DP).
    // Hanya ditandai lengkap di sini, tanpa menimpa penyesuaian manual Finance.
    await step('lengkapi skema Bio District sesuai price list', async () => {
      const KET = {
        CIC12: 'Booking fee 5 jt · tanpa DP · 12x angsuran ke developer tiap 30 hari',
        CIC18: 'Booking fee 5 jt · tanpa DP · 18x angsuran ke developer tiap 30 hari',
        CIC24: 'Booking fee 5 jt · tanpa DP · 24x angsuran ke developer tiap 30 hari',
        CIC30: 'Booking fee 5 jt · tanpa DP · 30x angsuran ke developer tiap 30 hari',
        KPRSE: 'Booking fee 5 jt · DP subsidi (0%) hari ke-14 · akad KPR 1 bulan setelah DP',
        KPRUE: 'Booking fee 5 jt · DP subsidi (0%) hari ke-14 · akad KPR 1 bulan setelah DP',
        KPREE: 'Booking fee 5 jt · DP subsidi (0%) hari ke-14 · akad KPR 1 bulan setelah DP',
        KPR10: 'Booking fee 5 jt · DP 10% dicicil 4x mulai hari ke-14 · akad KPR 1 bulan setelah DP lunas',
        KPR20: 'Booking fee 5 jt · DP 20% dicicil 6x mulai hari ke-14 · akad KPR 1 bulan setelah DP lunas',
      };
      for (const [kode, ket] of Object.entries(KET)) {
        await sql`UPDATE skema_bayar SET lengkap = true, keterangan = ${ket}
          WHERE project = 'BIO DISTRICT' AND kode = ${kode} AND lengkap = false`;
      }
    });

    // =============== FASE 3 · Kontrak & Piutang ===============
    await step('kolom kontrak pada transaksi', async () => {
      for (const q of [
        sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS skema_kode text`,
        sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tgl_kontrak date`,
        sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dpp bigint`,
        sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ppn bigint`,
        sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ppn_dtp bigint`,
        sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ppn_dev bigint`,
        sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS jadwal_at timestamptz`,
      ]) await q;
    });
    await step('tabel tagihan & pembayaran', async () => {
      await sql`CREATE TABLE IF NOT EXISTS tagihan (
        id serial PRIMARY KEY,
        trx_id integer NOT NULL,
        urutan integer NOT NULL,
        jenis text NOT NULL,
        nama text NOT NULL,
        jatuh_tempo date NOT NULL,
        nilai bigint NOT NULL,
        dibayar bigint NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'Belum',
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_tagihan_trx ON tagihan (trx_id, urutan)`;
      // Pembayaran: lahir sebagai TTS (tanda terima sementara oleh kasir/collection),
      // menjadi Kuitansi (KW) setelah Finance memastikan dana masuk rekening.
      await sql`CREATE TABLE IF NOT EXISTS pembayaran (
        id serial PRIMARY KEY,
        trx_id integer NOT NULL,
        tagihan_id integer,
        no_tts text, no_kw text,
        tgl date NOT NULL,
        nilai bigint NOT NULL,
        cara text NOT NULL DEFAULT 'Transfer',
        bank text, no_bg text, tgl_bg date,
        keterangan text,
        status text NOT NULL DEFAULT 'TTS',
        sumber_trx_id integer,
        dibuat_oleh text, kw_oleh text, kw_at timestamptz, batal_oleh text, batal_alasan text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pembayaran_trx ON pembayaran (trx_id)`;
      await sql`CREATE TABLE IF NOT EXISTS pembayaran_alokasi (
        id serial PRIMARY KEY, pembayaran_id integer NOT NULL, tagihan_id integer NOT NULL, nilai bigint NOT NULL
      )`;
      await sql`INSERT INTO settings (key, items) VALUES ('pajak', '{"ppn_persen":11,"dtp_persen":100,"dtp_batas":2000000000}'::jsonb)
        ON CONFLICT (key) DO NOTHING`;
    });

    // Fase 4 — Collection: denda keterlambatan & pemutihan (waiver), atas baris
    // tagihan yang sama (jenis 'DENDA') — memakai mesin kuitansi/alokasi yang sama.
    await step('kolom denda pada tagihan', async () => {
      await sql`ALTER TABLE tagihan ADD COLUMN IF NOT EXISTS asal_tagihan_id integer`;
      await sql`ALTER TABLE tagihan ADD COLUMN IF NOT EXISTS pemutihan_oleh text`;
      await sql`ALTER TABLE tagihan ADD COLUMN IF NOT EXISTS pemutihan_alasan text`;
      await sql`ALTER TABLE tagihan ADD COLUMN IF NOT EXISTS pemutihan_at timestamptz`;
    });

    // Surat Peringatan (SP1–SP3) atas tunggakan kontrak; satu SP aktif per tingkat.
    await step('tabel surat peringatan', async () => {
      await sql`CREATE TABLE IF NOT EXISTS surat_peringatan (
        id serial PRIMARY KEY,
        trx_id integer NOT NULL,
        tingkat smallint NOT NULL,
        no_surat text,
        tgl_terbit date NOT NULL,
        hari_telat integer NOT NULL DEFAULT 0,
        tunggakan bigint NOT NULL DEFAULT 0,
        denda bigint NOT NULL DEFAULT 0,
        batas_bayar date,
        status text NOT NULL DEFAULT 'Terbit',
        diterbitkan_oleh text,
        batal_oleh text, batal_alasan text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_aktif ON surat_peringatan (trx_id, tingkat) WHERE status <> 'Batal'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_sp_trx ON surat_peringatan (trx_id)`;
    });

    // Data KPR per kontrak (bank, akad, plafon) — dasar pelacakan pencairan dari bank
    await step('tabel kpr', async () => {
      await sql`CREATE TABLE IF NOT EXISTS kpr (
        trx_id integer PRIMARY KEY,
        bank text, no_akad text, tgl_akad date,
        plafon bigint NOT NULL DEFAULT 0,
        catatan text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    });

    // Jurnal perubahan kontrak (PRD: ms_kontrak_jurnal) — setiap pengalihan hak, pindah unit,
    // dan adjustment nilai tercatat lengkap dengan kondisi sebelum/sesudah dan nomor addendum.
    await step('tabel jurnal kontrak', async () => {
      await sql`CREATE TABLE IF NOT EXISTS kontrak_jurnal (
        id serial PRIMARY KEY,
        trx_id integer NOT NULL,
        jenis text NOT NULL,
        tgl date NOT NULL,
        keterangan text,
        sebelum jsonb, sesudah jsonb,
        biaya_adm bigint NOT NULL DEFAULT 0,
        no_addendum text,
        oleh text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_jurnal_trx ON kontrak_jurnal (trx_id)`;
    });

    // Reservasi berkedaluwarsa: tanggal batas per baris Reserved (kosong = reservasi lama,
    // tidak pernah kedaluwarsa otomatis) dan jumlah perpanjangan yang sudah disetujui.
    await step('kolom kedaluwarsa reservasi', async () => {
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tgl_expire date`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS perpanjang_n integer NOT NULL DEFAULT 0`;
    });

    // Pembatalan kontrak berjadwal: penanda pada baris kontrak + catatan perhitungan pengembalian dana.
    // batal_at membuat kontrak berhenti muncul di penagihan, pengingat, alur, dan komisi.
    await step('pembatalan kontrak', async () => {
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS batal_at timestamptz`;
      await sql`CREATE TABLE IF NOT EXISTS pembatalan (
        id serial PRIMARY KEY,
        trx_id integer NOT NULL UNIQUE,
        batal_trx_id integer,
        tgl date NOT NULL,
        kategori text NOT NULL,
        alasan text,
        bf_dibayar bigint NOT NULL DEFAULT 0, dp_angsuran_dibayar bigint NOT NULL DEFAULT 0,
        adm_dibayar bigint NOT NULL DEFAULT 0, denda_dibayar bigint NOT NULL DEFAULT 0,
        pencairan_bank bigint NOT NULL DEFAULT 0,
        pajak_dipotong bigint NOT NULL DEFAULT 0, biaya_lain bigint NOT NULL DEFAULT 0, denda_terutang bigint NOT NULL DEFAULT 0,
        non_refund bigint NOT NULL DEFAULT 0, nilai_kembali bigint NOT NULL DEFAULT 0,
        status_refund text NOT NULL DEFAULT 'Tidak ada',
        tgl_pengajuan date, tgl_bayar date, bank text, no_ref text, catatan_refund text,
        dibuat_oleh text, refund_oleh text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    });

    // Follow up tagihan (SOP Collection Bagian 1, langkah 4): telepon/WA ke konsumen
    // sebelum SP1 bisa diterbitkan — dicatat per kontrak, bukan per baris tagihan.
    await step('tabel follow up tagihan', async () => {
      await sql`CREATE TABLE IF NOT EXISTS followup_tagihan (
        id serial PRIMARY KEY,
        trx_id integer NOT NULL,
        tgl date NOT NULL,
        metode text NOT NULL DEFAULT 'Telepon',
        hasil text NOT NULL,
        janji_bayar date,
        oleh text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_followup_trx ON followup_tagihan (trx_id, tgl)`;
    });

    // Data AJB (SOP Collection Bagian 3): BPHTB, PPh, dan data Notaris — berlaku untuk
    // semua skema (KPR maupun tunai), berbeda dari tabel kpr yang khusus skema KPR.
    await step('tabel ajb', async () => {
      await sql`CREATE TABLE IF NOT EXISTS ajb (
        trx_id integer PRIMARY KEY,
        notaris text, bphtb bigint NOT NULL DEFAULT 0, pph bigint NOT NULL DEFAULT 0,
        tgl_ajb date, no_ajb text, catatan text,
        updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    });

    // Kontrol Proses KPR: keputusan Bank (SP3K / ditolak) sebagai titik kontrol, percobaan bank ke-n
    await step('kolom keputusan bank pada kpr', async () => {
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS status_kredit text NOT NULL DEFAULT 'Berjalan'`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS tgl_sp3k date`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS no_sp3k text`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS alasan_tolak text`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS percobaan_bank integer NOT NULL DEFAULT 1`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS riwayat_bank text`;
    });

    // Ceklis Dokumen KPR (format ceklis eksternal Collection): BI checking, kelengkapan 21 dokumen,
    // LPA/SLF/surat pernyataan, update sertifikat. Kantor agent menempel pada agen, bukan kontrak.
    // Verifikasi SP & PPJB tidak lagi memerlukan otorisasi Kepala Divisi — permintaan lama ditutup
    await step('tutup otorisasi verifikasi SP lama', async () => {
      await sql`UPDATE otorisasi SET status = 'Dibatalkan', alasan = 'Tidak diperlukan — verifikasi SP & PPJB tanpa otorisasi Kepala Divisi'
        WHERE jenis = 'verifikasi_sp' AND status = 'Menunggu'`;
    });

    await step('kolom ceklis dokumen kpr', async () => {
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS tgl_bi_checking date`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS bi_checking text`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS pinjaman text`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS hasil_bi text`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS update_sertifikat text`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS jenis_pemohon text`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS dokumen jsonb NOT NULL DEFAULT '{}'::jsonb`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS lpa boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS slf boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE kpr ADD COLUMN IF NOT EXISTS surat_pernyataan boolean NOT NULL DEFAULT false`;
    });

    // BAST empat kategori: kategori yang dicatat + nomor perjanjian pinjam pakai (dokumen pendamping)
    await step('kolom kategori BAST', async () => {
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bast_kategori text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS no_perj_pp text`;
    });

    // ---------- 3. Constraint ----------
    // Constraint lama bisa lahir dari definisi inline CREATE TABLE dengan nama
    // apa pun. Semua CHECK di tabel dibersihkan dulu, baru aturan baru dipasang.
    await step('constraint peran users', async () => {
      // Peran yang tidak dikenal diselaraskan lebih dulu, karena aturan baru
      // akan ditolak bila masih ada baris dengan nilai di luar daftar.
      await sql`UPDATE users SET role = 'administrator' WHERE role = 'manager'`;
      await sql`UPDATE users SET role = 'collection' WHERE role = 'kpr'`;
      await sql`UPDATE users SET role = 'sales' WHERE role NOT IN
        ('administrator','admin','markom','sales','adminsales','collection','finance','project','estate')`;
      await sql`DO $$
        DECLARE r record;
        BEGIN
          FOR r IN SELECT conname FROM pg_constraint
                   WHERE conrelid = 'users'::regclass AND contype = 'c' LOOP
            EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(r.conname);
          END LOOP;
          ALTER TABLE users ADD CONSTRAINT users_role_chk
            CHECK (role IN ('administrator','ceogrup','ceo','headsales','salesmanager','admin','markom','sales','adminsales','collection','finance','project','estate'));
        END $$`;
    });

    // Semua CHECK pada transactions dipasang dalam satu blok: constraint lama
    // dibersihkan lebih dulu, lalu aturan baru dibuat sekaligus agar tidak
    // saling menimpa saat setup dijalankan berulang.
    await step('constraint transaksi', async () => {
      await sql`UPDATE transactions SET verif_status = 'Menunggu'
                WHERE verif_status IS NULL OR verif_status NOT IN ('Menunggu','Terverifikasi','Ditolak','Arsip CRM')`;
      await sql`DO $$
        DECLARE r record;
        BEGIN
          FOR r IN SELECT conname FROM pg_constraint
                   WHERE conrelid = 'transactions'::regclass AND contype = 'c' LOOP
            EXECUTE 'ALTER TABLE transactions DROP CONSTRAINT ' || quote_ident(r.conname);
          END LOOP;
          ALTER TABLE transactions ADD CONSTRAINT transactions_jenis_chk
            CHECK (jenis IN ('Reserved','Booking','Closing','Batal'));
          ALTER TABLE transactions ADD CONSTRAINT transactions_verif_chk
            CHECK (verif_status IN ('Menunggu','Terverifikasi','Ditolak','Arsip CRM'));
        END $$`;
    });

    // ---------- 4. Index performa ----------
    await step('index leads', async () => {
      await sql`CREATE INDEX IF NOT EXISTS idx_leads_tgl ON leads (tgl)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_leads_sales ON leads (sales)`;
    });
    await step('index followups', () => sql`CREATE INDEX IF NOT EXISTS idx_fu_lead ON followups (lead_code)`);
    await step('index transactions', async () => {
      await sql`CREATE INDEX IF NOT EXISTS idx_trx_lead ON transactions (lead_code)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_trx_unit ON transactions (project, unit)`;
    });

    // ---------- 5. Tabel pendukung ----------
    await step('tabel trx_files', () => sql`CREATE TABLE IF NOT EXISTS trx_files (
      id serial PRIMARY KEY,
      project text NOT NULL,
      unit text NOT NULL,
      lead_code text NOT NULL,
      jenis text NOT NULL,
      filename text,
      mime text,
      data text NOT NULL,
      uploaded_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project, unit, lead_code, jenis)
    )`);

    await step('kolom nama pada unit_manual', async () => {
      if (await sql`SELECT to_regclass('unit_manual') AS t`.then(r => r[0].t)) {
        await sql`ALTER TABLE unit_manual ADD COLUMN IF NOT EXISTS nama text`;
        await sql`ALTER TABLE unit_manual ADD COLUMN IF NOT EXISTS sales text`;
      }
    });
    await step('tabel unit_manual', () => sql`CREATE TABLE IF NOT EXISTS unit_manual (
      id serial PRIMARY KEY,
      project text NOT NULL,
      unit text NOT NULL,
      status text NOT NULL CHECK (status IN ('Terjual','Reserved','Kosong')),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project, unit)
    )`);
    await step('kolom nama pada unit_manual (baru)', async () => {
      await sql`ALTER TABLE unit_manual ADD COLUMN IF NOT EXISTS nama text`;
      await sql`ALTER TABLE unit_manual ADD COLUMN IF NOT EXISTS sales text`;
    });

    // ---------- Kelengkapan sesuai Kebijakan & Prosedur Penjualan ----------
    await step('berkas Sales/Agent', async () => {
      // Berkas Sales/Agent cukup sekali diunggah, dipakai untuk seluruh
      // penjualan berikutnya, dan dapat diperbarui bila ada perubahan.
      await sql`CREATE TABLE IF NOT EXISTS sales_agent (
        id serial PRIMARY KEY,
        nama text UNIQUE NOT NULL,
        tipe text NOT NULL DEFAULT 'Sales',
        telp text, email text,
        bank text, no_rekening text, nama_rekening text,
        ktp text, npwp text, rekening text, kartu_nama text,
        lengkap boolean NOT NULL DEFAULT false,
        dibuat_oleh text, diperbarui_oleh text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_agen_nama ON sales_agent (nama)`;
      // Kantor agent (Ceklis Dokumen KPR) — menempel pada agen, dipakai semua kontraknya
      await sql`ALTER TABLE sales_agent ADD COLUMN IF NOT EXISTS kantor text`;
    });

    await step('kelengkapan data konsumen', async () => {
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS npwp text`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS alamat_surat text`;
      // Identitas resmi konsumen untuk dokumen penjualan. Terpisah dari 'nama'
      // (sering nama panggilan) dan 'domisili' (area singkat untuk analisa lead).
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS nama_ktp text`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS alamat_domisili text`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS alamat_ktp text`;
      // Bagian alamat sesuai susunan KTP — alamat_ktp adalah gabungannya
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ktp_alamat text`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ktp_rtrw text`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ktp_kel text`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ktp_kec text`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ktp_kota text`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ktp_prov text`;
      // Dispensasi NPWP — transaksi tetap dapat disimpan setelah diotorisasi Kepala Divisi
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dispensasi_npwp boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dispensasi_npwp_oleh text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dispensasi_npwp_at timestamptz`;
    });

    await step('penanda dispensasi BAST', async () => {
      // Serah terima yang menyimpang dari prosedur ditandai agar terlihat pada
      // dokumen BAST maupun saat audit.
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bast_dispensasi boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bast_dispensasi_alasan text`;
    });

    await step('distribusi dokumen', async () => {
      // Rangkap bermeterai Nama Perusahaan -> Konsumen; Nama Konsumen -> arsip
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS distribusi_konsumen_at timestamptz`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS distribusi_arsip_at timestamptz`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS distribusi_oleh text`;
      await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS distribusi_catatan text`;
    });

    await step('tabel unit_positions', () => sql`CREATE TABLE IF NOT EXISTS unit_positions (
      id serial PRIMARY KEY,
      project text NOT NULL,
      unit text NOT NULL,
      x real NOT NULL,
      y real NOT NULL,
      UNIQUE (project, unit)
    )`);

    // ---------- 6. Data awal ----------
    await step('isi settings default', async () => {
      for (const [k, items] of Object.entries(DEFAULT_SETTINGS)) {
        await sql`INSERT INTO settings (key, items) VALUES (${k}, ${JSON.stringify(items)}::jsonb)
                  ON CONFLICT (key) DO NOTHING`;
      }
    });

    await step('rapikan status Lost -> Drop', async () => {
      await sql`UPDATE leads SET status = 'Drop' WHERE status = 'Lost'`;
      const st = await sql`SELECT items FROM settings WHERE key = 'status'`;
      if (st.length && Array.isArray(st[0].items) && st[0].items.includes('Lost')) {
        const items = st[0].items.map(x => (x === 'Lost' ? 'Drop' : x));
        await sql`UPDATE settings SET items = ${JSON.stringify(items)}::jsonb WHERE key = 'status'`;
      }
    });

    await step('pastikan ada Administrator', async () => {
      // Bila tidak tersisa satu pun akun berperan penuh, akun 'manager' dipulihkan
      // agar menu Pengguna tetap dapat dibuka dan sistem tidak terkunci.
      const adm = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'administrator' AND active = true`;
      if (adm[0].n === 0) {
        await sql`UPDATE users SET role = 'administrator', active = true WHERE lower(username) = 'manager'`;
      }
    });

    await step('akun administrator pertama', async () => {
      // ON CONFLICT: aman dijalankan berulang, tidak menimpa password yang sudah diganti
      const hash = await bcrypt.hash('manager123', 10);
      const hasil = await sql`INSERT INTO users (username, name, role, password_hash)
                VALUES ('manager', 'Administrator', 'administrator', ${hash})
                ON CONFLICT (username) DO NOTHING
                RETURNING id`;
      seeded = Array.isArray(hasil) && hasil.length > 0;
    });

    // Skema modul CRM (tabel analitik, kolom lead & stok tambahan) dibuat SETELAH tabel dasar tersedia
    try { await siapkanSkemaCRM(sql); } catch {}
    return Response.json({
      ok: true,
      message: 'Database Harmoni One siap.',
      peran_tersedia: ROLES,
      akun_pertama: seeded
        ? 'Akun administrator dibuat - username: manager, password: manager123 (SEGERA ganti setelah login).'
        : 'Akun sudah ada, tidak dibuat ulang.',
      jejak,
    });
  } catch (e) {
    return Response.json({
      ok: false,
      gagal_pada: e.langkah || '(tidak diketahui)',
      pesan: e.message,
      jejak,
      saran: 'Kirim isi gagal_pada dan pesan ini agar bisa diperbaiki.',
    }, { status: 500 });
  }
}
