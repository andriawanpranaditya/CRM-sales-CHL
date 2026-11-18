// Perubahan data lead oleh sales → menunggu persetujuan Manager
import { bersihKontak } from './kontak';
let siap = false;
export async function siapkanLeadUbah(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS lead_ubah (id serial PRIMARY KEY, lead_code text NOT NULL, lead_id int, perubahan jsonb NOT NULL,
    diajukan_oleh text, nama_pengaju text, status text NOT NULL DEFAULT 'Menunggu', alasan text, dicek_oleh text, dicek_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now())`;
  siap = true;
}
// Field identitas & profil yang dijaga (status, next_fu, catatan tetap langsung)
export const FIELD_DIJAGA = ['tgl', 'nama', 'wa', 'email', 'domisili', 'kerja', 'sumber', 'walkin_info', 'sumber_detail', 'project', 'tipe', 'tujuan', 'budget', 'bayar', 'usia', 'gender', 'campaign', 'konten'];
// Hanya field KRUSIAL yang butuh persetujuan Manager saat diubah sales: identitas & kontak lead, tanggal masuk,
// asal lead (penentu kepemilikan & hitungan Marcom vs lead cari sendiri), dan project. Kontak tambahan ikut dijaga (di route leads).
// Field profil lainnya (email, domisili, pekerjaan, tipe, tujuan, budget, cara bayar, usia, jenis kelamin, campaign, konten)
// langsung tersimpan dan tetap tercatat di Log Aktivitas. FIELD_DIJAGA tetap daftar lengkap agar ajuan lama masih bisa diterapkan.
export const FIELD_SETUJU = ['nama', 'wa', 'tgl', 'sumber', 'walkin_info', 'sumber_detail', 'project'];
export const LABEL_FIELD = { tgl: 'Tanggal lead', nama: 'Nama', wa: 'WhatsApp', email: 'Email', domisili: 'Domisili', kerja: 'Pekerjaan', sumber: 'Sumber', walkin_info: 'Info walk in',
  sumber_detail: 'Detail sumber', project: 'Project', tipe: 'Tipe', tujuan: 'Tujuan', budget: 'Budget', bayar: 'Cara bayar', usia: 'Usia', gender: 'Jenis kelamin', campaign: 'Campaign', konten: 'Konten', kontak: 'Kontak tambahan' };
const teks = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
export const samaNilai = (k, a, c) => k === 'budget' ? Number(a || 0) === Number(c || 0)
  : k === 'tgl' ? teks(a).slice(0, 10) === teks(c).slice(0, 10) : String(a ?? '').trim() === String(c ?? '').trim();

export async function terapkanUbah(sql, aj) {
  const lead = (await sql`SELECT * FROM leads WHERE lead_code = ${aj.lead_code}`)[0];
  if (!lead) throw new Error('Lead ' + aj.lead_code + ' sudah tidak ada');
  for (const u of aj.perubahan || []) {
    if (u.field === 'kontak') { await sql`UPDATE leads SET kontak = ${JSON.stringify(bersihKontak(u.baru, lead.wa))}::jsonb WHERE id = ${lead.id}`; continue; }
    if (!FIELD_DIJAGA.includes(u.field)) continue;
    const v = u.field === 'budget' ? (Number(u.baru) || 0) : u.field === 'tgl' ? (u.baru || null) : String(u.baru ?? '');
    await sql(`UPDATE leads SET "${u.field}" = $1, updated_at = now() WHERE id = $2`, [v, lead.id]);
  }
}
