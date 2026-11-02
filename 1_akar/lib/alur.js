// Template kerja tiap divisi — dibuat otomatis saat transaksi diverifikasi Admin Sales.
// Mengikuti SOP Alur Standar Penjualan: Reserved/Booking → serah terima → estate.

export const DIVISI = {
  collection: 'Collection & KPR',
  finance: 'Finance',
  project: 'Admin Project',
  markom: 'Marcom',
  estate: 'Estate',
};

// hari: deadline dihitung dari tanggal verifikasi (null = ditentukan divisi sendiri)
export const TEMPLATE = {
  collection: [
    { judul: 'Susun jadwal penagihan sesuai skema pembayaran', hari: 3 },
    { judul: 'Konfirmasi jadwal tagihan ke konsumen', hari: 7 },
    { judul: 'Monitoring pembayaran berjalan — reminder H-7 / H-3 / hari-H', hari: null },
    { judul: 'Terbitkan kuitansi resmi setiap pembayaran masuk', hari: null },
  ],
  // Proses KPR (SOP Tim Collection Bagian 2) — sembilan langkah, ditangani KPR Officer di
  // dalam divisi Collection. Hanya dibuat bila cara bayar konsumen memakai KPR. Hari = perkiraan
  // pengingat, bukan SLA baku (SOP tidak menetapkan jumlah hari pasti untuk langkah 2–9).
  collectionKPR: [
    { judul: 'KPR — Kumpulkan & cek kelengkapan berkas (KTP, KK, NPWP, slip gaji, rekening koran)', hari: null },
    { judul: 'KPR — Ajukan berkas ke Bank pilihan konsumen', hari: null },
    { judul: 'KPR — Follow up proses Bank (BI Checking/SLIK, appraisal; LPA & SLF untuk subsidi)', hari: null },
    { judul: 'KPR — Lengkapi kekurangan dokumen bila diminta Bank, ajukan ulang', hari: null },
    { judul: 'KPR — Keputusan Bank: SP3K terbit (disetujui) atau ditolak — catat di menu KPR & AJB', hari: null },
    { judul: 'KPR — Ajukan IOM Subsidi DP & Biaya Akad (menu IOM)', hari: null },
    { judul: 'KPR — Jadwalkan akad bersama Bank, Notaris, konsumen; reminder H-3 & H-1', hari: null },
    { judul: 'KPR — Akad Kredit terlaksana', hari: null },
    { judul: 'KPR — Dokumentasikan & arsipkan akad, teruskan ke proses AJB', hari: null },
  ],
  // Proses AJB (SOP Tim Collection Bagian 3) — sembilan langkah. Berlaku untuk SEMUA skema (KPR
  // maupun tunai): pemicunya akad selesai (KPR) atau lunas 100% (tunai), dibuat sekaligus di sini
  // supaya tidak tertinggal, berjalan setelah syaratnya terpenuhi.
  collectionAJB: [
    { judul: 'AJB — Siapkan & cek dokumen (identitas, SPU, P3U/PPJB, dokumen tanah/bangunan)', hari: null },
    { judul: 'AJB — Notaris/PPAT hitung BPHTB & biaya AJB (catat di panel AJB)', hari: null },
    { judul: 'AJB — Ajukan IOM BPHTB & Biaya AJB (menu IOM)', hari: null },
    { judul: 'AJB — Finance bayar BPHTB; Tim Pajak validasi PPh', hari: null },
    { judul: 'AJB — Serahkan bukti BPHTB & PPh ke Notaris (syarat tanda tangan AJB)', hari: null },
    { judul: 'AJB — Jadwalkan AJB (sinkron dengan akad bila KPR); reminder H-3 & H-1', hari: null },
    { judul: 'AJB — Penandatanganan AJB di kantor Notaris/PPAT', hari: null },
    { judul: 'AJB — Dokumentasikan, arsipkan, teruskan ke Admin & Project untuk BAST', hari: null },
  ],
  finance: [
    { judul: 'Arsip PPJB tertandatangan', hari: 14 },
    { judul: 'Rekonsiliasi pembayaran dengan data Collection', hari: null },
    { judul: 'Akad / AJB selesai', hari: null },
    { judul: 'Terbitkan status Clear untuk Serah Terima', hari: null },
  ],
  project: [
    { judul: 'Tetapkan tanggal serah terima bersama konsumen', hari: 30 },
    { judul: 'Cek fisik unit / QC — defect diperbaiki', hari: null },
    { judul: 'Listrik & air aktif dan teruji', hari: null },
    { judul: 'Unit bersih siap huni', hari: null },
    { judul: 'Kunci, kartu akses & manual unit siap', hari: null },
    { judul: 'Dokumen BAST & lampiran garansi siap', hari: null },
  ],
  markom: [
    { judul: 'Cek daftar hadiah sesuai promo yang berlaku', hari: 14 },
    { judul: 'Proses pengadaan / PO hadiah', hari: 30 },
    { judul: 'Hadiah diterima & dicek kondisinya', hari: null },
    { judul: 'Hadiah siap di lokasi serah terima', hari: null },
    { judul: 'Dokumentasi serah hadiah + tanda terima konsumen', hari: null },
  ],
  estate: [
    { judul: 'Registrasi penghuni & serah welcome pack', hari: null },
    { judul: 'Aktivasi IPL dan penjelasan mekanisme pembayaran', hari: null },
    { judul: 'Buka masa retensi/garansi defect', hari: null },
    { judul: 'Kanal komplain & maintenance aktif', hari: null },
  ],
};

// ============================================================================
// KONTROL PROSES KPR & AJB (SOP Tim Collection Bagian 2 & 3)
// Batas waktu bukan dihitung dari tanggal verifikasi untuk semua langkah, melainkan PER TAHAP:
// begitu satu tahap selesai, tahap berikutnya aktif dan tenggatnya = hari itu + SLA tahap tsb.
// Angka SLA bawaan di bawah ini perkiraan (SOP tidak menetapkan hari per langkah) — ubah di Settings.
// ============================================================================
export const URUTAN_KPR = { mulai: 11, jumlah: 9 };   // proses.urutan 11..19
export const URUTAN_AJB = { mulai: 31, jumlah: 8 };   // proses.urutan 31..38
export const SLA_DEFAULT = {
  kpr: [7, 3, 14, 7, 7, 5, 7, 7, 3],     // hari per tahap KPR 1..9
  ajb: [7, 7, 5, 7, 3, 7, 7, 3],         // hari per tahap AJB 1..8
};

export async function bacaSLA(sql) {
  const r = await sql`SELECT items FROM settings WHERE key = 'sla_proses'`;
  const o = (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items)) ? r[0].items : {};
  const ambil = (k, n) => { const a = Array.isArray(o[k]) ? o[k] : []; return SLA_DEFAULT[k].map((d, i) => (Number(a[i]) > 0 ? Math.round(Number(a[i])) : d)).slice(0, n); };
  return { kpr: ambil('kpr', URUTAN_KPR.jumlah), ajb: ambil('ajb', URUTAN_AJB.jumlah) };
}

export const tambahHariISO = (tgl, n) => new Date(new Date(String(tgl).slice(0, 10) + 'T00:00:00Z').getTime() + Number(n) * 86400000).toISOString().slice(0, 10);
export const hariIniWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

// Aktifkan satu tahap: pasang tenggat = mulai + SLA (hanya bila belum selesai). Aman diulang.
export async function aktifkanTahap(sql, trxId, urutan, mulai, sla) {
  const slaHari = urutan >= URUTAN_AJB.mulai ? sla.ajb[urutan - URUTAN_AJB.mulai] : sla.kpr[urutan - URUTAN_KPR.mulai];
  if (!slaHari) return null;
  const tenggat = tambahHariISO(mulai || hariIniWIB(), slaHari);
  await sql`UPDATE proses SET deadline = ${tenggat} WHERE trx_id = ${trxId} AND divisi = 'collection' AND urutan = ${urutan} AND status <> 'Selesai'`;
  return tenggat;
}

// Dipanggil saat sebuah item Collection selesai/batal: tahap berikutnya aktif (atau nonaktif lagi).
// Akad Kredit (KPR tahap 8) selesai -> Proses AJB tahap 1 aktif.
export async function rantaiTahapSelesai(sql, item, jadiSelesai) {
  if (item.divisi !== 'collection') return;
  const u = Number(item.urutan);
  const diKPR = u >= URUTAN_KPR.mulai && u < URUTAN_KPR.mulai + URUTAN_KPR.jumlah;
  const diAJB = u >= URUTAN_AJB.mulai && u < URUTAN_AJB.mulai + URUTAN_AJB.jumlah;
  if (!diKPR && !diAJB) return;
  const sla = await bacaSLA(sql);
  const akhir = diKPR ? URUTAN_KPR.mulai + URUTAN_KPR.jumlah - 1 : URUTAN_AJB.mulai + URUTAN_AJB.jumlah - 1;
  if (jadiSelesai) {
    if (u < akhir) await aktifkanTahap(sql, item.trx_id, u + 1, hariIniWIB(), sla);
    if (u === URUTAN_KPR.mulai + 7) await aktifkanTahap(sql, item.trx_id, URUTAN_AJB.mulai, hariIniWIB(), sla);  // akad selesai -> AJB mulai
  } else if (u < akhir) {
    await sql`UPDATE proses SET deadline = NULL WHERE trx_id = ${item.trx_id} AND divisi = 'collection' AND urutan = ${u + 1} AND status <> 'Selesai'`;
  }
}

// Pemicu AJB untuk skema tunai: dipanggil saat seluruh tagihan lunas
export async function mulaiAJBBilaLunas(sql, trxId) {
  const sisa = Number((await sql`SELECT COALESCE(sum(nilai - dibayar), 0)::bigint AS n FROM tagihan WHERE trx_id = ${trxId}`)[0].n);
  if (sisa > 0) return false;
  const p = await sql`SELECT deadline, status FROM proses WHERE trx_id = ${trxId} AND divisi = 'collection' AND urutan = ${URUTAN_AJB.mulai}`;
  if (!p.length || p[0].deadline || p[0].status === 'Selesai') return false;
  await aktifkanTahap(sql, trxId, URUTAN_AJB.mulai, hariIniWIB(), await bacaSLA(sql));
  return true;
}

// Buat seluruh item kerja divisi untuk satu transaksi (aman diulang — dicek dulu)
export async function buatProsesDivisi(sql, trx) {
  const ada = await sql`SELECT 1 FROM proses WHERE trx_id = ${trx.id} LIMIT 1`;
  if (ada.length) return false;

  const pakaiKPR = /kpr/i.test(trx.bayar || '');
  const SUB_COLLECTION = { collectionKPR: URUTAN_KPR.mulai - 1, collectionAJB: URUTAN_AJB.mulai - 1 };
  for (const [kunci, items] of Object.entries(TEMPLATE)) {
    if (kunci === 'collectionKPR' && !pakaiKPR) continue; // milestone KPR hanya untuk skema KPR
    const divisi = kunci in SUB_COLLECTION ? 'collection' : kunci;
    let urut = SUB_COLLECTION[kunci] || 0;
    for (const it of items) {
      urut += 1;
      const deadline = it.hari
        ? new Date(Date.now() + it.hari * 86400000).toISOString().slice(0, 10)
        : null;
      await sql`INSERT INTO proses (trx_id, lead_code, divisi, judul, deadline, urutan)
                VALUES (${trx.id}, ${trx.lead_code}, ${divisi}, ${it.judul}, ${deadline}, ${urut})`;
    }
  }
  // Proses KPR mulai berjalan sejak kontrak masuk: tahap 1 aktif hari ini. AJB menunggu pemicunya.
  if (pakaiKPR) await aktifkanTahap(sql, trx.id, URUTAN_KPR.mulai, hariIniWIB(), await bacaSLA(sql));
  return true;
}


// ============================================================================
// MESIN ALUR — rantai penyerahan resmi antar divisi, dari penjualan sampai
// serah terima unit dan handling estate. Detail pekerjaan di dalam tiap
// divisi diatur terpisah (menu Proses Divisi); di sini yang dijaga adalah
// PERPINDAHAN tahapnya: siapa memegang berkas sekarang, syarat apa yang harus
// dipenuhi sebelum diserahkan, dan ke divisi mana berikutnya.
// ============================================================================

export const TAHAP = [
  { no: 1, nama: 'Reserved / Booking', pemegang: 'sales',
    ringkas: 'Sales input transaksi & unggah berkas wajib',
    berikut: 'Serahkan ke Admin Sales untuk verifikasi' },
  { no: 2, nama: 'Verifikasi Berkas', pemegang: 'adminsales',
    ringkas: 'Admin Sales memeriksa data & berkas, menerbitkan SP + PPJB',
    berikut: 'Verifikasi menerbitkan SP & PPJB, lalu dokumen diserahkan untuk ditandatangani' },
  // Batas 7 hari kalender sesuai Kebijakan & Prosedur Penjualan
  { no: 3, nama: 'Penandatanganan Dokumen', pemegang: 'sales',
    ringkas: 'Sales mengawal tanda tangan & paraf konsumen — batas 7 hari kalender',
    berikut: 'Serahkan ke Manajemen untuk Sign Approval' },
  { no: 4, nama: 'Sign Approval Manajemen', pemegang: 'manager',
    ringkas: 'Manajemen memeriksa dan mengesahkan Surat Pesanan & PPJB',
    berikut: 'Setelah disahkan, berkas diteruskan ke Collection & KPR' },
  { no: 5, nama: 'Penagihan & Proses Kredit', pemegang: 'collection',
    ringkas: 'Collection & KPR menjalankan penagihan dan proses kredit sampai akad',
    berikut: 'Serahkan ke Finance bila DP lunas / akad selesai' },
  { no: 6, nama: 'Legal & Keuangan', pemegang: 'finance',
    ringkas: 'Finance merampungkan PPJB, akad/AJB, dan rekonsiliasi pembayaran',
    berikut: 'Terbitkan status Clear untuk Serah Terima ke Admin Project' },
  { no: 7, nama: 'Persiapan Serah Terima', pemegang: 'project',
    ringkas: 'Admin Project menetapkan jadwal dan menyiapkan unit',
    berikut: 'Catat pelaksanaan serah terima (BAST)' },
  { no: 8, nama: 'Serah Terima Unit', pemegang: 'project',
    ringkas: 'BAST ditandatangani, kunci & hadiah diserahkan',
    berikut: 'Serahkan pengelolaan kepada Estate' },
  { no: 9, nama: 'Pengelolaan Estate', pemegang: 'estate',
    ringkas: 'Estate mengelola penghuni, IPL, dan masa retensi',
    berikut: 'Tutup berkas setelah masa retensi selesai' },
  { no: 10, nama: 'Selesai', pemegang: '-',
    ringkas: 'Siklus transaksi selesai, arsip tersimpan permanen',
    berikut: null },
];

export const infoTahap = n => TAHAP.find(t => t.no === Number(n)) || TAHAP[0];

// Divisi yang berhak menyerahkan tahap ke berikutnya
export function bolehSerahkan(role, tahap) {
  if (role === 'manager') return true;
  return infoTahap(tahap).pemegang === role;
}

// Syarat yang wajib dipenuhi sebelum tahap diserahkan.
// Mengembalikan pesan penghalang, atau null bila sudah boleh lanjut.
export async function cekSyarat(sql, trx, tahap) {
  const n = Number(tahap);

  if (n === 1) {
    const f = await sql`SELECT jenis FROM trx_files
      WHERE lead_code = ${trx.lead_code} AND unit = ${trx.unit || ''}`;
    if (!f.some(x => x.jenis === 'transfer')) return 'Bukti transfer belum diunggah.';
    if (!f.some(x => x.jenis === 'ktp')) return 'KTP konsumen belum diunggah.';
    return null;
  }
  if (n === 2) {
    if (!trx.finance_konfirmasi_at) {
      return 'Mutasi rekening belum dikonfirmasi Finance. Cross-check Booking Fee wajib tercatat sebelum verifikasi.';
    }
    if (trx.verif_status !== 'Terverifikasi') return 'Transaksi belum diverifikasi Admin Sales.';
    return null;
  }
  if (n === 3) {
    if (!trx.ttd_selesai_at) {
      return 'Tanda tangan dan paraf konsumen belum dinyatakan lengkap. Catat kelengkapannya lebih dulu.';
    }
    return null;
  }
  if (n === 4) {
    if (!trx.approval_mgmt_at) return 'Surat Pesanan & PPJB belum disahkan Manajemen.';
    return null;
  }
  if (n === 5) {
    // DP dianggap cukup bila pembayaran mencapai 20% harga unit, atau akad selesai.
    // Kontrak berjadwal dinilai dari kuitansi terkonfirmasi (di luar pencairan bank) dan baris Akad; kontrak lama dari baris transaksi.
    const jd = (await sql`SELECT jadwal_at FROM transactions WHERE id = ${trx.id}`)[0];
    const bayar = jd && jd.jadwal_at
      ? await sql`SELECT COALESCE(sum(nilai), 0)::bigint AS total FROM pembayaran
          WHERE trx_id = ${trx.id} AND status = 'KW' AND COALESCE(cara, '') <> 'Pencairan KPR'`
      : await sql`SELECT COALESCE(sum(nilai), 0)::bigint AS total FROM transactions
          WHERE lead_code = ${trx.lead_code} AND unit = ${trx.unit || ''} AND jenis <> 'Batal'`;
    const akad = jd && jd.jadwal_at
      ? await sql`SELECT ((SELECT count(*) FROM proses WHERE trx_id = ${trx.id} AND divisi = 'collection' AND judul ILIKE '%akad%' AND status = 'Selesai')
          + (SELECT count(*) FROM tagihan WHERE trx_id = ${trx.id} AND jenis = 'AKAD' AND status = 'Lunas'))::int AS n`
      : await sql`SELECT count(*)::int AS n FROM proses
          WHERE trx_id = ${trx.id} AND divisi = 'collection' AND judul ILIKE '%akad%' AND status = 'Selesai'`;
    const harga = Number(trx.harga_unit) || 0;
    const masuk = Number(bayar[0].total) || 0;
    if (akad[0].n === 0 && (!harga || masuk / harga < 0.2)) {
      return 'Belum memenuhi syarat: pembayaran minimal 20% dari harga unit atau akad kredit selesai.';
    }
    return null;
  }
  if (n === 6) return null;   // Finance menyatakan Clear atas penilaiannya sendiri
  if (n === 7) {
    const sisa = await sql`SELECT count(*)::int AS n FROM proses
      WHERE trx_id = ${trx.id} AND divisi = 'project' AND status <> 'Selesai'`;
    if (sisa[0].n > 0) return 'Masih ada ' + sisa[0].n + ' ceklis persiapan unit yang belum selesai.';
    if (!trx.tgl_serah_terima) return 'Tanggal serah terima belum ditetapkan.';
    return null;
  }
  if (n === 8) {
    if (!trx.bast_at) return 'BAST belum dicatat. Gunakan tombol Catat Serah Terima di menu Proses Divisi.';
    return null;
  }
  if (n === 9) return null;   // Estate menutup berkas setelah masa retensi
  return 'Berkas sudah pada tahap akhir.';
}
