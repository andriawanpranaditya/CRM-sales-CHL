// Pembentukan kontrak: saat Admin Sales memverifikasi Booking dan memilih skema,
// nilai kontrak dipecah menjadi DPP/PPN dan jadwal tagihan dibangkitkan.
// Pembayaran yang sudah dicatat lewat transaksi (booking fee, cicilan lama)
// dipindahkan ke tabel pembayaran sebagai kuitansi, lalu dialokasikan ke tagihan.
import { bacaPajak, hitungPajak, buatJadwal, alokasiPembayaran } from '@/lib/piutang';
import { nomorInternal } from '@/lib/penomoran';

// Pajak & baris jadwal untuk satu kontrak — dipakai bentukKontrak dan jadwalUlang agar hitungannya identik
async function susunKontrak(sql, t, project, sk, nilai, tgl) {
  // Unit DTP? dari master unit, atau tipenya
  const u = (await sql`SELECT u.ppn_dtp, u.tipe, tp.ppn_dtp AS tipe_dtp, tp.booking_fee
    FROM unit_harga u LEFT JOIN tipe_unit tp ON tp.project = u.project AND tp.tipe = u.tipe
    WHERE u.project = ${project} AND u.unit = ${t.unit || ''}`)[0];
  const dtp = u ? (u.tipe ? Boolean(u.tipe_dtp) || Boolean(u.ppn_dtp) : Boolean(u.ppn_dtp)) : false;
  const pajak = hitungPajak(nilai, dtp, await bacaPajak(sql));
  const bf = Number(sk.bf_nominal) || Number((u || {}).booking_fee) || 0;
  const jadwal = buatJadwal({ nilaiKontrak: nilai, tglKontrak: tgl, skema: sk, bookingFee: bf });
  return { pajak, jadwal };
}

export async function bentukKontrak(sql, trxId, skemaKode, oleh, tglKontrak) {
  const t = (await sql`SELECT t.*, COALESCE(NULLIF(t.project, ''), l.project, '') AS project_efektif
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${trxId}`)[0];
  if (!t) throw new Error('Transaksi tidak ditemukan');
  const project = t.project_efektif;
  const sk = (await sql`SELECT * FROM skema_bayar WHERE project = ${project} AND kode = ${skemaKode}`)[0];
  if (!sk) throw new Error('Skema ' + skemaKode + ' tidak ada untuk ' + project);
  if (!sk.lengkap) throw new Error('Skema ' + sk.nama + ' belum dilengkapi aturannya di Settings → Skema Cara Bayar');
  const nilai = Number(t.harga_unit) || 0;
  if (nilai <= 0) throw new Error('Nilai transaksi (harga jual) belum diisi');
  const sudah = await sql`SELECT count(*)::int AS n FROM tagihan WHERE trx_id = ${trxId}`;
  if (sudah[0].n > 0) throw new Error('Jadwal tagihan kontrak ini sudah terbentuk');

  const tgl = tglKontrak || (t.tgl ? String(t.tgl).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const { pajak, jadwal } = await susunKontrak(sql, t, project, sk, nilai, tgl);

  await sql`UPDATE transactions SET skema_kode = ${sk.kode}, tgl_kontrak = ${tgl},
    dpp = ${pajak.dpp}, ppn = ${pajak.ppn}, ppn_dtp = ${pajak.ppn_dtp}, ppn_dev = ${pajak.ppn_dev}, jadwal_at = now()
    WHERE id = ${trxId}`;
  for (const b of jadwal) {
    await sql`INSERT INTO tagihan (trx_id, urutan, jenis, nama, jatuh_tempo, nilai)
      VALUES (${trxId}, ${b.urutan}, ${b.jenis}, ${b.nama}, ${b.jatuh_tempo}, ${b.nilai})`;
  }

  // Pembayaran yang sudah tercatat sebagai transaksi -> kuitansi, lalu dialokasikan FIFO
  const lama = await sql`SELECT id, tgl::text AS tgl, nilai, jenis, catatan, created_by FROM transactions
    WHERE lead_code = ${t.lead_code} AND unit = ${t.unit || ''} AND jenis <> 'Batal' AND nilai > 0 ORDER BY tgl, id`;
  let dipindah = 0;
  for (const p of lama) {
    const ada = await sql`SELECT 1 FROM pembayaran WHERE sumber_trx_id = ${p.id}`;
    if (ada.length) continue;
    const r = await sql`INSERT INTO pembayaran (trx_id, tgl, nilai, cara, keterangan, status, sumber_trx_id, dibuat_oleh, kw_oleh, kw_at)
      VALUES (${trxId}, ${p.tgl}, ${p.nilai}, 'Transfer', ${'Pembayaran ' + p.jenis + (p.catatan ? ' — ' + p.catatan : '')}, 'KW', ${p.id}, ${p.created_by || oleh}, ${oleh}, now())
      RETURNING id`;
    const pid = r[0].id;
    await sql`UPDATE pembayaran SET no_kw = ${nomorInternal('KW', pid)} WHERE id = ${pid}`;
    const al = await alokasiPembayaran(sql, trxId, p.nilai, null);
    for (const a of al.dipakai) await sql`INSERT INTO pembayaran_alokasi (pembayaran_id, tagihan_id, nilai) VALUES (${pid}, ${a.tagihan_id}, ${a.nilai})`;
    dipindah += 1;
  }
  return { skema: sk.nama, pajak, jadwal: jadwal.length, dipindah };
}

// Penjadwalan ulang (adjustment nilai kontrak / pindah unit berbeda harga):
// pajak dihitung ulang, baris pokok (BF/DP/angsuran/pelunasan/akad) dibentuk ulang,
// lalu SEMUA pembayaran yang sudah masuk dialokasikan kembali. Baris Biaya Administrasi
// dipertahankan; kontrak yang sudah punya denda diterbitkan ditolak (denda melekat pada
// jadwal lama). Seluruh syarat diperiksa SEBELUM ada data yang diubah.
// Periksa semua syarat penjadwalan ulang TANPA mengubah data (dipakai sebelum meminta otorisasi)
export async function cekJadwalUlang(sql, trxId, hargaBaru, unitBaru) {
  const t = (await sql`SELECT t.*, t.tgl_kontrak::text AS tgl_kontrak_txt, COALESCE(NULLIF(t.project, ''), l.project, '') AS project_efektif
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${trxId}`)[0];
  if (!t || !t.jadwal_at) throw new Error('Kontrak belum berjadwal');
  if (unitBaru) t.unit = unitBaru;   // pindah unit: pajak/DTP & booking fee mengikuti unit tujuan
  const nilai = Math.round(Number(hargaBaru) || 0);
  if (nilai <= 0) throw new Error('Nilai kontrak baru harus lebih dari 0');
  const project = t.project_efektif;
  const sk = (await sql`SELECT * FROM skema_bayar WHERE project = ${project} AND kode = ${t.skema_kode}`)[0];
  if (!sk) throw new Error('Skema ' + t.skema_kode + ' tidak ditemukan');

  // Kontrak yang punya catatan denda boleh dijadwal ulang, tetapi tidak otomatis: pemanggil wajib
  // meminta otorisasi tambahan (adaDenda). Baris denda & alokasi ke denda dipertahankan utuh.
  const adaDenda = (await sql`SELECT count(*)::int AS n FROM tagihan WHERE trx_id = ${trxId} AND jenis = 'DENDA'`)[0].n > 0;

  const tgl = t.tgl_kontrak_txt || String(t.tgl).slice(0, 10);
  const { pajak, jadwal } = await susunKontrak(sql, t, project, sk, nilai, tgl);
  const payAll = await sql`SELECT id, nilai, cara FROM pembayaran WHERE trx_id = ${trxId} AND status <> 'Batal' ORDER BY tgl, id`;
  // Bagian pembayaran yang sudah dialokasikan ke baris DENDA tidak ikut dialokasikan ulang
  const keDenda = await sql`SELECT a.pembayaran_id, sum(a.nilai)::bigint AS n FROM pembayaran_alokasi a JOIN tagihan g ON g.id = a.tagihan_id
    WHERE g.trx_id = ${trxId} AND g.jenis = 'DENDA' GROUP BY a.pembayaran_id`;
  const dendaMap = {}; keDenda.forEach(x => { dendaMap[x.pembayaran_id] = Number(x.n); });
  const pay = payAll.map(p => ({ ...p, nilai: Number(p.nilai) - (dendaMap[p.id] || 0) })).filter(p => p.nilai > 0);
  const totalBayar = pay.reduce((a, p) => a + Number(p.nilai), 0);
  const adm = await sql`SELECT id, nilai FROM tagihan WHERE trx_id = ${trxId} AND jenis = 'ADM' ORDER BY urutan`;
  const totalAdm = adm.reduce((a, r) => a + Number(r.nilai), 0);
  if (totalBayar > nilai + totalAdm) throw new Error('Pembayaran yang sudah masuk (Rp ' + totalBayar.toLocaleString('id-ID') + ') melebihi nilai kontrak baru (Rp ' + (nilai + totalAdm).toLocaleString('id-ID') + '). Batalkan / kembalikan kelebihan bayar dulu.');
  const akadBaru = jadwal.find(b => b.jenis === 'AKAD');
  const totalCair = pay.filter(p => p.cara === 'Pencairan KPR').reduce((a, p) => a + Number(p.nilai), 0);
  if (totalCair > 0 && (!akadBaru || totalCair > Number(akadBaru.nilai))) throw new Error('Pencairan bank yang sudah tercatat (Rp ' + totalCair.toLocaleString('id-ID') + ') tidak muat pada baris Akad yang baru.');
  return { t, nilai, pajak, jadwal, pay, totalBayar, adm, adaDenda };
}

export async function jadwalUlang(sql, trxId, hargaBaru) {
  const { nilai, pajak, jadwal, pay, totalBayar, adm, adaDenda } = await cekJadwalUlang(sql, trxId, hargaBaru);

  // --- semua syarat lolos: ubah data ---
  // Alokasi ke baris DENDA dan baris denda itu sendiri (termasuk jejak pemutihan) tidak disentuh
  await sql`DELETE FROM pembayaran_alokasi WHERE tagihan_id IN (SELECT id FROM tagihan WHERE trx_id = ${trxId} AND jenis <> 'DENDA')`;
  await sql`DELETE FROM tagihan WHERE trx_id = ${trxId} AND jenis NOT IN ('ADM', 'DENDA')`;
  await sql`UPDATE tagihan SET dibayar = 0, status = 'Belum' WHERE trx_id = ${trxId} AND jenis = 'ADM'`;
  for (const b of jadwal) {
    await sql`INSERT INTO tagihan (trx_id, urutan, jenis, nama, jatuh_tempo, nilai) VALUES (${trxId}, ${b.urutan}, ${b.jenis}, ${b.nama}, ${b.jatuh_tempo}, ${b.nilai})`;
  }
  // Urutan: baris pokok, lalu biaya administrasi, lalu denda (tetap dalam urutan semula)
  let u = jadwal.length;
  for (const r of adm) { u += 1; await sql`UPDATE tagihan SET urutan = ${u} WHERE id = ${r.id}`; }
  const dendaRows = await sql`SELECT id FROM tagihan WHERE trx_id = ${trxId} AND jenis = 'DENDA' ORDER BY urutan, id`;
  for (const r of dendaRows) { u += 1; await sql`UPDATE tagihan SET urutan = ${u}, asal_tagihan_id = NULL WHERE id = ${r.id}`; }
  await sql`UPDATE transactions SET harga_unit = ${nilai}, dpp = ${pajak.dpp}, ppn = ${pajak.ppn}, ppn_dtp = ${pajak.ppn_dtp}, ppn_dev = ${pajak.ppn_dev} WHERE id = ${trxId}`;

  // Alokasi ulang: pencairan bank ke baris Akad lebih dulu, sisanya FIFO menurut tanggal bayar
  const akadRow = (await sql`SELECT id FROM tagihan WHERE trx_id = ${trxId} AND jenis = 'AKAD' LIMIT 1`)[0];
  const urut = [...pay.filter(p => p.cara === 'Pencairan KPR'), ...pay.filter(p => p.cara !== 'Pencairan KPR')];
  for (const p of urut) {
    const al = await alokasiPembayaran(sql, trxId, Number(p.nilai), p.cara === 'Pencairan KPR' && akadRow ? akadRow.id : null, true);
    for (const a of al.dipakai) await sql`INSERT INTO pembayaran_alokasi (pembayaran_id, tagihan_id, nilai) VALUES (${p.id}, ${a.tagihan_id}, ${a.nilai})`;
  }
  return { jadwal: jadwal.length, pajak, dibayar: totalBayar, adaDenda };
}
