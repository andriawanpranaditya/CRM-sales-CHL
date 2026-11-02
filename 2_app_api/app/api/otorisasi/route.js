import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { JABATAN_OTORISASI, kodeOtorisasi, sidikRantai, daftarTindakan, penyetujuSah } from '@/lib/otorisasi';

export const dynamic = 'force-dynamic';

const ipDari = req => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '-';

// GET: daftar permintaan otorisasi + hak pengguna saat ini
export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const q = new URL(req.url).searchParams;

  const me = (await sql`SELECT id, name, kode_petugas, jabatan, divisi, pin_hash FROM users WHERE id = ${user.id}`)[0] || {};
  const punyaPin = !!me.pin_hash;

  // Delegasi yang sedang dipegang pengguna ini
  const delegasi = await sql`SELECT d.*, p.name AS pemberi_nama, p.kode_petugas AS pemberi_kode,
      d.mulai::text AS mulai, d.selesai::text AS selesai
    FROM delegasi d JOIN users p ON p.id = d.pemberi_id
    WHERE d.pengganti_id = ${user.id} AND d.aktif = true
      AND CURRENT_DATE BETWEEN d.mulai AND d.selesai`;

  const jabatanSaya = [me.jabatan, ...delegasi.map(d => d.jabatan)].filter(Boolean);
  const divisiSaya = [me.divisi, ...delegasi.map(d => d.divisi)].filter(Boolean);

  const semua = q.get('semua') === '1' || user.role === 'administrator';
  const rows = semua
    ? await sql`SELECT * FROM otorisasi ORDER BY (status = 'Menunggu') DESC, id DESC LIMIT 200`
    : await sql`SELECT * FROM otorisasi
        WHERE diminta_oleh_id = ${user.id}
           OR (status = 'Menunggu' AND jabatan = ANY(${jabatanSaya})
               AND (divisi IS NULL OR divisi = '' OR divisi = ANY(${divisiSaya})))
        ORDER BY (status = 'Menunggu') DESC, id DESC LIMIT 200`;

  // Yang menunggu keputusan saya
  const giliranSaya = rows.filter(r => r.status === 'Menunggu'
    && jabatanSaya.includes(r.jabatan)
    && (!r.divisi || divisiSaya.includes(r.divisi)));

  return Response.json({
    rows, giliranSaya: giliranSaya.map(r => r.id),
    jabatan: JABATAN_OTORISASI,
    tindakan: await daftarTindakan(sql),
    me: { name: me.name, kode: me.kode_petugas, jabatan: me.jabatan, divisi: me.divisi,
      role: user.role, punyaPin },
    delegasi,
  });
}

// POST: ajukan permintaan otorisasi (dipanggil sistem saat tindakan ditahan)
export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const sql = db();
  const tindakan = await daftarTindakan(sql);
  const t = tindakan[b.jenis];
  if (!t) return Response.json({ error: 'Jenis tindakan tidak dikenal' }, { status: 400 });

  const me = (await sql`SELECT name, kode_petugas FROM users WHERE id = ${user.id}`)[0] || {};
  const ada = await sql`SELECT id FROM otorisasi
    WHERE jenis = ${b.jenis} AND objek = ${b.objek} AND objek_id = ${b.objek_id}
      AND status = 'Menunggu'`;
  if (ada.length) return Response.json({ ok: true, id: ada[0].id, sudahAda: true });

  const ins = await sql`INSERT INTO otorisasi
    (jenis, objek, objek_id, ringkas, nilai, jabatan, divisi,
     diminta_oleh_id, diminta_oleh, diminta_kode)
    VALUES (${b.jenis}, ${b.objek}, ${b.objek_id}, ${b.ringkas || ''}, ${Number(b.nilai) || 0},
            ${t.oleh}, ${t.divisi || null}, ${user.id}, ${me.name || user.name}, ${me.kode_petugas || ''})
    RETURNING id`;

  // Beri tahu pemegang jabatan dan penggantinya
  const { asli, ganti } = await penyetujuSah(sql, t.oleh, t.divisi, t.alternatif);
  const ids = [...asli.map(x => x.id), ...ganti.map(x => x.id)];
  if (ids.length) {
    const us = await sql`SELECT DISTINCT role FROM users WHERE id = ANY(${ids})`;
    for (const u of us) {
      await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan)
        VALUES (${u.role}, 'Menunggu otorisasi Anda', ${t.nama + ' — ' + (b.ringkas || '')})`;
    }
  }
  return Response.json({ ok: true, id: ins[0].id });
}

// PATCH: setujui atau tolak — wajib PIN otorisasi
export async function PATCH(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id || !['Disetujui', 'Ditolak'].includes(b.keputusan)) {
    return Response.json({ error: 'Permintaan tidak valid' }, { status: 400 });
  }
  if (!String(b.pin || '').trim()) {
    return Response.json({ error: 'PIN otorisasi wajib diisi.' }, { status: 400 });
  }
  if (b.keputusan === 'Ditolak' && !String(b.alasan || '').trim()) {
    return Response.json({ error: 'Isi alasan penolakan.' }, { status: 400 });
  }

  const sql = db();
  const me = (await sql`SELECT id, name, kode_petugas, jabatan, divisi, pin_hash FROM users WHERE id = ${user.id}`)[0];
  if (!me || !me.pin_hash) {
    return Response.json({ error: 'Anda belum menetapkan PIN otorisasi. Buka menu Otorisasi untuk menetapkannya.' }, { status: 400 });
  }
  const cocok = await bcrypt.compare(String(b.pin), me.pin_hash);
  if (!cocok) return Response.json({ error: 'PIN otorisasi salah.' }, { status: 403 });

  const cur = await sql`SELECT * FROM otorisasi WHERE id = ${b.id}`;
  if (!cur.length) return Response.json({ error: 'Permintaan tidak ditemukan' }, { status: 404 });
  const o = cur[0];
  if (o.status !== 'Menunggu') return Response.json({ error: 'Permintaan ini sudah diputus.' }, { status: 400 });

  // Berwenang sebagai pemegang jabatan sendiri, atau sebagai pengganti
  let mewakili = null, mewakiliKode = null, delegasiId = null;
  const sesuaiDivisi = !o.divisi || o.divisi === me.divisi;
  if (!(me.jabatan === o.jabatan && sesuaiDivisi)) {
    const d = await sql`SELECT d.*, p.name AS pemberi_nama, p.kode_petugas AS pemberi_kode
      FROM delegasi d JOIN users p ON p.id = d.pemberi_id
      WHERE d.pengganti_id = ${me.id} AND d.jabatan = ${o.jabatan} AND d.aktif = true
        AND CURRENT_DATE BETWEEN d.mulai AND d.selesai
        AND (d.divisi IS NULL OR d.divisi = ${o.divisi || null} OR ${o.divisi || ''} = '')`;
    if (!d.length) {
      return Response.json({ error: 'Anda tidak berwenang mengotorisasi permintaan ini.' }, { status: 403 });
    }
    mewakili = d[0].pemberi_nama; mewakiliKode = d[0].pemberi_kode; delegasiId = d[0].id;
  }

  const waktu = new Date().toISOString();
  const isi = { jenis: o.jenis, objek: o.objek, objek_id: o.objek_id, jabatan: o.jabatan,
    user_id: me.id, waktu, keputusan: b.keputusan };
  const kode = kodeOtorisasi(isi);
  const terakhir = await sql`SELECT sidik FROM otorisasi WHERE sidik IS NOT NULL ORDER BY id DESC LIMIT 1`;
  const sidik = sidikRantai(terakhir.length ? terakhir[0].sidik : null, { ...isi, kode });

  await sql`UPDATE otorisasi SET status = ${b.keputusan}, keputusan = ${b.keputusan},
      alasan = ${b.alasan || ''}, oleh_id = ${me.id}, oleh = ${me.name},
      oleh_kode = ${me.kode_petugas || ''}, oleh_jabatan = ${o.jabatan},
      mewakili = ${mewakili}, mewakili_kode = ${mewakiliKode}, delegasi_id = ${delegasiId},
      kode = ${kode}, sidik = ${sidik}, sidik_sebelum = ${terakhir.length ? terakhir[0].sidik : null},
      ip = ${ipDari(req)}, diputus_at = ${waktu}
    WHERE id = ${o.id}`;

  const pemohon = await sql`SELECT role FROM users WHERE id = ${o.diminta_oleh_id}`;
  if (pemohon.length) {
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan)
      VALUES (${pemohon[0].role},
              ${b.keputusan === 'Disetujui' ? 'Otorisasi disetujui' : 'Otorisasi ditolak'},
              ${(o.ringkas || '') + (b.alasan ? ' — ' + b.alasan : '')})`;
  }
  return Response.json({ ok: true, kode, keputusan: b.keputusan });
}
