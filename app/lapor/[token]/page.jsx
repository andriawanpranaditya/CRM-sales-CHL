'use client';
// Form laporan kunjungan agent — PUBLIK, tanpa login. Link dibagikan lead agent ke agent di bawahnya.
import { useEffect, useState } from 'react';
import FotoKunjungan from '@/components/FotoKunjungan';

const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const KOSONG = { agent_nama: '', agent_kantor: '', agent_hp: '', konsumen: '', tgl: '', jam: '', tipe: '', bayar: '', domisili: '', budget: '', catatan: '', website: '' };

export default function LaporAgent({ params }) {
  const token = params.token;
  const [info, setInfo] = useState(null), [f, setF] = useState({ ...KOSONG, tgl: hariIni() }), [foto, setFoto] = useState(null);
  const [kirim, setKirim] = useState(false), [selesai, setSelesai] = useState(false), [pesan, setPesan] = useState('');
  useEffect(() => {
    fetch('/api/lapor-agent?token=' + encodeURIComponent(token)).then(r => r.json()).then(setInfo).catch(() => setInfo({ ok: false, error: 'Tidak bisa terhubung' }));
    try { const a = JSON.parse(localStorage.getItem('agent-saya') || '{}'); setF(x => ({ ...x, agent_nama: a.agent_nama || '', agent_kantor: a.agent_kantor || '', agent_hp: a.agent_hp || '' })); } catch {}
  }, [token]);
  const ubah = k => e => setF({ ...f, [k]: e.target.value });
  async function simpan() {
    setPesan('');
    if (!f.agent_nama || !f.agent_kantor || !f.agent_hp || !f.konsumen || !f.tgl) return setPesan('Lengkapi kolom bertanda *');
    if (info.fotoWajib && !foto) return setPesan('Lampirkan foto kunjungan');
    setKirim(true);
    try {
      const r = await fetch('/api/lapor-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...f, foto: foto ? { data: foto.data } : undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal mengirim');
      try { localStorage.setItem('agent-saya', JSON.stringify({ agent_nama: f.agent_nama, agent_kantor: f.agent_kantor, agent_hp: f.agent_hp })); } catch {}
      setSelesai(true);
    } catch (e) { setPesan(e.message); } finally { setKirim(false); }
  }
  if (!info) return <div className="lp"><div className="lp-kartu"><p>Memuat…</p></div></div>;
  if (!info.ok) return <div className="lp"><div className="lp-kartu"><h2>Link tidak berlaku</h2><p>{info.error}</p></div></div>;
  const nama = info.project === 'BIO DISTRICT' ? 'Bio District' : info.project === 'PERMAI INDAH' ? 'Permai Indah' : info.project;
  if (selesai) return (<div className="lp"><div className="lp-head"><div className="lp-e">LAPORAN KUNJUNGAN AGENT</div><div className="lp-j">{nama} · {info.leadAgent}</div></div>
    <div className="lp-kartu" style={{ textAlign: 'center' }}><div style={{ fontSize: 44 }}>✅</div><h2>Terima kasih, laporan terkirim</h2><p>Laporan kunjungan <b>{f.konsumen}</b> sudah diterima dan akan dicek tim marketing.</p>
      <button className="lp-btn" onClick={() => { setSelesai(false); setF(x => ({ ...KOSONG, agent_nama: x.agent_nama, agent_kantor: x.agent_kantor, agent_hp: x.agent_hp, tgl: hariIni() })); setFoto(null); }}>Lapor kunjungan lain</button></div></div>);
  return (<div className="lp">
    <div className="lp-head"><div className="lp-e">LAPORAN KUNJUNGAN AGENT</div><div className="lp-j">{nama} · {info.leadAgent}</div>
      <div className="lp-s">Isi setelah konsumen berkunjung ke lokasi. Tidak perlu login dan tidak perlu nomor konsumen.</div></div>
    <div className="lp-kartu form-grid">
      <div className="field full"><div className="lp-sec">Data agent</div></div>
      <div className="field full"><label>Nama agent *</label><input value={f.agent_nama} onChange={ubah('agent_nama')} /></div>
      <div className="field full"><label>Kantor / agency *</label><input value={f.agent_kantor} onChange={ubah('agent_kantor')} placeholder="mis. Ray White Gading Serpong" /></div>
      <div className="field full"><label>No. HP agent *</label><input value={f.agent_hp} onChange={ubah('agent_hp')} inputMode="tel" placeholder="nomor Anda (bukan nomor konsumen)" /></div>
      <div className="field full"><div className="lp-sec">Data konsumen</div></div>
      <div className="field full"><label>Nama konsumen *</label><input value={f.konsumen} onChange={ubah('konsumen')} /></div>
      <div className="field"><label>Tanggal kunjungan *</label><input type="date" value={f.tgl} max={hariIni()} onChange={ubah('tgl')} /></div>
      <div className="field"><label>Jam</label><input type="time" value={f.jam} onChange={ubah('jam')} /></div>
      <div className="field"><label>Tipe diminati</label><input value={f.tipe} onChange={ubah('tipe')} placeholder={info.project === 'BIO DISTRICT' ? 'Tipe A / B / C' : 'mis. 22,5/60'} /></div>
      <div className="field"><label>Cara bayar</label><select value={f.bayar} onChange={ubah('bayar')}><option value="">— pilih —</option>{['KPR', 'Cash keras', 'Cash bertahap', 'Belum tahu'].map(x => <option key={x}>{x}</option>)}</select></div>
      <div className="field"><label>Domisili</label><input value={f.domisili} onChange={ubah('domisili')} /></div>
      <div className="field"><label>Budget</label><input value={f.budget} onChange={ubah('budget')} placeholder="mis. Rp2–2,5 M" /></div>
      <div className="field full"><label>Catatan</label><textarea rows={3} value={f.catatan} onChange={ubah('catatan')} placeholder="unit yang dilihat, pertanyaan konsumen, rencana berikutnya" /></div>
      <FotoKunjungan nilai={foto} onUbah={setFoto} wajib={info.fotoWajib} ket="Foto konsumen di marketing gallery / di depan unit." />
      <input value={f.website} onChange={ubah('website')} tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: -9999 }} aria-hidden="true" />
      {pesan && <div className="field full" style={{ color: '#B4482A', fontWeight: 600 }}>{pesan}</div>}
      <div className="field full"><button className="lp-btn" disabled={kirim} onClick={simpan}>{kirim ? 'Mengirim…' : 'Kirim laporan'}</button></div>
    </div></div>);
}
