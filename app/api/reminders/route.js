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
    // Marcom: pengingat FU seluruh lead tim marcom (nama penginput ikut ditampilkan)
    ? await sql`SELECT l.lead_code, l.nama, l.wa, l.project, l.sales, l.next_fu::text AS next_fu,
          CASE WHEN l.created_by <> ${user.username} THEN u.name ELSE NULL END AS markom
        FROM leads l JOIN users u ON u.username = l.created_by AND u.role = 'markom'
        WHERE l.next_fu IS NOT NULL AND l.next_fu::date <= ${today}
          AND l.status NOT IN ('Closing', 'Drop', 'Lost')
        ORDER BY l.next_fu`
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

  // Lead masuk tapi belum tercatat: bandingkan angka platform (Meta: percakapan WA dari iklan; GA4: klik WA website)
  // dengan lead yang diinput ke CRM pada hari yang sama. Hanya untuk marcom & manager/admin.
  let celah = [];
  if (user.role !== 'sales') {
    try {
      const hari = await sql`SELECT d::date AS tgl FROM generate_series(${today}::date - 3, ${today}::date - 1, interval '1 day') d`;
      const meta = await sql`SELECT tgl, sum(COALESCE(hasil, 0))::int AS n FROM mi_ads
        WHERE sumber = 'meta-api' AND tgl BETWEEN ${today}::date - 3 AND ${today}::date - 1 GROUP BY tgl`;
      let ga = [];
      try { ga = await sql`SELECT tgl, sum(key_events)::int AS n FROM mi_ga4_daily
        WHERE tgl BETWEEN ${today}::date - 3 AND ${today}::date - 1 GROUP BY tgl`; } catch {}
      const crm = await sql`SELECT tgl,
          count(*) FILTER (WHERE sumber ~* '(facebook|instagram|whatsapp|meta)')::int AS meta,
          count(*) FILTER (WHERE sumber ~* 'website')::int AS web
        FROM leads WHERE tgl BETWEEN ${today}::date - 3 AND ${today}::date - 1 GROUP BY tgl`;
      const k = d => new Date(d).toISOString().slice(0, 10);
      const mM = Object.fromEntries(meta.map(r => [k(r.tgl), r.n]));
      const mG = Object.fromEntries(ga.map(r => [k(r.tgl), r.n]));
      const mC = Object.fromEntries(crm.map(r => [k(r.tgl), r]));
      for (const h of hari) {
        const t = k(h.tgl), c = mC[t] || { meta: 0, web: 0 };
        if ((mM[t] || 0) - c.meta >= 2) celah.push({ tgl: t, sumber: 'Iklan Meta (chat WA)', platform: mM[t], crm: c.meta });
        if ((mG[t] || 0) - c.web >= 3) celah.push({ tgl: t, sumber: 'Website (klik WA)', platform: mG[t], crm: c.web });
      }
      celah.sort((a, b) => b.tgl.localeCompare(a.tgl));
      // Total 7 hari terakhir (termasuk hari ini) — supaya angka per hari tidak disalahartikan sebagai total
      try {
        const m7 = await sql`SELECT COALESCE(sum(hasil), 0)::int AS n FROM mi_ads WHERE sumber = 'meta-api' AND tgl BETWEEN ${today}::date - 6 AND ${today}::date`;
        const g7 = await sql`SELECT COALESCE(sum(key_events), 0)::int AS n FROM mi_ga4_daily WHERE tgl BETWEEN ${today}::date - 6 AND ${today}::date`;
        const c7 = await sql`SELECT count(*) FILTER (WHERE sumber ~* '(facebook|instagram|whatsapp|meta)')::int AS meta,
          count(*) FILTER (WHERE sumber ~* 'website')::int AS web FROM leads WHERE tgl BETWEEN ${today}::date - 6 AND ${today}::date`;
        var celahTotal = { dari: new Date(new Date(today).getTime() - 6 * 86400000).toISOString().slice(0, 10), sampai: today,
          meta: { platform: m7[0]?.n || 0, crm: c7[0]?.meta || 0 }, web: { platform: g7[0]?.n || 0, crm: c7[0]?.web || 0 } };
      } catch {}
    } catch (e) { console.error('celah lead', e); }
  }

  let aiSiap = [];
  if (user.role !== 'sales') {
    try {
      aiSiap = await sql`SELECT lead_code, nama, wa, project, ai_status, ai_ringkasan FROM leads
        WHERE ai_status IN ('siap_oper', 'eskalasi') AND COALESCE(sales, '') = '' AND status NOT IN ('Drop', 'Closing')
        ORDER BY (ai_status = 'eskalasi') DESC, updated_at DESC LIMIT 20`;
    } catch {}
  }
  return Response.json({ today, hariIni, terlambat, stok, celah, aiSiap, celahTotal: typeof celahTotal !== 'undefined' ? celahTotal : null, total: rows.length + stok.length + celah.length + aiSiap.length });
}
