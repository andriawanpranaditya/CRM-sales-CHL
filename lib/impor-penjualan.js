// ===== Impor buku penjualan resmi per project (sekali jalan; tombol hilang setelah impor) =====
// Menyamakan transaksi CRM dengan buku penjualan resmi:
//  · kontrak aktif  → lead + transaksi Booking (dibuat bila belum ada; bila sudah ada dilengkapi nilai kontrak, cara bayar, no kontrak) + tanggal akad KPR
//  · kontrak batal  → Booking + Batal (jenis refund / non-refund, dana, alasan bila tersedia di sumber)
//  · ganti kontrak  → kontrak lama dibatalkan lalu konsumen yang sama langsung membuat kontrak baru (unit sama atau pindah unit):
//                     bukan penjualan baru dan bukan batal
// Aman diulang (idempoten): kontrak yang sudah tercatat dikenali dari unit + nama konsumen + tanggal.
import { JUAL_PERMAI_AKTIF, JUAL_PERMAI_BATAL, JUAL_PERMAI_KPR, PER_TANGGAL_JUAL_PERMAI } from './data-permai-penjualan';
import { JUAL_BIO_KPR, PER_TANGGAL_BIO_KPR } from './data-bio-kpr';
import { JUAL_BIO_AKTIF, JUAL_BIO_BATAL, JUAL_BIO_RESV_BATAL, PER_TANGGAL_JUAL_BIO } from './data-bio-penjualan';
import { siapkanKpr } from './kpr';
import { DEFAULT_UNITS } from './db';

export const SUMBER_PENJUALAN = {
  // Bio District: buku penjualan 04/11/2026 — CRM disinkronkan penuh (kontrak aktif, batal, reservasi batal, rencana P3U)
  'BIO DISTRICT': { aktif: JUAL_BIO_AKTIF, batal: JUAL_BIO_BATAL, resv: JUAL_BIO_RESV_BATAL, kpr: JUAL_BIO_KPR, per: PER_TANGGAL_JUAL_BIO, versi: PER_TANGGAL_JUAL_BIO + ' sinkron penuh', label: 'Penjualan BIO District 04/11/2026 — sinkron penuh', profil: 'Karyawan' },
  // versi naik bila ada data baru dari file yang sama → tombol impor muncul sekali lagi (impor aman diulang)
  'PERMAI INDAH': { aktif: JUAL_PERMAI_AKTIF, batal: JUAL_PERMAI_BATAL, resv: [], kpr: JUAL_PERMAI_KPR, per: PER_TANGGAL_JUAL_PERMAI, versi: PER_TANGGAL_JUAL_PERMAI + ' + Proses KPR · sinkron penuh', label: 'Report Penjualan, Batal & Proses KPR 04/11/2026', profil: 'Subsidi — Karyawan', tipe: '22,5/60' },
};
const ALIAS_SALES = { raeno: 'Reno', djunari: 'Junari', junari: 'Junari', putri: 'Putri', reno: 'Reno' };
const kata = s => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !['bpk', 'ibu', 'sdr', 'bapak'].includes(w));
const namaSama = (a, b) => { const A = kata(a), B = kata(b); return A.length && B.length && (A[0] === B[0] || A.some(w => B.includes(w))); };
const selisihHari = (a, b) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 86400000 : 999);
const bayarDari = cara => /cicilan|bertahap/i.test(cara || '') ? 'Cash Bertahap' : /kpr/i.test(cara || '') ? 'KPR' : /cash|keras|tunai/i.test(cara || '') ? 'Cash Keras' : (cara || '');

export async function siapkanKolomPenjualan(sql) {
  for (const q of [
    sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS no_kontrak text`, sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS skema text`,
    sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cicilan integer`, sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS harga_cash numeric`,
    sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dana_dibayar numeric`, sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dana_hangus numeric`,
    sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dana_refund numeric`, sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS batal_refund boolean`,
    sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sumber_data text`, sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ganti_kontrak boolean`,
  ]) { try { await q; } catch {} }
}

export async function imporPenjualan(sql, user, { project, cek = false } = {}) {
  const SRC = SUMBER_PENJUALAN[project];
  if (!SRC) throw new Error('Belum ada buku penjualan untuk ' + project);
  const PROJ = project;
  // Nama unit mengikuti Master Stock (Settings), mis. "Blok A8 no.02"
  let master = DEFAULT_UNITS[PROJ] || [];
  try { const st = await sql`SELECT items FROM settings WHERE key = 'units'`; if (st[0]?.items?.[PROJ]?.length) master = st[0].items[PROJ]; } catch {}
  const normU = u => String(u || '').toLowerCase().replace(/blok|\s/g, '').replace(/no\.?|-|_|\//g, '#').replace(/#0+(\d)/, '#$1');
  const petaU = Object.fromEntries(master.map(u => [normU(u), u]));
  const salin = x => ({ ...x, u: petaU[normU(x.u)] || x.u });
  const JUAL_AKTIF = SRC.aktif.map(salin), JUAL_BATAL = SRC.batal.map(salin), JUAL_RESV_BATAL = SRC.resv.map(salin);
  await siapkanKolomPenjualan(sql); await siapkanKpr(sql);
  // ===== 0) Sinkron: nama unit di transaksi CRM diseragamkan dengan Master Stock (beda huruf besar/kecil, "no.2" vs "no.02") =====
  const hasilUnit = [];
  {
    const ada = await sql`SELECT DISTINCT t.unit FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE COALESCE(NULLIF(t.project, ''), l.project, '') = ${PROJ} AND t.unit IS NOT NULL AND t.unit <> ''`;
    for (const { unit } of ada) {
      const baku = petaU[normU(unit)];
      if (!baku || baku === unit) continue;
      hasilUnit.push(`${unit} → ${baku}`);
      if (cek) continue;
      await sql`UPDATE transactions SET unit = ${baku} WHERE unit = ${unit} AND (project = ${PROJ} OR COALESCE(project, '') = '')`;
      for (const q of [sql`UPDATE trx_files SET unit = ${baku} WHERE project = ${PROJ} AND unit = ${unit}`, sql`UPDATE kpr SET unit = ${baku} WHERE project = ${PROJ} AND unit = ${unit}`,
        sql`UPDATE unit_manual SET unit = ${baku} WHERE project = ${PROJ} AND unit = ${unit}`]) { try { await q; } catch {} }
    }
  }
  const users = await sql`SELECT name FROM users WHERE role = 'sales'`.catch(() => []);
  const salesCrm = teks => {
    const depan = String(teks || '').split('/')[0].trim();
    const k = kata(depan);
    const u = users.find(x => k.includes(String(x.name).toLowerCase()));
    if (u) return u.name;
    const a = k.map(w => ALIAS_SALES[w]).find(Boolean);
    return a || String(teks || '').trim();
  };
  // Semua transaksi project ini, dikelompokkan per lead + unit
  const trx = await sql`SELECT t.id, t.lead_code, t.jenis, t.tgl::text AS tgl, t.unit, l.nama
    FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
    WHERE COALESCE(NULLIF(t.project, ''), l.project, '') = ${PROJ} AND t.unit IS NOT NULL AND t.unit <> '' ORDER BY t.tgl, t.id`;
  const grup = new Map();
  trx.forEach(t => { const k = t.lead_code + '|' + t.unit; const g = grup.get(k) || { lead_code: t.lead_code, unit: t.unit, nama: t.nama, ev: [] }; g.ev.push(t); grup.set(k, g); });
  const evLead = {}; trx.forEach(t => { (evLead[t.lead_code] = evLead[t.lead_code] || []).push(t); });
  const gantiLead = new Map(); // nama konsumen → lead_code kontrak lama, supaya kontrak penggantinya dicatat di lead yang sama (riwayat KPR & pembayaran tidak terputus)
  const G = [...grup.values()].map(g => ({ ...g, akhir: g.ev.at(-1).jenis, tglBooking: (g.ev.find(e => e.jenis === 'Booking' || e.jenis === 'Closing') || {}).tgl, tglReserved: (g.ev.find(e => e.jenis === 'Reserved') || {}).tgl, dipakai: false }));
  const leadUnit = {}; // unit → lead kontrak aktif (untuk data Proses KPR)
  const hasil = { namaDisamakan: [], cek, aktif: { dibuat: [], dilengkapi: [] }, batal: { dibuat: [], dilengkapi: [] }, resv: { dibuat: [], dilengkapi: [] }, akad: 0, tandaImporDihapus: 0 };

  async function leadBaru(d, status) {
    const ins = await sql`INSERT INTO leads (tgl, nama, wa, project, tipe, sumber, status, sales, catatan, bayar, created_by)
      VALUES (${d.tgl}, ${d.nama}, '', ${PROJ}, ${PROJ === 'BIO DISTRICT' ? (d.tipe ? 'TIPE ' + d.tipe : '') : String(d.tipe || SRC.tipe || '').replace('.', ',')}, 'Import Penjualan', ${status}, ${salesCrm(d.sales)},
              ${('Sales/agent di kontrak: ' + (d.sales || '-')).slice(0, 300)}, ${bayarDari(d.cara)}, 'import') RETURNING id`;
    const kode = 'LEAD-' + String(ins[0].id).padStart(4, '0');
    await sql`UPDATE leads SET lead_code = ${kode} WHERE id = ${ins[0].id}`;
    return kode;
  }
  const cari = (d, jenisAwal) => {
    const tglGrup = g => g.ev.filter(e => e.jenis !== 'Batal').map(e => e.tgl);
    // kontrak batal dicocokkan ketat (±10 hari) supaya tidak mengambil kontrak pengganti konsumen yang sama; kontrak aktif ±45 hari
    const batas = d.batal ? 10 : 45;
    const cocok = G.filter(g => !g.dipakai && g.unit === d.u && namaSama(g.nama, d.nama) && tglGrup(g).some(t => selisihHari(t, d.tgl) <= batas))
      .sort((x, y) => Math.min(...tglGrup(x).map(t => selisihHari(t, d.tgl))) - Math.min(...tglGrup(y).map(t => selisihHari(t, d.tgl))));
    return cocok[0] || null;
  };

  // ===== 1) Kontrak batal setelah Booking & reservasi batal — diproses lebih dulu agar kontrak lama tidak tertukar dengan pembeli baru di unit yang sama =====
  // Ganti kontrak (bukan penjualan baru, bukan batal): kontrak lama dibatalkan untuk ikut program PPN dan konsumen yang sama
  // langsung membuat kontrak baru di unit yang sama pada hari pembatalan
  const semuaKontrak = [...JUAL_AKTIF, ...JUAL_BATAL];
  const namaPenuh = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  // konsumen yang sama (nama lengkap) membuat kontrak baru — unit sama atau pindah unit — dalam ±14 hari dari tanggal pembatalan
  const gantiKontrak = b => semuaKontrak.some(x => x !== b && namaPenuh(x.nama) === namaPenuh(b.nama) && x.tgl >= b.tgl && selisihHari(x.tgl, b.batal) <= 14);
  hasil.ganti = [];
  const prosesBatal = async (b, awal, wadah) => {
    const g = cari(b, awal);
    const refund = b.jenis === 'refund';
    const ganti = awal === 'Booking' && gantiKontrak(b);
    if (ganti) hasil.ganti.push(`${b.u} ${b.nama}`);
    const catatanBatal = [ganti ? 'Ganti kontrak' : '', b.alasan, b.jenis === 'nonrefund' ? 'Non-refund' : b.jenis === 'refund' ? 'Refund' : ''].filter(Boolean).join(' · ');
    if (g) {
      g.dipakai = true; wadah.dilengkapi.push(`${b.u} ${b.nama}`);
      if (ganti) gantiLead.set(namaPenuh(b.nama), g.lead_code);
      if (cek) return;
      if (awal === 'Booking' && !g.tglBooking) await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, nilai_jual, project, bayar, unit, no_kontrak, skema, sumber_data, created_by)
          VALUES (${g.lead_code}, 'Booking', ${b.tgl}, 0, ${b.nilai}, ${PROJ}, ${bayarDari(b.cara)}, ${b.u}, ${b.no || ''}, ${b.cara}, 'buku penjualan', ${user.username})`;
      const batalAda = g.ev.filter(e => e.jenis === 'Batal' && selisihHari(e.tgl, b.batal) <= 3).at(-1) || (g.akhir === 'Batal' ? g.ev.filter(e => e.jenis === 'Batal').at(-1) : null);
      if (!batalAda) await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, catatan, project, bayar, unit, dana_dibayar, dana_hangus, dana_refund, batal_refund, ganti_kontrak, sumber_data, created_by)
          VALUES (${g.lead_code}, 'Batal', ${b.batal}, 0, ${catatanBatal}, ${PROJ}, ${bayarDari(b.cara)}, ${b.u}, ${b.bayar ?? null}, ${b.hangus ?? null}, ${b.refund ?? null}, ${awal === 'Booking' ? refund : null}, ${ganti}, 'buku penjualan', ${user.username})`;
      else await sql`UPDATE transactions SET catatan = CASE WHEN ${ganti} THEN ${catatanBatal} ELSE COALESCE(NULLIF(catatan, ''), ${catatanBatal}) END, dana_dibayar = ${b.bayar ?? null}, dana_hangus = ${b.hangus ?? null}, dana_refund = ${b.refund ?? null},
          batal_refund = ${awal === 'Booking' ? refund : null}, ganti_kontrak = ${ganti}, sumber_data = 'buku penjualan' WHERE id = ${batalAda.id}`;
      await sql`UPDATE transactions SET nilai_jual = COALESCE(nilai_jual, ${b.nilai}), no_kontrak = COALESCE(NULLIF(no_kontrak, ''), ${b.no || ''}) WHERE lead_code = ${g.lead_code} AND unit = ${b.u} AND jenis IN (${awal}, 'Booking')`;
      return;
    }
    wadah.dibuat.push(`${b.u} ${b.nama}`);
    if (cek) { if (ganti) gantiLead.set(namaPenuh(b.nama), 'baru'); return; }
    const kode = await leadBaru(b, 'Drop');
    if (ganti) gantiLead.set(namaPenuh(b.nama), kode);
    await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, nilai_jual, project, bayar, unit, no_kontrak, skema, sumber_data, created_by)
      VALUES (${kode}, ${awal}, ${b.tgl}, 0, ${b.nilai}, ${PROJ}, ${bayarDari(b.cara)}, ${b.u}, ${b.no || ''}, ${b.cara}, 'buku penjualan', ${user.username})`;
    await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, catatan, project, bayar, unit, dana_dibayar, dana_hangus, dana_refund, batal_refund, ganti_kontrak, sumber_data, created_by)
      VALUES (${kode}, 'Batal', ${b.batal}, 0, ${catatanBatal}, ${PROJ}, ${bayarDari(b.cara)}, ${b.u}, ${b.bayar ?? null}, ${b.hangus ?? null}, ${b.refund ?? null}, ${awal === 'Booking' ? refund : null}, ${ganti}, 'buku penjualan', ${user.username})`;
  };
  for (const b of JUAL_BATAL) await prosesBatal(b, 'Booking', hasil.batal);
  for (const r of JUAL_RESV_BATAL) await prosesBatal(r, 'Reserved', hasil.resv);

  // ===== 2) Kontrak aktif =====
  for (const a of JUAL_AKTIF) {
    let g = cari(a, 'Booking');
    // Unit yang di CRM masih aktif atas nama lain (mis. nama panggilan) → pakai bila hanya ada satu yang aktif
    if (!g) { const aktifUnit = G.filter(x => !x.dipakai && x.unit === a.u && ['Booking', 'Closing', 'Reserved'].includes(x.akhir) && selisihHari(x.tglBooking || x.tglReserved, a.tgl) <= 60); if (aktifUnit.length === 1) g = aktifUnit[0]; }
    const bayar = bayarDari(a.cara);
    let kode;
    const leadLama = !g ? gantiLead.get(namaPenuh(a.nama)) : null;
    if (leadLama) {
      // Kontrak pengganti (ganti kontrak / pindah unit) dicatat di lead yang sama
      kode = leadLama;
      const ada = (evLead[kode] || []).find(e => (e.jenis === 'Booking' || e.jenis === 'Closing') && e.unit === a.u && e.tgl === a.tgl);
      (ada ? hasil.aktif.dilengkapi : hasil.aktif.dibuat).push(`${a.u} ${a.nama} (kontrak pengganti)`);
      if (!cek && kode !== 'baru') {
        if (ada) await sql`UPDATE transactions SET nilai_jual = ${a.nilai}, harga_cash = ${a.cash || null}, bayar = ${bayar}, skema = ${a.cara}, no_kontrak = COALESCE(NULLIF(no_kontrak, ''), ${a.no || ''}), sumber_data = 'buku penjualan' WHERE id = ${ada.id}`;
        else await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, nilai_jual, project, bayar, unit, no_kontrak, skema, cicilan, harga_cash, sumber_data, created_by)
          VALUES (${kode}, 'Booking', ${a.tgl}, 0, ${a.nilai}, ${PROJ}, ${bayar}, ${a.u}, ${a.no || ''}, ${a.cara}, ${a.cicilan || null}, ${a.cash || null}, 'buku penjualan', ${user.username})`;
        await sql`UPDATE leads SET status = 'Booking', bayar = ${bayar} WHERE lead_code = ${kode}`;
      }
      if (kode === 'baru' || cek) { if (bayar === 'KPR' && a.akad) hasil.akad++; continue; }
    } else if (g) {
      g.dipakai = true; kode = g.lead_code; hasil.aktif.dilengkapi.push(`${a.u} ${a.nama}`);
      if (namaPenuh(g.nama) !== namaPenuh(a.nama)) {
        hasil.namaDisamakan.push(`${a.u}: ${g.nama} → ${a.nama}`);
        if (!cek) await sql`UPDATE leads SET nama = ${a.nama}, catatan = TRIM(BOTH ' ·' FROM COALESCE(catatan, '') || ${' · Nama disamakan dengan buku penjualan (sebelumnya: ' + g.nama + ')'}) WHERE lead_code = ${g.lead_code}`;
      }
      if (!cek) {
        if (!g.tglBooking) await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, nilai_jual, project, bayar, unit, no_kontrak, skema, cicilan, harga_cash, sumber_data, created_by)
            VALUES (${kode}, 'Booking', ${a.tgl}, 0, ${a.nilai}, ${PROJ}, ${bayar}, ${a.u}, ${a.no || ''}, ${a.cara}, ${a.cicilan || null}, ${a.cash || null}, 'buku penjualan', ${user.username})`;
        else await sql`UPDATE transactions SET nilai_jual = ${a.nilai}, harga_cash = ${a.cash || null}, bayar = ${bayar}, skema = ${a.cara}, cicilan = COALESCE(${a.cicilan || null}, cicilan),
            no_kontrak = COALESCE(NULLIF(no_kontrak, ''), ${a.no || ''}), sumber_data = 'buku penjualan'
            WHERE lead_code = ${kode} AND unit = ${a.u} AND jenis IN ('Booking', 'Closing')`;
        await sql`UPDATE leads SET bayar = ${bayar}, status = CASE WHEN status IN ('Drop', 'Lost') THEN status ELSE 'Booking' END WHERE lead_code = ${kode}`;
      }
    } else {
      hasil.aktif.dibuat.push(`${a.u} ${a.nama}`);
      if (cek) continue;
      kode = await leadBaru(a, 'Booking');
      await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, nilai_jual, catatan, project, bayar, unit, no_kontrak, skema, cicilan, harga_cash, sumber_data, created_by)
        VALUES (${kode}, 'Booking', ${a.tgl}, 0, ${a.nilai}, ${a.ket || ''}, ${PROJ}, ${bayar}, ${a.u}, ${a.no || ''}, ${a.cara}, ${a.cicilan || null}, ${a.cash || null}, 'buku penjualan', ${user.username})`;
    }
    if (kode && kode !== 'baru') leadUnit[a.u] = { kode, nama: a.nama, akad: a.akad };
    // Tanggal akad KPR yang sebenarnya (menggantikan perkiraan "tgl akad = tgl kontrak" dari impor sebelumnya)
    if (!cek && bayar === 'KPR') {
      await sql`INSERT INTO kpr (lead_code, project, unit, profil) VALUES (${kode}, ${PROJ}, ${a.u}, ${SRC.profil || 'Karyawan'}) ON CONFLICT (lead_code) DO NOTHING`;
      if (a.akad) {
        await sql`UPDATE kpr SET akad_realisasi = ${a.akad}, akad_tgl = COALESCE(akad_tgl, ${a.akad}),
          catatan = NULLIF(TRIM(REPLACE(COALESCE(catatan, ''), 'Tgl akad = tgl kontrak (koreksi bila perlu)', '')), ''), updated_at = now(), updated_by = ${user.username}
          WHERE lead_code = ${kode}`;
        hasil.akad++;
      } else if (a.rencana) {
        await sql`UPDATE kpr SET catatan = COALESCE(NULLIF(catatan, ''), ${a.rencana}) WHERE lead_code = ${kode}`;
      }
    } else if (cek && bayar === 'KPR' && a.akad) hasil.akad++;
  }

  // ===== 3) Proses KPR: bank, cabang, AO & status dari sheet "Proses KPR" =====
  const TAHAP = ket => /reject|tolak/i.test(ket) ? 'Ditolak' : /sp3k/i.test(ket) ? 'SP3K terbit' : /analis/i.test(ket) ? 'Analisa kredit' : /berkas/i.test(ket) ? 'Kumpul berkas' : 'Diajukan';
  hasil.kpr = { diisi: [], tidakKetemu: [], tahap: {} };
  const normB = b => String(b || '').toLowerCase().replace(/[^a-z]/g, '');
  for (const k0 of (SRC.kpr || []).map(salin)) {
    const tahap = TAHAP(k0.ket || '');
    if (k0.bank) hasil.kpr.tahap[tahap] = (hasil.kpr.tahap[tahap] || 0) + 1;
    const akt = JUAL_AKTIF.find(x => x.u === k0.u);
    let lu = leadUnit[k0.u] || (cek && akt ? { kode: 'cek', nama: akt.nama } : null);
    if (!lu) { // project yang buku penjualannya sudah diimpor sebelumnya: cari kontrak aktif di CRM pada unit itu
      const cocok = G.filter(g => g.unit === k0.u && ['Booking', 'Closing'].includes(g.akhir));
      const g = cocok.find(x => namaSama(x.nama, k0.nama)) || (cocok.length === 1 ? cocok[0] : null);
      if (g) lu = { kode: g.lead_code, nama: k0.nama };
    }
    if (!lu || !namaSama(lu.nama, k0.nama)) { hasil.kpr.tidakKetemu.push(`${k0.u} ${k0.nama}`); continue; }
    if (!k0.bank) { // hanya catatan (mis. rencana P3U Bio)
      hasil.kpr.diisi.push(`${k0.u} ${k0.nama} — ${k0.catatan}`);
      hasil.kpr.tahap['Catatan rencana P3U'] = (hasil.kpr.tahap['Catatan rencana P3U'] || 0) + 1;
      if (cek) continue;
      await sql`INSERT INTO kpr (lead_code, project, unit, profil) VALUES (${lu.kode}, ${PROJ}, ${k0.u}, ${SRC.profil || 'Karyawan'}) ON CONFLICT (lead_code) DO NOTHING`;
      const kc = await sql`UPDATE kpr SET catatan = ${k0.catatan}, updated_by = ${user.username} WHERE lead_code = ${lu.kode} AND akad_realisasi IS NULL RETURNING id`;
      if (kc.length) await sql`INSERT INTO kpr_log (kpr_id, oleh, isi) VALUES (${kc[0].id}, ${user.username}, ${'Dari buku penjualan ' + SRC.per + ': ' + k0.catatan})`;
      continue;
    }
    hasil.kpr.diisi.push(`${k0.u} ${k0.nama} — ${k0.bank}: ${k0.ket}`);
    if (cek) continue;
    await sql`INSERT INTO kpr (lead_code, project, unit, profil) VALUES (${lu.kode}, ${PROJ}, ${k0.u}, ${SRC.profil || 'Karyawan'}) ON CONFLICT (lead_code) DO NOTHING`;
    const kr = await sql`SELECT id, akad_realisasi FROM kpr WHERE lead_code = ${lu.kode}`;
    if (!kr.length || kr[0].akad_realisasi) continue; // sudah akad: tidak diubah
    const kid = kr[0].id;
    const ada = (await sql`SELECT id, bank, tahap FROM kpr_bank WHERE kpr_id = ${kid}`).find(b => normB(b.bank) === normB(k0.bank));
    const kendala = tahap === 'Ditolak' ? k0.ket : (tahap === 'Diajukan' ? k0.ket : null);
    if (ada) await sql`UPDATE kpr_bank SET cabang = COALESCE(NULLIF(cabang, ''), ${k0.cabang}), ao_nama = COALESCE(NULLIF(ao_nama, ''), ${k0.ao}), ao_wa = COALESCE(NULLIF(ao_wa, ''), ${k0.wa}),
        tahap = ${tahap}, kendala = ${kendala}, updated_at = now() WHERE id = ${ada.id}`;
    else await sql`INSERT INTO kpr_bank (kpr_id, bank, cabang, ao_nama, ao_wa, tahap, kendala) VALUES (${kid}, ${k0.bank}, ${k0.cabang}, ${k0.ao}, ${k0.wa}, ${tahap}, ${kendala})`;
    await sql`UPDATE kpr SET updated_at = now(), updated_by = ${user.username} WHERE id = ${kid}`;
    await sql`INSERT INTO kpr_log (kpr_id, oleh, isi) VALUES (${kid}, ${user.username}, ${`Dari Report Proses KPR ${SRC.per}: ${k0.bank} ${k0.cabang} (AO ${k0.ao}) — ${k0.ket}`})`;
  }
  // Konsumen KPR yang belum akad tetapi tidak ada di sheet Proses KPR (status bank belum ada di sumber)
  const diKpr = new Set((SRC.kpr || []).map(salin).map(k0 => k0.u));
  hasil.kpr.tanpaData = !JUAL_AKTIF.length ? [] : JUAL_AKTIF.filter(a => bayarDari(a.cara) === 'KPR' && !a.akad && !diKpr.has(a.u)).map(a => `${a.u} ${a.nama}`);

  // ===== 4) Tanda stok hasil impor lama (Weekly Report) tidak diperlukan lagi: status unit kini dari transaksi =====
  const tanda = await sql`SELECT count(*)::int AS n FROM unit_manual WHERE project = ${PROJ} AND sumber = 'import'`.catch(() => [{ n: 0 }]);
  hasil.tandaImporDihapus = JUAL_AKTIF.length ? (tanda[0]?.n || 0) : 0;
  if (!cek && JUAL_AKTIF.length) await sql`DELETE FROM unit_manual WHERE project = ${PROJ} AND sumber = 'import'`.catch(() => {});
  // Sinkron: tanda manual (Terjual/Reserved) di Master Stock dilepas bila buku penjualan menyatakan lain —
  //  · unit ada di buku penjualan (aktif / batal) → status mengikuti transaksi hasil impor
  //  · unit bertanda "Terjual" manual tetapi tidak ada kontrak aktifnya di buku penjualan → dilepas (tidak terjual)
  //  Tanda "Reserved" manual untuk unit yang belum ada di buku penjualan dibiarkan (reservasi baru).
  hasil.tandaManualDilepas = [];
  if (JUAL_AKTIF.length) {
    const unitBuku = new Set([...JUAL_AKTIF, ...JUAL_BATAL, ...JUAL_RESV_BATAL].map(x => x.u)), unitAktifBuku = new Set(JUAL_AKTIF.map(x => x.u));
    const manual = await sql`SELECT unit, status, nama FROM unit_manual WHERE project = ${PROJ}`.catch(() => []);
    for (const m of manual) {
      const lepas = unitBuku.has(m.unit) || (m.status === 'Terjual' && !unitAktifBuku.has(m.unit));
      if (!lepas) continue;
      hasil.tandaManualDilepas.push(`${m.unit} (${m.status}${m.nama ? ' — ' + m.nama : ''})`);
      if (!cek) await sql`DELETE FROM unit_manual WHERE project = ${PROJ} AND unit = ${m.unit}`.catch(() => {});
    }
  }
  hasil.unitDiseragamkan = hasilUnit;

  // Unit di CRM yang masih tercatat aktif tetapi tidak ada di buku penjualan → dilaporkan untuk dicek
  const unitAktif = new Set(JUAL_AKTIF.map(a => a.u));
  hasil.tidakDiBuku = !JUAL_AKTIF.length ? [] : G.filter(g => !g.dipakai && ['Booking', 'Closing', 'Reserved'].includes(g.akhir) && !unitAktif.has(g.unit)).map(g => `${g.unit} ${g.nama} (${g.akhir})`);
  hasil.unitDobel = !JUAL_AKTIF.length ? [] : G.filter(g => !g.dipakai && ['Booking', 'Closing'].includes(g.akhir) && unitAktif.has(g.unit)).map(g => `${g.unit} ${g.nama} (${g.lead_code})`);
  hasil.per = SRC.per; hasil.project = PROJ; hasil.label = SRC.label;
  return hasil;
}
