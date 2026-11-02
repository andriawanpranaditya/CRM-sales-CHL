import { neon } from '@neondatabase/serverless';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Menarik Master Stock dari CRM asli (crm-sales-chl) ke Harmoni One:
//   1. daftar unit per project (settings.units)
//   2. posisi penanda di peta (unit_positions)
//   3. STATUS unit — bukan transaksinya. Unit yang terjual/reserved di CRM asli
//      (baik dari transaksi maupun penanda manual) dicatat sebagai penanda
//      manual di sini, sehingga peta langsung mencerminkan kondisi nyata.
//
//   /api/tarik-stok?key=SETUP_KEY            -> pratinjau (tidak menulis apa pun)
//   /api/tarik-stok?key=SETUP_KEY&jalan=1    -> jalankan penarikan
//
// Membutuhkan variabel lingkungan DATABASE_URL_LAMA = connection string Neon milik CRM asli.
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (!process.env.SETUP_KEY || q.get('key') !== process.env.SETUP_KEY) {
    return Response.json({ error: 'Kunci salah.' }, { status: 403 });
  }
  if (!process.env.DATABASE_URL_LAMA) {
    return Response.json({ error: 'DATABASE_URL_LAMA belum diatur di Vercel. Isi dengan connection string database CRM asli, lalu redeploy.' }, { status: 400 });
  }
  const jalan = q.get('jalan') === '1';
  const lama = neon(process.env.DATABASE_URL_LAMA);
  const sql = db();
  const jejak = [];

  try {
    // ---- 1. daftar unit ----
    const stLama = await lama`SELECT items FROM settings WHERE key = 'units'`;
    const unitsLama = (stLama.length && stLama[0].items) || {};
    const projects = Object.keys(unitsLama);
    const jumlahUnit = projects.reduce((a, p) => a + (unitsLama[p] || []).length, 0);
    jejak.push('daftar unit: ' + projects.length + ' project, ' + jumlahUnit + ' unit (' + projects.join(', ') + ')');

    // ---- 2. posisi penanda ----
    const posisi = await lama`SELECT project, unit, x, y FROM unit_positions`;
    jejak.push('posisi penanda: ' + posisi.length);

    // ---- 3. status unit dari transaksi + penanda manual CRM asli ----
    const trx = await lama`SELECT t.id, t.jenis, t.unit, t.lead_code, l.nama, l.sales,
        COALESCE(NULLIF(t.project, ''), l.project, '') AS project
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.unit IS NOT NULL AND t.unit <> '' ORDER BY t.id`;
    const manualLama = await lama`SELECT project, unit, status FROM unit_manual`;
    const m = {};
    trx.forEach(t => {
      if (!t.project) return;
      const k = t.project + '|' + t.unit;
      if (t.jenis === 'Batal') m[k] = null;
      else m[k] = { status: t.jenis === 'Reserved' ? 'Reserved' : 'Terjual', nama: t.nama || '', sales: t.sales || '' };
    });
    manualLama.forEach(x => {
      const k = x.project + '|' + x.unit;
      if (x.status === 'Kosong') m[k] = null;
      else m[k] = { status: x.status, nama: (m[k] && m[k].nama) || '', sales: (m[k] && m[k].sales) || '' };
    });
    const status = Object.entries(m).filter(([, v]) => v).map(([k, v]) => ({ project: k.split('|')[0], unit: k.split('|')[1], ...v }));
    const terjual = status.filter(s => s.status === 'Terjual').length, reserved = status.length - terjual;
    jejak.push('status unit: ' + terjual + ' terjual, ' + reserved + ' reserved');

    if (!jalan) {
      return Response.json({ ok: true, mode: 'pratinjau', jejak, contoh_status: status.slice(0, 8),
        petunjuk: 'Tambahkan &jalan=1 untuk menjalankan penarikan. Daftar unit & posisi akan menimpa yang ada; status ditulis sebagai penanda manual.' });
    }

    // ---- tulis ke Harmoni One ----
    const stSini = await sql`SELECT items FROM settings WHERE key = 'units'`;
    const unitsSini = (stSini.length && stSini[0].items) || {};
    const gabung = { ...unitsSini, ...unitsLama };   // project dari CRM asli menimpa; project lain tetap
    await sql`INSERT INTO settings (key, items) VALUES ('units', ${JSON.stringify(gabung)})
      ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
    jejak.push('OK · daftar unit ditulis');

    let nPos = 0;
    for (const p of posisi) {
      await sql`INSERT INTO unit_positions (project, unit, x, y) VALUES (${p.project}, ${p.unit}, ${p.x}, ${p.y})
        ON CONFLICT (project, unit) DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y`;
      nPos += 1;
    }
    jejak.push('OK · ' + nPos + ' posisi penanda ditulis');

    let nSt = 0;
    for (const s of status) {
      await sql`INSERT INTO unit_manual (project, unit, status, nama, sales, updated_at)
        VALUES (${s.project}, ${s.unit}, ${s.status}, ${s.nama}, ${s.sales}, now())
        ON CONFLICT (project, unit) DO UPDATE SET status = EXCLUDED.status, nama = EXCLUDED.nama, sales = EXCLUDED.sales, updated_at = now()`;
      nSt += 1;
    }
    jejak.push('OK · ' + nSt + ' status unit ditulis sebagai penanda manual');
    return Response.json({ ok: true, mode: 'jalan', jejak });
  } catch (e) {
    return Response.json({ ok: false, pesan: e && e.message ? e.message : String(e), jejak }, { status: 500 });
  }
}
