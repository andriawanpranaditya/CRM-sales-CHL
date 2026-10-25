'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, bukaWA } from '@/components/util';
import { TOTAL_SENTUHAN, JUMLAH_UNDANGAN, MAKS_HARI_PERCAKAPAN } from '@/lib/fuwajib';

// ===== Kepatuhan standar FU wajib sales (manager & CEO) =====
export default function KepatuhanFU() {
  const [d, setD] = useState(null);
  const [fSales, setFSales] = useState('');
  useEffect(() => { api('/api/fu-kepatuhan').then(setD).catch(e => toast(e.message)); }, []);
  if (!d) return <><Toast /><div className="loading">Memuat…</div></>;
  const telat = d.terlambat.filter(r => !fSales || r.sales === fSales);
  const warna = p => p === null ? '' : p >= 90 ? 'b-close' : p >= 70 ? 'b-warm' : 'b-overdue';
  return (
    <>
      <Toast />
      <div className="page-head"><div><h1>Kepatuhan Follow Up</h1>
        <div className="sub">Standar FU wajib: Hari 1, 2, 3, 5, 7 lalu undangan visit setiap Kamis selama 4 minggu ({TOTAL_SENTUHAN} sentuhan) selama konsumen belum membalas · konsumen membalas → FU maks. {MAKS_HARI_PERCAKAPAN} hari · lead lama → undangan Open House ({JUMLAH_UNDANGAN} Kamis)</div></div>
      </div>

      <div className="card">
        <b>Per sales</b> <span className="hint">— ketepatan dihitung dari FU wajib 30 hari terakhir ({fmtDate(d.dari)} – {fmtDate(d.today)})</span>
        <div className="tbl-wrap tbl-compact" style={{ marginTop: 8 }}><table>
          <thead><tr><th>Sales</th><th className="num">Lead aktif</th><th className="num">Sentuhan Hari 1–7</th><th className="num">Undangan weekend</th><th className="num">Percakapan</th><th className="num">Tuntas (perlu keputusan)</th><th className="num">Belum disentuh</th><th className="num">Terlambat</th><th className="num">FU tepat waktu</th></tr></thead>
          <tbody>
            {d.sales.length ? d.sales.map(r => (
              <tr key={r.sales} style={{ cursor: 'pointer' }} onClick={() => setFSales(fSales === r.sales ? '' : r.sales)}>
                <td><b>{r.sales}</b>{fSales === r.sales ? ' ✓' : ''}</td>
                <td className="num">{r.aktif}</td><td className="num">{r.wajib}</td><td className="num">{r.undangan}</td>
                <td className="num">{r.percakapan}</td><td className="num">{r.tuntas}</td>
                <td className="num">{r.belumDisentuh ? <span className="badge b-overdue">{r.belumDisentuh}</span> : 0}</td>
                <td className="num">{r.terlambat ? <span className="badge b-overdue">{r.terlambat}</span> : 0}</td>
                <td className="num">{r.persen === null ? '-' : <span className={'badge ' + warna(r.persen)}>{r.persen}% ({r.fuTepat}/{r.fuTotal})</span>}</td>
              </tr>)) : <tr><td colSpan={9} className="hint">Belum ada lead aktif di tangan sales.</td></tr>}
          </tbody>
        </table></div>
        <div className="hint" style={{ marginTop: 6 }}>Klik baris sales untuk menyaring daftar terlambat di bawah.</div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <b>FU wajib terlambat{fSales ? ' — ' + fSales : ''} ({telat.length}{!fSales && d.totalTerlambat > d.terlambat.length ? ' dari ' + d.totalTerlambat : ''})</b>
        <div className="tbl-wrap tbl-compact" style={{ marginTop: 8 }}><table>
          <thead><tr><th>Lead</th><th>Sales</th><th>Sentuhan</th><th>Jatuh tempo</th><th className="num">Terlambat</th><th></th></tr></thead>
          <tbody>
            {telat.length ? telat.map(r => (
              <tr key={r.lead_code}>
                <td><b>{r.nama}</b> <span className="hint">({r.lead_code} · {r.project})</span></td>
                <td>{r.sales}</td><td>{r.label}</td><td>{fmtDate(r.jatuh)}</td>
                <td className="num"><span className="badge b-overdue">{r.telat} hari</span></td>
                <td>{r.wa ? <button className="sort-btn" onClick={() => bukaWA(r.wa, '')}>📲 WA</button> : null}</td>
              </tr>)) : <tr><td colSpan={6} className="hint">✅ Tidak ada FU wajib yang terlambat.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
