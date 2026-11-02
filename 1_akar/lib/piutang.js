// Fase 3 — Kontrak & Piutang (PRD CHL Biodistrict bagian 5.2 & 5.4).
// Kontrak = transaksi Booking yang telah diverifikasi. Dari kontrak dibangkitkan
// jadwal tagihan sesuai skema cara bayar; pembayaran dicatat per baris tagihan
// (TTS -> Kuitansi), sehingga sisa piutang selalu terhitung dari data, bukan dijumlah tangan.

// ---------- pajak ----------
// Tarif dan aturan DTP diambil dari pengaturan (bukan ditanam di kode) — dikonfirmasi Finance.
export const PAJAK_DEFAULT = { ppn_persen: 11, dtp_persen: 100, dtp_batas: 2000000000 };

export async function bacaPajak(sql) {
  const r = await sql`SELECT items FROM settings WHERE key = 'pajak'`;
  const p = (r.length && r[0].items) || {};
  return { ...PAJAK_DEFAULT, ...(typeof p === 'object' && !Array.isArray(p) ? p : {}) };
}

// nilai kontrak (include PPN) -> DPP, PPN, bagian PPN ditanggung pemerintah (DTP) & developer
export function hitungPajak(nilaiKontrak, unitDtp, pajak) {
  const n = Math.max(0, Math.round(Number(nilaiKontrak) || 0));
  const tarif = Number(pajak.ppn_persen) / 100;
  const dpp = Math.round(n / (1 + tarif));
  const ppn = n - dpp;
  let ppnDtp = 0;
  if (unitDtp && Number(pajak.dtp_persen) > 0) {
    // DTP hanya atas bagian harga sampai batas (mis. 2 miliar pertama), sesuai skema pemerintah
    const dasarDtp = Math.min(dpp, Math.round(Number(pajak.dtp_batas) / (1 + tarif)));
    ppnDtp = Math.round(dasarDtp * tarif * Number(pajak.dtp_persen) / 100);
  }
  return { nilai_kontrak: n, dpp, ppn, ppn_dtp: ppnDtp, ppn_dev: ppn - ppnDtp };
}

// ---------- jadwal tagihan ----------
const tambahHari = (tgl, hari) => { const d = new Date(tgl); d.setUTCDate(d.getUTCDate() + Number(hari || 0)); return d.toISOString().slice(0, 10); };

// Membangkitkan baris tagihan dari skema: BF -> DP (n termin) -> angsuran / pelunasan.
// Pembulatan diserap baris terakhir agar jumlah baris = nilai kontrak persis.
export function buatJadwal({ nilaiKontrak, tglKontrak, skema, bookingFee }) {
  const total = Math.round(Number(nilaiKontrak) || 0);
  const bf = Math.min(total, Math.round(Number(bookingFee ?? skema.bf_nominal) || 0));
  const baris = [];
  let sisa = total - bf, terakhir = tglKontrak;
  if (bf > 0) baris.push({ jenis: 'BF', nama: 'Booking Fee', jatuh_tempo: tglKontrak, nilai: bf });

  const dpPersen = skema.subsidi_dp ? 0 : Number(skema.dp_persen) || 0;
  const dpNominal = skema.subsidi_dp ? 0 : Math.max(0, Math.round(Number(skema.dp_nominal) || 0));
  if (dpNominal > 0 || dpPersen > 0) {
    // DP nominal tetap (mis. KPR bersubsidi pemerintah) diutamakan atas persentase bila keduanya terisi
    const dpTotal = Math.min(sisa, dpNominal > 0 ? dpNominal : Math.round(total * dpPersen / 100));
    const termin = Math.max(1, Number(skema.dp_termin) || 1);
    const per = Math.floor(dpTotal / termin);
    for (let i = 0; i < termin; i++) {
      const jt = tambahHari(tglKontrak, Number(skema.dp_hari || 0) + i * 30);
      baris.push({ jenis: 'DP', nama: termin > 1 ? 'Uang Muka ' + (i + 1) : 'Uang Muka', jatuh_tempo: jt,
        nilai: i === termin - 1 ? dpTotal - per * (termin - 1) : per });
      terakhir = jt;
    }
    sisa -= dpTotal;
  } else {
    terakhir = tambahHari(tglKontrak, Number(skema.dp_hari || 0));
  }

  if (skema.jenis === 'cicilan' && Number(skema.angsuran_jumlah) > 0) {
    const n = Number(skema.angsuran_jumlah), per = Math.floor(sisa / n), jarak = Math.max(1, Number(skema.angsuran_interval_hari) || 30);
    for (let i = 0; i < n; i++) {
      const jt = tambahHari(terakhir, jarak * (i + 1));
      baris.push({ jenis: 'ANG', nama: 'Angsuran ' + (i + 1) + '/' + n, jatuh_tempo: jt, nilai: i === n - 1 ? sisa - per * (n - 1) : per });
    }
  } else if (sisa > 0) {
    baris.push({ jenis: skema.jenis === 'kpr' ? 'AKAD' : 'PELUNASAN',
      nama: skema.jenis === 'kpr' ? 'Pelunasan KPR (akad)' : 'Pelunasan',
      jatuh_tempo: tambahHari(terakhir, Number(skema.pelunasan_hari || 0)), nilai: sisa });
  }
  baris.forEach((b, i) => { b.urutan = i + 1; });
  return baris;
}

// ---------- pembayaran ----------
// Total pembayaran masuk sebuah kontrak. Setelah jadwal terbentuk, sumbernya
// tabel pembayaran (kuitansi & TTS yang belum dibatalkan); sebelum itu, cara lama
// (jumlah nilai transaksi) tetap dipakai agar tidak ada yang berubah mendadak.
export async function totalBayar(sql, trx) {
  const ada = await sql`SELECT COALESCE(sum(nilai), 0)::bigint AS total, count(*)::int AS n FROM pembayaran
    WHERE trx_id = ${trx.id} AND status <> 'Batal'`;
  if (ada[0].n > 0) return Number(ada[0].total) || 0;
  const lama = await sql`SELECT COALESCE(sum(nilai), 0)::bigint AS total FROM transactions
    WHERE lead_code = ${trx.lead_code} AND unit = ${trx.unit || ''} AND jenis <> 'Batal'`;
  return Number(lama[0].total) || 0;
}

// Alokasikan sebuah pembayaran ke baris tagihan tertua yang belum lunas (FIFO)
export async function alokasiPembayaran(sql, trxId, nilai, tagihanId, tanpaDenda) {
  let sisa = Math.round(Number(nilai) || 0);
  // tanpaDenda: dipakai penjadwalan ulang — baris denda yang sudah ada tidak ikut menerima alokasi baru
  const baris = tagihanId
    ? await sql`SELECT id, nilai, dibayar FROM tagihan WHERE id = ${tagihanId} AND trx_id = ${trxId}`
    : tanpaDenda
      ? await sql`SELECT id, nilai, dibayar FROM tagihan WHERE trx_id = ${trxId} AND jenis <> 'DENDA' AND dibayar < nilai ORDER BY urutan`
      : await sql`SELECT id, nilai, dibayar FROM tagihan WHERE trx_id = ${trxId} AND dibayar < nilai ORDER BY urutan`;
  const dipakai = [];
  for (const t of baris) {
    if (sisa <= 0) break;
    const kurang = Number(t.nilai) - Number(t.dibayar);
    const pakai = Math.min(kurang, sisa);
    if (pakai <= 0) continue;
    await sql`UPDATE tagihan SET dibayar = dibayar + ${pakai},
      status = CASE WHEN dibayar + ${pakai} >= nilai THEN 'Lunas' ELSE 'Sebagian' END WHERE id = ${t.id}`;
    dipakai.push({ tagihan_id: t.id, nilai: pakai });
    sisa -= pakai;
  }
  return { dipakai, lebih: sisa };   // 'lebih' = kelebihan bayar yang tidak teralokasi
}
