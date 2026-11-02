'use client';
import { useEffect, useState } from 'react';

const IMG = p => /BIO/i.test(p) ? '/siteplan-bio.jpg' : '/siteplan-permai.jpg';
const WARNA = { merah: '#A5352F', kuning: '#C9A227' };
const TGL = () => new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
const JAM = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export default function CetakStockPage() {
  const [d, setD] = useState(null);
  const [errMsg, setErr] = useState('');
  const [proj, setProj] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setProj(q.get('project') || '');
    Promise.all([
      fetch('/api/stock').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([st, set]) => {
      if (st.error || set.error) return setErr(st.error || set.error);
      setD({ status: st.status || [], positions: st.positions || [], manual: st.manual || [], set });
      if (!q.get('project')) setProj((set.project && set.project[0]) || '');
    }).catch(() => setErr('Gagal memuat data stok.'));
  }, []);

  if (errMsg) return <div className="pad">{errMsg}</div>;
  if (!d) return <div className="pad">Menyiapkan lembar stok…</div>;

  const posMap = {}; d.positions.forEach(p => { posMap[p.project + '|' + p.unit] = p; });
  const aktif = d.status.filter(u => u.project === proj);
  const markers = aktif.filter(u => posMap[proj + '|' + u.unit]).map(u => ({ ...u, ...posMap[proj + '|' + u.unit] }));
  const belumTandai = aktif.filter(u => !posMap[proj + '|' + u.unit]);
  const semuaUnit = (d.set.units && d.set.units[proj]) || [];
  const bertanda = new Set(aktif.map(u => u.unit));
  const tersedia = semuaUnit.filter(u => !bertanda.has(u));
  const jml = w => aktif.filter(u => u.warna === w).length;

  return (
    <div className="sheet">
      <style>{`
        *{box-sizing:border-box}
        html,body{margin:0;background:#EFEDE6;-webkit-text-size-adjust:100%;text-size-adjust:100%}
        .pad{padding:40px;font-family:system-ui,sans-serif}
        .sheet{max-width:1000px;margin:0 auto;padding:22px 16px calc(60px + env(safe-area-inset-bottom,0));
          font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#132019}
        .paper{background:#fff;padding:36px 40px;border:1px solid #DCDACE;border-radius:6px}
        .kop{display:flex;justify-content:space-between;align-items:flex-start;
          border-bottom:2.5px solid #0A3B2E;padding-bottom:13px;margin-bottom:18px}
        .kop h1{margin:0;font-size:18px;letter-spacing:.05em;color:#0A3B2E}
        .kop small{display:block;font-size:11px;color:#68766E;margin-top:3px}
        .kop .no{text-align:right;font-size:11px;color:#68766E;line-height:1.7}
        .kop .no b{display:block;font-size:14px;color:#132019}
        h2.judul{text-align:center;font-size:16px;letter-spacing:.07em;margin:0 0 3px}
        .subjudul{text-align:center;font-size:11.5px;color:#68766E;margin-bottom:18px}
        .ring{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
        .ring div{flex:1;min-width:130px;border:1.5px solid #E3E0D4;border-radius:8px;padding:11px 14px;background:#FBFAF4}
        .ring .l{font-size:10px;font-weight:800;letter-spacing:.07em;color:#68766E;text-transform:uppercase}
        .ring .v{font-size:24px;font-weight:800;line-height:1.2;margin-top:2px}
        .peta{position:relative;line-height:0;border:1px solid #DCDACE;border-radius:6px;overflow:hidden}
        .peta img{width:100%;height:auto;display:block}
        .mk{position:absolute;transform:translate(-50%,-50%);width:15px;height:15px;border-radius:50%;
          border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
        .mk i{width:4px;height:4px;border-radius:50%;background:#fff;display:block}
        .ket{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#68766E;margin-top:9px;align-items:center}
        .ket span{display:inline-flex;align-items:center;gap:5px}
        .dot{width:11px;height:11px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 0 1px #ccc}
        .sec{font-size:11px;font-weight:800;letter-spacing:.06em;color:#68766E;
          margin:22px 0 7px;padding-bottom:4px;border-bottom:1.5px solid #0A3B2E}
        table{width:100%;border-collapse:collapse;font-size:11.5px}
        th{background:#0A3B2E;color:#DCE7E0;text-align:left;font-size:9.5px;letter-spacing:.05em;
          text-transform:uppercase;padding:8px 10px;font-weight:700}
        td{padding:7px 10px;border-bottom:1px solid #EFEDE3;vertical-align:top}
        tr:last-child td{border-bottom:none}
        .bdg{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px}
        .kolom{columns:4;column-gap:14px;font-size:11.5px;line-height:1.9}
        .kolom span{display:block;break-inside:avoid}
        .kaki{margin-top:22px;padding-top:11px;border-top:1px solid #E5E3D8;
          font-size:10px;color:#8A8F84;text-align:center;line-height:1.6}
        .bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;align-items:center;
          padding:12px;margin-bottom:12px;background:#EFEDE6;z-index:5;flex-wrap:wrap}
        .bar button{font-family:inherit;font-size:13px;font-weight:700;padding:11px 18px;min-height:44px;
          border-radius:8px;border:1.5px solid #C9C6B6;background:#fff;cursor:pointer;color:#132019;
          -webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent}
        .bar button.pri{background:#0A3B2E;color:#fff;border-color:#0A3B2E}
        .bar select{font-family:inherit;font-size:13px;padding:10px 12px;min-height:44px;
          border-radius:8px;border:1.5px solid #C9C6B6;background:#fff}
        @media(max-width:640px){ .paper{padding:22px 16px} .kop{flex-direction:column;gap:9px}
          .kop .no{text-align:left} .kolom{columns:2} }
        @media print{
          html,body{background:#fff}
          @page{size:A4 portrait;margin:12mm}
          .bar{display:none}
          .sheet{padding:0;max-width:none}
          .paper{border:none;padding:0;border-radius:0}
          .pecah{break-before:page;page-break-before:always}
          table{font-size:10.5px}
          thead{display:table-header-group}
          tr{break-inside:avoid}
        }
      `}</style>

      <div className="bar">
        <select value={proj} onChange={e => setProj(e.target.value)}>
          {(d.set.project || []).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="pri" onClick={() => window.print()}>Cetak / Simpan PDF</button>
        <button onClick={() => window.close()}>Tutup</button>
      </div>

      <div className="paper">
        <div className="kop">
          <div>
            <h1>PT CIPTA HARMONI LESTARI</h1>
            <small>Harmoni One — Master Stock Unit</small>
          </div>
          <div className="no">
            Project<b>{proj || '—'}</b>
            {TGL()} · {JAM()}
          </div>
        </div>

        <h2 className="judul">LAPORAN MASTER STOCK</h2>
        <div className="subjudul">Posisi ketersediaan unit per {TGL()} pukul {JAM()} WIB</div>

        <div className="ring">
          <div><div className="l">Total Unit</div><div className="v">{semuaUnit.length || aktif.length}</div></div>
          <div><div className="l">Terjual</div><div className="v" style={{ color: WARNA.merah }}>{jml('merah')}</div></div>
          <div><div className="l">Reserved</div><div className="v" style={{ color: WARNA.kuning }}>{jml('kuning')}</div></div>
          <div><div className="l">Tersedia</div><div className="v" style={{ color: '#12604B' }}>{tersedia.length}</div></div>
        </div>

        <div className="sec">PETA SITEPLAN</div>
        <div className="peta">
          <img src={IMG(proj)} alt={proj} />
          {markers.map(m => (
            <div key={m.unit} className="mk"
              style={{ left: m.x + '%', top: m.y + '%', background: WARNA[m.warna] }}>
              {m.manual ? <i /> : null}
            </div>))}
        </div>
        <div className="ket">
          <span><i className="dot" style={{ background: WARNA.merah }} /> Terjual — Booking / Closing</span>
          <span><i className="dot" style={{ background: WARNA.kuning }} /> Reserved — terkunci sementara</span>
          <span>Titik putih di tengah = status ditetapkan manual</span>
          {belumTandai.length > 0 && <span>· {belumTandai.length} unit bertanda belum berposisi di peta</span>}
          <span>· rincian nama unit ada pada tabel di halaman berikutnya</span>
        </div>

        <div className="sec pecah">DAFTAR UNIT BERTANDA ({aktif.length})</div>
        {aktif.length ? (
          <table>
            <thead><tr><th style={{ width: '16%' }}>Blok / Unit</th><th style={{ width: '14%' }}>Status</th>
              <th>Keterangan</th><th style={{ width: '15%' }}>ID Lead</th>
              <th style={{ width: '15%' }}>Posisi Peta</th></tr></thead>
            <tbody>
              {aktif.slice().sort((a, b) => a.unit.localeCompare(b.unit, 'id', { numeric: true })).map(u => (
                <tr key={u.unit}>
                  <td><b>{u.unit}</b></td>
                  <td><span className="bdg" style={{
                    background: u.warna === 'merah' ? '#FBEDEC' : '#FBF3DC',
                    color: WARNA[u.warna] }}>{u.warna === 'merah' ? 'Terjual' : 'Reserved'}</span></td>
                  <td>{u.info || '—'}{u.manual ? ' · ditetapkan manual' : ''}</td>
                  <td>{u.lead_code || '—'}</td>
                  <td>{posMap[proj + '|' + u.unit] ? 'Sudah ditandai' : 'Belum ditandai'}</td>
                </tr>))}
            </tbody>
          </table>
        ) : <div style={{ fontSize: 12, color: '#68766E' }}>Belum ada unit bertanda pada project ini.</div>}

        <div className="sec">UNIT TERSEDIA ({tersedia.length})</div>
        {tersedia.length ? (
          <div className="kolom">{tersedia.map(u => <span key={u}>{u}</span>)}</div>
        ) : <div style={{ fontSize: 12, color: '#68766E' }}>Seluruh unit pada project ini sudah bertanda.</div>}

        <div className="kaki">
          Dicetak otomatis oleh Harmoni One pada {TGL()} pukul {JAM()} WIB.<br />
          PT Cipta Harmoni Lestari — data mengikuti kondisi sistem pada saat pencetakan.
        </div>
      </div>
    </div>
  );
}
