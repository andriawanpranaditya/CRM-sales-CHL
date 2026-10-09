import { db } from '@/lib/db';
import { requireUser, bolehProyek, pesanProyek } from '@/lib/auth';
import { denganLog, bolehUbah } from '@/lib/log';

export const dynamic = 'force-dynamic';

const JENIS = ['Kanvasing', 'Open Table', 'Product Knowledge / Agent Gathering', 'Pameran & Event', 'Lainnya'];

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  // Sales melihat kegiatan yang ia ikuti atau ia input; peran lain melihat semua
  const rows = user.role === 'sales'
    ? await sql`SELECT * FROM kegiatan WHERE created_by = ${user.username} OR pic ILIKE ${'%' + user.name + '%'} ORDER BY tgl DESC, id DESC`
    : await sql`SELECT * FROM kegiatan ORDER BY tgl DESC, id DESC`;
  // Akun per project: kegiatan project lain disembunyikan (kegiatan tanpa project tetap tampil)
  if (user.projects) { const ok = rows.filter(k => !k.project || user.projects.includes(k.project)); rows.length = 0; rows.push(...ok); }
  // Penanda boleh edit/hapus: marcom boleh mengubah kegiatan yang diinput sesama tim marcom
  if (user.role === 'markom') {
    const tim = new Set((await sql`SELECT username FROM users WHERE role = 'markom'`).map(u => u.username));
    rows.forEach(k => { k.bisa_ubah = tim.has(k.created_by); });
  }
  return Response.json(rows);
}

async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!['manager', 'ceo', 'markom', 'sales'].includes(user.role)) {
    return Response.json({ error: 'Peran ini tidak bisa menginput kegiatan' }, { status: 403 });
  }
  const b = await req.json();
  if (b.project && !bolehProyek(user, b.project)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  if (!b.jenis || !JENIS.includes(b.jenis)) return Response.json({ error: 'Jenis kegiatan wajib dipilih' }, { status: 400 });
  if (!b.lokasi) return Response.json({ error: 'Lokasi / tempat wajib diisi' }, { status: 400 });
  const sql = db();
  const ins = await sql`INSERT INTO kegiatan (tgl, jenis, project, lokasi, pic, jml_lead, biaya, catatan, created_by)
    VALUES (${b.tgl || null}, ${b.jenis}, ${b.project || ''}, ${b.lokasi}, ${b.pic || ''},
            ${Number(b.jml_lead) || 0}, ${Number(b.biaya) || 0}, ${b.catatan || ''}, ${user.username})
    RETURNING id`;
  return Response.json({ ok: true, id: ins[0].id });
}

async function _PATCH(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const cur = await sql`SELECT * FROM kegiatan WHERE id = ${b.id}`;
  if (!cur.length) return Response.json({ error: 'Kegiatan tidak ditemukan' }, { status: 404 });
  // Manager bebas; peran lain hanya kegiatan yang ia input sendiri
  if (!(await bolehUbah(sql, user, cur[0].created_by))) {
    return Response.json({ error: 'Hanya manager, penginput, atau sesama tim Marcom yang bisa mengubah' }, { status: 403 });
  }
  const m = { ...cur[0] };
  ['tgl', 'jenis', 'project', 'lokasi', 'pic', 'catatan'].forEach(k => { if (k in b) m[k] = b[k]; });
  await sql`UPDATE kegiatan SET tgl = ${m.tgl || null}, jenis = ${m.jenis}, project = ${m.project || ''},
      lokasi = ${m.lokasi || ''}, pic = ${m.pic || ''}, jml_lead = ${Number(b.jml_lead ?? m.jml_lead) || 0},
      biaya = ${Number(b.biaya ?? m.biaya) || 0}, catatan = ${m.catatan || ''}
    WHERE id = ${b.id}`;
  return Response.json({ ok: true });
}

async function _DELETE(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const cur = await sql`SELECT created_by FROM kegiatan WHERE id = ${id}`;
  if (!cur.length) return Response.json({ error: 'Kegiatan tidak ditemukan' }, { status: 404 });
  if (!(await bolehUbah(sql, user, cur[0].created_by))) {
    return Response.json({ error: 'Hanya manager, penginput, atau sesama tim Marcom yang bisa menghapus' }, { status: 403 });
  }
  await sql`DELETE FROM kegiatan WHERE id = ${id}`;
  return Response.json({ ok: true });
}

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const POST = denganLog('Kegiatan', _POST);
export const PATCH = denganLog('Kegiatan', _PATCH);
export const DELETE = denganLog('Kegiatan', _DELETE);
