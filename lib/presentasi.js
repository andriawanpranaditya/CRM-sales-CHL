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
    //  · Feb–Agu 2026: Corner → BYD Atto 1 · Tipe B & C standar → Vespa Officina 8 · Tipe A → AC 1 PK 3 unit
    //  · mulai 1 Sep 2026 (Grand Rewards): Tipe C standar → Wuling Aira ev, lainnya sama
    mulaiDampak: '2026-02-01', mulaiGrandRewards: '2026-09-01',
    gabungBayar: true, // detail transaksi tahun ini & pembayaran berjalan digabung dalam satu tabel
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
