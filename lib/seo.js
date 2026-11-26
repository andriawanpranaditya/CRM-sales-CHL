// ===== SEO website (Search Console + GA4) — tabel tambahan & aturan bersama =====
// Tabel dibuat otomatis saat pertama dipakai (tidak perlu menjalankan /api/setup).
let siap = false;
export async function siapkanSeo(sql) {
  if (siap) return;
  // Total harian seluruh situs (termasuk kata kunci yang disembunyikan Google demi privasi)
  await sql`CREATE TABLE IF NOT EXISTS mi_gsc_total (tgl date PRIMARY KEY, clicks integer DEFAULT 0, impressions integer DEFAULT 0, position numeric DEFAULT 0)`;
  // Per halaman per hari
  await sql`CREATE TABLE IF NOT EXISTS mi_gsc_page (tgl date NOT NULL, page text NOT NULL, clicks integer DEFAULT 0, impressions integer DEFAULT 0, position numeric DEFAULT 0,
    PRIMARY KEY (tgl, page))`;
  // Halaman pertama yang dibuka pengunjung dari pencarian organik (GA4)
  await sql`CREATE TABLE IF NOT EXISTS mi_ga4_landing (tgl date NOT NULL, page text NOT NULL, sessions integer DEFAULT 0, key_events integer DEFAULT 0,
    PRIMARY KEY (tgl, page))`;
  siap = true;
}

// Kata kunci brand: orang yang sudah tahu Bio District. Selebihnya = non-brand (ukuran SEO sebenarnya).
export const BRAND_RE = /bio\s*-?\s*dis|biodis|\bb\s+district\b/i;
export const isBrand = q => BRAND_RE.test(String(q || ''));

// https://biodistrictofficial.com/2026/10/29/rumah-corner/?x=1 → /2026/10/29/rumah-corner/
export function jalur(u) {
  let p = String(u || '');
  try { if (/^https?:\/\//i.test(p)) p = new URL(p).pathname; } catch {}
  p = p.split('?')[0].split('#')[0] || '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p)) p += '/';
  return p;
}
