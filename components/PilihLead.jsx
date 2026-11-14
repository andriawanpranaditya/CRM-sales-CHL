'use client';
// Kotak ID Lead yang bisa diketik: cari berdasarkan nomor lead (mis. "0123" / "LEAD-0123") atau nama konsumen.
import { useEffect, useMemo, useRef, useState } from 'react';

export default function PilihLead({ leads = [], value = '', onPilih, placeholder = 'Ketik nomor lead atau nama…' }) {
  const [buka, setBuka] = useState(false);
  const [q, setQ] = useState('');
  const [aktif, setAktif] = useState(0);
  const boks = useRef(null), inp = useRef(null), daftar = useRef(null);
  const terpilih = leads.find(l => l.lead_code === value);
  const label = terpilih ? `${terpilih.lead_code} — ${terpilih.nama || ''}` : '';

  const hasil = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return leads.slice(0, 60);
    const angka = k.replace(/\D/g, '');
    const skor = l => {
      const kode = String(l.lead_code || '').toLowerCase(), nama = String(l.nama || '').toLowerCase();
      const kodeAngka = kode.replace(/\D/g, '');
      if (kode === k || (angka && kodeAngka === angka.padStart(kodeAngka.length, '0'))) return 0; // nomor persis
      if (nama.startsWith(k)) return 1;
      if (kode.includes(k) || (angka && angka.length >= 2 && kodeAngka.includes(angka))) return 2;
      if (nama.split(/\s+/).some(w => w.startsWith(k))) return 3;
      if (nama.includes(k)) return 4;
      const hp = String(l.wa || l.hp || l.telp || '').replace(/\D/g, '');
      if (angka.length >= 4 && hp.includes(angka)) return 5;
      const ks = Array.isArray(l.kontak) ? l.kontak : []; // kontak tambahan (pasangan / nomor kedua)
      if (ks.some(c => String(c.nama || '').toLowerCase().includes(k))) return 6;
      if (angka.length >= 4 && ks.some(c => String(c.wa || '').replace(/\D/g, '').includes(angka))) return 6;
      return 9;
    };
    return leads.map(l => [skor(l), l]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0]).slice(0, 60).map(([, l]) => l);
  }, [q, leads]);

  useEffect(() => { setAktif(0); }, [q]);
  useEffect(() => { // tutup bila klik di luar
    const f = e => { if (boks.current && !boks.current.contains(e.target)) setBuka(false); };
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
  }, []);
  useEffect(() => { const el = daftar.current?.children?.[aktif]; if (el) el.scrollIntoView({ block: 'nearest' }); }, [aktif]);

  const pilih = l => { onPilih?.(l ? l.lead_code : ''); setBuka(false); setQ(''); inp.current?.blur(); };
  const tombol = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setBuka(true); setAktif(a => Math.min(hasil.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAktif(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (buka && hasil[aktif]) pilih(hasil[aktif]); }
    else if (e.key === 'Escape') { setBuka(false); setQ(''); }
  };

  return (<div className="pilih-lead" ref={boks}>
    <input ref={inp} type="text" value={buka ? q : label} placeholder={buka ? (label || placeholder) : (placeholder.replace('Ketik', '— pilih / ketik'))}
      onFocus={() => { setBuka(true); setQ(''); }} onClick={() => setBuka(true)} onChange={e => { setQ(e.target.value); setBuka(true); }} onKeyDown={tombol}
      autoComplete="off" spellCheck={false} />
    {value && !buka && <button type="button" className="pl-hapus" title="Kosongkan" onMouseDown={e => { e.preventDefault(); pilih(null); }}>×</button>}
    {buka && <div className="pl-daftar" ref={daftar}>
      {hasil.length ? hasil.map((l, i) => <div key={l.lead_code} className={'pl-item' + (i === aktif ? ' on' : '') + (l.lead_code === value ? ' dipilih' : '')}
        onMouseDown={e => { e.preventDefault(); pilih(l); }} onMouseEnter={() => setAktif(i)}>
        <div className="pl-baris1"><b>{l.lead_code}</b><span>{l.nama}</span></div>
        <div className="pl-baris2">{[l.status, l.project, l.sales, ...(Array.isArray(l.kontak) ? l.kontak.map(c => '+ ' + (c.nama || c.wa)) : [])].filter(Boolean).join(' · ')}</div></div>)
        : <div className="pl-kosong">Tidak ada lead dengan nomor / nama "{q}"</div>}
      {!q && leads.length > 60 && <div className="pl-kosong">Ketik nomor atau nama untuk mencari di {leads.length} lead…</div>}
    </div>}
  </div>);
}
