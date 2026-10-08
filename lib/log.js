import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';

// ===== Log Aktivitas Pengguna =====
// Mencatat siapa login, siapa membuka halaman apa, dan siapa input / update / hapus data apa.
// Tabel dibuat otomatis (aman diulang) — tidak wajib menjalankan /api/setup.
let logSiap = false;
export async function siapkanLog(sql) {
  if (logSiap) return;
  try {
    await sql`CREATE TABLE IF NOT EXISTS activity_log (
      id bigserial PRIMARY KEY, waktu timestamptz NOT NULL DEFAULT now(),
      username text, nama text, role text,
      aksi text NOT NULL, modul text, detail text, halaman text,
      ip text, perangkat text)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_actlog_waktu ON activity_log (waktu DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_actlog_user ON activity_log (username, waktu DESC)`;
    logSiap = true;
  } catch (e) { console.error('siapkanLog', e); }
}

// Ringkas user-agent jadi "Android · Chrome" / "iPhone · Safari" / "Windows · Edge" (+ PWA bila dari aplikasi ter-install)
export function perangkatDari(ua = '', pwa = false) {
  const u = String(ua);
  const os = /iPhone|iPod/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android'
    : /Windows/.test(u) ? 'Windows' : /Mac OS X|Macintosh/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Lainnya';
  const br = /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet'
    : /CriOS|Chrome\//.test(u) ? 'Chrome' : /FxiOS|Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'Browser lain';
  return `${os} · ${br}${pwa ? ' · Aplikasi (PWA)' : ''}`;
}
export function ipDari(req) {
  if (!req) return '';
  const h = req.headers;
  return String(h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || '').trim().slice(0, 60);
}

export async function catat(sql, { user, aksi, modul = '', detail = '', halaman = '', req = null, pwa = false }) {
  try {
    await siapkanLog(sql);
    await sql`INSERT INTO activity_log (username, nama, role, aksi, modul, detail, halaman, ip, perangkat)
      VALUES (${user?.username || null}, ${user?.name || null}, ${user?.role || null}, ${aksi}, ${modul},
              ${String(detail || '').slice(0, 500)}, ${halaman || ''}, ${ipDari(req)},
              ${req ? perangkatDari(req.headers.get('user-agent') || '', pwa) : ''})`;
  } catch (e) { console.error('catat log', e); }
}

// Kunci yang boleh masuk ke keterangan log (whitelist) — password, PIN, token & data identitas (NIK dll) TIDAK pernah dicatat
const KUNCI_DETAIL = ['lead_code', 'nama', 'jenis', 'sumber', 'unit', 'project', 'status', 'next_action', 'sales', 'campaign', 'platform', 'format',
  'topik', 'lokasi', 'name', 'username', 'role', 'kreatif', 'tgl'];
const KUNCI_RAHASIA = /pass|pin|token|secret|identitas|nik|npwp|ktp|base64|data_url|file/i;
const AKSI_METODE = { POST: 'Input', PUT: 'Update', PATCH: 'Update', DELETE: 'Hapus' };

function detailUmum({ body, out, url, method }) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const bag = [];
  const kode = b.lead_code || out?.lead_code;
  if (kode) bag.push(kode);
  for (const k of KUNCI_DETAIL) {
    if (k === 'lead_code') continue;
    const v = b[k];
    if (v === undefined || v === null || v === '' || typeof v === 'object') continue;
    bag.push(`${k}: ${String(v).slice(0, 60)}`);
  }
  if (!kode && (b.id || url.searchParams.get('id'))) bag.unshift('id ' + (b.id || url.searchParams.get('id')));
  if (method === 'PATCH' || method === 'PUT') {
    const field = Object.keys(b).filter(k => k !== 'id' && !KUNCI_DETAIL.includes(k) && !KUNCI_RAHASIA.test(k));
    const rahasia = Object.keys(b).filter(k => /pass|pin/i.test(k));
    if (field.length) bag.push('ubah: ' + field.slice(0, 8).join(', '));
    if (rahasia.length) bag.push('ganti password');
  }
  const jenisQ = url.searchParams.get('jenis');
  if (jenisQ && !b.jenis) bag.unshift(jenisQ);
  return bag.join(' · ');
}

// Bungkus handler API: bila sukses (status < 400) catat siapa melakukan apa.
// ringkas(opsional) -> { aksi?, detail? } atau false untuk tidak mencatat.
export function denganLog(modul, handler, ringkas) {
  return async function (req, ctx) {
    // Peran CEO Project: boleh melihat, input & update — TIDAK boleh menghapus data apa pun (semua DELETE ditolak di sini)
    if (req.method === 'DELETE') {
      const u = await getUser();
      if (u?.role === 'ceo') return Response.json({ error: 'Peran CEO Project tidak bisa menghapus data' }, { status: 403 });
    }
    let body = null;
    try {
      if ((req.headers.get('content-type') || '').includes('application/json')) body = await req.clone().json();
    } catch {}
    const res = await handler(req, ctx);
    try {
      if (res && res.status < 400) {
        const user = await getUser();
        let out = null;
        try { if ((res.headers.get('content-type') || '').includes('json')) out = await res.clone().json(); } catch {}
        const url = new URL(req.url);
        const dasar = { aksi: AKSI_METODE[req.method] || req.method, detail: detailUmum({ body, out, url, method: req.method }) };
        const khusus = ringkas ? await ringkas({ body: body || {}, out: out || {}, url, method: req.method, user }) : null;
        if (khusus !== false) {
          const h = { ...dasar, ...(khusus || {}) };
          await catat(db(), { user, aksi: h.aksi, modul: h.modul || modul, detail: h.detail, req });
        }
      }
    } catch (e) { console.error('denganLog', e); }
    return res;
  };
}

// ===== Tim Marcom: semua akun berperan marcom berbagi data yang sama =====
// Data dianggap milik tim marcom bila pembuatnya akun berperan 'markom' (aktif maupun nonaktif),
// atau hasil tarikan otomatis (auto-instagram, auto-meta, dst).
export async function bolehUbah(sql, user, pembuat) {
  if (!user) return false;
  if (user.role === 'manager' || user.role === 'ceo' || pembuat === user.username) return true; // ceo: ubah saja, hapus diblok di denganLog
  if (user.role !== 'markom') return false;
  if (String(pembuat || '').startsWith('auto-')) return true;
  const r = await sql`SELECT 1 FROM users WHERE username = ${pembuat || ''} AND role = 'markom' LIMIT 1`;
  return r.length > 0;
}
