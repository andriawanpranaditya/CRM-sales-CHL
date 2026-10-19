import { db } from '@/lib/db';
import { requireUser, lihatBaris, pesanProyek } from '@/lib/auth';
import { denganLog } from '@/lib/log';
import { siapkanJanjian, lokasiJanjian, perluUpdate, sekarangWIB, namaHari, JENIS_JANJIAN, HASIL_VISIT, LOKASI_DEFAULT,
  NAIK_KE_APPOINTMENT, NAIK_KE_SITEVISIT, hitungVisitor, ringkasVisitor, JENIS_TANPA_JANJI } from '@/lib/janjian';

export const dynamic = 'force-dynamic';

const PERAN = ['manager', 'ceo', 'sales', 'markom']; // Marcom: lihat daily visitor & janji temu, boleh buat janji temu / catat visitor
const tglOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const jamOk = v => /^\d{2}:\d{2}$/.test(String(v || ''));
const tglStr = t => (t instanceof Date ? t.toISOString() : String(t || '')).slice(0, 10);
const fmtTgl = t => { const d = tglStr(t); return d ? `${namaHari(d)} ${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` : ''; };

async function ambil(sql, user, id) {
  const r = await sql`SELECT j.*, l.nama, l.status AS lead_status, l.created_by AS lead_by FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code WHERE j.id = ${Number(id) || 0}`;
  if (!r.length) return { err: Response.json({ error: 'Janjian tidak ditemukan' }, { status: 404 }) };
  const j = r[0];
  if (user.role === 'sales' && j.sales !== user.name) return { err: Response.json({ error: 'Janjian ini bukan milik Anda' }, { status: 403 }) };
  if (!lihatBaris(user, { project: j.project, sales: j.sales, created_by: j.lead_by })) return { err: Response.json({ error: pesanProyek(user) }, { status: 403 }) };
  return { j };
}
async function catatLog(sql, id, user, aksi, isi) {
  await sql`INSERT INTO janjian_log (janjian_id, oleh, aksi, isi) VALUES (${id}, ${user.name}, ${aksi}, ${String(isi || '').slice(0, 500)})`;
}
// Catatan janjian ikut masuk riwayat follow up lead (terlihat di timeline Database Lead)
async function catatFU(sql, user, leadCode, detail) {
  try {
    await sql`INSERT INTO followups (lead_code, tgl, detail, objection, next_action, next_tgl, wa_pesan, created_by)
      VALUES (${leadCode}, ${sekarangWIB().tgl}, ${detail}, '', '', null, '', ${user.username})`;
  } catch (e) { console.error('fu janjian', e); }
}

export async function GET(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanJanjian(sql);
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sumber_detail text`; } catch {}
  const q = new URL(req.url).searchParams;
  const now = sekarangWIB();
  const geser = (t, n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const salesSaya = user.role === 'sales' ? user.name : null;
  const pjMinta = q.get('project') || null;
  if (pjMinta && user.projects && !user.projects.includes(pjMinta)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  const pp = pjMinta ? [pjMinta] : user.projects;

  // ===== Daily visitor satu tanggal (+ grafik 7 hari terakhir) =====
  if (q.get('visitor')) {
    const tgl = tglOk(q.get('visitor')) ? q.get('visitor') : now.tgl;
    const [hari, seminggu] = await Promise.all([
      hitungVisitor(sql, { dari: tgl, sampai: tgl, pp, sales: salesSaya, now }),
      hitungVisitor(sql, { dari: geser(tgl, -6), sampai: tgl, pp, sales: salesSaya, now }),
    ]);
    const rows = hari.filter(v => lihatBaris(user, { project: v.project, sales: v.sales, created_by: v.lead_by }));
    const spark = [];
    for (let i = 6; i >= 0; i--) { const t = geser(tgl, -i); spark.push({ tgl: t, hari: namaHari(t), n: seminggu.filter(v => v.tgl === t && v.hitung).length }); }
    let leadsPilih = [];
    if (user.role === 'sales') leadsPilih = await sql`SELECT lead_code, nama, status FROM leads WHERE sales = ${user.name} AND status NOT IN ('Closing', 'Drop', 'Lost') ORDER BY updated_at DESC NULLS LAST LIMIT 500`;
    return Response.json({ tgl, hari: namaHari(tgl), now, rows, ringkas: ringkasVisitor(rows), spark, leads: leadsPilih });
  }

  // ===== Laporan janjian visit per periode (untuk Report Lengkap) — dihitung dari KEJADIAN pada periode, bukan tanggal janji =====
  if (q.get('laporan')) {
    const dari = tglOk(q.get('dari')) ? q.get('dari') : now.tgl.slice(0, 8) + '01', sampai = tglOk(q.get('sampai')) ? q.get('sampai') : now.tgl;
    const batasAkan = sampai > now.tgl ? sampai : now.tgl;
    const [dibuat, ev, terjadwal, vis] = await Promise.all([
      sql`SELECT j.id, j.sales, j.project, l.created_by AS lead_by FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code
        WHERE j.jenis <> ${JENIS_TANPA_JANJI} AND (j.created_at AT TIME ZONE 'Asia/Jakarta')::date >= ${dari}::date AND (j.created_at AT TIME ZONE 'Asia/Jakarta')::date <= ${sampai}::date
          AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[])) AND (${salesSaya}::text IS NULL OR j.sales = ${salesSaya})`,
      sql`SELECT x.waktu, x.aksi, x.isi, x.oleh, j.id, j.lead_code, j.sales, j.project, j.jenis, j.lokasi, j.tgl::text AS tgl, j.jam, j.status, l.nama, l.created_by AS lead_by
        FROM janjian_log x JOIN janjian j ON j.id = x.janjian_id LEFT JOIN leads l ON l.lead_code = j.lead_code
        WHERE x.aksi IN ('Datang', 'Batal', 'Reschedule') AND j.jenis <> ${JENIS_TANPA_JANJI}
          AND (x.waktu AT TIME ZONE 'Asia/Jakarta')::date >= ${dari}::date AND (x.waktu AT TIME ZONE 'Asia/Jakarta')::date <= ${sampai}::date
          AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[])) AND (${salesSaya}::text IS NULL OR j.sales = ${salesSaya}) ORDER BY x.waktu`,
      sql`SELECT j.id, j.lead_code, j.sales, j.project, j.jenis, j.lokasi, j.tgl::text AS tgl, j.jam, j.status, j.catatan, j.peserta, l.nama, l.created_by AS lead_by
        FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code
        WHERE j.status = 'Terjadwal' AND j.jenis <> ${JENIS_TANPA_JANJI} AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[])) AND (${salesSaya}::text IS NULL OR j.sales = ${salesSaya}) ORDER BY j.tgl, j.jam`,
      hitungVisitor(sql, { dari, sampai, pp, sales: salesSaya, now }),
    ]);
    const ok = x => lihatBaris(user, { project: x.project, sales: x.sales, created_by: x.lead_by });
    const E = ev.filter(ok), B = dibuat.filter(ok), V = vis.filter(ok).filter(v => v.hitung);
    const belum = terjadwal.filter(ok).filter(j => perluUpdate(j, now) && j.tgl >= dari && j.tgl <= sampai);
    const akan = terjadwal.filter(ok).filter(j => j.tgl > batasAkan || (j.tgl >= now.tgl && !perluUpdate(j, now) && j.tgl <= batasAkan && j.tgl >= dari));
    const per = {}; const P = n => per[n] || (per[n] = { sales: n || '-', dibuat: 0, datang: 0, resch: 0, batal: 0, belum: 0, akan: 0, lain: 0, visitor: 0 });
    B.forEach(j => { P(j.sales).dibuat++; });
    E.forEach(e => { const p = P(e.sales); if (e.aksi === 'Datang') p.datang++; else if (e.aksi === 'Reschedule') p.resch++; else p.batal++; });
    belum.forEach(j => { P(j.sales).belum++; }); akan.forEach(j => { P(j.sales).akan++; });
    V.forEach(v => { const p = P(v.sales); p.visitor++; if (v.kategori !== 'janji') p.lain++; });
    const rincian = [
      ...E.filter(e => e.aksi !== 'Datang').map(e => ({ waktu: e.waktu, tgl: e.tgl, jam: e.jam, lead_code: e.lead_code, nama: e.nama, project: e.project, sales: e.sales, jenis: e.jenis, lokasi: e.lokasi, status: e.aksi, ket: e.isi || '' })),
      ...belum.map(j => ({ waktu: j.tgl + 'T' + j.jam, tgl: j.tgl, jam: j.jam, lead_code: j.lead_code, nama: j.nama, project: j.project, sales: j.sales, jenis: j.jenis, lokasi: j.lokasi, status: 'Belum di-update', ket: `Jam janji sudah lewat — isi datang / reschedule / batal` })),
      ...akan.map(j => ({ waktu: j.tgl + 'T' + j.jam, tgl: j.tgl, jam: j.jam, lead_code: j.lead_code, nama: j.nama, project: j.project, sales: j.sales, jenis: j.jenis, lokasi: j.lokasi, status: 'Akan datang', ket: [j.peserta, j.catatan].filter(Boolean).join(' · ') })),
    ].sort((a, b) => String(a.waktu).localeCompare(String(b.waktu)));
    const total = Object.values(per).reduce((t, p) => { Object.keys(p).forEach(k => { if (k !== 'sales') t[k] = (t[k] || 0) + p[k]; }); return t; }, {});
    return Response.json({ dari, sampai, now, perSales: Object.values(per).sort((a, b) => b.visitor - a.visitor || b.dibuat - a.dibuat), total, rincian });
  }

  // ===== Rekap bulan ini + update janji temu terbaru =====
  if (q.get('rekap')) {
    const awal = now.tgl.slice(0, 8) + '01';
    const [jb, vis, upd] = await Promise.all([
      sql`SELECT j.id, j.sales, j.status, j.reschedule_n, j.batal_alasan, j.tgl::text AS tgl, j.jenis, l.nama, j.project, l.created_by AS lead_by
        FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code
        WHERE j.tgl >= ${awal}::date AND j.tgl <= ${geser(now.tgl, 7)}::date AND j.jenis <> ${JENIS_TANPA_JANJI}
          AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[])) AND (${salesSaya}::text IS NULL OR j.sales = ${salesSaya})`,
      hitungVisitor(sql, { dari: awal, sampai: now.tgl, pp, sales: salesSaya, now }),
      sql`SELECT x.waktu, x.oleh, x.aksi, x.isi, j.lead_code, j.sales, j.jenis, j.lokasi, j.project, j.tgl::text AS tgl, j.jam, l.nama, l.created_by AS lead_by
        FROM janjian_log x JOIN janjian j ON j.id = x.janjian_id LEFT JOIN leads l ON l.lead_code = j.lead_code
        WHERE x.aksi IN ('Datang', 'Batal', 'Reschedule') AND x.waktu > now() - interval '7 days'
          AND (${pp}::text[] IS NULL OR j.project = ANY(${pp}::text[])) AND (${salesSaya}::text IS NULL OR j.sales = ${salesSaya})
        ORDER BY x.waktu DESC LIMIT 50`,
    ]);
    const ok = x => lihatBaris(user, { project: x.project, sales: x.sales, created_by: x.lead_by });
    const bulan = jb.filter(ok).filter(j => j.tgl <= now.tgl), visitor = vis.filter(ok).filter(v => v.hitung);
    const perSales = {};
    const ps = n => perSales[n] || (perSales[n] = { sales: n, janji: 0, datang: 0, resch: 0, batal: 0, visitor: 0 });
    bulan.forEach(j => { const x = ps(j.sales || '-'); x.janji++; if (j.status === 'Datang') x.datang++; if (j.reschedule_n) x.resch++; if (j.status === 'Batal') x.batal++; });
    visitor.forEach(v => { ps(v.sales || '-').visitor++; });
    const depan = [];
    for (let i = 1; i <= 7; i++) { const t = geser(now.tgl, i); depan.push({ tgl: t, hari: namaHari(t), n: jb.filter(j => j.tgl === t && j.status === 'Terjadwal').length }); }
    return Response.json({ now, bulan: { n: bulan.length, datang: bulan.filter(j => j.status === 'Datang').length, resch: bulan.filter(j => j.reschedule_n > 0).length,
        batal: bulan.filter(j => j.status === 'Batal').length },
      visitor: ringkasVisitor(vis.filter(ok)), depan, perSales: Object.values(perSales).sort((a, b) => b.visitor - a.visitor || b.janji - a.janji),
      alasanBatal: bulan.filter(j => j.status === 'Batal' && j.batal_alasan).slice(-5).reverse().map(j => ({ nama: j.nama, sales: j.sales, alasan: j.batal_alasan })),
      terbaru: upd.filter(ok) });
  }

  const dari = tglOk(q.get('dari')) ? q.get('dari') : geser(now.tgl, -30);
  const sampai = tglOk(q.get('sampai')) ? q.get('sampai') : geser(now.tgl, 30);
  let rows = await sql`SELECT j.*, j.tgl::text AS tgl, l.nama, l.wa, l.status AS lead_status, l.created_by AS lead_by,
      l.sumber AS lead_sumber, l.walkin_info AS lead_walkin, l.sumber_detail AS lead_sumber_detail, l.campaign AS lead_campaign, l.tgl::text AS lead_tgl, ui.name AS penginput, ui.role AS penginput_role
    FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code LEFT JOIN users ui ON ui.username = l.created_by
    WHERE j.tgl >= ${dari}::date AND j.tgl <= ${sampai}::date
      AND (${user.role === 'sales' ? user.name : null}::text IS NULL OR j.sales = ${user.role === 'sales' ? user.name : null})
    ORDER BY j.tgl, j.jam`;
  rows = rows.filter(r => lihatBaris(user, { project: r.project, sales: r.sales, created_by: r.lead_by }));
  // Janjian lama yang masih Terjadwal tapi lewat (di luar rentang) tetap ditampilkan agar bisa di-update
  const lama = await sql`SELECT j.*, j.tgl::text AS tgl, l.nama, l.wa, l.status AS lead_status, l.created_by AS lead_by,
      l.sumber AS lead_sumber, l.walkin_info AS lead_walkin, l.sumber_detail AS lead_sumber_detail, l.campaign AS lead_campaign, l.tgl::text AS lead_tgl, ui.name AS penginput, ui.role AS penginput_role
    FROM janjian j LEFT JOIN leads l ON l.lead_code = j.lead_code LEFT JOIN users ui ON ui.username = l.created_by
    WHERE j.status = 'Terjadwal' AND j.tgl < ${dari}::date
      AND (${user.role === 'sales' ? user.name : null}::text IS NULL OR j.sales = ${user.role === 'sales' ? user.name : null})`;
  rows = [...lama.filter(r => lihatBaris(user, { project: r.project, sales: r.sales, created_by: r.lead_by })), ...rows];
  const ids = rows.map(r => r.id);
  const log = ids.length ? await sql`SELECT janjian_id, waktu, oleh, aksi, isi FROM janjian_log WHERE janjian_id = ANY(${ids}::int[]) ORDER BY waktu DESC` : [];
  const out = rows.map(r => ({ ...r, hari: namaHari(r.tgl), perlu_update: perluUpdate(r, now), log: log.filter(x => x.janjian_id === r.id) }));

  // Lead yang bisa dibuatkan janjian (sales: lead miliknya yang masih aktif)
  let leads = [];
  if (user.role === 'sales') {
    leads = await sql`SELECT lead_code, nama, project, status FROM leads WHERE sales = ${user.name} AND status NOT IN ('Closing', 'Drop', 'Lost') ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 500`;
    leads = leads.filter(l => lihatBaris(user, { ...l, sales: user.name }));
  } else {
    // Marcom / Manager / CEO: semua lead aktif (sesuai akses project) — janji temu tercatat atas nama sales pemilik lead
    leads = await sql`SELECT lead_code, nama, project, status, sales, created_by FROM leads WHERE status NOT IN ('Closing', 'Drop', 'Lost') ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 800`;
    leads = leads.filter(l => lihatBaris(user, l));
  }
  return Response.json({ rows: out, now, leads, lokasi: await lokasiJanjian(sql), JENIS: JENIS_JANJIAN, HASIL: HASIL_VISIT });
}

async function _POST(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanJanjian(sql);
  const b = await req.json().catch(() => ({}));
  // Catat visitor yang datang tanpa janji temu (lead lama datang langsung)
  if (b.aksi === 'visitor') {
    const lv = await sql`SELECT lead_code, nama, project, sales, status, created_by FROM leads WHERE lead_code = ${b.lead_code || ''}`;
    if (!lv.length) return Response.json({ error: 'Pilih lead' }, { status: 400 });
    if (user.role === 'sales' && lv[0].sales !== user.name) return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
    if (!lihatBaris(user, lv[0])) return Response.json({ error: pesanProyek(user) }, { status: 403 });
    const now = sekarangWIB();
    const jamD = jamOk(b.jam_datang) ? b.jam_datang : now.jam;
    const r = await sql`INSERT INTO janjian (lead_code, project, sales, jenis, lokasi, tgl, jam, status, jam_datang, unit_dilihat, hasil_catatan, created_by)
      VALUES (${lv[0].lead_code}, ${lv[0].project || ''}, ${lv[0].sales || ''}, ${JENIS_TANPA_JANJI}, ${b.lokasi || ''}, ${now.tgl}, ${jamD}, 'Datang', ${jamD},
              ${b.unit_dilihat || ''}, ${b.catatan || ''}, ${user.username}) RETURNING id`;
    await catatLog(sql, r[0].id, user, 'Datang', `datang tanpa janji temu ${jamD}` + (b.catatan ? ' · ' + b.catatan : ''));
    if (NAIK_KE_SITEVISIT.includes(lv[0].status)) await sql`UPDATE leads SET status = 'Site Visit', updated_at = now() WHERE lead_code = ${lv[0].lead_code}`;
    await catatFU(sql, user, lv[0].lead_code, `Konsumen datang tanpa janji temu (${jamD})` + (b.unit_dilihat ? ' · unit: ' + b.unit_dilihat : '') + (b.catatan ? ' · ' + b.catatan : ''));
    return Response.json({ ok: true, lead_code: lv[0].lead_code, nama: lv[0].nama, aksi: 'Visitor tanpa janji' });
  }
  const l = await sql`SELECT lead_code, nama, project, sales, status, created_by FROM leads WHERE lead_code = ${b.lead_code || ''}`;
  if (!l.length) return Response.json({ error: 'Pilih lead' }, { status: 400 });
  const lead = l[0];
  if (user.role === 'sales' && lead.sales !== user.name) return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  if (!lihatBaris(user, lead)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  if (!lead.sales) return Response.json({ error: 'Lead ini belum punya sales — oper ke sales dulu' }, { status: 400 });
  if (!JENIS_JANJIAN.includes(b.jenis)) return Response.json({ error: 'Pilih jenis janjian' }, { status: 400 });
  if (!tglOk(b.tgl) || !jamOk(b.jam)) return Response.json({ error: 'Isi tanggal & jam janjian' }, { status: 400 });
  const lokasi = String(b.lokasi || '').trim();
  if (!lokasi) return Response.json({ error: 'Pilih / isi lokasi' }, { status: 400 });
  const r = await sql`INSERT INTO janjian (lead_code, project, sales, jenis, lokasi, tgl, jam, peserta, catatan, created_by)
    VALUES (${lead.lead_code}, ${lead.project || ''}, ${lead.sales}, ${b.jenis}, ${lokasi}, ${b.tgl}, ${b.jam}, ${b.peserta || ''}, ${b.catatan || ''}, ${user.username})
    RETURNING id`;
  await catatLog(sql, r[0].id, user, 'Dibuat', `${b.jenis} · ${lokasi} · ${fmtTgl(b.tgl)} ${b.jam}`);
  // Status lead otomatis Appointment (tidak menurunkan status yang lebih maju)
  if (NAIK_KE_APPOINTMENT.includes(lead.status)) await sql`UPDATE leads SET status = 'Appointment', updated_at = now() WHERE lead_code = ${lead.lead_code}`;
  await catatFU(sql, user, lead.lead_code, `Janjian ${b.jenis.toLowerCase()} dibuat: ${fmtTgl(b.tgl)} pukul ${b.jam} · ${lokasi}` + (b.catatan ? ` · ${b.catatan}` : ''));
  return Response.json({ ok: true, id: r[0].id, lead_code: lead.lead_code, nama: lead.nama });
}

async function _PATCH(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanJanjian(sql);
  const b = await req.json().catch(() => ({}));

  if (b.aksi === 'atur_lokasi') {
    if (user.role !== 'manager') return Response.json({ error: 'Hanya manager' }, { status: 403 });
    const data = {};
    for (const [p, list] of Object.entries(b.data || {})) data[p] = (Array.isArray(list) ? list : []).map(x => String(x).trim()).filter(Boolean).slice(0, 20);
    await sql`INSERT INTO settings (key, items) VALUES ('lokasi_janjian', ${JSON.stringify({ ...LOKASI_DEFAULT, ...data })}) ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
    return Response.json({ ok: true });
  }

  const { j, err: e2 } = await ambil(sql, user, b.id); if (e2) return e2;
  const lamaTgl = tglStr(j.tgl);

  if (b.aksi === 'reschedule') {
    if (j.status !== 'Terjadwal') return Response.json({ error: 'Janjian ini sudah ' + j.status.toLowerCase() }, { status: 400 });
    if (!tglOk(b.tgl) || !jamOk(b.jam)) return Response.json({ error: 'Isi tanggal & jam baru' }, { status: 400 });
    const alasan = String(b.alasan || '').trim();
    if (!alasan) return Response.json({ error: 'Isi alasan reschedule' }, { status: 400 });
    await sql`UPDATE janjian SET tgl = ${b.tgl}, jam = ${b.jam}, reschedule_n = reschedule_n + 1, updated_at = now() WHERE id = ${j.id}`;
    const isi = `Dari ${fmtTgl(lamaTgl)} ${j.jam} ke ${fmtTgl(b.tgl)} ${b.jam} · alasan: ${alasan}`;
    await catatLog(sql, j.id, user, 'Reschedule', isi);
    await catatFU(sql, user, j.lead_code, 'Janjian dijadwal ulang: ' + isi);
    return Response.json({ ok: true, lead_code: j.lead_code, nama: j.nama, aksi: 'Reschedule' });
  }

  if (b.aksi === 'batal') {
    if (j.status !== 'Terjadwal') return Response.json({ error: 'Janjian ini sudah ' + j.status.toLowerCase() }, { status: 400 });
    const alasan = String(b.alasan || '').trim();
    if (!alasan) return Response.json({ error: 'Isi alasan batal' }, { status: 400 });
    const lanjut = b.lanjut === 'drop' ? 'drop' : 'fu';
    await sql`UPDATE janjian SET status = 'Batal', batal_alasan = ${alasan}, lanjut = ${lanjut}, updated_at = now() WHERE id = ${j.id}`;
    await catatLog(sql, j.id, user, 'Batal', `alasan: ${alasan} · ${lanjut === 'drop' ? 'lead ditandai Drop' : 'lead tetap follow up'}`);
    if (lanjut === 'drop') await sql`UPDATE leads SET status = 'Drop', next_fu = NULL, updated_at = now() WHERE lead_code = ${j.lead_code}`;
    await catatFU(sql, user, j.lead_code, `Janjian ${fmtTgl(lamaTgl)} ${j.jam} batal · alasan: ${alasan}` + (lanjut === 'drop' ? ' · lead Drop' : ''));
    return Response.json({ ok: true, lead_code: j.lead_code, nama: j.nama, aksi: 'Batal' });
  }

  if (b.aksi === 'datang') {
    if (j.status !== 'Terjadwal') return Response.json({ error: 'Janjian ini sudah ' + j.status.toLowerCase() }, { status: 400 });
    if (b.jam_datang && !jamOk(b.jam_datang)) return Response.json({ error: 'Format jam datang HH:MM' }, { status: 400 });
    await sql`UPDATE janjian SET status = 'Datang', jam_datang = ${b.jam_datang || j.jam}, unit_dilihat = ${b.unit_dilihat || ''},
      hasil = ${b.hasil || ''}, hasil_catatan = ${b.catatan || ''}, updated_at = now() WHERE id = ${j.id}`;
    await catatLog(sql, j.id, user, 'Datang', [b.jam_datang ? 'datang ' + b.jam_datang : '', b.unit_dilihat, b.hasil, b.catatan].filter(Boolean).join(' · '));
    // Status lead otomatis Site Visit + catatan visit ke riwayat follow up
    if (NAIK_KE_SITEVISIT.includes(j.lead_status)) await sql`UPDATE leads SET status = 'Site Visit', updated_at = now() WHERE lead_code = ${j.lead_code}`;
    await catatFU(sql, user, j.lead_code, `Konsumen datang (${j.jenis.toLowerCase()} ${fmtTgl(lamaTgl)} ${b.jam_datang || j.jam})` +
      [b.unit_dilihat ? ' · unit: ' + b.unit_dilihat : '', b.hasil ? ' · ' + b.hasil : '', b.catatan ? ' · ' + b.catatan : ''].join(''));
    return Response.json({ ok: true, lead_code: j.lead_code, nama: j.nama, aksi: 'Datang' });
  }

  if (b.aksi === 'ubah') {
    if (j.status !== 'Terjadwal') return Response.json({ error: 'Janjian yang sudah selesai tidak bisa diubah' }, { status: 400 });
    await sql`UPDATE janjian SET jenis = ${JENIS_JANJIAN.includes(b.jenis) ? b.jenis : j.jenis}, lokasi = ${b.lokasi || j.lokasi},
      peserta = ${'peserta' in b ? b.peserta : j.peserta}, catatan = ${'catatan' in b ? b.catatan : j.catatan}, updated_at = now() WHERE id = ${j.id}`;
    await catatLog(sql, j.id, user, 'Diubah', 'detail janjian diperbarui');
    return Response.json({ ok: true, lead_code: j.lead_code, nama: j.nama, aksi: 'Diubah' });
  }
  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}

async function _DELETE(req) {
  const { user, err } = await requireUser('manager'); if (err) return err;
  const sql = db();
  await siapkanJanjian(sql);
  const { j, err: e2 } = await ambil(sql, user, new URL(req.url).searchParams.get('id')); if (e2) return e2;
  await sql`DELETE FROM janjian_log WHERE janjian_id = ${j.id}`;
  await sql`DELETE FROM janjian WHERE id = ${j.id}`;
  return Response.json({ ok: true, lead_code: j.lead_code, nama: j.nama });
}

const ringkas = ({ body, out }) => ({ detail: [out.lead_code, out.nama, out.aksi || (body.aksi === 'atur_lokasi' ? 'atur lokasi' : ''), body.tgl ? `${body.tgl} ${body.jam || ''}` : '', body.alasan ? 'alasan: ' + body.alasan : ''].filter(Boolean).join(' · ') });
export const POST = denganLog('Janjian', _POST, ringkas);
export const PATCH = denganLog('Janjian', _PATCH, ringkas);
export const DELETE = denganLog('Janjian', _DELETE, ringkas);
