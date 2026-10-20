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
    const rows = g.batal ? [] : susunTagihan(g);
    const urutAda = ada.filter(r => r.lead_code === g.lead_code && r.unit === g.unit);
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
