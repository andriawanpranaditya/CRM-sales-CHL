import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { TAHAP_IOM, JABATAN, infoIom, bolehProses, nomorIom, KODE_DIVISI, SLA_HARI } from '@/lib/iom';

export const dynamic = 'force-dynamic';

// Jabatan dibaca dari database, bukan dari sesi, agar perubahan wewenang
// langsung berlaku tanpa menunggu pengguna login ulang.
async function profil(sql, user) {
  const r = await sql`SELECT jabatan, divisi FROM users WHERE id = ${user.id}`;
  return { ...user, jabatan: (r[0] && r[0].jabatan) || '', divisi: (r[0] && r[0].divisi) || '' };
}

// GET: daftar IOM + wewenang pengguna saat ini
export async function GET() {
  const { user: sesi, err } = await requireUser(); if (err) return err;
  const sql = db();
  const user = await profil(sql, sesi);
  const rows = await sql`
    SELECT i.*, (CURRENT_DATE - i.masuk_pos_at::date)::int AS hari_di_pos,
      (SELECT count(*)::int FROM iom_log g WHERE g.iom_id = i.id) AS jml_log,
      (SELECT count(*)::int FROM iom_files f WHERE f.iom_id = i.id) AS jml_file
    FROM iom i
    ORDER BY (i.status = 'Cair') ASC, i.id DESC LIMIT 200`;

  return Response.json({
    rows, tahap: TAHAP_IOM, jabatan: JABATAN, sla: SLA_HARI,
    me: { name: user.name, role: user.role, jabatan: user.jabatan || '', divisi: user.divisi || '' },
  });
}

// POST: ajukan IOM baru
export async function POST(req) {
  const { user: sesi, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  for (const f of ['jenis', 'perihal']) {
    if (!String(b[f] || '').trim()) return Response.json({ error: 'Lengkapi ' + f + ' terlebih dahulu.' }, { status: 400 });
  }
  if (Number(b.nominal) < 0) return Response.json({ error: 'Nominal tidak boleh negatif.' }, { status: 400 });

  const sql = db();
  const user = await profil(sql, sesi);
  const divisi = String(b.divisi || user.divisi || 'Umum');
  const kode = KODE_DIVISI[divisi] || 'UM';
  const th = new Date().getFullYear();
  const urut = await sql`SELECT count(*)::int AS n FROM iom
    WHERE date_part('year', created_at) = ${th}`;
  let no = nomorIom(kode, urut[0].n + 1);
  // Jaga-jaga bila nomor sudah terpakai
  const ada = await sql`SELECT 1 FROM iom WHERE no = ${no}`;
  if (ada.length) no = nomorIom(kode, urut[0].n + 1 + Math.floor(Math.random() * 90) + 10);

  const ins = await sql`INSERT INTO iom (no, jenis, divisi, perihal, uraian, nominal, ref_budget,
      lampiran, lampiran_nama, tahap, pengaju, pengaju_username)
    VALUES (${no}, ${b.jenis}, ${divisi}, ${b.perihal}, ${b.uraian || ''}, ${Number(b.nominal) || 0},
            ${b.ref_budget || ''}, ${b.lampiran || null}, ${b.lampiran_nama || null},
            2, ${user.name}, ${user.username})
    RETURNING id`;
  const id = ins[0].id;
  await sql`INSERT INTO iom_log (iom_id, tahap, pos, oleh, jabatan, keputusan, alasan)
    VALUES (${id}, 1, 'Pengajuan', ${user.name}, ${user.jabatan || ''}, 'Diajukan',
            ${'Diajukan melalui ' + (b.sumber === 'unggah' ? 'unggahan berkas' : 'form aplikasi')})`;
  await kabari(sql, 'kadiv', 'IOM baru menunggu verifikasi Anda', no + ' - ' + b.perihal);
  return Response.json({ ok: true, no, id });
}

// PATCH: setujui / tolak / ajukan ulang
export async function PATCH(req) {
  const { user: sesi, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const user = await profil(sql, sesi);
  const cur = await sql`SELECT * FROM iom WHERE id = ${b.id}`;
  if (!cur.length) return Response.json({ error: 'IOM tidak ditemukan' }, { status: 404 });
  const iom = cur[0];
  if (iom.status === 'Cair') return Response.json({ error: 'IOM ini sudah selesai.' }, { status: 400 });

  // --- Pengaju mengirim ulang IOM yang dikembalikan ---
  if (b.aksi === 'ajukan_ulang') {
    if (!iom.revisi) return Response.json({ error: 'IOM ini tidak sedang dalam status revisi.' }, { status: 400 });
    if (user.username !== iom.pengaju_username && user.role !== 'manager') {
      return Response.json({ error: 'Hanya pengaju yang dapat mengirim ulang IOM ini.' }, { status: 403 });
    }
    await sql`UPDATE iom SET tahap = 2, revisi = false, catatan_revisi = null,
        status = 'Berjalan', masuk_pos_at = now(),
        perihal = COALESCE(${b.perihal || null}, perihal),
        uraian = COALESCE(${b.uraian || null}, uraian),
        nominal = COALESCE(${b.nominal ? Number(b.nominal) : null}, nominal),
        ref_budget = COALESCE(${b.ref_budget || null}, ref_budget)
      WHERE id = ${iom.id}`;
    await sql`INSERT INTO iom_log (iom_id, tahap, pos, oleh, jabatan, keputusan, alasan)
      VALUES (${iom.id}, 1, 'Pengajuan ulang', ${user.name}, ${user.jabatan || ''}, 'Diajukan', ${b.alasan || 'Perbaikan telah dilakukan'})`;
    await kabari(sql, 'kadiv', 'IOM diajukan ulang', iom.no + ' - ' + iom.perihal);
    return Response.json({ ok: true });
  }

  const pos = infoIom(iom.tahap);
  if (!bolehProses(user, iom.tahap)) {
    return Response.json({ error: 'IOM ini menunggu ' + (JABATAN[pos.pic] || 'pihak lain') + '.' }, { status: 403 });
  }
  if (!String(b.alasan || '').trim()) {
    return Response.json({ error: 'Isi alasan keputusan — tercatat pada jejak persetujuan.' }, { status: 400 });
  }

  // --- Tolak: kembalikan ke pengaju untuk revisi ---
  if (b.aksi === 'tolak') {
    await sql`UPDATE iom SET revisi = true, status = 'Revisi', catatan_revisi = ${b.alasan},
        tahap = 1, masuk_pos_at = now() WHERE id = ${iom.id}`;
    await sql`INSERT INTO iom_log (iom_id, tahap, pos, oleh, jabatan, keputusan, alasan)
      VALUES (${iom.id}, ${iom.tahap}, ${pos.nama}, ${user.name}, ${user.jabatan || user.role}, 'Dikembalikan', ${b.alasan})`;
    await kabariUser(sql, iom.pengaju_username, 'IOM dikembalikan untuk revisi', iom.no + ' - ' + b.alasan);
    return Response.json({ ok: true });
  }

  // --- Setuju: maju ke pos berikutnya ---
  const lanjut = Number(iom.tahap) + 1;
  const next = infoIom(lanjut);
  const selesai = lanjut >= TAHAP_IOM.length;
  await sql`UPDATE iom SET tahap = ${lanjut}, masuk_pos_at = now(),
      status = ${selesai ? 'Cair' : 'Berjalan'},
      selesai_at = ${selesai ? new Date().toISOString() : null}
    WHERE id = ${iom.id}`;
  await sql`INSERT INTO iom_log (iom_id, tahap, pos, oleh, jabatan, keputusan, alasan)
    VALUES (${iom.id}, ${iom.tahap}, ${pos.nama}, ${user.name}, ${user.jabatan || user.role},
            ${iom.tahap >= 7 ? 'Diproses' : 'Disetujui'}, ${b.alasan})`;

  if (next.pic) await kabari(sql, next.pic, 'IOM menunggu tindakan Anda', iom.no + ' - ' + iom.perihal);
  if (selesai) await kabariUser(sql, iom.pengaju_username, 'Dana IOM telah cair', iom.no + ' - ' + iom.perihal);
  return Response.json({ ok: true, tahap: lanjut, nama: next.nama });
}

// Notifikasi ke seluruh pemegang jabatan tertentu
async function kabari(sql, jabatan, judul, pesan) {
  const us = await sql`SELECT role FROM users WHERE jabatan = ${jabatan} AND active = true`;
  const roles = [...new Set(us.map(u => u.role))];
  for (const r of roles) {
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan) VALUES (${r}, ${judul}, ${pesan})`;
  }
}
async function kabariUser(sql, username, judul, pesan) {
  if (!username) return;
  const u = await sql`SELECT role FROM users WHERE username = ${username}`;
  if (u.length) await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan) VALUES (${u[0].role}, ${judul}, ${pesan})`;
}
