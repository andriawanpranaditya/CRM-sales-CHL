'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/components/util';

// ===== Ringkasan SEO website (tab Website & SEO di Analisa Marcom) =====
const angka = v => (v == null ? '—' : Number(v).toLocaleString('id-ID'));
const persen = (v, d = 1) => (v == null ? '—' : (v * 100).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%');
const pos = v => (v == null || v === '' ? '—' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }));
const tglId = s => (s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const tglPendek = s => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

// Perubahan vs periode sebelumnya. turunBagus = true untuk posisi (angka kecil = lebih atas di Google)
function Delta({ kini, lalu, turunBagus = false, mode = 'persen' }) {
  if (lalu == null || kini == null) return <span className="seo-d netral">tanpa pembanding</span>;
  const k = Number(kini), l = Number(lalu);
  if (mode === 'poin') {
    const s = Math.round((k - l) * 10) / 10;
    if (Math.abs(s) < 0.1) return <span className="seo-d netral">sama dengan periode lalu</span>;
    const baik = turunBagus ? s < 0 : s > 0, besar = Math.abs(s).toLocaleString('id-ID');
    if (turunBagus) return <span className={'seo-d ' + (baik ? 'baik' : 'buruk')}>{baik ? '▲ naik' : '▼ turun'} {besar} peringkat vs periode lalu</span>;
    return <span className={'seo-d ' + (baik ? 'baik' : 'buruk')}>{s > 0 ? '▲' : '▼'} {besar} poin vs periode lalu</span>;
  }
  if (l === 0) return <span className={'seo-d ' + (k > 0 ? 'baik' : 'netral')}>{k > 0 ? 'baru ada (lalu 0)' : 'sama-sama 0'}</span>;
  const p = (k - l) / l;
  if (Math.abs(p) < 0.005) return <span className="seo-d netral">sama dengan periode lalu</span>;
  const baik = turunBagus ? p < 0 : p > 0;
  return <span className={'seo-d ' + (baik ? 'baik' : 'buruk')}>{p > 0 ? '▲' : '▼'} {Math.abs(p * 100).toLocaleString('id-ID', { maximumFractionDigits: 0 })}% vs periode lalu</span>;
}

function Kartu({ judul, nilai, sub, children }) {
  return (<div className="seo-k"><div className="seo-kj">{judul}</div><div className="seo-kv">{nilai}</div>{children}{sub && <div className="hint">{sub}</div>}</div>);
}

// Grafik batang bertumpuk per minggu: non-brand · brand · tersembunyi
function GrafikMinggu({ data }) {
  const [hover, setHover] = useState(null), [W, setW] = useState(720), box = useRef(null);
  // Lebar mengikuti wadah supaya teks sumbu tetap terbaca di HP
  useEffect(() => { const el = box.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(e => setW(Math.max(280, Math.round(e[0].contentRect.width)))); ro.observe(el); return () => ro.disconnect(); }, []);
  const H = W < 500 ? 200 : 220, L = 34, R = 6, T = 12, B = 30;
  const max = Math.max(1, ...data.map(d => d.klik));
  const langkah = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : Math.ceil(max / 5 / 10) * 10;
  const atas = Math.ceil(max / langkah) * langkah;
  const y = v => T + (H - T - B) * (1 - v / atas);
  const lebar = (W - L - R) / Math.max(1, data.length), bw = Math.min(34, lebar * 0.62);
  const SER = [['non', 'Non-brand', 'var(--seo-1)'], ['brand', 'Brand', 'var(--seo-2)'], ['anon', 'Tersembunyi', 'var(--seo-3)']];
  const grid = []; for (let v = 0; v <= atas; v += langkah) grid.push(v);
  const labelTiap = Math.ceil(data.length / Math.max(3, Math.floor(W / 70)));
  return (
    <div style={{ position: 'relative' }} ref={box}>
      <div className="seo-leg">{SER.map(([k, nm, c]) => <span key={k}><i style={{ background: c }} />{nm}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Klik dari Google per minggu, dipecah non-brand, brand, dan tersembunyi" onMouseLeave={() => setHover(null)}>
        {grid.map(v => (<g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v}</text></g>))}
        {data.map((d, i) => {
          const x = L + i * lebar + (lebar - bw) / 2; let dasar = 0;
          const segs = SER.map(([k, , c]) => { const v = d[k] || 0; const y0 = y(dasar), y1 = y(dasar + v); dasar += v; return v > 0 ? { k, c, y: y1, h: Math.max(0, y0 - y1) } : null; }).filter(Boolean);
          const puncak = segs.length - 1;
          return (<g key={d.minggu} onMouseEnter={() => setHover(i)}>
            <rect x={L + i * lebar} y={T} width={lebar} height={H - T - B} fill={hover === i ? 'var(--hover)' : 'transparent'} />
            {segs.map((s, j) => (
              <rect key={s.k} x={x} y={s.y + (j > 0 ? 1 : 0)} width={bw} height={Math.max(0, s.h - (j > 0 ? 2 : 0))} fill={s.c} rx={j === puncak ? 4 : 0} />
            ))}
            {i % labelTiap === 0 && <text x={x + bw / 2} y={H - B + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">{tglPendek(d.minggu)}</text>}
          </g>);
        })}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth="1" />
      </svg>
      {hover != null && data[hover] && (() => { const d = data[hover];
        return (<div className="seo-tip" style={{ left: `${Math.min(78, Math.max(2, ((L + hover * (W - L - R) / data.length) / W) * 100))}%` }}>
          <b>Minggu {tglPendek(d.minggu)}</b>{d.hari < 7 ? <span className="hint"> ({d.hari} hari data)</span> : null}
          <div>Klik total <b>{angka(d.klik)}</b></div>
          {SER.map(([k, nm, c]) => <div key={k}><i style={{ background: c }} />{nm} <b>{angka(d[k])}</b></div>)}
          <div>Impresi <b>{angka(d.impresi)}</b> · posisi <b>{pos(d.posisi)}</b></div>
        </div>); })()}
    </div>
  );
}

export default function SeoPanel({ d1, d2 }) {
  const [s, setS] = useState(null), [gagal, setGagal] = useState(''), [tabel, setTabel] = useState(false);
  useEffect(() => {
    let hidup = true; setS(null); setGagal('');
    api('/api/marcom/seo?d1=' + (d1 || '') + '&d2=' + (d2 || '')).then(x => { if (hidup) setS(x); }).catch(e => { if (hidup) setGagal(e.message || 'Gagal memuat'); });
    return () => { hidup = false; };
  }, [d1, d2]);

  const gaya = (<style>{`
    .seo-wrap{--seo-1:#257de0;--seo-2:#f47230;--seo-3:#b9c0bd}
    :root[data-theme="dark"] .seo-wrap{--seo-1:#338ced;--seo-2:#e76624;--seo-3:#56695f}
    @media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])) .seo-wrap{--seo-1:#338ced;--seo-2:#e76624;--seo-3:#56695f}}
    .seo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
    .seo-k{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--card)}
    .seo-kj{font-size:12px;color:var(--muted);font-weight:700}
    .seo-kv{font-size:24px;font-weight:800;margin:2px 0 2px;font-variant-numeric:tabular-nums}
    .seo-d{display:block;font-size:12px;font-weight:700}
    .seo-d.baik{color:var(--green)} .seo-d.buruk{color:var(--red)} .seo-d.netral{color:var(--muted);font-weight:600}
    .seo-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:6px}
    .seo-leg i,.seo-tip i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
    .seo-tip{position:absolute;top:28px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:12px;box-shadow:var(--shadow);pointer-events:none;min-width:170px;line-height:1.6}
    .seo-bar{display:flex;height:12px;border-radius:6px;overflow:hidden;gap:2px;margin:8px 0 6px}
    .seo-path{word-break:break-all}
  `}</style>);

  if (gagal) return <div className="card" style={{ marginBottom: 12 }}><p className="hint" style={{ margin: 0, color: 'var(--red)' }}>Ringkasan SEO gagal dimuat: {gagal}</p></div>;
  if (!s) return <div className="card" style={{ marginBottom: 12 }}><p className="hint" style={{ margin: 0 }}>Memuat ringkasan SEO…</p></div>;
  if (s.kosong) return (<div className="card" style={{ marginBottom: 12 }}><h3 style={{ marginTop: 0 }}>Performa SEO</h3>
    <p className="hint" style={{ margin: 0 }}>{s.alasan || 'Data ringkasan SEO belum ada. Klik ⟳ Tarik Data Sekarang sekali; tarikan pertama mengambil data sejak awal analisa.'}</p></div>);

  const { ini, lalu, brand, periode, banding } = s;
  const bn = brand.ini, totKlik = Math.max(1, bn.non.klik + bn.brand.klik + bn.anon.klik);

  return (<div className="seo-wrap">{gaya}
    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ margin: 0 }}>Performa SEO · biodistrictofficial.com</h3>
      <p className="hint" style={{ margin: '4px 0 12px' }}>
        Periode {tglId(periode.d1)} – {tglId(periode.d2)} ({periode.hari} hari){periode.terpotong ? ' · dipotong di data terakhir Search Console (Google terlambat ±2 hari)' : ''}.
        {' '}{banding ? `Pembanding: ${tglId(banding.d1)} – ${tglId(banding.d2)}.` : 'Tanpa pembanding: periode sebelumnya jatuh sebelum awal analisa (1 Sep 2026).'}
      </p>
      <div className="seo-grid">
        <Kartu judul="Klik dari Google" nilai={angka(ini.klik)}><Delta kini={ini.klik} lalu={lalu?.klik} /></Kartu>
        <Kartu judul="Impresi (muncul di Google)" nilai={angka(ini.impresi)}><Delta kini={ini.impresi} lalu={lalu?.impresi} /></Kartu>
        <Kartu judul="CTR (klik ÷ impresi)" nilai={persen(ini.ctr)}><Delta kini={ini.ctr != null ? ini.ctr * 100 : null} lalu={lalu?.ctr != null ? lalu.ctr * 100 : null} mode="poin" /></Kartu>
        <Kartu judul="Posisi rata-rata" nilai={pos(ini.posisi)} sub="Makin kecil makin atas (1 = teratas)"><Delta kini={ini.posisi} lalu={lalu?.posisi} turunBagus mode="poin" /></Kartu>
        <Kartu judul="Pengunjung organik (GA4)" nilai={angka(ini.sesi)} sub="Sesi dari mesin pencari"><Delta kini={ini.sesi} lalu={lalu?.sesi} /></Kartu>
        <Kartu judul="Klik WA dari organik" nilai={angka(ini.kev)} sub="Key event GA4 dari pengunjung organik"><Delta kini={ini.kev} lalu={lalu?.kev} /></Kartu>
      </div>
    </div>

    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Brand vs non-brand</h3>
      <p className="hint" style={{ marginTop: 0 }}>Brand = pencarian yang menyebut Bio District (orang yang sudah tahu). Non-brand = pencarian umum seperti "rumah serpong": inilah ukuran SEO sebenarnya, karena mendatangkan orang yang belum kenal Bio District.</p>
      <div className="seo-bar" aria-hidden="true">
        {[['non', 'var(--seo-1)'], ['brand', 'var(--seo-2)'], ['anon', 'var(--seo-3)']].map(([k, c]) => bn[k].klik > 0 && <span key={k} style={{ width: (bn[k].klik / totKlik * 100) + '%', background: c }} />)}
      </div>
      <div className="seo-grid">
        <Kartu judul="Non-brand · klik" nilai={angka(bn.non.klik)} sub={`${angka(bn.non.impresi)} impresi`}><Delta kini={bn.non.klik} lalu={brand.lalu?.non.klik} /></Kartu>
        <Kartu judul="Brand · klik" nilai={angka(bn.brand.klik)} sub={`${angka(bn.brand.impresi)} impresi`}><Delta kini={bn.brand.klik} lalu={brand.lalu?.brand.klik} /></Kartu>
        <Kartu judul="Tersembunyi · klik" nilai={angka(bn.anon.klik)} sub="Kata kunci yang tidak dibuka Google demi privasi" />
      </div>
    </div>

    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Klik dari Google per minggu <span className="hint">(sejak 1 Sep 2026, tidak mengikuti filter periode)</span></h3>
        <button className="sort-btn" onClick={() => setTabel(!tabel)}>{tabel ? 'Lihat grafik' : 'Lihat tabel'}</button>
      </div>
      {!tabel ? <GrafikMinggu data={s.tren} /> : (
        <div className="tbl-wrap tbl-compact"><table>
          <thead><tr><th>Minggu mulai</th><th className="num">Klik</th><th className="num">Non-brand</th><th className="num">Brand</th><th className="num">Tersembunyi</th><th className="num">Impresi</th><th className="num">Posisi</th></tr></thead>
          <tbody>{s.tren.map(w => (<tr key={w.minggu}><td data-label="Minggu">{tglId(w.minggu)}{w.hari < 7 ? <span className="hint"> ({w.hari} hari)</span> : null}</td>
            <td className="num" data-label="Klik"><b>{angka(w.klik)}</b></td><td className="num" data-label="Non-brand">{angka(w.non)}</td><td className="num" data-label="Brand">{angka(w.brand)}</td>
            <td className="num" data-label="Tersembunyi">{angka(w.anon)}</td><td className="num" data-label="Impresi">{angka(w.impresi)}</td><td className="num" data-label="Posisi">{pos(w.posisi)}</td></tr>))}</tbody>
        </table></div>)}
    </div>

    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Per halaman <span className="hint">(25 teratas pada periode ini)</span></h3>
      <div className="tbl-wrap tbl-compact"><table>
        <thead><tr><th>Halaman</th><th className="num">Klik Google</th><th className="num">Impresi</th><th className="num">Posisi</th><th className="num">Pengunjung organik</th><th className="num">Klik WA</th></tr></thead>
        <tbody>{s.halaman.length ? s.halaman.map(h => (<tr key={h.page}>
          <td data-label="Halaman" className="seo-path"><a href={'https://biodistrictofficial.com' + h.page} target="_blank" rel="noopener noreferrer">{h.page === '/' ? '/ (beranda)' : h.page}</a></td>
          <td className="num" data-label="Klik"><b>{angka(h.klik)}</b>{h.klikLalu != null && h.klikLalu !== h.klik ? <div className="hint">lalu {angka(h.klikLalu)}</div> : null}</td>
          <td className="num" data-label="Impresi">{angka(h.impresi)}</td><td className="num" data-label="Posisi">{pos(h.posisi)}</td>
          <td className="num" data-label="Pengunjung">{angka(h.sesi)}</td><td className="num" data-label="Klik WA"><b>{angka(h.kev)}</b></td></tr>))
          : <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada data per halaman. Klik ⟳ Tarik Data Sekarang.</td></tr>}</tbody>
      </table></div>
      <span className="hint">Klik WA = key event GA4 dari pengunjung yang masuk lewat halaman itu dari pencarian organik. Halaman dengan banyak klik Google tapi 0 klik WA perlu tombol WA / formulir yang lebih jelas.</span>
    </div>

    <div className="two-col">
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Kata kunci non-brand teratas</h3>
        <div className="tbl-wrap tbl-compact"><table>
          <thead><tr><th>Kata kunci</th><th className="num">Klik</th><th className="num">Impresi</th><th className="num">Posisi</th></tr></thead>
          <tbody>{s.nonBrandTop.length ? s.nonBrandTop.map(r => (<tr key={r.query}><td data-label="Kata kunci"><b>{r.query}</b></td>
            <td className="num" data-label="Klik">{angka(r.klik)}</td><td className="num" data-label="Impresi">{angka(r.impresi)}</td><td className="num" data-label="Posisi">{pos(r.posisi)}</td></tr>))
            : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada kata kunci non-brand.</td></tr>}</tbody>
        </table></div>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Peluang <span className="hint">(sering muncul, belum 3 besar)</span></h3>
        <div className="tbl-wrap tbl-compact"><table>
          <thead><tr><th>Kata kunci</th><th className="num">Impresi</th><th className="num">Posisi</th><th className="num">Klik</th></tr></thead>
          <tbody>{s.peluang.length ? s.peluang.map(r => (<tr key={r.query}><td data-label="Kata kunci"><b>{r.query}</b></td>
            <td className="num" data-label="Impresi">{angka(r.impresi)}</td><td className="num" data-label="Posisi">{pos(r.posisi)}</td><td className="num" data-label="Klik">{angka(r.klik)}</td></tr>))
            : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Tidak ada kata kunci non-brand di posisi 4–20 dengan ≥20 impresi.</td></tr>}</tbody>
        </table></div>
        <span className="hint">Naik dari posisi 4–10 ke 1–3 biasanya melipatgandakan klik. Perkuat halaman/artikel yang membidik kata kunci ini.</span>
      </div>
    </div>

    <div className="two-col">
      {[['Posisi naik', s.naik, 'baik'], ['Posisi turun', s.turun, 'buruk']].map(([judul, rows, cls]) => (
        <div className="card" style={{ marginBottom: 12 }} key={judul}>
          <h3 style={{ marginTop: 0 }}>{judul} <span className="hint">(vs periode lalu, kata kunci ≥10 impresi)</span></h3>
          {!banding ? <p className="hint" style={{ margin: 0 }}>Butuh pembanding: pilih periode yang periode sebelumnya masih sesudah 1 Sep 2026 (mis. Bulan ini).</p> : (
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Kata kunci</th><th className="num">Posisi lalu</th><th className="num">Posisi kini</th><th className="num">Klik</th></tr></thead>
              <tbody>{rows.length ? rows.map(r => (<tr key={r.query}><td data-label="Kata kunci"><b>{r.query}</b>{r.brand ? <span className="hint"> · brand</span> : null}</td>
                <td className="num" data-label="Lalu">{pos(r.posisiLalu)}</td>
                <td className="num" data-label="Kini"><b>{pos(r.posisi)}</b> <span className={'seo-d ' + cls} style={{ display: 'inline' }}>{r.selisih > 0 ? '▲' : '▼'}{pos(Math.abs(r.selisih))}</span></td>
                <td className="num" data-label="Klik">{angka(r.klik)}</td></tr>))
                : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Tidak ada.</td></tr>}</tbody>
            </table></div>)}
        </div>))}
    </div>
  </div>);
}
