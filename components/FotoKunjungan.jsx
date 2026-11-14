'use client';
// Ambil foto dari kamera / galeri, dikecilkan di HP (lebar maks 1280 px, JPEG ±70%) sebelum dikirim
import { useRef, useState } from 'react';

export async function kecilkanFoto(file, maks = 1280, mutu = 0.7) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = url; });
    const s = Math.min(1, maks / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', mutu);
    return { data: dataUrl.split(',')[1], pratinjau: dataUrl, kb: Math.round(dataUrl.length * 0.75 / 1024) };
  } finally { URL.revokeObjectURL(url); }
}

export default function FotoKunjungan({ nilai, onUbah, label = 'Foto kunjungan', wajib = false, ket }) {
  const ref = useRef(null), [proses, setProses] = useState(false);
  return (<div className="field full"><label>{label}{wajib ? <span className="req"> *</span> : null}</label>
    <div className="foto-kj">
      {nilai?.pratinjau ? <img src={nilai.pratinjau} alt="" /> : <div className="foto-kosong">📷</div>}
      <div><button type="button" className="sort-btn" disabled={proses} onClick={() => ref.current?.click()}>{proses ? 'Memproses…' : nilai ? 'Ganti foto' : 'Ambil / pilih foto'}</button>
        {nilai && <button type="button" className="sort-btn" onClick={() => onUbah(null)}>Hapus</button>}
        <div className="hint">{nilai ? `Siap dikirim · ±${nilai.kb} KB` : (ket || 'Foto konsumen di marketing gallery / di depan unit. Otomatis dikecilkan sebelum dikirim.')}</div></div>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={async e => {
        const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
        setProses(true); try { onUbah(await kecilkanFoto(f)); } catch { alert('Foto tidak bisa dibaca, coba foto lain'); } finally { setProses(false); } }} />
    </div></div>);
}
