// Aturan anti-duplikat konsumen sesuai PRD CHL Biodistrict (bagian 5.3):
// cek data yang sudah ada lebih dulu, dan pakai ulang — bukan membuat baru.
// Urutan kunci pencocokan: (a) NIK, (b) NPWP, (c) email DAN nomor HP.

export const hanyaAngka = v => String(v || '').replace(/\D/g, '');

// 08xx, +628xx, 628xx dianggap nomor yang sama
export function normHP(v) {
  let n = hanyaAngka(v);
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  return n;
}

export function cekFormatNIK(nik) {
  const n = hanyaAngka(nik);
  if (!n) return 'NIK wajib diisi';
  if (n.length !== 16) return 'NIK harus 16 digit angka (terisi ' + n.length + ' digit)';
  return null;
}

// Mencari lead lain dengan identitas yang sama. 'kecuali' = lead_code yang
// sedang diisi, agar konsumen tidak dianggap kembar dengan dirinya sendiri.
export async function cariKembar(sql, { nik, npwp, email, hp, kecuali }) {
  const hasil = [];
  const tambah = (rows, alasan) => rows.forEach(r => {
    if (!hasil.some(h => h.lead_code === r.lead_code)) hasil.push({ ...r, alasan });
  });
  const lain = kecuali || '';

  const n = hanyaAngka(nik);
  if (n) {
    tambah(await sql`SELECT lead_code, nama, nama_ktp, sales, project FROM leads
      WHERE regexp_replace(COALESCE(no_ktp, ''), '[^0-9]', '', 'g') = ${n}
        AND lead_code <> ${lain} LIMIT 5`, 'NIK sama');
  }
  const w = hanyaAngka(npwp);
  if (w) {
    tambah(await sql`SELECT lead_code, nama, nama_ktp, sales, project FROM leads
      WHERE regexp_replace(COALESCE(npwp, ''), '[^0-9]', '', 'g') = ${w}
        AND lead_code <> ${lain} LIMIT 5`, 'NPWP sama');
  }
  const e = String(email || '').trim().toLowerCase();
  const h = normHP(hp);
  if (e && h) {
    const kandidat = await sql`SELECT lead_code, nama, nama_ktp, sales, project, wa FROM leads
      WHERE lower(trim(COALESCE(email, ''))) = ${e} AND lead_code <> ${lain} LIMIT 20`;
    tambah(kandidat.filter(r => normHP(r.wa) === h), 'email & nomor HP sama');
  }
  return hasil;
}

export function pesanKembar(k) {
  const nama = k.nama_ktp || k.nama || '(tanpa nama)';
  return 'Konsumen ini sudah terdaftar (' + k.alasan + ') sebagai ' + k.lead_code + ' — ' + nama +
    (k.sales ? ', PIC ' + k.sales : '') + '. Gunakan lead tersebut, jangan buat data baru.';
}
