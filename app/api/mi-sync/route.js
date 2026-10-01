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
  // Simpan sekaligus per batch (bukan satu-satu) agar tidak timeout
  const m = new Map();
  for (const r of rows) {
    const tgl = r.dimensionValues[0].value; // YYYYMMDD
    const tglIso = tgl.slice(0, 4) + '-' + tgl.slice(4, 6) + '-' + tgl.slice(6, 8);
    const sm = (r.dimensionValues[1].value || '(not set)').slice(0, 190);
    const [sess, usr, kev] = r.metricValues.map(v => Number(v.value) || 0);
    m.set(tglIso + '|' + sm, [tglIso, sm, sess, usr, kev]);
  }
  const all = [...m.values()];
  for (let i = 0; i < all.length; i += 1000) {
    const b = all.slice(i, i + 1000);
    await sql`INSERT INTO mi_ga4_daily (tgl, source_medium, sessions, users, key_events)
      SELECT * FROM unnest(${b.map(x => x[0])}::date[], ${b.map(x => x[1])}::text[], ${b.map(x => x[2])}::int[], ${b.map(x => x[3])}::int[], ${b.map(x => x[4])}::int[])
      ON CONFLICT (tgl, source_medium) DO UPDATE SET sessions = EXCLUDED.sessions, users = EXCLUDED.users, key_events = EXCLUDED.key_events`;
  }
  return { sumber: 'GA4', status: 'sukses', baris: all.length, pesan: `${d1} s.d. ${d2}` };
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
  const m = new Map();
  for (const x of rows) {
    const [tgl, q] = x.keys;
    const qq = String(q).slice(0, 250);
    m.set(tgl + '|' + qq, [tgl, qq, Number(x.clicks) || 0, Number(x.impressions) || 0, Number(x.position) || 0]);
  }
  const all = [...m.values()];
  for (let i = 0; i < all.length; i += 1000) {
    const b = all.slice(i, i + 1000);
    await sql`INSERT INTO mi_gsc_daily (tgl, query, clicks, impressions, position)
      SELECT * FROM unnest(${b.map(x => x[0])}::date[], ${b.map(x => x[1])}::text[], ${b.map(x => x[2])}::int[], ${b.map(x => x[3])}::int[], ${b.map(x => x[4])}::numeric[])
      ON CONFLICT (tgl, query) DO UPDATE SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, position = EXCLUDED.position`;
  }
  return { sumber: 'Search Console', status: 'sukses', baris: all.length, pesan: `${d1raw} s.d. ${d2}` };
}

// ===== Instagram (Graph API via token System User Meta) =====
// Env: META_TOKEN (wajib), IG_USER_ID (opsional — dicari otomatis dari Page), IG_PROJECT (default BIO DISTRICT)
const GV = () => process.env.META_API_VERSION || 'v23.0';
async function graph(path) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`https://graph.facebook.com/${GV()}/${path}${sep}access_token=${encodeURIComponent(process.env.META_TOKEN)}`);
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message || 'Graph error'); e.code = j.error.code; throw e; }
  return j;
}
const kodeIG = u => { const m = String(u || '').match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/); return m ? m[2] : null; };
const FORMAT_IG = { REELS: 'Reels / Short Video', VIDEO: 'Reels / Short Video', CAROUSEL_ALBUM: 'Carousel', IMAGE: 'Single Post' };
async function insightMedia(id) {
  // Metrik tiap tipe media berbeda — coba dari yang lengkap, turun bila ditolak
  for (const set of ['reach,saved,shares', 'reach,saved', 'reach']) {
    try {
      const j = await graph(`${id}/insights?metric=${set}`);
      const out = {};
      (j.data || []).forEach(d => { out[d.name] = Number(d.values?.[0]?.value ?? d.total_value?.value ?? 0) || 0; });
      return out;
    } catch {}
  }
  return {};
}
async function tarikInstagram(sql) {
  if (!process.env.META_TOKEN) return { sumber: 'Instagram', status: 'dilewati', baris: 0, pesan: 'META_TOKEN belum diisi' };
  let igId = process.env.IG_USER_ID;
  if (!igId) {
    const pages = await graph('me/accounts?fields=name,instagram_business_account&limit=50');
    const pg = (pages.data || []).find(p => p.instagram_business_account);
    if (!pg) throw new Error('Tidak ada Facebook Page dengan akun Instagram terhubung pada token ini — cek aset Page & IG di System User');
    igId = pg.instagram_business_account.id;
  }
  const proj = process.env.IG_PROJECT || 'BIO DISTRICT';
  // Ambil postingan terbaru (maks 60, ±120 hari)
  let media = [], next = `${igId}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=30`;
  const batas = Date.now() - 120 * 86400000;
  while (next && media.length < 60) {
    const j = await graph(next);
    media = media.concat(j.data || []);
    const after = j.paging?.cursors?.after;
    const tua = (j.data || []).some(x => new Date(x.timestamp).getTime() < batas);
    next = (j.paging?.next && after && !tua) ? `${igId}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=30&after=${after}` : null;
  }
  media = media.filter(x => new Date(x.timestamp).getTime() >= batas);
  // Insights paralel per 8
  const ins = {};
  for (let i = 0; i < media.length; i += 8) {
    const part = media.slice(i, i + 8);
    const hasil = await Promise.all(part.map(x => insightMedia(x.id)));
    part.forEach((x, k) => { ins[x.id] = hasil[k]; });
  }
  const ada = await sql`SELECT id, tgl, format, link FROM mi_contents WHERE platform = 'Instagram'`;
  const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  let baru = 0, cocok = 0;
  for (const x of media) {
    const wib = new Date(new Date(x.timestamp).getTime() + 7 * 3600000);
    const tgl = wib.toISOString().slice(0, 10), jam = wib.toISOString().slice(11, 16);
    const format = FORMAT_IG[x.media_product_type === 'REELS' ? 'REELS' : x.media_type] || 'Lainnya';
    const kode = kodeIG(x.permalink);
    // 1) cocokkan via link; 2) cadangan: tanggal & format sama, link kosong, kandidat tunggal
    let row = ada.find(c => kodeIG(c.link) && kodeIG(c.link) === kode);
    if (!row) {
      const kand = ada.filter(c => !kodeIG(c.link) && (c.tgl instanceof Date ? c.tgl.toISOString() : String(c.tgl)).slice(0, 10) === tgl && c.format === format);
      if (kand.length === 1) row = kand[0];
    }
    let cid;
    if (row) {
      cid = row.id; cocok++;
      await sql`UPDATE mi_contents SET tgl = ${tgl}, jam = ${jam}, format = ${format}, link = ${x.permalink} WHERE id = ${cid}`;
      row.link = x.permalink;
    } else {
      const baris1 = String(x.caption || '').split('\n').map(t => t.trim()).find(Boolean) || '';
      const hook = format === 'Reels / Short Video' ? '' : baris1.slice(0, 200);
      const r = await sql`INSERT INTO mi_contents (tgl, platform, project, format, topik, hook, jam, durasi, link, created_by)
        VALUES (${tgl}, 'Instagram', ${proj}, ${format}, '', ${hook}, ${jam}, '', ${x.permalink}, 'auto-instagram') RETURNING id`;
      cid = r[0].id; baru++;
      ada.push({ id: cid, tgl, format, link: x.permalink });
    }
    // Metrik hari ini — view & klik bio (tidak tersedia per postingan di API) dipertahankan dari angka terakhir
    const lama = (await sql`SELECT view3, view_full, klik_bio FROM mi_content_metrics WHERE content_id = ${cid} ORDER BY tgl DESC LIMIT 1`)[0] || {};
    const it = ins[x.id] || {};
    await sql`INSERT INTO mi_content_metrics (content_id, tgl, reach, like_n, komentar, share_n, save_n, view3, view_full, klik_bio)
      VALUES (${cid}, ${hariIni}, ${it.reach || 0}, ${Number(x.like_count) || 0}, ${Number(x.comments_count) || 0}, ${it.shares || 0}, ${it.saved || 0},
              ${Number(lama.view3) || 0}, ${Number(lama.view_full) || 0}, ${Number(lama.klik_bio) || 0})
      ON CONFLICT (content_id, tgl) DO UPDATE SET reach = EXCLUDED.reach, like_n = EXCLUDED.like_n, komentar = EXCLUDED.komentar,
        share_n = EXCLUDED.share_n, save_n = EXCLUDED.save_n`;
  }
  return { sumber: 'Instagram', status: 'sukses', baris: media.length, pesan: `${media.length} postingan · ${cocok} dicocokkan · ${baru} konten baru` };
}

// Colokan konektor berikutnya — aktif otomatis saat env-nya diisi (tanpa ubah kode):
// META_TOKEN (sama dgn Instagram) + META_AD_ACCOUNT -> tarikMetaAds() (menyusul)
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
  const jalankan = async (tarik, nama) => {
    try {
      const h = await tarik(sql);
      await sql`INSERT INTO mi_sync_log (sumber, status, baris, pesan) VALUES (${h.sumber}, ${h.status}, ${h.baris}, ${h.pesan})`;
      return h;
    } catch (e) {
      const pesan = String(e.message || e).slice(0, 400);
      try { await sql`INSERT INTO mi_sync_log (sumber, status, baris, pesan) VALUES (${nama}, 'gagal', 0, ${pesan})`; } catch {}
      return { sumber: nama, status: 'gagal', baris: 0, pesan };
    }
  };
  const hasil = await Promise.all([jalankan(tarikGA4, 'GA4'), jalankan(tarikGSC, 'Search Console'), jalankan(tarikInstagram, 'Instagram')]);
  return Response.json({ ok: true, hasil, waktu: new Date().toISOString() });
}
