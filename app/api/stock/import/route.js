import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Data Weekly Report BIO DISTRICT s.d September 2026 (32 terjual + 1 reserved)
const DATA = [
  { u: "Bio Ave 1 no.02", s: "T", n: "Yuliono", a: "Andy Boy / Sunli Realty", v: 2717000000 },
  { u: "Bio Ave 1 no.03", s: "T", n: "Steven", a: "William Tan Jaya / Linktown", v: 3041000000 },
  { u: "Bio Ave 1 no.05", s: "T", n: "Elisusana", a: "Fahmi / Fam Estate", v: 3041000000 },
  { u: "Bio Ave 1 no.07", s: "T", n: "Badai Indragiri", a: "Kevin Sean Keefe Louhenapessy / Inhouse", v: 4227000000 },
  { u: "Bio Ave 2 no.05", s: "T", n: "Dewi Mirawati", a: "Sri Yamtini / Indopro", v: 4252000000 },
  { u: "Bio Ave 2 no.06", s: "T", n: "Johann Dandy Hartono", a: "Sri Yamtini / Sunli Realty", v: 2265000000 },
  { u: "Bio Ave 2 no.07", s: "T", n: "Shalita Selene Supian", a: "Sri Yamtini / Sunli Realty", v: 2275000000 },
  { u: "Bio Ave 2 no.08", s: "T", n: "Ivan Putra Wijaya", a: "Anggreani Anzany / Social Maison", v: 2300000000 },
  { u: "Bio Ave 2 no.09", s: "T", n: "David Chrisnanto Wijaya Kusuma", a: "Sri Yamtini / Indopro", v: 3591720000 },
  { u: "Bio Ave 3 no.03", s: "T", n: "D'Albertgati Ranapoja Soe", a: "Anggreani Anzany / Social Maison", v: 2294000000 },
  { u: "Bio Ave 3 no.05", s: "T", n: "Maryanti Hutabarat", a: "Sri Yamtini / Indopro", v: 3020886000 },
  { u: "Bio Ave 3 no.06", s: "T", n: "Muh. Yusril Nashrun Khairun Suweleh", a: "Risky Cardo / Carirumah88", v: 2703000000 },
  { u: "Bio Ave 3 no.07", s: "T", n: "Ayu Aditya", a: "Andy Boy / Sunli Realty", v: 2856000000 },
  { u: "Bio Ave 3 no.09", s: "T", n: "Sunu Arditya Sokya", a: "Chintya Amelia / Atlantis Realty", v: 3271000000 },
  { u: "Bio Ave 3 no.10", s: "T", n: "Naura Luthfia", a: "Sri Yamtini / Sunli Realty", v: 2310000000 },
  { u: "Bio Ave 3 no.11", s: "T", n: "Frangky Septian", a: "Sri Yamtini / Sunli Realty", v: 2939000000 },
  { u: "Bio Ave 3 no.12", s: "T", n: "Andy Wijaya", a: "Moh Thobie Prathama / Linktown", v: 2517832432 },
  { u: "Bio Ave 3 no.15", s: "T", n: "Yos Prabowo", a: "Ade Gunawan Lubis / Inhouse", v: 3422000000 },
  { u: "Bio Ave 5 no.03", s: "T", n: "Hikmah, S.Si,APT", a: "M. Rizky Maulana Nst / Linktown", v: 3422000000 },
  { u: "Bio Ave 5 no.08", s: "T", n: "Paulus Benny Siagian", a: "Hendri / Find Your Property", v: 2420000000 },
  { u: "Bio Ave 5 no.09", s: "T", n: "Akhmad Rianto Nugrohojati, SE", a: "Paulina / Fam Estate", v: 3097000000 },
  { u: "Bio Ave 5 no.10", s: "T", n: "Owen Orlando Sumakul", a: "Deanry Irsan / Linktown", v: 3041000000 },
  { u: "Bio Ave 5 no.11", s: "T", n: "Haryono", a: "Muhamad Subhi Djunari / Inhouse", v: 3277726589 },
  { u: "Bio Ave 5 no.15", s: "T", n: "Taufik Safroni", a: "Fahmi / Fam Estate", v: 2512265000 },
  { u: "Bio Ave 6 no.07", s: "T", n: "Muhammad Subhan", a: "Moh Thobie Prathama / Linktown", v: 1388889000 },
  { u: "Bio Blv no.03", s: "T", n: "Wartono", a: "Andy Boy / Sunli Realty", v: 2719000000 },
  { u: "Bio Blv no.05", s: "T", n: "Naomi Michelle", a: "Jourdeane Maximilllian Palekahelu / MS Property", v: 2769000000 },
  { u: "Bio Blv no.06", s: "T", n: "Andita Frida Aisha", a: "Sri Yamtini / Sunli Realty", v: 4972000000 },
  { u: "Bio Blv no.10", s: "T", n: "Pricillia Agyanatasya", a: "Sri Yamtini / Sunli Realty", v: 2269000000 },
  { u: "Bio Blv no.16", s: "T", n: "Ayu Wulan Sari", a: "Muhamad Subhi Djunari / Inhouse", v: 2439802703 },
  { u: "Bio Blv no.18", s: "T", n: "Siti Nurhaliza", a: "Kevin Sean Keefe Louhenapessy / Inhouse", v: 2355000000 },
  { u: "Bio Blv no.19", s: "T", n: "Dian Moris, S.Si.T", a: "Raeno Lingga Wisesa / Inhouse", v: 1670000000 },
  { u: "Bio Blv no.12", s: "R", n: "Mega Difary", a: "Putri Rejeki Triwijayanti / Inhouse", v: 2737634234 }
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
  const semuaTanda = await sql`SELECT unit, status, sumber FROM unit_manual WHERE project = ${PROJ}`;
  // Tanda yang dibuat/diubah manager TIDAK boleh ditimpa impor (termasuk unit yang sengaja dibuka)
  const keputusanManager = semuaTanda.filter(t => t.sumber === 'manual' || t.status === 'Kosong').map(t => t.unit);
  const sisaTanda = semuaTanda.filter(x => hilang.includes(x.unit));

  // 2) Tandai status unit + nama pembeli
  const takDikenal = DATA.filter(d => !MASTER63.includes(d.u)).map(d => d.u);
  // Unit yang sudah punya transaksi aktif (non-Batal) dibiarkan mengikuti transaksi, bukan tanda manual
  const trxAktif = await sql`
    SELECT DISTINCT ON (t.unit) t.unit, t.jenis FROM transactions t
    LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE COALESCE(NULLIF(t.project, ''), l.project, '') = ${PROJ} AND t.unit <> ''
    ORDER BY t.unit, t.id DESC`;
  const adaTrx = trxAktif.filter(t => t.jenis !== 'Batal').map(t => t.unit);
  const lewatTrx = [];

  let terjual = 0, reserved = 0;
  const dihormati = [];
  for (const d of DATA) {
    if (keputusanManager.includes(d.u)) { dihormati.push(d.u); continue; }
    if (adaTrx.includes(d.u)) {
      await sql`DELETE FROM unit_manual WHERE project = ${PROJ} AND unit = ${d.u}`;
      lewatTrx.push(d.u);
      continue;
    }
    const status = d.s === 'T' ? 'Terjual' : 'Reserved';
    await sql`INSERT INTO unit_manual (project, unit, status, nama, sales, sumber, nilai)
              VALUES (${PROJ}, ${d.u}, ${status}, ${d.n}, ${d.a || ''}, 'import', ${d.v || null})
              ON CONFLICT (project, unit) DO UPDATE SET status = ${status}, nama = ${d.n}, sales = ${d.a || ''}, sumber = 'import', nilai = ${d.v || null}, updated_at = now()`;
    if (d.s === 'T') terjual++; else reserved++;
  }
  // 3) Bersihkan tanda manual lama di unit yang TIDAK ada dalam report (mis. bekas batal)
  const pakai = DATA.map(d => d.u);
  const bersih = [];
  for (const t of semuaTanda) {
    if (!pakai.includes(t.unit) && t.sumber === 'import') {
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
    ikutTransaksi: lewatTrx,
    dihormati,
  });
}
