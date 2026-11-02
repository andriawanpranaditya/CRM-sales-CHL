// Denda keterlambatan (PRD CHL Biodistrict, catatan 5 pada price list):
// "Keterlambatan pembayaran akan dikenakan perhitungan denda ... 1‰ (per mill) per hari."
// Tarif disimpan di settings (per project, dengan fallback default) — bukan
// ditanam permanen di kode, agar bisa disesuaikan bila manajemen mengubah kebijakan.

export const DENDA_DEFAULT = { persen_per_hari: 0.1 };   // 0,1% = 1 permil, sesuai price list

export async function bacaDenda(sql, project) {
  const r = await sql`SELECT items FROM settings WHERE key = 'denda'`;
  const semua = (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items)) ? r[0].items : {};
  const p = (project && semua[project]) || semua.default || {};
  return { ...DENDA_DEFAULT, ...p };
}

// Hari keterlambatan dihitung dari jatuh tempo sampai tanggal acuan (default hari ini, WIB).
// Menerima jatuhTempo/acuan sebagai teks 'YYYY-MM-DD' ATAU objek Date (driver Postgres
// mengembalikan kolom date sebagai Date, bukan teks) — keduanya diseragamkan dulu.
const keTanggalISO = v => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
export function hariTelat(jatuhTempo, acuan) {
  const j = new Date(keTanggalISO(jatuhTempo) + 'T00:00:00Z');
  const a = acuan ? new Date(keTanggalISO(acuan) + 'T00:00:00Z') : new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + 'T00:00:00Z');
  return Math.max(0, Math.round((a - j) / 86400000));
}

// Nilai denda atas satu baris tagihan yang menunggak: sisa (nilai - dibayar) × tarif/hari × hari telat
export function hitungDenda(sisaTertunggak, hari, tarif) {
  const sisa = Math.max(0, Math.round(Number(sisaTertunggak) || 0));
  const h = Math.max(0, Math.round(Number(hari) || 0));
  const persen = Math.max(0, Number((tarif || DENDA_DEFAULT).persen_per_hari));
  return Math.round(sisa * (persen / 100) * h);
}
