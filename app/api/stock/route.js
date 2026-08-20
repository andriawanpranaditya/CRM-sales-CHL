import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = await sql`SELECT project, unit, x, y FROM unit_positions`;
  return Response.json(rows);
}

// Simpan / pindahkan posisi unit di peta — khusus manager
export async function POST(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit || typeof b.x !== 'number' || typeof b.y !== 'number') {
    return Response.json({ error: 'project, unit, x, y wajib' }, { status: 400 });
  }
  const sql = db();
  await sql`INSERT INTO unit_positions (project, unit, x, y)
            VALUES (${b.project}, ${b.unit}, ${b.x}, ${b.y})
            ON CONFLICT (project, unit) DO UPDATE SET x = ${b.x}, y = ${b.y}`;
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit) return Response.json({ error: 'project & unit wajib' }, { status: 400 });
  const sql = db();
  await sql`DELETE FROM unit_positions WHERE project = ${b.project} AND unit = ${b.unit}`;
  return Response.json({ ok: true });
}
