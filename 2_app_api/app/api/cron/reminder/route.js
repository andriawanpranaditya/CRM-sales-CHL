import { db } from '@/lib/db';
import nodemailer from 'nodemailer';
import { kirimPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Dipanggil otomatis oleh Vercel Cron tiap 02:00 UTC (= 09:00 WIB), lihat vercel.json.
// Tes manual: /api/cron/reminder?key=SETUP_KEY
export async function GET(req) {
  const url = new URL(req.url);
  const auth = req.headers.get('authorization') || '';
  const okCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const okVercelCron = !process.env.CRON_SECRET && req.headers.get('x-vercel-cron');
  const okManual = process.env.SETUP_KEY && url.searchParams.get('key') === process.env.SETUP_KEY;
  if (!okCron && !okVercelCron && !okManual) {
    return Response.json({ error: 'Tidak diizinkan' }, { status: 401 });
  }
  const sql = db();
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

  // Notifikasi push pagi ke HP tiap sales: jumlah FU wajib hari ini & yang terlambat (gratis, tanpa email)
  const pushHasil = [];
  try {
    const r = await sql`SELECT u.username, u.name,
        count(*) FILTER (WHERE l.next_fu::date = ${today}::date)::int AS hari_ini,
        count(*) FILTER (WHERE l.next_fu::date < ${today}::date)::int AS terlambat
      FROM leads l JOIN users u ON u.name = l.sales AND u.role = 'sales' AND u.active = true
      WHERE l.next_fu IS NOT NULL AND l.next_fu::date <= ${today}::date AND l.status NOT IN ('Closing', 'Lost', 'Drop', 'Booking')
      GROUP BY u.username, u.name`;
    for (const x of r) {
      const out = await kirimPush(sql, [x.username], { judul: `📅 ${x.hari_ini} FU hari ini` + (x.terlambat ? ` · ⚠️ ${x.terlambat} terlambat` : ''),
        isi: 'Buka Harmoni One untuk melihat jadwal follow up wajib Anda.', url: '/form?tab=fu', tag: 'fu-pagi' });
      pushHasil.push({ sales: x.name, ...out });
    }
  } catch (e) { pushHasil.push({ error: String(e.message || e) }); }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return Response.json({ ok: true, tanggal_wib: today, push: pushHasil, email: 'GMAIL_USER / GMAIL_APP_PASSWORD belum diisi — email tidak dikirim' });
  }

  const rows = await sql`
    SELECT l.lead_code, l.nama, l.wa, l.project, l.tipe, l.status, l.next_fu::text AS next_fu,
           l.sales, u.email AS sales_email
    FROM leads l
    JOIN users u ON u.name = l.sales AND u.role = 'sales' AND u.active = true
    WHERE l.next_fu IS NOT NULL
      AND u.email IS NOT NULL AND u.email <> ''
      AND l.next_fu::date <= ${today}
      AND l.status NOT IN ('Closing', 'Lost', 'Drop')
    ORDER BY l.next_fu`;

  const bySales = {};
  for (const r of rows) {
    (bySales[r.sales_email] ||= { name: r.sales, hariIni: [], terlambat: [] });
    (r.next_fu === today ? bySales[r.sales_email].hariIni : bySales[r.sales_email].terlambat).push(r);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  const dd = x => new Date(x).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const item = l => `<li style="margin-bottom:8px"><b>${l.nama}</b> <span style="color:#6B7A70">(${l.lead_code} &middot; ${l.status}${l.project ? ' &middot; ' + l.project : ''})</span><br/>
    WA: ${l.wa || '-'} &nbsp;|&nbsp; Jadwal FU: <b>${dd(l.next_fu)}</b></li>`;

  const hasil = [];
  for (const [email, g] of Object.entries(bySales)) {
    if (!g.hariIni.length && !g.terlambat.length) continue;
    const subject = `Pengingat Follow Up Hari Ini — ${g.hariIni.length} lead${g.terlambat.length ? ` (+${g.terlambat.length} terlambat)` : ''}`;
    const html = `
      <div style="font-family:Arial,sans-serif;color:#1C2B23;max-width:560px">
        <p style="letter-spacing:2px;color:#C9922E;font-weight:bold;margin:0">CIPTA HARMONI LESTARI</p>
        <h2 style="color:#23694A;margin:4px 0 16px">Pengingat Follow Up — ${dd(today)}</h2>
        <p>Halo <b>${g.name}</b>, berikut jadwal follow up Anda:</p>
        ${g.hariIni.length ? `<h3 style="color:#23694A">&#128197; Hari Ini (${g.hariIni.length})</h3><ul>${g.hariIni.map(item).join('')}</ul>` : ''}
        ${g.terlambat.length ? `<h3 style="color:#B3402F">&#9888;&#65039; Terlambat — segera hubungi (${g.terlambat.length})</h3><ul>${g.terlambat.map(item).join('')}</ul>` : ''}
        <p style="margin-top:16px">Setelah menghubungi, catat hasilnya di aplikasi:<br/>
        <a href="https://crm-sales-chl.vercel.app/form" style="color:#23694A"><b>crm-sales-chl.vercel.app</b></a></p>
        <p style="color:#6B7A70;font-size:12px">Email otomatis dari CRM Sales CHL, dikirim setiap pagi pukul 09.00 WIB.</p>
      </div>`;

    try {
      await transporter.sendMail({
        from: `"CRM Sales CHL" <${process.env.GMAIL_USER}>`,
        to: email, subject, html,
      });
      hasil.push({ sales: g.name, email, hariIni: g.hariIni.length, terlambat: g.terlambat.length, terkirim: true });
    } catch (e) {
      hasil.push({ sales: g.name, email, terkirim: false, error: String(e.message || e) });
    }
  }

  return Response.json({ ok: true, tanggal_wib: today, total_lead_jatuh_tempo: rows.length, email_dikirim: hasil, push: pushHasil });
}
