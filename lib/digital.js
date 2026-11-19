// ===== Digital Marketing — sambungan ke Meta (iklan & posting) dan WordPress (artikel) =====
// Kunci yang dipakai (diisi di Vercel, tidak pernah disimpan di database):
//   META_ADS_TOKEN      token System User dengan izin ads_management (+ pages_manage_posts, pages_read_engagement,
//                       instagram_content_publish untuk posting organik). Bila kosong memakai META_TOKEN (biasanya hanya izin baca).
//   META_AD_ACCOUNT     daftar akun iklan (sudah dipakai Analisa Marcom) · META_AKUN_PROJECT  peta akun → project
//   WP_BIO_URL, WP_BIO_USER, WP_BIO_APP_PASSWORD        website Bio District (Application Password WordPress)
//   WP_PERMAI_URL, WP_PERMAI_USER, WP_PERMAI_APP_PASSWORD  (opsional) website Permai Indah
export { bolehDigital } from '@/lib/digital-akses';

const GV = () => process.env.META_API_VERSION || 'v23.0';
export const tokenAds = () => process.env.META_ADS_TOKEN || process.env.META_TOKEN || '';
export const sumberToken = () => process.env.META_ADS_TOKEN ? 'META_ADS_TOKEN' : process.env.META_TOKEN ? 'META_TOKEN (token Analisa Marcom — biasanya hanya izin baca)' : '';

function galatMeta(j, status) {
  const e = j?.error || {};
  const pesan = e.error_user_msg || e.message || ('Meta menolak permintaan (HTTP ' + status + ')');
  const err = new Error((e.error_user_title ? e.error_user_title + ': ' : '') + pesan);
  err.kode = e.code;
  return err;
}
async function baca(r) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw galatMeta(j, r.status);
  return j;
}
export async function mGet(path, params = {}, token = tokenAds()) {
  const q = new URLSearchParams({ ...params, access_token: token });
  return baca(await fetch(`https://graph.facebook.com/${GV()}/${path}?${q}`, { cache: 'no-store', signal: AbortSignal.timeout(25000) }));
}
export async function mPost(path, params = {}, token = tokenAds()) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  body.set('access_token', token);
  return baca(await fetch(`https://graph.facebook.com/${GV()}/${path}`, { method: 'POST', body, signal: AbortSignal.timeout(45000) }));
}
export async function mHapus(path, token = tokenAds()) {
  return baca(await fetch(`https://graph.facebook.com/${GV()}/${path}?access_token=${encodeURIComponent(token)}`, { method: 'DELETE', signal: AbortSignal.timeout(30000) }));
}
// Ambil semua halaman hasil (maks beberapa halaman agar tidak melewati batas waktu)
export async function mSemua(path, params = {}, maksHalaman = 4) {
  let j = await mGet(path, params); const out = [...(j.data || [])];
  for (let i = 1; i < maksHalaman && j.paging?.next; i++) {
    j = await baca(await fetch(j.paging.next, { cache: 'no-store', signal: AbortSignal.timeout(25000) }));
    out.push(...(j.data || []));
  }
  return out;
}

// Mata uang tanpa pecahan sen di Meta (anggaran dikirim apa adanya); mata uang lain dikali 100
const TANPA_SEN = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND']);
export const faktorUang = mataUang => TANPA_SEN.has(String(mataUang || 'IDR').toUpperCase()) ? 1 : 100;

export async function daftarAkun() {
  let ids = (process.env.META_AD_ACCOUNT || '').split(',').map(x => x.trim().replace(/^act_/, '')).filter(Boolean);
  const peta = Object.fromEntries((process.env.META_AKUN_PROJECT || '').split(',').map(x => x.split(':').map(y => y.trim()))
    .filter(([a, p]) => a && p).map(([a, p]) => [a.replace(/^act_/, ''), p]));
  if (!ids.length) ids = ((await mGet('me/adaccounts', { fields: 'account_id', limit: 50 })).data || []).map(a => a.account_id);
  const out = [];
  for (const id of ids) {
    try { const a = await mGet('act_' + id, { fields: 'name,currency,account_status' });
      out.push({ id, nama: a.name || id, mata_uang: a.currency || 'IDR', project: peta[id] || '', aktif: a.account_status === 1 }); }
    catch (e) { out.push({ id, nama: id, mata_uang: 'IDR', project: peta[id] || '', galat: e.message }); }
  }
  return out;
}

// ===== Batas anggaran harian (pengaman salah ketik) — disimpan di tabel settings =====
export const BATAS_BAWAAN = 500000;
export async function bacaBatas(sql) {
  try { const r = await sql`SELECT items FROM settings WHERE key = 'dm_batas'`; const n = Number(r[0]?.items?.harian); return n > 0 ? n : BATAS_BAWAAN; }
  catch { return BATAS_BAWAAN; }
}
export async function simpanBatas(sql, harian) {
  const n = Math.max(10000, Math.min(100000000, Math.round(Number(harian) || 0)));
  await sql`INSERT INTO settings (key, items) VALUES ('dm_batas', ${JSON.stringify({ harian: n })}) ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify({ harian: n })}`;
  return n;
}

// ===== Materi sementara untuk Instagram (Instagram hanya menerima gambar lewat alamat publik) =====
let mediaSiap = false;
export async function siapkanMedia(sql) {
  if (mediaSiap) return;
  await sql`CREATE TABLE IF NOT EXISTS dm_media (id bigserial PRIMARY KEY, kunci text NOT NULL, mime text NOT NULL, data text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  mediaSiap = true;
}

// ===== WordPress =====
export function situsWp() {
  const daftar = [['BIO DISTRICT', 'WP_BIO'], ['PERMAI INDAH', 'WP_PERMAI']];
  return daftar.map(([project, p]) => ({ project, url: (process.env[p + '_URL'] || '').replace(/\/+$/, ''), user: process.env[p + '_USER'] || '', pass: process.env[p + '_APP_PASSWORD'] || '' }))
    .filter(s => s.url && s.user && s.pass);
}
export async function wp(situs, path, opts = {}) {
  let r;
  try {
    r = await fetch(`${situs.url}/wp-json/wp/v2/${path}`, { ...opts, cache: 'no-store', signal: AbortSignal.timeout(40000),
      headers: { Authorization: 'Basic ' + Buffer.from(`${situs.user}:${situs.pass}`).toString('base64'), ...(opts.headers || {}) } });
  } catch { throw new Error('Website tidak bisa dihubungi — cek alamat ' + situs.url); }
  const teks = await r.text(); let j = {};
  try { j = JSON.parse(teks); } catch {}
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error('WordPress menolak login (' + (j.message || 'HTTP ' + r.status).replace(/<[^>]+>/g, '') + '). Cek username & Application Password; bila plugin keamanan (Wordfence) mematikan Application Password, aktifkan dulu.');
    throw new Error('WordPress: ' + String(j.message || 'HTTP ' + r.status).replace(/<[^>]+>/g, ''));
  }
  return j;
}
const amankan = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Teks biasa → HTML artikel: baris kosong = paragraf baru, "## Judul" = subjudul, "- butir" = daftar
export function teksKeHtml(teks) {
  return String(teks || '').replace(/\r/g, '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b => {
    if (/^##\s+/.test(b)) return `<h2>${amankan(b.replace(/^##\s+/, ''))}</h2>`;
    const baris = b.split('\n');
    if (baris.every(x => /^[-•]\s+/.test(x))) return '<ul>' + baris.map(x => `<li>${amankan(x.replace(/^[-•]\s+/, ''))}</li>`).join('') + '</ul>';
    return `<p>${baris.map(amankan).join('<br>')}</p>`;
  }).join('\n');
}
