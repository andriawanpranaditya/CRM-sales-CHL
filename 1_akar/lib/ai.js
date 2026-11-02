// ===== Asisten AI WhatsApp — Claude (Anthropic API) =====
// Env: ANTHROPIC_API_KEY (wajib), AI_MODEL (opsional, default Claude Haiku 4.5)
import { DEFAULT_SETTINGS } from '@/lib/db';

export const MODEL_AI = () => process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
const USIA = ['< 25', '25–29', '30–34', '35–39', '40–44', '45–49', '50–54', '55+'];

export const PENGETAHUAN_DEFAULT = {
  'BIO DISTRICT': `BIO DISTRICT — perumahan 63 unit di Serpong, Tangerang Selatan (pengembang: PT Serpong Bangun Lestari). Konsep "Live the Resort Life", desain biophilic.
LOKASI: ±3 menit ke Stasiun KRL Rawa Buntu; dekat BSD City & Gading Serpong.
STATUS: unit READY (siap huni), bukan inden.
HARGA (price list Mei 2026, harga All In = sudah termasuk biaya-biaya):
- Tipe A: LB 74 m² / LT 60 m² — Rp1.553.778.000 (All In Rp1.670.000.000)
- Tipe B: LB 102 m² / LT 72 m² — Rp2.097.000.000 (All In Rp2.271.000.000)
- Tipe C: LB 130 m² / LT 84 m² — Rp2.595.417.445 (All In Rp2.806.527.243)
- Unit corner Tipe B & C tersedia terbatas (harga corner ditanyakan ke tim sales).
CARA BAYAR: KPR (bank rekanan, tersedia program bunga fix berjenjang), cash bertahap, cash keras.
PROMO "RESORT LIVING, GRAND REWARDS" (pembelian 1 Sep–31 Des 2026, hadiah langsung tanpa diundi, S&K berlaku):
- Tipe A Standar: 3 unit AC
- Tipe B Standar: Vespa Officina 8 Limited Edition
- Tipe C Standar: Wuling Aira EV (mobil listrik)
- Unit Corner B & C: BYD Atto 1 (mobil listrik)
FASILITAS: Clubhouse, BBQ area & taman, playground, outdoor gym & jogging track, one gate system, keamanan 24 jam.
KUNJUNGAN: kantor pemasaran buka setiap hari; Grand Rewards Weekend setiap Sabtu–Minggu 10.00–16.00. Alamat lengkap kantor pemasaran diberikan oleh tim sales.
INSTAGRAM: @biodistrictofficial`,
};

export function promptSistem(project, pengetahuan, set = {}) {
  const bayar = (set.bayar || DEFAULT_SETTINGS.bayar || []).join(' / ');
  const tujuan = (set.tujuan || DEFAULT_SETTINGS.tujuan || []).join(' / ');
  const tipe = (set.tipe || DEFAULT_SETTINGS.tipe || []).join(' / ');
  const nm = project ? project.replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()) : 'Bio District';
  return `Kamu adalah Asisten Virtual ${nm} yang membalas chat WhatsApp calon pembeli rumah.

TUGAS
1. Sambut dan jawab pertanyaan HANYA berdasarkan PENGETAHUAN di bawah.
2. Kualifikasi secara natural, satu pertanyaan per balasan, sampai diketahui: tujuan beli (ditempati/investasi), cara bayar & kisaran budget, domisili, dan rentang usia (tanyakan halus, boleh dilewati bila terasa kurang sopan).
3. Arahkan ke kunjungan lokasi / Grand Rewards Weekend dan tawarkan dihubungkan dengan konsultan properti.

ATURAN
- Bahasa Indonesia sopan dan santai, sapa "Kak". Maksimal 3 kalimat pendek per balasan; boleh 1 emoji.
- Di balasan pertama, perkenalkan diri sebagai asisten virtual ${nm}.
- Jangan mengarang informasi di luar PENGETAHUAN. Bila tidak tahu: katakan akan dicek dan disampaikan oleh tim.
- Jangan menjanjikan diskon, harga khusus, atau persetujuan KPR. Jangan meminta KTP, nomor rekening, OTP, atau dokumen apa pun lewat chat.
- Eskalasi ke tim (eskalasi=true) bila: calon pembeli minta bicara dengan orang/sales, nego harga, tanya legal/sertifikat secara detail, keluhan, atau pertanyaan yang tidak bisa dijawab dari PENGETAHUAN. Saat eskalasi, sampaikan bahwa konsultan properti akan segera menghubungi.

PENGETAHUAN
${pengetahuan || '(belum diisi — jangan menjawab detail produk, langsung eskalasi ke tim)'}

FORMAT JAWABAN — balas HANYA dengan JSON valid tanpa teks lain:
{"balasan":"teks yang dikirim ke calon pembeli",
 "data":{"nama":null,"domisili":null,"budget":null,"bayar":null,"usia":null,"tujuan":null,"tipe":null},
 "siap_oper":false,"eskalasi":false,"ringkasan":"satu kalimat: apa yang ditanyakan/diminati calon pembeli"}
Isi "data" hanya dari yang benar-benar disebut calon pembeli: budget = angka rupiah (mis. 2000000000); bayar salah satu dari [${bayar}]; tujuan salah satu dari [${tujuan}]; tipe salah satu dari [${tipe}]; usia salah satu dari [${USIA.join(' / ')}]. Selain itu null.
"siap_oper" = true bila tujuan, cara bayar/budget, dan domisili sudah diketahui, ATAU calon pembeli meminta jadwal kunjungan / dihubungi sales.`;
}

// riwayat: [{peran:'user'|'ai'|'tim', isi}] berurutan lama→baru
export async function tanyaAI({ project, pengetahuan, set, riwayat }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY belum diisi di Vercel');
  const msgs = [];
  for (const r of riwayat) {
    const role = r.peran === 'user' ? 'user' : 'assistant';
    const isi = r.peran === 'tim' ? `[Dibalas langsung oleh tim] ${r.isi}` : r.isi;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + isi;
    else msgs.push({ role, content: isi });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) throw new Error('Belum ada pesan dari calon pembeli');
  if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: '(lanjutkan percakapan)' });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL_AI(), max_tokens: 700, system: promptSistem(project, pengetahuan, set), messages: msgs }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'Gagal memanggil AI');
  const teks = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  let out;
  try { out = JSON.parse(teks.replace(/^```json|```$/g, '').trim()); }
  catch { const m = /\{[\s\S]*\}/.exec(teks); out = m ? JSON.parse(m[0]) : { balasan: teks }; }
  out.data = out.data || {};
  return out;
}

// Cukup sekali per instance server — dulu 9 perintah DDL ini ikut jalan di SETIAP polling Inbox WA (tiap 5–8 detik)
let aiSiap = false;
export async function siapkanAI(sql) {
  if (aiSiap) return;
  await sql`CREATE TABLE IF NOT EXISTS mi_ai_config (project text PRIMARY KEY, aktif boolean NOT NULL DEFAULT false, pengetahuan text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS wa_percakapan (id serial PRIMARY KEY, wa text, project text, lead_code text, peran text, isi text, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_wa_perc_wa ON wa_percakapan (wa, id)`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_status text`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_ringkasan text`;
  // Inbox WhatsApp di CRM: nomor pengirim (phone_number_id) per project, pengirim balasan tim, dan tanda sudah dibaca per pengguna
  await sql`ALTER TABLE wa_percakapan ADD COLUMN IF NOT EXISTS oleh text`;
  await sql`CREATE TABLE IF NOT EXISTS wa_nomor (phone_id text PRIMARY KEY, display text, project text, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS wa_baca (username text, wa text, last_id integer NOT NULL DEFAULT 0, PRIMARY KEY (username, wa))`;
  // Lampiran (foto, PDF, voice note): yang tercatat hanya penandanya (ID media WhatsApp). Isi file baru disimpan
  // ke wa_lampiran bila tim menekan "Simpan" — ID media dari WhatsApp hanya bisa diunduh sekitar 30 hari.
  await sql`ALTER TABLE wa_percakapan ADD COLUMN IF NOT EXISTS msg_id text`;
  await sql`ALTER TABLE wa_percakapan ADD COLUMN IF NOT EXISTS tipe text`;
  await sql`ALTER TABLE wa_percakapan ADD COLUMN IF NOT EXISTS media_id text`;
  await sql`ALTER TABLE wa_percakapan ADD COLUMN IF NOT EXISTS mime text`;
  await sql`ALTER TABLE wa_percakapan ADD COLUMN IF NOT EXISTS nama_file text`;
  await sql`ALTER TABLE wa_percakapan ADD COLUMN IF NOT EXISTS lampiran_id integer`;
  await sql`CREATE TABLE IF NOT EXISTS wa_lampiran (id serial PRIMARY KEY, wa text, lead_code text, percakapan_id integer, tipe text, mime text,
    nama_file text, ukuran integer, data text NOT NULL, disimpan_oleh text, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_wa_lampiran_lead ON wa_lampiran (lead_code)`;
  // ID akun WhatsApp Business (WABA) — diambil otomatis dari webhook; dipakai untuk membaca & mengajukan template resmi
  await sql`ALTER TABLE wa_nomor ADD COLUMN IF NOT EXISTS waba_id text`;
  // Chat yang sudah diarsipkan di HP official (ditandai pemegang HP) — supaya tidak muncul lagi di daftar "Siap diarsipkan"
  await sql`CREATE TABLE IF NOT EXISTS wa_arsip (wa text PRIMARY KEY, lead_code text, oleh text, created_at timestamptz NOT NULL DEFAULT now())`;
  aiSiap = true;
}

// ===== Template resmi WhatsApp (wajib untuk pesan di luar jendela 24 jam) =====
// WA_GRAPH_URL hanya untuk pengujian (server tiruan); produksi selalu graph.facebook.com
const GRAPH = () => `${process.env.WA_GRAPH_URL || 'https://graph.facebook.com'}/${process.env.META_API_VERSION || 'v23.0'}`;
const TOKEN_WA = () => process.env.WA_TOKEN || process.env.META_TOKEN;
async function graph(path, opsi = {}) {
  const r = await fetch(GRAPH() + path, { ...opsi, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN_WA(), ...(opsi.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.error_user_msg || j?.error?.message || 'Permintaan ke WhatsApp gagal');
  return j;
}
export async function daftarTemplate(wabaId) {
  const j = await graph(`/${wabaId}/message_templates?fields=name,status,category,language,components&limit=200`);
  return (j.data || []).map(t => {
    const body = (t.components || []).find(c => c.type === 'BODY')?.text || '';
    const n = (body.match(/\{\{\d+\}\}/g) || []).length;
    return { name: t.name, status: t.status, category: t.category, language: t.language, body, jumlahIsian: n };
  });
}
// isian: daftar teks untuk {{1}}, {{2}}, ... di badan template
export async function kirimTemplate(phoneId, to, name, language, isian = []) {
  const components = isian.length ? [{ type: 'body', parameters: isian.map(t => ({ type: 'text', text: String(t || '-').slice(0, 900) })) }] : [];
  return graph(`/${phoneId}/messages`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code: language }, components } }) });
}
export async function ajukanTemplate(wabaId, def) {
  return graph(`/${wabaId}/message_templates`, { method: 'POST', body: JSON.stringify(def) });
}
// Unduh isi media WhatsApp (foto/PDF/voice note) berdasarkan ID media → { buf, mime }
export async function ambilMedia(mediaId) {
  const info = await graph(`/${mediaId}`);
  if (!info.url) throw new Error('Media tidak ditemukan atau sudah kedaluwarsa');
  const r = await fetch(info.url, { headers: { authorization: 'Bearer ' + TOKEN_WA() } });
  if (!r.ok) throw new Error('Media tidak bisa diunduh (mungkin sudah lebih dari 30 hari)');
  return { buf: Buffer.from(await r.arrayBuffer()), mime: info.mime_type || r.headers.get('content-type') || 'application/octet-stream' };
}
export async function simpanNomorWA(sql, phoneId, display, project, wabaId = '') {
  if (!phoneId) return;
  try { await sql`INSERT INTO wa_nomor (phone_id, display, project, waba_id) VALUES (${phoneId}, ${display || ''}, ${project || ''}, ${wabaId || null})
    ON CONFLICT (phone_id) DO UPDATE SET display = EXCLUDED.display, project = COALESCE(NULLIF(EXCLUDED.project, ''), wa_nomor.project),
      waba_id = COALESCE(EXCLUDED.waba_id, wa_nomor.waba_id), updated_at = now()`; } catch {}
}

export async function konfigAI(sql, project) {
  const r = await sql`SELECT * FROM mi_ai_config WHERE project = ${project}`;
  return r[0] || { project, aktif: false, pengetahuan: PENGETAHUAN_DEFAULT[project] || '' };
}

export async function kirimWA(phoneId, to, teks) {
  const token = process.env.WA_TOKEN || process.env.META_TOKEN;
  const r = await fetch(`${process.env.WA_GRAPH_URL || 'https://graph.facebook.com'}/${process.env.META_API_VERSION || 'v23.0'}/${phoneId}/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: teks } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'Gagal mengirim WA');
  return j;
}

// ===== Daftar chat siap diarsipkan di HP official =====
// Lead yang sudah dioper ke sales (percakapan lanjut di Inbox sales) atau sudah selesai (Drop / Booking / Closing),
// dan nomornya belum ditandai diarsipkan. Pengarsipan dilakukan manual di aplikasi WhatsApp Business oleh pemegang HP.
export async function daftarSiapArsip(sql, project = '') {
  return sql`SELECT DISTINCT ON (p.wa) p.wa, l.lead_code, l.nama, l.status, l.sales, l.project,
      CASE WHEN l.status IN ('Drop', 'Lost') THEN 'Drop' WHEN l.status IN ('Booking', 'Closing') THEN l.status ELSE 'Dioper ke ' || l.sales END AS alasan
    FROM (SELECT DISTINCT wa, lead_code FROM wa_percakapan WHERE lead_code IS NOT NULL) p
    JOIN leads l ON l.lead_code = p.lead_code
    LEFT JOIN wa_arsip a ON a.wa = p.wa
    WHERE a.wa IS NULL AND (COALESCE(l.sales, '') <> '' OR l.status IN ('Drop', 'Lost', 'Booking', 'Closing'))
      AND (${project}::text = '' OR l.project = ${project})
    ORDER BY p.wa`;
}
