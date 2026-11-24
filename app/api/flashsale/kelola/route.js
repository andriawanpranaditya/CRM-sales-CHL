import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { denganLog } from '@/lib/log';
import { bolehDigital } from '@/lib/digital-akses';
import { siapkanFlash, bacaSetting, jadwal, posisi, sapuKedaluwarsa, hariIni, bersih, sahkanDaftar, perluVerif, PROJECT, BOOKING_FEE, NAMA_GRUP, BAWAAN } from '@/lib/flashsale';

export const dynamic = 'force-dynamic';
const PENGELOLA = ['manager', 'ceo'];

// GET: link per akun, pendaftar, pesanan. Sales hanya melihat miliknya; Manager / CEO melihat semua.
export async function GET(req) {
  const { user, err } = await requireUser(['manager', 'ceo', 'sales', 'markom']); if (err) return err;
  const sql = db(); await siapkanFlash(sql);
  const setting = await bacaSetting(sql), j = jadwal(setting);
  // Selama program belum dibuka ke tim, menu & datanya hanya untuk Head of Sales & Marketing
  const pemilik = bolehDigital(user), tampil = pemilik || setting.menu;
  if (new URL(req.url).searchParams.get('cek')) return Response.json({ tampil });
  if (!tampil) return Response.json({ error: 'Menu Flash Sale belum dibuka' }, { status: 403 });
  await sapuKedaluwarsa(sql);
  const kelola = PENGELOLA.includes(user.role), semua = kelola || user.role === 'markom';
  let akun;
  try { akun = await sql`SELECT username, name, role, COALESCE(lead_agent, false) AS lead_agent, projects FROM users WHERE active = true AND role IN ('sales', 'manager') ORDER BY role DESC, name`; }
  catch { akun = await sql`SELECT username, name, role, false AS lead_agent FROM users WHERE active = true AND role IN ('sales', 'manager') ORDER BY role DESC, name`; }
  // Link hanya untuk akun yang memegang Bio District; manager yang tampil hanya diri sendiri
  akun = akun.filter(a => (!Array.isArray(a.projects) || !a.projects.length || a.projects.includes(PROJECT)) && (a.role === 'sales' || a.username === user.username));
  if (!semua) akun = akun.filter(a => a.username === user.username);
  const links = akun.map(a => ({ username: a.username, nama: a.name, leadAgent: !!a.lead_agent, manager: a.role === 'manager' }));
  const milik = r => semua || r.pemilik === user.name || r.ref_username === user.username;
  const daftar = (await sql`SELECT d.id, d.nama, d.wa, d.email, d.domisili, d.ref_username, d.agent_nama, d.agent_kantor, d.lead_code, d.pemilik, d.lead_baru, d.uji, d.created_at, d.verif_kode, d.verified_at, d.verif_oleh
    FROM flash_daftar d ORDER BY d.id DESC LIMIT 500`).filter(milik).map(x => ({ ...x, belumSah: perluVerif(setting, x) }));
  // Kapan terakhir webhook menerima chat di nomor resmi Bio District (penanda sambungan WA hidup)
  let waTerakhir = null;
  try { waTerakhir = (await sql`SELECT max(created_at) AS t FROM wa_inbox WHERE project = ${PROJECT}`)[0]?.t || null; } catch {}
  const pesanan = (await sql`SELECT p.*, d.nama, d.wa, d.pemilik, d.ref_username, d.agent_nama, d.agent_kantor FROM flash_pesan p JOIN flash_daftar d ON d.id = p.daftar_id ORDER BY p.id DESC LIMIT 500`).filter(milik);
  const { tutup, klaim } = await posisi(sql, setting.uji);
  const ringkas = Object.entries(setting.kuota).map(([g, kuota]) => ({ grup: g, nama: NAMA_GRUP[g], kuota, terpakai: klaim[g] || 0 }));
  return Response.json({ kelola, pemilik, setting, fase: j.fase, links, daftar, pesanan, ringkas, waTerakhir, tutup: tutup.size, bookingFee: BOOKING_FEE, bawaan: BAWAAN });
}

async function _POST(req) {
  const { user, err } = await requireUser(PENGELOLA); if (err) return err;
  const sql = db(); await siapkanFlash(sql);
  const b = await req.json().catch(() => ({}));
  if (!bolehDigital(user) && !(await bacaSetting(sql)).menu) return Response.json({ error: 'Menu Flash Sale belum dibuka' }, { status: 403 });

  if (b.aksi === 'setting') {
    if (user.role !== 'manager') return Response.json({ error: 'Hanya manager yang bisa mengubah pengaturan' }, { status: 403 });
    const lama = await bacaSetting(sql);
    const tgl = (v, d) => (v && !isNaN(Date.parse(v))) ? new Date(v).toISOString() : d;
    // Membuka / menutup menu untuk semua akun hanya oleh Head of Sales & Marketing
    const baru = { mulai: tgl(b.mulai, lama.mulai), selesai: tgl(b.selesai, lama.selesai), uji: !!b.uji, verifWA: !!b.verifWA, menu: bolehDigital(user) ? !!b.menu : lama.menu, kuota: { ...lama.kuota } };
    if (Date.parse(baru.selesai) <= Date.parse(baru.mulai)) return Response.json({ error: 'Waktu selesai harus setelah waktu mulai' }, { status: 400 });
    for (const k of Object.keys(baru.kuota)) { const v = Number(b.kuota?.[k]); if (Number.isFinite(v) && v >= 0 && v <= 99) baru.kuota[k] = Math.floor(v); }
    await sql`INSERT INTO settings (key, items) VALUES ('flashsale', ${JSON.stringify(baru)}::jsonb) ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(baru)}::jsonb`;
    return Response.json({ ok: true, setting: baru });
  }
  if (b.aksi === 'hapus-uji') {
    if (user.role !== 'manager') return Response.json({ error: 'Hanya manager' }, { status: 403 });
    const a = await sql`DELETE FROM flash_pesan WHERE COALESCE(uji, false) = true RETURNING id`;
    const c = await sql`DELETE FROM flash_daftar WHERE COALESCE(uji, false) = true RETURNING id`;
    return Response.json({ ok: true, pesanan: a.length, daftar: c.length });
  }

  // Webhook WA tidak menangkap pesan verifikasi → manager menandai sendiri setelah memastikan nomornya
  if (b.aksi === 'sahkan') {
    const d = (await sql`SELECT * FROM flash_daftar WHERE id = ${Number(b.id) || 0}`)[0];
    if (!d) return Response.json({ error: 'Pendaftar tidak ditemukan' }, { status: 404 });
    if (d.verified_at) return Response.json({ ok: true });
    await sahkanDaftar(sql, d, user.username);
    return Response.json({ ok: true });
  }

  const p = (await sql`SELECT p.*, d.nama, d.pemilik, d.lead_code AS lead_daftar FROM flash_pesan p JOIN flash_daftar d ON d.id = p.daftar_id WHERE p.id = ${Number(b.id) || 0}`)[0];
  if (!p) return Response.json({ error: 'Pesanan tidak ditemukan' }, { status: 404 });

  // Booking fee sudah masuk → unit menjadi Reserved di Master Stock (transaksi Reserved atas lead-nya)
  if (b.aksi === 'lunas') {
    if (!['dibayar', 'menunggu'].includes(p.status)) return Response.json({ error: 'Pesanan ini sudah ' + p.status }, { status: 400 });
    const lead = p.lead_code || p.lead_daftar;
    if (!p.uji && lead) {
      const ada = await sql`SELECT id FROM transactions WHERE lead_code = ${lead} AND unit = ${p.unit} AND jenis IN ('Reserved', 'Booking', 'Closing') LIMIT 1`;
      if (!ada.length) {
        await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, nilai_jual, catatan, project, bayar, unit, created_by)
          VALUES (${lead}, 'Reserved', ${hariIni()}, ${BOOKING_FEE}, ${Number(p.harga) || null}, ${'Flash Sale ' + p.kode + ' · ' + (p.paket_isi || '')}, ${PROJECT}, ${p.cara_bayar || ''}, ${p.unit}, ${user.username})`;
        await sql`UPDATE leads SET next_fu = NULL, tipe = COALESCE(NULLIF(tipe, ''), ${NAMA_GRUP[p.grup] || ''}), bayar = COALESCE(NULLIF(bayar, ''), ${p.cara_bayar || ''}), updated_at = now() WHERE lead_code = ${lead}`.catch(() => {});
      }
    }
    await sql`UPDATE flash_pesan SET status = 'lunas', dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${p.id}`;
    return Response.json({ ok: true });
  }
  if (b.aksi === 'tolak') {
    if (p.status === 'lunas') return Response.json({ error: 'Pesanan sudah lunas — batalkan lewat menu Booking (transaksi Batal)' }, { status: 400 });
    const alasan = bersih(b.alasan, 200); if (!alasan) return Response.json({ error: 'Tulis alasannya' }, { status: 400 });
    await sql`UPDATE flash_pesan SET status = 'batal', alasan = ${alasan}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${p.id}`;
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}
export const POST = denganLog('Flash Sale', _POST, ({ body }) => ({ aksi: 'Update', detail: [body.aksi, body.id ? 'pesanan #' + body.id : '', body.alasan].filter(Boolean).join(' · ') }));
