import { db } from '@/lib/db';
import { requireUser, lihatBaris, pesanProyek } from '@/lib/auth';
import { siapkanAI, kirimWA, kirimTemplate, ambilMedia } from '@/lib/ai';
import { denganLog } from '@/lib/log';
import { siapkanFuWajib, riwayatFU, mulaiJadwalBaru, catatSentuhanWA } from '@/lib/fuwajib-db';
import { statusFU, isianTemplateFU } from '@/lib/fuwajib';
import { saranTemplate, bersihIsian } from '@/lib/wa-template';
import { kirimPush, usernameDariNama } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
// Satu nomor official untuk semua lead: Marcom membalas & mengoper, Sales membalas lead miliknya, Administrator memantau
const PERAN = ['administrator', 'headsales', 'salesmanager', 'ceo', 'markom', 'sales'];
const HANYA_LIHAT = ['ceo'];   // CEO Project memantau percakapan tim, tidak membalas / mengoper
const PENGOPER = ['administrator', 'headsales', 'salesmanager', 'markom'];  // Sales Manager boleh mengoper / mengganti sales di project-nya
const MAKS_LAMPIRAN = 15 * 1024 * 1024; // 15 MB per file
const bolehLihat = (user, l) => {
  if (!l) return user.role !== 'sales';                 // nomor tanpa lead: hanya Marcom & Administrator
  if (!lihatBaris(user, l)) return false;
  if (user.role === 'sales') return !!l.sales && l.sales === user.name;   // sales: hanya lead miliknya
  return true;
};
const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const KOLOM_LEAD = 'id, lead_code, nama, wa, project, status, sales, sumber, walkin_info, campaign, ai_status, ai_ringkasan, created_by, next_fu, tipe, budget, bayar, tujuan, fu_mulai, fu_jalur, created_at';

async function cariLead(sql, wa) {
  const k = await sql`SELECT lead_code FROM wa_percakapan WHERE wa = ${wa} AND lead_code IS NOT NULL ORDER BY id DESC LIMIT 1`;
  if (k.length) {
    const r = await sql`SELECT * FROM leads WHERE lead_code = ${k[0].lead_code}`;
    if (r.length) return r[0];
  }
  const r = await sql`SELECT * FROM leads l
    WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(l.wa, ''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${wa} ORDER BY id LIMIT 1`;
  return r[0] || null;
}
const pilihLead = l => l ? Object.fromEntries(KOLOM_LEAD.split(', ').map(k => [k, l[k]])) : null;
async function nomorPengirim(sql, project) {
  const r = await sql`SELECT phone_id, display, waba_id FROM wa_nomor WHERE (${project || ''}::text = '' OR project = ${project || ''}) ORDER BY updated_at DESC LIMIT 1`;
  return r[0] || null;
}
async function jamMasukTerakhir(sql, wa) {
  const r = await sql`SELECT max(created_at) AS t FROM wa_percakapan WHERE wa = ${wa} AND peran = 'user'`;
  return r[0]?.t ? new Date(r[0].t).getTime() : 0;
}
async function catatKeluar(sql, { wa, project, lead_code, isi, oleh, tipe = 'text' }) {
  const ins = await sql`INSERT INTO wa_percakapan (wa, project, lead_code, peran, isi, oleh, tipe) VALUES (${wa}, ${project}, ${lead_code}, 'tim', ${String(isi).slice(0, 2000)}, ${oleh}, ${tipe}) RETURNING id`;
  return ins[0].id;
}

// ===== GET: daftar percakapan, atau satu percakapan (?wa=62xxx) =====
export async function GET(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanAI(sql);
  const q = new URL(req.url).searchParams;
  const wa = String(q.get('wa') || '').replace(/[^0-9]/g, '');
  if (wa) {
    const after = Math.max(0, Number(q.get('after') || 0) || 0);
    const pesan = after > 0
      ? await sql`SELECT id, wa, project, lead_code, peran, isi, oleh, created_at, tipe, media_id, mime, nama_file, lampiran_id FROM wa_percakapan WHERE wa = ${wa} AND id > ${after} ORDER BY id LIMIT 400`
      : (await sql`SELECT id, wa, project, lead_code, peran, isi, oleh, created_at, tipe, media_id, mime, nama_file, lampiran_id FROM wa_percakapan WHERE wa = ${wa} ORDER BY id DESC LIMIT 400`).reverse();
    const lead = await cariLead(sql, wa);
    if (!bolehLihat(user, lead)) return Response.json({ error: 'Percakapan ini bukan milik Anda' }, { status: 403 });
    const maxId = pesan.length ? pesan[pesan.length - 1].id : 0;
    if (maxId) await sql`INSERT INTO wa_baca (username, wa, last_id) VALUES (${user.username}, ${wa}, ${maxId}) ON CONFLICT (username, wa) DO UPDATE SET last_id = GREATEST(wa_baca.last_id, EXCLUDED.last_id)`;
    const t = await jamMasukTerakhir(sql, wa);
    const sisaJam = t ? Math.max(0, 24 - (Date.now() - t) / 3600000) : 0;
    const nomor = await nomorPengirim(sql, lead?.project);
    // Tahap FU wajib saat ini → template yang disarankan bila jendela 24 jam sudah tutup
    let fu = null;
    if (lead) {
      try { await siapkanFuWajib(sql); const st = statusFU(lead, await riwayatFU(sql, [lead.lead_code])); if (st.aktif) fu = { label: st.label, jenis: st.jenis, jatuh: st.jatuh, telat: st.telat, template: saranTemplate(st.jenis) }; } catch {}
    }
    const lampiran = lead ? await sql`SELECT id, tipe, mime, nama_file, ukuran, disimpan_oleh, created_at FROM wa_lampiran WHERE lead_code = ${lead.lead_code} ORDER BY id DESC` : [];
    return Response.json({ wa, pesan, inkremental: after > 0, lead: pilihLead(lead), masukTerakhir: t ? new Date(t).toISOString() : null, sisaJam,
      bisaBalas: sisaJam > 0 && !!nomor, adaNomor: !!nomor, nomorPengirim: nomor?.display || null, adaWaba: !!nomor?.waba_id, fu, lampiran,
      bolehOper: PENGOPER.includes(user.role), hanyaLihat: HANYA_LIHAT.includes(user.role) });
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
  // ?ringkas=1: hanya jumlah pesan belum dibaca (untuk ubin "Chat belum dibalas" di Beranda) — respons sangat kecil
  if (q.get('ringkas')) return Response.json({ belum: daftar.reduce((a, r) => a + (Number(r.belum) || 0), 0), percakapan: daftar.filter(r => Number(r.belum) > 0).length });
  const nomor = await sql`SELECT phone_id, display, project, waba_id FROM wa_nomor ORDER BY updated_at DESC`;
  let sales = [];
  if (PENGOPER.includes(user.role)) sales = (await sql`SELECT name FROM users WHERE role = 'sales' AND active = true ORDER BY name`).map(x => x.name);
  return Response.json({ daftar, nomor: nomor.map(n => ({ display: n.display, project: n.project, adaWaba: !!n.waba_id })), sales,
    me: { username: user.username, name: user.name, role: user.role } });
}

// ===== POST: balas, oper ke sales (+ perkenalan), kirim template, simpan lampiran, ambil alih / lanjutkan AI =====
async function _POST(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  if (HANYA_LIHAT.includes(user.role)) return Response.json({ error: 'CEO Project hanya dapat melihat percakapan' }, { status: 403 });
  const sql = db();
  await siapkanAI(sql);
  const b = await req.json().catch(() => ({}));
  const wa = String(b.wa || '').replace(/[^0-9]/g, '');
  if (!wa) return Response.json({ error: 'Nomor tidak valid' }, { status: 400 });
  const l = await cariLead(sql, wa);
  if (!bolehLihat(user, l)) return Response.json({ error: 'Percakapan ini bukan milik Anda' }, { status: 403 });
  if (l?.project && !lihatBaris(user, l)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  const kode = l?.lead_code || null;
  const project = l?.project || (await sql`SELECT project FROM wa_percakapan WHERE wa = ${wa} ORDER BY id DESC LIMIT 1`)[0]?.project || '';

  if (b.aksi === 'ambil' || b.aksi === 'ai_lanjut') {
    if (!PENGOPER.includes(user.role)) return Response.json({ error: 'Hanya Marcom / Administrator' }, { status: 403 });
    if (b.aksi === 'ambil') { if (l) await sql`UPDATE leads SET ai_status = 'diambil_tim', updated_at = now() WHERE lead_code = ${kode}`; return Response.json({ ok: true, lead_code: kode, nama: l?.nama, aksi: 'Ambil alih dari AI' }); }
    if (!l) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
    if (l.sales) return Response.json({ error: 'Lead sudah punya sales — AI tidak dijalankan lagi' }, { status: 400 });
    await sql`UPDATE leads SET ai_status = 'aktif', updated_at = now() WHERE lead_code = ${kode}`;
    return Response.json({ ok: true, lead_code: kode, nama: l.nama, aksi: 'AI dilanjutkan' });
  }

  // --- Oper ke sales: lead pindah ke Inbox sales, pesan perkenalan dari nomor yang sama, notifikasi ke HP sales ---
  if (b.aksi === 'oper') {
    if (!PENGOPER.includes(user.role)) return Response.json({ error: 'Hanya Marcom / Administrator yang mengoper lead' }, { status: 403 });
    if (!l) return Response.json({ error: 'Lead belum terbentuk untuk nomor ini' }, { status: 400 });
    const sales = String(b.sales || '').trim();
    const ada = await sql`SELECT name FROM users WHERE role = 'sales' AND active = true AND name = ${sales}`;
    if (!ada.length) return Response.json({ error: 'Sales "' + sales + '" tidak ditemukan / tidak aktif' }, { status: 400 });
    const konteks = String(b.konteks || l.ai_ringkasan || '').trim().slice(0, 300);
    await sql`UPDATE leads SET sales = ${sales}, ai_status = 'diambil_tim', updated_at = now() WHERE lead_code = ${kode}`;
    try { await sql`INSERT INTO lead_assign (lead_code, dari, ke, oleh) VALUES (${kode}, ${l.sales || ''}, ${sales}, ${user.username})`; } catch {}
    await siapkanFuWajib(sql);
    if (!['Booking', 'Closing', 'Drop'].includes(l.status)) await mulaiJadwalBaru(sql, kode);
    await sql`INSERT INTO followups (lead_code, tgl, detail, objection, next_action, next_tgl, wa_pesan, created_by)
      VALUES (${kode}, ${hariIni()}, ${'Leads to Sales → ' + sales + (konteks ? ' · Konteks: ' + konteks : '')}, '', '', null, '', ${user.username})`;
    // Pesan perkenalan: dalam 24 jam → pesan biasa; di luar → template resmi "perkenalan_konsultan" bila sudah disetujui
    let kenalan = 'tidak dikirim';
    if (b.kenalkan !== false) {
      const nomor = await nomorPengirim(sql, project);
      const t = await jamMasukTerakhir(sql, wa);
      const isi = String(b.teks || '').trim();
      try {
        if (nomor && t && Date.now() - t < 24 * 3600000 && isi) {
          await kirimWA(nomor.phone_id, wa, isi.slice(0, 4000));
          await catatKeluar(sql, { wa, project, lead_code: kode, isi, oleh: user.name });
          kenalan = 'terkirim';
        } else if (nomor) {
          const x = isianTemplateFU(l, 'h1', sales);
          await kirimTemplate(nomor.phone_id, wa, 'perkenalan_konsultan', 'id', [x.nama, x.project, sales].map(bersihIsian));
          await catatKeluar(sql, { wa, project, lead_code: kode, isi: `📨 [Template perkenalan_konsultan] Halo Kak ${x.nama}, mulai sekarang Kakak dibantu oleh ${sales}, konsultan properti ${x.project}, di nomor ini juga.`, oleh: user.name, tipe: 'template' });
          kenalan = 'terkirim (template)';
        }
      } catch (e) { kenalan = 'gagal: ' + e.message; }
    }
    await kirimPush(sql, await usernameDariNama(sql, sales), { judul: '📥 Lead dioper ke Anda: ' + (l.nama || kode), isi: (konteks || 'Lanjutkan percakapan di nomor official') + ' — segera sapa (Hari 1, maks. 1 jam).', url: '/wa-inbox?wa=' + wa, tag: 'oper-' + wa });
    return Response.json({ ok: true, lead_code: kode, nama: l.nama, aksi: 'Oper ke ' + sales, kenalan });
  }

  // --- Kirim template resmi (di luar jendela 24 jam) → otomatis tercatat sebagai sentuhan FU wajib ---
  if (b.aksi === 'template') {
    const nomor = await nomorPengirim(sql, project);
    if (!nomor) return Response.json({ error: 'Nomor pengirim project ini belum dikenal (menunggu pesan pertama lewat webhook)' }, { status: 400 });
    const name = String(b.name || '').trim(), lang = String(b.language || 'id');
    if (!/^[a-z0-9_]+$/.test(name)) return Response.json({ error: 'Pilih template' }, { status: 400 });
    const isian = (Array.isArray(b.isian) ? b.isian : []).map(bersihIsian);
    try { await kirimTemplate(nomor.phone_id, wa, name, lang, isian); }
    catch (e) { return Response.json({ error: 'Gagal mengirim template: ' + e.message }, { status: 502 }); }
    const isi = '📨 [Template ' + name + '] ' + String(b.pratinjau || isian.join(' · ')).slice(0, 1500);
    const id = await catatKeluar(sql, { wa, project, lead_code: kode, isi, oleh: user.name, tipe: 'template' });
    let fu = null;
    if (l) { try { fu = await catatSentuhanWA(sql, user, kode, '📨 Template WhatsApp ' + name + ' (nomor official)', isi); } catch (e) { console.error('sentuhan wa', e); } }
    return Response.json({ ok: true, id, lead_code: kode, nama: l?.nama, aksi: 'Template ' + name, fu });
  }

  // --- Simpan lampiran (foto / PDF / voice note) dari WhatsApp ke Harmoni One — hanya bila diminta ---
  if (b.aksi === 'simpan_lampiran') {
    const p = (await sql`SELECT id, wa, lead_code, tipe, media_id, mime, nama_file, lampiran_id FROM wa_percakapan WHERE id = ${Number(b.id) || 0} AND wa = ${wa}`)[0];
    if (!p || !p.media_id) return Response.json({ error: 'Pesan ini tidak berisi lampiran' }, { status: 400 });
    if (p.lampiran_id) return Response.json({ ok: true, lampiran_id: p.lampiran_id, aksi: 'Sudah tersimpan' });
    let m;
    try { m = await ambilMedia(p.media_id); } catch (e) { return Response.json({ error: e.message }, { status: 502 }); }
    if (m.buf.length > MAKS_LAMPIRAN) return Response.json({ error: 'File lebih dari 15 MB — simpan manual dari HP' }, { status: 400 });
    const ext = (m.mime.split('/')[1] || 'bin').split(';')[0].replace('jpeg', 'jpg').replace('ogg', 'ogg');
    const nama = p.nama_file || `${p.tipe || 'lampiran'}-${kode || wa}-${p.id}.${ext}`;
    const ins = await sql`INSERT INTO wa_lampiran (wa, lead_code, percakapan_id, tipe, mime, nama_file, ukuran, data, disimpan_oleh)
      VALUES (${wa}, ${p.lead_code || kode}, ${p.id}, ${p.tipe}, ${m.mime}, ${nama}, ${m.buf.length}, ${m.buf.toString('base64')}, ${user.name}) RETURNING id`;
    await sql`UPDATE wa_percakapan SET lampiran_id = ${ins[0].id} WHERE id = ${p.id}`;
    return Response.json({ ok: true, lampiran_id: ins[0].id, lead_code: kode, nama: l?.nama, aksi: 'Simpan lampiran ' + nama });
  }

  // --- Balasan biasa (dalam jendela 24 jam) ---
  const teks = String(b.teks || '').trim();
  if (!teks) return Response.json({ error: 'Pesan kosong' }, { status: 400 });
  const t = await jamMasukTerakhir(sql, wa);
  if (!t || Date.now() - t > 24 * 3600000) return Response.json({ error: 'Jendela 24 jam sudah lewat — gunakan tombol "Kirim template"' }, { status: 400 });
  const nomor = await nomorPengirim(sql, project);
  if (!nomor) return Response.json({ error: 'Nomor pengirim project ini belum dikenal (belum ada pesan masuk lewat webhook)' }, { status: 400 });
  try { await kirimWA(nomor.phone_id, wa, teks.slice(0, 4000)); }
  catch (e) { return Response.json({ error: 'Gagal mengirim ke WhatsApp: ' + e.message }, { status: 502 }); }
  const id = await catatKeluar(sql, { wa, project, lead_code: kode, isi: teks, oleh: user.name });
  await sql`INSERT INTO wa_baca (username, wa, last_id) VALUES (${user.username}, ${wa}, ${id}) ON CONFLICT (username, wa) DO UPDATE SET last_id = GREATEST(wa_baca.last_id, EXCLUDED.last_id)`;
  if (l) {
    await sql`UPDATE leads SET ai_status = 'diambil_tim', updated_at = now() WHERE lead_code = ${kode}`;
    try { await sql`INSERT INTO followups (lead_code, tgl, detail, objection, next_action, next_tgl, wa_pesan, created_by, balas)
      VALUES (${kode}, ${hariIni()}, ${'💬 Balasan via Inbox WhatsApp: ' + teks.slice(0, 400)}, '', '', null, ${teks.slice(0, 1000)}, ${user.username}, null)`; } catch {}
  }
  return Response.json({ ok: true, id, lead_code: kode, nama: l?.nama, aksi: 'Balas WhatsApp' });
}
const ringkas = ({ body, out }) => ({ detail: [out.lead_code, out.nama, out.aksi, body.teks ? String(body.teks).slice(0, 80) : ''].filter(Boolean).join(' · ') });
export const POST = denganLog('Inbox WhatsApp', _POST, ringkas);
