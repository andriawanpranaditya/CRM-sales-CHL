// ===== Standar FU Wajib — bagian server (kolom, migrasi sekali jalan, riwayat) =====
import { hariIniWIB, kamisMulai } from './fuwajib';

let siap = false;
export async function siapkanFuWajib(sql) {
  if (siap) return;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fu_mulai date`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fu_jalur text`;
  await sql`ALTER TABLE followups ADD COLUMN IF NOT EXISTS balas boolean`;
  await sql`CREATE TABLE IF NOT EXISTS app_flags (key text PRIMARY KEY, nilai text, created_at timestamptz NOT NULL DEFAULT now())`;
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
