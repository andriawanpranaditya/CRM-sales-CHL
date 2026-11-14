import { db } from '@/lib/db';
import { ambilTarget, hitungSales } from '@/lib/target-sales';
import { kirimPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

// Vercel Cron: 09.00, 13.00 & 16.00 WIB (Senin–Sabtu) — pengingat ke HP sales lewat Web Push (lihat vercel.json)
// Tes manual: /api/cron/pengingat-sales?key=SETUP_KEY&slot=pagi
export async function GET(req) {
  const url = new URL(req.url);
  const auth = req.headers.get('authorization') || '';
  const ok = (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (!process.env.CRON_SECRET && req.headers.get('x-vercel-cron'))
    || (process.env.SETUP_KEY && url.searchParams.get('key') === process.env.SETUP_KEY);
  if (!ok) return Response.json({ error: 'Tidak diizinkan' }, { status: 401 });
  const jam = new Date(Date.now() + 7 * 3600000).getUTCHours();
  const slot = url.searchParams.get('slot') || (jam < 12 ? 'pagi' : jam < 15 ? 'siang' : 'sore');
  const sql = db();
  const target = await ambilTarget(sql);
  const akun = await sql`SELECT name, username, projects FROM users WHERE role = 'sales' AND active = true AND COALESCE(lead_agent, false) = false ORDER BY name`;
  const JUDUL = { pagi: '☀️ Pagi — waktunya kerja', siang: '🕐 Siang — cek progres', sore: '🌇 Rekap hari ini' };
  let terkirim = 0;
  for (const a of akun) {
    try {
      const d = await hitungSales(sql, { nama: a.name, username: a.username, projects: a.projects }, target);
      const isi = slot === 'pagi' ? d.pesan.pagi : slot === 'siang' ? d.pesan.siang : d.pesan.sore.isi;
      terkirim += await kirimPush(sql, { usernames: [a.username] }, { judul: JUDUL[slot], isi, url: '/beranda', tag: 'pengingat-' + slot });
    } catch (e) { console.error('pengingat sales', a.name, e); }
  }
  return Response.json({ ok: true, slot, sales: akun.length, terkirim });
}
