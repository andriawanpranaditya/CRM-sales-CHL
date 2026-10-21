import { db } from '@/lib/db';
import { requireUser, lihatBaris } from '@/lib/auth';
import { siapkanJanjian, perluUpdate, sekarangWIB } from '@/lib/janjian';

export const dynamic = 'force-dynamic';

// Pengingat FU untuk user yang sedang login:
// sales -> hanya lead miliknya; manager -> semua lead
export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

  // ===== Collection & KPR: lonceng khusus (tagihan jatuh tempo / tunggakan, akad, kendala KPR) — tanpa pengingat follow up sales =====
  if (user.role === 'collection') {
    const { daftarTagihan } = await import('@/lib/collection');
    const { siapkanKpr, statusKpr } = await import('@/lib/kpr');
    const pp = user.projects;
    const besok = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    let tagihan = [];
    try { tagihan = (await daftarTagihan(sql, { pp, hariIni: today })).filter(r => r.sisa > 0 && lihatBaris(user, { project: r.project, sales: r.sales, created_by: r.lead_by })); } catch (e) { console.error('reminder tagihan', e); }
    const tunggakan = tagihan.filter(r => r.jatuh_tempo && r.jatuh_tempo < today).sort((a, b) => b.hariLewat - a.hariLewat);
    const jatuhTempo = tagihan.filter(r => r.jatuh_tempo === today || r.jatuh_tempo === besok);
    let akad = [], kendala = [];
    try {
      await siapkanKpr(sql);
      const ks = await sql`SELECT k.id, k.lead_code, k.unit, k.akad_bank_id, k.akad_tgl::text AS akad_tgl, k.akad_realisasi::text AS akad_realisasi, k.updated_at, l.nama, l.sales, l.created_by AS lead_by, COALESCE(NULLIF(k.project, ''), l.project, '') AS project,
          (SELECT t.jenis FROM transactions t WHERE t.lead_code = k.lead_code ORDER BY t.id DESC LIMIT 1) AS trx_terakhir
        FROM kpr k LEFT JOIN leads l ON l.lead_code = k.lead_code WHERE (${pp}::text[] IS NULL OR COALESCE(NULLIF(k.project, ''), l.project, '') = ANY(${pp}::text[]))`;
      const ids = ks.map(k => k.id);
      const bk = ids.length ? await sql`SELECT id, kpr_id, bank, tahap, kendala FROM kpr_bank WHERE kpr_id = ANY(${ids}::int[])` : [];
      ks.filter(k => k.trx_terakhir !== 'Batal' && lihatBaris(user, { project: k.project, sales: k.sales, created_by: k.lead_by })).forEach(k => {
        const b = bk.filter(x => x.kpr_id === k.id), st = statusKpr(k, b, k.trx_terakhir);
        if (st.kategori === 'akad' && k.akad_tgl && !k.akad_realisasi && k.akad_tgl <= besok) akad.push({ id: k.id, nama: k.nama, unit: k.unit, tgl: k.akad_tgl, lewat: k.akad_tgl < today, bank: (b.find(x => x.id === k.akad_bank_id) || {}).bank || '' });
        const kd = b.filter(x => x.kendala && !['Ditolak', 'Tidak dilanjutkan'].includes(x.tahap)).map(x => `${x.bank}: ${x.kendala}`).join(' · ');
        if (st.kategori === 'berjalan' && kd) kendala.push({ id: k.id, nama: k.nama, unit: k.unit, kendala: kd, hari: Math.floor((Date.now() - new Date(k.updated_at).getTime()) / 86400000) });
      });
    } catch (e) { console.error('reminder kpr', e); }
    const ringkas = r => ({ id: r.id, lead_code: r.lead_code, nama: r.nama, unit: r.unit, ket: r.ket, sisa: r.sisa, jatuh_tempo: r.jatuh_tempo, hariLewat: r.hariLewat, wa: r.wa });
    return Response.json({ today, peran: 'collection', hariIni: [], terlambat: [], stok: [], celah: [], aiSiap: [], janjian: [],
      tunggakan: tunggakan.slice(0, 30).map(ringkas), jatuhTempo: jatuhTempo.map(ringkas), akad, kendala: kendala.slice(0, 20),
      total: tunggakan.length + jatuhTempo.length + akad.length + kendala.length });
  }

  let rows = user.role === 'markom'
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

  if (user.projects) rows = rows.filter(r => lihatBaris(user, r));
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
  if (user.projects) { stok = stok.filter(x => user.projects.includes(x.project)); aiSiap = aiSiap.filter(x => lihatBaris(user, x)); }
  // Pengingat janjian visit: sales → miliknya hari ini & besok + yang perlu di-update; manager/CEO → yang perlu di-update
  let janjian = [];
  if (['sales', 'manager', 'ceo'].includes(user.role)) {
    try {
      await siapkanJanjian(sql);
      const now = sekarangWIB();
      const besok = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
      const jr = await sql`SELECT j.id, j.lead_code, j.project, j.sales, j.jenis, j.lokasi, j.tgl::text AS tgl, j.jam, j.status, l.nama, l.wa, l.created_by
        FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code
        WHERE j.status = 'Terjadwal' AND j.tgl <= ${besok}::date
          AND (${user.role === 'sales' ? user.name : null}::text IS NULL OR j.sales = ${user.role === 'sales' ? user.name : null})
        ORDER BY j.tgl, j.jam`;
      janjian = jr.filter(j => lihatBaris(user, j)).map(j => ({ ...j, perlu_update: perluUpdate(j, now) }))
        .filter(j => user.role === 'sales' ? true : j.perlu_update);
    } catch (e) { console.error('janjian bell', e); }
  }
  return Response.json({ today, hariIni, terlambat, stok, celah, aiSiap, janjian, celahTotal: typeof celahTotal !== 'undefined' ? celahTotal : null, total: janjian.length + rows.length + stok.length + celah.length + aiSiap.length });
}
