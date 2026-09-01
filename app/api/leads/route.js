import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const semua = new URL(req.url).searchParams.get('all') === '1'; // dipakai dashboard markom
  let rows;
  if (user.role === 'sales') rows = await sql`SELECT * FROM leads WHERE sales = ${user.name} ORDER BY id`;
  else if (user.role === 'markom' && !semua) rows = await sql`SELECT * FROM leads WHERE created_by = ${user.username} ORDER BY id`;
  else rows = await sql`SELECT * FROM leads ORDER BY id`;
  return Response.json(rows);
}

export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.nama) return Response.json({ error: 'Nama konsumen wajib diisi' }, { status: 400 });
  const sales = user.role === 'sales' ? user.name : (b.sales || '');
  // Markom boleh input lead tanpa sales — PIC ditetapkan nanti via Leads to Sales
  if (!sales && user.role !== 'markom') return Response.json({ error: 'Sales / PIC wajib dipilih' }, { status: 400 });
  const sql = db();
  // 🛑 Anti-duplikat: satu nomor WA = satu lead (08xx / +62 / 62 dianggap sama)
  let waN = String(b.wa || '').replace(/[^0-9]/g, '');
  if (waN.startsWith('0')) waN = '62' + waN.slice(1); else if (waN.startsWith('8')) waN = '62' + waN;
  if (waN.length >= 9 && !(user.role === 'manager' && b.force)) {
    const dup = await sql`SELECT l.lead_code, l.nama, l.sales, l.project, l.status, u.name AS pembuat, u.role AS pembuat_role
      FROM leads l LEFT JOIN users u ON u.username = l.created_by
      WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(l.wa,''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${waN}
      ORDER BY l.id LIMIT 1`;
    if (dup.length) {
      const d = dup[0];
      const asal = d.pembuat_role === 'markom' ? ' (dari Marcom ' + d.pembuat + ')' : '';
      return Response.json({
        error: `Nomor WA ini sudah terdaftar sebagai ${d.lead_code} — ${d.nama}, PIC: ${d.sales || 'belum ada'}${asal}. Gunakan lead tersebut, jangan input ulang.`,
        dup: d,
      }, { status: 409 });
    }
  }
  const wInfo = /walk/i.test(b.sumber || '') ? (b.walkin_info || '') : '';
  const ins = await sql`INSERT INTO leads (tgl, nama, wa, email, domisili, kerja, sumber, walkin_info, project, tipe, tujuan, budget, bayar, sales, status, catatan, next_fu, created_by)
    VALUES (${b.tgl || null}, ${b.nama}, ${b.wa || ''}, ${b.email || ''}, ${b.domisili || ''}, ${b.kerja || ''},
            ${b.sumber || ''}, ${wInfo}, ${b.project || ''}, ${b.tipe || ''}, ${b.tujuan || ''}, ${Number(b.budget) || 0},
            ${b.bayar || ''}, ${sales}, ${b.status || 'New'}, ${b.catatan || ''}, ${b.next_fu || null}, ${user.username})
    RETURNING id`;
  const id = ins[0].id;
  const code = 'LEAD-' + String(id).padStart(4, '0');
  await sql`UPDATE leads SET lead_code = ${code} WHERE id = ${id}`;
  return Response.json({ ok: true, id, lead_code: code });
}

export async function PATCH(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const rows = await sql`SELECT * FROM leads WHERE id = ${b.id}`;
  if (!rows.length) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
  const cur = rows[0];
  if (user.role === 'sales' && cur.sales !== user.name) {
    return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  }
  const FIELDS = ['tgl', 'nama', 'wa', 'email', 'domisili', 'kerja', 'sumber', 'walkin_info', 'project', 'tipe', 'tujuan', 'budget', 'bayar', 'status', 'catatan', 'next_fu'];
  const m = { ...cur };
  for (const k of FIELDS) if (k in b) m[k] = b[k];
  if ((user.role === 'manager' || user.role === 'markom') && 'sales' in b && b.sales) m.sales = b.sales;
  if (!m.nama) return Response.json({ error: 'Nama tidak boleh kosong' }, { status: 400 });
  await sql`UPDATE leads SET
    tgl = ${m.tgl || null}, nama = ${m.nama}, wa = ${m.wa || ''}, email = ${m.email || ''},
    domisili = ${m.domisili || ''}, kerja = ${m.kerja || ''}, sumber = ${m.sumber || ''},
    walkin_info = ${/walk/i.test(m.sumber || '') ? (m.walkin_info || '') : ''},
    project = ${m.project || ''}, tipe = ${m.tipe || ''}, tujuan = ${m.tujuan || ''},
    budget = ${Number(m.budget) || 0}, bayar = ${m.bayar || ''}, sales = ${m.sales},
    status = ${m.status || 'New'}, catatan = ${m.catatan || ''}, next_fu = ${m.next_fu || null},
    updated_at = now()
    WHERE id = ${b.id}`;
  return Response.json({ ok: true });
}

// Hapus lead (beserta follow up & transaksinya) atau CLEAR SEMUA data — khusus manager
export async function DELETE(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  const sql = db();
  if (b.all === true) {
    if (b.confirm !== 'HAPUS SEMUA') return Response.json({ error: 'Konfirmasi tidak cocok' }, { status: 400 });
    const t = await sql`DELETE FROM transactions RETURNING id`;
    const f = await sql`DELETE FROM followups RETURNING id`;
    const l = await sql`DELETE FROM leads RETURNING id`;
    return Response.json({ ok: true, terhapus: { lead: l.length, followup: f.length, transaksi: t.length } });
  }
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const rows = await sql`SELECT lead_code FROM leads WHERE id = ${b.id}`;
  if (!rows.length) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
  const code = rows[0].lead_code;
  await sql`DELETE FROM transactions WHERE lead_code = ${code}`;
  await sql`DELETE FROM followups WHERE lead_code = ${code}`;
  await sql`DELETE FROM leads WHERE id = ${b.id}`;
  return Response.json({ ok: true });
}
