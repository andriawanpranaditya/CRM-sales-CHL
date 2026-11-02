// ===== Akses per project (CEO Project, Sales Manager, sales, staf divisi) =====
// Setiap akun bisa dipilihkan project-nya di menu Pengguna (kolom users.projects).
// Kosong = semua project. Administrator selalu semua project.
// Modul ini dipakai API yang sebelumnya belum menyaring data per project:
//   - jsonProyek(user, data): buang baris milik project lain dari data yang dikirim ke layar
//   - jagaProyek(handler, opsi): tolak aksi (simpan/ubah/hapus/cetak) atas data project lain
import { db } from '@/lib/db';
import { requireUser, bolehProyek, pesanProyek } from '@/lib/auth';

const KUNCI = ['project', 'proyek', 'lead_project', 'trx_project', 'unit_project'];

// Saring data secara mendalam: setiap array berisi baris yang punya kolom project disaring
export function saring(user, data) {
  if (!user || !user.projects) return data;
  const jalan = x => {
    if (Array.isArray(x)) {
      const punyaProyek = x.some(r => r && typeof r === 'object' && !Array.isArray(r) && KUNCI.some(k => k in r));
      const arr = punyaProyek ? x.filter(r => {
        if (!r || typeof r !== 'object') return true;
        const k = KUNCI.find(kk => r[kk]);
        return !k || bolehProyek(user, r[k]);
      }) : x;
      return arr.map(jalan);
    }
    if (x && typeof x === 'object' && !(x instanceof Date)) {
      const o = {};
      for (const [k, v] of Object.entries(x)) o[k] = jalan(v);
      return o;
    }
    return x;
  };
  return jalan(data);
}
export const jsonProyek = (user, data, init) => Response.json(saring(user, data), init);

// Cari project dari data yang disentuh sebuah permintaan
async function proyekDari(sql, sumber, opsi) {
  const v = sumber || {};
  if (v.project) return String(v.project);
  const trx = v.trx_id || v.trxId || (opsi.id === 'transactions' ? v.id : null);
  if (trx) {
    const r = await sql`SELECT project FROM transactions WHERE id = ${Number(trx) || 0}`;
    return r[0]?.project || null;
  }
  if (v.tagihan_id) {
    const r = await sql`SELECT t.project FROM tagihan g JOIN transactions t ON t.id = g.trx_id WHERE g.id = ${Number(v.tagihan_id) || 0}`;
    return r[0]?.project || null;
  }
  if (v.id && opsi.id) {
    // tabel turunan transaksi (punya kolom trx_id)
    const id = Number(v.id) || 0;
    let r = [];
    if (opsi.id === 'komisi') r = await sql`SELECT t.project FROM komisi k JOIN transactions t ON t.id = k.trx_id WHERE k.id = ${id}`;
    else if (opsi.id === 'proses') r = await sql`SELECT t.project FROM proses p JOIN transactions t ON t.id = p.trx_id WHERE p.id = ${id}`;
    return r[0]?.project || null;
  }
  if (v.lead_code) {
    const r = await sql`SELECT project FROM leads WHERE lead_code = ${String(v.lead_code)}`;
    return r[0]?.project || null;
  }
  return null;
}

// Bungkus handler: periksa project dari isi permintaan (body JSON atau parameter alamat) sebelum handler dijalankan.
// opsi.id: arti kolom "id" pada permintaan — 'transactions' | 'komisi' | 'proses' (selain itu "id" diabaikan)
export function jagaProyek(handler, opsi = {}) {
  return async function (req, ctx) {
    try {
      const { user } = await requireUser();
      if (user && user.projects) {
        const sql = db();
        let sumber = {};
        const q = new URL(req.url).searchParams;
        q.forEach((v, k) => { sumber[k] = v; });
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const ct = req.headers.get('content-type') || '';
          if (ct.includes('application/json')) { try { sumber = { ...sumber, ...(await req.clone().json()) }; } catch {} }
        }
        const p = await proyekDari(sql, sumber, opsi);
        if (p && !bolehProyek(user, p)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
      }
    } catch (e) { console.error('jagaProyek', e); }
    return handler(req, ctx);
  };
}
