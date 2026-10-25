import { db, siapkanStatusLog, tandaiOleh } from '@/lib/db';
import { requireUser, lihatBaris, pesanProyek } from '@/lib/auth';
import { sinkronJanjianLead } from '@/lib/janjian';
import { denganLog } from '@/lib/log';
import { siapkanFuWajib, riwayatFU } from '@/lib/fuwajib-db';
import { statusFU, sentuhanSales, aturStatus, hariIniWIB, keTgl, tambahHari, NURTURE, ALASAN_DROP_DINI, TOTAL_SENTUHAN, MAKS_HARI_PERCAKAPAN } from '@/lib/fuwajib';

export const dynamic = 'force-dynamic';

// Kolom "lead membalas?" pada follow up — disiapkan sekali per cold start
let kolomBalas = false;
async function siapkanBalas(sql) {
  if (kolomBalas) return;
  try { await sql`ALTER TABLE followups ADD COLUMN IF NOT EXISTS balas boolean`; } catch {}
  kolomBalas = true;
}

export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const semua = new URL(req.url).searchParams.get('all') === '1';
  let rows;
  if (user.role === 'sales') rows = await sql`SELECT f.*, l.nama, l.project, l.sales, l.wa, (SELECT x.name FROM users x WHERE x.username = f.created_by) AS oleh_nama FROM followups f JOIN leads l ON l.lead_code = f.lead_code WHERE l.sales = ${user.name} ORDER BY f.tgl DESC, f.id DESC`;
  else if (user.role === 'markom' && !semua) rows = await sql`SELECT f.*, l.nama, l.project, l.sales, l.wa, (SELECT x.name FROM users x WHERE x.username = f.created_by) AS oleh_nama FROM followups f JOIN leads l ON l.lead_code = f.lead_code JOIN users u ON u.username = l.created_by AND u.role = 'markom' ORDER BY f.tgl DESC, f.id DESC`;
  else rows = await sql`SELECT f.*, l.nama, l.project, l.sales, l.wa, (SELECT x.name FROM users x WHERE x.username = f.created_by) AS oleh_nama FROM followups f LEFT JOIN leads l ON l.lead_code = f.lead_code ORDER BY f.tgl DESC, f.id DESC`;
  if (user.projects) rows = rows.filter(r => lihatBaris(user, r));
  // Peran penginput tiap FU — form membedakan FU Marcom dan FU sales untuk jadwal FU wajib
  try {
    const peran = Object.fromEntries((await sql`SELECT username, role FROM users`).map(u => [u.username, u.role]));
    rows = rows.map(r => ({ ...r, oleh_role: peran[r.created_by] || null }));
  } catch {}
  return Response.json(rows);
}

async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.lead_code || !b.detail) return Response.json({ error: 'ID Lead dan Detail Komunikasi wajib diisi' }, { status: 400 });
  if ((b.next_action === 'Drop' || b.status === 'Drop') && !String(b.objection || '').trim()) return Response.json({ error: 'Alasan drop wajib diisi' }, { status: 400 });
  const sql = db();
  if (user.role === 'sales') {
    const own = await sql`SELECT 1 FROM leads WHERE lead_code = ${b.lead_code} AND sales = ${user.name}`;
    if (!own.length) return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  }
  if (user.projects) {
    const l = await sql`SELECT project, sales, created_by FROM leads WHERE lead_code = ${b.lead_code}`;
    if (l.length && !lihatBaris(user, l[0])) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  }
  await siapkanBalas(sql);
  await siapkanStatusLog(sql);
  const balas = b.balas === true ? true : b.balas === false ? false : null;
  const sebelum = (await sql`SELECT status FROM leads WHERE lead_code = ${b.lead_code}`)[0]?.status || '';
  const gagal = pesan => Response.json({ error: pesan }, { status: 400 });

  // ===== Standar FU wajib sales (lihat lib/fuwajib.js) =====
  // Berlaku untuk FU oleh sales / manager pada lead yang punya sales & belum Booking/Closing/Drop.
  // Sales: aturan ditegakkan (ditolak bila melanggar). Manager/CEO: hanya penyesuaian otomatis.
  let info = null;
  if (user.role !== 'markom') {
    await siapkanFuWajib(sql);
    const lead = (await sql`SELECT * FROM leads WHERE lead_code = ${b.lead_code}`)[0];
    const today = hariIniWIB();
    const riw = lead ? await riwayatFU(sql, [b.lead_code]) : [];
    const stA = lead ? statusFU(lead, riw, today) : { aktif: false };
    const henti = ['Reserved', 'Booking'].includes(b.next_action || '');
    if (stA.aktif && !henti) {
      const ketat = user.role === 'sales';
      if (balas === null && ketat) return gagal('Pilih dulu: apakah lead membalas?');
      const tFu = keTgl(b.tgl) || today;
      const baru = { id: Number.MAX_SAFE_INTEGER, lead_code: b.lead_code, tgl: tFu, detail: b.detail, objection: b.objection || '', next_action: b.next_action || '', balas, created_by: user.username, oleh_role: user.role };
      const riwB = [...riw, baru];
      const ke = sentuhanSales(lead, riw, stA.mulai).length + 1;
      const drop = b.next_action === 'Drop' || b.status === 'Drop';
      if (!drop) {
        const a = aturStatus({ ke, balas, statusDipilih: b.status, statusLead: lead.status });
        if (a.error && ketat) return gagal(a.error);
        if (a.otomatis) { b.status = a.status; info = 'Belum ada balasan pada FU ke-' + ke + ' — status otomatis menjadi Cold.'; }
        else if (!b.status && ketat) return gagal('Status lead wajib dipilih.');
      }
      const leadSesudah = { ...lead, status: (b.status && b.status !== 'Drop') ? b.status : (lead.status === 'Drop' ? 'New' : lead.status), next_fu: null };
      const stB = statusFU(leadSesudah, riwB.map(f => f === baru ? { ...f, next_action: '' } : f), today);
      if (drop) {
        const pernahBalas = sentuhanSales(lead, riwB, stA.mulai).some(f => f.balas === true) || stA.jalur === 'lama';
        const dalamJadwal = ['wajib', 'undangan'].includes(stA.mode) && stB.mode !== 'tuntas';
        const alasan = String(b.objection || '').trim().toLowerCase();
        const alasanDini = ALASAN_DROP_DINI.some(x => alasan.includes(x.toLowerCase().split(' (')[0].split(' / ')[0]));
        if (ketat && !pernahBalas && dalamJadwal && !alasanDini)
          return gagal(`Lead belum pernah membalas dan jadwal FU wajib belum tuntas (sentuhan ${ke} dari ${stA.total || TOTAL_SENTUHAN}). Drop sebelum tuntas hanya untuk: ${ALASAN_DROP_DINI.join(', ')}.`);
      } else if (b.next_action === NURTURE) {
        if (stA.mode !== 'tuntas' && stB.mode !== 'tuntas' && stA.mode !== 'nurture' && ketat) return gagal('Nurture bulanan hanya bisa dipilih setelah jadwal FU wajib tuntas.');
        b.next_tgl = tambahHari(tFu, 30);
      } else if (stB.mode === 'percakapan') {
        const batas = tambahHari(today, MAKS_HARI_PERCAKAPAN);
        if (!b.next_tgl) { if (ketat) return gagal('Konsumen dalam percakapan — Tgl Next Follow Up wajib diisi (maksimal 7 hari ke depan).'); b.next_tgl = tambahHari(today, 3); }
        if (keTgl(b.next_tgl) > batas) { if (ketat) return gagal('Tgl Next Follow Up maksimal 7 hari ke depan (' + batas + ').'); b.next_tgl = batas; }
        if (!b.next_action) b.next_action = 'Lanjut Follow Up';
      } else if (stB.mode === 'wajib' || stB.mode === 'undangan') {
        if (!b.next_tgl || keTgl(b.next_tgl) > stB.jatuh) b.next_tgl = stB.jatuh; // boleh dimajukan, tidak boleh dimundurkan
        if (!b.next_action) b.next_action = 'Lanjut Follow Up';
        if (!info) info = 'FU berikutnya: ' + stB.label + ' — ' + b.next_tgl + '.';
      } else if (stB.mode === 'tuntas') {
        b.next_tgl = stB.jatuh;
        info = 'Jadwal FU wajib tuntas tanpa balasan — pada FU berikutnya pilih Drop (' + 'Tidak ada respon setelah 9 sentuhan' + ') atau Nurture bulanan.';
      }
    }
  }
  if (b.next_action === 'Drop' && (b.objection || '').trim() && !String(b.detail || '').includes('Drop:')) b.detail = String(b.detail || '') + ' — Drop: ' + b.objection.trim();
  await sql`INSERT INTO followups (lead_code, tgl, detail, objection, next_action, next_tgl, wa_pesan, created_by, balas)
    VALUES (${b.lead_code}, ${b.tgl || null}, ${b.detail}, ${b.objection || ''}, ${b.next_action || ''}, ${b.next_tgl || null}, ${b.wa_pesan || ''}, ${user.username}, ${balas})`;
  // Status lead ikut diperbarui dari form follow up (Drop/Reserved/Booking diatur oleh logika di bawah)
  if (b.status && !['Drop', 'Reserved', 'Booking'].includes(b.next_action || '')) {
    await sql`UPDATE leads SET status = ${b.status}, updated_at = now() WHERE lead_code = ${b.lead_code} AND status IS DISTINCT FROM ${b.status}`;
  }
  await tandaiOleh(sql, b.lead_code, user.username, b.objection || '');
  // Sinkron ke lead
  if (b.next_action === 'Drop') {
    // Drop: status lead jadi Drop & jadwal FU dihapus -> tidak muncul lagi di lonceng/reminder
    await sql`UPDATE leads SET status = 'Drop', next_fu = NULL, updated_at = now() WHERE lead_code = ${b.lead_code}`;
    await tandaiOleh(sql, b.lead_code, user.username, b.objection || '');
  } else if (b.next_action === 'Reserved' || b.next_action === 'Booking') {
    // Konsumen sudah reserved/booking: jadwal FU dihentikan (status & angka mengikuti transaksi di menu Booking)
    await sql`UPDATE leads SET next_fu = NULL, updated_at = now() WHERE lead_code = ${b.lead_code}`;
  } else if (b.next_tgl) {
    await sql`UPDATE leads SET next_fu = ${b.next_tgl}, updated_at = now() WHERE lead_code = ${b.lead_code}`;
  }
  // Janji temu yang jadwalnya sudah tiba ikut tercatat dari isi follow up ini (Datang / Batal) —
  // HANYA bila status lead benar-benar BERUBAH pada follow up ini (follow up biasa pada lead yang sudah Site Visit tidak dihitung datang lagi)
  const stBaru = b.next_action === 'Drop' ? 'Drop' : b.next_action === 'Booking' ? 'Booking' : b.status;
  if (stBaru && stBaru !== sebelum) await sinkronJanjianLead(sql, b.lead_code, { status: stBaru, catatan: b.detail, oleh: user.name, dari: 'form follow up' });
  return Response.json({ ok: true, info, status: b.status || null, next_fu: b.next_tgl || null });
}

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const POST = denganLog('Follow Up', _POST);
