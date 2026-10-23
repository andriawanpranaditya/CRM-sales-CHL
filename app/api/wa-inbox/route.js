import { db } from '@/lib/db';
import { requireUser, lihatBaris, pesanProyek } from '@/lib/auth';
import { siapkanAI, kirimWA } from '@/lib/ai';
import { denganLog } from '@/lib/log';

export const dynamic = 'force-dynamic';
const PERAN = ['manager', 'markom']; // Marcom: membalas dari nomor official; Manager: kontrol. Sales follow up dari nomor masing-masing
const bolehLihat = (user, l) => {
  if (!l) return user.role !== 'sales';
  if (!lihatBaris(user, l)) return false;
  if (user.role === 'sales') return !l.sales || l.sales === user.name;
  return true;
};

// ===== GET: daftar percakapan, atau satu percakapan (?wa=62xxx) =====
export async function GET(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanAI(sql);
  const q = new URL(req.url).searchParams;
  const wa = String(q.get('wa') || '').replace(/[^0-9]/g, '');
  if (wa) {
    // ?after=<id>: hanya pesan BARU setelah id itu (dipakai polling 5 detik) — tidak mengirim ulang 400 pesan tiap kali
    const after = Math.max(0, Number(q.get('after') || 0) || 0);
    const pesan = after > 0
      ? await sql`SELECT id, wa, project, lead_code, peran, isi, oleh, created_at FROM wa_percakapan WHERE wa = ${wa} AND id > ${after} ORDER BY id LIMIT 400`
      : (await sql`SELECT id, wa, project, lead_code, peran, isi, oleh, created_at FROM wa_percakapan WHERE wa = ${wa} ORDER BY id DESC LIMIT 400`).reverse();
    const kode = [...pesan].reverse().find(p => p.lead_code)?.lead_code
      || (await sql`SELECT lead_code FROM wa_percakapan WHERE wa = ${wa} AND lead_code IS NOT NULL ORDER BY id DESC LIMIT 1`)[0]?.lead_code || null;
    const l = kode ? (await sql`SELECT id, lead_code, nama, wa, project, status, sales, sumber, walkin_info, campaign, ai_status, ai_ringkasan, created_by, next_fu FROM leads WHERE lead_code = ${kode}`)[0]
      : (await sql`SELECT id, lead_code, nama, wa, project, status, sales, sumber, walkin_info, campaign, ai_status, ai_ringkasan, created_by, next_fu FROM leads l
          WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(l.wa, ''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${wa} ORDER BY id LIMIT 1`)[0];
    if (!bolehLihat(user, l)) return Response.json({ error: 'Percakapan ini bukan milik Anda' }, { status: 403 });
    // tandai sudah dibaca sampai pesan terakhir
    const maxId = pesan.length ? pesan[pesan.length - 1].id : 0;
    if (maxId) await sql`INSERT INTO wa_baca (username, wa, last_id) VALUES (${user.username}, ${wa}, ${maxId}) ON CONFLICT (username, wa) DO UPDATE SET last_id = GREATEST(wa_baca.last_id, EXCLUDED.last_id)`;
    const masukTerakhir = [...pesan].reverse().find(p => p.peran === 'user')?.created_at
      || (await sql`SELECT max(created_at) AS t FROM wa_percakapan WHERE wa = ${wa} AND peran = 'user'`)[0]?.t || null;
    const sisaJam = masukTerakhir ? Math.max(0, 24 - (Date.now() - new Date(masukTerakhir).getTime()) / 3600000) : 0;
    const nomor = l?.project ? await sql`SELECT phone_id, display FROM wa_nomor WHERE project = ${l.project} ORDER BY updated_at DESC LIMIT 1` : [];
    return Response.json({ wa, pesan, inkremental: after > 0, lead: l || null, masukTerakhir, sisaJam, bisaBalas: sisaJam > 0 && nomor.length > 0, nomorPengirim: nomor[0]?.display || null });
  }
  // Daftar percakapan: satu baris per nomor, pesan terakhir, belum dibaca, lead pemegang
  const rows = await sql`
    WITH akhir AS (SELECT DISTINCT ON (wa) wa, project, lead_code, peran, isi, created_at, id FROM wa_percakapan ORDER BY wa, id DESC),
         masuk AS (SELECT wa, max(created_at) AS t FROM wa_percakapan WHERE peran = 'user' GROUP BY wa),
         belum AS (SELECT p.wa, count(*)::int AS n FROM wa_percakapan p LEFT JOIN wa_baca b ON b.wa = p.wa AND b.username = ${user.username}
                   WHERE p.peran = 'user' AND p.id > COALESCE(b.last_id, 0) GROUP BY p.wa),
         kode AS (SELECT DISTINCT ON (wa) wa, lead_code FROM wa_percakapan WHERE lead_code IS NOT NULL ORDER BY wa, id DESC)
    SELECT a.wa, a.project, a.peran, left(a.isi, 160) AS isi, a.created_at AS terakhir, m.t AS masuk_terakhir, COALESCE(b.n, 0) AS belum,
           l.lead_code, l.nama, l.status, l.sales, l.ai_status, l.created_by, l.project AS lead_project
    FROM akhir a LEFT JOIN masuk m ON m.wa = a.wa LEFT JOIN belum b ON b.wa = a.wa LEFT JOIN kode k ON k.wa = a.wa
         LEFT JOIN leads l ON l.lead_code = k.lead_code
    ORDER BY a.created_at DESC LIMIT 300`;
  const daftar = rows.filter(r => bolehLihat(user, r.lead_code ? { project: r.lead_project || r.project, sales: r.sales, created_by: r.created_by } : null))
    .map(r => ({ ...r, sisaJam: r.masuk_terakhir ? Math.max(0, 24 - (Date.now() - new Date(r.masuk_terakhir).getTime()) / 3600000) : 0 }));
  const nomor = await sql`SELECT phone_id, display, project FROM wa_nomor ORDER BY updated_at DESC`;
  return Response.json({ daftar, nomor, me: { username: user.username, name: user.name, role: user.role } });
}

// ===== POST: kirim balasan tim, ambil alih dari AI, aktifkan AI lagi =====
async function _POST(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanAI(sql);
  const b = await req.json().catch(() => ({}));
  const wa = String(b.wa || '').replace(/[^0-9]/g, '');
  if (!wa) return Response.json({ error: 'Nomor tidak valid' }, { status: 400 });
  const kodeRow = await sql`SELECT lead_code, project FROM wa_percakapan WHERE wa = ${wa} AND lead_code IS NOT NULL ORDER BY id DESC LIMIT 1`;
  const kode = kodeRow[0]?.lead_code || null;
  const l = kode ? (await sql`SELECT id, lead_code, nama, project, status, sales, ai_status, created_by FROM leads WHERE lead_code = ${kode}`)[0] : null;
  if (!bolehLihat(user, l)) return Response.json({ error: 'Percakapan ini bukan milik Anda' }, { status: 403 });
  if (l?.project && !lihatBaris(user, l)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  const project = l?.project || kodeRow[0]?.project || '';

  if (b.aksi === 'ambil') {
    if (l) await sql`UPDATE leads SET ai_status = 'diambil_tim', updated_at = now() WHERE lead_code = ${l.lead_code}`;
    return Response.json({ ok: true, lead_code: kode, nama: l?.nama, aksi: 'Ambil alih dari AI' });
  }
  if (b.aksi === 'ai_lanjut') {
    if (!l) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
    if (l.sales) return Response.json({ error: 'Lead sudah punya sales — AI tidak dijalankan lagi' }, { status: 400 });
    await sql`UPDATE leads SET ai_status = 'aktif', updated_at = now() WHERE lead_code = ${l.lead_code}`;
    return Response.json({ ok: true, lead_code: kode, nama: l.nama, aksi: 'AI dilanjutkan' });
  }
  // kirim balasan
  const teks = String(b.teks || '').trim();
  if (!teks) return Response.json({ error: 'Pesan kosong' }, { status: 400 });
  const masuk = await sql`SELECT max(created_at) AS t FROM wa_percakapan WHERE wa = ${wa} AND peran = 'user'`;
  const t = masuk[0]?.t ? new Date(masuk[0].t).getTime() : 0;
  if (!t || Date.now() - t > 24 * 3600000) return Response.json({ error: 'Jendela 24 jam sudah lewat — WhatsApp hanya menerima balasan bebas dalam 24 jam setelah pesan terakhir konsumen' }, { status: 400 });
  const nomor = await sql`SELECT phone_id FROM wa_nomor WHERE (${project}::text = '' OR project = ${project}) ORDER BY updated_at DESC LIMIT 1`;
  if (!nomor.length) return Response.json({ error: 'Nomor pengirim project ini belum dikenal CRM (belum ada pesan masuk lewat webhook)' }, { status: 400 });
  try { await kirimWA(nomor[0].phone_id, wa, teks.slice(0, 4000)); }
  catch (e) { return Response.json({ error: 'Gagal mengirim ke WhatsApp: ' + e.message }, { status: 502 }); }
  const ins = await sql`INSERT INTO wa_percakapan (wa, project, lead_code, peran, isi, oleh) VALUES (${wa}, ${project}, ${kode}, 'tim', ${teks.slice(0, 2000)}, ${user.name}) RETURNING id`;
  await sql`INSERT INTO wa_baca (username, wa, last_id) VALUES (${user.username}, ${wa}, ${ins[0].id}) ON CONFLICT (username, wa) DO UPDATE SET last_id = GREATEST(wa_baca.last_id, EXCLUDED.last_id)`;
  if (l) {
    await sql`UPDATE leads SET ai_status = 'diambil_tim', updated_at = now() WHERE lead_code = ${l.lead_code}`;
    const hari = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    try { await sql`INSERT INTO followups (lead_code, tgl, detail, objection, next_action, next_tgl, wa_pesan, created_by, balas)
      VALUES (${l.lead_code}, ${hari}, ${'💬 Balasan via Inbox WhatsApp: ' + teks.slice(0, 400)}, '', '', null, ${teks.slice(0, 1000)}, ${user.username}, null)`; } catch {}
  }
  return Response.json({ ok: true, id: ins[0].id, lead_code: kode, nama: l?.nama, aksi: 'Balas WhatsApp' });
}
const ringkas = ({ body, out }) => ({ detail: [out.lead_code, out.nama, out.aksi, body.teks ? String(body.teks).slice(0, 80) : ''].filter(Boolean).join(' · ') });
export const POST = denganLog('Inbox WhatsApp', _POST, ringkas);
