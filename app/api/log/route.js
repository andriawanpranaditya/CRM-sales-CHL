import { db } from '@/lib/db';
import { requireUser, getUser, akunAktif, clearSession } from '@/lib/auth';
import { siapkanLog, catat } from '@/lib/log';

export const dynamic = 'force-dynamic';

const HALAMAN = {
  '/dashboard': 'Dashboard', '/form': 'Form Input', '/leads': 'Database Lead', '/booking': 'Booking', '/report': 'Report Sales',
  '/marcom': 'Analisa Marcom', '/kegiatan': 'Kegiatan', '/stock': 'Master Stock', '/kpr': 'Simulasi Cara Bayar',
  '/ai-asisten': 'Asisten AI', '/settings': 'Settings', '/users': 'Pengguna', '/log': 'Log Aktivitas',
};

// POST — dipanggil aplikasi setiap user membuka halaman (akses). Halaman yang sama dalam 10 menit dihitung sekali.
export async function POST(req) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Belum login' }, { status: 401 });
  if (!(await akunAktif(user))) { clearSession(); return Response.json({ error: 'Akun dinonaktifkan', logout: true }, { status: 401 }); }
  const b = await req.json().catch(() => ({}));
  if (b.unduh) {
    await catat(db(), { user, aksi: 'Unduh', modul: String(b.modul || '').slice(0, 40), detail: String(b.detail || '').slice(0, 200), req });
    return Response.json({ ok: true });
  }
  const path = String(b.halaman || '').split('?')[0].slice(0, 80);
  const kunci = Object.keys(HALAMAN).find(k => path === k || path.startsWith(k + '/'));
  if (!kunci) return Response.json({ ok: true });
  const sql = db();
  await siapkanLog(sql);
  const baru = await sql`SELECT 1 FROM activity_log WHERE username = ${user.username} AND aksi = 'Akses' AND halaman = ${kunci}
    AND waktu > now() - interval '10 minutes' LIMIT 1`;
  if (!baru.length) await catat(sql, { user, aksi: 'Akses', modul: 'Halaman', detail: 'membuka ' + HALAMAN[kunci], halaman: kunci, req, pwa: !!b.pwa });
  return Response.json({ ok: true });
}

// GET — tampilan Log Aktivitas (khusus manager)
export async function GET(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const sql = db();
  await siapkanLog(sql);
  const q = new URL(req.url).searchParams;
  const hari = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const d1 = q.get('d1') || hari, d2 = q.get('d2') || hari;
  const siapa = q.get('user') || null;
  const kat = q.get('kategori') || null;
  const cari = q.get('q') ? '%' + q.get('q') + '%' : null;
  const limit = Math.min(Number(q.get('limit')) || 500, 3000);
  const AKSI = { login: ['Login', 'Logout'], gagal: ['Login gagal'], akses: ['Akses'], unduh: ['Unduh'], input: ['Input', 'Upload', 'Impor'],
    update: ['Update', 'Oper ke Sales', 'Ganti password', 'Nonaktifkan', 'Uji coba'], hapus: ['Hapus', 'Hapus SEMUA data'] };
  const aksiList = kat && AKSI[kat] ? AKSI[kat] : null;
  // Retensi: log lebih tua dari 400 hari dibersihkan otomatis
  try { await sql`DELETE FROM activity_log WHERE waktu < now() - interval '400 days'`; } catch {}

  const [rows, ringkas, users] = await Promise.all([
    sql`SELECT id, waktu, username, nama, role, aksi, modul, detail, halaman, ip, perangkat FROM activity_log
      WHERE waktu >= (${d1}::date::timestamp AT TIME ZONE 'Asia/Jakarta') AND waktu < ((${d2}::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
        AND (${siapa}::text IS NULL OR username = ${siapa})
        AND (${aksiList}::text[] IS NULL OR aksi = ANY(${aksiList}::text[]))
        AND (${cari}::text IS NULL OR detail ILIKE ${cari} OR modul ILIKE ${cari} OR nama ILIKE ${cari})
      ORDER BY waktu DESC, id DESC LIMIT ${limit}`,
    sql`SELECT a.username, max(a.nama) AS nama, max(a.role) AS role,
        max(a.waktu) AS terakhir,
        max(a.waktu) FILTER (WHERE a.aksi = 'Login') AS login_terakhir,
        count(*) FILTER (WHERE a.aksi = 'Login')::int AS n_login,
        count(*) FILTER (WHERE a.aksi = 'Login gagal')::int AS n_gagal,
        count(*) FILTER (WHERE a.aksi = 'Akses')::int AS n_akses,
        count(*) FILTER (WHERE a.aksi IN ('Input', 'Upload', 'Impor'))::int AS n_input,
        count(*) FILTER (WHERE a.aksi IN ('Update', 'Oper ke Sales', 'Ganti password', 'Nonaktifkan', 'Uji coba'))::int AS n_update,
        count(*) FILTER (WHERE a.aksi IN ('Hapus', 'Hapus SEMUA data'))::int AS n_hapus,
        (array_agg(a.perangkat ORDER BY a.waktu DESC) FILTER (WHERE COALESCE(a.perangkat, '') <> ''))[1] AS perangkat
      FROM activity_log a
      WHERE a.waktu >= (${d1}::date::timestamp AT TIME ZONE 'Asia/Jakarta') AND a.waktu < ((${d2}::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
        AND a.username IS NOT NULL
      GROUP BY a.username ORDER BY max(a.waktu) DESC`,
    sql`SELECT u.username, u.name, u.role, u.active,
        (SELECT max(waktu) FROM activity_log a WHERE a.username = u.username) AS terakhir_aktif
      FROM users u ORDER BY u.role, u.name`,
  ]);
  return Response.json({ d1, d2, rows, ringkas, users });
}
