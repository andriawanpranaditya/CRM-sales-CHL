// Halaman publik Flash Sale Bio District: /flashsale (tanpa login)
// Isi halaman = public/flashsale/app.html; di sini hanya ditambah pratinjau link (WhatsApp / media sosial).
export const dynamic = 'force-dynamic';

let simpan = null; // { v, html } — dibaca sekali per versi aplikasi
const aman = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function GET(req) {
  const h = req.headers, asal = `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`, q = new URL(req.url).search;
  const versi = process.env.NEXT_PUBLIC_APP_VER || 'dev';
  try {
    if (!simpan || simpan.v !== versi) {
      const r = await fetch(asal + '/flashsale/app.html', { cache: 'no-store' });
      if (!r.ok) throw new Error('app.html ' + r.status);
      simpan = { v: versi, html: await r.text() };
    }
    const judul = 'Flash Sale Bio District · 11–13 Desember 2026', ket = 'Diskon s.d. Rp500 juta, hadiah langsung tanpa diundi, kuota terbatas. Daftar sekarang.';
    const og = `<meta property="og:type" content="website"><meta property="og:site_name" content="Bio District Serpong"><meta property="og:url" content="${aman(asal + '/flashsale')}">
<meta property="og:title" content="${aman(judul)}"><meta property="og:description" content="${aman(ket)}">
<meta property="og:image" content="${aman(asal + '/flashsale/assets/og-flashsale.jpg')}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">`;
    return new Response(simpan.html.replace('<!--OG-->', og), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('flashsale page', e);
    return Response.redirect(asal + '/flashsale/app.html' + q, 302);
  }
}
