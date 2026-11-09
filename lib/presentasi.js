// ===== Presentasi Project — akses & konfigurasi promo =====
// Menu ini KHUSUS akun Andriawan (Head of Sales & Marketing). Dicek di menu (Shell), halaman, dan API.
export const bolehPresentasi = u => !!u && u.role === 'manager' && /andriawan/i.test(`${u.name || ''} ${u.username || ''}`);

// Promo yang sedang berjalan per project (tampil di slide "Promo berjalan" & dipakai slide "Dampak promo")
export const PROMO = {
  'BIO DISTRICT': {
    nama: 'Resort Living, Grand Rewards', mulai: '2026-09-01', selesai: '2026-12-31',
    headline: 'Grand Rewards September–Desember 2026: reward berlapis untuk sales & agent, hadiah langsung untuk konsumen',
    sales: { judul: 'Agent & Sales Program — Jual terus, reward terus', cash: 'Rp10 jt', cashKet: 'cash reward per unit', komisi: '3%', komisiKet: 'semua tipe', bonus: 'Reward trip New Zealand', bonusKet: '1 pack tour · semua tipe',
      continuity: { judul: 'Continuity Reward — bonus naik di setiap unit berikutnya', grup1: { nama: 'Grup 1 · Tipe A & B Standar', bonus: [7, 15, 25, 35, 45, 55] }, grup2: { nama: 'Grup 2 · Tipe C Standar, B & C Corner', bonus: [10, 20, 30, 40, 50, 60] }, lanjut: '+Rp10 jt tiap unit (unit ke-7 dst)', contoh: 'Contoh jual 3 unit: Grup 1 Rp77 jt · Grup 2 Rp90 jt (cash + continuity)' } },
    konsumen: { judul: 'Hadiah langsung setiap pembelian — tanpa diundi', hadiah: [['Tipe A Standar', '3 unit AC', ''], ['Tipe B Standar', 'Vespa Officina 8', 'Limited Edition'], ['Tipe C Standar', 'Wuling Aira ev', 'mobil listrik'], ['B & C Corner', 'BYD Atto 1', 'mobil listrik']],
      catatan: 'Harga mulai Rp1,5 M · unit ready · pembelian 1 Sep – 31 Des 2026' },
    hadiahUnit: tipe => { const t = String(tipe || '').toUpperCase(); return /CORNER/.test(t) && /\b(B|C)\b|TIPE (B|C)/.test(t) ? 'BYD Atto 1' : /TIPE C|\bC\b/.test(t) ? 'Wuling Aira ev' : /TIPE B|\bB\b/.test(t) ? 'Vespa Officina 8' : /TIPE A|\bA\b/.test(t) ? '3 unit AC' : '—'; },
  },
  'PERMAI INDAH': {
    nama: 'Saatnya Punya Rumah Baru!', mulai: '2026-10-01', selesai: '2026-12-31',
    headline: 'Promo Oktober–Desember 2026: komisi 4,5% + cash reward Rp4 jt/unit untuk sales & agent; free uang muka, kanopi & biaya untuk konsumen',
    sales: { judul: 'Sales & agent · Oktober–Desember 2026', cash: 'Rp4 jt', cashKet: 'cash reward per unit', komisi: '4,5%', komisiKet: 'komisi penjualan', bonus: '', bonusKet: '', continuity: null },
    konsumen: { judul: 'Konsumen · Saatnya Punya Rumah Baru!', kolom: ['Promo', 'Keterangan'],
      hadiah: [['Uang muka', 'FREE Uang Muka', ''], ['Bangunan', 'FREE Kanopi Garasi', ''], ['Biaya bank', 'FREE Biaya KPR', ''], ['Legal', 'FREE Biaya Surat & Notaris', '']],
      catatan: 'Rumah subsidi 22,5/60 · KPR bersama BTN, Mandiri, BSI, BCA, BNI · berlaku Oktober – Desember 2026' },
    hadiahUnit: () => 'Free DP, kanopi, biaya KPR & notaris',
  },
};
