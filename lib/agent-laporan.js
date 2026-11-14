// Laporan kunjungan dari agent di bawah lead agent (link terbuka tanpa login) → dicek Manager → menjadi lead & visitor
import crypto from 'crypto';
let siap = false;
export async function siapkanAgent(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS agent_link (id serial PRIMARY KEY, username text NOT NULL, nama text, project text, token text UNIQUE NOT NULL,
    aktif boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS agent_laporan (id serial PRIMARY KEY, token text, lead_agent text, project text,
    agent_nama text, agent_kantor text, agent_hp text, konsumen text, tgl date, jam text, tipe text, bayar text, domisili text, budget text, catatan text,
    foto text, status text NOT NULL DEFAULT 'Menunggu', alasan text, lead_code text, dicek_oleh text, dicek_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`;
  try { await sql`ALTER TABLE janjian ADD COLUMN IF NOT EXISTS foto text`; } catch {}
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS foto text`; } catch {}
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_tipe text`; await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_kantor text`; } catch {}
  siap = true;
}
export const tokenBaru = (pref = 'ag') => `${String(pref).toLowerCase().replace(/[^a-z]/g, '').slice(0, 4) || 'ag'}-${crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').slice(0, 7)}`;

// Link aktif per lead agent (dibuat otomatis bila belum ada); project = project pertama akun lead agent
export async function linkLeadAgent(sql) {
  await siapkanAgent(sql);
  const akun = await sql`SELECT username, name, projects FROM users WHERE role = 'sales' AND active = true AND COALESCE(lead_agent, false) = true ORDER BY name`.catch(() => []);
  const out = [];
  for (const a of akun) {
    let l = (await sql`SELECT * FROM agent_link WHERE username = ${a.username} AND aktif = true ORDER BY id DESC LIMIT 1`)[0];
    const project = (Array.isArray(a.projects) && a.projects[0]) || l?.project || '';
    if (!l) l = (await sql`INSERT INTO agent_link (username, nama, project, token) VALUES (${a.username}, ${a.name}, ${project}, ${tokenBaru(a.name)}) RETURNING *`)[0];
    out.push({ ...l, nama: a.name, project: l.project || project });
  }
  return out;
}
const norm = s => String(s || '').toLowerCase().replace(/^(bapak|bpk|pak|ibu|bu|sdr|sdri)\.?\s+/, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
// Cek dobel lewat nama (tanpa nomor WA): kata pertama & kedua sama, project sama, 90 hari terakhir
export async function cekDobel(sql, lap) {
  const n = norm(lap.konsumen); if (!n) return [];
  const k = n.split(' ')[0]; if (k.length < 3) return [];
  const rows = await sql`SELECT lead_code, nama, sales, tgl::text AS tgl, status FROM leads WHERE project = ${lap.project} AND lower(nama) LIKE ${'%' + k + '%'}
    AND COALESCE(tgl, created_at::date) >= (now() - interval '90 days')::date ORDER BY id DESC LIMIT 20`.catch(() => []);
  const kata = n.split(' ');
  return rows.filter(r => { const rn = norm(r.nama).split(' '); return rn[0] === kata[0] && (kata.length < 2 || rn.length < 2 || rn[1].slice(0, 3) === kata[1].slice(0, 3)); }).slice(0, 3);
}
