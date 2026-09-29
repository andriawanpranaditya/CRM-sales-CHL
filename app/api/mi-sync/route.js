import crypto from 'crypto';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ===== Konektor Data Otomatis (fase 1: GA4 + Search Console via service account Google) =====
// Dipanggil oleh: (a) Vercel Cron harian, (b) tombol "Tarik Data Sekarang" di menu Analisa Marcom.
// Env yang dibutuhkan: GOOGLE_SA_EMAIL, GOOGLE_SA_KEY (private key, \n boleh literal), GA4_PROPERTY_ID, GSC_SITE_URL, CRON_SECRET.

function b64url(x) { return Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

async function googleToken(scopes) {
  const email = process.env.GOOGLE_SA_EMAIL;
  let key = process.env.GOOGLE_SA_KEY || '';
  key = key.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('GOOGLE_SA_EMAIL / GOOGLE_SA_KEY belum diisi di Vercel');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: email, scope: scopes.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + payload);
  const sig = signer.sign(key).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = header + '.' + payload + '.' + sig;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + encodeURIComponent(jwt),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Gagal auth Google: ' + (j.error_description || j.error || r.status));
  return j.access_token;
}

const d10 = d => d.toISOString().slice(0, 10);
function rentang(hari) {
  const b = new Date(); const a = new Date(); a.setDate(a.getDate() - hari);
  return [d10(a), d10(b)];
}

async function tarikGA4(sql) {
  const prop = process.env.GA4_PROPERTY_ID;
  if (!prop) return { sumber: 'GA4', status: 'dilewati', baris: 0, pesan: 'GA4_PROPERTY_ID belum diisi' };
  const token = await googleToken(['https://www.googleapis.com/auth/analytics.readonly']);
  const [d1, d2] = rentang(30);
  const body = (metrik) => JSON.stringify({
    dateRanges: [{ startDate: d1, endDate: d2 }],
    dimensions: [{ name: 'date' }, { name: 'sessionSourceMedium' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: metrik }],
    limit: 10000,
  });
  const panggil = async (metrik) => fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body(metrik),
  });
  let res = await panggil('keyEvents');
  let j = await res.json();
  if (j.error) { res = await panggil('conversions'); j = await res.json(); }
  if (j.error) throw new Error('GA4: ' + (j.error.message || 'error'));
  const rows = j.rows || [];
  for (const r of rows) {
    const tgl = r.dimensionValues[0].value; // YYYYMMDD
    const tglIso = tgl.slice(0, 4) + '-' + tgl.slice(4, 6) + '-' + tgl.slice(6, 8);
    const sm = (r.dimensionValues[1].value || '(not set)').slice(0, 190);
    const [sess, usr, kev] = r.metricValues.map(m => Number(m.value) || 0);
    await sql`INSERT INTO mi_ga4_daily (tgl, source_medium, sessions, users, key_events)
      VALUES (${tglIso}, ${sm}, ${sess}, ${usr}, ${kev})
      ON CONFLICT (tgl, source_medium) DO UPDATE SET sessions = EXCLUDED.sessions, users = EXCLUDED.users, key_events = EXCLUDED.key_events`;
  }
  return { sumber: 'GA4', status: 'sukses', baris: rows.length, pesan: `${d1} s.d. ${d2}` };
}

async function tarikGSC(sql) {
  const site = process.env.GSC_SITE_URL;
  if (!site) return { sumber: 'Search Console', status: 'dilewati', baris: 0, pesan: 'GSC_SITE_URL belum diisi' };
  const token = await googleToken(['https://www.googleapis.com/auth/webmasters.readonly']);
  const [d1raw, d2raw] = rentang(32);
  const d2 = d10(new Date(Date.now() - 2 * 86400000)); // data GSC terlambat ±2 hari
  const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: d1raw, endDate: d2, dimensions: ['date', 'query'], rowLimit: 5000 }),
  });
  const j = await r.json();
  if (j.error) throw new Error('GSC: ' + (j.error.message || 'error'));
  const rows = j.rows || [];
  for (const x of rows) {
    const [tgl, q] = x.keys;
    await sql`INSERT INTO mi_gsc_daily (tgl, query, clicks, impressions, position)
      VALUES (${tgl}, ${String(q).slice(0, 250)}, ${Number(x.clicks) || 0}, ${Number(x.impressions) || 0}, ${Number(x.position) || 0})
      ON CONFLICT (tgl, query) DO UPDATE SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, position = EXCLUDED.position`;
  }
  return { sumber: 'Search Console', status: 'sukses', baris: rows.length, pesan: `${d1raw} s.d. ${d2}` };
}

// Colokan konektor berikutnya — aktif otomatis saat env-nya diisi (tanpa ubah kode):
// META_TOKEN + META_AD_ACCOUNT  -> tarikMeta()   (menyusul saat token siap)
// GADS_DEVELOPER_TOKEN ...      -> tarikGoogleAds()
// TIKTOK_TOKEN ...              -> tarikTiktok()

export async function GET(req) {
  // Izin: Vercel Cron (Authorization: Bearer CRON_SECRET) ATAU user manager/markom yang login
  const auth = req.headers.get('authorization') || '';
  const dariCron = process.env.CRON_SECRET && auth === 'Bearer ' + process.env.CRON_SECRET;
  if (!dariCron) {
    const user = await getUser();
    if (!user || !['manager', 'markom'].includes(user.role)) {
      return Response.json({ error: 'Tidak berizin' }, { status: 401 });
    }
  }
  const sql = db();
  const hasil = [];
  for (const tarik of [tarikGA4, tarikGSC]) {
    try {
      const h = await tarik(sql);
      hasil.push(h);
      await sql`INSERT INTO mi_sync_log (sumber, status, baris, pesan) VALUES (${h.sumber}, ${h.status}, ${h.baris}, ${h.pesan})`;
    } catch (e) {
      const nama = tarik === tarikGA4 ? 'GA4' : 'Search Console';
      hasil.push({ sumber: nama, status: 'gagal', baris: 0, pesan: String(e.message || e).slice(0, 400) });
      try { await sql`INSERT INTO mi_sync_log (sumber, status, baris, pesan) VALUES (${nama}, 'gagal', 0, ${String(e.message || e).slice(0, 400)})`; } catch {}
    }
  }
  return Response.json({ ok: true, hasil, waktu: new Date().toISOString() });
}
