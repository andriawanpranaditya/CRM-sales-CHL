import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Pengingat FU untuk user yang sedang login:
// sales -> hanya lead miliknya; manager -> semua lead
export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

  const rows = user.role === 'markom'
    ? await sql`SELECT lead_code, nama, wa, project, sales, next_fu::text AS next_fu
        FROM leads
        WHERE created_by = ${user.username} AND next_fu IS NOT NULL AND next_fu::date <= ${today}
          AND status NOT IN ('Closing', 'Drop', 'Lost')
        ORDER BY next_fu`
    : user.role !== 'sales'
    ? await sql`SELECT l.lead_code, l.nama, l.wa, l.project, l.sales, l.next_fu::text AS next_fu,
          CASE WHEN u.role = 'markom' THEN u.name ELSE NULL END AS markom
        FROM leads l LEFT JOIN users u ON u.username = l.created_by
        WHERE l.next_fu IS NOT NULL AND l.next_fu::date <= ${today}
          AND l.status NOT IN ('Closing', 'Drop', 'Lost')
        ORDER BY l.next_fu`
    : await sql`SELECT lead_code, nama, wa, project, sales, next_fu::text AS next_fu
        FROM leads
        WHERE sales = ${user.name}
          AND next_fu IS NOT NULL AND next_fu::date <= ${today}
          AND status NOT IN ('Closing', 'Drop', 'Lost')
        ORDER BY next_fu`;

  const hariIni = rows.filter(r => r.next_fu === today);
  const terlambat = rows.filter(r => r.next_fu < today);

  // Khusus manager: unit bertransaksi/berstatus yang BELUM ditandai di peta Master Stock
  let stok = [];
  if (user.role !== 'sales') {
    const trx = await sql`
      SELECT t.id, t.jenis, t.unit,
             COALESCE(NULLIF(t.project, ''), l.project, '') AS project
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.unit IS NOT NULL AND t.unit <> ''
      ORDER BY t.id`;
    const manual = await sql`SELECT project, unit, status FROM unit_manual`;
    const posRows = await sql`SELECT project, unit FROM unit_positions`;
    const posSet = new Set(posRows.map(p => p.project + '|' + p.unit));
    const m = {};
    trx.forEach(t => {
      if (!t.project) return;
      const key = t.project + '|' + t.unit;
      if (t.jenis === 'Batal') m[key] = null;
      else m[key] = t.jenis === 'Reserved' ? 'kuning' : 'merah';
    });
    manual.forEach(x => {
      const key = x.project + '|' + x.unit;
      m[key] = x.status === 'Terjual' ? 'merah' : x.status === 'Reserved' ? 'kuning' : null;
    });
    stok = Object.entries(m)
      .filter(([k, v]) => v && !posSet.has(k))
      .map(([k, v]) => ({ project: k.split('|')[0], unit: k.split('|')[1], warna: v }));
  }

  return Response.json({ today, hariIni, terlambat, stok, total: rows.length + stok.length });
}
