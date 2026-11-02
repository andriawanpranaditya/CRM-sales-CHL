'use client';
import { useEffect, useRef, useState } from 'react';
import { onSibuk } from '@/components/util';

// Lencana kecil di tengah atas: logo CHL beranimasi saat ada proses berjalan, lalu "✓ Selesai" sebentar
export default function BusyIndicator() {
  const [mode, setMode] = useState('idle'); // idle | memuat | selesai
  const timer = useRef(null), tundaTampil = useRef(null), pernahSibuk = useRef(false);
  useEffect(() => onSibuk(n => {
    if (n > 0) {
      pernahSibuk.current = true;
      clearTimeout(timer.current);
      if (!tundaTampil.current) tundaTampil.current = setTimeout(() => { setMode('memuat'); tundaTampil.current = null; }, 250); // hindari kedip utk proses sangat cepat
    } else {
      clearTimeout(tundaTampil.current); tundaTampil.current = null;
      setMode(m => (m === 'memuat' ? 'selesai' : 'idle'));
      timer.current = setTimeout(() => setMode('idle'), 1200);
    }
  }), []);
  if (mode === 'idle') return null;
  return (
    <div className={'busy-chip ' + mode} role="status" aria-live="polite">
      {mode === 'memuat' ? <><span className="busy-logo" /> Memuat…</> : <>✓ Selesai</>}
    </div>
  );
}
