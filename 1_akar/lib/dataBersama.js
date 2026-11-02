// Data Bersama — pengganti Google Sheets "Data Sales Bio District".
// Nama tab, urutan, dan judul kolom sengaja disamakan PERSIS dengan sheet lama
// agar divisi lain tidak perlu menyesuaikan diri. Kolom yang datanya belum
// tersedia di Harmoni One tetap ditampilkan (kosong) dan akan terisi otomatis
// setelah fase terkait selesai.

import { DEFAULT_UNITS } from '@/lib/db';
import { hargaEfektif } from '@/lib/harga';
import { reservasiLewat } from '@/lib/reservasi';

// Peta atribut & harga efektif per unit (Fase 2 · master unit)
async function petaUnit(sql) {
  const [u, t] = await Promise.all([sql`SELECT * FROM unit_harga`, sql`SELECT * FROM tipe_unit`]);
  const tm = {}; t.forEach(x => { tm[x.project + '|' + x.tipe] = x; });
  const m = {};
  u.forEach(x => { m[x.project + '|' + x.unit] = { ...hargaEfektif(x, x.tipe ? tm[x.project + '|' + x.tipe] : null), tipe: x.tipe || '', hoek: x.hoek }; });
  return m;
}
const diskon = (list, jual) => (Number(list) > 0 && Number(jual) > 0 && Number(list) > Number(jual) ? Number(list) - Number(jual) : '');

export const TAB = {
  Agent: { fase: 1, kolom: ['NO', 'TIPE', 'LEVEL', 'ATASAN', 'KODE MARKETING', 'NAMA', 'STATUS', 'TGL. INAKTIF', 'ALAMAT', 'EMAIL', 'NO. TELP', 'NO. HP', 'NO. WA', 'NPWP', 'REKENING', 'BANK', 'ATAS NAMA'] },
  Sales: { fase: 1, kolom: ['NO', 'TGL. KONTRAK', 'NO. KONTRAK', 'CUSTOMER', 'SALES', 'SUB KOORDINATOR', 'PROJECT', 'UNIT', 'TIPE', 'TIPE PROPERTY', 'LUAS TANAH', 'LUAS BANGUNAN', 'ARAH HADAP', 'TGL. BATAL', 'PRICE LIST', 'DISKON', 'DISKON UP VALUE', 'TAMBAHAN HARGA GIMMICK', 'TAMBAHAN HARGA LAIN - LAIN', 'BUNGA', 'NILAI KONTRAK (INCLUDE PPN)', 'NILAI KONTRAK (EXCLUDE PPN)', 'PPN', 'PPN (DEVELOPER)', 'PPN (DTP)', 'SKEMA BAYAR'] },
  Customer: { fase: 1, kolom: ['NO', 'NAMA', 'TIPE', 'SUMBER', 'NO. UNIT', 'SALES ACCOUNT', 'NAMA BISNIS', 'JENIS BISNIS', 'MERK BISNIS', 'AGAMA', 'TGL. LAHIR', 'NO. TELP', 'NO. HP', 'NO. KANTOR', 'NO. FAX', 'EMAIL', 'KTP', 'ALAMAT SURAT MENYURAT', 'ALAMAT KTP', 'KOTA / KABUPATEN', 'NPWP', 'ALAMAT NPWP', 'SIFAT', 'NO. UNIT TERAKHIR', 'LUAS SEMI GROSS', 'HARGA JUAL TERAKHIR', 'CARA BAYAR', 'TGL. SP', 'TGL. INPUT', 'TGL. TRANSAKSI TERAKHIR', 'PROJECT', 'STATUS'] },
  Tagihan: { fase: 1, kolom: ['NO. TAGIHAN', 'NO. KONTRAK', 'STATUS', 'TGL. KONTRAK', 'SKEMA CARA BAYAR', 'CUSTOMER', 'NO. TELP', 'NO. HP', 'UNIT', 'TIPE', 'TAGIHAN', 'TGL JATUH TEMPO', 'NILAI TAGIHAN', 'NILAI PELUNASAN', 'SISA TAGIHAN', 'EMAIL', 'KTP', 'ALAMAT SURAT MENYURAT', 'ALAMAT KTP', 'KOTA / KABUPATEN', 'NPWP', 'ALAMAT NPWP', 'SIFAT', 'NO. UNIT TERAKHIR', 'LUAS SEMI GROSS', 'HARGA JUAL TERAKHIR', 'CARA BAYAR', 'TGL. SP', 'TGL. INPUT', 'TGL. TRANSAKSI TERAKHIR', 'PROJECT'] },
  TTS: { fase: 1, kolom: ['NO.', 'TGL. TTS', 'NO.TTS', 'TGL. KWT', 'NO. KWT', 'STATUS', 'KASIR', 'TIPE', 'TAGIHAN', 'NO. KONTRAK', 'SKEMA CARA BAYAR', 'UNIT', 'CUSTOMER', 'CARA BAYAR', 'KETERANGAN', 'NO. BG', 'TGL. BG', 'REKENING', 'BANK', 'PELUNASAN HUTANG', 'PEMBULATAN', 'TOTAL PEMBAYARAN'] },
  Batal: { fase: 1, kolom: ['NO.', 'TGL. KONTRAK', 'NO. KONTRAK', 'SKEMA CARA BAYAR', 'CUSTOMER', 'SALES', 'UNIT', 'TIPE', 'PRICELIST', 'DISKON', 'BUNGA', 'TGL. BATAL', 'NILAI KONTRAK', 'PEMBAYARAN', 'PENGEMBALIAN', 'AMOUNT NON RF', 'DPP', 'PPN', 'LUAS TANAH', 'LUAS BANGUNAN', 'TOTAL PEMBAYARAN', 'STATUS', 'SUB KOORDINATOR', 'PROJECT', 'TIPE PROPERTY', 'ARAH HADAP', 'TGL. LAST PAYMENT', 'TGL. PENGAJUAN RF', 'KETERANGAN'] },
  Pricelist: { fase: 1, kolom: ['NO. URUT', 'NO. KONTRAK', 'TGL. INPUT', 'LOKASI', 'TIPE', 'NO. UNIT', 'LUAS SG', 'LUAS NETT', 'STATUS', 'CASH KERAS', 'CICILAN 12X', 'CICILAN 18X', 'CICILAN 24X', 'CICILAN 30X', 'KPR SUPER EXPRESS', 'KPR ULTRA EXPRESS', 'KPR DP 10% - 4X', 'KPR DP 20% - 6X', 'KPR EXTRA EXPRESS'] },
  Escrow: { fase: 1, kolom: ['NO. TAGIHAN', 'NO. KONTRAK', 'TGL. KONTRAK', 'SKEMA CARA BAYAR', 'CUSTOMER', 'UNIT', 'TGL. AKAD', 'BANK', 'TAGIHAN', 'TERM', 'NILAI KONTRAK', 'UANG MUKA', 'PLAFOND', 'TGL. JATUH TEMPO', 'NILAI TAGIHAN', 'TGL. PENCAIRAN', 'PENCAIRAN', 'SISA TAGIHAN', 'KET'] },
  P3U: { fase: 1, kolom: ['TGL. KONTRAK', 'NO. KONTRAK', 'NAMA CUSTOMER', 'NO UNIT', 'TGL. P3U', 'NO. P3U'] },
  Bast: { fase: 1, kolom: ['NO.', 'NO BAST', 'KATEGORI BAST', 'NO STR', 'NO UNIT', 'NAMA CUSTOMER', 'TANGGAL BAST', 'TANGGAL TTD BAST', 'TANGGAL AKAD', 'NILAI KONTRAK(INCLUDE PPN)', 'NILAI KONTRAK(EXCLUDE PPN)', 'PPN', 'PPN (EXCLUDE DTP)', 'PPN DTP', 'SKEMA CARA BAYAR'] },
  Forecast: { fase: 1, kolom: ['NO. TAGIHAN', 'NO. KONTRAK', 'TGL. KONTRAK', 'SKEMA CARA BAYAR', 'CUSTOMER', 'UNIT', 'TGL. AKAD', 'BANK', 'TAGIHAN', 'TERM', 'NILAI KONTRAK', 'UANG MUKA', 'PLAFOND', 'TGL. JATUH TEMPO', 'NILAI TAGIHAN', 'TGL. PENCAIRAN', 'PENCAIRAN', 'SISA TAGIHAN', 'KET'] },
};

export const NAMA_FASE = { 3: 'Fase 3 — Kontrak & Piutang', 4: 'Fase 4 — Collection & Escrow' };

// Tab yang boleh dibuka tiap peran
const SEMUA = Object.keys(TAB);
export const AKSES_TAB = {
  administrator: SEMUA, admin: SEMUA, adminsales: SEMUA, finance: SEMUA,
  collection: ['Sales', 'Customer', 'Tagihan', 'TTS', 'Batal', 'Escrow', 'P3U', 'Bast', 'Forecast'],
  project: ['Sales', 'Customer', 'P3U', 'Bast', 'Pricelist'],
  estate: ['Customer', 'Bast'],
  markom: ['Agent', 'Sales', 'Pricelist'],
  sales: ['Pricelist'],
};

// Data pribadi — hanya tampil untuk peran yang memang memprosesnya.
// Disamarkan di server, bukan di layar, agar tidak ikut terkirim sama sekali.
export const KOLOM_SENSITIF = new Set(['KTP', 'NPWP', 'ALAMAT', 'ALAMAT SURAT MENYURAT', 'ALAMAT KTP', 'ALAMAT NPWP',
  'EMAIL', 'NO. TELP', 'NO. HP', 'NO. WA', 'NO. KANTOR', 'NO. FAX', 'TGL. LAHIR', 'AGAMA', 'REKENING', 'ATAS NAMA']);
export const BOLEH_SENSITIF = ['administrator', 'headsales', 'salesmanager', 'adminsales', 'finance', 'collection'];

const tg = v => (v ? String(v).slice(0, 10) : '');

// ---------- pembentuk baris tiap tab ----------
async function agent(sql) {
  const rows = await sql`SELECT a.*, u.kode_petugas FROM sales_agent a
    LEFT JOIN users u ON lower(u.name) = lower(a.nama) ORDER BY a.nama`;
  return rows.map((a, i) => ({
    _key: 'a' + a.id, 'NO': i + 1, 'TIPE': a.tipe || '', 'LEVEL': '', 'ATASAN': '',
    'KODE MARKETING': a.kode_petugas || '', 'NAMA': a.nama, 'STATUS': 'AKTIF', 'TGL. INAKTIF': '', 'ALAMAT': '',
    'EMAIL': a.email || '', 'NO. TELP': a.telp || '', 'NO. HP': a.telp || '', 'NO. WA': '',
    'NPWP': a.npwp ? 'Berkas terlampir' : '', 'REKENING': a.no_rekening || '', 'BANK': a.bank || '', 'ATAS NAMA': a.nama_rekening || '',
  }));
}

// Kontrak = satu Booking per konsumen-unit (baris berverifikasi diutamakan)
async function kontrak(sql) {
  return sql`
    SELECT DISTINCT ON (t.lead_code, t.unit)
      t.id, t.lead_code, t.unit, t.tgl::text AS tgl, t.verif_at, t.no_sp, t.no_ppjb, t.harga_unit,
      t.bast_at, t.tgl_serah_terima::text AS tgl_serah_terima, t.no_bast, t.bast_dispensasi, t.bast_kategori,
      t.dpp, t.ppn, t.ppn_dtp, t.ppn_dev, t.skema_kode, t.jadwal_at,
      COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
      COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS customer, l.sales, l.tipe,
      (SELECT min(b.tgl)::text FROM transactions b WHERE b.lead_code = t.lead_code AND b.unit = t.unit
         AND b.jenis = 'Batal' AND b.id > t.id) AS tgl_batal
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.jenis IN ('Booking', 'Closing') AND COALESCE(t.unit, '') <> ''
    ORDER BY t.lead_code, t.unit, (t.no_sp IS NULL), t.id`;
}

async function sales(sql) {
  const pu = await petaUnit(sql);
  const k = (await kontrak(sql)).sort((a, b) => String(b.verif_at || b.tgl).localeCompare(String(a.verif_at || a.tgl)));
  return k.map((r, i) => { const m = pu[r.project + '|' + r.unit] || {}; return ({
    _key: 's' + r.id, 'NO': i + 1, 'TGL. KONTRAK': tg(r.verif_at || r.tgl), 'NO. KONTRAK': r.no_sp || '',
    'CUSTOMER': r.customer || '', 'SALES': r.sales || '', 'SUB KOORDINATOR': '', 'PROJECT': r.project, 'UNIT': r.unit,
    'TIPE': m.tipe || r.tipe || '', 'TIPE PROPERTY': m.hoek ? 'HOEK' : (m.tipe ? 'STANDAR' : ''),
    'LUAS TANAH': m.lt ? Number(m.lt) : '', 'LUAS BANGUNAN': m.lb ? Number(m.lb) : '', 'ARAH HADAP': m.arah || '',
    'TGL. BATAL': tg(r.tgl_batal), 'PRICE LIST': m.harga_list || '', 'DISKON': diskon(m.harga_list, r.harga_unit), 'DISKON UP VALUE': '', 'TAMBAHAN HARGA GIMMICK': '',
    'TAMBAHAN HARGA LAIN - LAIN': '', 'BUNGA': '', 'NILAI KONTRAK (INCLUDE PPN)': Number(r.harga_unit) || '',
    'NILAI KONTRAK (EXCLUDE PPN)': r.dpp != null ? Number(r.dpp) : '', 'PPN': r.ppn != null ? Number(r.ppn) : '',
    'PPN (DEVELOPER)': r.ppn_dev != null ? Number(r.ppn_dev) : '', 'PPN (DTP)': r.ppn_dtp != null ? Number(r.ppn_dtp) : '',
    'SKEMA BAYAR': r.skema_kode || r.bayar || '',
  }); });
}

async function customer(sql) {
  const rows = await sql`
    SELECT l.*, x.unit_akhir, x.harga_akhir, x.bayar_akhir, x.tgl_akhir, x.jenis_akhir, x.verif_akhir, x.proj_akhir
    FROM leads l JOIN LATERAL (
      SELECT t.unit AS unit_akhir, t.harga_unit AS harga_akhir, t.bayar AS bayar_akhir, t.tgl::text AS tgl_akhir,
             t.jenis AS jenis_akhir, t.verif_at AS verif_akhir, NULLIF(t.project, '') AS proj_akhir
      FROM transactions t WHERE t.lead_code = l.lead_code ORDER BY t.id DESC LIMIT 1) x ON true
    ORDER BY l.lead_code`;
  return rows.map((l, i) => ({
    _key: 'c' + l.lead_code, 'NO': i + 1, 'NAMA': l.nama_ktp || l.nama || '', 'TIPE': 'PERORANGAN', 'SUMBER': l.sumber || '',
    'NO. UNIT': l.unit_akhir || '', 'SALES ACCOUNT': l.sales || '', 'NAMA BISNIS': '', 'JENIS BISNIS': '', 'MERK BISNIS': '',
    'AGAMA': '', 'TGL. LAHIR': '', 'NO. TELP': '', 'NO. HP': l.wa || '', 'NO. KANTOR': '', 'NO. FAX': '', 'EMAIL': l.email || '',
    'KTP': l.no_ktp || '', 'ALAMAT SURAT MENYURAT': l.alamat_surat || l.alamat_domisili || '', 'ALAMAT KTP': l.alamat_ktp || '',
    'KOTA / KABUPATEN': l.domisili || '', 'NPWP': l.npwp || '', 'ALAMAT NPWP': '', 'SIFAT': '',
    'NO. UNIT TERAKHIR': l.unit_akhir || '', 'LUAS SEMI GROSS': '', 'HARGA JUAL TERAKHIR': Number(l.harga_akhir) || '',
    'CARA BAYAR': l.bayar_akhir || l.bayar || '', 'TGL. SP': tg(l.verif_akhir), 'TGL. INPUT': tg(l.tgl || l.created_at),
    'TGL. TRANSAKSI TERAKHIR': tg(l.tgl_akhir), 'PROJECT': l.proj_akhir || l.project || '',
    'STATUS': l.jenis_akhir === 'Batal' ? 'BATAL' : 'AKTIF',
  }));
}

async function batal(sql) {
  const pu = await petaUnit(sql);
  const rows = await sql`
    SELECT b.id, b.tgl::text AS tgl_batal, b.catatan, b.unit, b.lead_code,
      COALESCE(NULLIF(b.project, ''), l.project, '') AS project,
      COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS customer, l.sales, l.tipe,
      k.tgl::text AS tgl_kontrak, k.no_sp, k.harga_unit, k.dpp, k.ppn, COALESCE(NULLIF(k.bayar, ''), l.bayar, '') AS bayar,
      pb.kategori, pb.nilai_kembali, pb.non_refund, pb.status_refund, pb.tgl_pengajuan::text AS tgl_pengajuan,
      (pb.bf_dibayar + pb.dp_angsuran_dibayar + pb.adm_dibayar + pb.denda_dibayar + pb.pencairan_bank) AS total_pb,
      (SELECT COALESCE(sum(p.nilai), 0) FROM transactions p WHERE p.lead_code = b.lead_code AND p.unit = b.unit
         AND p.jenis <> 'Batal' AND p.id < b.id) AS dibayar,
      (SELECT max(p.tgl)::text FROM transactions p WHERE p.lead_code = b.lead_code AND p.unit = b.unit
         AND p.jenis <> 'Batal' AND p.id < b.id) AS bayar_akhir
    FROM transactions b LEFT JOIN leads l ON l.lead_code = b.lead_code LEFT JOIN pembatalan pb ON pb.batal_trx_id = b.id
    LEFT JOIN LATERAL (SELECT * FROM transactions k WHERE k.lead_code = b.lead_code AND k.unit = b.unit
      AND k.jenis IN ('Booking', 'Closing', 'Reserved') AND k.id < b.id ORDER BY (k.no_sp IS NULL), k.id DESC LIMIT 1) k ON true
    WHERE b.jenis = 'Batal' ORDER BY b.tgl DESC, b.id DESC`;
  return rows.map((r, i) => { const m = pu[r.project + '|' + r.unit] || {}; return ({
    _key: 'b' + r.id, 'NO.': i + 1, 'TGL. KONTRAK': tg(r.tgl_kontrak), 'NO. KONTRAK': r.no_sp || '',
    'SKEMA CARA BAYAR': r.bayar || '', 'CUSTOMER': r.customer || '', 'SALES': r.sales || '', 'UNIT': r.unit || '',
    'TIPE': m.tipe || r.tipe || '', 'PRICELIST': m.harga_list || '', 'DISKON': diskon(m.harga_list, r.harga_unit), 'BUNGA': '', 'TGL. BATAL': tg(r.tgl_batal),
    'NILAI KONTRAK': Number(r.harga_unit) || '', 'PEMBAYARAN': r.total_pb != null ? Number(r.total_pb) : (Number(r.dibayar) || 0),
    'PENGEMBALIAN': r.nilai_kembali != null ? Number(r.nilai_kembali) : '', 'AMOUNT NON RF': r.non_refund != null ? Number(r.non_refund) : '',
    'DPP': r.dpp != null ? Number(r.dpp) : '', 'PPN': r.ppn != null ? Number(r.ppn) : '', 'LUAS TANAH': m.lt ? Number(m.lt) : '', 'LUAS BANGUNAN': m.lb ? Number(m.lb) : '', 'TOTAL PEMBAYARAN': r.total_pb != null ? Number(r.total_pb) : (Number(r.dibayar) || 0),
    'STATUS': 'BATAL', 'SUB KOORDINATOR': '', 'PROJECT': r.project, 'TIPE PROPERTY': m.hoek ? 'HOEK' : (m.tipe ? 'STANDAR' : ''), 'ARAH HADAP': m.arah || '',
    'TGL. LAST PAYMENT': tg(r.bayar_akhir), 'TGL. PENGAJUAN RF': tg(r.tgl_pengajuan),
    'KETERANGAN': (r.catatan || '') + (r.status_refund ? ' · Pengembalian: ' + r.status_refund : ''),
  }); });
}

async function p3u(sql) {
  return (await kontrak(sql)).filter(r => r.no_ppjb)
    .sort((a, b) => String(b.verif_at).localeCompare(String(a.verif_at)))
    .map(r => ({ _key: 'p' + r.id, 'TGL. KONTRAK': tg(r.verif_at || r.tgl), 'NO. KONTRAK': r.no_sp || '',
      'NAMA CUSTOMER': r.customer || '', 'NO UNIT': r.unit, 'TGL. P3U': tg(r.verif_at), 'NO. P3U': r.no_ppjb }));
}

async function bast(sql) {
  const k = (await kontrak(sql)).filter(r => r.bast_at);
  const akad = await sql`SELECT trx_id, max(selesai_at)::text AS tgl FROM proses
    WHERE divisi = 'collection' AND judul ILIKE '%akad%' AND status = 'Selesai' GROUP BY trx_id`;
  const tAkad = {}; akad.forEach(a => { tAkad[a.trx_id] = a.tgl; });
  return k.sort((a, b) => String(b.bast_at).localeCompare(String(a.bast_at))).map((r, i) => ({
    _key: 't' + r.id, 'NO.': i + 1, 'NO BAST': r.no_bast || '', 'KATEGORI BAST': ({ pinjam_pakai: 'PINJAM PAKAI', sto: 'SERAH TERIMA OTOMATIS', ppn_dtp: 'PPN DTP' }[r.bast_kategori] || 'BAST') + (r.bast_dispensasi ? ' (DISPENSASI)' : ''),
    'NO STR': '', 'NO UNIT': r.unit, 'NAMA CUSTOMER': r.customer || '', 'TANGGAL BAST': tg(r.tgl_serah_terima),
    'TANGGAL TTD BAST': tg(r.bast_at), 'TANGGAL AKAD': tg(tAkad[r.id]),
    'NILAI KONTRAK(INCLUDE PPN)': Number(r.harga_unit) || '', 'NILAI KONTRAK(EXCLUDE PPN)': r.dpp != null ? Number(r.dpp) : '', 'PPN': r.ppn != null ? Number(r.ppn) : '',
    'PPN (EXCLUDE DTP)': r.ppn_dev != null ? Number(r.ppn_dev) : '', 'PPN DTP': r.ppn_dtp != null ? Number(r.ppn_dtp) : '', 'SKEMA CARA BAYAR': r.bayar || '',
  }));
}

// Status unit mengikuti logika Master Stock (transaksi terakhir + penanda manual)
async function pricelist(sql) {
  const pu = await petaUnit(sql);
  const st = await sql`SELECT items FROM settings WHERE key = 'units'`;
  const units = (st.length && st[0].items) || DEFAULT_UNITS;
  const trx = await sql`SELECT t.jenis, t.unit, t.no_sp, t.tgl_expire::text AS tgl_expire, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE COALESCE(t.unit, '') <> '' ORDER BY t.id`;
  const manual = await sql`SELECT project, unit, status FROM unit_manual`;
  const m = {};
  trx.forEach(t => {
    const key = t.project + '|' + t.unit;
    if (t.jenis === 'Batal') m[key] = null;
    else if (t.jenis === 'Reserved' && reservasiLewat(t.tgl_expire)) m[key] = null;   // reservasi kedaluwarsa: tersedia
    else m[key] = { status: t.jenis === 'Reserved' ? 'RESERVED' : 'SOLD', no_sp: t.no_sp || (m[key] && m[key].no_sp) || '' };
  });
  manual.forEach(x => {
    const key = x.project + '|' + x.unit;
    if (x.status === 'Terjual') m[key] = { status: 'SOLD', no_sp: (m[key] && m[key].no_sp) || '' };
    else if (x.status === 'Reserved') m[key] = { status: 'RESERVED', no_sp: '' };
    else m[key] = null;
  });
  const out = []; let n = 0;
  Object.entries(units).forEach(([project, list]) => (list || []).forEach(u => {
    const s = m[project + '|' + u], h = pu[project + '|' + u] || {};
    n += 1;
    out.push({ _key: 'u' + project + u, 'NO. URUT': n, 'NO. KONTRAK': s ? s.no_sp : '', 'TGL. INPUT': '',
      'LOKASI': project, 'TIPE': (h.tipe || '') + (h.hoek ? ' (HOEK)' : ''), 'NO. UNIT': u,
      'LUAS SG': h.lb ? Number(h.lb) : '', 'LUAS NETT': h.lt ? Number(h.lt) : '', 'STATUS': s ? s.status : 'AVAILABLE',
      'CASH KERAS': h.harga_standar || '', 'CICILAN 12X': '', 'CICILAN 18X': '', 'CICILAN 24X': '', 'CICILAN 30X': '',
      'KPR SUPER EXPRESS': '', 'KPR ULTRA EXPRESS': '', 'KPR DP 10% - 4X': '', 'KPR DP 20% - 6X': '', 'KPR EXTRA EXPRESS': '' });
  }));
  return out;
}

async function tagihan(sql) {
  const rows = await sql`SELECT g.*, g.jatuh_tempo::text AS jatuh_tempo, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS customer,
      l.wa, l.email, t.no_sp, t.skema_kode, t.unit, t.tgl_kontrak::text AS tgl_kontrak, t.batal_at,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS proj
    FROM tagihan g JOIN transactions t ON t.id = g.trx_id LEFT JOIN leads l ON l.lead_code = t.lead_code
    ORDER BY g.jatuh_tempo, g.trx_id, g.urutan`;
  return rows.map(r => ({
    _key: 'tg' + r.id, 'NO. TAGIHAN': 'TG-' + String(r.id).padStart(5, '0'), 'NO. KONTRAK': r.no_sp || '',
    'STATUS': r.batal_at ? 'BATAL' : r.status, 'TGL. KONTRAK': tg(r.tgl_kontrak), 'SKEMA CARA BAYAR': r.skema_kode || '', 'CUSTOMER': r.customer || '',
    'NO. TELP': '', 'NO. HP': r.wa || '', 'UNIT': r.unit || '', 'TIPE': '', 'TAGIHAN': r.nama || '',
    'TGL JATUH TEMPO': tg(r.jatuh_tempo), 'NILAI TAGIHAN': Number(r.nilai) || 0, 'NILAI PELUNASAN': Number(r.dibayar) || 0,
    'SISA TAGIHAN': Number(r.nilai) - Number(r.dibayar), 'EMAIL': r.email || '', 'KTP': '', 'ALAMAT SURAT MENYURAT': '',
    'ALAMAT KTP': '', 'KOTA / KABUPATEN': '', 'NPWP': '', 'ALAMAT NPWP': '', 'SIFAT': '', 'NO. UNIT TERAKHIR': r.unit || '',
    'LUAS SEMI GROSS': '', 'HARGA JUAL TERAKHIR': '', 'CARA BAYAR': r.skema_kode || '', 'TGL. SP': '', 'TGL. INPUT': '',
    'TGL. TRANSAKSI TERAKHIR': '', 'PROJECT': r.proj,
  }));
}

// TTS / Kuitansi: satu baris per pembayaran (termasuk yang dibatalkan, ditandai statusnya)
async function tts(sql) {
  const rows = await sql`SELECT p.*, p.tgl::text AS tgl, p.tgl_bg::text AS tgl_bg, p.kw_at::text AS kw_at,
      t.no_sp, t.skema_kode, t.unit, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS customer,
      (SELECT string_agg(tg.nama, '; ') FROM pembayaran_alokasi a JOIN tagihan tg ON tg.id = a.tagihan_id WHERE a.pembayaran_id = p.id) AS alokasi
    FROM pembayaran p JOIN transactions t ON t.id = p.trx_id LEFT JOIN leads l ON l.lead_code = t.lead_code
    ORDER BY p.tgl DESC, p.id DESC`;
  return rows.map((r, i) => ({
    _key: 'pb' + r.id, 'NO.': i + 1, 'TGL. TTS': tg(r.tgl), 'NO.TTS': r.no_tts || '', 'TGL. KWT': tg(r.kw_at), 'NO. KWT': r.no_kw || '',
    'STATUS': r.status === 'KW' ? 'KUITANSI' : r.status === 'Batal' ? 'BATAL' : 'TTS', 'KASIR': r.kw_oleh || r.dibuat_oleh || '',
    'TIPE': r.cara === 'Pencairan KPR' ? 'PENCAIRAN KPR' : 'PEMBAYARAN', 'TAGIHAN': r.alokasi || '', 'NO. KONTRAK': r.no_sp || '',
    'SKEMA CARA BAYAR': r.skema_kode || '', 'UNIT': r.unit || '', 'CUSTOMER': r.customer || '', 'CARA BAYAR': r.cara || '',
    'KETERANGAN': r.status === 'Batal' ? 'Batal: ' + (r.batal_alasan || '') : (r.keterangan || ''), 'NO. BG': r.no_bg || '', 'TGL. BG': tg(r.tgl_bg),
    'REKENING': '', 'BANK': r.bank || '', 'PELUNASAN HUTANG': Number(r.nilai) || 0, 'PEMBULATAN': 0, 'TOTAL PEMBAYARAN': Number(r.nilai) || 0,
  }));
}

// Escrow KPR: satu baris per kontrak berbaris Akad — data bank dari tabel kpr, pencairan dari pembayaran 'Pencairan KPR'
async function escrowRows(sql) {
  const rows = await sql`
    SELECT g.id AS tg_id, g.nama AS tagihan_nama, g.jatuh_tempo::text AS jt, g.nilai, g.dibayar,
      t.id AS trx_id, t.no_sp, t.harga_unit, t.tgl_kontrak::text AS tgl_kontrak, t.skema_kode, t.unit,
      COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS customer, k.bank, k.tgl_akad::text AS tgl_akad, k.plafon,
      (SELECT COALESCE(sum(x.nilai), 0)::bigint FROM tagihan x WHERE x.trx_id = t.id AND x.jenis IN ('BF', 'DP')) AS uang_muka,
      (SELECT count(*)::int FROM pembayaran p WHERE p.trx_id = t.id AND p.cara = 'Pencairan KPR' AND p.status <> 'Batal') AS term,
      (SELECT max(p.tgl)::text FROM pembayaran p WHERE p.trx_id = t.id AND p.cara = 'Pencairan KPR' AND p.status <> 'Batal') AS tgl_cair
    FROM tagihan g JOIN transactions t ON t.id = g.trx_id LEFT JOIN leads l ON l.lead_code = t.lead_code LEFT JOIN kpr k ON k.trx_id = t.id
    WHERE g.jenis = 'AKAD' AND t.batal_at IS NULL ORDER BY g.jatuh_tempo, g.id`;
  return rows.map(r => {
    const sisa = Number(r.nilai) - Number(r.dibayar);
    const plafon = Number(r.plafon) || 0;
    return {
      _key: 'es' + r.tg_id, sisaHitung: sisa,
      'NO. TAGIHAN': 'TG-' + String(r.tg_id).padStart(5, '0'), 'NO. KONTRAK': r.no_sp || '', 'TGL. KONTRAK': tg(r.tgl_kontrak),
      'SKEMA CARA BAYAR': r.skema_kode || '', 'CUSTOMER': r.customer || '', 'UNIT': r.unit || '', 'TGL. AKAD': tg(r.tgl_akad), 'BANK': r.bank || '',
      'TAGIHAN': r.tagihan_nama || '', 'TERM': r.term, 'NILAI KONTRAK': Number(r.harga_unit) || '', 'UANG MUKA': Number(r.uang_muka) || '',
      'PLAFOND': plafon || '', 'TGL. JATUH TEMPO': tg(r.jt), 'NILAI TAGIHAN': Number(r.nilai) || 0, 'TGL. PENCAIRAN': tg(r.tgl_cair),
      'PENCAIRAN': Number(r.dibayar) || 0, 'SISA TAGIHAN': sisa,
      'KET': plafon > 0 && plafon < Number(r.nilai) ? 'Plafon kurang Rp ' + (Number(r.nilai) - plafon).toLocaleString('id-ID') + ' — tambahan DP menjadi tanggung jawab pemesan' : '',
    };
  });
}
const escrow = async sql => (await escrowRows(sql)).map(({ sisaHitung, ...r }) => r);
// Forecast = pencairan yang masih ditunggu dari bank (sisa > 0), terurut menurut jatuh tempo
const forecast = async sql => (await escrowRows(sql)).filter(r => r.sisaHitung > 0).map(({ sisaHitung, ...r }) => r);

const PEMBENTUK = { TTS: tts, Escrow: escrow, Forecast: forecast, Agent: agent, Sales: sales, Customer: customer, Batal: batal, P3U: p3u, Bast: bast, Pricelist: pricelist, Tagihan: tagihan };

export async function ambilTab(sql, nama) {
  const f = PEMBENTUK[nama];
  return f ? f(sql) : null;   // null = data belum tersedia pada fase ini
}

export function samarkan(rows, bolehSensitif) {
  if (bolehSensitif) return rows;
  return rows.map(r => {
    const o = { ...r };
    for (const k of Object.keys(o)) if (KOLOM_SENSITIF.has(k) && o[k]) o[k] = '•••';
    return o;
  });
}

