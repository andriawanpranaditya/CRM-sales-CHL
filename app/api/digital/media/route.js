import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Alamat gambar sementara untuk Instagram. Instagram hanya mau mengambil gambar dari alamat publik,
// jadi alamat ini TIDAK memakai login — pengamannya kunci acak sekali pakai; barisnya dihapus begitu posting selesai
// (atau otomatis setelah 1 jam).
export async function GET(req) {
  const q = new URL(req.url).searchParams, id = Number(q.get('id')), k = String(q.get('k') || '');
  if (!id || k.length < 20) return new Response('Tidak ditemukan', { status: 404 });
  try {
    const r = await db()`SELECT mime, data FROM dm_media WHERE id = ${id} AND kunci = ${k} AND created_at > now() - interval '1 hour'`;
    if (!r.length) return new Response('Tidak ditemukan', { status: 404 });
    return new Response(Buffer.from(r[0].data, 'base64'), { headers: { 'Content-Type': r[0].mime || 'image/jpeg', 'Cache-Control': 'no-store' } });
  } catch { return new Response('Tidak ditemukan', { status: 404 }); }
}
