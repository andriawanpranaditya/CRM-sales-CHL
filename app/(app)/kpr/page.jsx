'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp } from '@/components/util';
import InputRupiah from '@/components/InputRupiah';
import { BIO_TIPE, BIO_IRREG, tipeBio, hargaUnit, PERMAI } from '@/lib/pricelist';

// Data price list & harga per unit: lib/pricelist.js (dipakai juga oleh menu Price List)

const CARA = [
  ['kpr', 'KPR'],
  ['keras', 'Cash Keras'],
  ['bertahap', 'Cash Bertahap'],
];
const BF_DEFAULT = 5000000;
const TENOR_KPR = [25, 20, 15, 10];
// Price list Permai Indah — KPR BTN Subsidi (SBUM Rp4 jt dari pemerintah tidak disimulasikan)

const pctDp = (dp, harga) => harga ? (Math.round(dp / harga * 1000) / 10).toLocaleString('id-ID') + '%' : '';
function susunPermai(tglBF, bf, um, plafon) {
  if (!tglBF) return [];
  const tUM = plusHari(tglBF, 14);                         // pola BIO: hari ke-14 dari BF
  return [
    { ket: 'Booking Fee', tgl: tglBF, nominal: bf },
    { ket: 'Uang Muka', tgl: tUM, nominal: um },
    { ket: 'Akad KPR BTN Subsidi (plafon)', tgl: plusBulan(tUM, 1), nominal: plafon }, // sebulan setelah uang muka
  ];
}

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

// Bunga cash bertahap (khusus manager & CEO): dikenakan pada SISA setelah DP, dibagi ke cicilan ke-2 s.d. terakhir.
// Flat: total bunga = sisa × bunga%/th × (jumlah bulan cicilan ÷ 12). Efektif: angsuran anuitas atas sisa.
function hitungBungaCash(sisa, nBulan, persen, metode) {
  const p = Number(persen) || 0;
  if (!sisa || !nBulan || p <= 0) return { total: 0, angsuran: sisa && nBulan ? sisa / nBulan : 0 };
  if (metode === 'efektif') { const a = anuitas(sisa, p, nBulan); return { total: a * nBulan - sisa, angsuran: a }; }
  const total = sisa * (p / 100) * (nBulan / 12);
  return { total, angsuran: (sisa + total) / nBulan };
}

// ===== Penyusun jadwal pembayaran =====
function susunJadwal(cara, harga, tglBF, bf, nCicil, bungaCash, dpManual) {
  // dpManual: DP / uang muka yang diisi manual (termasuk BF). null = ikut aturan price list
  const dpIsi = dpManual != null && dpManual !== '' && !isNaN(Number(dpManual)) ? Math.max(0, Number(dpManual)) : null;
  if (!harga || !tglBF) return [];
  if (cara === 'kpr') {
    // Ketentuan price list: subsidi DP 10% → DP 0% hari ke-14, akad 100% − BF sebulan setelah DP
    const tDP = plusHari(tglBF, 14);
    if (dpIsi != null && dpIsi > 0) {
      const dpK = Math.max(dpIsi, bf);
      return [
        { ket: 'Booking Fee', tgl: tglBF, nominal: bf },
        { ket: `Sisa DP (DP ${pctDp(dpK, harga)} = ${fmtRp(dpK)}, termasuk BF)`, tgl: tDP, nominal: dpK - bf },
        { ket: 'Akad / pelunasan via KPR (harga − DP)', tgl: plusBulan(tDP, 1), nominal: harga - dpK },
      ];
    }
    return [
      { ket: 'Booking Fee', tgl: tglBF, nominal: bf },
      { ket: 'DP 0% (subsidi DP 10%)', tgl: tDP, nominal: 0 },
      { ket: 'Akad / pelunasan via KPR (100% − BF)', tgl: plusBulan(tDP, 1), nominal: harga - bf },
    ];
  }
  const dp = dpIsi != null ? Math.max(dpIsi, bf) : Math.round(harga * 0.10); // DP (default 10%) sudah termasuk Booking Fee
  const lblDp = `DP ${pctDp(dp, harga)}`;
  const tDP = plusHari(tglBF, 14);
  if (cara === 'keras') {
    return [
      { ket: 'Booking Fee', tgl: tglBF, nominal: bf },
      { ket: `Sisa DP (${lblDp} = ${fmtRp(dp)}, termasuk BF)`, tgl: tDP, nominal: dp - bf },
      { ket: 'Pelunasan', tgl: plusHari(tglBF, 30), nominal: harga - dp },
    ];
  }
  // Cash bertahap: DP 10% = cicilan ke-1 (hari ke-14 dari BF);
  // cicilan ke-2 jatuh 30 hari setelah cicilan ke-1, lalu tiap bulan sampai lunas
  const n = Math.max(2, nCicil);                 // jumlah cicilan TERMASUK DP
  const pokok = harga - dp;
  const bg = hitungBungaCash(pokok, n - 1, bungaCash?.persen, bungaCash?.metode);
  const sisa = Math.round(pokok + bg.total);     // sisa yang dicicil = pokok + bunga
  const cic = Math.round(sisa / (n - 1) / 1000) * 1000;
  const t2 = plusHari(tDP, 30);
  const ber = bg.total > 0 ? ' (pokok + bunga)' : '';
  const rows = [
    { ket: `Booking Fee (bagian dari Cicilan 1)`, tgl: tglBF, nominal: bf },
    { ket: `Cicilan 1 dari ${n} — ${lblDp} (${fmtRp(dp)}, termasuk BF)`, tgl: tDP, nominal: dp - bf },
  ];
  for (let k = 2; k <= n; k++) {
    rows.push({ ket: `Cicilan ${k} dari ${n}${ber}${k === n ? ' (terakhir)' : ''}`, tgl: plusBulan(t2, k - 2), nominal: k === n ? sisa - cic * (n - 2) : cic });
  }
  return rows;
}

export default function SimulasiCaraBayar() {
  const [set, setSet] = useState({ project: [], units: {} });
  const [stok, setStok] = useState([]);
  const [proj, setProj] = useState('BIO DISTRICT');
  const [blok, setBlok] = useState('');
  const [tipePilih, setTipePilih] = useState('A');
  useEffect(() => {
    Promise.all([api('/api/settings'), api('/api/stock')])
      .then(([st, sk]) => { setSet(st); setStok(sk.status || []); if (st.project && st.project.length && !st.project.includes(proj)) setProj(st.project[0]); })
      .catch(e => toast(e.message));
  }, []); // eslint-disable-line
  const [cara, setCara] = useState('kpr');
  const [hargaMode, setHargaMode] = useState('standar'); // standar | allin | manual
  const [hargaManual, setHargaManual] = useState('');
  const [tglBF, setTglBF] = useState(iso(new Date()));
  const [bf, setBf] = useState(BF_DEFAULT);
  const [nCicil, setNCicil] = useState(12);
  // Bunga cash bertahap & cicilan 24–60× — khusus manager & CEO Project
  const [me, setMe] = useState(null);
  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => {}); }, []);
  const bolehBunga = !!me && ['manager', 'ceo'].includes(me.role);
  const [bungaCash, setBungaCash] = useState('');
  // DP / uang muka: default ikut aturan & price list, boleh diisi manual (semua peran)
  const [dpManual, setDpManual] = useState('');
  const [dpMode, setDpMode] = useState('rp'); // 'rp' = nominal rupiah, 'persen' = persentase dari harga
  const [dpPersen, setDpPersen] = useState('');
  useEffect(() => { setDpManual(''); setDpPersen(''); }, [cara, proj]); // ganti cara bayar / project → kembali ke DP default
  const [metodeBunga, setMetodeBunga] = useState('flat');
  const [rows, setRows] = useState([]);
  // KPR
  const [tenor, setTenor] = useState(25);
  const [bunga, setBunga] = useState(2.75);
  const [dbr, setDbr] = useState(40);
  const [penghasilan, setPenghasilan] = useState('');
  const [tahunFix, setTahunFix] = useState(3);        // tahap 1: masa bunga fix (tahun) — bunganya = kolom Bunga di atas
  const [tahap2, setTahap2] = useState({ tahun: 3, bunga: 4 });   // tahap 2 (0 tahun = tidak dipakai)
  const [tahap3, setTahap3] = useState({ tahun: 4, bunga: 5 });   // tahap 3 (0 tahun = tidak dipakai)
  const [bungaLanjut, setBungaLanjut] = useState(11); // floating setelah semua tahap fix
  const [lihatTabel, setLihatTabel] = useState(true);
  const [cicilanLain, setCicilanLain] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const U = hargaUnit(proj, blok, tipePilih);
  const isBio = /bio/i.test(proj);
  const namaProyek = /bio/i.test(proj) ? 'BIO DISTRICT - Serpong' : /permai/i.test(proj) ? 'PERMAI INDAH - Cilejit' : proj;
  // Rekening pembayaran berbeda per proyek
  const REK = /permai/i.test(proj)
    ? { pt: 'PT Bumi Mahardika Makmur', no: '497-6006-887', cab: 'KCU BSD' }
    : { pt: 'PT Serpong Bangun Lestari', no: '205-005-3604', cab: 'KCK Menara BCA' };
  const unit = blok ? `${blok} (Tipe ${U.tipe}${U.irreg ? ' · Irreguler' : ''})` : (isBio ? `BIO District Tipe ${U.tipe}` : proj);
  const stMap = {}; stok.forEach(x => { stMap[x.project + '|' + x.unit] = x; });
  const daftarUnit = (set.units && set.units[proj]) || [];
  // Harga default mengikuti cara bayar: Cash Keras = Standar, Cash Bertahap = All In
  useEffect(() => {
    if (cara === 'keras') setHargaMode('standar');
    if (cara === 'bertahap') setHargaMode('allin');
  }, [cara]);
  useEffect(() => { setBunga(U.bunga); setTenor(U.tenor); }, [proj]); // eslint-disable-line

  const isPermai = /permai/i.test(proj);
  const harga = isPermai ? PERMAI.harga : (hargaMode === 'manual' ? (Number(hargaManual) || 0) : (hargaMode === 'allin' ? U.allin : U.standar));
  // Total yang dijadwalkan: Permai = BF + uang muka + plafon (SBUM tidak disimulasikan)
  const maxCicil = bolehBunga ? 60 : 12;
  const nEff = Math.min(maxCicil, Math.max(1, Number(nCicil) || 12));
  const bungaAktif = bolehBunga && cara === 'bertahap' ? { persen: Number(bungaCash) || 0, metode: metodeBunga } : null;
  const dpDefault = isPermai ? PERMAI.um : cara === 'kpr' ? 0 : Math.round(harga * 0.10);
  const persenAngka = String(dpPersen).replace(',', '.');
  const dpIsi = dpMode === 'persen'
    ? (persenAngka !== '' && !isNaN(Number(persenAngka)) ? Math.round(harga * Math.max(0, Number(persenAngka)) / 100) : null)
    : (dpManual !== '' && !isNaN(Number(dpManual)) ? Math.max(0, Number(dpManual)) : null);
  const dpEff = isPermai ? (dpIsi ?? PERMAI.um) : cara === 'kpr' ? (dpIsi ?? 0) : Math.max(dpIsi ?? Math.round(harga * 0.10), Number(bf) || 0);
  const plafonPermai = Math.max(0, PERMAI.plafon - (dpEff - PERMAI.um)); // uang muka lebih besar → plafon KPR lebih kecil
  const pokokCicil = harga - dpEff; // sisa setelah DP (sama dengan susunJadwal)
  const infoBunga = bungaAktif ? hitungBungaCash(pokokCicil, Math.max(1, nEff - 1), bungaAktif.persen, bungaAktif.metode) : { total: 0, angsuran: 0 };
  const totalBunga = Math.round(infoBunga.total);
  const targetTotal = isPermai ? (Number(bf) || 0) + dpEff + plafonPermai : harga + (cara === 'bertahap' ? totalBunga : 0);
  useEffect(() => { if (isPermai) { setCara('kpr'); setBf(PERMAI.bf); setTenor(20); setBunga(PERMAI.bunga); setDbr(30); } else { setBf(BF_DEFAULT); } }, [isPermai]); // eslint-disable-line

  // Susun ulang jadwal setiap kali dasar perhitungan berubah
  useEffect(() => {
    setRows(isPermai ? susunPermai(tglBF, Number(bf) || 0, dpEff, plafonPermai)
      : susunJadwal(cara, harga, tglBF, Number(bf) || 0, nEff, bungaAktif, dpIsi));
  }, [cara, harga, tglBF, bf, nCicil, isPermai, bungaCash, metodeBunga, bolehBunga, dpManual, dpPersen, dpMode]); // eslint-disable-line

  // Edit manual: termin terakhir menyeimbangkan otomatis
  const ubahBaris = (i, k, v) => {
    const r = rows.map((x, j) => j === i ? { ...x, [k]: k === 'nominal' ? Number(v) || 0 : v } : x);
    if (k === 'nominal' && r.length > 1) {
      const tanpaAkhir = r.slice(0, -1).reduce((a, x) => a + x.nominal, 0);
      r[r.length - 1] = { ...r[r.length - 1], nominal: targetTotal - tanpaAkhir };
    }
    setRows(r);
  };
  const total = rows.reduce((a, x) => a + (Number(x.nominal) || 0), 0);
  const cocok = Math.round(total) === Math.round(targetTotal);

  // ===== KPR =====
  // Plafon KPR: Permai mengikuti uang muka; Bio = harga, atau harga − DP bila DP diisi manual
  const plafon = isPermai ? plafonPermai : (cara === 'kpr' && dpIsi ? harga - Math.max(dpIsi, Number(bf) || 0) : harga);
  const TENOR = isPermai ? PERMAI.tenor : TENOR_KPR;
  const angs = useMemo(() => anuitas(plafon, Number(bunga) || 0, (Number(tenor) || 0) * 12), [plafon, bunga, tenor]);
  // Proyeksi setelah masa fix + rincian anuitas (pokok & bunga per bulan)
  // Skema berjenjang: tiap tahap angsuran dihitung ulang dari SISA POKOK & SISA TENOR dengan bunga tahap itu (cara bank menghitung)
  const amort = useMemo(() => {
    const nB = (Number(tenor) || 0) * 12;
    if (!plafon || !nB) return null;
    let tahapList;
    if (isPermai) tahapList = [{ nama: 'Fix', bulan: nB, bunga: Number(bunga) || 0 }]; // Permai: bunga tetap sepanjang tenor
    else {
      const t1 = Math.max(0, Number(tahunFix) || 0) * 12, t2 = Math.max(0, Number(tahap2.tahun) || 0) * 12, t3 = Math.max(0, Number(tahap3.tahun) || 0) * 12;
      tahapList = [
        { nama: 'Fix 1', bulan: t1, bunga: Number(bunga) || 0 },
        { nama: 'Fix 2', bulan: t2, bunga: Number(tahap2.bunga) || 0 },
        { nama: 'Fix 3', bulan: t3, bunga: Number(tahap3.bunga) || 0 },
      ].filter(t => t.bulan > 0);
      // potong bila melebihi tenor, lalu sisanya floating
      let akum = 0;
      tahapList = tahapList.map(t => { const bln = Math.max(0, Math.min(t.bulan, nB - akum)); akum += bln; return { ...t, bulan: bln }; }).filter(t => t.bulan > 0);
      if (nB - akum > 0) tahapList.push({ nama: 'Floating', bulan: nB - akum, bunga: Number(bungaLanjut) || 0, floating: true });
    }
    const baris = []; let sisa = plafon, totBunga = 0, totBayar = 0, b = 0, mulai = 0;
    const tahap = tahapList.map(t => {
      const sisaBulan = nB - mulai;
      const a = anuitas(sisa, t.bunga, sisaBulan); // dihitung ulang dari sisa pokok & sisa tenor
      const i = t.bunga / 1200, dari = mulai + 1, sisaAwal = sisa;
      for (let k = 0; k < t.bulan; k++) {
        b++; const bg = sisa * i, pk = a - bg; sisa = Math.max(0, sisa - pk); totBunga += bg; totBayar += a;
        baris.push({ b, tahap: t.nama, fix: !t.floating, a, bg, pk, sisa });
      }
      mulai += t.bulan;
      return { ...t, a, dari, sampai: mulai, sisaAwal, sisaAkhir: sisa };
    });
    const fixTerakhir = tahap.filter(t => !t.floating).slice(-1)[0];
    const floating = tahap.find(t => t.floating);
    return { nB, tahap, baris, totBunga, totBayar, nFix: fixTerakhir ? fixTerakhir.sampai : nB, sisaFix: fixTerakhir ? fixTerakhir.sisaAkhir : 0, aLanjut: floating ? floating.a : 0 };
  }, [plafon, bunga, tenor, tahunFix, tahap2, tahap3, bungaLanjut, isPermai]);
  const lain = Number(cicilanLain) || 0;
  const butuh = angs ? (angs + lain) / (dbr / 100) : 0;
  const dbrAkt = Number(penghasilan) ? ((angs + lain) / Number(penghasilan)) * 100 : null;
  const kel = dbrAkt == null ? null
    : isPermai ? (dbrAkt <= 30
      ? { w: 'var(--green)', t: `Aman — DBR ${Math.round(dbrAkt)}%`, s: 'Di bawah batas 30%, sesuai ketentuan KPR subsidi.' }
      : { w: 'var(--red)', t: `Melebihi batas — DBR ${Math.round(dbrAkt)}%`, s: 'Di atas 30%: perpanjang tenor atau ajukan dengan penghasilan gabungan.' })
    : dbrAkt <= 40 ? { w: 'var(--green)', t: `Aman — DBR ${Math.round(dbrAkt)}%`, s: 'Rasio cicilan sehat, peluang disetujui besar.' }
    : dbrAkt <= 50 ? { w: 'var(--brass)', t: `Masih mungkin — DBR ${Math.round(dbrAkt)}%`, s: 'Butuh penghasilan tetap, SLIK bersih, cicilan lain minim; bisa joint income pasangan.' }
    : { w: 'var(--red)', t: `Perlu penyesuaian — DBR ${Math.round(dbrAkt)}%`, s: 'Perpanjang tenor, tambah uang muka, atau ajukan dengan penghasilan gabungan.' };

  const labelHarga = isPermai ? 'Harga' : hargaMode === 'manual' ? 'Harga manual' : hargaMode === 'allin' ? 'Harga All In' : 'Harga Standar';
  const namaCara = CARA.find(c => c[0] === cara)[1] + (cara === 'bertahap' ? ` ${nEff} bulan` + (totalBunga > 0 ? ` (bunga ${bungaCash}%/th ${metodeBunga === 'efektif' ? 'efektif' : 'flat'})` : '') : '');

  function teksWA() {
    let t = `*SIMULASI CARA BAYAR*\n*${namaProyek}* — ${unit}\n${namaCara} · ${labelHarga}: *${fmtRp(harga)}*\n`;
    if (cara === 'bertahap' && totalBunga > 0) t += `Bunga ${bungaCash}%/th (${metodeBunga === 'efektif' ? 'efektif' : 'flat'}) atas sisa setelah DP: ${fmtRp(totalBunga)} · Total bayar: *${fmtRp(harga + totalBunga)}*\n`;
    t += '\n';
    rows.forEach(r => { t += `${tglID(r.tgl)} — ${r.ket}: ${fmtRp(r.nominal) === '—' ? 'Rp0' : fmtRp(r.nominal)}\n`; });
    if (cara === 'kpr') {
      t += `\n*Angsuran KPR* (bunga ${bunga}%):\n` + TENOR.map(n => `${n} th: ${fmtRp(Math.round(anuitas(plafon, Number(bunga), n * 12)))}/bln`).join('\n');
      if (amort && !isPermai && amort.tahap.length > 1) t += `\n\n*Skema bunga berjenjang (tenor ${tenor} th)*:\n` + amort.tahap.map(x => `${x.floating ? 'Floating' : x.nama} (th ${Math.ceil(x.dari / 12)}–${Math.ceil(x.sampai / 12)}, ${x.bunga}%${x.floating ? '*' : ''}): ${fmtRp(Math.round(x.a))}/bln`).join('\n') + `\n_*floating = perkiraan, mengikuti bunga bank saat itu_`;
      t += `\nPenghasilan minimal ± ${fmtRp(Math.round(butuh))}/bln (DBR ${dbr}%).`;
    }
    t += `\n\nPembayaran ke: ${REK.pt} · BCA ${REK.no} (${REK.cab}).\n_Simulasi; mengikuti ketentuan price list yang berlaku._`;
    return t;
  }

  async function downloadPDF() {
    setPdfBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      // Font bawaan PDF tidak mengenal sebagian simbol Unicode — ganti dengan padanan aman
      const aman = t => String(t == null ? '' : t)
        .replace(/[\u2212\u2013]/g, '-')   // tanda minus / en dash
        .replace(/\u2192/g, '->')            // panah
        .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
      const PW = 210, M = 14;
      doc.setFillColor(28, 43, 35); doc.rect(0, 0, PW, 20, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text('SIMULASI CARA BAYAR', M, 9);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(namaProyek + ' · ' + new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }), M, 15);
      doc.setTextColor(28, 43, 35);
      let y = 30;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(aman(unit + ' — ' + namaCara), M, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(aman(labelHarga + ': ' + fmtRp(harga)), M, y); y += 6;
      if (cara === 'bertahap' && totalBunga > 0) { doc.text(aman(`Bunga ${bungaCash}%/th (${metodeBunga === 'efektif' ? 'efektif' : 'flat'}) atas sisa setelah DP: ${fmtRp(totalBunga)}  ·  Total bayar: ${fmtRp(harga + totalBunga)}`), M, y); y += 6; }
      y += 2;
      // tabel jadwal
      doc.setFillColor(35, 105, 74); doc.rect(M, y, PW - M * 2, 8, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text('Tanggal', M + 3, y + 5.5); doc.text('Termin', M + 38, y + 5.5); doc.text('Nominal', PW - M - 3, y + 5.5, { align: 'right' });
      doc.setTextColor(28, 43, 35); doc.setFont('helvetica', 'normal'); y += 8;
      rows.forEach((r, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        if (i % 2) { doc.setFillColor(245, 244, 239); doc.rect(M, y, PW - M * 2, 7, 'F'); }
        doc.text(tglID(r.tgl), M + 3, y + 4.8);
        doc.text(doc.splitTextToSize(aman(r.ket), 95)[0], M + 38, y + 4.8);
        doc.text(r.nominal ? fmtRp(r.nominal) : 'Rp 0', PW - M - 3, y + 4.8, { align: 'right' });
        y += 7;
      });
      if (!isPermai) { doc.setFont('helvetica', 'bold'); doc.text('Total', M + 38, y + 5); doc.text(fmtRp(total), PW - M - 3, y + 5, { align: 'right' }); y += 12; } else { y += 6; }
      if (cara === 'kpr') {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text('Ilustrasi Angsuran KPR — bunga ' + bunga + '%', M, y); y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        TENOR_KPR.forEach(n => {
          const a = anuitas(plafon, Number(bunga), n * 12);
          doc.text(n + ' tahun', M + 3, y); doc.text(fmtRp(Math.round(a)) + ' / bulan', M + 40, y);
          doc.text('penghasilan min. ' + fmtRp(Math.round((a + lain) / (dbr / 100))) + ' (DBR ' + dbr + '%)', M + 95, y);
          y += 6;
        });
        if (amort && !isPermai && amort.tahap.length > 1) {
          y += 2; doc.setFont('helvetica', 'bold'); doc.text('Skema bunga berjenjang — tenor ' + tenor + ' tahun', M, y); y += 5; doc.setFont('helvetica', 'normal');
          amort.tahap.forEach(x => {
            doc.text((x.floating ? 'Floating' : x.nama) + ' (tahun ' + Math.ceil(x.dari / 12) + '-' + Math.ceil(x.sampai / 12) + ', ' + x.bunga + '%' + (x.floating ? '*' : '') + ')', M + 3, y);
            doc.text(fmtRp(Math.round(x.a)) + ' / bulan', M + 95, y); y += 5;
          });
          doc.text('*Bunga floating mengikuti suku bunga bank saat itu (perkiraan).', M + 3, y); y += 4;
        }
        y += 4;
      }
      doc.setFontSize(8.5); doc.setTextColor(90, 100, 92);
      [
        'Pembayaran dianggap sah apabila sudah masuk ke rekening ' + REK.pt + ' - BCA ' + REK.no + ', ' + REK.cab + '.',
        'Nama blok & nomor yang tercantum saat tanda jadi tidak dapat diganti.',
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
          <div className="field"><label>Project</label>
            <select value={proj} onChange={e => { setProj(e.target.value); setBlok(''); }}>
              {(set.project && set.project.length ? set.project : ['BIO DISTRICT', 'PERMAI INDAH']).map(p => <option key={p}>{p}</option>)}
            </select></div>
          <div className="field"><label>Blok / Unit</label>
            <select value={blok} onChange={e => setBlok(e.target.value)}>
              <option value="">— simulasi per tipe (tanpa unit) —</option>
              {daftarUnit.map(u => {
                const st = stMap[proj + '|' + u];
                const terjual = st && st.warna === 'merah';
                const irr = isBio && BIO_IRREG[u];
                return <option key={u} value={u} disabled={terjual}>
                  {terjual ? '🔴 ' : st && st.warna === 'kuning' ? '🟡 ' : ''}{u}{isBio && tipeBio(u) ? ' · Tipe ' + (irr ? irr.tipe : tipeBio(u)) : ''}{irr ? ' · Irreguler' : ''}{terjual ? ' — terjual' : ''}
                </option>;
              })}
            </select>
            <span className="hint">🔴 terjual (tidak bisa dipilih) · 🟡 reserved · unit Irreguler memakai harga khusus price list.</span></div>
          {isBio && !blok && <div className="field"><label>Tipe</label>
            <select value={tipePilih} onChange={e => setTipePilih(e.target.value)}>
              {['A', 'B', 'C'].map(t => <option key={t} value={t}>Tipe {t} — standar {fmtRp(BIO_TIPE[t].standar)}</option>)}
            </select></div>}
          <div className="field"><label>Cara Bayar</label>
            <select value={cara} onChange={e => setCara(e.target.value)} disabled={isPermai}>
              {(isPermai ? [['kpr', 'KPR BTN Subsidi']] : CARA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {isPermai && <span className="hint">Permai Indah hanya melalui KPR subsidi.</span>}</div>
          {isPermai ? <div className="field"><label>Harga</label>
            <input value={fmtRp(PERMAI.harga)} disabled />
            <span className="hint">LB {PERMAI.lb} · LT {PERMAI.lt} · plafon KPR {fmtRp(plafonPermai)}</span></div> :
          <div className="field"><label>Harga</label>
            <select value={hargaMode} onChange={e => setHargaMode(e.target.value)}>
              <option value="standar">Harga Standar — {fmtRp(U.standar)}</option>
              <option value="allin">Harga All In — {fmtRp(U.allin)}</option>
              <option value="manual">Isi manual</option>
            </select>
            {hargaMode === 'manual' && <InputRupiah style={{ marginTop: 6 }} value={hargaManual}
              onChange={e => setHargaManual(e.target.value)} placeholder="ketik harga" />}
            <span className="hint">{cara === 'kpr' ? 'Untuk KPR, harga ini adalah plafon (sesuai price list).' : cara === 'keras' ? 'Default Cash Keras: Harga Standar.' : 'Default Cash Bertahap: Harga All In.'}</span></div>}
          <div className="field"><label>Tanggal Booking Fee</label>
            <input type="date" value={tglBF} onChange={e => setTglBF(e.target.value)} /></div>
          <div className="field"><label>Booking Fee (Rp)</label>
            <InputRupiah value={bf} onChange={e => setBf(e.target.value)} />
            <span className="hint">{cara === 'kpr' ? 'Pelunasan via KPR = 100% − BF.' : 'Sudah termasuk dalam DP.'}</span></div>
          <div className="field"><label>{isPermai ? 'Uang Muka (Rp)' : 'DP / Uang Muka (Rp)'}</label>
            <div className="dp-mode" role="group" aria-label="Isi DP dalam">
              <button type="button" aria-pressed={dpMode === 'rp'} onClick={() => { if (dpMode !== 'rp') { if (dpIsi != null) setDpManual(String(dpIsi)); setDpMode('rp'); } }}>Rp</button>
              <button type="button" aria-pressed={dpMode === 'persen'} onClick={() => { if (dpMode !== 'persen') { if (dpIsi != null && harga) setDpPersen(String(Math.round(dpIsi / harga * 10000) / 100).replace('.', ',')); setDpMode('persen'); } }}>%</button>
            </div>
            {dpMode === 'rp'
              ? <InputRupiah value={dpManual} onChange={e => setDpManual(e.target.value)} placeholder={`default ${fmtRp(dpDefault) === '—' ? '0' : fmtRp(dpDefault).replace(/^Rp\s?/, '')}`} />
              : <span className="inp-rp" style={{ display: 'block' }}><input type="text" inputMode="decimal" value={dpPersen} onChange={e => setDpPersen(e.target.value.replace(/[^\d,.]/g, ''))}
                  placeholder={`default ${harga ? (Math.round(dpDefault / harga * 1000) / 10).toLocaleString('id-ID') : 0}`} style={{ paddingRight: 30 }} />
                  <span className="inp-rp-pre" style={{ left: 'auto', right: 12 }} aria-hidden="true">%</span></span>}
            <span className="hint">{dpIsi != null
              ? <>Manual: {fmtRp(dpEff) === '—' ? 'Rp 0' : fmtRp(dpEff)}{harga && !isPermai ? ` (${pctDp(dpEff, harga)} dari harga)` : ''}{isPermai ? ` · plafon KPR jadi ${fmtRp(plafonPermai)}` : cara === 'kpr' ? ` · plafon KPR jadi ${fmtRp(plafon)}` : ''} · <a href="#" onClick={e => { e.preventDefault(); setDpManual(''); setDpPersen(''); }}>kembali ke default</a></>
              : isPermai ? 'Default uang muka sesuai price list Permai; boleh diisi manual.'
              : cara === 'kpr' ? 'Default DP 0% (subsidi DP 10%) sesuai price list; boleh diisi manual (termasuk BF).'
              : 'Default DP 10% (termasuk BF) sesuai price list; boleh diisi manual.'}</span></div>
          {cara === 'bertahap' && <div className="field"><label>Jumlah Cicilan (bulan)</label>
            <select value={nEff} onChange={e => setNCicil(Number(e.target.value))}>
              {(bolehBunga ? [60, 48, 36, 24, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] : [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]).map(n => <option key={n} value={n}>{n}× cicilan{n === 12 ? ' (standar)' : n > 12 ? ' (khusus manager/CEO)' : ''}</option>)}
            </select>
            <span className="hint">Termasuk DP sebagai cicilan ke-1. Cicilan ke-2 jatuh 30 hari setelah DP, lalu tiap bulan sampai lunas.</span></div>}
          {cara === 'bertahap' && bolehBunga && <div className="field"><label>Bunga cash bertahap (% per tahun)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="number" min="0" step="0.01" value={bungaCash} onChange={e => setBungaCash(e.target.value)} placeholder="0 = tanpa bunga" />
              <select value={metodeBunga} onChange={e => setMetodeBunga(e.target.value)} style={{ maxWidth: 140 }}>
                <option value="flat">Flat</option><option value="efektif">Efektif (anuitas)</option>
              </select>
            </div>
            <span className="hint">{totalBunga > 0
              ? `Sisa setelah DP ${fmtRp(pokokCicil)} + bunga ${fmtRp(totalBunga)} → ± ${fmtRp(Math.round(infoBunga.angsuran))}/bln × ${nEff - 1} cicilan.`
              : 'Dikenakan pada sisa setelah DP, dibagi ke cicilan ke-2 s.d. terakhir. Khusus manager & CEO.'}</span></div>}
        </div>
      </div>

      {isBio && (
        <div className="note" style={{ marginTop: 10, background: U.irreg ? 'var(--brass-soft)' : undefined, borderColor: U.irreg ? 'var(--brass-line)' : undefined }}>
          <b>{blok || 'Simulasi per tipe'}</b> · Tipe {U.tipe}
          {U.irreg ? <> · <b style={{ color: 'var(--brass-deep)' }}>IRREGULER</b> ({U.ket})</> : ' · Standar'}
          {' '}— Harga Jual <b>{fmtRp(U.standar)}</b> · Harga All In <b>{fmtRp(U.allin)}</b>
        </div>
      )}

      {harga > 0 && (<>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Jadwal Pembayaran — {namaCara}</h2>
          <div className="hint" style={{ marginBottom: 8 }}>{unit} · {labelHarga}: <b>{fmtRp(harga)}</b>{cara === 'bertahap' && totalBunga > 0 ? <> · bunga {bungaCash}%/th {metodeBunga === 'efektif' ? 'efektif' : 'flat'}: <b>{fmtRp(totalBunga)}</b> · total bayar <b>{fmtRp(harga + totalBunga)}</b></> : null} · tanggal &amp; nominal bisa diubah langsung; termin terakhir menyesuaikan otomatis.</div>
          <div className="tbl-wrap"><table className="tbl-compact">
            <thead><tr><th style={{ width: 40 }}>#</th><th>Tanggal</th><th>Termin</th><th className="num">Nominal</th>{!isPermai && <th className="num">Kumulatif</th>}</tr></thead>
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
                    : <InputRupiah value={r.nominal} onChange={e => ubahBaris(i, 'nominal', e.target.value)} style={{ maxWidth: 170, textAlign: 'right' }} />}</td>
                  {!isPermai && <td className="num" data-label="Kumulatif">{fmtRp(kum) === '—' ? 'Rp 0' : fmtRp(kum)}</td>}
                </tr>;
              })}
              {!isPermai && <tr><td></td><td></td><td><b>Total</b></td>
                <td className="num"><b>{fmtRp(total)}</b></td>
                <td className="num">{cocok ? <b style={{ color: 'var(--green)' }}>Total cocok ✓</b> : <b style={{ color: 'var(--red)' }}>Selisih {fmtRp(targetTotal - total)}</b>}</td></tr>}
            </tbody>
          </table></div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="sort-btn" onClick={() => setRows(isPermai ? susunPermai(tglBF, Number(bf) || 0, dpEff, plafonPermai) : susunJadwal(cara, harga, tglBF, Number(bf) || 0, nEff, bungaAktif, dpIsi))}>↺ Kembalikan jadwal standar</button>
            <button className="sort-btn" onClick={() => navigator.clipboard.writeText(teksWA()).then(() => toast('Disalin — tinggal tempel di WhatsApp 📋')).catch(() => toast('Gagal menyalin'))}>📋 Salin untuk WhatsApp</button>
            <button className="sort-btn" style={{ borderColor: 'var(--green)', color: 'var(--green)', fontWeight: 700 }} onClick={downloadPDF} disabled={pdfBusy}>{pdfBusy ? '⏳ Menyiapkan…' : '📄 Download PDF'}</button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Pembayaran ke {REK.pt} · BCA {REK.no} ({REK.cab}).</p>
        </div>

        {cara === 'kpr' && (
          <div className="card" style={{ marginTop: 14 }}>
            <h2>Simulasi Angsuran KPR — plafon {fmtRp(plafon)}</h2>
            <div className="form-grid">
              <div className="field"><label>Bunga (% / tahun)</label>
                <input type="number" step="0.05" min="0" value={bunga} onChange={e => setBunga(e.target.value)} disabled={isPermai} />
                {isPermai && <span className="hint">KPR BTN subsidi — bunga tetap 5%.</span>}</div>
              <div className="field"><label>Tenor</label>
                <select value={tenor} onChange={e => setTenor(Number(e.target.value))}>{TENOR.map(t => <option key={t} value={t}>{t} tahun</option>)}</select></div>
              <div className="field"><label>Batas DBR</label>
                <select value={dbr} onChange={e => setDbr(Number(e.target.value))} disabled={isPermai}>
                  <option value={30}>30% — sangat aman</option>
                  {!isPermai && <option value={40}>40% — umum dipakai bank</option>}
                  {!isPermai && <option value={50}>50% — maksimal, syarat tertentu</option>}
                </select></div>
              <div className="field"><label>Cicilan Lain / Bulan (Rp)</label>
                <InputRupiah value={cicilanLain} onChange={e => setCicilanLain(e.target.value)} placeholder="opsional" /></div>
              <div className="field"><label>Penghasilan Konsumen (Rp)</label>
                <InputRupiah value={penghasilan} onChange={e => setPenghasilan(e.target.value)} placeholder="opsional, boleh gabungan" /></div>
            </div>
            <div className="kpi-grid" style={{ marginTop: 6 }}>
              <div className="kpi"><div className="kpi-label">Angsuran per Bulan</div>
                <div className="kpi-val" style={{ color: 'var(--green)' }}>{fmtRp(Math.round(angs))}</div>
                <div className="hint">{tenor} tahun · bunga {bunga}%</div></div>
              <div className="kpi"><div className="kpi-label">Penghasilan Minimal</div>
                <div className="kpi-val" style={{ color: 'var(--brass)' }}>{fmtRp(Math.round(butuh))}</div>
                <div className="hint">pada DBR {dbr}%</div></div>
              {!isPermai && <div className="kpi"><div className="kpi-label">Penghasilan Min. (DBR 50%)</div>
                <div className="kpi-val">{fmtRp(Math.round((angs + lain) / 0.5))}</div>
                <div className="hint">batas maksimal, syarat tertentu</div></div>}
              <div className="kpi"><div className="kpi-label">Kelayakan Konsumen</div>
                {kel ? <><div className="kpi-val" style={{ color: kel.w, fontSize: 18 }}>{kel.t}</div><div className="hint">{kel.s}</div></>
                  : <div className="hint">Isi penghasilan untuk melihat kelayakan.</div>}</div>
            </div>
            <div className="tbl-wrap" style={{ marginTop: 10 }}><table className="tbl-compact">
              <thead><tr><th>Tenor</th><th className="num">Angsuran / Bulan</th><th className="num">Penghasilan Min. (DBR {dbr}%)</th>{!isPermai && <th className="num">DBR 50%</th>}</tr></thead>
              <tbody>{TENOR.map(t => {
                const a = anuitas(plafon, Number(bunga), t * 12);
                return <tr key={t} style={Number(tenor) === t ? { background: 'var(--green-soft)' } : undefined}>
                  <td data-label="Tenor"><b>{t} tahun</b></td>
                  <td className="num" data-label="Angsuran"><b>{fmtRp(Math.round(a))}</b></td>
                  <td className="num" data-label="DBR">{fmtRp(Math.round((a + lain) / (dbr / 100)))}</td>
                  {!isPermai && <td className="num" data-label="DBR 50%">{fmtRp(Math.round((a + lain) / 0.5))}</td>}
                </tr>;
              })}</tbody>
            </table></div>
            <p className="hint">Angsuran anuitas atas plafon sesuai price list. Belum termasuk biaya provisi, administrasi, asuransi, notaris/AJB &amp; BPHTB. Persetujuan akhir oleh bank.</p>

            {amort && !isPermai && (
              <div style={{ marginTop: 14 }}>
                <h3 style={{ margin: '0 0 6px' }}>Skema Bunga Berjenjang <span className="hint">(fix bertahap sampai 3 tahap, sisanya floating — isi 0 tahun bila tahap tidak dipakai)</span></h3>
                <div className="form-grid">
                  <div className="field"><label>Tahap 1 — Lama (tahun)</label><input type="number" min="0" max={tenor} value={tahunFix} onChange={e => setTahunFix(e.target.value)} /></div>
                  <div className="field"><label>Tahap 1 — Bunga (%)</label><input type="number" min="0" step="0.05" value={bunga} onChange={e => setBunga(e.target.value)} /></div>
                  <div className="field"><label>Tahap 2 — Lama (tahun)</label><input type="number" min="0" value={tahap2.tahun} onChange={e => setTahap2({ ...tahap2, tahun: e.target.value })} /></div>
                  <div className="field"><label>Tahap 2 — Bunga (%)</label><input type="number" min="0" step="0.05" value={tahap2.bunga} onChange={e => setTahap2({ ...tahap2, bunga: e.target.value })} /></div>
                  <div className="field"><label>Tahap 3 — Lama (tahun)</label><input type="number" min="0" value={tahap3.tahun} onChange={e => setTahap3({ ...tahap3, tahun: e.target.value })} /></div>
                  <div className="field"><label>Tahap 3 — Bunga (%)</label><input type="number" min="0" step="0.05" value={tahap3.bunga} onChange={e => setTahap3({ ...tahap3, bunga: e.target.value })} /></div>
                  <div className="field"><label>Floating — Perkiraan Bunga (%)</label><input type="number" min="0" step="0.25" value={bungaLanjut} onChange={e => setBungaLanjut(e.target.value)} /></div>
                </div>
                <div className="tbl-wrap"><table className="tbl-compact">
                  <thead><tr><th>Tahap</th><th>Periode</th><th className="num">Bunga</th><th className="num">Angsuran / bulan</th><th className="num">Sisa pokok di akhir tahap</th></tr></thead>
                  <tbody>{amort.tahap.map(t => (
                    <tr key={t.nama}>
                      <td data-label="Tahap">{t.floating ? <span className="badge b-warm">Floating</span> : <span className="badge b-close">{t.nama}</span>}</td>
                      <td data-label="Periode">Bulan {t.dari}–{t.sampai} <span className="hint">(tahun {Math.ceil(t.dari / 12)}–{Math.ceil(t.sampai / 12)})</span></td>
                      <td className="num" data-label="Bunga">{t.bunga}%{t.floating ? ' *' : ''}</td>
                      <td className="num" data-label="Angsuran"><b>{fmtRp(Math.round(t.a))}</b></td>
                      <td className="num" data-label="Sisa">{fmtRp(Math.round(t.sisaAkhir))}</td>
                    </tr>))}
                    <tr><td colSpan={3}><b>Total bunga s/d lunas (perkiraan)</b></td><td className="num" colSpan={2}><b>{fmtRp(Math.round(amort.totBunga))}</b></td></tr>
                    <tr><td colSpan={3}><b>Total pembayaran s/d lunas (perkiraan)</b></td><td className="num" colSpan={2}><b>{fmtRp(Math.round(amort.totBayar))}</b></td></tr>
                  </tbody></table></div>
                <p className="hint">Angsuran tiap tahap dihitung ulang dari sisa pokok dan sisa tenor dengan bunga tahap itu. * Bunga floating mengikuti suku bunga bank saat itu — angkanya hanya perkiraan, bisa disiasati dengan take over atau pelunasan sebagian.</p>
              </div>
            )}
            {amort && isPermai && (
              <p className="hint" style={{ marginTop: 10 }}>KPR BTN Subsidi: bunga tetap {bunga}% sepanjang tenor — angsuran tidak berubah hingga lunas. Total bunga s/d lunas {fmtRp(Math.round(amort.totBunga))}.</p>
            )}

            {amort && (
              <div style={{ marginTop: 14 }}>
                <button className="sort-btn" onClick={() => setLihatTabel(v => !v)}>
                  {lihatTabel ? '▲ Sembunyikan' : '▼ Tampilkan'} rincian anuitas — angsuran pokok &amp; bunga ({amort.nB} bulan)
                </button>
                {lihatTabel && (
                  <div className="tbl-wrap" style={{ maxHeight: 420, overflowY: 'auto', marginTop: 8 }}>
                    <table className="tbl-compact">
                      <thead><tr><th>Bulan</th>{!isPermai && <th>Masa</th>}<th className="num">Angsuran</th><th className="num">Pokok</th><th className="num">Bunga</th><th className="num">Sisa Pokok</th></tr></thead>
                      <tbody>
                        {amort.baris.map(r => (
                          <tr key={r.b} style={!isPermai && amort.tahap.some(t => t.dari === r.b && r.b > 1) ? { borderTop: '2px solid var(--brass)' } : undefined}>
                            <td data-label="Bulan">{r.b}</td>
                            {!isPermai && <td data-label="Masa">{r.fix ? <span className="badge b-close">{r.tahap}</span> : <span className="badge b-warm">Floating</span>}</td>}
                            <td className="num" data-label="Angsuran">{fmtRp(Math.round(r.a))}</td>
                            <td className="num" data-label="Pokok">{fmtRp(Math.round(r.pk))}</td>
                            <td className="num" data-label="Bunga">{fmtRp(Math.round(r.bg))}</td>
                            <td className="num" data-label="Sisa">{r.sisa < 1 ? 'Rp 0' : fmtRp(Math.round(r.sisa))}</td>
                          </tr>))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </>)}
      <Toast />
    </>
  );
}
