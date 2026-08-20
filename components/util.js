export const fmtDate = d => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
export const fmtRp = n => n ? 'Rp ' + Number(n).toLocaleString('id-ID') : '—';
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const BADGE = { New: 'b-new', Cold: 'b-cold', Warm: 'b-warm', Hot: 'b-hot', Appointment: 'b-appt', 'Site Visit': 'b-visit', Booking: 'b-book', Closing: 'b-close', Lost: 'b-lost' };
export function reminder(nextTgl) {
  if (!nextTgl) return null;
  const t = new Date(nextTgl); t.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (t < now) return ['OVERDUE', 'b-overdue'];
  if (t.getTime() === now.getTime()) return ['HARI INI', 'b-today'];
  return ['UPCOMING', 'b-upcoming'];
}
export async function api(url, opts) {
  const res = await fetch(url, opts ? { headers: { 'Content-Type': 'application/json' }, ...opts } : undefined);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Terjadi kesalahan');
  return d;
}
