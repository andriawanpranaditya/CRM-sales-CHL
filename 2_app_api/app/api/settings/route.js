import { db, DEFAULT_SETTINGS, DEFAULT_UNITS } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { denganLog } from '@/lib/log';

export const dynamic = 'force-dynamic';

// Project baru grup CHL (sekali jalan; bila kemudian dihapus Administrator dari Settings, tidak ditambahkan lagi)
const PROYEK_BARU = ['THE SANCTUARY COLLECTION', 'NARAYA', 'BANARA', 'MAZENTA'];
let proyekSiap = false;
async function tambahProyekBaru(sql) {
  if (proyekSiap) return;
  try {
    await sql`CREATE TABLE IF NOT EXISTS app_flags (key text PRIMARY KEY, nilai text, created_at timestamptz NOT NULL DEFAULT now())`;
    const f = await sql`INSERT INTO app_flags (key, nilai) VALUES ('proyek_sanctuary_v1', 'ok') ON CONFLICT (key) DO NOTHING RETURNING key`;
    if (f.length) {
      const r = await sql`SELECT items FROM settings WHERE key = 'project'`;
      const ada = (r.length && Array.isArray(r[0].items)) ? r[0].items : (DEFAULT_SETTINGS.project || []);
      const baru = [...ada, ...PROYEK_BARU.filter(p => !ada.includes(p))];
      await sql`INSERT INTO settings (key, items) VALUES ('project', ${JSON.stringify(baru)}::jsonb) ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
    }
    proyekSiap = true;
  } catch (e) { console.error('proyek baru', e); }
}

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  await tambahProyekBaru(sql);
  const rows = await sql`SELECT key, items FROM settings`;
  const out = { ...DEFAULT_SETTINGS };
  rows.forEach(r => { out[r.key] = r.items; });
  // Akun per project: pilihan project di semua form hanya project yang dipegang akun ini
  if (user.projects && Array.isArray(out.project)) out.project = out.project.filter(p => user.projects.includes(p));
  let sales;
  try { sales = await sql`SELECT name, projects FROM users WHERE role = 'sales' AND active = true ORDER BY name`; }
  catch { sales = await sql`SELECT name FROM users WHERE role = 'sales' AND active = true ORDER BY name`; }
  if (!out.units) out.units = DEFAULT_UNITS;
  // Akun per project: daftar project, unit & sales dibatasi — semua dropdown (form lead, FU, Reserved/Booking,
  // Master Stock, Simulasi) otomatis hanya menampilkan project yang diizinkan
  if (user.projects) {
    out.project = (out.project || []).filter(p => user.projects.includes(p));
    out.units = Object.fromEntries(Object.entries(out.units || {}).filter(([p]) => user.projects.includes(p)));
    sales = sales.filter(s => !Array.isArray(s.projects) || !s.projects.length || s.projects.some(p => user.projects.includes(p)));
  }
  out.sales = sales.map(s => s.name);
  out.sales_project = Object.fromEntries(sales.map(s => [s.name, Array.isArray(s.projects) && s.projects.length ? s.projects : null]));
  return Response.json(out);
}

async function _PUT(req) {
  const { err } = await requireUser('administrator'); if (err) return err;
  const b = await req.json();
  const sql = db();
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (Array.isArray(b[key])) {
      await sql`INSERT INTO settings (key, items) VALUES (${key}, ${JSON.stringify(b[key])})
                ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(b[key])}`;
    }
  }
  // Target booking per sales per bulan (sama untuk semua sales) — dipakai Rapor sales di beranda
  if (b.target_booking !== undefined) {
    const n = Math.max(0, Math.min(50, Math.round(Number(b.target_booking) || 0)));
    await sql`INSERT INTO settings (key, items) VALUES ('target_booking', ${JSON.stringify({ n })}) ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify({ n })}`;
  }
  if (b.units && typeof b.units === 'object' && !Array.isArray(b.units)) {
    await sql`INSERT INTO settings (key, items) VALUES ('units', ${JSON.stringify(b.units)})
              ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(b.units)}`;
  }
  return Response.json({ ok: true });
}

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const PUT = denganLog('Settings', _PUT, ({ body }) => ({ detail: 'daftar: ' + Object.keys(body).join(', ') }));
