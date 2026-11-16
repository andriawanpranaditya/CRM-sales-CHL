// ===== Label kualitas lead (tanpa AI) — dari isian Marcom / sales =====
// 🔥 Siap oper : memenuhi kriteria yang diatur Manager (Tim Sales → Distribusi Lead → Kriteria 🔥 Siap oper)
// 🟡 Perlu dilengkapi / nurture : sudah ada sebagian data, rencana beli masih > 6 bulan, atau budget di bawah minimum
// ⚪ Belum ada data : belum ada nama jelas maupun data apa pun
export const RENCANA_BELI = ['≤ 3 bulan', '3–6 bulan', '> 6 bulan', 'Belum tahu'];
export const DATA_PENYARING = [['rencana', 'Rencana beli ≤ 6 bulan'], ['bayar', 'Cara bayar'], ['budget', 'Budget'], ['domisili', 'Domisili'], ['tipe', 'Tipe / unit']];
const NAMA_KURANG = { rencana: 'rencana beli', bayar: 'cara bayar', budget: 'budget', domisili: 'domisili', tipe: 'tipe' };
export const KRITERIA_DEFAULT = { nama_wajib: true, data: ['rencana', 'bayar', 'budget', 'domisili', 'tipe'], minimal: 2, jauh_nurture: true, budget_min: {} };

export function rapikanKriteria(k) {
  const x = { ...KRITERIA_DEFAULT, ...(k && typeof k === 'object' ? k : {}) };
  const sah = DATA_PENYARING.map(d => d[0]);
  x.data = Array.isArray(x.data) ? [...new Set(x.data.filter(d => sah.includes(d)))] : KRITERIA_DEFAULT.data;
  x.minimal = Math.max(0, Math.min(x.data.length, Math.round(Number(x.minimal)) || 0));
  x.nama_wajib = x.nama_wajib !== false;
  x.jauh_nurture = x.jauh_nurture !== false;
  const bm = {};
  Object.entries(x.budget_min && typeof x.budget_min === 'object' ? x.budget_min : {}).forEach(([p, v]) => { const n = Math.max(0, Math.round(Number(v) || 0)); if (n) bm[String(p).slice(0, 60)] = n; });
  x.budget_min = bm;
  return x;
}

const rpRingkas = n => n >= 1e9 ? 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M' : 'Rp' + Math.round(n / 1e6).toLocaleString('id-ID') + ' jt';

// Kalimat aturan untuk ditampilkan ke Marcom
export function teksKriteria(kriteria) {
  const K = rapikanKriteria(kriteria);
  const daftar = K.data.map(d => (DATA_PENYARING.find(x => x[0] === d) || [])[1]?.toLowerCase()).filter(Boolean);
  const bagian = [K.nama_wajib ? 'nama jelas' : '', K.minimal && daftar.length ? `minimal ${K.minimal} dari ${daftar.join(', ')}` : ''].filter(Boolean);
  const bm = Object.entries(K.budget_min).map(([p, v]) => `${String(p).split(' ')[0]} ≥ ${rpRingkas(v)}`);
  return (bagian.join(' + ') || 'semua lead') + (K.jauh_nurture ? '; rencana beli > 6 bulan = nurture' : '') + (bm.length ? `; budget minimal ${bm.join(', ')}` : '');
}

export function namaJelas(n) {
  const s = String(n || '').trim();
  if (!s || /^WA\s/i.test(s)) return false;
  return (s.match(/\p{L}/gu) || []).length >= 2;
}

export function kualitasLead(l = {}, kriteria) {
  const K = rapikanKriteria(kriteria);
  const nama = namaJelas(l.nama);
  const rb = l.rencana_beli || '';
  const jauh = rb === '> 6 bulan';
  const minB = Number(K.budget_min[l.project] || 0);
  const budgetRendah = minB > 0 && Number(l.budget) > 0 && Number(l.budget) < minB;
  const cek = { rencana: rb === '≤ 3 bulan' || rb === '3–6 bulan' || (jauh && !K.jauh_nurture), bayar: !!l.bayar, budget: Number(l.budget) > 0 && !budgetRendah, domisili: !!l.domisili, tipe: !!l.tipe };
  const ada = K.data.filter(d => cek[d]);
  const kurang = [...(K.nama_wajib && !nama ? ['nama'] : []), ...K.data.filter(d => !cek[d]).map(d => d === 'budget' && budgetRendah ? `budget min. ${rpRingkas(minB)}` : NAMA_KURANG[d])];
  if (budgetRendah && !K.data.includes('budget')) kurang.push(`budget min. ${rpRingkas(minB)}`);
  const siap = (!K.nama_wajib || nama) && ada.length >= K.minimal && !(K.nama_wajib === false && K.minimal === 0 && !nama && !ada.length)
    && !(jauh && K.jauh_nurture) && !budgetRendah;
  const adaApaPun = nama || rb || l.bayar || Number(l.budget) > 0 || l.domisili || l.tipe;
  const label = siap ? 'siap' : adaApaPun ? 'nurture' : 'kosong';
  return {
    label, ada, kurang,
    ikon: { siap: '🔥', nurture: '🟡', kosong: '⚪' }[label],
    teks: label === 'siap' ? 'Siap oper' : label === 'kosong' ? 'Belum ada data' : jauh && K.jauh_nurture ? 'Nurture · beli > 6 bln' : budgetRendah ? 'Budget di bawah minimum' : 'Perlu dilengkapi',
  };
}
