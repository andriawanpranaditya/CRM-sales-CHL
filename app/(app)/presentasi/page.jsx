'use client';
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate } from '@/components/util';
import { bolehPresentasi, PROMO, TARIF, biayaAiPerBalasan, PROGRAM_BIO, PROGRAM_PERMAI, pmt } from '@/lib/presentasi';
import { penanggungKinerja } from '@/lib/sales-kinerja';
import { BIO_IRREG } from '@/lib/pricelist';
const BIO_TIPE_A = unit => BIO_IRREG[unit]?.tipe === 'A';

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
  const [dari, setDari] = useState(() => hariIni().slice(0, 4) + '-01-01'); // awal tahun berjalan
  const [ke, setKe] = useState(0);
  const [cetak, setCetak] = useState(false);
  const [teks, setTeks] = useState({});      // kalimat yang sudah diedit (tersimpan di server)
  const [sembunyi, setSembunyi] = useState([]); // id slide yang disembunyikan saat presentasi & PDF
  const [tampil, setTampil] = useState(false); // sedang presentasi layar penuh
  const [edit, setEdit] = useState(false);   // mode edit teks
  const [sunting, setSunting] = useState(null); // { k, isi, diubah }
  useEffect(() => { if (me && bolehPresentasi(me)) api('/api/presentasi?teks=1').then(x => { setTeks(x.teks || {}); setSembunyi(x.sembunyi || []); }).catch(() => {}); }, [me]);
  async function ubahSembunyi(id, jadi) {
    setSembunyi(x => jadi ? [...new Set([...x, id])] : x.filter(y => y !== id)); // langsung terlihat, lalu disimpan
    try { const x = await api('/api/presentasi', { method: 'POST', body: JSON.stringify({ aksi: 'sembunyi', id, sembunyi: jadi }) }); setSembunyi(x.sembunyi || []); } catch (e) { toast(e.message); }
  }
  async function simpanTeks(k, isi) {
    try { const x = await api('/api/presentasi', { method: 'POST', body: JSON.stringify({ aksi: 'teks', k, teks: isi }) }); setTeks(x.teks || {}); setSunting(null); }
    catch (e) { toast(e.message); }
  }
  const panggung = useRef(null);
  const [skala, setSkala] = useState(0.6);
  useEffect(() => { api('/api/auth/me').then(setMe).catch(e => toast(e.message)); }, []);
  useEffect(() => {
    if (!me || !bolehPresentasi(me)) return;
    setData(null);
    Promise.all([api('/api/settings'), ...PROYEK.map(x => Promise.all([api('/api/laporan-penjualan?project=' + encodeURIComponent(x.p)), api(`/api/presentasi?project=${encodeURIComponent(x.p)}&dari=${dari}`)]))])
      .then(([st, ...h]) => setData(h.map(([lp, pr], i) => ({ ...PROYEK[i], lp, pr, promo: PROMO[PROYEK[i].p], akun: st.sales || [], jumlahUnit: (st.units?.[PROYEK[i].p] || []).length })))).catch(e => toast(e.message));
  }, [me, dari]);
  // skala slide mengikuti lebar area
  useEffect(() => {
    const el = panggung.current; if (!el) return;
    const ro = new ResizeObserver(() => setSkala(Math.min(el.clientWidth / 1280, (document.fullscreenElement ? window.innerHeight : 9e9) / 720)));
    ro.observe(el); return () => ro.disconnect();
  }, [data]);
  const slides = useMemo(() => data ? susunSlide(data, dari) : [], [data, dari]);
  const tersembunyi = i => sembunyi.includes(slides[i]?.id);
  const geser = (i, arah) => { let j = i + arah; if (tampil) while (j >= 0 && j < slides.length && tersembunyi(j)) j += arah; return j < 0 || j >= slides.length ? i : j; };
  const terlihat = slides.filter((_, i) => !tersembunyi(i));
  useEffect(() => { const f = () => setTampil(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  useEffect(() => { if (tampil && tersembunyi(ke)) setKe(k => { const j = geser(k, 1); return j !== k ? j : geser(k, -1); }); }, [tampil]); // eslint-disable-line
  useEffect(() => {
    const k = e => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); setKe(i => geser(i, 1)); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setKe(i => geser(i, -1)); }
      if (e.key === 'f' || e.key === 'F') layarPenuh(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [slides.length, tampil, sembunyi]); // eslint-disable-line
  function layarPenuh() { const el = panggung.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); }
  function unduhPdf() { setCetak(true); setTimeout(() => { window.print(); setTimeout(() => setCetak(false), 500); }, 400); }

  if (!me) return <div className="loading">Memuat…</div>;
  if (!bolehPresentasi(me)) return <div className="card"><h2>Presentasi Project</h2><p className="hint">Menu ini khusus akun Head of Sales &amp; Marketing.</p></div>;
  return (<>
    <Toast />
    <div className="page-head pz-head"><div><h1>Presentasi Project</h1><div className="sub">Slide disusun otomatis dari data CRM terkini · Bio District, lalu Permai Indah · panah ← → untuk pindah, F untuk layar penuh</div></div>
      <div className="pz-aksi">
        <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Lead &amp; visitor sejak <input type="date" value={dari} onChange={e => setDari(e.target.value)} /></label>
        <button className={'sort-btn' + (edit ? ' on' : '')} disabled={!slides.length} onClick={() => setEdit(x => !x)} style={edit ? { background: '#C99C4F', color: '#10251E', borderColor: '#C99C4F', fontWeight: 700 } : undefined}>{edit ? '✓ Selesai edit' : '✎ Edit kalimat'}</button>
        <button className="sort-btn" disabled={!slides.length} onClick={unduhPdf}>⬇ Unduh PDF</button>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!terlihat.length} onClick={layarPenuh}>▶ Mulai presentasi</button>
      </div></div>
    {edit && <div className="pz-edbar">✎ Mode edit kalimat — klik teks bergaris putus-putus di slide untuk mengubahnya. Angka, tabel &amp; grafik tetap otomatis dari CRM. Teks yang sudah diubah bergaris emas.</div>}
    <EdCtx.Provider value={{ teks, edit, buka: (k, isi, diubah) => setSunting({ k, isi, diubah }) }}>
    {!data ? <div className="loading">Menyusun slide dari data CRM…</div> : <div className="pz-wrap">
      <div className="card pz-daftar">{slides.map((s, i) => { const h = tersembunyi(i); return (<div key={i} className={'pz-baris' + (h ? ' hidden' : '')}>
        <button className={'pz-item' + (i === ke ? ' on' : '') + (s.bagian ? ' bagian' : '')} onClick={() => setKe(i)}><b>{String(i + 1).padStart(2, '0')}</b><span>{s.judul}</span></button>
        <button className="pz-mata" title={h ? 'Tampilkan lagi saat presentasi' : 'Sembunyikan saat presentasi & PDF'} onClick={() => ubahSembunyi(s.id, !h)}>{h ? '🚫' : '👁'}</button></div>); })}</div>
      <div style={{ minWidth: 0 }}>
        <div ref={panggung} className="pz-panggung" onClick={e => { if (document.fullscreenElement) setKe(i => geser(i, 1)); }}>
          <div className="pz-skala" style={{ transform: `scale(${skala})`, width: 1280, height: 720 }}>{slides[ke]?.isi}</div>
          {!tampil && tersembunyi(ke) && <div className="pz-tanda">🚫 Disembunyikan — tidak tampil saat presentasi &amp; PDF</div>}
        </div>
        <div className="pz-nav"><button className="sort-btn" onClick={() => setKe(i => Math.max(0, i - 1))}>◀ Sebelumnya</button><b>{ke + 1} / {slides.length}</b>{sembunyi.length ? <span className="hint">{slides.length - terlihat.length} disembunyikan · {terlihat.length} tampil saat presentasi</span> : null}<button className="sort-btn" onClick={() => setKe(i => Math.min(slides.length - 1, i + 1))}>Berikutnya ▶</button></div>
        {data.map(P => { const daftar = P.pr.lead?.belumFuList || []; return daftar.length ? (<details key={P.p} className="card pz-cek"><summary><b>{P.nama}: {daftar.length} lead belum di-follow up sales</b> <span className="hint">(untuk dicek, tidak tampil di slide) · lead aktif ≥ 2 hari tanpa catatan FU, janji temu, maupun transaksi</span></summary>
          <div className="tbl-wrap tbl-compact"><table><thead><tr><th>Lead</th><th>Nama</th><th>Masuk</th><th>Sumber</th><th>Sales</th><th>Status</th><th>Diinput oleh</th></tr></thead><tbody>{daftar.map(l => <tr key={l.lead_code}><td><a href={'/leads?lead=' + encodeURIComponent(l.lead_code)}>{l.lead_code}</a></td><td>{l.nama}</td><td>{fmtDate(l.tgl)}</td><td>{l.sumber}</td><td>{l.sales}</td><td>{l.status}</td><td>{l.oleh === 'markom' ? 'Marcom' : l.oleh || '—'}</td></tr>)}</tbody></table></div></details>) : null; })}
      </div></div>}
    {cetak && <div className="pz-cetak">{terlihat.map((s, i) => <div key={i} className="pz-hal">{s.isi}</div>)}</div>}
    </EdCtx.Provider>
    {sunting && <div className="pz-modal" onClick={() => setSunting(null)}><div className="card" onClick={e => e.stopPropagation()}>
      <h3 style={{ marginTop: 0 }}>Ubah kalimat</h3>
      <textarea autoFocus rows={5} value={sunting.isi} onChange={e => setSunting(x => ({ ...x, isi: e.target.value }))} />
      <div className="hint">Teks ini menggantikan kalimat otomatis di slide. Angka di dalam kalimat yang Anda ketik tidak lagi ikut berubah otomatis.</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
        {sunting.diubah && <button className="sort-btn" onClick={() => simpanTeks(sunting.k, null)}>↺ Kembalikan teks otomatis</button>}
        <button className="sort-btn" onClick={() => setSunting(null)}>Batal</button>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => simpanTeks(sunting.k, sunting.isi.trim() || null)}>Simpan</button></div></div></div>}
  </>);
}

// ---------- teks yang bisa diedit (kalimat saja; angka & grafik tetap otomatis) ----------
const EdCtx = createContext({ teks: {}, edit: false, buka: () => {} });
function T({ k, children }) {
  const c = useContext(EdCtx);
  const v = c.teks[k];
  const isi = v != null ? v : children;
  if (!c.edit) return <>{isi}</>;
  return <span className={'pz-ed' + (v != null ? ' diubah' : '')} title="Klik untuk mengubah kalimat" onClick={e => { e.stopPropagation(); c.buka(k, e.currentTarget.innerText, v != null); }}>{isi}</span>;
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
  S.push({ id: 'umum|Cover', judul: 'Cover', bagian: true, isi: (<div className="pz-sl gelap pz-cover"><div className="pz-pad" style={{ justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><img src="/logo.png" alt="" style={{ height: 64 }} /><div><div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '.5px' }}>CIPTA HARMONI LESTARI</div><div className="pz-sub" style={{ fontSize: 13 }}>Sales &amp; Marketing</div></div></div>
    <div><div className="pz-eyebrow" style={{ color: '#E2BE7A' }}><T k="umum|cover.atas">Laporan kinerja project · {BLNP[Number(tgl.slice(5, 7)) - 1]} {tgl.slice(0, 4)}</T></div><h1 className="pz-judul-emas" style={{ fontSize: 58, marginTop: 10 }}><T k="umum|cover.judul">Penjualan, Proses KPR</T><br /><span className="emas"><T k="umum|cover.judul2">&amp; Pemasaran</T></span></h1>
      <div className="pz-sub" style={{ marginTop: 14, fontSize: 18 }}>Bio District · Permai Indah — data CRM per {fmtDate(tgl)}</div></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}><div><div style={{ fontWeight: 700, fontSize: 16 }}>Andriawan</div><div className="pz-sub" style={{ fontSize: 13 }}>Head of Sales &amp; Marketing</div></div>
      <div className="pz-logos"><img src="/logo-bio-putih.png" alt="" style={{ height: 46 }} /><span /><img src="/logo-permai.png" alt="" style={{ height: 50, filter: 'brightness(0) invert(1)' }} /></div></div></div></div>) });
  data.forEach(P => S.push(...slideProyek(P, dari).map(x => ({ ...x, id: `${P.p}|${x.judul}` }))));
  S.push({ id: 'umum|Terima kasih', judul: 'Terima kasih', bagian: true, isi: (<div className="pz-sl gelap pz-cover"><div className="pz-pad" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 22 }}>
    <img src="/logo.png" alt="" style={{ height: 80 }} /><h1 className="pz-judul-emas" style={{ fontSize: 54 }}><span className="emas"><T k="umum|penutup.judul">Terima kasih</T></span></h1><div className="pz-sub" style={{ fontSize: 17 }}>Andriawan · Head of Sales &amp; Marketing · PT Cipta Harmoni Lestari</div>
    <div className="pz-logos"><img src="/logo-bio-putih.png" alt="" style={{ height: 40 }} /><span /><img src="/logo-permai.png" alt="" style={{ height: 44, filter: 'brightness(0) invert(1)' }} /></div></div></div>) });
  return S;
}

function slideProyek(P, dari) {
  const KT = x => `${P.p}|${x}`; // kunci teks yang bisa diedit
  const { lp, pr, promo, nama, logo, logoPutih } = P;
  const K = lp.kumulatif || {}; const rows = (lp.rows || []).filter(r => r.status !== 'Ganti kontrak');
  const pen = K.penjualan || {}; const bb = K.batalBooking || {}; const tahunList = K.perTahun || [];
  const trxTot = tahunList.reduce((a, t) => a + (t.reserved || 0) + t.aktif + t.batalReserved + t.batal, 0);
  const tahunIni = hariIni().slice(0, 4);
  const L = (bab, no, isi) => <Slide bab={bab} logo={logo} proj={nama} no={String(no).padStart(2, '0')}>{isi}</Slide>;
  const out = [];
  // Pembuka bagian
  out.push({ judul: nama, bagian: true, isi: (<div className="pz-sl gelap pz-cover">{promo.latar && <div className="pz-latar" style={{ backgroundImage: `linear-gradient(90deg, rgba(17,62,46,.94) 0%, rgba(17,62,46,.62) 50%, rgba(17,62,46,.12) 100%), url(${promo.latar})` }} />}<div className="pz-pad" style={{ justifyContent: 'center', gap: 20 }}>
    <img src={logoPutih} alt="" style={{ height: 90, alignSelf: 'flex-start', filter: P.p === 'PERMAI INDAH' ? 'brightness(0) invert(1)' : 'none' }} />
    <h1 className="pz-judul-emas" style={{ fontSize: 50 }}>{nama}</h1><div className="pz-sub" style={{ fontSize: 17 }}><T k={KT('pembuka.sub')}>Rekap penjualan · Analisa pembatalan · Penjualan {tahunIni} · Pembayaran berjalan · Lead &amp; visitor · Promo · Langkah ke depan</T></div></div></div>) });

  // 1 · Rekap penjualan
  const maksT = Math.max(1, ...tahunList.map(t => (t.reserved || 0) + t.aktif + t.batalReserved + t.batal));
  out.push({ judul: 'Rekap penjualan', isi: L('1 · Rekap penjualan', 1, <>
    <h2><T k={KT("judul1")}>{pen.n || 0} unit terjual bersih senilai {rpM(pen.nilai)} dari {trxTot} transaksi{tahunList[0] ? ' sejak ' + tahunList[0].tahun : ''}</T></h2>
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
    <h2><T k={KT("judul2")}>{judulBatal}</T></h2>
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
        <div className="pz-ins"><T k={KT("catatan1")}>{kemampuan / Math.max(1, batalBk.length) >= 0.5 || (rvTop && /budget/i.test(rvTop[0]))
          ? <>Pembatalan karena budget/KPR umumnya terjadi setelah konsumen mengetahui <b>hasil BI checking dan plafon KPR</b> — saringan kelayakan perlu dilakukan <b>sebelum</b> tanda jadi.</>
          : <>Pola waktu pembatalan mengarah ke <b>hasil verifikasi bank / SLIK</b> dan syarat KPR yang tidak terpenuhi — kelayakan perlu disaring <b>sebelum</b> kontrak.</>}</T></div></div></div></>) });

  // 3 · Penjualan tahun ini per bulan
  const thn = rows.filter(r => tglJual(r).startsWith(tahunIni));
  const bulanData = BLN.map((_, i) => { const m = `${tahunIni}-${String(i + 1).padStart(2, '0')}`; const x = thn.filter(r => tglJual(r).startsWith(m));
    return [x.filter(r => r.status === 'Booking').length, x.filter(r => r.status === 'Reserved').length, x.filter(r => r.status === 'Batal' && r.tgl_booking).length, x.filter(r => r.status === 'Batal' && !r.tgl_booking).length]; });
  const bookThn = thn.filter(r => r.status === 'Booking'), nilaiThn = bookThn.reduce((a, r) => a + (Number(r.harga) || 0), 0);
  const blnJalan = Number(hariIni().slice(5, 7));
  const iTop = bulanData.reduce((b, x, i) => (x[0] > bulanData[b][0] || (x[0] === bulanData[b][0] && x.reduce((a, c) => a + c, 0) > bulanData[b].reduce((a, c) => a + c, 0))) ? i : b, 0);
  out.push({ judul: `Penjualan ${tahunIni}`, isi: L(`3 · Penjualan ${tahunIni}`, 3, <>
    <h2><T k={KT("judul3")}>{thn.length} transaksi Januari–{BLNP[blnJalan - 1]} {tahunIni}; {bookThn.length} masih berjalan, terbaik di {BLNP[iTop]}</T></h2><Legenda /><Kolom data={bulanData} />
    <div className="pz-k3"><Kartu l={`Booking berjalan ${tahunIni}`} v={bookThn.length} s={rpM(nilaiThn)} /><Kartu l="Rata-rata per bulan" v={(bookThn.length / blnJalan).toLocaleString('id-ID', { maximumFractionDigits: 1 })} s="unit bersih / bulan" /><Kartu cls="emas" l="Bulan terbaik" v={BLN[iTop]} s={`${bulanData[iTop][0]} unit bersih · ${bulanData[iTop].reduce((a, c) => a + c, 0)} transaksi`} /></div></>) });

  const idxBanding = out.length; // slide perbandingan dengan tahun lalu disisipkan tepat setelah grafik Penjualan
  const proses = rows.filter(r => r.proses_kpr).map(r => { const kb = pr.kprBaru?.[r.lead_code] || {}; const upd = kb.logTgl || kb.update || r.kpr?.updated_at || '';
    return { r, upd, teks: kb.log || [r.kpr?.label, kb.catatan || r.kpr?.catatan].filter(Boolean).join(' · ') || 'Belum ada catatan', bank: (r.kpr?.banks || []).join(', ') || '—', lama: upd ? selisih(hariIni(), upd) : 999 }; })
    .sort((a, b) => b.lama - a.lama);
  const basi = proses.filter(x => x.lama > 7).length;
  const cicil = rows.filter(r => r.status === 'Booking' && /bertahap|cicil/i.test(r.bayar || r.cara_bayar || '')).map(r => { const n = Number(r.cicilan) || Number(String(r.cara_bayar || '').match(/(\d+)\s*x/i)?.[1]) || 0;
    const jalan = Math.max(0, Math.min(n || 99, Math.floor(selisih(hariIni(), r.tgl_booking) / 30))); return { r, n, jalan }; });
  // 3b · Detail transaksi tahun ini (dibagi ke beberapa slide bila panjang)
  const urutThn0 = [...thn].sort((a, b) => tglJual(a).localeCompare(tglJual(b)));
  // Mode gabung: pembayaran yang masih berjalan dari kontrak sebelum tahun ini ikut ditampilkan di akhir tabel
  const kunciThn = new Set(thn.map(r => r.lead_code + '|' + r.unit));
  const bayarLama = promo.gabungBayar ? [...proses.map(x => x.r), ...cicil.map(x => x.r)].filter(r => !kunciThn.has(r.lead_code + '|' + r.unit)).sort((a, b) => tglJual(a).localeCompare(tglJual(b))).map(r => ({ ...r, _lama: true })) : [];
  const urutThn = [...urutThn0, ...bayarLama];
  const asalLead = r => /^import/i.test(r.sumber || '') ? 'Buku penjualan' : [r.sumber, r.walkin_info ? 'tahu dari ' + r.walkin_info : '', r.campaign].filter(Boolean).join(' · ') || '—';
  const gabung = !!promo.gabungBayar;
  const kprOf = Object.fromEntries(proses.map(x => [x.r.lead_code + '|' + x.r.unit, x]));
  const cicOf = Object.fromEntries(cicil.map(x => [x.r.lead_code + '|' + x.r.unit, x]));
  const kunciR = r => r.lead_code + '|' + r.unit;
  const ketBayar = r => { const kx = kprOf[kunciR(r)], cx = cicOf[kunciR(r)];
    if (kx) return `${kx.teks}${kx.bank !== '—' ? ' · ' + kx.bank : ''}`;
    if (cx) return `Cash bertahap${cx.n ? ' ' + cx.n + '×' : ''} · angsuran ±${cx.jalan}${cx.n ? '/' + cx.n : ''}`;
    return null; };
  const ketTrx0 = r => r.status === 'Batal' ? `Batal ${tglPendek(r.tgl_batal)}${r.tgl_batal ? ' ' + r.tgl_batal.slice(0, 4) : ''}${r.alasan_batal ? ' — ' + String(r.alasan_batal).replace(/\s*·\s*(Non-refund|Refund)$/i, ' ($1)') : ''}` : (r.update_terakhir || '—');
  const ketTrx = r => (gabung && r.status !== 'Batal' && ketBayar(r)) || ketTrx0(r);
  const statusTrx = r => r.status === 'Batal' ? (r.tgl_booking ? 'Batal (Booking)' : 'Batal (Reserved)') : r.status_tampil === 'Akad' ? 'Akad' : r.status === 'Reserved' ? 'Reserved' : 'Booking';
  const warnaSt = { 'Batal (Booking)': R, 'Batal (Reserved)': '#C0645A', Akad: '#0F5A3A', Booking: G, Reserved: '#8A5F14' };
  const tinggiTrx = r => 12 + 15 * Math.max(2, Math.ceil(ketTrx(r).length / 44) + (gabung && kprOf[kunciR(r)] && r.status !== 'Batal' ? 1 : 0), Math.ceil(asalLead(r).length / 22), Math.ceil(String(r.nama).length / 20), (r.tgl_reserved && r.tgl_booking) ? 2 : 1);
  const halTrx = []; { let cur = [], isi = 0; urutThn.forEach(x => { const t = tinggiTrx(x); if (cur.length && isi + t > (gabung && !halTrx.length ? 320 : 480)) { halTrx.push(cur); cur = []; isi = 0; } cur.push(x); isi += t; }); if (cur.length) halTrx.push(cur); }
  let noTrx = 0;
  // Rincian transaksi tahun ini yang masih berjalan — jumlahnya selalu = Booking berjalan tahun ini
  const jalanThn = thn.filter(r => r.status === 'Booking');
  const jAkad = jalanThn.filter(r => r.akad || r.status_tampil === 'Akad');
  const jCicil = jalanThn.filter(r => !jAkad.includes(r) && /bertahap|cicil/i.test(r.bayar || r.cara_bayar || ''));
  const jKpr = jalanThn.filter(r => !jAkad.includes(r) && !jCicil.includes(r) && /kpr/i.test(r.bayar || r.cara_bayar || ''));
  const jLain = jalanThn.filter(r => !jAkad.includes(r) && !jCicil.includes(r) && !jKpr.includes(r));
  const jBasi = jKpr.filter(r => (kprOf[kunciR(r)]?.lama || 0) > 7).length;
  const resvThn = thn.filter(r => r.status === 'Reserved').length;
  const rincianJalan = [jAkad.length ? `${jAkad.length} sudah akad` : '', jKpr.length ? `${jKpr.length} proses KPR` : '', jCicil.length ? `${jCicil.length} cicilan bertahap` : '', jLain.length ? `${jLain.length} cash/lainnya` : ''].filter(Boolean).join(' · ');
  const lamaCicil = bayarLama.filter(r => cicOf[kunciR(r)]).length, lamaKpr = bayarLama.filter(r => kprOf[kunciR(r)]).length;
  halTrx.forEach((hal, h) => out.push({ judul: (gabung ? `Transaksi ${tahunIni} & pembayaran` : `Detail transaksi ${tahunIni}`) + (halTrx.length > 1 ? ` (${h + 1}/${halTrx.length})` : ''), isi: L(gabung ? '3 · Transaksi & pembayaran berjalan' : `3 · Penjualan ${tahunIni}`, h ? `3.${h + 2}` : '3.2', <>
    <h2>{h ? <>{gabung ? 'Transaksi & pembayaran' : 'Detail transaksi'} {tahunIni} — lanjutan ({h + 1}/{halTrx.length})</> : <T k={KT('detail.judul2')}>{thn.length} transaksi {tahunIni}: {bookThn.length} masih berjalan{gabung && rincianJalan ? ` (${rincianJalan})` : ''}, {thn.filter(r => r.status === 'Batal').length} batal{resvThn ? `, ${resvThn} masih Reserved` : ''}</T>}</h2>
    {gabung && !h && <div className="pz-k4"><Kartu cls="emas" l={`Masih berjalan ${tahunIni}`} v={`${jalanThn.length} unit`} s={rincianJalan || '—'} />
      <Kartu l="Sudah akad" v={jAkad.length} s={`dari ${jAkad.length + jKpr.length} Booking KPR ${tahunIni}`} />
      <Kartu l="Proses KPR" v={jKpr.length} vs={{ color: jBasi ? R : undefined }} s={`${jBasi ? jBasi + ' tanpa update > 7 hari' : 'semua ter-update dalam 7 hari'}${lamaKpr ? ` · +${lamaKpr} dari kontrak sebelum ${tahunIni}` : ''}`} />
      <Kartu l="Cicilan bertahap" v={jCicil.length} s={`angsuran berjalan${lamaCicil ? ` · +${lamaCicil} dari kontrak sebelum ${tahunIni}` : ''}`} /></div>}
    <table className="pz-tb s detail"><colgroup><col style={{ width: '3.5%' }} /><col style={{ width: '15%' }} /><col style={{ width: '14%' }} /><col style={{ width: '9%' }} /><col style={{ width: '11%' }} /><col style={{ width: '9%' }} /><col style={{ width: '11%' }} /><col /></colgroup>
      <thead><tr><th>No</th><th>Konsumen</th><th>Asal lead</th><th>Tanggal</th><th>Unit</th><th>Sales</th><th>Status</th><th>Keterangan</th></tr></thead>
      <tbody>{hal.map((r, ix) => { noTrx++; const st = statusTrx(r); const pisah = r._lama && (ix === 0 ? true : !hal[ix - 1]._lama); return (<Fragment key={r.lead_code + r.unit + (r.seg || 0) + (r._lama ? 'L' : '')}>{pisah && <tr><td colSpan={8} className="kiri" style={{ background: '#F5F2EA', fontWeight: 700 }}>Kontrak sebelum {tahunIni} yang pembayarannya masih berjalan</td></tr>}<tr>
        <td>{noTrx}</td><td className="kiri"><b>{r.nama}</b></td><td className="kiri">{asalLead(r)}</td>
        <td className="kiri">{r.tgl_reserved ? <>R {tglPendek(r.tgl_reserved)}<br /></> : null}{r.tgl_booking ? <>B {tglPendek(r.tgl_booking)}{r._lama ? ' ' + r.tgl_booking.slice(0, 4) : ''}</> : null}</td>
        <td className="kiri">{r.unit}{r.tipe ? <span className="pz-sub" style={{ fontSize: 10.5, display: 'block' }}>{String(r.tipe).replace(/^TIPE\s*/i, 'Tipe ')}</span> : null}</td>
        <td className="kiri">{penanggungKinerja({ project: P.p, sales: r.sales, tgl: tglJual(r) }, P.akun || [])}</td>
        <td className="kiri"><b style={{ color: warnaSt[st] }}>{st}</b>{r.harga ? <span className="pz-sub" style={{ fontSize: 10.5, display: 'block' }}>{rpM(r.harga)}</span> : null}</td>
        <td className="kiri" style={{ color: kprOf[kunciR(r)]?.lama > 7 && r.status !== 'Batal' ? '#8A3B26' : undefined }}>{ketTrx(r)}{gabung && kprOf[kunciR(r)] && r.status !== 'Batal' ? <span className="pz-sub" style={{ fontSize: 10.5, display: 'block', color: kprOf[kunciR(r)].lama > 7 ? R : undefined }}>update {kprOf[kunciR(r)].upd ? tglPendek(kprOf[kunciR(r)].upd) : '—'}</span> : null}</td></tr></Fragment>); })}</tbody></table>
    {h === halTrx.length - 1 && <div className="pz-sub" style={{ fontSize: 11.5 }}>R = tanggal Reserved · B = tanggal Booking · Batal (Booking) = batal setelah Booking · Batal (Reserved) = batal saat Reserved · "Buku penjualan" = kontrak dari data penjualan resmi (bukan lead CRM).</div>}</>) }));

  // 4 · Pembayaran berjalan
  // Bagi tabel ke beberapa slide menurut perkiraan tinggi baris (teks update tidak dipotong)
  const barisTeks = x => Math.max(1, Math.ceil(String(x.teks).length / 88), Math.ceil(String(x.r.nama).length / 30), Math.ceil(String(x.bank).length / 22));
  const tinggiBaris = x => 16 + 17 * barisTeks(x); // px perkiraan
  const halaman = []; { let cur = [], isi = 0; const kap = [330, 440]; proses.forEach(x => { const t = tinggiBaris(x); if (cur.length && isi + t > kap[halaman.length ? 1 : 0]) { halaman.push(cur); cur = []; isi = 0; } cur.push(x); isi += t; }); if (cur.length || !halaman.length) halaman.push(cur); }
  const halKpr = halaman.length;
  const awalNo = h => halaman.slice(0, h).reduce((a, x) => a + x.length, 0) + 1;
  const tabelKpr = (daftar, mulaiNo) => (<table className="pz-tb s kpr"><colgroup><col style={{ width: '4%' }} /><col style={{ width: '22%' }} /><col style={{ width: '15%' }} /><col /><col style={{ width: '9%' }} /></colgroup>
    <thead><tr><th>No</th><th>Konsumen</th><th>Bank</th><th>Update terakhir (catatan &amp; riwayat KPR)</th><th title="merah = lebih dari 7 hari tanpa update">Tanggal</th></tr></thead>
    <tbody>{daftar.map((x, i) => <tr key={x.r.lead_code + x.r.unit}><td>{mulaiNo + i}</td><td className="kiri">{x.r.nama}</td><td className="kiri">{x.bank}</td><td className="kiri">{x.teks}</td><td style={{ color: x.lama > 7 ? R : undefined }}>{x.upd ? tglPendek(x.upd) : '—'}</td></tr>)}</tbody></table>);
  if (!gabung) out.push({ judul: 'Pembayaran berjalan', isi: L('4 · Pembayaran berjalan', 4, <>
    <h2><T k={KT("judul4")}>{pen.akad || 0} sudah akad; {proses.length} masih proses KPR{basi ? ` — ${basi} belum ada update lebih dari 7 hari` : ''}{cicil.length ? ` · ${cicil.length} cicilan bertahap berjalan` : ''}</T></h2>
    <div className="pz-k4"><Kartu cls="emas" l="Sudah akad" v={`${pen.akad || 0} unit`} s={`dari ${pen.kpr || 0} konsumen KPR`} /><Kartu l="Proses KPR" v={proses.length} s={`${proses.filter(x => /sp3k/i.test(x.r.kpr?.label || '')).length} SP3K terbit · ${proses.filter(x => !(x.r.kpr?.banks || []).length).length} belum ada bank`} />
      <Kartu l="Tanpa update > 7 hari" v={basi} vs={{ color: basi ? R : undefined }} s="tanggal merah di tabel · konfirmasi ke bank / AO" /><Kartu l="Cicilan bertahap" v={cicil.length} s={cicil.length ? 'angsuran (perkiraan): ' + cicil.map(x => `${x.r.nama.split(' ')[0]} ±${x.jalan}/${x.n || '?'}`).join(' · ') : 'tidak ada'} /></div>
    {tabelKpr(halaman[0], 1)}
    {halKpr > 1 ? <div className="pz-sub" style={{ fontSize: 12 }}>Berlanjut ke slide berikutnya ({proses.length - halaman[0].length} konsumen lagi) · diurutkan dari yang paling lama tidak di-update · tanggal merah = lebih dari 7 hari</div>
      : null}</>) });
  if (!gabung) for (let h = 1; h < halKpr; h++) out.push({ judul: `Proses KPR (lanjutan ${h + 1}/${halKpr})`, isi: L('4 · Pembayaran berjalan', `4.${h + 1}`, <>
    <h2><T k={KT("judul5")}>Proses KPR — lanjutan ({h + 1}/{halKpr})</T></h2>{tabelKpr(halaman[h], awalNo(h))}
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
    <h2><T k={KT("judul6")}>{Ld.masuk || 0} lead masuk sejak {fmtDate(dari)}; {Ld.aktif || 0} masih di-follow up{Ld.dioper ? `, ${pCold}% lead yang dioper belum menanggapi` : ''}</T></h2>
    <div className="pz-k4"><Kartu l="Lead masuk" v={Ld.masuk || 0} s={`${Ld.marcom || 0} dari Marcom · ${Ld.dioper || 0} dipegang sales`} /><Kartu l="Masih di-follow up" v={Ld.aktif || 0} s={`${Ld.aktifFu7 || 0} disentuh dalam 7 hari (${pFu}%)`} />
      <Kartu cls="emas" l="Visitor" v={V.total || 0} s={`${V.walkin || 0} walk in · ${V.janji || 0} janji temu · ${V.tanpaJanji || 0} tanpa janji`} /><Kartu l="Lead → transaksi" v={Ld.transaksi ?? Ld.booking ?? 0} s={`Reserved/Booking · ${persen(Ld.transaksi ?? Ld.booking ?? 0, Ld.masuk)}% dari lead masuk · ${Ld.transaksiJalan ?? Ld.booking ?? 0} masih berjalan`} /></div>
    <div className="pz-row" style={{ flex: 1 }}><div className="pz-box" style={{ flex: 1.3 }}><b>Kenapa lead masuk tapi diam</b><ol className="pz-ol">{diam.map((x, i) => <li key={i}><T k={KT('diam' + i)}>{x}</T></li>)}</ol></div>
      <div className="pz-col" style={{ flex: 1 }}><div className="pz-ins"><T k={KT("catatan2")}>{pFu >= 80 ? <>Disiplin follow up sudah baik (<b>{pFu}%</b> lead aktif disentuh dalam 7 hari). Masalahnya ada di <b>serah terima</b> dan <b>kualitas lead</b>, bukan kecepatan.</> : <><b>{100 - pFu}%</b> lead aktif tidak disentuh dalam 7 hari — jadwal follow up wajib perlu ditegakkan.</>}</T></div>
        {(() => { const KS = Ld.kualitasSumber || []; const atas = KS.slice(0, 5), sisa = KS.slice(5); const jum = (a, k) => a.reduce((x, o) => x + (o[k] ?? 0), 0);
          const trxK = o => o.trx ?? o.booking ?? 0;
          return <table className="pz-tb s xs"><thead><tr><th>Sumber lead</th><th>Lead</th><th>Warm+</th><th>Transaksi</th></tr></thead><tbody>
            {atas.map(o => <tr key={o.sumber}><td>{o.sumber}</td><td>{o.lead}</td><td>{o.warm} <span className="pz-sub" style={{ fontSize: 11 }}>({persen(o.warm, o.lead)}%)</span></td><td><b>{trxK(o)}</b></td></tr>)}
            {sisa.length > 0 && <tr><td>Lainnya ({sisa.length} sumber)</td><td>{jum(sisa, 'lead')}</td><td>{jum(sisa, 'warm')}</td><td><b>{sisa.reduce((x, o) => x + trxK(o), 0)}</b></td></tr>}
            <tr className="t"><td>Total</td><td>{jum(KS, 'lead')}</td><td>{jum(KS, 'warm')}</td><td>{KS.reduce((x, o) => x + trxK(o), 0)}</td></tr></tbody></table>; })()}</div></div></>) });

  // 5b · Pergerakan lead, janji temu & visitor per bulan + funnel
  const PG0 = pr.pergerakan || [], FN = pr.funnel || {};
  // Transaksi (Reserved/Booking) pada periode = kunjungan yang menjadi transaksi (tanggal transaksi dihitung sebagai tanggal kunjungan)
  const trxP = rows.filter(r => tglJual(r) >= dari && tglJual(r) <= hariIni()).sort((a, b) => tglJual(b).localeCompare(tglJual(a)));
  const PG = PG0.map(x => ({ ...x, reserved: 0, booking: trxP.filter(r => tglJual(r).startsWith(x.bulan)).length }));
  const kunjungan = FN.kunjungan ?? V.total ?? 0;
  const mxPg = Math.max(1, ...PG.map(x => Math.max(x.lead, x.janji, x.visitor, x.reserved + x.booking)));
  const SERI = [['lead', 'Lead masuk', '#9DB8AC'], ['janji', 'Membuat janji temu', E], ['visitor', 'Kunjungan (visitor)', G], ['rb', 'Reserved / Booking', R]];
  out.push({ judul: 'Pergerakan lead & visitor', isi: L('5 · Lead & visitor', '5.2', <>
    <h2><T k={KT("judul7")}>Pergerakan sejak {fmtDate(dari)}: {FN.masuk || 0} lead masuk → {FN.janji || 0} janji temu → {kunjungan} kunjungan → {trxP.length} Reserved/Booking</T></h2>
    <div className="pz-leg">{SERI.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l}</span>)}</div>
    <div className="pz-grup">{PG.map(x => { const v = { lead: x.lead, janji: x.janji, visitor: x.visitor, rb: x.reserved + x.booking }; return (<div key={x.bulan} className="g">
      <div className="bars">{SERI.map(([k, , c]) => <div key={k} className="b" style={{ height: Math.max(2, v[k] / mxPg * 200), background: c }}><b>{v[k]}</b></div>)}</div>
      <span>{PG.length > 4 ? BLN[Number(x.bulan.slice(5, 7)) - 1] : `${BLNP[Number(x.bulan.slice(5, 7)) - 1]} ${x.bulan.slice(0, 4)}`}</span></div>); })}</div>
    <div className="pz-funnel">{[['Lead masuk', FN.masuk, 'lead periode ini'], ['Dipegang sales', FN.dioper, `${persen(FN.dioper || 0, FN.masuk || 0)}% dari lead masuk`], ['Ada janji temu', FN.janji, `${persen(FN.janji || 0, FN.masuk || 0)}% dari lead masuk`],
      ['Kunjungan (visitor)', kunjungan, 'walk in, janji temu & transaksi'], ['Reserved / Booking', trxP.length, `${persen(trxP.length, kunjungan)}% dari kunjungan`], ['Booking berjalan', trxP.filter(r => r.status === 'Booking').length, `${persen(trxP.filter(r => r.status === 'Booking').length, trxP.length)}% dari Reserved/Booking`]].map(([l, v, ket]) =>
      <div key={l} className="f"><span>{l}</span><b>{v || 0}</b><em>{ket}</em></div>)}</div>
    <div className="pz-sub" style={{ fontSize: 12 }}>Periode {fmtDate(dari)} – hari ini. Lead masuk & janji temu dihitung per lead (sekali, di bulan pertama janjinya). Kunjungan = semua visitor (walk in, janji temu, datang tanpa janji, dan saat Reserved/Booking) — sama dengan slide Lead &amp; visitor. Reserved/Booking = transaksi pada periode; tanggal transaksi dihitung sebagai tanggal kunjungan. Jumlah per bulan = angka di bawahnya.</div></>) });

  // 5c · Kunjungan yang menjadi Reserved / Booking (asumsi: setiap transaksi = kunjungan pada tanggal transaksinya)
  const warnaS = { Batal: R, Booking: G, Reserved: '#8A5F14' };
  out.push({ judul: 'Visitor → Reserved/Booking', isi: L('5 · Lead & visitor', '5.3', <>
    <h2><T k={KT('visitor.judul')}>{kunjungan} kunjungan sejak {fmtDate(dari)}; {trxP.length} di antaranya menjadi Reserved / Booking ({persen(trxP.length, kunjungan)}%)</T></h2>
    <div className="pz-k4"><Kartu l="Walk in" v={V.walkin || 0} s={(V.perInfo || []).slice(0, 2).map(([k, n]) => `${k} ${n}`).join(' · ') || 'datang langsung'} /><Kartu l="Janji temu & tanpa janji" v={(V.janji || 0) + (V.tanpaJanji || 0)} s={`${V.janji || 0} sesuai janji · ${V.tanpaJanji || 0} tanpa janji`} />
      <Kartu l="Saat Reserved / Booking" v={V.trx || 0} s="kunjungan yang langsung bertransaksi" /><Kartu cls="emas" l="Kunjungan → Reserved/Booking" v={`${trxP.length} / ${kunjungan}`} s={`${trxP.filter(r => r.status !== 'Batal').length} masih berjalan · ${trxP.filter(r => r.status === 'Batal').length} batal`} /></div>
    <table className="pz-tb s"><colgroup><col style={{ width: '20%' }} /><col style={{ width: '19%' }} /><col style={{ width: '11%' }} /><col style={{ width: '12%' }} /><col style={{ width: '14%' }} /><col /></colgroup>
      <thead><tr><th>Konsumen ({trxP.length} transaksi)</th><th>Asal lead</th><th>Kunjungan</th><th>Status sekarang</th><th>Unit</th><th>Sales</th></tr></thead>
      <tbody>{trxP.slice(0, 7).map((x, i) => <tr key={i}><td className="kiri">{x.nama}</td><td className="kiri">{asalLead(x)}</td><td>{tglPendek(tglJual(x))}</td><td><b style={{ color: warnaS[x.status] || G }}>{x.status_tampil || x.status}</b></td><td className="kiri">{x.unit}</td><td className="kiri">{penanggungKinerja({ project: P.p, sales: x.sales, tgl: tglJual(x) }, P.akun || [])}</td></tr>)}
        {!trxP.length && <tr><td colSpan={6} className="kiri">Belum ada transaksi pada periode ini.</td></tr>}</tbody></table>
    {trxP.length > 7 && <span className="pz-sub" style={{ fontSize: 12 }}>7 transaksi terbaru ditampilkan · +{trxP.length - 7} lainnya ada di slide Detail transaksi</span>}</>) });

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
    {pk.catatan && <div className="pz-ins" style={{ fontSize: 13 }}><T k={KT("catatan3")}>{pk.catatan}</T></div>}</div>);
  if (promo.flyerSales) {
    out.push({ judul: 'Promo sales & agent', isi: L('6 · Promo berjalan', 6, <><h2><T k={KT("judul9")}>{promo.headline || promo.nama}</T></h2>
      <div className="pz-row" style={{ flex: 1 }}>{panelSales}<Flyer src={promo.flyerSales} /></div></>) });
    out.push({ judul: 'Promo konsumen', isi: L('6 · Promo berjalan', '6.2', <><h2><T k={KT("judul10")}>{pk.judul}: {(pk.hadiah || []).map(h => h[1]).join(' · ')}</T></h2>
      <div className="pz-row" style={{ flex: 1 }}>{panelKonsumen}<Flyer src={promo.flyerKonsumen} /></div></>) });
  } else {
    out.push({ judul: 'Promo berjalan', isi: L('6 · Promo berjalan', 6, <><h2><T k={KT("judul11")}>{promo.headline || promo.nama}</T></h2>
      <div className="pz-row" style={{ flex: 1 }}><div className="pz-col" style={{ flex: 1 }}>{panelSales}{panelKonsumen}</div><Flyer src={promo.flyerKonsumen} /></div></>) });
  }

  // 7 · Dampak promo
  const mulai = promo.mulaiDampak || promo.mulai || `${tahunIni}-01-01`;
  const bookSejak = rows.filter(r => r.status === 'Booking' && (r.tgl_booking || '') >= mulai);
  const bookSebelum = rows.filter(r => r.status === 'Booking' && (r.tgl_booking || '') >= `${tahunIni}-01-01` && (r.tgl_booking || '') < mulai);
  // lama periode dalam bulan (hari ÷ 30,44) — supaya promo yang baru berjalan 1–2 bulan dibandingkan adil
  const blnSebelum = Math.max(1, selisih(mulai, `${tahunIni}-01-01`) / 30.44), blnSejak = Math.max(0.5, (selisih(hariIni(), mulai) + 1) / 30.44);
  const rSeb = promo.mulai ? bookSebelum.length / blnSebelum : 0, rSej = bookSejak.length / blnSejak;
  const leadBln = Object.fromEntries(Ld.perBulan || []);
  const leadSeb = promo.mulai ? Object.entries(leadBln).filter(([m]) => m < mulai.slice(0, 7)).reduce((a, [, n]) => a + n, 0) / blnSebelum : 0;
  const leadSej = Object.entries(leadBln).filter(([m]) => m >= mulai.slice(0, 7)).reduce((a, [, n]) => a + n, 0) / blnSejak;
  const f1 = x => x.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  // Ringkasan penjualan sejak start (pengganti perbandingan tahun lalu untuk project yang baru mulai) — setelah slide Penjualan
  if (promo.ringkasanPenjualan) {
    const urutTgl = rows.map(tglJual).filter(Boolean).sort(), mulaiJual = urutTgl[0] || `${tahunIni}-01-01`;
    const jalanAll = rows.filter(r => r.status !== 'Batal'), batalAll = rows.filter(r => r.status === 'Batal');
    const akadAll = jalanAll.filter(r => r.akad || r.status_tampil === 'Akad').length;
    const nilaiJalan = jalanAll.reduce((a, r) => a + (Number(r.harga) || 0), 0);
    const tahunL = [...new Set(urutTgl.map(t => t.slice(0, 4)))];
    const perTh = tahunL.map(y => { const d = rows.filter(r => tglJual(r).startsWith(y)); const j = d.filter(r => r.status !== 'Batal');
      return { y, label: y === mulaiJual.slice(0, 4) && mulaiJual.slice(5, 7) !== '01' ? `${BLN[Number(mulaiJual.slice(5, 7)) - 1]}–Des ${y} (start)` : y === tahunIni ? `${y} (s.d. ${BLN[Number(hariIni().slice(5, 7)) - 1]})` : y,
        n: d.length, jalan: j.length, batal: d.length - j.length, nilai: j.reduce((a, r) => a + (Number(r.harga) || 0), 0) }; });
    const thnJalan = thn.filter(r => r.status !== 'Batal').length;
    out.splice(idxBanding, 0, { judul: 'Ringkasan penjualan', isi: L('3 · Ringkasan penjualan', '3.1', <>
      <h2><T k={KT('ringkas.judul')}>{`Ringkasan penjualan sejak ${namaBln(mulaiJual.slice(0, 7))}: ${jalanAll.length} unit berjalan senilai ${rpM(nilaiJalan)} — ${akadAll} sudah akad, ${proses.length} proses KPR`}</T></h2>
      <div className="pz-k4"><Kartu l="Total transaksi" v={rows.length} s={`sejak start penjualan ${namaBln(mulaiJual.slice(0, 7))}`} />
        <Kartu cls="emas" l="Masih berjalan" v={`${jalanAll.length} unit`} s={`${rpM(nilaiJalan)} · ${akadAll} akad · ${proses.length} proses KPR`} />
        <Kartu l="Batal" v={batalAll.length} vs={{ color: R }} s={`${persen(batalAll.length, rows.length)}% dari transaksi${nTop / Math.max(1, batalBk.length) >= 0.4 ? ` · ${nTop} dari kontrak ${namaBln(blnTop)}` : ''}`} />
        <Kartu l={`Berjalan ${tahunIni}`} v={`${thnJalan} dari ${thn.length}`} s={`${persen(thnJalan, thn.length)}% transaksi ${tahunIni} bertahan`} /></div>
      <div className="pz-row" style={{ flex: 1 }}>
        <div className="pz-box" style={{ flex: 1.2 }}><b>Per periode penjualan</b>
          <table className="pz-tb s"><thead><tr><th>Periode</th><th>Transaksi</th><th>Masih berjalan</th><th>Batal</th><th>Nilai berjalan</th></tr></thead>
            <tbody>{perTh.map(x => <tr key={x.y}><td className="kiri">{x.label}</td><td>{x.n}</td><td><b>{x.jalan}</b></td><td>{x.batal}</td><td>{rpM(x.nilai)}</td></tr>)}
              <tr className="t"><td className="kiri">Total</td><td>{rows.length}</td><td>{jalanAll.length}</td><td>{batalAll.length}</td><td>{rpM(nilaiJalan)}</td></tr></tbody></table></div>
        <div className="pz-col" style={{ flex: 1 }}><div className="pz-ins" style={{ fontSize: 13.5 }}><T k={KT('ringkas.catatan')}>{`Pola utama: ${nTop / Math.max(1, batalBk.length) >= 0.4 ? `pembatalan terpusat pada kontrak ${namaBln(blnTop)} (${nTop} dari ${batalBk.length}); ` : ''}sepanjang ${tahunIni} ${persen(thnJalan, thn.length)}% transaksi bertahan. Tantangan berikutnya: ${proses.length} konsumen proses KPR belum akad dan pembeli yang tidak lolos KPR subsidi.`}</T></div></div></div></>) });
  }
  if (promo.bandingTahunLalu) {
    // Transaksi tahun ini (promo hadiah sejak Januari) dibanding setahun penuh tahun lalu — sama dengan tabel per tahun di Rekap penjualan
    const thLalu = String(Number(tahunIni) - 1);
    const ujung = hariIni();
    const diTh = (r, th) => tglJual(r).startsWith(th);
    const ini = rows.filter(r => diTh(r, tahunIni) && tglJual(r) >= mulai), lalu = rows.filter(r => diTh(r, thLalu));
    const bk = L0 => L0.filter(r => r.tgl_booking), jl = L0 => L0.filter(r => r.status === 'Booking');
    const nilai = L0 => jl(L0).reduce((s0, r) => s0 + (Number(r.harga) || 0), 0);
    const isA = r => /TIPE\s*A\b/i.test(r.tipe || '') || BIO_TIPE_A(r.unit);
    const tipeA = L0 => L0.filter(isA).length, jalanA = L0 => L0.filter(r => isA(r) && r.status === 'Booking').length, batalA = L0 => L0.filter(r => isA(r) && r.status === 'Batal').length;
    const batalARv = L0 => L0.filter(r => isA(r) && r.status === 'Batal' && !r.tgl_booking).length;
    const teksA = L0 => { const n = tipeA(L0), j = jalanA(L0), b = batalA(L0); return n ? `${n} (${[j ? j + ' berjalan' : '', b ? b + ' batal' : ''].filter(Boolean).join(', ')})` : '0'; };
    const naik = (x, y) => y ? Math.round((x - y) / y * 100) : (x ? 100 : 0);
    const pct = (x, y) => { const n = y ? (x - y) / y * 100 : (x ? 100 : 0); return `${n >= 0 ? '+' : ''}${Math.abs(n) < 10 ? n.toLocaleString('id-ID', { maximumFractionDigits: 1 }) : Math.round(n)}%`; };
    const bulanBanding = BLN.map((b, k) => { const mm = String(k + 1).padStart(2, '0'); return { b, lalu: lalu.filter(r => tglJual(r).slice(5, 7) === mm).length, ini: ini.filter(r => tglJual(r).slice(5, 7) === mm).length, nanti: `${tahunIni}-${mm}` > ujung.slice(0, 7) }; });
    const mxB = Math.max(1, ...bulanBanding.map(x => Math.max(x.lalu, x.ini)));
    const dHadiah = {}; jl(ini).forEach(r => { const h = promo.hadiahUnit ? promo.hadiahUnit(r.tipe, r.unit, r.tgl_booking) : '—'; dHadiah[h] = (dHadiah[h] || 0) + 1; });
    const rata = L0 => jl(L0).length ? nilai(L0) / jl(L0).length : 0;
    const baris = [['Transaksi (termasuk batal)', lalu.length, ini.length], ['Booking', bk(lalu).length, bk(ini).length], ['Booking masih berjalan', jl(lalu).length, jl(ini).length],
      ['Nilai penjualan berjalan', nilai(lalu), nilai(ini), true], ['Rata-rata nilai per unit', rata(lalu), rata(ini), true], ['Transaksi Tipe A', tipeA(lalu), tipeA(ini), false, teksA(lalu), teksA(ini)]];
    out.splice(idxBanding, 0, { judul: `Penjualan ${tahunIni} vs ${thLalu}`, isi: L(`3 · Penjualan ${tahunIni} vs ${thLalu}`, '3.1', <>
      <h2><T k={KT('banding.judul')}>{ini.length >= lalu.length ? `Transaksi ${tahunIni} naik ${naik(ini.length, lalu.length)}% dibanding ${thLalu} (${ini.length} vs ${lalu.length} unit), didorong promo hadiah dan harga baru Tipe A` : `Transaksi ${tahunIni}: ${ini.length} unit vs ${lalu.length} unit di ${thLalu}`}</T></h2>

      <div className="pz-row" style={{ flex: 1, gap: 16 }}>
        <div className="pz-box" style={{ flex: 1.2 }}><b>Transaksi per bulan: {thLalu} vs {tahunIni}</b>
          <div className="pz-leg"><span><i style={{ background: '#C9C3B4' }} />{thLalu} ({lalu.length} transaksi)</span><span><i style={{ background: G }} />{tahunIni} ({ini.length} transaksi s.d. {tglPendek(ujung)})</span></div>
          <div className="pz-banding kecil">{bulanBanding.map(x => <div key={x.b} className="g" style={{ opacity: x.nanti ? .45 : 1 }}><div className="bars"><div className="b" style={{ height: Math.max(2, x.lalu / mxB * 95), background: '#C9C3B4' }}><b>{x.lalu || ''}</b></div><div className="b" style={{ height: Math.max(2, x.ini / mxB * 95), background: G }}><b>{x.ini || ''}</b></div></div><span>{x.b}</span></div>)}</div>
          <table className="pz-tb s xs"><thead><tr><th></th><th>{thLalu}</th><th>{tahunIni}</th><th>Perubahan</th></tr></thead><tbody>
            {baris.map(([l, x, y, rp, tx, ty]) => <tr key={l}><td>{l}</td><td>{tx || (rp ? rpM(x) : x)}</td><td><b>{ty || (rp ? rpM(y) : y)}</b></td><td style={{ color: y >= x ? G : R }}><b>{pct(y, x)}</b></td></tr>)}</tbody></table></div>
        <div className="pz-col" style={{ flex: 1 }}>
          <div className="pz-k4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Kartu cls="emas" l={`Transaksi ${tahunIni}`} v={ini.length} s={`${thLalu}: ${lalu.length} · ${pct(ini.length, lalu.length)}`} />
            <Kartu l="Masih berjalan" v={jl(ini).length} s={`${rpM(nilai(ini))} · ${thLalu}: ${jl(lalu).length}`} />
            <Kartu l="Konsumen penerima hadiah" v={jl(ini).length} s={Object.entries(dHadiah).map(([h, n]) => `${h} ${n}`).join(' · ') || '—'} />
            <Kartu l="Transaksi Tipe A" v={tipeA(ini)} s={`${thLalu}: ${tipeA(lalu)} · ${jalanA(ini)} berjalan, ${batalA(ini)} batal`} /></div>
          {promo.catatanHarga && <div className="pz-ins" style={{ fontSize: 12.5, padding: '10px 14px' }}><b>Harga baru Tipe A:</b> <T k={KT('banding.harga')}>{promo.catatanHarga}. Rata-rata nilai per unit {rata(ini) < rata(lalu) ? 'turun' : 'berubah'} karena harga Tipe A lebih terjangkau; {batalA(ini) ? `${batalA(ini)} dari ${tipeA(ini)} transaksi Tipe A batal — kemampuan bayar perlu disaring sebelum Reserved.` : 'seluruh transaksi Tipe A masih berjalan.'}</T></div>}
          <div className="pz-ins" style={{ fontSize: 12.5, padding: '10px 14px' }}><T k={KT('banding.catatan')}>Kenaikan {tahunIni} datang dari dua hal: <b>promo hadiah</b> sepanjang tahun (BYD Atto 1, Vespa Officina 8, AC; Grand Rewards sejak September menambah Wuling Aira ev untuk Tipe C) yang memberi konsumen alasan memutuskan lebih cepat, dan <b>perubahan tipe</b> — Tipe A harga baru membuka segmen pembeli dengan budget lebih rendah.</T></div></div></div></>) });
  } else if (!promo.ringkasanPenjualan) out.push({ judul: 'Dampak promo', isi: L('6 · Dampak promo', 7, <>
    <h2><T k={KT("judul12")}>{promo.mulai ? (rSej > rSeb ? `Sejak promo ${namaBln(mulai.slice(0, 7))}, Booking naik dari ${f1(rSeb)} menjadi ${f1(rSej)} unit per bulan` : `Sejak promo ${namaBln(mulai.slice(0, 7))}, Booking ${f1(rSej)} unit per bulan (sebelumnya ${f1(rSeb)})`) : `Booking ${tahunIni}: rata-rata ${f1(rSej)} unit per bulan`}</T></h2>
    <div className="pz-row" style={{ flex: 1, gap: 16 }}>
      <div className="pz-box" style={{ flex: 1 }}><b>Booking berjalan per bulan</b>
        {promo.mulai && <div className="pz-hb"><span>Sebelum promo</span><div style={{ width: (rSeb / Math.max(rSeb, rSej, 0.01) * 100) + '%', background: '#C9C3B4' }} /><b>{f1(rSeb)}</b></div>}
        <div className="pz-hb"><span><b>{promo.mulai ? 'Sejak promo' : `Tahun ${tahunIni}`}</b></span><div style={{ width: (rSej / Math.max(rSeb, rSej, 0.01) * 100) + '%', background: G }} /><b>{f1(rSej)}</b></div>
        <table className="pz-tb s"><thead><tr><th>Booking {promo.mulai ? 'sejak promo' : tahunIni} ({bookSejak.length})</th><th>Unit</th><th>Hadiah</th><th>Sales</th></tr></thead>
          <tbody>{bookSejak.slice(0, 7).map(r => <tr key={r.lead_code + r.unit}><td>{r.nama}</td><td>{r.unit}{r.tipe ? ` (${String(r.tipe).replace(/^TIPE\s*/i, '')})` : ''}</td><td>{promo.hadiahUnit ? promo.hadiahUnit(r.tipe, r.unit, r.tgl_booking) : '—'}</td><td>{penanggungKinerja({ project: P.p, sales: r.sales, tgl: r.tgl_booking }, P.akun || [])}</td></tr>)}</tbody></table>
        {bookSejak.length > 7 && <span className="pz-sub" style={{ fontSize: 12 }}>+{bookSejak.length - 7} Booking lainnya</span>}</div>
      <div className="pz-col" style={{ flex: 1 }}><div className="pz-k4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Kartu l={promo.mulai ? 'Lead per bulan sejak promo' : 'Lead per bulan'} v={f1(leadSej)} s={promo.mulai ? `sebelum promo ${f1(leadSeb)} per bulan` : `tahun ${tahunIni}`} />
        <Kartu l={`Lead masuk sejak ${fmtDate(dari)}`} v={Ld.masuk || 0} s={`${Ld.booking || 0} sudah Booking`} />
        <Kartu cls="emas" l="Walk in media offline" v={V.offline || 0} s={(V.perInfo || []).filter(([k]) => /banner|spanduk|billboard|baliho|brosur|pameran|event|lewat|papan/i.test(k)).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(' · ') || `sejak ${fmtDate(dari)}`} />
        <Kartu l={promo.mulai ? 'Booking sejak promo' : `Booking ${tahunIni}`} v={bookSejak.length} s={`${rpM(bookSejak.reduce((a, r) => a + (Number(r.harga) || 0), 0))}`} /></div>
        <div className="pz-ins"><T k={KT("catatan4")}>{(V.offline || 0) >= (V.janji || 0) ? <>Media offline menghasilkan kunjungan terbanyak — hadiah promo paling efektif dipakai sebagai <b>alasan datang ke lokasi</b>.</> : <>Janji temu menjadi sumber kunjungan utama — promo dipakai sebagai <b>undangan kunjungan weekend</b> untuk lead Warm/Hot.</>}</T></div></div></div></>) });

  // 8 · Langkah ke depan
  const langkah = [];
  if (promo.programPermai) langkah.push([`Luncurkan program ${PROGRAM_PERMAI.nama} — cicil bertahap hingga 20 tahun`, [
    'Untuk konsumen yang tidak lolos KPR subsidi: DP 20% dicicil 3×, langsung huni lewat pinjam pakai, cicilan tetap 10 / 15 / 20 tahun.',
    'PPN yang timbul tanpa KPR bank dan asuransi jiwa kredit dimasukkan ke bunga all in — developer tidak menanggung biaya tambahan.',
    `Langsung ditawarkan ke ${proses.length} konsumen proses KPR sebagai jalur cadangan; pilot ${PROGRAM_PERMAI.pilot.bulan} bulan, target ${PROGRAM_PERMAI.pilot.unit} unit.`]]);
  if (promo.aiWa) {
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

  } else {
    // Fokus tanpa menambah budget: proses KPR & kualitas lead dari iklan
    const iklan = (Ld.kualitasSumber || []).filter(o => !/walk|referen|lainnya|pameran|event|banner|billboard|spanduk|kantor/i.test(o.sumber));
    const sumberLemah = iklan.filter(o => o.lead >= 5).sort((a, b) => (a.warm / a.lead) - (b.warm / b.lead))[0];
    const sumberKuat = iklan.filter(o => o.lead >= 5).sort((a, b) => (b.warm / b.lead) - (a.warm / a.lead))[0];
    langkah.push(['Saring kelayakan KPR subsidi sebelum kontrak', [
      'Cek syarat subsidi (belum punya rumah, batas penghasilan, status pekerjaan) dan BI checking awal sebelum SPPR ditandatangani.',
      `Berkas inti lengkap sebelum kontrak — mencegah pola kontrak massal yang kemudian batal (${bb.n || 0} batal setelah Booking).`]]);
    langkah.push([`Percepat ${proses.length} konsumen KPR yang belum akad`, [
      `PIC per bank (${[...new Set(proses.flatMap(x => x.r.kpr?.banks || []))].slice(0, 5).join(', ') || 'BTN, BCA, BSI, Mandiri, BNI'}) dengan follow up AO mingguan dan target tanggal akad per konsumen.`,
      `${proses.filter(x => !(x.r.kpr?.banks || []).length).length} konsumen belum punya data bank — ajukan minggu ini; yang ditolak dialihkan ke bank alternatif.`]]);
    langkah.push(['Targeting iklan untuk lead berkualitas (realokasi, bukan tambah budget)', [
      'Sasar pekerja formal berpenghasilan sesuai batas subsidi di koridor Cilejit–Parung Panjang–Tenjo–BSD, termasuk pengguna KRL.',
      'Copy iklan menyebut syarat & cicilan sejak awal; form iklan menanyakan penghasilan, status kerja, dan kepemilikan rumah.',
      sumberLemah && sumberKuat && sumberLemah.sumber !== sumberKuat.sumber ? `Pindahkan anggaran dari ${sumberLemah.sumber} (${persen(sumberLemah.warm, sumberLemah.lead)}% lead Warm+) ke ${sumberKuat.sumber} (${persen(sumberKuat.warm, sumberKuat.lead)}% Warm+).` : 'Hentikan audiens & konten yang hanya menghasilkan lead tidak layak; pertahankan yang menghasilkan Warm+.']]);
    langkah.push(['Sosialisasi KPR subsidi kolektif', ['Kerja sama dengan perusahaan, pabrik, dan komunitas sekitar bersama bank partner — biaya minimal, lead sudah tersaring dari sisi pekerjaan.']]);
    langkah.push(['Promo sebagai alat closing, bukan pembuka', ['Free DP & biaya ditawarkan kepada konsumen yang lolos pra-saringan, agar promo tidak menambah kontrak yang kemudian batal.']]);
  }
  // Bio: rencana program cara bayar fleksibel menjadi langkah nomor 1
  if (promo.program) langkah.unshift([`Jalankan program ${PROGRAM_BIO.nama}`, [
    'Bio Smart & Bio Easy: DP 20% dicicil 3×, cicil ke developer 1–2 tahun lalu lanjut KPR; Bio Stay: cicil ke developer hingga 15 tahun dengan bunga tetap — konsumen yang ditolak bank tidak perlu batal.',
    `Pilot ${PROGRAM_BIO.pilot.bulan} bulan dengan target ${PROGRAM_BIO.pilot.unit} unit; langsung ditawarkan juga ke ${proses.length} konsumen yang KPR-nya sedang berproses.`]]);
  out.push({ judul: 'Langkah ke depan', isi: L('7 · Langkah ke depan', 8, <>
    <h2><T k={KT("judul13")}>{promo.aiWa ? `${Math.min(5, langkah.length)} langkah untuk menaikkan penjualan dan menghidupkan lead yang diam` : promo.programPermai ? `${Math.min(5, langkah.length)} langkah: ${PROGRAM_PERMAI.nama}, kelayakan & proses KPR, dan lead yang lebih berkualitas` : `${Math.min(5, langkah.length)} langkah tanpa menambah budget: kelayakan & proses KPR, dan lead yang lebih berkualitas`}</T></h2>
    <div className="pz-col" style={{ gap: 10, marginTop: 4 }}>{langkah.slice(0, 5).map(([a, b], i) => <div key={i} className="pz-langkah"><b className="no">{i + 1}</b><b className="j"><T k={KT(`langkah${i}.judul`)}>{a}</T></b><ul>{b.map((x, k) => <li key={k}><T k={KT(`langkah${i}.poin${k}`)}>{x}</T></li>)}</ul></div>)}</div></>) });

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

  // ===== Program cara bayar fleksibel: Smart, Easy & Stay (Bio) — 8.0 s.d. 8.6 =====
  if (promo.program) {
    const PG = PROGRAM_BIO;
    const jt = n => 'Rp' + (n / 1e6).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';
    const M2 = n => 'Rp' + (n / 1e9).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
    const pr1 = x => (x * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%';
    const hitung = t => {
      const dp = t.harga * PG.dp, P = t.harga - dp;
      const stay = PG.stay.map(o => ({ ...o, cicil: pmt(P, o.bunga, o.tahun * 12) + P * PG.asuransi / 12 }));
      const s15 = PG.stay[PG.stay.length - 1];
      const bungaStay = pmt(P, s15.bunga, s15.tahun * 12) * s15.tahun * 12 - P, danaStay = P * PG.biayaDana * s15.tahun / 2;
      const jembatan = (cicil, n) => { const masuk = dp + cicil * n, sisa = t.harga - masuk;
        return { cicil, n, masuk, pct: masuk / t.harga, sisa, bulanKpr: PG.dpKali + n + 1, kpr: pmt(sisa, PG.kprFloating, PG.tenorKpr * 12), kprPromo: pmt(sisa, PG.kprPromo, PG.tenorKpr * 12), dana: (P + sisa) / 2 * PG.biayaDana * n / 12 }; };
      return { ...t, dp, dp3: dp / PG.dpKali, P, stay, bungaStay, danaStay, kprBank: pmt(P, PG.kprFloating, PG.tenorKpr * 12), smart: jembatan(t.smart, PG.smartKali), easy: jembatan(t.easy, PG.easyKali) };
    };
    const SIM = PG.tipe.map(hitung), A = SIM[0];
    const prog = (no, isi) => <Slide bab={`7 · ${PG.nama}`} logo={logo} proj={nama} no={no}>{isi}</Slide>;
    // --- 8.0 Kenapa
    const batalThn = thn.filter(r => r.status === 'Batal'), nilaiBatalThn = batalThn.reduce((a, r) => a + (Number(r.harga) || 0), 0);
    const tersedia = P.jumlahUnit ? Math.max(0, P.jumlahUnit - (pen.n || 0) - (K.reserved?.n || 0)) : null;
    out.push({ judul: 'Program: kenapa dibuat', bagian: false, isi: prog('8.0', <>
      <h2><T k={KT('prog.kenapa.judul')}>Kenapa program ini harus dibuat: {persen(batalThn.length, thn.length)}% transaksi {tahunIni} batal, dan penyebab utamanya kemampuan bayar lewat KPR</T></h2>
      <div className="pz-k4"><Kartu l={`Transaksi ${tahunIni}`} v={thn.length} s={`${bookThn.length} masih berjalan · ${batalThn.length} batal (${persen(batalThn.length, thn.length)}%)`} />
        <Kartu l="Batal karena KPR / finansial" v={`${persen(kemampuan, batalBk.length)}%`} vs={{ color: R }} s={`${kemampuan} dari ${batalBk.length} batal setelah Booking (semua tahun)`} />
        <Kartu l="Batal saat Reserved" v={batalRv.length} vs={{ color: R }} s={rvTop ? `terbanyak "${rvTop[0].toLowerCase()}" (${rvTop[1]})` : 'batal sebelum Booking'} />
        <Kartu cls="emas" l={`Nilai transaksi batal ${tahunIni}`} v={rpM(nilaiBatalThn)} s={`penjualan berjalan ${tahunIni}: ${rpM(nilaiThn)}`} /></div>
      <div className="pz-row" style={{ flex: 1 }}>
        <div className="pz-box" style={{ flex: 1 }}><b><T k={KT('prog.kenapa.k1')}>Kondisi pasar yang menekan</T></b><div className="pz-isi"><T k={KT('prog.kenapa.t1')}>BI Rate naik ke 5,75% sejak pertengahan 2026; bunga floating KPR bank 11–13,5%. Kendala utama konsumen Bio adalah BI checking dan kemampuan keuangan untuk lolos KPR. Tipe A harga baru menarik peminat baru, tetapi banyak yang batal. Bio bersaing dengan developer besar dengan harga setara — perlu pembeda yang nyata.</T></div></div>
        <div className="pz-box" style={{ flex: 1 }}><b><T k={KT('prog.kenapa.k2b')}>Yang diselesaikan Bio Smart, Bio Easy &amp; Bio Stay</T></b><div className="pz-isi"><T k={KT('prog.kenapa.t2')}>Konsumen tetap terikat (Reserved/Booking) walau belum lolos KPR. Yang ditolak bank dialihkan ke Bio Smart, Easy atau Stay — bukan dibatalkan. Pembeda dari developer besar: DP 20% dicicil 3×, langsung huni, cicilan ke developer dengan proteksi asuransi.</T>{tersedia != null ? <> Stok <b>{tersedia} unit</b> tersedia bisa bergerak lebih cepat tanpa menurunkan harga.</> : null}</div></div></div></>) });
    // --- 8.1 Bio Stay
    out.push({ judul: 'Bio Stay', isi: prog('8.1', <>
      <h2><T k={KT('prog.stay.judul')}>Bio Stay: DP 20% dicicil 3×, sisa harga dicicil langsung ke developer 5–15 tahun dengan bunga tetap</T></h2>
      <div className="pz-row" style={{ flex: 1 }}>
        <div className="pz-box" style={{ flex: .85 }}><span className="pz-chip hijau">Bio Stay</span>
          <ol className="pz-ol" style={{ fontSize: 13.5 }}>{['Booking — konsumen langsung terikat, tanpa menunggu persetujuan bank.', 'DP 20% dicicil 3× (bulan 1–3), lalu langsung huni lewat serah terima pinjam pakai.', `Sisa 80% dicicil ke developer dengan bunga tetap: ${PG.stay.map(o => `${o.tahun} tahun ${pr1(o.bunga)}`).join(' · ')}.`, 'Asuransi jiwa kredit — sisa cicilan lunas bila konsumen meninggal.', 'Sertifikat ditahan developer sampai lunas; boleh pindah ke KPR bank kapan saja tanpa penalti.'].map((x, i) => <li key={i}><T k={KT('prog.stay.alur' + i)}>{x}</T></li>)}</ol>
          <div className="pz-ins" style={{ fontSize: 13 }}><T k={KT('prog.stay.beda')}>Pembeda dari KPR bank: tidak bergantung BI checking dan bunga tidak naik seperti floating bank.</T></div></div>
        <div className="pz-col" style={{ flex: 1.15 }}>
          <table className="pz-tb s"><thead><tr><th>Tipe</th><th>DP 20%</th>{PG.stay.map(o => <th key={o.tahun}>{o.tahun} thn · {pr1(o.bunga)}</th>)}<th>KPR bank {pr1(PG.kprFloating)} · {PG.tenorKpr} thn</th></tr></thead>
            <tbody>{SIM.map(t => <tr key={t.tipe}><td className="kiri"><b>{t.tipe}</b><span className="pz-sub" style={{ display: 'block', fontSize: 10.5 }}>{M2(t.harga)}</span></td><td>{jt(t.dp3)} ×{PG.dpKali}</td>{t.stay.map((o, i) => <td key={i}>{i === t.stay.length - 1 ? <b>{jt(o.cicil)}</b> : jt(o.cicil)}</td>)}<td style={{ color: '#8A3B26' }}>{jt(t.kprBank)}</td></tr>)}</tbody></table>
          <div className="pz-sub" style={{ fontSize: 11.5 }}>Cicilan per bulan termasuk asuransi jiwa kredit ({pr1(PG.asuransi)}/tahun, estimasi). Harga setelah diskon sesuai Price List.</div>
          <div className="pz-k3"><Kartu cls="emas" l={`${A.tipe} · ${PG.stay[PG.stay.length - 1].tahun} tahun`} v={jt(A.stay[A.stay.length - 1].cicil)} vs={{ fontSize: 26 }} s={`per bulan · penghasilan min ±${jt(A.stay[A.stay.length - 1].cicil / PG.batasCicilan)}`} />
            <Kartu l={`DP ${A.tipe}`} v={`${jt(A.dp3)} ×${PG.dpKali}`} vs={{ fontSize: 22 }} s="lalu langsung huni (pinjam pakai)" />
            <Kartu l={`Bunga ${PG.stay[PG.stay.length - 1].tahun} tahun`} v={pr1(PG.stay[PG.stay.length - 1].bunga)} vs={{ fontSize: 26 }} s="tetap · setara floating bank, tanpa risiko naik" /></div></div></div></>) });
    // --- 8.2 Bunga & pendanaan
    const contohB = SIM[1] || A;
    out.push({ judul: 'Bunga & pendanaan', isi: prog('8.2', <>
      <h2><T k={KT('prog.dana.judul')}>Bunga tetap Bio Stay: di atas biaya dana developer, di bawah floating bank — dengan kebutuhan pendanaan piutang</T></h2>
      <div className="pz-k4"><Kartu l="BI Rate" v={PG.acuan.biRate} s={PG.acuan.biRateKet} /><Kartu l="Bunga kredit baru (rata-rata)" v={PG.acuan.kreditBaru} s={PG.acuan.kreditBaruKet} />
        <Kartu l="KPR bank floating" v={PG.acuan.floating} s={PG.acuan.floatingKet} /><Kartu cls="emas" l="Usulan bunga Bio Stay" v={`${pr1(PG.stay[0].bunga)}–${pr1(PG.stay[PG.stay.length - 1].bunga)}`} s="tetap sepanjang tenor" /></div>
      <div className="pz-row" style={{ flex: 1 }}>
        <div className="pz-box" style={{ flex: 1 }}><b><T k={KT('prog.dana.k1')}>Dampak ke arus kas developer</T></b><div className="pz-isi"><T k={KT('prog.dana.t1')}>Developer menerima DP 20% dalam 3 bulan; 80% masuk bertahap selama tenor. Contoh: 5 unit {contohB.tipe} setahun = piutang ±{rpM(contohB.P * 5)} yang perlu didanai. Pilihan pendanaan: pembiayaan piutang (anjak piutang) ke bank / multifinance, atau kuota unit Bio Stay per tahun.</T></div></div>
        <div className="pz-box" style={{ flex: 1 }}><b><T k={KT('prog.dana.k2')}>Bio Smart &amp; Bio Easy — opsi jembatan (risiko lebih kecil)</T></b><div className="pz-isi"><T k={KT('prog.dana.t2')}>Cicil ke developer 12–24 bulan, lalu sisa pokok di-take over KPR bank setelah riwayat bayar konsumen baik. Dana developer yang tertahan dan risiko gagal bayar jauh lebih pendek. Cocok untuk konsumen yang hari ini ditolak bank karena SLIK atau dokumen penghasilan.</T></div></div></div>
      <div className="pz-sub" style={{ fontSize: 11.5 }}>{PG.acuan.sumber}</div></>) });
    // --- 8.3 Perlindungan risiko
    const RISK = [['Konsumen meninggal dunia', 'Ya · asuransi jiwa kredit', 'Sisa cicilan dilunasi asuransi; ahli waris menerima rumah', true],
      ['Cacat tetap total / penyakit kritis', 'Ya · perluasan jiwa kredit', 'Sesuai polis; diambil sebagai perluasan', true],
      ['Konsumen terkena PHK', 'Sebagian · perluasan PHK', 'Cicilan ditanggung beberapa bulan + masa tenggang PPJB', true],
      ['Rumah terbakar / bencana', 'Ya · asuransi kebakaran', 'Banker’s clause atas nama developer sampai lunas', true],
      ['Berhenti bayar (tidak mau / tidak mampu)', 'Tidak ditanggung asuransi', 'Dilindungi lewat PPJB: denda → somasi → pembatalan; unit kembali ke developer', false],
      ['Ingin memindahkan risiko gagal bayar', 'Kerja sama bank / multifinance', 'Pembiayaan piutang + penjaminan kredit milik lembaga keuangan; konsumen ikut disaring', null]];
    out.push({ judul: 'Perlindungan risiko', isi: prog('8.3', <>
      <h2><T k={KT('prog.risiko.judul')}>Perlindungan risiko: asuransi menanggung meninggal, cacat &amp; PHK — konsumen yang berhenti bayar dilindungi lewat PPJB</T></h2>
      <div className="pz-row" style={{ flex: 1 }}>
        <div style={{ flex: 1.25, minWidth: 0 }}><table className="pz-tb s cmp"><colgroup><col style={{ width: '30%' }} /><col style={{ width: '27%' }} /><col /></colgroup><thead><tr><th>Risiko</th><th>Ditanggung asuransi?</th><th>Perlindungan</th></tr></thead>
          <tbody>{RISK.map(([a, b, c, ya], i) => <tr key={i}><td>{a}</td><td style={{ color: ya === true ? G : ya === false ? R : undefined, fontWeight: 700 }}><T k={KT('prog.risiko.a' + i)}>{b}</T></td><td><T k={KT('prog.risiko.b' + i)}>{c}</T></td></tr>)}</tbody></table></div>
        <div className="pz-box" style={{ flex: .85 }}><b>Klausul PPJB yang wajib ada</b><ul className="pz-ul">{['Sertifikat atas nama developer sampai lunas; AJB setelah pelunasan', 'Autodebet & denda keterlambatan', 'Masa tenggang & penjadwalan ulang sekali selama tenor', 'Pembatalan setelah tunggakan sesuai PPJB; unit boleh dijual kembali', 'Pengembalian dana dipotong sesuai aturan PPJB yang berlaku (dikonfirmasi notaris)', 'Larangan sewa/alih sebelum lunas tanpa izin', 'Hak pindah ke KPR bank kapan saja'].map((x, i) => <li key={i}><T k={KT('prog.risiko.ppjb' + i)}>{x}</T></li>)}</ul></div></div>
      <div><b style={{ fontSize: 13 }}>Tahapan penagihan bila menunggak</b><div className="pz-tl">{[['Bulan 1', 'Pengingat & denda'], ['Bulan 2', 'Somasi 1 · tawarkan keringanan'], ['Bulan 3', 'Somasi 2 · penjadwalan ulang'], ['Bulan 4–5', 'Penyelesaian / pindah ke KPR'], ['Bulan 6', 'Pembatalan sesuai PPJB']].map(([a, b], i) => <div key={i}><b>{a}</b><T k={KT('prog.risiko.tl' + i)}>{b}</T></div>)}</div></div></>) });
    // --- 8.4 Perbandingan
    const st15 = A.stay[A.stay.length - 1];
    const BANDING = [
      ['Alur pembayaran', `DP 20% dicicil 3× → cicil ${jt(A.smart.cicil)} × ${PG.smartKali} → sisa via KPR bank bulan ke-${A.smart.bulanKpr}`, `DP 20% dicicil 3× → cicil ${jt(A.easy.cicil)} × ${PG.easyKali} → sisa via KPR bank bulan ke-${A.easy.bulanKpr}`, `DP 20% dicicil 3× → sisa 80% dicicil ke developer ${PG.stay[PG.stay.length - 1].tahun} tahun, bunga tetap ${pr1(PG.stay[PG.stay.length - 1].bunga)}`],
      [`Cicilan konsumen (${A.tipe})`, `${jt(A.smart.cicil)}/bln, lalu KPR ±${jt(A.smart.kpr)} (floating) / ${jt(A.smart.kprPromo)} (promo)`, `${jt(A.easy.cicil)}/bln, lalu KPR ±${jt(A.easy.kpr)} (floating) / ${jt(A.easy.kprPromo)} (promo)`, `${jt(st15.cicil)}/bln selama ${PG.stay[PG.stay.length - 1].tahun} tahun (termasuk asuransi)`],
      ['Developer menerima lunas', `Bulan ke-${A.smart.bulanKpr} (saat KPR cair)`, `Bulan ke-${A.easy.bulanKpr} (saat KPR cair)`, `Bertahap sampai tahun ke-${PG.stay[PG.stay.length - 1].tahun}`],
      [`Beban / hasil dana (${A.tipe})`, `Biaya dana ±${jt(A.smart.dana)} — ${A.allIn - A.harga >= A.smart.dana ? 'tertutup' : 'belum tertutup'} selisih harga all in (${jt(A.allIn - A.harga)})`, `Biaya dana ±${jt(A.easy.dana)} — ${A.allIn - A.harga >= A.easy.dana ? 'tertutup selisih harga all in' : 'lebih besar dari selisih all in; perlu kurangi diskon / cicilan lebih besar'}`, `Bunga diterima ${M2(A.bungaStay)} − biaya dana ${M2(A.danaStay)} = +${jt(A.bungaStay - A.danaStay)} selama ${PG.stay[PG.stay.length - 1].tahun} tahun`],
      ['Risiko utama', `KPR tetap ditolak di bulan ke-${A.smart.bulanKpr} → dialihkan ke Bio Stay`, 'Sama, dengan waktu 2 tahun memperbaiki SLIK', 'Piutang 80% tertahan lama; gagal bayar dilindungi PPJB & asuransi'],
      ['Cocok untuk', 'Konsumen dengan SLIK yang bisa cepat bersih', 'Konsumen yang butuh waktu lebih lama untuk layak KPR', 'Konsumen yang sulit KPR atau ingin bunga tetap tanpa bank']];
    out.push({ judul: 'Perbandingan Smart, Easy & Stay', isi: prog('8.4', <>
      <h2><T k={KT('prog.banding.judul')}>{PG.nama}: konsumen tetap bisa memiliki rumah walau belum lolos KPR hari ini</T></h2>
      <table className="pz-tb s cmp"><colgroup><col style={{ width: '17%' }} /><col style={{ width: '26%' }} /><col style={{ width: '26%' }} /><col /></colgroup>
        <thead><tr><th></th><th>Bio Smart</th><th>Bio Easy</th><th>Bio Stay</th></tr></thead>
        <tbody>{BANDING.map(([l, a, b, c], i) => <tr key={i}><td>{l}</td><td><T k={KT('prog.banding.s' + i)}>{a}</T></td><td><T k={KT('prog.banding.e' + i)}>{b}</T></td><td className="sorot"><T k={KT('prog.banding.y' + i)}>{c}</T></td></tr>)}</tbody></table>
      <div className="pz-sub" style={{ fontSize: 11.5 }}>Contoh {A.tipe} harga setelah diskon {M2(A.harga)}. Biaya dana dihitung dari bunga kredit baru {pr1(PG.biayaDana)}/tahun.</div></>) });
    // --- 8.5 Simulasi per tipe
    out.push({ judul: 'Simulasi per tipe', isi: prog('8.5', <>
      <h2><T k={KT('prog.tipe.judul')}>Simulasi per tipe: DP sama untuk semua pilihan, yang berbeda adalah lama cicilan ke developer dan kapan KPR mengambil alih</T></h2>
      <table className="pz-tb s"><thead><tr><th>Tipe</th><th>DP 20% (bln 1–3)</th><th>Bio Smart<span className="pz-th2">cicil 1 tahun → KPR*</span></th><th>Bio Easy<span className="pz-th2">cicil 2 tahun → KPR*</span></th><th>Bio Stay<span className="pz-th2">bunga tetap {pr1(PG.stay[PG.stay.length - 1].bunga)}</span></th></tr></thead>
        <tbody>{SIM.map(t => <tr key={t.tipe}><td className="kiri"><b>{t.tipe}</b><span className="pz-sub" style={{ display: 'block', fontSize: 10.5 }}>{M2(t.harga)}</span></td><td>{jt(t.dp3)} ×{PG.dpKali}</td>
          <td>{jt(t.smart.cicil)} ×{PG.smartKali}<span className="pz-sub" style={{ display: 'block', fontSize: 10.5 }}>masuk {Math.round(t.smart.pct * 100)}% · KPR {jt(t.smart.kpr)}</span></td>
          <td>{jt(t.easy.cicil)} ×{PG.easyKali}<span className="pz-sub" style={{ display: 'block', fontSize: 10.5 }}>masuk {Math.round(t.easy.pct * 100)}% · KPR {jt(t.easy.kpr)}</span></td>
          <td><b>{jt(t.stay[t.stay.length - 1].cicil)}</b> × {PG.stay[PG.stay.length - 1].tahun * 12}</td></tr>)}</tbody></table>
      <div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b style={{ fontSize: 14 }}><T k={KT('prog.tipe.k20')}>Kenapa DP 20% — keuntungan untuk konsumen</T></b><span className="pz-sub" style={{ fontSize: 11 }}>*KPR floating {pr1(PG.kprFloating)} · {PG.tenorKpr} thn</span></div>
        <div className="pz-k3" style={{ marginTop: 6 }}>{[['🏡 Langsung huni', 'Setelah DP 20% lunas (bulan ke-3), unit diserahterimakan dengan perjanjian pinjam pakai — tidak perlu menunggu lunas atau akad.'], ['🛡️ Bebas worry', 'Selama cicilan, konsumen diproteksi asuransi jiwa kredit — bila terjadi risiko meninggal, sisa cicilan lunas dan keluarga tetap memiliki rumah.'], ['🔑 Tanpa menunggu bank', 'Booking langsung berjalan; KPR bisa diajukan nanti (Bio Smart, Bio Easy) atau tidak perlu sama sekali (Bio Stay).']].map(([a, b], i) =>
          <div key={i} className="pz-k" style={{ padding: '10px 14px' }}><span className="l"><T k={KT('prog.tipe.u' + i)}>{a}</T></span><span className="s" style={{ fontSize: 12.5, color: '#10251E' }}><T k={KT('prog.tipe.ut' + i)}>{b}</T></span></div>)}</div></div>
      <div className="pz-row"><div className="pz-ins" style={{ flex: 1, fontSize: 12.5 }}><T k={KT('prog.tipe.aman')}>Jalur aman tanpa batal: bila di akhir Bio Smart / Bio Easy konsumen masih ditolak KPR, sisa harga dialihkan ke Bio Stay — transaksi tetap berjalan, unit tidak kembali ke stok.</T></div>
        <div className="pz-ins" style={{ flex: 1, fontSize: 12.5 }}><T k={KT('prog.tipe.dana')}>{`Bio Smart & Bio Easy tanpa bunga menimbulkan biaya dana bagi developer: ${A.tipe} ±${jt(A.smart.dana)} (Bio Smart) dan ±${jt(A.easy.dana)} (Bio Easy). Bio Smart ${A.allIn - A.harga >= A.smart.dana ? 'tertutup' : 'belum tertutup'} bila memakai harga all in; Bio Easy ${A.allIn - A.harga >= A.easy.dana ? 'juga tertutup' : 'perlu diskon dikurangi atau cicilan lebih besar'}.`}</T></div></div></>) });
    // --- 8.6 KPI
    const bulanBerjalan = Math.max(1, Number(hariIni().slice(5, 7)));
    // Rasio batal = semua transaksi batal (saat Reserved maupun setelah Booking) ÷ semua transaksi tahun ini
    const rasioBatal = persen(thn.filter(r => r.status === 'Batal').length, thn.length);
    const KPI = [['Penjualan', 'Booking berjalan per bulan', `${(bookThn.length / bulanBerjalan).toLocaleString('id-ID', { maximumFractionDigits: 1 })} unit (${tahunIni})`, '≥ 2 unit / bulan'],
      ['Penjualan', 'Rasio batal transaksi (Reserved & Booking)', `${rasioBatal}% (${tahunIni})`, '≤ 25%'],
      ['Penyelamatan', 'Konsumen ditolak KPR yang pindah ke Bio Smart / Bio Easy / Bio Stay', '— (belum ada program)', '≥ 50% dari kasus ditolak bank'],
      ['Kecepatan', 'DP 20% terkumpul dalam 3 bulan', '—', '≥ 95% peserta'],
      ['Kecepatan', 'Serah terima pinjam pakai setelah DP lunas', '—', '≤ 14 hari'],
      ['Kualitas piutang', 'Tunggakan > 30 hari / > 90 hari', '—', '≤ 5% / ≤ 2% dari peserta'],
      ['Kualitas piutang', 'Bio Smart & Easy berhasil take over KPR saat jatuh tempo', '—', '≥ 70% (sisanya pindah ke Bio Stay)'],
      ['Batas risiko', 'Total piutang developer dari program', '—', `maks. ${PG.batasPiutang} · ditinjau per kuartal`],
      ['Proteksi', 'Peserta dengan asuransi jiwa kredit aktif', '—', '100%']];
    out.push({ judul: 'KPI program', isi: prog('8.6', <>
      <h2><T k={KT('prog.kpi.judul')}>KPI program: dua kali lipat penjualan berjalan, pembatalan turun separuh, dengan batas risiko piutang yang jelas</T></h2>
      <div className="pz-row" style={{ flex: 1 }}>
        <div style={{ flex: 1.45, minWidth: 0 }}><table className="pz-tb s cmp"><colgroup><col style={{ width: '15%' }} /><col style={{ width: '42%' }} /><col style={{ width: '18%' }} /><col /></colgroup><thead><tr><th>Area</th><th>KPI</th><th>Kondisi sekarang</th><th>Target</th></tr></thead>
          <tbody>{KPI.map(([a, b, c, d], i) => <tr key={i}><td>{a}</td><td><b><T k={KT('prog.kpi.k' + i)}>{b}</T></b></td><td>{c}</td><td style={{ color: G, fontWeight: 800 }}><T k={KT('prog.kpi.t' + i)}>{d}</T></td></tr>)}</tbody></table></div>
        <div className="pz-col" style={{ flex: .75 }}>
          <Kartu cls="emas" l={`Target pilot ${PG.pilot.bulan} bulan`} v={`${PG.pilot.unit} unit`} s={`≥ 2 unit berjalan / bulan · ±${PG.pilot.nilai} nilai penjualan`} />
          {tersedia != null && <Kartu l="Stok tersedia" v={`${tersedia} unit`} s={`habis ±${Math.ceil(tersedia / 2)} bulan pada laju 2 unit / bulan`} />}
          <div className="pz-ins" style={{ fontSize: 12.5 }}><T k={KT('prog.kpi.catatan')}>{`Catatan: begitu program berjalan, dapat langsung ditawarkan juga ke ${proses.length} konsumen yang KPR-nya sedang berproses sebagai jalur cadangan.`}</T></div>
          <div className="pz-ins" style={{ fontSize: 12.5 }}><T k={KT('prog.kpi.pantau')}>Cara pantau: semua KPI terbaca dari CRM (Laporan Penjualan, Collection &amp; KPR); ditinjau bulanan oleh Sales &amp; Marketing dan Keuangan, dilaporkan ke CEO per kuartal. Program dievaluasi di akhir pilot sebelum diperluas.</T></div></div></div></>) });
  }


  // ===== Program Permai Bisa — cicil bertahap hingga 20 tahun =====
  if (promo.programPermai) {
    const PB = PROGRAM_PERMAI;
    const jt2 = n => 'Rp' + (n / 1e6).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' jt';
    const jt1 = n => 'Rp' + (n / 1e6).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';
    const pc = x => (x * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%';
    const dpN = PB.harga * PB.dp, pokok = PB.harga - dpN, ppnN = PB.harga * PB.ppn;
    const SIMP = PB.tenor.map(o => { const n = o.tahun * 12, c = pmt(pokok, o.allIn, n);
      return { ...o, c, gaji: c / PB.batasCicilan, net: c * n - pokok - ppnN - pokok * PB.asuransi * o.tahun / 2 - pokok * PB.biayaDana * o.tahun / 2 }; });
    const T20 = SIMP[SIMP.length - 1], flpp = pmt(PB.harga * (1 - PB.flpp.dp), PB.flpp.bunga, PB.flpp.tahun * 12);
    const progP = (no, isi) => <Slide bab={`7 · ${PB.nama}`} logo={logo} proj={nama} no={no}>{isi}</Slide>;
    out.push({ judul: `${PB.nama}: skema & simulasi`, isi: progP('8.1', <>
      <h2><T k={KT('pb.judul')}>{`${PB.nama}: DP 20% dicicil 3×, sisa harga dicicil langsung ke developer hingga ${T20.tahun} tahun — bunga sudah termasuk PPN & asuransi`}</T></h2>
      <div className="pz-row" style={{ flex: 1 }}>
        <div className="pz-box" style={{ flex: .8 }}><span className="pz-chip hijau">{PB.nama}</span>
          <ol className="pz-ol" style={{ fontSize: 13.5 }}>{['Untuk konsumen yang tidak lolos KPR subsidi bank.', `DP 20% (${jt1(dpN)}) dicicil 3×, lalu langsung huni lewat serah terima pinjam pakai.`, `Sisa 80% (${jt1(pokok)}) dicicil ke developer ${PB.tenor.map(o => o.tahun).join(' / ')} tahun, bunga tetap.`, `Tanpa KPR bank timbul PPN ±${jt1(ppnN)}/unit yang ditanggung developer — dimasukkan ke bunga cicilan.`, 'Asuransi jiwa kredit termasuk dalam bunga.'].map((x, i) => <li key={i}><T k={KT('pb.alur' + i)}>{x}</T></li>)}</ol></div>
        <div className="pz-col" style={{ flex: 1.2 }}>
          <table className="pz-tb s"><thead><tr><th>Tenor</th><th>Bunga dasar</th><th>Tambahan</th><th>Bunga all in</th><th>Cicilan / bulan</th><th>Penghasilan min</th></tr></thead>
            <tbody>{SIMP.map(o => <tr key={o.tahun}><td className="kiri"><b>{o.tahun} tahun</b></td><td>{pc(o.dasar)}</td><td>+ PPN + asuransi</td><td><b>{pc(o.allIn)}</b></td><td><b>{jt2(o.c)}</b></td><td>{jt1(o.gaji)}</td></tr>)}</tbody></table>
          <div className="pz-sub" style={{ fontSize: 11.5 }}>Harga contoh {jt1(PB.harga)} · DP {jt1(dpN)} ({jt1(dpN / PB.dpKali)} ×{PB.dpKali}) · pokok {jt1(pokok)}. Bunga dasar mengikuti skema Bio Stay; PPN (asumsi 11% dari harga, ±{jt1(ppnN)}) dan asuransi jiwa kredit {pc(PB.asuransi)}/tahun dimasukkan ke bunga all in. Penghasilan min = cicilan ≤ {Math.round(PB.batasCicilan * 100)}% penghasilan.</div>
          <div className="pz-k3"><Kartu cls="emas" l={`${T20.tahun} tahun`} v={jt2(T20.c)} vs={{ fontSize: 26 }} s={`per bulan · bunga all in ${pc(T20.allIn)}`} />
            <Kartu l="Pembanding KPR FLPP" v={jt2(flpp)} vs={{ fontSize: 26 }} s={`DP ${pc(PB.flpp.dp)}, ${pc(PB.flpp.bunga)} · ${PB.flpp.tahun} thn — bila lolos subsidi`} />
            <Kartu l="DP" v={`${jt1(dpN / PB.dpKali)} ×${PB.dpKali}`} vs={{ fontSize: 24 }} s={`total ${jt1(dpN)} dalam 3 bulan`} /></div></div></div></>) });
    const kol = (judul, warna, items, key) => <div className="pz-box" style={{ flex: 1 }}><b style={{ color: warna }}><T k={KT(key + '.j')}>{judul}</T></b><ul className="pz-ul" style={{ fontSize: 13.3 }}>{items.map((x, i) => <li key={i}><T k={KT(key + i)}>{x}</T></li>)}</ul></div>;
    out.push({ judul: `${PB.nama}: keuntungan & risiko`, isi: progP('8.2', <>
      <h2><T k={KT('pb.untung.judul')}>Keuntungan untuk pembeli dan developer, serta risiko yang ditanggung developer</T></h2>
      <div className="pz-row" style={{ flex: 1 }}>
        {kol('Keuntungan pembeli', undefined, ['Tetap bisa punya rumah walau tidak lolos KPR subsidi', 'Langsung huni setelah DP 20% lunas (pinjam pakai)', `Bunga tetap sampai lunas, cicilan mulai ±${jt2(T20.c)}/bulan`, 'Bebas worry: diproteksi asuransi jiwa kredit', 'Boleh pindah ke KPR bank kapan saja bila sudah layak'], 'pb.ub')}
        {kol('Keuntungan developer', undefined, ['Unit tetap terjual walau konsumen ditolak bank — menekan pembatalan', 'DP 20% masuk dalam 3 bulan; risiko awal lebih kecil', 'PPN & asuransi tertutup oleh bunga cicilan', `Pendapatan bunga: ${T20.tahun} thn ±${jt1(T20.net)}/unit setelah PPN, asuransi & biaya dana`], 'pb.ud')}
        {kol('Risiko di developer', R, [`Piutang panjang: ${jt1(pokok)}/unit hingga ${T20.tahun} tahun — 10 unit = ±${rpM(pokok * 10)} tertahan`, 'Gagal bayar: segmen MBR rentan PHK; dilindungi PPJB, bukan asuransi', 'Ketentuan rumah subsidi & PPN: wajib dikonfirmasi ke konsultan pajak / legal', 'Biaya & tenaga penagihan selama tenor'], 'pb.rd')}</div>
      <div className="pz-ins" style={{ fontSize: 13 }}><T k={KT('pb.mitigasi')}>Mitigasi: DP 20% di depan, autodebet, sertifikat ditahan sampai lunas, masa tenggang &amp; penjadwalan ulang, batas jumlah unit / piutang per tahun.</T></div></>) });
    const rasioBatalAll = persen(rows.filter(r => r.status === 'Batal').length, rows.length);
    const mulaiP = rows.map(tglJual).filter(Boolean).sort()[0];
    const KPIP = [['Penjualan', 'Unit terselamatkan dari konsumen tidak lolos KPR subsidi', '—', '≥ 3 unit / bulan'],
      ['Penjualan', 'Rasio batal transaksi (Reserved & Booking)', `${rasioBatalAll}%${mulaiP ? ` (sejak ${namaBln(mulaiP.slice(0, 7))})` : ''}`, '≤ 30%'],
      ['Kecepatan', 'DP 20% terkumpul dalam 3 bulan', '—', '≥ 95% peserta'],
      ['Kecepatan', 'Serah terima pinjam pakai setelah DP lunas', '—', '≤ 14 hari'],
      ['Kualitas piutang', 'Tunggakan > 30 hari / > 90 hari', '—', '≤ 5% / ≤ 2% dari peserta'],
      ['Batas risiko', 'Total piutang developer dari program', '—', `maks. ${PB.batasPiutang} · ditinjau per kuartal`],
      ['Proteksi', 'Peserta dengan asuransi jiwa kredit aktif', '—', '100%']];
    out.push({ judul: `${PB.nama}: KPI`, isi: progP('8.3', <>
      <h2><T k={KT('pb.kpi.judul')}>KPI program: menyelamatkan pembeli yang tidak lolos KPR subsidi, dengan batas piutang yang terkendali</T></h2>
      <div className="pz-row" style={{ flex: 1 }}>
        <div style={{ flex: 1.45, minWidth: 0 }}><table className="pz-tb s cmp"><colgroup><col style={{ width: '15%' }} /><col style={{ width: '42%' }} /><col style={{ width: '18%' }} /><col /></colgroup><thead><tr><th>Area</th><th>KPI</th><th>Kondisi sekarang</th><th>Target</th></tr></thead>
          <tbody>{KPIP.map(([a, b, c, d], i) => <tr key={i}><td>{a}</td><td><b><T k={KT('pb.kpi.k' + i)}>{b}</T></b></td><td>{c}</td><td style={{ color: G, fontWeight: 800 }}><T k={KT('pb.kpi.t' + i)}>{d}</T></td></tr>)}</tbody></table></div>
        <div className="pz-col" style={{ flex: .75 }}>
          <Kartu cls="emas" l={`Target pilot ${PB.pilot.bulan} bulan`} v={`${PB.pilot.unit} unit`} s={`≥ 3 unit / bulan · ±${PB.pilot.nilai} nilai penjualan`} />
          <div className="pz-ins" style={{ fontSize: 12.5 }}><T k={KT('pb.kpi.catatan')}>{`Catatan: begitu program berjalan, dapat langsung ditawarkan juga ke ${proses.length} konsumen yang KPR-nya sedang berproses sebagai jalur cadangan.`}</T></div>
          <div className="pz-ins" style={{ fontSize: 12.5 }}><T k={KT('pb.kpi.pantau')}>Cara pantau: semua KPI terbaca dari CRM; ditinjau bulanan bersama Keuangan, dilaporkan ke CEO per kuartal.</T></div></div></div></>) });
  }

  if (promo.aiWa) out.push({ judul: 'Pentingnya WA satu nomor & AI', isi: L('7 · Langkah ke depan', 9, <>
    <h2><T k={KT("judul14")}>WhatsApp satu nomor + AI Asisten: lead tidak hilang saat serah terima dan terlayani 24 jam</T></h2>
    <div className="pz-row" style={{ flex: 1 }}>
      <div style={{ flex: 1.55, minWidth: 0 }}><table className="pz-tb s banding"><colgroup><col style={{ width: '19%' }} /><col style={{ width: '40%' }} /><col /></colgroup>
        <thead><tr><th>Aspek</th><th>Sekarang</th><th>Dengan WA satu nomor + AI Asisten</th></tr></thead>
        <tbody>{bandingan.map(([a, b, c]) => <tr key={a}><td className="kiri"><b>{a}</b></td><td className="kiri" style={{ color: '#8A3B26' }}><T k={KT('banding.' + a + '.sekarang')}>{b}</T></td><td className="kiri" style={{ color: '#1E5B45' }}><T k={KT('banding.' + a + '.nanti')}>{c}</T></td></tr>)}</tbody></table></div>
      <div className="pz-col" style={{ flex: 1 }}>
        <Kartu cls="emas" l="Potensi lead aktif tambahan" v={tambahAktif ? `+${tambahAktif}` : '—'} s={`bila tanggapan lead naik dari ${resp}% ke 50% (${Ld.dioper || 0} lead dioper sejak ${fmtDate(dari)})`} />
        <Kartu l="Lead di luar jam kerja" v={Ld.luarJam?.dari ? `${pLuar}%` : '—'} s="dilayani AI tanpa menunggu sales" />
        <div className="pz-ins" style={{ fontSize: 13 }}><T k={KT("catatan5")}><b>Yang dibutuhkan:</b> aktivasi WhatsApp Cloud API di nomor official, biaya percakapan sesuai tarif Meta &amp; pemakaian AI, dan kebijakan sales membalas lead digital dari Inbox WhatsApp CRM.</T></div></div></div></>) });

  // 9 · Estimasi biaya WhatsApp resmi + AI Asisten (volume dari data project ini, tarif dari lib/presentasi.js)
  const TF = TARIF;
  const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
  const blnPeriode = Math.max(0.5, (selisih(hariIni(), dari) + 1) / 30.44);
  const leadBlnB = Math.max(1, Math.round(promo.mulai ? leadSej : (Ld.masuk || 0) / blnPeriode));
  const janjiBln = Math.round(((V.janji || 0) + (V.tanpaJanji || 0)) / blnPeriode) || Math.round(leadBlnB * 0.1);
  const aiBalas = biayaAiPerBalasan(TF);
  const hitungBiaya = n => {
    const svc = n * (TF.balasanAi + TF.balasanSales), svcBayar = Math.max(0, svc - TF.serviceGratis);
    const mkt = n * TF.templateFu, utl = Math.max(janjiBln * (n / leadBlnB), Math.round(n * 0.1)) * TF.pengingatJanji;
    const meta = (svcBayar * TF.service + mkt * TF.marketing + utl * TF.utility) * (1 + TF.ppn);
    const ai = n * (TF.balasanAi + TF.draftFu) * aiBalas;
    return { svc, svcBayar, mkt, utl, meta, ai, total: meta + ai };
  };
  const B1 = hitungBiaya(leadBlnB), B2 = hitungBiaya(leadBlnB * 2);
  const baris = [
    ['Pesan service (balasan AI + sales)', `${leadBlnB} lead × ${TF.balasanAi + TF.balasanSales} balasan = ${Math.round(B1.svc).toLocaleString('id-ID')} pesan; ${TF.serviceGratis.toLocaleString('id-ID')} pertama gratis`, `${rp(TF.service)} / pesan`, rp(B1.svcBayar * TF.service)],
    ['Template follow up (marketing)', `${TF.templateFu} per lead di luar jendela 24 jam = ${Math.round(B1.mkt).toLocaleString('id-ID')} pesan`, `${rp(TF.marketing)} / pesan`, rp(B1.mkt * TF.marketing)],
    ['Pengingat janji temu (utility)', `${TF.pengingatJanji} per janji · ±${Math.round(B1.utl / TF.pengingatJanji)} janji/bulan`, `${rp(TF.utility)} / pesan`, rp(B1.utl * TF.utility)],
    ['PPN 11% atas tarif Meta', '', '', rp((B1.meta / (1 + TF.ppn)) * TF.ppn)],
    ['AI Asisten (Claude Haiku 4.5)', `${leadBlnB} lead × ${TF.balasanAi} balasan + ${TF.draftFu} draf follow up`, `±${rp(aiBalas)} / balasan`, rp(B1.ai)],
  ];
  if (promo.aiWa) out.push({ judul: 'Estimasi biaya WA & AI', isi: L('7 · Langkah ke depan', 10, <>
    <h2><T k={KT("judul15")}>Estimasi biaya WhatsApp resmi + AI Asisten: ±{rp(Math.ceil(B1.total / 1000) * 1000)} per bulan untuk ±{leadBlnB} lead</T></h2>
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
        <div className="pz-ins" style={{ fontSize: 12.5 }}><T k={KT("catatan6")}>Tarif Meta untuk nomor Indonesia per {TF.per} (belum PPN): marketing {rp(TF.marketing)}, utility &amp; service {rp(TF.service)} per pesan; 1.000 pesan service gratis per nomor per bulan. Percakapan yang dimulai dari iklan klik-ke-WhatsApp mendapat jendela gratis lebih panjang sehingga biaya nyata bisa lebih rendah. AI: Claude Haiku 4.5 (US$1 input · US$5 output per 1 juta token), kurs asumsi {rp(TF.kurs)}/US$. Di luar biaya iklan, hosting &amp; database.</T></div></div></div></>) });
  return out;
}
