import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { denganLog } from '@/lib/log';
import { mulaiJadwalBaru } from '@/lib/fuwajib-db';

export const dynamic = 'force-dynamic';

// Alihkan lead massal — khusus Manager. Dipakai saat sales resign / dinonaktifkan (mis. lead Reno dibagi ke sales lain).
// Body: { dari, ke: [nama sales aktif], status: [status yang ikut dialihkan], project?, jadwal_baru?, cek? }
//  • cek: true → hanya pratinjau pembagian, belum disimpan
//  • lead dibagi rata ke sales tujuan (yang paling sedikit menerima didahulukan), hanya ke sales yang memegang project lead tsb
//  • riwayat oper (lead_assign), jadwal FU wajib Hari 1, janjian yang akan datang & notifikasi ikut dipindah
//  • transaksi Reserved/Booking/Closing tidak diubah — tetap tercatat atas nama sales lama
async function _POST(req) {
  const { user, err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  const sql = db();
  const dari = String(b.dari || '').trim();
  const ke = [...new Set((Array.isArray(b.ke) ? b.ke : []).map(x => String(x || '').trim()).filter(Boolean))].filter(n => n !== dari);
  const status = (Array.isArray(b.status) ? b.status : []).map(String);
  if (!dari) return Response.json({ error: 'Pilih sales asal' }, { status: 400 });
  if (!ke.length) return Response.json({ error: 'Pilih minimal satu sales tujuan' }, { status: 400 });
  if (!status.length) return Response.json({ error: 'Pilih minimal satu status lead' }, { status: 400 });

  let tujuan;
  try { tujuan = await sql`SELECT name, username, projects FROM users WHERE role = 'sales' AND active = true AND name = ANY(${ke})`; }
  catch { tujuan = await sql`SELECT name, username FROM users WHERE role = 'sales' AND active = true AND name = ANY(${ke})`; }
  if (!tujuan.length) return Response.json({ error: 'Sales tujuan tidak ditemukan / tidak aktif' }, { status: 400 });

  const proj = String(b.project || '').trim();
  const leads = await sql`SELECT id, lead_code, nama, project, status FROM leads
    WHERE sales = ${dari} AND COALESCE(NULLIF(status, ''), 'New') = ANY(${status}) AND (${proj} = '' OR project = ${proj}) ORDER BY id`;

  const hit = Object.fromEntries(tujuan.map(t => [t.name, 0]));
  const rencana = [], lewat = [];
  for (const l of leads) {
    const boleh = tujuan.filter(t => !Array.isArray(t.projects) || !t.projects.length || !l.project || t.projects.includes(l.project));
    if (!boleh.length) { lewat.push({ lead_code: l.lead_code, nama: l.nama, project: l.project, alasan: 'tidak ada sales tujuan yang memegang project ini' }); continue; }
    const t = boleh.reduce((a, c) => hit[c.name] < hit[a.name] ? c : a);
    hit[t.name]++;
    rencana.push({ ...l, ke: t.name, username: t.username });
  }
  const ringkas = { dari, total: rencana.length, per_sales: hit, dilewati: lewat };
  if (b.cek) return Response.json({ ok: true, cek: true, ...ringkas });
  if (!rencana.length) return Response.json({ error: 'Tidak ada lead yang bisa dialihkan dengan pilihan ini' }, { status: 400 });

  const jadwalBaru = b.jadwal_baru !== false;
  let janjianPindah = 0;
  const { catatOperManual } = await import('@/lib/distribusi-lead');
  for (const r of rencana) {
    const ok = await sql`UPDATE leads SET sales = ${r.ke}, updated_at = now() WHERE id = ${r.id} AND sales = ${dari} RETURNING id`;
    if (!ok.length) continue; // sudah diubah orang lain di tengah proses
    try { await sql`INSERT INTO lead_assign (lead_code, dari, ke, oleh) VALUES (${r.lead_code}, ${dari}, ${r.ke}, ${user.username})`; } catch {}
    if (jadwalBaru && !['Booking', 'Closing', 'Drop'].includes(r.status || 'New')) { try { await mulaiJadwalBaru(sql, r.lead_code); } catch (e) { console.error('jadwal fu', e); } }
    try { await catatOperManual(sql, r.lead_code, r.ke); } catch {}
    try {
      const j = await sql`UPDATE janjian SET sales = ${r.ke}, updated_at = now()
        WHERE lead_code = ${r.lead_code} AND sales = ${dari} AND status = 'Terjadwal' AND tgl >= (now() AT TIME ZONE 'Asia/Jakarta')::date RETURNING id`;
      janjianPindah += j.length;
    } catch {}
  }
  // Satu notifikasi per sales penerima (bukan per lead)
  try {
    const { kirimPush } = await import('@/lib/push');
    for (const t of tujuan) {
      const n = hit[t.name]; if (!n) continue;
      await kirimPush(sql, { usernames: [t.username] }, { judul: `📩 ${n} lead dialihkan ke kamu`, isi: `Lead dari ${dari} sekarang kamu pegang. Cek menu Database Lead / Follow Up dan hubungi hari ini.`, url: '/leads' });
    }
  } catch (e) { console.error('push alihkan', e); }
  return Response.json({ ok: true, ...ringkas, janjian: janjianPindah });
}

export const POST = denganLog('Lead', _POST, ({ out }) => out.cek ? false : ({
  aksi: 'Alihkan lead massal',
  detail: `${out.total} lead ${out.dari} → ` + Object.entries(out.per_sales || {}).filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(', '),
}));
