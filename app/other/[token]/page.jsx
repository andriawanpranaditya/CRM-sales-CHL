'use client';
// Form Other Sales — PUBLIK tanpa login: internal employee / external yang membawa konsumen
import { useEffect, useState } from 'react';
import IsianOther, { cekOtherKlien, kirimOther } from '@/components/IsianOther';

const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const KOSONG = { konsumen: '', konsumen_wa: '', tgl: '', tipe: '', bayar: '', domisili: '', budget: '', catatan: '', website: '' };

export default function LaporOther({ params }) {
  const token = params.token;
  const [info, setInfo] = useState(null), [f, setF] = useState({ ...KOSONG, tgl: hariIni() }), [o, setO] = useState({});
  const [kirim, setKirim] = useState(false), [selesai, setSelesai] = useState(false), [pesan, setPesan] = useState('');
  useEffect(() => {
    fetch('/api/lapor-other?token=' + encodeURIComponent(token)).then(r => r.json()).then(setInfo).catch(() => setInfo({ ok: false, error: 'Tidak bisa terhubung' }));
    try { const a = JSON.parse(localStorage.getItem('other-saya') || '{}'); if (a.jenis) setO(a); } catch {}
  }, [token]);
  const ubah = k => e => setF({ ...f, [k]: e.target.value });
  async function simpan() {
    setPesan('');
    const salah = cekOtherKlien(o); if (salah) return setPesan(salah);
    if (!f.konsumen) return setPesan('Nama konsumen wajib diisi');
    if (String(f.konsumen_wa).replace(/\D/g, '').length < 9) return setPesan('No. WA konsumen wajib diisi dengan benar');
    setKirim(true);
    try {
      const r = await fetch('/api/lapor-other', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...f, other: kirimOther(o) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal mengirim');
      try { localStorage.setItem('other-saya', JSON.stringify({ jenis: o.jenis, nama: o.nama, hp: o.hp, divisi: o.divisi })); } catch {}
      setSelesai(true);
    } catch (e) { setPesan(e.message); } finally { setKirim(false); }
  }
  if (!info) return <div className="lp"><div className="lp-kartu"><p>Memuat…</p></div></div>;
  if (!info.ok) return <div className="lp"><div className="lp-kartu"><h2>Link tidak berlaku</h2><p>{info.error}</p></div></div>;
  const nama = info.project === 'BIO DISTRICT' ? 'Bio District' : info.project === 'PERMAI INDAH' ? 'Permai Indah' : info.project;
  if (selesai) return (<div className="lp"><div className="lp-head"><div className="lp-e">OTHER SALES</div><div className="lp-j">{nama}</div></div>
    <div className="lp-kartu" style={{ textAlign: 'center' }}><div style={{ fontSize: 44 }}>✅</div><h2>Terima kasih, data terkirim</h2><p>Data konsumen <b>{f.konsumen}</b> sudah diterima dan akan dicek tim marketing.</p>
      <button className="lp-btn" onClick={() => { setSelesai(false); setF({ ...KOSONG, tgl: hariIni() }); setO(x => ({ jenis: x.jenis, nama: x.nama, hp: x.hp, divisi: x.divisi })); }}>Kirim konsumen lain</button></div></div>);
  return (<div className="lp">
    <div className="lp-head"><div className="lp-e">OTHER SALES</div><div className="lp-j">{nama}</div>
      <div className="lp-s">Untuk karyawan (internal employee) atau pihak luar (external) yang membawa konsumen. Tidak perlu login.</div></div>
    <div className="lp-kartu form-grid">
      <div className="field full"><div className="lp-sec">Data Anda</div></div>
      <IsianOther nilai={o} onUbah={setO} />
      <div className="field full"><div className="lp-sec">Data konsumen</div></div>
      <div className="field full"><label>Nama konsumen *</label><input value={f.konsumen} onChange={ubah('konsumen')} /></div>
      <div className="field"><label>No. WA konsumen *</label><input value={f.konsumen_wa} inputMode="tel" onChange={ubah('konsumen_wa')} placeholder="08xxxxxxxxxx" /></div>
      <div className="field"><label>Tanggal</label><input type="date" value={f.tgl} max={hariIni()} onChange={ubah('tgl')} /></div>
      <div className="field"><label>Tipe diminati</label><input value={f.tipe} onChange={ubah('tipe')} /></div>
      <div className="field"><label>Cara bayar</label><select value={f.bayar} onChange={ubah('bayar')}><option value="">— pilih —</option>{['KPR', 'Cash keras', 'Cash bertahap', 'Belum tahu'].map(x => <option key={x}>{x}</option>)}</select></div>
      <div className="field"><label>Domisili</label><input value={f.domisili} onChange={ubah('domisili')} /></div>
      <div className="field"><label>Budget</label><input value={f.budget} onChange={ubah('budget')} /></div>
      <div className="field full"><label>Catatan</label><textarea rows={3} value={f.catatan} onChange={ubah('catatan')} placeholder="unit yang diminati, status konsumen, rencana berikutnya" /></div>
      <input value={f.website} onChange={ubah('website')} tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: -9999 }} aria-hidden="true" />
      {pesan && <div className="field full" style={{ color: '#B4482A', fontWeight: 600 }}>{pesan}</div>}
      <div className="field full"><button className="lp-btn" disabled={kirim} onClick={simpan}>{kirim ? 'Mengirim…' : 'Kirim data'}</button></div>
    </div></div>);
}
