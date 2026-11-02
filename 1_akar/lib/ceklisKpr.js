// Ceklis Dokumen KPR — mengikuti kolom & struktur ceklis eksternal Tim Collection (format Excel).
// Dua kelompok dokumen: Karyawan dan Wirausaha. Hasil proses TIDAK diketik manual, melainkan
// diturunkan dari tahap Proses KPR dan keputusan Bank yang sudah tercatat (satu sumber kebenaran).

export const DOKUMEN_KPR = {
  karyawan: [
    ['ktp', 'KTP'], ['ktp_pasangan', 'KTP Pasangan'], ['npwp', 'NPWP'], ['spt_pph21', 'SPT PPh 21'], ['kk', 'KK'],
    ['surat_nikah', 'Surat Nikah'], ['sk_domisili', 'SK Domisili'], ['pas_foto', 'Pas Foto'], ['bpjs', 'BPJS'],
    ['slip_gaji', 'Slip Gaji'], ['rek_koran', 'Rek. Koran'], ['skk', 'SKK'], ['sktb', 'SKTB'], ['skbm', 'SKBM'],
    ['form_flpp', 'Form FLPP'], ['skbmr', 'SKBMR'], ['form_kpr_bank', 'Form KPR Bank'], ['spbpms', 'SPBPMS'],
  ],
  wirausaha: [['skdu', 'SKDU'], ['sku', 'SKU'], ['foto_usaha', 'Foto Usaha']],
};
export const SEMUA_DOKUMEN = [...DOKUMEN_KPR.karyawan, ...DOKUMEN_KPR.wirausaha];
export const HASIL_BI = ['Lancar', 'Tidak Lancar', 'Proses'];
export const UPDATE_SERTIFIKAT = ['Tahap 1', 'Tahap 2', 'Tahap 3'];
export const HASIL_PROSES = ['Data belum lengkap', 'Proses', 'SP3K', 'Akad Kredit', 'Reject'];

// Hasil proses dari kondisi nyata: Reject > Akad Kredit > SP3K > Proses > Data belum lengkap
export function hasilProses({ status_kredit, akadSelesai, berkasSelesai }) {
  if (status_kredit === 'Ditolak') return 'Reject';
  if (akadSelesai) return 'Akad Kredit';
  if (status_kredit === 'Disetujui') return 'SP3K';
  if (berkasSelesai) return 'Proses';
  return 'Data belum lengkap';
}

export function jumlahDokumen(dokumen, jenisPemohon) {
  const d = dokumen && typeof dokumen === 'object' ? dokumen : {};
  const daftar = jenisPemohon === 'Wirausaha' ? [...DOKUMEN_KPR.karyawan, ...DOKUMEN_KPR.wirausaha] : DOKUMEN_KPR.karyawan;
  return { ada: daftar.filter(([k]) => d[k] === true).length, total: daftar.length };
}
