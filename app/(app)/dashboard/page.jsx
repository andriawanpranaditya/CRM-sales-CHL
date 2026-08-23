'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, fmtDate, reminder } from '@/components/util';

const AKTIF = ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Booking'];

export default function Dashboard() {
  const [leads, setLeads] = useState(null);
  const [fus, setFus] = useState([]);
  const [trx, setTrx] = useState([]);
  const [set, setSet] = useState({ status: [], project: [] });
  const [proj, setProj] = useState('');
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('');
  const [stock, setStock] = useState([]);

  useEffect(() => {
    Promise.all([api('/api/leads'), api('/api/followups'), api('/api/trx'), api('/api/settings'), api('/api/stock')])
      .then(([l, f, t, s, st]) => { setLeads(l); setFus(f); setTrx(t); setSet(s); setStock(st.status || []); })
      .catch(e => toast(e.message));
  }, []);

  const fLeads = useMemo(() => proj ? (leads || []).filter(l => l.project === proj) : (leads || []), [leads, proj]);
  const codes = useMemo(() => new Set(fLeads.map(l => l.lead_code)), [fLeads]);
  const fFus = useMemo(() => proj ? fus.filter(f => codes.has(f.lead_code)) : fus, [fus, codes, proj]);
  const fTrx = useMemo(() => proj ? trx.filter(t => codes.has(t.lead_code)) : trx, [trx, codes, proj]);

  if (!leads) return <div className="loading">Memuat data dari database…</div>;

  const byStatus = st => fLeads.filter(l => l.status === st).length;
  const rem = { OVERDUE: 0, 'HARI INI': 0, UPCOMING: 0 };
  fFus.forEach(f => { const r = reminder(f.next_tgl); if (r) rem[r[0]]++; });
  const pipeVal = fLeads.filter(l => AKTIF.includes(l.status)).reduce((a, l) => a + Number(l.budget || 0), 0);
  const bookVal = fTrx.filter(t => t.jenis === 'Booking').reduce((a, t) => a + Number(t.nilai || 0), 0);
  const closeVal = fTrx.filter(t => t.jenis === 'Closing').reduce((a, t) => a + Number(t.nilai || 0), 0);
  const max = Math.max(1, ...(set.status || []).map(byStatus));
  const salesNames = [...new Set(fLeads.map(l => l.sales).filter(Boolean))];

  async function downloadExcel() {
    const XLSX = await import('xlsx');
    const dd = x => x ? new Date(x).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const wb = XLSX.utils.book_new();

    const addSheet = (nama, rows, widths) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Belum ada data' }]);
      ws['!autofilter'] = { ref: ws['!ref'] };   // tombol sort & filter di tiap kolom
      if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, nama);
    };

    addSheet('Database Lead', leads.map(l => ({
      'ID Lead': l.lead_code, 'Tanggal': dd(l.tgl), 'Nama': l.nama, 'WhatsApp': l.wa || '',
      'Email': l.email || '', 'Domisili': l.domisili || '', 'Pekerjaan': l.kerja || '',
      'Sumber': l.sumber || '', 'Project': l.project || '', 'Tipe': l.tipe || '',
      'Tujuan': l.tujuan || '', 'Budget (Rp)': Number(l.budget) || 0, 'Bayar': l.bayar || '',
      'Sales': l.sales || '', 'Status': l.status, 'Next FU': dd(l.next_fu), 'Catatan': l.catatan || '',
    })), [10, 11, 22, 14, 20, 14, 14, 14, 14, 12, 10, 14, 12, 12, 11, 11, 24]);

    addSheet('Follow Up', fus.map(f => ({
      'Tanggal': dd(f.tgl), 'ID Lead': f.lead_code, 'Nama': f.nama || '',
      'Detail Komunikasi': f.detail, 'Objection': f.objection || '',
      'Next Action': f.next_action || '', 'Tgl Next FU': dd(f.next_tgl), 'Oleh': f.created_by || '',
    })), [11, 10, 22, 40, 20, 20, 11, 12]);

    addSheet('Booking & Closing', trx.map(t => ({
      'ID Lead': t.lead_code, 'Nama': t.nama || '', 'Project': t.project || '', 'Tipe': t.tipe || '',
      'Jenis': t.jenis, 'Tanggal': dd(t.tgl), 'Nilai (Rp)': Number(t.nilai) || 0, 'Catatan': t.catatan || '',
    })), [10, 22, 14, 12, 10, 11, 16, 24]);

    XLSX.writeFile(wb, `CRM_CHL_Data_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('File Excel terunduh — tiap kolom ada tombol sort & filter');
  }

  async function downloadWord() {
    // Ambil logo sebagai base64 agar tertanam di dokumen Word
    let logoTag = '';
    try {
      const blob = await fetch('/icon-192.png').then(r => r.blob());
      const dataUrl = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      logoTag = `<img src="${dataUrl}" width="72" height="72" style="border-radius:12px" alt="CHL"/>`;
    } catch {}
    const inPeriod = t => {
      if (!t) return !d1 && !d2;
      const x = String(t).slice(0, 10);
      return (!d1 || x >= d1) && (!d2 || x <= d2);
    };
    const pl = fLeads.filter(l => inPeriod(l.tgl));
    const pf = fFus.filter(f => inPeriod(f.tgl));
    const pt = fTrx.filter(t => inPeriod(t.tgl));
    const projLabel = proj || 'Semua Project';
    const ST = set.status || [];
    const cnt = st => pl.filter(l => l.status === st).length;
    // Booking & Closing dihitung dari TRANSAKSI yang benar-benar diinput (lead unik), bukan dari status pipeline
    const salesOf = {}; leads.forEach(l => { salesOf[l.lead_code] = l.sales; });
    const trxLeads = jenis => new Set(pt.filter(t => t.jenis === jenis).map(t => t.lead_code));
    const bookSet = trxLeads('Booking'), resSet = trxLeads('Reserved');
    const bookV = pt.filter(t => t.jenis === 'Booking').reduce((a, t) => a + Number(t.nilai || 0), 0);
    const resV = pt.filter(t => t.jenis === 'Reserved').reduce((a, t) => a + Number(t.nilai || 0), 0);
    // Site Visit pipeline = status Site Visit + lead Walk In (sudah datang langsung)
    const svN = pl.filter(l => l.status === 'Site Visit' || /walk/i.test(l.sumber || '')).length;
    // Sebaran sumber lead
    const bySumber = {};
    pl.forEach(l => { const k = l.sumber || 'Tidak diisi'; bySumber[k] = (bySumber[k] || 0) + 1; });
    const sumberRows = Object.entries(bySumber).sort((a, b) => b[1] - a[1]);
    const maxS = Math.max(1, ...sumberRows.map(x => x[1]));
    const bar = n => '<span style="color:#23694A;letter-spacing:1px">' + '▰'.repeat(Math.max(1, Math.round(n / maxS * 16))) + '</span>';
    const byWalk = {};
    pl.filter(l => /walk/i.test(l.sumber || '') && l.walkin_info).forEach(l => { byWalk[l.walkin_info] = (byWalk[l.walkin_info] || 0) + 1; });
    const walkDetail = Object.entries(byWalk).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
    const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
    const dd = x => x ? new Date(x).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    const periode = (d1 || d2) ? `${dd(d1) || 'awal'} s/d ${dd(d2) || 'sekarang'}` : 'Seluruh data';
    // Hanya sales yang punya lead pada project & periode terpilih — yang lain tidak dimunculkan
    const salesNs = [...new Set(pl.map(l => l.sales).filter(Boolean))]
      .filter(sn => pl.some(l => l.sales === sn));
    const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Rekomendasi: seluruh lead yang SAAT INI Warm/Hot (prioritas tindak lanjut)
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const recos = fLeads.filter(l => l.status === 'Warm' || l.status === 'Hot')
      .map(l => {
        const myFus = fus.filter(f => f.lead_code === l.lead_code)
          .sort((a, b) => String(a.tgl).localeCompare(String(b.tgl)) || a.id - b.id);
        const last = myFus[myFus.length - 1];
        const nfu = l.next_fu || (last && last.next_tgl) || null;
        const overdue = nfu && new Date(nfu) < now;
        return { ...l, last, myFus, nfu, overdue };
      })
      .sort((a, b) => (b.status === 'Hot') - (a.status === 'Hot') || (b.overdue === true) - (a.overdue === true));

    // ===== Rekap stok per project (kondisi saat ini: transaksi + manual) =====
    // Nilai per unit = transaksi terakhir non-Batal unit tsb
    const lastVal = {};
    [...trx].sort((a, b) => a.id - b.id).forEach(t => {
      if (!t.unit || !t.project) return;
      const key = t.project + '|' + t.unit;
      if (t.jenis === 'Batal') delete lastVal[key];
      else lastVal[key] = Number(t.nilai) || 0;
    });
    const projList = proj ? [proj] : (set.project || []);
    const stokRows = projList.map(p2 => {
      const total = ((set.units || {})[p2] || []).length;
      const su = stock.filter(u => u.project === p2);
      const merahU = su.filter(u => u.warna === 'merah');
      const kuningU = su.filter(u => u.warna === 'kuning');
      const nJual = merahU.reduce((a, u) => a + (lastVal[p2 + '|' + u.unit] || 0), 0);
      const nRes = kuningU.reduce((a, u) => a + (lastVal[p2 + '|' + u.unit] || 0), 0);
      return { p: p2, total, merah: merahU.length, kuning: kuningU.length, nJual, nRes };
    });

    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Report CRM</title>
<style>
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1C2B23}
h1{font-size:20pt;color:#23694A;margin:0} h2{font-size:13pt;color:#23694A;border-bottom:2px solid #C9922E;padding-bottom:4px;margin-top:24px}
table{border-collapse:collapse;width:100%;font-size:10pt} th{background:#1C2B23;color:#fff;padding:6px 8px;text-align:left}
td{border:1px solid #D8D6CC;padding:5px 8px;vertical-align:top}
.hot{background:#F6E3C0} .warm{background:#FBF1DC}
.badge-over{color:#B3402F;font-weight:bold} .muted{color:#6B7A70}
.kpi{display:inline-block;border:1px solid #D8D6CC;padding:8px 16px;margin:4px 8px 4px 0}
.kpi b{font-size:16pt;color:#23694A}
</style></head><body>
<table style="border:none;width:100%"><tr>
<td style="border:none;width:84px;vertical-align:middle">${logoTag}</td>
<td style="border:none;vertical-align:middle">
<p style="letter-spacing:3px;color:#C9922E;font-weight:bold;margin:0">CIPTA HARMONI LESTARI</p>
<h1>REPORT CRM SALES</h1>
</td></tr></table>
<p class="muted">Project: <b>${esc(projLabel)}</b> &nbsp;|&nbsp; Periode: <b>${esc(periode)}</b> &nbsp;|&nbsp; Dibuat: ${dd(new Date().toISOString())} &nbsp;|&nbsp; Sumber: crm-sales-chl.vercel.app</p>

<h2>1. RINGKASAN EKSEKUTIF</h2>
<table>
<tr><th style="text-align:center">LEAD MASUK</th><th style="text-align:center">FOLLOW UP</th><th style="text-align:center">RESERVED</th><th style="text-align:center">BOOKING</th></tr>
<tr>
<td style="text-align:center;font-size:20pt;font-weight:bold;color:#23694A">${pl.length}</td>
<td style="text-align:center;font-size:20pt;font-weight:bold;color:#23694A">${pf.length}</td>
<td style="text-align:center;font-size:20pt;font-weight:bold;color:#C9922E">${resSet.size}</td>
<td style="text-align:center;font-size:20pt;font-weight:bold;color:#B3402F">${bookSet.size}</td>
</tr>
<tr class="muted">
<td style="text-align:center">lead baru pada periode</td>
<td style="text-align:center">aktivitas follow up</td>
<td style="text-align:center">Nilai: <b>${rp(resV)}</b></td>
<td style="text-align:center">Nilai: <b>${rp(bookV)}</b></td>
</tr>
</table>

<h3 style="color:#23694A;margin-top:14px;margin-bottom:4px">Sebaran Sumber Lead (${pl.length} lead)</h3>
<table><tr><th>Sumber</th><th style="width:60px">Jumlah</th><th style="width:60px">%</th><th>Grafik</th></tr>
${sumberRows.length ? sumberRows.map(([k, v]) => `<tr><td>${esc(k)}${/walk/i.test(k) && walkDetail ? '<br/><span class="muted" style="font-size:8.5pt">via: ' + esc(walkDetail) + '</span>' : ''}</td><td style="text-align:center"><b>${v}</b></td><td style="text-align:center">${Math.round(v / Math.max(1, pl.length) * 100)}%</td><td>${bar(v)}</td></tr>`).join('') : '<tr><td colspan="4">Tidak ada lead pada periode ini.</td></tr>'}
</table>

<h2>2. STATUS PIPELINE (posisi status lead saat ini; Reserved &amp; Booking dilaporkan dari transaksi pada Ringkasan)</h2>
<table><tr><th>Status</th><th>Jumlah</th></tr>
${ST.filter(st => st !== 'Booking' && st !== 'Closing').map(st => {
      const val = st === 'Site Visit' ? svN : cnt(st);
      const note = st === 'Site Visit' ? ' <span class="muted" style="font-size:8.5pt">(status Site Visit + lead Walk In)</span>' : '';
      return `<tr${st === 'Hot' ? ' class="hot"' : st === 'Warm' ? ' class="warm"' : ''}><td>${st}${note}</td><td>${val}</td></tr>`;
    }).join('')}
</table>

<h2>3. KINERJA PER SALES (lead masuk pada periode)</h2>
<table><tr><th>Sales / PIC</th><th style="text-align:center">Total Lead</th><th style="text-align:center">Reserved</th><th style="text-align:center">Booking</th><th style="text-align:center">Closing Rate</th></tr>
${salesNs.length ? salesNs.map(sn => {
      const mine = pl.filter(l => l.sales === sn);
      const rs = [...resSet].filter(code => salesOf[code] === sn).length;
      const bk = [...bookSet].filter(code => salesOf[code] === sn).length;
      return `<tr><td><b>${esc(sn)}</b></td><td style="text-align:center">${mine.length}</td><td style="text-align:center">${rs}</td><td style="text-align:center"><b>${bk}</b></td><td style="text-align:center"><b>${mine.length ? Math.round(bk / mine.length * 100) + '%' : '0%'}</b></td></tr>`;
    }).join('') : '<tr><td colspan="5">Tidak ada data pada periode ini.</td></tr>'}
</table>
<p class="muted" style="font-size:8.5pt">Closing Rate = jumlah lead yang mencapai Booking ÷ total lead sales tsb pada periode.</p>

<h2>4. REKOMENDASI FOLLOW UP — PRIORITAS WARM &amp; HOT</h2>
<p class="muted">Analisa per lead diarahkan ke Booking. Perilaku konsumen properti saat ini: membandingkan 3–5 proyek sekaligus secara online, memutuskan berdasarkan besaran angsuran (bukan harga total), dan menghargai kecepatan respon — lead yang direspon &lt; 1 jam berpeluang konversi jauh lebih tinggi.</p>
<table><tr><th style="width:70px">Prioritas</th><th>Lead</th><th style="width:32%">Summary Hasil Follow Up</th><th>Analisa &amp; Rekomendasi Menuju Booking</th></tr>
${recos.length ? recos.map(l => {
      const obj = ((l.last && l.last.objection) || '').toLowerCase();
      const aksi = [];
      if (l.overdue) aksi.push('<b>Jadwal FU sudah lewat</b> — hubungi hari ini; tiap hari tertunda, lead dibanding-bandingkan dengan proyek kompetitor.');
      if (!l.last) aksi.push('<b>Belum pernah di-follow up</b> — kontak hari ini juga; respon pertama yang cepat adalah penentu terbesar konversi.');
      if (l.status === 'Hot') aksi.push('Lead panas: tawarkan <b>Reserved dengan tanda jadi ringan</b> untuk mengunci unit pilihannya — tunjukkan peta stok terkini sebagai bukti unit favorit cepat habis, lalu jadwalkan pelunasan booking fee.');
      else aksi.push('Bangun urgensi bertahap: kirim materi bernilai (progress pembangunan, foto unit, testimoni) dan tutup setiap kontak dengan ajakan konkret — jadwal visit atau reservasi, bukan sekadar menanyakan kabar.');
      if (/harga|mahal|budget|dana|dp|cicil/.test(obj)) aksi.push('Objection harga: siapkan <b>2 simulasi angsuran</b> (DP dicicil vs tenor berbeda) dan alternatif tipe yang lebih terjangkau — geser pembicaraan dari harga total ke angsuran bulanan.');
      if (/pikir|diskusi|keluarga|istri|suami|orang tua/.test(obj)) aksi.push('Menunggu keputusan keluarga: undang <b>site visit bersama pengambil keputusan</b> di akhir pekan + beri tenggat promo agar keputusan tidak menggantung.');
      if (/lokasi|jauh|akses|banjir/.test(obj)) aksi.push('Keberatan lokasi: kirim peta akses &amp; waktu tempuh riil ke titik penting (tol, sekolah, pasar) dan tonjolkan fasilitas kawasan sebagai kompensasi jarak.');
      if (/walk/i.test(l.sumber || '')) aksi.push('Sudah pernah datang langsung — jangan ulang presentasi dari awal: <b>sempitkan ke 2–3 unit favorit</b> dan tawarkan hold unit 1×24 jam.');
      if (Number(l.budget)) aksi.push('Budget diketahui (±' + rp(l.budget) + ') — ajukan langsung tipe &amp; unit yang cocok agar penawaran terasa personal.');
      return `<tr class="${l.status === 'Hot' ? 'hot' : 'warm'}">
<td><b>${l.status.toUpperCase()}</b>${l.overdue ? '<br/><span class="badge-over">TERLAMBAT</span>' : ''}</td>
<td><b>${esc(l.nama)}</b><br/><span class="muted">${esc(l.lead_code)} · ${esc(l.project || '')} ${esc(l.tipe || '')} · ${esc(l.sales)}</span></td>
<td>${(() => {
        const fs = l.myFus || [];
        if (!fs.length) return '<span class="badge-over">Belum ada aktivitas follow up yang tercatat.</span> Direkomendasikan kontak perdana segera dilakukan.';
        const ds = x => x ? new Date(x).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '';
        const potong = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
        const objs = [...new Set(fs.map(f => (f.objection || '').trim()).filter(Boolean))];
        let teks = `Telah dilakukan <b>${fs.length}× follow up</b> (${ds(fs[0].tgl)}${fs.length > 1 ? ' – ' + ds(fs[fs.length - 1].tgl) : ''}). `;
        const tampil = fs.length <= 3 ? fs : [fs[0], ...fs.slice(-2)];
        teks += 'Kronologi: ' + tampil.map(f => `<span class="muted">${ds(f.tgl)}</span> ${esc(potong(f.detail, 90))}`).join('; ') + (fs.length > 3 ? ` <span class="muted">(+${fs.length - 3} aktivitas lainnya)</span>` : '') + '. ';
        if (objs.length) teks += 'Kendala yang mengemuka: <i>' + esc(potong(objs.join('; '), 120)) + '</i>. ';
        teks += l.nfu ? `Tindak lanjut berikutnya dijadwalkan <b>${dd(l.nfu)}</b>.` : '<span class="badge-over">Tindak lanjut berikutnya belum terjadwal.</span>';
        return teks;
      })()}</td>
<td>${aksi.slice(0, 3).join('<br/>• ')}</td>
</tr>`;
    }).join('') : '<tr><td colspan="4">Tidak ada lead Warm/Hot saat ini.</td></tr>'}
</table>

<h2>5. STOK &amp; NILAI PENJUALAN PER PROJECT <span style="font-weight:normal;font-size:9pt;color:#6B7A70">(posisi stok per hari ini, termasuk penandaan manual di Master Stock)</span></h2>
<table><tr><th>Project</th><th>Total Stok (unit)</th><th>Terjual</th><th>Reserved</th><th>Tersedia</th><th>% Terjual</th><th>Nilai Penjualan</th><th>Nilai Reserved</th></tr>
${stokRows.map(r => `<tr><td><b>${esc(r.p)}</b></td><td>${r.total}</td><td class="hot"><b>${r.merah}</b></td><td class="warm"><b>${r.kuning}</b></td><td>${Math.max(0, r.total - r.merah - r.kuning)}</td><td>${r.total ? Math.round(r.merah / r.total * 100) + '%' : '-'}</td><td>${rp(r.nJual)}</td><td>${rp(r.nRes)}</td></tr>`).join('')}
${stokRows.length > 1 ? `<tr style="background:#EFEEE8;font-weight:bold"><td>TOTAL</td><td>${stokRows.reduce((a, r) => a + r.total, 0)}</td><td>${stokRows.reduce((a, r) => a + r.merah, 0)}</td><td>${stokRows.reduce((a, r) => a + r.kuning, 0)}</td><td>${stokRows.reduce((a, r) => a + Math.max(0, r.total - r.merah - r.kuning), 0)}</td><td></td><td>${rp(stokRows.reduce((a, r) => a + r.nJual, 0))}</td><td>${rp(stokRows.reduce((a, r) => a + r.nRes, 0))}</td></tr>` : ''}
</table>
<p class="muted">Unit hasil penandaan manual (tanpa transaksi) terhitung pada jumlah namun bernilai Rp 0. Nilai diambil dari transaksi terakhir tiap unit.</p>

<p class="muted" style="margin-top:24px">Report ini dibuat otomatis oleh CRM Sales CHL — copyright &copy; 2026 by Andriawanp.</p>
</body></html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Report_CRM_CHL_${(proj || 'Semua').replace(/\s+/g, '')}_${d1 || 'awal'}_${d2 || 'kini'}.doc`;
    document.body.appendChild(a); a.click(); a.remove();
    toast('Report Word terunduh');
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Dashboard</h1><div className="sub">Data real-time dari database bersama — semua input tim langsung terhitung</div></div>
        <div className="stamp">Data per: <b>{new Date().toLocaleDateString('id-ID')}</b></div>
      </div>
      <div className="fu-toolbar">
        <span className="hint" style={{ fontWeight: 600 }}>Filter project:</span>
        <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua</button>
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>))}
      </div>
      <div className="card" style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ minWidth: 150 }}><label>Report — Dari Tanggal</label>
          <input type="date" value={d1} onChange={e => setD1(e.target.value)} /></div>
        <div className="field" style={{ minWidth: 150 }}><label>Sampai Tanggal</label>
          <input type="date" value={d2} onChange={e => setD2(e.target.value)} /></div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={downloadWord}>⬇ Report Word</button>
        <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={downloadExcel}>⬇ Download Excel (semua data)</button>
        <span className="hint">Report Word mengikuti <b>filter project di atas</b> (Semua / per project) + berlogo CHL. Kosongkan tanggal utk seluruh periode; Warm &amp; Hot ter-highlight. Excel: 3 sheet lengkap + sort/filter tiap kolom utk arsip offline.</span>
      </div>
      <div className="grid kpis">
        {[['Total Lead', fLeads.length], ['Hot', byStatus('Hot')],
          ['Booking', new Set(fTrx.filter(t => t.jenis === 'Booking').map(t => t.lead_code)).size],
          ['Closing', new Set(fTrx.filter(t => t.jenis === 'Closing').map(t => t.lead_code)).size]]
          .map(([l, v]) => <div className="kpi" key={l}><div className="lbl">{l}</div><div className="val">{v}</div></div>)}
      </div>
      <div className="grid two-col">
        <div className="card">
          <h2>Status Pipeline</h2>
          <div className="pipe">
            {(set.status || []).map(st => {
              const n = byStatus(st);
              const cls = st === 'Hot' ? ' hot' : (st === 'Lost' || st === 'Drop') ? ' lost' : '';
              return <div className={'pipe-row' + cls} key={st}><span>{st}</span>
                <div className="bar"><div className="fill" style={{ width: (n / max * 100) + '%' }} /></div>
                <span className="n">{n}</span></div>;
            })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <h2>Reminder Follow-Up</h2>
            <div className="rem-line overdue"><span>Overdue (terlewat)</span><span className="n">{rem.OVERDUE}</span></div>
            <div className="rem-line today"><span>Hari Ini</span><span className="n">{rem['HARI INI']}</span></div>
            <div className="rem-line upcoming"><span>Upcoming</span><span className="n">{rem.UPCOMING}</span></div>
          </div>
          <div className="card">
            <h2>Nilai (Rp)</h2>
            <div className="money-line"><span>Pipeline Aktif <span className="hint">(budget, excl. Closing/Lost)</span></span><b>{fmtRp(pipeVal)}</b></div>
            <div className="money-line"><span>Nilai Booking</span><b>{fmtRp(bookVal)}</b></div>
            <div className="money-line"><span>Nilai Closing</span><b>{fmtRp(closeVal)}</b></div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14 }} className="tbl-wrap">
        <table>
          <thead><tr><th>Sales / PIC</th><th className="num">Total</th><th className="num">Warm</th><th className="num">Hot</th>
            <th className="num">Booking</th><th className="num">Closing</th><th className="num">Closing Rate</th></tr></thead>
          <tbody>
            {salesNames.length ? salesNames.map(s => {
              const mine = fLeads.filter(l => l.sales === s);
              const c = st => mine.filter(l => l.status === st).length;
              return <tr key={s}>
                <td data-label="Sales"><b>{s}</b></td>
                <td className="num" data-label="Total">{mine.length}</td>
                <td className="num" data-label="Warm">{c('Warm')}</td>
                <td className="num" data-label="Hot">{c('Hot')}</td>
                <td className="num" data-label="Booking">{c('Booking')}</td>
                <td className="num" data-label="Closing">{c('Closing')}</td>
                <td className="num" data-label="Closing Rate">{mine.length ? Math.round(c('Closing') / mine.length * 100) + '%' : '0%'}</td>
              </tr>;
            }) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada data lead.</td></tr>}
          </tbody>
        </table>
      </div>
      <Toast />
    </>
  );
}
