// Kontak tambahan lead: satu lead bisa punya beberapa nomor / nama (mis. suami-istri, nomor kedua).
// Disimpan di leads.kontak (jsonb): [{ nama, hubungan, wa, ket }]. Follow up mencatat kontak yang dihubungi (followups.kontak).
let siap = false;
export async function siapkanKontak(sql) {
  if (siap) return;
  try {
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS kontak jsonb DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE followups ADD COLUMN IF NOT EXISTS kontak text`;
    siap = true;
  } catch (e) { console.error('siapkanKontak', e); }
}
export const HUBUNGAN = ['Pasangan', 'Nomor kedua', 'Keluarga', 'Kantor', 'Lainnya'];
// 08xx / +62 / 62 / 8xx dianggap sama → 62xxxxxxxx
export function normWA(x) {
  let d = String(x || '').replace(/[^0-9]/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1); else if (d.startsWith('8')) d = '62' + d;
  return d.length >= 9 ? d : '';
}
export function bersihKontak(arr, waUtama = '') {
  const utama = normWA(waUtama), lihat = new Set(utama ? [utama] : []);
  return (Array.isArray(arr) ? arr : []).slice(0, 10).map(k => ({
    nama: String(k?.nama || '').trim().slice(0, 80), hubungan: String(k?.hubungan || '').trim().slice(0, 30),
    wa: String(k?.wa || '').trim().slice(0, 30), ket: String(k?.ket || '').trim().slice(0, 120),
  })).filter(k => {
    if (!k.nama && !k.wa) return false;
    const n = normWA(k.wa);
    if (n) { if (lihat.has(n)) return false; lihat.add(n); }
    return true;
  });
}
