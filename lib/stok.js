import { DEFAULT_UNITS } from '@/lib/db';
import { gabungHold, kunciUnit } from '@/lib/jenis-unit';

// ===== Status unit — SATU sumber kebenaran untuk Master Stock & Beranda =====
// Transaksi terakhir per unit menentukan warna; penandaan manual menimpa (kecuali Reserved manual atas unit yang sudah Booking)
export async function statusUnit(sql, manual) {
  if (!manual) manual = await sql`SELECT project, unit, status, nama, sales, nilai FROM unit_manual`;
  const trx = await sql`
    SELECT t.id, t.jenis, t.unit, t.lead_code, t.nilai, t.nilai_jual, l.nama, l.sales,
           COALESCE(NULLIF(t.project, ''), l.project, '') AS project
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.unit IS NOT NULL AND t.unit <> ''
    ORDER BY COALESCE(t.tgl, t.created_at::date), CASE WHEN t.jenis = 'Batal' THEN 0 ELSE 1 END, t.id`; // urut tanggal kejadian; di hari yang sama Batal dulu, lalu kontrak baru (ganti kontrak / pembeli baru tidak tertimpa)

  // Transaksi terakhir per unit menentukan warna; manual menimpa
  const m = {};
  trx.forEach(t => {
    if (!t.project) return;
    const key = t.project + '|' + t.unit;
    if (t.jenis === 'Batal') m[key] = null;
    else if (t.jenis === 'Reserved') m[key] = { warna: 'kuning', info: 'Reserved' + (t.nama ? ' — ' + t.nama : ''), manual: false, lead_code: t.lead_code, nama: t.nama || '', sales: t.sales || '', nilai: Number(t.nilai_jual) || Number(t.nilai) || 0 };
    else m[key] = { warna: 'merah', info: t.jenis + (t.nama ? ' — ' + t.nama : ''), manual: false, lead_code: t.lead_code, nama: t.nama || '', sales: t.sales || '', nilai: Number(t.nilai_jual) || Number(t.nilai) || 0 };
  });
  manual.forEach(x => {
    const key = x.project + '|' + x.unit;
    const pemilik = (m[key] && m[key].lead_code) || null; // unit ber-transaksi tetap ingat lead pemiliknya
    const namaM = (x.nama || '').trim();
    const salesM = (x.sales || '').trim();
    const adaBooking = m[key] && m[key].warna === 'merah' && !m[key].manual; // sudah ada transaksi Booking/Closing
    if (x.status === 'Reserved' && adaBooking) {
      // Unit sudah Booking lewat transaksi -> transaksi menang, tanda Reserved manual diabaikan
      m[key] = { ...m[key], nama: m[key].nama || namaM, sales: m[key].sales || salesM };
      return;
    }
    if (x.status === 'Terjual') m[key] = { warna: 'merah', info: 'Terjual' + (namaM ? ' — ' + namaM : ' (manual)'), manual: true, lead_code: pemilik, nama: namaM, sales: salesM, nilai: Number(x.nilai) || 0 };
    else if (x.status === 'Reserved') m[key] = { warna: 'kuning', info: 'Reserved' + (namaM ? ' — ' + namaM : ' (manual)'), manual: true, lead_code: pemilik, nama: namaM, sales: salesM, nilai: Number(x.nilai) || 0 };
    else m[key] = null;
  });
  // Hold oleh manajemen: unit ditahan (belum dilepas untuk dijual) — hanya berlaku selama unit tidak Terjual / Reserved.
  // Dihitung sebagai stok TIDAK tersedia dan tidak bisa dipilih di transaksi sampai hold-nya dibuka.
  try {
    const rs = await sql`SELECT key, items FROM settings WHERE key IN ('units', 'unit_hold')`;
    const units = rs.find(r => r.key === 'units')?.items || DEFAULT_UNITS;
    const hold = gabungHold(rs.find(r => r.key === 'unit_hold')?.items);
    for (const [p, peta] of Object.entries(hold)) {
      for (const u of (units[p] || [])) {
        if (peta[kunciUnit(u)] && !m[p + '|' + u]) m[p + '|' + u] = { warna: 'biru', info: 'Hold manajemen', manual: false, hold: true, lead_code: null, nama: '', sales: '', nilai: 0 };
      }
    }
  } catch (e) { console.error('hold unit', e); }
  const status = Object.entries(m)
    .filter(([, v]) => v)
    .map(([k, v]) => ({ project: k.split('|')[0], unit: k.split('|')[1], ...v }));

  return status;
}

// Ringkasan per project, dihitung persis seperti Master Stock: total = daftar master unit project (Settings),
// hanya unit yang ada di daftar master yang dihitung (tanda dari penamaan unit lama diabaikan)
export async function ringkasStok(sql) {
  let units = DEFAULT_UNITS;
  try { const r = await sql`SELECT items FROM settings WHERE key = 'units'`; if (r[0] && r[0].items) units = r[0].items; } catch {}
  const status = await statusUnit(sql);
  return Object.entries(units || {})
    .filter(([, daftar]) => Array.isArray(daftar) && daftar.length)
    .map(([project, daftar]) => {
      const ada = new Set(daftar);
      const st = status.filter(u => u.project === project && ada.has(u.unit));
      const terjual = st.filter(u => u.warna === 'merah').length, reserved = st.filter(u => u.warna === 'kuning').length, hold = st.filter(u => u.warna === 'biru').length;
      return { project, total: daftar.length, terjual, reserved, hold, tersedia: Math.max(0, daftar.length - terjual - reserved - hold) };
    });
}
