// ===== Penanggung kinerja penjualan (dipakai Kinerja Sales & Report Lengkap) =====
// Menyatukan nama sales di data (impor buku penjualan, Report Detail, input CRM) ke akun CRM:
//  1. Nama lengkap sales in-house → akun:  Muhamad Subhi Djunari → Junari · Raeno Lingga Wisesa → Reno ·
//     Putri Rejeki Triwijayanti → Putri · Della Sasmita → Della · Richa Doremifa Meilody Rusdiatman → Icha
//  2. BIO DISTRICT: penjualan agent sejak 1 Februari 2025 = kinerja Esteem (koordinator agent),
//     KECUALI nama sales in-house (bertanda "/ Inhouse" di buku penjualan)
//  3. PERMAI INDAH: sales agent (nama + kantor, mis. "Meta Oktaria / Khanza Property") = kinerja LJH
// Data lead & transaksi TIDAK diubah — penyatuan hanya untuk perhitungan kinerja.
const bersih = s => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const kunci = s => bersih(s).replace(/\s/g, '').replace(/(.)\1+/g, '$1'); // "Della" = "Dela"
const ALIAS = { 'muhamad subhi djunari': 'junari', djunari: 'junari', 'raeno lingga wisesa': 'reno', raeno: 'reno',
  'putri rejeki triwijayanti': 'putri', 'della sasmita': 'della', 'richa doremifa meilody rusdiatman': 'icha', richa: 'icha' };
// Sales in-house Bio yang namanya tercatat dengan "/ Inhouse" di buku penjualan
const INHOUSE_BIO = ['ade gunawan lubis', 'kevin sean keefe louhenapessy', 'muhamad subhi djunari', 'putri rejeki triwijayanti', 'raeno lingga wisesa'];
// Agent Permai (nama + kantor di buku penjualan) — dipakai juga bila data CRM hanya menyimpan namanya tanpa kantor
const AGEN_PERMAI = ['abdurahman', 'ahmad huraefi', 'ainy d', 'anggreani anzany', 'atika purnamasari', 'chamnah diana rachmat', 'elisabeth maria ratuela',
  'fredy herlan saputra', 'haris fahmi st', 'ida sulastri', 'kristina hutapea', 'meta oktaria', 'michael', 'mochammad alfin', 'muhamad aldi',
  'muhammad fathoni alfiandri', 'muhammad jarkasih', 'nur polinisia', 'richela angriawan', 'riswanto', 'rustam simanulang', 'siska sugianti',
  'siti romlah', 'sri antarsih indriya', 'suharti'];
export const MULAI_ESTEEM_BIO = '2025-02-01';

export function penanggungKinerja({ project, sales, tgl }, akun = []) {
  const s = String(sales || '').trim();
  if (!s) return '';
  if (akun.includes(s)) return s;
  const cari = k => akun.find(a => kunci(a) === kunci(k)) || null;
  const dasar = bersih(s.split('/')[0]);
  const inhouse = /inhouse|in house/i.test(s);
  // 1) nama lengkap sales in-house → akun
  const al = ALIAS[dasar] || Object.entries(ALIAS).find(([k]) => dasar.includes(k))?.[1];
  if (al) return cari(al) || s;
  const sudahAkun = cari(dasar); if (sudahAkun) return sudahAkun;
  const pj = String(project || '').toUpperCase();
  // 2) Bio: agent sejak Feb 2025 → Esteem (bukan in-house)
  if (pj.includes('BIO') && String(tgl || '').slice(0, 10) >= MULAI_ESTEEM_BIO && !inhouse && !INHOUSE_BIO.includes(dasar)) return cari('esteem') || 'Esteem';
  // 3) Permai: agent (nama + kantor) → LJH
  if (pj.includes('PERMAI') && !inhouse && (s.includes('/') || AGEN_PERMAI.includes(dasar))) return cari('ljh') || 'LJH';
  return s;
}
