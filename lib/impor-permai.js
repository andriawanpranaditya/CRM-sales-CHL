// ===== Impor Collection & KPR dari Report Detail (Permai Indah 09/2026 + Ceklis Dokumen KPR; Bio District snapshot 12 Okt 2026) =====
// Membuat lead + transaksi Booking (bila unit belum ada di CRM), kartu KPR (profil, berkas, BI checking, bank, akad),
// dan posisi tagihan/pembayaran per tanggal laporan sebagai SALDO AWAL. Aman diulang (idempoten).
import { DATA_PERMAI_KONTRAK, PER_TANGGAL } from './data-permai-kontrak';
import { DATA_BIO_KONTRAK, PER_TANGGAL_BIO } from './data-bio-kontrak';
import { siapkanKpr } from './kpr';
import { siapkanKontrak } from './collection';

const SUMBER = {
  'PERMAI INDAH': { data: DATA_PERMAI_KONTRAK, per: PER_TANGGAL, bf: 500000, profilDefault: 'Subsidi — Karyawan', tipeDefault: '22,5/60' },
  'BIO DISTRICT': { data: DATA_BIO_KONTRAK, per: PER_TANGGAL_BIO, bf: 5000000, profilDefault: 'Karyawan', tipeDefault: '' },
};
const DOC = { 'KTP': 'KTP', 'KTP PASANGAN': 'KTP Pasangan', 'NPWP': 'NPWP', 'SPT PPH 21': 'SPT PPh 21', 'KK': 'KK', 'SURAT NIKAH': 'Surat Nikah', 'SK DOMISILI': 'SK Domisili', 'PAS FOTO': 'Pas Foto', 'BPJS': 'BPJS',
  'SLIP GAJI': 'Slip Gaji', 'REK KORAN': 'Rekening Koran', 'SKK': 'SKK (Surat Keterangan Kerja)', 'SKTB': 'SKTB (Surat Keterangan Tidak Memiliki Rumah)', 'SKBM': 'SKBM (Surat Keterangan Belum Menikah)', 'FORM FLPP': 'Form FLPP',
  'SKBMR': 'SKBMR (Surat Keterangan Belum Menerima Subsidi)', 'FORM KPR BANK': 'Form KPR Bank', 'SPBPMS': 'SPBPMS', 'SKDU': 'SKDU (Surat Keterangan Domisili Usaha)', 'SKU': 'SKU (Surat Keterangan Usaha)', 'FOTO USAHA': 'Foto Usaha' };
const norm = u => String(u || '').toLowerCase().replace(/blok|\s/g, '').replace(/no\.?|-|_|\//g, '#').replace(/#0+(\d)/, '#$1');
const geser = (t, n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const bankPisah = b => { const m = String(b || '').trim().match(/^(BTN|BCA|BNI|BRI|Mandiri|BSI|BJB)\s*(.*)$/i); return m ? { bank: m[1].toUpperCase() === 'MANDIRI' ? 'Mandiri' : m[1].toUpperCase(), cabang: m[2] || '' } : { bank: b || '', cabang: '' }; };
const rapi = s => String(s || '').trim().replace(/\s+/g, ' ');

export async function imporPermaiKontrak(sql, user, { cek = false, project = 'PERMAI INDAH' } = {}) {
  await siapkanKontrak(sql); await siapkanKpr(sql);
  const PROJ = SUMBER[project] ? project : 'PERMAI INDAH';
  const { data: DATA, per: PER, bf: BF, profilDefault, tipeDefault } = SUMBER[PROJ];
  const st = await sql`SELECT items FROM settings WHERE key = 'units'`;
  const master = ((st[0]?.items || {})[PROJ]) || [];
  const peta = Object.fromEntries(master.map(u => [norm(u), u]));
  const hasil = { dibuat: [], dipakai: [], takDikenal: [], kpr: 0, tagihan: 0, cek };
  for (const d0 of DATA) {
    const d = { ...d0, unit: peta[norm(d0.unit)] || d0.unit };
    if (!peta[norm(d0.unit)]) hasil.takDikenal.push(d0.unit);
    // 1) lead + transaksi: pakai yang sudah ada di CRM untuk unit ini, atau buat baru
    const ada = await sql`SELECT t.lead_code, l.nama FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.unit = ${d.unit} AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${PROJ} AND t.jenis IN ('Reserved', 'Booking', 'Closing') ORDER BY t.id DESC LIMIT 1`;
    let kode = ada[0]?.lead_code || null;
    const bayar = /bertahap|cicilan|tunai/i.test(d.skema || '') || /tunai/i.test(d.status || '') ? 'Cash Bertahap' : /cash keras|^cash$/i.test(d.skema || '') ? 'Cash Keras' : 'KPR';
    const sales = rapi(d.sales || d.ceklis?.agent || '').split('/')[0].trim();
    if (!kode) {
      hasil.dibuat.push(`${d.unit} ${d.nama}`);
      if (cek) continue;
      const tglL = d.tgl_kontrak || d.ceklis?.bi_tgl || PER;
      const ins = await sql`INSERT INTO leads (tgl, nama, wa, domisili, project, tipe, sumber, status, sales, catatan, bayar, created_by, sales_tipe, sales_kantor, sales_hp, potensi_batal)
        VALUES (${tglL}, ${d.nama}, '', ${rapi(d.ceklis?.kota || '')}, ${PROJ}, ${d.tipe || tipeDefault}, 'Import Kontrak', 'Booking', ${sales}, ${rapi(d.catatan || d.ceklis?.ket || '')}, ${bayar}, 'import',
                ${d.intext || (d.ceklis?.kantor ? 'Eksternal' : '')}, ${rapi(d.sub || d.ceklis?.kantor || '')}, ${rapi(d.hp || '')}, ${!!d.potensi_batal}) RETURNING id`;
      kode = 'LEAD-' + String(ins[0].id).padStart(4, '0');
      await sql`UPDATE leads SET lead_code = ${kode} WHERE id = ${ins[0].id}`;
      await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, nilai_jual, catatan, project, bayar, unit, no_kontrak, skema, cicilan, created_by)
        VALUES (${kode}, 'Booking', ${tglL}, ${BF}, ${d.nilai || (PROJ === 'PERMAI INDAH' ? 185000000 : null)}, ${rapi(d.catatan || '')}, ${PROJ}, ${bayar}, ${d.unit}, ${d.no_kontrak || ''}, ${d.skema || ''}, ${d.cicilan || null}, 'import')`;
      if (d.tgl_batal) await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, catatan, project, bayar, unit, created_by) VALUES (${kode}, 'Batal', ${d.tgl_batal}, 0, 'Batal (dari Report Detail)', ${PROJ}, ${bayar}, ${d.unit}, 'import')`;
      await sql`DELETE FROM unit_manual WHERE project = ${PROJ} AND unit = ${d.unit}`;
    } else {
      hasil.dipakai.push(`${d.unit} ${ada[0].nama}`);
      if (cek) continue;
      await sql`UPDATE transactions SET no_kontrak = COALESCE(NULLIF(no_kontrak, ''), ${d.no_kontrak || ''}), skema = COALESCE(NULLIF(skema, ''), ${d.skema || ''}) WHERE lead_code = ${kode} AND unit = ${d.unit} AND jenis IN ('Booking', 'Closing')`;
      await sql`UPDATE leads SET sales_tipe = COALESCE(NULLIF(sales_tipe, ''), ${d.intext || ''}), sales_kantor = COALESCE(NULLIF(sales_kantor, ''), ${rapi(d.sub || d.ceklis?.kantor || '')}), sales_hp = COALESCE(NULLIF(sales_hp, ''), ${rapi(d.hp || '')}), potensi_batal = COALESCE(potensi_batal, ${!!d.potensi_batal}) WHERE lead_code = ${kode}`;
    }
    // 2) KPR: profil rumah subsidi, berkas, BI checking, bank, akad
    if (bayar === 'KPR' || d.ceklis) {
      const c = d.ceklis || {};
      const docs = (c.docs || []).map(x => DOC[x]).filter(Boolean);
      const bankTxt = d.bank || c.bank || '';
      const profil = PROJ === 'PERMAI INDAH' ? ((c.docs || []).some(x => ['SKDU', 'SKU', 'FOTO USAHA'].includes(x)) ? 'Subsidi — Wirausaha' : 'Subsidi — Karyawan') : profilDefault;
      await sql`INSERT INTO kpr (lead_code, project, unit, profil) VALUES (${kode}, ${PROJ}, ${d.unit}, ${profil}) ON CONFLICT (lead_code) DO NOTHING`;
      const k = (await sql`SELECT id, akad_realisasi FROM kpr WHERE lead_code = ${kode}`)[0];
      await sql`UPDATE kpr SET profil = CASE WHEN ${!!d.ceklis} THEN ${profil} ELSE COALESCE(profil, ${profil}) END, berkas = CASE WHEN ${!!d.ceklis} THEN ${JSON.stringify(docs)}::jsonb ELSE berkas END, slik_tgl = COALESCE(slik_tgl, ${c.bi_tgl || null}), slik_status = COALESCE(slik_status, ${c.bi || null}),
        bi_hasil = ${c.bi || null}, bi_pinjaman = ${c.pinjaman || null}, bi_status = ${c.bi_hasil || null}, sertifikat = ${c.sertifikat || null},
        lpa = ${!!c.lpa}, slf = ${!!c.slf}, surat_pernyataan = ${!!c.sp}, alamat_ktp = ${rapi(c.alamat || '') || null}, kota = ${rapi(c.kota || '') || null},
        catatan = COALESCE(NULLIF(catatan, ''), ${rapi(c.ket || d.catatan || '')}), updated_at = now(), updated_by = 'import' WHERE id = ${k.id}`;
      const statusK = d.status_kpr || d.status || c.hasil || '';
      // Bio: 'KPR - Pencairan Tahap 3' / Status KPR 'Akad' = sudah akad; tanggal akad tidak ada di laporan → dipakai tanggal kontrak (bisa dikoreksi di Proses KPR)
      const tglAkad = d.tgl_akad || c.tgl_akad || (/akad|pencairan/i.test(statusK) ? (d.tgl_kontrak || PER) : null);
      if (tglAkad && !bankTxt && !cek) await sql`UPDATE kpr SET akad_tgl = COALESCE(akad_tgl, ${tglAkad}), akad_realisasi = COALESCE(akad_realisasi, ${tglAkad}), catatan = COALESCE(NULLIF(catatan, ''), ${d.tgl_akad || c.tgl_akad ? '' : 'Tgl akad = tgl kontrak (koreksi bila perlu)'}) WHERE id = ${k.id}`;
      if (bankTxt) {
        const { bank, cabang } = bankPisah(bankTxt);
        const tahap = tglAkad || /akad|sp3k/i.test(statusK) ? 'SP3K terbit' : /reject|tolak/i.test(statusK) ? 'Ditolak' : /proses/i.test(statusK) ? 'Analisa kredit' : 'Diajukan';
        const adaB = await sql`SELECT id FROM kpr_bank WHERE kpr_id = ${k.id} AND bank = ${bank}`;
        let bid = adaB[0]?.id;
        if (!bid) { const ib = await sql`INSERT INTO kpr_bank (kpr_id, bank, cabang, tgl_ajukan, tahap, kendala) VALUES (${k.id}, ${bank}, ${cabang}, ${c.bi_tgl || d.tgl_kontrak || null}, ${tahap}, ${/tidak respon|kurang dokumen/i.test(d.catatan || '') ? rapi(d.catatan) : ''}) RETURNING id`; bid = ib[0].id; }
        else await sql`UPDATE kpr_bank SET cabang = COALESCE(NULLIF(cabang, ''), ${cabang}), tahap = ${tahap} WHERE id = ${bid}`;
        if (tglAkad) await sql`UPDATE kpr SET akad_bank_id = ${bid}, akad_tgl = COALESCE(akad_tgl, ${tglAkad}), akad_realisasi = COALESCE(akad_realisasi, ${tglAkad}) WHERE id = ${k.id}`;
      }
      hasil.kpr++;
    }
    // 3) Posisi keuangan per 30 Sep 2026 → saldo awal tagihan & pembayaran (menggantikan jadwal otomatis)
    if (d.nilai) {
      await sql`DELETE FROM pembayaran WHERE lead_code = ${kode} AND catatan LIKE 'Saldo awal Report Detail%'`;
      await sql`DELETE FROM tagihan WHERE lead_code = ${kode} AND unit = ${d.unit} AND sumber IN ('auto', 'impor')`;
      const terbayar = Math.max(0, (d.tagihan || 0) - (d.remainder || 0));
      const baris = [];
      if (d.tagihan > 0) baris.push({ urut: 901, jenis: 'Saldo awal', ket: `Tagihan jatuh tempo s.d. ${PER} (saldo awal Report Detail)`, jt: d.tgl_kontrak || PER, nominal: terbayar });
      const AG = [['0-30 hari', 15], ['31-60 hari', 45], ['61-90 hari', 75], ['91-120 hari', 105], ['>120 hari', 150]];
      (d.aging || []).forEach((v, i) => { if (v > 0) baris.push({ urut: 902 + i, jenis: 'Tunggakan', ket: `Tunggakan per ${PER} (${AG[i][0]})`, jt: geser(PER, -AG[i][1]), nominal: v }); });
      if (d.outstanding > 0) baris.push({ urut: 910, jenis: bayar === 'KPR' ? 'Pencairan KPR' : bayar === 'Cash Bertahap' ? 'Cicilan' : 'Pelunasan', ket: bayar === 'KPR' ? 'Pencairan KPR (akad) — belum jatuh tempo' : bayar === 'Cash Bertahap' ? 'Sisa cicilan — belum jatuh tempo' : 'Pelunasan — belum jatuh tempo', jt: null, nominal: d.outstanding });
      for (const b of baris) {
        const ins = await sql`INSERT INTO tagihan (lead_code, project, unit, urut, jenis, ket, jatuh_tempo, nominal, sumber) VALUES (${kode}, ${PROJ}, ${d.unit}, ${b.urut}, ${b.jenis}, ${b.ket}, ${b.jt}, ${b.nominal}, 'impor')
          ON CONFLICT (lead_code, unit, urut) DO UPDATE SET jenis = EXCLUDED.jenis, ket = EXCLUDED.ket, jatuh_tempo = EXCLUDED.jatuh_tempo, nominal = EXCLUDED.nominal, sumber = 'impor', nonaktif = false, updated_at = now() RETURNING id`;
        if (b.urut === 901 && b.nominal > 0) await sql`INSERT INTO pembayaran (tagihan_id, lead_code, tgl, nominal, cara, catatan, created_by) VALUES (${ins[0].id}, ${kode}, ${PER}, ${b.nominal}, 'Saldo awal', ${'Saldo awal Report Detail per ' + PER}, ${user.username})`;
      }
      hasil.tagihan++;
    }
  }
  return hasil;
}
