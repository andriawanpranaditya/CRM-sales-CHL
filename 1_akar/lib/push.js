// ===== Notifikasi push ke HP (Web Push) =====
// Gratis: memakai layanan push bawaan Google (Android/Chrome) & Apple (iPhone, aplikasi dipasang ke Layar Utama, iOS 16.4+).
// Kunci pengirim (VAPID) dibuat otomatis sekali lalu disimpan di database — tidak perlu environment variable.
// Bila ingin memakai kunci sendiri: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
import webpush from 'web-push';

let siap = false, kunci = null;
export async function siapkanPush(sql) {
  if (siap && kunci) return kunci;
  await sql`CREATE TABLE IF NOT EXISTS push_langganan (
    id serial PRIMARY KEY, username text NOT NULL, endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL,
    perangkat text, created_at timestamptz NOT NULL DEFAULT now(), terakhir_ok timestamptz)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_push_user ON push_langganan (username)`;
  await sql`CREATE TABLE IF NOT EXISTS app_flags (key text PRIMARY KEY, nilai text, created_at timestamptz NOT NULL DEFAULT now())`;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    kunci = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const r = await sql`SELECT nilai FROM app_flags WHERE key = 'vapid'`;
    if (r.length) kunci = JSON.parse(r[0].nilai);
    else {
      const k = webpush.generateVAPIDKeys();
      await sql`INSERT INTO app_flags (key, nilai) VALUES ('vapid', ${JSON.stringify(k)}) ON CONFLICT (key) DO NOTHING`;
      kunci = JSON.parse((await sql`SELECT nilai FROM app_flags WHERE key = 'vapid'`)[0].nilai); // ambil yang tersimpan (aman bila dua instance bersamaan)
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@ciptaharmoni.com', kunci.publicKey, kunci.privateKey);
  siap = true;
  return kunci;
}

// Kirim notifikasi ke semua perangkat milik username tertentu.
// payload: { judul, isi, url, tag } — url dibuka saat notifikasi diketuk; tag mengganti notifikasi sejenis (tidak menumpuk)
export async function kirimPush(sql, usernames, payload) {
  const daftar = [...new Set((usernames || []).filter(Boolean))];
  if (!daftar.length) return { terkirim: 0 };
  try { await siapkanPush(sql); } catch (e) { console.error('push siap', e); return { terkirim: 0 }; }
  const subs = await sql`SELECT id, endpoint, p256dh, auth FROM push_langganan WHERE username = ANY(${daftar}::text[])`;
  const data = JSON.stringify({ judul: payload.judul || 'Harmoni One', isi: payload.isi || '', url: payload.url || '/beranda', tag: payload.tag || '' });
  let terkirim = 0;
  await Promise.allSettled(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, { TTL: 60 * 60 * 24, urgency: 'high', timeout: 8000 });
      terkirim++;
      await sql`UPDATE push_langganan SET terakhir_ok = now() WHERE id = ${s.id}`;
    } catch (e) {
      // 404/410 = langganan sudah tidak berlaku (aplikasi dihapus / izin dicabut) → buang
      if (e && (e.statusCode === 404 || e.statusCode === 410)) { try { await sql`DELETE FROM push_langganan WHERE id = ${s.id}`; } catch {} }
      else console.error('push', e && (e.statusCode || e.message));
    }
  }));
  return { terkirim, perangkat: subs.length };
}

// Username dari nama tampilan (kolom leads.sales berisi nama, bukan username)
export async function usernameDariNama(sql, nama) {
  if (!nama) return [];
  const r = await sql`SELECT username FROM users WHERE name = ${nama} AND active = true`;
  return r.map(x => x.username);
}
