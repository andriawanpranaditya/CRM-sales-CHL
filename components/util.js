export const fmtDate = d => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
export const fmtRp = n => n ? 'Rp ' + Number(n).toLocaleString('id-ID') : '—';
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const BADGE = { New: 'b-new', Cold: 'b-cold', Warm: 'b-warm', Hot: 'b-hot', Appointment: 'b-appt', 'Site Visit': 'b-visit', Booking: 'b-book', Closing: 'b-close', Lost: 'b-lost', Drop: 'b-lost', Reserved: 'b-warm' };
export function reminder(nextTgl) {
  if (!nextTgl) return null;
  const t = new Date(nextTgl); t.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (t < now) return ['OVERDUE', 'b-overdue'];
  if (t.getTime() === now.getTime()) return ['HARI INI', 'b-today'];
  return ['UPCOMING', 'b-upcoming'];
}
// Link WhatsApp click-to-chat: nomor dinormalkan ke format 62, teks opsional terisi otomatis
export function waLink(nomor, teks) {
  let n = String(nomor || '').replace(/[^0-9]/g, '');
  if (!n) return null;
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  return 'https://wa.me/' + n + (teks ? '?text=' + encodeURIComponent(teks) : '');
}

export async function api(url, opts) {
  let res;
  try {
    res = await fetch(url, opts ? { headers: { 'Content-Type': 'application/json' }, ...opts } : undefined);
  } catch {
    throw new Error('Tidak bisa terhubung ke server — cek koneksi internet lalu coba lagi.');
  }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Sesi login berakhir — silakan login ulang.');
    throw new Error(d.error || ('Terjadi kesalahan di server (kode ' + res.status + '). Bila baru ada update aplikasi, jalankan /api/setup lalu coba lagi.'));
  }
  return d;
}
