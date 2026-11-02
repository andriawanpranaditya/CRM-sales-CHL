import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Jejak persetujuan satu IOM
export async function GET(req, { params }) {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  const log = await sql`SELECT * FROM iom_log WHERE iom_id = ${params.id} ORDER BY id`;
  return Response.json({ log });
}
