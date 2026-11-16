import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ambilCfg, simpanCfg, jalankanDistribusi, leadMenungguSaya, tandaiRespon, siapkanDistribusi, antrianMarcom } from '@/lib/distribusi-lead';
import { kirimPush } from '@/lib/push';

export const dynamic = 'force-dynamic';
const hariIni = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  await siapkanDistribusi(sql);
  const q = new URL(req.url).searchParams;
  // Cek cepat dari CRM yang terbuka (cadangan bila cron-job.org belum dipasang) + daftar lead yang menunggu respon sales ini
  if (q.get('saya') === '1') {
    try { await jalankanDistribusi(sql); } catch (e) { console.error('tick', e); }
    const pending = user.role === 'sales' ? await leadMenungguSaya(sql, user.username) : [];
    return Response.json({ now: new Date().toISOString(), pending });
  }
  // Kriteria 🔥 Siap oper (dipakai Form Input Marcom untuk label kualitas)
  if (q.get('kriteria') === '1') { const c = await ambilCfg(sql); const { teksKriteria } = await import('@/lib/kualitas-lead'); return Response.json({ kriteria: c.kriteria, teks: teksKriteria(c.kriteria) }); }
  // Antrian Marcom (belum dioper) + lead yang baru dibagi otomatis — untuk Marcom (Leads to Sales) & Manager
  if (q.get('antrian') === '1') {
    if (!['manager', 'ceo', 'markom'].includes(user.role)) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
    const a = await antrianMarcom(sql);
    if (user.projects) { a.antrian = a.antrian.filter(x => !x.project || user.projects.includes(x.project)); a.dibagi = a.dibagi.filter(x => !x.project || user.projects.includes(x.project)); }
    return Response.json(a);
  }
  if (!['manager', 'ceo', 'sales'].includes(user.role)) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
  const cfg = await ambilCfg(sql);
  const today = hariIni();
  const periode = q.get('periode') || 'bulan';
  const awal = periode === 'hari' ? today : periode === '7' ? new Date(Date.now() + 7 * 3600e3 - 6 * 864e5).toISOString().slice(0, 10)
    : periode === '30' ? new Date(Date.now() + 7 * 3600e3 - 29 * 864e5).toISOString().slice(0, 10) : today.slice(0, 8) + '01';
  let hari = await sql`SELECT d.id, d.lead_code, d.project, d.sales, d.username, d.urutan, d.mode, d.alasan, d.dari, d.mulai, d.jam_hitung, d.batas_kuning, d.batas_oper,
      d.status, d.respon_at, d.respon_cara, d.detik_respon, d.terlambat, l.nama, l.sumber, l.sales AS sales_kini
    FROM lead_distribusi d LEFT JOIN leads l ON l.lead_code = d.lead_code
    WHERE (d.mulai + interval '7 hours')::date = ${today}::date OR d.status = 'menunggu' ORDER BY d.id`;
  let rentang = await sql`SELECT d.sales, d.username, d.status, d.detik_respon, d.mode, d.project, d.lead_code
    FROM lead_distribusi d WHERE d.sales <> '' AND (d.mulai + interval '7 hours')::date >= ${awal}::date ORDER BY d.id`;
  let sales = await sql`SELECT name, username, projects, COALESCE(tersedia, true) AS tersedia, tersedia_sampai::text AS tersedia_sampai
    FROM users WHERE role = 'sales' AND active = true AND COALESCE(lead_agent, false) = false ORDER BY id`;
  if (user.role === 'sales') {
    hari = hari.filter(r => r.username === user.username); // sales hanya melihat penugasannya sendiri
    rentang = rentang.filter(r => r.username === user.username);
    sales = sales.filter(s => s.username === user.username);
  } else if (user.projects) {
    hari = hari.filter(r => !r.project || user.projects.includes(r.project));
    rentang = rentang.filter(r => !r.project || user.projects.includes(r.project));
  }
  const tick = (await sql`SELECT key, items FROM settings WHERE key IN ('distribusi_tick', 'distribusi_cron')`.catch(() => []));
  const t = k => tick.find(x => x.key === k)?.items?.t || null;
  const { kunci, ...cfgUmum } = cfg;
  let projects = [];
  try { const pr = (await sql`SELECT items FROM settings WHERE key = 'project'`)[0]?.items; projects = Array.isArray(pr) ? pr : []; } catch {}
  if (!projects.length) projects = ['BIO DISTRICT', 'PERMAI INDAH'];
  return Response.json({
    now: new Date().toISOString(), today, awal, periode, cfg: user.role === 'manager' ? cfg : cfgUmum, hari, rentang, sales, projects,
    tick: t('distribusi_tick'), cron: t('distribusi_cron'),
  });
}

export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  await siapkanDistribusi(sql);
  const b = await req.json().catch(() => ({}));
  // Sales menekan "Hubungi via WA" / "Sudah ditelepon" di pop-up / notifikasi HP → hitungan berhenti
  if (b.aksi === 'respon') {
    if (user.role !== 'sales') return Response.json({ ok: true });
    const cara = ['WA', 'Telepon'].includes(b.cara) ? b.cara : 'WA';
    const r = await tandaiRespon(sql, String(b.lead_code || ''), user.username, cara);
    return Response.json({ ok: true, ...(r || {}) });
  }
  // Ketersediaan: sales mengatur dirinya sendiri, Manager untuk semua sales
  if (b.aksi === 'tersedia') {
    const target = user.role === 'manager' && b.username ? String(b.username) : user.role === 'sales' ? user.username : null;
    if (!target) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
    const ya = b.tersedia !== false;
    const sampai = !ya && /^\d{4}-\d{2}-\d{2}$/.test(b.sampai || '') ? b.sampai : null;
    await sql`UPDATE users SET tersedia = ${ya}, tersedia_sampai = ${sampai} WHERE username = ${target} AND role = 'sales'`;
    return Response.json({ ok: true, tersedia: ya, sampai });
  }
  if (b.aksi === 'tes') { // notifikasi uji coba ke HP sendiri (cek bunyi & tampilan)
    const n = await kirimPush(sql, { usernames: [user.username] }, { judul: '📩 Lead baru — hubungi dalam 5 menit', isi: 'Contoh notifikasi lead (uji coba) · BIO DISTRICT · Instagram Ads', url: '/distribusi', tag: 'lead-TES', aksi: [{ action: 'buka', title: 'Buka CRM' }], data: { alarm: true } });
    return Response.json({ ok: true, terkirim: n });
  }
  if (user.role !== 'manager') return Response.json({ error: 'Khusus Manager' }, { status: 403 });
  if (b.aksi === 'setelan') {
    const izinkan = ['aktif', 'jam_mulai', 'jam_selesai', 'hari', 'batas_respon', 'batas_oper', 'maks_oper', 'maks_antrian', 'ulang_notif', 'tunggu_ai', 'pesan', 'tunggu_marcom', 'hanya_siap', 'kriteria'];
    const baru = Object.fromEntries(Object.entries(b.cfg || {}).filter(([k]) => izinkan.includes(k)));
    return Response.json({ ok: true, cfg: await simpanCfg(sql, baru) });
  }
  if (b.aksi === 'jalankan') return Response.json({ ok: true, ...(await jalankanDistribusi(sql, { paksa: true })) });
  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}
