'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// ===== Tombol + Aksi cepat (HP): pekerjaan yang paling sering, sekali ketuk =====
const AKSI = {
  sales: [
    ['/form?tab=fu', 'Catat follow up', 'Isi hasil FU wajib hari ini'],
    ['/janjian', 'Buat janjian visit', 'Jadwalkan kunjungan konsumen'],
    ['/form?tab=trx', 'Reserved / Booking', 'Input transaksi + berkas'],
    ['/form?tab=lead', 'Tambah lead', 'Walk in atau referensi'],
  ],
  markom: [
    ['/form?tab=lead', 'Tambah lead', 'Lead baru dari iklan / DM'],
    ['/wa-inbox', 'Balas chat', 'Inbox WhatsApp official'],
    ['/form?tab=l2s', 'Oper ke sales', 'Leads to Sales'],
    ['/kegiatan', 'Catat kegiatan', 'Pameran, kanvasing, event'],
  ],
};
export default function AksiCepat({ peran }) {
  const [buka, setBuka] = useState(false);
  const daftar = AKSI[peran];
  useEffect(() => {
    if (!buka) return;
    const esc = e => { if (e.key === 'Escape') setBuka(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [buka]);
  if (!daftar) return null;
  return (
    <>
      <button type="button" className="fab-aksi" aria-label="Aksi cepat" aria-expanded={buka} onClick={() => setBuka(true)}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {buka && (
        <div className="aksi-latar" onClick={e => { if (e.target === e.currentTarget) setBuka(false); }}>
          <div className="aksi-lembar" role="dialog" aria-modal="true" aria-label="Aksi cepat">
            <div className="aksi-pegangan" aria-hidden="true" />
            <div className="aksi-judul">Aksi cepat</div>
            {daftar.map(([href, judul, ket]) => (
              <Link key={href} href={href} className="aksi-item" onClick={() => setBuka(false)}>
                <b>{judul}</b><span>{ket}</span>
              </Link>
            ))}
            <button type="button" className="sort-btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setBuka(false)}>Tutup</button>
          </div>
        </div>
      )}
    </>
  );
}
