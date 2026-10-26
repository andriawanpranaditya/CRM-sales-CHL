import ExcelJS from 'exceljs';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { catat } from '@/lib/log';
import { PL_BAWAAN } from '@/lib/pricelist';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ===== Price list yang bisa diperbarui dari CRM =====
// Manager & Admin: unduh template Excel (isi = price list berlaku) → ubah harga → upload → pratinjau perubahan → terapkan.
// Setiap versi tersimpan (riwayat) dan bisa dikembalikan. Semua pengguna memakai versi aktif terbaru.
const PENGELOLA = ['manager', 'admin'];
let siap = false;
async function siapkan(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS price_list_versi (id serial PRIMARY KEY, data jsonb NOT NULL, catatan text, oleh text,
    created_at timestamptz NOT NULL DEFAULT now())`;
  siap = true;
}
async function aktif(sql) {
  const r = await sql`SELECT id, data, catatan, oleh, created_at FROM price_list_versi ORDER BY id DESC LIMIT 1`;
  return r[0] || null;
}

// ---------- Template Excel ----------
const K_TIPE = [['tipe', 'Tipe'], ['ket', 'Keterangan PPN'], ['sub', 'Sub'], ['lb', 'LB (m²)'], ['lt', 'LT (m²)'], ['dim', 'Dimensi'], ['view', 'Hadap'],
  ['inclPpn', 'Harga All In Incl PPN (sebelum diskon)'], ['standar', 'Harga Jual (setelah diskon)'], ['allin', 'Harga All In (setelah diskon)'],
  ['cicil.0', 'Cicilan Harga Jual tenor 1'], ['cicil.1', 'Cicilan Harga Jual tenor 2'], ['cicil.2', 'Cicilan Harga Jual tenor 3'],
  ['cicilAllin.0', 'Cicilan All In tenor 1'], ['cicilAllin.1', 'Cicilan All In tenor 2'], ['cicilAllin.2', 'Cicilan All In tenor 3']];
const K_IRREG = [['unit', 'Unit (mis. Bio Ave 1 no.06)'], ['blok', 'Blok'], ['kav', 'Kavling'], ...K_TIPE.filter(([k]) => k !== 'ket')];
const ANGKA = new Set(['lb', 'lt', 'kav', 'inclPpn', 'standar', 'allin', 'cicil.0', 'cicil.1', 'cicil.2', 'cicilAllin.0', 'cicilAllin.1', 'cicilAllin.2']);
const BIO_UMUM = [['pl.tanggal', 'Tanggal price list'], ['pl.developer', 'Developer'], ['pl.bunga', 'Bunga KPR (mis. 2,75%)'], ['pl.tenor', 'Tenor tahun (mis. 25,20,15)'],
  ['promo.judul', 'Judul promo'], ['promo.periode', 'Periode & ketentuan promo'], ['promo.hadiah.A', 'Hadiah Tipe A'], ['promo.hadiah.B', 'Hadiah Tipe B'],
  ['promo.hadiah.C', 'Hadiah Tipe C'], ['promo.hadiah.corner', 'Hadiah unit corner'], ['pl.rekening.judul', 'Keterangan rekening'], ['pl.rekening.bank', 'Bank rekening'],
  ['pl.rekening.no', 'No. rekening'], ['pl.rekening.cabang', 'Cabang'], ['pl.bankRekanan', 'Bank rekanan KPR (pisahkan koma)']];
const PERMAI_UMUM = [['pl.tanggal', 'Tanggal price list'], ['pl.developer', 'Developer'], ['dasar.harga', 'Harga rumah'], ['dasar.bf', 'Booking fee'], ['dasar.um', 'Uang muka'],
  ['dasar.plafon', 'Plafon KPR'], ['dasar.bunga', 'Bunga KPR (%)'], ['dasar.lb', 'Luas bangunan'], ['dasar.lt', 'Luas tanah'], ['dasar.tenor', 'Tenor tahun (mis. 20,15,10)'],
  ['pl.cicil.10', 'Cicilan tenor 10 th'], ['pl.cicil.15', 'Cicilan tenor 15 th'], ['pl.cicil.20', 'Cicilan tenor 20 th'],
  ['pl.rekening.bank', 'Bank rekening'], ['pl.rekening.no', 'No. rekening'], ['pl.rekening.an', 'Atas nama']];
const ANGKA_UMUM = new Set(['dasar.harga', 'dasar.bf', 'dasar.um', 'dasar.plafon', 'dasar.bunga', 'pl.cicil.10', 'pl.cicil.15', 'pl.cicil.20']);
const LIST_UMUM = new Set(['pl.tenor', 'pl.bankRekanan', 'dasar.tenor']);

const ambil = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const taruh = (o, path, v) => { const ks = path.split('.'); let a = o; ks.slice(0, -1).forEach((k, i) => { if (a[k] == null || typeof a[k] !== 'object') a[k] = /^\d+$/.test(ks[i + 1]) && ks[0] !== 'pl' && ks[0] !== 'dasar' ? [] : {}; a = a[k]; }); a[ks[ks.length - 1]] = v; };
const tampil = (k, v) => LIST_UMUM.has(k) && Array.isArray(v) ? v.join(', ') : v;

function gayaHeader(ws) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3D2E' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}
async function buatTemplate(d) {
  const wb = new ExcelJS.Workbook();
  const pet = wb.addWorksheet('Petunjuk');
  pet.columns = [{ width: 110 }];
  ['TEMPLATE PRICE LIST CRM — isi = price list yang BERLAKU saat diunduh.',
    '1. Ubah angka/teks yang berubah saja. Jangan ganti nama sheet, judul kolom, atau baris kunci.',
    '2. Harga & cicilan diisi angka penuh tanpa titik/koma/Rp (mis. 1553778000).',
    '3. Unit irreguler: satu baris = satu unit. Hapus baris untuk menghapus unit, tambah baris untuk unit baru.',
    '4. Simpan sebagai .xlsx lalu upload di menu Price List → Update price list. Perubahan ditampilkan dulu sebelum diterapkan.',
    '5. Versi sebelumnya tetap tersimpan dan bisa dikembalikan.'].forEach(t => pet.addRow([t]));
  pet.getRow(1).font = { bold: true };

  const tabel = (nama, kolom, rows) => {
    const ws = wb.addWorksheet(nama);
    ws.columns = kolom.map(([k, h]) => ({ header: h, key: k, width: Math.max(12, Math.min(34, h.length + 4)) }));
    rows.forEach(r => ws.addRow(kolom.map(([k]) => ambil(r, k) ?? '')));
    kolom.forEach(([k], i) => { if (ANGKA.has(k)) ws.getColumn(i + 1).numFmt = '#,##0'; });
    gayaHeader(ws);
  };
  tabel('Bio - Tipe', K_TIPE, d.bio.standar);
  tabel('Bio - Irreguler', K_IRREG, Object.entries(d.bio.irreg).map(([unit, x]) => ({ unit, ...x })));

  const kv = (nama, kunci, sumber) => {
    const ws = wb.addWorksheet(nama);
    ws.columns = [{ header: 'Kunci (jangan diubah)', key: 'k', width: 26 }, { header: 'Keterangan', key: 'h', width: 34 }, { header: 'Nilai', key: 'v', width: 70 }];
    kunci.forEach(([k, h]) => ws.addRow([k, h, tampil(k, ambil(sumber, k)) ?? '']));
    gayaHeader(ws);
  };
  kv('Bio - Umum', BIO_UMUM, d.bio);
  {
    const ws = wb.addWorksheet('Bio - Cara Bayar');
    ws.columns = [{ header: 'Skema', width: 44 }, { header: 'Komponen', width: 24 }, { header: 'Nilai', width: 16 }, { header: 'Keterangan', width: 34 }];
    (d.bio.pl.terms || []).forEach(([j, r]) => r.forEach(([a, b, c]) => ws.addRow([j, a, b, c])));
    gayaHeader(ws);
  }
  {
    const ws = wb.addWorksheet('Bio - Catatan');
    ws.columns = [{ header: 'Judul (boleh kosong)', width: 34 }, { header: 'Isi catatan', width: 120 }];
    (d.bio.pl.catatan || []).forEach(([a, b]) => ws.addRow([a, b]));
    gayaHeader(ws);
  }
  kv('Permai', PERMAI_UMUM, d.permai);
  {
    const ws = wb.addWorksheet('Permai - Ketentuan');
    ws.columns = [{ header: 'Jenis (Belum termasuk / Syarat / Persyaratan KPR)', width: 46 }, { header: 'Isi', width: 120 }];
    (d.permai.pl.belumTermasuk || []).forEach(x => ws.addRow(['Belum termasuk', x]));
    (d.permai.pl.syarat || []).forEach(x => ws.addRow(['Syarat', x]));
    (d.permai.pl.persyaratan || []).forEach(x => ws.addRow(['Persyaratan KPR', x]));
    gayaHeader(ws);
  }
  return wb.xlsx.writeBuffer();
}

// ---------- Baca Excel upload ----------
const nilaiSel = c => { const v = c && c.value; if (v == null) return ''; if (v instanceof Date) return v.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }); if (typeof v === 'object') return v.result ?? v.text ?? (v.richText ? v.richText.map(x => x.text).join('') : ''); return v; };
const keAngka = v => { if (typeof v === 'number') return v; const s = String(v || '').replace(/rp/i, '').replace(/[.\s]/g, '').replace(',', '.'); const n = Number(s); return s === '' ? NaN : n; };
function barisTabel(ws) {
  const out = [];
  ws.eachRow((row, i) => { if (i === 1) return; const v = []; for (let c = 1; c <= ws.columnCount; c++) v.push(nilaiSel(row.getCell(c))); if (v.some(x => String(x).trim() !== '')) out.push(v); });
  return out;
}
async function bacaExcel(buf, dasar) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = n => wb.getWorksheet(n);
  const wajib = ['Bio - Tipe', 'Bio - Irreguler', 'Bio - Umum', 'Permai'];
  const hilang = wajib.filter(n => !sheet(n));
  if (hilang.length) throw new Error('Sheet tidak ditemukan: ' + hilang.join(', ') + ' — gunakan template dari tombol "Unduh template Excel".');
  const d = JSON.parse(JSON.stringify(dasar));
  const salah = [], peringatan = [];

  const bacaBaris = (nama, kolom) => barisTabel(sheet(nama)).map((v, i) => {
    const o = {};
    kolom.forEach(([k, h], c) => {
      let x = v[c];
      if (ANGKA.has(k)) { const n = keAngka(x); if (isNaN(n) || n < 0) { salah.push(`${nama} baris ${i + 2}: "${h}" harus angka`); x = 0; } else x = n; }
      else x = String(x ?? '').trim();
      taruh(o, k, x);
    });
    return o;
  });
  const tipe = bacaBaris('Bio - Tipe', K_TIPE).filter(x => x.tipe);
  if (!tipe.length) salah.push('Bio - Tipe: belum ada baris tipe');
  tipe.forEach(x => { x.tipe = String(x.tipe).toUpperCase(); if (!(x.standar > 0)) salah.push(`Bio - Tipe ${x.tipe}: Harga Jual wajib diisi`); });
  d.bio.standar = tipe;
  const irreg = {};
  bacaBaris('Bio - Irreguler', K_IRREG).filter(x => x.unit).forEach(x => {
    const unit = x.unit; delete x.unit;
    if (!/^Bio (Ave \d+|Blv) no\.\d+$/i.test(unit)) peringatan.push(`Unit "${unit}" tidak sesuai format "Bio Ave 1 no.06" / "Bio Blv no.07" — tidak akan cocok dengan Master Stock`);
    if (!(x.standar > 0)) salah.push(`Bio - Irreguler ${unit}: Harga Jual wajib diisi`);
    x.tipe = String(x.tipe || '').toUpperCase();
    irreg[unit] = x;
  });
  d.bio.irreg = irreg;

  const bacaKV = (nama, kunci, target) => {
    const ok = new Map(kunci.map(([k, h]) => [k, h]));
    barisTabel(sheet(nama)).forEach(([k, , v]) => {
      k = String(k || '').trim();
      if (!ok.has(k)) return;
      let x = v;
      if (ANGKA_UMUM.has(k)) { const n = keAngka(x); if (isNaN(n) || n < 0) { salah.push(`${nama}: "${ok.get(k)}" harus angka`); return; } x = n; }
      else if (LIST_UMUM.has(k)) x = String(x || '').split(/[,;]/).map(s => s.trim()).filter(Boolean).map(s => (/^\d+$/.test(s) ? Number(s) : s));
      else x = String(x ?? '').trim();
      taruh(target, k, x);
    });
  };
  bacaKV('Bio - Umum', BIO_UMUM, d.bio);
  bacaKV('Permai', PERMAI_UMUM, d.permai);
  if (!(d.permai.dasar.harga > 0)) salah.push('Permai: Harga rumah wajib diisi');

  if (sheet('Bio - Cara Bayar')) {
    const terms = [];
    barisTabel(sheet('Bio - Cara Bayar')).forEach(([j, a, b, c]) => {
      j = String(j || '').trim(); if (!j) return;
      let g = terms.find(t => t[0] === j); if (!g) { g = [j, []]; terms.push(g); }
      g[1].push([String(a || '').trim(), String(b ?? '').trim(), String(c || '').trim()]);
    });
    if (terms.length) d.bio.pl.terms = terms;
  }
  if (sheet('Bio - Catatan')) {
    const cat = barisTabel(sheet('Bio - Catatan')).map(([a, b]) => [String(a || '').trim(), String(b || '').trim()]).filter(x => x[1]);
    if (cat.length) d.bio.pl.catatan = cat;
  }
  if (sheet('Permai - Ketentuan')) {
    const r = barisTabel(sheet('Permai - Ketentuan')).map(([j, x]) => [String(j || '').toLowerCase(), String(x || '').trim()]).filter(x => x[1]);
    if (r.length) {
      d.permai.pl.belumTermasuk = r.filter(([j]) => j.startsWith('belum')).map(x => x[1]);
      d.permai.pl.syarat = r.filter(([j]) => j.startsWith('syarat')).map(x => x[1]);
      d.permai.pl.persyaratan = r.filter(([j]) => j.startsWith('persyaratan')).map(x => x[1]);
    }
  }
  return { data: d, salah, peringatan };
}

// Daftar perubahan harga (lama → baru) untuk pratinjau, dengan peringatan bila berubah > 30% (cegah salah ketik)
function bandingkan(lama, baru) {
  const out = [], warn = [];
  const cek = (label, a, b, angka) => {
    if (JSON.stringify(a ?? '') === JSON.stringify(b ?? '')) return;
    out.push({ label, lama: a ?? '', baru: b ?? '' });
    if (angka && a > 0 && b > 0 && Math.abs(b - a) / a > 0.3) warn.push(`${label} berubah ${Math.round((b - a) / a * 100)}% — pastikan bukan salah ketik`);
  };
  const tipeL = Object.fromEntries((lama.bio.standar || []).map(x => [x.tipe, x])), tipeB = Object.fromEntries((baru.bio.standar || []).map(x => [x.tipe, x]));
  [...new Set([...Object.keys(tipeL), ...Object.keys(tipeB)])].forEach(t => {
    if (!tipeL[t]) return out.push({ label: `Bio Tipe ${t}`, lama: '—', baru: 'tipe baru' });
    if (!tipeB[t]) return out.push({ label: `Bio Tipe ${t}`, lama: 'ada', baru: 'dihapus' });
    K_TIPE.slice(1).forEach(([k, h]) => cek(`Bio Tipe ${t} · ${h}`, ambil(tipeL[t], k), ambil(tipeB[t], k), ANGKA.has(k)));
  });
  [...new Set([...Object.keys(lama.bio.irreg || {}), ...Object.keys(baru.bio.irreg || {})])].forEach(u => {
    const a = lama.bio.irreg[u], b = baru.bio.irreg[u];
    if (!a) return out.push({ label: u, lama: '—', baru: 'unit baru' });
    if (!b) return out.push({ label: u, lama: 'ada', baru: 'dihapus' });
    K_IRREG.slice(1).forEach(([k, h]) => cek(`${u} · ${h}`, ambil(a, k), ambil(b, k), ANGKA.has(k)));
  });
  BIO_UMUM.forEach(([k, h]) => cek(`Bio · ${h}`, tampil(k, ambil(lama.bio, k)), tampil(k, ambil(baru.bio, k)), false));
  PERMAI_UMUM.forEach(([k, h]) => cek(`Permai · ${h}`, tampil(k, ambil(lama.permai, k)), tampil(k, ambil(baru.permai, k)), ANGKA_UMUM.has(k)));
  if (JSON.stringify(lama.bio.pl.terms) !== JSON.stringify(baru.bio.pl.terms)) out.push({ label: 'Bio · Cara bayar', lama: 'versi lama', baru: 'diperbarui' });
  if (JSON.stringify(lama.bio.pl.catatan) !== JSON.stringify(baru.bio.pl.catatan)) out.push({ label: 'Bio · Catatan', lama: 'versi lama', baru: 'diperbarui' });
  ['belumTermasuk', 'syarat', 'persyaratan'].forEach(k => { if (JSON.stringify(lama.permai.pl[k]) !== JSON.stringify(baru.permai.pl[k])) out.push({ label: 'Permai · ' + k, lama: 'versi lama', baru: 'diperbarui' }); });
  return { perubahan: out, peringatan: warn };
}

export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  await siapkan(sql);
  const q = new URL(req.url).searchParams;
  const a = await aktif(sql);
  const data = a ? a.data : PL_BAWAAN;
  if (q.get('template')) {
    if (!PENGELOLA.includes(user.role)) return Response.json({ error: 'Hanya manager / admin' }, { status: 403 });
    const buf = await buatTemplate(data);
    return new Response(buf, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="Template Price List CRM ${new Date().toISOString().slice(0, 10)}.xlsx"` } });
  }
  const versi = a ? { id: a.id, oleh: a.oleh, waktu: a.created_at, catatan: a.catatan } : { bawaan: true };
  let riwayat = [];
  if (PENGELOLA.includes(user.role) && q.get('riwayat')) riwayat = await sql`SELECT id, catatan, oleh, created_at, data->'bio'->'pl'->>'tanggal' AS tgl_bio, data->'permai'->'pl'->>'tanggal' AS tgl_permai FROM price_list_versi ORDER BY id DESC LIMIT 20`;
  // Data hanya dikirim bila sudah ada versi di database (versi bawaan sudah ada di aplikasi)
  return Response.json({ data: a ? a.data : null, versi, riwayat });
}

export async function POST(req) {
  const { user, err } = await requireUser(PENGELOLA); if (err) return err;
  const sql = db();
  await siapkan(sql);
  const b = await req.json().catch(() => ({}));
  const a = await aktif(sql);
  const sekarang = a ? a.data : PL_BAWAAN;

  if (b.aksi === 'pratinjau') {
    if (!b.file) return Response.json({ error: 'Pilih file Excel (.xlsx)' }, { status: 400 });
    let hasil;
    try { hasil = await bacaExcel(Buffer.from(String(b.file).split(',').pop(), 'base64'), sekarang); }
    catch (e) { return Response.json({ error: 'File tidak bisa dibaca: ' + (e.message || e) }, { status: 400 }); }
    const beda = bandingkan(sekarang, hasil.data);
    return Response.json({ data: hasil.data, salah: hasil.salah, peringatan: [...hasil.peringatan, ...beda.peringatan], perubahan: beda.perubahan });
  }
  if (b.aksi === 'simpan') {
    const d = b.data;
    if (!d || !d.bio || !d.permai || !Array.isArray(d.bio.standar) || !d.bio.standar.length) return Response.json({ error: 'Data price list tidak lengkap' }, { status: 400 });
    const catatan = String(b.catatan || '').trim().slice(0, 300) || `Price list Bio ${d.bio.pl.tanggal || ''} · Permai ${d.permai.pl.tanggal || ''}`;
    const r = await sql`INSERT INTO price_list_versi (data, catatan, oleh) VALUES (${JSON.stringify(d)}::jsonb, ${catatan}, ${user.name}) RETURNING id`;
    await catat(sql, { user, aksi: 'Ubah', modul: 'Price List', detail: 'price list baru diterapkan · ' + catatan, req });
    return Response.json({ ok: true, id: r[0].id });
  }
  if (b.aksi === 'kembalikan') {
    const v = (await sql`SELECT data, catatan FROM price_list_versi WHERE id = ${Number(b.id) || 0}`)[0];
    if (!v) return Response.json({ error: 'Versi tidak ditemukan' }, { status: 404 });
    const catatan = 'Dikembalikan ke versi #' + b.id + (v.catatan ? ' (' + v.catatan + ')' : '');
    await sql`INSERT INTO price_list_versi (data, catatan, oleh) VALUES (${JSON.stringify(v.data)}::jsonb, ${catatan}, ${user.name})`;
    await catat(sql, { user, aksi: 'Ubah', modul: 'Price List', detail: catatan, req });
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}
