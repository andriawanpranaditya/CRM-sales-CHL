import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanAI, daftarTemplate, ajukanTemplate } from '@/lib/ai';
import { TEMPLATE_STANDAR, BIAYA, defPengajuan } from '@/lib/wa-template';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function akunWABA(sql, project) {
  const r = await sql`SELECT waba_id FROM wa_nomor WHERE waba_id IS NOT NULL AND (${project || ''}::text = '' OR project = ${project || ''}) ORDER BY updated_at DESC LIMIT 1`;
  return r[0]?.waba_id || null;
}

// GET ?project= : template resmi di akun WhatsApp Business (status, kategori, isi) + paket standar FU wajib + perkiraan biaya
export async function GET(req) {
  const { err } = await requireUser(['administrator', 'headsales', 'markom', 'sales']); if (err) return err;
  const sql = db();
  await siapkanAI(sql);
  const project = new URL(req.url).searchParams.get('project') || '';
  const waba = await akunWABA(sql, project);
  if (!waba) return Response.json({ templates: [], standar: TEMPLATE_STANDAR, biaya: BIAYA, siap: false,
    pesan: 'ID akun WhatsApp Business belum dikenal — otomatis terisi setelah ada pesan masuk lewat webhook.' });
  try {
    const t = await daftarTemplate(waba);
    return Response.json({ templates: t, standar: TEMPLATE_STANDAR, biaya: BIAYA, siap: true });
  } catch (e) {
    return Response.json({ templates: [], standar: TEMPLATE_STANDAR, biaya: BIAYA, siap: false, pesan: 'Gagal membaca template dari WhatsApp: ' + e.message });
  }
}

// POST { aksi: 'ajukan', project } (Administrator): ajukan paket template standar FU wajib yang belum ada ke Meta untuk ditinjau
export async function POST(req) {
  const { user, err } = await requireUser(['administrator', 'headsales']); if (err) return err;
  const sql = db();
  await siapkanAI(sql);
  const b = await req.json().catch(() => ({}));
  const waba = await akunWABA(sql, b.project || '');
  if (!waba) return Response.json({ error: 'ID akun WhatsApp Business belum dikenal — tunggu pesan pertama masuk lewat webhook' }, { status: 400 });
  let ada = [];
  try { ada = (await daftarTemplate(waba)).map(t => t.name); } catch {}
  const hasil = [];
  for (const t of TEMPLATE_STANDAR) {
    if (ada.includes(t.name)) { hasil.push({ name: t.name, status: 'sudah ada' }); continue; }
    try { const r = await ajukanTemplate(waba, defPengajuan(t)); hasil.push({ name: t.name, status: r.status || 'diajukan' }); }
    catch (e) { hasil.push({ name: t.name, status: 'gagal', error: e.message }); }
  }
  return Response.json({ ok: true, hasil, oleh: user.name });
}
