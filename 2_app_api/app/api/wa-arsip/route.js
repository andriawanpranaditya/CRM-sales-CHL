import { db } from '@/lib/db';
import { requireUser, lihatBaris } from '@/lib/auth';
import { siapkanAI, daftarSiapArsip } from '@/lib/ai';

export const dynamic = 'force-dynamic';
const PERAN = ['administrator', 'headsales', 'salesmanager', 'markom'];   // pemegang HP official (Marcom) & Administrator — sales tidak perlu

// GET: chat yang siap diarsipkan di HP official
export async function GET() {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanAI(sql);
  const rows = (await daftarSiapArsip(sql)).filter(r => lihatBaris(user, r));
  return Response.json({ rows });
}

// POST { wa: ['62…', …] }: tandai sudah diarsipkan di HP (tidak tampil lagi di daftar)
export async function POST(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanAI(sql);
  const b = await req.json().catch(() => ({}));
  const daftar = (Array.isArray(b.wa) ? b.wa : []).map(x => String(x).replace(/[^0-9]/g, '')).filter(Boolean).slice(0, 500);
  for (const w of daftar) {
    const k = (await sql`SELECT lead_code FROM wa_percakapan WHERE wa = ${w} AND lead_code IS NOT NULL ORDER BY id DESC LIMIT 1`)[0]?.lead_code || null;
    await sql`INSERT INTO wa_arsip (wa, lead_code, oleh) VALUES (${w}, ${k}, ${user.name}) ON CONFLICT (wa) DO UPDATE SET oleh = EXCLUDED.oleh, created_at = now()`;
  }
  return Response.json({ ok: true, jumlah: daftar.length });
}
