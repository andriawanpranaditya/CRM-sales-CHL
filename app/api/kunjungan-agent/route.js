import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanAgent, linkLeadAgent, cekDobel, tokenBaru } from '@/lib/agent-laporan';
import { siapkanJanjian } from '@/lib/janjian';
import { driveSiap } from '@/lib/foto-drive';

export const dynamic = 'force-dynamic';

// Manager: cek laporan kunjungan agent → setujui (jadi lead & visitor) / ubah / tolak · kelola link · rekap & Excel
export async function GET(req) {
  const { err } = await requireUser(['manager']); if (err) return err;
  const sql = db();
  await siapkanAgent(sql);
  const q = new URL(req.url).searchParams;
  const links = await linkLeadAgent(sql);
  const laporan = await sql`SELECT a.*, a.tgl::text AS tgl, l.status AS lead_status,
      EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = a.lead_code AND t.jenis IN ('Booking', 'Closing')) AS booking
    FROM agent_laporan a LEFT JOIN leads l ON l.lead_code = a.lead_code ORDER BY (a.status = 'Menunggu') DESC, a.created_at DESC LIMIT 400`;
  for (const x of laporan) if (x.status === 'Menunggu') x.dobel = await cekDobel(sql, x);
  if (q.get('excel')) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Kunjungan Agent');
    ws.columns = [['Tgl kunjungan', 'tgl', 13], ['Jam', 'jam', 7], ['Konsumen', 'konsumen', 24], ['Agent', 'agent_nama', 20], ['Kantor', 'agent_kantor', 24], ['HP agent', 'agent_hp', 16],
      ['Lead agent', 'lead_agent', 12], ['Project', 'project', 14], ['Tipe', 'tipe', 12], ['Cara bayar', 'bayar', 12], ['Domisili', 'domisili', 14], ['Budget', 'budget', 14],
      ['Catatan', 'catatan', 34], ['Status', 'status', 11], ['Lead', 'lead_code', 11], ['Booking', 'booking', 9], ['Dilaporkan', 'created_at', 18]].map(([header, key, width]) => ({ header, key, width }));
    laporan.forEach(x => ws.addRow({ ...x, booking: x.booking ? 'Ya' : '', created_at: new Date(x.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) }));
    ws.getRow(1).font = { bold: true };
    return new Response(await wb.xlsx.writeBuffer(), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="Kunjungan-Agent.xlsx"' } });
  }
  const rekap = {};
  laporan.forEach(x => { const k = `${x.lead_agent}|${String(x.tgl || '').slice(0, 7)}`; const r = rekap[k] || (rekap[k] = { lead_agent: x.lead_agent, bulan: String(x.tgl || '').slice(0, 7), laporan: 0, disetujui: 0, booking: 0 });
    r.laporan++; if (x.status === 'Disetujui') r.disetujui++; if (x.booking) r.booking++; });
  return Response.json({ links: links.map(l => ({ ...l, fotoSiap: driveSiap(l.project) })), laporan, rekap: Object.values(rekap).sort((a, b) => b.bulan.localeCompare(a.bulan) || a.lead_agent.localeCompare(b.lead_agent)),
    menunggu: laporan.filter(x => x.status === 'Menunggu').length });
}
export async function POST(req) {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  const sql = db();
  await siapkanAgent(sql);
  const b = await req.json().catch(() => ({}));
  if (b.aksi === 'link-baru') {
    const lama = (await sql`SELECT * FROM agent_link WHERE username = ${b.username} AND aktif = true ORDER BY id DESC LIMIT 1`)[0];
    if (!lama) return Response.json({ error: 'Link lead agent tidak ditemukan' }, { status: 404 });
    await sql`UPDATE agent_link SET aktif = false WHERE username = ${b.username}`;
    await sql`INSERT INTO agent_link (username, nama, project, token) VALUES (${lama.username}, ${lama.nama}, ${b.project || lama.project}, ${tokenBaru(lama.nama)})`;
    return Response.json({ ok: true });
  }
  const lap = (await sql`SELECT *, tgl::text AS tgl FROM agent_laporan WHERE id = ${Number(b.id)}`)[0];
  if (!lap) return Response.json({ error: 'Laporan tidak ditemukan' }, { status: 404 });
  const t = (x, n = 200) => String(x ?? '').trim().slice(0, n);
  const ubah = b.data ? { konsumen: t(b.data.konsumen ?? lap.konsumen, 100), tgl: /^\d{4}-\d{2}-\d{2}$/.test(b.data.tgl || '') ? b.data.tgl : lap.tgl, jam: t(b.data.jam ?? lap.jam, 10),
    tipe: t(b.data.tipe ?? lap.tipe, 60), bayar: t(b.data.bayar ?? lap.bayar, 40), domisili: t(b.data.domisili ?? lap.domisili, 80), budget: t(b.data.budget ?? lap.budget, 60), catatan: t(b.data.catatan ?? lap.catatan, 600) } : null;
  if (ubah) await sql`UPDATE agent_laporan SET konsumen = ${ubah.konsumen}, tgl = ${ubah.tgl}, jam = ${ubah.jam}, tipe = ${ubah.tipe}, bayar = ${ubah.bayar}, domisili = ${ubah.domisili},
    budget = ${ubah.budget}, catatan = ${ubah.catatan} WHERE id = ${lap.id}`;
  const L = { ...lap, ...(ubah || {}) };
  if (b.aksi === 'ubah') return Response.json({ ok: true });
  if (lap.status !== 'Menunggu') return Response.json({ error: 'Laporan ini sudah ' + lap.status.toLowerCase() }, { status: 400 });
  if (b.aksi === 'tolak') {
    if (!t(b.alasan)) return Response.json({ error: 'Tulis alasan penolakan' }, { status: 400 });
    await sql`UPDATE agent_laporan SET status = 'Ditolak', alasan = ${t(b.alasan, 300)}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${lap.id}`;
    return Response.json({ ok: true });
  }
  if (b.aksi !== 'setujui') return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
  // Setujui → lead milik lead agent (sumber Agent) + visitor (janji temu berstatus Datang) pada tanggal kunjungan
  const catatan = [`Agent: ${L.agent_nama} (${L.agent_kantor}, HP ${L.agent_hp})`, L.budget ? `Budget: ${L.budget}` : '', L.catatan].filter(Boolean).join(' · ');
  let kode = b.leadCode || null; // gabung ke lead yang sudah ada (pilihan cek dobel)
  if (kode) {
    const ada = (await sql`SELECT lead_code FROM leads WHERE lead_code = ${kode}`)[0];
    if (!ada) return Response.json({ error: 'Lead ' + kode + ' tidak ditemukan' }, { status: 404 });
    await sql`UPDATE leads SET catatan = TRIM(BOTH ' ·' FROM COALESCE(catatan, '') || ${' · Kunjungan agent ' + L.tgl + ': ' + catatan}), updated_at = now() WHERE lead_code = ${kode}`;
  } else {
    const ins = await sql`INSERT INTO leads (tgl, nama, wa, sumber, project, tipe, bayar, domisili, budget, sales, status, catatan, created_by)
      VALUES (${L.tgl}, ${L.konsumen}, '', 'Agent', ${L.project}, ${L.tipe || ''}, ${L.bayar || ''}, ${L.domisili || ''}, 0, ${L.lead_agent}, 'Site Visit', ${catatan}, ${user.username}) RETURNING id`;
    kode = 'LEAD-' + String(ins[0].id).padStart(4, '0');
    await sql`UPDATE leads SET lead_code = ${kode}, sales_tipe = 'agent', sales_kantor = ${L.agent_kantor}, foto = ${L.foto} WHERE id = ${ins[0].id}`;
  }
  await siapkanJanjian(sql);
  const jam = /^\d{1,2}[:.]\d{2}$/.test(L.jam || '') ? L.jam.replace('.', ':') : '10:00';
  const j = await sql`INSERT INTO janjian (lead_code, project, sales, jenis, lokasi, tgl, jam, peserta, catatan, status, jam_datang, created_by)
    VALUES (${kode}, ${L.project}, ${L.lead_agent}, 'Kunjungan agent', '', ${L.tgl}, ${jam}, ${L.agent_nama}, ${'Laporan agent ' + L.agent_nama + ' · ' + L.agent_kantor}, 'Datang', ${jam}, ${user.username}) RETURNING id`;
  if (L.foto) await sql`UPDATE janjian SET foto = ${L.foto} WHERE id = ${j[0].id}`;
  await sql`UPDATE agent_laporan SET status = 'Disetujui', lead_code = ${kode}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${lap.id}`;
  return Response.json({ ok: true, lead_code: kode });
}
