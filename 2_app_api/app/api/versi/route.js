import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ===== Sidik data (versi) — penghemat transfer database =====
// Dulu dashboard menarik SELURUH lead, FU, transaksi & stok tiap 60 detik walau tidak ada yang berubah.
// Sekarang dashboard cukup menanyakan "sidik" ini (puluhan byte). Data penuh baru ditarik ulang bila
// sidiknya berubah. Hash dihitung DI DALAM database — yang keluar dari Neon hanya satu baris teks pendek.

export async function GET() {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  let inti = '-', log = '-';
  try {
    const r = await sql`SELECT concat_ws('|',
      (SELECT count(*)::text || '.' || COALESCE(sum(hashtext(x::text)::bigint), 0)::text FROM leads x),
      (SELECT count(*)::text || '.' || COALESCE(sum(hashtext(x::text)::bigint), 0)::text FROM followups x),
      (SELECT count(*)::text || '.' || COALESCE(sum(hashtext(x::text)::bigint), 0)::text FROM transactions x),
      (SELECT count(*)::text || '.' || COALESCE(sum(hashtext(x::text)::bigint), 0)::text FROM unit_manual x),
      (SELECT count(*)::text || '.' || COALESCE(sum(hashtext(x::text)::bigint), 0)::text FROM unit_positions x),
      (SELECT count(*)::text || '.' || COALESCE(sum(hashtext(x::text)::bigint), 0)::text FROM settings x),
      (SELECT count(*)::text || '.' || COALESCE(sum(hashtext(x::text)::bigint), 0)::text FROM kegiatan x),
      (SELECT count(*)::text || '.' || COALESCE(sum(hashtext(ROW(x.name, x.role, x.active)::text)::bigint), 0)::text FROM users x)
    ) AS v`;
    inti = r[0]?.v || '-';
  } catch (e) { inti = 'x' + Date.now(); } // tabel belum lengkap: anggap berubah (perilaku lama)
  try {
    const r = await sql`SELECT count(*)::text || '.' || COALESCE(max(id), 0)::text AS v FROM lead_status_log`;
    log = r[0]?.v || '-';
  } catch {}
  return Response.json({ v: inti + '|' + log }, { headers: { 'cache-control': 'no-store' } });
}
