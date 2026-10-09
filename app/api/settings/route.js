import { db, DEFAULT_SETTINGS, DEFAULT_UNITS } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { denganLog } from '@/lib/log';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = await sql`SELECT key, items FROM settings`;
  const out = { ...DEFAULT_SETTINGS };
  rows.forEach(r => { out[r.key] = r.items; });
  let sales;
  try { sales = await sql`SELECT name, projects FROM users WHERE role = 'sales' AND active = true ORDER BY name`; }
  catch { sales = await sql`SELECT name FROM users WHERE role = 'sales' AND active = true ORDER BY name`; }
  if (!out.units) out.units = DEFAULT_UNITS;
  // Akun per project: daftar project, unit & sales dibatasi — semua dropdown (form lead, FU, Reserved/Booking,
  // Master Stock, Simulasi) otomatis hanya menampilkan project yang diizinkan
  if (user.projects) {
    out.project = (out.project || []).filter(p => user.projects.includes(p));
    out.units = Object.fromEntries(Object.entries(out.units || {}).filter(([p]) => user.projects.includes(p)));
    sales = sales.filter(s => !Array.isArray(s.projects) || !s.projects.length || s.projects.some(p => user.projects.includes(p)));
  }
  out.sales = sales.map(s => s.name);
  out.sales_project = Object.fromEntries(sales.map(s => [s.name, Array.isArray(s.projects) && s.projects.length ? s.projects : null]));
  return Response.json(out);
}

async function _PUT(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  const sql = db();
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (Array.isArray(b[key])) {
      await sql`INSERT INTO settings (key, items) VALUES (${key}, ${JSON.stringify(b[key])})
                ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(b[key])}`;
    }
  }
  if (b.units && typeof b.units === 'object' && !Array.isArray(b.units)) {
    await sql`INSERT INTO settings (key, items) VALUES ('units', ${JSON.stringify(b.units)})
              ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(b.units)}`;
  }
  return Response.json({ ok: true });
}

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const PUT = denganLog('Settings', _PUT, ({ body }) => ({ detail: 'daftar: ' + Object.keys(body).join(', ') }));
