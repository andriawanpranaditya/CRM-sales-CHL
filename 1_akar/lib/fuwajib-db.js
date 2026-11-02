// ===== Standar FU Wajib — bagian server (kolom, migrasi sekali jalan, riwayat) =====
import { hariIniWIB, kamisMulai, statusFU, sentuhanSales, aturStatus } from './fuwajib';

let siap = false;
export async function siapkanFuWajib(sql) {
  if (siap) return;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fu_mulai date`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fu_jalur text`;
  await sql`ALTER TABLE followups ADD COLUMN IF NOT EXISTS balas boolean`;
  // Kolom transaksi dari CRM Sales (Collection & KPR CRM, Analisa Marcom, laporan penjualan) — kosong untuk transaksi Harmoni One
  try { await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS nilai_jual numeric`; } catch {}
  try { await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cicilan integer`; } catch {}
  try { await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS datang boolean`; } catch {}
  try { await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS no_kontrak text`; } catch {}
  try { await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS skema text`; } catch {}
  await sql`CREATE TABLE IF NOT EXISTS app_flags (key text PRIMARY KEY, nilai text, created_at timestamptz NOT NULL DEFAULT now())`;
  // Riwayat serah terima lead (Leads to Sales / ganti PIC) — dipakai jadwal FU wajib & timeline lead
  await sql`CREATE TABLE IF NOT EXISTS lead_assign (id serial PRIMARY KEY, lead_code text NOT NULL, dari text, ke text, oleh text,
    created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_assign_lead ON lead_assign (lead_code)`;
  const sudah = await sql`SELECT 1 FROM app_flags WHERE key = 'fu_wajib_v1'`;
  if (!sudah.length) {
    // Lead lama saat aturan diberlakukan:
    //  • New / Cold / Warm / Hot  → jalur Open House: undangan weekend tiap Kamis (4 minggu), dimulai Kamis terdekat.
    //    Jadwal FU yang sudah direncanakan sebelum Kamis tsb tetap dipertahankan.
    //  • status lain yang masih punya sales (Appointment, Site Visit, …) → mode percakapan.
    const today = hariIniWIB(), kamis = kamisMulai(today);
    await sql`UPDATE leads SET fu_jalur = 'openhouse', fu_mulai = ${today}::date,
        next_fu = CASE WHEN next_fu IS NOT NULL AND next_fu >= ${today}::date AND next_fu < ${kamis}::date THEN next_fu ELSE ${kamis}::date END
      WHERE fu_jalur IS NULL AND COALESCE(sales, '') <> '' AND status IN ('New', 'Cold', 'Warm', 'Hot')`;
    await sql`UPDATE leads SET fu_jalur = 'lama', fu_mulai = ${today}::date,
        next_fu = CASE WHEN status IN ('Booking', 'Closing', 'Drop', 'Lost') THEN next_fu ELSE COALESCE(next_fu, ${today}::date + 7) END
      WHERE fu_jalur IS NULL AND COALESCE(sales, '') <> ''`;
    await sql`INSERT INTO app_flags (key, nilai) VALUES ('fu_wajib_v1', ${today}) ON CONFLICT (key) DO NOTHING`;
  }
  siap = true;
}

// Lead baru masuk ke sales (diinput dengan PIC / dioper): jadwal wajib dimulai hari ini, Hari 1 jatuh hari ini
export async function mulaiJadwalBaru(sql, leadCode) {
  const today = hariIniWIB();
  await sql`UPDATE leads SET fu_jalur = 'baru', fu_mulai = ${today}::date, next_fu = ${today}::date WHERE lead_code = ${leadCode}`;
}

// Riwayat FU beberapa lead + peran penginputnya (untuk membedakan FU Marcom dan FU sales)
export async function riwayatFU(sql, codes) {
  if (!codes || !codes.length) return [];
  return sql`SELECT f.id, f.lead_code, f.tgl::text AS tgl, f.detail, f.objection, f.next_action, f.next_tgl::text AS next_tgl, f.balas,
      f.created_by, f.created_at, u.role AS oleh_role
    FROM followups f LEFT JOIN users u ON u.username = f.created_by
    WHERE f.lead_code = ANY(${codes}::text[]) ORDER BY f.id`;
}

// ===== Sentuhan FU lewat template WhatsApp (nomor official) =====
// Template dikirim saat konsumen tidak membalas dalam 24 jam → dicatat sebagai follow up "belum membalas" dan
// jadwal FU wajib berikutnya + aturan status (FU ke-2 tanpa balasan → Cold) dihitung otomatis, sama seperti form Follow Up.
export async function catatSentuhanWA(sql, user, leadCode, detail, waPesan) {
  await siapkanFuWajib(sql);
  const lead = (await sql`SELECT * FROM leads WHERE lead_code = ${leadCode}`)[0];
  if (!lead) return null;
  const today = hariIniWIB();
  const riw = await riwayatFU(sql, [leadCode]);
  const stA = statusFU(lead, riw, today);
  let status = lead.status, next = null, label = '';
  if (stA.aktif) {
    const ke = sentuhanSales(lead, riw, stA.mulai).length + 1;
    const a = aturStatus({ ke, balas: false, statusDipilih: lead.status, statusLead: lead.status });
    if (a.otomatis) status = a.status;
    const baru = { id: Number.MAX_SAFE_INTEGER, lead_code: leadCode, tgl: today, balas: false, oleh_role: user.role, created_by: user.username, next_action: '' };
    const stB = statusFU({ ...lead, status, next_fu: null }, [...riw, baru], today);
    if (stB.aktif && stB.mode !== 'percakapan') next = stB.jatuh;
    label = stB.aktif ? stB.label : '';
  }
  await sql`INSERT INTO followups (lead_code, tgl, detail, objection, next_action, next_tgl, wa_pesan, created_by, balas)
    VALUES (${leadCode}, ${today}, ${detail}, '', 'Lanjut Follow Up', ${next}, ${String(waPesan || '').slice(0, 1000)}, ${user.username}, false)`;
  await sql`UPDATE leads SET status = ${status}, next_fu = COALESCE(${next}::date, next_fu), updated_at = now() WHERE lead_code = ${leadCode}`;
  return { label, next, status };
}
