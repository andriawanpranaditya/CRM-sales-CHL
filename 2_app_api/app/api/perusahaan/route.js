import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Data perusahaan per project: kop dokumen, NPWP, rekening, dan kode penomoran
export async function GET() {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = await sql`SELECT * FROM perusahaan ORDER BY project`;
  return Response.json(rows);
}

export async function POST(req) {
  const { user, err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const b = await req.json();
  const project = String(b.project || '').trim();
  const pers = String(b.pers || '').trim().toUpperCase();
  if (!project) return Response.json({ error: 'Project wajib dipilih' }, { status: 400 });
  if (!/^[A-Z0-9]{2,6}$/.test(pers)) {
    return Response.json({ error: 'Kode perusahaan 2–6 huruf/angka tanpa spasi, mis. BIO' }, { status: 400 });
  }
  const sql = db();
  // Kode perusahaan terkunci setelah penomoran legal aktif — mengubahnya
  // akan memutus kesinambungan nomor dokumen yang sudah beredar.
  const lama = await sql`SELECT pers, penomoran_aktif FROM perusahaan WHERE project = ${project}`;
  if (lama.length && lama[0].penomoran_aktif && lama[0].pers !== pers) {
    return Response.json({ error: 'Kode perusahaan tidak dapat diubah setelah penomoran legal aktif.' }, { status: 400 });
  }
  const v = k => String(b[k] || '').trim();
  await sql`INSERT INTO perusahaan (project, pers, nama_pt, npwp, alamat, alamat_npwp, alamat_project,
      telp, fax, email, rek_bank, rek_no, rek_an, rek_cabang, updated_by, updated_at)
    VALUES (${project}, ${pers}, ${v('nama_pt')}, ${v('npwp')}, ${v('alamat')}, ${v('alamat_npwp')}, ${v('alamat_project')},
      ${v('telp')}, ${v('fax')}, ${v('email')}, ${v('rek_bank')}, ${v('rek_no')}, ${v('rek_an')}, ${v('rek_cabang')},
      ${user.name}, now())
    ON CONFLICT (project) DO UPDATE SET pers = EXCLUDED.pers, nama_pt = EXCLUDED.nama_pt, npwp = EXCLUDED.npwp,
      alamat = EXCLUDED.alamat, alamat_npwp = EXCLUDED.alamat_npwp, alamat_project = EXCLUDED.alamat_project,
      telp = EXCLUDED.telp, fax = EXCLUDED.fax, email = EXCLUDED.email,
      rek_bank = EXCLUDED.rek_bank, rek_no = EXCLUDED.rek_no, rek_an = EXCLUDED.rek_an, rek_cabang = EXCLUDED.rek_cabang,
      updated_by = EXCLUDED.updated_by, updated_at = now()`;
  return Response.json({ ok: true });
}
