import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ambilNomor, nomorInternal } from '@/lib/penomoran';
import { alokasiPembayaran } from '@/lib/piutang';
import { bentukKontrak, cekJadwalUlang, jadwalUlang } from '@/lib/kontrak';
import { tahanBeberapa } from '@/lib/tahan';
import { daftarUnit, unitTerpakai, sinkronStatusLead } from '@/lib/stok';
import { hargaEfektif } from '@/lib/harga';
import { KATEGORI_BATAL, rincianPembayaran, hitungPembatalan } from '@/lib/pembatalan';
import { bacaDenda, hariTelat, hitungDenda } from '@/lib/denda';
import { bacaSP, spDisarankan } from '@/lib/penagihan';
import { mulaiAJBBilaLunas } from '@/lib/alur';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';
const LIHAT = ['administrator', 'headsales', 'salesmanager', 'ceogrup', 'ceo', 'admin', 'adminsales', 'finance', 'collection'];  // CEO: lihat status collection & KPR semua project
const CATAT_TTS = ['administrator', 'headsales', 'salesmanager', 'adminsales', 'finance', 'collection'];
const TERBIT_KW = ['administrator', 'finance'];  // wewenang keuangan: Administrator & Finance saja
const TERBITKAN_DENDA = ['administrator', 'headsales', 'salesmanager', 'finance', 'collection'];
const PEMUTIHAN = ['administrator', 'finance'];  // wewenang keuangan: Administrator & Finance saja
const TERBITKAN_SP = ['administrator', 'headsales', 'salesmanager', 'finance', 'collection'];
const CATAT_FOLLOWUP = ['administrator', 'headsales', 'salesmanager', 'finance', 'collection'];
const BATAL_SP = ['administrator', 'finance'];  // wewenang keuangan: Administrator & Finance saja
const UBAH_KPR = ['administrator', 'headsales', 'salesmanager', 'finance', 'collection'];
const UBAH_KONTRAK = ['administrator', 'headsales', 'salesmanager', 'adminsales'];
const REFUND = ['administrator', 'finance'];  // wewenang keuangan: Administrator & Finance saja
// Aksi yang tidak boleh dijalankan pada kontrak yang sudah dibatalkan
const AKSI_TERKUNCI = ['tts', 'denda', 'pemutihan', 'sp', 'kpr', 'jadwal', 'pengalihan', 'pindah_unit', 'adjustment', 'batal_kontrak', 'followup_catat', 'ajb_catat'];

// GET            -> daftar kontrak berjadwal + ringkasan piutang
// GET ?id=<trx>  -> rincian: kontrak, tagihan, pembayaran
// GET ?belum_jadwal=1 -> kontrak terverifikasi (SPU terbit) yang belum berjadwal —
// biasanya karena diverifikasi sebelum fitur skema/jadwal ini aktif
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!LIHAT.includes(user.role)) return jsonProyek(user, { error: 'Tidak berwenang' }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const sql = db();
  if (q.get('batal_preview')) {
    const kat = String(q.get('kategori') || '');
    if (!KATEGORI_BATAL[kat]) return jsonProyek(user, { error: 'Kategori pembatalan tidak dikenal' }, { status: 400 });
    const rincian = await rincianPembayaran(sql, Number(q.get('id')));
    return jsonProyek(user, { rincian, hasil: hitungPembatalan({ kategori: kat, rincian, pajakDipotong: q.get('pajak_dipotong'),
      biayaLain: q.get('biaya_lain'), nilaiManual: q.get('nilai_manual') }) });
  }
  if (q.get('cari_lead')) {
    const kata = '%' + String(q.get('cari_lead')).trim().toLowerCase() + '%';
    const cur = (await sql`SELECT lead_code FROM transactions WHERE id = ${Number(q.get('id'))}`)[0];
    const rows = await sql`SELECT lead_code, nama, nama_ktp, project, sales, (COALESCE(no_ktp, '') <> '') AS ada_ktp FROM leads
      WHERE (lower(nama) LIKE ${kata} OR lower(COALESCE(nama_ktp, '')) LIKE ${kata} OR lower(lead_code) LIKE ${kata} OR COALESCE(wa, '') LIKE ${kata})
        AND lead_code <> ${cur ? cur.lead_code : ''} ORDER BY nama LIMIT 15`;
    return jsonProyek(user, { rows });
  }
  if (q.get('unit_kosong')) {
    const t = (await sql`SELECT t.unit, COALESCE(NULLIF(t.project, ''), l.project, '') AS project FROM transactions t
      LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${Number(q.get('id'))}`)[0];
    if (!t) return jsonProyek(user, { error: 'Kontrak tidak ditemukan' }, { status: 404 });
    const pakai = await unitTerpakai(sql, t.project);
    const semua = await daftarUnit(sql, t.project);
    const tipe = await sql`SELECT * FROM tipe_unit WHERE project = ${t.project}`; const tm = {}; tipe.forEach(x => { tm[x.tipe] = x; });
    const uh = await sql`SELECT * FROM unit_harga WHERE project = ${t.project}`; const um = {}; uh.forEach(x => { um[x.unit] = x; });
    const rows = semua.filter(u => !pakai.has(u) && u !== t.unit).map(u => {
      const x = um[u] || null; const e = hargaEfektif(x, x && x.tipe ? tm[x.tipe] : null);
      return { unit: u, tipe: (x && x.tipe) || '', harga_standar: e.harga_standar, harga_allin: e.harga_allin };
    });
    return jsonProyek(user, { rows });
  }
  if (q.get('belum_jadwal')) {
    const rows = await sql`
      SELECT DISTINCT ON (t.lead_code, t.unit) t.id, t.lead_code, t.unit, t.no_sp, t.harga_unit,
        COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis IN ('Booking', 'Closing') AND t.no_sp IS NOT NULL AND t.jadwal_at IS NULL AND COALESCE(t.unit, '') <> ''
      ORDER BY t.lead_code, t.unit, t.id DESC`;
    return jsonProyek(user, { rows });
  }
  if (q.get('id')) {
    const id = Number(q.get('id'));
    const k = await sql`SELECT t.*, t.tgl::text AS tgl, t.tgl_kontrak::text AS tgl_kontrak,
        COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama, l.wa, l.sales,
        s.nama AS skema_nama, s.jenis AS skema_jenis
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      LEFT JOIN skema_bayar s ON s.project = COALESCE(NULLIF(t.project, ''), l.project, '') AND s.kode = t.skema_kode
      WHERE t.id = ${id}`;
    if (!k.length) return jsonProyek(user, { error: 'Kontrak tidak ditemukan' }, { status: 404 });
    const tagihanRaw = await sql`SELECT *, jatuh_tempo::text AS jatuh_tempo, pemutihan_at::text AS pemutihan_at,
        GREATEST(0, (CURRENT_DATE - jatuh_tempo))::int AS terlambat_hari FROM tagihan WHERE trx_id = ${id} ORDER BY urutan`;
    const tarifDenda = await bacaDenda(sql, k[0].project);
    // Hari yang sudah tercakup denda yang pernah diterbitkan (termasuk yang diputihkan) tidak didendakan lagi
    const terbitTerakhir = {};
    tagihanRaw.filter(x => x.jenis === 'DENDA' && x.asal_tagihan_id).forEach(x => {
      if (!terbitTerakhir[x.asal_tagihan_id] || x.jatuh_tempo > terbitTerakhir[x.asal_tagihan_id]) terbitTerakhir[x.asal_tagihan_id] = x.jatuh_tempo;
    });
    const tagihan = tagihanRaw.map(t => {
      const tercakup = terbitTerakhir[t.id] ? hariTelat(t.jatuh_tempo, terbitTerakhir[t.id]) : 0;
      const hariBaru = Math.max(0, t.terlambat_hari - tercakup);
      return { ...t, hari_tercakup: tercakup,
        denda_potensial: (t.jenis !== 'DENDA' && t.status !== 'Lunas' && hariBaru > 0)
          ? hitungDenda(Number(t.nilai) - Number(t.dibayar), hariBaru, tarifDenda) : 0 };
    });
    const pembayaran = await sql`SELECT p.*, p.tgl::text AS tgl, p.tgl_bg::text AS tgl_bg,
        (SELECT string_agg(tg.nama || ' Rp ' || to_char(a.nilai, 'FM999G999G999G999'), '; ') FROM pembayaran_alokasi a JOIN tagihan tg ON tg.id = a.tagihan_id WHERE a.pembayaran_id = p.id) AS alokasi
      FROM pembayaran p WHERE p.trx_id = ${id} ORDER BY p.tgl, p.id`;
    const sp = await sql`SELECT *, tgl_terbit::text AS tgl_terbit, batas_bayar::text AS batas_bayar FROM surat_peringatan WHERE trx_id = ${id} ORDER BY tingkat, id`;
    const cfgSP = await bacaSP(sql, k[0].project);
    const maxTelat = tagihan.filter(t => t.jenis !== 'DENDA' && t.status !== 'Lunas' && t.terlambat_hari > 0)
      .reduce((m, t) => Math.max(m, t.terlambat_hari), 0);
    const spTerakhir = sp.filter(x => x.status !== 'Batal').reduce((m, x) => Math.max(m, x.tingkat), 0);
    const jatuhTempoTertua = tagihan.filter(t => t.jenis !== 'DENDA' && t.status !== 'Lunas' && t.terlambat_hari > 0)
      .reduce((m, t) => (!m || t.jatuh_tempo < m ? t.jatuh_tempo : m), null);
    const sp1Row = sp.find(x => x.tingkat === 1 && x.status !== 'Batal'), sp2Row = sp.find(x => x.tingkat === 2 && x.status !== 'Batal');
    const followup = await sql`SELECT f.*, f.tgl::text AS tgl, f.janji_bayar::text AS janji_bayar FROM followup_tagihan f WHERE f.trx_id = ${id} ORDER BY f.tgl DESC, f.id DESC`;
    const followUpAda = jatuhTempoTertua ? followup.some(f => f.tgl >= jatuhTempoTertua) : false;
    const titikSP = { jatuhTempoTertua, sp1Tgl: sp1Row ? sp1Row.tgl_terbit : null, sp2Tgl: sp2Row ? sp2Row.tgl_terbit : null, followUpAda };
    const kpr = (await sql`SELECT *, tgl_akad::text AS tgl_akad FROM kpr WHERE trx_id = ${id}`)[0] || null;
    const jurnal = await sql`SELECT *, tgl::text AS tgl FROM kontrak_jurnal WHERE trx_id = ${id} ORDER BY id DESC`;
    const pembatalan = (await sql`SELECT *, tgl::text AS tgl, tgl_pengajuan::text AS tgl_pengajuan, tgl_bayar::text AS tgl_bayar FROM pembatalan WHERE trx_id = ${id}`)[0] || null;
    const ajb = (await sql`SELECT *, tgl_ajb::text AS tgl_ajb FROM ajb WHERE trx_id = ${id}`)[0] || null;
    const batal = Boolean(k[0].batal_at);
    return jsonProyek(user, { kontrak: k[0], tagihan, pembayaran, sp, kpr, ajb, jurnal, pembatalan, followup,
      boleh_ubah_kontrak: !batal && UBAH_KONTRAK.includes(user.role), boleh_batal: !batal && UBAH_KONTRAK.includes(user.role), boleh_refund: REFUND.includes(user.role),
      max_telat: maxTelat, jatuh_tempo_tertua: jatuhTempoTertua, sp_disarankan: batal ? null : spDisarankan(titikSP, spTerakhir, cfgSP), sp_cfg: cfgSP });
  }
  const rows = await sql`
    SELECT t.id, t.lead_code, t.unit, t.no_sp, t.harga_unit, t.skema_kode, t.tgl_kontrak::text AS tgl_kontrak, t.bast_at,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama, l.sales,
      (SELECT COALESCE(sum(nilai), 0)::bigint FROM tagihan g WHERE g.trx_id = t.id) AS total_tagihan,
      (SELECT COALESCE(sum(dibayar), 0)::bigint FROM tagihan g WHERE g.trx_id = t.id) AS total_dibayar,
      (SELECT COALESCE(sum(nilai - dibayar), 0)::bigint FROM tagihan g WHERE g.trx_id = t.id AND jatuh_tempo < CURRENT_DATE AND dibayar < nilai) AS tunggakan,
      (SELECT min(jatuh_tempo)::text FROM tagihan g WHERE g.trx_id = t.id AND dibayar < nilai) AS jt_berikut,
      (SELECT count(*)::int FROM pembayaran p WHERE p.trx_id = t.id AND p.status = 'TTS') AS tts_menunggu,
      (SELECT COALESCE(max(CURRENT_DATE - jatuh_tempo), 0)::int FROM tagihan g WHERE g.trx_id = t.id AND g.jenis <> 'DENDA'
         AND g.dibayar < g.nilai AND g.jatuh_tempo < CURRENT_DATE) AS max_telat,
      (SELECT COALESCE(max(tingkat), 0)::int FROM surat_peringatan sp WHERE sp.trx_id = t.id AND sp.status <> 'Batal') AS sp_terakhir,
      (SELECT min(jatuh_tempo)::text FROM tagihan g WHERE g.trx_id = t.id AND g.jenis <> 'DENDA' AND g.dibayar < g.nilai AND g.jatuh_tempo < CURRENT_DATE) AS jatuh_tempo_tertua,
      (SELECT tgl_terbit::text FROM surat_peringatan sp1 WHERE sp1.trx_id = t.id AND sp1.tingkat = 1 AND sp1.status <> 'Batal' ORDER BY sp1.id DESC LIMIT 1) AS sp1_tgl,
      (SELECT tgl_terbit::text FROM surat_peringatan sp2 WHERE sp2.trx_id = t.id AND sp2.tingkat = 2 AND sp2.status <> 'Batal' ORDER BY sp2.id DESC LIMIT 1) AS sp2_tgl,
      (SELECT EXISTS(SELECT 1 FROM followup_tagihan f WHERE f.trx_id = t.id
         AND f.tgl >= COALESCE((SELECT min(jatuh_tempo) FROM tagihan g2 WHERE g2.trx_id = t.id AND g2.jenis <> 'DENDA' AND g2.dibayar < g2.nilai AND g2.jatuh_tempo < CURRENT_DATE), '9999-12-31'::date))) AS follow_up_ada,
      t.batal_at::text AS batal_at, pb.status_refund, pb.nilai_kembali, pb.kategori AS kategori_batal
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code LEFT JOIN pembatalan pb ON pb.trx_id = t.id
    WHERE t.jadwal_at IS NOT NULL ORDER BY t.tgl_kontrak DESC, t.id DESC`;
  const cache = {};
  for (const r of rows) {
    if (!(r.project in cache)) cache[r.project] = await bacaSP(sql, r.project);
    const titik = { jatuhTempoTertua: r.jatuh_tempo_tertua, sp1Tgl: r.sp1_tgl, sp2Tgl: r.sp2_tgl, followUpAda: r.follow_up_ada };
    r.sp_disarankan = r.batal_at ? null : spDisarankan(titik, r.sp_terakhir, cache[r.project]);
    if (r.batal_at) { r.tunggakan = 0; r.jt_berikut = null; }   // kontrak batal tidak lagi menunggak / jatuh tempo
  }
  return jsonProyek(user, { rows });
}

// POST { aksi: 'tts', trx_id, tgl, nilai, cara, bank, no_bg, tgl_bg, keterangan, tagihan_id? }
// POST { aksi: 'kw', pembayaran_id }
// POST { aksi: 'batal', pembayaran_id, alasan }
// POST { aksi: 'jadwal', trx_id, skema_kode, tgl_kontrak? }   -> bentuk jadwal untuk kontrak lama yang belum berjadwal
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const sql = db();

  if (AKSI_TERKUNCI.includes(b.aksi)) {
    let trxId = Number(b.trx_id) || 0;
    if (!trxId && b.tagihan_id) trxId = Number(((await sql`SELECT trx_id FROM tagihan WHERE id = ${Number(b.tagihan_id)}`)[0] || {}).trx_id) || 0;
    if (trxId) {
      const bt = await sql`SELECT batal_at FROM transactions WHERE id = ${trxId}`;
      if (bt.length && bt[0].batal_at) return Response.json({ error: 'Kontrak ini sudah dibatalkan — tidak dapat diubah lagi' }, { status: 400 });
    }
  }

  if (b.aksi === 'jadwal') {
    if (!['administrator', 'headsales', 'salesmanager', 'adminsales', 'finance'].includes(user.role)) return Response.json({ error: 'Tidak berwenang' }, { status: 403 });
    try { const r = await bentukKontrak(sql, Number(b.trx_id), b.skema_kode, user.name, b.tgl_kontrak || null); return Response.json({ ok: true, ...r }); }
    catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
  }

  if (b.aksi === 'tts') {
    if (!CATAT_TTS.includes(user.role)) return Response.json({ error: 'Tidak berwenang mencatat pembayaran' }, { status: 403 });
    const nilai = Math.round(Number(b.nilai) || 0);
    if (nilai <= 0) return Response.json({ error: 'Nilai pembayaran harus lebih dari 0' }, { status: 400 });
    const t = (await sql`SELECT t.id, t.lead_code, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, l.nama
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${Number(b.trx_id)} AND t.jadwal_at IS NOT NULL`)[0];
    if (!t) return Response.json({ error: 'Kontrak belum berjadwal' }, { status: 400 });
    const sisa = await sql`SELECT COALESCE(sum(nilai - dibayar), 0)::bigint AS s FROM tagihan WHERE trx_id = ${t.id}`;
    if (nilai > Number(sisa[0].s)) return Response.json({ error: 'Nilai melebihi sisa tagihan (Rp ' + Number(sisa[0].s).toLocaleString('id-ID') + ')' }, { status: 400 });
    // Pencairan dari bank (KPR): selalu menuntaskan baris Akad, bukan baris lain, dan wajib menyebut bank
    let targetTagihan = b.tagihan_id || null;
    if (b.cara === 'Pencairan KPR') {
      if (!String(b.bank || '').trim()) return Response.json({ error: 'Nama bank pencair wajib diisi' }, { status: 400 });
      const ak = (await sql`SELECT id, nilai, dibayar FROM tagihan WHERE trx_id = ${t.id} AND jenis = 'AKAD' ORDER BY urutan LIMIT 1`)[0];
      if (!ak) return Response.json({ error: 'Kontrak ini tidak memiliki baris Akad — bukan skema KPR' }, { status: 400 });
      const sisaAkad = Number(ak.nilai) - Number(ak.dibayar);
      if (nilai > sisaAkad) return Response.json({ error: 'Pencairan melebihi sisa baris Akad (Rp ' + sisaAkad.toLocaleString('id-ID') + ')' }, { status: 400 });
      targetTagihan = ak.id;
    }
    const r = await sql`INSERT INTO pembayaran (trx_id, tagihan_id, tgl, nilai, cara, bank, no_bg, tgl_bg, keterangan, status, dibuat_oleh)
      VALUES (${t.id}, ${targetTagihan}, ${b.tgl || new Date().toISOString().slice(0, 10)}, ${nilai}, ${b.cara || 'Transfer'},
        ${b.bank || ''}, ${b.no_bg || ''}, ${b.tgl_bg || null}, ${b.keterangan || ''}, 'TTS', ${user.name}) RETURNING id`;
    const pid = r[0].id;
    const no_tts = (await ambilNomor(sql, t.project, 'TTS', b.tgl)) || nomorInternal('TTS', pid, b.tgl);
    await sql`UPDATE pembayaran SET no_tts = ${no_tts} WHERE id = ${pid}`;
    const al = await alokasiPembayaran(sql, t.id, nilai, targetTagihan);
    for (const a of al.dipakai) await sql`INSERT INTO pembayaran_alokasi (pembayaran_id, tagihan_id, nilai) VALUES (${pid}, ${a.tagihan_id}, ${a.nilai})`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('finance', ${b.cara === 'Pencairan KPR' ? 'Pencairan KPR dicatat — pastikan dana bank masuk lalu terbitkan kuitansi' : 'TTS baru — pastikan dana masuk lalu terbitkan kuitansi'},
        ${(t.nama || t.lead_code) + ' · ' + no_tts + ' · Rp ' + nilai.toLocaleString('id-ID')}, ${t.lead_code}, ${t.id})`;
    return Response.json({ ok: true, id: pid, no_tts });
  }

  if (b.aksi === 'kw') {
    if (!TERBIT_KW.includes(user.role)) return Response.json({ error: 'Hanya Finance yang menerbitkan kuitansi' }, { status: 403 });
    const p = (await sql`SELECT p.*, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
      FROM pembayaran p JOIN transactions t ON t.id = p.trx_id LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE p.id = ${Number(b.pembayaran_id)}`)[0];
    if (!p) return Response.json({ error: 'Pembayaran tidak ditemukan' }, { status: 404 });
    if (p.status !== 'TTS') return Response.json({ error: 'Pembayaran ini berstatus ' + p.status }, { status: 400 });
    const no_kw = (await ambilNomor(sql, p.project, 'KW')) || nomorInternal('KW', p.id);
    await sql`UPDATE pembayaran SET status = 'KW', no_kw = ${no_kw}, kw_oleh = ${user.name}, kw_at = now() WHERE id = ${p.id}`;
    await mulaiAJBBilaLunas(sql, p.trx_id).catch(() => {});
    return Response.json({ ok: true, no_kw });
  }

  if (b.aksi === 'batal') {
    if (!TERBIT_KW.includes(user.role)) return Response.json({ error: 'Hanya Finance yang membatalkan pembayaran' }, { status: 403 });
    if (!String(b.alasan || '').trim()) return Response.json({ error: 'Alasan pembatalan wajib diisi' }, { status: 400 });
    const p = (await sql`SELECT * FROM pembayaran WHERE id = ${Number(b.pembayaran_id)}`)[0];
    if (!p || p.status === 'Batal') return Response.json({ error: 'Pembayaran tidak ditemukan / sudah batal' }, { status: 400 });
    // Kembalikan alokasi ke tagihan
    const al = await sql`SELECT tagihan_id, nilai FROM pembayaran_alokasi WHERE pembayaran_id = ${p.id}`;
    for (const a of al) {
      await sql`UPDATE tagihan SET dibayar = GREATEST(0, dibayar - ${a.nilai}),
        status = CASE WHEN dibayar - ${a.nilai} <= 0 THEN 'Belum' WHEN dibayar - ${a.nilai} >= nilai THEN 'Lunas' ELSE 'Sebagian' END WHERE id = ${a.tagihan_id}`;
    }
    await sql`DELETE FROM pembayaran_alokasi WHERE pembayaran_id = ${p.id}`;
    await sql`UPDATE pembayaran SET status = 'Batal', batal_oleh = ${user.name}, batal_alasan = ${String(b.alasan).trim()} WHERE id = ${p.id}`;
    return Response.json({ ok: true });
  }
  if (b.aksi === 'denda') {
    if (!TERBITKAN_DENDA.includes(user.role)) return Response.json({ error: 'Tidak berwenang menerbitkan denda' }, { status: 403 });
    const asal = (await sql`SELECT g.*, g.jatuh_tempo::text AS jatuh_tempo, t.lead_code, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
      FROM tagihan g JOIN transactions t ON t.id = g.trx_id LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE g.id = ${Number(b.tagihan_id)}`)[0];
    if (!asal) return Response.json({ error: 'Baris tagihan tidak ditemukan' }, { status: 404 });
    if (asal.jenis === 'DENDA') return Response.json({ error: 'Baris ini sendiri sudah berupa denda — tidak dikenai denda susulan' }, { status: 400 });
    if (asal.status === 'Lunas') return Response.json({ error: 'Baris ini sudah lunas' }, { status: 400 });
    const hariTotal = hariTelat(asal.jatuh_tempo, b.tgl);
    if (hariTotal <= 0) return Response.json({ error: 'Baris ini belum melewati jatuh tempo' }, { status: 400 });
    // Denda yang sudah pernah diterbitkan atas baris ini (termasuk yang diputihkan) mencakup hari-hari sebelumnya:
    // yang didendakan hanya hari sesudahnya — mencegah penagihan ganda
    const terbit = (await sql`SELECT max(jatuh_tempo)::text AS tgl FROM tagihan WHERE jenis = 'DENDA' AND asal_tagihan_id = ${asal.id}`)[0];
    const tercakup = terbit && terbit.tgl ? hariTelat(asal.jatuh_tempo, terbit.tgl) : 0;
    const hari = hariTotal - tercakup;
    if (hari <= 0) return Response.json({ error: 'Denda atas baris ini sudah diterbitkan sampai ' + terbit.tgl + ' (terlambat ' + tercakup + ' hari) — belum ada hari baru yang dapat didendakan' }, { status: 400 });
    const tarif = await bacaDenda(sql, asal.project);
    const nilaiDenda = hitungDenda(Number(asal.nilai) - Number(asal.dibayar), hari, tarif);
    if (nilaiDenda <= 0) return Response.json({ error: 'Nilai denda terhitung 0' }, { status: 400 });
    const urutan = (await sql`SELECT COALESCE(max(urutan), 0) + 1 AS u FROM tagihan WHERE trx_id = ${asal.trx_id}`)[0].u;
    const nama = 'Denda keterlambatan ' + asal.nama + ' — ' + (tercakup > 0 ? 'hari ke-' + (tercakup + 1) + ' s.d. ' + hariTotal + ' (' + hari + ' hari)' : hari + ' hari') + ' × ' + tarif.persen_per_hari + '%/hari';
    const r = await sql`INSERT INTO tagihan (trx_id, urutan, jenis, nama, jatuh_tempo, nilai, asal_tagihan_id)
      VALUES (${asal.trx_id}, ${urutan}, 'DENDA', ${nama}, ${b.tgl || new Date().toISOString().slice(0, 10)}, ${nilaiDenda}, ${asal.id})
      RETURNING id`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('finance', 'Denda keterlambatan diterbitkan', ${nama + ' · Rp ' + nilaiDenda.toLocaleString('id-ID')}, ${asal.lead_code}, ${asal.trx_id})`;
    return Response.json({ ok: true, id: r[0].id, nilai: nilaiDenda, hari, hari_total: hariTotal });
  }

  if (b.aksi === 'pemutihan') {
    if (!PEMUTIHAN.includes(user.role)) return Response.json({ error: 'Hanya Administrator & Finance yang dapat memutihkan denda' }, { status: 403 });
    if (!String(b.alasan || '').trim()) return Response.json({ error: 'Alasan pemutihan wajib diisi' }, { status: 400 });
    const d = (await sql`SELECT * FROM tagihan WHERE id = ${Number(b.tagihan_id)}`)[0];
    if (!d || d.jenis !== 'DENDA') return Response.json({ error: 'Baris ini bukan denda' }, { status: 400 });
    if (d.status === 'Lunas') return Response.json({ error: 'Denda ini sudah lunas dibayar — tidak dapat dipuithkan lagi' }, { status: 400 });
    // Bagian yang belum dibayar dihapuskan; bagian yang mungkin sudah terlanjur dibayar tetap tercatat
    await sql`UPDATE tagihan SET nilai = dibayar, status = 'Lunas',
        pemutihan_oleh = ${user.name}, pemutihan_alasan = ${String(b.alasan).trim()}, pemutihan_at = now()
      WHERE id = ${d.id}`;
    return Response.json({ ok: true });
  }

  if (b.aksi === 'followup_catat') {
    if (!CATAT_FOLLOWUP.includes(user.role)) return Response.json({ error: 'Tidak berwenang mencatat follow up' }, { status: 403 });
    const hasil = String(b.hasil || '').trim();
    if (!hasil) return Response.json({ error: 'Catatan hasil follow up wajib diisi' }, { status: 400 });
    const t = await sql`SELECT 1 FROM transactions WHERE id = ${Number(b.trx_id)} AND jadwal_at IS NOT NULL`;
    if (!t.length) return Response.json({ error: 'Kontrak belum berjadwal' }, { status: 400 });
    const r = await sql`INSERT INTO followup_tagihan (trx_id, tgl, metode, hasil, janji_bayar, oleh)
      VALUES (${Number(b.trx_id)}, ${b.tgl || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })}, ${b.metode || 'Telepon'}, ${hasil}, ${b.janji_bayar || null}, ${user.name}) RETURNING id`;
    return Response.json({ ok: true, id: r[0].id });
  }

  if (b.aksi === 'ajb_catat') {
    if (!UBAH_KPR.includes(user.role)) return Response.json({ error: 'Tidak berwenang mengubah data AJB' }, { status: 403 });
    const t = await sql`SELECT 1 FROM transactions WHERE id = ${Number(b.trx_id)} AND jadwal_at IS NOT NULL`;
    if (!t.length) return Response.json({ error: 'Kontrak belum berjadwal' }, { status: 400 });
    await sql`INSERT INTO ajb (trx_id, notaris, bphtb, pph, tgl_ajb, no_ajb, catatan, updated_by, updated_at)
      VALUES (${Number(b.trx_id)}, ${String(b.notaris || '').trim()}, ${Math.max(0, Math.round(Number(b.bphtb) || 0))}, ${Math.max(0, Math.round(Number(b.pph) || 0))},
        ${b.tgl_ajb || null}, ${String(b.no_ajb || '').trim()}, ${String(b.catatan || '').trim()}, ${user.name}, now())
      ON CONFLICT (trx_id) DO UPDATE SET notaris = EXCLUDED.notaris, bphtb = EXCLUDED.bphtb, pph = EXCLUDED.pph,
        tgl_ajb = EXCLUDED.tgl_ajb, no_ajb = EXCLUDED.no_ajb, catatan = EXCLUDED.catatan, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    return Response.json({ ok: true });
  }

  if (b.aksi === 'sp') {
    if (!TERBITKAN_SP.includes(user.role)) return Response.json({ error: 'Tidak berwenang menerbitkan surat peringatan' }, { status: 403 });
    const t = (await sql`SELECT t.id, t.lead_code, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${Number(b.trx_id)} AND t.jadwal_at IS NOT NULL`)[0];
    if (!t) return Response.json({ error: 'Kontrak belum berjadwal' }, { status: 400 });
    const tgl = b.tgl || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const tarifDenda = await bacaDenda(sql, t.project);
    const cfg = await bacaSP(sql, t.project);
    // Tunggakan pokok & denda terhitung hingga tanggal surat, atas baris pokok yang lewat jatuh tempo
    const baris = await sql`SELECT id, nilai, dibayar, jatuh_tempo::text AS jatuh_tempo FROM tagihan
      WHERE trx_id = ${t.id} AND jenis <> 'DENDA' AND dibayar < nilai AND jatuh_tempo < ${tgl}`;
    if (!baris.length) return Response.json({ error: 'Tidak ada tunggakan yang melewati jatuh tempo' }, { status: 400 });
    const maxTelat = baris.reduce((m, r) => Math.max(m, hariTelat(r.jatuh_tempo, tgl)), 0);
    const tunggakan = baris.reduce((a, r) => a + (Number(r.nilai) - Number(r.dibayar)), 0);
    const denda = baris.reduce((a, r) => a + hitungDenda(Number(r.nilai) - Number(r.dibayar), hariTelat(r.jatuh_tempo, tgl), tarifDenda), 0);
    const jatuhTempoTertua = baris.reduce((m, r) => (!m || r.jatuh_tempo < m ? r.jatuh_tempo : m), null);
    const sp1Row = (await sql`SELECT tgl_terbit::text AS t FROM surat_peringatan WHERE trx_id = ${t.id} AND tingkat = 1 AND status <> 'Batal' ORDER BY id DESC LIMIT 1`)[0];
    const sp2Row = (await sql`SELECT tgl_terbit::text AS t FROM surat_peringatan WHERE trx_id = ${t.id} AND tingkat = 2 AND status <> 'Batal' ORDER BY id DESC LIMIT 1`)[0];
    const followUpAda = (await sql`SELECT EXISTS(SELECT 1 FROM followup_tagihan WHERE trx_id = ${t.id} AND tgl >= ${jatuhTempoTertua}) AS e`)[0].e;
    const terakhir = Number((await sql`SELECT COALESCE(max(tingkat), 0) AS m FROM surat_peringatan WHERE trx_id = ${t.id} AND status <> 'Batal'`)[0].m);
    if (terakhir >= 3) return Response.json({ error: 'SP3 sudah terbit — tidak ada tingkat berikutnya' }, { status: 400 });
    const tingkat = Number(b.tingkat) || (terakhir + 1);
    if (tingkat < 1 || tingkat > 3) return Response.json({ error: 'Tingkat surat peringatan harus 1–3' }, { status: 400 });
    if (tingkat !== terakhir + 1) return Response.json({ error: 'Terbitkan SP' + (terakhir + 1) + ' lebih dulu (surat peringatan berjenjang)' }, { status: 400 });
    if (tingkat === 1 && !followUpAda) return Response.json({ error: 'Follow up (telepon/WA) ke konsumen wajib dicatat dulu sebelum SP1 — catat lewat panel Follow Up Penagihan' }, { status: 400 });
    const dasarHari = tingkat === 1 ? jatuhTempoTertua : tingkat === 2 ? (sp1Row && sp1Row.t) : (sp2Row && sp2Row.t);
    if (tingkat > 1 && !dasarHari) return Response.json({ error: 'SP' + (tingkat - 1) + ' belum tercatat tanggal terbitnya' }, { status: 400 });
    const ambang = Number(cfg['sp' + tingkat + '_hari']);
    const hariBerjalan = Math.round((new Date(tgl + 'T00:00:00Z') - new Date(dasarHari + 'T00:00:00Z')) / 86400000);
    if (hariBerjalan < ambang) return Response.json({ error: 'SP' + tingkat + ' baru layak terbit ' + ambang + ' hari setelah ' + (tingkat === 1 ? 'jatuh tempo' : 'SP' + (tingkat - 1) + ' terbit') + ' (baru ' + hariBerjalan + ' hari)' }, { status: 400 });
    const batas = new Date(new Date(tgl + 'T00:00:00Z').getTime() + Number(cfg.batas_bayar_hari) * 86400000).toISOString().slice(0, 10);
    const r = await sql`INSERT INTO surat_peringatan (trx_id, tingkat, tgl_terbit, hari_telat, tunggakan, denda, batas_bayar, diterbitkan_oleh)
      VALUES (${t.id}, ${tingkat}, ${tgl}, ${maxTelat}, ${tunggakan}, ${denda}, ${batas}, ${user.name}) RETURNING id`;
    const kodeDok = 'SP' + tingkat;
    const no = (await ambilNomor(sql, t.project, kodeDok, tgl)) || nomorInternal(kodeDok, r[0].id, tgl);
    await sql`UPDATE surat_peringatan SET no_surat = ${no} WHERE id = ${r[0].id}`;
    // SP3 = tahap akhir: pembatalan kontrak tidak otomatis, melainkan mengikuti otorisasi Project CEO
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('administrator', ${'SP' + tingkat + ' diterbitkan' + (tingkat === 3 ? ' — pertimbangkan pembatalan kontrak' : '')},
        ${(t.nama || t.lead_code) + ' · ' + no + ' · tunggakan Rp ' + tunggakan.toLocaleString('id-ID') + ' · ' + maxTelat + ' hari' + (tingkat === 3 ? ' · pembatalan memerlukan otorisasi Project CEO' : '')},
        ${t.lead_code}, ${t.id})`;
    return Response.json({ ok: true, id: r[0].id, no_surat: no, tingkat, tunggakan, denda, hari: maxTelat, batas_bayar: batas });
  }

  if (b.aksi === 'sp_batal') {
    if (!BATAL_SP.includes(user.role)) return Response.json({ error: 'Hanya Administrator & Finance yang dapat membatalkan surat peringatan' }, { status: 403 });
    if (!String(b.alasan || '').trim()) return Response.json({ error: 'Alasan pembatalan wajib diisi' }, { status: 400 });
    const x = (await sql`SELECT * FROM surat_peringatan WHERE id = ${Number(b.sp_id)}`)[0];
    if (!x || x.status === 'Batal') return Response.json({ error: 'Surat tidak ditemukan / sudah dibatalkan' }, { status: 400 });
    await sql`UPDATE surat_peringatan SET status = 'Batal', batal_oleh = ${user.name}, batal_alasan = ${String(b.alasan).trim()} WHERE id = ${x.id}`;
    return Response.json({ ok: true });
  }

  if (b.aksi === 'kpr') {
    if (!UBAH_KPR.includes(user.role)) return Response.json({ error: 'Tidak berwenang mengubah data KPR' }, { status: 403 });
    const t = (await sql`SELECT t.id, s.jenis FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      LEFT JOIN skema_bayar s ON s.project = COALESCE(NULLIF(t.project, ''), l.project, '') AND s.kode = t.skema_kode
      WHERE t.id = ${Number(b.trx_id)} AND t.jadwal_at IS NOT NULL`)[0];
    if (!t) return Response.json({ error: 'Kontrak belum berjadwal' }, { status: 400 });
    if (t.jenis !== 'kpr') return Response.json({ error: 'Kontrak ini bukan skema KPR' }, { status: 400 });
    if (!String(b.bank || '').trim()) return Response.json({ error: 'Nama bank wajib diisi' }, { status: 400 });
    await sql`INSERT INTO kpr (trx_id, bank, no_akad, tgl_akad, plafon, catatan, updated_by, updated_at)
      VALUES (${t.id}, ${String(b.bank).trim()}, ${String(b.no_akad || '').trim()}, ${b.tgl_akad || null}, ${Math.max(0, Math.round(Number(b.plafon) || 0))},
        ${String(b.catatan || '').trim()}, ${user.name}, now())
      ON CONFLICT (trx_id) DO UPDATE SET bank = EXCLUDED.bank, no_akad = EXCLUDED.no_akad, tgl_akad = EXCLUDED.tgl_akad,
        plafon = EXCLUDED.plafon, catatan = EXCLUDED.catatan, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    return Response.json({ ok: true });
  }

  if (b.aksi === 'batal_kontrak') {
    if (!UBAH_KONTRAK.includes(user.role)) return Response.json({ error: 'Hanya Administrator & Admin Sales yang dapat membatalkan kontrak' }, { status: 403 });
    const t = (await sql`SELECT t.*, COALESCE(NULLIF(t.project, ''), l.project, '') AS project_efektif, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${Number(b.trx_id)} AND t.jadwal_at IS NOT NULL`)[0];
    if (!t) return Response.json({ error: 'Kontrak belum berjadwal' }, { status: 400 });
    if (!KATEGORI_BATAL[b.kategori]) return Response.json({ error: 'Pilih kategori pembatalan' }, { status: 400 });
    const alasan = String(b.alasan || '').trim();
    if (!alasan) return Response.json({ error: 'Alasan pembatalan wajib diisi' }, { status: 400 });
    if (b.kategori === 'khusus' && !(Number(b.nilai_manual) >= 0 && b.nilai_manual !== '' && b.nilai_manual !== undefined)) return Response.json({ error: 'Nilai pengembalian untuk kebijakan khusus wajib diisi (boleh 0)' }, { status: 400 });
    const project = t.project_efektif;
    const tgl = b.tgl || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const rincian = await rincianPembayaran(sql, t.id);
    const h = hitungPembatalan({ kategori: b.kategori, rincian, pajakDipotong: b.pajak_dipotong, biayaLain: b.biaya_lain, nilaiManual: b.nilai_manual });
    const label = (t.nama || t.lead_code) + ' — ' + project + ' ' + t.unit + ' · ' + t.no_sp;
    const tahan = await tahanBeberapa(sql, user, [{ jenis: 'batal_kontrak', objek: 'kontrak:batal:' + b.kategori + ':' + h.nilaiKembali, objek_id: t.id,
      ringkas: label + ' · batalkan kontrak (' + KATEGORI_BATAL[b.kategori] + ') · pengembalian Rp ' + h.nilaiKembali.toLocaleString('id-ID'), nilai: h.nilaiKembali }]);
    if (tahan) return tahan;

    // Baris Batal pada unit ini (melepas unit & mengubah status lead mengikuti aturan yang sudah ada) + penanda pada kontrak
    const batalTrx = (await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, harga_unit, catatan, project, bayar, unit, created_by)
      VALUES (${t.lead_code}, 'Batal', ${tgl}, 0, 0, ${'Batal kontrak — ' + KATEGORI_BATAL[b.kategori] + ': ' + alasan}, ${project}, ${t.bayar || ''}, ${t.unit}, ${user.username}) RETURNING id`)[0];
    // Seluruh rangkaian baris unit ini (Reserved, Booking, pembayaran lama) ditandai batal — bukan hanya baris kontrak —
    // agar hilang dari Papan Alur, Komisi, pengingat, dan penagihan
    await sql`UPDATE transactions SET batal_at = now()
      WHERE id IN (SELECT t2.id FROM transactions t2 LEFT JOIN leads l2 ON l2.lead_code = t2.lead_code
        WHERE t2.lead_code = ${t.lead_code} AND t2.unit = ${t.unit} AND COALESCE(NULLIF(t2.project, ''), l2.project, '') = ${project}
          AND t2.id < ${batalTrx.id} AND t2.batal_at IS NULL)`;
    await sql`INSERT INTO pembatalan (trx_id, batal_trx_id, tgl, kategori, alasan, bf_dibayar, dp_angsuran_dibayar, adm_dibayar, denda_dibayar, pencairan_bank,
        pajak_dipotong, biaya_lain, denda_terutang, non_refund, nilai_kembali, status_refund, dibuat_oleh)
      VALUES (${t.id}, ${batalTrx.id}, ${tgl}, ${b.kategori}, ${alasan}, ${rincian.bf}, ${rincian.dpAng}, ${rincian.adm}, ${rincian.denda}, ${rincian.pencairan},
        ${h.potongan.pajak}, ${h.potongan.biayaLain}, ${rincian.dendaTerutang}, ${h.nonRefund}, ${h.nilaiKembali}, ${h.nilaiKembali > 0 ? 'Menunggu' : 'Tidak ada'}, ${user.name})`;
    await sql`DELETE FROM unit_manual WHERE project = ${project} AND unit = ${t.unit} AND status IN ('Terjual', 'Reserved')`;
    await sinkronStatusLead(sql, t.lead_code);
    // Komisi yang belum dibayar dibatalkan; yang sudah dibayar diberitahukan (tidak ditarik otomatis)
    const km = (await sql`SELECT status, nilai_komisi FROM komisi WHERE trx_id = ${t.id}`)[0];
    let komisiDibayar = 0;
    if (km) {
      if (km.status === 'Dibayar') komisiDibayar = Number(km.nilai_komisi) || 0;
      else await sql`UPDATE komisi SET status = 'Batal', catatan = COALESCE(catatan, '') || ' · kontrak dibatalkan' WHERE trx_id = ${t.id}`;
    }
    const pesan = label + ' · ' + KATEGORI_BATAL[b.kategori];
    if (h.nilaiKembali > 0) await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('finance', 'Kontrak dibatalkan — pengembalian dana menunggu diajukan', ${pesan + ' · pengembalian Rp ' + h.nilaiKembali.toLocaleString('id-ID')}, ${t.lead_code}, ${t.id})`;
    for (const role of ['collection', 'project']) await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES (${role}, 'Kontrak dibatalkan — hentikan penagihan / persiapan serah terima', ${pesan}, ${t.lead_code}, ${t.id})`;
    return Response.json({ ok: true, nilai_kembali: h.nilaiKembali, non_refund: h.nonRefund, pencairan_bank: rincian.pencairan, komisi_dibayar: komisiDibayar });
  }

  if (b.aksi === 'refund_ajukan' || b.aksi === 'refund_bayar') {
    if (!REFUND.includes(user.role)) return Response.json({ error: 'Hanya Finance yang mengelola pengembalian dana' }, { status: 403 });
    const pb = (await sql`SELECT * FROM pembatalan WHERE trx_id = ${Number(b.trx_id)}`)[0];
    if (!pb) return Response.json({ error: 'Kontrak ini tidak memiliki catatan pembatalan' }, { status: 400 });
    const tgl = b.tgl || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    if (b.aksi === 'refund_ajukan') {
      if (pb.status_refund !== 'Menunggu') return Response.json({ error: 'Pengembalian berstatus ' + pb.status_refund + ' — tidak dapat diajukan' }, { status: 400 });
      await sql`UPDATE pembatalan SET status_refund = 'Diajukan', tgl_pengajuan = ${tgl}, refund_oleh = ${user.name} WHERE id = ${pb.id}`;
      return Response.json({ ok: true });
    }
    if (pb.status_refund !== 'Diajukan') return Response.json({ error: 'Ajukan pengembalian lebih dulu (status saat ini: ' + pb.status_refund + ')' }, { status: 400 });
    if (!String(b.bank || '').trim()) return Response.json({ error: 'Bank / rekening tujuan pengembalian wajib diisi' }, { status: 400 });
    await sql`UPDATE pembatalan SET status_refund = 'Dibayar', tgl_bayar = ${tgl}, bank = ${String(b.bank).trim()}, no_ref = ${String(b.no_ref || '').trim()},
      catatan_refund = ${String(b.catatan || '').trim()}, refund_oleh = ${user.name} WHERE id = ${pb.id}`;
    return Response.json({ ok: true });
  }

  if (['pengalihan', 'pindah_unit', 'adjustment'].includes(b.aksi)) {
    if (!UBAH_KONTRAK.includes(user.role)) return Response.json({ error: 'Hanya Administrator & Admin Sales yang dapat mengubah kontrak' }, { status: 403 });
    const t = (await sql`SELECT t.*, COALESCE(NULLIF(t.project, ''), l.project, '') AS project_efektif, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${Number(b.trx_id)} AND t.jadwal_at IS NOT NULL`)[0];
    if (!t) return Response.json({ error: 'Kontrak belum berjadwal' }, { status: 400 });
    const project = t.project_efektif;
    const tgl = b.tgl || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const alasan = String(b.alasan || '').trim();
    if (!alasan) return Response.json({ error: 'Alasan perubahan wajib diisi' }, { status: 400 });
    const biaya = Math.max(0, Math.round(Number(b.biaya_adm) || 0));
    // Nomor urut perubahan pada kontrak ini — membuat persetujuan berlaku sekali pakai untuk perubahan ini saja
    const seri = Number((await sql`SELECT count(*)::int AS n FROM kontrak_jurnal WHERE trx_id = ${t.id}`)[0].n);
    const label = (t.nama || t.lead_code) + ' — ' + project + ' ' + t.unit + ' · ' + t.no_sp;

    // Catat jurnal, biaya administrasi (sebagai baris tagihan), dan nomor addendum bila diminta
    const catat = async (jenis, sebelum, sesudah) => {
      const j = (await sql`INSERT INTO kontrak_jurnal (trx_id, jenis, tgl, keterangan, sebelum, sesudah, biaya_adm, oleh)
        VALUES (${t.id}, ${jenis}, ${tgl}, ${alasan}, ${JSON.stringify(sebelum)}::jsonb, ${JSON.stringify(sesudah)}::jsonb, ${biaya}, ${user.name}) RETURNING id`)[0];
      let no = null;
      if (b.addendum) {
        no = (await ambilNomor(sql, project, 'ADD', tgl)) || nomorInternal('ADD', j.id, tgl);
        await sql`UPDATE kontrak_jurnal SET no_addendum = ${no} WHERE id = ${j.id}`;
      }
      if (biaya > 0) {
        const u = Number((await sql`SELECT COALESCE(max(urutan), 0) + 1 AS u FROM tagihan WHERE trx_id = ${t.id}`)[0].u);
        await sql`INSERT INTO tagihan (trx_id, urutan, jenis, nama, jatuh_tempo, nilai)
          VALUES (${t.id}, ${u}, 'ADM', ${'Biaya administrasi ' + ({ pengalihan: 'pengalihan hak', pindah_unit: 'pindah unit', adjustment: 'adjustment nilai' }[b.aksi])}, ${tgl}, ${biaya})`;
      }
      return no;
    };

    if (b.aksi === 'pengalihan') {
      const baru = (await sql`SELECT lead_code, nama, nama_ktp, project FROM leads WHERE lead_code = ${String(b.lead_baru || '')}`)[0];
      if (!baru) return Response.json({ error: 'Pemilik baru (lead) tidak ditemukan' }, { status: 400 });
      if (baru.lead_code === t.lead_code) return Response.json({ error: 'Pemilik baru sama dengan pemilik saat ini' }, { status: 400 });
      const tahan = await tahanBeberapa(sql, user, [{ jenis: 'pengalihan_hak', objek: 'kontrak:alih:' + t.lead_code + '>' + baru.lead_code + '#' + seri, objek_id: t.id,
        ringkas: label + ' · pengalihan hak kepada ' + (baru.nama_ktp || baru.nama), nilai: Number(t.harga_unit) || 0 }]);
      if (tahan) return tahan;
      const lama = t.lead_code;
      // Semua baris transaksi unit ini berpindah pemilik; project dipatok agar tidak bergantung pada lead
      await sql`UPDATE transactions SET lead_code = ${baru.lead_code}, project = ${project}
        WHERE id IN (SELECT t2.id FROM transactions t2 LEFT JOIN leads l2 ON l2.lead_code = t2.lead_code
          WHERE t2.lead_code = ${lama} AND t2.unit = ${t.unit} AND COALESCE(NULLIF(t2.project, ''), l2.project, '') = ${project})`;
      await sql`UPDATE leads SET status = 'Booking', updated_at = now() WHERE lead_code = ${baru.lead_code}`;
      const sisaLama = await sinkronStatusLead(sql, lama);
      if (sisaLama === 0) await sql`UPDATE leads SET status = 'Drop', updated_at = now() WHERE lead_code = ${lama}`;
      const no = await catat('pengalihan_hak', { lead_code: lama, nama: t.nama }, { lead_code: baru.lead_code, nama: baru.nama_ktp || baru.nama });
      return Response.json({ ok: true, addendum: no, pemilik: baru.nama_ktp || baru.nama });
    }

    // pindah_unit & adjustment mengubah nilai/unit: periksa seluruh syarat SEBELUM meminta otorisasi
    const hargaLama = Number(t.harga_unit) || 0;
    const hargaBaru = b.harga_baru !== undefined && b.harga_baru !== '' ? Math.round(Number(b.harga_baru) || 0) : hargaLama;

    if (b.aksi === 'adjustment') {
      if (hargaBaru === hargaLama) return Response.json({ error: 'Nilai kontrak baru sama dengan nilai saat ini' }, { status: 400 });
      let cek; try { cek = await cekJadwalUlang(sql, t.id, hargaBaru); } catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
      const gerbang = [{ jenis: 'ubah_nilai_kontrak', objek: 'kontrak:nilai:' + hargaBaru + '#' + seri, objek_id: t.id,
        ringkas: label + ' · ubah nilai kontrak ' + hargaLama.toLocaleString('id-ID') + ' → ' + hargaBaru.toLocaleString('id-ID'), nilai: hargaBaru }];
      // Kontrak yang sudah punya catatan denda: butuh persetujuan tambahan (jenjangnya diatur di Settings → Jenjang Otorisasi)
      if (cek.adaDenda) gerbang.push({ jenis: 'jadwal_ulang_berdenda', objek: 'kontrak:berdenda:' + hargaBaru + '#' + seri, objek_id: t.id,
        ringkas: label + ' · jadwal ulang atas kontrak yang memiliki catatan denda', nilai: hargaBaru });
      const tahan = await tahanBeberapa(sql, user, gerbang);
      if (tahan) return tahan;
      await jadwalUlang(sql, t.id, hargaBaru);
      const no = await catat('adjustment', { harga: hargaLama }, { harga: hargaBaru });
      return Response.json({ ok: true, addendum: no });
    }

    // pindah_unit
    const unitBaru = String(b.unit_baru || '').trim();
    if (!unitBaru || unitBaru === t.unit) return Response.json({ error: 'Pilih unit tujuan yang berbeda dari unit saat ini' }, { status: 400 });
    if (!(await daftarUnit(sql, project)).includes(unitBaru)) return Response.json({ error: 'Unit ' + unitBaru + ' tidak ada di daftar unit ' + project }, { status: 400 });
    if ((await unitTerpakai(sql, project)).has(unitBaru)) return Response.json({ error: 'Unit ' + unitBaru + ' sudah Terjual/Reserved — pilih unit yang tersedia' }, { status: 400 });
    let cek = null;
    if (hargaBaru !== hargaLama) { try { cek = await cekJadwalUlang(sql, t.id, hargaBaru, unitBaru); } catch (e) { return Response.json({ error: e.message }, { status: 400 }); } }
    const gerbang = [{ jenis: 'pindah_unit', objek: 'kontrak:pindah:' + unitBaru + ':' + hargaBaru + '#' + seri, objek_id: t.id,
      ringkas: label + ' · pindah ke ' + unitBaru + (hargaBaru !== hargaLama ? ' · nilai ' + hargaLama.toLocaleString('id-ID') + ' → ' + hargaBaru.toLocaleString('id-ID') : ''), nilai: hargaBaru }];
    if (cek && cek.adaDenda) gerbang.push({ jenis: 'jadwal_ulang_berdenda', objek: 'kontrak:berdenda:' + unitBaru + ':' + hargaBaru + '#' + seri, objek_id: t.id,
      ringkas: label + ' · jadwal ulang atas kontrak yang memiliki catatan denda (pindah ke ' + unitBaru + ')', nilai: hargaBaru });
    const tahan = await tahanBeberapa(sql, user, gerbang);
    if (tahan) return tahan;
    const unitLama = t.unit, lead = t.lead_code;
    await sql`UPDATE transactions SET unit = ${unitBaru}, project = ${project}
      WHERE id IN (SELECT t2.id FROM transactions t2 LEFT JOIN leads l2 ON l2.lead_code = t2.lead_code
        WHERE t2.lead_code = ${lead} AND t2.unit = ${unitLama} AND COALESCE(NULLIF(t2.project, ''), l2.project, '') = ${project})`;
    await sql`UPDATE trx_files SET unit = ${unitBaru} WHERE project = ${project} AND unit = ${unitLama} AND lead_code = ${lead}`;
    // Tanda manual di Master Stock: unit lama dilepas, tanda 'Kosong' pada unit baru dihapus agar transaksi terbaca
    await sql`DELETE FROM unit_manual WHERE project = ${project} AND (unit = ${unitLama} OR (unit = ${unitBaru} AND status = 'Kosong'))`;
    if (hargaBaru !== hargaLama) await jadwalUlang(sql, t.id, hargaBaru);
    const no = await catat('pindah_unit', { unit: unitLama, harga: hargaLama }, { unit: unitBaru, harga: hargaBaru });
    return Response.json({ ok: true, addendum: no, unit: unitBaru, jadwal_ulang: hargaBaru !== hargaLama });
  }

  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
export const POST = jagaProyek(_POST, {});
