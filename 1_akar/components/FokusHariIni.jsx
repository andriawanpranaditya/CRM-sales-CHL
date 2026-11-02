'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/util';

// ===== Fokus hari ini (Beranda sales): 4 ubin tugas utama, diurutkan dari yang paling mendesak =====
export default function FokusHariIni() {
  const [d, setD] = useState(null);
  useEffect(() => {
    let hidup = true;
    Promise.all([
      api('/api/reminders', { silent: true }).catch(() => null),
      api('/api/wa-inbox?ringkas=1', { silent: true }).catch(() => null),
    ]).then(([r, w]) => {
      if (!hidup || !r) return;
      const today = r.today;
      setD({
        chat: (w && w.belum) || 0,
        fu: (r.hariIni || []).length + (r.terlambat || []).length,
        terlambat: (r.terlambat || []).length,
        visit: (r.janjian || []).filter(j => j.tgl === today).length,
        baru: (r.belumDisentuh || []).length,
        leadBaru: (r.belumDisentuh || [])[0] || null,
      });
    });
    return () => { hidup = false; };
  }, []);
  if (!d) return null;
  return (
    <div className="fokus" aria-label="Fokus hari ini">
      <Link href="/wa-inbox" className="fokus-ubin utama">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z" /></svg>
        <span><b>{d.chat}</b>Chat belum dibalas</span>
      </Link>
      <Link href="/form?tab=fu" className="fokus-ubin">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></svg>
        <span><b>{d.fu}</b>FU wajib hari ini{d.terlambat ? ` · ${d.terlambat} terlambat` : ''}</span>
      </Link>
      <Link href="/janjian" className="fokus-ubin">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
        <span><b>{d.visit}</b>Visit hari ini</span>
      </Link>
      <Link href={d.leadBaru ? '/form?tab=fu&lead=' + encodeURIComponent(d.leadBaru.lead_code) : '/leads'} className={'fokus-ubin' + (d.baru ? ' mendesak' : '')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>
        <span><b>{d.baru}</b>Lead baru · sapa ≤1 jam</span>
      </Link>
    </div>
  );
}
