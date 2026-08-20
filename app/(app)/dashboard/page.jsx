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

  useEffect(() => {
    Promise.all([api('/api/leads'), api('/api/followups'), api('/api/trx'), api('/api/settings')])
      .then(([l, f, t, s]) => { setLeads(l); setFus(f); setTrx(t); setSet(s); })
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
    const bookV = pt.filter(t => t.jenis === 'Booking').reduce((a, t) => a + Number(t.nilai || 0), 0);
    const closeV = pt.filter(t => t.jenis === 'Closing').reduce((a, t) => a + Number(t.nilai || 0), 0);
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
        const myFus = fus.filter(f => f.lead_code === l.lead_code);
        const last = myFus[0];
        const nfu = l.next_fu || (last && last.next_tgl) || null;
        const overdue = nfu && new Date(nfu) < now;
        return { ...l, last, nfu, overdue };
      })
      .sort((a, b) => (b.status === 'Hot') - (a.status === 'Hot') || (b.overdue === true) - (a.overdue === true));

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

<h2>1. RINGKASAN</h2>
<p>
<span class="kpi">Lead Masuk<br/><b>${pl.length}</b></span>
<span class="kpi">Follow Up<br/><b>${pf.length}</b></span>
<span class="kpi">Booking<br/><b>${cnt('Booking')}</b></span>
<span class="kpi">Closing<br/><b>${cnt('Closing')}</b></span>
<span class="kpi">Nilai Booking<br/><b>${rp(bookV)}</b></span>
<span class="kpi">Nilai Closing<br/><b>${rp(closeV)}</b></span>
</p>

<h2>2. STATUS PIPELINE (lead masuk pada periode)</h2>
<table><tr><th>Status</th><th>Jumlah</th></tr>
${ST.map(st => `<tr${st === 'Hot' ? ' class="hot"' : st === 'Warm' ? ' class="warm"' : ''}><td>${st}</td><td>${cnt(st)}</td></tr>`).join('')}
</table>

<h2>3. KINERJA PER SALES (lead masuk pada periode)</h2>
<table><tr><th>Sales / PIC</th><th>Total</th><th>Warm</th><th>Hot</th><th>Booking</th><th>Closing</th><th>Closing Rate</th></tr>
${salesNs.length ? salesNs.map(sn => {
      const mine = pl.filter(l => l.sales === sn);
      const c = st => mine.filter(l => l.status === st).length;
      return `<tr><td><b>${esc(sn)}</b></td><td>${mine.length}</td><td>${c('Warm')}</td><td>${c('Hot')}</td><td>${c('Booking')}</td><td>${c('Closing')}</td><td>${mine.length ? Math.round(c('Closing') / mine.length * 100) + '%' : '0%'}</td></tr>`;
    }).join('') : '<tr><td colspan="7">Tidak ada data pada periode ini.</td></tr>'}
</table>

<h2>4. REKOMENDASI FOLLOW UP — PRIORITAS WARM &amp; HOT</h2>
<p class="muted">Diurutkan dari prioritas tertinggi (Hot &amp; terlambat). Baris disorot sesuai kategori. Status per hari ini.</p>
<table><tr><th>Prioritas</th><th>Lead</th><th>Sales</th><th>Kontak</th><th>FU Terakhir</th><th>Next FU</th><th>Rekomendasi Tindakan</th></tr>
${recos.length ? recos.map(l => `<tr class="${l.status === 'Hot' ? 'hot' : 'warm'}">
<td><b>${l.status.toUpperCase()}</b>${l.overdue ? '<br/><span class="badge-over">TERLAMBAT</span>' : ''}</td>
<td><b>${esc(l.nama)}</b><br/><span class="muted">${esc(l.lead_code)} · ${esc(l.project || '')} ${esc(l.tipe || '')}</span></td>
<td>${esc(l.sales)}</td>
<td>${esc(l.wa || '-')}</td>
<td>${l.last ? dd(l.last.tgl) + '<br/><span class="muted">' + esc(l.last.detail) + '</span>' : '<span class="badge-over">Belum pernah di-follow up</span>'}</td>
<td>${l.nfu ? dd(l.nfu) : '<span class="badge-over">Belum dijadwalkan</span>'}</td>
<td>${esc((l.last && l.last.next_action) || (l.status === 'Hot' ? 'Segera hubungi — dorong ke booking/site visit' : 'Follow up berkala — kirim info project & jadwalkan pertemuan'))}${l.last && l.last.objection ? '<br/><span class="muted">Objection: ' + esc(l.last.objection) + '</span>' : ''}</td>
</tr>`).join('') : '<tr><td colspan="7">Tidak ada lead Warm/Hot saat ini.</td></tr>'}
</table>

<p class="muted" style="margin-top:24px">Report ini dibuat otomatis oleh CRM Sales CHL.</p>
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
        {[['Total Lead', fLeads.length], ['Hot', byStatus('Hot')], ['Booking', byStatus('Booking')], ['Closing', byStatus('Closing')]]
          .map(([l, v]) => <div className="kpi" key={l}><div className="lbl">{l}</div><div className="val">{v}</div></div>)}
      </div>
      <div className="grid two-col">
        <div className="card">
          <h2>Status Pipeline</h2>
          <div className="pipe">
            {(set.status || []).map(st => {
              const n = byStatus(st);
              const cls = st === 'Hot' ? ' hot' : st === 'Lost' ? ' lost' : '';
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
