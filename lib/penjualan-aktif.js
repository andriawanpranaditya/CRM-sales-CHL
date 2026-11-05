// Aturan bersama "Booking aktif" untuk semua laporan (Laporan Penjualan, Report Lengkap, Data Excel, Dashboard, Kinerja Sales, Beranda, Analisa Marcom):
// sebuah transaksi Booking dihitung sebagai penjualan bila TIDAK ada Batal sesudahnya untuk lead + unit yang sama.
// Kontrak yang batal (walau batalnya di bulan/tahun berikutnya) tidak dihitung; ganti kontrak dihitung satu kali (kontrak penggantinya).
// Urutan kejadian = tanggal, lalu di hari yang sama Batal lebih dulu dari Booking baru (sama dengan Master Stock & Laporan Penjualan).
export function idBookingAktif(trx) {
  const kunci = t => (t.lead_code || '') + '|' + (t.unit || '');
  const urut = [...(trx || [])].sort((a, b) => String(a.tgl || '').slice(0, 10).localeCompare(String(b.tgl || '').slice(0, 10))
    || ((a.jenis === 'Batal' ? 0 : 1) - (b.jenis === 'Batal' ? 0 : 1)) || (a.id || 0) - (b.id || 0));
  const terbuka = {}; const aktif = new Set();
  for (const t of urut) {
    const k = kunci(t);
    if (t.jenis === 'Booking' || t.jenis === 'Closing') { if (!terbuka[k]) { terbuka[k] = t.id; aktif.add(t.id); } }
    else if (t.jenis === 'Batal') { if (terbuka[k]) aktif.delete(terbuka[k]); delete terbuka[k]; }
  }
  return aktif; // id transaksi Booking yang masih berjalan per hari ini (satu per kontrak)
}
