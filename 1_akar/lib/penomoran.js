// Penomoran dokumen legal sesuai PRD CHL Biodistrict (bagian 5.1).
// Format wajib sama dengan dokumen yang sudah beredar dari sistem lama.
// Urutan di-reset tiap tahun dan dinaikkan secara atomik — pengganti
// "select max()+1" yang rawan menghasilkan nomor ganda.

const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// {PERS} kode perusahaan · {BLN} bulan Romawi · {TH2} tahun 2 digit
// {TH4} tahun 4 digit · {NO5}/{NO3} nomor urut berangka nol di depan
export const JENIS_DOK = {
  RSV:  { nama: 'Reservasi',                 pola: '{PERS}/RSV/{BLN}/{TH2}/{NO5}' },
  SP:   { nama: 'Surat Pemesanan Unit',      pola: '{PERS}/SP/{BLN}/{TH2}/{NO5}' },
  P3U:  { nama: 'P3U / PPJB',                pola: '{PERS}/P3U/ADM-LGL/{BLN}/{TH2}/{NO5}' },
  TTS:  { nama: 'Tanda Terima Sementara',    pola: '{PERS}/TTS/{BLN}/{TH2}/{NO5}' },
  KW:   { nama: 'Kuitansi',                  pola: '{PERS}/KW/{BLN}/{TH2}/{NO5}' },
  KWD:  { nama: 'Kuitansi Denda',            pola: '{PERS}/KWD/{BLN}/{TH2}/{NO5}' },
  PD:   { nama: 'Pemutihan Denda',           pola: '{PERS}/PD/{BLN}/{TH2}/{NO5}' },
  // Surat Peringatan — kode SP1/SP2/SP3, sengaja dibedakan dari 'SP' (Surat Pemesanan Unit)
  SP1:  { nama: 'Surat Peringatan I',        pola: '{PERS}/SP1/{BLN}/{TH2}/{NO5}' },
  SP2:  { nama: 'Surat Peringatan II',       pola: '{PERS}/SP2/{BLN}/{TH2}/{NO5}' },
  SP3:  { nama: 'Surat Peringatan III',      pola: '{PERS}/SP3/{BLN}/{TH2}/{NO5}' },
  BAST: { nama: 'Berita Acara Serah Terima', pola: '{NO3}/BAST/SBL/{BLN}/{TH4}' },
  ADD:  { nama: 'Addendum PPJB',             pola: '{NO5}/ADM-PPJB/SBL/{BLN}/{TH4}' },
  // Kategori BAST lain: PRD hanya menyebut bahwa penomorannya berbeda (BAST-PP, PERJ-PP, BAST-STO),
  // tanpa format pasti. Sengaja dikosongkan (pola: null) sampai Legal menetapkannya di Settings;
  // selama kosong dokumen memakai nomor internal. 'fleksibel' = format boleh diatur di Settings.
  BAST_PP:  { nama: 'BAST Pinjam Pakai',              pola: null, fleksibel: true },
  PERJ_PP:  { nama: 'Perjanjian Pinjam Pakai',        pola: null, fleksibel: true },
  BAST_STO: { nama: 'BAST Serah Terima Otomatis',     pola: null, fleksibel: true },
  BAST_DTP: { nama: 'BAST PPN DTP',                   pola: null, fleksibel: true },
};

// Format nomor yang berlaku: bawaan kode, atau yang ditetapkan di Settings (hanya untuk jenis 'fleksibel')
export async function polaEfektif(sql, jenis) {
  const def = JENIS_DOK[jenis];
  if (!def) return null;
  if (!def.fleksibel) return def.pola;
  const r = await sql`SELECT items FROM settings WHERE key = 'penomoran_pola'`;
  const o = (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items)) ? r[0].items : {};
  return (o[jenis] && o[jenis].pola) || def.pola;
}

// Pola harus aman dipakai sebagai nomor dokumen legal: token dikenal, ada nomor urut DAN tahun
// (urutan di-reset tiap tahun — tanpa token tahun, nomor akan berulang), karakter sederhana saja.
export function validasiPola(pola) {
  const t = String(pola || '').trim();
  if (!t) return 'Format nomor kosong';
  if (t.length > 80) return 'Format nomor terlalu panjang (maks 80 karakter)';
  if (!/^[A-Za-z0-9/.\-_ {}]+$/.test(t)) return 'Format hanya boleh berisi huruf, angka, / . - _ dan token dalam { }';
  const token = t.match(/\{[^}]*\}/g) || [];
  const dikenal = ['{PERS}', '{BLN}', '{TH2}', '{TH4}', '{NO3}', '{NO5}'];
  const asing = token.filter(x => !dikenal.includes(x));
  if (asing.length) return 'Token tidak dikenal: ' + asing.join(', ') + ' (yang tersedia: ' + dikenal.join(' ') + ')';
  if (token.filter(x => x === '{NO3}' || x === '{NO5}').length !== 1) return 'Format harus memuat tepat satu nomor urut: {NO3} atau {NO5}';
  if (!token.some(x => x === '{TH2}' || x === '{TH4}')) return 'Format harus memuat tahun ({TH2} atau {TH4}) agar nomor tidak berulang tiap tahun';
  return null;
}

// Tanggal dokumen dihitung dalam zona Asia/Jakarta, bukan zona server (UTC).
// Tanpa ini, dokumen terbit pukul 00.00–06.59 WIB akan tercatat di bulan
// atau tahun sebelumnya.
export function tanggalJakarta(tgl) {
  const d = tgl ? new Date(tgl) : new Date();
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  return { tahun: wib.getUTCFullYear(), bulan: wib.getUTCMonth() + 1 };
}

export function formatNomor(pola, { pers, tahun, bulan, no }) {
  return pola
    .replace('{PERS}', pers)
    .replace('{BLN}', ROMAWI[bulan - 1])
    .replace('{TH2}', String(tahun).slice(-2))
    .replace('{TH4}', String(tahun))
    .replace('{NO5}', String(no).padStart(5, '0'))
    .replace('{NO3}', String(no).padStart(3, '0'));
}

async function pengaturan(sql, project) {
  if (!project) return null;
  const r = await sql`SELECT pers, penomoran_aktif FROM perusahaan WHERE project = ${project}`;
  return r[0] || null;
}

// Mengambil nomor berikutnya dan langsung memakainya. Mengembalikan null bila
// penomoran legal belum diaktifkan untuk project tersebut — pemanggil lalu
// memakai penomoran internal, supaya tidak terbit nomor yang sama dengan
// sistem lama selama masa peralihan.
export async function ambilNomor(sql, project, jenis, tgl) {
  const def = JENIS_DOK[jenis];
  if (!def) throw new Error('Jenis dokumen tidak dikenal: ' + jenis);
  const p = await pengaturan(sql, project);
  if (!p || !p.penomoran_aktif) return null;
  // Format belum ditetapkan (mis. kategori BAST baru): jangan menaikkan urutan — pemanggil memakai nomor internal
  const pola = await polaEfektif(sql, jenis);
  if (!pola) return null;
  const { tahun, bulan } = tanggalJakarta(tgl);
  const r = await sql`
    INSERT INTO document_sequences (project, jenis, tahun, last_no, updated_at)
    VALUES (${project}, ${jenis}, ${tahun}, 1, now())
    ON CONFLICT (project, jenis, tahun)
    DO UPDATE SET last_no = document_sequences.last_no + 1, updated_at = now()
    RETURNING last_no`;
  return formatNomor(pola, { pers: p.pers, tahun, bulan, no: r[0].last_no });
}

// Pratinjau nomor berikutnya tanpa memakainya
export async function pratinjauNomor(sql, project, jenis, tgl) {
  const def = JENIS_DOK[jenis];
  const p = await pengaturan(sql, project);
  if (!def || !p) return null;
  const pola = await polaEfektif(sql, jenis);
  if (!pola) return null;
  const { tahun, bulan } = tanggalJakarta(tgl);
  const r = await sql`SELECT last_no FROM document_sequences
    WHERE project = ${project} AND jenis = ${jenis} AND tahun = ${tahun}`;
  const no = (r.length ? r[0].last_no : 0) + 1;
  return formatNomor(pola, { pers: p.pers, tahun, bulan, no });
}

// Penomoran internal — dipakai selama penomoran legal belum aktif.
// Awalan 'HO' menandai dokumen dari Harmoni One agar tidak tertukar
// dengan dokumen resmi terbitan sistem lama.
export function nomorInternal(prefix, id, tgl) {
  const { tahun, bulan } = tanggalJakarta(tgl);
  return prefix + '/HO/' + tahun + '/' + String(bulan).padStart(2, '0') + '/' + String(id).padStart(4, '0');
}
