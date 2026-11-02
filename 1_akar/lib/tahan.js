import { daftarTindakan, penyetujuSah } from '@/lib/otorisasi';

// Penahan tindakan: dipanggil di dalam API sebelum tindakan dijalankan.
// Mengembalikan null bila boleh lanjut, atau Response penolakan bila ditahan.
//
// Alur: tindakan pertama kali dipanggil -> permintaan otorisasi dibuat dan
// tindakan ditolak sementara. Setelah pejabat menyetujui, pemanggilan berikutnya
// menemukan otorisasi berstatus Disetujui dan diteruskan.
export async function tahanSampaiDiotorisasi(sql, user, { jenis, objek, objek_id, ringkas, nilai }) {
  const tindakan = await daftarTindakan(sql);
  const t = tindakan[jenis];
  if (!t || !t.aktif) return null;                       // tidak ditahan

  const ada = await sql`SELECT * FROM otorisasi
    WHERE jenis = ${jenis} AND objek = ${objek} AND objek_id = ${objek_id}
    ORDER BY id DESC LIMIT 1`;

  if (ada.length && ada[0].status === 'Disetujui') return null;   // sudah diotorisasi

  if (ada.length && ada[0].status === 'Ditolak') {
    return Response.json({
      error: 'Tindakan ini ditolak ' + (ada[0].oleh || 'pejabat berwenang') +
        (ada[0].alasan ? ': ' + ada[0].alasan : '') +
        '. Ajukan ulang setelah diperbaiki.',
      otorisasi: 'ditolak', otorisasi_id: ada[0].id,
    }, { status: 403 });
  }

  if (ada.length && ada[0].status === 'Menunggu') {
    return Response.json({
      error: 'Tindakan ini menunggu otorisasi ' + t.oleh_label +
        (t.alternatif && t.alternatif.length ? ' (atau pejabat setingkat)' : '') + '. Belum dapat dilanjutkan.',
      otorisasi: 'menunggu', otorisasi_id: ada[0].id,
    }, { status: 202 });
  }

  // Belum pernah diajukan — buat permintaan sekarang
  const me = (await sql`SELECT name, kode_petugas FROM users WHERE id = ${user.id}`)[0] || {};
  const ins = await sql`INSERT INTO otorisasi
    (jenis, objek, objek_id, ringkas, nilai, jabatan, divisi,
     diminta_oleh_id, diminta_oleh, diminta_kode)
    VALUES (${jenis}, ${objek}, ${objek_id}, ${ringkas || ''}, ${Number(nilai) || 0},
            ${t.oleh}, ${t.divisi || null}, ${user.id}, ${me.name || user.name}, ${me.kode_petugas || ''})
    RETURNING id`;

  const { asli, ganti } = await penyetujuSah(sql, t.oleh, t.divisi, t.alternatif);
  const ids = [...asli.map(x => x.id), ...ganti.map(x => x.id)];
  if (ids.length) {
    const us = await sql`SELECT DISTINCT role FROM users WHERE id = ANY(${ids})`;
    for (const u of us) {
      await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan)
        VALUES (${u.role}, 'Menunggu otorisasi Anda', ${t.nama + ' — ' + (ringkas || '')})`;
    }
  }
  return Response.json({
    error: 'Permintaan otorisasi dikirim. Tindakan dilanjutkan setelah disetujui pejabat berwenang.',
    otorisasi: 'diajukan', otorisasi_id: ins[0].id,
  }, { status: 202 });
}

// Beberapa persetujuan sekaligus untuk satu tindakan: SEMUA permintaan diajukan dalam satu kali
// panggilan (penyetuju dapat memutuskan paralel). null = semua sudah disetujui / tidak ditahan.
export async function tahanBeberapa(sql, user, daftar) {
  const ditahan = [];
  for (const d of daftar) { const r = await tahanSampaiDiotorisasi(sql, user, d); if (r) ditahan.push({ r, d }); }
  if (!ditahan.length) return null;
  const ditolak = ditahan.find(x => x.r.status === 403);
  if (ditolak) return ditolak.r;
  if (ditahan.length === 1) return ditahan[0].r;
  const tindakan = await daftarTindakan(sql);
  return Response.json({
    error: 'Permintaan otorisasi dikirim untuk: ' + ditahan.map(x => (tindakan[x.d.jenis] || {}).nama || x.d.jenis).join(' · ') +
      '. Tindakan dilanjutkan setelah semuanya disetujui.', otorisasi: 'diajukan',
  }, { status: 202 });
}
