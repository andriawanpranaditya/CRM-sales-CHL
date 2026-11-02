'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from '@/components/Toast';
import { api, fmtRp } from '@/components/util';

const rpM = n => !n ? 'Rp 0' : n >= 1e9 ? 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M' : n >= 1e6 ? 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : fmtRp(n);
const hariN = t => ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][new Date(t + 'T00:00:00Z').getUTCDay()];

// ===== Ringkasan (sama dengan Beranda Collection) =====
export default function Ringkasan({ d, proj, muat, ringkasSaja = false }) {
  const k = d.kpr, t = d.ringkasTagihan;
  const [tgt, setTgt] = useState(null);
  const bulan = d.hariIni.slice(0, 7);
  const pct = t.bulan.tagihan ? Math.round(t.bulan.terbayar / t.bulan.tagihan * 100) : 0;
  async function simpanTarget() { try { await api('/api/collection', { method: 'POST', body: JSON.stringify({ aksi: 'target', bulan, project: proj || 'SEMUA', n: tgt }) }); toast('Target akad disimpan'); setTgt(null); muat(); } catch (e) { toast(e.message); } }
  return (<>
    <div className="rp-kpi" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
      <div className="card"><span className="hint">KPR berjalan</span><b className="rp-besar">{k.berjalan}</b><span className="hint">{Object.entries(k.tahap).map(([a, n]) => `${n} ${a.toLowerCase()}`).join(' · ') || 'belum ada'}</span></div>
      <div className="card"><span className="hint">SP3K terbit, belum akad</span><b className="rp-besar">{k.sp3k + k.sp3kJadwal}</b><span className="hint">{k.sp3kJadwal} sudah dijadwalkan · {k.sp3k} belum pilih bank</span></div>
      <div className="card emas"><div className="bd-head"><span className="hint">Akad bulan ini</span>
        {!d.readOnly && (tgt === null ? <button className="sort-btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setTgt(d.targetBulan || 0)}>target {d.targetBulan || '—'}</button>
          : <span style={{ display: 'inline-flex', gap: 4 }}><input type="number" min="0" value={tgt} onChange={e => setTgt(e.target.value)} style={{ width: 60, padding: '2px 6px' }} /><button className="sort-btn" style={{ padding: '2px 8px' }} onClick={simpanTarget}>✓</button></span>)}
        {d.readOnly && <span className="hint">target {d.targetBulan || '—'}</span>}</div>
        <b className="rp-besar">{k.akadBulan}<small style={{ fontSize: 13, marginLeft: 6 }}>terealisasi · {rpM(k.akadBulanNilai)}</small></b><span className="hint">{k.sp3kJadwal} lagi sudah dijadwalkan</span></div>
      <div className="card" style={{ outline: t.tunggak.n ? '1px solid var(--red)' : undefined }}><span className="hint">Tagihan jatuh tempo 7 hari</span><b className="rp-besar" style={{ color: t.tunggak.n ? 'var(--red)' : undefined }}>{rpM(t.jatuh7.nilai)}</b>
        <span className="hint">{t.jatuh7.n} tagihan{t.tunggak.n ? ` · ${t.tunggak.n} sudah lewat (tunggakan ${rpM(t.tunggak.nilai)})` : ''}</span></div>
    </div>
    <div className="rp-grid2" style={{ marginTop: 12 }}>
      <section className="card"><div className="bd-head"><h3 style={{ margin: 0 }}>Perlu tindakan hari ini</h3><span className="hint">paling mendesak di atas</span></div>
        {d.perhatian.length ? d.perhatian.map((p, i) => (<div key={i} className="bd-row"><span className="dot" style={{ background: p.level === 'merah' ? 'var(--red)' : 'var(--brass)' }} /><div className="bd-row-main"><b>{p.judul}</b><div className="bd-row-sub">{p.sub}</div></div>
          {!d.readOnly && <Link className="bd-btn" href={p.href}>{p.tombol}</Link>}</div>)) : <p className="bd-empty">Tidak ada yang mendesak.</p>}</section>
      <section className="card"><div className="bd-head"><h3 style={{ margin: 0 }}>Jadwal akad &amp; jatuh tempo 14 hari</h3><span className="hint">akad = emas · tagihan = biru</span></div>
        {d.jadwal.length ? <div className="bd-tbl"><table><thead><tr><th>Tanggal</th><th>Konsumen · unit</th><th>Kejadian</th><th className="num">Nominal</th></tr></thead>
          <tbody>{d.jadwal.slice(0, 12).map((j, i) => <tr key={i}><td><b>{hariN(j.tgl)} {j.tgl.slice(8, 10)}/{j.tgl.slice(5, 7)}</b></td><td><Link href={j.href}>{j.nama}</Link><div className="hint">{j.unit} · {j.sales}</div></td><td><span className={'kp-pill sm ' + (j.jenis === 'akad' ? 'kp-wait' : 'kp-run')}>{j.jenis === 'akad' ? 'Akad' : 'Jatuh tempo'}</span> {j.kejadian}</td><td className="num">{rpM(j.nilai)}</td></tr>)}</tbody></table></div>
          : <p className="bd-empty">Tidak ada akad / jatuh tempo 14 hari ke depan.</p>}</section>
    </div>
    {!ringkasSaja && <div className="rp-grid2" style={{ marginTop: 12 }}>
      <section className="card"><div className="bd-head"><h3 style={{ margin: 0 }}>Collection bulan ini</h3><span className="hint">{new Date(d.hariIni).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span></div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}><div><span className="hint">Terkumpul</span><div style={{ fontSize: 24, fontWeight: 800 }}>{rpM(t.bulan.terbayar)}</div></div><div><span className="hint">Jatuh tempo bulan ini</span><div style={{ fontSize: 24, fontWeight: 800 }}>{rpM(t.bulan.tagihan)}</div></div><div><span className="hint">Tunggakan</span><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>{rpM(t.tunggak.nilai)}</div></div></div>
        <div className="bd-bar" style={{ height: 12 }}><div style={{ width: pct + '%', background: 'var(--green)' }} /></div><span className="hint">{pct}% dari jatuh tempo bulan ini sudah terbayar{t.tunggak.konsumen ? ` · ${t.tunggak.konsumen} konsumen menunggak` : ''}</span>
        {t.perJenis.length > 0 && <div className="bd-tbl"><table><thead><tr><th>Jenis</th><th className="num">Tagihan</th><th className="num">Terbayar</th><th className="num">Sisa</th></tr></thead>
          <tbody>{t.perJenis.map(x => <tr key={x.jenis}><td>{x.jenis}</td><td className="num">{rpM(x.tagihan)}</td><td className="num">{rpM(x.terbayar)}</td><td className="num">{rpM(x.tagihan - x.terbayar)}</td></tr>)}</tbody></table></div>}</section>
      <section className="card"><div className="bd-head"><h3 style={{ margin: 0 }}>KPR per bank</h3><span className="hint">berjalan + SP3K</span></div>
        {d.perBank.length ? <div className="bd-tbl"><table><thead><tr><th>Bank</th><th className="num">Diajukan</th><th className="num">Analisa</th><th className="num">SP3K</th><th className="num">Ditolak</th><th className="num">Akad {d.hariIni.slice(0, 4)}</th><th className="num">Hari ke SP3K</th></tr></thead>
          <tbody>{d.perBank.map(b => <tr key={b.bank}><td><b>{b.bank}</b></td><td className="num">{b.diajukan}</td><td className="num">{b.analisa}</td><td className="num">{b.sp3k}</td><td className="num">{b.ditolak}</td><td className="num">{b.akadTahun}</td><td className="num">{b.hariSp3k ?? '—'}</td></tr>)}</tbody></table></div>
          : <p className="bd-empty">Belum ada pengajuan bank.</p>}</section>
    </div>}
  </>);
}

