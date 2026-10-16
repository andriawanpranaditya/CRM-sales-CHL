'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Toast, { toast } from '@/components/Toast';
import { api, bukaWA } from '@/components/util';

// ===== Janjian / Appointment visit =====
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const hariDari = t => t ? HARI[new Date(t + 'T00:00:00Z').getUTCDay()] : '';
const tglPanjang = t => t ? `${hariDari(t)}, ${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}` : '';
const tglPendek = t => t ? `${hariDari(t).slice(0, 3)} ${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]}` : '';
const geser = (t, n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const jamTitik = j => String(j || '').replace(':', '.');

function Status({ j }) {
  if (j.status === 'Datang') return <span className="kp-pill kp-ok">Datang{j.jam_datang ? ' ' + jamTitik(j.jam_datang) : ''}</span>;
  if (j.status === 'Batal') return <span className="kp-pill kp-no">Batal</span>;
  if (j.perlu_update) return <span className="kp-pill kp-no">Perlu update</span>;
  if (j.reschedule_n) return <span className="kp-pill kp-wait">Reschedule {j.reschedule_n}×</span>;
  return <span className="kp-pill kp-run">Terjadwal</span>;
}

export default function JanjianPage() {
  const [me, setMe] = useState(null);
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState('hari');
  const [fSales, setFSales] = useState('');
  const [sheet, setSheet] = useState(null); // { mode: 'baru'|'reschedule'|'batal'|'datang', j, f }
  const [atur, setAtur] = useState(null);
  const [busy, setBusy] = useState(false);
  const muat = () => api('/api/janjian').then(setD).catch(e => toast(e.message));
  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => {}); muat(); }, []);

  const now = d?.now || { tgl: '', jam: '' };
  const rows = (d?.rows || []).filter(r => !fSales || r.sales === fSales);
  const tampil = useMemo(() => {
    if (filter === 'hari') return rows.filter(r => r.tgl === now.tgl || r.perlu_update);
    if (filter === '7') return rows.filter(r => r.tgl >= now.tgl && r.tgl <= geser(now.tgl, 7) && r.status === 'Terjadwal');
    if (filter === 'update') return rows.filter(r => r.perlu_update);
    return rows.filter(r => r.tgl < now.tgl || r.status !== 'Terjadwal').sort((a, b) => (b.tgl + b.jam).localeCompare(a.tgl + a.jam));
  }, [rows, filter, now.tgl]); // eslint-disable-line
  const jml = {
    hari: rows.filter(r => r.tgl === now.tgl || r.perlu_update).length,
    '7': rows.filter(r => r.tgl >= now.tgl && r.tgl <= geser(now.tgl, 7) && r.status === 'Terjadwal').length,
    update: rows.filter(r => r.perlu_update).length,
  };
  const grup = useMemo(() => {
    const g = {};
    tampil.forEach(r => { const k = r.perlu_update && r.tgl < now.tgl ? 'lewat' : r.tgl; (g[k] = g[k] || []).push(r); });
    return Object.entries(g).sort(([a], [b]) => a === 'lewat' ? -1 : b === 'lewat' ? 1 : filter === 'riwayat' ? b.localeCompare(a) : a.localeCompare(b));
  }, [tampil, now.tgl, filter]);
  const salesList = [...new Set((d?.rows || []).map(r => r.sales).filter(Boolean))].sort();
  const pimpinan = me && ['manager', 'ceo'].includes(me.role);

  function bukaBaru() {
    setSheet({ mode: 'baru', f: { lead_code: '', jenis: 'Site visit', lokasi: '', tgl: geser(now.tgl || new Date().toISOString().slice(0, 10), 1), jam: '10:00', peserta: '', catatan: '' } });
  }
  const leadPilih = sheet?.mode === 'baru' ? (d?.leads || []).find(l => l.lead_code === sheet.f.lead_code) : null;
  const opsiLokasi = p => (d?.lokasi?.[p] || []);
  const bentrok = sheet?.mode === 'baru' || sheet?.mode === 'reschedule'
    ? (d?.rows || []).filter(r => r.status === 'Terjadwal' && r.tgl === sheet.f.tgl && r.sales === (sheet.j?.sales || me?.name) && r.id !== sheet.j?.id) : [];

  async function kirim() {
    const { mode, j, f } = sheet;
    setBusy(true);
    try {
      if (mode === 'baru') await api('/api/janjian', { method: 'POST', body: JSON.stringify(f) });
      else await api('/api/janjian', { method: 'PATCH', body: JSON.stringify({ aksi: mode, id: j.id, ...f }) });
      toast({ baru: 'Janjian disimpan — status lead jadi Appointment', reschedule: 'Jadwal baru disimpan', batal: 'Pembatalan dicatat', datang: 'Hasil visit disimpan — status lead jadi Site Visit' }[mode]);
      setSheet(null); await muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  const setF = patch => setSheet({ ...sheet, f: { ...sheet.f, ...patch } });

  return (
    <>
      <Toast />
      <div className="page-head"><div><h1>Janjian</h1>
        <div className="sub">Rencana visit konsumen — buat janjian, reschedule, batal, atau catat hasil kedatangan</div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {me?.role === 'manager' && <button className="sort-btn" onClick={() => setAtur(JSON.parse(JSON.stringify(d?.lokasi || {})))}>⚙ Lokasi per project</button>}
          {me?.role === 'sales' && <button className="btn btn-primary" onClick={bukaBaru}>+ Janjian baru</button>}
        </div>
      </div>

      {atur && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Pilihan lokasi janjian per project <span className="hint">(satu lokasi per baris)</span></h3>
          <div className="form-grid">{Object.keys(atur).map(p => (
            <div className="field" key={p}><label>{p}</label><textarea rows={4} value={(atur[p] || []).join('\n')} onChange={e => setAtur({ ...atur, [p]: e.target.value.split('\n') })} /></div>))}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" onClick={async () => { try { await api('/api/janjian', { method: 'PATCH', body: JSON.stringify({ aksi: 'atur_lokasi', data: atur }) }); toast('Lokasi disimpan'); setAtur(null); muat(); } catch (e) { toast(e.message); } }}>Simpan</button>
            <button className="sort-btn" onClick={() => setAtur(null)}>Batal</button>
          </div>
        </div>)}

      {sheet && (
        <div className="card jj-sheet">
          {sheet.mode === 'baru' && (<>
            <h3 style={{ marginTop: 0 }}>Janjian visit baru</h3>
            <div className="form-grid">
              <div className="field full"><label>Lead</label>
                <select value={sheet.f.lead_code} onChange={e => { const l = (d.leads || []).find(x => x.lead_code === e.target.value); setF({ lead_code: e.target.value, lokasi: l ? (opsiLokasi(l.project)[0] || '') : '' }); }}>
                  <option value="">— pilih lead aktif Anda —</option>{(d.leads || []).map(l => <option key={l.lead_code} value={l.lead_code}>{l.lead_code} — {l.nama} ({l.status})</option>)}</select>
                {leadPilih && <span className="hint">{leadPilih.project} · status sekarang {leadPilih.status}</span>}</div>
              <div className="field"><label>Jenis janjian</label>
                <select value={sheet.f.jenis} onChange={e => setF({ jenis: e.target.value, lokasi: e.target.value === 'Online meeting' ? 'Online' : e.target.value === 'Ketemu di luar' ? '' : (opsiLokasi(leadPilih?.project)[0] || '') })}>
                  {(d.JENIS || []).map(x => <option key={x}>{x}</option>)}</select></div>
              <div className="field"><label>Lokasi</label>
                {sheet.f.jenis === 'Ketemu di luar'
                  ? <input value={sheet.f.lokasi} onChange={e => setF({ lokasi: e.target.value })} placeholder="mis. kantor konsumen / kafe" />
                  : sheet.f.jenis === 'Online meeting'
                    ? <input value={sheet.f.lokasi} onChange={e => setF({ lokasi: e.target.value })} placeholder="Online (Zoom / Meet / video call WA)" />
                    : <select value={sheet.f.lokasi} onChange={e => setF({ lokasi: e.target.value })}>
                        <option value="">— pilih —</option>{opsiLokasi(leadPilih?.project).map(x => <option key={x}>{x}</option>)}</select>}
                {!leadPilih && sheet.f.jenis !== 'Ketemu di luar' && sheet.f.jenis !== 'Online meeting' && <span className="hint">Pilih lead dulu — lokasi mengikuti project lead</span>}</div>
              <div className="field"><label>Tanggal</label><input type="date" value={sheet.f.tgl} onChange={e => setF({ tgl: e.target.value })} /></div>
              <div className="field"><label>Jam</label><input type="time" value={sheet.f.jam} onChange={e => setF({ jam: e.target.value })} /></div>
              <div className="field full"><b className="jj-waktu">{tglPanjang(sheet.f.tgl)}{sheet.f.jam ? ' · pukul ' + jamTitik(sheet.f.jam) : ''}</b>
                {bentrok.length > 0 && <span className="hint" style={{ color: 'var(--brass-deep)' }}>Anda sudah punya {bentrok.length} janjian di hari itu ({bentrok.map(x => jamTitik(x.jam)).join(', ')})</span>}</div>
              <div className="field"><label>Yang datang</label><input value={sheet.f.peserta} onChange={e => setF({ peserta: e.target.value })} placeholder="mis. konsumen + pasangan" /></div>
              <div className="field"><label>Catatan</label><input value={sheet.f.catatan} onChange={e => setF({ catatan: e.target.value })} placeholder="mis. mau lihat Tipe B hoek" /></div>
            </div>
            <div className="note" style={{ margin: '10px 0' }}>Setelah disimpan, status lead otomatis menjadi <b>Appointment</b>, janjian masuk riwayat follow up, pengingat muncul di lonceng H-1 &amp; hari H, dan tampil di beranda Manager &amp; CEO.</div>
          </>)}

          {sheet.mode === 'reschedule' && (<>
            <h3 style={{ marginTop: 0 }}>Reschedule janjian · {sheet.j.nama}</h3>
            <div className="jj-lama">Jadwal lama: <s>{tglPanjang(sheet.j.tgl)} · {jamTitik(sheet.j.jam)}</s></div>
            <div className="form-grid">
              <div className="field"><label>Tanggal baru</label><input type="date" value={sheet.f.tgl} onChange={e => setF({ tgl: e.target.value })} /></div>
              <div className="field"><label>Jam baru</label><input type="time" value={sheet.f.jam} onChange={e => setF({ jam: e.target.value })} /></div>
              <div className="field full"><b className="jj-waktu">{tglPanjang(sheet.f.tgl)}{sheet.f.jam ? ' · pukul ' + jamTitik(sheet.f.jam) : ''}</b>
                {bentrok.length > 0 && <span className="hint" style={{ color: 'var(--brass-deep)' }}>Sudah ada {bentrok.length} janjian lain di hari itu ({bentrok.map(x => jamTitik(x.jam)).join(', ')})</span>}</div>
              <div className="field full"><label>Alasan reschedule</label><textarea rows={2} value={sheet.f.alasan} onChange={e => setF({ alasan: e.target.value })} placeholder="tulis alasan dari konsumen / sales" /></div>
            </div>
          </>)}

          {sheet.mode === 'batal' && (<>
            <h3 style={{ marginTop: 0 }}>Batal datang · {sheet.j.nama}</h3>
            <div className="jj-lama">{tglPanjang(sheet.j.tgl)} · {jamTitik(sheet.j.jam)} · {sheet.j.jenis}</div>
            <div className="form-grid">
              <div className="field full"><label>Alasan batal</label><textarea rows={2} value={sheet.f.alasan} onChange={e => setF({ alasan: e.target.value })} placeholder="tulis alasan konsumen batal datang" /></div>
              <div className="field full"><label>Lanjutan lead</label>
                <div className="kp-seg"><button aria-pressed={sheet.f.lanjut !== 'drop'} onClick={() => setF({ lanjut: 'fu' })}>Tetap follow up</button><button aria-pressed={sheet.f.lanjut === 'drop'} onClick={() => setF({ lanjut: 'drop' })}>Tandai Drop</button></div></div>
            </div>
          </>)}

          {sheet.mode === 'datang' && (<>
            <h3 style={{ marginTop: 0 }}>Konsumen datang ✓ · {sheet.j.nama}</h3>
            <div className="jj-lama">{tglPanjang(sheet.j.tgl)} · {jamTitik(sheet.j.jam)} · {sheet.j.jenis}</div>
            <div className="form-grid">
              <div className="field"><label>Jam datang</label><input type="time" value={sheet.f.jam_datang} onChange={e => setF({ jam_datang: e.target.value })} /></div>
              <div className="field"><label>Unit dilihat</label><input value={sheet.f.unit_dilihat} onChange={e => setF({ unit_dilihat: e.target.value })} placeholder="mis. Tipe B hoek" /></div>
              <div className="field full"><label>Hasil visit</label>
                <div className="kp-seg">{(d.HASIL || []).map(x => <button key={x} aria-pressed={sheet.f.hasil === x} onClick={() => setF({ hasil: x })}>{x}</button>)}</div></div>
              <div className="field full"><label>Catatan</label><textarea rows={2} value={sheet.f.catatan} onChange={e => setF({ catatan: e.target.value })} /></div>
            </div>
            <div className="note" style={{ margin: '10px 0' }}>Status lead otomatis menjadi <b>Site Visit</b>; catatan masuk riwayat follow up.</div>
          </>)}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn btn-primary" disabled={busy} onClick={kirim} style={sheet.mode === 'batal' ? { background: 'var(--red)' } : undefined}>
              {{ baru: 'Simpan janjian', reschedule: 'Simpan jadwal baru', batal: 'Simpan pembatalan', datang: 'Simpan hasil visit' }[sheet.mode]}</button>
            <button className="sort-btn" onClick={() => setSheet(null)}>Tutup</button>
          </div>
        </div>)}

      <div className="fu-toolbar">
        {[['hari', 'Hari ini'], ['7', '7 hari ke depan'], ['update', 'Perlu update'], ['riwayat', 'Riwayat']].map(([k, l]) => (
          <button key={k} className={'sort-btn' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)} style={k === 'update' && jml.update ? { color: filter === k ? undefined : 'var(--red)' } : undefined}>
            {l}{jml[k] != null ? ` (${jml[k]})` : ''}</button>))}
        {pimpinan && <select className="sort-filter" value={fSales} onChange={e => setFSales(e.target.value)}><option value="">Semua sales</option>{salesList.map(s => <option key={s}>{s}</option>)}</select>}
      </div>

      {!d ? <div className="loading">Memuat…</div> : !grup.length ? <p className="hint">Tidak ada janjian di kelompok ini.</p> : grup.map(([k, list]) => (
        <div key={k} className="jj-grup">
          <div className="jj-hari">{k === 'lewat' ? 'Lewat & belum di-update' : (k === now.tgl ? 'Hari ini · ' : k === geser(now.tgl, 1) ? 'Besok · ' : '') + tglPanjang(k)}</div>
          {list.map(j => (
            <div key={j.id} className={'jj-card' + (j.perlu_update ? ' telat' : '')}>
              <div className="jj-jam">{jamTitik(j.jam)}<span>{j.perlu_update ? 'lewat' : tglPendek(j.tgl).slice(0, 3)}</span></div>
              <div className="jj-isi">
                <div className="bd-head"><Link href={'/leads?lead=' + encodeURIComponent(j.lead_code)} className="jj-nama" title="Buka riwayat lead">{j.nama || j.lead_code} ›</Link><Status j={j} /></div>
                {/* Asal lead: kode, sumber, campaign, penginput, status — klik nama untuk riwayat lengkap */}
                <div className="jj-asal">
                  <Link href={'/leads?lead=' + encodeURIComponent(j.lead_code)}>{j.lead_code}</Link>
                  {[j.lead_sumber, j.lead_campaign ? 'campaign ' + j.lead_campaign : '',
                    j.penginput ? 'diinput ' + j.penginput + (j.penginput_role === 'markom' ? ' (Marcom)' : j.penginput_role === 'sales' ? ' (Sales)' : j.penginput_role === 'manager' ? ' (Manager)' : '') : '',
                    j.lead_tgl ? 'masuk ' + tglPendek(j.lead_tgl) : '', j.lead_status ? 'status ' + j.lead_status : ''].filter(Boolean).map(x => <span key={x}> · {x}</span>)}
                </div>
                <div className="hint">{[j.jenis, j.lokasi, j.project, pimpinan ? j.sales : '', j.peserta].filter(Boolean).join(' · ')}</div>
                {j.perlu_update && <div className="jj-ket merah">Jam janjian sudah lewat — isi hasilnya: datang, reschedule, atau batal</div>}
                {j.reschedule_n > 0 && j.status === 'Terjadwal' && (() => { const r = (j.log || []).find(x => x.aksi === 'Reschedule'); return r ? <div className="jj-ket emas">{r.isi}</div> : null; })()}
                {j.status === 'Batal' && <div className="jj-ket merah">Alasan: {j.batal_alasan}{j.lanjut === 'drop' ? ' · lead Drop' : ' · tetap follow up'}</div>}
                {j.status === 'Datang' && <div className="jj-ket hijau">{[j.unit_dilihat, j.hasil, j.hasil_catatan].filter(Boolean).join(' · ') || 'Konsumen datang'}</div>}
                {j.catatan && j.status === 'Terjadwal' && <div className="hint">Catatan: {j.catatan}</div>}
                {j.status === 'Terjadwal' && (me?.role === 'sales' || me?.role === 'manager' || me?.role === 'ceo') && (
                  <div className="jj-aksi">
                    <button className="d" onClick={() => setSheet({ mode: 'datang', j, f: { jam_datang: now.tgl === j.tgl ? now.jam : j.jam, unit_dilihat: '', hasil: '', catatan: '' } })}>Datang</button>
                    <button onClick={() => setSheet({ mode: 'reschedule', j, f: { tgl: j.tgl, jam: j.jam, alasan: '' } })}>Reschedule</button>
                    <button onClick={() => setSheet({ mode: 'batal', j, f: { alasan: '', lanjut: 'fu' } })}>Batal</button>
                    {j.wa && <button onClick={() => bukaWA(j.wa, `Halo ${j.nama || ''}, mengingatkan janjian ${j.jenis.toLowerCase()} ${tglPanjang(j.tgl)} pukul ${jamTitik(j.jam)} di ${j.lokasi}. Sampai bertemu 🙏`)}>Ingatkan via WA</button>}
                  </div>)}
                {(j.log || []).length > 1 && <details className="jj-log"><summary>Riwayat ({j.log.length})</summary>
                  {j.log.map((x, i) => <div key={i}><b>{x.aksi}</b> · {new Date(x.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {x.oleh}<div className="hint">{x.isi}</div></div>)}</details>}
              </div>
            </div>))}
        </div>))}
    </>
  );
}
