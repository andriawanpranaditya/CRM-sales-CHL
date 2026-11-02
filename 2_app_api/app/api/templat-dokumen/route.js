import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { DOK_BAST, TOKEN_TEMPLAT, bacaTemplat, tokenAsing } from '@/lib/templat';

export const dynamic = 'force-dynamic';

// Redaksi dokumen serah terima. Ditetapkan Legal/Administrator; kosong = hasil cetak bertanda DRAFT.
export async function GET() {
  const { err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const t = await bacaTemplat(db());
  return Response.json({ dok: Object.entries(DOK_BAST).map(([kunci, nama]) => ({ kunci, nama,
    judul: (t[kunci] && t[kunci].judul) || '', isi: (t[kunci] && t[kunci].isi) || '', terisi: Boolean(t[kunci] && String(t[kunci].isi || '').trim()),
    diubah_oleh: (t[kunci] && t[kunci].diubah_oleh) || '', diubah_at: (t[kunci] && t[kunci].diubah_at) || '' })), token: TOKEN_TEMPLAT });
}

// POST { kunci, judul, isi }
export async function POST(req) {
  const { user, err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const b = await req.json();
  if (!DOK_BAST[b.kunci]) return Response.json({ error: 'Jenis dokumen tidak dikenal' }, { status: 400 });
  const isi = String(b.isi || ''), judul = String(b.judul || '').trim();
  if (isi.length > 30000) return Response.json({ error: 'Redaksi terlalu panjang (maks 30.000 karakter)' }, { status: 400 });
  // Salah ketik isian (mis. {nma}) akan tercetak apa adanya di dokumen resmi — tolak sejak disimpan
  const asing = tokenAsing(isi + ' ' + judul);
  if (asing.length) return Response.json({ error: 'Isian tidak dikenal: ' + asing.map(x => '{' + x + '}').join(', ') + '. Yang tersedia: ' + Object.keys(TOKEN_TEMPLAT).map(x => '{' + x + '}').join(' ') }, { status: 400 });
  const sql = db();
  const t = await bacaTemplat(sql);
  await sql`INSERT INTO settings (key, items) VALUES ('templat_dokumen', ${JSON.stringify({ ...t, [b.kunci]: { judul, isi, diubah_oleh: user.name, diubah_at: new Date().toISOString() } })}::jsonb)
    ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
  return Response.json({ ok: true, terisi: Boolean(isi.trim()) });
}
