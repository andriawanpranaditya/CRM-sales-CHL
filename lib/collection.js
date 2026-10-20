// ===== Collection & KPR: jadwal tagihan per konsumen (dari skema cara bayar price list), pembayaran, dan ringkasan =====
// Skema (mengikuti Simulasi Cara Bayar):
//  · BIO DISTRICT — KPR: Booking Fee → DP (0% subsidi, atau DP manual) hari ke-14 → sisanya via akad bank (bukan tagihan collection)
//                 — Cash Keras: BF → sisa DP 10% hari ke-14 → pelunasan hari ke-30
//                 — Cash Bertahap: BF → Cicilan 1 (DP 10%) hari ke-14 → cicilan 2..n tiap bulan (30 hari setelah cicilan 1)
//  · PERMAI INDAH — KPR BTN subsidi: BF Rp500 rb → Uang Muka Rp1.350.000 hari ke-14 → plafon via akad bank
export const PERMAI = { harga: 185000000, bf: 500000, um: 1350000 };
const plusHari = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const plusBulan = (s, n) => { const d = new Date(s + 'T00:00:00Z'); const hari = d.getUTCDate(); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)); const akhir = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(hari, akhir)); return t.toISOString().slice(0, 10); };

let siap = false;
export async function siapkanCollection(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS tagihan (
    id serial PRIMARY KEY, lead_code text NOT NULL, project text, unit text, urut integer NOT NULL, jenis text, ket text,
    jatuh_tempo date, nominal numeric, sumber text DEFAULT 'auto', nonaktif boolean DEFAULT false, catatan text,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (lead_code, unit, urut))`;
  await sql`CREATE TABLE IF NOT EXISTS pembayaran (
    id serial PRIMARY KEY, tagihan_id integer, lead_code text NOT NULL, tgl date NOT NULL, nominal numeric NOT NULL, cara text, bukti_nama text, bukti_mime text, bukti_data text,
    catatan text, created_by text, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS pembayaran_tagihan_idx ON pembayaran (tagihan_id)`;
  siap = true;
}

// Susun jadwal tagihan satu konsumen/unit dari transaksinya
export function susunTagihan({ project, bayar, harga, tglBooking, bf, cicilan, tglReserved, tandaJadi }) {
  const rows = [];
  let u = 0;
  if (tglReserved && tandaJadi > 0) rows.push({ urut: ++u, jenis: 'Tanda jadi', ket: 'Tanda jadi (Reserved)', jatuh_tempo: tglReserved, nominal: tandaJadi });
  if (!tglBooking) return rows;
  const isPermai = /permai/i.test(project || '');
  const kpr = /kpr/i.test(bayar || ''), keras = /keras/i.test(bayar || ''), bertahap = /bertahap/i.test(bayar || '');
  const hrg = Number(harga) || (isPermai ? PERMAI.harga : 0);
  const BF = Number(bf) || (isPermai ? PERMAI.bf : 0);
  rows.push({ urut: ++u, jenis: 'Booking fee', ket: 'Booking Fee', jatuh_tempo: tglBooking, nominal: BF });
  const tDP = plusHari(tglBooking, 14);
  if (isPermai || (kpr && !keras && !bertahap)) {
    if (isPermai) rows.push({ urut: ++u, jenis: 'Uang muka', ket: 'Uang Muka (KPR BTN subsidi)', jatuh_tempo: tDP, nominal: PERMAI.um });
    // Bio KPR: DP 0% (subsidi) — tidak ada tagihan DP; sisanya via akad bank (dipantau di Proses KPR)
    return rows;
  }
  if (!hrg) return rows;
  const dp = Math.round(hrg * 0.10);
  if (keras) {
    rows.push({ urut: ++u, jenis: 'DP', ket: 'Sisa DP 10% (termasuk BF)', jatuh_tempo: tDP, nominal: Math.max(0, dp - BF) });
    rows.push({ urut: ++u, jenis: 'Pelunasan', ket: 'Pelunasan cash keras', jatuh_tempo: plusHari(tglBooking, 30), nominal: hrg - dp });
    return rows;
  }
  if (bertahap) {
    const n = Math.max(2, Number(cicilan) || 24);
    rows.push({ urut: ++u, jenis: 'Cicilan', ket: `Cicilan 1 dari ${n} — DP 10% (termasuk BF)`, jatuh_tempo: tDP, nominal: Math.max(0, dp - BF) });
    const sisa = hrg - dp, cic = Math.round(sisa / (n - 1) / 1000) * 1000, t2 = plusHari(tDP, 30);
    for (let k = 2; k <= n; k++) rows.push({ urut: ++u, jenis: 'Cicilan', ket: `Cicilan ${k} dari ${n}${k === n ? ' (terakhir)' : ''}`, jatuh_tempo: plusBulan(t2, k - 2), nominal: k === n ? sisa - cic * (n - 2) : cic });
    return rows;
  }
  return rows;
}

// Bentuk/perbarui jadwal tagihan dari transaksi: baris 'auto' yang belum pernah diubah manual mengikuti transaksi; baris 'manual' dibiarkan
export async function sinkronTagihan(sql) {
  await siapkanCollection(sql);
  const trx = await sql`SELECT t.id, t.lead_code, t.jenis, t.tgl::text AS tgl, t.nilai, t.nilai_jual, t.unit, t.cicilan,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar
    FROM transactions t JOIN leads l ON l.lead_code = t.lead_code WHERE t.unit IS NOT NULL AND t.unit <> '' ORDER BY t.lead_code, t.unit, t.id`;
  const grup = new Map();
  for (const t of trx) {
    const k = t.lead_code + '|' + t.unit;
    const g = grup.get(k) || { lead_code: t.lead_code, unit: t.unit, project: t.project, bayar: '', harga: null, tglBooking: null, bf: 0, cicilan: null, tglReserved: null, tandaJadi: 0, batal: false };
    if (t.jenis === 'Reserved' && !g.tglReserved) { g.tglReserved = t.tgl; g.tandaJadi = Number(t.nilai || 0); }
    if ((t.jenis === 'Booking' || t.jenis === 'Closing') && !g.tglBooking) { g.tglBooking = t.tgl; g.bf = Number(t.nilai || 0); }
    if (t.nilai_jual) g.harga = Number(t.nilai_jual);
    if (t.bayar) g.bayar = t.bayar;
    if (t.cicilan) g.cicilan = t.cicilan;
    g.batal = t.jenis === 'Batal';
    grup.set(k, g);
  }
  const ada = await sql`SELECT id, lead_code, unit, urut, sumber, nonaktif FROM tagihan`;
  const peta = {}; ada.forEach(r => { peta[r.lead_code + '|' + r.unit + '|' + r.urut] = r; });
  for (const g of grup.values()) {
    const urutAda = ada.filter(r => r.lead_code === g.lead_code && r.unit === g.unit);
    if (urutAda.some(r => r.sumber === 'impor')) continue; // posisi diimpor dari Report Detail (saldo awal) → jadwal otomatis tidak dibuat
    const rows = g.batal ? [] : susunTagihan(g);
    for (const r of rows) {
      const lama = peta[g.lead_code + '|' + g.unit + '|' + r.urut];
      if (lama && lama.sumber === 'manual') continue; // sudah disesuaikan Collection → jangan ditimpa
      await sql`INSERT INTO tagihan (lead_code, project, unit, urut, jenis, ket, jatuh_tempo, nominal, sumber)
        VALUES (${g.lead_code}, ${g.project}, ${g.unit}, ${r.urut}, ${r.jenis}, ${r.ket}, ${r.jatuh_tempo}, ${r.nominal}, 'auto')
        ON CONFLICT (lead_code, unit, urut) DO UPDATE SET project = EXCLUDED.project, jenis = EXCLUDED.jenis, ket = EXCLUDED.ket, jatuh_tempo = EXCLUDED.jatuh_tempo, nominal = EXCLUDED.nominal, updated_at = now()
        WHERE tagihan.sumber = 'auto'`;
    }
    // baris auto yang tidak lagi ada di jadwal (mis. batal / skema berubah) → nonaktif
    const urutBaru = new Set(rows.map(r => r.urut));
    for (const r of urutAda) if (r.sumber === 'auto' && !urutBaru.has(r.urut) && !r.nonaktif) await sql`UPDATE tagihan SET nonaktif = true, updated_at = now() WHERE id = ${r.id}`;
  }
}

// Daftar tagihan + terbayar + status
export async function daftarTagihan(sql, { pp = null, hariIni }) {
  await sinkronTagihan(sql);
  const rows = await sql`SELECT g.id, g.lead_code, g.project, g.unit, g.urut, g.jenis, g.ket, g.jatuh_tempo::text AS jatuh_tempo, g.nominal, g.sumber, g.nonaktif, g.catatan,
      l.nama, l.sales, l.wa, l.created_by AS lead_by, COALESCE(NULLIF(l.bayar, ''), '') AS bayar,
      COALESCE((SELECT sum(p.nominal) FROM pembayaran p WHERE p.tagihan_id = g.id), 0)::numeric AS terbayar,
      (SELECT max(p.tgl)::text FROM pembayaran p WHERE p.tagihan_id = g.id) AS tgl_bayar_terakhir
    FROM tagihan g LEFT JOIN leads l ON l.lead_code = g.lead_code
    WHERE g.nonaktif = false AND (${pp}::text[] IS NULL OR g.project = ANY(${pp}::text[])) ORDER BY g.jatuh_tempo, g.lead_code, g.urut`;
  return rows.map(r => {
    const nominal = Number(r.nominal || 0), terbayar = Number(r.terbayar || 0), sisa = Math.max(0, nominal - terbayar);
    const lewat = r.jatuh_tempo && r.jatuh_tempo < hariIni;
    const status = nominal <= 0 ? 'Tidak ada tagihan' : sisa <= 0 ? 'Lunas' : terbayar > 0 ? (lewat ? 'Kurang bayar' : 'Sebagian') : lewat ? 'Tunggakan' : 'Belum jatuh tempo';
    const hariLewat = lewat ? Math.round((Date.parse(hariIni) - Date.parse(r.jatuh_tempo)) / 86400000) : 0;
    return { ...r, nominal, terbayar, sisa, status, hariLewat, hariKe: r.jatuh_tempo ? Math.round((Date.parse(r.jatuh_tempo) - Date.parse(hariIni)) / 86400000) : null };
  });
}

export function ringkasTagihan(rows, hariIni) {
  const bln = hariIni.slice(0, 7), t7 = new Date(Date.parse(hariIni) + 7 * 86400000).toISOString().slice(0, 10);
  const aktif = rows.filter(r => r.nominal > 0);
  const jatuh7 = aktif.filter(r => r.sisa > 0 && r.jatuh_tempo <= t7);
  const tunggak = aktif.filter(r => r.sisa > 0 && r.jatuh_tempo < hariIni);
  const bulanIni = aktif.filter(r => r.jatuh_tempo && r.jatuh_tempo.startsWith(bln));
  const perJenis = {};
  bulanIni.forEach(r => { const j = r.jenis === 'Cicilan' ? 'Cicilan cash bertahap' : r.jenis === 'Pelunasan' ? 'Pelunasan cash keras' : 'Booking fee / DP / tanda jadi'; const x = perJenis[j] || (perJenis[j] = { jenis: j, tagihan: 0, terbayar: 0 }); x.tagihan += r.nominal; x.terbayar += Math.min(r.terbayar, r.nominal); });
  return {
    jatuh7: { n: jatuh7.length, nilai: jatuh7.reduce((a, r) => a + r.sisa, 0) },
    tunggak: { n: tunggak.length, nilai: tunggak.reduce((a, r) => a + r.sisa, 0), konsumen: new Set(tunggak.map(r => r.lead_code)).size },
    bulan: { tagihan: bulanIni.reduce((a, r) => a + r.nominal, 0), terbayar: bulanIni.reduce((a, r) => a + Math.min(r.terbayar, r.nominal), 0), n: bulanIni.length },
    perJenis: Object.values(perJenis),
  };
}

// ===== Kolom tambahan untuk data kontrak (mengikuti Report Detail Permai): no kontrak, skema bayar, tipe sales =====
let siapKontrak = false;
export async function siapkanKontrak(sql) {
  if (siapKontrak) return;
  await siapkanCollection(sql);
  try {
    await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS no_kontrak text`; await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS skema text`;
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_tipe text`; await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_kantor text`; await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_hp text`;
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS potensi_batal boolean`;
  } catch {}
  siapKontrak = true;
}

// ===== Data kontrak per konsumen (satu baris per unit terjual) + posisi keuangan ala Report Detail =====
// nilai kontrak · tagihan jatuh tempo (sudah harus dibayar s.d. hari ini) · outstanding (belum jatuh tempo) · actual (terbayar) · remainder (jatuh tempo belum dibayar) · aging remainder
export async function daftarKontrak(sql, { pp = null, hariIni }) {
  await siapkanKontrak(sql);
  const trx = await sql`SELECT t.id, t.lead_code, t.jenis, t.tgl::text AS tgl, t.nilai, t.nilai_jual, t.unit, t.cicilan, t.no_kontrak, t.skema, t.catatan,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar,
      l.nama, l.sales, l.wa, l.sales_tipe, l.sales_kantor, l.sales_hp, l.created_by AS lead_by, l.potensi_batal
    FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.unit IS NOT NULL AND t.unit <> '' AND (${pp}::text[] IS NULL OR COALESCE(NULLIF(t.project, ''), l.project, '') = ANY(${pp}::text[])) ORDER BY t.lead_code, t.unit, t.id`;
  const grup = new Map();
  for (const t of trx) {
    const k = t.lead_code + '|' + t.unit;
    const g = grup.get(k) || { lead_code: t.lead_code, unit: t.unit, project: t.project, nama: t.nama, sales: t.sales || '', wa: t.wa, sales_tipe: t.sales_tipe || '', sales_kantor: t.sales_kantor || '', sales_hp: t.sales_hp || '', lead_by: t.lead_by, potensi_batal: !!t.potensi_batal,
      tgl_kontrak: null, no_kontrak: '', skema: '', bayar: '', nilai: 0, tgl_batal: null, catatan: '', booking: false };
    if (t.jenis === 'Reserved' && !g.tgl_kontrak) g.tgl_kontrak = t.tgl;
    if ((t.jenis === 'Booking' || t.jenis === 'Closing')) { g.booking = true; g.tgl_kontrak = g.tgl_kontrak || t.tgl; if (!g.no_kontrak && t.no_kontrak) g.no_kontrak = t.no_kontrak; }
    if (t.jenis === 'Batal') g.tgl_batal = t.tgl;
    if (t.nilai_jual) g.nilai = Number(t.nilai_jual);
    if (t.bayar) g.bayar = t.bayar;
    if (t.skema) g.skema = t.skema;
    if (t.catatan && t.jenis !== 'Batal') g.catatan = t.catatan;
    g.terakhir = t.jenis;
    grup.set(k, g);
  }
  const rows = [...grup.values()].filter(g => g.booking && g.terakhir !== 'Batal');
  const kodes = [...new Set(rows.map(r => r.lead_code))];
  const [tag, bayar, kpr, bank] = kodes.length ? await Promise.all([
    sql`SELECT id, lead_code, unit, jenis, ket, jatuh_tempo::text AS jatuh_tempo, nominal, nonaktif FROM tagihan WHERE lead_code = ANY(${kodes}::text[]) AND nonaktif = false`,
    sql`SELECT tagihan_id, lead_code, tgl::text AS tgl, nominal FROM pembayaran WHERE lead_code = ANY(${kodes}::text[])`,
    sql`SELECT id, lead_code, profil, berkas, slik_tgl::text AS slik_tgl, slik_status, bi_hasil, bi_pinjaman, bi_status, sertifikat, lpa, slf, surat_pernyataan, alamat_ktp, kota, akad_bank_id, akad_tgl::text AS akad_tgl, akad_realisasi::text AS akad_realisasi, catatan FROM kpr WHERE lead_code = ANY(${kodes}::text[])`,
    sql`SELECT b.id, b.kpr_id, b.bank, b.cabang, b.tahap, b.kendala FROM kpr_bank b JOIN kpr k ON k.id = b.kpr_id WHERE k.lead_code = ANY(${kodes}::text[]) ORDER BY b.id`,
  ]) : [[], [], [], []];
  const B = [0, 30, 60, 90, 120];
  return rows.map(g => {
    const tg = tag.filter(x => x.lead_code === g.lead_code && (x.unit || '') === (g.unit || ''));
    const byr = bayar.filter(x => x.lead_code === g.lead_code);
    const actual = byr.reduce((a, x) => a + Number(x.nominal || 0), 0);
    const bayarPerTagihan = {}; byr.forEach(x => { if (x.tagihan_id) bayarPerTagihan[x.tagihan_id] = (bayarPerTagihan[x.tagihan_id] || 0) + Number(x.nominal || 0); });
    const jatuh = tg.filter(x => x.jatuh_tempo && x.jatuh_tempo <= hariIni);
    const tagihanJT = jatuh.reduce((a, x) => a + Number(x.nominal || 0), 0);
    const aging = [0, 0, 0, 0, 0];
    let remainder = 0;
    jatuh.forEach(x => { const sisa = Math.max(0, Number(x.nominal || 0) - (bayarPerTagihan[x.id] || 0)); if (sisa <= 0) return; remainder += sisa; const hari = Math.round((Date.parse(hariIni) - Date.parse(x.jatuh_tempo)) / 86400000); const i = hari <= 30 ? 0 : hari <= 60 ? 1 : hari <= 90 ? 2 : hari <= 120 ? 3 : 4; aging[i] += sisa; });
    const k = kpr.find(x => x.lead_code === g.lead_code) || null;
    const bk = k ? bank.filter(b => b.kpr_id === k.id) : [];
    const akadBank = k ? (bk.find(b => b.id === k.akad_bank_id) || {}) : {};
    const bankAktif = bk.filter(b => !['Ditolak', 'Tidak dilanjutkan'].includes(b.tahap));
    const kprStatus = !k ? '' : k.akad_realisasi ? 'Akad Kredit' : k.akad_tgl ? 'Rencana akad' : bankAktif.some(b => b.tahap === 'SP3K terbit') ? 'SP3K' : bk.length && !bankAktif.length ? 'Reject' : bk.length ? 'Proses' : (k.slik_tgl ? 'Siap diajukan' : 'Verifikasi');
    const kpr_ = /kpr/i.test(g.bayar || g.skema || ''), bertahap = /bertahap|angsuran/i.test(g.bayar || g.skema || '');
    const lunas = g.nilai > 0 && actual >= g.nilai - 1;
    const kategori = g.potensi_batal || kprStatus === 'Reject' ? 'Potensi Batal' : lunas ? (kpr_ && k?.akad_realisasi ? 'Akad KPR' : 'Lunas') : kpr_ ? (k?.akad_realisasi ? 'Akad KPR' : 'Proses KPR') : bertahap ? 'Proses Tunai Angsuran' : (actual >= g.nilai - 1 ? 'Lunas' : 'Proses Tunai Angsuran');
    const ppn = /keras/i.test(g.bayar || g.skema || '') && g.nilai ? Math.round(g.nilai - g.nilai / 1.11) : 0;
    return { ...g, kpr_id: k?.id || null, kprStatus, bank: akadBank.bank ? akadBank.bank + (akadBank.cabang ? ' ' + akadBank.cabang : '') : bankAktif.map(b => b.bank + (b.cabang ? ' ' + b.cabang : '')).join(', '), tgl_akad: k?.akad_realisasi || null, rencana_akad: k?.akad_tgl || null,
      kpr: k ? { profil: k.profil, berkas: k.berkas || [], slik_tgl: k.slik_tgl, slik_status: k.slik_status, bi_hasil: k.bi_hasil, bi_pinjaman: k.bi_pinjaman, bi_status: k.bi_status, sertifikat: k.sertifikat, lpa: k.lpa, slf: k.slf, surat_pernyataan: k.surat_pernyataan, alamat_ktp: k.alamat_ktp, kota: k.kota, catatan: k.catatan } : null,
      excl: g.nilai - ppn, ppn, tagihanJT, outstanding: Math.max(0, g.nilai - tagihanJT), actual, remainder, aging, kategori, nTagihan: tg.length, _B: B };
  }).sort((a, b) => String(a.tgl_kontrak || '').localeCompare(String(b.tgl_kontrak || '')) || a.unit.localeCompare(b.unit));
}

// Resume Collection (seperti sheet Resume): per kategori
export function resumeKontrak(rows) {
  const KAT = ['Lunas', 'Akad KPR', 'Proses Tunai Angsuran', 'Proses KPR', 'Potensi Batal'];
  const res = KAT.map(k => { const r = rows.filter(x => x.kategori === k); const s = f => r.reduce((a, x) => a + (x[f] || 0), 0);
    return { uraian: k === 'Lunas' ? 'Customer Lunas' : k === 'Akad KPR' ? 'Customer Akad KPR' : k, kategori: k, unit: r.length, revenue: s('nilai'), tagihan: s('tagihanJT'), outstanding: s('outstanding'), actual: s('actual'), remainder: s('remainder'), aging: [0, 1, 2, 3, 4].map(i => r.reduce((a, x) => a + (x.aging[i] || 0), 0)) }; });
  const tot = { uraian: 'Total', kategori: 'Total', unit: rows.length, revenue: res.reduce((a, x) => a + x.revenue, 0), tagihan: res.reduce((a, x) => a + x.tagihan, 0), outstanding: res.reduce((a, x) => a + x.outstanding, 0), actual: res.reduce((a, x) => a + x.actual, 0), remainder: res.reduce((a, x) => a + x.remainder, 0), aging: [0, 1, 2, 3, 4].map(i => res.reduce((a, x) => a + x.aging[i], 0)) };
  return { baris: res, total: tot };
}
