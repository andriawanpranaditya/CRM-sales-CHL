// Pembatalan kontrak & pengembalian dana. Aturan mengikuti catatan 8 pada price list Bio District
// dan SOP Tim Collection Bagian 1 (langkah 6):
//  - Dibatalkan sepihak oleh pemesan: seluruh pembayaran dan booking fee hangus.
//  - KPR ditolak oleh minimal 2 bank: booking fee hangus; uang muka/angsuran dikembalikan setelah
//    dipotong pajak yang sudah dibebankan, denda (bila ada), dan biaya lain sesuai P3U.
//  - Menunggak (SP3 tidak dibayar): SOP Collection — konsumen tetap tidak membayar 7 hari setelah
//    SP3. Perhitungan refund/pemotongan "sesuai ketentuan P3U/PPJB" — sama seperti KPR ditolak
//    (booking fee hangus, sisa dikurangi pajak/denda/biaya); isi pajak & biaya sesuai P3U kontrak ini.
//  - Kebijakan khusus: nilai pengembalian ditetapkan manual (dibatasi jumlah yang dibayar konsumen).
// Pencairan dari bank tidak pernah menjadi hak konsumen — itu dikembalikan ke bank secara terpisah.

export const KATEGORI_BATAL = {
  sepihak: 'Dibatalkan sepihak oleh pemesan',
  kpr_ditolak: 'KPR ditolak oleh minimal 2 bank',
  menunggak: 'Menunggak (SP3 tidak dibayar)',
  khusus: 'Kebijakan khusus (nilai ditetapkan manual)',
};

const n0 = v => Math.max(0, Math.round(Number(v) || 0));

// Rincian uang yang sudah dibayar konsumen, dikelompokkan menurut baris tagihan tempat ia teralokasi
export async function rincianPembayaran(sql, trxId) {
  const al = await sql`SELECT g.jenis, COALESCE(sum(a.nilai), 0)::bigint AS n FROM pembayaran_alokasi a
    JOIN tagihan g ON g.id = a.tagihan_id JOIN pembayaran p ON p.id = a.pembayaran_id
    WHERE g.trx_id = ${trxId} AND p.status <> 'Batal' GROUP BY g.jenis`;
  const m = {}; al.forEach(r => { m[r.jenis] = Number(r.n); });
  const pencairan = Number((await sql`SELECT COALESCE(sum(nilai), 0)::bigint AS n FROM pembayaran
    WHERE trx_id = ${trxId} AND status <> 'Batal' AND cara = 'Pencairan KPR'`)[0].n);
  const dendaTerutang = Number((await sql`SELECT COALESCE(sum(nilai - dibayar), 0)::bigint AS n FROM tagihan
    WHERE trx_id = ${trxId} AND jenis = 'DENDA'`)[0].n);
  // Alokasi ke baris Akad di atas jumlah pencairan bank adalah uang konsumen
  const akadKonsumen = Math.max(0, (m.AKAD || 0) - pencairan);
  return { bf: m.BF || 0, dpAng: (m.DP || 0) + (m.ANG || 0) + (m.ANGSURAN || 0) + (m.PELUNASAN || 0) + akadKonsumen,
    adm: m.ADM || 0, denda: m.DENDA || 0, pencairan, dendaTerutang };
}

export function hitungPembatalan({ kategori, rincian, pajakDipotong, biayaLain, nilaiManual }) {
  const r = rincian;
  const pajak = n0(pajakDipotong), lain = n0(biayaLain);
  const totalKonsumen = r.bf + r.dpAng + r.adm + r.denda;
  let nilaiKembali = 0, potongan = 0;
  const baris = [];
  if (kategori === 'sepihak') {
    baris.push('Seluruh pembayaran hangus — tidak ada pengembalian');
  } else if (kategori === 'kpr_ditolak' || kategori === 'menunggak') {
    potongan = pajak + lain + r.dendaTerutang;
    nilaiKembali = Math.max(0, r.dpAng - potongan);
    baris.push('Booking fee hangus');
    baris.push('Uang muka / angsuran dibayar dikurangi pajak, denda terutang, dan biaya lain');
  } else if (kategori === 'khusus') {
    nilaiKembali = Math.min(n0(nilaiManual), r.bf + r.dpAng + r.adm);
    baris.push('Nilai pengembalian ditetapkan manual (maksimal sebesar yang dibayar konsumen di luar denda)');
  }
  return { totalKonsumen, nilaiKembali, nonRefund: totalKonsumen - nilaiKembali,
    potongan: { pajak, biayaLain: lain, dendaTerutang: r.dendaTerutang, total: potongan }, keterangan: baris };
}
