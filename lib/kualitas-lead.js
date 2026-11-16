// ===== Label kualitas lead (tanpa AI) — dari isian Marcom / sales =====
// 🔥 Siap oper : nama jelas + minimal 2 data penyaring (rencana beli ≤ 6 bulan, cara bayar, budget, domisili, tipe) dan rencana beli tidak > 6 bulan
// 🟡 Perlu dilengkapi / nurture : sudah ada sebagian data, atau rencana beli masih > 6 bulan
// ⚪ Belum ada data : belum ada nama jelas maupun data apa pun
export const RENCANA_BELI = ['≤ 3 bulan', '3–6 bulan', '> 6 bulan', 'Belum tahu'];

export function namaJelas(n) {
  const s = String(n || '').trim();
  if (!s || /^WA\s/i.test(s)) return false;
  return (s.match(/\p{L}/gu) || []).length >= 2;
}

export function kualitasLead(l = {}) {
  const ada = [], kurang = [];
  const nama = namaJelas(l.nama);
  if (!nama) kurang.push('nama');
  const rb = l.rencana_beli || '';
  if (rb === '≤ 3 bulan' || rb === '3–6 bulan') ada.push('rencana beli'); else if (!rb || rb === 'Belum tahu') kurang.push('rencana beli');
  if (l.bayar) ada.push('cara bayar'); else kurang.push('cara bayar');
  if (Number(l.budget) > 0) ada.push('budget'); else kurang.push('budget');
  if (l.domisili) ada.push('domisili'); else kurang.push('domisili');
  if (l.tipe) ada.push('tipe'); else kurang.push('tipe');
  const jauh = rb === '> 6 bulan';
  const label = nama && ada.length >= 2 && !jauh ? 'siap' : (nama || ada.length || rb) ? 'nurture' : 'kosong';
  return {
    label, ada, kurang,
    ikon: { siap: '🔥', nurture: '🟡', kosong: '⚪' }[label],
    teks: label === 'siap' ? 'Siap oper' : label === 'kosong' ? 'Belum ada data' : jauh ? 'Nurture · beli > 6 bln' : 'Perlu dilengkapi',
  };
}
