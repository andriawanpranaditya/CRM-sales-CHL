import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanPengirim, normHp, hashPerangkat, linkDariToken, LABEL_TIPE } from '@/lib/pengirim';
import { judulAgent, judulOther } from '@/lib/judul-link';

export const dynamic = 'force-dynamic';

const publik = p => p && ({ id: p.id, status: p.status, nama: p.nama, hp: p.hp, kantor: p.kantor, divisi: p.divisi, jenis: p.jenis, alasan: p.status === 'Ditolak' ? p.alasan : undefined });

// PUBLIK: cek status pengirim di perangkat ini · Manager: daftar pengirim
export async function GET(req) {
  const sql = db(); await siapkanPengirim(sql);
  const q = new URL(req.url).searchParams;
  if (q.get('daftar')) {
    const { err } = await requireUser(['manager']); if (err) return err;
    const rows = await sql`SELECT id, tipe, project, nama, hp, kantor, divisi, jenis, ktp, npwp, status, created_at, dicek_oleh, dicek_at FROM pengirim
      ORDER BY (status = 'Menunggu') DESC, created_at DESC LIMIT 300`;
    return Response.json({ pengirim: q.get('tipe') ? rows.filter(r => r.tipe === q.get('tipe')) : rows });
  }
  const l = await linkDariToken(sql, q.get('token'));
  if (!l || !q.get('perangkat')) return Response.json({ status: null });
  const p = (await sql`SELECT * FROM pengirim WHERE tipe = ${l.tipe} AND project = ${l.project} AND perangkat = ${hashPerangkat(q.get('perangkat'))}
    ORDER BY id DESC LIMIT 5`).find(x => !q.get('hp') || x.hp_norm === normHp(q.get('hp')));
  return Response.json({ status: p?.status || null, pengirim: publik(p) });
}

export async function POST(req) {
  const sql = db(); await siapkanPengirim(sql);
  const b = await req.json().catch(() => ({}));
  // ===== Aksi Manager: verifikasi (1 tombol), tolak, cabut =====
  if (['verifikasi', 'tolak', 'cabut'].includes(b.aksi)) {
    const { user, err } = await requireUser(['manager']); if (err) return err;
    const p = (await sql`SELECT * FROM pengirim WHERE id = ${Number(b.id)}`)[0];
    if (!p) return Response.json({ error: 'Pengirim tidak ditemukan' }, { status: 404 });
    if (b.aksi === 'verifikasi') {
      if (p.status === 'Terverifikasi') return Response.json({ ok: true, sudah: true, nama: p.nama });
      let otherId = p.other_id;
      if (p.tipe === 'other' && !otherId) {
        const { daftarkanOther } = await import('@/lib/other-sales');
        otherId = (await daftarkanOther(sql, p.project, { nama: p.nama, jenis: p.jenis, divisi: p.divisi, hp: p.hp, ktp: p.ktp, npwp: p.npwp }, user.username)).id;
      }
      await sql`UPDATE pengirim SET status = 'Terverifikasi', other_id = ${otherId}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${p.id}`;
      return Response.json({ ok: true, nama: p.nama });
    }
    await sql`UPDATE pengirim SET status = ${b.aksi === 'tolak' ? 'Ditolak' : 'Dicabut'}, alasan = ${String(b.alasan || '').slice(0, 200)}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${p.id}`;
    return Response.json({ ok: true });
  }
  // ===== PUBLIK: daftar pengirim baru (sekali per nomor HP + perangkat) =====
  if (b.website) return Response.json({ status: 'Menunggu' });
  const l = await linkDariToken(sql, b.token);
  if (!l) return Response.json({ error: 'Link tidak berlaku. Minta link terbaru ke tim marketing.' }, { status: 404 });
  if (l.tipe !== 'other') return Response.json({ error: 'Verifikasi pengirim hanya untuk Sales Channel' }, { status: 400 });
  const t = (x, n = 100) => String(x ?? '').trim().slice(0, n);
  const D = b.data || {};
  if (!/^[a-f0-9]{24,64}$/.test(String(b.perangkat || ''))) return Response.json({ error: 'Perangkat tidak dikenali — muat ulang halaman' }, { status: 400 });
  const d = { nama: t(D.nama, 80), hp: t(D.hp, 30), kantor: t(D.kantor), divisi: t(D.divisi, 60), jenis: ['Internal employee', 'External'].includes(D.jenis) ? D.jenis : null };
  if (!d.nama) return Response.json({ error: 'Nama wajib diisi' }, { status: 400 });
  if (normHp(d.hp).length < 10) return Response.json({ error: 'No. HP wajib diisi dengan benar' }, { status: 400 });
  if (l.tipe === 'agent' && !d.kantor) return Response.json({ error: 'Kantor / agency wajib diisi' }, { status: 400 });
  if (l.tipe === 'other') {
    if (!d.jenis) return Response.json({ error: 'Pilih Internal employee atau External' }, { status: 400 });
    if (d.jenis === 'Internal employee' && !d.divisi) return Response.json({ error: 'Divisi wajib diisi' }, { status: 400 });
    if (d.jenis === 'External' && (!D.ktp?.data || !D.npwp?.data)) return Response.json({ error: 'External wajib melampirkan foto KTP dan NPWP' }, { status: 400 });
  }
  const hpN = normHp(d.hp), pr = hashPerangkat(b.perangkat);
  const ada = (await sql`SELECT * FROM pengirim WHERE tipe = ${l.tipe} AND project = ${l.project} AND hp_norm = ${hpN} AND perangkat = ${pr} LIMIT 1`)[0];
  if (ada && ['Terverifikasi', 'Menunggu'].includes(ada.status)) return Response.json({ status: ada.status, pengirim: publik(ada) });
  const baruHari = (await sql`SELECT count(*)::int AS n FROM pengirim WHERE project = ${l.project} AND created_at > now() - interval '1 day'`)[0]?.n || 0;
  if (baruHari >= 40) return Response.json({ error: 'Terlalu banyak pendaftaran hari ini — hubungi tim marketing' }, { status: 429 });
  let ktp = null, npwp = null;
  if (l.tipe === 'other' && d.jenis === 'External') {
    const { simpanDok } = await import('@/lib/other-sales');
    try { ktp = await simpanDok(sql, l.project, { nama: 'KTP ' + d.nama, data: D.ktp.data }); npwp = await simpanDok(sql, l.project, { nama: 'NPWP ' + d.nama, data: D.npwp.data }); }
    catch (e) { return Response.json({ error: e.message }, { status: 502 }); }
  }
  const r = ada
    ? await sql`UPDATE pengirim SET nama = ${d.nama}, hp = ${d.hp}, kantor = ${d.kantor}, divisi = ${d.divisi}, jenis = ${d.jenis}, ktp = COALESCE(${ktp}, ktp), npwp = COALESCE(${npwp}, npwp), status = 'Menunggu', alasan = null, created_at = now() WHERE id = ${ada.id} RETURNING *`
    : await sql`INSERT INTO pengirim (tipe, project, nama, hp, hp_norm, kantor, divisi, jenis, ktp, npwp, perangkat) VALUES (${l.tipe}, ${l.project}, ${d.nama}, ${d.hp}, ${hpN}, ${d.kantor}, ${d.divisi}, ${d.jenis}, ${ktp}, ${npwp}, ${pr}) RETURNING *`;
  const p = r[0];
  // Web Push realtime ke HP Manager — tombol "✅ Verifikasi" langsung di notifikasi
  try {
    const { kirimPush } = await import('@/lib/push');
    const judul = l.tipe === 'agent' ? judulAgent(l.project) : judulOther(l.project);
    await kirimPush(sql, { role: 'manager' }, { judul: `🛡️ Pengirim baru — ${judul}`,
      isi: `${d.nama} · ${d.hp}${d.kantor ? ' · ' + d.kantor : ''}${d.jenis ? ' · ' + d.jenis + (d.divisi ? ' – ' + d.divisi : '') : ''}${l.leadAgent ? ' (lead agent ' + l.leadAgent + ')' : ''}`,
      url: l.tipe === 'agent' ? '/kunjungan-agent' : '/other-sales', tag: 'pengirim-' + p.id,
      aksi: [{ action: 'verifikasi', title: '✅ Verifikasi' }], data: { verifikasiId: p.id } });
  } catch (e) { console.error('push pengirim', e); }
  return Response.json({ status: p.status, pengirim: publik(p) });
}
