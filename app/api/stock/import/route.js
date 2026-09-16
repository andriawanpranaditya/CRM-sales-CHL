import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Data Weekly Report BIO DISTRICT s.d September 2026 (32 terjual + 1 reserved)
const DATA = [
  { u: 'Bio Ave 1 no.02', s: 'T', n: "Yuliono" },
  { u: 'Bio Ave 1 no.03', s: 'T', n: "Steven" },
  { u: 'Bio Ave 1 no.05', s: 'T', n: "Elisusana" },
  { u: 'Bio Ave 1 no.07', s: 'T', n: "Badai Indragiri" },
  { u: 'Bio Ave 2 no.05', s: 'T', n: "Dewi Mirawati" },
  { u: 'Bio Ave 2 no.06', s: 'T', n: "Johann Dandy Hartono" },
  { u: 'Bio Ave 2 no.07', s: 'T', n: "Shalita Selene Supian" },
  { u: 'Bio Ave 2 no.08', s: 'T', n: "Ivan Putra Wijaya" },
  { u: 'Bio Ave 2 no.09', s: 'T', n: "David Chrisnanto Wijaya Kusuma" },
  { u: 'Bio Ave 3 no.03', s: 'T', n: "D'Albertgati Ranapoja Soe" },
  { u: 'Bio Ave 3 no.05', s: 'T', n: "Maryanti Hutabarat" },
  { u: 'Bio Ave 3 no.06', s: 'T', n: "Muh. Yusril Nashrun Khairun Suweleh" },
  { u: 'Bio Ave 3 no.07', s: 'T', n: "Ayu Aditya" },
  { u: 'Bio Ave 3 no.09', s: 'T', n: "Sunu Arditya Sokya" },
  { u: 'Bio Ave 3 no.10', s: 'T', n: "Naura Luthfia" },
  { u: 'Bio Ave 3 no.11', s: 'T', n: "Frangky Septian" },
  { u: 'Bio Ave 3 no.12', s: 'T', n: "Andy Wijaya" },
  { u: 'Bio Ave 3 no.15', s: 'T', n: "Yos Prabowo" },
  { u: 'Bio Ave 5 no.03', s: 'T', n: "Hikmah, S.Si,APT" },
  { u: 'Bio Ave 5 no.08', s: 'T', n: "Paulus Benny Siagian" },
  { u: 'Bio Ave 5 no.09', s: 'T', n: "Akhmad Rianto Nugrohojati, SE" },
  { u: 'Bio Ave 5 no.10', s: 'T', n: "Owen Orlando Sumakul" },
  { u: 'Bio Ave 5 no.11', s: 'T', n: "Haryono" },
  { u: 'Bio Ave 5 no.15', s: 'T', n: "Taufik Safroni" },
  { u: 'Bio Ave 6 no.07', s: 'T', n: "Muhammad Subhan" },
  { u: 'Bio Blv no.03', s: 'T', n: "Wartono" },
  { u: 'Bio Blv no.05', s: 'T', n: "Naomi Michelle" },
  { u: 'Bio Blv no.06', s: 'T', n: "Andita Frida Aisha" },
  { u: 'Bio Blv no.10', s: 'T', n: "Pricillia Agyanatasya" },
  { u: 'Bio Blv no.16', s: 'T', n: "Ayu Wulan Sari" },
  { u: 'Bio Blv no.18', s: 'T', n: "Siti Nurhaliza" },
  { u: 'Bio Blv no.19', s: 'T', n: "Dian Moris, S.Si.T" },
  { u: 'Bio Blv no.12', s: 'R', n: "Mega Difary" }
];
// Master unit BIO DISTRICT sesuai SITEPLAN RESMI — 63 unit
// (penomoran melewati 01, 04, 13, 14)
const MASTER63 = [
  'Bio Ave 1 no.02',
  'Bio Ave 1 no.03',
  'Bio Ave 1 no.05',
  'Bio Ave 1 no.06',
  'Bio Ave 1 no.07',
  'Bio Ave 1 no.08',
  'Bio Ave 2 no.02',
  'Bio Ave 2 no.03',
  'Bio Ave 2 no.05',
  'Bio Ave 2 no.06',
  'Bio Ave 2 no.07',
  'Bio Ave 2 no.08',
  'Bio Ave 2 no.09',
  'Bio Ave 3 no.02',
  'Bio Ave 3 no.03',
  'Bio Ave 3 no.05',
  'Bio Ave 3 no.06',
  'Bio Ave 3 no.07',
  'Bio Ave 3 no.08',
  'Bio Ave 3 no.09',
  'Bio Ave 3 no.10',
  'Bio Ave 3 no.11',
  'Bio Ave 3 no.12',
  'Bio Ave 3 no.15',
  'Bio Ave 3 no.16',
  'Bio Ave 3 no.17',
  'Bio Ave 3 no.18',
  'Bio Ave 3 no.19',
  'Bio Ave 3 no.20',
  'Bio Ave 5 no.02',
  'Bio Ave 5 no.03',
  'Bio Ave 5 no.05',
  'Bio Ave 5 no.06',
  'Bio Ave 5 no.07',
  'Bio Ave 5 no.08',
  'Bio Ave 5 no.09',
  'Bio Ave 5 no.10',
  'Bio Ave 5 no.11',
  'Bio Ave 5 no.12',
  'Bio Ave 5 no.15',
  'Bio Ave 5 no.16',
  'Bio Ave 6 no.02',
  'Bio Ave 6 no.03',
  'Bio Ave 6 no.05',
  'Bio Ave 6 no.06',
  'Bio Ave 6 no.07',
  'Bio Ave 7 no.02',
  'Bio Ave 7 no.03',
  'Bio Blv no.02',
  'Bio Blv no.03',
  'Bio Blv no.05',
  'Bio Blv no.06',
  'Bio Blv no.07',
  'Bio Blv no.08',
  'Bio Blv no.09',
  'Bio Blv no.10',
  'Bio Blv no.11',
  'Bio Blv no.12',
  'Bio Blv no.15',
  'Bio Blv no.16',
  'Bio Blv no.17',
  'Bio Blv no.18',
  'Bio Blv no.19'
];
const PROJ = 'BIO DISTRICT';

export async function POST() {
  const { err } = await requireUser('manager'); if (err) return err;
  const sql = db();

  // 1) Setel master unit BIO DISTRICT ke daftar resmi 63 unit
  const st = await sql`SELECT items FROM settings WHERE key = 'units'`;
  const units = (st[0] && st[0].items) || {};
  const lama = Array.isArray(units[PROJ]) ? units[PROJ] : [];
  const hilang = lama.filter(u => !MASTER63.includes(u));   // unit lama yang tidak ada di siteplan
  const baru = MASTER63.filter(u => !lama.includes(u));     // unit siteplan yang belum terdaftar
  units[PROJ] = MASTER63;
  await sql`INSERT INTO settings (key, items) VALUES ('units', ${JSON.stringify(units)}::jsonb)
            ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(units)}::jsonb`;

  // Tanda/posisi pada unit yang sudah tidak ada di daftar resmi — dilaporkan, TIDAK dihapus
  const sisaTanda = hilang.length
    ? await sql`SELECT unit, status FROM unit_manual WHERE project = ${PROJ} AND unit = ANY(${hilang})`
    : [];

  // 2) Tandai status unit + nama pembeli
  const takDikenal = DATA.filter(d => !MASTER63.includes(d.u)).map(d => d.u);
  let terjual = 0, reserved = 0;
  for (const d of DATA) {
    const status = d.s === 'T' ? 'Terjual' : 'Reserved';
    await sql`INSERT INTO unit_manual (project, unit, status, nama)
              VALUES (${PROJ}, ${d.u}, ${status}, ${d.n})
              ON CONFLICT (project, unit) DO UPDATE SET status = ${status}, nama = ${d.n}, updated_at = now()`;
    if (d.s === 'T') terjual++; else reserved++;
  }
  return Response.json({
    ok: true, terjual, reserved, takDikenal,
    totalUnit: MASTER63.length,
    unitBaru: baru.length,
    unitDibuang: hilang.length,
    tandaMenggantung: sisaTanda.map(x => x.unit + ' (' + x.status + ')'),
  });
}
