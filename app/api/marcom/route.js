import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Akses modul Analisa Marcom: markom (kelola) & manager (kelola + pantau)
async function akses() {
  const { user, err } = await requireUser();
  if (err) return { err };
  if (!['manager', 'markom'].includes(user.role)) {
    return { err: Response.json({ error: 'Menu ini khusus Marcom & Manager' }, { status: 403 }) };
  }
  return { user };
}

export async function GET(req) {
  const { user, err } = await akses(); if (err) return err;
  const sql = db();
  const url = new URL(req.url);

  // Ringkas: daftar campaign aktif untuk dropdown Form Input (dipakai juga oleh manager)
  if (url.searchParams.get('list') === 'campaign') {
    const rows = await sql`SELECT id, nama, platform, project FROM mi_campaigns WHERE status = 'Aktif' ORDER BY nama`;
    return Response.json(rows);
  }

  // Periode analisa (opsional) — membatasi leads, iklan, dan konten berdasarkan tanggal
  const d1 = url.searchParams.get('d1') || null;
  const d2 = url.searchParams.get('d2') || null;
  const proj = url.searchParams.get('project') || null;

  const [campaigns, contents, ads] = await Promise.all([
    sql`SELECT * FROM mi_campaigns ORDER BY status, id DESC`,
    sql`SELECT c.*, m.tgl AS m_tgl, m.reach, m.like_n, m.komentar, m.share_n, m.save_n, m.view3, m.view_full, m.klik_bio
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
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM followups f WHERE f.lead_code = l.lead_code))::int AS l1,
      count(*) FILTER (WHERE l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing')
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
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM followups f WHERE f.lead_code = l.lead_code))::int AS l1,
      count(*) FILTER (WHERE l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing')
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
      count(*) FILTER (WHERE l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing')
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
    WHERE (l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing')
        OR EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = l.lead_code AND t.jenis IN ('Reserved','Booking','Closing')))
      AND (${d1}::date IS NULL OR l.tgl >= ${d1}::date) AND (${d2}::date IS NULL OR l.tgl <= ${d2}::date) AND (${proj}::text IS NULL OR l.project = ${proj})
    GROUP BY 1, 2, 3, 4 ORDER BY l2 DESC LIMIT 200`,
    // Output tim: funnel per akun marcom (semua periode terpilih)
    sql`
    SELECT l.created_by AS username,
      count(*)::int AS l0,
      count(*) FILTER (WHERE l.tgl >= date_trunc('month', now())::date)::int AS l0_bln,
      count(*) FILTER (WHERE l.status IN ('Warm','Hot','Appointment','Site Visit','Booking','Closing')
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
  const spend = await sql`
    SELECT COALESCE(NULLIF(campaign, ''), '(tanpa data)') AS kunci, sum(spend)::numeric AS spend
    FROM mi_ads
    WHERE (${d1}::date IS NULL OR tgl >= ${d1}::date) AND (${d2}::date IS NULL OR tgl <= ${d2}::date)
          AND (${proj}::text IS NULL OR EXISTS (SELECT 1 FROM mi_campaigns mc WHERE mc.nama = mi_ads.campaign AND mc.project = ${proj}))
    GROUP BY 1`;

  return Response.json({ campaigns, contents, ads, byCampaign, bySumber, byKonten, audiens, timLead, timKonten, spend, me: { role: user.role, username: user.username } });
}

export async function POST(req) {
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
    await sql`INSERT INTO mi_content_metrics (content_id, tgl, reach, like_n, komentar, share_n, save_n, view3, view_full, klik_bio)
      VALUES (${Number(b.content_id)}, ${b.tgl || new Date().toISOString().slice(0, 10)}, ${Number(b.reach) || 0}, ${Number(b.like_n) || 0}, ${Number(b.komentar) || 0}, ${Number(b.share_n) || 0}, ${Number(b.save_n) || 0}, ${Number(b.view3) || 0}, ${Number(b.view_full) || 0}, ${Number(b.klik_bio) || 0})
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
  return Response.json({ error: 'Jenis data tidak dikenal' }, { status: 400 });
}

export async function PATCH(req) {
  const { user, err } = await akses(); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
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

export async function DELETE(req) {
  const { user, err } = await akses(); if (err) return err;
  const url = new URL(req.url);
  const jenis = url.searchParams.get('jenis');
  const id = Number(url.searchParams.get('id'));
  if (!id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const tabel = { campaign: 'mi_campaigns', konten: 'mi_contents', iklan: 'mi_ads' }[jenis];
  if (!tabel) return Response.json({ error: 'Jenis data tidak dikenal' }, { status: 400 });
  // Marcom hanya boleh menghapus data yang ia input sendiri; manager bebas
  if (jenis === 'campaign') {
    const r = await sql`SELECT created_by FROM mi_campaigns WHERE id = ${id}`;
    if (!r.length) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    if (user.role !== 'manager' && r[0].created_by !== user.username) return Response.json({ error: 'Hanya manager / pembuatnya yang boleh menghapus' }, { status: 403 });
    await sql`DELETE FROM mi_campaigns WHERE id = ${id}`;
  } else if (jenis === 'konten') {
    const r = await sql`SELECT created_by FROM mi_contents WHERE id = ${id}`;
    if (!r.length) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    if (user.role !== 'manager' && r[0].created_by !== user.username) return Response.json({ error: 'Hanya manager / pembuatnya yang boleh menghapus' }, { status: 403 });
    await sql`DELETE FROM mi_content_metrics WHERE content_id = ${id}`;
    await sql`DELETE FROM mi_contents WHERE id = ${id}`;
  } else {
    const r = await sql`SELECT created_by FROM mi_ads WHERE id = ${id}`;
    if (!r.length) return Response.json({ error: 'Data tidak ditemukan' }, { status: 404 });
    if (user.role !== 'manager' && r[0].created_by !== user.username) return Response.json({ error: 'Hanya manager / pembuatnya yang boleh menghapus' }, { status: 403 });
    await sql`DELETE FROM mi_ads WHERE id = ${id}`;
  }
  return Response.json({ ok: true });
}
