import { db } from '@/lib/db';
import { siapkanSkemaCRM } from '@/lib/skema-crm';
import { requireUser } from '@/lib/auth';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const KOLOM = ['nama_ktp', 'nik', 'npwp', 'email', 'alamat', 'rt_rw', 'kel_desa', 'kecamatan', 'kota_kab', 'provinsi', 'alamat_domisili'];
let konsumenSiap = false;
async function siapkanKonsumen(sql) {
  if (konsumenSiap) return;
  await sql`CREATE TABLE IF NOT EXISTS konsumen (lead_code text PRIMARY KEY, nama_ktp text, nik text, npwp text, email text, alamat text, rt_rw text,
    kel_desa text, kecamatan text, kota_kab text, provinsi text, alamat_domisili text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`;
  konsumenSiap = true;
}

// GET ?lead_code= → identitas tersimpan (terisi otomatis bila konsumen pernah bertransaksi)
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const lc = new URL(req.url).searchParams.get('lead_code');
  const sql = db(); try { await siapkanSkemaCRM(sql); } catch {} await siapkanKonsumen(sql);
  if (user.role === 'sales') {
    const own = await sql`SELECT 1 FROM leads WHERE lead_code = ${lc} AND sales = ${user.name}`;
    if (!own.length) return jsonProyek(user, {});
  }
  const r = await sql`SELECT * FROM konsumen WHERE lead_code = ${lc}`;
  if (r[0]) return jsonProyek(user, r[0]);
  const l = await sql`SELECT nama, email FROM leads WHERE lead_code = ${lc}`;
  return jsonProyek(user, l[0] ? { email: l[0].email || '', baru: true } : {});
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
