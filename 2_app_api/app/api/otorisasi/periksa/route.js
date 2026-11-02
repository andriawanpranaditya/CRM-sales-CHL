import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { kodeOtorisasi, sidikRantai, kodeSama } from '@/lib/otorisasi';

export const dynamic = 'force-dynamic';

// Periksa keaslian satu kode otorisasi, sekaligus uji keutuhan rantai jejak.
export async function GET(req) {
  const { err } = await requireUser(); if (err) return err;
  const q = new URL(req.url).searchParams;
  const sql = db();

  // Pemeriksaan menyeluruh: rantai jejak dari catatan pertama sampai terakhir
  if (q.get('rantai') === '1') {
    const rows = await sql`SELECT * FROM otorisasi WHERE sidik IS NOT NULL ORDER BY id`;
    let sebelum = null, rusak = [];
    for (const r of rows) {
      const isi = { jenis: r.jenis, objek: r.objek, objek_id: r.objek_id, jabatan: r.jabatan,
        user_id: r.oleh_id, waktu: new Date(r.diputus_at).toISOString(), keputusan: r.keputusan };
      const kodeUlang = kodeOtorisasi(isi);
      const sidikUlang = sidikRantai(sebelum, { ...isi, kode: r.kode });
      if (!kodeSama(kodeUlang, r.kode) || sidikUlang !== r.sidik) {
        rusak.push({ id: r.id, kode: r.kode, ringkas: r.ringkas,
          sebab: !kodeSama(kodeUlang, r.kode) ? 'Kode tidak cocok dengan isi keputusan'
            : 'Rantai jejak terputus — catatan sebelumnya berubah atau dihapus' });
      }
      sebelum = r.sidik;
    }
    return Response.json({ total: rows.length, utuh: rusak.length === 0, rusak });
  }

  const kode = String(q.get('kode') || '').trim().toUpperCase();
  if (!kode) return Response.json({ error: 'Kode otorisasi wajib diisi' }, { status: 400 });
  const r = (await sql`SELECT * FROM otorisasi WHERE kode = ${kode}`)[0];
  if (!r) return Response.json({ sah: false, pesan: 'Kode tidak ditemukan. Dokumen patut dipertanyakan keasliannya.' });

  const isi = { jenis: r.jenis, objek: r.objek, objek_id: r.objek_id, jabatan: r.jabatan,
    user_id: r.oleh_id, waktu: new Date(r.diputus_at).toISOString(), keputusan: r.keputusan };
  const sah = kodeSama(kodeOtorisasi(isi), r.kode);

  return Response.json({
    sah,
    pesan: sah ? 'Kode sah dan cocok dengan catatan sistem.'
      : 'Kode ditemukan namun tidak cocok dengan isi keputusan — data kemungkinan telah diubah.',
    data: {
      kode: r.kode, tindakan: r.ringkas, jenis: r.jenis, nilai: r.nilai,
      keputusan: r.keputusan, alasan: r.alasan,
      oleh: r.oleh, oleh_kode: r.oleh_kode, jabatan: r.oleh_jabatan,
      mewakili: r.mewakili, mewakili_kode: r.mewakili_kode,
      diminta_oleh: r.diminta_oleh, diminta_kode: r.diminta_kode,
      diputus_at: r.diputus_at,
    },
  });
}
