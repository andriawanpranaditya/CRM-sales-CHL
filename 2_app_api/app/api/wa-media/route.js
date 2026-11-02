import { db } from '@/lib/db';
import { requireUser, lihatBaris } from '@/lib/auth';
import { siapkanAI, ambilMedia } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Lihat lampiran WhatsApp: ?p=<id percakapan> (ambil langsung dari WhatsApp, TIDAK disimpan) atau ?lampiran=<id> (yang sudah disimpan)
// &unduh=1 untuk mengunduh sebagai file
export async function GET(req) {
  const { user, err } = await requireUser(['administrator', 'headsales', 'salesmanager', 'markom', 'sales']); if (err) return err;
  const sql = db();
  await siapkanAI(sql);
  const q = new URL(req.url).searchParams;
  const boleh = async kode => {
    if (!kode) return user.role !== 'sales';
    const l = (await sql`SELECT project, sales, created_by FROM leads WHERE lead_code = ${kode}`)[0];
    if (!l) return user.role !== 'sales';
    if (!lihatBaris(user, l)) return false;
    return user.role !== 'sales' || l.sales === user.name;
  };
  let buf, mime, nama;
  if (q.get('lampiran')) {
    const r = (await sql`SELECT lead_code, mime, nama_file, data FROM wa_lampiran WHERE id = ${Number(q.get('lampiran')) || 0}`)[0];
    if (!r) return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 });
    if (!(await boleh(r.lead_code))) return Response.json({ error: 'Bukan lampiran lead Anda' }, { status: 403 });
    buf = Buffer.from(r.data, 'base64'); mime = r.mime; nama = r.nama_file;
  } else {
    const p = (await sql`SELECT lead_code, media_id, mime, nama_file, tipe FROM wa_percakapan WHERE id = ${Number(q.get('p')) || 0}`)[0];
    if (!p || !p.media_id) return Response.json({ error: 'Pesan ini tidak berisi lampiran' }, { status: 404 });
    if (!(await boleh(p.lead_code))) return Response.json({ error: 'Bukan percakapan lead Anda' }, { status: 403 });
    try { const m = await ambilMedia(p.media_id); buf = m.buf; mime = m.mime; } catch (e) { return Response.json({ error: e.message }, { status: 502 }); }
    nama = p.nama_file || `${p.tipe || 'lampiran'}.${(mime.split('/')[1] || 'bin').split(';')[0]}`;
  }
  return new Response(buf, { headers: { 'content-type': mime || 'application/octet-stream', 'cache-control': 'private, max-age=600',
    'content-disposition': `${q.get('unduh') ? 'attachment' : 'inline'}; filename="${String(nama || 'lampiran').replace(/"/g, '')}"` } });
}
