import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { TAHAP, infoTahap, bolehSerahkan, cekSyarat, DIVISI } from '@/lib/alur';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

const NAMA_PERAN = { sales: 'Sales', adminsales: 'Admin Sales', collection: 'Collection & KPR',
  finance: 'Finance', project: 'Admin Project', estate: 'Estate', markom: 'Marcom', manager: 'Manager' };

// GET: riwayat perpindahan satu transaksi
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const id = new URL(req.url).searchParams.get('trx_id');
  // Tanpa trx_id (atau 0) hanya mengembalikan definisi tahap — dipakai halaman Panduan
  if (!id || id === '0') return jsonProyek(user, { log: [], tahap: TAHAP });
  const sql = db();
  const log = await sql`SELECT * FROM alur_log WHERE trx_id = ${id} ORDER BY id`;
  return jsonProyek(user, { log, tahap: TAHAP });
}

// POST: serahkan berkas ke divisi berikutnya (atau kembalikan ke divisi sebelumnya)
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.trx_id) return Response.json({ error: 'trx_id wajib' }, { status: 400 });
  const sql = db();

  const rows = await sql`SELECT t.*, l.nama, l.sales,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${b.trx_id}`;
  if (!rows.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  const t = rows[0];
  const kini = Number(t.tahap) || 1;

  // --- Kembalikan ke divisi sebelumnya (butuh alasan) ---
  if (b.aksi === 'kembalikan') {
    if (kini <= 1) return Response.json({ error: 'Sudah pada tahap pertama.' }, { status: 400 });
    if (!bolehSerahkan(user.role, kini)) {
      return Response.json({ error: 'Berkas ini sedang dipegang ' + (NAMA_PERAN[infoTahap(kini).pemegang] || '-') + '.' }, { status: 403 });
    }
    if (!String(b.catatan || '').trim()) {
      return Response.json({ error: 'Isi alasan pengembalian agar divisi sebelumnya tahu yang perlu diperbaiki.' }, { status: 400 });
    }
    const balik = kini - 1;
    await sql`UPDATE transactions SET tahap = ${balik} WHERE id = ${t.id}`;
    await sql`INSERT INTO alur_log (trx_id, lead_code, dari_tahap, ke_tahap, dari_divisi, ke_divisi, oleh, catatan, jenis)
      VALUES (${t.id}, ${t.lead_code}, ${kini}, ${balik}, ${user.role},
              ${infoTahap(balik).pemegang}, ${user.name}, ${b.catatan}, 'kembali')`;
    const tujuan = infoTahap(balik).pemegang;
    if (tujuan && tujuan !== '-') {
      await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
        VALUES (${tujuan}, 'Berkas dikembalikan untuk diperbaiki',
                ${(t.nama || t.lead_code) + ' - ' + b.catatan}, ${t.lead_code}, ${t.id})`;
    }
    return Response.json({ ok: true, tahap: balik });
  }

  // --- Serahkan ke divisi berikutnya ---
  if (!bolehSerahkan(user.role, kini)) {
    return Response.json({
      error: 'Berkas ini sedang dipegang ' + (NAMA_PERAN[infoTahap(kini).pemegang] || '-') +
             '. Hanya divisi tersebut yang dapat menyerahkannya.' }, { status: 403 });
  }
  const halangan = await cekSyarat(sql, t, kini);
  if (halangan) return Response.json({ error: halangan }, { status: 400 });

  const lanjut = kini + 1;
  const next = infoTahap(lanjut);
  if (!next || lanjut > TAHAP.length) return Response.json({ error: 'Berkas sudah selesai.' }, { status: 400 });

  await sql`UPDATE transactions SET tahap = ${lanjut} WHERE id = ${t.id}`;
  await sql`INSERT INTO alur_log (trx_id, lead_code, dari_tahap, ke_tahap, dari_divisi, ke_divisi, oleh, catatan, jenis)
    VALUES (${t.id}, ${t.lead_code}, ${kini}, ${lanjut}, ${user.role},
            ${next.pemegang}, ${user.name}, ${b.catatan || ''}, 'maju')`;

  // Hanya divisi penerima yang diberi tahu — divisi lain memantau via Papan Alur
  const info = (t.nama || t.lead_code) + ' - ' + (t.project || '') + ' ' + (t.unit || '');
  const tujuan = next.pemegang;
  if (tujuan && tujuan !== '-') {
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES (${tujuan}, 'Berkas baru masuk ke divisi Anda', ${info}, ${t.lead_code}, ${t.id})`;
  }

  return Response.json({ ok: true, tahap: lanjut, nama: next.nama });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
export const POST = jagaProyek(_POST, {});
