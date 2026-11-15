'use client';
// Form Other Sales — PUBLIK tanpa login. Langkah 1: pilih Internal employee / External; langkah 2: form Reserved / Booking lengkap.
import { useEffect, useState } from 'react';
import IsianOther, { cekOtherKlien, kirimOther } from '@/components/IsianOther';
import FotoKunjungan from '@/components/FotoKunjungan';

const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const TRX0 = { jenis: '', unit: '', tgl: '', nilai: '', bayar: '' }, KON0 = { nama: '', wa: '', email: '', nik: '', alamat: '' };
const angka = v => String(v || '').replace(/\D/g, '');

export default function LaporOther({ params }) {
  const token = params.token;
  const [info, setInfo] = useState(null), [o, setO] = useState({}), [trx, setTrx] = useState({ ...TRX0, tgl: hariIni() }), [kon, setKon] = useState(KON0);
  const [berkas, setBerkas] = useState({}), [catatan, setCatatan] = useState(''), [hp, setHp] = useState('');
  const [kirim, setKirim] = useState(false), [selesai, setSelesai] = useState(false), [pesan, setPesan] = useState('');
  const muat = () => fetch('/api/lapor-other?token=' + encodeURIComponent(token)).then(r => r.json()).then(setInfo).catch(() => setInfo({ ok: false, error: 'Tidak bisa terhubung' }));
  useEffect(() => { muat(); }, [token]); // eslint-disable-line
  const pilih = jenis => { let a = {}; try { a = JSON.parse(localStorage.getItem('other-saya') || '{}'); } catch {} setO(a.jenis === jenis ? { ...a } : { jenis }); window.scrollTo(0, 0); };
  async function simpan() {
    setPesan('');
    const salah = cekOtherKlien(o) || (!trx.jenis ? 'Pilih Reserved atau Booking' : !trx.unit ? 'Pilih blok / unit' : !trx.tgl ? 'Isi tanggal transfer' : !Number(angka(trx.nilai)) ? 'Isi nilai yang dibayar'
      : !trx.bayar ? 'Pilih cara bayar' : !kon.nama.trim() ? 'Nama konsumen sesuai KTP wajib diisi' : angka(kon.wa).length < 9 ? 'No. HP / WA konsumen wajib diisi'
      : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(kon.email.trim()) ? 'Email konsumen wajib diisi dengan benar' : angka(kon.nik).length !== 16 ? 'NIK konsumen wajib 16 digit'
      : !kon.alamat.trim() ? 'Alamat domisili konsumen wajib diisi' : (!berkas.transfer || !berkas.ktp || !berkas.npwp) ? 'Lampirkan bukti transfer, KTP, dan NPWP konsumen' : null);
    if (salah) return setPesan(salah);
    setKirim(true);
    try {
      const r = await fetch('/api/lapor-other', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, website: hp, other: kirimOther(o),
        trx: { ...trx, nilai: Number(angka(trx.nilai)) }, konsumen: kon, catatan, berkas: { transfer: { data: berkas.transfer.data }, ktp: { data: berkas.ktp.data }, npwp: { data: berkas.npwp.data } } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal mengirim');
      try { localStorage.setItem('other-saya', JSON.stringify({ jenis: o.jenis, nama: o.nama, hp: o.hp, divisi: o.divisi })); } catch {}
      setSelesai(true); window.scrollTo(0, 0);
    } catch (e) { setPesan(e.message); } finally { setKirim(false); }
  }
  if (!info) return <div className="lp"><div className="lp-kartu"><p>Memuat…</p></div></div>;
  if (!info.ok) return <div className="lp"><div className="lp-kartu"><h2>Link tidak berlaku</h2><p>{info.error}</p></div></div>;
  const nama = info.project === 'BIO DISTRICT' ? 'Bio District' : info.project === 'PERMAI INDAH' ? 'Permai Indah' : info.project;
  const Kepala = () => <div className="lp-head"><div className="lp-e">OTHER SALES</div><div className="lp-j">{nama}</div><div className="lp-s">Penjualan dari karyawan atau pihak luar. Tidak perlu login.</div></div>;
  if (selesai) return (<div className="lp"><Kepala />
    <div className="lp-kartu" style={{ textAlign: 'center' }}><div style={{ fontSize: 44 }}>✅</div><h2>Terima kasih, data terkirim</h2>
      <p>{trx.jenis} <b>{trx.unit}</b> atas nama <b>{kon.nama}</b> sudah diterima dan akan dicek tim marketing sebelum tercatat.</p>
      <button className="lp-btn" onClick={() => { setSelesai(false); setTrx({ ...TRX0, tgl: hariIni() }); setKon(KON0); setBerkas({}); setCatatan(''); muat(); }}>Kirim transaksi lain</button></div></div>);
  if (!o.jenis) return (<div className="lp"><Kepala /><div className="lp-pilih">
    <div className="lp-q">Anda sebagai…</div>
    {[['Internal employee', '🏢', 'Karyawan PT Cipta Harmoni Lestari / grup (bukan tim sales)'], ['External', '🤝', 'Pihak luar: rekan, freelance, atau perorangan di luar perusahaan']].map(([j, ic, ket]) =>
      <button key={j} className="lp-opsi" onClick={() => pilih(j)}><span className="lp-opsi-ic">{ic}</span><span><b>{j}</b><small>{ket}</small></span><span className="lp-opsi-ar">›</span></button>)}
    <p className="lp-ket">Setelah memilih, isi data Anda, data transaksi, data konsumen, dan berkas Reserved / Booking. Data dicek tim marketing sebelum tercatat.</p></div></div>);
  const T = k => e => setTrx({ ...trx, [k]: e.target.value }), K = k => e => setKon({ ...kon, [k]: e.target.value });
  return (<div className="lp"><Kepala />
    <div className="lp-kartu form-grid">
      <div className="field full"><span className="lp-chip">{o.jenis === 'External' ? '🤝' : '🏢'} {o.jenis} · <button type="button" onClick={() => setO({})}>ganti</button></span></div>
      <div className="field full"><div className="lp-sec">1 · Data Anda</div></div>
      <IsianOther nilai={o} onUbah={setO} tanpaPilihan />
      <div className="field full"><div className="lp-sec">2 · Transaksi</div></div>
      <div className="field full"><label>Jenis *</label><div className="lp-seg">{['Reserved', 'Booking'].map(j => <button type="button" key={j} className={trx.jenis === j ? 'on' : ''} onClick={() => setTrx({ ...trx, jenis: j })}>{j}</button>)}</div></div>
      <div className="field"><label>Blok / unit *</label><select value={trx.unit} onChange={T('unit')}><option value="">— pilih unit —</option>{(info.unit || []).map(u => <option key={u}>{u}</option>)}</select></div>
      <div className="field"><label>Tanggal transfer *</label><input type="date" value={trx.tgl} max={hariIni()} onChange={T('tgl')} /></div>
      <div className="field"><label>Nilai dibayar (Rp) *</label><input inputMode="numeric" value={angka(trx.nilai) ? Number(angka(trx.nilai)).toLocaleString('id-ID') : ''} onChange={e => setTrx({ ...trx, nilai: angka(e.target.value) })} placeholder="25.000.000" /></div>
      <div className="field"><label>Cara bayar *</label><select value={trx.bayar} onChange={T('bayar')}><option value="">— pilih —</option>{['KPR', 'Cash keras', 'Cash bertahap'].map(x => <option key={x}>{x}</option>)}</select></div>
      <div className="field full"><div className="lp-sec">3 · Data konsumen</div></div>
      <div className="field full"><label>Nama sesuai KTP *</label><input value={kon.nama} onChange={K('nama')} /></div>
      <div className="field"><label>No. HP / WA *</label><input inputMode="tel" value={kon.wa} onChange={K('wa')} placeholder="08xxxxxxxxxx" /></div>
      <div className="field"><label>Email *</label><input type="email" value={kon.email} onChange={K('email')} /></div>
      <div className="field full"><label>NIK (16 digit) *</label><input inputMode="numeric" value={kon.nik} onChange={K('nik')} maxLength={20} /></div>
      <div className="field full"><label>Alamat domisili *</label><textarea rows={2} value={kon.alamat} onChange={K('alamat')} /></div>
      <div className="field full"><div className="lp-sec">4 · Berkas konsumen</div></div>
      <FotoKunjungan maks={1600} mutu={0.8} label="Bukti transfer" wajib nilai={berkas.transfer} onUbah={v => setBerkas({ ...berkas, transfer: v })} ket="Foto / screenshot bukti transfer yang jelas." />
      <FotoKunjungan maks={1600} mutu={0.8} label="KTP konsumen" wajib nilai={berkas.ktp} onUbah={v => setBerkas({ ...berkas, ktp: v })} ket="Foto KTP konsumen jelas & terbaca." />
      <FotoKunjungan maks={1600} mutu={0.8} label="NPWP konsumen" wajib nilai={berkas.npwp} onUbah={v => setBerkas({ ...berkas, npwp: v })} ket="Foto NPWP konsumen jelas & terbaca." />
      <div className="field full"><label>Catatan</label><textarea rows={2} value={catatan} onChange={e => setCatatan(e.target.value)} /></div>
      <input value={hp} onChange={e => setHp(e.target.value)} tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: -9999 }} aria-hidden="true" />
      {pesan && <div className="field full" style={{ color: '#B4482A', fontWeight: 600 }}>{pesan}</div>}
      <div className="field full"><button className="lp-btn" disabled={kirim} onClick={simpan}>{kirim ? 'Mengirim…' : 'Kirim untuk dicek'}</button></div>
    </div></div>);
}
