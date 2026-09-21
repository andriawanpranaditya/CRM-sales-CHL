import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Timeline satu lead: lead masuk → serah terima → follow up → transaksi
export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const kode = new URL(req.url).searchParams.get('lead_code');
  if (!kode) return Response.json({ error: 'lead_code wajib' }, { status: 400 });
  const sql = db();

  const l = await sql`SELECT * FROM leads WHERE lead_code = ${kode}`;
  if (!l.length) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
  const lead = l[0];

  // Sales hanya boleh melihat timeline lead miliknya; markom lead yang ia input
  if (user.role === 'sales' && lead.sales !== user.name) {
    return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  }
  if (user.role === 'markom' && lead.created_by !== user.username) {
    return Response.json({ error: 'Lead ini bukan input Anda' }, { status: 403 });
  }

  const [assigns, fus, trx] = await Promise.all([
    sql`SELECT dari, ke, oleh, created_at FROM lead_assign WHERE lead_code = ${kode} ORDER BY created_at`.catch(() => []),
    sql`SELECT id, tgl::text AS tgl, detail, objection, next_action, next_tgl::text AS next_tgl, wa_pesan, created_by, created_at
        FROM followups WHERE lead_code = ${kode} ORDER BY created_at`,
    sql`SELECT id, tgl::text AS tgl, jenis, nilai, nilai_jual, unit, project, catatan, created_by, created_at
        FROM transactions WHERE lead_code = ${kode} ORDER BY tgl, id`,
  ]);

  return Response.json({
    lead: { ...lead, created_at: lead.created_at, next_fu: lead.next_fu },
    assigns, fus, trx,
  });
}
