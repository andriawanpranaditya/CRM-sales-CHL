import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanPush, kirimPush } from '@/lib/push';
import { perangkatDari } from '@/lib/log';

export const dynamic = 'force-dynamic';

// GET: kunci publik untuk mendaftarkan HP + jumlah perangkat terdaftar milik akun ini
export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const k = await siapkanPush(sql);
  const n = await sql`SELECT count(*)::int AS n FROM push_langganan WHERE username = ${user.username}`;
  return Response.json({ publicKey: k.publicKey, perangkat: n[0].n });
}

// POST { subscription } : daftarkan HP/peramban ini · POST { aksi: 'tes' } : kirim notifikasi uji ke perangkat sendiri
export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  await siapkanPush(sql);
  const b = await req.json().catch(() => ({}));
  if (b.aksi === 'tes') {
    const r = await kirimPush(sql, [user.username], { judul: '🔔 Notifikasi aktif', isi: 'HP ini akan menerima pemberitahuan Harmoni One, termasuk balasan konsumen di WhatsApp.', url: '/beranda', tag: 'tes' });
    return Response.json({ ok: true, ...r });
  }
  const s = b.subscription;
  if (!s || !s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return Response.json({ error: 'Data langganan notifikasi tidak lengkap' }, { status: 400 });
  const alat = perangkatDari(req.headers.get('user-agent') || '', !!b.pwa);
  await sql`INSERT INTO push_langganan (username, endpoint, p256dh, auth, perangkat) VALUES (${user.username}, ${s.endpoint}, ${s.keys.p256dh}, ${s.keys.auth}, ${alat})
    ON CONFLICT (endpoint) DO UPDATE SET username = EXCLUDED.username, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, perangkat = EXCLUDED.perangkat`;
  return Response.json({ ok: true });
}

// DELETE { endpoint } : matikan notifikasi di perangkat ini
export async function DELETE(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  await siapkanPush(sql);
  const b = await req.json().catch(() => ({}));
  if (b.endpoint) await sql`DELETE FROM push_langganan WHERE endpoint = ${b.endpoint} AND username = ${user.username}`;
  return Response.json({ ok: true });
}
