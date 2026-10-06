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
  // GA4 memproses ulang data 1–2 hari terakhir (mis. "(data not available)" dipindah ke sumber aslinya):
  // ganti seluruh jendela tarikan agar baris lama tidak tertinggal & terhitung dobel
  if (all.length) await sql`DELETE FROM mi_ga4_daily WHERE tgl BETWEEN ${d1}::date AND ${d2}::date`;
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
  if (all.length) await sql`DELETE FROM mi_gsc_daily WHERE tgl BETWEEN ${d1raw}::date AND ${d2}::date`;
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
  let out = {};
  for (const set of ['reach,saved,shares,views', 'reach,saved,shares', 'reach,saved', 'reach']) {
    try {
      const j = await graph(`${id}/insights?metric=${set}`);
      (j.data || []).forEach(d => { out[d.name] = Number(d.values?.[0]?.value ?? d.total_value?.value ?? 0) || 0; });
      break;
    } catch {}
  }
  // Klik link bio dari aktivitas profil yang dipicu postingan (tidak semua tipe media mendukung)
  try {
    const j = await graph(`${id}/insights?metric=profile_activity&breakdown=action_type`);
    const hasil = j.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
    const bio = hasil.find(r => String(r.dimension_values?.[0] || '').toUpperCase() === 'BIO_LINK_CLICKED');
    if (bio) out.klik_bio = Number(bio.value) || 0;
  } catch {}
  // Rata-rata waktu tonton Reels (detik) — hanya tersedia untuk Reels
  try {
    const j = await graph(`${id}/insights?metric=ig_reels_avg_watch_time`);
    const ms = Number(j.data?.[0]?.values?.[0]?.value ?? j.data?.[0]?.total_value?.value);
    if (ms) out.avg_watch = Math.round(ms / 100) / 10;
  } catch {}
  return out;
}
// Demografi follower (usia, gender, kota) — butuh minimal 100 follower
async function tarikDemografi(sql, igId) {
  await sql`CREATE TABLE IF NOT EXISTS mi_ig_demografi (tgl date NOT NULL, dim text NOT NULL, kunci text NOT NULL, nilai integer, PRIMARY KEY (tgl, dim, kunci))`;
  const hari = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  let n = 0;
  for (const [dim, bd] of [['usia', 'age'], ['gender', 'gender'], ['kota', 'city']]) {
    let hasil = [];
    for (const extra of ['', '&timeframe=this_month', '&timeframe=last_30_days']) {
      try {
        const j = await graph(`${igId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${bd}${extra}`);
        hasil = j.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
        if (hasil.length) break;
      } catch {}
    }
    for (const r of hasil.slice(0, 50)) {
      const k = String(r.dimension_values?.[0] || '-');
      await sql`INSERT INTO mi_ig_demografi (tgl, dim, kunci, nilai) VALUES (${hari}, ${dim}, ${k}, ${Number(r.value) || 0})
        ON CONFLICT (tgl, dim, kunci) DO UPDATE SET nilai = EXCLUDED.nilai`;
      n++;
    }
  }
  return n;
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
  // Jumlah follower harian (dasar reach rate) — gagal di sini tidak menghentikan tarikan konten
  let follower = null;
  try {
    const akun = await graph(`${igId}?fields=followers_count,username`);
    follower = Number(akun.followers_count) || null;
    await sql`CREATE TABLE IF NOT EXISTS mi_ig_akun (tgl date PRIMARY KEY, ig_id text, username text, followers integer)`;
    if (follower) await sql`INSERT INTO mi_ig_akun (tgl, ig_id, username, followers)
      VALUES ((now() + interval '7 hours')::date, ${igId}, ${akun.username || ''}, ${follower})
      ON CONFLICT (tgl) DO UPDATE SET followers = EXCLUDED.followers, username = EXCLUDED.username`;
  } catch (e) { console.error('ig followers', e); }
  try { await sql`ALTER TABLE mi_content_metrics ADD COLUMN IF NOT EXISTS avg_watch numeric`; } catch {}
  let nDemo = 0;
  try { nDemo = await tarikDemografi(sql, igId); } catch (e) { console.error('ig demografi', e); }
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
      const cap1 = String(x.caption || '').split('\n').map(t => t.trim()).find(Boolean) || '';
      const hookIsi = format === 'Reels / Short Video' ? '' : cap1.slice(0, 200);
      await sql`UPDATE mi_contents SET tgl = ${tgl}, jam = ${jam}, format = ${format}, link = ${x.permalink},
        hook = CASE WHEN COALESCE(hook, '') = '' THEN ${hookIsi} ELSE hook END WHERE id = ${cid}`;
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
    await sql`INSERT INTO mi_content_metrics (content_id, tgl, reach, like_n, komentar, share_n, save_n, view3, view_full, klik_bio, avg_watch)
      VALUES (${cid}, ${hariIni}, ${it.reach || 0}, ${Number(x.like_count) || 0}, ${Number(x.comments_count) || 0}, ${it.shares || 0}, ${it.saved || 0},
              ${it.views !== undefined ? it.views : (Number(lama.view3) || 0)}, ${Number(lama.view_full) || 0},
              ${it.klik_bio !== undefined ? it.klik_bio : (Number(lama.klik_bio) || 0)}, ${it.avg_watch ?? null})
      ON CONFLICT (content_id, tgl) DO UPDATE SET reach = EXCLUDED.reach, like_n = EXCLUDED.like_n, komentar = EXCLUDED.komentar,
        share_n = EXCLUDED.share_n, save_n = EXCLUDED.save_n, view3 = EXCLUDED.view3, klik_bio = EXCLUDED.klik_bio,
        avg_watch = COALESCE(EXCLUDED.avg_watch, mi_content_metrics.avg_watch)`;
  }
  return { sumber: 'Instagram', status: 'sukses', baris: media.length, pesan: `${media.length} postingan · ${cocok} dicocokkan · ${baru} konten baru` + (follower ? ` · ${follower.toLocaleString('id-ID')} follower` : '') + (nDemo ? ` · demografi ${nDemo} baris` : '') };
}

// ===== Meta Ads (Marketing API, token & System User yang sama dengan Instagram) =====
// Env: META_TOKEN (wajib), META_AD_ACCOUNT (opsional, dipisah koma — bila kosong dicari otomatis), IG_PROJECT (project campaign baru)
let kolomAdsSiap = false;
async function siapkanKolomAds(sql) {
  if (kolomAdsSiap) return;
  try { await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS sumber text`; } catch {}
  try { await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS ext_key text`; } catch {}
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_mi_ads_ext ON mi_ads (ext_key)`; } catch {}
  try { await sql`ALTER TABLE mi_campaigns ADD COLUMN IF NOT EXISTS sumber text`; } catch {}
  try { await sql`CREATE TABLE IF NOT EXISTS mi_ads_breakdown (
    tgl date NOT NULL, campaign text NOT NULL, dim text NOT NULL, k1 text NOT NULL, k2 text NOT NULL DEFAULT '',
    spend numeric DEFAULT 0, impresi integer DEFAULT 0, klik integer DEFAULT 0, hasil integer DEFAULT 0,
    PRIMARY KEY (tgl, campaign, dim, k1, k2))`; } catch {}
  try { await sql`CREATE TABLE IF NOT EXISTS mi_adset_targeting (
    adset_id text PRIMARY KEY, campaign text, nama text, status text, usia_min integer, usia_max integer, gender text,
    lokasi text, minat text, penempatan text, advantage boolean, updated_at timestamptz NOT NULL DEFAULT now())`; } catch {}
  kolomAdsSiap = true;
}
async function graphUrl(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'Graph error');
  return j;
}
// Objective Meta -> tujuan campaign di CRM
function tujuanMeta(o) {
  const x = String(o || '').toUpperCase();
  if (/LEAD|MESSAGE|SALES|CONVERSION/.test(x)) return 'leads';
  if (/TRAFFIC|LINK_CLICK/.test(x)) return 'traffic';
  if (/ENGAGEMENT|POST_ENGAGEMENT|PAGE_LIKES/.test(x)) return 'engagement';
  if (/AWARENESS|REACH|VIDEO/.test(x)) return 'awareness';
  return 'leads';
}
const HASIL_META = ['onsite_conversion.messaging_conversation_started_7d', 'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'contact_total'];
function hasilMeta(actions) {
  const a = actions || [];
  for (const t of HASIL_META) { const f = a.find(x => x.action_type === t); if (f) return Math.round(Number(f.value) || 0); }
  return 0;
}
// Rincian hasil iklan per usia–gender, wilayah, dan penempatan (harian per campaign) — ganti jendela tarikan agar tidak menumpuk
async function tarikBreakdown(sql, akun, since, until, peta) {
  const DIM = [['usia_gender', 'age,gender', r => [r.age || '-', r.gender || '-']], ['wilayah', 'region', r => [r.region || '-', '']],
               ['penempatan', 'publisher_platform,platform_position', r => [r.publisher_platform || '-', r.platform_position || '']]];
  let total = 0;
  for (const [dim, bd, kunci] of DIM) {
    try {
      const rows = [];
      for (const acc of akun) {
        let url = `https://graph.facebook.com/${GV()}/act_${acc}/insights?level=campaign&time_increment=1&breakdowns=${bd}`
          + `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&fields=campaign_name,spend,impressions,inline_link_clicks,actions&limit=500`
          + `&access_token=${encodeURIComponent(process.env.META_TOKEN)}`;
        let h = 0;
        while (url && h < 60) { const j = await graphUrl(url); rows.push(...(j.data || [])); url = j.paging?.next || null; h++; }
      }
      const data = rows.filter(r => r.campaign_name).map(r => { const [k1, k2] = kunci(r); return [r.date_start, peta.get(r.campaign_name.toLowerCase()) || r.campaign_name, dim, String(k1), String(k2),
        Number(r.spend) || 0, Number(r.impressions) || 0, Number(r.inline_link_clicks) || 0, hasilMeta(r.actions)]; });
      await sql`DELETE FROM mi_ads_breakdown WHERE dim = ${dim} AND tgl BETWEEN ${since}::date AND ${until}::date`;
      for (let i = 0; i < data.length; i += 500) {
        const b = data.slice(i, i + 500);
        await sql`INSERT INTO mi_ads_breakdown (tgl, campaign, dim, k1, k2, spend, impresi, klik, hasil)
          SELECT x.t, x.c, x.d, x.a, x.b, x.sp, x.im, x.kl, x.ha
          FROM unnest(${b.map(x => x[0])}::date[], ${b.map(x => x[1])}::text[], ${b.map(x => x[2])}::text[], ${b.map(x => x[3])}::text[], ${b.map(x => x[4])}::text[],
                      ${b.map(x => x[5])}::numeric[], ${b.map(x => x[6])}::int[], ${b.map(x => x[7])}::int[], ${b.map(x => x[8])}::int[]) AS x(t, c, d, a, b, sp, im, kl, ha)
          ON CONFLICT (tgl, campaign, dim, k1, k2) DO UPDATE SET spend = EXCLUDED.spend, impresi = EXCLUDED.impresi, klik = EXCLUDED.klik, hasil = EXCLUDED.hasil`;
      }
      total += data.length;
    } catch (e) { console.error('breakdown ' + dim, e); }
  }
  return total;
}
// Pengaturan targeting tiap ad set (untuk audit terhadap persona)
async function tarikTargeting(sql, akun, peta) {
  let n = 0;
  for (const acc of akun) {
    try {
      let url = `https://graph.facebook.com/${GV()}/act_${acc}/adsets?fields=name,effective_status,campaign{name},targeting&limit=200&access_token=${encodeURIComponent(process.env.META_TOKEN)}`;
      let h = 0;
      while (url && h < 10) {
        const j = await graphUrl(url); url = j.paging?.next || null; h++;
        for (const a of j.data || []) {
          const t = a.targeting || {}, g = t.geo_locations || {};
          const lokasi = [...(g.countries || []), ...(g.regions || []).map(x => x.name), ...(g.cities || []).map(x => x.name + (x.radius ? ` +${x.radius}${x.distance_unit === 'mile' ? 'mi' : 'km'}` : '')),
            ...(g.custom_locations || []).map(x => (x.name || 'titik peta') + (x.radius ? ` +${x.radius}${x.distance_unit === 'mile' ? 'mi' : 'km'}` : ''))].join(', ');
          const minat = (t.flexible_spec || []).flatMap(f => [...(f.interests || []), ...(f.behaviors || []), ...(f.life_events || []), ...(f.family_statuses || [])].map(x => x.name)).join(', ');
          const pen = (t.publisher_platforms || ['otomatis (Advantage+ placements)']).join(', ') + ((t.publisher_platforms || []).includes('audience_network') ? '' : '');
          const camp = a.campaign?.name ? (peta.get(a.campaign.name.toLowerCase()) || a.campaign.name) : '';
          await sql`INSERT INTO mi_adset_targeting (adset_id, campaign, nama, status, usia_min, usia_max, gender, lokasi, minat, penempatan, advantage, updated_at)
            VALUES (${a.id}, ${camp}, ${a.name || ''}, ${a.effective_status || ''}, ${t.age_min || null}, ${t.age_max || null},
                    ${(t.genders || []).length ? t.genders.map(x => x === 1 ? 'pria' : 'wanita').join(', ') : 'semua'}, ${lokasi}, ${minat}, ${pen},
                    ${t.targeting_automation?.advantage_audience === 1}, now())
            ON CONFLICT (adset_id) DO UPDATE SET campaign = EXCLUDED.campaign, nama = EXCLUDED.nama, status = EXCLUDED.status, usia_min = EXCLUDED.usia_min,
              usia_max = EXCLUDED.usia_max, gender = EXCLUDED.gender, lokasi = EXCLUDED.lokasi, minat = EXCLUDED.minat, penempatan = EXCLUDED.penempatan,
              advantage = EXCLUDED.advantage, updated_at = now()`;
          n++;
        }
      }
    } catch (e) { console.error('targeting', e); }
  }
  return n;
}

async function tarikMetaAds(sql) {
  if (!process.env.META_TOKEN) return { sumber: 'Meta Ads', status: 'dilewati', baris: 0, pesan: 'META_TOKEN belum diisi' };
  await siapkanKolomAds(sql);
  let akun = (process.env.META_AD_ACCOUNT || '').split(',').map(x => x.trim().replace(/^act_/, '')).filter(Boolean);
  if (!akun.length) {
    const j = await graph('me/adaccounts?fields=account_id,name&limit=50');
    akun = (j.data || []).map(a => a.account_id);
  }
  if (!akun.length) throw new Error('Token tidak bisa membaca akun iklan mana pun — cek aset Ad account di System User & izin ads_read');
  const MULAI = process.env.MI_ANALISA_MULAI || '2026-09-01';
  const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const adaApi = (await sql`SELECT 1 FROM mi_ads WHERE sumber = 'meta-api' LIMIT 1`).length > 0;
  const mundur = new Date(Date.now() + 7 * 3600000 - 37 * 86400000).toISOString().slice(0, 10);
  const since = adaApi ? (mundur > MULAI ? mundur : MULAI) : MULAI; // tarikan pertama: sejak titik mulai analisa
  const rows = [], statusCamp = {}, objCamp = {};
  for (const acc of akun) {
    const cs = await graph(`act_${acc}/campaigns?fields=name,effective_status,objective&limit=200`);
    (cs.data || []).forEach(c => { statusCamp[c.name] = c.effective_status; objCamp[c.name] = c.objective; });
    let url = `https://graph.facebook.com/${GV()}/act_${acc}/insights?level=ad&time_increment=1`
      + `&time_range=${encodeURIComponent(JSON.stringify({ since, until: hariIni }))}`
      + `&fields=campaign_name,ad_id,ad_name,spend,impressions,reach,inline_link_clicks,actions&limit=500`
      + `&access_token=${encodeURIComponent(process.env.META_TOKEN)}`;
    let halaman = 0;
    while (url && halaman < 40) { const j = await graphUrl(url); rows.push(...(j.data || [])); url = j.paging?.next || null; halaman++; }
  }
  // Petakan nama campaign Meta ke daftar campaign CRM (tidak peka huruf besar/kecil); yang belum ada didaftarkan otomatis
  const camps = await sql`SELECT nama FROM mi_campaigns`;
  const peta = new Map(camps.map(c => [String(c.nama).toLowerCase(), c.nama]));
  const proj = process.env.IG_PROJECT || 'BIO DISTRICT';
  let baru = 0;
  const semuaNama = new Set([...rows.map(r => r.campaign_name).filter(Boolean)]);
  for (const nm of semuaNama) {
    if (peta.has(nm.toLowerCase())) continue;
    const st = statusCamp[nm] === 'ACTIVE' ? 'Aktif' : 'Selesai';
    await sql`INSERT INTO mi_campaigns (nama, platform, project, tujuan, budget, status, catatan, created_by, sumber)
      VALUES (${nm}, 'Meta (FB+IG)', ${proj}, ${tujuanMeta(objCamp[nm])}, 0, ${st}, 'Terdaftar otomatis dari Meta Ads', 'auto-meta', 'meta-api')
      ON CONFLICT (nama) DO NOTHING`;
    peta.set(nm.toLowerCase(), nm); baru++;
  }
  // Status campaign mengikuti Ads Manager
  for (const [nm, ef] of Object.entries(statusCamp)) {
    const crm = peta.get(nm.toLowerCase());
    if (crm) await sql`UPDATE mi_campaigns SET status = ${ef === 'ACTIVE' ? 'Aktif' : 'Selesai'}, tujuan = ${tujuanMeta(objCamp[nm])}, sumber = COALESCE(sumber, 'meta-api') WHERE nama = ${crm}`;
  }
  // Simpan performa harian per iklan (upsert)
  const data = rows.filter(r => r.campaign_name).map(r => [
    'meta:' + r.ad_id + ':' + r.date_start, r.date_start, peta.get(r.campaign_name.toLowerCase()), String(r.ad_name || '').slice(0, 200),
    Number(r.spend) || 0, Number(r.impressions) || 0, Number(r.reach) || 0, Number(r.inline_link_clicks) || 0, hasilMeta(r.actions)]);
  for (let i = 0; i < data.length; i += 500) {
    const b = data.slice(i, i + 500);
    await sql`INSERT INTO mi_ads (ext_key, tgl, campaign, kreatif, spend, impresi, reach, klik, hasil, sumber, created_by)
      SELECT x.k, x.t, x.c, x.kr, x.sp, x.im, x.re, x.kl, x.ha, 'meta-api', 'auto-meta'
      FROM unnest(${b.map(x => x[0])}::text[], ${b.map(x => x[1])}::date[], ${b.map(x => x[2])}::text[], ${b.map(x => x[3])}::text[],
                  ${b.map(x => x[4])}::numeric[], ${b.map(x => x[5])}::int[], ${b.map(x => x[6])}::int[], ${b.map(x => x[7])}::int[], ${b.map(x => x[8])}::int[])
        AS x(k, t, c, kr, sp, im, re, kl, ha)
      ON CONFLICT (ext_key) DO UPDATE SET spend = EXCLUDED.spend, impresi = EXCLUDED.impresi, reach = EXCLUDED.reach,
        klik = EXCLUDED.klik, hasil = EXCLUDED.hasil, campaign = EXCLUDED.campaign, kreatif = EXCLUDED.kreatif`;
  }
  const nBd = await tarikBreakdown(sql, akun, since, hariIni, peta);
  const nTg = await tarikTargeting(sql, akun, peta);
  const totalSpend = data.reduce((a, x) => a + x[4], 0);
  return { sumber: 'Meta Ads', status: 'sukses', baris: data.length,
    pesan: `${since} s.d. ${hariIni} · ${semuaNama.size} campaign · spend Rp${Math.round(totalSpend).toLocaleString('id-ID')}` + (baru ? ` · ${baru} campaign baru terdaftar` : '') + ` · ${nBd} baris rincian · ${nTg} ad set` };
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
  const hasil = await Promise.all([jalankan(tarikGA4, 'GA4'), jalankan(tarikGSC, 'Search Console'), jalankan(tarikInstagram, 'Instagram'), jalankan(tarikMetaAds, 'Meta Ads')]);
  return Response.json({ ok: true, hasil, waktu: new Date().toISOString() });
}
