import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// Pemulihan akses Administrator. Dipakai bila seluruh akun berperan penuh
// terkunci atau perannya berubah sehingga menu Pengguna tidak dapat dibuka.
// Dijaga oleh SETUP_KEY, sama seperti pembaruan database.
//
//   /api/pulihkan?key=KUNCI                      -> kembalikan peran akun 'manager'
//   /api/pulihkan?key=KUNCI&username=andriawan   -> akun lain
//   /api/pulihkan?key=KUNCI&reset=1              -> sekaligus kembalikan kata sandi bawaan
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (!process.env.SETUP_KEY || q.get('key') !== process.env.SETUP_KEY) {
    return Response.json({ error: 'Kunci salah. Gunakan /api/pulihkan?key=SETUP_KEY' }, { status: 403 });
  }
  const username = (q.get('username') || 'manager').trim();
  const reset = q.get('reset') === '1';
  const sql = db();
  const jejak = [];

  try {
    const ada = await sql`SELECT id, username, name, role FROM users WHERE lower(username) = ${username.toLowerCase()}`;
    if (!ada.length) {
      const daftar = await sql`SELECT username, role FROM users ORDER BY username`;
      return Response.json({
        ok: false,
        pesan: 'Akun "' + username + '" tidak ditemukan.',
        akun_tersedia: daftar.map(u => u.username + ' (' + u.role + ')'),
      }, { status: 404 });
    }
    jejak.push('OK · akun ditemukan: ' + ada[0].username + ' (peran ' + ada[0].role + ')');

    // Aturan peran lama dilepas lebih dulu. Selama masih terpasang, setiap
    // perubahan peran akan ditolak karena daftarnya belum memuat 'administrator'.
    await sql`DO $$
      DECLARE r record;
      BEGIN
        FOR r IN SELECT conname FROM pg_constraint
                 WHERE conrelid = 'users'::regclass AND contype = 'c' LOOP
          EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(r.conname);
        END LOOP;
      END $$`;
    jejak.push('OK · aturan peran lama dilepas');

    // Seluruh peran diselaraskan SEBELUM aturan baru dipasang. Aturan baru tidak
    // mengenal 'manager', sehingga bila masih ada barisnya, pemasangan akan ditolak.
    await sql`UPDATE users SET role = 'administrator' WHERE role = 'manager'`;
    await sql`UPDATE users SET role = 'collection' WHERE role = 'kpr'`;
    await sql`UPDATE users SET role = 'sales' WHERE role NOT IN
      ('administrator','admin','markom','sales','adminsales','collection','finance','project','estate')`;
    jejak.push('OK · peran seluruh akun diselaraskan');

    await sql`UPDATE users SET role = 'administrator', active = true WHERE id = ${ada[0].id}`;
    jejak.push('OK · peran akun dikembalikan menjadi administrator');

    await sql`ALTER TABLE users ADD CONSTRAINT users_role_chk
      CHECK (role IN ('administrator','admin','markom','sales','adminsales','collection','finance','project','estate'))`;
    jejak.push('OK · aturan peran baru dipasang');

    let sandi = null;
    if (reset) {
      sandi = 'admin' + new Date().getFullYear();
      const hash = await bcrypt.hash(sandi, 10);
      await sql`UPDATE users SET password_hash = ${hash}, password_plain = NULL WHERE id = ${ada[0].id}`;
      jejak.push('OK · kata sandi dikembalikan');
    }

    return Response.json({
      ok: true,
      akun: ada[0].username,
      peran_sebelumnya: ada[0].role,
      peran_sekarang: 'administrator',
      kata_sandi: sandi ? 'Dikembalikan menjadi: ' + sandi + ' — segera ganti setelah masuk.' : 'Tidak diubah.',
      langkah_berikutnya: 'Keluar dari aplikasi lalu masuk kembali agar sesi memuat peran terbaru.',
      jejak,
    });
  } catch (e) {
    return Response.json({
      ok: false,
      pesan: e && e.message ? e.message : String(e),
      jejak,
      saran: 'Kirim isi pesan dan jejak ini agar dapat diperbaiki.',
    }, { status: 500 });
  }
}
