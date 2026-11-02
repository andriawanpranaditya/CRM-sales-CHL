'use client';
import { useEffect, useState } from 'react';

// ===== Tombol ganti tema: Gelap (Hijau Emas) ⇄ Terang (krem) =====
// Pilihan disimpan per perangkat. Bila belum pernah memilih, mengikuti pengaturan gelap/terang HP.
export function terapkanTema(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('h1_tema', t); } catch {}
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', t === 'dark' ? '#154235' : '#F6F1E6'));
}
export default function TemaToggle({ className = 'theme-btn' }) {
  const [tema, setTema] = useState('light');
  useEffect(() => { setTema(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'); }, []);
  const ganti = () => { const t = tema === 'dark' ? 'light' : 'dark'; terapkanTema(t); setTema(t); };
  return (
    <button type="button" className={className} onClick={ganti} aria-label={tema === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'} title={tema === 'dark' ? 'Mode terang' : 'Mode gelap'}>
      {tema === 'dark'
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
    </button>
  );
}
