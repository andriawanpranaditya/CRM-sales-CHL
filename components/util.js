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
// Normalisasi nomor WA ke format 62xxx
export function normWA(nomor) {
  let n = String(nomor || '').replace(/[^0-9]/g, '');
  if (!n) return null;
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  return n;
}

// Link web (desktop / WhatsApp Web)
export function waLink(nomor, teks) {
  const n = normWA(nomor);
  if (!n) return null;
  return 'https://wa.me/' + n + (teks ? '?text=' + encodeURIComponent(teks) : '');
}

// Pembuka WA universal: mendukung WhatsApp BIASA maupun WA BUSINESS.
// Di HP: pakai skema whatsapp:// (dikenali kedua aplikasi; Android memunculkan pilihan aplikasi).
// Bila 1,5 detik tidak berpindah aplikasi (WA tidak terpasang), otomatis fallback ke wa.me.
// Di desktop: buka wa.me (WhatsApp Web) di tab baru / tab yang sudah disiapkan.
export function bukaWA(nomor, teks, winSiap) {
  const n = normWA(nomor);
  if (!n) return false;
  const q = 'phone=' + n + (teks ? '&text=' + encodeURIComponent(teks) : '');
  const web = 'https://wa.me/' + n + (teks ? '?text=' + encodeURIComponent(teks) : '');
  const diHP = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (diHP) {
    window.location.href = 'whatsapp://send?' + q;
    setTimeout(() => { if (!document.hidden) window.location.href = web; }, 1500);
  } else if (winSiap) {
    winSiap.location.href = web;
  } else {
    window.open(web, '_blank');
  }
  return true;
}

export async function api(url, opts) {
  let res;
  try {
    // cache: 'no-store' — data CRM selalu segar, browser/PWA dilarang menyajikan respons lama
    res = await fetch(url, { cache: 'no-store', ...(opts ? { headers: { 'Content-Type': 'application/json' }, ...opts } : {}) });
  } catch {
    throw new Error('Tidak bisa terhubung ke server — cek koneksi internet lalu coba lagi.');
  }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Sesi login berakhir — silakan login ulang.');
    const e = new Error(d.error || ('Terjadi kesalahan di server (kode ' + res.status + '). Bila baru ada update aplikasi, jalankan /api/setup lalu coba lagi.'));
    e.status = res.status; e.data = d;
    throw e;
  }
  return d;
}
