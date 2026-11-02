import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// Tiga gerbang tambahan sesuai Kebijakan & Prosedur Penjualan:
//   konfirmasi  — cross-check Booking Fee oleh Finance (sebelum verifikasi)
//   ttd         — kelengkapan tanda tangan & paraf konsumen (batas 7 hari)
//   approval    — Sign Approval Manajemen atas Surat Pesanan & PPJB
const IZIN = {
  konfirmasi: ['finance', 'manager'],
  ttd: ['adminsales', 'sales', 'manager'],
  approval: ['manager'],
};

async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.trx_id || !IZIN[b.aksi]) return Response.json({ error: 'Permintaan tidak dikenal' }, { status: 400 });
  if (!IZIN[b.aksi].includes(user.role)) {
    return Response.json({ error: 'Peran Anda tidak berwenang untuk tindakan ini.' }, { status: 403 });
  }

  const sql = db();
  const r = await sql`SELECT t.*, l.nama, l.sales,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${b.trx_id}`;
  if (!r.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  const t = r[0];
  const label = (t.nama || t.lead_code) + ' - ' + (t.project || '') + ' ' + (t.unit || '');

  // --- Finance mengonfirmasi mutasi rekening ---
  if (b.aksi === 'konfirmasi') {
    if (t.finance_konfirmasi_at && !b.batal) {
      return Response.json({ error: 'Mutasi transaksi ini sudah dikonfirmasi.' }, { status: 400 });
    }
    if (b.batal) {
      await sql`UPDATE transactions SET finance_konfirmasi_at = NULL, finance_konfirmasi_by = NULL,
                  finance_catatan = ${b.catatan || ''} WHERE id = ${t.id}`;
      return Response.json({ ok: true });
    }
    await sql`UPDATE transactions SET finance_konfirmasi_at = now(), finance_konfirmasi_by = ${user.name},
                finance_catatan = ${b.catatan || ''} WHERE id = ${t.id}`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('adminsales', 'Mutasi dikonfirmasi Finance', ${label}, ${t.lead_code}, ${t.id})`;
    return Response.json({ ok: true });
  }

  // --- Kelengkapan tanda tangan & paraf konsumen ---
  if (b.aksi === 'ttd') {
    if (t.verif_status !== 'Terverifikasi') {
      return Response.json({ error: 'Dokumen belum terbit. Verifikasi Admin Sales harus selesai lebih dulu.' }, { status: 400 });
    }
    await sql`UPDATE transactions SET ttd_selesai_at = now(), ttd_by = ${user.name} WHERE id = ${t.id}`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('manager', 'Dokumen siap Sign Approval', ${label}, ${t.lead_code}, ${t.id})`;
    return Response.json({ ok: true });
  }

  // --- Sign Approval Manajemen ---
  if (b.aksi === 'approval') {
    if (!t.ttd_selesai_at) {
      return Response.json({ error: 'Tanda tangan & paraf konsumen belum dinyatakan lengkap.' }, { status: 400 });
    }
    if (b.tolak) {
      if (!String(b.catatan || '').trim()) {
        return Response.json({ error: 'Isi alasan agar dokumen dapat diperbaiki.' }, { status: 400 });
      }
      await sql`UPDATE transactions SET ttd_selesai_at = NULL, approval_mgmt_catatan = ${b.catatan} WHERE id = ${t.id}`;
      await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
        VALUES ('adminsales', 'Dokumen dikembalikan Manajemen', ${label + ' - ' + b.catatan}, ${t.lead_code}, ${t.id})`;
      return Response.json({ ok: true });
    }
    await sql`UPDATE transactions SET approval_mgmt_at = now(), approval_mgmt_by = ${user.name},
                approval_mgmt_catatan = ${b.catatan || ''} WHERE id = ${t.id}`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('adminsales', 'Sign Approval Manajemen selesai', ${label}, ${t.lead_code}, ${t.id})`;
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const POST = jagaProyek(_POST, {});
