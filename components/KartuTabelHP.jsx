'use client';
// HP: setiap baris tabel tampil sebagai kartu ringkas. Komponen ini melengkapi keterangan kolom (data-label)
// yang belum ada dari judul kolom tabel, memilih judul kartu (kolom Nama bila ada), menandai sel panjang & sel tombol aksi.
import { useEffect } from 'react';

function olah(root) {
  root.querySelectorAll('table').forEach(t => {
    if (t.closest('.rl-kartu, .pz-panggung, .pz-cetak, .no-kartu')) return;
    t.classList.add('mb-kartu');
    // Judul kolom: gabungan semua baris judul (mis. "Harga Jual · 15 th") — menghitung rowspan & colspan
    const th = [];
    const isi = [];
    [...(t.tHead?.rows || [])].forEach((row, r) => {
      let c = 0;
      [...row.cells].forEach(cell => {
        while (isi[r]?.[c] !== undefined) c++;
        const teks = (cell.innerText || '').replace(/\s+/g, ' ').trim();
        for (let dr = 0; dr < (cell.rowSpan || 1); dr++) for (let dc = 0; dc < (cell.colSpan || 1); dc++) { (isi[r + dr] = isi[r + dr] || [])[c + dc] = teks; }
        c += cell.colSpan || 1;
      });
    });
    const nKol = Math.max(0, ...isi.map(x => x.length));
    for (let c = 0; c < nKol; c++) th.push([...new Set(isi.map(x => x[c]).filter(Boolean))].join(' · '));
    const iNama = th.findIndex((h, i) => i < 3 && /^(nama|konsumen|lead\b|sales \/|username)/i.test(h));
    [...(t.tBodies[0]?.rows || [])].forEach(tr => {
      if (tr.classList.contains('row-detail') || tr.cells.length < 2) return;
      let col = 0, adaJudul = !!tr.querySelector('td.mb-judul');
      [...tr.cells].forEach((td, idx) => {
        const label = th[col] || '';
        if (!td.hasAttribute('data-label') && label && label.length < 40) td.setAttribute('data-label', label);
        const teks = (td.innerText || '').trim();
        const tombol = td.querySelectorAll('button, a.sort-btn, a.btn, .aksi-ik');
        const sisa = tombol.length ? teks.replace([...tombol].map(b => b.innerText).join('|') ? new RegExp([...tombol].map(b => (b.innerText || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean).join('|'), 'g') : /$^/, '').replace(/\s+/g, '') : teks;
        if (tombol.length && sisa.length <= 2 && !td.classList.contains('mb-judul')) td.classList.add('mb-aksi');
        else if (teks.length > 42) td.classList.add('mb-penuh');
        if (!adaJudul && ((iNama >= 0 && col === iNama) || (iNama < 0 && idx === 0))) { td.classList.add('mb-judul'); adaJudul = true; }
        col += td.colSpan || 1;
      });
    });
  });
}

export default function KartuTabelHP() {
  useEffect(() => {
    const main = document.querySelector('.main') || document.body;
    let t = null;
    const jalan = () => { clearTimeout(t); t = setTimeout(() => { try { olah(main); } catch {} }, 120); };
    jalan();
    const mo = new MutationObserver(jalan);
    mo.observe(main, { childList: true, subtree: true });
    return () => { mo.disconnect(); clearTimeout(t); };
  }, []);
  return null;
}
