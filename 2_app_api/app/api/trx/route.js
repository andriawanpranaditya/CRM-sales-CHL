import { db } from '@/lib/db';
import { ambilNomor } from '@/lib/penomoran';
import { bacaReservasi, hariIniWIB, tambahHariISO, reservasiLewat } from '@/lib/reservasi';
import { cariKembar, pesanKembar, cekFormatNIK, hanyaAngka } from '@/lib/konsumen';
import { requireUser } from '@/lib/auth';
import { tahanSampaiDiotorisasi } from '@/lib/tahan';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// Susunan KTP -> satu baris alamat untuk dokumen & Data Bersama
function gabungAlamatKtp(b) {
  const v = k => String(b[k] || '').trim();
  const rt = v('ktp_rtrw') ? 'RT/RW ' + v('ktp_rtrw') : '';
  return [v('ktp_alamat'), rt, v('ktp_kel') ? 'Kel. ' + v('ktp_kel') : '', v('ktp_kec') ? 'Kec. ' + v('ktp_kec') : '', v('ktp_kota'), v('ktp_prov')]
    .filter(Boolean).join(', ');
}

async function _GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = user.role !== 'sales'
    ? await sql`SELECT t.*, l.nama, l.tipe, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar
        FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code ORDER BY t.id DESC`
    : await sql`SELECT t.*, l.nama, l.tipe, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar
        FROM transactions t JOIN leads l ON l.lead_code = t.lead_code WHERE l.sales = ${user.name} ORDER BY t.id DESC`;
  // Reservasi yang masih menjadi transaksi TERAKHIR di unitnya = reservasi yang sedang berjalan
  const aktif = await sql`SELECT t.id FROM transactions t WHERE t.jenis = 'Reserved' AND t.tgl_expire IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM transactions t2 LEFT JOIN leads l2 ON l2.lead_code = t2.lead_code
      WHERE t2.unit = t.unit AND t2.id > t.id
        AND COALESCE(NULLIF(t2.project, ''), l2.project, '') = COALESCE(NULLIF(t.project, ''), (SELECT project FROM leads WHERE lead_code = t.lead_code), ''))`;
  const aktifSet = new Set(aktif.map(a => a.id));
  const hari = hariIniWIB();
  const ex = await sql`SELECT id, tgl_expire::text AS tgl_expire FROM transactions WHERE tgl_expire IS NOT NULL`;
  const exMap = {}; ex.forEach(e => { exMap[e.id] = e.tgl_expire; });
  return jsonProyek(user, rows.map(r => ({ ...r, tgl_expire: exMap[r.id] || null,
    rsv_aktif: aktifSet.has(r.id), rsv_lewat: aktifSet.has(r.id) && reservasiLewat(exMap[r.id], hari) })));
}

async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.lead_code || !b.nilai) return Response.json({ error: 'ID Lead dan Nilai Reserved/Booking wajib diisi' }, { status: 400 });
  if (!['Reserved', 'Booking', 'Closing', 'Batal'].includes(b.jenis)) return Response.json({ error: 'Jenis transaksi tidak valid' }, { status: 400 });
  // Identitas konsumen wajib untuk Reserved & Booking — dipakai pada Formulir
  // Pemesanan Unit dan diperiksa Admin Sales saat verifikasi.
  if (b.jenis !== 'Batal') {
    if (!String(b.nama_ktp || '').trim()) return Response.json({ error: 'Nama sesuai KTP wajib diisi' }, { status: 400 });
    if (!String(b.alamat_domisili || '').trim()) return Response.json({ error: 'Alamat domisili wajib diisi' }, { status: 400 });
    if (!String(b.email || '').trim()) return Response.json({ error: 'Email konsumen wajib diisi' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email).trim())) {
      return Response.json({ error: 'Format email tidak valid' }, { status: 400 });
    }
    const salahNIK = cekFormatNIK(b.no_ktp);
    if (salahNIK) return Response.json({ error: salahNIK }, { status: 400 });
  }
  const sql = db();
  // Kontrak yang sudah berjadwal tidak boleh "dibatalkan" dengan sekadar menambah baris Batal —
  // tagihannya akan terus berjalan. Arahkan ke Piutang → Batalkan Kontrak.
  if (b.jenis === 'Batal' && b.unit) {
    const ada = await sql`SELECT 1 FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.lead_code = ${b.lead_code} AND t.unit = ${b.unit} AND t.jadwal_at IS NOT NULL AND t.batal_at IS NULL LIMIT 1`;
    if (ada.length) return Response.json({ error: 'Kontrak unit ini sudah berjadwal tagihan. Pembatalan dilakukan lewat menu Piutang → Batalkan Kontrak, agar penagihan berhenti dan pengembalian dana terhitung.' }, { status: 400 });
  }
  // Anti-duplikat konsumen (PRD 5.3): identitas yang sudah dimiliki lead lain
  // tidak boleh dipakai membuat konsumen baru — gunakan lead yang sudah ada.
  if (b.jenis !== 'Batal') {
    const ld = await sql`SELECT wa, npwp FROM leads WHERE lead_code = ${b.lead_code}`;
    const kembar = await cariKembar(sql, {
      nik: b.no_ktp, npwp: b.npwp || (ld.length ? ld[0].npwp : ''), email: b.email,
      hp: ld.length ? ld[0].wa : '', kecuali: b.lead_code,
    });
    if (kembar.length) return Response.json({ error: pesanKembar(kembar[0]), kembar }, { status: 409 });
  }
  if (user.role === 'sales') {
    const own = await sql`SELECT 1 FROM leads WHERE lead_code = ${b.lead_code} AND sales = ${user.name}`;
    if (!own.length) return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  }
  // Wajib bukti transfer pada transaksi PERTAMA lead di unit tsb (transaksi lanjutan bebas)
  if (b.unit && b.project && b.jenis !== 'Batal') {
    const prior = await sql`
      SELECT 1 FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.unit = ${b.unit} AND t.lead_code = ${b.lead_code}
        AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${b.project} LIMIT 1`;
    if (!prior.length) {
      const tf = await sql`SELECT 1 FROM trx_files
        WHERE project = ${b.project} AND unit = ${b.unit} AND lead_code = ${b.lead_code} AND jenis = 'transfer' LIMIT 1`;
      if (!tf.length) {
        return Response.json({ error: 'Upload Bukti Transfer dulu untuk transaksi pertama di unit ini.' }, { status: 400 });
      }
    }
  }

  // Pengaman: unit yang sudah Terjual/Reserved tidak bisa diambil lead lain (kecuali transaksi Batal oleh pemiliknya)
  let kadaluarsa = false, lastRsv = null;
  if (b.unit && b.project && b.jenis !== 'Batal') {
    const last = await sql`
      SELECT t.id, t.jenis, t.lead_code, t.tgl_expire::text AS tgl_expire, t.perpanjang_n FROM transactions t
      LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.unit = ${b.unit} AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${b.project}
      ORDER BY t.id DESC LIMIT 1`;
    // Reservasi yang melewati batas waktu tidak lagi menahan unit bagi lead lain
    kadaluarsa = last.length && last[0].jenis === 'Reserved' && reservasiLewat(last[0].tgl_expire);
    lastRsv = last.length ? last[0] : null;
    const man = await sql`SELECT status FROM unit_manual WHERE project = ${b.project} AND unit = ${b.unit}`;
    const manSt = man.length ? man[0].status : null;
    // Lead pemilik = lead dgn transaksi terakhir non-Batal di unit ini — selalu boleh lanjut (Reserved -> Booking dst)
    const ownerOk = last.length && last[0].jenis !== 'Batal' && last[0].lead_code === b.lead_code;
    let heldByOther;
    if (manSt === 'Kosong') heldByOther = false;
    else if (manSt === 'Terjual' || manSt === 'Reserved') heldByOther = !ownerOk;
    else heldByOther = last.length && last[0].jenis !== 'Batal' && last[0].lead_code !== b.lead_code && !kadaluarsa;
    if (heldByOther) {
      return Response.json({ error: 'Unit ' + b.unit + ' sudah Terjual/Reserved. Pilih unit lain atau minta manager membuka stoknya di Master Stock.' }, { status: 400 });
    }
    // Pemilik reservasi yang sudah lewat batas: melanjutkan (Booking) atau mereservasi ulang butuh otorisasi Manager Sales
    if (kadaluarsa && lastRsv.lead_code === b.lead_code) {
      const tahan = await tahanSampaiDiotorisasi(sql, user, { jenis: 'reservasi_lewat_batas', objek: 'reservasi:' + lastRsv.id + ':' + b.jenis, objek_id: lastRsv.id,
        ringkas: b.lead_code + ' — ' + b.project + ' ' + b.unit + ' · reservasi berakhir ' + lastRsv.tgl_expire + ', akan dilanjutkan sebagai ' + b.jenis, nilai: Number(b.nilai) || 0 });
      if (tahan) return tahan;
    }
  }

  const no_rsv = b.jenis === 'Reserved' ? await ambilNomor(sql, b.project, 'RSV', b.tgl) : null;
  // Batas reservasi: masa berlaku (bawaan 7 hari) dari tanggal reservasi. Baris Reserved tambahan
  // oleh lead yang sama pada reservasi yang MASIH berjalan mewarisi batas lama — tidak mengulang waktu.
  let tglExpire = null;
  if (b.jenis === 'Reserved') {
    const masa = (await bacaReservasi(sql)).masa_hari;
    const mulai = String(b.tgl || hariIniWIB()).slice(0, 10);
    const lanjutan = lastRsv && lastRsv.jenis === 'Reserved' && lastRsv.lead_code === b.lead_code && !kadaluarsa;
    tglExpire = lanjutan ? lastRsv.tgl_expire : tambahHariISO(mulai, masa);
  }
  const skemaHarga = ['Standar', 'All In'].includes(b.skema_harga) ? b.skema_harga : null;
  const baru = await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, harga_unit, catatan, project, bayar, unit, created_by, no_rsv, skema_harga, tgl_expire)
    VALUES (${b.lead_code}, ${b.jenis}, ${b.tgl || null}, ${Number(b.nilai) || 0},
            ${Number(b.harga_unit) || 0}, ${b.catatan || ''},
            ${b.project || ''}, ${b.bayar || ''}, ${b.unit || ''}, ${user.username}, ${no_rsv}, ${skemaHarga}, ${tglExpire})
    RETURNING id`;
  // Finance adalah gerbang konfirmasi mutasi sebelum verifikasi — beri tahu
  // begitu ada pembayaran baru, tanpa menunggu berkas diserahkan ke Admin Sales
  if (b.jenis !== 'Batal' && Number(b.nilai) > 0) {
    const ld = await sql`SELECT nama, nama_ktp FROM leads WHERE lead_code = ${b.lead_code}`;
    const siapa = (ld.length && (ld[0].nama_ktp || ld[0].nama)) || b.lead_code;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('finance', ${'Pembayaran ' + b.jenis + ' baru — perlu konfirmasi mutasi'},
              ${siapa + ' - ' + (b.project || '') + ' ' + (b.unit || '') + ' · Rp ' + Number(b.nilai).toLocaleString('id-ID')},
              ${b.lead_code}, ${baru[0].id})`;
  }
  if (b.jenis !== 'Batal') {
    await sql`UPDATE leads SET no_ktp = ${hanyaAngka(b.no_ktp)}, nama_ktp = ${String(b.nama_ktp).trim()},
        alamat_domisili = ${String(b.alamat_domisili).trim()},
        domisili = ${String(b.alamat_domisili).trim()},
        npwp = COALESCE(NULLIF(${String(b.npwp || '').trim()}, ''), npwp),
        ktp_alamat = ${String(b.ktp_alamat || '').trim()}, ktp_rtrw = ${String(b.ktp_rtrw || '').trim()},
        ktp_kel = ${String(b.ktp_kel || '').trim()}, ktp_kec = ${String(b.ktp_kec || '').trim()},
        ktp_kota = ${String(b.ktp_kota || '').trim()}, ktp_prov = ${String(b.ktp_prov || '').trim()},
        alamat_ktp = COALESCE(NULLIF(${gabungAlamatKtp(b)}, ''), alamat_ktp),
        email = ${String(b.email).trim()}, updated_at = now()
      WHERE lead_code = ${b.lead_code}`;
  }
  // Reserved tidak mengubah status pipeline; Batal -> Drop; Booking/Closing sesuai jenisnya
  if (b.jenis !== 'Reserved') {
    const newStatus = b.jenis === 'Batal' ? 'Drop' : b.jenis;
    await sql`UPDATE leads SET status = ${newStatus}, updated_at = now() WHERE lead_code = ${b.lead_code}`;
  }
  // Reserved/Booking/Closing: jadwal FU otomatis dihentikan (tidak perlu diingatkan lagi)
  if (b.jenis !== 'Batal') {
    await sql`UPDATE leads SET next_fu = NULL, updated_at = now() WHERE lead_code = ${b.lead_code}`;
  }
  return Response.json({ ok: true, id: baru[0].id, no_rsv });
}

// Hitung ulang status pipeline lead dari transaksi tersisa (dipakai PATCH & DELETE)
async function sinkronStatus(sql, lead_code) {
  const rows = await sql`SELECT jenis FROM transactions WHERE lead_code = ${lead_code} ORDER BY id DESC`;
  const t = rows.find(r => r.jenis !== 'Reserved');
  if (t) {
    const st = t.jenis === 'Batal' ? 'Drop' : t.jenis;
    await sql`UPDATE leads SET status = ${st}, updated_at = now() WHERE lead_code = ${lead_code}`;
  }
  // Bila hanya tersisa Reserved / tidak ada transaksi: status dibiarkan — manager bisa atur di Database Lead
}

// Edit transaksi — khusus manager. Status pipeline lead disinkronkan otomatis.
async function _PATCH(req) {
  const { user, err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  if (!['Reserved', 'Booking', 'Closing', 'Batal'].includes(b.jenis)) return Response.json({ error: 'Jenis transaksi tidak valid' }, { status: 400 });
  const sql = db();
  const rows = await sql`SELECT t.*, l.nama FROM transactions t
    LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${b.id}`;
  if (!rows.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  const lama = rows[0];
  const label = (lama.nama || lama.lead_code) + ' — ' + (lama.project || '') + ' ' + (lama.unit || '');

  if (b.jenis === 'Batal' && lama.jenis !== 'Batal' && lama.jadwal_at && !lama.batal_at) {
    return Response.json({ error: 'Kontrak unit ini sudah berjadwal tagihan. Pembatalan dilakukan lewat menu Piutang → Batalkan Kontrak, agar penagihan berhenti dan pengembalian dana terhitung.' }, { status: 400 });
  }
  // Pembatalan transaksi ditahan sampai diotorisasi Project CEO
  if (b.jenis === 'Batal' && lama.jenis !== 'Batal') {
    const tahan = await tahanSampaiDiotorisasi(sql, user, {
      jenis: 'batal_transaksi', objek: 'transaksi', objek_id: lama.id,
      ringkas: label + ' · pembatalan transaksi ' + lama.jenis,
      nilai: Number(lama.nilai) || 0,
    });
    if (tahan) return tahan;
  }
  // Perubahan nilai transaksi setelah PPJB terbit juga ditahan
  const nilaiBaru = b.harga_unit !== undefined ? Number(b.harga_unit) || 0 : null;
  if (nilaiBaru !== null && lama.no_ppjb && nilaiBaru !== Number(lama.harga_unit || 0)) {
    const tahan = await tahanSampaiDiotorisasi(sql, user, {
      jenis: 'ubah_harga', objek: 'transaksi', objek_id: lama.id,
      ringkas: label + ' · ubah nilai transaksi dari ' +
        Number(lama.harga_unit || 0).toLocaleString('id-ID') + ' menjadi ' + nilaiBaru.toLocaleString('id-ID'),
      nilai: nilaiBaru,
    });
    if (tahan) return tahan;
  }

  await sql`UPDATE transactions SET
      tgl = ${b.tgl || null}, jenis = ${b.jenis}, nilai = ${Number(b.nilai) || 0},
      harga_unit = COALESCE(${b.harga_unit !== undefined ? Number(b.harga_unit) || 0 : null}, harga_unit),
      project = ${b.project || ''}, bayar = ${b.bayar || ''}, unit = ${b.unit || ''},
      catatan = ${b.catatan || ''}
    WHERE id = ${b.id}`;
  await sinkronStatus(sql, lama.lead_code);
  return Response.json({ ok: true });
}

// Hapus transaksi — khusus manager. Status lead & stok otomatis mengikuti transaksi tersisa.
async function _DELETE(req) {
  const { err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const sj = await sql`SELECT 1 FROM transactions WHERE id = ${b.id} AND jadwal_at IS NOT NULL`;
  if (sj.length) return Response.json({ error: 'Kontrak ini sudah berjadwal tagihan sehingga tidak dapat dihapus. Gunakan Piutang → Batalkan Kontrak.' }, { status: 400 });
  const rows = await sql`DELETE FROM transactions WHERE id = ${b.id} RETURNING lead_code`;
  if (!rows.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  await sinkronStatus(sql, rows[0].lead_code);
  return Response.json({ ok: true });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, { id: 'transactions' });
export const POST = jagaProyek(_POST, { id: 'transactions' });
export const PATCH = jagaProyek(_PATCH, { id: 'transactions' });
export const DELETE = jagaProyek(_DELETE, { id: 'transactions' });
