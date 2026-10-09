import crypto from 'crypto';
import { db, DEFAULT_SETTINGS } from '@/lib/db';
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
// ----- Instagram versi cepat & dicicil -----
// Batas fungsi Vercel Hobby = 60 detik. Versi lama meminta insights satu per satu per postingan dan menulis
// ke database 3x per postingan secara berurutan, sehingga mentok batas waktu. Versi ini:
//  • daftar postingan diambil sekali jalan (sudah termasuk like & komentar), berhenti di tanggal mulai analisa
//  • insights dibundel lewat Graph Batch API (≤50 permintaan per panggilan, paralel)
//  • insights hanya di-refresh untuk postingan ≤30 hari (atau yang belum pernah punya angka); sisanya like/komentar
//  • penulisan database dilakukan massal (unnest), bukan per baris
//  • ada jatah waktu: bila habis, sisa postingan dilanjutkan pada tarikan berikutnya (?lanjut=1) — tidak hilang
const IG_JATAH_MS = 40000;      // sisakan waktu untuk simpan ke database & mencatat riwayat
const IG_HARI_SEGAR = 30;
const nTimeout = ms => AbortSignal.timeout(Math.max(3000, ms));
async function graphT(path, ms = 15000) {
  const sep = path.includes('?') ? '&' : '?';
  let r;
  try {
    r = await fetch(`https://graph.facebook.com/${GV()}/${path}${sep}access_token=${encodeURIComponent(process.env.META_TOKEN)}`, { signal: nTimeout(ms) });
  } catch (e) { throw new Error(e.name === 'TimeoutError' ? 'Graph API tidak merespon (' + path.split('?')[0] + ')' : String(e.message || e)); }
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message || 'Graph error'); e.code = j.error.code; throw e; }
  return j;
}
// Graph Batch API — hasil per item: objek JSON, atau null bila item itu ditolak/gagal
async function graphBatch(paths, ms = 20000) {
  const body = new URLSearchParams({
    access_token: process.env.META_TOKEN, include_headers: 'false',
    batch: JSON.stringify(paths.map(p => ({ method: 'GET', relative_url: p }))),
  });
  const r = await fetch(`https://graph.facebook.com/${GV()}/`, { method: 'POST', body, signal: nTimeout(ms) });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(j.error?.message || 'Respon batch Graph tidak dikenal');
  // null = item tidak sempat diproses (timeout) → dicoba lagi nanti; { __tolak } = ditolak Graph (mis. metrik tak didukung tipe media)
  return j.map(x => { if (!x) return null; if (x.code !== 200) return { __tolak: true }; try { return JSON.parse(x.body); } catch { return { __tolak: true }; } });
}
async function batchSemua(paths, sisaMs) {
  const potong = [];
  for (let i = 0; i < paths.length; i += 50) potong.push(paths.slice(i, i + 50));
  const hasil = await Promise.all(potong.map(p => graphBatch(p, Math.min(20000, sisaMs())).catch(() => p.map(() => null))));
  return hasil.flat();
}
const nilaiInsight = d => Number(d?.values?.[0]?.value ?? d?.total_value?.value ?? 0) || 0;

// Insights untuk sekumpulan postingan, dibundel. Mengembalikan { [mediaId]: {reach, saved, shares, views, klik_bio, avg_watch} }
async function insightBundel(targets, sisaMs) {
  const out = {};
  if (!targets.length) return out;
  // Putaran 1: set lengkap + klik link bio + rata-rata tonton (Reels)
  const paths = [], peta = [];
  for (const x of targets) {
    out[x.id] = {};
    paths.push(`${x.id}/insights?metric=reach,saved,shares,views`); peta.push([x.id, 'utama']);
    paths.push(`${x.id}/insights?metric=profile_activity&breakdown=action_type`); peta.push([x.id, 'bio']);
    if (x.media_product_type === 'REELS') { paths.push(`${x.id}/insights?metric=ig_reels_avg_watch_time`); peta.push([x.id, 'tonton']); }
  }
  const h1 = await batchSemua(paths, sisaMs);
  const gagalUtama = [];
  h1.forEach((j, i) => {
    const [id, jenis] = peta[i];
    if (jenis === 'utama') {
      if (!j) return;                                   // terpotong waktu → tertunda
      if (j.__tolak) { gagalUtama.push(id); return; }   // ditolak → coba set metrik lebih sedikit
      (j.data || []).forEach(d => { out[id][d.name] = nilaiInsight(d); });
      out[id]._ok = true;
    } else if (jenis === 'bio' && j && !j.__tolak) {
      const hasil = j.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
      const bio = hasil.find(r => String(r.dimension_values?.[0] || '').toUpperCase() === 'BIO_LINK_CLICKED');
      if (bio) out[id].klik_bio = Number(bio.value) || 0;
    } else if (jenis === 'tonton' && j && !j.__tolak) {
      const ms = Number(j.data?.[0]?.values?.[0]?.value ?? j.data?.[0]?.total_value?.value);
      if (ms) out[id].avg_watch = Math.round(ms / 100) / 10;
    }
  });
  // Putaran 2 (hanya yang ditolak): metrik dikurangi — sebagian tipe media tidak mendukung semua metrik
  if (gagalUtama.length && sisaMs() > 6000) {
    const p2 = gagalUtama.flatMap(id => [`${id}/insights?metric=reach,saved,shares`, `${id}/insights?metric=reach`]);
    const h2 = await batchSemua(p2, sisaMs);
    gagalUtama.forEach((id, k) => {
      const a = h2[k * 2], b = h2[k * 2 + 1];
      const j = [a, b].find(z => z && !z.__tolak);
      if (j) { (j.data || []).forEach(d => { out[id][d.name] = nilaiInsight(d); }); out[id]._ok = true; }
      else if (a?.__tolak && b?.__tolak) out[id]._ok = true;   // memang tidak punya insights — angka lama dipertahankan, tidak diulang
    });
  }
  return out;
}

// Demografi follower (usia, gender, kota) — cukup sekali sehari, 3 dimensi paralel, simpan massal
async function tarikDemografi(sql, igId) {
  const hari = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const sudah = await sql`SELECT 1 FROM mi_ig_demografi WHERE tgl = ${hari} LIMIT 1`;
  if (sudah.length) return 0;
  const rows = [];
  await Promise.all([['usia', 'age'], ['gender', 'gender'], ['kota', 'city']].map(async ([dim, bd]) => {
    for (const extra of ['', '&timeframe=this_month', '&timeframe=last_30_days']) {
      try {
        const j = await graphT(`${igId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${bd}${extra}`, 10000);
        const hasil = j.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
        if (hasil.length) { hasil.slice(0, 50).forEach(r => rows.push([dim, String(r.dimension_values?.[0] || '-'), Number(r.value) || 0])); break; }
      } catch {}
    }
  }));
  if (rows.length) await sql`INSERT INTO mi_ig_demografi (tgl, dim, kunci, nilai)
    SELECT ${hari}::date, x.d, x.k, x.n FROM unnest(${rows.map(r => r[0])}::text[], ${rows.map(r => r[1])}::text[], ${rows.map(r => r[2])}::int[]) AS x(d, k, n)
    ON CONFLICT (tgl, dim, kunci) DO UPDATE SET nilai = EXCLUDED.nilai`;
  return rows.length;
}

async function tarikInstagram(sql, opsi = {}) {
  if (!process.env.META_TOKEN) return { sumber: 'Instagram', status: 'dilewati', baris: 0, pesan: 'META_TOKEN belum diisi' };
  const t0 = Date.now();
  const sisaMs = () => IG_JATAH_MS - (Date.now() - t0);
  let igId = process.env.IG_USER_ID;
  if (!igId) {
    const pages = await graphT('me/accounts?fields=name,instagram_business_account&limit=50');
    const pg = (pages.data || []).find(p => p.instagram_business_account);
    if (!pg) throw new Error('Tidak ada Facebook Page dengan akun Instagram terhubung pada token ini — cek aset Page & IG di System User');
    igId = pg.instagram_business_account.id;
  }
  const proj = process.env.IG_PROJECT || 'BIO DISTRICT';
  const MULAI = process.env.MI_ANALISA_MULAI || '2026-09-01';
  const batas = new Date(MULAI + 'T00:00:00+07:00').getTime();
  const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const FIELDS = 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count';

  // Tabel pendukung (aman diulang) — dijalankan paralel
  await Promise.all([
    sql`CREATE TABLE IF NOT EXISTS mi_ig_akun (tgl date PRIMARY KEY, ig_id text, username text, followers integer)`.catch(() => {}),
    sql`CREATE TABLE IF NOT EXISTS mi_ig_demografi (tgl date NOT NULL, dim text NOT NULL, kunci text NOT NULL, nilai integer, PRIMARY KEY (tgl, dim, kunci))`.catch(() => {}),
    sql`ALTER TABLE mi_content_metrics ADD COLUMN IF NOT EXISTS avg_watch numeric`.catch(() => {}),
  ]);

  // Follower, demografi & daftar postingan berjalan bersamaan
  const tugasFollower = (async () => {
    try {
      const akun = await graphT(`${igId}?fields=followers_count,username`, 10000);
      const f = Number(akun.followers_count) || null;
      if (f) await sql`INSERT INTO mi_ig_akun (tgl, ig_id, username, followers) VALUES (${hariIni}, ${igId}, ${akun.username || ''}, ${f})
        ON CONFLICT (tgl) DO UPDATE SET followers = EXCLUDED.followers, username = EXCLUDED.username`;
      return f;
    } catch (e) { console.error('ig followers', e); return null; }
  })();
  const tugasDemo = opsi.lanjut ? Promise.resolve(0) : tarikDemografi(sql, igId).catch(e => { console.error('ig demografi', e); return 0; });
  const tugasMedia = (async () => {
    let media = [], next = `${igId}/media?fields=${FIELDS}&limit=50`, hal = 0;
    while (next && hal < 8 && sisaMs() > 15000) {
      const j = await graphT(next, 15000); hal++;
      media = media.concat(j.data || []);
      const after = j.paging?.cursors?.after;
      const tua = (j.data || []).some(x => new Date(x.timestamp).getTime() < batas);
      next = (j.paging?.next && after && !tua) ? `${igId}/media?fields=${FIELDS}&limit=50&after=${after}` : null;
    }
    return media.filter(x => new Date(x.timestamp).getTime() >= batas);
  })();
  const [follower, nDemo, media] = await Promise.all([tugasFollower, tugasDemo, tugasMedia]);

  // Cocokkan postingan dengan konten yang sudah ada (1: via link; 2: tanggal & format sama, link kosong, kandidat tunggal)
  const ada = await sql`SELECT id, tgl, format, link FROM mi_contents WHERE platform = 'Instagram'`;
  const info = media.map(x => {
    const wib = new Date(new Date(x.timestamp).getTime() + 7 * 3600000);
    const format = FORMAT_IG[x.media_product_type === 'REELS' ? 'REELS' : x.media_type] || 'Lainnya';
    const baris1 = String(x.caption || '').split('\n').map(t => t.trim()).find(Boolean) || '';
    return { x, tgl: wib.toISOString().slice(0, 10), jam: wib.toISOString().slice(11, 16), format,
      hook: format === 'Reels / Short Video' ? '' : baris1.slice(0, 200), kode: kodeIG(x.permalink) };
  });
  const upd = [], baruList = [];
  for (const m of info) {
    let row = ada.find(c => kodeIG(c.link) && kodeIG(c.link) === m.kode);
    if (!row) {
      const kand = ada.filter(c => !kodeIG(c.link) && (c.tgl instanceof Date ? c.tgl.toISOString() : String(c.tgl)).slice(0, 10) === m.tgl && c.format === m.format);
      if (kand.length === 1) row = kand[0];
    }
    if (row) { m.cid = row.id; row.link = m.x.permalink; upd.push(m); }
    else baruList.push(m);
  }
  if (upd.length) await sql`UPDATE mi_contents c SET tgl = u.tgl, jam = u.jam, format = u.format, link = u.link,
      hook = CASE WHEN COALESCE(c.hook, '') = '' THEN u.hook ELSE c.hook END
    FROM unnest(${upd.map(m => m.cid)}::int[], ${upd.map(m => m.tgl)}::date[], ${upd.map(m => m.jam)}::text[], ${upd.map(m => m.format)}::text[],
                ${upd.map(m => m.x.permalink)}::text[], ${upd.map(m => m.hook)}::text[]) AS u(id, tgl, jam, format, link, hook)
    WHERE c.id = u.id`;
  if (baruList.length) {
    const r = await sql`INSERT INTO mi_contents (tgl, platform, project, format, topik, hook, jam, durasi, link, created_by)
      SELECT u.tgl, 'Instagram', ${proj}, u.format, '', u.hook, u.jam, '', u.link, 'auto-instagram'
      FROM unnest(${baruList.map(m => m.tgl)}::date[], ${baruList.map(m => m.format)}::text[], ${baruList.map(m => m.hook)}::text[],
                  ${baruList.map(m => m.jam)}::text[], ${baruList.map(m => m.x.permalink)}::text[]) AS u(tgl, format, hook, jam, link)
      RETURNING id, link`;
    const idLink = new Map(r.map(z => [z.link, z.id]));
    baruList.forEach(m => { m.cid = idLink.get(m.x.permalink); });
  }
  const semua = info.filter(m => m.cid);

  // Angka terakhir tiap konten (dipertahankan bila insights tidak di-refresh)
  const ids = semua.map(m => m.cid);
  const lamaRows = ids.length ? await sql`SELECT DISTINCT ON (content_id) content_id, tgl, reach, share_n, save_n, view3, view_full, klik_bio, avg_watch
    FROM mi_content_metrics WHERE content_id = ANY(${ids}::int[]) ORDER BY content_id, tgl DESC` : [];
  const lama = new Map(lamaRows.map(r => [r.content_id, { ...r, tglS: (r.tgl instanceof Date ? r.tgl.toISOString() : String(r.tgl)).slice(0, 10) }]));

  // Pilih postingan yang perlu insights: ≤30 hari, atau belum pernah punya angka.
  // ?lanjut=1 → lewati yang sudah ter-update hari ini (melanjutkan tarikan yang terpotong)
  const segar = Date.now() - IG_HARI_SEGAR * 86400000;
  let targets = semua.filter(m => new Date(m.x.timestamp).getTime() >= segar || !lama.has(m.cid));
  if (opsi.lanjut) targets = targets.filter(m => lama.get(m.cid)?.tglS !== hariIni);
  // Prioritas: belum pernah ditarik → paling lama tidak ter-update → terbaru
  targets.sort((a, b) => {
    const la = lama.get(a.cid)?.tglS || '', lb = lama.get(b.cid)?.tglS || '';
    if (la !== lb) return la < lb ? -1 : 1;
    return new Date(b.x.timestamp) - new Date(a.x.timestamp);
  });
  const ins = sisaMs() > 8000 ? await insightBundel(targets.map(m => m.x), sisaMs) : {};
  const tertunda = targets.filter(m => !ins[m.x.id]?._ok);
  const tundaSet = new Set(tertunda.map(m => m.cid));

  // Tulis angka hari ini secara massal. Postingan yang insights-nya tertunda TIDAK ditulis dulu,
  // supaya tarikan lanjutan memprioritaskannya.
  const tulis = semua.filter(m => !tundaSet.has(m.cid) && !(opsi.lanjut && lama.get(m.cid)?.tglS === hariIni && !ins[m.x.id]));
  if (tulis.length) {
    const v = tulis.map(m => {
      const l = lama.get(m.cid) || {}, it = ins[m.x.id] || {};
      const pakai = (baru, lm) => baru !== undefined ? baru : (Number(lm) || 0);
      return [m.cid, pakai(it.reach, l.reach), Number(m.x.like_count) || 0, Number(m.x.comments_count) || 0, pakai(it.shares, l.share_n), pakai(it.saved, l.save_n),
        pakai(it.views, l.view3), Number(l.view_full) || 0, pakai(it.klik_bio, l.klik_bio), it.avg_watch ?? (l.avg_watch != null ? Number(l.avg_watch) : null)];
    });
    const col = i => v.map(r => r[i]);
    await sql`INSERT INTO mi_content_metrics (content_id, tgl, reach, like_n, komentar, share_n, save_n, view3, view_full, klik_bio, avg_watch)
      SELECT x.c, ${hariIni}::date, x.r, x.l, x.k, x.s, x.sv, x.v3, x.vf, x.kb, x.aw
      FROM unnest(${col(0)}::int[], ${col(1)}::int[], ${col(2)}::int[], ${col(3)}::int[], ${col(4)}::int[], ${col(5)}::int[],
                  ${col(6)}::int[], ${col(7)}::int[], ${col(8)}::int[], ${col(9)}::numeric[]) AS x(c, r, l, k, s, sv, v3, vf, kb, aw)
      ON CONFLICT (content_id, tgl) DO UPDATE SET reach = EXCLUDED.reach, like_n = EXCLUDED.like_n, komentar = EXCLUDED.komentar,
        share_n = EXCLUDED.share_n, save_n = EXCLUDED.save_n, view3 = EXCLUDED.view3, klik_bio = EXCLUDED.klik_bio,
        avg_watch = COALESCE(EXCLUDED.avg_watch, mi_content_metrics.avg_watch)`;
  }
  const detik = Math.round((Date.now() - t0) / 100) / 10;
  const nIns = targets.length - tertunda.length;
  return {
    sumber: 'Instagram', status: tertunda.length ? 'sebagian' : 'sukses', baris: tulis.length, sisa: tertunda.length,
    pesan: `${media.length} postingan sejak ${MULAI} · insights ${nIns} · ${upd.length} dicocokkan · ${baruList.length} konten baru`
      + (follower ? ` · ${follower.toLocaleString('id-ID')} follower` : '') + (nDemo ? ` · demografi ${nDemo} baris` : '')
      + (tertunda.length ? ` · ${tertunda.length} postingan menunggu tarikan lanjutan` : '') + ` · ${detik} dtk`,
  };
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
  try { await sql`ALTER TABLE mi_campaigns ADD COLUMN IF NOT EXISTS meta_info text`; } catch {}
  try { await sql`CREATE TABLE IF NOT EXISTS mi_campaign_alias (alias text PRIMARY KEY, nama text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`; } catch {}
  try { await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS views3 integer`; } catch {}
  try { await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS thruplay integer`; } catch {}
  try { await sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS ad_id text`; } catch {}
  try { await sql`CREATE TABLE IF NOT EXISTS mi_ad_status (ad_id text PRIMARY KEY, nama text, campaign text, status text, updated_at timestamptz NOT NULL DEFAULT now())`; } catch {}
  try { await sql`CREATE TABLE IF NOT EXISTS mi_ads_breakdown (
    tgl date NOT NULL, campaign text NOT NULL, dim text NOT NULL, k1 text NOT NULL, k2 text NOT NULL DEFAULT '',
    spend numeric DEFAULT 0, impresi integer DEFAULT 0, klik integer DEFAULT 0, hasil integer DEFAULT 0,
    PRIMARY KEY (tgl, campaign, dim, k1, k2))`; } catch {}
  try { await sql`CREATE TABLE IF NOT EXISTS mi_adset_targeting (
    adset_id text PRIMARY KEY, campaign text, nama text, status text, usia_min integer, usia_max integer, gender text,
    lokasi text, minat text, penempatan text, advantage boolean, updated_at timestamptz NOT NULL DEFAULT now())`; } catch {}
  kolomAdsSiap = true;
}
// Peta nama campaign Meta (huruf kecil) -> nama campaign di CRM, termasuk nama lama hasil "Gabungkan"
// (tanpa alias, campaign yang sudah digabung akan terdaftar ulang & spend-nya pindah balik pada tarikan berikutnya)
async function petaCampaign(sql) {
  const peta = new Map((await sql`SELECT nama FROM mi_campaigns`).map(c => [String(c.nama).toLowerCase(), c.nama]));
  try {
    (await sql`SELECT a.alias, a.nama FROM mi_campaign_alias a JOIN mi_campaigns c ON c.nama = a.nama`)
      .forEach(x => { if (!peta.has(String(x.alias).toLowerCase())) peta.set(String(x.alias).toLowerCase(), x.nama); });
  } catch {}
  return peta;
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
        const baris = (j.data || []).map(a => {
          const t = a.targeting || {}, g = t.geo_locations || {};
          const rad = x => x.radius ? ` +${x.radius}${x.distance_unit === 'mile' ? 'mi' : 'km'}` : '';
          const lokasi = [...(g.countries || []), ...(g.regions || []).map(x => x.name), ...(g.cities || []).map(x => x.name + rad(x)), ...(g.custom_locations || []).map(x => (x.name || 'titik peta') + rad(x))].join(', ');
          const minat = (t.flexible_spec || []).flatMap(f => [...(f.interests || []), ...(f.behaviors || []), ...(f.life_events || []), ...(f.family_statuses || [])].map(x => x.name)).join(', ');
          return [a.id, a.campaign?.name ? (peta.get(a.campaign.name.toLowerCase()) || a.campaign.name) : '', a.name || '', a.effective_status || '', t.age_min || null, t.age_max || null,
            (t.genders || []).length ? t.genders.map(x => x === 1 ? 'pria' : 'wanita').join(', ') : 'semua', lokasi, minat,
            (t.publisher_platforms || ['otomatis (Advantage+ placements)']).join(', '), t.targeting_automation?.advantage_audience === 1];
        });
        if (baris.length) await sql`INSERT INTO mi_adset_targeting (adset_id, campaign, nama, status, usia_min, usia_max, gender, lokasi, minat, penempatan, advantage, updated_at)
          SELECT x.a, x.c, x.n, x.s, x.u1, x.u2, x.g, x.l, x.m, x.p, x.adv, now()
          FROM unnest(${baris.map(x => x[0])}::text[], ${baris.map(x => x[1])}::text[], ${baris.map(x => x[2])}::text[], ${baris.map(x => x[3])}::text[], ${baris.map(x => x[4])}::int[],
                      ${baris.map(x => x[5])}::int[], ${baris.map(x => x[6])}::text[], ${baris.map(x => x[7])}::text[], ${baris.map(x => x[8])}::text[], ${baris.map(x => x[9])}::text[], ${baris.map(x => x[10])}::boolean[])
            AS x(a, c, n, s, u1, u2, g, l, m, p, adv)
          ON CONFLICT (adset_id) DO UPDATE SET campaign = EXCLUDED.campaign, nama = EXCLUDED.nama, status = EXCLUDED.status, usia_min = EXCLUDED.usia_min, usia_max = EXCLUDED.usia_max,
            gender = EXCLUDED.gender, lokasi = EXCLUDED.lokasi, minat = EXCLUDED.minat, penempatan = EXCLUDED.penempatan, advantage = EXCLUDED.advantage, updated_at = now()`;
        n += baris.length;
      }
    } catch (e) { console.error('targeting', e); }
  }
  return n;
}

// Tahap terpisah: rincian usia/gender, wilayah, penempatan + targeting ad set
async function tarikMetaRinci(sql) {
  if (!process.env.META_TOKEN) return { sumber: 'Meta Ads (rincian)', status: 'dilewati', baris: 0, pesan: 'META_TOKEN belum diisi' };
  await siapkanKolomAds(sql);
  let akun = (process.env.META_AD_ACCOUNT || '').split(',').map(x => x.trim().replace(/^act_/, '')).filter(Boolean);
  if (!akun.length) akun = ((await graph('me/adaccounts?fields=account_id&limit=50')).data || []).map(a => a.account_id);
  const MULAI = process.env.MI_ANALISA_MULAI || '2026-09-01';
  const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const sudahAda = (await sql`SELECT 1 FROM mi_ads_breakdown LIMIT 1`).length > 0;
  const mundur = new Date(Date.now() + 7 * 3600000 - 10 * 86400000).toISOString().slice(0, 10);
  const since = sudahAda ? (mundur > MULAI ? mundur : MULAI) : MULAI; // pertama kali: sejak titik mulai; selanjutnya 10 hari terakhir
  const peta = await petaCampaign(sql);
  const nTg = await tarikTargeting(sql, akun, peta);
  const nBd = await tarikBreakdown(sql, akun, since, hariIni, peta);
  return { sumber: 'Meta Ads (rincian)', status: 'sukses', baris: nBd, pesan: `${since} s.d. ${hariIni} · ${nBd} baris rincian usia/wilayah/penempatan · ${nTg} ad set` };
}

// ===== Project campaign baru dari Meta = project pemilik akun iklannya =====
// Urutan: (1) env META_AKUN_PROJECT "idAkun:PROJECT,idAkun:PROJECT" bila diisi; (2) nama akun iklan cocok dengan
// nama project di Settings (mis. akun "Permai Indah" → PERMAI INDAH); (3) awalan nama campaign (bio_ / permai_);
// (4) bila tetap tidak ketemu: IG_PROJECT (default BIO DISTRICT)
const rapat = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function tentukanProject(akunId, namaAkun, namaCampaign, daftarProject, peta, cadangan) {
  if (peta[akunId]) return peta[akunId];
  const na = rapat(namaAkun);
  if (na) {
    const cocok = daftarProject.find(p => rapat(p) && (na.includes(rapat(p)) || rapat(p).includes(na)))
      || daftarProject.find(p => { const w = rapat(String(p).split(/\s+/)[0]); return w.length >= 3 && na.includes(w); });
    if (cocok) return cocok;
  }
  const awal = rapat(String(namaCampaign || '').split(/[_\s-]/)[0]);
  if (awal.length >= 3) {
    const cocok = daftarProject.find(p => rapat(String(p).split(/\s+/)[0]) === awal || rapat(p).startsWith(awal));
    if (cocok) return cocok;
  }
  return cadangan;
}

async function tarikMetaAds(sql) {
  if (!process.env.META_TOKEN) return { sumber: 'Meta Ads', status: 'dilewati', baris: 0, pesan: 'META_TOKEN belum diisi' };
  await siapkanKolomAds(sql);
  let akun = (process.env.META_AD_ACCOUNT || '').split(',').map(x => x.trim().replace(/^act_/, '')).filter(Boolean);
  const namaAkun = {};
  if (!akun.length) {
    const j = await graph('me/adaccounts?fields=account_id,name&limit=50');
    akun = (j.data || []).map(a => a.account_id);
    (j.data || []).forEach(a => { namaAkun[a.account_id] = a.name || ''; });
  }
  if (!akun.length) throw new Error('Token tidak bisa membaca akun iklan mana pun — cek aset Ad account di System User & izin ads_read');
  for (const acc of akun) {
    if (namaAkun[acc] === undefined) { try { namaAkun[acc] = (await graph(`act_${acc}?fields=name`)).name || ''; } catch { namaAkun[acc] = ''; } }
  }
  const MULAI = process.env.MI_ANALISA_MULAI || '2026-09-01';
  const hariIni = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const adaApi = (await sql`SELECT 1 FROM mi_ads WHERE sumber = 'meta-api' LIMIT 1`).length > 0;
  const mundur = new Date(Date.now() + 7 * 3600000 - 37 * 86400000).toISOString().slice(0, 10);
  const since = adaApi ? (mundur > MULAI ? mundur : MULAI) : MULAI; // tarikan pertama: sejak titik mulai analisa
  const rows = [], statusCamp = {}, objCamp = {}, dibuatCamp = {}, akunCamp = {};
  for (const acc of akun) {
    // Semua status — termasuk ARCHIVED/DELETED. Bawaan Graph API menyembunyikan campaign yang diarsipkan/dihapus,
    // akibatnya status campaign itu di CRM tidak pernah diperbarui & tertahan "Aktif".
    const daftarCamp = [];
    const STATUS_SEMUA = encodeURIComponent(JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED', 'IN_PROCESS', 'WITH_ISSUES']));
    try {
      let uc = `https://graph.facebook.com/${GV()}/act_${acc}/campaigns?fields=name,effective_status,objective,created_time&effective_status=${STATUS_SEMUA}&limit=200&access_token=${encodeURIComponent(process.env.META_TOKEN)}`, hc = 0;
      while (uc && hc < 10) { const j = await graphUrl(uc); daftarCamp.push(...(j.data || [])); uc = j.paging?.next || null; hc++; }
    } catch (e) {
      console.error('campaign semua status', e);
      daftarCamp.push(...((await graph(`act_${acc}/campaigns?fields=name,effective_status,objective,created_time&limit=200`)).data || []));
    }
    daftarCamp.forEach(c => { if (statusCamp[c.name] !== 'ACTIVE') statusCamp[c.name] = c.effective_status; objCamp[c.name] = objCamp[c.name] || c.objective;
      if (!akunCamp[c.name]) akunCamp[c.name] = acc;
      if (c.created_time && (!dibuatCamp[c.name] || c.created_time > dibuatCamp[c.name])) dibuatCamp[c.name] = c.created_time; });
    try {
      let ua = `https://graph.facebook.com/${GV()}/act_${acc}/ads?fields=id,name,effective_status,campaign{name}&limit=300&access_token=${encodeURIComponent(process.env.META_TOKEN)}`, h = 0;
      const semua = [];
      while (ua && h < 10) { const j = await graphUrl(ua); ua = j.paging?.next || null; h++; semua.push(...(j.data || [])); }
      for (let i = 0; i < semua.length; i += 500) {
        const b = semua.slice(i, i + 500);
        await sql`INSERT INTO mi_ad_status (ad_id, nama, campaign, status)
          SELECT * FROM unnest(${b.map(a => a.id)}::text[], ${b.map(a => a.name || '')}::text[], ${b.map(a => a.campaign?.name || '')}::text[], ${b.map(a => a.effective_status || '')}::text[])
          ON CONFLICT (ad_id) DO UPDATE SET nama = EXCLUDED.nama, campaign = EXCLUDED.campaign, status = EXCLUDED.status, updated_at = now()`;
      }
    } catch (e) { console.error('status iklan', e); }
    let url = `https://graph.facebook.com/${GV()}/act_${acc}/insights?level=ad&time_increment=1`
      + `&time_range=${encodeURIComponent(JSON.stringify({ since, until: hariIni }))}`
      + `&fields=campaign_name,ad_id,ad_name,spend,impressions,reach,inline_link_clicks,actions,video_thruplay_watched_actions&limit=500`
      + `&access_token=${encodeURIComponent(process.env.META_TOKEN)}`;
    let halaman = 0;
    while (url && halaman < 40) { const j = await graphUrl(url); (j.data || []).forEach(x => { if (x.campaign_name && !akunCamp[x.campaign_name]) akunCamp[x.campaign_name] = acc; }); rows.push(...(j.data || [])); url = j.paging?.next || null; halaman++; }
  }
  // Petakan nama campaign Meta ke daftar campaign CRM (tidak peka huruf besar/kecil); yang belum ada didaftarkan otomatis
  const peta = await petaCampaign(sql);
  const projCadangan = process.env.IG_PROJECT || 'BIO DISTRICT';
  let daftarProject = DEFAULT_SETTINGS.project || [];
  try { const sp = await sql`SELECT items FROM settings WHERE key = 'project'`; if (Array.isArray(sp[0]?.items) && sp[0].items.length) daftarProject = sp[0].items; } catch {}
  const petaAkun = Object.fromEntries((process.env.META_AKUN_PROJECT || '').split(',').map(x => x.split(':').map(y => y.trim()))
    .filter(([a, p]) => a && p).map(([a, p]) => [a.replace(/^act_/, ''), p]));
  const projectUntuk = nm => tentukanProject(akunCamp[nm], namaAkun[akunCamp[nm]], nm, daftarProject, petaAkun, projCadangan);
  let baru = 0, dikoreksi = 0;
  const semuaNama = new Set([...rows.map(r => r.campaign_name).filter(Boolean)]);
  for (const nm of semuaNama) {
    if (peta.has(nm.toLowerCase())) continue;
    const st = statusCamp[nm] === 'ACTIVE' ? 'Aktif' : 'Selesai';
    await sql`INSERT INTO mi_campaigns (nama, platform, project, tujuan, budget, status, catatan, created_by, sumber)
      VALUES (${nm}, 'Meta (FB+IG)', ${projectUntuk(nm)}, ${tujuanMeta(objCamp[nm])}, 0, ${st}, 'Terdaftar otomatis dari Meta Ads', 'auto-meta', 'meta-api')
      ON CONFLICT (nama) DO NOTHING`;
    peta.set(nm.toLowerCase(), nm); baru++;
  }
  // Koreksi campaign otomatis yang dulu terdaftar dengan project default padahal akun iklannya milik project lain.
  // Hanya campaign ⚡ yang project-nya masih bawaan — project yang sudah diubah manual tidak disentuh.
  try {
    const otomatis = await sql`SELECT nama, project FROM mi_campaigns WHERE created_by = 'auto-meta' AND project = ${projCadangan}`;
    for (const c of otomatis) {
      const asli = Object.keys(akunCamp).find(k => k.toLowerCase() === String(c.nama).toLowerCase());
      if (!asli) continue;
      const p = projectUntuk(asli);
      if (p && p !== c.project) { await sql`UPDATE mi_campaigns SET project = ${p} WHERE nama = ${c.nama}`; dikoreksi++; }
    }
  } catch (e) { console.error('koreksi project campaign', e); }
  // Status campaign mengikuti Ads Manager — Aktif hanya bila ada minimal satu IKLAN yang benar-benar tayang
  // (menangani campaign bernama sama hasil duplikat, dan campaign "aktif" yang semua iklannya berhenti)
  let iklanAktif = new Set(), adaInfoIklan = new Set();
  try {
    (await sql`SELECT lower(campaign) AS c, bool_or(status = 'ACTIVE') AS aktif FROM mi_ad_status GROUP BY lower(campaign)`).forEach(r => { adaInfoIklan.add(r.c); if (r.aktif) iklanAktif.add(r.c); });
  } catch {}
  // + harus benar-benar mengeluarkan biaya dalam 3 hari terakhir (campaign "on" yang jadwal/budgetnya habis tidak dihitung tayang),
  //   kecuali campaign baru dibuat ≤3 hari (belum sempat ada spend)
  const batas3 = new Date(Date.now() + 7 * 3600000 - 3 * 86400000).toISOString().slice(0, 10);
  const spend3 = {};
  rows.forEach(r => { if (r.campaign_name && r.date_start >= batas3) spend3[r.campaign_name.toLowerCase()] = (spend3[r.campaign_name.toLowerCase()] || 0) + (Number(r.spend) || 0); });
  // Satu campaign CRM bisa mewakili beberapa campaign Meta (nama sama / hasil Gabungkan): Aktif bila salah satunya tayang
  const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
  const STATUS_ID = { PAUSED: 'dijeda (off)', ARCHIVED: 'diarsipkan', DELETED: 'dihapus', CAMPAIGN_PAUSED: 'dijeda', IN_PROCESS: 'sedang diproses', WITH_ISSUES: 'bermasalah' };
  const hasilCRM = new Map();
  for (const [nm, ef] of Object.entries(statusCamp)) {
    const crm = peta.get(nm.toLowerCase()), k = nm.toLowerCase();
    if (!crm) continue;
    const adaIklanAktif = !adaInfoIklan.has(k) || iklanAktif.has(k);
    const menyala = ef === 'ACTIVE' && adaIklanAktif;
    const baru = dibuatCamp[nm] && (Date.now() - new Date(dibuatCamp[nm]).getTime()) < 3 * 86400000;
    const tayang = menyala && ((spend3[k] || 0) > 0 || baru);
    const ket = tayang ? ((spend3[k] || 0) > 0 ? `tayang · spend 3 hari ${rp(spend3[k])}` : 'baru dibuat, belum ada spend')
      : ef !== 'ACTIVE' ? (STATUS_ID[ef] || String(ef || 'tidak aktif').toLowerCase())
      : !adaIklanAktif ? 'campaign menyala tapi semua iklannya berhenti'
      : 'menyala tapi tidak ada spend 3 hari terakhir (jadwal/budget habis atau belum lolos review)';
    const h = hasilCRM.get(crm) || { tayang: false, ket: [], tujuan: tujuanMeta(objCamp[nm]) };
    h.tayang = h.tayang || tayang; h.ket.push(ket);
    hasilCRM.set(crm, h);
  }
  for (const [crm, h] of hasilCRM) {
    const ket = 'Meta: ' + [...new Set(h.ket)].slice(0, 3).join(' / ');
    await sql`UPDATE mi_campaigns SET status = ${h.tayang ? 'Aktif' : 'Selesai'}, tujuan = ${h.tujuan}, sumber = COALESCE(sumber, 'meta-api'),
      meta_info = ${ket} WHERE nama = ${crm}`;
  }
  // Campaign Meta di CRM yang tidak ada padanannya di Ads Manager:
  //  • terdaftar otomatis (⚡) → sudah tidak ada di Ads Manager → Selesai
  //  • dibuat manual → status dibiarkan (keputusan tim), diberi keterangan agar disambungkan lewat Gabungkan
  const tersambung = new Set(hasilCRM.keys());
  const yatim = (await sql`SELECT nama, sumber, status FROM mi_campaigns WHERE platform ILIKE '%meta%'`).filter(c => !tersambung.has(c.nama));
  let nYatim = 0;
  for (const c of yatim) {
    if (c.sumber === 'meta-api') {
      await sql`UPDATE mi_campaigns SET status = 'Selesai', meta_info = 'Meta: tidak ditemukan lagi di Ads Manager — otomatis Selesai' WHERE nama = ${c.nama}`;
      if (c.status === 'Aktif') nYatim++;
    } else {
      await sql`UPDATE mi_campaigns SET meta_info = 'Belum tersambung ke Meta Ads — namanya tidak sama dengan campaign mana pun di Ads Manager, jadi spend & hasilnya tidak masuk. Gabungkan campaign ⚡ dari Meta ke campaign ini.' WHERE nama = ${c.nama}`;
    }
  }
  // Simpan performa harian per iklan (upsert)
  const data = rows.filter(r => r.campaign_name).map(r => [
    'meta:' + r.ad_id + ':' + r.date_start, r.date_start, peta.get(r.campaign_name.toLowerCase()), String(r.ad_name || '').slice(0, 200),
    Number(r.spend) || 0, Number(r.impressions) || 0, Number(r.reach) || 0, Number(r.inline_link_clicks) || 0, hasilMeta(r.actions),
    Math.round(Number((r.actions || []).find(x => x.action_type === 'video_view')?.value) || 0),
    Math.round((r.video_thruplay_watched_actions || []).reduce((t, x) => t + (Number(x.value) || 0), 0)), String(r.ad_id || '')]);
  for (let i = 0; i < data.length; i += 500) {
    const b = data.slice(i, i + 500);
    await sql`INSERT INTO mi_ads (ext_key, tgl, campaign, kreatif, spend, impresi, reach, klik, hasil, views3, thruplay, ad_id, sumber, created_by)
      SELECT x.k, x.t, x.c, x.kr, x.sp, x.im, x.re, x.kl, x.ha, x.v3, x.tp, x.ai, 'meta-api', 'auto-meta'
      FROM unnest(${b.map(x => x[0])}::text[], ${b.map(x => x[1])}::date[], ${b.map(x => x[2])}::text[], ${b.map(x => x[3])}::text[],
                  ${b.map(x => x[4])}::numeric[], ${b.map(x => x[5])}::int[], ${b.map(x => x[6])}::int[], ${b.map(x => x[7])}::int[], ${b.map(x => x[8])}::int[],
                  ${b.map(x => x[9])}::int[], ${b.map(x => x[10])}::int[], ${b.map(x => x[11])}::text[])
        AS x(k, t, c, kr, sp, im, re, kl, ha, v3, tp, ai)
      ON CONFLICT (ext_key) DO UPDATE SET views3 = EXCLUDED.views3, thruplay = EXCLUDED.thruplay, ad_id = EXCLUDED.ad_id, spend = EXCLUDED.spend, impresi = EXCLUDED.impresi, reach = EXCLUDED.reach,
        klik = EXCLUDED.klik, hasil = EXCLUDED.hasil, campaign = EXCLUDED.campaign, kreatif = EXCLUDED.kreatif`;
  }
  const totalSpend = data.reduce((a, x) => a + x[4], 0);
  return { sumber: 'Meta Ads', status: 'sukses', baris: data.length,
    pesan: `${since} s.d. ${hariIni} · ${semuaNama.size} campaign · spend Rp${Math.round(totalSpend).toLocaleString('id-ID')}` + (baru ? ` · ${baru} campaign baru terdaftar` : '') + (dikoreksi ? ` · ${dikoreksi} campaign dipindah ke project akun iklannya` : '') + ` · ${akun.length} akun iklan` + (nYatim ? ` · ${nYatim} campaign tak ada lagi di Ads Manager → Selesai` : '') };
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
    if (!user || !['manager', 'ceo', 'markom'].includes(user.role)) {
      return Response.json({ error: 'Tidak berizin' }, { status: 401 });
    }
  }
  const sql = db();
  const q = new URL(req.url).searchParams;
  const opsi = { lanjut: q.get('lanjut') === '1' };
  // Tarikan yang dulu terhenti paksa oleh server (status masih "berjalan" > 90 detik) ditandai gagal
  try {
    await sql`UPDATE mi_sync_log SET status = 'gagal', pesan = 'terhenti — melewati batas waktu 60 detik server'
      WHERE status = 'berjalan' AND waktu < now() - interval '90 seconds'`;
  } catch {}
  const jalankan = async (tarik, nama) => {
    // Baris riwayat dicatat sejak awal ("berjalan"), lalu diperbarui — kegagalan karena batas waktu tidak lagi hilang dari riwayat
    let logId = null;
    try { logId = (await sql`INSERT INTO mi_sync_log (sumber, status, baris, pesan) VALUES (${nama}, 'berjalan', 0, ${opsi.lanjut ? 'tarikan lanjutan…' : 'sedang menarik…'}) RETURNING id`)[0]?.id; } catch {}
    const catat = async (h) => {
      if (logId) await sql`UPDATE mi_sync_log SET sumber = ${h.sumber}, status = ${h.status}, baris = ${h.baris}, pesan = ${h.pesan}, waktu = now() WHERE id = ${logId}`;
      else await sql`INSERT INTO mi_sync_log (sumber, status, baris, pesan) VALUES (${h.sumber}, ${h.status}, ${h.baris}, ${h.pesan})`;
    };
    try {
      const h = await tarik(sql, opsi);
      await catat(h);
      return h;
    } catch (e) {
      const pesan = String(e.message || e).slice(0, 400);
      try { await catat({ sumber: nama, status: 'gagal', baris: 0, pesan }); } catch {}
      return { sumber: nama, status: 'gagal', baris: 0, pesan };
    }
  };
  // Tarikan dipecah per sumber agar tiap tahap punya jatah waktu server sendiri (batas 60 detik):
  // ?sumber=web (GA4 + Search Console) · instagram · meta · meta-rinci. Tanpa ?sumber → semua (dipakai sebagai cadangan).
  // Instagram: hasil membawa "sisa" bila sebagian postingan tertunda → panggil lagi dengan &lanjut=1.
  const sumber = q.get('sumber') || '';
  const TAHAP = { web: [[tarikGA4, 'GA4'], [tarikGSC, 'Search Console']], instagram: [[tarikInstagram, 'Instagram']], meta: [[tarikMetaAds, 'Meta Ads']], 'meta-rinci': [[tarikMetaRinci, 'Meta Ads (rincian)']] };
  const daftar = TAHAP[sumber] || [...TAHAP.web, ...TAHAP.instagram, ...TAHAP.meta];
  const hasil = await Promise.all(daftar.map(([f, n]) => jalankan(f, n)));
  return Response.json({ ok: true, hasil, waktu: new Date().toISOString() });
}
