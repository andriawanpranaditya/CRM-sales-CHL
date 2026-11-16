import { db } from '@/lib/db';
import { ambilCfg, jalankanDistribusi, siapkanDistribusi } from '@/lib/distribusi-lead';

export const dynamic = 'force-dynamic';

// Dipanggil TIAP MENIT oleh cron-job.org (gratis): https://crm-sales-chl.vercel.app/api/cron/distribusi-lead?key=KUNCI
// KUNCI terlihat di menu Tim Sales → Distribusi Lead (khusus Manager). Tugas: bagi lead baru, ulang notifikasi, alihkan lead yang tidak direspon.
export async function GET(req) {
  const url = new URL(req.url);
  const sql = db();
  await siapkanDistribusi(sql);
  const cfg = await ambilCfg(sql);
  const key = url.searchParams.get('key') || '';
  const auth = req.headers.get('authorization') || '';
  const ok = (key && key === cfg.kunci) || (process.env.SETUP_KEY && key === process.env.SETUP_KEY)
    || (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`);
  if (!ok) return Response.json({ error: 'Kunci salah' }, { status: 401 });
  try {
    await sql`INSERT INTO settings (key, items) VALUES ('distribusi_cron', ${JSON.stringify({ t: new Date().toISOString() })}::jsonb)
      ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
    const h = await jalankanDistribusi(sql);
    return Response.json({ ok: true, ...h });
  } catch (e) { console.error('cron distribusi', e); return Response.json({ error: String(e?.message || e) }, { status: 500 }); }
}
