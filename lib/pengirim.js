// Daftar pengirim terverifikasi untuk link terbuka (Agent Visitor & Sales Channel).
// Setiap pengirim (nomor HP + perangkat) harus diverifikasi Manager sekali; sesudahnya bebas mengirim.
import crypto from 'crypto';

let siap = false;
export async function siapkanPengirim(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS pengirim (id serial PRIMARY KEY, tipe text NOT NULL, project text NOT NULL, nama text NOT NULL, hp text NOT NULL, hp_norm text NOT NULL,
    kantor text, divisi text, jenis text, ktp text, npwp text, perangkat text NOT NULL, status text NOT NULL DEFAULT 'Menunggu', other_id int, alasan text,
    created_at timestamptz NOT NULL DEFAULT now(), dicek_oleh text, dicek_at timestamptz, UNIQUE (tipe, project, hp_norm, perangkat))`;
  siap = true;
}
export const normHp = x => { let d = String(x || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '62' + d.slice(1); else if (d.startsWith('8')) d = '62' + d; return d; };
export const hashPerangkat = k => crypto.createHash('sha256').update('crm-chl:' + String(k || '')).digest('hex').slice(0, 40);
export const LABEL_TIPE = { agent: 'Agent Visitor', other: 'Sales Channel' };

// Link terbuka → project & tipe
export async function linkDariToken(sql, token) {
  const t = String(token || '');
  if (/^os-[a-z]{2}[A-Za-z0-9]{4,10}$/.test(t)) { const r = (await sql`SELECT project FROM other_link WHERE token = ${t} AND aktif = true LIMIT 1`.catch(() => []))[0]; return r ? { tipe: 'other', project: r.project } : null; }
  if (/^[a-z]{1,4}-[A-Za-z0-9]{5,12}$/.test(t)) { const r = (await sql`SELECT project, nama FROM agent_link WHERE token = ${t} AND aktif = true LIMIT 1`.catch(() => []))[0]; return r ? { tipe: 'agent', project: r.project, leadAgent: r.nama } : null; }
  return null;
}
// Pengirim terverifikasi untuk kiriman (dipakai /api/lapor-agent & /api/lapor-other)
export async function pengirimSah(sql, { tipe, project, hp, perangkat }) {
  await siapkanPengirim(sql);
  if (!perangkat || !hp) return null;
  return (await sql`SELECT * FROM pengirim WHERE tipe = ${tipe} AND project = ${project} AND hp_norm = ${normHp(hp)} AND perangkat = ${hashPerangkat(perangkat)} AND status = 'Terverifikasi' LIMIT 1`)[0] || null;
}
