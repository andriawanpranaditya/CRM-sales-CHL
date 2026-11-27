// ===== Presentasi Project — akses & konfigurasi promo =====
// Menu ini KHUSUS akun Andriawan (Head of Sales & Marketing). Dicek di menu (Shell), halaman, dan API.
import { BIO_IRREG } from './pricelist';

export const bolehPresentasi = u => !!u && u.role === 'manager' && /andriawan/i.test(`${u.name || ''} ${u.username || ''}`);

// Promo yang sedang berjalan per project (tampil di slide "Promo berjalan" & dipakai slide "Dampak promo")
export const PROMO = {
  'BIO DISTRICT': {
    nama: 'Resort Living, Grand Rewards', mulai: '2026-09-01', selesai: '2026-12-31',
    aiWa: true, // slide WhatsApp satu nomor & AI Asisten ditampilkan
    latar: '/presentasi/bio-bbq.jpg', flyerSales: '/presentasi/flyer-bio-agent.jpg', flyerKonsumen: '/presentasi/flyer-bio-konsumen.jpg',
    headline: 'Grand Rewards September–Desember 2026: reward berlapis untuk sales & agent, hadiah langsung untuk konsumen',
    sales: { judul: 'Agent & Sales Program — Jual terus, reward terus', cash: 'Rp10 jt', cashKet: 'cash reward per unit', komisi: '3%', komisiKet: 'semua tipe', bonus: 'Reward trip New Zealand', bonusKet: '1 pack tour · semua tipe',
      continuity: { judul: 'Continuity Reward — bonus naik di setiap unit berikutnya', grup1: { nama: 'Grup 1 · Tipe A & B Standar', bonus: [7, 15, 25, 35, 45, 55] }, grup2: { nama: 'Grup 2 · Tipe C Standar, B & C Corner', bonus: [10, 20, 30, 40, 50, 60] }, lanjut: '+Rp10 jt tiap unit (unit ke-7 dst)', contoh: 'Contoh jual 3 unit: Grup 1 Rp77 jt · Grup 2 Rp90 jt (cash + continuity)' } },
    konsumen: { judul: 'Hadiah langsung setiap pembelian — tanpa diundi', hadiah: [['Tipe A Standar', '3 unit AC', ''], ['Tipe B Standar', 'Vespa Officina 8', 'Limited Edition'], ['Tipe C Standar', 'Wuling Aira ev', 'mobil listrik'], ['B & C Corner', 'BYD Atto 1', 'mobil listrik']],
      catatan: 'Harga mulai Rp1,5 M · unit ready · pembelian 1 Sep – 31 Des 2026' },
    // Hadiah per unit: tipe & posisi (hoek/corner) diambil dari data unit Price List; bila tidak ada, dari tipe di lead
    // Promo konsumen berjalan sejak Februari 2026 (slide Dampak promo):
    //  · Jan–Agu 2026: Corner → BYD Atto 1 · Tipe B & C standar → Vespa Officina 8 · Tipe A → AC 1 PK 3 unit
    //  · mulai 1 Sep 2026 (Grand Rewards): Tipe C standar → Wuling Aira ev, lainnya sama
    mulaiDampak: '2026-01-01', mulaiGrandRewards: '2026-09-01', // promo hadiah dihitung sejak Januari 2026
    gabungBayar: true, // detail transaksi tahun ini & pembayaran berjalan digabung dalam satu tabel
    program: true, // presentasi: slide program Bio Smart & Bio Easy setelah Langkah ke depan
    // Prospek bulan berjalan (slide setelah Visitor → Reserved/Booking). Daftar manual + otomatis dari kunjungan bulan ini yang belum bertransaksi.
    prospek: { bulan: '2026-11', otomatis: false, daftar: [ // otomatis: true = tambah prospek dari follow up / kunjungan 7 hari terakhir di CRM
      { nama: 'Milla', sales: 'Reno', peran: 'Sales in-house', tipe: ['B'], unit: 1, update: 'Sudah memilih Tipe B; menanyakan harga bisa turun berapa', tahap: 'Negosiasi',
        langkah: 'Jawab dengan nilai, bukan potongan: hadiah promo + cara bayar Bio Smart / Bio Easy; ajak closing visit minggu ini' },
      { nama: 'Jeane', sales: 'Junari', peran: 'Sales in-house', tipe: ['A', 'B'], unit: 1, update: 'Sudah diberi simulasi KPR beberapa bank; tahap diskusi dengan suami', tahap: 'Diskusi keluarga',
        langkah: 'Undang suami ke lokasi untuk presentasi bersama; siapkan perbandingan Tipe A vs B dan opsi Bio Smart / Bio Easy bila KPR jadi kendala; follow up dalam 3 hari' },
      { nama: 'Konsumen agent Hurien', sales: 'Hurien', peran: 'Agent', tipe: ['C'], unit: 2, keteranganUnit: '2 unit Tipe C gandeng', update: 'Sudah konfirmasi mau ambil; konsumen pejabat tinggi TNI, sulit dihubungi', tahap: 'Siap Booking',
        langkah: 'Atur pertemuan lewat agent / ajudan; siapkan dokumen Booking 2 unit agar bisa ditandatangani sekali bertemu (tanda tangan di tempat)' },
    ] },
    bandingTahunLalu: true, // slide Dampak promo: transaksi tahun ini (sejak promo) dibanding setahun penuh tahun lalu
    catatanHarga: 'Tahun 2026 Tipe A dirilis dengan harga mulai Rp1,5 M, dengan penyesuaian spesifikasi dan luas bangunan',
    hadiahUnit: (tipe, unit, tgl) => {
      const ir = BIO_IRREG[unit];
      const t = String(ir?.tipe ? 'TIPE ' + ir.tipe : tipe || '').toUpperCase();
      const corner = /CORNER|HOEK/.test(String(tipe || '').toUpperCase()) || /hoek/i.test(ir?.sub || '');
      const huruf = (t.match(/TIPE\s*([ABC])/) || t.match(/\b([ABC])\b/) || [])[1];
      const gr = String(tgl || '') >= '2026-09-01';
      if (corner && (huruf === 'B' || huruf === 'C')) return 'BYD Atto 1';
      if (huruf === 'C') return gr ? 'Wuling Aira ev' : 'Vespa Officina 8';
      return huruf === 'B' ? 'Vespa Officina 8' : huruf === 'A' ? (gr ? '3 unit AC' : 'AC 1 PK 3 unit') : '—';
    },
  },
  'PERMAI INDAH': {
    nama: 'Saatnya Punya Rumah Baru!', mulai: '2026-10-01', selesai: '2026-12-31',
    aiWa: false, // Permai: langkah ke depan fokus proses KPR & targeting iklan, tanpa tambahan budget
    ringkasanPenjualan: true, // ganti slide Dampak promo dengan ringkasan penjualan sejak start (Des 2025), setelah slide Penjualan
    programPermai: true, // slide program Permai Bisa setelah Langkah ke depan
    prospek: { bulan: '2026-11', otomatis: false, daftar: [] }, // prospek bulan berjalan: isi daftar manual bila ada; otomatis: true = ambil dari CRM
    latar: '/presentasi/permai-kanopi.jpg', flyerSales: null, flyerKonsumen: '/presentasi/flyer-permai.jpg',
    headline: 'Promo Oktober–Desember 2026: komisi 4,5% + cash reward Rp4 jt/unit untuk sales & agent; free uang muka, kanopi & biaya untuk konsumen',
    sales: { judul: 'Sales & agent · Oktober–Desember 2026', cash: 'Rp4 jt', cashKet: 'cash reward per unit', komisi: '4,5%', komisiKet: 'komisi penjualan', bonus: '', bonusKet: '', continuity: null },
    konsumen: { judul: 'Konsumen · Saatnya Punya Rumah Baru!', kolom: ['Promo', 'Keterangan'],
      hadiah: [['Uang muka', 'FREE Uang Muka', ''], ['Bangunan', 'FREE Kanopi Garasi', ''], ['Biaya bank', 'FREE Biaya KPR', ''], ['Legal', 'FREE Biaya Surat & Notaris', '']],
      catatan: 'Rumah subsidi 22,5/60 · KPR bersama BTN, Mandiri, BSI, BCA, BNI · berlaku Oktober – Desember 2026' },
    hadiahUnit: () => 'Free DP, kanopi, biaya KPR & notaris',
  },
};

// ===== Tarif untuk estimasi biaya WhatsApp resmi + AI Asisten (slide "Estimasi biaya") =====
// Tarif Meta untuk nomor Indonesia (rate card berlaku 1 Okt 2026, belum PPN 11%) · AI: Claude Haiku 4.5 (model AI Asisten CRM)
// Ubah angka di sini bila tarif / kurs berubah — slide langsung ikut.
export const TARIF = {
  per: 'November 2026',
  kurs: 16500,                       // asumsi Rp per USD
  marketing: 586.33,                 // template marketing (follow up di luar jendela 24 jam), per pesan
  utility: 356.65,                   // template utility (pengingat janji temu), per pesan
  service: 356.65,                   // balasan bebas dalam jendela 24 jam (AI & sales), per pesan
  serviceGratis: 1000,               // kuota pesan service gratis per nomor per bulan
  ppn: 0.11,
  aiInputUsd: 1, aiCacheUsd: 0.10, aiOutputUsd: 5, // per 1 juta token
  // Asumsi volume per lead (dapat disesuaikan)
  balasanAi: 8,          // balasan AI per lead (tanya-jawab, 3 pertanyaan saringan, tawaran jadwal)
  balasanSales: 10,      // balasan sales dari Inbox WhatsApp per lead
  templateFu: 5,         // template follow up di luar jendela 24 jam per lead (dari 9 sentuhan)
  draftFu: 9,            // draf follow up yang disusun AI per lead
  pengingatJanji: 2,     // template pengingat per janji temu (H-1 & hari-H)
  tokenPrompt: 6000, tokenRiwayat: 1200, tokenJawab: 250, // token per balasan AI (prompt Price List di-cache)
};
export function biayaAiPerBalasan(t = TARIF) {
  const usd = (t.tokenPrompt * t.aiCacheUsd + t.tokenRiwayat * t.aiInputUsd + t.tokenJawab * t.aiOutputUsd) / 1e6;
  return usd * t.kurs;
}

// ===== Program cara bayar fleksibel "Bio Smart & Bio Easy" (slide 8.0–8.6 presentasi Bio) =====
// 27 Nov 2026: program jembatan 24× (Bio Easy lama) dihapus; program cicil ke developer hingga 15 tahun (dulu Bio Stay) kini bernama Bio Easy.
// Di kode, data cicilan jangka panjang tetap bernama `stay`.
// Semua angka simulasi dihitung dari parameter ini — ubah di sini bila harga / bunga / cicilan berubah.
export const PROGRAM_BIO = {
  nama: 'Bio Smart & Bio Easy',
  namaLengkap: 'Bio Smart, Bio Easy & Cash Bertahap',
  tipe: [ // harga Price List 13 Mei 2026 (setelah diskon & all in); cicilan Bio Smart (12×) & Bio Easy (24×) dari deck "Bio Pasti Punya" (Smart Tipe B & C = asumsi proporsional)
    { tipe: 'Tipe A', harga: 1553778000, allIn: 1670000000, smart: 20000000, easy: 15000000 },
    { tipe: 'Tipe B', harga: 2097000000, allIn: 2271000000, smart: 27000000, easy: 20000000 },
    { tipe: 'Tipe C', harga: 2595417445, allIn: 2806000000, smart: 33000000, easy: 25000000 },
  ],
  // 27 Nov 2026: DP Bio Smart & Bio Easy diturunkan dari 20% menjadi 10% (tetap dicicil 3×)
  dp: 0.1, dpKali: 3, smartKali: 12, easyKali: 24,
  // 27 Nov 2026: Bio Smart memakai bunga tersembunyi 10%/thn (efektif, dihitung bulanan) atas piutang selama DP + 12 cicilan;
  // cicilan konsumen ke developer tetap, bunganya ditambahkan ke sisa harga yang dilunasi KPR bank di bulan ke-16.
  smartBunga: 0.10,
  // Cash bertahap (27 Nov 2026), semua tanpa DP & cicilan rata:
  // 12× tanpa bunga dari harga all in; 24× & 36× bunga tetap 10% (anuitas, internal) dari harga setelah diskon — konsumen hanya melihat cicilan.
  cash: [{ kali: 12, bunga: 0, dasar: 'allIn' }, { kali: 24, bunga: 0.10, dasar: 'harga' }, { kali: 36, bunga: 0.10, dasar: 'harga' }],
  // Bio Easy: DP 10% dicicil 3× sudah termasuk di dalam tenor (60× = 3× DP + 57× cicilan).
  // Bunga tetap Bio Easy (dulu Bio Stay) dinaikkan 27 Nov 2026 menyusul BI Rate 6% (sebelumnya 9% / 10,5% / 11,5%)
  stay: [{ tahun: 5, bunga: 0.10 }, { tahun: 10, bunga: 0.11 }, { tahun: 15, bunga: 0.12 }],
  asuransi: 0.004, batasCicilan: 0.35,
  kprFloating: 0.12, kprPromo: 0.0375, tenorKpr: 15, biayaDana: 0.0949,
  acuan: { biRate: '6,00%', biRateKet: 'Nov 2026 · naik 25 bps di RDG 17–18 Nov; total naik 1,25% sepanjang 2026', kreditBaru: '9,49%', kreditBaruKet: 'Juni 2026 · acuan biaya dana developer', floating: '11–13,5%', floatingKet: 'setelah promo fixed 1–3 tahun berakhir',
    sumber: 'Sumber suku bunga: Bank Indonesia (BI Rate Nov 2026, RDG 17–18 Nov); data BI via Kontan (bunga kredit baru Jun 2026); Kontan (floating KPR BCA, CIMB Niaga, Danamon, Mandiri, Agu 2026).' },
  pilot: { unit: 12, nilai: 'Rp25–30 M', bulan: 6 }, batasPiutang: 'Rp25 M',
  // Simulasi harga nett developer (slide 8.6): dari harga all in, dikurangi hadiah, AJB + BPHTB, asuransi; Bio Stay + pendapatan bunga
  nett: {
    hadiah: { A: ['AC 1 PK 3 unit', 10000000], B: ['Vespa Officina 8', 60000000], C: ['Wuling Aira ev', 155000000], corner: ['BYD Atto 1', 200000000] },
    bphtb: 0.05, npoptkp: 80000000, ajb: 0.01, // BPHTB 5% × (harga − NPOPTKP); AJB/PPAT/balik nama ±1% harga (perkiraan)
  },
  // Paket hadiah program flash sale (slide 8.6). Dasar harga = harga standar price list; Paket 4 memotong harga.
  // [nama, nilai hadiah (OTR Jakarta Nov 2026), bebas biaya (ditanggung Bio = harga all in − harga standar), asuransi jiwa, diskon harga]
  flash: { asuransi: 0.015, paket: {
    A: [['Wuling Aira EV', 155000000, 0, 0, 0], ['Vespa + bebas biaya', 63500000, 1, 0, 0], ['3 AC + bebas biaya + asuransi', 15000000, 1, 1, 0], ['Diskon harga', 0, 0, 0, 150000000]],
    B: [['Jaecoo J5 EV', 279900000, 0, 0, 0], ['Wuling Aira EV + bebas biaya', 155000000, 1, 0, 0], ['Vespa + bebas biaya + asuransi', 63500000, 1, 1, 0], ['Diskon harga', 0, 0, 0, 300000000]],
    C: [['Kia Carens EV', 379000000, 0, 0, 0], ['BYD Atto 1 + bebas biaya', 199000000, 1, 0, 0], ['Wuling Aira EV + bebas biaya + asuransi', 155000000, 1, 1, 0], ['Diskon harga', 0, 0, 0, 400000000]],
    // Corner (27 Nov 2026): Paket 1 Chery J6 diganti Lepas E6 EV Passion (OTR Jakarta Rp479,9 jt; varian Stylish Rp419,9 jt)
    corner: [['Lepas E6 EV', 479900000, 0, 0, 0, 'P1'], ['Geely EX2 Pro + bebas biaya', 239900000, 1, 0, 0, 'P2'], ['BYD Atto 1 + bebas biaya + asuransi', 199000000, 1, 1, 0, 'P3'],
      // Paket 3 corner punya pilihan kedua: Bio Premiere Corner — NILAI SEMENTARA disamakan dengan BYD Atto 1 sampai nilai resmi dikonfirmasi
      ['Bio Premiere Corner + bebas biaya + asuransi', 199000000, 1, 1, 0, 'P3 alt'], ['Diskon harga', 0, 0, 0, 500000000, 'P4']],
  },
  // Hadiah barang (mobil, motor, AC) diserahkan setelah uang masuk ≥ batas ini dari harga transaksi — berlaku untuk SEMUA cara bayar
  // (cash keras tercapai saat pelunasan; KPR bank saat akad & dana KPR cair). Bebas biaya & asuransi berlaku saat akad; diskon langsung di harga.
  serahKendaraan: 0.25,
  // Bio Smart di platform flash sale: cicilan tetap 12× = 1,2876% harga transaksi per bulan (setara Rp27 jt untuk Tipe B Rp2,097 M)
  smartPersen: 0.012876 },
};
// ===== Pembanding: Austin Residence (slide 8.4.2 — perbandingan apple to apple) =====
// Sumber: Simulasi Austin Residence 16 Nov 2026 – 15 Jan 2027 (indent). Rumus brosur diterapkan ke harga cash keras yang sama dengan Bio.
// naik = kenaikan harga skema terhadap harga tunai keras (rata-rata semua tipe di brosur); UTJ dihitung bagian dari DP / harga.
export const PEMBANDING_BIO = {
  nama: 'Austin Residence', utj: 50000000, kprDp: 0.05, kprDpKali: 3, kprBunga: 0.06,
  skema: [
    { nama: 'DP 20% + 18×', naik: 0, dp: 0.2, kali: 18 },
    { nama: 'DP 30% + 24×', naik: 0.0262, dp: 0.3, kali: 24 },
    { nama: 'Tanpa DP 18×', naik: 0.0255, dp: 0, kali: 18 },
    { nama: 'Tanpa DP 24×', naik: 0.0482, dp: 0, kali: 24 },
    { nama: 'Tanpa DP 120×', naik: 0.4842, dp: 0, kali: 120 },
  ],
  sumber: 'Simulasi Austin Residence 16 Nov 2026 – 15 Jan 2027 (indent)',
  // Austin masih inden: selama menunggu, konsumen yang belum punya rumah tetap bayar sewa. Dua angka ini asumsi — ubah bila ada data SP Austin.
  indenBulan: 24, sewaBulan: 5000000,
  // Harga Austin belum termasuk biaya surat & biaya KPR. Biaya surat: BPHTB + AJB/balik nama (parameter PROGRAM_BIO.nett).
  // Biaya KPR bank (estimasi umum): provisi 1% plafon, notaris perjanjian kredit + APHT ±1% plafon, appraisal + administrasi ±Rp2 jt.
  // Asuransi jiwa & kebakaran KPR tidak dihitung (ditanggung konsumen di kedua proyek).
  biayaKpr: { provisi: 0.01, notaris: 0.01, lain: 2000000 },
  sewaSumber: 'sewa rumah 2 lantai 3 KT, LB ±100 m² di Gading Serpong Rp50–75 jt/tahun (listing Rumah123 & Trovit, Nov 2026)',
};
export const pmt = (P, i, n) => { const r = i / 12; return r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n; };

// ===== Program "Permai Bisa" — cicil bertahap panjang ke developer hingga 20 tahun (Permai Indah) =====
// Untuk konsumen yang tidak lolos KPR subsidi. Tanpa KPR bank timbul PPN yang ditanggung developer;
// PPN & asuransi jiwa kredit dimasukkan ke bunga all in (asumsi PPN efektif 11% dari harga — wajib dikonfirmasi konsultan pajak).
export const PROGRAM_PERMAI = {
  nama: 'Permai Bisa',
  harga: 185000000, dp: 0.2, dpKali: 3, ppn: 11 / 111, asuransi: 0.004, biayaDana: 0.0949, batasCicilan: 0.35,
  tenor: [{ tahun: 10, dasar: 0.105, allIn: 0.14 }, { tahun: 15, dasar: 0.115, allIn: 0.1425 }, { tahun: 20, dasar: 0.12, allIn: 0.145 }],
  flpp: { dp: 0.01, bunga: 0.05, tahun: 20 },
  pilot: { unit: 18, nilai: 'Rp3,3 M', bulan: 6 }, batasPiutang: 'Rp3 M',
};
