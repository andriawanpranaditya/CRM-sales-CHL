// Templat redaksi dokumen serah terima. Isinya TIDAK ditulis di kode: teks hukum ditetapkan Legal
// lewat Settings → Templat Dokumen BAST. Selama kosong, hasil cetak diberi tanda DRAFT.

export const DOK_BAST = {
  bast:                    'Berita Acara Serah Terima (BAST)',
  pinjam_pakai:            'BAST Pinjam Pakai',
  sto:                     'BAST Serah Terima Otomatis',
  ppn_dtp:                 'BAST PPN DTP',
  perjanjian_pinjam_pakai: 'Perjanjian Pinjam Pakai',
  undangan:                'Undangan Serah Terima',
  surat_kuasa:             'Surat Kuasa Serah Terima',
};

// Kategori BAST: kunci -> { nama, jenis nomor, awalan nomor internal, kunci templat }
export const KATEGORI_BAST = {
  bast:         { nama: 'BAST',                       jenis: 'BAST',     internal: 'BAST',     dok: 'bast' },
  pinjam_pakai: { nama: 'BAST Pinjam Pakai',          jenis: 'BAST_PP',  internal: 'BAST-PP',  dok: 'pinjam_pakai' },
  sto:          { nama: 'BAST Serah Terima Otomatis', jenis: 'BAST_STO', internal: 'BAST-STO', dok: 'sto' },
  ppn_dtp:      { nama: 'BAST PPN DTP',               jenis: 'BAST_DTP', internal: 'BAST-DTP', dok: 'ppn_dtp' },
};

// Isian otomatis yang boleh dipakai dalam redaksi, ditulis {nama_isian}
export const TOKEN_TEMPLAT = {
  nama: 'Nama konsumen (sesuai KTP)', alamat: 'Alamat konsumen', ktp: 'No. KTP / NIK', npwp: 'No. NPWP',
  perusahaan: 'Nama perusahaan pengembang', project: 'Nama project', unit: 'Blok / nomor unit',
  no_sp: 'No. Surat Pemesanan', no_ppjb: 'No. P3U / PPJB', no_bast: 'No. dokumen ini (BAST)', no_perjanjian: 'No. Perjanjian Pinjam Pakai',
  tgl_serah_terima: 'Tanggal serah terima', tgl_cetak: 'Tanggal cetak', nilai_kontrak: 'Nilai kontrak (Rp)',
};

export function tokenAsing(isi) {
  const ada = (String(isi || '').match(/\{[^{}\s]*\}/g) || []).map(x => x.slice(1, -1));
  return [...new Set(ada.filter(x => !(x in TOKEN_TEMPLAT)))];
}

export function isiTemplat(isi, data) {
  return String(isi || '').replace(/\{([^{}\s]*)\}/g, (m, k) => (k in TOKEN_TEMPLAT ? String(data[k] ?? '') : m));
}

export async function bacaTemplat(sql) {
  const r = await sql`SELECT items FROM settings WHERE key = 'templat_dokumen'`;
  return (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items)) ? r[0].items : {};
}
