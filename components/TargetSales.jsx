'use client';
// Target bulanan sales: kartu Beranda, pop-up pengingat (09.00 · 13.00 · 16.00) & halaman Manager
import { useEffect, useRef, useState } from 'react';
import { api, waLink } from '@/components/util';

const LABEL = { booking: 'Booking', kunjungan: 'Kunjungan / site visit', janji: 'Janji temu dibuat', lead: 'Lead baru mandiri' };
const SATUAN = { booking: ' unit', kunjungan: '', janji: '', lead: '' };
const WARNA = { hijau: '#1E5B45', kuning: '#C99C4F', merah: '#B4482A' };
const STATUS_TEKS = { hijau: 'On track', kuning: 'Agak tertinggal', merah: 'Tertinggal' };
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const namaBulan = b => `${BLN[Number(b.slice(5, 7)) - 1]} ${b.slice(0, 4)}`;
const statusUmum = st => Object.values(st).includes('merah') ? 'merah' : Object.values(st).includes('kuning') ? 'kuning' : 'hijau';
const tglPendek = t => t ? `${Number(t.slice(8, 10))} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][Number(t.slice(5, 7)) - 1]}` : '';

function butuh(d, k) {
  const t = d.target[k], c = d.capaian[k], sisa = Math.max(0, t - c);
  if (!t) return 'tanpa target';
  if (!sisa) return 'target tercapai ✓';
  const per = d.hk.sisa ? d.hk.sisa / sisa : 0;
  return `butuh ${sisa} lagi${per >= 1 ? ` · ±1 per ${Math.round(per)} hari kerja` : ` · ±${(sisa / Math.max(1, d.hk.sisa)).toFixed(1).replace('.', ',')} per hari kerja`}`;
}

export function AngkaTarget({ d, kecil }) {
  return (<div className={'tg-grid' + (kecil ? ' kecil' : '')}>{Object.keys(LABEL).map(k => {
    const t = d.target[k], c = d.capaian[k], pct = t ? Math.min(100, Math.round(c / t * 100)) : 100;
    return (<div key={k} className="tg-m"><div className="tg-l">{kecil ? LABEL[k].replace(' / site visit', '').replace(' dibuat', '').replace('baru ', '') : LABEL[k]}</div>
      <div className="tg-v" style={d.status[k] === 'merah' ? { color: WARNA.merah } : undefined}>{c}<small> / {t}{SATUAN[k]}</small></div>
      {!kecil && <><div className="tg-bar"><i style={{ width: pct + '%', background: WARNA[d.status[k]] }} /></div><div className="tg-s">{butuh(d, k)}</div></>}</div>);
  })}</div>);
}

// ===== Kartu Beranda sales =====
export function TargetBulanIni() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/api/target-sales').then(x => setD(x.saya)).catch(() => {}); }, []);
  if (!d) return null;
  const su = statusUmum(d.status), p = d.pesan;
  return (<div className="tg-wrap">
    <div className="card tg-kartu"><div className="tg-head"><b>🎯 Target {namaBulan(d.bulan)}</b>
      <span><span className={'tg-chip ' + su}>{STATUS_TEKS[su]}</span><span className="hint" style={{ marginLeft: 8 }}>sisa {d.hk.sisa} hari kerja</span></span></div>
      <AngkaTarget d={d} />
      <div className="tg-info">💡 <b>Lead mandiri</b> = lead yang kamu cari sendiri (referensi, kanvasing, pameran, medsos pribadi, komunitas) — bukan dari Marcom maupun walk in.</div></div>
    <div className="tg-bawah">
      <div className="card" style={{ flex: 1.6, minWidth: 0 }}><b>🔥 Kejar bulan ini</b> <span className="hint">— lead paling siap Booking</span>
        {d.prioritas.length ? <div className="tbl-wrap"><table className="tg-tb"><thead><tr><th>Lead</th><th>Status</th><th>Update terakhir</th><th></th></tr></thead>
          <tbody>{d.prioritas.map(l => <tr key={l.lead_code}><td><b>{l.nama}</b><span className="tg-sub">{[l.tipe, l.tgl_upd ? 'FU ' + tglPendek(l.tgl_upd) : 'belum di-FU'].filter(Boolean).join(' · ')}</span></td>
            <td><span className={'tg-chip ' + (l.status === 'Hot' ? 'hijau' : 'kuning')}>{l.status}</span></td>
            <td style={l.basi ? { color: WARNA.merah } : undefined}>{l.basi ? (l.tgl_upd ? 'Lama tidak di-follow up' : 'Belum pernah di-follow up') : (l.upd || '—')}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{l.wa && <a className="sort-btn" href={waLink(l.wa, '')} target="_blank" rel="noreferrer">WA</a>} <a className="sort-btn" href={'/form?tab=fu&lead=' + encodeURIComponent(l.lead_code)}>FU</a></td></tr>)}</tbody></table></div>
          : <p className="hint">Belum ada lead Hot / Site Visit / Appointment / Warm — saatnya cari lead baru dan naikkan statusnya.</p>}</div>
      <div className={'card tg-pesan ' + p.bulanan.nada} style={{ flex: 1 }}><b>💬 Pesan untuk {d.depan}</b>
        <p>{p.bulanan.isi}</p>{p.tambahan.map((x, i) => <p key={i} className="tg-tambahan">{x.isi}</p>)}</div>
    </div></div>);
}

// ===== Pop-up pengingat (khusus sales) =====
const slotSekarang = () => { const j = new Date(Date.now() + 7 * 3600000).getUTCHours(); return j < 13 ? 'pagi' : j < 16 ? 'siang' : 'sore'; };
const JUDUL = { pagi: ['PENGINGAT PAGI · 09.00', '☀️'], siang: ['PENGINGAT SIANG · 13.00', '🕐'], sore: ['REKAP SORE · 16.00', '🌇'] };
export function PopupPengingat({ user }) {
  const [d, setD] = useState(null), [slot, setSlot] = useState(null);
  const ref = useRef(null);
  const kunci = s => `pengingat:${user?.username}:${new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)}:${s}`;
  const cek = async () => {
    const s = slotSekarang();
    try { if (localStorage.getItem(kunci(s))) return; } catch {}
    try { const x = await api('/api/target-sales'); setD(x.saya); setSlot(s); } catch {}
  };
  useEffect(() => {
    if (user?.role !== 'sales') return;
    cek();
    ref.current = setInterval(() => { if (!slot) cek(); }, 60000); // pop-up langsung muncul saat masuk jam 13.00 / 16.00
    return () => clearInterval(ref.current);
  }, [user?.username]); // eslint-disable-line
  if (!d || !slot) return null;
  const tutup = () => { try { localStorage.setItem(kunci(slot), '1'); } catch {} setSlot(null); };
  const p = d.pesan, h = d.harian.ini, k = d.harian.kemarin;
  const judul = slot === 'pagi' ? `Pagi, ${d.depan}!` : slot === 'siang' ? `Udah jam 1, ${d.depan}` : `Rekap hari ini, ${d.depan}`;
  const kerjakan = [...d.jadwalFu.slice(0, 4).map(x => 'FU ' + x), ...d.janjiHariIni.map(j => `janji temu ${j.nama} jam ${j.jam}`)];
  const baris = [['Follow up dilakukan', 'fu'], ['Janji temu dibuat', 'janji'], ['Kunjungan / visit', 'visit'], ['Lead mandiri baru', 'lead'], ['Booking', 'booking']];
  return (<div className="tg-overlay" role="dialog" aria-modal="true"><div className="tg-pop">
    <div className="tg-pop-head"><div><div className="tg-pop-eyebrow">{JUDUL[slot][0]}</div><div className="tg-pop-judul">{judul} {JUDUL[slot][1]}</div></div><div style={{ fontSize: 30 }}>⏰</div></div>
    <div className="tg-pop-isi">
      {slot === 'sore' ? <>
        <table className="tg-tb"><thead><tr><th>Aktivitas</th><th>Hari ini</th><th>Kemarin</th><th></th></tr></thead>
          <tbody>{baris.map(([l, x]) => <tr key={x}><td>{l}</td><td><b>{h[x]}</b></td><td>{k[x]}</td><td style={{ fontWeight: 800, color: h[x] > k[x] ? WARNA.hijau : h[x] < k[x] ? WARNA.merah : '#8A9A93' }}>{h[x] > k[x] ? '⬆' : h[x] < k[x] ? '⬇' : '='}</td></tr>)}</tbody></table>
        <p className={'tg-rekap ' + p.sore.nada}>{p.sore.isi}</p></>
        : <p>{slot === 'pagi' ? p.pagi : p.siang}</p>}
      {slot === 'pagi' && <p className={'tg-rekap ' + (['warning', 'bahaya'].includes(p.bulanan.nada) ? 'turun' : 'naik')}><b>Target bulan ini:</b> {p.bulanan.isi}</p>}
      <AngkaTarget d={d} kecil />
      {slot !== 'sore' && kerjakan.length > 0 && <p className="tg-kerjakan"><b>Kerjakan sekarang:</b> {kerjakan.join(' · ')}</p>}
    </div>
    <div className="tg-pop-aksi"><a className="sort-btn" href="/beranda" onClick={tutup}>Lihat lead prioritas</a><button className="btn btn-primary" style={{ width: 'auto' }} onClick={tutup}>Siap, gas! 💪</button></div>
  </div></div>);
}

// ===== Halaman Manager: atur target & pencapaian tim =====
export function TargetManager({ me }) {
  const [d, setD] = useState(null), [t, setT] = useState(null), [simpan, setSimpan] = useState(false);
  const muat = () => api('/api/target-sales').then(x => { setD(x); setT(x.target); }).catch(e => alert(e.message));
  useEffect(() => { muat(); }, []);
  if (!d) return <div className="loading">Menghitung pencapaian sales…</div>;
  const bisa = me?.role === 'manager';
  const jum = k => d.tim.reduce((a, x) => a + x.capaian[k], 0);
  return (<>
    <div className="tg-bawah" style={{ alignItems: 'flex-start' }}>
      <div className="card" style={{ flex: 1, minWidth: 360 }}><b>⚙️ Target per sales per bulan</b> <span className="hint">(sama untuk semua sales)</span>
        <table className="tg-tb" style={{ marginTop: 8 }}><thead><tr><th>Target</th><th>Per sales / bulan</th></tr></thead>
          <tbody>{Object.keys(LABEL).map(k => <tr key={k}><td><b>{LABEL[k]}</b></td><td>{bisa ? <input type="number" min={0} value={t[k]} onChange={e => setT({ ...t, [k]: e.target.value })} style={{ width: 80, padding: '4px 8px' }} /> : t[k]}</td></tr>)}</tbody></table>
        {bisa && <button className="btn btn-primary" style={{ width: 'auto', marginTop: 10 }} disabled={simpan} onClick={async () => {
          setSimpan(true); try { await api('/api/target-sales', { method: 'POST', body: JSON.stringify({ target: t }) }); await muat(); alert('Target tersimpan'); } catch (e) { alert(e.message); } finally { setSimpan(false); } }}>Simpan target</button>}
        <p className="hint" style={{ marginTop: 10 }}>Lead mandiri = lead yang diinput sales sendiri, bukan dari Marcom &amp; bukan walk in. Pengingat pop-up muncul untuk sales pukul 09.00, 13.00 &amp; 16.00.</p></div>
      <div className="card" style={{ flex: 1.6, minWidth: 0 }}><b>📊 Pencapaian {d.tim[0] ? namaBulan(d.tim[0].bulan) : ''}</b> {d.tim[0] && <span className="hint">· sisa {d.tim[0].hk.sisa} hari kerja</span>}
        <div className="tbl-wrap"><table className="tg-tb" style={{ marginTop: 8 }}><thead><tr><th>Sales</th>{Object.keys(LABEL).map(k => <th key={k}>{LABEL[k].split(' ')[0] === 'Lead' ? 'Lead mandiri' : LABEL[k].split(' / ')[0].replace(' dibuat', '')}</th>)}<th>Hari ini</th><th>Status</th></tr></thead>
          <tbody>{d.tim.map(x => { const su = statusUmum(x.status); return <tr key={x.nama}><td><b>{x.nama}</b></td>
            {Object.keys(LABEL).map(k => <td key={k} style={{ color: x.status[k] === 'merah' ? WARNA.merah : undefined }}>{x.capaian[k]}/{x.target[k]}</td>)}
            <td className="hint">FU {x.harian.ini.fu} · janji {x.harian.ini.janji} · lead {x.harian.ini.lead}</td>
            <td><span className={'tg-chip ' + su}>{STATUS_TEKS[su]}</span></td></tr>; })}
            <tr><td><b>Tim</b></td>{Object.keys(LABEL).map(k => <td key={k}><b>{jum(k)}/{(d.target[k] || 0) * d.tim.length}</b></td>)}<td /><td /></tr></tbody></table></div>
        <p className="hint" style={{ marginTop: 8 }}>Status dari laju: pencapaian dibanding bagian bulan yang sudah berjalan — On track ≥ 90%, Agak tertinggal 60–89%, Tertinggal &lt; 60%.</p></div>
    </div></>);
}
