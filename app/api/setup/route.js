import { db, DEFAULT_SETTINGS } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (!process.env.SETUP_KEY || key !== process.env.SETUP_KEY) {
    return Response.json({ error: 'Kunci setup salah. Buka /api/setup?key=SETUP_KEY sesuai environment variable.' }, { status: 403 });
  }
  const sql = db();

  await sql`CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    username text UNIQUE NOT NULL,
    name text NOT NULL,
    role text NOT NULL CHECK (role IN ('manager','sales')),
    password_hash text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS settings (
    key text PRIMARY KEY,
    items jsonb NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS leads (
    id serial PRIMARY KEY,
    lead_code text UNIQUE,
    tgl date,
    nama text NOT NULL,
    wa text, email text, domisili text, kerja text,
    sumber text, project text, tipe text, tujuan text,
    budget bigint DEFAULT 0,
    bayar text, sales text,
    status text NOT NULL DEFAULT 'New',
    catatan text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS followups (
    id serial PRIMARY KEY,
    lead_code text NOT NULL,
    tgl date,
    detail text NOT NULL,
    objection text,
    next_action text,
    next_tgl date,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS transactions (
    id serial PRIMARY KEY,
    lead_code text NOT NULL,
    jenis text NOT NULL CHECK (jenis IN ('Reserved','Booking','Closing','Batal')),
    tgl date,
    nilai bigint DEFAULT 0,
    catatan text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  // Migrasi ringan (aman dijalankan berulang)
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_fu date`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email text`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_plain text`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS walkin_info text`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project text`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bayar text`;
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit text`;
  // Jenis transaksi baru: Reserved
  await sql`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_jenis_check`;
  await sql`ALTER TABLE transactions ADD CONSTRAINT transactions_jenis_check CHECK (jenis IN ('Reserved','Booking','Closing','Batal'))`;
  // Rename status pipeline: Lost -> Drop (data lama ikut dirapikan)
  await sql`UPDATE leads SET status = 'Drop' WHERE status = 'Lost'`;
  const stRow = await sql`SELECT items FROM settings WHERE key = 'status'`;
  if (stRow.length) {
    const items = stRow[0].items.map(x => x === 'Lost' ? 'Drop' : x);
    await sql`UPDATE settings SET items = ${JSON.stringify(items)} WHERE key = 'status'`;
  }

  await sql`CREATE TABLE IF NOT EXISTS trx_files (
    id serial PRIMARY KEY,
    project text NOT NULL,
    unit text NOT NULL,
    lead_code text NOT NULL,
    jenis text NOT NULL CHECK (jenis IN ('ktp','transfer')),
    filename text,
    mime text,
    data text NOT NULL,
    uploaded_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project, unit, lead_code, jenis)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS unit_manual (
    id serial PRIMARY KEY,
    project text NOT NULL,
    unit text NOT NULL,
    status text NOT NULL CHECK (status IN ('Terjual','Reserved','Kosong')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project, unit)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS unit_positions (
    id serial PRIMARY KEY,
    project text NOT NULL,
    unit text NOT NULL,
    x real NOT NULL,
    y real NOT NULL,
    UNIQUE (project, unit)
  )`;

  for (const [key2, items] of Object.entries(DEFAULT_SETTINGS)) {
    await sql`INSERT INTO settings (key, items) VALUES (${key2}, ${JSON.stringify(items)})
              ON CONFLICT (key) DO NOTHING`;
  }

  const existing = await sql`SELECT count(*)::int AS n FROM users`;
  let seeded = false;
  if (existing[0].n === 0) {
    const hash = await bcrypt.hash('manager123', 10);
    await sql`INSERT INTO users (username, name, role, password_hash)
              VALUES ('manager', 'Manager', 'manager', ${hash})`;
    seeded = true;
  }

  return Response.json({
    ok: true,
    message: 'Database siap.',
    akun_pertama: seeded
      ? 'Akun manager dibuat — username: manager, password: manager123 (SEGERA ganti setelah login).'
      : 'Akun sudah ada, tidak dibuat ulang.',
  });
}
