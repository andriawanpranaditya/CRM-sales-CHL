'use client';
import { useLayoutEffect, useRef } from 'react';

// Input angka rupiah dengan titik pemisah ribuan saat mengetik (1.500.000.000) supaya jumlah nol tidak salah.
// Pengganti langsung <input type="number">: onChange tetap menerima event dengan e.target.value = angka MURNI ("1500000000"),
// jadi handler & state yang sudah ada tidak perlu diubah.
const titik = v => {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
};

export default function InputRupiah({ value, onChange, prefix = true, style, className, ...rest }) {
  const ref = useRef(null);
  const posRef = useRef(null); // jumlah digit di kiri kursor, untuk menjaga posisi kursor setelah titik disisipkan
  const tampil = titik(value === null || value === undefined ? '' : String(value).split('.')[0].split(',')[0]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || posRef.current == null || document.activeElement !== el) return;
    let digit = 0, i = 0;
    while (i < el.value.length && digit < posRef.current) { if (/\d/.test(el.value[i])) digit++; i++; }
    el.setSelectionRange(i, i);
    posRef.current = null;
  });

  function ubah(e) {
    const mentah = e.target.value;
    const kiri = mentah.slice(0, e.target.selectionStart || 0).replace(/\D/g, '').length;
    posRef.current = kiri;
    const angka = mentah.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    onChange && onChange({ target: { value: angka, name: rest.name } });
  }

  const input = (
    <input {...rest} ref={ref} type="text" inputMode="numeric" autoComplete="off" value={tampil} onChange={ubah}
      className={className} style={prefix ? { ...style, paddingLeft: 34 } : style} />
  );
  if (!prefix) return input;
  return (
    <span className="inp-rp" style={{ display: style && style.maxWidth ? 'inline-block' : 'block', position: 'relative', maxWidth: style?.maxWidth }}>
      <span className="inp-rp-pre" aria-hidden="true">Rp</span>
      {input}
    </span>
  );
}
