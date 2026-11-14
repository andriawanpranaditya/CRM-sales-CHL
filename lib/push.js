// Web Push (gratis, lewat layanan push bawaan browser). Kunci VAPID dibuat otomatis sekali & disimpan di settings.
import webpush from 'web-push';

let siap = false, vapid = null;
export async function siapkanPush(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS push_sub (id serial PRIMARY KEY, username text NOT NULL, role text, endpoint text UNIQUE NOT NULL,
    p256dh text NOT NULL, auth text NOT NULL, ua text, created_at timestamptz NOT NULL DEFAULT now(), last_ok timestamptz)`;
  siap = true;
}
export async function kunciVapid(sql) {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return (vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  const r = await sql`SELECT items FROM settings WHERE key = 'web_push_vapid'`.catch(() => []);
  if (r[0]?.items?.publicKey) return (vapid = r[0].items);
  const k = webpush.generateVAPIDKeys();
  await sql`INSERT INTO settings (key, items) VALUES ('web_push_vapid', ${JSON.stringify(k)}) ON CONFLICT (key) DO NOTHING`;
  const ulang = await sql`SELECT items FROM settings WHERE key = 'web_push_vapid'`;
  return (vapid = ulang[0].items);
}
// Kirim ke semua perangkat milik user tertentu (by username) atau semua user dengan peran tertentu
export async function kirimPush(sql, { usernames = null, role = null }, { judul, isi, url = '/', tag }) {
  try {
    await siapkanPush(sql);
    const k = await kunciVapid(sql);
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@ciptaharmoni.com', k.publicKey, k.privateKey);
    const subs = usernames ? await sql`SELECT * FROM push_sub WHERE username = ANY(${usernames}::text[])`
      : role ? await sql`SELECT s.* FROM push_sub s JOIN users u ON u.username = s.username WHERE u.role = ${role} AND u.active = true` : [];
    const payload = JSON.stringify({ judul, isi, url, tag: tag || undefined });
    let ok = 0;
    await Promise.all(subs.map(async s => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 }); ok++;
        await sql`UPDATE push_sub SET last_ok = now() WHERE id = ${s.id}`.catch(() => {}); }
      catch (e) { if ([404, 410].includes(e?.statusCode)) await sql`DELETE FROM push_sub WHERE id = ${s.id}`.catch(() => {}); else console.error('push', e?.statusCode, e?.body); }
    }));
    return ok;
  } catch (e) { console.error('kirimPush', e); return 0; }
}
