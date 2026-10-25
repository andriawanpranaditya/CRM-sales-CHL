import { db } from '@/lib/db';
import { requireUser, lihatBaris, pesanProyek } from '@/lib/auth';
import { siapkanAI, konfigAI, MODEL_AI } from '@/lib/ai';
import { siapkanFuWajib, riwayatFU } from '@/lib/fuwajib-db';
import { statusFU, konteksOper, hariIniWIB } from '@/lib/fuwajib';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ===== Personalisasi pesan FU wajib dengan AI (Claude) =====
// Masukan: lead_code + draft pesan rekomendasi. Keluaran: pesan WA yang disusun ulang memakai riwayat lead,
// percakapan WhatsApp resmi (bila ada), dan basis pengetahuan project (harga, promo, lokasi) dari menu Asisten AI.
export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!['sales', 'manager', 'ceo'].includes(user.role)) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'AI belum aktif — ANTHROPIC_API_KEY belum diisi di Vercel' }, { status: 400 });
  const b = await req.json();
  const sql = db();
  await siapkanFuWajib(sql);
  const lead = (await sql`SELECT * FROM leads WHERE lead_code = ${b.lead_code || ''}`)[0];
  if (!lead) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
  if (user.role === 'sales' && lead.sales !== user.name) return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  if (!lihatBaris(user, lead)) return Response.json({ error: pesanProyek(user) }, { status: 403 });

  await siapkanAI(sql);
  const riw = await riwayatFU(sql, [lead.lead_code]);
  const st = statusFU(lead, riw, hariIniWIB());
  const konteks = konteksOper(lead, riw);
  let chat = [];
  try {
    const waN = String(lead.wa || '').replace(/[^0-9]/g, '').replace(/^0/, '62');
    if (waN) chat = (await sql`SELECT peran, isi FROM wa_percakapan WHERE wa = ${waN} ORDER BY id DESC LIMIT 16`).reverse();
  } catch {}
  const cfg = await konfigAI(sql, lead.project);

  const dataLead = [
    `Nama: ${lead.nama}`, `Project: ${lead.project}`, `Sumber: ${lead.sumber || '-'}${lead.campaign ? ' · campaign ' + lead.campaign : ''}`,
    `Status: ${lead.status}`, lead.tipe && `Tipe diminati: ${lead.tipe}`, Number(lead.budget) > 0 && `Budget: Rp${Number(lead.budget).toLocaleString('id-ID')}`,
    lead.bayar && `Cara bayar: ${lead.bayar}`, lead.tujuan && `Tujuan: ${lead.tujuan}`, lead.domisili && `Domisili: ${lead.domisili}`,
    lead.catatan && `Catatan: ${lead.catatan}`, konteks && `Yang ditanyakan saat dioper Marcom: ${konteks}`, lead.ai_ringkasan && `Ringkasan chat asisten AI: ${lead.ai_ringkasan}`,
  ].filter(Boolean).join('\n');
  const riwTeks = riw.slice(-8).map(f => `- ${f.tgl || ''} ${f.oleh_role === 'markom' ? '[Marcom]' : '[Sales]'} ${f.detail || ''}${f.objection ? ' · objection: ' + f.objection : ''}${f.balas === true ? ' · konsumen membalas' : f.balas === false ? ' · belum membalas' : ''}`).join('\n') || '- belum ada';
  const chatTeks = chat.map(c => `${c.peran === 'user' ? 'Konsumen' : 'Kami'}: ${c.isi}`).join('\n') || '(tidak ada chat di nomor resmi)';

  const system = `Kamu membantu sales properti menulis SATU pesan WhatsApp follow up untuk calon pembeli rumah.
ATURAN
- Bahasa Indonesia sopan & santai, sapa "Kak", maksimal 90 kata, boleh 1–2 emoji, format tebal WhatsApp *seperti ini* seperlunya.
- Gunakan HANYA fakta dari PENGETAHUAN PROJECT dan DATA LEAD. Jangan mengarang harga, promo, diskon, atau janji.
- Ikuti TUJUAN SENTUHAN. Akhiri dengan satu ajakan yang mudah dibalas (pilihan waktu, pertanyaan ya/tidak, atau angka).
- Jangan mengulang pertanyaan yang sudah dijawab konsumen di riwayat. Jangan menyebut bahwa kamu AI.
- Balas HANYA dengan teks pesan, tanpa pembuka atau penjelasan.

PENGETAHUAN PROJECT
${cfg.pengetahuan || '(belum diisi — gunakan data lead & draft saja)'}`;
  const prompt = `NAMA SALES: ${user.name}
TUJUAN SENTUHAN: ${st.aktif ? st.label + ' — ' + st.tujuan : 'percakapan lanjutan'}
HARI INI: ${hariIniWIB()}

DATA LEAD
${dataLead}

RIWAYAT FOLLOW UP
${riwTeks}

CHAT WHATSAPP TERAKHIR
${chatTeks}

DRAFT PESAN (perbaiki & personalisasi)
${String(b.draft || '').slice(0, 2000) || '(kosong)'}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL_AI(), max_tokens: 600, system, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json();
  if (!r.ok) return Response.json({ error: j?.error?.message || 'Gagal memanggil AI' }, { status: 502 });
  const pesan = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  return Response.json({ pesan });
}
