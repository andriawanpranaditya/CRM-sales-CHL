'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate } from '@/components/util';
import { bolehPresentasi, PROMO, TARIF, biayaAiPerBalasan } from '@/lib/presentasi';
import { penanggungKinerja } from '@/lib/sales-kinerja';

// ===== Presentasi Project (khusus akun Andriawan) =====
// Slide 16:9 disusun otomatis dari data CRM: Bio District lalu Permai Indah.
const PROYEK = [{ p: 'BIO DISTRICT', nama: 'Bio District', logo: '/logo-bio-hitam.png', logoPutih: '/logo-bio-putih.png' }, { p: 'PERMAI INDAH', nama: 'Permai Indah', logo: '/logo-permai.png', logoPutih: '/logo-permai.png' }];
const G = '#1E5B45', E = '#C99C4F', R = '#B4482A', RM = '#E7A79C';
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BLNP = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const rpM = n => !n ? 'Rp0' : n >= 1e9 ? 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M' : n >= 1e6 ? 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : 'Rp' + Number(n).toLocaleString('id-ID');
const tglPendek = t => t ? `${Number(t.slice(8, 10))} ${BLN[Number(t.slice(5, 7)) - 1]}` : '';
const selisih = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
const tglJual = r => r.tgl_booking || r.tgl_reserved || r.tgl_batal || '';
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const persen = (a, b) => b ? Math.round(a / b * 100) : 0;
const KAT_BATAL = [['KPR ditolak / proses KPR', /kpr|bank|slik|bi.?check|\bkol\b|tolak|plafon/i, R], ['Masalah finansial', /finans|financial|keuangan|dana|bayar/i, '#D0704F'], ['Tidak sesuai budget', /budget/i, '#E39B6B'],
  ['Unit / lokasi / pilihan lain', /unit|lokasi|apartemen|tipe|cocok|rumah lain|beli di/i, '#9A8F7A'], ['Keluarga / tidak bisa dihubungi', /keluarga|orang tua|dihubungi|respon|kontak/i, '#C9C3B4']];
const kategoriBatal = a => { const t = String(a || '').replace(/·\s*(Non-refund|Refund)\s*$/i, '').trim(); if (!t) return 'Tidak dicatat'; const k = KAT_BATAL.find(([, re]) => re.test(t)); return k ? k[0] : 'Lainnya'; };

export default function PresentasiPage() {
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [dari, setDari] = useState('2026-09-01');
  const [ke, setKe] = useState(0);
  const [cetak, setCetak] = useState(false);
  const panggung = useRef(null);
  const [skala, setSkala] = useState(0.6);
  useEffect(() => { api('/api/auth/me').then(setMe).catch(e => toast(e.message)); }, []);
  useEffect(() => {
    if (!me || !bolehPresentasi(me)) return;
    setData(null);
    Promise.all([api('/api/settings'), ...PROYEK.map(x => Promise.all([api('/api/laporan-penjualan?project=' + encodeURIComponent(x.p)), api(`/api/presentasi?project=${encodeURIComponent(x.p)}&dari=${dari}`)]))])
      .then(([st, ...h]) => setData(h.map(([lp, pr], i) => ({ ...PROYEK[i], lp, pr, promo: PROMO[PROYEK[i].p], akun: st.sales || [] })))).catch(e => toast(e.message));
  }, [me, dari]);
  // skala slide mengikuti lebar area
  useEffect(() => {
    const el = panggung.current; if (!el) return;
    const ro = new ResizeObserver(() => setSkala(Math.min(el.clientWidth / 1280, (document.fullscreenElement ? window.innerHeight : 9e9) / 720)));
    ro.observe(el); return () => ro.disconnect();
  }, [data]);
  const slides = useMemo(() => data ? susunSlide(data, dari) : [], [data, dari]);
  useEffect(() => {
    const k = e => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); setKe(i => Math.min(slides.length - 1, i + 1)); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setKe(i => Math.max(0, i - 1)); }
      if (e.key === 'f' || e.key === 'F') layarPenuh(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [slides.length]); // eslint-disable-line
  function layarPenuh() { const el = panggung.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); }
  function unduhPdf() { setCetak(true); setTimeout(() => { window.print(); setTimeout(() => setCetak(false), 500); }, 400); }

  if (!me) return <div className="loading">Memuat…</div>;
  if (!bolehPresentasi(me)) return <div className="card"><h2>Presentasi Project</h2><p className="hint">Menu ini khusus akun Head of Sales &amp; Marketing.</p></div>;
  return (<>
    <Toast />
    <div className="page-head pz-head"><div><h1>Presentasi Project</h1><div className="sub">Slide disusun otomatis dari data CRM terkini · Bio District, lalu Permai Indah · panah ← → untuk pindah, F untuk layar penuh</div></div>
      <div className="pz-aksi">
        <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Lead &amp; visitor sejak <input type="date" value={dari} onChange={e => setDari(e.target.value)} /></label>
        <button className="sort-btn" disabled={!slides.length} onClick={unduhPdf}>⬇ Unduh PDF</button>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!slides.length} onClick={layarPenuh}>▶ Mulai presentasi</button>
      </div></div>
    {!data ? <div className="loading">Menyusun slide dari data CRM…</div> : <div className="pz-wrap">
      <div className="card pz-daftar">{slides.map((s, i) => <button key={i} className={'pz-item' + (i === ke ? ' on' : '') + (s.bagian ? ' bagian' : '')} onClick={() => setKe(i)}><b>{String(i + 1).padStart(2, '0')}</b>{s.judul}</button>)}</div>
      <div style={{ minWidth: 0 }}>
        <div ref={panggung} className="pz-panggung" onClick={e => { if (document.fullscreenElement) setKe(i => Math.min(slides.length - 1, i + 1)); }}>
          <div className="pz-skala" style={{ transform: `scale(${skala})`, width: 1280, height: 720 }}>{slides[ke]?.isi}</div>
        </div>
        <div className="pz-nav"><button className="sort-btn" onClick={() => setKe(i => Math.max(0, i - 1))}>◀ Sebelumnya</button><b>{ke + 1} / {slides.length}</b><button className="sort-btn" onClick={() => setKe(i => Math.min(slides.length - 1, i + 1))}>Berikutnya ▶</button></div>
      </div></div>}
    {cetak && <div className="pz-cetak">{slides.map((s, i) => <div key={i} className="pz-hal">{s.isi}</div>)}</div>}
  </>);
}

// ---------- komponen kecil ----------
function Slide({ bab, logo, proj, no, children, gelap }) {
  return (<div className={'pz-sl' + (gelap ? ' gelap' : '')}><div className="pz-pad">
    {bab && <div className="pz-kop"><span className="pz-bab">{bab}</span>{logo && <img src={logo} alt="" />}</div>}
    {children}</div>
    <div className="pz-foot"><span>PT Cipta Harmoni Lestari · Data CRM per {fmtDate(hariIni())}</span><span>{proj ? proj + ' · ' : ''}{no}</span></div></div>);
}
const Kartu = ({ l, v, s, cls, vs }) => <div className={'pz-k ' + (cls || '')}><span className="l">{l}</span><span className="v" style={vs}>{v}</span><span className="s">{s}</span></div>;
const Legenda = () => <div className="pz-leg">{[['Booking berjalan', G], ['Masih Reserved', E], ['Batal setelah Booking', R], ['Batal saat Reserved', RM]].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>;
function BarH({ label, parts, maks, kanan, tinggi = 28 }) {
  const tot = parts.reduce((a, [v]) => a + v, 0);
  return (<div className="pz-barh"><b>{label}</b><div className="tr"><div className="pz-bar" style={{ width: (tot / Math.max(1, maks) * 100) + '%', height: tinggi }}>{parts.filter(([v]) => v).map(([v, c], i) => <span key={i} style={{ flex: v, background: c }}>{v}</span>)}</div><b>{tot}</b></div><span className="kanan">{kanan}</span></div>);
}
function Kolom({ data }) { // 12 bulan, [book, resv, batalBk, batalRv]
  const mx = Math.max(1, ...data.map(x => x.reduce((a, b) => a + b, 0)));
  return (<><div className="pz-cols">{data.map((x, i) => { const t = x.reduce((a, b) => a + b, 0); return (<div key={i} className="cl"><div className="st" style={{ height: t / mx * 220 }}>{[[x[0], G], [x[1], E], [x[2], R], [x[3], RM]].filter(([v]) => v).map(([v, c], j) => <span key={j} style={{ height: (v / t * 100) + '%', background: c }}>{v / mx * 220 >= 14 ? v : ''}</span>)}</div></div>); })}</div>
    <div className="pz-ml">{BLN.map(b => <span key={b}>{b}</span>)}</div></>);
}

// ---------- penyusun slide ----------
function susunSlide(data, dari) {
  const S = [];
  const tgl = hariIni();
  S.push({ judul: 'Cover', bagian: true, isi: (<div className="pz-sl gelap pz-cover"><div className="pz-pad" style={{ justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><img src="/logo.png" alt="" style={{ height: 64 }} /><div><div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '.5px' }}>CIPTA HARMONI LESTARI</div><div className="pz-sub" style={{ fontSize: 13 }}>Sales &amp; Marketing</div></div></div>
    <div><div className="pz-eyebrow" style={{ color: '#E2BE7A' }}>Laporan kinerja project · {BLNP[Number(tgl.slice(5, 7)) - 1]} {tgl.slice(0, 4)}</div><h1 style={{ fontSize: 58, marginTop: 10 }}>Penjualan, Proses KPR<br />&amp; Pemasaran</h1>
      <div className="pz-sub" style={{ marginTop: 14, fontSize: 18 }}>Bio District · Permai Indah — data CRM per {fmtDate(tgl)}</div></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}><div><div style={{ fontWeight: 700, fontSize: 16 }}>Andriawan</div><div className="pz-sub" style={{ fontSize: 13 }}>Head of Sales &amp; Marketing</div></div>
      <div className="pz-logos"><img src="/logo-bio-putih.png" alt="" style={{ height: 46 }} /><span /><img src="/logo-permai.png" alt="" style={{ height: 50, filter: 'brightness(0) invert(1)' }} /></div></div></div></div>) });
  data.forEach(P => S.push(...slideProyek(P, dari)));
  S.push({ judul: 'Terima kasih', bagian: true, isi: (<div className="pz-sl gelap pz-cover"><div className="pz-pad" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 22 }}>
    <img src="/logo.png" alt="" style={{ height: 80 }} /><h1 style={{ fontSize: 54 }}>Terima kasih</h1><div className="pz-sub" style={{ fontSize: 17 }}>Andriawan · Head of Sales &amp; Marketing · PT Cipta Harmoni Lestari</div>
    <div className="pz-logos"><img src="/logo-bio-putih.png" alt="" style={{ height: 40 }} /><span /><img src="/logo-permai.png" alt="" style={{ height: 44, filter: 'brightness(0) invert(1)' }} /></div></div></div>) });
  return S;
}

function slideProyek(P, dari) {
  const { lp, pr, promo, nama, logo, logoPutih } = P;
  const K = lp.kumulatif || {}; const rows = (lp.rows || []).filter(r => r.status !== 'Ganti kontrak');
  const pen = K.penjualan || {}; const bb = K.batalBooking || {}; const tahunList = K.perTahun || [];
  const trxTot = tahunList.reduce((a, t) => a + (t.reserved || 0) + t.aktif + t.batalReserved + t.batal, 0);
  const tahunIni = hariIni().slice(0, 4);
  const L = (bab, no, isi) => <Slide bab={bab} logo={logo} proj={nama} no={String(no).padStart(2, '0')}>{isi}</Slide>;
  const out = [];
  // Pembuka bagian
  out.push({ judul: nama, bagian: true, isi: (<div className="pz-sl gelap pz-cover">{promo.latar && <div className="pz-latar" style={{ backgroundImage: `linear-gradient(90deg, rgba(20,70,52,.92) 0%, rgba(20,70,52,.6) 50%, rgba(20,70,52,.1) 100%), url(${promo.latar})` }} />}<div className="pz-pad" style={{ justifyContent: 'center', gap: 20 }}>
    <img src={logoPutih} alt="" style={{ height: 90, alignSelf: 'flex-start', filter: P.p === 'PERMAI INDAH' ? 'brightness(0) invert(1)' : 'none' }} />
    <h1 style={{ fontSize: 50 }}>{nama}</h1><div className="pz-sub" style={{ fontSize: 17 }}>Rekap penjualan · Analisa pembatalan · Penjualan {tahunIni} · Pembayaran berjalan · Lead &amp; visitor · Promo · Langkah ke depan</div></div></div>) });

  // 1 · Rekap penjualan
  const maksT = Math.max(1, ...tahunList.map(t => (t.reserved || 0) + t.aktif + t.batalReserved + t.batal));
  out.push({ judul: 'Rekap penjualan', isi: L('1 · Rekap penjualan', 1, <>
    <h2>{pen.n || 0} unit terjual bersih senilai {rpM(pen.nilai)} dari {trxTot} transaksi{tahunList[0] ? ' sejak ' + tahunList[0].tahun : ''}</h2>
    <div className="pz-k4"><Kartu cls="emas" l="Penjualan bersih" v={pen.n || 0} s={`${rpM(pen.nilai)} · ${pen.akad || 0} sudah akad`} /><Kartu l="Transaksi" v={trxTot} s="Booking + Reserved + Batal" />
      <Kartu l="Batal" v={(bb.n || 0) + (K.batalReserved?.n || 0)} vs={{ color: R }} s={`${bb.n || 0} setelah Booking · ${K.batalReserved?.n || 0} saat Reserved`} /><Kartu l="Masih Reserved" v={K.reserved?.n || 0} s={K.gantiKontrak?.n ? `${K.gantiKontrak.n} ganti kontrak tidak dihitung` : 'unit tertahan Reserved'} /></div>
    <table className="pz-tb"><thead><tr><th>Tahun penjualan</th><th>Transaksi</th><th>Booking berjalan</th><th>Masih Reserved</th><th>Batal setelah Booking</th><th>Batal saat Reserved</th><th>Nilai Booking</th></tr></thead>
      <tbody>{tahunList.map(t => <tr key={t.tahun}><td>{t.tahun}</td><td>{(t.reserved || 0) + t.aktif + t.batalReserved + t.batal}</td><td><b>{t.aktif}</b></td><td>{t.reserved || 0}</td><td>{t.batal}</td><td>{t.batalReserved}</td><td>{rpM(t.nilaiAktif)}</td></tr>)}
        <tr className="t"><td>Total</td><td>{trxTot}</td><td>{pen.n || 0}</td><td>{K.reserved?.n || 0}</td><td>{bb.n || 0}</td><td>{K.batalReserved?.n || 0}</td><td>{rpM(pen.nilai)}</td></tr></tbody></table>
    <Legenda /><div className="pz-col" style={{ gap: 8 }}>{tahunList.map(t => <BarH key={t.tahun} label={t.tahun} maks={maksT} tinggi={24} kanan={rpM(t.nilaiAktif) + ' bersih'} parts={[[t.aktif, G], [t.reserved || 0, E], [t.batal, R], [t.batalReserved, RM]]} />)}</div></>) });

  // 2 · Analisa pembatalan
  const batalBk = rows.filter(r => r.status === 'Batal' && r.tgl_booking), batalRv = rows.filter(r => r.status === 'Batal' && !r.tgl_booking);
  const kat = {}; batalBk.forEach(r => { const k = kategoriBatal(r.alasan_batal); kat[k] = (kat[k] || 0) + 1; });
  const katList = Object.entries(kat).sort((a, b) => b[1] - a[1]);
  const adaAlasan = batalBk.length ? batalBk.filter(r => kategoriBatal(r.alasan_batal) !== 'Tidak dicatat').length / batalBk.length : 0;
  const kemampuan = (kat['KPR ditolak / proses KPR'] || 0) + (kat['Masalah finansial'] || 0);
  const jarak = batalBk.map(r => selisih(r.tgl_batal, r.tgl_booking)).filter(x => x >= 0);
  const med = median(jarak);
  const ember = [['≤ 30 hari', x => x <= 30], ['31–90 hari', x => x > 30 && x <= 90], ['91–180 hari', x => x > 90 && x <= 180], ['> 180 hari', x => x > 180]].map(([l, f]) => [l, jarak.filter(f).length]);
  const perBlnK = {}; batalBk.forEach(r => { const m = r.tgl_booking.slice(0, 7); perBlnK[m] = (perBlnK[m] || 0) + 1; });
  const [blnTop, nTop] = Object.entries(perBlnK).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const kontrakBlnTop = rows.filter(r => (r.tgl_booking || '').startsWith(blnTop)).length, bertahanBlnTop = rows.filter(r => (r.tgl_booking || '').startsWith(blnTop) && r.status === 'Booking').length;
  const perBlnBatal = {}; batalBk.forEach(r => { const m = r.tgl_batal.slice(0, 7); perBlnBatal[m] = (perBlnBatal[m] || 0) + 1; });
  const [puncak, nPuncak] = Object.entries(perBlnBatal).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const namaBln = m => m ? `${BLNP[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '';
  const rvKat = {}; batalRv.forEach(r => { const k = kategoriBatal(r.alasan_batal); rvKat[k] = (rvKat[k] || 0) + 1; });
  const rvTop = Object.entries(rvKat).sort((a, b) => b[1] - a[1])[0];
  const jarakRv = batalRv.map(r => selisih(r.tgl_batal, r.tgl_reserved)).filter(x => x >= 0);
  const judulBatal = adaAlasan >= 0.5 && kemampuan / Math.max(1, batalBk.length) >= 0.5 ? `${persen(kemampuan, batalBk.length)}% pembatalan setelah Booking terkait kemampuan bayar: KPR ditolak atau masalah finansial`
    : nTop / Math.max(1, batalBk.length) >= 0.4 ? `${nTop} dari ${batalBk.length} pembatalan berasal dari kontrak ${namaBln(blnTop)} — hanya ${bertahanBlnTop} dari ${kontrakBlnTop} kontrak bulan itu yang bertahan`
      : `${batalBk.length} kontrak batal setelah Booking; median ${med} hari dari Booking ke pembatalan`;
  const maksK = Math.max(1, ...katList.map(x => x[1])), maksE = Math.max(1, ...ember.map(x => x[1]));
  out.push({ judul: 'Analisa pembatalan', isi: L('2 · Analisa pembatalan', 2, <>
    <h2>{judulBatal}</h2>
    <div className="pz-row" style={{ flex: 1 }}>
      <div className="pz-box" style={{ flex: 1.2 }}>{adaAlasan >= 0.5 ? <><b>{batalBk.length} batal setelah Booking — alasan tercatat</b>
        {katList.map(([k, v]) => <div key={k} className="pz-hb"><span>{k}</span><div style={{ width: (v / maksK * 100) + '%', background: (KAT_BATAL.find(x => x[0] === k) || [])[2] || '#C9C3B4' }} /><b>{v}</b></div>)}</>
        : <><b>Jarak Booking → batal ({batalBk.length} kontrak)</b>{ember.map(([k, v]) => <div key={k} className="pz-hb"><span>{k}</span><div style={{ width: (v / maksE * 100) + '%', background: R }} /><b>{v}</b></div>)}
          <div className="pz-sub" style={{ fontSize: 13 }}>Alasan batal tidak tercatat di sebagian besar kontrak — pola waktu dipakai sebagai petunjuk.</div></>}
        <div className="pz-sub" style={{ fontSize: 13 }}>Median {med} hari dari Booking ke pembatalan{bb.nonrefund || bb.refund ? ` · ${bb.nonrefund || 0} non-refund (dana hangus ${rpM(bb.hangus)}), ${bb.refund || 0} refund` : ''}</div></div>
      <div className="pz-col" style={{ flex: 1 }}>
        {batalRv.length > 0 && <Kartu l={`${batalRv.length} batal saat Reserved`} v={rvTop ? `${rvTop[1]} "${rvTop[0].toLowerCase()}"` : batalRv.length} vs={{ fontSize: 26 }} s={jarakRv.length ? `batal ${Math.min(...jarakRv)}–${Math.max(...jarakRv)} hari setelah Reserved` : ''} />}
        {nTop / Math.max(1, batalBk.length) >= 0.4 && <Kartu l={`Pembatalan terpusat di kontrak ${namaBln(blnTop)}`} v={`${nTop} dari ${batalBk.length}`} s={`dari ${kontrakBlnTop} kontrak bulan itu hanya ${bertahanBlnTop} yang masih berjalan`} />}
        {nPuncak > 2 && <Kartu l="Puncak pembatalan" v={`${namaBln(puncak)} · ${nPuncak}`} vs={{ fontSize: 24 }} s="bulan dengan pembatalan terbanyak" />}
        <div className="pz-ins">{kemampuan / Math.max(1, batalBk.length) >= 0.5 || (rvTop && /budget/i.test(rvTop[0]))
          ? <>Pembatalan karena budget/KPR umumnya terjadi setelah konsumen mengetahui <b>hasil BI checking dan plafon KPR</b> — saringan kelayakan perlu dilakukan <b>sebelum</b> tanda jadi.</>
          : <>Pola waktu pembatalan mengarah ke <b>hasil verifikasi bank / SLIK</b> dan syarat KPR yang tidak terpenuhi — kelayakan perlu disaring <b>sebelum</b> kontrak.</>}</div></div></div></>) });

  // 3 · Penjualan tahun ini per bulan
  const thn = rows.filter(r => tglJual(r).startsWith(tahunIni));
  const bulanData = BLN.map((_, i) => { const m = `${tahunIni}-${String(i + 1).padStart(2, '0')}`; const x = thn.filter(r => tglJual(r).startsWith(m));
    return [x.filter(r => r.status === 'Booking').length, x.filter(r => r.status === 'Reserved').length, x.filter(r => r.status === 'Batal' && r.tgl_booking).length, x.filter(r => r.status === 'Batal' && !r.tgl_booking).length]; });
  const bookThn = thn.filter(r => r.status === 'Booking'), nilaiThn = bookThn.reduce((a, r) => a + (Number(r.harga) || 0), 0);
  const blnJalan = Number(hariIni().slice(5, 7));
  const iTop = bulanData.reduce((b, x, i) => (x[0] > bulanData[b][0] || (x[0] === bulanData[b][0] && x.reduce((a, c) => a + c, 0) > bulanData[b].reduce((a, c) => a + c, 0))) ? i : b, 0);
  out.push({ judul: `Penjualan ${tahunIni}`, isi: L(`3 · Penjualan ${tahunIni}`, 3, <>
    <h2>{thn.length} transaksi Januari–{BLNP[blnJalan - 1]} {tahunIni}; {bookThn.length} masih berjalan, terbaik di {BLNP[iTop]}</h2><Legenda /><Kolom data={bulanData} />
    <div className="pz-k3"><Kartu l={`Booking berjalan ${tahunIni}`} v={bookThn.length} s={rpM(nilaiThn)} /><Kartu l="Rata-rata per bulan" v={(bookThn.length / blnJalan).toLocaleString('id-ID', { maximumFractionDigits: 1 })} s="unit bersih / bulan" /><Kartu cls="emas" l="Bulan terbaik" v={BLN[iTop]} s={`${bulanData[iTop][0]} unit bersih · ${bulanData[iTop].reduce((a, c) => a + c, 0)} transaksi`} /></div></>) });

  // 4 · Pembayaran berjalan
  const proses = rows.filter(r => r.proses_kpr).map(r => { const kb = pr.kprBaru?.[r.lead_code] || {}; const upd = kb.logTgl || kb.update || r.kpr?.updated_at || '';
    return { r, upd, teks: kb.log || [r.kpr?.label, kb.catatan || r.kpr?.catatan].filter(Boolean).join(' · ') || 'Belum ada catatan', bank: (r.kpr?.banks || []).join(', ') || '—', lama: upd ? selisih(hariIni(), upd) : 999 }; })
    .sort((a, b) => b.lama - a.lama);
  const basi = proses.filter(x => x.lama > 7).length;
  const cicil = rows.filter(r => r.status === 'Booking' && /bertahap|cicil/i.test(r.bayar || r.cara_bayar || '')).map(r => { const n = Number(r.cicilan) || Number(String(r.cara_bayar || '').match(/(\d+)\s*x/i)?.[1]) || 0;
    const jalan = Math.max(0, Math.min(n || 99, Math.floor(selisih(hariIni(), r.tgl_booking) / 30))); return { r, n, jalan }; });
  const PER_HAL = 10;
  const halKpr = Math.max(1, Math.ceil(proses.length / PER_HAL));
  const tabelKpr = (daftar, mulaiNo) => (<table className="pz-tb s kpr"><colgroup><col style={{ width: '4%' }} /><col style={{ width: '22%' }} /><col style={{ width: '15%' }} /><col /><col style={{ width: '9%' }} /></colgroup>
    <thead><tr><th>No</th><th>Konsumen</th><th>Bank</th><th>Update terakhir (catatan &amp; riwayat KPR)</th><th>Tanggal</th></tr></thead>
    <tbody>{daftar.map((x, i) => <tr key={x.r.lead_code + x.r.unit}><td>{mulaiNo + i}</td><td className="kiri">{x.r.nama}</td><td className="kiri">{x.bank}</td><td className="kiri satu" title={x.teks}>{x.teks}</td><td style={{ color: x.lama > 7 ? R : undefined }}>{x.upd ? tglPendek(x.upd) : '—'}</td></tr>)}</tbody></table>);
  out.push({ judul: 'Pembayaran berjalan', isi: L('4 · Pembayaran berjalan', 4, <>
    <h2>{pen.akad || 0} sudah akad; {proses.length} masih proses KPR{basi ? ` — ${basi} belum ada update lebih dari 7 hari` : ''}{cicil.length ? ` · ${cicil.length} cicilan bertahap berjalan` : ''}</h2>
    <div className="pz-k4"><Kartu cls="emas" l="Sudah akad" v={`${pen.akad || 0} unit`} s={`dari ${pen.kpr || 0} konsumen KPR`} /><Kartu l="Proses KPR" v={proses.length} s={`${proses.filter(x => /sp3k/i.test(x.r.kpr?.label || '')).length} SP3K terbit · ${proses.filter(x => !(x.r.kpr?.banks || []).length).length} belum ada bank`} />
      <Kartu l="Tanpa update > 7 hari" v={basi} vs={{ color: basi ? R : undefined }} s="perlu dikonfirmasi ke bank / AO" /><Kartu l="Cicilan bertahap" v={cicil.length} s={cicil.length ? cicil.map(x => `${x.r.nama.split(' ')[0]} ±${x.jalan}/${x.n || '?'}`).join(' · ') : 'tidak ada'} /></div>
    {tabelKpr(proses.slice(0, PER_HAL), 1)}
    {halKpr > 1 ? <div className="pz-sub" style={{ fontSize: 12 }}>Berlanjut ke slide berikutnya ({proses.length - PER_HAL} konsumen lagi) · diurutkan dari yang paling lama tidak di-update · tanggal merah = lebih dari 7 hari</div>
      : <div className="pz-sub" style={{ fontSize: 12 }}>Tanggal merah = lebih dari 7 hari tanpa update{cicil.length ? ' · angsuran cicilan bertahap = perkiraan dari tanggal Booking' : ''}.</div>}</>) });
  for (let h = 1; h < halKpr; h++) out.push({ judul: `Proses KPR (lanjutan ${h + 1}/${halKpr})`, isi: L('4 · Pembayaran berjalan', `4.${h + 1}`, <>
    <h2>Proses KPR — lanjutan ({h + 1}/{halKpr})</h2>{tabelKpr(proses.slice(h * PER_HAL, (h + 1) * PER_HAL), h * PER_HAL + 1)}
    <div className="pz-sub" style={{ fontSize: 12 }}>Tanggal merah = lebih dari 7 hari tanpa update.</div></>) });

  // 5 · Lead & visitor
  const Ld = pr.lead || {}, V = pr.visitor || {};
  const pCold = persen(Ld.cold, Ld.dioper), pWarm = persen(Ld.warmPlus, Ld.dioper), pFu = persen(Ld.aktifFu7, Ld.aktif);
  const diam = [];
  const berarti = n => n >= 10 || n >= (Ld.dioper || 0) * 0.1; // angka kecil tidak ditampilkan
  if (Ld.dioper) diam.push(<><b>{Ld.cold} dari {Ld.dioper} lead yang dioper ({pCold}%) berstatus Cold</b> — tidak membalas setelah dihubungi sales; hanya {Ld.warmPlus} ({pWarm}%) naik ke Warm ke atas.</>);
  if (berarti(Ld.belumFu || 0)) diam.push(<><b>{Ld.belumFu} lead belum pernah di-follow up</b> sales sejak diterima.</>);
  if (berarti(Ld.marcomBelumOper || 0)) diam.push(<><b>{Ld.marcomBelumOper} lead Marcom masih New</b> dan belum diserahkan ke sales.</>);
  if ((Ld.alasanDrop || []).length) diam.push(<>Alasan drop terbanyak: {Ld.alasanDrop.slice(0, 3).map(([a, n]) => `${a} (${n})`).join(', ')}.</>);
  out.push({ judul: 'Lead & visitor', isi: L('5 · Lead & visitor', 5, <>
    <h2>{Ld.masuk || 0} lead masuk sejak {fmtDate(dari)}; {Ld.aktif || 0} masih di-follow up{Ld.dioper ? `, ${pCold}% lead yang dioper belum menanggapi` : ''}</h2>
    <div className="pz-k4"><Kartu l="Lead masuk" v={Ld.masuk || 0} s={`${Ld.marcom || 0} dari Marcom · ${Ld.dioper || 0} dipegang sales`} /><Kartu l="Masih di-follow up" v={Ld.aktif || 0} s={`${Ld.aktifFu7 || 0} disentuh dalam 7 hari (${pFu}%)`} />
      <Kartu cls="emas" l="Visitor" v={V.total || 0} s={`${V.walkin || 0} walk in · ${V.janji || 0} janji temu · ${V.tanpaJanji || 0} tanpa janji`} /><Kartu l="Lead → Booking" v={Ld.booking || 0} s={`${persen(Ld.booking, Ld.masuk)}% dari lead masuk`} /></div>
    <div className="pz-row" style={{ flex: 1 }}><div className="pz-box" style={{ flex: 1.3 }}><b>Kenapa lead masuk tapi diam</b><ol className="pz-ol">{diam.map((x, i) => <li key={i}>{x}</li>)}</ol></div>
      <div className="pz-col" style={{ flex: 1 }}><div className="pz-ins">{pFu >= 80 ? <>Disiplin follow up sudah baik (<b>{pFu}%</b> lead aktif disentuh dalam 7 hari). Masalahnya ada di <b>serah terima</b> dan <b>kualitas lead</b>, bukan kecepatan.</> : <><b>{100 - pFu}%</b> lead aktif tidak disentuh dalam 7 hari — jadwal follow up wajib perlu ditegakkan.</>}</div>
        <table className="pz-tb s"><thead><tr><th>Sumber lead</th><th>Lead</th></tr></thead><tbody>{(Ld.perSumber || []).slice(0, 5).map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody></table></div></div></>) });

  // 6 · Promo berjalan
  const ps = promo.sales || {}, pk = promo.konsumen || {}, ct = ps.continuity;
  const akum = a => a.reduce((o, x) => [...o, (o.at(-1) || 0) + x], []);
  const Flyer = ({ src }) => src ? <div className="pz-flyer"><img src={src} alt="" /></div> : null;
  const panelSales = (<div className="pz-box" style={{ flex: 1 }}><span className="pz-chip hijau">{ps.judul}</span>
    <div className="pz-k3" style={{ gap: 8 }}><Kartu l="Cash reward" v={ps.cash} s={ps.cashKet} /><Kartu l="Komisi" v={ps.komisi} s={ps.komisiKet} />{ps.bonus ? <Kartu cls="emas" l="Reward" v={ps.bonus.replace('Reward trip ', '')} vs={{ fontSize: 22 }} s={ps.bonusKet} /> : null}</div>
    {ct && <><b style={{ fontSize: 13.5 }}>{ct.judul}</b><table className="pz-tb s xs"><thead><tr><th>Unit ke-</th><th>{ct.grup1.nama}</th><th>Akumulasi</th><th>{ct.grup2.nama}</th><th>Akumulasi</th></tr></thead>
      <tbody>{ct.grup1.bonus.map((b, i) => <tr key={i}><td>{i + 1}</td><td>Rp{b} jt</td><td>Rp{akum(ct.grup1.bonus)[i]} jt</td><td>Rp{ct.grup2.bonus[i]} jt</td><td>Rp{akum(ct.grup2.bonus)[i]} jt</td></tr>)}<tr><td>7 dst</td><td colSpan={4}>{ct.lanjut}</td></tr></tbody></table>
      <span className="pz-sub" style={{ fontSize: 12 }}>{ct.contoh}</span></>}</div>);
  const panelKonsumen = (<div className="pz-box" style={{ flex: 1 }}><span className="pz-chip emas">{pk.judul}</span>
    <table className="pz-tb"><thead><tr><th>{pk.kolom?.[0] || 'Tipe unit'}</th><th>{pk.kolom?.[1] || 'Hadiah'}</th></tr></thead><tbody>{(pk.hadiah || []).map((h, i) => <tr key={i}><td>{h[0]}</td><td><b>{h[1]}</b>{h[2] ? <><br /><span className="pz-sub" style={{ fontSize: 11.5 }}>{h[2]}</span></> : null}</td></tr>)}</tbody></table>
    {pk.catatan && <div className="pz-ins" style={{ fontSize: 13 }}>{pk.catatan}</div>}</div>);
  if (promo.flyerSales) {
    out.push({ judul: 'Promo sales & agent', isi: L('6 · Promo berjalan', 6, <><h2>{promo.headline || promo.nama}</h2>
      <div className="pz-row" style={{ flex: 1 }}>{panelSales}<Flyer src={promo.flyerSales} /></div></>) });
    out.push({ judul: 'Promo konsumen', isi: L('6 · Promo berjalan', '6.2', <><h2>{pk.judul}: {(pk.hadiah || []).map(h => h[1]).join(' · ')}</h2>
      <div className="pz-row" style={{ flex: 1 }}>{panelKonsumen}<Flyer src={promo.flyerKonsumen} /></div></>) });
  } else {
    out.push({ judul: 'Promo berjalan', isi: L('6 · Promo berjalan', 6, <><h2>{promo.headline || promo.nama}</h2>
      <div className="pz-row" style={{ flex: 1 }}><div className="pz-col" style={{ flex: 1 }}>{panelSales}{panelKonsumen}</div><Flyer src={promo.flyerKonsumen} /></div></>) });
  }

  // 7 · Dampak promo
  const mulai = promo.mulai || `${tahunIni}-01-01`;
  const bookSejak = rows.filter(r => r.status === 'Booking' && (r.tgl_booking || '') >= mulai);
  const bookSebelum = rows.filter(r => r.status === 'Booking' && (r.tgl_booking || '') >= `${tahunIni}-01-01` && (r.tgl_booking || '') < mulai);
  // lama periode dalam bulan (hari ÷ 30,44) — supaya promo yang baru berjalan 1–2 bulan dibandingkan adil
  const blnSebelum = Math.max(1, selisih(mulai, `${tahunIni}-01-01`) / 30.44), blnSejak = Math.max(0.5, (selisih(hariIni(), mulai) + 1) / 30.44);
  const rSeb = promo.mulai ? bookSebelum.length / blnSebelum : 0, rSej = bookSejak.length / blnSejak;
  const leadBln = Object.fromEntries(Ld.perBulan || []);
  const leadSeb = promo.mulai ? Object.entries(leadBln).filter(([m]) => m < mulai.slice(0, 7)).reduce((a, [, n]) => a + n, 0) / blnSebelum : 0;
  const leadSej = Object.entries(leadBln).filter(([m]) => m >= mulai.slice(0, 7)).reduce((a, [, n]) => a + n, 0) / blnSejak;
  const f1 = x => x.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  out.push({ judul: 'Dampak promo', isi: L('6 · Dampak promo', 7, <>
    <h2>{promo.mulai ? (rSej > rSeb ? `Sejak promo berjalan, Booking naik dari ${f1(rSeb)} menjadi ${f1(rSej)} unit per bulan` : `Sejak promo berjalan, Booking ${f1(rSej)} unit per bulan (sebelumnya ${f1(rSeb)})`) : `Booking ${tahunIni}: rata-rata ${f1(rSej)} unit per bulan`}</h2>
    <div className="pz-row" style={{ flex: 1, gap: 16 }}>
      <div className="pz-box" style={{ flex: 1 }}><b>Booking berjalan per bulan</b>
        {promo.mulai && <div className="pz-hb"><span>Sebelum promo</span><div style={{ width: (rSeb / Math.max(rSeb, rSej, 0.01) * 100) + '%', background: '#C9C3B4' }} /><b>{f1(rSeb)}</b></div>}
        <div className="pz-hb"><span><b>{promo.mulai ? 'Sejak promo' : `Tahun ${tahunIni}`}</b></span><div style={{ width: (rSej / Math.max(rSeb, rSej, 0.01) * 100) + '%', background: G }} /><b>{f1(rSej)}</b></div>
        <table className="pz-tb s"><thead><tr><th>Booking {promo.mulai ? 'sejak promo' : tahunIni} ({bookSejak.length})</th><th>Unit</th><th>Hadiah</th><th>Sales</th></tr></thead>
          <tbody>{bookSejak.slice(0, 7).map(r => <tr key={r.lead_code + r.unit}><td>{r.nama}</td><td>{r.unit}{r.tipe ? ` (${String(r.tipe).replace(/^TIPE\s*/i, '')})` : ''}</td><td>{promo.hadiahUnit ? promo.hadiahUnit(r.tipe, r.unit) : '—'}</td><td>{penanggungKinerja({ project: P.p, sales: r.sales, tgl: r.tgl_booking }, P.akun || [])}</td></tr>)}</tbody></table>
        {bookSejak.length > 7 && <span className="pz-sub" style={{ fontSize: 12 }}>+{bookSejak.length - 7} Booking lainnya</span>}</div>
      <div className="pz-col" style={{ flex: 1 }}><div className="pz-k4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Kartu l={promo.mulai ? 'Lead per bulan sejak promo' : 'Lead per bulan'} v={f1(leadSej)} s={promo.mulai ? `sebelum promo ${f1(leadSeb)} per bulan` : `tahun ${tahunIni}`} />
        <Kartu l={`Lead masuk sejak ${fmtDate(dari)}`} v={Ld.masuk || 0} s={`${Ld.booking || 0} sudah Booking`} />
        <Kartu cls="emas" l="Walk in media offline" v={V.offline || 0} s={(V.perInfo || []).filter(([k]) => /banner|spanduk|billboard|baliho|brosur|pameran|event|lewat|papan/i.test(k)).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(' · ') || `sejak ${fmtDate(dari)}`} />
        <Kartu l={promo.mulai ? 'Booking sejak promo' : `Booking ${tahunIni}`} v={bookSejak.length} s={`${rpM(bookSejak.reduce((a, r) => a + (Number(r.harga) || 0), 0))}`} /></div>
        <div className="pz-ins">{(V.offline || 0) >= (V.janji || 0) ? <>Media offline menghasilkan kunjungan terbanyak — hadiah promo paling efektif dipakai sebagai <b>alasan datang ke lokasi</b>.</> : <>Janji temu menjadi sumber kunjungan utama — promo dipakai sebagai <b>undangan kunjungan weekend</b> untuk lead Warm/Hot.</>}</div></div></div></>) });

  // 8 · Langkah ke depan
  const langkah = [];
  langkah.push(['WhatsApp resmi untuk semua lead digital', [
    'Iklan klik-ke-WhatsApp dan tombol WA website/landing page diarahkan ke nomor official; setiap chat otomatis menjadi lead di CRM lengkap dengan campaign-nya.',
    'Sales membalas dari Inbox WhatsApp, bukan nomor pribadi; Marcom memperkenalkan sales di percakapan yang sama sehingga konsumen tidak berpindah nomor.',
    `Target: lead yang menanggapi sales naik dari ${Ld.dioper ? 100 - pCold : 0}% menuju 50% dalam 60 hari.`]]);
  langkah.push(['AI Asisten WhatsApp — tahap 1: penyaring & penjadwal', [
    'Menjawab 24 jam soal harga, promo, lokasi, dan simulasi cicilan dari Price List resmi.',
    'Menanyakan tiga pertanyaan saringan (range budget, cash/KPR, domisili) dan mengisi data kualifikasi lead otomatis.',
    'Menawarkan dua pilihan jadwal kunjungan, membuat janji temu, lalu mengoper lead yang siap ke sales beserta ringkasan percakapannya.']]);
  langkah.push(['AI Asisten WhatsApp — tahap 2: pendamping follow up', [
    'Menyusun pesan follow up personal sesuai jadwal 9 sentuhan dan riwayat lead; sales tinggal menyetujui dan mengirim.',
    'Mengingatkan janji temu H-1 dan pagi hari-H, serta membaca balasan konsumen untuk memperbarui status lead.',
    'Rencana: tahap 1 berjalan 30–60 hari setelah aktivasi WhatsApp API, tahap 2 dalam 60–90 hari.']]);
  langkah.push(['Undangan kunjungan weekend dengan promo', [`Setiap lead Warm/Hot diberi dua pilihan jadwal; promo ${promo.nama || ''} dipakai sebagai alasan datang ke lokasi.`]]);
  if (berarti(Ld.belumFu || 0) || berarti(Ld.marcomBelumOper || 0)) langkah.push(['Tuntaskan lead yang belum tersentuh', [[berarti(Ld.belumFu || 0) ? `${Ld.belumFu} lead belum pernah di-follow up` : '', berarti(Ld.marcomBelumOper || 0) ? `${Ld.marcomBelumOper} lead Marcom belum diserahkan` : ''].filter(Boolean).join(' · ') + '.']]);
  out.push({ judul: 'Langkah ke depan', isi: L('7 · Langkah ke depan', 8, <>
    <h2>{Math.min(5, langkah.length)} langkah untuk menaikkan penjualan dan menghidupkan lead yang diam</h2>
    <div className="pz-col" style={{ gap: 10, marginTop: 4 }}>{langkah.slice(0, 5).map(([a, b], i) => <div key={i} className="pz-langkah"><b className="no">{i + 1}</b><b className="j">{a}</b><ul>{b.map((x, k) => <li key={k}>{x}</li>)}</ul></div>)}</div></>) });

  // 8 · Kenapa WhatsApp satu nomor + AI Asisten penting (dampak berbasis data project ini)
  const resp = Ld.dioper ? 100 - pCold : 0;
  const tambahAktif = Math.max(0, Math.round((Ld.dioper || 0) * (0.5 - resp / 100)));
  const pLuar = persen(Ld.luarJam?.n || 0, Ld.luarJam?.dari || 0), pKual = persen(Ld.kualLengkap || 0, Ld.masuk || 0);
  const bandingan = [
    ['Serah terima lead', `Pindah ke nomor pribadi sales — ${pCold}% lead yang dioper tidak menanggapi`, 'Satu percakapan dari iklan sampai Booking; konsumen tidak berpindah nomor'],
    ['Jam layanan', Ld.luarJam?.dari ? `${pLuar}% lead digital masuk di luar jam kerja / hari Minggu` : 'Bergantung pada jam kerja sales', 'AI menjawab dalam hitungan detik, 24 jam, termasuk harga, promo & simulasi cicilan'],
    ['Data kualifikasi', `Baru ${pKual}% lead punya data lengkap (domisili, budget, cara bayar…)`, 'Terisi otomatis dari percakapan sebelum lead dioper ke sales'],
    ['Kontrol manajemen', 'Chat ada di HP pribadi — tidak terlihat & hilang bila sales berganti', 'Semua percakapan tersimpan di CRM; bisa diaudit dan dialihkan kapan saja'],
    ['Pengukuran iklan', 'Banyak lead masuk tanpa tanda campaign', 'Campaign tercatat otomatis → biaya per lead & per Booking terukur'],
  ];
  out.push({ judul: 'Pentingnya WA satu nomor & AI', isi: L('7 · Langkah ke depan', 9, <>
    <h2>WhatsApp satu nomor + AI Asisten: lead tidak hilang saat serah terima dan terlayani 24 jam</h2>
    <div className="pz-row" style={{ flex: 1 }}>
      <div style={{ flex: 1.55, minWidth: 0 }}><table className="pz-tb s banding"><colgroup><col style={{ width: '19%' }} /><col style={{ width: '40%' }} /><col /></colgroup>
        <thead><tr><th>Aspek</th><th>Sekarang</th><th>Dengan WA satu nomor + AI Asisten</th></tr></thead>
        <tbody>{bandingan.map(([a, b, c]) => <tr key={a}><td className="kiri"><b>{a}</b></td><td className="kiri" style={{ color: '#8A3B26' }}>{b}</td><td className="kiri" style={{ color: '#1E5B45' }}>{c}</td></tr>)}</tbody></table></div>
      <div className="pz-col" style={{ flex: 1 }}>
        <Kartu cls="emas" l="Potensi lead aktif tambahan" v={tambahAktif ? `+${tambahAktif}` : '—'} s={`bila tanggapan lead naik dari ${resp}% ke 50% (${Ld.dioper || 0} lead dioper sejak ${fmtDate(dari)})`} />
        <Kartu l="Lead di luar jam kerja" v={Ld.luarJam?.dari ? `${pLuar}%` : '—'} s="dilayani AI tanpa menunggu sales" />
        <div className="pz-ins" style={{ fontSize: 13 }}><b>Yang dibutuhkan:</b> aktivasi WhatsApp Cloud API di nomor official, biaya percakapan sesuai tarif Meta &amp; pemakaian AI, dan kebijakan sales membalas lead digital dari Inbox WhatsApp CRM.</div></div></div></>) });

  // 9 · Estimasi biaya WhatsApp resmi + AI Asisten (volume dari data project ini, tarif dari lib/presentasi.js)
  const T = TARIF;
  const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
  const blnPeriode = Math.max(0.5, (selisih(hariIni(), dari) + 1) / 30.44);
  const leadBlnB = Math.max(1, Math.round(promo.mulai ? leadSej : (Ld.masuk || 0) / blnPeriode));
  const janjiBln = Math.round(((V.janji || 0) + (V.tanpaJanji || 0)) / blnPeriode) || Math.round(leadBlnB * 0.1);
  const aiBalas = biayaAiPerBalasan(T);
  const hitungBiaya = n => {
    const svc = n * (T.balasanAi + T.balasanSales), svcBayar = Math.max(0, svc - T.serviceGratis);
    const mkt = n * T.templateFu, utl = Math.max(janjiBln * (n / leadBlnB), Math.round(n * 0.1)) * T.pengingatJanji;
    const meta = (svcBayar * T.service + mkt * T.marketing + utl * T.utility) * (1 + T.ppn);
    const ai = n * (T.balasanAi + T.draftFu) * aiBalas;
    return { svc, svcBayar, mkt, utl, meta, ai, total: meta + ai };
  };
  const B1 = hitungBiaya(leadBlnB), B2 = hitungBiaya(leadBlnB * 2);
  const baris = [
    ['Pesan service (balasan AI + sales)', `${leadBlnB} lead × ${T.balasanAi + T.balasanSales} balasan = ${Math.round(B1.svc).toLocaleString('id-ID')} pesan; ${T.serviceGratis.toLocaleString('id-ID')} pertama gratis`, `${rp(T.service)} / pesan`, rp(B1.svcBayar * T.service)],
    ['Template follow up (marketing)', `${T.templateFu} per lead di luar jendela 24 jam = ${Math.round(B1.mkt).toLocaleString('id-ID')} pesan`, `${rp(T.marketing)} / pesan`, rp(B1.mkt * T.marketing)],
    ['Pengingat janji temu (utility)', `${T.pengingatJanji} per janji · ±${Math.round(B1.utl / T.pengingatJanji)} janji/bulan`, `${rp(T.utility)} / pesan`, rp(B1.utl * T.utility)],
    ['PPN 11% atas tarif Meta', '', '', rp((B1.meta / (1 + T.ppn)) * T.ppn)],
    ['AI Asisten (Claude Haiku 4.5)', `${leadBlnB} lead × ${T.balasanAi} balasan + ${T.draftFu} draf follow up`, `±${rp(aiBalas)} / balasan`, rp(B1.ai)],
  ];
  out.push({ judul: 'Estimasi biaya WA & AI', isi: L('7 · Langkah ke depan', 10, <>
    <h2>Estimasi biaya WhatsApp resmi + AI Asisten: ±{rp(Math.ceil(B1.total / 1000) * 1000)} per bulan untuk ±{leadBlnB} lead</h2>
    <div className="pz-row" style={{ flex: 1 }}>
      <div className="pz-col" style={{ flex: 1.6, minWidth: 0 }}>
        <table className="pz-tb s banding"><colgroup><col style={{ width: '25%' }} /><col /><col style={{ width: '17%' }} /><col style={{ width: '15%' }} /></colgroup>
          <thead><tr><th>Biaya bulanan</th><th>Asumsi volume</th><th>Tarif</th><th style={{ textAlign: 'right' }}>Per bulan</th></tr></thead>
          <tbody>{baris.map(([a, b, c, d]) => <tr key={a}><td className="kiri"><b>{a}</b></td><td className="kiri">{b}</td><td className="kiri">{c}</td><td><b>{d}</b></td></tr>)}
            <tr className="t"><td className="kiri">Total per bulan</td><td className="kiri">±{rp(B1.total / leadBlnB)} per lead</td><td></td><td>{rp(B1.total)}</td></tr></tbody></table>
        <table className="pz-tb s banding"><colgroup><col style={{ width: '27%' }} /><col /><col style={{ width: '15%' }} /></colgroup>
          <thead><tr><th>Aktivasi (sekali)</th><th>Keterangan</th><th style={{ textAlign: 'right' }}>Biaya</th></tr></thead>
          <tbody><tr><td className="kiri"><b>WhatsApp Cloud API</b></td><td className="kiri">Daftar langsung di Meta (tanpa vendor/BSP), verifikasi bisnis &amp; nomor official, metode pembayaran di Meta Billing</td><td><b>Rp0</b></td></tr>
            <tr><td className="kiri"><b>Integrasi CRM &amp; AI Asisten</b></td><td className="kiri">Inbox WhatsApp, webhook lead otomatis &amp; AI Asisten sudah dibangun di CRM — tinggal memasang API key</td><td><b>Rp0</b></td></tr></tbody></table></div>
      <div className="pz-col" style={{ flex: 1 }}>
        <Kartu cls="emas" l="Total per bulan" v={rp(Math.ceil(B1.total / 1000) * 1000)} s={`±${leadBlnB} lead/bulan · ±${rp(B1.total / leadBlnB)} per lead`} />
        <Kartu l="Bila lead naik 2×" v={rp(Math.ceil(B2.total / 1000) * 1000)} s={`±${leadBlnB * 2} lead/bulan`} />
        <div className="pz-ins" style={{ fontSize: 12.5 }}>Tarif Meta untuk nomor Indonesia per {T.per} (belum PPN): marketing {rp(T.marketing)}, utility &amp; service {rp(T.service)} per pesan; 1.000 pesan service gratis per nomor per bulan. Percakapan yang dimulai dari iklan klik-ke-WhatsApp mendapat jendela gratis lebih panjang sehingga biaya nyata bisa lebih rendah. AI: Claude Haiku 4.5 (US$1 input · US$5 output per 1 juta token), kurs asumsi {rp(T.kurs)}/US$. Di luar biaya iklan, hosting &amp; database.</div></div></div></>) });
  return out;
}
