import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { TAHAP_IOM, JABATAN, JENIS_IOM, infoIom } from '@/lib/iom';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

// Kode verifikasi per pos persetujuan. Dihitung dari isi keputusan itu sendiri,
// sehingga tidak dapat dibuat ulang bila datanya diubah.
function kodeVerifikasi(iomNo, log) {
  const bahan = [iomNo, log.pos, log.oleh, log.keputusan, log.created_at, process.env.SETUP_KEY || ''].join('|');
  return createHash('sha256').update(bahan).digest('hex').slice(0, 8).toUpperCase();
}

export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();

  const r = await sql`SELECT * FROM iom WHERE id = ${id}`;
  if (!r.length) return Response.json({ error: 'IOM tidak ditemukan' }, { status: 404 });
  const iom = r[0];

  const log = await sql`SELECT g.*, u.kode_petugas
    FROM iom_log g LEFT JOIN users u ON u.name = g.oleh
    WHERE g.iom_id = ${id} ORDER BY g.id`;
  const files = await sql`SELECT filename, ukuran, sidik, uploaded_by, created_at
    FROM iom_files WHERE iom_id = ${id} ORDER BY id`;

  // Susun blok pengesahan: satu baris per pos yang sudah memberi keputusan
  const pengesahan = log
    .filter(l => l.keputusan === 'Disetujui' || l.keputusan === 'Diproses')
    .map(l => ({
      pos: l.pos, oleh: l.oleh, kode_petugas: l.kode_petugas || '',
      jabatan: JABATAN[l.jabatan] || l.jabatan || '',
      keputusan: l.keputusan, alasan: l.alasan,
      waktu: l.created_at, kode: kodeVerifikasi(iom.no, l),
    }));

  // Pos yang belum memberi keputusan — ditampilkan sebagai menunggu
  const sudah = new Set(log.map(l => l.tahap));
  const menunggu = TAHAP_IOM
    .filter(t => t.pic && t.no >= Number(iom.tahap) && !sudah.has(t.no) && iom.status !== 'Cair')
    .map(t => ({ pos: t.nama, jabatan: JABATAN[t.pic] || t.pic }));

  return Response.json({
    ...iom,
    jenis_label: JENIS_IOM[iom.jenis] || iom.jenis,
    tahap_label: infoIom(iom.tahap).nama,
    pengesahan, menunggu, files,
    diajukan_log: log.find(l => l.keputusan === 'Diajukan') || null,
    pencetak: user.name,
  });
}
