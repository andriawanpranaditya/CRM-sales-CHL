import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { JABATAN_OTORISASI, TINDAKAN_DEFAULT, daftarTindakan } from '@/lib/otorisasi';

export const dynamic = 'force-dynamic';

// Pengaturan jenjang otorisasi per tindakan: siapa yang berwenang menyetujui, dan apakah ditahan.
// Disimpan di settings 'otorisasi' (menimpa nilai bawaan kode). Hanya Administrator.
export async function GET() {
  const { user, err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const sql = db();
  const dv = await sql`SELECT DISTINCT divisi FROM users WHERE COALESCE(divisi, '') <> '' AND active = true ORDER BY divisi`;
  const bawaan = [...new Set(Object.values(TINDAKAN_DEFAULT).map(t => t.divisi).filter(Boolean))];
  const pemegang = await sql`SELECT jabatan, COALESCE(divisi, '') AS divisi, count(*)::int AS n FROM users WHERE active = true AND COALESCE(jabatan, '') <> '' GROUP BY 1, 2`;
  return Response.json({ tindakan: await daftarTindakan(sql), jabatan: JABATAN_OTORISASI,
    divisi: [...new Set([...bawaan, ...dv.map(d => d.divisi)])], pemegang, oleh: user.name });
}

export async function POST(req) {
  const { user, err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const b = await req.json();
  if (!TINDAKAN_DEFAULT[b.jenis]) return Response.json({ error: 'Jenis tindakan tidak dikenal' }, { status: 400 });
  if (!JABATAN_OTORISASI[b.oleh]) return Response.json({ error: 'Jabatan penyetuju tidak dikenal' }, { status: 400 });
  const divisi = b.oleh === 'kadiv' ? String(b.divisi || '').trim() : '';
  if (b.oleh === 'kadiv' && !divisi) return Response.json({ error: 'Kepala Divisi harus menyebut divisinya (mis. Sales & Marketing)' }, { status: 400 });
  const sql = db();
  const r = await sql`SELECT items FROM settings WHERE key = 'otorisasi'`;
  const lama = (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items)) ? r[0].items : {};
  // Entri disimpan LENGKAP (nama, alternatif, dst.) karena entri di settings menggantikan bawaan kode seluruhnya
  const entri = { ...TINDAKAN_DEFAULT[b.jenis], ...(lama[b.jenis] || {}), oleh: b.oleh, divisi, aktif: Boolean(b.aktif),
    diubah_oleh: user.name, diubah_at: new Date().toISOString() };
  await sql`INSERT INTO settings (key, items) VALUES ('otorisasi', ${JSON.stringify({ ...lama, [b.jenis]: entri })}::jsonb)
    ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
  // Peringatan bila belum ada orang yang memegang jabatan tersebut — tindakan akan menunggu tanpa penyetuju
  const n = await sql`SELECT count(*)::int AS n FROM users WHERE active = true AND jabatan = ${b.oleh} AND (${divisi} = '' OR divisi = ${divisi})`;
  return Response.json({ ok: true, penyetuju: n[0].n });
}
