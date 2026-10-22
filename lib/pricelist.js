// ===== Price list resmi (satu sumber untuk menu Price List & Simulasi Cara Bayar) =====
// ===== BIO DISTRICT — Price List resmi 13 Mei 2026 (PT Serpong Bangun Lestari) =====
// standar = Harga Jual setelah diskon · allin = Harga Jual All In setelah diskon · inclPpn = Harga Jual All In (Include PPN) sebelum diskon
// cicil / cicilAllin = ilustrasi cicilan KPR bunga 2,75% untuk tenor 25 / 20 / 15 tahun (angka resmi price list)
export const BIO_STANDAR = [
  { tipe: 'A', ket: 'NON PPN DTP', sub: 'Badan', lb: 74, lt: 60, dim: '6 x 10', view: 'TIMUR', inclPpn: 1902000000, standar: 1553778000, allin: 1670000000, cicil: [7167747, 8424061, 10544274], cicilAllin: [7703891, 9054177, 11332931] },
  { tipe: 'B', ket: 'PPN DTP', sub: 'Badan', lb: 102, lt: 72, dim: '6 x 12', view: 'BARAT', inclPpn: 2840000000, standar: 2097000000, allin: 2271000000, cicil: [9673689, 11369227, 14230696], cicilAllin: [10476370, 12312597, 15411497] },
  { tipe: 'C', ket: 'PPN DTP', sub: 'Badan', lb: 130, lt: 84, dim: '7 x 12', view: 'SELATAN', inclPpn: 3422000000, standar: 2595417445, allin: 2806527243, cicil: [11972942, 14071479, 17613064], cicilAllin: [12946815, 15216045, 19045701] },
];
export const BIO_TIPE = Object.fromEntries(BIO_STANDAR.map(x => [x.tipe, x]));
// Unit IRREGULER — harga khusus per kavling (blok A1 = Bio Ave 1, BLV = Bio Blv, dst.)
export const BIO_IRREG = {
  'Bio Ave 1 no.06': { blok: 'A1', kav: 6, tipe: 'C', sub: 'Hoek', lb: 140, lt: 108, dim: '9 x 12', view: 'UTARA', inclPpn: 4256000000, standar: 3280421823, allin: 3543756850, cicil: [15132942, 17785342, 22261852], cicilAllin: [16347735, 19213056, 24048701] },
  'Bio Ave 1 no.08': { blok: 'A1', kav: 8, tipe: 'C', sub: 'Hoek (IRR)', lb: 140, lt: 119, dim: '9,9 x 12 (IRR)', view: 'SELATAN', inclPpn: 4429000000, standar: 3422708235, allin: 3695942183, cicil: [15789325, 18556771, 23227239], cicilAllin: [17049782, 20038153, 25081463] },
  'Bio Ave 2 no.02': { blok: 'A2', kav: 2, tipe: 'B', sub: 'Hoek (IRR)', lb: 109, lt: 107, dim: '8,9 x 12 (IRR)', view: 'UTARA', inclPpn: 3762000000, standar: 2870357023, allin: 3102099378, cicil: [13241269, 15562109, 19478864], cicilAllin: [14310321, 16818538, 21051518] },
  'Bio Ave 2 no.03': { blok: 'A2', kav: 3, tipe: 'B', sub: 'Hoek (IRR)', lb: 109, lt: 137, dim: '11,4 x 12 (IRR)', view: 'UTARA', inclPpn: 4566000000, standar: 3528323578, allin: 3810009189, cicil: [16276540, 19129382, 23943967], cicilAllin: [17575986, 20656586, 25855547] },
  'Bio Blv no.07': { blok: 'BLV', kav: 7, tipe: 'B', sub: 'Hoek (IRR)', lb: 109, lt: 138, dim: '11,5 x 12 (IRR)', view: 'BARAT', inclPpn: 4464000000, standar: 3445808649, allin: 3720794422, cicil: [15895889, 18682013, 23384003], cicilAllin: [17164429, 20172894, 25250116] },
  'Bio Blv no.08': { blok: 'BLV', kav: 8, tipe: 'B', sub: 'Hoek (IRR)', lb: 109, lt: 143, dim: '8,4 x 17 (IRR)', view: 'BARAT', inclPpn: 4621000000, standar: 3573474308, allin: 3858972641, cicil: [16484825, 19374174, 24250370], cicilAllin: [17801860, 20922049, 26187823] },
  'Bio Blv no.09': { blok: 'BLV', kav: 9, tipe: 'B', sub: 'Hoek (IRR)', lb: 109, lt: 126, dim: '7,4 x 17 (IRR)', view: 'BARAT', inclPpn: 4188000000, standar: 3219159189, allin: 3477143546, cicil: [14850331, 17453196, 21845911], cicilAllin: [16040441, 18851901, 23596648] },
  'Bio Blv no.17': { blok: 'BLV', kav: 17, tipe: 'B', sub: 'Hoek (IRR)', lb: 109, lt: 138, dim: '8,6 x 16 (IRR)', view: 'BARAT', inclPpn: 5586000000, standar: 4363629575, allin: 4707732405, cicil: [20129897, 23658129, 29612534], cicilAllin: [21717281, 25523739, 31947691] },
  'Bio Ave 3 no.02': { blok: 'A3', kav: 2, tipe: 'B', sub: 'Hoek (IRR)', lb: 109, lt: 142, dim: '12 x 12 (IRR)', view: 'UTARA', inclPpn: 4550000000, standar: 3515189279, allin: 3795887387, cicil: [16215950, 19058172, 23854835], cicilAllin: [17510841, 20580022, 25759713] },
  'Bio Ave 3 no.08': { blok: 'A3', kav: 8, tipe: 'B', sub: 'Hoek (IRR)', lb: 109, lt: 105, dim: '8,7 x 12 (IRR)', view: 'UTARA', inclPpn: 3855000000, standar: 2946051829, allin: 3183172351, cicil: [13590457, 15972500, 19992545], cicilAllin: [14684320, 17258088, 21601696] },
  'Bio Ave 5 no.11': { blok: 'A5', kav: 11, tipe: 'C', sub: 'Hoek (IRR)', lb: 140, lt: 105, dim: '8,7 x 12 (IRR)', view: 'UTARA', inclPpn: 4067000000, standar: 3126825431, allin: 3377726589, cicil: [14424385, 16952594, 21219314], cicilAllin: [15581819, 18312895, 22921983] },
  'Bio Ave 5 no.16': { blok: 'A5', kav: 16, tipe: 'C', sub: 'Hoek (IRR)', lb: 140, lt: 107, dim: '8,9 x 12 (IRR)', view: 'SELATAN', inclPpn: 5252000000, standar: 4096731600, allin: 4420737921, cicil: [18898668, 22211098, 27801307], cicilAllin: [20393344, 23967752, 30000084] },
};
// keterangan ringkas per unit irreguler (dipakai Simulasi Cara Bayar)
Object.values(BIO_IRREG).forEach(x => { x.ket = `${x.sub} · ${x.dim.replace(' (IRR)', '').replace(' x ', '×')} · ${x.view.charAt(0) + x.view.slice(1).toLowerCase()}`; x.ketPpn = 'PPN DTP'; });
export const BIO_PL = {
  tanggal: '13 Mei 2026', bunga: '2,75%', tenor: [25, 20, 15], developer: 'PT Serpong Bangun Lestari',
  terms: [
    ['Harga Jual (Cash Keras/KPR) Subsidi DP 10%', [['Booking Fee', '5 Juta', ''], ['DP', '0%', 'Hari ke 14 setelah BF'], ['PELUNASAN / AKAD', '100% - BF', '1 bulan setelah DP 1']]],
    ['Harga Jual All In', [['Booking Fee', '5 Juta', ''], ['DP', '0%', 'Hari ke 14 setelah BF'], ['PELUNASAN / AKAD', '100% - BF', '1 bulan setelah DP 1']]],
  ],
  catatan: [
    ['Harga Jual sudah termasuk:', 'Ijin Mendirikan Bangunan (IMB), Biaya instalasi listrik dan air bersih.'],
    ['Harga Jual belum termasuk:', 'PPN, Biaya Akad Kredit, AJB, Balik nama Sertifikat, Notaris/PPAT, HGB, BPHTB, Biaya Peningkatan Sertifikat, Biaya Asuransi Jiwa, PBB, PPN BM tanah & bangunan akibat pengembangan luas bangunan sehingga masuk dalam kriteria bangunan mewah sesuai peraturan pemerintah, Iuran Pengelolaan Lingkungan, Biaya aktivasi listrik dan air.'],
    ['Harga Jual All In belum termasuk:', 'PPN, Biaya Peningkatan Sertifikat, Biaya Asuransi Jiwa, PBB, PPN BM tanah & bangunan akibat pengembangan luas bangunan sehingga masuk dalam kriteria bangunan mewah sesuai peraturan pemerintah, Iuran Pengelolaan Lingkungan, Biaya aktivasi listrik dan air.'],
    ['', 'Nama blok, nomor yang tercantum pada saat tanda jadi sudah pasti dan tidak dapat diganti.'],
    ['', 'Keterlambatan pembayaran akan dikenakan perhitungan denda sesuai ketentuan yang berlaku 1‰ (1 per mill) per hari.'],
    ['', 'Cara pembayaran KPR harus melalui proses ke Bank yang bekerjasama dengan Pengembang.'],
    ['', 'Jika terdapat selisih antara sisa hutang dengan plafon KPR yang disetujui, maka penambahan DP menjadi tanggung jawab pemesan dan dibayarkan maksimal satu minggu sebelum akad kredit.'],
    ['', 'Apabila Pemesan membatalkan pemesanan secara sepihak dan atau pemesanan menjadi batal, maka Pemesan secara tegas menyetujui bahwa seluruh pembayaran yang sudah dilakukan Pemesan dan booking fee menjadi hangus dan pemesan dikenakan biaya-biaya yang diatur di dalam P3U (diluar biaya pajak yang sudah dibebankan) yang diperhitungkan sebagai kompensasi ganti kerugian kepada PT. Serpong Bangun Lestari. Kecuali pembatalan karena KPR ditolak oleh minimal 2 (dua) pihak BANK, maka Booking Fee Hangus dan Angsuran/Down Payment dikembalikan setelah dipotong biaya Pajak yang sudah dibebankan berikut denda (apabila ada).'],
    ['', 'Harga dan ketentuan diatas sewaktu-waktu dapat berubah tanpa pemberitahuan terlebih dahulu.'],
  ],
  rekening: { judul: 'Pembayaran dianggap sah apabila sudah masuk di rekening PT. SERPONG BANGUN LESTARI:', bank: 'BANK CENTRAL ASIA (BCA)', no: '205-005-3604', cabang: 'KCK Menara BCA' },
  bankRekanan: ['BCA', 'BNI', 'Bank BJB', 'BSI', 'Danamon', 'Mandiri', 'Permata', 'UOB', 'BTN'],
};
export const BIO_PROMO = {
  judul: 'RESORT LIVING, GRAND REWARDS', periode: 'Pembelian 1 Sep – 31 Des 2026 · hadiah langsung tanpa diundi · S&K berlaku',
  hadiah: { A: '3 unit AC', B: 'Vespa Officina 8 Limited Edition', C: 'Wuling Aira EV (mobil listrik)', corner: 'BYD Atto 1 (mobil listrik) — unit corner B & C' },
};
export const BIO_CARA = BIO_PL.terms.map(([j, r]) => [j, r.map(([a, b, c]) => `${a} ${b}${c ? ' (' + c.toLowerCase() + ')' : ''}`).join(' · ')]);
// Tipe unit BIO sesuai warna siteplan (A ungu · B oranye · C hijau tosca)
export function tipeBio(unit) {
  const m = String(unit).match(/^Bio (Ave (\d)|Blv) no\.(\d+)/i);
  if (!m) return null;
  const ave = m[2] ? Number(m[2]) : null, no = Number(m[3]);
  if (ave === 1) return 'C';
  if (ave === 2 || ave === 7) return 'B';
  if (ave === 6) return 'A';
  if (ave === 3) return no <= 12 ? 'B' : 'C';
  if (ave === 5) return no === 12 ? 'A' : no === 15 ? 'B' : 'C';
  if (!ave) return no >= 18 ? 'A' : no >= 7 ? 'B' : 'C'; // Bio Blv
  return null;
}
// ===== PERMAI INDAH CILEJIT — Price List 01 Desember 2025 (PT Bumi Mahardika Makmur) — KPR BTN subsidi (FLPP) =====
export const PERMAI = { harga: 185000000, bf: 500000, um: 1350000, plafon: 179150000, bunga: 5, lb: '22,5 m²', lt: '60 m²', tenor: [20, 15, 10] };
export const PERMAI_PL = {
  tanggal: '01 Desember 2025', developer: 'PT Bumi Mahardika Makmur',
  cicil: { 10: 1933400, 15: 1438400, 20: 1198000 }, // simulasi cicilan KPR BTN subsidi (angka resmi price list)
  belumTermasuk: ['Pembukaan Rekening Pribadi (TUM)', 'Biaya lain yang timbul berdasarkan ketentuan dan Peraturan Pemerintah'],
  syarat: [
    'Booking Fee sebesar Rp 500.000,- tidak dapat dikembalikan / hangus apabila terjadi pembatalan.',
    'Persetujuan suku bunga dan maksimum kredit sepenuhnya wewenang Pihak BTN.',
    'Apabila terjadi penurunan MK, maka konsumen wajib melunasi kekurangan DP maksimum 1 bulan sejak pemberitahuan dari BTN. Apabila KPR ditolak oleh Bank, maka konsumen diperbolehkan untuk mengganti nama 1x dan harus 1 Kartu Keluarga.',
    'Ganti/pindah Unit atas keinginan sendiri dikenakan biaya Rp 2.000.000,- (dua juta rupiah).',
    'Harga dan program KPR dapat berubah sewaktu-waktu mengikuti program yang disediakan pemerintah melalui bank pelaksana. DP 1 dibayarkan tanggal 1 bulan berikutnya sejak tanggal SPR ditandatangani dan berkas KPR harus sudah lengkap, bila tidak maka pembeli dianggap melakukan pembatalan sepihak.',
    'Pembayaran dianggap sah bila pembayaran sudah diterima oleh developer dan mendapatkan kwitansi asli serta cap developer. Setiap transaksi dan pembayaran hanya melalui transfer ke rekening resmi Bank Central Asia atas nama PT. Bumi Mahardika Makmur.',
    'Transaksi penjualan mengikat harga setelah Surat Pemesanan Rumah (SPR) ditandatangani (seluruh persyaratan SPR dipenuhi).',
  ],
  persyaratan: ['Formulir aplikasi bank & FLPP', 'Fc e-KTP, KK, Surat Nikah, NPWP (5 lbr)', 'Pas foto 3 x 4 (2 lbr)', 'Slip gaji 3 bulan terakhir (asli)', 'Surat keterangan kerja (asli)', 'Rekening koran tabungan 3 bulan terakhir (asli)', 'SPT Tahunan (Form A1)', 'BPJS Kesehatan', 'SKBPR suami istri'],
  rekening: { bank: 'Bank BCA KCU BSD', no: '497 - 6006 - 887', an: 'PT Bumi Mahardika Makmur' },
};
export const angsuran = (pokok, bungaTh, tahun) => { const r = bungaTh / 100 / 12, n = tahun * 12; return r ? Math.round(pokok * r / (1 - Math.pow(1 + r, -n))) : Math.round(pokok / n); };
export function hargaUnit(proj, blok, tipePilih) {
  if (/permai/i.test(proj)) return { standar: PERMAI.harga, allin: PERMAI.harga, bunga: PERMAI.bunga, tenor: 20, tipe: 'Subsidi', irreg: false, ket: '' };
  if (blok && BIO_IRREG[blok]) { const x = BIO_IRREG[blok]; return { ...x, bunga: 2.75, tenor: 25, irreg: true }; }
  const t = (blok && tipeBio(blok)) || tipePilih || 'A';
  return { ...BIO_TIPE[t], tipe: t, bunga: 2.75, tenor: 25, irreg: false, ket: '' };
}
