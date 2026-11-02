// Reservasi berkedaluwarsa: masa berlaku bawaan 1 minggu. Reservasi yang melewati batas
// melepas unit ke penjualan lain; melanjutkan atau memperpanjangnya butuh otorisasi
// Manager Sales (tindakan 'reservasi_lewat_batas'). Kedaluwarsa dihitung dari tanggal
// batas — tanpa pekerjaan terjadwal — sehingga selalu konsisten di semua layar.
// Reservasi lama (tanpa tanggal batas) sengaja tidak pernah kedaluwarsa otomatis.

export const RESERVASI_DEFAULT = { masa_hari: 7 };

export async function bacaReservasi(sql) {
  const r = await sql`SELECT items FROM settings WHERE key = 'reservasi'`;
  const p = (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items)) ? r[0].items : {};
  return { ...RESERVASI_DEFAULT, ...p };
}

export const hariIniWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

export function tambahHariISO(tgl, n) {
  return new Date(new Date(String(tgl).slice(0, 10) + 'T00:00:00Z').getTime() + Number(n) * 86400000).toISOString().slice(0, 10);
}

// tglExpire harus teks 'YYYY-MM-DD' (pakai tgl_expire::text pada SQL)
export function reservasiLewat(tglExpire, hariIni) {
  return Boolean(tglExpire) && String(tglExpire).slice(0, 10) < (hariIni || hariIniWIB());
}
