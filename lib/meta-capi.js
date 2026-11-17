// Umpan balik status lead ke Meta (Conversions API for Business Messaging).
// Lead dari iklan klik-ke-WhatsApp membawa kode klik (ctwa_clid) di pesan pertamanya; kode itu dipakai
// untuk mengabari Meta saat lead masuk (LeadSubmitted), dinilai layak (QualifiedLead), dan Booking (Purchase),
// sehingga algoritma iklan mencari orang yang mirip lead berkualitas — bukan sekadar yang mengirim chat.
// Env: WA_TOKEN / META_TOKEN (izin whatsapp_business_manage_events). META_CAPI=off untuk mematikan.
// Lead yang tidak datang dari iklan klik-ke-WA dilewati diam-diam. Tidak pernah melempar error ke pemanggil.

const GV = () => process.env.META_API_VERSION || 'v23.0';
const token = () => process.env.META_CAPI_TOKEN || process.env.WA_TOKEN || process.env.META_TOKEN || '';
const EVENT = ['LeadSubmitted', 'QualifiedLead', 'Purchase'];

let siap = false;
export async function siapkanCapi(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS meta_events (
    id serial PRIMARY KEY, lead_code text NOT NULL, event text NOT NULL, status text NOT NULL DEFAULT 'proses',
    pesan text, nilai numeric, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (lead_code, event))`;
  siap = true;
}

async function panggil(url, body) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: ac.signal });
    const j = await r.json().catch(() => ({}));
    if (j.error) throw new Error(j.error.error_user_msg || j.error.message || 'error Meta');
    return j;
  } finally { clearTimeout(t); }
}

// Dataset milik akun WhatsApp Business (dibuat sekali, lalu disimpan di settings)
async function datasetId(sql, waba) {
  const simpan = (await sql`SELECT items FROM settings WHERE key = 'meta_dataset'`.catch(() => []))[0]?.items || {};
  if (simpan[waba]) return simpan[waba];
  const j = await panggil(`https://graph.facebook.com/${GV()}/${encodeURIComponent(waba)}/dataset?access_token=${encodeURIComponent(token())}`);
  if (!j.id) throw new Error('Meta tidak mengembalikan dataset untuk akun WhatsApp ' + waba);
  const baru = JSON.stringify({ [waba]: String(j.id) });
  await sql`INSERT INTO settings (key, items) VALUES ('meta_dataset', ${baru}::jsonb)
    ON CONFLICT (key) DO UPDATE SET items = settings.items || ${baru}::jsonb`;
  return String(j.id);
}

// Kirim satu kejadian untuk satu lead — maksimal sekali per (lead, kejadian); kiriman gagal boleh diulang.
export async function kirimEventMeta(sql, lead_code, event, { nilai = null } = {}) {
  try {
    if (!lead_code || !EVENT.includes(event) || (process.env.META_CAPI || '').toLowerCase() === 'off' || !token()) return { dilewati: true };
    // Kode klik iklan terbaru milik lead ini
    const k = (await sql`SELECT referral->>'ctwa_clid' AS clid, project FROM wa_inbox
      WHERE lead_code = ${lead_code} AND COALESCE(referral->>'ctwa_clid', '') <> '' ORDER BY created_at DESC LIMIT 1`.catch(() => []))[0];
    if (!k?.clid) return { dilewati: true }; // bukan lead dari iklan klik-ke-WA
    await siapkanCapi(sql);
    // Meta tidak membuang kiriman ganda — dicatat dulu, hanya lanjut bila belum pernah terkirim
    const kunci = await sql`INSERT INTO meta_events (lead_code, event, status, nilai) VALUES (${lead_code}, ${event}, 'proses', ${nilai})
      ON CONFLICT (lead_code, event) DO UPDATE SET status = 'proses', nilai = EXCLUDED.nilai, created_at = now()
      WHERE meta_events.status = 'gagal' RETURNING id`;
    if (!kunci.length) return { dilewati: true };
    const catat = (status, pesan) => sql`UPDATE meta_events SET status = ${status}, pesan = ${String(pesan || '').slice(0, 300)} WHERE id = ${kunci[0].id}`.catch(() => {});
    try {
      const waba = ((await sql`SELECT items FROM settings WHERE key = 'wa_waba'`.catch(() => []))[0]?.items || {})[k.project];
      if (!waba) throw new Error('ID akun WhatsApp Business project ' + (k.project || '-') + ' belum tercatat');
      const ds = await datasetId(sql, waba);
      const ev = { event_name: event, event_time: Math.floor(Date.now() / 1000), action_source: 'business_messaging', messaging_channel: 'whatsapp',
        user_data: { whatsapp_business_account_id: String(waba), ctwa_clid: k.clid } };
      if (event === 'Purchase') ev.custom_data = { currency: 'IDR', value: Math.round(Number(nilai) || 0) };
      await panggil(`https://graph.facebook.com/${GV()}/${ds}/events?access_token=${encodeURIComponent(token())}`, { data: [ev], partner_agent: 'crm-chl' });
      await catat('terkirim', '');
      return { ok: true };
    } catch (e) {
      await catat('gagal', e.name === 'AbortError' ? 'Meta tidak merespon dalam 8 detik' : (e.message || e));
      return { gagal: true };
    }
  } catch (e) { console.error('meta capi', e); return { gagal: true }; }
}

// Ringkasan untuk halaman Analisa Marcom
export async function ringkasCapi(sql) {
  try {
    await siapkanCapi(sql);
    const [jml, galat] = await Promise.all([
      sql`SELECT event, status, count(*)::int AS n, max(created_at) AS terakhir FROM meta_events GROUP BY 1, 2`,
      sql`SELECT event, pesan, created_at FROM meta_events WHERE status = 'gagal' ORDER BY created_at DESC LIMIT 1`,
    ]);
    return { jml, galat: galat[0] || null, aktif: (process.env.META_CAPI || '').toLowerCase() !== 'off' && !!token() };
  } catch { return { jml: [], galat: null, aktif: false }; }
}
