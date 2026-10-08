'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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

export default function BerandaPage() {
  const [me, setMe] = useState(null);
  const [d, setD] = useState(null);
  const [sebagai, setSebagai] = useState('markom');
  const pimpinan = me && ['manager', 'ceo'].includes(me.role);

  useEffect(() => { api('/api/auth/me').then(setMe).catch(e => toast(e.message)); }, []);
  useEffect(() => {
    if (!me) return;
    let batal = false;
    const muat = () => api('/api/beranda' + (pimpinan ? '?sebagai=' + sebagai : '')).then(x => { if (!batal) setD(x); }).catch(e => toast(e.message));
    setD(null); muat();
    const t = setInterval(muat, 120000); // segarkan tiap 2 menit selama halaman terbuka
    return () => { batal = true; clearInterval(t); };
  }, [me, sebagai]); // eslint-disable-line

  return (
    <div className="bd">
      <Toast />
      <div className="bd-top">
        <span className="hint">{tglPanjang()}</span>
        {pimpinan && <div className="theme-switch" role="group" aria-label="Lihat beranda sebagai">
          <button aria-pressed={sebagai === 'markom'} onClick={() => setSebagai('markom')}>Marcom</button>
          <button aria-pressed={sebagai === 'sales'} onClick={() => setSebagai('sales')}>Sales</button>
        </div>}
      </div>
      <p className="bd-hello">{sapa()}, {depan(me?.name)}{pimpinan ? ' · pratinjau beranda ' + (sebagai === 'sales' ? 'Sales (seluruh tim)' : 'Marcom') : ''}</p>
      {!d ? <div className="loading">Menyiapkan beranda…</div> : d.peran === 'sales' ? <Sales d={d} /> : <Marcom d={d} />}
    </div>
  );
}
