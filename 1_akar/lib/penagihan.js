// Kebijakan penagihan (SOP Tim Collection, Bagian 1): denda keterlambatan dan jenjang
// Surat Peringatan. Pola jeda SP MENGIKUTI SOP, bukan dihitung dari jatuh tempo untuk
// ketiganya — hanya SP1 yang dihitung dari jatuh tempo (dan mensyaratkan follow up
// sudah tercatat); SP2 dihitung dari tanggal SP1 terbit, SP3 dari tanggal SP2 terbit.
//
//   SP1: jatuh tempo + sp1_hari (7)   — DAN follow up (telepon/WA) sudah dicatat
//   SP2: tgl SP1 terbit + sp2_hari (14)
//   SP3: tgl SP2 terbit + sp3_hari (21)
//
// Nilai di bawah ini = pola SOP, dapat diubah manajemen kapan saja lewat Settings.

export const SP_DEFAULT = { sp1_hari: 7, sp2_hari: 14, sp3_hari: 21, batas_bayar_hari: 7 };

export async function bacaSP(sql, project) {
  const r = await sql`SELECT items FROM settings WHERE key = 'sp'`;
  const semua = (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items)) ? r[0].items : {};
  const p = (project && semua[project]) || semua.default || {};
  return { ...SP_DEFAULT, ...p };
}

const keTanggalISO = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10));
function hariAntara(dariISO, keISO) {
  const a = new Date(keTanggalISO(dariISO) + 'T00:00:00Z'), b = new Date(keTanggalISO(keISO) + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

// titik = { jatuhTempoTertua, sp1Tgl, sp2Tgl, followUpAda } — semua tanggal 'YYYY-MM-DD' atau Date, boleh null.
// Tingkat SP berikutnya yang sudah layak terbit, atau null. Berjenjang: tidak boleh melompat.
export function spDisarankan(titik, spTerakhir, cfg, hariIni) {
  const berikut = Number(spTerakhir || 0) + 1;
  if (berikut > 3) return null;
  const h = hariIni || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  if (berikut === 1) {
    if (!titik.jatuhTempoTertua || !titik.followUpAda) return null;   // SOP: follow up wajib sebelum SP1
    return hariAntara(titik.jatuhTempoTertua, h) >= Number(cfg.sp1_hari) ? 1 : null;
  }
  const dasar = berikut === 2 ? titik.sp1Tgl : titik.sp2Tgl;
  if (!dasar) return null;
  return hariAntara(dasar, h) >= Number(cfg['sp' + berikut + '_hari']) ? berikut : null;
}

export const NAMA_SP = { 1: 'Surat Peringatan I', 2: 'Surat Peringatan II', 3: 'Surat Peringatan III' };
