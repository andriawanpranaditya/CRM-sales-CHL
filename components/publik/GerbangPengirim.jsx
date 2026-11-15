'use client';
// Gerbang pengirim terverifikasi untuk link terbuka: daftar sekali (nomor HP + perangkat) → Manager verifikasi → form terbuka.
import { useEffect, useRef, useState } from 'react';
import FotoKunjungan from '@/components/FotoKunjungan';

export function kunciPerangkat() {
  try {
    let k = localStorage.getItem('crm-perangkat');
    if (!k) { const a = new Uint8Array(16); crypto.getRandomValues(a); k = [...a].map(x => x.toString(16).padStart(2, '0')).join(''); localStorage.setItem('crm-perangkat', k); }
    return k;
  } catch { return ''; }
}

export default function GerbangPengirim({ tipe, token, children }) {
  const kunciSimpan = 'pengirim-' + tipe;
  const [st, setSt] = useState('muat'), [p, setP] = useState(null), [d, setD] = useState({}), [pesan, setPesan] = useState(''), [kirim, setKirim] = useState(false), [hp, setHp] = useState('');
  const per = useRef('');
  const cek = async (hpCek) => {
    const r = await fetch(`/api/pengirim?token=${encodeURIComponent(token)}&perangkat=${per.current}&hp=${encodeURIComponent(hpCek || '')}`).then(x => x.json()).catch(() => ({}));
    if (r.status) { setP(r.pengirim); setSt(r.status); } else setSt('daftar');
    return r.status;
  };
  useEffect(() => {
    per.current = kunciPerangkat();
    let simpan = {}; try { simpan = JSON.parse(localStorage.getItem(kunciSimpan) || '{}'); } catch {}
    setD(simpan); cek(simpan.hp);
  }, [token]); // eslint-disable-line
  // Menunggu verifikasi → cek otomatis tiap 8 detik, form terbuka sendiri begitu diverifikasi
  useEffect(() => { if (st !== 'Menunggu') return; const t = setInterval(() => cek(p?.hp || d.hp), 8000); return () => clearInterval(t); }, [st]); // eslint-disable-line

  async function daftar() {
    setPesan('');
    if (tipe === 'other' && !d.jenis) return setPesan('Pilih Internal employee atau External');
    if (!String(d.nama || '').trim()) return setPesan('Nama wajib diisi');
    if (String(d.hp || '').replace(/\D/g, '').length < 10) return setPesan('No. HP wajib diisi dengan benar');
    if (tipe === 'agent' && !String(d.kantor || '').trim()) return setPesan('Kantor / agency wajib diisi');
    if (tipe === 'other' && d.jenis === 'Internal employee' && !String(d.divisi || '').trim()) return setPesan('Divisi wajib diisi');
    if (tipe === 'other' && d.jenis === 'External' && (!d.ktp || !d.npwp)) return setPesan('Lampirkan foto KTP dan NPWP Anda');
    setKirim(true);
    try {
      const r = await fetch('/api/pengirim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, perangkat: per.current, website: hp,
        data: { ...d, ktp: d.ktp ? { data: d.ktp.data } : undefined, npwp: d.npwp ? { data: d.npwp.data } : undefined } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal mendaftar');
      try { localStorage.setItem(kunciSimpan, JSON.stringify({ nama: d.nama, hp: d.hp, kantor: d.kantor, divisi: d.divisi, jenis: d.jenis })); } catch {}
      setP(j.pengirim); setSt(j.status);
    } catch (e) { setPesan(e.message); } finally { setKirim(false); }
  }
  const gantiNomor = () => { try { localStorage.removeItem(kunciSimpan); } catch {} setD({}); setP(null); setSt('daftar'); };

  if (st === 'muat') return <div className="lp-kartu"><p>Memeriksa data Anda…</p></div>;
  if (st === 'Terverifikasi') return children({ ...p, gantiNomor });
  if (st === 'Menunggu') return (<div className="lp-kartu" style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 44 }}>⏳</div><h2 style={{ margin: '6px 0' }}>Menunggu verifikasi</h2>
    <p>Data Anda (<b>{p?.nama}</b> · {p?.hp}) sudah diterima dan sedang diverifikasi tim marketing.</p>
    <p className="lp-ket">Halaman ini <b>otomatis lanjut ke form</b> begitu diverifikasi — tidak perlu dimuat ulang. Verifikasi hanya sekali untuk nomor &amp; HP ini.</p>
    <button className="sort-btn" style={{ marginTop: 8 }} onClick={gantiNomor}>Ganti data / nomor</button></div>);
  const set = (k, v) => setD({ ...d, [k]: v });
  return (<div className="lp-kartu form-grid">
    <div className="field full"><div className="lp-sec">Verifikasi pengirim (sekali saja)</div>
      <p className="lp-ket" style={{ margin: '4px 0 0' }}>{st === 'Ditolak' || st === 'Dicabut' ? `Pendaftaran sebelumnya ${st.toLowerCase()}${p?.alasan ? ' (' + p.alasan + ')' : ''}. Periksa data lalu daftar ulang.` : 'Isi data Anda. Setelah diverifikasi tim marketing, form bisa langsung dipakai dari HP ini tanpa daftar lagi.'}</p></div>
    {tipe === 'other' && <div className="field full"><label>Anda sebagai *</label><div className="lp-seg">{['Internal employee', 'External'].map(j => <button type="button" key={j} className={d.jenis === j ? 'on' : ''} onClick={() => set('jenis', j)}>{j}</button>)}</div></div>}
    <div className="field full"><label>{tipe === 'other' && d.jenis === 'External' ? 'Nama lengkap (sesuai KTP) *' : tipe === 'agent' ? 'Nama agent *' : 'Nama *'}</label><input value={d.nama || ''} onChange={e => set('nama', e.target.value)} /></div>
    <div className="field full"><label>No. HP *</label><input value={d.hp || ''} inputMode="tel" onChange={e => set('hp', e.target.value)} placeholder="08xxxxxxxxxx" /></div>
    {tipe === 'agent' && <div className="field full"><label>Kantor / agency *</label><input value={d.kantor || ''} onChange={e => set('kantor', e.target.value)} placeholder="mis. Ray White Gading Serpong" /></div>}
    {tipe === 'other' && d.jenis === 'Internal employee' && <div className="field full"><label>Divisi *</label><input value={d.divisi || ''} onChange={e => set('divisi', e.target.value)} placeholder="mis. Finance, Estate, Legal" /></div>}
    {tipe === 'other' && d.jenis === 'External' && <>
      <FotoKunjungan maks={1600} mutu={0.8} label="Foto KTP Anda" wajib nilai={d.ktp} onUbah={v => set('ktp', v)} ket="Foto KTP jelas & terbaca." />
      <FotoKunjungan maks={1600} mutu={0.8} label="Foto NPWP Anda" wajib nilai={d.npwp} onUbah={v => set('npwp', v)} ket="Foto NPWP jelas & terbaca." /></>}
    <input value={hp} onChange={e => setHp(e.target.value)} tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: -9999 }} aria-hidden="true" />
    {pesan && <div className="field full" style={{ color: '#B4482A', fontWeight: 600 }}>{pesan}</div>}
    <div className="field full"><button className="lp-btn" disabled={kirim} onClick={daftar}>{kirim ? 'Mengirim…' : 'Kirim untuk diverifikasi'}</button></div>
  </div>);
}
