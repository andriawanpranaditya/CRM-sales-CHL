import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanPush, kunciVapid, kirimPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

// GET: kunci publik VAPID · POST {subscription}: daftarkan perangkat · POST {tes:true}: kirim notifikasi uji · DELETE {endpoint}
export async function GET() {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  return Response.json({ publicKey: (await kunciVapid(sql)).publicKey });
}
export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db(); await siapkanPush(sql);
  const b = await req.json().catch(() => ({}));
  if (b.tes) { const n = await kirimPush(sql, { usernames: [user.username] }, { judul: 'CRM Sales CHL', isi: 'Notifikasi HP sudah aktif ✅', url: '/beranda', tag: 'tes' }); return Response.json({ ok: true, terkirim: n }); }
  const s = b.subscription;
  if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return Response.json({ error: 'Data langganan tidak lengkap' }, { status: 400 });
  await sql`INSERT INTO push_sub (username, role, endpoint, p256dh, auth, ua) VALUES (${user.username}, ${user.role}, ${s.endpoint}, ${s.keys.p256dh}, ${s.keys.auth}, ${String(req.headers.get('user-agent') || '').slice(0, 200)})
    ON CONFLICT (endpoint) DO UPDATE SET username = EXCLUDED.username, role = EXCLUDED.role, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`;
  return Response.json({ ok: true });
}
export async function DELETE(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db(); await siapkanPush(sql);
  const b = await req.json().catch(() => ({}));
  await sql`DELETE FROM push_sub WHERE endpoint = ${b.endpoint || ''} AND username = ${user.username}`;
  return Response.json({ ok: true });
}
