import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { JENIS_DOK, pratinjauNomor, tanggalJakarta, polaEfektif, validasiPola } from '@/lib/penomoran';

export const dynamic = 'force-dynamic';

// GET ?project= -> status penomoran, urutan tahun berjalan, pratinjau, riwayat perubahan
export async function GET(req) {
  const { err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const project = new URL(req.url).searchParams.get('project') || '';
  const sql = db();
  const p = await sql`SELECT project, pers, penomoran_aktif FROM perusahaan WHERE project = ${project}`;
  const { tahun } = tanggalJakarta();
  const urut = await sql`SELECT jenis, tahun, last_no, updated_at FROM document_sequences
    WHERE project = ${project} ORDER BY tahun DESC, jenis`;
  const jenis = [];
  for (const [kode, def] of Object.entries(JENIS_DOK)) {
    const r = urut.find(u => u.jenis === kode && u.tahun === tahun);
    jenis.push({ kode, nama: def.nama, pola: await polaEfektif(sql, kode), fleksibel: Boolean(def.fleksibel), terakhir: r ? r.last_no : 0,
      berikut: p.length ? await pratinjauNomor(sql, project, kode) : null });
  }
  const log = await sql`SELECT * FROM penomoran_log WHERE project = ${project} ORDER BY id DESC LIMIT 20`;
  return Response.json({ perusahaan: p[0] || null, tahun, jenis, log });
}

// POST { project, jenis, tahun, last_no, alasan }            -> tetapkan nomor terakhir
// POST { project, aktif: true|false, konfirmasi, alasan }     -> aktifkan / hentikan penomoran legal
export async function POST(req) {
  const { user, err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const b = await req.json();
  const sql = db();

  // Menetapkan FORMAT nomor untuk jenis dokumen yang belum baku (kategori BAST baru). Berlaku untuk semua project.
  // Hanya boleh selama belum ada satu pun nomor yang terbit — mengubah format setelah itu membuat nomor tidak konsisten.
  if (b.aksi === 'pola') {
    const def = JENIS_DOK[b.jenis];
    if (!def || !def.fleksibel) return Response.json({ error: 'Format dokumen ini baku (sesuai PRD) dan tidak dapat diubah' }, { status: 400 });
    const alasan = String(b.alasan || '').trim();
    if (!alasan) return Response.json({ error: 'Alasan / dasar penetapan format wajib diisi' }, { status: 400 });
    const pola = String(b.pola || '').trim();
    if (pola) { const salah = validasiPola(pola); if (salah) return Response.json({ error: salah }, { status: 400 }); }
    const terbit = await sql`SELECT COALESCE(max(last_no), 0)::int AS n FROM document_sequences WHERE jenis = ${b.jenis}`;
    if (terbit[0].n > 0) return Response.json({ error: 'Sudah ada nomor ' + def.nama + ' yang terbit (urutan ' + terbit[0].n + ') — format tidak dapat diubah lagi.' }, { status: 400 });
    const r = await sql`SELECT items FROM settings WHERE key = 'penomoran_pola'`;
    const lama = (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items)) ? r[0].items : {};
    await sql`INSERT INTO settings (key, items) VALUES ('penomoran_pola', ${JSON.stringify({ ...lama, [b.jenis]: { pola, alasan, diubah_oleh: user.name, diubah_at: new Date().toISOString() } })}::jsonb)
      ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
    return Response.json({ ok: true, pola: pola || null });
  }

  const p = await sql`SELECT pers, penomoran_aktif FROM perusahaan WHERE project = ${b.project || ''}`;
  if (!p.length) return Response.json({ error: 'Lengkapi Data Perusahaan project ini lebih dulu.' }, { status: 400 });
  const alasan = String(b.alasan || '').trim();
  if (!alasan) return Response.json({ error: 'Alasan wajib diisi — perubahan penomoran legal dicatat permanen.' }, { status: 400 });

  if (typeof b.aktif === 'boolean') {
    if (b.aktif && b.konfirmasi !== 'AKTIFKAN') {
      return Response.json({ error: 'Ketik AKTIFKAN untuk mengonfirmasi.' }, { status: 400 });
    }
    await sql`UPDATE perusahaan SET penomoran_aktif = ${b.aktif}, updated_by = ${user.name}, updated_at = now()
      WHERE project = ${b.project}`;
    await sql`INSERT INTO penomoran_log (project, jenis, tahun, dari, ke, alasan, oleh)
      VALUES (${b.project}, ${b.aktif ? 'AKTIF' : 'NONAKTIF'}, NULL, NULL, NULL, ${alasan}, ${user.name})`;
    return Response.json({ ok: true });
  }

  if (!JENIS_DOK[b.jenis]) return Response.json({ error: 'Jenis dokumen tidak dikenal' }, { status: 400 });
  const tahun = Number(b.tahun) || tanggalJakarta().tahun;
  const ke = Number(b.last_no);
  if (!Number.isInteger(ke) || ke < 0) return Response.json({ error: 'Nomor terakhir harus bilangan bulat ≥ 0' }, { status: 400 });
  const lama = await sql`SELECT last_no FROM document_sequences
    WHERE project = ${b.project} AND jenis = ${b.jenis} AND tahun = ${tahun}`;
  const dari = lama.length ? lama[0].last_no : 0;
  // Menurunkan urutan setelah penomoran aktif akan menerbitkan ulang nomor yang sudah dipakai
  if (p[0].penomoran_aktif && ke < dari) {
    return Response.json({ error: 'Penomoran sudah aktif: nomor terakhir tidak boleh diturunkan (' + dari + ' → ' + ke + ') karena nomor itu sudah terbit.' }, { status: 400 });
  }
  await sql`INSERT INTO document_sequences (project, jenis, tahun, last_no, updated_at)
    VALUES (${b.project}, ${b.jenis}, ${tahun}, ${ke}, now())
    ON CONFLICT (project, jenis, tahun) DO UPDATE SET last_no = ${ke}, updated_at = now()`;
  await sql`INSERT INTO penomoran_log (project, jenis, tahun, dari, ke, alasan, oleh)
    VALUES (${b.project}, ${b.jenis}, ${tahun}, ${dari}, ${ke}, ${alasan}, ${user.name})`;
  return Response.json({ ok: true });
}
