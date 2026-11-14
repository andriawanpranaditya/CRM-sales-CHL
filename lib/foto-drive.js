// Foto kunjungan disimpan di Google Drive milik akun marketing tiap project (lewat Google Apps Script),
// bukan di database — database hanya menyimpan ID foto. Lihat docs/PANDUAN-FOTO-DRIVE.md.
const URL_PROJECT = {
  'BIO DISTRICT': () => process.env.GDRIVE_BIO_URL,        // marketing@biodistrictofficial.com
  'PERMAI INDAH': () => process.env.GDRIVE_PERMAI_URL,     // permaiindahmkt@gmail.com
};
export const driveSiap = project => !!(URL_PROJECT[project]?.() && process.env.GDRIVE_KUNCI);

// data = base64 JPEG (tanpa prefix data:), sudah dikecilkan di HP. Mengembalikan "drive:<project>:<fileId>"
export async function simpanFoto(project, { nama, data, mime = 'image/jpeg', folder = 'Kunjungan' }) {
  const url = URL_PROJECT[project]?.();
  if (!url || !process.env.GDRIVE_KUNCI) throw new Error('Penyimpanan foto Google Drive belum dipasang untuk ' + project);
  if (!data || data.length > 3_000_000) throw new Error('Foto kosong atau terlalu besar');
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
    body: JSON.stringify({ kunci: process.env.GDRIVE_KUNCI, aksi: 'simpan', nama, mime, data, folder }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok || !j.id) throw new Error('Gagal menyimpan foto ke Google Drive' + (j.error ? ': ' + j.error : ''));
  return `drive:${project}:${j.id}`;
}
export async function ambilFoto(ref) {
  const m = /^drive:([^:]+):(.+)$/.exec(String(ref || ''));
  if (!m) return null;
  const url = URL_PROJECT[m[1]]?.();
  if (!url) return null;
  const r = await fetch(`${url}?kunci=${encodeURIComponent(process.env.GDRIVE_KUNCI || '')}&id=${encodeURIComponent(m[2])}`, { redirect: 'follow' });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) return null;
  return { mime: j.mime || 'image/jpeg', data: Buffer.from(j.data, 'base64') };
}
