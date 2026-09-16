import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Data Weekly Report BIO DISTRICT s.d September 2026 (32 terjual + 1 reserved)
const DATA = [
  { u: "Bio Ave 1 no.02", s: "T", n: "Yuliono", a: "Andy Boy / Sunli Realty" },
  { u: "Bio Ave 1 no.03", s: "T", n: "Steven", a: "William Tan Jaya / Linktown" },
  { u: "Bio Ave 1 no.05", s: "T", n: "Elisusana", a: "Fahmi / Fam Estate" },
  { u: "Bio Ave 1 no.07", s: "T", n: "Badai Indragiri", a: "Kevin Sean Keefe Louhenapessy / Inhouse" },
  { u: "Bio Ave 2 no.05", s: "T", n: "Dewi Mirawati", a: "Sri Yamtini / Indopro" },
  { u: "Bio Ave 2 no.06", s: "T", n: "Johann Dandy Hartono", a: "Sri Yamtini / Sunli Realty" },
  { u: "Bio Ave 2 no.07", s: "T", n: "Shalita Selene Supian", a: "Sri Yamtini / Sunli Realty" },
  { u: "Bio Ave 2 no.08", s: "T", n: "Ivan Putra Wijaya", a: "Anggreani Anzany / Social Maison" },
  { u: "Bio Ave 2 no.09", s: "T", n: "David Chrisnanto Wijaya Kusuma", a: "Sri Yamtini / Indopro" },
  { u: "Bio Ave 3 no.03", s: "T", n: "D'Albertgati Ranapoja Soe", a: "Anggreani Anzany / Social Maison" },
  { u: "Bio Ave 3 no.05", s: "T", n: "Maryanti Hutabarat", a: "Sri Yamtini / Indopro" },
  { u: "Bio Ave 3 no.06", s: "T", n: "Muh. Yusril Nashrun Khairun Suweleh", a: "Risky Cardo / Carirumah88" },
  { u: "Bio Ave 3 no.07", s: "T", n: "Ayu Aditya", a: "Andy Boy / Sunli Realty" },
  { u: "Bio Ave 3 no.09", s: "T", n: "Sunu Arditya Sokya", a: "Chintya Amelia / Atlantis Realty" },
  { u: "Bio Ave 3 no.10", s: "T", n: "Naura Luthfia", a: "Sri Yamtini / Sunli Realty" },
  { u: "Bio Ave 3 no.11", s: "T", n: "Frangky Septian", a: "Sri Yamtini / Sunli Realty" },
  { u: "Bio Ave 3 no.12", s: "T", n: "Andy Wijaya", a: "Moh Thobie Prathama / Linktown" },
  { u: "Bio Ave 3 no.15", s: "T", n: "Yos Prabowo", a: "Ade Gunawan Lubis / Inhouse" },
  { u: "Bio Ave 5 no.03", s: "T", n: "Hikmah, S.Si,APT", a: "M. Rizky Maulana Nst / Linktown" },
  { u: "Bio Ave 5 no.08", s: "T", n: "Paulus Benny Siagian", a: "Hendri / Find Your Property" },
  { u: "Bio Ave 5 no.09", s: "T", n: "Akhmad Rianto Nugrohojati, SE", a: "Paulina / Fam Estate" },
  { u: "Bio Ave 5 no.10", s: "T", n: "Owen Orlando Sumakul", a: "Deanry Irsan / Linktown" },
  { u: "Bio Ave 5 no.11", s: "T", n: "Haryono", a: "Muhamad Subhi Djunari / Inhouse" },
  { u: "Bio Ave 5 no.15", s: "T", n: "Taufik Safroni", a: "Fahmi / Fam Estate" },
  { u: "Bio Ave 6 no.07", s: "T", n: "Muhammad Subhan", a: "Moh Thobie Prathama / Linktown" },
  { u: "Bio Blv no.03", s: "T", n: "Wartono", a: "Andy Boy / Sunli Realty" },
  { u: "Bio Blv no.05", s: "T", n: "Naomi Michelle", a: "Jourdeane Maximilllian Palekahelu / MS Property" },
  { u: "Bio Blv no.06", s: "T", n: "Andita Frida Aisha", a: "Sri Yamtini / Sunli Realty" },
  { u: "Bio Blv no.10", s: "T", n: "Pricillia Agyanatasya", a: "Sri Yamtini / Sunli Realty" },
  { u: "Bio Blv no.16", s: "T", n: "Ayu Wulan Sari", a: "Muhamad Subhi Djunari / Inhouse" },
  { u: "Bio Blv no.18", s: "T", n: "Siti Nurhaliza", a: "Kevin Sean Keefe Louhenapessy / Inhouse" },
  { u: "Bio Blv no.19", s: "T", n: "Dian Moris, S.Si.T", a: "Raeno Lingga Wisesa / Inhouse" },
  { u: "Bio Blv no.12", s: "R", n: "Mega Difary", a: "Putri Rejeki Triwijayanti / Inhouse" }
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
  const semuaTanda = await sql`SELECT unit, status FROM unit_manual WHERE project = ${PROJ}`;
  const sisaTanda = semuaTanda.filter(x => hilang.includes(x.unit));

  // 2) Tandai status unit + nama pembeli
  const takDikenal = DATA.filter(d => !MASTER63.includes(d.u)).map(d => d.u);
  let terjual = 0, reserved = 0;
  for (const d of DATA) {
    const status = d.s === 'T' ? 'Terjual' : 'Reserved';
    await sql`INSERT INTO unit_manual (project, unit, status, nama, sales)
              VALUES (${PROJ}, ${d.u}, ${status}, ${d.n}, ${d.a || ''})
              ON CONFLICT (project, unit) DO UPDATE SET status = ${status}, nama = ${d.n}, sales = ${d.a || ''}, updated_at = now()`;
    if (d.s === 'T') terjual++; else reserved++;
  }
  // 3) Bersihkan tanda manual lama di unit yang TIDAK ada dalam report (mis. bekas batal)
  const pakai = DATA.map(d => d.u);
  const bersih = [];
  for (const t of semuaTanda) {
    if (!pakai.includes(t.unit)) {
      await sql`DELETE FROM unit_manual WHERE project = ${PROJ} AND unit = ${t.unit}`;
      bersih.push(t.unit);
    }
  }

  return Response.json({
    ok: true, terjual, reserved, takDikenal,
    totalUnit: MASTER63.length,
    unitBaru: baru.length,
    unitDibuang: hilang.length,
    tandaMenggantung: sisaTanda.map(x => x.unit + ' (' + x.status + ')'),
    tandaDibersihkan: bersih,
  });
}
