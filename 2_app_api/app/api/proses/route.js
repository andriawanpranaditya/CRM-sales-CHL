import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { bacaTemplat } from '@/lib/templat';
import { DIVISI, rantaiTahapSelesai } from '@/lib/alur';
import { tahanSampaiDiotorisasi } from '@/lib/tahan';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

function bolehUbah(user, divisi) {
  if (user.role === 'administrator') return true;
  return user.role === divisi;
}

// GET: daftar item kerja. Divisi ditentukan dari peran; manager bisa pilih ?divisi=
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const q = new URL(req.url).searchParams;
  const divisi = user.role === 'administrator' ? (q.get('divisi') || '') : user.role;

  const rows = divisi
    ? await sql`SELECT p.*, p.deadline::text AS deadline,
          t.unit, t.jenis, t.harga_unit, t.tgl_serah_terima::text AS tgl_serah_terima, t.bast_at, t.bast_kategori,
          l.nama, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
          COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar
        FROM proses p
        JOIN transactions t ON t.id = p.trx_id
        LEFT JOIN leads l ON l.lead_code = p.lead_code
        WHERE p.divisi = ${divisi} AND t.batal_at IS NULL
        ORDER BY (p.status = 'Selesai') ASC, p.deadline NULLS LAST, p.trx_id DESC, p.urutan`
    : await sql`SELECT p.*, p.deadline::text AS deadline,
          t.unit, t.jenis, t.harga_unit, t.tgl_serah_terima::text AS tgl_serah_terima, t.bast_at, t.bast_kategori,
          l.nama, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
          COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar
        FROM proses p
        JOIN transactions t ON t.id = p.trx_id
        LEFT JOIN leads l ON l.lead_code = p.lead_code
        WHERE t.batal_at IS NULL
        ORDER BY (p.status = 'Selesai') ASC, p.deadline NULLS LAST, p.trx_id DESC, p.urutan`;

  // Templat redaksi yang sudah ditetapkan Legal — menentukan apakah BAST dicetak dari templat atau format bawaan
  const tp = await bacaTemplat(sql);
  const templatTerisi = Object.keys(tp).filter(k => String((tp[k] || {}).isi || '').trim());
  return jsonProyek(user, {
    rows, divisi, templatTerisi,
    label: DIVISI[divisi] || 'Semua Divisi',
    boleh: user.role === 'administrator' || !!DIVISI[user.role],
  });
}

// POST: tambah item kerja (mis. Collection menambah jadwal tagihan)
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const divisi = user.role === 'administrator' ? b.divisi : user.role;
  if (!DIVISI[divisi]) return Response.json({ error: 'Divisi tidak dikenal' }, { status: 400 });
  if (!b.trx_id || !String(b.judul || '').trim()) {
    return Response.json({ error: 'Pilih transaksi dan isi judul pekerjaan' }, { status: 400 });
  }
  const sql = db();
  const t = await sql`SELECT lead_code FROM transactions WHERE id = ${b.trx_id}`;
  if (!t.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  await sql`INSERT INTO proses (trx_id, lead_code, divisi, judul, catatan, nilai, deadline, urutan)
    VALUES (${b.trx_id}, ${t[0].lead_code}, ${divisi}, ${b.judul}, ${b.catatan || ''},
            ${Number(b.nilai) || 0}, ${b.deadline || null}, 99)`;
  return Response.json({ ok: true });
}

// PATCH: tandai selesai / batal, atau ubah deadline, nilai, catatan
async function _PATCH(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const cur = await sql`SELECT p.*, l.nama FROM proses p
    LEFT JOIN leads l ON l.lead_code = p.lead_code WHERE p.id = ${b.id}`;
  if (!cur.length) return Response.json({ error: 'Item tidak ditemukan' }, { status: 404 });
  const it = cur[0];
  if (!bolehUbah(user, it.divisi)) {
    return Response.json({ error: 'Item ini milik divisi ' + (DIVISI[it.divisi] || it.divisi) }, { status: 403 });
  }

  if (b.aksi === 'toggle') {
    const jadiSelesai = it.status !== 'Selesai';
    // Penerbitan status Clear untuk Serah Terima ditahan sampai diotorisasi
    if (jadiSelesai && it.divisi === 'finance' && /clear untuk serah terima/i.test(it.judul || '')) {
      const tahan = await tahanSampaiDiotorisasi(sql, user, {
        jenis: 'clear_serah', objek: 'transaksi', objek_id: it.trx_id,
        ringkas: (it.nama || it.lead_code) + ' · terbitkan status Clear untuk Serah Terima',
      });
      if (tahan) return tahan;
    }
    await sql`UPDATE proses SET status = ${jadiSelesai ? 'Selesai' : 'Belum'},
        selesai_at = ${jadiSelesai ? new Date().toISOString() : null},
        selesai_by = ${jadiSelesai ? user.name : null}
      WHERE id = ${b.id}`;
    // Kontrol KPR & AJB: tahap berikutnya aktif (tenggat = hari ini + SLA), akad selesai memulai AJB
    await rantaiTahapSelesai(sql, it, jadiSelesai);
    return Response.json({ ok: true });
  }

  await sql`UPDATE proses SET
      judul = COALESCE(${b.judul || null}, judul),
      catatan = ${b.catatan !== undefined ? b.catatan : it.catatan},
      nilai = ${b.nilai !== undefined ? Number(b.nilai) || 0 : it.nilai},
      deadline = ${b.deadline !== undefined ? (b.deadline || null) : it.deadline}
    WHERE id = ${b.id}`;
  return Response.json({ ok: true });
}

// PUT: Admin Project menetapkan tanggal serah terima -> deadline Marcom & reminder ikut menyesuaikan
async function _PUT(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!['project', 'administrator'].includes(user.role)) {
    return Response.json({ error: 'Hanya Admin Project yang menetapkan jadwal serah terima.' }, { status: 403 });
  }
  const b = await req.json();
  if (!b.trx_id || !b.tanggal) return Response.json({ error: 'Transaksi & tanggal wajib' }, { status: 400 });
  const sql = db();
  const t = await sql`SELECT t.id, t.lead_code, t.unit, l.nama,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${b.trx_id}`;
  if (!t.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });

  await sql`UPDATE transactions SET tgl_serah_terima = ${b.tanggal} WHERE id = ${b.trx_id}`;

  // Ceklis persiapan unit jatuh tempo H-7; hadiah Marcom H-7 sebelum serah terima
  const st = new Date(b.tanggal);
  const mundur = n => new Date(st.getTime() - n * 86400000).toISOString().slice(0, 10);
  await sql`UPDATE proses SET deadline = ${mundur(7)}
            WHERE trx_id = ${b.trx_id} AND divisi = 'project' AND deadline IS NULL AND status <> 'Selesai'`;
  await sql`UPDATE proses SET deadline = ${mundur(7)}
            WHERE trx_id = ${b.trx_id} AND divisi = 'markom' AND deadline IS NULL AND status <> 'Selesai'`;
  await sql`UPDATE proses SET deadline = ${b.tanggal}
            WHERE trx_id = ${b.trx_id} AND divisi = 'estate' AND deadline IS NULL AND status <> 'Selesai'`;

  // Tidak ada notifikasi tambahan: deadline pekerjaan Marcom & Estate sudah
  // menyesuaikan otomatis, dan pengingatnya muncul saat mendekati jatuh tempo.
  return Response.json({ ok: true });
}

async function _DELETE(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const cur = await sql`SELECT divisi FROM proses WHERE id = ${b.id}`;
  if (!cur.length) return Response.json({ error: 'Item tidak ditemukan' }, { status: 404 });
  if (!bolehUbah(user, cur[0].divisi)) return Response.json({ error: 'Tidak berhak' }, { status: 403 });
  await sql`DELETE FROM proses WHERE id = ${b.id}`;
  return Response.json({ ok: true });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, { id: 'proses' });
export const POST = jagaProyek(_POST, { id: 'proses' });
export const PATCH = jagaProyek(_PATCH, { id: 'proses' });
export const PUT = jagaProyek(_PUT, { id: 'proses' });
export const DELETE = jagaProyek(_DELETE, { id: 'proses' });
