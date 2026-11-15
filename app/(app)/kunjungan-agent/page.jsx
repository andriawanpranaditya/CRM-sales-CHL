'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = t => t ? `${Number(t.slice(8, 10))} ${BLN[Number(t.slice(5, 7)) - 1]}` : '';
const namaBulan = b => b ? `${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][Number(b.slice(5, 7)) - 1]} ${b.slice(0, 4)}` : '';
const CHIP = { Menunggu: 'b-today', Disetujui: 'b-upcoming', Ditolak: 'b-lost' };

export default function KunjunganAgent() {
  const [d, setD] = useState(null), [ed, setEd] = useState(null), [busy, setBusy] = useState(false), [foto, setFoto] = useState(null);
  const muat = () => api('/api/kunjungan-agent').then(setD).catch(e => toast(e.message));
  useEffect(() => { muat(); }, []);
  const aksi = async (body, ok) => { setBusy(true); try { const r = await api('/api/kunjungan-agent', { method: 'POST', body: JSON.stringify(body) }); toast(ok(r)); setEd(null); await muat(); } catch (e) { toast(e.message); } finally { setBusy(false); } };
  if (!d) return <><Toast /><div className="loading">Memuat laporan agent…</div></>;
  const asal = typeof window !== 'undefined' ? window.location.origin : '';
  return (<>
    <Toast />
    <div className="page-head"><div><h1>Kunjungan Agent {d.menunggu ? <span className="badge b-overdue" style={{ fontSize: 12, verticalAlign: 'middle' }}>{d.menunggu} menunggu konfirmasi</span> : null}</h1>
      <div className="sub">Laporan dari agent di bawah lead agent · dicek Manager sebelum masuk sebagai lead &amp; visitor</div></div>
      <a className="sort-btn" href="/api/kunjungan-agent?excel=1">⬇ Excel</a></div>

    <div className="card"><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><b>📥 Laporan masuk</b><span style={{ flex: 1 }} />
      {d.laporan.some(x => x.status === 'Ditolak') && <button className="sort-btn" disabled={busy} onClick={() => { const n = d.laporan.filter(x => x.status === 'Ditolak').length; if (confirm(`Hapus semua riwayat laporan yang ditolak (${n})? Tidak bisa dibatalkan.`)) aksi({ aksi: 'hapus-ditolak', semua: true }, r => `${r.terhapus} riwayat laporan ditolak dihapus`); }}>🗑 Hapus semua yang ditolak</button>}</div>
      {d.laporan.length ? <div><table className="tg-tb lk-tabel" style={{ marginTop: 8 }}><thead><tr><th>Kunjungan</th><th>Konsumen</th><th>Agent</th><th>Lead agent</th><th>Minat</th><th>Foto</th><th>Status</th><th></th></tr></thead>
        <tbody>{d.laporan.map(x => <tr key={x.id}>
          <td style={{ whiteSpace: 'nowrap' }}>{tgl(x.tgl)}{x.jam ? ' ' + x.jam : ''}</td>
          <td><b>{x.konsumen}</b>{x.catatan ? <span className="tg-sub">{x.catatan}</span> : null}
            {(x.dobel || []).map(dd => <span key={dd.lead_code} className="tg-sub" style={{ color: 'var(--red)' }}>⚠ mirip {dd.lead_code} {dd.nama} ({dd.sales || '-'}, {tgl(dd.tgl)})</span>)}</td>
          <td>{x.agent_nama}<span className="tg-sub">{x.agent_kantor} · {x.agent_hp}</span></td>
          <td>{x.lead_agent}<span className="tg-sub">{x.project}</span></td>
          <td>{[x.tipe, x.bayar, x.domisili, x.budget].filter(Boolean).join(' · ') || '—'}</td>
          <td>{x.foto ? <button className="sort-btn" onClick={() => setFoto(x.foto)}>📷 Lihat</button> : <span className="hint">—</span>}</td>
          <td><span className={'badge ' + (CHIP[x.status] || '')}>{x.status}</span>{x.lead_code ? <span className="tg-sub">{x.lead_code}{x.booking ? ' · Booking ✓' : ''}</span> : null}{x.alasan ? <span className="tg-sub">{x.alasan}</span> : null}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{x.status === 'Menunggu' && <>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '4px 10px' }} disabled={busy} onClick={() => aksi({ aksi: 'setujui', id: x.id }, r => `Disetujui — ${r.lead_code} masuk sebagai lead & visitor`)}>Setujui</button>{' '}
            {(x.dobel || []).length > 0 && <button className="sort-btn" disabled={busy} title="Tambahkan kunjungan ke lead yang sudah ada" onClick={() => aksi({ aksi: 'setujui', id: x.id, leadCode: x.dobel[0].lead_code }, () => `Kunjungan ditambahkan ke ${x.dobel[0].lead_code}`)}>Gabung ke {x.dobel[0].lead_code}</button>}{' '}
            <button className="sort-btn" onClick={() => setEd({ ...x })}>Ubah</button>{' '}
            <button className="sort-btn" disabled={busy} onClick={() => { const a = prompt('Alasan menolak laporan ini?'); if (a) aksi({ aksi: 'tolak', id: x.id, alasan: a }, () => 'Laporan ditolak'); }}>Tolak</button></>}
            {x.status === 'Ditolak' && <button className="sort-btn" disabled={busy} title="Hapus riwayat laporan yang ditolak" onClick={() => { if (confirm(`Hapus riwayat laporan ${x.konsumen} (ditolak)? Tidak bisa dibatalkan.`)) aksi({ aksi: 'hapus-ditolak', id: x.id }, () => 'Riwayat laporan dihapus'); }}>🗑 Hapus</button>}</td></tr>)}</tbody></table></div>
        : <p className="hint">Belum ada laporan. Bagikan link di bawah ke agent.</p>}</div>

    <div className="card" style={{ marginTop: 14 }}><b>🔗 Link laporan per lead agent</b>
      {d.links.length ? <div className="lk-list">{d.links.map(l => { const url = `${asal}/lapor/${l.token}`; return <div className="lk-row" key={l.username}>
        <div className="lk-proj">{l.nama}<span className="tg-sub">{l.project || '—'}{!l.fotoSiap ? ' · foto belum dipasang' : ''}</span></div><div className="lk-url">{url}</div>
        <div className="lk-aksi"><button className="sort-btn" onClick={() => { navigator.clipboard?.writeText(url); toast('Link disalin'); }}>📋 Salin</button>
          <button className="sort-btn" onClick={() => { if (confirm('Buat link baru? Link lama langsung tidak berlaku.')) aksi({ aksi: 'link-baru', username: l.username }, () => 'Link baru dibuat'); }}>↻ Ganti link</button></div></div>; })}</div>
        : <p className="hint">Belum ada akun lead agent. Tandai akun Esteem &amp; LJH sebagai <b>Lead agent</b> di menu Pengguna.</p>}
      <p className="hint" style={{ marginTop: 10 }}>Bagikan link ke agent di bawah lead agent. Laporan otomatis tercatat atas nama lead agent &amp; project-nya; agent tidak perlu login.</p></div>

    <div className="card" style={{ marginTop: 14 }}><b>📊 Visitor dari agent</b>
      {d.rekap.length ? <table className="tg-tb lk-tabel" style={{ marginTop: 8 }}><thead><tr><th>Bulan</th><th>Lead agent</th><th>Laporan</th><th>Disetujui</th><th>Jadi Booking</th></tr></thead>
        <tbody>{d.rekap.map(r => <tr key={r.bulan + r.lead_agent}><td>{namaBulan(r.bulan)}</td><td><b>{r.lead_agent}</b></td><td>{r.laporan}</td><td>{r.disetujui}</td><td>{r.booking}</td></tr>)}</tbody></table>
        : <p className="hint" style={{ marginTop: 6 }}>Belum ada data.</p>}</div>

    {ed && <div className="tg-overlay" onClick={e => { if (e.target === e.currentTarget) setEd(null); }}><div className="tg-pop" style={{ padding: 18 }}>
      <h3 style={{ marginTop: 0 }}>Ubah laporan · {ed.agent_nama}</h3>
      <div className="form-grid">{[['konsumen', 'Nama konsumen'], ['tgl', 'Tanggal kunjungan', 'date'], ['jam', 'Jam', 'time'], ['tipe', 'Tipe diminati'], ['bayar', 'Cara bayar'], ['domisili', 'Domisili'], ['budget', 'Budget']].map(([k, l, ty]) =>
        <div className="field" key={k}><label>{l}</label><input type={ty || 'text'} value={ed[k] || ''} onChange={e => setEd({ ...ed, [k]: e.target.value })} /></div>)}
        <div className="field full"><label>Catatan</label><textarea rows={3} value={ed.catatan || ''} onChange={e => setEd({ ...ed, catatan: e.target.value })} /></div></div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="sort-btn" onClick={() => setEd(null)}>Batal</button>
        <button className="sort-btn" disabled={busy} onClick={() => aksi({ aksi: 'ubah', id: ed.id, data: ed }, () => 'Perubahan disimpan')}>Simpan</button>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={() => aksi({ aksi: 'setujui', id: ed.id, data: ed }, r => `Disetujui — ${r.lead_code}`)}>Simpan &amp; setujui</button></div>
    </div></div>}
    {foto && <div className="tg-overlay" onClick={() => setFoto(null)}><img src={'/api/foto?ref=' + encodeURIComponent(foto)} alt="Foto kunjungan" style={{ maxWidth: '92vw', maxHeight: '86vh', borderRadius: 14, background: '#fff' }} /></div>}
  </>);
}
