// ===== Flash Sale Bio District — halaman publik /flashsale =====
// Pendaftar menjadi lead CRM (pemilik = sales pemilik link; tanpa link = Head of Sales & Marketing),
// stok mengikuti Master Stock, pesanan mengunci unit 5 menit sampai booking fee dibayar.
import crypto from 'crypto';
import { DEFAULT_UNITS } from '@/lib/db';
import { BIO_TIPE, BIO_IRREG, tipeBio } from '@/lib/pricelist';
import { statusUnit } from '@/lib/stok';

export const PROJECT = 'BIO DISTRICT';
export const BOOKING_FEE = 5000000;
export const MENIT_BAYAR = 5;
// Bawaan; manager bisa mengubah jadwal, kuota, dan mode uji di menu Flash Sale (settings key 'flashsale')
export const BAWAAN = { mulai: '2026-12-11T00:00:00+07:00', selesai: '2026-12-13T23:59:59+07:00', uji: false,
  kuota: { 'tipe-a': 3, 'tipe-b': 3, 'tipe-c': 5, corner: 5 } };
export const NAMA_GRUP = { 'tipe-a': 'Tipe A', 'tipe-b': 'Tipe B', 'tipe-c': 'Tipe C', corner: 'Corner' };
// Paket hadiah per kelompok tipe: [id, isi, diskon harga]
export const PAKET = {
  'tipe-a': [['a1', 'Wuling Aira EV', 0], ['a2', 'Vespa Officina 8 + bebas biaya', 0], ['a3', '3 unit AC 1 PK + bebas biaya + asuransi jiwa', 0], ['a4', 'Diskon harga Rp150 juta', 150000000]],
  'tipe-b': [['b1', 'Jaecoo J5 EV Standard', 0], ['b2', 'Wuling Aira EV + bebas biaya', 0], ['b3', 'Vespa Officina 8 + bebas biaya + asuransi jiwa', 0], ['b4', 'Diskon harga Rp300 juta', 300000000]],
  'tipe-c': [['c1', 'Kia Carens EV Air 7-Seater', 0], ['c2', 'BYD Atto 1 Standard Range + bebas biaya', 0], ['c3', 'Wuling Aira EV + bebas biaya + asuransi jiwa', 0], ['c4', 'Diskon harga Rp400 juta', 400000000]],
  corner: [['k1', 'Chery J6', 0], ['k2', 'Geely EX2 Pro + bebas biaya', 0], ['k3', 'BYD Atto 1 Standard Range + bebas biaya + asuransi jiwa', 0], ['k4', 'Diskon harga Rp500 juta', 500000000]],
};
export const CARA_BAYAR = ['Cash keras', 'KPR', 'Cash bertahap'];

let siap = false;
export async function siapkanFlash(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS flash_daftar (id serial PRIMARY KEY, token text UNIQUE NOT NULL, nama text, wa text, wa_norm text, email text, domisili text,
    ref_username text, agent_nama text, agent_kantor text, lead_code text, pemilik text, lead_baru boolean DEFAULT false, uji boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS flash_pesan (id serial PRIMARY KEY, kode text UNIQUE NOT NULL, daftar_id int NOT NULL, lead_code text, unit text NOT NULL, grup text NOT NULL,
    tipe text, paket text, paket_isi text, cara_bayar text, simulasi text, harga bigint DEFAULT 0, status text NOT NULL DEFAULT 'menunggu', uji boolean DEFAULT false,
    expires_at timestamptz, alasan text, dicek_oleh text, dicek_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_flash_pesan_unit ON flash_pesan (unit, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_flash_daftar_wa ON flash_daftar (wa_norm)`;
  await sql`ALTER TABLE flash_daftar ADD COLUMN IF NOT EXISTS verif_kode text`;
  await sql`ALTER TABLE flash_daftar ADD COLUMN IF NOT EXISTS verified_at timestamptz`;
  await sql`ALTER TABLE flash_daftar ADD COLUMN IF NOT EXISTS verif_oleh text`;
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_tipe text`; await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_kantor text`; } catch {}
  siap = true;
}
export const tokenBaru = () => crypto.randomBytes(18).toString('base64url');
export const kodePesan = () => 'BIO-FS-' + crypto.randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
export const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // tanggal WIB

export async function bacaSetting(sql) {
  let s = {};
  try { const r = await sql`SELECT items FROM settings WHERE key = 'flashsale'`; if (r[0]?.items && typeof r[0].items === 'object') s = r[0].items; } catch {}
  const kuota = { ...BAWAAN.kuota }; for (const k of Object.keys(kuota)) { const v = Number(s.kuota?.[k]); if (Number.isFinite(v) && v >= 0) kuota[k] = Math.floor(v); }
  const tgl = (v, d) => (v && !isNaN(Date.parse(v))) ? v : d;
  // menu: false = menu Flash Sale di CRM hanya untuk Head of Sales & Marketing (program belum disetujui); true = tampil ke semua akun
  return { mulai: tgl(s.mulai, BAWAAN.mulai), selesai: tgl(s.selesai, BAWAAN.selesai), uji: !!s.uji, menu: !!s.menu, verifWA: !!s.verifWA, kuota };
}
// Jadwal efektif: mode uji = selalu "berlangsung" (untuk mencoba alur sebelum tanggal tayang)
export function jadwal(setting) {
  const kini = Date.now();
  if (setting.uji) return { mulai: kini - 3600e3, selesai: kini + 6 * 3600e3, fase: 'live' };
  const mulai = Date.parse(setting.mulai), selesai = Date.parse(setting.selesai);
  return { mulai, selesai, fase: kini < mulai ? 'before' : kini < selesai ? 'live' : 'ended' };
}

// Unit Bio District → kelompok kuota, id produk di halaman publik, harga jual price list
export function infoUnit(unit) {
  const ir = BIO_IRREG[unit];
  if (ir) return { grup: 'corner', tipe: 'corner-' + String(ir.tipe).toLowerCase(), harga: Number(ir.standar) || 0 };
  const t = tipeBio(unit); if (!t || !BIO_TIPE[t]) return null;
  return { grup: 'tipe-' + t.toLowerCase(), tipe: 'tipe-' + t.toLowerCase(), harga: Number(BIO_TIPE[t].standar) || 0 };
}
export async function daftarUnit(sql) {
  let units = DEFAULT_UNITS;
  try { const r = await sql`SELECT items FROM settings WHERE key = 'units'`; if (r[0]?.items) units = r[0].items; } catch {}
  return (units?.[PROJECT] || []).filter(u => infoUnit(u));
}
// Pesanan yang lewat batas waktu bayar dilepas
export async function sapuKedaluwarsa(sql) {
  await sql`UPDATE flash_pesan SET status = 'kedaluwarsa' WHERE status = 'menunggu' AND expires_at < now()`;
}
// Posisi stok untuk halaman publik: unit tidak tersedia (Master Stock + pesanan aktif) & kuota terpakai per kelompok
export async function posisi(sql, uji) {
  await sapuKedaluwarsa(sql);
  const st = await statusUnit(sql);
  const tutup = new Set(st.filter(x => x.project === PROJECT).map(x => x.unit));
  const aktif = await sql`SELECT unit, grup, status FROM flash_pesan WHERE status IN ('menunggu', 'dibayar', 'lunas') AND COALESCE(uji, false) = ${!!uji}`;
  const klaim = {};
  aktif.forEach(p => { tutup.add(p.unit); klaim[p.grup] = (klaim[p.grup] || 0) + 1; });
  return { tutup, klaim };
}
// Pemilik link: akun aktif (sales / manager). Lead agent (mis. Esteem) → agent mengisi nama & kantornya.
export async function pemilikLink(sql, ref) {
  const r = String(ref || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(r)) return null;
  let rows;
  try { rows = await sql`SELECT username, name, role, COALESCE(lead_agent, false) AS lead_agent FROM users WHERE lower(username) = ${r} AND active = true AND role IN ('sales', 'manager') LIMIT 1`; }
  catch { rows = await sql`SELECT username, name, role, false AS lead_agent FROM users WHERE lower(username) = ${r} AND active = true AND role IN ('sales', 'manager') LIMIT 1`; }
  return rows[0] ? { username: rows[0].username, nama: rows[0].name, leadAgent: !!rows[0].lead_agent } : null;
}
// Tanpa kode: lead tercatat atas nama Head of Sales & Marketing sampai diputuskan milik siapa
export async function pemilikBawaan(sql) {
  const r = await sql`SELECT username, name FROM users WHERE role = 'manager' AND active = true AND (name ILIKE '%andriawan%' OR username ILIKE '%andriawan%') ORDER BY id LIMIT 1`.catch(() => []);
  return r[0] ? { username: r[0].username, nama: r[0].name } : { username: '', nama: '' };
}
export const bersih = (x, n = 120) => String(x ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// ===== Verifikasi nomor WhatsApp (terbalik): pendaftar mengirim kode dari WA-nya ke nomor resmi =====
// Tidak ada pesan keluar dari kita, jadi tidak ada biaya pesan. Aktif bila setting.verifWA = true.
export const WA_RESMI = '6281385237865';
const ABJAD = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa huruf/angka yang mirip (O/0, I/1)
export const kodeVerif = () => 'FS' + Array.from(crypto.randomBytes(5), b => ABJAD[b % ABJAD.length]).join('');
export const teksVerif = kode => `Halo Bio District, saya verifikasi nomor untuk Flash Sale. Kode: ${kode}`;
// Pendaftar masih perlu verifikasi? (aturan menyala, punya kode, belum terverifikasi)
export const perluVerif = (setting, d) => !!(setting.verifWA && d && d.verif_kode && !d.verified_at);

// Pendaftar → lead CRM. Aturan pencatat pertama: nomor yang sudah ada di CRM tetap milik sales yang lebih dulu mencatatnya.
export async function buatLeadFlash(sql, d) {
  const waN = d.wa_norm, lewat = !!d.ref_username;
  let pemilik = d.pemilik || '', leadCode = null, leadBaru = false;
  const ada = await sql`SELECT l.lead_code, l.sales FROM leads l
    WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(l.wa,''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${waN}
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(l.kontak, '[]'::jsonb)) k
                  WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(k->>'wa',''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${waN})
    ORDER BY l.id LIMIT 1`.catch(() => sql`SELECT lead_code, sales FROM leads WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(wa,''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${waN} ORDER BY id LIMIT 1`);
  const jejak = 'Daftar Flash Sale ' + hariIni().split('-').reverse().join('/') + (lewat ? ' lewat link ' + pemilik : ' tanpa kode')
    + (d.agent_nama ? ` · Agent: ${d.agent_nama}${d.agent_kantor ? ' (' + d.agent_kantor + ')' : ''}` : '') + (d.verified_at || d.baruVerif ? ' · nomor WA terverifikasi' : '');
  if (ada.length) {
    leadCode = ada[0].lead_code; pemilik = ada[0].sales || pemilik;
    await sql`UPDATE leads SET catatan = TRIM(BOTH ' ·' FROM COALESCE(catatan, '') || ${' · ' + jejak}), updated_at = now() WHERE lead_code = ${leadCode}`.catch(() => {});
    if (!ada[0].sales && pemilik) await sql`UPDATE leads SET sales = ${pemilik} WHERE lead_code = ${leadCode}`.catch(() => {});
  } else {
    const { siapkanStatusLog } = await import('@/lib/db'); await siapkanStatusLog(sql);
    const ins = await sql`INSERT INTO leads (tgl, nama, wa, email, domisili, sumber, project, sales, status, catatan, created_by)
      VALUES (${hariIni()}, ${d.nama}, ${d.wa}, ${d.email}, ${d.domisili}, 'Flash Sale', ${PROJECT}, ${pemilik}, 'New', ${jejak}, 'flashsale') RETURNING id`;
    leadCode = 'LEAD-' + String(ins[0].id).padStart(4, '0'); leadBaru = true;
    await sql`UPDATE leads SET lead_code = ${leadCode} WHERE id = ${ins[0].id}`;
    if (d.agent_nama) await sql`UPDATE leads SET sales_tipe = 'agent', sales_kantor = ${d.agent_kantor || ''} WHERE id = ${ins[0].id}`.catch(() => {});
    if (pemilik) {
      try { await sql`INSERT INTO lead_assign (lead_code, dari, ke, oleh) VALUES (${leadCode}, ${''}, ${pemilik}, 'flashsale')`; } catch {}
      try { const { siapkanFuWajib, mulaiJadwalBaru } = await import('@/lib/fuwajib-db'); await siapkanFuWajib(sql); await mulaiJadwalBaru(sql, leadCode); } catch (e) { console.error('fu flashsale', e); }
      try { const { kirimPush } = await import('@/lib/push'); const u = await sql`SELECT username FROM users WHERE name = ${pemilik} AND active = true`;
        if (u.length) await kirimPush(sql, { usernames: u.map(x => x.username) }, { judul: '⚡ Lead Flash Sale baru', isi: `${d.nama} · ${d.wa}${d.agent_nama ? ' · agent ' + d.agent_nama : ''}`, url: '/leads?lead=' + encodeURIComponent(leadCode), tag: 'fs-' + leadCode }); } catch (e) { console.error('push flashsale', e); }
    }
  }
  return { leadCode, pemilik, leadBaru };
}
// Tandai terverifikasi + buat lead yang ditunda (dipakai webhook WA, tombol manager, dan saat aturan dimatikan)
export async function sahkanDaftar(sql, d, oleh) {
  const u = await sql`UPDATE flash_daftar SET verified_at = now(), verif_oleh = ${oleh} WHERE id = ${d.id} AND verified_at IS NULL RETURNING id`;
  if (!u.length && d.lead_code) return d;
  if (!d.lead_code && !d.uji) {
    const r = await buatLeadFlash(sql, { ...d, baruVerif: oleh !== 'aturan-mati' });
    await sql`UPDATE flash_daftar SET lead_code = ${r.leadCode}, pemilik = ${r.pemilik}, lead_baru = ${r.leadBaru} WHERE id = ${d.id}`;
    await sql`UPDATE flash_pesan SET lead_code = ${r.leadCode} WHERE daftar_id = ${d.id} AND lead_code IS NULL`.catch(() => {});
    return { ...d, lead_code: r.leadCode, pemilik: r.pemilik };
  }
  return d;
}
// Dipanggil webhook WA untuk setiap pesan masuk ke nomor Bio District.
// Kode cocok DAN pengirimnya nomor yang didaftarkan → terverifikasi (true = pesan sudah ditangani, jangan diproses sebagai chat biasa).
export async function verifikasiDariWA(sql, wa, isi) {
  const m = /\bFS[\s-]?([A-HJ-NP-Z2-9]{5})\b/i.exec(String(isi || ''));
  if (!m) return null;
  await siapkanFlash(sql);
  const kode = 'FS' + m[1].toUpperCase();
  const d = (await sql`SELECT * FROM flash_daftar WHERE verif_kode = ${kode} ORDER BY id DESC LIMIT 1`)[0];
  if (!d || d.wa_norm !== wa) return null;      // nomor pengirim berbeda dari yang didaftarkan → tidak sah, diperlakukan chat biasa
  const hasil = await sahkanDaftar(sql, d, 'wa');
  return { lead_code: hasil.lead_code || null, uji: !!d.uji };
}
