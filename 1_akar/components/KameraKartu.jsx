'use client';
import { useEffect, useRef, useState } from 'react';

// Kamera di dalam aplikasi dengan bingkai panduan. Hasil foto dipotong sebatas
// bingkai, sehingga kartu memenuhi gambar dan lurus — syarat utama agar
// NIK / NPWP terbaca otomatis. Bila kamera tidak tersedia (izin ditolak,
// browser lama), pemanggil jatuh ke pemilih berkas biasa.

// Perbandingan sisi bingkai: kartu KTP/NPWP 85,6 × 54 mm; dokumen lain lebih tegak
const RASIO = { ktp: 85.6 / 54, npwp: 85.6 / 54, transfer: 3 / 4, lainnya: 3 / 4 };
const JUDUL = { ktp: 'Foto KTP', npwp: 'Foto Kartu NPWP', transfer: 'Foto Bukti Transfer', lainnya: 'Foto Dokumen' };

export default function KameraKartu({ jenis = 'ktp', onHasil, onTutup }) {
  const videoRef = useRef(null), streamRef = useRef(null), kotakRef = useRef(null);
  const [siap, setSiap] = useState(false);
  const [galat, setGalat] = useState('');
  const [pratinjau, setPratinjau] = useState(null);   // { url, blob }
  const rasio = RASIO[jenis] || RASIO.ktp;

  useEffect(() => {
    let aktif = true;
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Kamera tidak didukung browser ini');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
        });
        if (!aktif) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current; v.srcObject = stream;
        await v.play(); setSiap(true);
      } catch (e) { setGalat(e && e.name === 'NotAllowedError' ? 'Izin kamera ditolak' : (e && e.message) || 'Kamera tidak dapat dibuka'); }
    })();
    return () => { aktif = false; if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  // Letak bingkai di layar -> koordinat piksel pada frame video (video tampil object-fit: cover)
  function ambil() {
    const v = videoRef.current, kotak = kotakRef.current;
    if (!v || !kotak || !v.videoWidth) return;
    const wadah = v.getBoundingClientRect(), bk = kotak.getBoundingClientRect();
    const skala = Math.max(wadah.width / v.videoWidth, wadah.height / v.videoHeight);
    const tampilW = v.videoWidth * skala, tampilH = v.videoHeight * skala;
    const ox = wadah.left + (wadah.width - tampilW) / 2, oy = wadah.top + (wadah.height - tampilH) / 2;
    const sx = (bk.left - ox) / skala, sy = (bk.top - oy) / skala, sw = bk.width / skala, sh = bk.height / skala;
    const cv = document.createElement('canvas');
    const lebar = Math.min(1800, Math.round(sw));
    cv.width = lebar; cv.height = Math.round(lebar * sh / sw);
    cv.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    cv.toBlob(blob => { if (blob) setPratinjau({ url: URL.createObjectURL(blob), blob }); }, 'image/jpeg', 0.92);
  }
  function pakai() {
    const f = new File([pratinjau.blob], jenis + '-' + Date.now() + '.jpg', { type: 'image/jpeg' });
    URL.revokeObjectURL(pratinjau.url);
    onHasil(f);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div style={{ color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>
        <span>{JUDUL[jenis] || 'Foto'}</span>
        <button onClick={onTutup} style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 999, width: 36, height: 36, fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {pratinjau ? (
          <img src={pratinjau.url} alt="pratinjau" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#111' }} />
        ) : (<>
          <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {/* Bingkai panduan: area di luar bingkai digelapkan */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div ref={kotakRef} style={{ width: 'min(92vw, calc((100vh - 220px) * ' + rasio + '))', aspectRatio: String(rasio),
              boxShadow: '0 0 0 100vmax rgba(0,0,0,.55)', border: '2px solid #E4C071', borderRadius: 12, position: 'relative' }}>
              {[['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']].map(([y, x]) => (
                <span key={y + x} style={{ position: 'absolute', [y]: -3, [x]: -3, width: 28, height: 28,
                  [`border${y[0].toUpperCase() + y.slice(1)}`]: '5px solid #E4C071', [`border${x[0].toUpperCase() + x.slice(1)}`]: '5px solid #E4C071',
                  borderRadius: 4 }} />))}
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 12, textAlign: 'center', color: '#fff', fontSize: 13, padding: '0 20px', textShadow: '0 1px 3px #000' }}>
            {jenis === 'ktp' || jenis === 'npwp'
              ? 'Tempatkan kartu tepat di dalam bingkai, lurus dan memenuhi bingkai. Hindari kilau lampu dan bayangan.'
              : 'Tempatkan dokumen di dalam bingkai hingga seluruh tulisannya terbaca.'}
          </div>
          {!siap && !galat && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff' }}>Membuka kamera…</div>}
          {galat && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', padding: 24, textAlign: 'center' }}>
            {galat}. Gunakan tombol "Pilih berkas" untuk mengunggah dari galeri.</div>}
        </>)}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '14px 16px 18px', background: '#000' }}>
        {pratinjau ? (<>
          <button onClick={() => { URL.revokeObjectURL(pratinjau.url); setPratinjau(null); }}
            style={{ flex: 1, maxWidth: 200, minHeight: 48, borderRadius: 10, border: '1px solid #666', background: '#222', color: '#fff', fontSize: 15, fontWeight: 700 }}>↺ Ulangi</button>
          <button onClick={pakai}
            style={{ flex: 1, maxWidth: 200, minHeight: 48, borderRadius: 10, border: 'none', background: '#C9A227', color: '#132019', fontSize: 15, fontWeight: 800 }}>✔ Gunakan foto</button>
        </>) : (
          <button onClick={ambil} disabled={!siap} aria-label="Ambil foto"
            style={{ width: 72, height: 72, borderRadius: '50%', border: '5px solid #fff', background: siap ? '#C9A227' : '#555', cursor: siap ? 'pointer' : 'default' }} />
        )}
      </div>
    </div>
  );
}
