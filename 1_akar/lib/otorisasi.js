import { createHash, createHmac, timingSafeEqual } from 'crypto';

// ============================================================================
// MESIN OTORISASI — persetujuan berjenjang yang MENAHAN tindakan.
// Empat lapis pengaman agar otorisasi tidak dapat dipalsukan:
//   1. PIN pribadi      — membuktikan orangnya sendiri yang menekan
//   2. Kode otorisasi   — dihitung dari isi keputusan, tidak dapat dibuat ulang
//   3. Rantai jejak     — tiap catatan mengunci catatan sebelumnya
//   4. Halaman periksa  — kode pada dokumen dapat dicocokkan kapan saja
// ============================================================================

// Jabatan yang berwenang mengotorisasi
export const JABATAN_OTORISASI = {
  kadiv: 'Kepala Divisi',
  pceo: 'Project CEO',
  cfo: 'CFO',
  ceo: 'CEO',
};

// Tindakan yang ditahan sampai diotorisasi. Dapat diubah lewat menu Settings
// tanpa menyentuh kode — kunci settings: 'otorisasi'.
export const TINDAKAN_DEFAULT = {
  clear_serah:     { nama: 'Terbitkan status Clear untuk Serah Terima', oleh: 'kadiv', divisi: 'Finance', aktif: true },
  bast:            { nama: 'Catat serah terima unit (BAST)', oleh: 'kadiv', divisi: 'Project', aktif: true },
  komisi_ajukan:   { nama: 'Pengajuan komisi Sales', oleh: 'kadiv', divisi: 'Sales & Marketing', aktif: true },
  batal_transaksi: { nama: 'Pembatalan transaksi', oleh: 'pceo', divisi: '', aktif: true },
  ubah_harga:      { nama: 'Ubah nilai transaksi setelah PPJB terbit', oleh: 'pceo', divisi: '', aktif: true },
  // Perubahan kontrak berjadwal (Fase 5): mengubah pemilik / unit / nilai kontrak yang sudah terbit
  pengalihan_hak:  { nama: 'Pengalihan hak atas kontrak (ganti pemilik)', oleh: 'pceo', divisi: '', aktif: true },
  pindah_unit:     { nama: 'Pindah unit atas kontrak', oleh: 'pceo', divisi: '', aktif: true },
  ubah_nilai_kontrak: { nama: 'Ubah nilai kontrak (adjustment jadwal tagihan)', oleh: 'pceo', divisi: '', aktif: true },
  // Pembatalan kontrak berjadwal beserta perhitungan pengembalian dana
  batal_kontrak: { nama: 'Pembatalan kontrak berjadwal (beserta pengembalian dana)', oleh: 'pceo', divisi: '', aktif: true },
  // Jadwal ulang atas kontrak yang sudah memiliki catatan denda: butuh persetujuan tambahan,
  // di luar persetujuan perubahan itu sendiri. Jenjang awal CFO — dapat diubah di Settings.
  jadwal_ulang_berdenda: { nama: 'Jadwal ulang kontrak yang memiliki catatan denda', oleh: 'cfo', divisi: '', aktif: true },
  // Reservasi lewat batas 1 minggu: melanjutkan ke Booking, mereservasi ulang, atau memperpanjang
  reservasi_lewat_batas: { nama: 'Lanjutkan / perpanjang reservasi yang melewati batas waktu', oleh: 'kadiv', divisi: 'Sales & Marketing', aktif: true },
  // Pengecualian: serah terima sebelum akad kredit selesai atau sebelum lunas 100%.
  // Menyimpang dari Kebijakan & Prosedur Penjualan, sehingga wewenangnya berada
  // pada tingkat direksi — Project CEO, CFO, atau CEO.
  bast_dispensasi: { nama: 'Serah terima unit sebelum akad / pelunasan (dispensasi)',
                     oleh: 'pceo', divisi: '', aktif: true, alternatif: ['cfo', 'ceo'] },
};

const RAHASIA = () => process.env.SETUP_KEY || 'harmoni-one';

// --- Lapis 2: kode otorisasi, dihitung dari isi keputusan itu sendiri ---
export function kodeOtorisasi(isi) {
  const bahan = [isi.jenis, isi.objek, isi.objek_id, isi.jabatan, isi.user_id, isi.waktu, isi.keputusan].join('|');
  const h = createHmac('sha256', RAHASIA()).update(bahan).digest('hex').toUpperCase();
  return h.slice(0, 4) + '-' + h.slice(4, 8);
}

// --- Lapis 3: rantai jejak. Tiap catatan mengunci sidik catatan sebelumnya ---
export function sidikRantai(sebelumnya, isi) {
  const bahan = [sebelumnya || 'AWAL', isi.jenis, isi.objek, isi.objek_id,
    isi.jabatan, isi.user_id, isi.waktu, isi.keputusan, isi.kode].join('|');
  return createHash('sha256').update(bahan).digest('hex');
}

// Bandingkan dua kode tanpa membocorkan waktu pembandingan
export function kodeSama(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

// Tindakan yang dulu ditahan otorisasi lalu dihapus dari kebijakan. Tetap disebut di sini agar
// setelan lama yang tersimpan di database tidak menghidupkannya kembali.
export const TINDAKAN_DIHAPUS = ['verifikasi_sp'];   // verifikasi SP & PPJB oleh Kepala Divisi — dihapus

// Ambil daftar tindakan yang berlaku (dari settings bila ada)
export async function daftarTindakan(sql) {
  const r = await sql`SELECT items FROM settings WHERE key = 'otorisasi'`;
  const dasar = (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items))
    ? { ...TINDAKAN_DEFAULT, ...r[0].items } : TINDAKAN_DEFAULT;
  const hasil = {};
  for (const [k, v] of Object.entries(dasar)) {
    if (TINDAKAN_DIHAPUS.includes(k)) continue;   // tindakan yang sudah tidak ditahan, walau masih ada di setelan lama
    hasil[k] = { ...v, oleh_label: JABATAN_OTORISASI[v.oleh] || v.oleh };
  }
  return hasil;
}

// Siapa yang berhak mengotorisasi satu tindakan — termasuk pengganti yang
// sedang menjabat karena delegasi aktif.
export async function penyetujuSah(sql, jabatan, divisi, alternatif) {
  // Sebagian tindakan boleh diotorisasi oleh beberapa jabatan setingkat,
  // mis. dispensasi serah terima: Project CEO, CFO, atau CEO.
  const jabatanSah = [jabatan, ...(alternatif || [])];
  const asli = divisi
    ? await sql`SELECT id, name, kode_petugas, jabatan, divisi FROM users
        WHERE jabatan = ANY(${jabatanSah}) AND divisi = ${divisi} AND active = true`
    : await sql`SELECT id, name, kode_petugas, jabatan, divisi FROM users
        WHERE jabatan = ANY(${jabatanSah}) AND active = true`;

  // Dua kueri terpisah (bukan fragmen sql`` bersarang): driver Neon menyusun kueri hanya dari
  // teks + parameter $n dan tidak mendukung komposisi bersarang.
  const ganti = divisi
    ? await sql`SELECT d.pengganti_id AS id, u.name, u.kode_petugas,
        d.jabatan, d.divisi, d.id AS delegasi_id, d.pemberi_id,
        p.name AS pemberi_nama, p.kode_petugas AS pemberi_kode,
        d.mulai::text AS mulai, d.selesai::text AS selesai
      FROM delegasi d
      JOIN users u ON u.id = d.pengganti_id
      JOIN users p ON p.id = d.pemberi_id
      WHERE d.jabatan = ${jabatan} AND d.aktif = true
        AND CURRENT_DATE BETWEEN d.mulai AND d.selesai
        AND d.divisi = ${divisi}`
    : await sql`SELECT d.pengganti_id AS id, u.name, u.kode_petugas,
        d.jabatan, d.divisi, d.id AS delegasi_id, d.pemberi_id,
        p.name AS pemberi_nama, p.kode_petugas AS pemberi_kode,
        d.mulai::text AS mulai, d.selesai::text AS selesai
      FROM delegasi d
      JOIN users u ON u.id = d.pengganti_id
      JOIN users p ON p.id = d.pemberi_id
      WHERE d.jabatan = ${jabatan} AND d.aktif = true
        AND CURRENT_DATE BETWEEN d.mulai AND d.selesai`;

  return { asli, ganti };
}
