'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = t => t ? `${Number(String(t).slice(8, 10))} ${BLN[Number(String(t).slice(5, 7)) - 1]}` : '';
const CHIP = { Menunggu: 'b-today', Disetujui: 'b-upcoming', Ditolak: 'b-lost' };
const Dok = ({ r, l, buka }) => r ? <button className="sort-btn" style={{ padding: '2px 8px', marginRight: 4 }} onClick={() => buka(r)}>📄 {l}</button> : null;

export default function OtherSales() {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false), [lihat, setLihat] = useState(null);
  const muat = () => api('/api/other-sales').then(setD).catch(e => toast(e.message));
  useEffect(() => { muat(); }, []);
  const aksi = async (body, ok) => { setBusy(true); try { const r = await api('/api/other-sales', { method: 'POST', body: JSON.stringify(body) }); toast(ok(r)); await muat(); } catch (e) { toast(e.message); } finally { setBusy(false); } };
  if (!d) return <><Toast /><div className="loading">Memuat Other Sales…</div></>;
  const asal = typeof window !== 'undefined' ? window.location.origin : '';
  return (<>
    <Toast />
    <div className="page-head"><div><h1>Other Sales {d.menunggu ? <span className="badge b-overdue" style={{ fontSize: 12, verticalAlign: 'middle' }}>{d.menunggu} menunggu konfirmasi</span> : null}</h1>
      <div className="sub">Penjualan dari internal employee atau external tanpa akun CRM · lewat link (dicek Manager) atau input Manager di Form Input → Sales / PIC → Other Sales</div></div></div>

    <div className="card"><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><b>📥 Kiriman masuk</b><span style={{ flex: 1 }} />
      {d.laporan.some(x => x.status === 'Ditolak') && <button className="sort-btn" disabled={busy} onClick={() => { if (confirm('Hapus semua riwayat kiriman yang ditolak?')) aksi({ aksi: 'hapus-ditolak', semua: true }, r => `${r.terhapus} kiriman ditolak dihapus`); }}>🗑 Hapus semua yang ditolak</button>}</div>
      {d.laporan.length ? <div><table className="tg-tb lk-tabel" style={{ marginTop: 8 }}><thead><tr><th>Tanggal</th><th>Konsumen</th><th>Other Sales</th><th>Project</th><th>Transaksi</th><th>Status</th><th></th></tr></thead>
        <tbody>{d.laporan.map(x => <tr key={x.id}>
          <td style={{ whiteSpace: 'nowrap' }}>{tgl(x.tgl || x.created_at)}</td>
          <td><b>{x.konsumen}</b><span className="tg-sub">{[x.konsumen_wa, x.konsumen_email, x.konsumen_nik ? 'NIK ' + x.konsumen_nik : ''].filter(Boolean).join(' · ')}</span>{x.alamat ? <span className="tg-sub">{x.alamat}</span> : null}{x.leadAda ? <span className="tg-sub" style={{ color: '#1E5B45', fontWeight: 700 }}>↪ sudah ada: {x.leadAda.lead_code} {x.leadAda.nama} ({x.leadAda.sales || 'belum dioper'}) — lead ini yang dipakai</span> : null}{x.catatan ? <span className="tg-sub">{x.catatan}</span> : null}</td>
          <td><b>{x.nama}</b><span className="tg-sub">{x.jenis}{x.divisi ? ' · ' + x.divisi : ''} · {x.hp}</span>{(x.ktp || x.npwp) && <div style={{ marginTop: 3 }}><Dok r={x.ktp} l="KTP" buka={setLihat} /><Dok r={x.npwp} l="NPWP" buka={setLihat} /></div>}</td>
          <td>{x.project}</td>
          <td>{x.trx_jenis ? <><b>{x.trx_jenis}</b> · {x.unit}<span className="tg-sub">Rp{Number(x.nilai || 0).toLocaleString('id-ID')} · {x.bayar}</span>
            <div style={{ marginTop: 3 }}><Dok r={x.berkas?.transfer} l="Transfer" buka={setLihat} /><Dok r={x.berkas?.ktp} l="KTP" buka={setLihat} /><Dok r={x.berkas?.npwp} l="NPWP" buka={setLihat} /></div></>
            : ([x.tipe, x.bayar, x.domisili, x.budget].filter(Boolean).join(' · ') || '—')}</td>
          <td><span className={'badge ' + (CHIP[x.status] || '')}>{x.status}</span>{x.lead_code ? <span className="tg-sub">{x.lead_code}{x.booking ? ' · Booking ✓' : ''}</span> : null}{x.alasan ? <span className="tg-sub">{x.alasan}</span> : null}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{x.status === 'Menunggu' && <>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '4px 10px' }} disabled={busy} onClick={() => aksi({ aksi: 'setujui', id: x.id }, r => `Disetujui — ${r.lead_code}: lead, ${x.trx_jenis || 'transaksi'} & berkas tercatat`)}>Setujui</button>{' '}
            <button className="sort-btn" disabled={busy} onClick={() => { const a = prompt('Alasan menolak?'); if (a !== null) aksi({ aksi: 'tolak', id: x.id, alasan: a }, () => 'Kiriman ditolak'); }}>Tolak</button></>}
            {x.status === 'Ditolak' && <button className="sort-btn" disabled={busy} onClick={() => { if (confirm('Hapus riwayat kiriman ini?')) aksi({ aksi: 'hapus-ditolak', id: x.id }, () => 'Riwayat dihapus'); }}>🗑 Hapus</button>}</td></tr>)}</tbody></table></div>
        : <p className="hint">Belum ada kiriman. Bagikan link di bawah.</p>}</div>

    <div className="card" style={{ marginTop: 14 }}><b>🔗 Link Other Sales per project</b>
      <div className="lk-list">{d.links.map(l => { const url = `${asal}/other/${l.token}`; return <div className="lk-row" key={l.project}>
        <div className="lk-proj">{l.project}</div><div className="lk-url">{url}</div>
        <div className="lk-aksi"><button className="sort-btn" onClick={() => { navigator.clipboard?.writeText(url); toast('Link disalin'); }}>📋 Salin</button>
          <button className="sort-btn" onClick={() => { if (confirm('Buat link baru? Link lama langsung tidak berlaku.')) aksi({ aksi: 'link-baru', project: l.project }, () => 'Link baru dibuat'); }}>↻ Ganti link</button></div></div>; })}</div>
      <p className="hint" style={{ marginTop: 10 }}>Internal employee wajib isi divisi &amp; no. HP; external wajib no. HP + foto KTP &amp; NPWP dirinya. Keduanya wajib data transaksi, HP, email &amp; NIK konsumen, serta bukti transfer, KTP &amp; NPWP konsumen. Setelah disetujui: lead, transaksi Reserved/Booking &amp; berkas tercatat atas nama Other Sales.</p></div>

    <div className="card" style={{ marginTop: 14 }}><b>👤 Daftar Other Sales</b>
      {d.daftar.length ? <table className="tg-tb lk-tabel" style={{ marginTop: 8 }}><thead><tr><th>Nama</th><th>Jenis</th><th>No. HP</th><th>Dokumen</th><th>Lead</th><th>Booking</th></tr></thead>
        <tbody>{d.daftar.map(s => <tr key={s.id}><td><b>{s.nama}</b><span className="tg-sub">{s.project}</span></td><td>{s.jenis}{s.divisi ? <span className="tg-sub">{s.divisi}</span> : null}</td><td>{s.hp}</td>
          <td><Dok r={s.ktp} l="KTP" buka={setLihat} /><Dok r={s.npwp} l="NPWP" buka={setLihat} />{!s.ktp && !s.npwp ? <span className="hint">—</span> : null}</td><td>{s.lead}</td><td>{s.booking}</td></tr>)}</tbody></table>
        : <p className="hint" style={{ marginTop: 6 }}>Belum ada Other Sales.</p>}</div>
    {lihat && <div className="tg-overlay" onClick={() => setLihat(null)}><img src={'/api/foto?ref=' + encodeURIComponent(lihat)} alt="Dokumen" style={{ maxWidth: '92vw', maxHeight: '86vh', borderRadius: 14, background: '#fff' }} /></div>}
  </>);
}
