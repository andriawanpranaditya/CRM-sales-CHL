import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { denganLog, bolehUbah } from '@/lib/log';

export const dynamic = 'force-dynamic';

// Akses modul Analisa Marcom: markom (kelola) & manager (kelola + pantau)
async function akses() {
  const { user, err } = await requireUser();
  if (err) return { err };
  if (!['manager', 'ceo', 'markom'].includes(user.role)) {
    return { err: Response.json({ error: 'Menu ini khusus Marcom & Manager' }, { status: 403 }) };
  }
  return { user };
}

// Jejak "pernah berkualitas": l2_at diisi otomatis (trigger) saat status lead pertama kali naik ke Warm/Hot/Appointment/Site Visit/Booking/Closing
let l2Siap = false;
async function siapkanL2(sql) {
  if (l2Siap) return;
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS l2_at timestamptz`; } catch (e) { console.error('l2_at kolom', e); }
  try { await sql`ALTER TABLE followups ADD COLUMN IF NOT EXISTS balas boolean`; } catch {}
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS usia text`; } catch {}
  try { await sql`ALTER TABLE mi_content_metrics ADD COLUMN IF NOT EXISTS avg_watch numeric`; } catch {}
  try { await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS views3 integer`; await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS thruplay integer`; await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS ad_id text`; } catch {}
  try { await sql`CREATE TABLE IF NOT EXISTS mi_ad_status (ad_id text PRIMARY KEY, nama text, campaign text, status text, updated_at timestamptz NOT NULL DEFAULT now())`; } catch {}
  try { await sql`CREATE TABLE IF NOT EXISTS mi_persona (project text PRIMARY KEY, data jsonb NOT NULL, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`; } catch {}
  try { await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS sumber text`; } catch {}
  try { await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS ext_key text`; } catch {}
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_mi_ads_ext ON mi_ads (ext_key)`; } catch {}
  try { await sql`ALTER TABLE mi_campaigns ADD COLUMN IF NOT EXISTS sumber text`; } catch {}
  try {
    await sql`CREATE OR REPLACE FUNCTION mi_set_l2_at() RETURNS trigger AS $$
      BEGIN
        IF NEW.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') AND NEW.l2_at IS NULL THEN NEW.l2_at := now(); END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`;
    await sql`DROP TRIGGER IF EXISTS trg_mi_l2_at ON leads`;
    await sql`CREATE TRIGGER trg_mi_l2_at BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION mi_set_l2_at()`;
  } catch (e) { console.error('l2_at trigger', e); }
  try {
    await sql`UPDATE leads SET l2_at = COALESCE(updated_at, now())
      WHERE l2_at IS NULL AND (status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing')
        OR EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = leads.lead_code AND t.jenis IN ('Reserved','Booking','Closing')))`;
  } catch (e) { console.error('l2_at backfill', e); }
  l2Siap = true;
}

// ===== Persona target per project & skor kecocokan lead (0–100) =====
const PERSONA_DEFAULT = {
  'BIO DISTRICT': {
    areaInti: ['serpong', 'bsd', 'alam sutera', 'gading serpong', 'tangerang selatan', 'tangsel', 'tangerang', 'karawaci', 'cisauk', 'pagedangan'],
    areaLuas: ['jakarta barat', 'jakarta selatan', 'bintaro', 'kebon jeruk', 'kembangan', 'puri'],
    hargaMin: 1500000000, usiaMin: 30, usiaMax: 45, tujuan: 'ditempati',
    catatan: 'Draf dari 42 lead berkualitas & 32 unit terjual: 68% domisili Serpong–BSD–Tangsel–Tangerang, 89% KPR, budget median Rp1,95 M, unit terjual median Rp2,74 M.',
  },
};
function usiaTengah(u) {
  const t = String(u || '').replace(/\s/g, '');
  if (!t) return null; if (t.startsWith('<')) return 22; if (t.endsWith('+')) return Number(t.replace('+', '')) + 3;
  const m = /(\d+)\D+(\d+)/.exec(t); return m ? (Number(m[1]) + Number(m[2])) / 2 : (Number(t) || null);
}
function skorPersona(l, p) {
  if (!p) return null;
  let s = 0, terisi = 0;
  const d = String(l.domisili || '').toLowerCase().trim();
  if (d) { terisi++; if ((p.areaInti || []).some(a => d.includes(a))) s += 30; else if ((p.areaLuas || []).some(a => d.includes(a))) s += 15; }
  const b = Number(l.budget) || 0;
  if (b > 0) { terisi++; s += b >= p.hargaMin ? 30 : b >= p.hargaMin * 0.8 ? 15 : 0; }
  if (String(l.bayar || '').trim()) { terisi++; s += 15; }
  const u = usiaTengah(l.usia);
  if (u) { terisi++; s += (u >= p.usiaMin && u <= p.usiaMax) ? 15 : (u >= p.usiaMin - 5 && u <= p.usiaMax + 5) ? 7 : 0; }
  const tj = String(l.tujuan || '').toLowerCase().trim();
  if (tj) { terisi++; s += /tinggal|huni|tempat|keluarga/.test(tj) ? 10 : /invest/.test(tj) ? 7 : 3; }
  const kat = terisi < 3 ? 'kurang' : s >= 70 ? 'cocok' : s >= 40 ? 'sebagian' : 'tidak';
  return { skor: s, terisi, kat };
}

export async function GET(req) {
  const { user, err } = await akses(); if (err) return err;
  const sql = db();
  const url = new URL(req.url);
  await siapkanL2(sql);

  // Daftar lead tanpa campaign — bahan alat Tandai Lead Massal (marcom hanya lead yang ia input)
  if (url.searchParams.get('list') === 'untagged') {
    const pj = url.searchParams.get('project') || null;
    const a1 = url.searchParams.get('d1') || null, a2 = url.searchParams.get('d2') || null;
    const tim = user.role === 'markom'; // marcom: seluruh lead tim marcom
    const rows = await sql`SELECT id, lead_code, nama, tgl, sumber, project, status FROM leads l
      WHERE COALESCE(campaign, '') = ''
        AND (${pj}::text IS NULL OR project = ${pj})
        AND (${a1}::date IS NULL OR tgl >= ${a1}::date) AND (${a2}::date IS NULL OR tgl <= ${a2}::date)
        AND (NOT ${tim}::boolean OR EXISTS (SELECT 1 FROM users u WHERE u.username = l.created_by AND u.role = 'markom'))
      ORDER BY tgl DESC NULLS LAST, id DESC LIMIT 500`;
    return Response.json(rows);
  }

  // Ringkas: daftar campaign aktif untuk dropdown Form Input (dipakai juga oleh manager)
  if (url.searchParams.get('list') === 'campaign') {
    const rows = await sql`SELECT id, nama, platform, project FROM mi_campaigns WHERE status = 'Aktif' ORDER BY nama`;
    return Response.json(rows);
  }

  // Periode analisa (opsional) — membatasi leads, iklan, dan konten berdasarkan tanggal
  // Titik mulai analisa (baseline): data sebelum tanggal ini tidak dibaca — bisa diubah lewat env MI_ANALISA_MULAI
  const MULAI = process.env.MI_ANALISA_MULAI || '2026-09-01';
  const d1in = url.searchParams.get('d1') || null;
  const d1 = (!d1in || d1in < MULAI) ? MULAI : d1in;
  const d2 = url.searchParams.get('d2') || null;
  const proj = url.searchParams.get('project') || null;

  const [campaigns, contents, ads] = await Promise.all([
    sql`SELECT * FROM mi_campaigns ORDER BY status, id DESC`,
    sql`SELECT c.*, m.tgl AS m_tgl, m.reach, m.like_n, m.komentar, m.share_n, m.save_n, m.view3, m.view_full, m.klik_bio, m.avg_watch
        FROM mi_contents c
        LEFT JOIN LATERAL (SELECT * FROM mi_content_metrics WHERE content_id = c.id ORDER BY tgl DESC LIMIT 1) m ON true
        WHERE (${d1}::date IS NULL OR c.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR c.tgl <= ${d2}::date) AND (${proj}::text IS NULL OR c.project = ${proj})
        ORDER BY c.tgl DESC NULLS LAST, c.id DESC`,
    sql`SELECT * FROM mi_ads
        WHERE (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date)
          AND (${proj}::text IS NULL OR EXISTS (SELECT 1 FROM mi_campaigns mc WHERE mc.nama = mi_ads.campaign AND mc.project = ${proj}))
        ORDER BY tgl DESC NULLS LAST, id DESC LIMIT 800`,
  ]);

  // Funnel closed-loop dari data CRM (L0 masuk · L1 tersentuh FU · L2 berkualitas · L3 Booking/Closing)
  const [byCampaign, bySumber, byKonten, audiens, timLead, timKonten] = await Promise.all([
    sql`
    SELECT COALESCE(NULLIF(l.campaign, ''), '(tanpa data)') AS kunci,
      count(*)::int AS l0,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM followups f WHERE f.lead_code = l.lead_code AND COALESCE(f.created_by, '') <> 'auto-wa'))::int AS l1,
      count(*) FILTER (WHERE (l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.l2_at IS NOT NULL OR l.sumber ILIKE '%walk%')
        OR EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Reserved','Booking','Closing')))::int AS l2,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Booking','Closing')))::int AS l3,
      COALESCE(sum((SELECT COALESCE(max(COALESCE(t.nilai_jual, t.nilai)), 0) FROM transactions t
        WHERE t.lead_code = l.lead_code AND t.jenis IN ('Booking','Closing'))), 0)::numeric AS nilai
    FROM leads l
    WHERE (${d1}::date IS NULL OR l.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR l.tgl <= ${d2}::date) AND (${proj}::text IS NULL OR l.project = ${proj})
    GROUP BY 1 ORDER BY l0 DESC`,
    sql`
    SELECT COALESCE(NULLIF(l.sumber, ''), '(tanpa data)') AS kunci,
      count(*)::int AS l0,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM followups f WHERE f.lead_code = l.lead_code AND COALESCE(f.created_by, '') <> 'auto-wa'))::int AS l1,
      count(*) FILTER (WHERE (l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.l2_at IS NOT NULL OR l.sumber ILIKE '%walk%')
        OR EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Reserved','Booking','Closing')))::int AS l2,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Booking','Closing')))::int AS l3,
      COALESCE(sum((SELECT COALESCE(max(COALESCE(t.nilai_jual, t.nilai)), 0) FROM transactions t
        WHERE t.lead_code = l.lead_code AND t.jenis IN ('Booking','Closing'))), 0)::numeric AS nilai
    FROM leads l
    WHERE (${d1}::date IS NULL OR l.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR l.tgl <= ${d2}::date) AND (${proj}::text IS NULL OR l.project = ${proj})
    GROUP BY 1 ORDER BY l0 DESC`,
    sql`
    SELECT COALESCE(NULLIF(l.konten, ''), '') AS kunci,
      count(*)::int AS l0,
      count(*) FILTER (WHERE (l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.l2_at IS NOT NULL OR l.sumber ILIKE '%walk%')
        OR EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Reserved','Booking','Closing')))::int AS l2,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Booking','Closing')))::int AS l3
    FROM leads l
    WHERE COALESCE(l.konten, '') <> ''
      AND (${d1}::date IS NULL OR l.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR l.tgl <= ${d2}::date) AND (${proj}::text IS NULL OR l.project = ${proj})
    GROUP BY 1 ORDER BY l0 DESC LIMIT 30`,
    // Profil audiens dari lead BERKUALITAS (L2) & konversi — domisili, tujuan beli, tipe, sumber
    sql`
    SELECT COALESCE(NULLIF(l.domisili, ''), '(kosong)') AS domisili,
      COALESCE(NULLIF(l.tujuan, ''), '-') AS tujuan,
      COALESCE(NULLIF(l.tipe, ''), '-') AS tipe,
      COALESCE(NULLIF(l.sumber, ''), '-') AS sumber,
      count(*)::int AS l2,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Booking','Closing')))::int AS l3
    FROM leads l
    WHERE ((l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.l2_at IS NOT NULL OR l.sumber ILIKE '%walk%')
        OR EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Reserved','Booking','Closing')))
      AND (${d1}::date IS NULL OR l.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR l.tgl <= ${d2}::date) AND (${proj}::text IS NULL OR l.project = ${proj})
    GROUP BY 1, 2, 3, 4 ORDER BY l2 DESC LIMIT 200`,
    // Output tim: funnel per akun marcom (semua periode terpilih)
    sql`
    SELECT l.created_by AS username,
      count(*)::int AS l0,
      count(*) FILTER (WHERE l.tgl >= date_trunc('month', now())::date)::int AS l0_bln,
      count(*) FILTER (WHERE (l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing') OR l.l2_at IS NOT NULL OR l.sumber ILIKE '%walk%')
        OR EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Reserved','Booking','Closing')))::int AS l2,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Booking','Closing')))::int AS l3,
      COALESCE(sum((SELECT COALESCE(max(COALESCE(t.nilai_jual, t.nilai)), 0) FROM transactions t
        WHERE t.lead_code = l.lead_code AND t.jenis IN ('Booking','Closing'))), 0)::numeric AS nilai
    FROM leads l JOIN users u ON u.username = l.created_by AND u.role = 'markom'
    WHERE (${d1}::date IS NULL OR l.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR l.tgl <= ${d2}::date) AND (${proj}::text IS NULL OR l.project = ${proj})
    GROUP BY 1`,
    sql`
    SELECT u.username, u.name, u.active,
      (SELECT count(*) FROM mi_contents c WHERE c.created_by = u.username AND (${proj}::text IS NULL OR c.project = ${proj}))::int AS konten,
      (SELECT count(*) FROM mi_contents c WHERE c.created_by = u.username AND c.tgl >= date_trunc('month', now())::date AND (${proj}::text IS NULL OR c.project = ${proj}))::int AS konten_bln,
      (SELECT count(*) FROM mi_ads a WHERE a.created_by = u.username AND (${proj}::text IS NULL OR EXISTS (SELECT 1 FROM mi_campaigns mc WHERE mc.nama = a.campaign AND mc.project = ${proj})))::int AS entri_iklan
    FROM users u WHERE u.role = 'markom' ORDER BY u.name`,
  ]);

  // Spend iklan per campaign (periode terpilih) — untuk CPL/CPQL/biaya per Booking
  // Penjualan diakui pada TANGGAL BOOKING. Yang dihitung sebagai hasil MARKETING hanya lead yang:
  // diinput akun marcom, ATAU punya campaign, ATAU sumbernya kanal marketing, ATAU walk in yang tahu dari kanal marketing
  // (termasuk media offline banner/spanduk/billboard). Referral, kanvasing, WA langsung ke sales & lainnya tidak dihitung.
  let bookingDetail = [], bookingLain = 0, marketing = { leadMasuk: 0, reserved: 0, nilaiReserved: 0, booking: 0, nilaiBooking: 0 };
  try {
    const trxP = await sql`
      WITH akhir AS (
        SELECT DISTINCT ON (t.lead_code, COALESCE(t.project, ''), COALESCE(NULLIF(t.unit, ''), 'x' || t.id)) t.*
        FROM transactions t
        ORDER BY t.lead_code, COALESCE(t.project, ''), COALESCE(NULLIF(t.unit, ''), 'x' || t.id), t.tgl DESC NULLS LAST, t.id DESC)
      SELECT a.lead_code, a.jenis, a.unit, a.tgl AS tgl_trx, l.tgl AS tgl_lead, (a.tgl - l.tgl)::int AS hari,
        COALESCE(NULLIF(a.nilai_jual, 0), a.nilai, 0)::numeric AS nilai, COALESCE(a.nilai, 0)::numeric AS nilai_res,
        COALESCE(NULLIF(l.campaign, ''), '(tanpa data)') AS campaign, COALESCE(NULLIF(l.sumber, ''), '(tanpa data)') AS sumber,
        COALESCE(l.walkin_info, '') AS walkin_info, COALESCE(l.sales, '') AS sales,
        COALESCE(NULLIF(l.konten, ''), '') AS konten, l.created_by,
        COALESCE(NULLIF(l.domisili, ''), '(kosong)') AS domisili, COALESCE(NULLIF(l.tujuan, ''), '-') AS tujuan, COALESCE(NULLIF(l.tipe, ''), '-') AS tipe,
        (SELECT count(*)::int FROM followups f WHERE f.lead_code = a.lead_code AND COALESCE(f.created_by, '') <> 'auto-wa' AND (f.tgl IS NULL OR f.tgl <= a.tgl)) AS nfu,
        (EXISTS (SELECT 1 FROM users u WHERE u.username = l.created_by AND u.role = 'markom')
          OR COALESCE(l.campaign, '') <> ''
          OR (COALESCE(l.sumber, '') !~* 'walk' AND COALESCE(l.sumber, '') ~* '(facebook|instagram|google|tiktok|website|meta|marketplace|banner|spanduk|billboard|pameran|event)')
          OR (COALESCE(l.sumber, '') ~* 'walk' AND COALESCE(l.walkin_info, '') ~* '(facebook|instagram|google|tiktok|website|meta|marketplace|banner|spanduk|billboard|pameran|event)')) AS marketing
      FROM akhir a JOIN leads l ON l.lead_code = a.lead_code
      WHERE a.jenis IN ('Reserved', 'Booking', 'Closing')
        AND (${d1}::date IS NULL OR a.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR a.tgl <= ${d2}::date)
        AND (${proj}::text IS NULL OR COALESCE(NULLIF(a.project, ''), l.project) = ${proj})`;
    const jual = trxP.filter(j => j.jenis !== 'Reserved' && j.marketing);
    const resM = trxP.filter(j => j.jenis === 'Reserved' && j.marketing);
    bookingLain = trxP.filter(j => j.jenis !== 'Reserved' && !j.marketing).length;
    bookingDetail = jual.map(j => ({ lead_code: j.lead_code, unit: j.unit, sales: j.sales, sumber: j.sumber, walkin_info: j.walkin_info,
      campaign: j.campaign, tgl_lead: j.tgl_lead, tgl_booking: j.tgl_trx, hari: j.hari, nfu: j.nfu, nilai: Number(j.nilai) || 0 }))
      .sort((x, y) => String(y.tgl_booking).localeCompare(String(x.tgl_booking)));
    const lm = await sql`SELECT count(*)::int AS n FROM leads l
      WHERE (${d1}::date IS NULL OR l.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR l.tgl <= ${d2}::date)
        AND (${proj}::text IS NULL OR l.project = ${proj})
        AND (EXISTS (SELECT 1 FROM users u WHERE u.username = l.created_by AND u.role = 'markom')
          OR COALESCE(l.campaign, '') <> ''
          OR (COALESCE(l.sumber, '') !~* 'walk' AND COALESCE(l.sumber, '') ~* '(facebook|instagram|google|tiktok|website|meta|marketplace|banner|spanduk|billboard|pameran|event)')
          OR (COALESCE(l.sumber, '') ~* 'walk' AND COALESCE(l.walkin_info, '') ~* '(facebook|instagram|google|tiktok|website|meta|marketplace|banner|spanduk|billboard|pameran|event)'))`;
    marketing = { leadMasuk: lm[0]?.n || 0, reserved: resM.length, nilaiReserved: resM.reduce((a, j) => a + (Number(j.nilai_res) || 0), 0),
      booking: jual.length, nilaiBooking: jual.reduce((a, j) => a + (Number(j.nilai) || 0), 0) };

    const kosong = k => ({ kunci: k, l0: 0, l1: 0, l2: 0, l3: 0, nilai: 0 });
    const gabung = (arr, kunciOf, buat) => {
      arr.forEach(r => { r.l3 = 0; if ('nilai' in r) r.nilai = 0; });
      for (const j of jual) {
        const k = kunciOf(j); if (k === null) continue;
        let r = arr.find(x => buat.cocok(x, j, k));
        if (!r) { r = buat.baru(j, k); arr.push(r); }
        r.l3 += 1; if ('nilai' in r) r.nilai = Number(r.nilai || 0) + Number(j.nilai || 0);
      }
    };
    gabung(byCampaign, j => j.campaign, { cocok: (x, j, k) => x.kunci === k, baru: (j, k) => kosong(k) });
    gabung(bySumber, j => j.sumber, { cocok: (x, j, k) => x.kunci === k, baru: (j, k) => kosong(k) });
    gabung(byKonten, j => j.konten || null, { cocok: (x, j, k) => x.kunci === k, baru: (j, k) => ({ kunci: k, l0: 0, l2: 0, l3: 0 }) });
    gabung(audiens, j => j.domisili, { cocok: (x, j) => x.domisili === j.domisili && x.tujuan === j.tujuan && x.tipe === j.tipe && x.sumber === j.sumber,
      baru: j => ({ domisili: j.domisili, tujuan: j.tujuan, tipe: j.tipe, sumber: j.sumber, l2: 0, l3: 0 }) });
    const marcomSet = new Set(timKonten.map(u => u.username));
    gabung(timLead, j => marcomSet.has(j.created_by) ? j.created_by : null, { cocok: (x, j, k) => x.username === k,
      baru: (j, k) => ({ username: k, l0: 0, l0_bln: 0, l2: 0, l3: 0, nilai: 0 }) });
  } catch (e) { console.error('penjualan periode', e); }

  const spend = await sql`
    SELECT COALESCE(NULLIF(campaign, ''), '(tanpa data)') AS kunci, sum(spend)::numeric AS spend, sum(COALESCE(hasil, 0))::int AS hasil
    FROM mi_ads
    WHERE (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date)
          AND (${proj}::text IS NULL OR EXISTS (SELECT 1 FROM mi_campaigns mc WHERE mc.nama = mi_ads.campaign AND mc.project = ${proj}))
          AND NOT (COALESCE(mi_ads.sumber, 'manual') = 'manual'
                   AND EXISTS (SELECT 1 FROM mi_ads b WHERE b.sumber = 'meta-api' AND lower(b.campaign) = lower(mi_ads.campaign)))
    GROUP BY 1`;

  // Website & SEO (hasil tarikan konektor GA4 + Search Console)
  let ga4 = [], gsc = [], synclog = [];
  try {
    [ga4, gsc, synclog] = await Promise.all([
      sql`SELECT source_medium, sum(sessions)::int AS sessions, sum(users)::int AS users, sum(key_events)::int AS key_events
          FROM mi_ga4_daily
          WHERE (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date)
          GROUP BY 1 ORDER BY sessions DESC LIMIT 25`,
      sql`SELECT query, sum(clicks)::int AS clicks, sum(impressions)::int AS impressions,
          round(avg(position)::numeric, 1) AS position
          FROM mi_gsc_daily
          WHERE (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date)
          GROUP BY 1 ORDER BY clicks DESC, impressions DESC LIMIT 30`,
      sql`SELECT * FROM mi_sync_log ORDER BY id DESC LIMIT 12`,
    ]);
  } catch {}
  const spendAll = await sql`SELECT campaign, sum(spend)::numeric AS total, max(tgl) AS terakhir, count(*)::int AS entri FROM mi_ads GROUP BY campaign`;
  // Respon lead setelah dioper ke sales: membalas = ada FU "lead membalas" sesudah serah terima, atau status naik sesudahnya
  let pangle7 = 0;
  try {
    const r7 = await sql`SELECT COALESCE(sum(sessions), 0)::int AS n FROM mi_ga4_daily
      WHERE source_medium ILIKE '%pangle%' AND tgl >= (now() + interval '7 hours')::date - 7`;
    pangle7 = r7[0]?.n || 0;
  } catch {}
  let handoff = [];
  try {
    handoff = await sql`
      SELECT COALESCE(NULLIF(l.sales, ''), '(belum ada)') AS sales, count(*)::int AS dioper,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM followups f2 WHERE f2.lead_code = l.lead_code AND f2.balas = true AND f2.id > h.id)
                          OR (l.l2_at IS NOT NULL AND l.l2_at::date >= h.tgl))::int AS membalas,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM followups f3 WHERE f3.lead_code = l.lead_code AND f3.balas IS NOT NULL AND f3.id > h.id))::int AS tercatat
      FROM leads l
      JOIN LATERAL (SELECT id, tgl FROM followups f WHERE f.lead_code = l.lead_code AND f.detail LIKE 'Leads to Sales%' ORDER BY f.id DESC LIMIT 1) h ON true
      WHERE (${d1}::date IS NULL OR h.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR h.tgl <= ${d2}::date)
        AND (${proj}::text IS NULL OR l.project = ${proj})
      GROUP BY 1 ORDER BY dioper DESC`;
  } catch (e) { console.error('handoff', e); }
  const tanpaCamp = await sql`SELECT COALESCE(NULLIF(sumber, ''), '(kosong)') AS sumber, count(*)::int AS n FROM leads
    WHERE COALESCE(campaign, '') = ''
      AND (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date)
      AND (${proj}::text IS NULL OR project = ${proj})
    GROUP BY 1`;
  // Biaya berulang (amortisasi): disebar rata per bulan sejak bulan mulai; bulan yang belum berjalan tidak dihitung
  let amort = [];
  try { amort = await sql`SELECT a.*, c.project FROM mi_amort a LEFT JOIN mi_campaigns c ON c.nama = a.campaign ORDER BY a.id DESC`; } catch {}
  const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const sm = Object.fromEntries(spend.map(r => [r.kunci, Number(r.spend) || 0]));
  for (const a of amort) {
    if (proj && a.project !== proj) continue;
    const n = Math.max(1, Number(a.bulan) || 1), tot = Number(a.total) || 0, dasar = Math.floor(tot / n);
    const mulaiStr = (a.mulai instanceof Date ? a.mulai.toISOString() : String(a.mulai)).slice(0, 7);
    const [yy, mm] = mulaiStr.split('-').map(Number);
    const hariMs = 86400000;
    for (let i = 0; i < n; i++) {
      const awal = Date.UTC(yy, mm - 1 + i, 1), akhir = Date.UTC(yy, mm + i, 0); // hari pertama & terakhir bulan
      const jumlahHari = Math.round((akhir - awal) / hariMs) + 1;
      // Irisan bulan ini dengan rentang filter, dibatasi s.d. hari ini (biaya bulan berjalan dihitung pro-rata hari)
      const dari = Math.max(awal, d1 ? Date.parse(d1 + 'T00:00:00Z') : awal);
      const sampai = Math.min(akhir, d2 ? Date.parse(d2 + 'T00:00:00Z') : akhir, Date.parse(hariIni + 'T00:00:00Z'));
      if (awal > Date.parse(hariIni + 'T00:00:00Z')) break;
      if (sampai < dari) continue;
      const hari = Math.round((sampai - dari) / hariMs) + 1;
      const porsiBulan = i === n - 1 ? tot - dasar * (n - 1) : dasar;
      sm[a.campaign] = (sm[a.campaign] || 0) + Math.round(porsiBulan * hari / jumlahHari);
    }
  }
  const spendGab = Object.entries(sm).map(([kunci, v]) => ({ kunci, spend: v }));
  const hasilPlat = Object.fromEntries(spend.map(r => [r.kunci, Number(r.hasil) || 0]));
  // Persona (default + yang disimpan) & kecocokan lead periode ini
  const persona = { ...PERSONA_DEFAULT };
  try { (await sql`SELECT project, data FROM mi_persona`).forEach(r => { persona[r.project] = { ...(persona[r.project] || {}), ...r.data }; }); } catch {}
  const fit = { total: { n: 0, cocok: 0, sebagian: 0, tidak: 0, kurang: 0, tanpaPersona: 0 }, byCampaign: {}, bySumber: {}, byKonten: {} };
  try {
    const lp = await sql`SELECT lead_code, project, domisili, budget, bayar, usia, tujuan, COALESCE(NULLIF(campaign, ''), '(tanpa data)') AS campaign,
        COALESCE(NULLIF(sumber, ''), '(tanpa data)') AS sumber, COALESCE(konten, '') AS konten FROM leads
      WHERE (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date) AND (${proj}::text IS NULL OR project = ${proj})`;
    const tambah = (obj, k, kat) => { obj[k] = obj[k] || { n: 0, cocok: 0, sebagian: 0, tidak: 0, kurang: 0 }; obj[k].n++; obj[k][kat]++; };
    for (const l of lp) {
      const r = skorPersona(l, persona[l.project]);
      if (!r) { fit.total.tanpaPersona++; continue; }
      fit.total.n++; fit.total[r.kat]++;
      tambah(fit.byCampaign, l.campaign, r.kat); tambah(fit.bySumber, l.sumber, r.kat); if (l.konten) tambah(fit.byKonten, l.konten, r.kat);
    }
  } catch (e) { console.error('fit', e); }
  // ===== Fase 2: rincian iklan Meta (usia–gender, wilayah, penempatan), targeting ad set, & usia lead CRM =====
  let breakdown = [], targeting = [], usiaLead = [];
  try {
    breakdown = await sql`SELECT dim, k1, k2, sum(spend)::numeric AS spend, sum(impresi)::int AS impresi, sum(klik)::int AS klik, sum(hasil)::int AS hasil
      FROM mi_ads_breakdown b
      WHERE (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date)
        AND (${proj}::text IS NULL OR EXISTS (SELECT 1 FROM mi_campaigns mc WHERE mc.nama = b.campaign AND mc.project = ${proj}))
      GROUP BY dim, k1, k2`;
  } catch {}
  try {
    targeting = await sql`SELECT t.* FROM mi_adset_targeting t
      WHERE (${proj}::text IS NULL OR EXISTS (SELECT 1 FROM mi_campaigns mc WHERE mc.nama = t.campaign AND mc.project = ${proj}))
      ORDER BY (t.status = 'ACTIVE') DESC, t.updated_at DESC LIMIT 60`;
  } catch {}
  try {
    const lu = await sql`SELECT project, domisili, budget, bayar, usia, tujuan FROM leads
      WHERE COALESCE(usia, '') <> '' AND (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date) AND (${proj}::text IS NULL OR project = ${proj})`;
    const kel = u => { const m = usiaTengah(u); if (!m) return null; return m < 25 ? '18-24' : m < 35 ? '25-34' : m < 45 ? '35-44' : m < 55 ? '45-54' : m < 65 ? '55-64' : '65+'; };
    const agg = {};
    lu.forEach(l => { const k = kel(l.usia); if (!k) return; agg[k] = agg[k] || { k, n: 0, cocok: 0 }; agg[k].n++; const r = skorPersona(l, persona[l.project]); if (r && r.kat === 'cocok') agg[k].cocok++; });
    usiaLead = Object.values(agg);
  } catch {}

  // Performa per iklan Meta (agregat periode) + status terkini + lead CRM per kreatif
  let perIklan = [], leadKonten = [];
  try {
    perIklan = await sql`SELECT a.campaign, a.kreatif, max(a.ad_id) AS ad_id, sum(a.spend)::numeric AS spend, sum(a.impresi)::int AS impresi, sum(a.klik)::int AS klik,
        sum(a.hasil)::int AS hasil, sum(COALESCE(a.views3, 0))::int AS views3, sum(COALESCE(a.thruplay, 0))::int AS thruplay, min(a.tgl) AS mulai, max(a.tgl) AS akhir,
        (SELECT s.status FROM mi_ad_status s WHERE s.ad_id = max(a.ad_id)) AS status
      FROM mi_ads a
      WHERE a.sumber = 'meta-api' AND (${d1}::date IS NULL OR a.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR a.tgl <= ${d2}::date)
        AND (${proj}::text IS NULL OR EXISTS (SELECT 1 FROM mi_campaigns mc WHERE mc.nama = a.campaign AND mc.project = ${proj}))
      GROUP BY a.campaign, a.kreatif HAVING sum(a.spend) > 0 OR sum(a.impresi) > 0 ORDER BY sum(a.hasil) DESC, sum(a.spend) DESC LIMIT 300`;
  } catch (e) { console.error('perIklan', e); }
  try {
    leadKonten = await sql`SELECT lower(konten) AS k, count(*)::int AS n, count(*) FILTER (WHERE l2_at IS NOT NULL OR status IN ('Warm', 'Hot', 'Appointment', 'Site Visit', 'Reserved', 'Booking', 'Closing'))::int AS l2
      FROM leads WHERE COALESCE(konten, '') <> '' AND (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date)
        AND (${proj}::text IS NULL OR project = ${proj}) GROUP BY lower(konten)`;
  } catch {}

  // Demografi follower Instagram (tarikan terakhir)
  let igDemo = null;
  try {
    const tg = await sql`SELECT max(tgl) AS t FROM mi_ig_demografi`;
    if (tg[0]?.t) {
      const rows = await sql`SELECT dim, kunci, nilai FROM mi_ig_demografi WHERE tgl = ${tg[0].t} ORDER BY nilai DESC`;
      igDemo = { tgl: tg[0].t, usia: rows.filter(r => r.dim === 'usia'), gender: rows.filter(r => r.dim === 'gender'), kota: rows.filter(r => r.dim === 'kota').slice(0, 12) };
    }
  } catch {}
  // Follower Instagram: terbaru, dan posisi di awal periode (untuk pertumbuhan)
  let igAkun = null;
  try {
    const kini = await sql`SELECT tgl, username, followers FROM mi_ig_akun ORDER BY tgl DESC LIMIT 1`;
    if (kini.length) {
      const awalP = await sql`SELECT followers FROM mi_ig_akun WHERE (${d1}::date IS NULL OR tgl >= ${d1}::date) ORDER BY tgl ASC LIMIT 1`;
      igAkun = { followers: kini[0].followers, username: kini[0].username, tgl: kini[0].tgl, followersAwal: awalP[0]?.followers ?? null };
    }
  } catch {}
  return Response.json({ mulai: MULAI, campaigns, contents, ads, byCampaign, bySumber, byKonten, audiens, timLead, timKonten, spend: spendGab, perIklan, leadKonten, igAkun, igDemo, persona, fit, breakdown, targeting, usiaLead, hasilPlat, bookingDetail, bookingLain, marketing, spendAll, tanpaCamp, handoff, pangle7, amort, ga4, gsc, synclog, me: { role: user.role, username: user.username } });
}

async function _POST(req) {
  const { user, err } = await akses(); if (err) return err;
  const b = await req.json();
  const sql = db();
  if (b.jenis === 'campaign') {
    const nama = String(b.nama || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!nama) return Response.json({ error: 'Nama campaign wajib diisi' }, { status: 400 });
    try {
      const r = await sql`INSERT INTO mi_campaigns (nama, platform, project, tujuan, budget, status, catatan, created_by)
        VALUES (${nama}, ${b.platform || ''}, ${b.project || ''}, ${b.tujuan || ''}, ${Number(b.budget) || 0}, ${b.status || 'Aktif'}, ${b.catatan || ''}, ${user.username}) RETURNING id`;
      return Response.json({ ok: true, id: r[0].id, nama });
    } catch (e) {
      return Response.json({ error: 'Nama campaign sudah ada — gunakan nama lain atau edit yang lama' }, { status: 400 });
    }
  }
  if (b.jenis === 'konten') {
    if (!b.platform || !b.format) return Response.json({ error: 'Platform & format konten wajib diisi' }, { status: 400 });
    const r = await sql`INSERT INTO mi_contents (tgl, platform, project, format, topik, hook, jam, durasi, link, created_by)
      VALUES (${b.tgl || null}, ${b.platform}, ${b.project || ''}, ${b.format}, ${b.topik || ''}, ${b.hook || ''}, ${b.jam || ''}, ${b.durasi || ''}, ${b.link || ''}, ${user.username}) RETURNING id`;
    return Response.json({ ok: true, id: r[0].id });
  }
  if (b.jenis === 'metrik') {
    if (!b.content_id) return Response.json({ error: 'Pilih konten yang di-update angkanya' }, { status: 400 });
    // Kolom yang dikosongkan memakai angka terakhir konten itu — bukan ditimpa 0
    const lama = (await sql`SELECT * FROM mi_content_metrics WHERE content_id = ${Number(b.content_id)} ORDER BY tgl DESC LIMIT 1`)[0] || {};
    const v = k => (b[k] === '' || b[k] === null || b[k] === undefined) ? (Number(lama[k]) || 0) : (Number(b[k]) || 0);
    await sql`INSERT INTO mi_content_metrics (content_id, tgl, reach, like_n, komentar, share_n, save_n, view3, view_full, klik_bio)
      VALUES (${Number(b.content_id)}, ${b.tgl || new Date().toISOString().slice(0, 10)}, ${v('reach')}, ${v('like_n')}, ${v('komentar')}, ${v('share_n')}, ${v('save_n')}, ${v('view3')}, ${v('view_full')}, ${v('klik_bio')})
      ON CONFLICT (content_id, tgl) DO UPDATE SET reach = EXCLUDED.reach, like_n = EXCLUDED.like_n, komentar = EXCLUDED.komentar,
        share_n = EXCLUDED.share_n, save_n = EXCLUDED.save_n, view3 = EXCLUDED.view3, view_full = EXCLUDED.view_full, klik_bio = EXCLUDED.klik_bio`;
    return Response.json({ ok: true });
  }
  if (b.jenis === 'iklan') {
    if (!b.campaign) return Response.json({ error: 'Pilih campaign dulu' }, { status: 400 });
    const r = await sql`INSERT INTO mi_ads (tgl, campaign, kreatif, spend, impresi, reach, klik, hasil, catatan, created_by)
      VALUES (${b.tgl || null}, ${b.campaign}, ${b.kreatif || ''}, ${Number(b.spend) || 0}, ${Number(b.impresi) || 0}, ${Number(b.reach) || 0}, ${Number(b.klik) || 0}, ${Number(b.hasil) || 0}, ${b.catatan || ''}, ${user.username}) RETURNING id`;
    return Response.json({ ok: true, id: r[0].id });
  }
  if (b.jenis === 'amort') {
    const tot = Number(b.total) || 0, n = Number(b.bulan) || 0;
    if (!b.campaign) return Response.json({ error: 'Pilih campaign' }, { status: 400 });
    if (tot <= 0) return Response.json({ error: 'Total biaya wajib diisi' }, { status: 400 });
    if (n < 1 || n > 60) return Response.json({ error: 'Masa tayang 1–60 bulan' }, { status: 400 });
    if (!/^\d{4}-\d{2}/.test(String(b.mulai || ''))) return Response.json({ error: 'Bulan mulai wajib diisi' }, { status: 400 });
    await sql`CREATE TABLE IF NOT EXISTS mi_amort (
      id serial PRIMARY KEY, campaign text NOT NULL, keterangan text, total numeric NOT NULL,
      mulai date NOT NULL, bulan integer NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT now()
    )`;
    const r = await sql`INSERT INTO mi_amort (campaign, keterangan, total, mulai, bulan, created_by)
      VALUES (${b.campaign}, ${b.keterangan || ''}, ${tot}, ${String(b.mulai).slice(0, 7) + '-01'}, ${n}, ${user.username}) RETURNING id`;
    return Response.json({ ok: true, id: r[0].id });
  }
  return Response.json({ error: 'Jenis data tidak dikenal' }, { status: 400 });
}

async function _PATCH(req) {
  const { user, err } = await akses(); if (err) return err;
  const b = await req.json();
  const sql = db();
  if (b.jenis === 'persona') {
    if (!['manager', 'ceo'].includes(user.role)) return Response.json({ error: 'Hanya manager / CEO yang boleh mengubah persona' }, { status: 403 });
    if (!b.project || !b.data) return Response.json({ error: 'Project & data persona wajib' }, { status: 400 });
    const bersih = d => String(d || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const data = { areaInti: bersih(b.data.areaInti), areaLuas: bersih(b.data.areaLuas), hargaMin: Number(b.data.hargaMin) || 0,
      usiaMin: Number(b.data.usiaMin) || 0, usiaMax: Number(b.data.usiaMax) || 0, tujuan: String(b.data.tujuan || ''), catatan: String(b.data.catatan || '') };
    await sql`CREATE TABLE IF NOT EXISTS mi_persona (project text PRIMARY KEY, data jsonb NOT NULL, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`INSERT INTO mi_persona (project, data, updated_by) VALUES (${b.project}, ${JSON.stringify(data)}::jsonb, ${user.username})
      ON CONFLICT (project) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    return Response.json({ ok: true });
  }
  if (b.jenis === 'gabung') {
    // Gabungkan campaign 'dari' ke campaign 'ke' — tag lead, entri spend & biaya berulang ikut pindah
    if (user.role !== 'manager') return Response.json({ error: 'Hanya manager yang boleh menggabungkan campaign' }, { status: 403 });
    if (!b.dari || !b.ke || b.dari === b.ke) return Response.json({ error: 'Pilih dua campaign yang berbeda' }, { status: 400 });
    const ada = await sql`SELECT nama FROM mi_campaigns WHERE nama = ANY(${[b.dari, b.ke]}::text[])`;
    if (ada.length < 2) return Response.json({ error: 'Campaign tidak ditemukan' }, { status: 404 });
    const l = await sql`UPDATE leads SET campaign = ${b.ke}, updated_at = now() WHERE campaign = ${b.dari} RETURNING id`;
    const a = await sql`UPDATE mi_ads SET campaign = ${b.ke} WHERE campaign = ${b.dari} RETURNING id`;
    try { await sql`UPDATE mi_amort SET campaign = ${b.ke} WHERE campaign = ${b.dari}`; } catch {}
    try { await sql`UPDATE mi_ads_breakdown SET campaign = ${b.ke} WHERE campaign = ${b.dari}`; } catch {}
    try { await sql`UPDATE mi_adset_targeting SET campaign = ${b.ke} WHERE campaign = ${b.dari}`; } catch {}
    // Ingat nama lama sebagai alias: tarikan Meta berikutnya memetakan campaign Meta ini ke campaign tujuan,
    // bukan mendaftarkannya ulang (dulu spend yang sudah digabung pindah balik setiap tarikan)
    try {
      await sql`CREATE TABLE IF NOT EXISTS mi_campaign_alias (alias text PRIMARY KEY, nama text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
      await sql`UPDATE mi_campaign_alias SET nama = ${b.ke} WHERE nama = ${b.dari}`;
      await sql`INSERT INTO mi_campaign_alias (alias, nama) VALUES (${b.dari}, ${b.ke}) ON CONFLICT (alias) DO UPDATE SET nama = EXCLUDED.nama`;
    } catch (e) { console.error('alias campaign', e); }
    await sql`DELETE FROM mi_campaigns WHERE nama = ${b.dari}`;
    return Response.json({ ok: true, lead: l.length, entri: a.length });
  }
  if (b.jenis === 'tag') {
    const ids = (b.ids || []).map(Number).filter(Boolean);
    if (!ids.length) return Response.json({ error: 'Pilih minimal satu lead' }, { status: 400 });
    if (!b.campaign) return Response.json({ error: 'Pilih campaign tujuan' }, { status: 400 });
    const ada = await sql`SELECT 1 FROM mi_campaigns WHERE nama = ${b.campaign}`;
    if (!ada.length) return Response.json({ error: 'Campaign tidak terdaftar' }, { status: 400 });
    const tim = user.role === 'markom';
    const r = await sql`UPDATE leads l SET campaign = ${b.campaign},
        konten = CASE WHEN ${b.konten || ''} = '' THEN konten ELSE ${b.konten || ''} END, updated_at = now()
      WHERE id = ANY(${ids}::int[])
        AND (NOT ${tim}::boolean OR EXISTS (SELECT 1 FROM users u WHERE u.username = l.created_by AND u.role = 'markom')) RETURNING id`;
    return Response.json({ ok: true, jumlah: r.length });
  }
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  if (b.jenis === 'campaign') {
    await sql`UPDATE mi_campaigns SET platform = ${b.platform || ''}, project = ${b.project || ''}, tujuan = ${b.tujuan || ''},
      budget = ${Number(b.budget) || 0}, status = ${b.status || 'Aktif'}, catatan = ${b.catatan || ''} WHERE id = ${b.id}`;
    return Response.json({ ok: true });
  }
  if (b.jenis === 'konten') {
    await sql`UPDATE mi_contents SET tgl = ${b.tgl || null}, platform = ${b.platform || ''}, project = ${b.project || ''},
      format = ${b.format || ''}, topik = ${b.topik || ''}, hook = ${b.hook || ''}, jam = ${b.jam || ''}, durasi = ${b.durasi || ''}, link = ${b.link || ''} WHERE id = ${b.id}`;
    return Response.json({ ok: true });
  }
  if (b.jenis === 'iklan') {
    await sql`UPDATE mi_ads SET tgl = ${b.tgl || null}, campaign = ${b.campaign || ''}, kreatif = ${b.kreatif || ''},
      spend = ${Number(b.spend) || 0}, impresi = ${Number(b.impresi) || 0}, reach = ${Number(b.reach) || 0},
      klik = ${Number(b.klik) || 0}, hasil = ${Number(b.hasil) || 0}, catatan = ${b.catatan || ''} WHERE id = ${b.id}`;
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'Jenis data tidak dikenal' }, { status: 400 });
}

async function _DELETE(req) {
  const { user, err } = await akses(); if (err) return err;
  const url = new URL(req.url);
  const jenis = url.searchParams.get('jenis');
  const id = Number(url.searchParams.get('id'));
  if (!id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  if (jenis === 'amort') {
    const r = await sql`SELECT created_by FROM mi_amort WHERE id = ${id}`;
    if (!r.length) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    if (!(await bolehUbah(sql, user, r[0].created_by))) return Response.json({ error: 'Hanya manager / tim Marcom yang boleh menghapus' }, { status: 403 });
    await sql`DELETE FROM mi_amort WHERE id = ${id}`;
    return Response.json({ ok: true });
  }
  const tabel = { campaign: 'mi_campaigns', konten: 'mi_contents', iklan: 'mi_ads' }[jenis];
  if (!tabel) return Response.json({ error: 'Jenis data tidak dikenal' }, { status: 400 });
  // Marcom boleh menghapus data milik tim marcom (semua akun berperan marcom); manager bebas
  if (jenis === 'campaign') {
    const r = await sql`SELECT created_by FROM mi_campaigns WHERE id = ${id}`;
    if (!r.length) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    if (!(await bolehUbah(sql, user, r[0].created_by))) return Response.json({ error: 'Hanya manager / tim Marcom yang boleh menghapus' }, { status: 403 });
    await sql`DELETE FROM mi_campaigns WHERE id = ${id}`;
  } else if (jenis === 'konten') {
    const r = await sql`SELECT created_by FROM mi_contents WHERE id = ${id}`;
    if (!r.length) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    if (!(await bolehUbah(sql, user, r[0].created_by))) return Response.json({ error: 'Hanya manager / tim Marcom yang boleh menghapus' }, { status: 403 });
    await sql`DELETE FROM mi_content_metrics WHERE content_id = ${id}`;
    await sql`DELETE FROM mi_contents WHERE id = ${id}`;
  } else {
    const r = await sql`SELECT created_by FROM mi_ads WHERE id = ${id}`;
    if (!r.length) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    if (!(await bolehUbah(sql, user, r[0].created_by))) return Response.json({ error: 'Hanya manager / tim Marcom yang boleh menghapus' }, { status: 403 });
    await sql`DELETE FROM mi_ads WHERE id = ${id}`;
  }
  return Response.json({ ok: true });
}

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const POST = denganLog('Analisa Marcom', _POST);
export const PATCH = denganLog('Analisa Marcom', _PATCH);
export const DELETE = denganLog('Analisa Marcom', _DELETE);
