// Jenis khusus unit di Master Stock: 'show' = Show Unit, 'kavling' = Kavling (tanah tanpa bangunan).
// Bawaan di bawah langsung berlaku; perubahan manager disimpan di settings (key 'unit_jenis') dan menimpa bawaan.
export const LABEL_JENIS = { show: 'Show Unit', kavling: 'Kavling' };
export const JENIS_BAWAAN = {
  'BIO DISTRICT': {
    'Bio Blv no.17': 'show', 'Bio Ave 5 no.16': 'show',
    'Bio Ave 5 no.02': 'kavling', 'Bio Ave 3 no.20': 'kavling', 'Bio Ave 5 no.12': 'kavling',
    'Bio Ave 6 no.02': 'kavling', 'Bio Ave 7 no.02': 'kavling', 'Bio Ave 7 no.03': 'kavling',
  },
};
// Samakan penulisan nama unit ("Bio Ave 5 no.2" = "Bio Ave 5 no.02")
export const kunciUnit = u => String(u || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(t => /^\d+$/.test(t) ? String(Number(t)) : t).join(' ');
// Gabung bawaan + simpanan -> { project: { kunciUnit: 'show' | 'kavling' } } ('' / null di simpanan = tanda dilepas)
export function gabungJenis(simpanan) {
  const out = {};
  for (const src of [JENIS_BAWAAN, simpanan || {}]) {
    for (const [p, daftar] of Object.entries(src || {})) {
      out[p] = out[p] || {};
      for (const [u, j] of Object.entries(daftar || {})) { const k = kunciUnit(u); if (LABEL_JENIS[j]) out[p][k] = j; else delete out[p][k]; }
    }
  }
  return out;
}
// Posisi bawaan titik di siteplan (persen lebar / tinggi gambar) untuk unit bertanda bawaan — dipakai selama
// manager belum menempel / memindahkan titiknya sendiri di Master Stock
export const POSISI_BAWAAN = {
  'BIO DISTRICT': {
    'Bio Blv no.17': [60.3, 32.2], 'Bio Ave 5 no.16': [57.6, 24.0],
    'Bio Ave 5 no.02': [54.25, 34.0], 'Bio Ave 5 no.12': [53.25, 24.0], 'Bio Ave 3 no.20': [53.9, 37.6],
    'Bio Ave 6 no.02': [58.4, 16.8], 'Bio Ave 7 no.02': [69.5, 11.7], 'Bio Ave 7 no.03': [68.6, 14.8],
  },
};
// Kavling yang warna dasarnya sudah diputihkan langsung di gambar siteplan (public/siteplan-bio.jpg) —
// tidak perlu tanda tambahan selama belum terjual / reserved
export const KAVLING_DI_GAMBAR = {
  'BIO DISTRICT': ['Bio Ave 5 no.02', 'Bio Ave 3 no.20', 'Bio Ave 5 no.12', 'Bio Ave 6 no.02', 'Bio Ave 7 no.02', 'Bio Ave 7 no.03'],
};
// Hold oleh manajemen: unit ditahan (belum dilepas untuk dijual). Bawaan = semua unit Kavling & Show Unit di atas;
// perubahan manager disimpan di settings (key 'unit_hold') -> { project: { unit: true | false } }.
// Hold hanya tampil selama unit belum Terjual / Reserved (status jual selalu menang).
export function gabungHold(simpanan) {
  const out = {};
  for (const [p, daftar] of Object.entries(JENIS_BAWAAN)) { out[p] = {}; for (const u of Object.keys(daftar)) out[p][kunciUnit(u)] = true; }
  for (const [p, daftar] of Object.entries(simpanan || {})) {
    out[p] = out[p] || {};
    for (const [u, v] of Object.entries(daftar || {})) { if (v) out[p][kunciUnit(u)] = true; else delete out[p][kunciUnit(u)]; }
  }
  return out;
}
