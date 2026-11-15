'use client';
// Kartu QR code untuk link terbuka (Agent Visitor / Sales Channel): judul + logo project + QR, siap diunduh / dibagikan ke WA
import { useEffect, useState } from 'react';

const LOGO = { 'BIO DISTRICT': '/logo-bio-hitam.png', 'PERMAI INDAH': '/logo-permai.png' };
const muatGambar = src => new Promise((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = gagal; i.src = src; });

async function buatKartu({ judul, url, project, ket }) {
  const QR = (await import('qrcode')).default;
  const qr = await muatGambar(await QR.toDataURL(url, { width: 760, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1E4D3C', light: '#FFFFFF' } }));
  const W = 1080, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#F5F0E6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1E4D3C'; g.fillRect(0, 0, W, 300);
  g.fillStyle = '#C99C4F'; g.fillRect(0, 300, W, 10); g.fillRect(0, H - 18, W, 18);
  g.textAlign = 'center'; g.fillStyle = '#E2BE7A'; g.font = '700 30px "Plus Jakarta Sans", Arial, sans-serif';
  g.fillText('PT CIPTA HARMONI LESTARI', W / 2, 95);
  g.fillStyle = '#F4EFE3'; g.font = '800 70px "Plus Jakarta Sans", Arial, sans-serif';
  g.fillText(judul, W / 2, 200, W - 80);
  try { const lg = await muatGambar(LOGO[project] || '/logo.png'); const s = Math.min(380 / lg.width, 190 / lg.height); g.drawImage(lg, (W - lg.width * s) / 2, 345, lg.width * s, lg.height * s); } catch {}
  // bingkai QR
  const q = 640, x = (W - q) / 2, y = 575;
  g.fillStyle = '#FFFFFF'; g.strokeStyle = '#E6DFD0'; g.lineWidth = 4;
  g.beginPath(); g.roundRect(x - 30, y - 30, q + 60, q + 60, 36); g.fill(); g.stroke();
  g.drawImage(qr, x, y, q, q);
  g.fillStyle = '#10251E'; g.font = '700 38px "Plus Jakarta Sans", Arial, sans-serif'; g.fillText(ket, W / 2, y + q + 95);
  g.fillStyle = '#5B6E66'; g.font = '400 24px Consolas, monospace'; g.fillText(url, W / 2, y + q + 145, W - 80);
  return c.toDataURL('image/png');
}

export default function KartuQR({ judul, url, project, ket = 'Scan untuk membuka form', onTutup }) {
  const [gbr, setGbr] = useState(null), [err, setErr] = useState('');
  useEffect(() => { buatKartu({ judul, url, project, ket }).then(setGbr).catch(e => setErr(e.message || String(e))); }, [judul, url, project, ket]);
  const nama = judul.replace(/[^a-z0-9]+/gi, '-') + '-QR.png';
  async function bagikan() {
    try {
      const blob = await (await fetch(gbr)).blob(); const file = new File([blob], nama, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: judul, text: `${judul}\n${url}` }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(`${judul}\n${url}`), '_blank');
  }
  return (<div className="tg-overlay" onClick={e => { if (e.target === e.currentTarget) onTutup(); }}>
    <div className="tg-pop" style={{ padding: 16, width: 'min(420px,100%)', textAlign: 'center' }}>
      <b style={{ fontSize: 16 }}>QR code · {judul}</b>
      <div style={{ margin: '12px 0' }}>{gbr ? <img src={gbr} alt={'QR ' + judul} style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line, #E6DFD0)' }} />
        : err ? <p className="hint" style={{ color: 'var(--red)' }}>{err}</p> : <p className="hint">Menyiapkan QR code…</p>}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {gbr && <a className="btn btn-primary" style={{ width: 'auto', textDecoration: 'none', padding: '8px 14px' }} href={gbr} download={nama}>⬇ Unduh gambar</a>}
        {gbr && <button className="sort-btn" onClick={bagikan}>📤 Bagikan ke WA</button>}
        <button className="sort-btn" onClick={onTutup}>Tutup</button></div>
      <p className="hint" style={{ marginTop: 10, fontSize: 11.5 }}>Di HP, "Bagikan ke WA" langsung mengirim gambar QR. Di laptop, unduh gambarnya lalu lampirkan di WhatsApp Web.</p>
    </div></div>);
}
