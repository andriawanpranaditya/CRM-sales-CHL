import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanSeo, isBrand } from '@/lib/seo';

export const dynamic = 'force-dynamic';

// ===== Ringkasan SEO website (Search Console + GA4 organik) untuk tab Website & SEO =====
// ?d1=&d2= mengikuti filter periode Analisa Marcom. Pembanding = periode sebelumnya dengan panjang sama,
// hanya bila seluruhnya masih di dalam masa analisa (sejak MI_ANALISA_MULAI).
const HARI = 86400000;
const iso = t => new Date(t).toISOString().slice(0, 10);
const tambah = (d, n) => iso(Date.parse(d) + n * HARI);

export async function GET(req) {
  const { user, err } = await requireUser();
  if (err) return err;
  if (!['manager', 'ceo', 'markom'].includes(user.role)) return Response.json({ error: 'Menu ini khusus Marcom & Manager' }, { status: 403 });
  const sql = db();
  await siapkanSeo(sql);
  const q = new URL(req.url).searchParams;
  const MULAI = process.env.MI_ANALISA_MULAI || '2026-09-01';
  const kini = iso(Date.now() + 7 * 3600e3);

  const akhirGsc = (await sql`SELECT max(tgl)::text AS t FROM mi_gsc_total`)[0]?.t || null;
  if (!akhirGsc) return Response.json({ kosong: true });

  let d1 = q.get('d1') || MULAI; if (d1 < MULAI) d1 = MULAI;
  let d2 = q.get('d2') || kini; if (d2 > kini) d2 = kini;
  // Search Console terlambat ±2 hari: periode dipotong di tanggal data terakhir, GA4 dipotong sama supaya sebanding
  const e2 = d2 > akhirGsc ? akhirGsc : d2;
  if (e2 < d1) return Response.json({ kosong: true, akhirGsc, alasan: 'Data Search Console untuk periode ini belum tersedia (terlambat ±2 hari dari Google).' });
  const n = Math.round((Date.parse(e2) - Date.parse(d1)) / HARI) + 1;
  // Pembanding: periode yang mulai tgl 1 dibandingkan dengan bulan sebelumnya pada rentang tanggal yang sama
  // (Okt penuh ↔ Sep penuh, 1–22 Nov ↔ 1–22 Okt); periode lain ↔ jumlah hari yang sama tepat sebelumnya
  let p1, p2;
  const akhirBln = t => { const x = new Date(t + 'T00:00:00Z'); return iso(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)); };
  if (d1.slice(8) === '01' && e2.slice(0, 7) === d1.slice(0, 7)) {
    const x = new Date(d1 + 'T00:00:00Z'); p1 = iso(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() - 1, 1));
    const ujung = akhirBln(p1);
    p2 = (e2 === akhirBln(e2) || d2 === akhirBln(d2)) && e2 === d2 ? ujung : (p1.slice(0, 8) + e2.slice(8) > ujung ? ujung : p1.slice(0, 8) + e2.slice(8));
  } else { p2 = tambah(d1, -1); p1 = tambah(d1, -n); }
  const adaBanding = p1 >= MULAI;

  const totalGsc = async (a, b) => (await sql`SELECT COALESCE(sum(clicks), 0)::int AS klik, COALESCE(sum(impressions), 0)::int AS impresi,
      CASE WHEN sum(impressions) > 0 THEN round(sum(position * impressions) / sum(impressions), 1) END AS posisi, count(*)::int AS hari
    FROM mi_gsc_total WHERE tgl BETWEEN ${a}::date AND ${b}::date`)[0];
  const totalGa = async (a, b) => (await sql`SELECT COALESCE(sum(sessions), 0)::int AS sesi, COALESCE(sum(key_events), 0)::int AS kev
    FROM mi_ga4_daily WHERE tgl BETWEEN ${a}::date AND ${b}::date AND source_medium ILIKE '% / organic'`)[0];
  const kataKunci = async (a, b) => sql`SELECT query, sum(clicks)::int AS klik, sum(impressions)::int AS impresi,
      round(sum(position * impressions) / NULLIF(sum(impressions), 0), 1) AS posisi
    FROM mi_gsc_daily WHERE tgl BETWEEN ${a}::date AND ${b}::date GROUP BY query`;

  const [ini, lalu, gaIni, gaLalu, kkIni, kkLalu, mingguan, mingguBrand, hal, halLalu, landing] = await Promise.all([
    totalGsc(d1, e2), adaBanding ? totalGsc(p1, p2) : null,
    totalGa(d1, e2), adaBanding ? totalGa(p1, p2) : null,
    kataKunci(d1, e2), adaBanding ? kataKunci(p1, p2) : [],
    // Tren mingguan sejak awal analisa (Senin–Minggu)
    sql`SELECT date_trunc('week', tgl)::date::text AS minggu, sum(clicks)::int AS klik, sum(impressions)::int AS impresi,
          round(sum(position * impressions) / NULLIF(sum(impressions), 0), 1) AS posisi, count(*)::int AS hari
        FROM mi_gsc_total WHERE tgl BETWEEN ${MULAI}::date AND ${akhirGsc}::date GROUP BY 1 ORDER BY 1`,
    sql`SELECT date_trunc('week', tgl)::date::text AS minggu, query, sum(clicks)::int AS klik
        FROM mi_gsc_daily WHERE tgl BETWEEN ${MULAI}::date AND ${akhirGsc}::date AND clicks > 0 GROUP BY 1, 2`,
    sql`SELECT page, sum(clicks)::int AS klik, sum(impressions)::int AS impresi,
          round(sum(position * impressions) / NULLIF(sum(impressions), 0), 1) AS posisi
        FROM mi_gsc_page WHERE tgl BETWEEN ${d1}::date AND ${e2}::date GROUP BY page`,
    adaBanding ? sql`SELECT page, sum(clicks)::int AS klik FROM mi_gsc_page WHERE tgl BETWEEN ${p1}::date AND ${p2}::date GROUP BY page` : [],
    sql`SELECT page, sum(sessions)::int AS sesi, sum(key_events)::int AS kev FROM mi_ga4_landing WHERE tgl BETWEEN ${d1}::date AND ${e2}::date GROUP BY page`,
  ]);

  // Brand vs non-brand (dari kata kunci yang terlihat; sisanya disembunyikan Google demi privasi)
  const bagi = rows => rows.reduce((o, r) => { const k = isBrand(r.query) ? 'brand' : 'non'; o[k].klik += r.klik; o[k].impresi += r.impresi; return o; },
    { brand: { klik: 0, impresi: 0 }, non: { klik: 0, impresi: 0 } });
  const bIni = bagi(kkIni), bLalu = adaBanding ? bagi(kkLalu) : null;
  const anonIni = { klik: Math.max(0, ini.klik - bIni.brand.klik - bIni.non.klik), impresi: Math.max(0, ini.impresi - bIni.brand.impresi - bIni.non.impresi) };

  // Tren mingguan + pecahan brand / non-brand / tersembunyi
  const mb = new Map();
  for (const r of mingguBrand) { const o = mb.get(r.minggu) || { brand: 0, non: 0 }; o[isBrand(r.query) ? 'brand' : 'non'] += r.klik; mb.set(r.minggu, o); }
  const tren = mingguan.map(w => { const o = mb.get(w.minggu) || { brand: 0, non: 0 };
    return { ...w, brand: o.brand, non: o.non, anon: Math.max(0, w.klik - o.brand - o.non) }; });

  // Kata kunci: naik/turun posisi (muncul ≥10 kali di kedua periode) & peluang (sering muncul, posisi 4–20)
  const lama = new Map(kkLalu.map(r => [r.query, r]));
  const gerak = kkIni.filter(r => r.impresi >= 10 && lama.get(r.query)?.impresi >= 10)
    .map(r => ({ query: r.query, brand: isBrand(r.query), klik: r.klik, impresi: r.impresi, posisi: Number(r.posisi), posisiLalu: Number(lama.get(r.query).posisi),
      selisih: Math.round((Number(lama.get(r.query).posisi) - Number(r.posisi)) * 10) / 10 }));
  const naik = gerak.filter(x => x.selisih >= 0.5).sort((a, b) => b.selisih - a.selisih).slice(0, 8);
  const turun = gerak.filter(x => x.selisih <= -0.5).sort((a, b) => a.selisih - b.selisih).slice(0, 8);
  const peluang = kkIni.filter(r => !isBrand(r.query) && r.impresi >= 20 && Number(r.posisi) > 3 && Number(r.posisi) <= 20)
    .sort((a, b) => b.impresi - a.impresi).slice(0, 10).map(r => ({ ...r, posisi: Number(r.posisi) }));
  const nonBrandTop = kkIni.filter(r => !isBrand(r.query)).sort((a, b) => b.klik - a.klik || b.impresi - a.impresi).slice(0, 15).map(r => ({ ...r, posisi: Number(r.posisi) }));

  // Per halaman: Search Console + pengunjung organik & klik WA (GA4)
  const ga = new Map(landing.map(r => [r.page, r])), hl = new Map(halLalu.map(r => [r.page, r.klik]));
  const kunciHal = new Set([...hal.map(r => r.page), ...landing.map(r => r.page)]);
  const halaman = [...kunciHal].map(pg => { const g = hal.find(r => r.page === pg) || {}, a = ga.get(pg) || {};
    return { page: pg, klik: g.klik || 0, impresi: g.impresi || 0, posisi: g.posisi != null ? Number(g.posisi) : null,
      klikLalu: adaBanding ? (hl.get(pg) || 0) : null, sesi: a.sesi || 0, kev: a.kev || 0 }; })
    .sort((a, b) => b.klik - a.klik || b.sesi - a.sesi || b.impresi - a.impresi).slice(0, 25);

  return Response.json({
    periode: { d1, d2: e2, hari: n, akhirGsc, terpotong: d2 > akhirGsc }, banding: adaBanding ? { d1: p1, d2: p2 } : null, mulai: MULAI,
    ini: { ...ini, ...gaIni, ctr: ini.impresi ? ini.klik / ini.impresi : null }, lalu: lalu ? { ...lalu, ...gaLalu, ctr: lalu.impresi ? lalu.klik / lalu.impresi : null } : null,
    brand: { ini: { ...bIni, anon: anonIni }, lalu: bLalu }, tren, naik, turun, peluang, nonBrandTop, halaman,
  });
}
