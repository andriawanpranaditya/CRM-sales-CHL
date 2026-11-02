import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { TEMPLATE, URUTAN_KPR, URUTAN_AJB, SLA_DEFAULT, bacaSLA, aktifkanTahap, hariIniWIB } from '@/lib/alur';
import { SEMUA_DOKUMEN, HASIL_BI, UPDATE_SERTIFIKAT, hasilProses, jumlahDokumen } from '@/lib/ceklisKpr';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';
const LIHAT = ['administrator', 'headsales', 'salesmanager', 'ceogrup', 'ceo', 'admin', 'adminsales', 'finance', 'collection'];  // CEO: lihat status collection & KPR semua project
const UBAH = ['administrator', 'headsales', 'salesmanager', 'collection', 'finance'];

const hariAntara = (a, b) => Math.round((new Date(String(b).slice(0, 10) + 'T00:00:00Z') - new Date(String(a).slice(0, 10) + 'T00:00:00Z')) / 86400000);
const namaTahap = (kunci, i) => TEMPLATE[kunci][i].judul.replace(/^(KPR|AJB) — /, '');

// Ringkasan posisi satu kontrak pada satu proses: tahap berjalan, mulai, tenggat, hari berjalan, keterlambatan
function posisi(items, urutanAwal, jumlah, kunci, slaArr, hariIni) {
  const urut = items.filter(p => p.urutan >= urutanAwal && p.urutan < urutanAwal + jumlah).sort((a, b) => a.urutan - b.urutan);
  const tahap = urut.map((p, i) => ({ id: p.id, no: i + 1, nama: namaTahap(kunci, i), status: p.status, deadline: p.deadline,
    selesai_at: p.selesai_at, selesai_by: p.selesai_by, catatan: p.catatan }));
  const selesaiSemua = urut.length > 0 && urut.every(p => p.status === 'Selesai');
  const berjalan = urut.find(p => p.status !== 'Selesai');
  const idx = berjalan ? urut.indexOf(berjalan) : -1;
  const sebelum = idx > 0 ? urut[idx - 1] : null;
  // Mulai tahap = saat tahap sebelumnya selesai; untuk tahap pertama diturunkan dari tenggat − SLA
  const mulaiEfektif = !berjalan ? null
    : (sebelum && sebelum.selesai_at) ? String(sebelum.selesai_at).slice(0, 10)
    : berjalan.deadline ? new Date(new Date(berjalan.deadline + 'T00:00:00Z').getTime() - (slaArr[idx] || 0) * 86400000).toISOString().slice(0, 10)
    : null;
  const aktif = Boolean(berjalan && berjalan.deadline);
  const hariDiTahap = aktif && mulaiEfektif ? hariAntara(mulaiEfektif, hariIni) : null;
  const terlambat = aktif && berjalan.deadline && berjalan.deadline < hariIni ? hariAntara(berjalan.deadline, hariIni) : 0;
  return { tahap, selesai: selesaiSemua, aktif,
    tahap_no: berjalan ? idx + 1 : (selesaiSemua ? urut.length : 0), tahap_nama: berjalan ? namaTahap(kunci, idx) : (selesaiSemua ? 'Selesai' : '—'),
    mulai: mulaiEfektif, deadline: berjalan ? berjalan.deadline : null, hari_di_tahap: hariDiTahap, terlambat,
    jumlah_selesai: urut.filter(p => p.status === 'Selesai').length, jumlah: urut.length };
}

// GET          -> papan kontrol: { sla, kpr: [...], ajb: [...] }
// GET ?sla=1   -> konfigurasi SLA saja
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!LIHAT.includes(user.role)) return jsonProyek(user, { error: 'Tidak berwenang' }, { status: 403 });
  const sql = db();
  const sla = await bacaSLA(sql);
  const q = new URL(req.url).searchParams;
  if (q.get('sla')) return jsonProyek(user, { sla, bawaan: SLA_DEFAULT, nama: { kpr: TEMPLATE.collectionKPR.map((_, i) => namaTahap('collectionKPR', i)), ajb: TEMPLATE.collectionAJB.map((_, i) => namaTahap('collectionAJB', i)) } });

  const hariIni = hariIniWIB();
  const kontrak = await sql`
    SELECT t.id, t.lead_code, t.unit, t.no_sp, t.harga_unit, t.skema_kode, t.bast_at,
      t.verif_at::text AS verif_at, t.jadwal_at::text AS jadwal_at, t.tgl_kontrak::text AS tgl_kontrak, t.batal_at,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama, l.wa, l.sales,
      s.jenis AS skema_jenis, k.bank, k.status_kredit, k.tgl_sp3k::text AS tgl_sp3k, k.no_sp3k, k.alasan_tolak, k.percobaan_bank, k.tgl_akad::text AS tgl_akad, k.plafon, k.catatan,
      k.tgl_bi_checking::text AS tgl_bi_checking, k.bi_checking, k.pinjaman, k.hasil_bi, k.update_sertifikat, k.jenis_pemohon, k.dokumen, k.lpa, k.slf, k.surat_pernyataan,
      COALESCE(NULLIF(l.ktp_alamat, ''), l.alamat_ktp, '') AS ktp_alamat, l.ktp_rtrw, l.ktp_kel, l.ktp_kec, l.ktp_kota, ag.kantor AS kantor_agent,
      (SELECT COALESCE(sum(nilai - dibayar), 0)::bigint FROM tagihan g WHERE g.trx_id = t.id) AS sisa_tagihan
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    LEFT JOIN skema_bayar s ON s.project = COALESCE(NULLIF(t.project, ''), l.project, '') AND s.kode = t.skema_kode
    LEFT JOIN kpr k ON k.trx_id = t.id
    LEFT JOIN sales_agent ag ON ag.nama = l.sales
    WHERE t.jadwal_at IS NOT NULL AND t.batal_at IS NULL
      AND EXISTS (SELECT 1 FROM proses p WHERE p.trx_id = t.id AND p.divisi = 'collection' AND p.urutan >= ${URUTAN_KPR.mulai})
    ORDER BY t.tgl_kontrak DESC, t.id DESC`;
  const ids = kontrak.map(k => k.id);
  const items = ids.length ? await sql`SELECT id, trx_id, urutan, status, deadline::text AS deadline, selesai_at::text AS selesai_at, selesai_by, catatan
    FROM proses WHERE divisi = 'collection' AND trx_id = ANY(${ids}) AND urutan >= ${URUTAN_KPR.mulai} ORDER BY trx_id, urutan` : [];
  const per = {}; items.forEach(p => { (per[p.trx_id] = per[p.trx_id] || []).push(p); });

  const kpr = [], ajb = [];
  for (const k of kontrak) {
    const mine = per[k.id] || [];
    const dasar = { id: k.id, nama: k.nama, project: k.project, unit: k.unit, no_sp: k.no_sp, sales: k.sales, wa: k.wa, harga_unit: k.harga_unit };
    const adaKPR = mine.some(p => p.urutan >= URUTAN_KPR.mulai && p.urutan < URUTAN_KPR.mulai + URUTAN_KPR.jumlah);
    if (adaKPR) {
      const pos = posisi(mine, URUTAN_KPR.mulai, URUTAN_KPR.jumlah, 'collectionKPR', sla.kpr, hariIni);
      const alamatKtp = [k.ktp_alamat, k.ktp_rtrw ? 'RT/RW ' + k.ktp_rtrw : '', k.ktp_kel ? 'Kel. ' + k.ktp_kel : '', k.ktp_kec ? 'Kec. ' + k.ktp_kec : ''].filter(Boolean).join(' ');
      const akadSelesai = pos.tahap.length >= 8 && pos.tahap[7].status === 'Selesai';
      const berkasSelesai = pos.tahap.length >= 1 && pos.tahap[0].status === 'Selesai';
      const bankDiajukan = pos.tahap.length >= 2 && pos.tahap[1].status === 'Selesai';
      kpr.push({ ...dasar, ...pos, bank: k.bank, status_kredit: k.status_kredit || 'Berjalan', tgl_sp3k: k.tgl_sp3k, no_sp3k: k.no_sp3k,
        alasan_tolak: k.alasan_tolak, percobaan_bank: k.percobaan_bank || 1, tgl_akad: k.tgl_akad, plafon: k.plafon,
        // Ceklis Dokumen KPR
        kantor_agent: k.kantor_agent || '', alamat_ktp: alamatKtp, kota: k.ktp_kota || '',
        tgl_bi_checking: k.tgl_bi_checking, bi_checking: k.bi_checking || '', pinjaman: k.pinjaman || '', hasil_bi: k.hasil_bi || '',
        update_sertifikat: k.update_sertifikat || '', jenis_pemohon: k.jenis_pemohon || 'Karyawan', dokumen: k.dokumen || {},
        lpa: Boolean(k.lpa), slf: Boolean(k.slf), surat_pernyataan: Boolean(k.surat_pernyataan), keterangan: k.catatan || '',
        hasil: hasilProses({ status_kredit: k.status_kredit, akadSelesai, berkasSelesai }), bank_diajukan: bankDiajukan,
        dok: jumlahDokumen(k.dokumen, k.jenis_pemohon) });
    }
    const pos2 = posisi(mine, URUTAN_AJB.mulai, URUTAN_AJB.jumlah, 'collectionAJB', sla.ajb, hariIni);
    if (pos2.jumlah > 0) {
      const sudahMulai = pos2.aktif || pos2.jumlah_selesai > 0;
      ajb.push({ ...dasar, ...pos2, skema_jenis: k.skema_jenis, sisa_tagihan: Number(k.sisa_tagihan),
        pemicu: sudahMulai ? 'berjalan' : (k.skema_jenis === 'kpr' ? 'menunggu akad kredit' : 'menunggu lunas 100%') });
    }
  }
  // Rekap ceklis — mengikuti blok ringkasan pada format ceklis eksternal
  const hitung = (arr, f) => arr.reduce((m, r) => { const k = f(r) || '—'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const belumBank = kpr.filter(r => !r.bank_diajukan && r.hasil !== 'Reject');
  const rekap = {
    hasil: hitung(kpr, r => r.hasil),
    bi_belum_bank: hitung(belumBank, r => (r.hasil_bi || 'Belum BI checking') + ' — belum proses Bank'),
    kantor_agent: hitung(kpr, r => r.kantor_agent || '(kantor belum diisi)'),
    bank: hitung(kpr.filter(r => r.bank), r => r.bank),
    sertifikat_sp3k: hitung(kpr.filter(r => r.hasil === 'SP3K'), r => r.update_sertifikat || 'Belum'),
    sertifikat_akad: hitung(kpr.filter(r => r.hasil === 'Akad Kredit'), r => r.update_sertifikat || 'Belum'),
    total: kpr.length,
  };
  return jsonProyek(user, { sla, hari_ini: hariIni, kpr, ajb, rekap, boleh_ubah: UBAH.includes(user.role),
    dokumen: SEMUA_DOKUMEN, hasil_bi: HASIL_BI, update_sertifikat: UPDATE_SERTIFIKAT });
}

// POST { aksi: 'sla', kpr: [...], ajb: [...] }                                 (Administrator)
// POST { aksi: 'keputusan', trx_id, keputusan: 'disetujui'|'ditolak', tgl, no_sp3k, alasan, plafon }
// POST { aksi: 'ganti_bank', trx_id, bank }                                     -> ulang tahap 2–5 dengan bank baru
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const sql = db();

  if (b.aksi === 'sla') {
    if (!['administrator', 'headsales', 'salesmanager'].includes(user.role)) return Response.json({ error: 'Hanya Administrator yang mengubah SLA' }, { status: 403 });
    const rapikan = (arr, n) => Array.from({ length: n }, (_, i) => { const v = Math.round(Number((arr || [])[i])); if (!(v >= 1 && v <= 120)) throw new Error('SLA harus 1–120 hari (tahap ke-' + (i + 1) + ')'); return v; });
    let kpr, ajb;
    try { kpr = rapikan(b.kpr, URUTAN_KPR.jumlah); ajb = rapikan(b.ajb, URUTAN_AJB.jumlah); } catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
    await sql`INSERT INTO settings (key, items) VALUES ('sla_proses', ${JSON.stringify({ kpr, ajb, diubah_oleh: user.name, diubah_at: new Date().toISOString() })}::jsonb)
      ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
    return Response.json({ ok: true });
  }

  if (!UBAH.includes(user.role)) return Response.json({ error: 'Tidak berwenang' }, { status: 403 });
  const t = (await sql`SELECT t.id, t.lead_code, t.batal_at, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama,
      k.bank, k.percobaan_bank, k.riwayat_bank, k.status_kredit
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code LEFT JOIN kpr k ON k.trx_id = t.id
    WHERE t.id = ${Number(b.trx_id)} AND t.jadwal_at IS NOT NULL`)[0];
  if (!t) return Response.json({ error: 'Kontrak belum berjadwal' }, { status: 400 });
  if (t.batal_at) return Response.json({ error: 'Kontrak ini sudah dibatalkan' }, { status: 400 });
  const adaKPR = await sql`SELECT 1 FROM proses WHERE trx_id = ${t.id} AND divisi = 'collection' AND urutan = ${URUTAN_KPR.mulai}`;
  if (!adaKPR.length) return Response.json({ error: 'Kontrak ini bukan skema KPR' }, { status: 400 });
  const tgl = b.tgl || hariIniWIB();
  const uSP3K = URUTAN_KPR.mulai + 4;   // tahap 5: keputusan Bank
  const sla = await bacaSLA(sql);

  if (b.aksi === 'ceklis') {
    const dok = {};
    const masuk = b.dokumen && typeof b.dokumen === 'object' ? b.dokumen : {};
    for (const [k] of SEMUA_DOKUMEN) dok[k] = masuk[k] === true;
    if (b.hasil_bi && !HASIL_BI.includes(b.hasil_bi)) return Response.json({ error: 'Hasil BI checking harus Lancar / Tidak Lancar / Proses' }, { status: 400 });
    if (b.update_sertifikat && !UPDATE_SERTIFIKAT.includes(b.update_sertifikat)) return Response.json({ error: 'Update sertifikat harus Tahap 1/2/3' }, { status: 400 });
    const jenis = b.jenis_pemohon === 'Wirausaha' ? 'Wirausaha' : 'Karyawan';
    await sql`INSERT INTO kpr (trx_id, tgl_bi_checking, bi_checking, pinjaman, hasil_bi, update_sertifikat, jenis_pemohon, dokumen, lpa, slf, surat_pernyataan, catatan, updated_by, updated_at)
      VALUES (${t.id}, ${b.tgl_bi_checking || null}, ${String(b.bi_checking || '').trim()}, ${String(b.pinjaman || '').trim()}, ${b.hasil_bi || null}, ${b.update_sertifikat || null},
        ${jenis}, ${JSON.stringify(dok)}::jsonb, ${Boolean(b.lpa)}, ${Boolean(b.slf)}, ${Boolean(b.surat_pernyataan)}, ${String(b.keterangan || '').trim()}, ${user.name}, now())
      ON CONFLICT (trx_id) DO UPDATE SET tgl_bi_checking = EXCLUDED.tgl_bi_checking, bi_checking = EXCLUDED.bi_checking, pinjaman = EXCLUDED.pinjaman,
        hasil_bi = EXCLUDED.hasil_bi, update_sertifikat = EXCLUDED.update_sertifikat, jenis_pemohon = EXCLUDED.jenis_pemohon, dokumen = EXCLUDED.dokumen,
        lpa = EXCLUDED.lpa, slf = EXCLUDED.slf, surat_pernyataan = EXCLUDED.surat_pernyataan, catatan = EXCLUDED.catatan, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    // Kantor agent menempel pada agen (dipakai semua kontraknya), bukan pada kontrak ini saja
    if (b.kantor_agent !== undefined) {
      const sales = (await sql`SELECT l.sales FROM transactions t JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${t.id}`)[0];
      if (sales && sales.sales) await sql`INSERT INTO sales_agent (nama, tipe, kantor) VALUES (${sales.sales}, 'Agent', ${String(b.kantor_agent).trim()})
        ON CONFLICT (nama) DO UPDATE SET kantor = EXCLUDED.kantor, updated_at = now()`;
    }
    return Response.json({ ok: true });
  }

  if (b.aksi === 'keputusan') {
    if (!['disetujui', 'ditolak'].includes(b.keputusan)) return Response.json({ error: 'Keputusan harus disetujui / ditolak' }, { status: 400 });
    if (!t.bank && !String(b.bank || '').trim()) return Response.json({ error: 'Nama bank wajib — isi di panel KPR (Piutang) atau di sini' }, { status: 400 });
    const bank = String(b.bank || t.bank || '').trim();
    if (b.keputusan === 'disetujui') {
      await sql`INSERT INTO kpr (trx_id, bank, status_kredit, tgl_sp3k, no_sp3k, alasan_tolak, plafon, updated_by, updated_at)
        VALUES (${t.id}, ${bank}, 'Disetujui', ${tgl}, ${String(b.no_sp3k || '').trim()}, NULL, ${Math.max(0, Math.round(Number(b.plafon) || 0))}, ${user.name}, now())
        ON CONFLICT (trx_id) DO UPDATE SET bank = EXCLUDED.bank, status_kredit = 'Disetujui', tgl_sp3k = EXCLUDED.tgl_sp3k, no_sp3k = EXCLUDED.no_sp3k, alasan_tolak = NULL,
          plafon = CASE WHEN EXCLUDED.plafon > 0 THEN EXCLUDED.plafon ELSE kpr.plafon END, updated_by = EXCLUDED.updated_by, updated_at = now()`;
      // Tahap 1–5 dinyatakan selesai (keputusan bank = tahap 5), tahap 6 aktif
      await sql`UPDATE proses SET status = 'Selesai', selesai_at = COALESCE(selesai_at, now()), selesai_by = COALESCE(selesai_by, ${user.name})
        WHERE trx_id = ${t.id} AND divisi = 'collection' AND urutan BETWEEN ${URUTAN_KPR.mulai} AND ${uSP3K}`;
      await aktifkanTahap(sql, t.id, uSP3K + 1, tgl, sla);
      await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
        VALUES ('finance', 'SP3K terbit — siapkan IOM Subsidi DP & Biaya Akad', ${(t.nama || t.lead_code) + ' · ' + bank + (b.no_sp3k ? ' · ' + b.no_sp3k : '')}, ${t.lead_code}, ${t.id})`;
      return Response.json({ ok: true, status_kredit: 'Disetujui' });
    }
    const alasan = String(b.alasan || '').trim();
    if (!alasan) return Response.json({ error: 'Alasan penolakan Bank wajib diisi' }, { status: 400 });
    const riwayat = ((t.riwayat_bank || '') + '\n' + tgl + ' · ' + bank + ' · DITOLAK: ' + alasan).trim();
    await sql`INSERT INTO kpr (trx_id, bank, status_kredit, alasan_tolak, riwayat_bank, updated_by, updated_at)
      VALUES (${t.id}, ${bank}, 'Ditolak', ${alasan}, ${riwayat}, ${user.name}, now())
      ON CONFLICT (trx_id) DO UPDATE SET bank = EXCLUDED.bank, status_kredit = 'Ditolak', alasan_tolak = EXCLUDED.alasan_tolak, riwayat_bank = EXCLUDED.riwayat_bank, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    const n = Number(t.percobaan_bank || 1);
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('adminsales', ${'KPR ditolak Bank ke-' + n + (n >= 2 ? ' — layak diajukan pembatalan (kategori KPR ditolak)' : ' — ganti Bank atau ubah skema')},
        ${(t.nama || t.lead_code) + ' · ' + bank + ' · ' + alasan}, ${t.lead_code}, ${t.id})`;
    return Response.json({ ok: true, status_kredit: 'Ditolak', percobaan_bank: n });
  }

  if (b.aksi === 'ganti_bank') {
    const bank = String(b.bank || '').trim();
    if (!bank) return Response.json({ error: 'Nama bank baru wajib diisi' }, { status: 400 });
    if (t.status_kredit !== 'Ditolak') return Response.json({ error: 'Ganti bank hanya setelah Bank sebelumnya menolak' }, { status: 400 });
    // Tahap 2–5 diulang untuk bank baru; tahap 1 (berkas) tetap dianggap selesai
    await sql`UPDATE proses SET status = 'Belum', selesai_at = NULL, selesai_by = NULL, deadline = NULL
      WHERE trx_id = ${t.id} AND divisi = 'collection' AND urutan BETWEEN ${URUTAN_KPR.mulai + 1} AND ${uSP3K}`;
    await sql`UPDATE kpr SET bank = ${bank}, status_kredit = 'Berjalan', alasan_tolak = NULL, tgl_sp3k = NULL, no_sp3k = NULL,
      percobaan_bank = COALESCE(percobaan_bank, 1) + 1, updated_by = ${user.name}, updated_at = now() WHERE trx_id = ${t.id}`;
    await aktifkanTahap(sql, t.id, URUTAN_KPR.mulai + 1, tgl, sla);
    return Response.json({ ok: true, percobaan_bank: Number(t.percobaan_bank || 1) + 1 });
  }
  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
export const POST = jagaProyek(_POST, {});
