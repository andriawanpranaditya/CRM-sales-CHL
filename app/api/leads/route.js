import { db, siapkanStatusLog, tandaiOleh } from '@/lib/db';
import { requireUser, lihatBaris, bolehProyek, pesanProyek } from '@/lib/auth';
import { denganLog } from '@/lib/log';

export const dynamic = 'force-dynamic';

// Kode iklan WA dari pesan pertama (mis. BD14-2 = project BIO DISTRICT, campaign id 14, iklan ke-2) -> campaign & kreatif
async function petakanKodeWA(sql, kode) {
  const k = String(kode || '').trim().toUpperCase().replace(/[()\s]/g, '');
  const m = /^([A-Z]{2,3})(\d+)-(\d+)$/.exec(k);
  if (!m) return null;
  try {
    const c = await sql`SELECT nama FROM mi_campaigns WHERE id = ${Number(m[2])}`;
    if (c.length) return { campaign: c[0].nama, konten: k };
  } catch {}
  return null;
}

export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const semua = new URL(req.url).searchParams.get('all') === '1'; // dipakai dashboard markom
  let rows;
  // creator_role: peran pembuat lead — dipakai laporan "lead dari Marcom"
  if (user.role === 'sales') rows = await sql`SELECT l.*, u.role AS creator_role FROM leads l LEFT JOIN users u ON u.username = l.created_by WHERE l.sales = ${user.name} ORDER BY l.id`;
  // Marcom: satu tim berbagi data — semua lead yang diinput akun berperan marcom (aktif maupun nonaktif)
  else if (user.role === 'markom' && !semua) rows = await sql`SELECT l.*, u.role AS creator_role FROM leads l JOIN users u ON u.username = l.created_by AND u.role = 'markom' ORDER BY l.id`;
  else rows = await sql`SELECT l.*, u.role AS creator_role FROM leads l LEFT JOIN users u ON u.username = l.created_by ORDER BY l.id`;
  // Akun per project: hanya lead project yang diizinkan
  if (user.projects) rows = rows.filter(r => lihatBaris(user, r));
  return Response.json(rows);
}

async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (b.project && !bolehProyek(user, b.project)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  if (!b.nama) return Response.json({ error: 'Nama konsumen wajib diisi' }, { status: 400 });
  const sales = user.role === 'sales' ? user.name : (b.sales || '');
  // Markom boleh input lead tanpa sales — PIC ditetapkan nanti via Leads to Sales
  if (!sales && user.role !== 'markom') return Response.json({ error: 'Sales / PIC wajib dipilih' }, { status: 400 });
  const sql = db();
  await siapkanStatusLog(sql);
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS usia text`; } catch {}
  if (b.kode_wa) { const pk = await petakanKodeWA(sql, b.kode_wa); if (pk) { if (!b.campaign) b.campaign = pk.campaign; if (!b.konten) b.konten = pk.konten; } }
  // 🛑 Anti-duplikat: satu nomor WA = satu lead (08xx / +62 / 62 dianggap sama)
  let waN = String(b.wa || '').replace(/[^0-9]/g, '');
  if (waN.startsWith('0')) waN = '62' + waN.slice(1); else if (waN.startsWith('8')) waN = '62' + waN;
  if (waN.length >= 9 && !(['manager', 'ceo'].includes(user.role) && b.force)) {
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
  const ins = await sql`INSERT INTO leads (tgl, nama, wa, email, domisili, kerja, sumber, walkin_info, project, tipe, tujuan, budget, bayar, sales, status, catatan, next_fu, campaign, konten, usia, created_by)
    VALUES (${b.tgl || null}, ${b.nama}, ${b.wa || ''}, ${b.email || ''}, ${b.domisili || ''}, ${b.kerja || ''},
            ${b.sumber || ''}, ${wInfo}, ${b.project || ''}, ${b.tipe || ''}, ${b.tujuan || ''}, ${Number(b.budget) || 0},
            ${b.bayar || ''}, ${sales}, ${b.status || 'New'}, ${b.catatan || ''}, ${b.next_fu || null}, ${b.campaign || ''}, ${b.konten || ''}, ${b.usia || ''}, ${user.username})
    RETURNING id`;
  const id = ins[0].id;
  const code = 'LEAD-' + String(id).padStart(4, '0');
  await sql`UPDATE leads SET lead_code = ${code} WHERE id = ${id}`;
  // Catat serah terima awal bila lead langsung punya PIC (tidak boleh menggagalkan penyimpanan)
  if (sales) {
    try {
      await sql`INSERT INTO lead_assign (lead_code, dari, ke, oleh) VALUES (${code}, ${''}, ${sales}, ${user.username})`;
    } catch (e) { /* tabel riwayat belum ada — lewati */ }
  }
  return Response.json({ ok: true, id, lead_code: code });
}

async function _PATCH(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS usia text`; } catch {}
  const rows = await sql`SELECT * FROM leads WHERE id = ${b.id}`;
  if (!rows.length) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
  const cur = rows[0];
  if (user.role === 'sales' && cur.sales !== user.name) {
    return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  }
  if (!lihatBaris(user, cur)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  if ('project' in b && b.project && !bolehProyek(user, b.project)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  const FIELDS = ['tgl', 'nama', 'wa', 'email', 'domisili', 'kerja', 'sumber', 'walkin_info', 'project', 'tipe', 'tujuan', 'budget', 'bayar', 'status', 'catatan', 'next_fu', 'campaign', 'konten', 'usia'];
  const m = { ...cur };
  for (const k of FIELDS) if (k in b) m[k] = b[k];
  if (b.kode_wa) { const pk = await petakanKodeWA(sql, b.kode_wa); if (pk) { if (!m.campaign) m.campaign = pk.campaign; if (!m.konten) m.konten = pk.konten; } }
  let operKe = null;
  if (['manager', 'ceo', 'markom'].includes(user.role) && 'sales' in b && b.sales) {
    if ((cur.sales || '') !== b.sales) operKe = b.sales;
    m.sales = b.sales;
  }
  if (!m.nama) return Response.json({ error: 'Nama tidak boleh kosong' }, { status: 400 });
  // Oper hanya ke sales yang memegang project lead ini (bila sales tsb dibatasi per project)
  if (operKe && m.project) {
    try {
      const t = await sql`SELECT projects FROM users WHERE name = ${operKe} AND role = 'sales' LIMIT 1`;
      const pp = t[0]?.projects;
      if (Array.isArray(pp) && pp.length && !pp.includes(m.project)) return Response.json({ error: `${operKe} hanya memegang project ${pp.join(', ')} — pilih sales ${m.project}` }, { status: 400 });
    } catch {}
  }
  await sql`UPDATE leads SET
    tgl = ${m.tgl || null}, nama = ${m.nama}, wa = ${m.wa || ''}, email = ${m.email || ''},
    domisili = ${m.domisili || ''}, kerja = ${m.kerja || ''}, sumber = ${m.sumber || ''},
    walkin_info = ${/walk/i.test(m.sumber || '') ? (m.walkin_info || '') : ''},
    project = ${m.project || ''}, tipe = ${m.tipe || ''}, tujuan = ${m.tujuan || ''},
    budget = ${Number(m.budget) || 0}, bayar = ${m.bayar || ''}, sales = ${m.sales},
    status = ${m.status || 'New'}, catatan = ${m.catatan || ''}, next_fu = ${m.next_fu || null},
    campaign = ${m.campaign || ''}, konten = ${m.konten || ''}, usia = ${m.usia || ''},
    updated_at = now()
    WHERE id = ${b.id}`;
  await tandaiOleh(sql, cur.lead_code, user.username, '');
  // Riwayat serah terima — tidak boleh menggagalkan penyimpanan lead
  if (operKe) {
    try {
      await sql`INSERT INTO lead_assign (lead_code, dari, ke, oleh) VALUES (${cur.lead_code}, ${cur.sales || ''}, ${operKe}, ${user.username})`;
    } catch (e) { /* tabel riwayat belum ada — lewati */ }
  }
  // Untuk log aktivitas: field yang benar-benar berubah
  const teks = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
  const sama = (k, a, c) => k === 'budget' ? Number(a || 0) === Number(c || 0)
    : (k === 'tgl' || k === 'next_fu') ? teks(a).slice(0, 10) === teks(c).slice(0, 10) : String(a ?? '') === String(c ?? '');
  const berubah = FIELDS.filter(k => k in b && !sama(k, b[k], cur[k]));
  return Response.json({ ok: true, lead_code: cur.lead_code, nama: m.nama, berubah, oper: operKe || undefined });
}

// Hapus lead (beserta follow up & transaksinya) atau CLEAR SEMUA data — khusus manager
async function _DELETE(req) {
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
  const rows = await sql`SELECT lead_code, nama FROM leads WHERE id = ${b.id}`;
  if (!rows.length) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
  const code = rows[0].lead_code;
  await sql`DELETE FROM transactions WHERE lead_code = ${code}`;
  await sql`DELETE FROM followups WHERE lead_code = ${code}`;
  await sql`DELETE FROM leads WHERE id = ${b.id}`;
  return Response.json({ ok: true, lead_code: code, nama: rows[0].nama });
}

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const POST = denganLog('Lead', _POST, ({ body, out }) => ({ aksi: 'Input', detail: [out.lead_code, body.nama, body.sumber, body.project, body.sales ? 'PIC ' + body.sales : 'belum ada PIC'].filter(Boolean).join(' · ') }));
export const PATCH = denganLog('Lead', _PATCH, ({ body, out }) => ({ aksi: out.oper ? 'Oper ke Sales' : 'Update', detail: [out.lead_code, out.nama, out.oper ? 'ke ' + out.oper : '', out.berubah && out.berubah.length ? 'ubah: ' + out.berubah.join(', ') : 'tanpa perubahan'].filter(Boolean).join(' · ') }));
export const DELETE = denganLog('Lead', _DELETE, ({ body, out }) => body.all === true ? { aksi: 'Hapus SEMUA data', detail: out.terhapus ? `lead ${out.terhapus.lead} · FU ${out.terhapus.followup} · transaksi ${out.terhapus.transaksi}` : '' } : { detail: [out.lead_code, out.nama, 'beserta FU & transaksinya'].filter(Boolean).join(' · ') });
