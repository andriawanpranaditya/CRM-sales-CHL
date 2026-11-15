// Other Sales: penjualan dari internal employee (karyawan non-sales) atau external, tanpa akun CRM.
// Masuk lewat link terbuka (dicek Manager) atau diinput Manager/CEO langsung di Form Input.
import crypto from 'crypto';
import { driveSiap, simpanFoto } from './foto-drive';

let siap = false;
export async function siapkanOther(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS other_sales (id serial PRIMARY KEY, nama text NOT NULL, jenis text NOT NULL, divisi text, hp text NOT NULL,
    ktp text, npwp text, project text, created_by text, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS other_link (id serial PRIMARY KEY, project text NOT NULL, token text UNIQUE NOT NULL, aktif boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS other_laporan (id serial PRIMARY KEY, token text, project text, jenis text, nama text, divisi text, hp text, ktp text, npwp text,
    konsumen text, konsumen_wa text, tgl date, tipe text, bayar text, domisili text, budget text, catatan text,
    status text NOT NULL DEFAULT 'Menunggu', alasan text, lead_code text, other_id int, dicek_oleh text, dicek_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS other_dok (id serial PRIMARY KEY, mime text, data text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  for (const c of ['trx_jenis text', 'unit text', 'nilai numeric', 'konsumen_email text', 'konsumen_nik text', 'alamat text', 'berkas jsonb'])
    { try { await sql(`ALTER TABLE other_laporan ADD COLUMN IF NOT EXISTS ${c}`); } catch {} }
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS other_id int`; await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_tipe text`; } catch {}
  siap = true;
}
export const JENIS_OTHER = ['Internal employee', 'External'];
// Nama yang tampil sebagai Sales / PIC di semua laporan
export const namaOther = o => `${String(o.nama || '').trim()} (Other Sales · ${o.jenis === 'External' ? 'External' : 'Internal' + (o.divisi ? ' – ' + String(o.divisi).trim() : '')})`;
export const isOther = s => /\(Other Sales/i.test(String(s || ''));
export const tokenOther = p => `os-${String(p || '').toLowerCase().startsWith('permai') ? 'pi' : 'bd'}${crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').slice(0, 6)}`;

// Dokumen KTP / NPWP: Google Drive akun marketing project bila sudah dipasang, selain itu disimpan ringkas di database
export async function simpanDok(sql, project, { nama, data }) {
  if (!data) return null;
  if (data.length > 2_500_000) throw new Error('File dokumen terlalu besar');
  if (driveSiap(project)) return simpanFoto(project, { nama, data, folder: 'Other Sales dokumen' });
  await siapkanOther(sql);
  const r = await sql`INSERT INTO other_dok (mime, data) VALUES ('image/jpeg', ${data}) RETURNING id`;
  return 'db:' + r[0].id;
}

export function cekDataOther(o, { butuhDok = true } = {}) {
  const t = (x, n = 120) => String(x ?? '').trim().slice(0, n);
  const d = { jenis: JENIS_OTHER.includes(o?.jenis) ? o.jenis : '', nama: t(o?.nama, 80), divisi: t(o?.divisi, 60), hp: t(o?.hp, 30) };
  if (!d.jenis) return { error: 'Pilih Internal employee atau External' };
  if (!d.nama) return { error: 'Nama Other Sales wajib diisi' };
  if (!/\d{8,}/.test(d.hp.replace(/\D/g, ''))) return { error: 'No. HP Other Sales wajib diisi dengan benar' };
  if (d.jenis === 'Internal employee' && !d.divisi) return { error: 'Divisi wajib diisi untuk internal employee' };
  if (d.jenis === 'External' && butuhDok && (!o?.ktp?.data || !o?.npwp?.data)) return { error: 'External wajib melampirkan foto KTP dan NPWP' };
  return { d };
}
// Buat / pakai data Other Sales (berdasarkan nama + no HP) lalu kembalikan id & nama tampilan
export async function daftarkanOther(sql, project, o, oleh) {
  await siapkanOther(sql);
  const hpN = o.hp.replace(/\D/g, '');
  const ada = (await sql`SELECT * FROM other_sales WHERE lower(nama) = lower(${o.nama}) AND regexp_replace(hp, '[^0-9]', '', 'g') = ${hpN} ORDER BY id DESC LIMIT 1`)[0];
  if (ada) {
    if ((o.ktp && !ada.ktp) || (o.npwp && !ada.npwp) || (o.divisi && o.divisi !== ada.divisi)) await sql`UPDATE other_sales SET ktp = COALESCE(${o.ktp || null}, ktp), npwp = COALESCE(${o.npwp || null}, npwp), divisi = COALESCE(NULLIF(${o.divisi || ''}, ''), divisi) WHERE id = ${ada.id}`;
    return { id: ada.id, nama: namaOther({ ...ada, ...o }) };
  }
  const r = await sql`INSERT INTO other_sales (nama, jenis, divisi, hp, ktp, npwp, project, created_by) VALUES (${o.nama}, ${o.jenis}, ${o.divisi || ''}, ${o.hp}, ${o.ktp || null}, ${o.npwp || null}, ${project}, ${oleh})
    RETURNING id`;
  return { id: r[0].id, nama: namaOther(o) };
}
export async function linkOther(sql) {
  await siapkanOther(sql);
  const out = [];
  for (const p of ['BIO DISTRICT', 'PERMAI INDAH']) {
    let l = (await sql`SELECT * FROM other_link WHERE project = ${p} AND aktif = true ORDER BY id DESC LIMIT 1`)[0];
    if (!l) l = (await sql`INSERT INTO other_link (project, token) VALUES (${p}, ${tokenOther(p)}) RETURNING *`)[0];
    out.push(l);
  }
  return out;
}

// Berkas konsumen (bukti transfer, KTP, NPWP) disimpan di database seperti berkas transaksi biasa
export async function simpanDokDb(sql, data) {
  if (!data) return null;
  if (data.length > 3_000_000) throw new Error('File terlalu besar');
  await siapkanOther(sql);
  const r = await sql`INSERT INTO other_dok (mime, data) VALUES ('image/jpeg', ${data}) RETURNING id`;
  return 'db:' + r[0].id;
}
// Semua unit project + statusnya (tanpa nama pembeli) untuk pilihan di link: merah = terjual, kuning = reserved
export async function unitDenganStatus(sql, project) {
  const { statusUnit } = await import('./stok');
  const { DEFAULT_UNITS } = await import('./db');
  const r = await sql`SELECT items FROM settings WHERE key = 'units'`.catch(() => []);
  const semua = (r[0]?.items?.[project]) || DEFAULT_UNITS[project] || [];
  const st = new Map((await statusUnit(sql)).filter(x => x.project === project).map(x => [x.unit, x.warna]));
  return semua.map(u => ({ u, st: st.get(u) || '' }));
}
// Unit yang masih tersedia (belum Reserved / Terjual) untuk pilihan di link
export async function unitTersedia(sql, project) {
  const { statusUnit } = await import('./stok');
  const { DEFAULT_UNITS } = await import('./db');
  const r = await sql`SELECT items FROM settings WHERE key = 'units'`.catch(() => []);
  const semua = (r[0]?.items?.[project]) || DEFAULT_UNITS[project] || [];
  const st = await statusUnit(sql);
  const terpakai = new Set(st.filter(x => x.project === project).map(x => x.unit));
  return semua.filter(u => !terpakai.has(u));
}
