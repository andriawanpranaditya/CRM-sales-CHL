// ===== Project campaign dari platform iklan (Meta, Google) = project pemilik akun iklannya =====
// Urutan: (1) peta eksplisit idAkun→project; (2) nama akun iklan cocok dengan nama project di Settings
// (mis. akun "Permai Indah" → PERMAI INDAH); (3) awalan nama campaign (bio_ / permai_); (4) project cadangan
export const rapat = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function tentukanProject(akunId, namaAkun, namaCampaign, daftarProject, peta, cadangan) {
  if (peta[akunId]) return peta[akunId];
  const na = rapat(namaAkun);
  if (na) {
    const cocok = daftarProject.find(p => rapat(p) && (na.includes(rapat(p)) || rapat(p).includes(na)))
      || daftarProject.find(p => { const w = rapat(String(p).split(/\s+/)[0]); return w.length >= 3 && na.includes(w); });
    if (cocok) return cocok;
  }
  const awal = rapat(String(namaCampaign || '').split(/[_\s-]/)[0]);
  if (awal.length >= 3) {
    const cocok = daftarProject.find(p => rapat(String(p).split(/\s+/)[0]) === awal || rapat(p).startsWith(awal));
    if (cocok) return cocok;
  }
  return cadangan;
}

