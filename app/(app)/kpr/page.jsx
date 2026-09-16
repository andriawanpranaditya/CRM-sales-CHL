'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp } from '@/components/util';

// Angsuran anuitas: A = P · i / (1 − (1+i)^−n)
function anuitas(plafon, bungaTahun, bulan) {
  if (!plafon || !bulan) return 0;
  const i = bungaTahun / 100 / 12;
  return i === 0 ? plafon / bulan : (plafon * i) / (1 - Math.pow(1 + i, -bulan));
}

// Plafon KPR sesuai price list (angka price list = plafon, bukan harga rumah)
const PAKET = [
  { grup: 'BIO DISTRICT', label: 'Tipe A · Standar', plafon: 1553778000, bunga: 2.75 },
  { grup: 'BIO DISTRICT', label: 'Tipe A · All In', plafon: 1670000000, bunga: 2.75 },
  { grup: 'BIO DISTRICT', label: 'Tipe B · Standar', plafon: 2097000000, bunga: 2.75 },
  { grup: 'BIO DISTRICT', label: 'Tipe B · All In', plafon: 2271000000, bunga: 2.75 },
  { grup: 'BIO DISTRICT', label: 'Tipe C · Standar', plafon: 2595417445, bunga: 2.75 },
  { grup: 'BIO DISTRICT', label: 'Tipe C · All In', plafon: 2806527243, bunga: 2.75 },
  { grup: 'PERMAI INDAH', label: 'Subsidi · tanpa DP', plafon: 185000000, bunga: 5 },
];
const TENOR = [25, 20, 15, 10];

export default function KprPage() {
  const [me, setMe] = useState(null);
  const [f, setF] = useState({
    plafon: '', bunga: 2.75, tenor: 25, dbr: 40,
    penghasilan: '', cicilanLain: '', bungaLanjut: 11, tahunFix: 3,
  });
  const [pilih, setPilih] = useState('');
  const [lanjut, setLanjut] = useState(false); // proyeksi setelah masa fix (opsional)
  const [tabel, setTabel] = useState(false);

  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => {}); }, []);

  const P = Number(f.plafon) || 0;
  const bunga = Number(f.bunga) || 0;
  const nBulan = (Number(f.tenor) || 0) * 12;
  const angsuran = useMemo(() => anuitas(P, bunga, nBulan), [P, bunga, nBulan]);

  // Kebutuhan penghasilan berbasis DBR (Debt Burden Ratio) — angsuran tidak diubah, hanya cara menilai
  const dbr = Number(f.dbr) || 40;
  const lain = Number(f.cicilanLain) || 0;
  const butuh = angsuran ? (angsuran + lain) / (dbr / 100) : 0;
  const penghasilan = Number(f.penghasilan) || 0;
  const dbrAktual = penghasilan ? ((angsuran + lain) / penghasilan) * 100 : null;

  // Proyeksi setelah masa fix (opsional, hanya perkiraan)
  const proyeksi = useMemo(() => {
    if (!lanjut || !P || !nBulan) return null;
    const nFix = Math.min(nBulan, (Number(f.tahunFix) || 0) * 12);
    const i = bunga / 100 / 12;
    let sisa = P;
    for (let b = 0; b < nFix; b++) sisa = Math.max(0, sisa - (angsuran - sisa * i));
    const sisaTenor = nBulan - nFix;
    return { sisa, angsuran: sisaTenor > 0 ? anuitas(sisa, Number(f.bungaLanjut) || 0, sisaTenor) : 0, nFix };
  }, [lanjut, P, nBulan, bunga, angsuran, f.tahunFix, f.bungaLanjut]);

  const ff = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });
  const pilihPaket = p => {
    setPilih(p.label + p.grup);
    setF({ ...f, plafon: p.plafon, bunga: p.bunga, tenor: p.grup === 'PERMAI INDAH' ? 20 : 25 });
  };

  // Amortisasi untuk tabel angsuran
  const baris = useMemo(() => {
    if (!tabel || !P || !nBulan) return [];
    const i = bunga / 100 / 12; let sisa = P; const out = [];
    for (let b = 1; b <= nBulan; b++) {
      const bg = sisa * i, pk = angsuran - bg;
      sisa = Math.max(0, sisa - pk);
      out.push({ b, bunga: bg, pokok: pk, sisa });
    }
    return out;
  }, [tabel, P, nBulan, bunga, angsuran]);

  const statusKelayakan = () => {
    if (!dbrAktual) return null;
    if (dbrAktual <= 40) return { warna: 'var(--green)', teks: `Aman — DBR ${Math.round(dbrAktual)}%`, saran: 'Rasio cicilan sehat, peluang disetujui besar.' };
    if (dbrAktual <= 50) return { warna: '#C9922E', teks: `Masih mungkin — DBR ${Math.round(dbrAktual)}%`, saran: 'Di atas 40% bank menilai lebih ketat: butuh penghasilan tetap, SLIK bersih, dan cicilan lain minim. Bisa juga gabungkan penghasilan pasangan (joint income).' };
    return { warna: 'var(--red)', teks: `Perlu penyesuaian — DBR ${Math.round(dbrAktual)}%`, saran: 'Opsi: perpanjang tenor, tambah uang muka agar plafon turun, atau ajukan dengan penghasilan gabungan pasangan.' };
  };
  const kel = statusKelayakan();

  return (
    <>
      <div className="page-head"><div><h1>Simulasi KPR</h1>
        <div className="sub">Angka price list adalah <b>plafon KPR</b> — angsuran dihitung apa adanya (anuitas), kebutuhan penghasilan memakai rasio DBR</div></div></div>

      <div className="card">
        <div className="fu-toolbar" style={{ marginBottom: 10 }}>
          <span className="hint" style={{ fontWeight: 700 }}>Pilih unit:</span>
          {PAKET.map(p => (
            <button key={p.grup + p.label} className={'sort-btn' + (pilih === p.label + p.grup ? ' active' : '')}
              onClick={() => pilihPaket(p)} title={'Plafon ' + fmtRp(p.plafon)}>
              {p.grup === 'BIO DISTRICT' ? '🏡 ' : '🏠 '}{p.label}
            </button>))}
          {P > 0 && <button className="sort-btn" onClick={() => { setPilih(''); setF({ ...f, plafon: '' }); }}>✕ Kosongkan</button>}
        </div>

        <div className="form-grid">
          <div className="field"><label>Plafon KPR (Rp)</label>
            <input type="number" min="0" {...ff('plafon')} placeholder="isi manual atau pilih unit di atas" />
            <span className="hint">Jumlah yang dibiayai bank — sesuai angka price list.</span></div>
          <div className="field"><label>Bunga (% / tahun)</label>
            <input type="number" min="0" step="0.05" {...ff('bunga')} /></div>
          <div className="field"><label>Tenor</label>
            <select {...ff('tenor')}>{TENOR.map(t => <option key={t} value={t}>{t} tahun</option>)}</select></div>
          <div className="field"><label>Batas DBR</label>
            <select {...ff('dbr')}>
              <option value={30}>30% — sangat aman</option>
              <option value={40}>40% — umum dipakai bank</option>
              <option value={50}>50% — maksimal, dengan syarat tertentu</option>
            </select>
            <span className="hint">DBR = total cicilan ÷ penghasilan. Ketentuan membolehkan hingga 50% bila penghasilan tetap &amp; SLIK bersih.</span></div>
          <div className="field"><label>Cicilan Lain per Bulan (Rp)</label>
            <input type="number" min="0" {...ff('cicilanLain')} placeholder="kendaraan, kartu kredit, dll — opsional" /></div>
          <div className="field"><label>Penghasilan Konsumen (Rp)</label>
            <input type="number" min="0" {...ff('penghasilan')} placeholder="boleh gabungan suami-istri — opsional" />
            <span className="hint">Diisi bila ingin langsung melihat kelayakannya.</span></div>
        </div>
      </div>

      {P > 0 ? (<>
        <div className="kpi-grid" style={{ marginTop: 14 }}>
          <div className="kpi"><div className="kpi-label">Angsuran per Bulan</div>
            <div className="kpi-val" style={{ color: 'var(--green)' }}>{fmtRp(Math.round(angsuran))}</div>
            <div className="hint">plafon {fmtRp(P)} · {f.tenor} tahun · bunga {f.bunga}%</div></div>
          <div className="kpi"><div className="kpi-label">Penghasilan Minimal</div>
            <div className="kpi-val" style={{ color: 'var(--brass)' }}>{fmtRp(Math.round(butuh))}</div>
            <div className="hint">pada batas DBR {dbr}%{lain ? ' · termasuk cicilan lain ' + fmtRp(lain) : ''}</div></div>
          <div className="kpi"><div className="kpi-label">Penghasilan Min. (DBR 50%)</div>
            <div className="kpi-val">{fmtRp(Math.round((angsuran + lain) / 0.5))}</div>
            <div className="hint">batas maksimal, syarat tertentu</div></div>
          {kel ? (
            <div className="kpi"><div className="kpi-label">Kelayakan Konsumen</div>
              <div className="kpi-val" style={{ color: kel.warna, fontSize: 20 }}>{kel.teks}</div>
              <div className="hint">{kel.saran}</div></div>
          ) : (
            <div className="kpi"><div className="kpi-label">Total Bayar s/d Lunas</div>
              <div className="kpi-val">{fmtRp(Math.round(angsuran * nBulan))}</div>
              <div className="hint">bunga {fmtRp(Math.round(angsuran * nBulan - P))}</div></div>
          )}
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <h2>Pilihan Tenor — plafon {fmtRp(P)}</h2>
          <div className="tbl-wrap"><table className="tbl-compact">
            <thead><tr><th>Tenor</th><th className="num">Angsuran / Bulan</th><th className="num">Penghasilan Min. (DBR {dbr}%)</th><th className="num">DBR 50%</th><th className="num">Total Bayar</th></tr></thead>
            <tbody>
              {TENOR.map(t => {
                const a = anuitas(P, bunga, t * 12);
                const aktif = Number(f.tenor) === t;
                return <tr key={t} style={aktif ? { background: '#E4EFE8' } : undefined}>
                  <td data-label="Tenor"><b>{t} tahun</b>{aktif ? <span className="hint"> · dipilih</span> : null}</td>
                  <td className="num" data-label="Angsuran"><b>{fmtRp(Math.round(a))}</b></td>
                  <td className="num" data-label={'DBR ' + dbr + '%'}>{fmtRp(Math.round((a + lain) / (dbr / 100)))}</td>
                  <td className="num" data-label="DBR 50%">{fmtRp(Math.round((a + lain) / 0.5))}</td>
                  <td className="num" data-label="Total Bayar">{fmtRp(Math.round(a * t * 12))}</td>
                </tr>;
              })}
            </tbody>
          </table></div>
          <p className="hint">Angsuran dihitung anuitas atas plafon &amp; bunga di atas — sama dengan ilustrasi price list. Belum termasuk biaya provisi, administrasi, asuransi jiwa &amp; kebakaran, notaris/AJB, dan BPHTB. Persetujuan akhir tetap mengikuti penilaian bank.</p>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="sort-btn" onClick={() => setTabel(t => !t)}>{tabel ? '▲ Sembunyikan tabel angsuran' : '▼ Tabel angsuran per bulan'}</button>
            <button className={'sort-btn' + (lanjut ? ' active' : '')} onClick={() => setLanjut(l => !l)}>
              {lanjut ? '✓ Proyeksi setelah masa fix' : '📈 Proyeksi setelah masa fix'}
            </button>
            <button className="sort-btn" onClick={() => {
              const teks = `*SIMULASI KPR*\n${pilih ? pilih.replace('BIO DISTRICT', ' — BIO District').replace('PERMAI INDAH', ' — Permai Indah') + '\n' : ''}\nPlafon KPR : ${fmtRp(P)}\nBunga : ${f.bunga}% per tahun\n\n${TENOR.map(t => `${t} tahun : ${fmtRp(Math.round(anuitas(P, bunga, t * 12)))}/bln`).join('\n')}\n\nPilihan ${f.tenor} tahun → *${fmtRp(Math.round(angsuran))}/bulan*\nPenghasilan minimal ± ${fmtRp(Math.round(butuh))}/bln (DBR ${dbr}%).\n\n_Simulasi; belum termasuk biaya KPR, notaris & pajak. Persetujuan akhir oleh bank._`;
              navigator.clipboard.writeText(teks).then(() => toast('Simulasi disalin — tinggal tempel di WhatsApp 📋')).catch(() => toast('Gagal menyalin'));
            }}>📋 Salin untuk WhatsApp</button>
          </div>
        </div>

        {lanjut && proyeksi && (
          <div className="card" style={{ marginTop: 14 }}>
            <h2>Proyeksi Setelah Masa Fix <span className="hint">(perkiraan, bukan angka resmi bank)</span></h2>
            <div className="form-grid">
              <div className="field"><label>Masa Fix (tahun)</label>
                <select {...ff('tahunFix')}>{[1, 2, 3, 5, 8, 10].map(t => <option key={t} value={t}>{t} tahun</option>)}</select></div>
              <div className="field"><label>Perkiraan Bunga Setelahnya (%)</label>
                <input type="number" min="0" step="0.25" {...ff('bungaLanjut')} /></div>
            </div>
            <div className="tbl-wrap"><table className="tbl-compact"><tbody>
              <tr><td>Angsuran selama {f.tahunFix} tahun pertama</td><td className="num"><b>{fmtRp(Math.round(angsuran))}</b></td></tr>
              <tr><td>Sisa pokok saat masa fix berakhir</td><td className="num">{fmtRp(Math.round(proyeksi.sisa))}</td></tr>
              <tr><td>Perkiraan angsuran setelahnya (bunga {f.bungaLanjut}%)</td><td className="num"><b>{fmtRp(Math.round(proyeksi.angsuran))}</b></td></tr>
            </tbody></table></div>
            <p className="hint">Angka ini hanya proyeksi bila bunga berubah setelah masa fix — bukan dasar penilaian bank saat pengajuan, dan bisa disiasati dengan take over atau pelunasan sebagian.</p>
          </div>
        )}

        {tabel && (
          <div className="card" style={{ marginTop: 14 }}>
            <h2>Tabel Angsuran ({nBulan} bulan)</h2>
            <div className="tbl-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="tbl-compact">
                <thead><tr><th>Bulan</th><th className="num">Angsuran</th><th className="num">Pokok</th><th className="num">Bunga</th><th className="num">Sisa Pokok</th></tr></thead>
                <tbody>{baris.map(r => (
                  <tr key={r.b}>
                    <td data-label="Bulan">{r.b}</td>
                    <td className="num" data-label="Angsuran">{fmtRp(Math.round(angsuran))}</td>
                    <td className="num" data-label="Pokok">{fmtRp(Math.round(r.pokok))}</td>
                    <td className="num" data-label="Bunga">{fmtRp(Math.round(r.bunga))}</td>
                    <td className="num" data-label="Sisa">{fmtRp(Math.round(r.sisa))}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>) : (
        <div className="card" style={{ marginTop: 14 }}>
          <span className="hint">Pilih unit di atas atau isi plafon KPR untuk melihat simulasi.</span>
        </div>
      )}
      <Toast />
    </>
  );
}
