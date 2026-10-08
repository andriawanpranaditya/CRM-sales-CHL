import { db, DEFAULT_SETTINGS } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanAI, konfigAI, tanyaAI, PENGETAHUAN_DEFAULT, MODEL_AI } from '@/lib/ai';
import { denganLog } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function bacaSettings(sql) {
  const out = { ...DEFAULT_SETTINGS };
  try { (await sql`SELECT key, items FROM settings`).forEach(r => { out[r.key] = r.items; }); } catch {}
  return out;
}

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  if (!['manager', 'markom'].includes(user.role)) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
  const sql = db(); await siapkanAI(sql);
  const set = await bacaSettings(sql);
  const projects = set.project || ['BIO DISTRICT', 'PERMAI INDAH'];
  const config = [];
  for (const p of projects) config.push(await konfigAI(sql, p));
  const statistik = await sql`SELECT
      count(*) FILTER (WHERE peran = 'ai' AND created_at > now() - interval '30 days')::int AS balasan_ai,
      count(DISTINCT wa) FILTER (WHERE created_at > now() - interval '30 days')::int AS percakapan
    FROM wa_percakapan`;
  return Response.json({ config, apiKey: !!process.env.ANTHROPIC_API_KEY, model: MODEL_AI(), statistik: statistik[0], role: user.role, bawaan: PENGETAHUAN_DEFAULT });
}

async function _PUT(req) {
  const { user, err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.project) return Response.json({ error: 'Project wajib' }, { status: 400 });
  const sql = db(); await siapkanAI(sql);
  await sql`INSERT INTO mi_ai_config (project, aktif, pengetahuan, updated_by) VALUES (${b.project}, ${!!b.aktif}, ${b.pengetahuan || ''}, ${user.username})
    ON CONFLICT (project) DO UPDATE SET aktif = EXCLUDED.aktif, pengetahuan = EXCLUDED.pengetahuan, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  return Response.json({ ok: true });
}

// Uji coba percakapan tanpa WhatsApp (simulasi)
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!['manager', 'markom'].includes(user.role)) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
  const b = await req.json();
  const sql = db(); await siapkanAI(sql);
  const cfg = await konfigAI(sql, b.project || 'BIO DISTRICT');
  try {
    const out = await tanyaAI({ project: b.project, pengetahuan: b.pengetahuan ?? cfg.pengetahuan, set: await bacaSettings(sql), riwayat: b.riwayat || [] });
    return Response.json(out);
  } catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
}

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const PUT = denganLog('Asisten AI', _PUT, ({ body }) => ({ detail: `pengetahuan & status AI · ${body.project}` }));
export const POST = denganLog('Asisten AI', _POST, ({ body }) => ({ aksi: 'Uji coba', detail: body.project || '' }));
