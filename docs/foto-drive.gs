/**
 * CRM CHL — penyimpan foto kunjungan di Google Drive.
 * Pasang SATU kali di masing-masing akun:
 *   Bio District  → marketing@biodistrictofficial.com
 *   Permai Indah  → permaiindahmkt@gmail.com
 * Isi KUNCI di bawah dengan kunci rahasia yang SAMA dengan GDRIVE_KUNCI di Vercel.
 */
const KUNCI = 'GANTI_DENGAN_KUNCI_RAHASIA';
const FOLDER_UTAMA = 'CRM CHL - Foto Kunjungan';

function folder_(nama) {
  const it = DriveApp.getFoldersByName(FOLDER_UTAMA);
  const utama = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_UTAMA);
  const bulan = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM');
  const sub = (nama || 'Kunjungan') + ' ' + bulan;
  const it2 = utama.getFoldersByName(sub);
  return it2.hasNext() ? it2.next() : utama.createFolder(sub);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Simpan foto: POST {kunci, aksi:'simpan', nama, mime, data(base64), folder}
function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.kunci !== KUNCI) return json_({ ok: false, error: 'kunci salah' });
    const blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mime || 'image/jpeg', (b.nama || 'foto') + '.jpg');
    const f = folder_(b.folder).createFile(blob);
    return json_({ ok: true, id: f.getId() });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}
// Ambil foto untuk ditampilkan di CRM: GET ?kunci=...&id=...
function doGet(e) {
  try {
    if ((e.parameter || {}).kunci !== KUNCI) return json_({ ok: false, error: 'kunci salah' });
    const f = DriveApp.getFileById(e.parameter.id);
    const blob = f.getBlob();
    return json_({ ok: true, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}
