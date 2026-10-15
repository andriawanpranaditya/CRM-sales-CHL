'use client';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp } from '@/components/util';

// ===== Ikon garis (mengikuti warna teks) =====
const Ik = ({ d, w = 2 }) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>);
const I = {
  plus: <Ik w={2.4} d={<path d="M12 5v14M5 12h14" />} />,
  chat: <Ik d={<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />} />,
  oper: <Ik d={<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>} />,
  konten: <Ik d={<><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 9 5 3-5 3Z" /></>} />,
  link: <Ik d={<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>} />,
  cek: <Ik w={2.4} d={<path d="M20 6 9 17l-5-5" />} />,
  hitung: <Ik d={<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2" /></>} />,
  peta: <Ik d={<><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15M15 6v15" /></>} />,
};
const sapa = () => { const j = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: 'numeric', hourCycle: 'h23' }).format(new Date())); return j < 11 ? 'Pagi' : j < 15 ? 'Siang' : j < 19 ? 'Sore' : 'Malam'; };
const tglPanjang = () => new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const depan = n => String(n || '').trim().split(/\s+/)[0] || '';
const rpRingkas = n => n >= 1e9 ? 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M' : n >= 1e6 ? 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : n >= 1e3 ? 'Rp ' + Math.round(n / 1e3).toLocaleString('id-ID') + ' rb' : fmtRp(n);
const KELAS_STATUS = { Hot: 'b-lost', 'Site Visit': 'b-visit', Appointment: 'b-appt', Warm: 'b-warm', New: 'b-new', Cold: 'b-cold' };
const lamaDioper = m => m < 60 ? m + ' menit lalu' : m < 1440 ? Math.round(m / 60) + ' jam lalu' : Math.round(m / 1440) + ' hari lalu';
const kapanFU = (r, hariIni) => r.terlambat ? 'terlambat ' + Math.max(1, Math.round((Date.parse(hariIni) - Date.parse(r.next_fu)) / 86400000)) + ' hari' : 'hari ini';

function Cincin({ selesai, total, gelapDiEmas }) {
  const pct = total ? Math.round(selesai / total * 100) : 100;
  return (
    <div className="bd-ring" style={{ background: `conic-gradient(${gelapDiEmas ? 'var(--on-gold)' : 'var(--green)'} 0 ${pct}%, ${gelapDiEmas ? 'rgba(11,31,25,.15)' : 'var(--gray-soft)'} ${pct}% 100%)` }}
      role="img" aria-label={`${selesai} dari ${total} follow up selesai`}>
      <div className="bd-ring-in">{selesai}/{total}</div>
    </div>
  );
}

function Pintasan({ items }) {
  return (
    <nav className="bd-quick" aria-label="Pintasan">
      {items.map(([href, ikon, label, utama]) => (
        <Link key={href} href={href} className={utama ? 'utama' : ''}><span className="ico">{ikon}</span><span>{label}</span></Link>))}
    </nav>
  );
}

function BarisFU({ r, hariIni, tombol, catatan }) {
  return (
    <div className={'bd-row' + (r.terlambat ? ' telat' : '')}>
      <span className={'badge ' + (KELAS_STATUS[r.status] || 'b-cold')}>{r.status}</span>
      <div className="bd-row-main"><b>{r.nama}</b> <span className="hint">{r.lead_code}</span>
        <div className={'bd-row-sub' + (r.terlambat ? ' merah' : '')}>{kapanFU(r, hariIni)}{catatan ? ' · ' + catatan : ''}</div></div>
      {tombol}
    </div>
  );
}

// Sisa unit per project — angka sama dengan halaman Master Stock (daftar master unit di Settings)
function KartuStok({ stok }) {
  if (!stok || !stok.length) return null;
  return (
    <section className="bd-card bd-span2">
      <div className="bd-head"><h2>Unit tersedia</h2><Link href="/stock" className="bd-more">Buka peta siteplan</Link></div>
      {stok.map(x => (
        <div key={x.project} className="bd-stok">
          <div className="bd-head"><b>{x.project}</b><span><b className="bd-gold">{x.tersedia}</b> <span className="hint">tersedia dari {x.total} unit</span></span></div>
          <div className="bd-bar tipis"><div style={{ width: Math.round((x.terjual + x.reserved) / Math.max(1, x.total) * 100) + '%' }} /></div>
          <span className="hint">{x.terjual} terjual · {x.reserved} reserved</span>
        </div>))}
    </section>
  );
}

function Marcom({ d }) {
  const f = d.fu, totalFU = f.selesai + f.sisa;
  const judul = d.siapOperTotal ? `${d.siapOperTotal} lead hangat siap dioper ke sales`
    : f.sisa ? `${f.sisa} follow up menunggu hari ini` : 'Follow up hari ini sudah beres';
  return (<>
    <h1 className="bd-title">{judul}</h1>
    <Pintasan items={[['/form?tab=lead', I.plus, 'Lead baru', true], ['/form?tab=fu', I.chat, 'Follow up'], ['/form?tab=l2s', I.oper, 'Oper ke sales'],
      ['/marcom?tab=konten', I.konten, 'Catat konten'], ['/marcom?tab=iklan', I.link, 'Campaign & link WA']]} />
    <div className="bd-grid">
      <section className="bd-hero bd-span2">
        <div className="bd-hero-top"><span>Lead berkualitas bulan ini</span><span className="bd-chip-dark">L2</span></div>
        <div className="bd-hero-num"><b>{d.funnel.l2}</b><span>dari {d.funnel.l0} lead masuk</span></div>
        <div className="bd-bar"><div style={{ width: (d.funnel.l0 ? Math.round(d.funnel.l2 / d.funnel.l0 * 100) : 0) + '%' }} /></div>
        <div className="bd-chips"><span>Tersentuh FU {d.funnel.l1}</span><span>Lead masuk hari ini {d.funnel.hariIni}</span></div>
      </section>
      <section className="bd-card">
        <span className="bd-label">Biaya per lead berkualitas</span>
        <b className="bd-num">{d.cpql != null ? rpRingkas(d.cpql) : '—'}</b>
        <span className="hint">Spend {rpRingkas(d.spend)} · CPL {d.cpl != null ? rpRingkas(d.cpl) : '—'} · lead ber-campaign</span>
      </section>
      <section className="bd-card">
        <span className="bd-label">Campaign tayang</span>
        <b className="bd-num">{d.campaign.tayang}</b>
        {d.campaign.belum
          ? <Link href="/marcom?tab=iklan" className="bd-warn">{d.campaign.belum} campaign belum tersambung ke Meta</Link>
          : <span className="hint">Semua campaign Meta tersambung</span>}
      </section>
      <section className="bd-card bd-span2">
        <div className="bd-head"><h2>Siap dioper ke sales</h2><span className="hint">Warm / Hot tim Marcom yang belum punya sales</span></div>
        {d.siapOper.length ? d.siapOper.map(r => (
          <div key={r.lead_code} className="bd-row">
            <span className={'badge ' + (KELAS_STATUS[r.status] || 'b-cold')}>{r.status}</span>
            <div className="bd-row-main"><b>{r.nama}</b> <span className="hint">{r.lead_code}</span>
              <div className="bd-row-sub">{[r.project, r.tipe, r.fu_oleh ? 'FU terakhir oleh ' + r.fu_oleh : 'belum di-FU'].filter(Boolean).join(' · ')}</div></div>
            <Link className="bd-btn" href={'/form?tab=l2s&lead=' + encodeURIComponent(r.lead_code)}>Oper</Link>
          </div>))
          : <p className="bd-empty">Tidak ada lead hangat yang menunggu. Lead Warm / Hot baru akan muncul di sini.</p>}
        {d.siapOperTotal > d.siapOper.length && <Link href="/leads" className="bd-more">Lihat semua {d.siapOperTotal} lead di Database Lead</Link>}
      </section>
      <section className="bd-card bd-span2">
        <div className="bd-head"><h2>Follow up hari ini</h2>{f.terlambat ? <span className="bd-warn">{f.terlambat} terlambat</span> : null}</div>
        <div className="bd-fu-top"><Cincin selesai={f.selesai} total={totalFU} /><span className="hint">Seluruh lead tim Marcom. Selesai = lead yang sudah di-follow up hari ini.</span></div>
        {f.daftar.length ? f.daftar.map(r => (
          <BarisFU key={r.lead_code} r={r} hariIni={d.hariIni} catatan={r.milikSaya ? '' : 'input ' + r.penginput}
            tombol={<Link className="bd-btn ghost" href={'/form?tab=fu&lead=' + encodeURIComponent(r.lead_code)}>Follow up</Link>} />))
          : <p className="bd-empty">Tidak ada follow up yang jatuh tempo.</p>}
      </section>
      <KartuStok stok={d.stok} />
    </div>
  </>);
}

function Sales({ d }) {
  const f = d.fu, totalFU = f.selesai + f.sisa, s = d.status || {};
  const judul = d.baruDioper.length ? `${d.baruDioper.length} lead baru dari Marcom menunggu kabar`
    : f.terlambat ? `${f.terlambat} follow up terlambat, kerjakan dulu` : f.sisa ? `${f.sisa} follow up menunggu hari ini` : 'Follow up hari ini sudah beres';
  const tile = [['New', 'New'], ['Warm', 'Warm'], ['Hot', 'Hot'], ['Appointment', 'Appointment'], ['Site Visit', 'Site Visit']];
  return (<>
    <h1 className="bd-title">{judul}</h1>
    {d.baruDioper.map(r => (
      <div key={r.lead_code} className="bd-alert">
        <span className="dot" aria-hidden="true" />
        <div className="bd-row-main"><b>Lead baru dari {r.oleh || 'Marcom'}: {r.nama}</b>
          <div className="bd-row-sub">{r.project || '-'} · dioper {lamaDioper(r.menit)} · belum dihubungi</div></div>
        <Link className="bd-btn gold" href={'/form?tab=fu&lead=' + encodeURIComponent(r.lead_code)}>Hubungi</Link>
      </div>))}
    <Pintasan items={[['/form?tab=lead', I.plus, 'Lead walk in', true], ['/form?tab=fu', I.chat, 'Follow up'], ['/form?tab=trx', I.cek, 'Reserved / Booking'],
      ['/kpr', I.hitung, 'Simulasi'], ['/stock', I.peta, 'Cek unit']]} />
    <div className="bd-grid">
      <section className="bd-hero bd-span2">
        <div className="bd-hero-top"><span>Follow up hari ini</span>{f.terlambat ? <span className="bd-chip-dark">{f.terlambat} terlambat</span> : null}</div>
        <div className="bd-fu-top"><Cincin selesai={f.selesai} total={totalFU} gelapDiEmas />
          <span>{totalFU ? (f.sisa ? `${f.sisa} lagi. Mulai dari yang terlambat dan status Hot.` : 'Semua sudah di-follow up hari ini.') : 'Tidak ada jadwal follow up hari ini.'}</span></div>
      </section>
      <section className="bd-card">
        <span className="bd-label">Penjualan {d.pratinjau ? 'tim' : 'saya'} bulan ini</span>
        <b className="bd-num">{d.jual.n} Booking</b>
        <span className="hint">{d.jual.n ? rpRingkas(d.jual.nilai) + ' · ' : ''}Reserved aktif {d.reserved} unit</span>
      </section>
      <section className="bd-card">
        <span className="bd-label">Lead {d.pratinjau ? 'tim' : 'saya'}</span>
        <div className="bd-tiles">
          {tile.map(([k, l]) => (
            <Link key={k} href={'/leads?status=' + encodeURIComponent(k)} className="bd-tile"><b>{s[k] || 0}</b><span className={'t-' + k.replace(' ', '')}>{l}</span></Link>))}
        </div>
      </section>
      <section className="bd-card bd-span2">
        <div className="bd-head"><h2>Antrian follow up</h2><Link href="/leads" className="bd-more">Semua lead</Link></div>
        {f.daftar.length ? f.daftar.map(r => (
          <BarisFU key={r.lead_code} r={r} hariIni={d.hariIni} catatan={r.project}
            tombol={<Link className="bd-btn" href={'/form?tab=fu&lead=' + encodeURIComponent(r.lead_code)}>Follow up</Link>} />))
          : <p className="bd-empty">Tidak ada follow up yang jatuh tempo. Cek lead Warm dan Hot di Database Lead.</p>}
      </section>
      <KartuStok stok={d.stok} />
    </div>
  </>);
}


// ===== Beranda Manager & CEO Project =====
const KELAS_KPR = { berjalan: 'kp-run', sp3k: 'kp-ok', akad: 'kp-ok', ditolak: 'kp-no' };
const tglPendek = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '';
const labelKpr = k => k.status.kategori === 'akad' ? `SP3K · akad ${tglPendek(k.akad_tgl)}` : k.status.label;
function LangkahKpr({ n, kategori }) {
  return <div className="kp-steps sm">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= n ? (kategori === 'ditolak' ? 'f no' : kategori === 'akad' || kategori === 'sp3k' ? 'f ok' : 'f') : ''} />)}</div>;
}
function TabelKpr({ rows, lengkap }) {
  if (!rows.length) return <p className="bd-empty">Belum ada proses KPR berjalan.</p>;
  return (
    <div className="bd-tbl"><table>
      <thead><tr><th>Konsumen · unit</th>{lengkap && <th>Sales</th>}<th>Bank</th><th>Status terakhir</th><th>Kendala</th><th className="num">Update</th></tr></thead>
      <tbody>{rows.map(k => (
        <tr key={k.id}>
          <td><Link href={'/kpr-proses?id=' + k.id}><b>{k.nama}</b></Link><div className="hint">{[k.project, k.unit, lengkap ? '' : k.sales].filter(Boolean).join(' · ')}</div></td>
          {lengkap && <td>{k.sales || '—'}</td>}
          <td>{k.banks.join(', ') || '—'}{k.akadBank ? <div className="hint">akad di {k.akadBank}{k.tidakLanjut.length ? ' · ' + k.tidakLanjut.join(', ') + ' tidak dilanjutkan' : ''}</div> : null}</td>
          <td><span className={'kp-pill sm ' + (KELAS_KPR[k.status.kategori] || 'kp-run')}>{labelKpr(k)}</span><LangkahKpr n={k.status.langkah} kategori={k.status.kategori} /></td>
          <td>{k.kendala || '—'}</td>
          <td className={'num ' + ((k.status.kategori === 'berjalan' || k.status.kategori === 'sp3k') && k.diam > 5 ? 'merah' : 'hint')}>{k.diam <= 0 ? 'hari ini' : k.diam === 1 ? 'kemarin' : k.diam + ' hari lalu'}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

function Pimpinan({ d, me, proj, setProj, daftarProj }) {
  const j = d.jual, f = d.funnel, pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
  const naik = j.n - j.laluN;
  const judul = d.perhatian.length ? `${d.perhatian.length} hal perlu perhatian hari ini` : 'Semua terkendali hari ini';
  const isCeo = me?.role === 'ceo';
  const [bukaRespon, setBukaRespon] = useState('');
  const jamTgl = t => t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  return (<>
    <div className="bd-head" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
      <h1 className="bd-title" style={{ margin: 0 }}>{judul}</h1>
      {daftarProj.length > 1 && <div className="theme-switch" role="group" aria-label="Pilih project">
        <button aria-pressed={!proj} onClick={() => setProj('')}>{isCeo ? 'Semua project saya' : 'Semua'}</button>
        {daftarProj.map(p => <button key={p} aria-pressed={proj === p} onClick={() => setProj(p)}>{p}</button>)}
      </div>}
    </div>
    <div className="bd-grid">
      <section className="bd-hero bd-span2">
        <div className="bd-hero-top"><span>Penjualan &amp; reservasi bulan ini</span><span className="bd-chip-dark">diakui saat Booking</span></div>
        <div className="bd-duo">
          <div><span>Booking</span><b>{j.n}</b><em>unit · {rpRingkas(j.nilai)}</em></div>
          <div><span>Reserved</span><b>{j.reservedN}</b><em>unit{j.reservedNilai ? ' · ' + rpRingkas(j.reservedNilai) + ' tanda jadi' : ''}</em></div>
        </div>
        <div className="bd-chips"><span>{naik > 0 ? '▲' : naik < 0 ? '▼' : '•'} Booking bulan lalu periode sama: {j.laluN} unit</span>
          {j.perProject.length > 1 && <span>{j.perProject.map(p => `${p.project || '-'} ${p.n}`).join(' · ')}</span>}</div>
      </section>
      <section className="bd-card">
        <span className="bd-label">Stok unit</span>
        {d.stok.map(x => (<div key={x.project}>
          <div className="bd-head"><b style={{ fontSize: 13 }}>{x.project}</b><span><b className="bd-gold">{x.tersedia}</b> <span className="hint">tersedia / {x.total}</span></span></div>
          <div className="bd-bar tipis"><div style={{ width: Math.round((x.terjual + x.reserved) / Math.max(1, x.total) * 100) + '%' }} /></div>
        </div>))}
        <Link href="/stock" className="bd-more">Master Stock</Link>
      </section>
      <section className="bd-card">
        <span className="bd-label">Biaya marketing bulan ini</span>
        <b className="bd-num">{rpRingkas(d.biaya.spend)}</b>
        <span className="hint">Per lead berkualitas <b>{d.biaya.cpql != null ? rpRingkas(d.biaya.cpql) : '—'}</b></span>
        <span className="hint">Per booking <b>{d.biaya.perBooking != null ? rpRingkas(d.biaya.perBooking) : '—'}</b></span>
      </section>

      <section className="bd-card bd-span2">
        <h2 className="bd-h2">Corong lead bulan ini</h2>
        {[['L0 Lead masuk', f.l0, 100, 'var(--ink)'], ['L1 Tersentuh FU', f.l1, pct(f.l1, f.l0), 'var(--green)'], ['L2 Lead berkualitas', f.l2, pct(f.l2, f.l0), 'var(--brass)'], ['L3 Booking', f.l3, pct(f.l3, f.l0), 'var(--red)']].map(([l, n, p, c], i) => (
          <div key={l}><div className="bd-head" style={{ fontSize: 13 }}><span>{l}</span><b>{n}{i ? ` · ${p}%` : ''}</b></div>
            <div className="bd-bar"><div style={{ width: Math.max(2, Math.min(100, p)) + '%', background: c }} /></div></div>))}
      </section>
      <section className="bd-card bd-span2">
        <div className="bd-head"><h2 className="bd-h2">Campaign aktif bulan ini</h2><span className="hint">urut biaya per lead berkualitas termurah</span></div>
        {d.campaign.length ? <div className="bd-tbl"><table>
          <thead><tr><th>Campaign</th><th>Project</th><th className="num">Lead L2</th><th className="num">CPQL</th><th className="num">Booking</th></tr></thead>
          <tbody>{d.campaign.slice(0, 8).map(c => (<tr key={c.nama}><td><b>{c.nama}</b><div className="hint">{c.platform}</div></td><td>{c.project}</td>
            <td className="num">{c.l2}</td><td className="num">{c.cpql != null ? rpRingkas(c.cpql) : '—'}</td><td className="num"><b>{c.booking}</b></td></tr>))}</tbody>
        </table></div> : <p className="bd-empty">Tidak ada campaign yang sedang tayang.</p>}
      </section>

      <section className="bd-card bd-span2">
        <div className="bd-head"><h2 className="bd-h2">Perlu perhatian</h2><span className="hint">diurutkan dari yang paling mendesak</span></div>
        {d.perhatian.length ? d.perhatian.map((p, i) => (
          <div key={i} className="bd-row"><span className="dot" style={{ background: p.level === 'merah' ? 'var(--red)' : 'var(--brass)' }} />
            <div className="bd-row-main"><b>{p.judul}</b><div className="bd-row-sub">{p.sub}</div></div>
            <Link className="bd-btn" href={p.href}>Lihat</Link></div>))
          : <p className="bd-empty">Tidak ada yang mendesak.</p>}
        {isCeo && (<>
          <div className="bd-head" style={{ marginTop: 6 }}><b>Update proses KPR <span className="hint">· status terakhir</span></b><Link href="/kpr-proses" className="bd-more">Buka Proses KPR</Link></div>
          <TabelKpr rows={d.kpr} />
        </>)}
      </section>
      <section className="bd-card bd-span2">
        <h2 className="bd-h2">Performa sales</h2>
        <div className="bd-tbl"><table>
          <thead><tr><th>Sales</th><th className="num">Lead aktif</th><th className="num">FU telat</th>{!isCeo && <th className="num">Respon</th>}<th className="num">KPR jalan</th><th className="num">Booking</th></tr></thead>
          <tbody>{d.perf.map(s => (<React.Fragment key={s.nama}><tr><td><b>{s.nama}</b>{s.project ? <div className="hint">{s.project.join(', ')}</div> : null}</td>
            <td className="num">{s.aktif}</td><td className={'num' + (s.telat > 2 ? ' merah' : '')}>{s.telat}</td>
            {!isCeo && <td className="num">{(s.responRinci || []).length
              ? <button className={'bd-link' + (s.respon > 6 ? ' merah' : '')} aria-expanded={bukaRespon === s.nama} onClick={() => setBukaRespon(bukaRespon === s.nama ? '' : s.nama)}>
                  {s.respon != null ? s.respon + ' jam' : 'belum ada'}<span className="hint"> · {s.responN} lead{s.responBelum ? ` · ${s.responBelum} belum` : ''} ▾</span></button>
              : '—'}</td>}
            <td className="num">{s.kpr}</td><td className="num"><b>{s.booking}</b></td></tr>
            {!isCeo && bukaRespon === s.nama && <tr className="bd-rinci"><td colSpan={6}>
              <div className="hint" style={{ marginBottom: 6 }}>Rincian lead yang dioper ke {s.nama} bulan ini (urut paling lama direspon). Angka Respon = median jam dari dioper sampai FU pertama.</div>
              <table><thead><tr><th>Lead</th><th>Dioper</th><th>Oleh</th><th>FU pertama</th><th className="num">Jarak</th></tr></thead>
                <tbody>{s.responRinci.map((x, i) => (<tr key={x.lead_code + i}>
                  <td><Link href={'/leads?lead=' + encodeURIComponent(x.lead_code)}><b>{x.nama || x.lead_code}</b></Link><div className="hint">{x.lead_code}</div></td>
                  <td>{jamTgl(x.dioper)}</td><td>{x.oleh || '—'}</td><td>{x.fu_pertama ? jamTgl(x.fu_pertama) : <span className="merah">belum di-FU</span>}</td>
                  <td className={'num' + (x.jam > 24 ? ' merah' : '')}>{x.jam != null ? x.jam + ' jam' : '—'}</td></tr>))}</tbody></table>
            </td></tr>}
            </React.Fragment>))}</tbody>
        </table></div>
        {!isCeo && <span className="hint">Respon = median jam dari lead dioper (oleh Marcom/manager) sampai FU pertama oleh sales itu, bulan ini. Klik angkanya untuk rincian per lead.</span>}
      </section>

      {!isCeo && (<section className="bd-card bd-span4">
        <div className="bd-head"><h2 className="bd-h2">Update proses KPR</h2>
          <div className="bd-chips kp">{[['berjalan', 'berjalan'], ['sp3k', 'SP3K belum pilih akad'], ['akad', 'akad (30 hari)'], ['ditolak', 'ditolak (30 hari)']].map(([k, l]) => <span key={k} className={'kp-pill sm ' + KELAS_KPR[k]}>{d.kprRingkas[k]} {l}</span>)}</div></div>
        <TabelKpr rows={d.kpr} lengkap />
      </section>)}

      {d.tim && (<section className="bd-card bd-span2">
        <div className="bd-head"><h2 className="bd-h2">Tim hari ini</h2><Link href="/log" className="bd-more">Log Aktivitas</Link></div>
        <div><b className="bd-num">{d.tim.aktif}</b> <span className="hint">dari {d.tim.total} akun sudah aktif</span></div>
        <span className="hint">{d.tim.belum.length ? 'Belum aktif: ' + d.tim.belum.slice(0, 6).join(', ') + (d.tim.belum.length > 6 ? '…' : '') + ' · ' : ''}{d.tim.gagal} login gagal · {d.tim.input} input/update data hari ini</span>
      </section>)}
    </div>
  </>);
}

export default function BerandaPage() {
  const [me, setMe] = useState(null);
  const [d, setD] = useState(null);
  const [sebagai, setSebagai] = useState('pimpinan');
  const [proj, setProj] = useState('');
  const [daftarProj, setDaftarProj] = useState([]);
  const pimpinan = me && ['manager', 'ceo'].includes(me.role);

  useEffect(() => { api('/api/auth/me').then(setMe).catch(e => toast(e.message)); api('/api/settings').then(s => setDaftarProj(s.project || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!me) return;
    let batal = false;
    const url = !pimpinan ? '' : sebagai === 'pimpinan' ? (proj ? '?project=' + encodeURIComponent(proj) : '') : '?sebagai=' + sebagai;
    const muat = () => api('/api/beranda' + url).then(x => { if (!batal) setD(x); }).catch(e => toast(e.message));
    setD(null); muat();
    const t = setInterval(muat, 120000); // segarkan tiap 2 menit selama halaman terbuka
    return () => { batal = true; clearInterval(t); };
  }, [me, sebagai, proj]); // eslint-disable-line

  return (
    <div className="bd">
      <Toast />
      <div className="bd-top">
        <span className="hint">{tglPanjang()}</span>
        {pimpinan && <div className="theme-switch" role="group" aria-label="Lihat beranda sebagai">
          <button aria-pressed={sebagai === 'pimpinan'} onClick={() => setSebagai('pimpinan')}>{me.role === 'ceo' ? 'CEO Project' : 'Manager'}</button>
          <button aria-pressed={sebagai === 'markom'} onClick={() => setSebagai('markom')}>Marcom</button>
          <button aria-pressed={sebagai === 'sales'} onClick={() => setSebagai('sales')}>Sales</button>
        </div>}
      </div>
      <p className="bd-hello">{sapa()}, {depan(me?.name)}{pimpinan && sebagai !== 'pimpinan' ? ' · pratinjau beranda ' + (sebagai === 'sales' ? 'Sales (seluruh tim)' : 'Marcom') : ''}</p>
      {!d ? <div className="loading">Menyiapkan beranda…</div> : d.peran === 'pimpinan' ? <Pimpinan d={d} me={me} proj={proj} setProj={setProj} daftarProj={daftarProj} /> : d.peran === 'sales' ? <Sales d={d} /> : <Marcom d={d} />}
    </div>
  );
}
