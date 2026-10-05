import crypto from 'crypto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Penerima webhook WhatsApp Business Platform (Cloud API / Coexistence).
// Chat masuk ke nomor marcom -> lead otomatis tercatat di CRM (atau dicatat sebagai balasan bila nomornya sudah ada).
// Env: WA_VERIFY_TOKEN (wajib, teks bebas untuk verifikasi webhook), META_APP_SECRET (wajib, App settings > Basic > App secret),
//      WA_NOMOR_PROJECT (opsional, "62nomor:PROJECT,..."), WA_PEMILIK (opsional, username marcom pemilik lead otomatis).

const petaNomor = () => Object.fromEntries(
  (process.env.WA_NOMOR_PROJECT || '6281385237865:BIO DISTRICT,628139871781:PERMAI INDAH').split(',')
    .map(x => { const [n, ...p] = x.split(':'); return [String(n || '').replace(/[^0-9]/g, ''), p.join(':').trim()]; })
    .filter(([n]) => n));

const hariIniWIB = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

// Verifikasi webhook dari Meta (sekali saat Callback URL disimpan)
export async function GET(req) {
  const u = new URL(req.url);
  const tok = process.env.WA_VERIFY_TOKEN;
  if (u.searchParams.get('hub.mode') === 'subscribe' && tok && u.searchParams.get('hub.verify_token') === tok) {
    return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

function tandaSah(raw, sig) {
  if (!sig) return false;
  const h = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(raw).digest('hex');
  const a = Buffer.from(h), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let siap = false;
async function siapkan(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS wa_inbox (
    msg_id text PRIMARY KEY, wa text, project text, lead_code text, isi text, referral jsonb,
    created_at timestamptz NOT NULL DEFAULT now())`;
  try { await sql`ALTER TABLE followups ADD COLUMN IF NOT EXISTS balas boolean`; } catch {}
  siap = true;
}

function isiPesan(m) {
  if (m.type === 'text') return m.text?.body || '';
  if (m.type === 'button') return m.button?.text || '';
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
  return `[${m.type || 'pesan'}]`;
}

async function prosesPesan(sql, m, namaProfil, project) {
  const wa = String(m.from || '').replace(/[^0-9]/g, '');
  if (!wa || !m.id) return;
  const isi = isiPesan(m);
  const ref = m.referral || null;
  // Meta bisa mengirim ulang pesan yang sama — proses sekali saja
  const baru = await sql`INSERT INTO wa_inbox (msg_id, wa, project, isi, referral)
    VALUES (${m.id}, ${wa}, ${project}, ${isi.slice(0, 1000)}, ${ref ? JSON.stringify(ref) : null}::jsonb)
    ON CONFLICT (msg_id) DO NOTHING RETURNING msg_id`;
  if (!baru.length) return;
  const hari = hariIniWIB();

  // 1) Nomor sudah terdaftar -> catat sebagai "lead membalas" (sekali per hari) & munculkan di lonceng pemegangnya
  const ada = await sql`SELECT lead_code, status FROM leads
    WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(wa, ''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${wa}
    ORDER BY id LIMIT 1`;
  if (ada.length) {
    const l = ada[0];
    const sudah = await sql`SELECT 1 FROM followups WHERE lead_code = ${l.lead_code} AND created_by = 'auto-wa' AND tgl = ${hari} LIMIT 1`;
    if (!sudah.length) {
      await sql`INSERT INTO followups (lead_code, tgl, detail, objection, next_action, next_tgl, wa_pesan, created_by, balas)
        VALUES (${l.lead_code}, ${hari}, ${'💬 Lead membalas via WA: ' + isi.slice(0, 300)}, '', '', null, '', 'auto-wa', true)`;
    }
    await sql`UPDATE leads SET next_fu = ${hari}, updated_at = now()
      WHERE lead_code = ${l.lead_code} AND status NOT IN ('Drop', 'Closing') AND (next_fu IS NULL OR next_fu > ${hari})`;
    await sql`UPDATE wa_inbox SET lead_code = ${l.lead_code} WHERE msg_id = ${m.id}`;
    return;
  }

  // 2) Nomor baru -> buat lead otomatis
  let campaign = '', konten = '', sumber = 'WhatsApp';
  const kode = /\b([A-Z]{2,3})(\d+)-(\d+)\b/i.exec(isi);
  if (kode) {
    try {
      const c = await sql`SELECT nama FROM mi_campaigns WHERE id = ${Number(kode[2])}`;
      if (c.length) { campaign = c[0].nama; konten = (kode[1] + kode[2] + '-' + kode[3]).toUpperCase(); }
    } catch {}
  }
  if (ref && ref.source_type === 'ad') {
    // Chat dari iklan Click-to-WhatsApp: Meta menyertakan ID iklan -> campaign terisi otomatis tanpa kode
    sumber = /instagram/i.test(ref.source_url || '') ? 'Instagram' : 'Facebook Ads';
    if (!campaign && ref.source_id && process.env.META_TOKEN) {
      try {
        const r = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v23.0'}/${encodeURIComponent(ref.source_id)}?fields=name,campaign{name}&access_token=${encodeURIComponent(process.env.META_TOKEN)}`);
        const j = await r.json();
        const nm = j?.campaign?.name;
        if (nm) {
          const c = await sql`SELECT nama FROM mi_campaigns WHERE lower(nama) = lower(${nm}) LIMIT 1`;
          campaign = c.length ? c[0].nama : nm;
          if (!konten) konten = String(j.name || '').slice(0, 100);
        }
      } catch {}
    }
  } else if (ref && /instagram/i.test(ref.source_url || '')) sumber = 'Instagram';

  let pemilik = process.env.WA_PEMILIK || '';
  if (!pemilik) {
    const u = await sql`SELECT username FROM users WHERE role = 'markom' AND active = true ORDER BY id LIMIT 1`;
    pemilik = u[0]?.username || 'auto-wa';
  }
  const waSimpan = wa.startsWith('62') ? '0' + wa.slice(2) : wa;
  const ins = await sql`INSERT INTO leads (tgl, nama, wa, sumber, project, sales, status, catatan, next_fu, campaign, konten, created_by)
    VALUES (${hari}, ${namaProfil || ('WA ' + waSimpan)}, ${waSimpan}, ${sumber}, ${project}, '', 'New',
            ${'[Otomatis dari WA] Pesan pertama: ' + isi.slice(0, 300)}, ${hari}, ${campaign}, ${konten}, ${pemilik})
    RETURNING id`;
  const code = 'LEAD-' + String(ins[0].id).padStart(4, '0');
  await sql`UPDATE leads SET lead_code = ${code} WHERE id = ${ins[0].id}`;
  await sql`UPDATE wa_inbox SET lead_code = ${code} WHERE msg_id = ${m.id}`;
}

export async function POST(req) {
  if (!process.env.META_APP_SECRET) return new Response('META_APP_SECRET belum diisi', { status: 503 });
  const raw = await req.text();
  if (!tandaSah(raw, req.headers.get('x-hub-signature-256'))) return new Response('Tanda tangan tidak sah', { status: 401 });
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('ok'); }
  const sql = db();
  await siapkan(sql);
  const peta = petaNomor();
  for (const e of body.entry || []) {
    for (const c of e.changes || []) {
      if (c.field !== 'messages') continue;
      const v = c.value || {};
      const project = peta[String(v.metadata?.display_phone_number || '').replace(/[^0-9]/g, '')] || '';
      const nama = {};
      (v.contacts || []).forEach(k => { nama[k.wa_id] = k.profile?.name || ''; });
      for (const m of v.messages || []) {
        try { await prosesPesan(sql, m, nama[m.from] || '', project); } catch (err) { console.error('wa-webhook', err); }
      }
    }
  }
  return new Response('ok');
}
