'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp } from '@/components/util';

// Angsuran anuitas: A = P · i / (1 - (1+i)^-n)
function angsuran(pokok, bungaTahun, bulan) {
  if (!pokok || !bulan) return 0;
  const i = bungaTahun / 100 / 12;
  if (i === 0) return pokok / bulan;
  return (pokok * i) / (1 - Math.pow(1 + i, -bulan));
}

export default function KprPage() {
  const [set, setSet] = useState({ project: [] });
  const [f, setF] = useState({
    harga: '', dpPersen: 10, bungaFix: 2.75, tahunFix: 3, bungaFloat: 11, tenor: 15,
  });
  const [detail, setDetail] = useState(false);

  useEffect(() => { api('/api/settings').then(setSet).catch(e => toast(e.message)); }, []);

  const h = Number(f.harga) || 0;
  const dp = Math.round(h * (Number(f.dpPersen) || 0) / 100);
  const pokok = Math.max(0, h - dp);
  const nBulan = (Number(f.tenor) || 0) * 12;
  const nFix = Math.min(nBulan, (Number(f.tahunFix) || 0) * 12);

  const hitung = useMemo(() => {
    if (!pokok || !nBulan) return null;
    const aFix = angsuran(pokok, Number(f.bungaFix) || 0, nBulan);
    // Sisa pokok setelah masa fix, lalu dihitung ulang dengan bunga floating
    let sisa = pokok;
    const iFix = (Number(f.bungaFix) || 0) / 100 / 12;
    const baris = [];
    for (let b = 1; b <= nFix; b++) {
      const bunga = sisa * iFix;
      const pokokBln = aFix - bunga;
      sisa = Math.max(0, sisa - pokokBln);
      baris.push({ b, angsur: aFix, bunga, pokokBln, sisa, masa: 'Fix' });
    }
    const sisaTenor = nBulan - nFix;
    const aFloat = sisaTenor > 0 ? angsuran(sisa, Number(f.bungaFloat) || 0, sisaTenor) : 0;
    const iFloat = (Number(f.bungaFloat) || 0) / 100 / 12;
    let s2 = sisa;
    for (let b = nFix + 1; b <= nBulan; b++) {
      const bunga = s2 * iFloat;
      const pokokBln = aFloat - bunga;
      s2 = Math.max(0, s2 - pokokBln);
      baris.push({ b, angsur: aFloat, bunga, pokokBln, sisa: s2, masa: 'Floating' });
    }
    const totalBayar = baris.reduce((a, x) => a + x.angsur, 0);
    return { aFix, aFloat, sisaSetelahFix: sisa, baris, totalBayar, totalBunga: totalBayar - pokok };
  }, [pokok, nBulan, nFix, f.bungaFix, f.bungaFloat]);

  const ff = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });
  // Penghasilan minimal: angsuran maksimal ±1/3 penghasilan
  const minPenghasilan = hitung ? Math.max(hitung.aFix, hitung.aFloat) * 3 : 0;

  return (
    <>
      <div className="page-head"><div><h1>Simulasi KPR</h1>
        <div className="sub">Hitung angsuran, kebutuhan dana awal, dan penghasilan minimal konsumen — anuitas dengan bunga fix lalu floating</div></div></div>

      <div className="card">
        <div className="form-grid">
          <div className="field"><label>Harga Unit (Rp)</label>
            <input type="number" min="0" {...ff('harga')} placeholder="contoh: 1550000000" /></div>
          <div className="field"><label>DP (%)</label>
            <input type="number" min="0" max="100" step="0.5" {...ff('dpPersen')} />
            <span className="hint">DP = {fmtRp(dp)} · Pokok KPR = {fmtRp(pokok)}</span></div>
          <div className="field"><label>Tenor (tahun)</label>
            <select {...ff('tenor')}>{[5, 8, 10, 12, 15, 20, 25, 30].map(t => <option key={t} value={t}>{t} tahun</option>)}</select></div>
          <div className="field"><label>Bunga Fix (% / tahun)</label>
            <input type="number" min="0" step="0.05" {...ff('bungaFix')} /></div>
          <div className="field"><label>Masa Fix (tahun)</label>
            <select {...ff('tahunFix')}>{[1, 2, 3, 5, 8, 10].map(t => <option key={t} value={t}>{t} tahun</option>)}</select></div>
          <div className="field"><label>Bunga Floating (% / tahun)</label>
            <input type="number" min="0" step="0.05" {...ff('bungaFloat')} />
            <span className="hint">Perkiraan bunga setelah masa fix berakhir.</span></div>
        </div>
        {(set.project || []).length > 0 && (
          <div className="fu-toolbar" style={{ marginTop: 4 }}>
            <span className="hint" style={{ fontWeight: 700 }}>Isi cepat:</span>
            <button className="sort-btn" onClick={() => setF({ ...f, harga: 1553778000, dpPersen: 10, bungaFix: 2.75, tahunFix: 3, bungaFloat: 11, tenor: 15 })}>BIO Tipe A</button>
            <button className="sort-btn" onClick={() => setF({ ...f, harga: 2097000000, dpPersen: 10, bungaFix: 2.75, tahunFix: 3, bungaFloat: 11, tenor: 15 })}>BIO Tipe B</button>
            <button className="sort-btn" onClick={() => setF({ ...f, harga: 2595417445, dpPersen: 10, bungaFix: 2.75, tahunFix: 3, bungaFloat: 11, tenor: 15 })}>BIO Tipe C</button>
            <button className="sort-btn" onClick={() => setF({ ...f, harga: 185000000, dpPersen: 0, bungaFix: 5, tahunFix: 20, bungaFloat: 5, tenor: 20 })}>Permai Subsidi</button>
          </div>
        )}
      </div>

      {hitung ? (<>
        <div className="kpi-grid" style={{ marginTop: 14 }}>
          <div className="kpi"><div className="kpi-label">Angsuran Masa Fix</div>
            <div className="kpi-val" style={{ color: 'var(--green)' }}>{fmtRp(Math.round(hitung.aFix))}</div>
            <div className="hint">per bulan · {f.tahunFix} tahun pertama</div></div>
          <div className="kpi"><div className="kpi-label">Angsuran Setelah Fix</div>
            <div className="kpi-val" style={{ color: 'var(--brass)' }}>{fmtRp(Math.round(hitung.aFloat))}</div>
            <div className="hint">perkiraan · bunga {f.bungaFloat}%</div></div>
          <div className="kpi"><div className="kpi-label">Dana Awal (DP)</div>
            <div className="kpi-val">{fmtRp(dp)}</div>
            <div className="hint">belum termasuk biaya KPR &amp; notaris</div></div>
          <div className="kpi"><div className="kpi-label">Penghasilan Minimal</div>
            <div className="kpi-val">{fmtRp(Math.round(minPenghasilan))}</div>
            <div className="hint">asumsi angsuran maks ⅓ penghasilan</div></div>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <h2>Ringkasan Pembiayaan</h2>
          <div className="tbl-wrap"><table className="tbl-compact"><tbody>
            <tr><td>Harga unit</td><td className="num"><b>{fmtRp(h)}</b></td></tr>
            <tr><td>DP {f.dpPersen}%</td><td className="num">{fmtRp(dp)}</td></tr>
            <tr><td>Pokok KPR</td><td className="num"><b>{fmtRp(pokok)}</b></td></tr>
            <tr><td>Tenor</td><td className="num">{f.tenor} tahun ({nBulan} bulan)</td></tr>
            <tr><td>Sisa pokok setelah masa fix</td><td className="num">{fmtRp(Math.round(hitung.sisaSetelahFix))}</td></tr>
            <tr><td>Total bunga (perkiraan)</td><td className="num">{fmtRp(Math.round(hitung.totalBunga))}</td></tr>
            <tr><td>Total pembayaran s/d lunas</td><td className="num"><b>{fmtRp(Math.round(hitung.totalBayar + dp))}</b></td></tr>
          </tbody></table></div>
          <p className="hint">Perhitungan anuitas — hasil resmi tetap mengikuti persetujuan bank. Belum termasuk biaya provisi, administrasi, asuransi jiwa &amp; kebakaran, notaris/AJB, dan BPHTB.</p>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="sort-btn" onClick={() => setDetail(d => !d)}>{detail ? '▲ Sembunyikan tabel angsuran' : '▼ Lihat tabel angsuran per bulan'}</button>
            <button className="sort-btn" onClick={() => {
              const teks = `*SIMULASI KPR — ${fmtRp(h)}*\n\nDP ${f.dpPersen}% : ${fmtRp(dp)}\nPokok KPR : ${fmtRp(pokok)}\nTenor : ${f.tenor} tahun\n\n*Angsuran ${f.tahunFix} th pertama (fix ${f.bungaFix}%) : ${fmtRp(Math.round(hitung.aFix))}/bln*\nAngsuran setelahnya (perkiraan ${f.bungaFloat}%) : ${fmtRp(Math.round(hitung.aFloat))}/bln\n\nPenghasilan minimal ± ${fmtRp(Math.round(minPenghasilan))}/bln.\n\n_Simulasi, hasil akhir mengikuti persetujuan bank._`;
              navigator.clipboard.writeText(teks).then(() => toast('Simulasi disalin — tinggal tempel di WhatsApp 📋')).catch(() => toast('Gagal menyalin'));
            }}>📋 Salin untuk WhatsApp</button>
          </div>
        </div>

        {detail && (
          <div className="card" style={{ marginTop: 14 }}>
            <h2>Tabel Angsuran ({nBulan} bulan)</h2>
            <div className="tbl-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="tbl-compact">
                <thead><tr><th>Bulan</th><th>Masa</th><th className="num">Angsuran</th><th className="num">Pokok</th><th className="num">Bunga</th><th className="num">Sisa Pokok</th></tr></thead>
                <tbody>
                  {hitung.baris.map(r => (
                    <tr key={r.b}>
                      <td data-label="Bulan">{r.b}</td>
                      <td data-label="Masa">{r.masa === 'Fix' ? <span className="badge b-close">Fix</span> : <span className="badge b-warm">Floating</span>}</td>
                      <td className="num" data-label="Angsuran">{fmtRp(Math.round(r.angsur))}</td>
                      <td className="num" data-label="Pokok">{fmtRp(Math.round(r.pokokBln))}</td>
                      <td className="num" data-label="Bunga">{fmtRp(Math.round(r.bunga))}</td>
                      <td className="num" data-label="Sisa">{fmtRp(Math.round(r.sisa))}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>) : (
        <div className="card" style={{ marginTop: 14 }}><span className="hint">Isi harga unit dulu untuk melihat hasil simulasi.</span></div>
      )}
      <Toast />
    </>
  );
}
