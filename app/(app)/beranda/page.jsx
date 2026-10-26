'use client';
import Link from 'next/link';
import Ringkasan from '@/components/CollectionRingkasan';
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
  kalender: <Ik d={<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} />,
};
const sapa = () => { const j = new Date(Date.now() + 7 * 3600000).getUTCHours(); /* jam WIB tanpa Intl */ return j < 11 ? 'Pagi' : j < 15 ? 'Siang' : j < 19 ? 'Sore' : 'Malam'; };
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
  const nMerah = (d.peringatan || []).filter(p => p.level === 'merah').length;
  const judul = d.baruDioper.length ? `${d.baruDioper.length} lead baru dari Marcom menunggu kabar`
    : nMerah ? `${nMerah} hal mendesak perlu ditindaklanjuti`
    : f.terlambat ? `${f.terlambat} follow up terlambat, kerjakan dulu` : f.sisa ? `${f.sisa} follow up menunggu hari ini` : 'Follow up hari ini sudah beres';
  const tile = [['New', 'New'], ['Warm', 'Warm'], ['Hot', 'Hot'], ['Appointment', 'Appoint\u00ADment'], ['Site Visit', 'Site Visit']];
  return (<>
    <h1 className="bd-title">{judul}</h1>
    {d.baruDioper.map(r => (
      <div key={r.lead_code} className="bd-alert">
        <span className="dot" aria-hidden="true" />
        <div className="bd-row-main"><b>Lead baru dari {r.oleh || 'Marcom'}: {r.nama}</b>
          <div className="bd-row-sub">{r.project || '-'} · dioper {lamaDioper(r.menit)} · belum dihubungi</div></div>
        <Link className="bd-btn gold" href={'/form?tab=fu&lead=' + encodeURIComponent(r.lead_code)}>Hubungi</Link>
      </div>))}
    {(d.peringatan || []).length > 0 && (
      <section className="bd-card" style={{ marginBottom: 14 }}>
        <div className="bd-head"><h2 className="bd-h2">Peringatan</h2><span className="hint">{d.peringatan.length} hal perlu ditindaklanjuti</span></div>
        {d.peringatan.map((p, i) => (
          <div key={i} className="bd-row"><span className="dot" style={{ background: p.level === 'merah' ? 'var(--red)' : 'var(--brass)' }} />
            <div className="bd-row-main"><b>{p.judul}</b><div className="bd-row-sub">{p.sub}</div></div>
            <Link className="bd-btn" href={p.href}>{p.tombol || 'Lihat'}</Link></div>))}
      </section>)}
    <Pintasan items={[['/form?tab=lead', I.plus, 'Lead walk in', true], ['/janjian', I.kalender, 'Janji temu'], ['/form?tab=fu', I.chat, 'Follow up'],
      ['/form?tab=trx', I.cek, 'Reserved / Booking'], ['/kpr', I.hitung, 'Simulasi']]} />
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
      <section className="bd-card bd-span2">
        <div className="bd-head"><h2 className="bd-h2">Janji temu hari ini &amp; besok</h2><Link href="/janjian" className="bd-more">Menu Janjian</Link></div>
        {(d.akhirPekan || []).length > 0 && <div className="bd-chips kp"><span className={'kp-pill sm ' + (d.akhirPekan.some(x => x.n) ? 'kp-ok' : 'kp-no')}>
          Weekend {d.akhirPekan.map(x => `${x.hari.slice(0, 3)} ${Number(x.tgl.slice(8, 10))}/${Number(x.tgl.slice(5, 7))}: ${x.n || 'belum ada'}`).join(' · ')}{d.akhirPekan.some(x => x.n) ? ' ✓' : ' (wajib min. 1)'}</span></div>}
        {(d.agenda || []).length ? d.agenda.map(j => (
          <div key={j.id} className="bd-row"><span className="kp-pill sm kp-run">{j.tgl === d.hariIni ? 'Hari ini' : 'Besok'} {j.jam.replace(':', '.')}</span>
            <div className="bd-row-main"><b>{j.nama || j.lead_code}</b><div className="bd-row-sub">{j.jenis} · {j.lokasi}{j.reschedule_n ? ` · reschedule ${j.reschedule_n}×` : ''}</div></div>
            <Link className="bd-btn ghost" href="/janjian">Buka</Link></div>))
          : <p className="bd-empty">Belum ada janji temu hari ini &amp; besok.</p>}
      </section>
      <section className="bd-card bd-span2">
        <div className="bd-head"><h2 className="bd-h2">Proses KPR saya</h2><span className="hint">{d.kprJalan || 0} berjalan</span></div>
        {(d.kprSaya || []).length ? d.kprSaya.map(k => (
          <div key={k.id} className={'bd-row' + (k.diam > 3 ? ' telat' : '')}>
            <span className={'kp-pill sm ' + (k.status.kategori === 'berjalan' ? 'kp-run' : 'kp-ok')}>{k.status.kategori === 'akad' ? 'Rencana akad' : k.status.label}</span>
            <div className="bd-row-main"><b>{k.nama}</b><div className={'bd-row-sub' + (k.diam > 3 ? ' merah' : '')}>{[k.unit, k.banks.join(', ') || 'belum diajukan', k.kendala, k.diam > 3 ? `tidak di-update ${k.diam} hari` : ''].filter(Boolean).join(' · ')}</div></div>
            <Link className="bd-btn ghost" href={'/kpr-proses?id=' + k.id}>Update</Link></div>))
          : <p className="bd-empty">Tidak ada proses KPR berjalan.</p>}
      </section>
      <KartuStok stok={d.stok} />
    </div>
  </>);
}



// ===== Grafik ringkasan beranda (SVG, mengikuti warna tema) =====
const WARNA_PROJ = ['var(--gold)', 'var(--green)', 'var(--blue)', 'var(--red)'];
const BULAN_PDK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const singkatProj = p => { const w = String(p || '').split(/\s+/)[0]; return w.charAt(0) + w.slice(1).toLowerCase(); };
function SparkBooking({ data }) {
  if (!data.length) return null;
  const W = 200, H = 44, mx = Math.max(1, data[data.length - 1]), sx = W / Math.max(1, data.length - 1);
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${(i * sx).toFixed(1)},${(H - 4 - v / mx * (H - 10)).toFixed(1)}`).join(' ');
  return (<svg viewBox={`0 0 ${W} ${H}`} width="100%" height="40" preserveAspectRatio="none" aria-hidden="true">
    <path d={`${d} L${W},${H} L0,${H} Z`} style={{ fill: 'rgba(11,31,25,.12)' }} /><path d={d} style={{ fill: 'none', stroke: '#0B1F19', strokeWidth: 2.5 }} /></svg>);
}
function TrenBooking({ tren }) {
  const bl = tren.bulan, pr = tren.project;
  const total = bl.length ? bl[bl.length - 1].kum : 0, nilai = bl.reduce((a, b) => a + b.nilai, 0);
  const terbaik = bl.reduce((a, b) => (b.n > (a?.n || 0) ? b : a), null);
  const W = 760, H = 250, L = 34, R = 40, T = 22, B = 30, iw = W - L - R, ih = H - T - B, n = Math.max(1, bl.length), slot = iw / n;
  const bw = Math.max(5, Math.min(14, slot * 0.6 / Math.max(1, pr.length)));
  const mx = Math.max(1, ...bl.flatMap(b => pr.map(p => b.per[p] || 0))) + 1, cm = Math.max(1, total) * 1.1;
  const step = Math.max(1, Math.ceil(mx / 4)), grid = []; for (let k = 0; k <= mx; k += step) grid.push(k);
  const pts = bl.map((b, i) => [L + slot * i + slot / 2, T + ih - b.kum / cm * ih]);
  return (<section className="bd-card">
    <div className="bd-head"><h2 className="bd-h2">Tren booking {new Date().getFullYear()}</h2>
      <div className="rb-legend">{pr.map((p, k) => <span key={p}><i style={{ background: WARNA_PROJ[k % 4] }} />{p}</span>)}<span><i className="rb-garis" />kumulatif</span></div></div>
    <div className="rb-stat"><span>Total tahun ini<b>{total} unit</b></span><span>Nilai<b>{rpRingkas(nilai)}</b></span>
      <span>Rata-rata<b>{(total / n).toLocaleString('id-ID', { maximumFractionDigits: 1 })} / bulan</b></span>
      {terbaik && terbaik.n > 0 && <span>Bulan terbaik<b>{BULAN_PDK[terbaik.bln - 1]} · {terbaik.n} unit</b></span>}</div>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Tren booking per bulan, total ${total} unit tahun ini`}>
      {grid.map(k => { const y = T + ih - k / mx * ih; return <g key={'g' + k}><line x1={L} x2={W - R} y1={y} y2={y} style={{ stroke: 'var(--line)' }} /><text x={L - 8} y={y + 4} textAnchor="end" style={{ fill: 'var(--muted)', fontSize: 10.5 }}>{k}</text></g>; })}
      {[0, Math.round(cm / 2), Math.round(cm)].map(k => <text key={'c' + k} x={W - R + 8} y={T + ih - k / cm * ih + 4} style={{ fill: 'var(--muted)', fontSize: 10.5 }}>{k}</text>)}
      {bl.map((b, i) => {
        const cx = L + slot * i + slot / 2, kini = i === bl.length - 1, lebar = pr.length * bw + (pr.length - 1) * 4;
        return (<g key={b.bln}>
          {kini && <rect x={cx - slot / 2 + 3} y={T - 6} width={slot - 6} height={ih + 6} rx="10" style={{ fill: 'var(--gold)', opacity: 0.1 }} />}
          {pr.map((p, k) => { const v = b.per[p] || 0, h = v / mx * ih; return <rect key={p} x={cx - lebar / 2 + k * (bw + 4)} y={T + ih - h} width={bw} height={Math.max(0, h)} rx={bw / 2} style={{ fill: WARNA_PROJ[k % 4] }}><title>{`${BULAN_PDK[b.bln - 1]} · ${p}: ${v} unit`}</title></rect>; })}
          <text x={cx} y={H - 10} textAnchor="middle" style={{ fill: kini ? 'var(--brass-deep)' : 'var(--muted)', fontSize: 11.5, fontWeight: kini ? 800 : 600 }}>{BULAN_PDK[b.bln - 1]}</text>
        </g>);
      })}
      {pts.length > 1 && <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} style={{ fill: 'none', stroke: 'var(--ink)', strokeWidth: 2, strokeDasharray: '5 4', opacity: 0.8 }} />}
      {pts.map((p, i) => <circle key={'p' + i} cx={p[0]} cy={p[1]} r="3.5" style={{ fill: 'var(--card)', stroke: 'var(--ink)', strokeWidth: 2 }}><title>{`Kumulatif s.d. ${BULAN_PDK[bl[i].bln - 1]}: ${bl[i].kum} unit`}</title></circle>)}
      {pts.length > 0 && (() => { const [x, y] = pts[pts.length - 1]; return <g><rect x={x - 26} y={y - 30} width="52" height="20" rx="10" style={{ fill: 'var(--ink)' }} /><text x={x} y={y - 16} textAnchor="middle" style={{ fill: 'var(--card)', fontSize: 11, fontWeight: 800 }}>{total} unit</text></g>; })()}
    </svg>
    <span className="hint">Januari s.d. bulan berjalan · batang = unit Booking per bulan per project · garis = total kumulatif tahun ini</span>
  </section>);
}
function DonutStok({ x, garis }) {
  const r = 36, c = 2 * Math.PI * r, t = x.terjual / Math.max(1, x.total) * c, rv = x.reserved / Math.max(1, x.total) * c;
  return (<div className={'rb-dn' + (garis ? ' garis' : '')}>
    <svg viewBox="0 0 96 96" width="96" height="96" role="img" aria-label={`${x.project}: ${x.tersedia} tersedia dari ${x.total}`}>
      <circle cx="48" cy="48" r={r} style={{ fill: 'none', stroke: 'var(--line)', strokeWidth: 12 }} />
      <circle cx="48" cy="48" r={r} transform="rotate(-90 48 48)" style={{ fill: 'none', stroke: 'var(--red)', strokeWidth: 12, strokeDasharray: `${t} ${c}` }} />
      <circle cx="48" cy="48" r={r} transform="rotate(-90 48 48)" style={{ fill: 'none', stroke: 'var(--gold)', strokeWidth: 12, strokeDasharray: `${rv} ${c}`, strokeDashoffset: -t }} />
      <text x="48" y="50" textAnchor="middle" style={{ fill: 'var(--ink)', fontSize: 21, fontWeight: 800 }}>{x.tersedia}</text>
      <text x="48" y="64" textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: 9.5, fontWeight: 700 }}>tersedia</text>
    </svg>
    <div><b>{x.project}</b><div className="hint">dari {x.total} unit</div>
      <div className="rb-mini"><span><i style={{ background: 'var(--red)' }} />{x.terjual} terjual</span><span><i style={{ background: 'var(--gold)' }} />{x.reserved} reserved</span></div>
      <span className="rb-pct">{Math.round((x.terjual + x.reserved) / Math.max(1, x.total) * 100)}% terserap</span></div>
  </div>);
}

// ===== Beranda Manager & CEO Project =====
const KELAS_KPR = { berjalan: 'kp-run', sp3k: 'kp-ok', akad: 'kp-ok', selesai: 'kp-done', ditolak: 'kp-no' };
const tglPendek = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '';
const labelKpr = k => k.status.kategori === 'selesai' ? `Done · akad ${tglPendek(k.akad_realisasi)}` : k.status.kategori === 'akad' ? `SP3K · rencana akad ${tglPendek(k.akad_tgl)}` : k.status.label;
function LangkahKpr({ n, kategori }) {
  return <div className="kp-steps sm">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= n ? (kategori === 'ditolak' ? 'f no' : ['akad', 'sp3k', 'selesai'].includes(kategori) ? 'f ok' : 'f') : ''} />)}</div>;
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
          <td className={'num ' + (['berjalan', 'sp3k', 'akad'].includes(k.status.kategori) && k.diam > 3 ? 'merah' : 'hint')}>{k.diam <= 0 ? 'hari ini' : k.diam === 1 ? 'kemarin' : k.diam + ' hari lalu'}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

function Pimpinan({ d, me, proj, setProj, daftarProj }) {
  const j = d.jual, f = d.funnel, pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
  const naik = j.n - j.laluN;
  const isCeo = me?.role === 'ceo';
  const judul = isCeo ? `Selamat datang, ${me?.name || ''}` : d.perhatian.length ? `${d.perhatian.length} hal perlu perhatian hari ini` : 'Semua terkendali hari ini';
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
      {/* ===== Ringkasan atas: 3 kartu KPI ===== */}
      <div className="bd-span4 rb-kpi3">
        <section className="rb-k rb-emas">
          <div className="rb-lbl"><span>Booking bulan ini</span><span>diakui saat Booking</span></div>
          <div className="rb-big">{j.n}<small>unit · {rpRingkas(j.nilai)}</small></div>
          <span className="rb-naik">{naik > 0 ? '▲' : naik < 0 ? '▼' : '•'} {naik > 0 ? '+' : ''}{naik} vs bulan lalu periode sama{j.perProject.length > 1 ? ' · ' + j.perProject.map(p => `${singkatProj(p.project)} ${p.n}`).join(' · ') : ''}</span>
          <SparkBooking data={d.bookingHarian || []} />
        </section>
        <section className="rb-k">
          <div className="rb-lbl"><span>Reserved aktif</span></div>
          <div className="rb-big">{d.reservedAktif?.n ?? j.reservedN}<small>unit</small></div>
          <span className="hint">Tanda jadi {rpRingkas(d.reservedAktif?.nilai || 0)} · menunggu naik Booking</span>
          {(d.reservedAktif?.perProject || []).length > 0 && <div className="rb-tags">{d.reservedAktif.perProject.map(p => <span key={p.project} className="kp-pill sm kp-ok">{singkatProj(p.project)} {p.n}</span>)}</div>}
        </section>
        <Link href="/janjian?tab=visitor" className="rb-k rb-vlink" aria-label="Lihat detail visitor hari ini">
          <div className="rb-lbl"><span>Visitor hari ini</span><span className="rb-more">Lihat detail ›</span></div>
          <div className="rb-big">{d.janjian?.visitor?.total ?? 0}<small>orang</small></div>
          {d.janjian?.spark && <div className="rb-vbar" aria-hidden="true">{d.janjian.spark.map(x => (
            <div key={x.tgl}><i style={{ height: Math.max(5, Math.round(x.n / Math.max(1, ...d.janjian.spark.map(y => y.n)) * 100)) + '%', background: ['Sabtu', 'Minggu'].includes(x.hari) ? 'var(--gold)' : 'var(--green)' }} /><span>{x.hari.slice(0, 3)}</span></div>))}</div>}
          <span className="hint">{(d.janjian?.spark || []).reduce((a, x) => a + x.n, 0)} visitor 7 hari terakhir{d.janjian?.visitor?.akanDatang ? ` · ${d.janjian.visitor.akanDatang} akan datang hari ini` : ''}</span>
        </Link>
      </div>

      {/* ===== Tren booking tahun berjalan + stok per project ===== */}
      <div className="bd-span4 rb-row2">
        {d.tren && <TrenBooking tren={d.tren} />}
        <section className="bd-card rb-stok">
          <div className="bd-head"><h2 className="bd-h2">Stok unit per project</h2><Link href="/stock" className="bd-more">Master Stock ›</Link></div>
          {d.stok.map((x, i) => <DonutStok key={x.project} x={x} garis={i > 0} />)}
          <div className="rb-legend"><span><i style={{ background: 'var(--red)' }} />terjual</span><span><i style={{ background: 'var(--gold)' }} />reserved</span><span><i style={{ background: 'var(--line)' }} />tersedia</span></div>
        </section>
      </div>
      {!isCeo && <section className="bd-card bd-span4">
        <div className="bd-head"><h2 className="bd-h2">Perlu perhatian</h2><span className="hint">diurutkan dari yang paling mendesak</span></div>
        {d.perhatian.length ? d.perhatian.map((p, i) => (
          <div key={i} className="bd-row"><span className="dot" style={{ background: p.level === 'merah' ? 'var(--red)' : 'var(--brass)' }} />
            <div className="bd-row-main"><b>{p.judul}</b><div className="bd-row-sub">{p.sub}</div></div>
            <Link className="bd-btn" href={p.href}>Lihat</Link></div>))
          : <p className="bd-empty">Tidak ada yang mendesak.</p>}

      </section>}
      {(<section className="bd-card bd-span4">
        <div className="bd-head"><h2 className="bd-h2">Update proses KPR</h2>
          <div className="bd-chips kp">{[['berjalan', 'berjalan'], ['sp3k', 'SP3K belum pilih akad'], ['akad', 'rencana akad'], ['selesai', 'done (30 hari)'], ['ditolak', 'ditolak (30 hari)']].map(([k, l]) => <span key={k} className={'kp-pill sm ' + KELAS_KPR[k]}>{d.kprRingkas[k]} {l}</span>)}</div></div>
        <TabelKpr rows={d.kpr} lengkap />
      </section>)}


      <div className="bd-bagian bd-span4">Marketing &amp; tim sales</div>
      <section className="bd-card bd-span2">
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
      <section className="bd-card bd-span4">
        <div className="bd-head"><h2 className="bd-h2">Campaign aktif bulan ini</h2><span className="hint">urut biaya per lead berkualitas termurah</span></div>
        {d.campaign.length ? <div className="bd-tbl"><table>
          <thead><tr><th>Campaign</th><th className="num" title="Lead berkualitas">L2</th><th className="num">CPQL</th><th className="num">Booking</th></tr></thead>
          <tbody>{d.campaign.slice(0, 8).map(c => (<tr key={c.nama}><td style={{ overflowWrap: 'anywhere' }}><b>{c.nama}</b><div className="hint">{[c.project, c.platform].filter(Boolean).join(' · ')}</div></td>
            <td className="num">{c.l2}</td><td className="num">{c.cpql != null ? rpRingkas(c.cpql) : '—'}</td><td className="num"><b>{c.booking}</b></td></tr>))}</tbody>
        </table></div> : <p className="bd-empty">Tidak ada campaign yang sedang tayang.</p>}
      </section>

      <section className="bd-card bd-span4">
        <h2 className="bd-h2">Performa sales</h2>
        <div className="bd-tbl"><table>
          <thead><tr><th>Sales</th><th className="num" title="Lead aktif">Aktif</th><th className="num" title="Follow up terlambat">FU telat</th>{!isCeo && <th className="num">Respon</th>}<th className="num" title="KPR berjalan">KPR</th><th className="num" title="Janji temu bulan ini">Janji</th><th className="num">Booking</th></tr></thead>
          <tbody>{d.perf.map(s => (<React.Fragment key={s.nama}><tr><td><b>{s.nama}</b>{s.project ? <div className="hint">{s.project.join(', ')}</div> : null}</td>
            <td className="num">{s.aktif}</td><td className={'num' + (s.telat > 2 ? ' merah' : '')}>{s.telat}</td>
            {!isCeo && <td className="num">{(s.responRinci || []).length
              ? <button className={'bd-link' + (s.respon > 6 ? ' merah' : '')} aria-expanded={bukaRespon === s.nama} onClick={() => setBukaRespon(bukaRespon === s.nama ? '' : s.nama)}>
                  <span className="bd-respon">{s.respon != null ? s.respon + ' jam ▾' : 'belum ada ▾'}<span className="hint">{s.responN} lead{s.responBelum ? ` · ${s.responBelum} belum` : ''}</span></span></button>
              : '—'}</td>}
            <td className="num">{s.kpr}</td><td className={'num' + (!s.janji ? ' merah' : '')}>{s.janji ?? 0}</td><td className="num"><b>{s.booking}</b></td></tr>
            {!isCeo && bukaRespon === s.nama && <tr className="bd-rinci"><td colSpan={7}>
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

      {!isCeo && d.tim && (<section className="bd-card bd-span4">
        <div className="bd-head"><h2 className="bd-h2">Log aktivitas tim hari ini</h2><Link href="/log" className="bd-more">Buka Log Aktivitas ›</Link></div>
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
    // segarkan tiap 2 menit HANYA saat layar terlihat; saat aplikasi dibuka lagi setelah >2 menit langsung diperbarui
    let terakhir = Date.now();
    const segar = () => { if (document.visibilityState === 'visible' && Date.now() - terakhir >= 120000) { terakhir = Date.now(); muat(); } };
    const t = setInterval(segar, 30000);
    document.addEventListener('visibilitychange', segar);
    return () => { batal = true; clearInterval(t); document.removeEventListener('visibilitychange', segar); };
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
      {!d ? <div className="loading">Menyiapkan beranda…</div> : d.peran === 'pimpinan' ? <Pimpinan d={d} me={me} proj={proj} setProj={setProj} daftarProj={daftarProj} /> : d.peran === 'sales' ? <Sales d={d} /> : d.peran === 'collection' ? <Collection me={me} /> : <Marcom d={d} />}
    </div>
  );
}

// ===== Beranda Collection & KPR =====
function Collection({ me }) {
  const [d, setD] = useState(null);
  const [proj, setProj] = useState('');
  const [projek, setProjek] = useState([]);
  const muat = (p = proj) => api('/api/collection' + (p ? '?project=' + encodeURIComponent(p) : '')).then(setD).catch(e => toast(e.message));
  useEffect(() => { api('/api/settings').then(s => setProjek(s.project || [])).catch(() => {}); }, []);
  useEffect(() => { setD(null); muat(proj); }, [proj]); // eslint-disable-line
  if (!d) return <div className="loading">Menyiapkan beranda…</div>;
  const mendesak = d.perhatian.filter(p => p.level === 'merah').length;
  return (<>
    <div className="bd-head" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
      <h1 className="bd-title" style={{ margin: 0 }}>{d.perhatian.length ? `${d.perhatian.length} hal perlu ditindaklanjuti${mendesak ? ` · ${mendesak} mendesak` : ''}` : 'Semua terkendali hari ini'}</h1>
      {projek.length > 1 && <div className="theme-switch" role="group" aria-label="Pilih project">{[['', 'Semua project'], ...projek.map(p => [p, p])].map(([v, l]) => <button key={v} aria-pressed={proj === v} onClick={() => setProj(v)}>{l}</button>)}</div>}
    </div>
    <Pintasan items={[['/collection?tab=tagihan', I.cek, 'Catat pembayaran', true], ['/kpr-proses', I.hitung, 'Proses KPR'], ['/collection?tab=akad', I.kalender, 'Jadwal akad'], ['/kpr', I.hitung, 'Simulasi'], ['/stock', I.peta, 'Master Stock']]} />
    <Ringkasan d={d} proj={proj} muat={() => muat(proj)} />
  </>);
}
