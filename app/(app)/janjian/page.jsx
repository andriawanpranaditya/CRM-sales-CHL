'use client';
import React, { useEffect, useMemo, useState } from 'react';
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
  const [filter, setFilter] = useState('visitor');
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (['visitor', 'janji', 'update', 'rekap', 'riwayat'].includes(t)) setFilter(t === 'terbaru' ? 'riwayat' : t); }, []);
  const [fSales, setFSales] = useState('');
  const [sheet, setSheet] = useState(null); // { mode: 'baru'|'reschedule'|'batal'|'datang', j, f }
  const [atur, setAtur] = useState(null);
  const [busy, setBusy] = useState(false);
  const muat = () => api('/api/janjian').then(setD).catch(e => toast(e.message));
  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => {}); muat(); }, []);

  const now = d?.now || { tgl: '', jam: '' };
  const rows = (d?.rows || []).filter(r => !fSales || r.sales === fSales);
  const tampil = useMemo(() => {
    if (filter === 'janji') return rows.filter(r => r.jenis !== 'Datang tanpa janji' && (r.tgl === now.tgl || r.perlu_update || (r.tgl > now.tgl && r.tgl <= geser(now.tgl, 7) && r.status === 'Terjadwal')));
    if (filter === 'update') return rows.filter(r => r.perlu_update);
    return rows.filter(r => r.tgl < now.tgl || r.status !== 'Terjadwal').sort((a, b) => (b.tgl + b.jam).localeCompare(a.tgl + a.jam));
  }, [rows, filter, now.tgl]); // eslint-disable-line
  const jml = {
    janji: rows.filter(r => r.jenis !== 'Datang tanpa janji' && r.status === 'Terjadwal' && r.tgl >= now.tgl && r.tgl <= geser(now.tgl, 7) && !r.perlu_update).length,
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
      <div className="page-head"><div><h1>Janjian &amp; Visitor</h1>
        <div className="sub">Daily visitor marketing gallery dan janji temu konsumen — buat janji, reschedule, batal, catat kedatangan</div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {me?.role === 'manager' && <button className="sort-btn" onClick={() => setAtur(JSON.parse(JSON.stringify(d?.lokasi || {})))}>⚙ Lokasi per project</button>}
          {me && me.role !== 'admin' && <button className="btn btn-primary" onClick={bukaBaru}>+ Janjian baru</button>}
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
                  <option value="">{me?.role === 'sales' ? '— pilih lead aktif Anda —' : '— pilih lead —'}</option>{(d.leads || []).map(l => <option key={l.lead_code} value={l.lead_code}>{l.lead_code} — {l.nama}{l.sales && me?.role !== 'sales' ? ' · ' + l.sales : ''} ({l.status})</option>)}</select>
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
        {[['visitor', 'Daily visitor'], ['janji', 'Janji temu'], ['update', 'Perlu update'], ['riwayat', 'Riwayat & update'], ['rekap', 'Rekap bulan ini']].map(([k, l]) => (
          <button key={k} className={'sort-btn' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)} style={k === 'update' && jml.update ? { color: filter === k ? undefined : 'var(--red)' } : undefined}>
            {l}{jml[k] != null ? ` (${jml[k]})` : ''}</button>))}
        {pimpinan && <select className="sort-filter" value={fSales} onChange={e => setFSales(e.target.value)}><option value="">Semua sales</option>{salesList.map(s => <option key={s}>{s}</option>)}</select>}
      </div>

      {filter === 'visitor' && <TabVisitor me={me} fSales={fSales} />}
      {filter === 'rekap' && <TabRekap mode={filter} fSales={fSales} />}
      {filter === 'riwayat' && <TabRiwayat me={me} fSales={fSales} />}
      {['visitor', 'rekap', 'riwayat'].includes(filter) ? null : !d ? <div className="loading">Memuat…</div> : !grup.length ? <p className="hint">Tidak ada janjian di kelompok ini.</p> : grup.map(([k, list]) => (
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
                  {[[j.lead_sumber, j.lead_walkin ? 'via ' + j.lead_walkin : '', j.lead_sumber_detail ? '(' + j.lead_sumber_detail + ')' : ''].filter(Boolean).join(' '), j.lead_campaign ? 'campaign ' + j.lead_campaign : '',
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

// ===== Tab Daily visitor =====
const WARNA_ST = { Booking: 'kp-done', Reserved: 'kp-ok', Datang: 'kp-ok', 'Walk in': 'kp-wait', 'Akan datang': 'kp-run', 'Perlu update': 'kp-no' };
function TabVisitor({ me, fSales }) {
  const [tgl, setTgl] = useState('');
  const [v, setV] = useState(null);
  const [catat, setCatat] = useState(null);
  const [leadsAll, setLeadsAll] = useState(null);
  const [busy, setBusy] = useState(false);
  const muat = (t = tgl) => api('/api/janjian?visitor=' + (t || 'hari')).then(x => { setV(x); if (!t) setTgl(x.tgl); }).catch(e => toast(e.message));
  useEffect(() => { muat(); }, []); // eslint-disable-line
  const ganti = t => { setTgl(t); setV(null); muat(t); };
  const rows = (v?.rows || []).filter(r => !fSales || r.sales === fSales);
  const datang = rows.filter(r => r.hitung);
  const rk = { total: datang.length, janji: datang.filter(r => r.kategori === 'janji').length, walkin: datang.filter(r => r.kategori === 'walkin').length,
    tanpa: datang.filter(r => r.kategori === 'tanpa').length, trx: datang.filter(r => r.kategori === 'trx').length,
    akan: rows.filter(r => !r.hitung && r.status === 'Akan datang').length, update: rows.filter(r => !r.hitung && r.status === 'Perlu update').length };
  const maks = Math.max(1, ...(v?.spark || []).map(x => x.n));
  const bukaCatat = async () => {
    setCatat({ lead_code: '', jam_datang: v?.now?.jam || '', unit_dilihat: '', catatan: '' });
    if (me?.role !== 'sales' && !leadsAll) api('/api/leads').then(ls => setLeadsAll(ls.filter(l => !['Closing', 'Drop', 'Lost'].includes(l.status)))).catch(() => setLeadsAll([]));
  };
  const pilihan = me?.role === 'sales' ? (v?.leads || []) : (leadsAll || []);
  const hariIni = v && tgl === v.now?.tgl;
  return (<>
    <div className="jj-kpi">
      <div className="card"><span className="hint">Visitor {hariIni ? 'hari ini' : tglPendek(tgl)}</span><b className="jj-besar">{rk.total}</b>
        <div className="bd-chips kp">{rk.janji ? <span className="kp-pill sm kp-ok">{rk.janji} janji temu</span> : null}{rk.walkin ? <span className="kp-pill sm kp-wait">{rk.walkin} walk in</span> : null}
          {rk.tanpa ? <span className="kp-pill sm kp-wait">{rk.tanpa} tanpa janji</span> : null}{rk.trx ? <span className="kp-pill sm kp-done">{rk.trx} Reserved/Booking</span> : null}</div></div>
      <div className="card"><span className="hint">Akan datang</span><b className="jj-besar">{rk.akan}</b><span className="hint">janji temu yang belum tiba</span></div>
      <div className="card"><span className="hint">Perlu update</span><b className="jj-besar" style={{ color: rk.update ? 'var(--red)' : undefined }}>{rk.update}</b><span className="hint">jam lewat, hasil belum diisi</span></div>
      <div className="card"><span className="hint">7 hari terakhir</span>
        <div className="bd-spark">{(v?.spark || []).map(x => <i key={x.tgl} title={`${x.hari} ${x.tgl.slice(8, 10)}/${x.tgl.slice(5, 7)}: ${x.n}`} style={{ height: Math.max(6, Math.round(x.n / maks * 100)) + '%', background: ['Sabtu', 'Minggu'].includes(x.hari) ? 'var(--gold)' : 'var(--green)' }} />)}</div>
        <span className="hint">{(v?.spark || []).reduce((a, x) => a + x.n, 0)} visitor</span></div>
    </div>

    <div className="card" style={{ marginTop: 12 }}>
      <div className="bd-head" style={{ flexWrap: 'wrap', gap: 8 }}><h3 style={{ margin: 0 }}>Daily visitor · {tglPanjang(tgl)}</h3>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="sort-btn" onClick={() => ganti(geser(tgl, -1))}>‹ Sebelumnya</button>
          {!hariIni && v && <button className="sort-btn" onClick={() => ganti(v.now.tgl)}>Hari ini</button>}
          {!hariIni && <button className="sort-btn" onClick={() => ganti(geser(tgl, 1))}>Berikutnya ›</button>}
          <input type="date" className="sort-filter" value={tgl} onChange={e => e.target.value && ganti(e.target.value)} style={{ width: 'auto' }} />
          {hariIni && me && me.role !== 'admin' && <button className="btn btn-primary" style={{ width: 'auto', padding: '9px 14px' }} onClick={bukaCatat}>+ Catat visitor tanpa janji temu</button>}
        </span></div>

      {catat && (<div className="jj-sheet card" style={{ margin: '10px 0' }}>
        <h3 style={{ marginTop: 0 }}>Visitor datang tanpa janji temu</h3>
        <div className="form-grid">
          <div className="field full"><label>Lead</label><select value={catat.lead_code} onChange={e => setCatat({ ...catat, lead_code: e.target.value })}>
            <option value="">{pilihan.length || me?.role === 'sales' ? '— pilih lead —' : 'Memuat lead…'}</option>
            {pilihan.map(l => <option key={l.lead_code} value={l.lead_code}>{l.lead_code} — {l.nama}{l.sales && me?.role !== 'sales' ? ' · ' + l.sales : ''} ({l.status})</option>)}</select>
            <span className="hint">Lead baru Walk In tidak perlu dicatat di sini — sudah otomatis masuk dari Form Input.</span></div>
          <div className="field"><label>Jam datang</label><input type="time" value={catat.jam_datang} onChange={e => setCatat({ ...catat, jam_datang: e.target.value })} /></div>
          <div className="field"><label>Unit dilihat</label><input value={catat.unit_dilihat} onChange={e => setCatat({ ...catat, unit_dilihat: e.target.value })} placeholder="mis. Tipe B hoek" /></div>
          <div className="field full"><label>Catatan</label><input value={catat.catatan} onChange={e => setCatat({ ...catat, catatan: e.target.value })} placeholder="hasil kunjungan" /></div>
        </div>
        <div className="note" style={{ margin: '10px 0' }}>Status lead otomatis menjadi <b>Site Visit</b> dan tercatat di riwayat follow up.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy || !catat.lead_code} onClick={async () => {
            setBusy(true);
            try { await api('/api/janjian', { method: 'POST', body: JSON.stringify({ aksi: 'visitor', ...catat }) }); toast('Visitor dicatat'); setCatat(null); muat(); }
            catch (e) { toast(e.message); } finally { setBusy(false); }
          }}>Simpan visitor</button>
          <button className="sort-btn" onClick={() => setCatat(null)}>Batal</button>
        </div></div>)}

      {!v ? <div className="loading">Memuat…</div> : rows.length ? (
        <div className="tbl-wrap tbl-compact jj-vtbl"><table>
          <thead><tr><th>Jam</th><th>Visitor</th><th>Sales</th><th>Asal kedatangan</th><th>Lead (sumber · campaign)</th><th>Catatan / hasil</th><th>Status</th></tr></thead>
          <tbody>{rows.map(r => (<tr key={r.tgl + r.lead_code}>
            <td data-label="Jam"><b>{jamTitik(r.jam) || '—'}</b></td>
            <td data-label="Visitor"><Link href={'/leads?lead=' + encodeURIComponent(r.lead_code)} className="jj-nama">{r.nama || r.lead_code}</Link><span className="sub2">{r.lead_code}</span></td>
            <td data-label="Sales">{r.sales || '—'}</td>
            <td data-label="Asal kedatangan">{r.asalTeks}</td>
            <td data-label="Lead">{[r.sumber, r.walkin_info ? 'via ' + r.walkin_info : '', r.campaign].filter(Boolean).join(' · ') || '—'}</td>
            <td data-label="Catatan / hasil">{r.catatanTeks || '—'}</td>
            <td data-label="Status"><span className={'kp-pill sm ' + (WARNA_ST[r.status] || 'kp-run')} style={{ whiteSpace: 'nowrap' }}>{r.status}</span>
              {me?.role === 'manager' && r.janjianId && r.kategori !== 'trx' && r.kategori !== 'walkin' && <button className="sort-btn" style={{ marginLeft: 6, padding: '2px 8px' }} title="Hapus catatan janji temu / kedatangan ini (salah catat)"
                onClick={async () => { if (!confirm(`Hapus catatan kedatangan ${r.nama || r.lead_code} pada ${tglPendek(r.tgl)}?\nDipakai bila tercatat keliru. Tidak bisa dibatalkan.`)) return;
                  try { await api('/api/janjian?id=' + r.janjianId, { method: 'DELETE' }); toast('Catatan dihapus'); muat(); } catch (e) { toast(e.message); } }}>🗑</button>}</td>
          </tr>))}</tbody></table></div>)
        : <p className="hint" style={{ marginTop: 10 }}>Belum ada visitor maupun janji temu di tanggal ini.</p>}
      <p className="hint" style={{ marginTop: 8 }}>Visitor = janji temu yang datang, lead baru Walk In, datang tanpa janji, dan konsumen Reserved/Booking hari itu. Satu orang dihitung sekali per hari.</p>
    </div>
  </>);
}

// ===== Tab Update terbaru & Rekap bulan ini =====
function TabRekap({ mode, fSales }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('/api/janjian?rekap=1').then(setD).catch(e => toast(e.message)); }, []);
  if (!d) return <div className="loading">Memuat…</div>;
  const terbaru = d.terbaru.filter(x => !fSales || x.sales === fSales);
  if (mode === 'terbaru') return (
    <div className="card">
      <div className="bd-head"><h3 style={{ margin: 0 }}>Update janji temu terbaru</h3><span className="hint">7 hari terakhir · terbaru di atas</span></div>
      {terbaru.length ? <div className="tbl-wrap tbl-compact jj-vtbl" style={{ marginTop: 8 }}><table>
        <thead><tr><th>Diperbarui</th><th>Lead</th><th>Sales</th><th>Janji temu</th><th>Hasil</th><th>Catatan / alasan</th></tr></thead>
        <tbody>{terbaru.map((x, i) => (<tr key={i}>
          <td data-label="Diperbarui">{new Date(x.waktu).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}<span className="sub2">{x.oleh}</span></td>
          <td data-label="Lead"><Link href={'/leads?lead=' + encodeURIComponent(x.lead_code)} className="jj-nama">{x.nama || x.lead_code}</Link><span className="sub2">{x.project}</span></td>
          <td data-label="Sales">{x.sales}</td>
          <td data-label="Janji temu">{x.jenis}<span className="sub2">{tglPendek(x.tgl)} {jamTitik(x.jam)}{x.lokasi ? ' · ' + x.lokasi : ''}</span></td>
          <td data-label="Hasil"><span className={'kp-pill sm ' + (x.aksi === 'Datang' ? 'kp-ok' : x.aksi === 'Batal' ? 'kp-no' : 'kp-wait')} style={{ whiteSpace: 'nowrap' }}>{x.aksi}</span></td>
          <td data-label="Catatan / alasan">{x.isi || '—'}</td></tr>))}</tbody></table></div>
        : <p className="hint">Belum ada hasil janji temu 7 hari terakhir.</p>}
    </div>);
  const ps = d.perSales.filter(x => !fSales || x.sales === fSales);
  const maks = Math.max(1, ...d.depan.map(x => x.n));
  const vis = d.visitor;
  return (<div className="jj-rekap">
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Janji temu bulan ini</h3>
      <div className="bd-chips"><span>Total <b>{d.bulan.n}</b></span><span>Datang <b>{d.bulan.datang}{d.bulan.n ? ` (${Math.round(d.bulan.datang / d.bulan.n * 100)}%)` : ''}</b></span><span>Reschedule <b>{d.bulan.resch}</b></span><span>Batal <b>{d.bulan.batal}</b></span></div>
      <p className="hint" style={{ margin: '8px 0' }}>Visitor bulan ini: <b>{vis.total}</b> (janji temu {vis.janji} · walk in {vis.walkin} · tanpa janji {vis.tanpa} · Reserved/Booking {vis.trx})</p>
      <div className="jj-bar">{d.depan.map(x => (<div key={x.tgl}><i style={{ height: Math.round(x.n / maks * 100) + '%', background: ['Sabtu', 'Minggu'].includes(x.hari) ? 'var(--gold)' : 'var(--side-active-bg)' }} /><span>{x.hari.slice(0, 3)} {x.n}</span></div>))}</div>
      <span className="hint">Janji temu terjadwal 7 hari ke depan · akhir pekan ditandai emas</span>
    </div>
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Per sales bulan ini</h3>
      {ps.length ? <div className="bd-tbl"><table><thead><tr><th>Sales</th><th className="num">Janji</th><th className="num">Datang</th><th className="num">Resch.</th><th className="num">Batal</th><th className="num">Visitor</th></tr></thead>
        <tbody>{ps.map(x => <tr key={x.sales}><td>{x.sales}</td><td className="num">{x.janji}</td><td className="num">{x.datang}</td><td className="num">{x.resch}</td><td className="num">{x.batal}</td><td className="num"><b>{x.visitor}</b></td></tr>)}</tbody></table></div>
        : <p className="hint">Belum ada data bulan ini.</p>}
      {d.alasanBatal.length > 0 && <p className="hint" style={{ marginTop: 8 }}>Alasan batal terbaru: {d.alasanBatal.map(a => `${a.nama} (${a.sales}): ${a.alasan}`).join(' · ')}</p>}
    </div>
  </div>);
}

// ===== Tab Riwayat & update: semua janji temu + visitor per bulan, lengkap dengan status & riwayat perubahannya =====
const NAMA_BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const WARNA_JJ = { Terjadwal: 'kp-run', Datang: 'kp-ok', Batal: 'kp-no', 'Perlu update': 'kp-no' };
function TabRiwayat({ me, fSales }) {
  const kini = new Date();
  const [bln, setBln] = useState(`${kini.getFullYear()}-${String(kini.getMonth() + 1).padStart(2, '0')}`);
  const [d, setD] = useState(null);
  const [buka, setBuka] = useState(null);
  const [fSt, setFSt] = useState('');
  const pilihan = []; for (let i = 0; i < 12; i++) { const t = new Date(kini.getFullYear(), kini.getMonth() - i, 1); pilihan.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`); }
  useEffect(() => {
    setD(null);
    const [y, m] = bln.split('-').map(Number); const akhir = new Date(y, m, 0).getDate();
    api(`/api/janjian?dari=${bln}-01&sampai=${bln}-${String(akhir).padStart(2, '0')}`).then(setD).catch(e => toast(e.message));
  }, [bln]);
  const labelBln = b => { const [y, m] = b.split('-'); return `${NAMA_BLN[Number(m) - 1]} ${y}`; };
  if (!d) return <div className="loading">Memuat…</div>;
  const [y, m] = bln.split('-').map(Number); const awal = `${bln}-01`, akhir = `${bln}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  let rows = d.rows.filter(r => r.tgl >= awal && r.tgl <= akhir).filter(r => !fSales || r.sales === fSales);
  const stOf = r => r.perlu_update ? 'Perlu update' : r.status;
  const n = { semua: rows.length, Datang: rows.filter(r => r.status === 'Datang').length, Terjadwal: rows.filter(r => r.status === 'Terjadwal' && !r.perlu_update).length, 'Perlu update': rows.filter(r => r.perlu_update).length, Batal: rows.filter(r => r.status === 'Batal').length, Reschedule: rows.filter(r => r.reschedule_n > 0).length };
  if (fSt === 'Reschedule') rows = rows.filter(r => r.reschedule_n > 0); else if (fSt) rows = rows.filter(r => stOf(r) === fSt);
  rows = [...rows].sort((a, b) => (b.tgl + b.jam).localeCompare(a.tgl + a.jam));
  const ket = r => {
    if (r.status === 'Datang') return [r.jam_datang ? 'datang ' + jamTitik(r.jam_datang) : '', r.unit_dilihat, r.hasil, r.hasil_catatan].filter(Boolean).join(' · ');
    if (r.status === 'Batal') return (r.batal_alasan || '') + (r.lanjut === 'drop' ? ' · lead Drop' : ' · tetap follow up');
    const rs = (r.log || []).find(x => x.aksi === 'Reschedule');
    return [rs ? rs.isi : '', r.peserta, r.catatan].filter(Boolean).join(' · ');
  };
  return (
    <div className="card">
      <div className="bd-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Riwayat &amp; update · {labelBln(bln)}</h3>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="sort-filter" value={bln} onChange={e => setBln(e.target.value)}>{pilihan.map(b => <option key={b} value={b}>{labelBln(b)}</option>)}</select>
          <select className="sort-filter" value={fSt} onChange={e => setFSt(e.target.value)}>
            <option value="">Semua status ({n.semua})</option><option value="Datang">Datang ({n.Datang})</option><option value="Terjadwal">Terjadwal ({n.Terjadwal})</option>
            <option value="Perlu update">Perlu update ({n['Perlu update']})</option><option value="Batal">Batal ({n.Batal})</option><option value="Reschedule">Pernah reschedule ({n.Reschedule})</option></select>
        </span></div>
      <div className="bd-chips kp" style={{ margin: '8px 0' }}>
        <span className="kp-pill sm kp-ok">{n.Datang} datang</span><span className="kp-pill sm kp-run">{n.Terjadwal} terjadwal</span><span className="kp-pill sm kp-no">{n['Perlu update']} perlu update</span><span className="kp-pill sm kp-no">{n.Batal} batal</span><span className="kp-pill sm kp-wait">{n.Reschedule} pernah reschedule</span></div>
      {rows.length ? <div className="tbl-wrap tbl-compact jj-vtbl"><table>
        <thead><tr><th>Tanggal · jam</th><th>Lead · project</th><th>Sales</th><th>Jenis · lokasi</th><th>Status</th><th>Keterangan / hasil / alasan</th><th>Riwayat</th></tr></thead>
        <tbody>{rows.map(r => (<React.Fragment key={r.id}>
          <tr>
            <td data-label="Tanggal"><b>{tglPendek(r.tgl)}</b><span className="sub2">{r.hari ? r.hari + ' · ' : ''}{jamTitik(r.jam)}{r.reschedule_n ? ` · reschedule ${r.reschedule_n}×` : ''}</span></td>
            <td data-label="Lead"><Link href={'/leads?lead=' + encodeURIComponent(r.lead_code)} className="jj-nama">{r.nama || r.lead_code}</Link><span className="sub2">{r.lead_code} · {r.project}</span></td>
            <td data-label="Sales">{r.sales || '—'}</td>
            <td data-label="Jenis">{r.jenis}<span className="sub2">{r.lokasi}</span></td>
            <td data-label="Status"><span className={'kp-pill sm ' + (WARNA_JJ[stOf(r)] || 'kp-wait')} style={{ whiteSpace: 'nowrap' }}>{stOf(r)}</span></td>
            <td data-label="Keterangan">{ket(r) || '—'}</td>
            <td data-label="Riwayat"><button className="sort-btn" style={{ padding: '2px 8px' }} onClick={() => setBuka(buka === r.id ? null : r.id)}>{buka === r.id ? '▲' : '▼'} {(r.log || []).length}</button></td>
          </tr>
          {buka === r.id && <tr><td colSpan={7} style={{ background: 'var(--paper)' }}>
            {(r.log || []).length ? (r.log || []).map((x, i) => <div key={i} className="hint" style={{ padding: '2px 0' }}><b style={{ color: 'var(--ink)' }}>{new Date(x.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b> · {x.aksi} · {x.isi}{x.oleh ? ' — ' + x.oleh : ''}</div>) : <span className="hint">Belum ada riwayat.</span>}
          </td></tr>}
        </React.Fragment>))}</tbody></table></div>
        : <p className="hint">Tidak ada janji temu pada {labelBln(bln)}{fSt ? ' dengan status ' + fSt : ''}.</p>}
      <p className="hint" style={{ marginTop: 8 }}>Mencakup semua janji temu bertanggal pada bulan terpilih, termasuk kedatangan tanpa janji. Klik ▼ untuk melihat riwayat perubahan (dibuat, reschedule, datang, batal) beserta pengubahnya.</p>
    </div>
  );
}
