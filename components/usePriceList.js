'use client';
import { useEffect, useState } from 'react';
import { terapkanPriceList } from '@/lib/pricelist';

// ===== Muat price list versi terbaru dari database (sekali per sesi) =====
// Selama belum ada versi di database, price list bawaan aplikasi yang dipakai.
let janji = null, versiAktif = null;
export function muatPriceList(paksa = false) {
  if (!janji || paksa) {
    janji = fetch('/api/pricelist', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
      if (j && j.data) terapkanPriceList(j.data);
      versiAktif = (j && j.versi) || { bawaan: true };
      return versiAktif;
    }).catch(() => (versiAktif = { bawaan: true }));
  }
  return janji;
}
// Hook: mengembalikan info versi setelah price list terbaru diterapkan (null = masih memuat)
export function usePriceList() {
  const [v, setV] = useState(versiAktif);
  useEffect(() => { let hidup = true; muatPriceList().then(x => { if (hidup) setV(x); }); return () => { hidup = false; }; }, []);
  return v;
}
