import { db } from '@/lib/db';
import { siapkanAI, daftarSiapArsip } from '@/lib/ai';
import { kirimPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Dipanggil Vercel Cron setiap Jumat 08:00 UTC (= 15:00 WIB), lihat vercel.json.
// Pengingat ke tim Marcom: arsipkan chat di HP official + buka aplikasi WhatsApp Business (syarat sinkron coexistence: minimal tiap 14 hari).
// Tes manual: /api/cron/arsip?key=SETUP_KEY
export async function GET(req) {
  const url = new URL(req.url);
  const auth = req.headers.get('authorization') || '';
  const okCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const okVercelCron = !process.env.CRON_SECRET && req.headers.get('x-vercel-cron');
  const okManual = process.env.SETUP_KEY && url.searchParams.get('key') === process.env.SETUP_KEY;
  if (!okCron && !okVercelCron && !okManual) return Response.json({ error: 'Tidak diizinkan' }, { status: 401 });
  const sql = db();
  await siapkanAI(sql);
  const rows = await daftarSiapArsip(sql);
  const mk = (await sql`SELECT username FROM users WHERE role = 'markom' AND active = true`).map(x => x.username);
  const hasil = await kirimPush(sql, mk, {
    judul: rows.length ? `🗄 ${rows.length} chat siap diarsipkan di HP official` : '🗄 Jadwal rapikan HP official',
    isi: (rows.length ? 'Lihat daftarnya di Inbox WhatsApp → Siap diarsipkan. ' : '') + 'Buka juga aplikasi WhatsApp Business di HP official supaya sinkron dengan Harmoni One tetap aktif.',
    url: '/wa-inbox?arsip=1', tag: 'arsip-mingguan',
  });
  return Response.json({ ok: true, siap_diarsipkan: rows.length, push: hasil });
}
