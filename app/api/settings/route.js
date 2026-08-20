import { db, DEFAULT_SETTINGS, DEFAULT_UNITS } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = await sql`SELECT key, items FROM settings`;
  const out = { ...DEFAULT_SETTINGS };
  rows.forEach(r => { out[r.key] = r.items; });
  const sales = await sql`SELECT name FROM users WHERE role = 'sales' AND active = true ORDER BY name`;
  out.sales = sales.map(s => s.name);
  if (!out.units) out.units = DEFAULT_UNITS;
  return Response.json(out);
}

export async function PUT(req) {
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
