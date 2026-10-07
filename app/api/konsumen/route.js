import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const KOLOM = ['nama_ktp', 'nik', 'npwp', 'email', 'alamat', 'rt_rw', 'kel_desa', 'kecamatan', 'kota_kab', 'provinsi', 'alamat_domisili'];
async function siapkanKonsumen(sql) {
  await sql`CREATE TABLE IF NOT EXISTS konsumen (lead_code text PRIMARY KEY, nama_ktp text, nik text, npwp text, email text, alamat text, rt_rw text,
    kel_desa text, kecamatan text, kota_kab text, provinsi text, alamat_domisili text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`;
}

// GET ?lead_code= → identitas tersimpan (terisi otomatis bila konsumen pernah bertransaksi)
export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const lc = new URL(req.url).searchParams.get('lead_code');
  const sql = db(); await siapkanKonsumen(sql);
  if (user.role === 'sales') {
    const own = await sql`SELECT 1 FROM leads WHERE lead_code = ${lc} AND sales = ${user.name}`;
    if (!own.length) return Response.json({});
  }
  const r = await sql`SELECT * FROM konsumen WHERE lead_code = ${lc}`;
  if (r[0]) return Response.json(r[0]);
  const l = await sql`SELECT nama, email FROM leads WHERE lead_code = ${lc}`;
  return Response.json(l[0] ? { email: l[0].email || '', baru: true } : {});
}
