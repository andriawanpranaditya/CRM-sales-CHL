'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { fmtRp } from '@/components/util';

// ===== Data price list (angka price list = plafon KPR / harga jual) =====
const UNIT = {
  'BIO Tipe A': { standar: 1553778000, allin: 1670000000, bunga: 2.75, tenor: 25 },
  'BIO Tipe B': { standar: 2097000000, allin: 2271000000, bunga: 2.75, tenor: 25 },
  'BIO Tipe C': { standar: 2595417445, allin: 2806527243, bunga: 2.75, tenor: 25 },
  'Permai Indah Subsidi': { standar: 185000000, allin: 185000000, bunga: 5, tenor: 20 },
};
const CARA = [
  ['kpr', 'KPR'],
  ['keras', 'Cash Keras'],
  ['bertahap', 'Cash Bertahap'],
];
const BF_DEFAULT = 5000000;
const TENOR_KPR = [25, 20, 15, 10];

// ===== Utilitas tanggal =====
const iso = d => d.toISOString().slice(0, 10);
const plusHari = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const plusBulan = (s, n) => {
  const d = new Date(s + 'T00:00:00'); const hari = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const akhir = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(hari, akhir));
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const tglID = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
function anuitas(p, b, n) { if (!p || !n) return 0; const i = b / 100 / 12; return i === 0 ? p / n : (p * i) / (1 - Math.pow(1 + i, -n)); }

// ===== Penyusun jadwal pembayaran =====
function susunJadwal(cara, harga, tglBF, bf, nCicil) {
  if (!harga || !tglBF) return [];
  if (cara === 'kpr') {
    // Ketentuan price list: subsidi DP 10% → DP 0% hari ke-14, akad 100% − BF sebulan setelah DP
    const tDP = plusHari(tglBF, 14);
    return [
      { ket: 'Booking Fee', tgl: tglBF, nominal: bf },
      { ket: 'DP 0% (subsidi DP 10%)', tgl: tDP, nominal: 0 },
      { ket: 'Akad / pelunasan via KPR (100% − BF)', tgl: plusBulan(tDP, 1), nominal: harga - bf },
    ];
  }
  const dp = Math.round(harga * 0.10); // DP 10% sudah termasuk Booking Fee
  const rows = [
    { ket: 'Booking Fee', tgl: tglBF, nominal: bf },
    { ket: `Sisa DP (DP 10% = ${fmtRp(dp)}, termasuk BF)`, tgl: plusHari(tglBF, 14), nominal: dp - bf },
  ];
  if (cara === 'keras') {
    rows.push({ ket: 'Pelunasan', tgl: plusHari(tglBF, 30), nominal: harga - dp });
    return rows;
  }
  // Cash bertahap: sisa 90% dibagi rata, cicilan 1 hari ke-30 lalu tiap bulan
  const sisa = harga - dp;
  const n = Math.max(1, nCicil);
  const cic = Math.round(sisa / n / 1000) * 1000;
  const t1 = plusHari(tglBF, 30);
  for (let i = 0; i < n; i++) {
    rows.push({ ket: `Cicilan ${i + 1} dari ${n}`, tgl: plusBulan(t1, i), nominal: i === n - 1 ? sisa - cic * (n - 1) : cic });
  }
  return rows;
}

export default function SimulasiCaraBayar() {
  const [unit, setUnit] = useState('BIO Tipe A');
  const [cara, setCara] = useState('kpr');
  const [hargaMode, setHargaMode] = useState('standar'); // standar | allin | manual
  const [hargaManual, setHargaManual] = useState('');
  const [tglBF, setTglBF] = useState(iso(new Date()));
  const [bf, setBf] = useState(BF_DEFAULT);
  const [nCicil, setNCicil] = useState(12);
  const [rows, setRows] = useState([]);
  // KPR
  const [tenor, setTenor] = useState(25);
  const [bunga, setBunga] = useState(2.75);
  const [dbr, setDbr] = useState(40);
  const [penghasilan, setPenghasilan] = useState('');
  const [cicilanLain, setCicilanLain] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const U = UNIT[unit];
  // Harga default mengikuti cara bayar: Cash Keras = Standar, Cash Bertahap = All In
  useEffect(() => {
    if (cara === 'keras') setHargaMode('standar');
    if (cara === 'bertahap') setHargaMode('allin');
  }, [cara]);
  useEffect(() => { setBunga(U.bunga); setTenor(U.tenor); }, [unit]); // eslint-disable-line

  const harga = hargaMode === 'manual' ? (Number(hargaManual) || 0) : (hargaMode === 'allin' ? U.allin : U.standar);

  // Susun ulang jadwal setiap kali dasar perhitungan berubah
  useEffect(() => {
    setRows(susunJadwal(cara, harga, tglBF, Number(bf) || 0, Math.min(12, Math.max(1, Number(nCicil) || 12))));
  }, [cara, harga, tglBF, bf, nCicil]);

  // Edit manual: termin terakhir menyeimbangkan otomatis
  const ubahBaris = (i, k, v) => {
    const r = rows.map((x, j) => j === i ? { ...x, [k]: k === 'nominal' ? Number(v) || 0 : v } : x);
    if (k === 'nominal' && r.length > 1) {
      const tanpaAkhir = r.slice(0, -1).reduce((a, x) => a + x.nominal, 0);
      r[r.length - 1] = { ...r[r.length - 1], nominal: harga - tanpaAkhir };
    }
    setRows(r);
  };
  const total = rows.reduce((a, x) => a + (Number(x.nominal) || 0), 0);
  const cocok = Math.round(total) === Math.round(harga);

  // ===== KPR =====
  const plafon = harga;
  const angs = useMemo(() => anuitas(plafon, Number(bunga) || 0, (Number(tenor) || 0) * 12), [plafon, bunga, tenor]);
  const lain = Number(cicilanLain) || 0;
  const butuh = angs ? (angs + lain) / (dbr / 100) : 0;
  const dbrAkt = Number(penghasilan) ? ((angs + lain) / Number(penghasilan)) * 100 : null;
  const kel = dbrAkt == null ? null
    : dbrAkt <= 40 ? { w: 'var(--green)', t: `Aman — DBR ${Math.round(dbrAkt)}%`, s: 'Rasio cicilan sehat, peluang disetujui besar.' }
    : dbrAkt <= 50 ? { w: '#C9922E', t: `Masih mungkin — DBR ${Math.round(dbrAkt)}%`, s: 'Butuh penghasilan tetap, SLIK bersih, cicilan lain minim; bisa joint income pasangan.' }
    : { w: 'var(--red)', t: `Perlu penyesuaian — DBR ${Math.round(dbrAkt)}%`, s: 'Perpanjang tenor, tambah uang muka, atau ajukan dengan penghasilan gabungan.' };

  const labelHarga = hargaMode === 'manual' ? 'Harga manual' : hargaMode === 'allin' ? 'Harga All In' : 'Harga Standar';
  const namaCara = CARA.find(c => c[0] === cara)[1] + (cara === 'bertahap' ? ` ${Math.min(12, Number(nCicil) || 12)} bulan` : '');

  function teksWA() {
    let t = `*SIMULASI CARA BAYAR — ${unit}*\n${namaCara} · ${labelHarga}: *${fmtRp(harga)}*\n\n`;
    rows.forEach(r => { t += `${tglID(r.tgl)} — ${r.ket}: ${fmtRp(r.nominal) === '—' ? 'Rp0' : fmtRp(r.nominal)}\n`; });
    if (cara === 'kpr') {
      t += `\n*Angsuran KPR* (bunga ${bunga}%):\n` + TENOR_KPR.map(n => `${n} th: ${fmtRp(Math.round(anuitas(plafon, Number(bunga), n * 12)))}/bln`).join('\n');
      t += `\nPenghasilan minimal ± ${fmtRp(Math.round(butuh))}/bln (DBR ${dbr}%).`;
    }
    t += `\n\nPembayaran ke: PT Serpong Bangun Lestari · BCA 205-005-3604 (KCK Menara BCA).\n_Simulasi; mengikuti ketentuan price list yang berlaku._`;
    return t;
  }

  async function downloadPDF() {
    setPdfBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const PW = 210, M = 14;
      doc.setFillColor(28, 43, 35); doc.rect(0, 0, PW, 20, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text('SIMULASI CARA BAYAR', M, 9);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('PT Cipta Harmoni Lestari · ' + new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }), M, 15);
      doc.setTextColor(28, 43, 35);
      let y = 30;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(unit + ' — ' + namaCara, M, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(labelHarga + ': ' + fmtRp(harga), M, y); y += 8;
      // tabel jadwal
      doc.setFillColor(35, 105, 74); doc.rect(M, y, PW - M * 2, 8, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text('Tanggal', M + 3, y + 5.5); doc.text('Termin', M + 38, y + 5.5); doc.text('Nominal', PW - M - 3, y + 5.5, { align: 'right' });
      doc.setTextColor(28, 43, 35); doc.setFont('helvetica', 'normal'); y += 8;
      rows.forEach((r, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        if (i % 2) { doc.setFillColor(245, 244, 239); doc.rect(M, y, PW - M * 2, 7, 'F'); }
        doc.text(tglID(r.tgl), M + 3, y + 4.8);
        doc.text(doc.splitTextToSize(r.ket, 95)[0], M + 38, y + 4.8);
        doc.text(r.nominal ? fmtRp(r.nominal) : 'Rp 0', PW - M - 3, y + 4.8, { align: 'right' });
        y += 7;
      });
      doc.setFont('helvetica', 'bold'); doc.text('Total', M + 38, y + 5); doc.text(fmtRp(total), PW - M - 3, y + 5, { align: 'right' }); y += 12;
      if (cara === 'kpr') {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text('Ilustrasi Angsuran KPR — bunga ' + bunga + '%', M, y); y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        TENOR_KPR.forEach(n => {
          const a = anuitas(plafon, Number(bunga), n * 12);
          doc.text(n + ' tahun', M + 3, y); doc.text(fmtRp(Math.round(a)) + ' / bulan', M + 40, y);
          doc.text('penghasilan min. ' + fmtRp(Math.round((a + lain) / (dbr / 100))) + ' (DBR ' + dbr + '%)', M + 95, y);
          y += 6;
        });
        y += 4;
      }
      doc.setFontSize(8.5); doc.setTextColor(90, 100, 92);
      [
        'Pembayaran dianggap sah apabila sudah masuk ke rekening PT Serpong Bangun Lestari — BCA 205-005-3604, KCK Menara BCA.',
        'Keterlambatan pembayaran dikenakan denda 1‰ (satu per mil) per hari. Nama blok & nomor yang tercantum saat tanda jadi tidak dapat diganti.',
        'Simulasi ini mengikuti ketentuan price list yang berlaku dan dapat berubah sewaktu-waktu tanpa pemberitahuan terlebih dahulu.',
      ].forEach(t => { const l = doc.splitTextToSize(t, PW - M * 2); doc.text(l, M, y); y += l.length * 4.2 + 1; });
      doc.text('copyright © 2026 by Andriawanp', PW / 2, 290, { align: 'center' });
      doc.save(`Simulasi_${unit.replace(/\s+/g, '_')}_${namaCara.replace(/\s+/g, '_')}.pdf`);
      toast('PDF simulasi terunduh 📄');
    } catch (e) { toast(e.message || 'Gagal membuat PDF'); } finally { setPdfBusy(false); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Simulasi Cara Bayar</h1>
        <div className="sub">KPR mengikuti ketentuan price list · Cash Keras (harga standar) &amp; Cash Bertahap (harga all in) mengikuti ketentuan perusahaan</div></div></div>

      <div className="card">
        <div className="form-grid">
          <div className="field"><label>Unit</label>
            <select value={unit} onChange={e => setUnit(e.target.value)}>{Object.keys(UNIT).map(u => <option key={u}>{u}</option>)}</select></div>
          <div className="field"><label>Cara Bayar</label>
            <select value={cara} onChange={e => setCara(e.target.value)}>{CARA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>Harga</label>
            <select value={hargaMode} onChange={e => setHargaMode(e.target.value)}>
              <option value="standar">Harga Standar — {fmtRp(U.standar)}</option>
              <option value="allin">Harga All In — {fmtRp(U.allin)}</option>
              <option value="manual">Isi manual</option>
            </select>
            {hargaMode === 'manual' && <input type="number" min="0" style={{ marginTop: 6 }} value={hargaManual}
              onChange={e => setHargaManual(e.target.value)} placeholder="ketik harga" />}
            <span className="hint">{cara === 'kpr' ? 'Untuk KPR, harga ini adalah plafon (sesuai price list).' : cara === 'keras' ? 'Default Cash Keras: Harga Standar.' : 'Default Cash Bertahap: Harga All In.'}</span></div>
          <div className="field"><label>Tanggal Booking Fee</label>
            <input type="date" value={tglBF} onChange={e => setTglBF(e.target.value)} /></div>
          <div className="field"><label>Booking Fee (Rp)</label>
            <input type="number" min="0" value={bf} onChange={e => setBf(e.target.value)} />
            <span className="hint">{cara === 'kpr' ? 'Pelunasan via KPR = 100% − BF.' : 'Sudah termasuk dalam DP 10%.'}</span></div>
          {cara === 'bertahap' && <div className="field"><label>Jumlah Cicilan (bulan)</label>
            <select value={nCicil} onChange={e => setNCicil(Number(e.target.value))}>
              {[12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map(n => <option key={n} value={n}>{n} bulan{n === 12 ? ' (standar)' : ''}</option>)}
            </select>
            <span className="hint">Maksimal 12 bulan, dibagi rata sampai lunas.</span></div>}
        </div>
      </div>

      {harga > 0 && (<>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Jadwal Pembayaran — {namaCara}</h2>
          <div className="hint" style={{ marginBottom: 8 }}>{unit} · {labelHarga}: <b>{fmtRp(harga)}</b> · tanggal &amp; nominal bisa diubah langsung; termin terakhir menyesuaikan otomatis.</div>
          <div className="tbl-wrap"><table className="tbl-compact">
            <thead><tr><th style={{ width: 40 }}>#</th><th>Tanggal</th><th>Termin</th><th className="num">Nominal</th><th className="num">Kumulatif</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const kum = rows.slice(0, i + 1).reduce((a, x) => a + x.nominal, 0);
                const akhir = i === rows.length - 1;
                return <tr key={i}>
                  <td data-label="#">{i + 1}</td>
                  <td data-label="Tanggal"><input type="date" value={r.tgl} onChange={e => ubahBaris(i, 'tgl', e.target.value)} style={{ minWidth: 130 }} /></td>
                  <td data-label="Termin">{r.ket}</td>
                  <td className="num" data-label="Nominal">{akhir
                    ? <b title="Menyesuaikan otomatis">{fmtRp(r.nominal) === '—' ? 'Rp 0' : fmtRp(r.nominal)}</b>
                    : <input type="number" min="0" value={r.nominal} onChange={e => ubahBaris(i, 'nominal', e.target.value)} style={{ maxWidth: 160, textAlign: 'right' }} />}</td>
                  <td className="num" data-label="Kumulatif">{fmtRp(kum) === '—' ? 'Rp 0' : fmtRp(kum)}</td>
                </tr>;
              })}
              <tr><td></td><td></td><td><b>Total</b></td>
                <td className="num"><b>{fmtRp(total)}</b></td>
                <td className="num">{cocok ? <b style={{ color: 'var(--green)' }}>Total cocok ✓</b> : <b style={{ color: 'var(--red)' }}>Selisih {fmtRp(harga - total)}</b>}</td></tr>
            </tbody>
          </table></div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="sort-btn" onClick={() => setRows(susunJadwal(cara, harga, tglBF, Number(bf) || 0, Math.min(12, Number(nCicil) || 12)))}>↺ Kembalikan jadwal standar</button>
            <button className="sort-btn" onClick={() => navigator.clipboard.writeText(teksWA()).then(() => toast('Disalin — tinggal tempel di WhatsApp 📋')).catch(() => toast('Gagal menyalin'))}>📋 Salin untuk WhatsApp</button>
            <button className="sort-btn" style={{ borderColor: 'var(--green)', color: 'var(--green)', fontWeight: 700 }} onClick={downloadPDF} disabled={pdfBusy}>{pdfBusy ? '⏳ Menyiapkan…' : '📄 Download PDF'}</button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Pembayaran ke PT Serpong Bangun Lestari · BCA 205-005-3604 (KCK Menara BCA). Keterlambatan dikenakan denda 1‰ per hari.</p>
        </div>

        {cara === 'kpr' && (
          <div className="card" style={{ marginTop: 14 }}>
            <h2>Simulasi Angsuran KPR — plafon {fmtRp(plafon)}</h2>
            <div className="form-grid">
              <div className="field"><label>Bunga (% / tahun)</label>
                <input type="number" step="0.05" min="0" value={bunga} onChange={e => setBunga(e.target.value)} /></div>
              <div className="field"><label>Tenor</label>
                <select value={tenor} onChange={e => setTenor(Number(e.target.value))}>{TENOR_KPR.map(t => <option key={t} value={t}>{t} tahun</option>)}</select></div>
              <div className="field"><label>Batas DBR</label>
                <select value={dbr} onChange={e => setDbr(Number(e.target.value))}>
                  <option value={30}>30% — sangat aman</option>
                  <option value={40}>40% — umum dipakai bank</option>
                  <option value={50}>50% — maksimal, syarat tertentu</option>
                </select></div>
              <div className="field"><label>Cicilan Lain / Bulan (Rp)</label>
                <input type="number" min="0" value={cicilanLain} onChange={e => setCicilanLain(e.target.value)} placeholder="opsional" /></div>
              <div className="field"><label>Penghasilan Konsumen (Rp)</label>
                <input type="number" min="0" value={penghasilan} onChange={e => setPenghasilan(e.target.value)} placeholder="opsional, boleh gabungan" /></div>
            </div>
            <div className="kpi-grid" style={{ marginTop: 6 }}>
              <div className="kpi"><div className="kpi-label">Angsuran per Bulan</div>
                <div className="kpi-val" style={{ color: 'var(--green)' }}>{fmtRp(Math.round(angs))}</div>
                <div className="hint">{tenor} tahun · bunga {bunga}%</div></div>
              <div className="kpi"><div className="kpi-label">Penghasilan Minimal</div>
                <div className="kpi-val" style={{ color: 'var(--brass)' }}>{fmtRp(Math.round(butuh))}</div>
                <div className="hint">pada DBR {dbr}%</div></div>
              <div className="kpi"><div className="kpi-label">Penghasilan Min. (DBR 50%)</div>
                <div className="kpi-val">{fmtRp(Math.round((angs + lain) / 0.5))}</div>
                <div className="hint">batas maksimal, syarat tertentu</div></div>
              <div className="kpi"><div className="kpi-label">Kelayakan Konsumen</div>
                {kel ? <><div className="kpi-val" style={{ color: kel.w, fontSize: 18 }}>{kel.t}</div><div className="hint">{kel.s}</div></>
                  : <div className="hint">Isi penghasilan untuk melihat kelayakan.</div>}</div>
            </div>
            <div className="tbl-wrap" style={{ marginTop: 10 }}><table className="tbl-compact">
              <thead><tr><th>Tenor</th><th className="num">Angsuran / Bulan</th><th className="num">Penghasilan Min. (DBR {dbr}%)</th><th className="num">DBR 50%</th></tr></thead>
              <tbody>{TENOR_KPR.map(t => {
                const a = anuitas(plafon, Number(bunga), t * 12);
                return <tr key={t} style={Number(tenor) === t ? { background: '#E4EFE8' } : undefined}>
                  <td data-label="Tenor"><b>{t} tahun</b></td>
                  <td className="num" data-label="Angsuran"><b>{fmtRp(Math.round(a))}</b></td>
                  <td className="num" data-label="DBR">{fmtRp(Math.round((a + lain) / (dbr / 100)))}</td>
                  <td className="num" data-label="DBR 50%">{fmtRp(Math.round((a + lain) / 0.5))}</td>
                </tr>;
              })}</tbody>
            </table></div>
            <p className="hint">Angsuran anuitas atas plafon sesuai price list. Belum termasuk biaya provisi, administrasi, asuransi, notaris/AJB &amp; BPHTB. Persetujuan akhir oleh bank.</p>
          </div>
        )}
      </>)}
      <Toast />
    </>
  );
}
