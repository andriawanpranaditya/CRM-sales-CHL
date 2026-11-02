'use client';
import { useEffect, useState } from 'react';

const RP = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const TGL = d => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const JAM = d => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit' }) : '—';
const KB = b => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

export default function CetakIomPage() {
  const [d, setD] = useState(null);
  const [errMsg, setErr] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    fetch('/api/iom/cetak?id=' + q.get('id'))
      .then(r => r.json())
      .then(x => (x.error ? setErr(x.error) : setD(x)))
      .catch(() => setErr('Gagal memuat data.'));
  }, []);

  if (errMsg) return <div className="pad">{errMsg}</div>;
  if (!d) return <div className="pad">Memuat dokumen…</div>;

  return (
    <div className="sheet">
      <style>{`
        *{box-sizing:border-box}
        html,body{margin:0;background:#EFEDE6;-webkit-text-size-adjust:100%;text-size-adjust:100%}
        .pad{padding:40px;font-family:system-ui,sans-serif}
        .sheet{max-width:820px;margin:0 auto;padding:26px 16px calc(60px + env(safe-area-inset-bottom,0));
          font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#132019}
        .paper{background:#fff;padding:44px 46px;border:1px solid #DCDACE;border-radius:6px}
        .kop{display:flex;justify-content:space-between;align-items:flex-start;
          border-bottom:2.5px solid #0A3B2E;padding-bottom:14px;margin-bottom:22px}
        .kop h1{margin:0;font-size:19px;letter-spacing:.06em;color:#0A3B2E}
        .kop small{display:block;font-size:11px;color:#68766E;margin-top:3px}
        .kop .no{text-align:right;font-size:11.5px;color:#68766E;line-height:1.7}
        .kop .no b{display:block;font-size:13px;color:#132019}
        h2.judul{text-align:center;font-size:16.5px;letter-spacing:.08em;margin:0 0 4px}
        .subjudul{text-align:center;font-size:11.5px;color:#68766E;margin-bottom:24px}
        .sec{font-size:11px;font-weight:800;letter-spacing:.06em;color:#68766E;
          margin:22px 0 6px;padding-bottom:4px;border-bottom:1.5px solid #0A3B2E}
        table.dt{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:13px}
        table.dt td{padding:7px 0;vertical-align:top;border-bottom:1px dashed #E5E3D8}
        table.dt td.k{width:34%;color:#68766E}
        table.dt td.v{font-weight:600}
        .uraian{font-size:13px;line-height:1.7;white-space:pre-wrap;padding:10px 0}
        .total{display:flex;justify-content:space-between;align-items:center;background:#F4F1E6;
          border:1.5px solid #E0D6B8;border-radius:7px;padding:14px 18px;margin:8px 0 4px}
        .total span{font-size:12.5px;color:#6B531C;font-weight:700}
        .total b{font-size:19px;color:#0A3B2E}
        table.sign{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
        table.sign th{background:#0A3B2E;color:#DCE7E0;text-align:left;font-size:10px;letter-spacing:.06em;
          text-transform:uppercase;padding:9px 11px;font-weight:700}
        table.sign td{padding:10px 11px;border-bottom:1px solid #EFEDE3;vertical-align:top}
        table.sign tr:last-child td{border-bottom:none}
        table.sign .nm{font-weight:700}
        table.sign .kode{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;font-weight:700;
          color:#0E4C3B;background:#EEF3EF;border-radius:5px;padding:2px 7px;white-space:nowrap}
        table.sign .tunggu{color:#8A8F84;font-style:italic}
        .lamp{font-size:12px;margin-top:4px}
        .lamp .row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px dashed #E5E3D8}
        .lamp .row:last-child{border-bottom:none}
        .lamp .sid{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#68766E;white-space:nowrap}
        .catatan{background:#FFF8E9;border:1px solid #E8D9AE;border-radius:6px;
          padding:11px 14px;font-size:11.5px;line-height:1.6;color:#6B531C;margin-top:18px}
        .kaki{margin-top:26px;padding-top:12px;border-top:1px solid #E5E3D8;
          font-size:10px;color:#8A8F84;text-align:center;line-height:1.6}
        .bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;
          padding:12px;margin-bottom:14px;background:#EFEDE6;z-index:5;flex-wrap:wrap}
        .bar button{font-family:inherit;font-size:13px;font-weight:700;padding:11px 18px;min-height:44px;
          border-radius:8px;border:1.5px solid #C9C6B6;background:#fff;cursor:pointer;color:#132019;
          -webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent}
        .bar button.pri{background:#0A3B2E;color:#fff;border-color:#0A3B2E}
        @media(max-width:640px){
          .paper{padding:26px 20px}
          .kop{flex-direction:column;gap:10px}
          .kop .no{text-align:left}
          table.sign th:nth-child(4),table.sign td:nth-child(4){display:none}
        }
        @media print{
          html,body{background:#fff}
          @page{margin:14mm}
          .bar{display:none}
          .sheet{padding:0;max-width:none}
          .paper{border:none;padding:0;border-radius:0}
        }
      `}</style>

      <div className="bar">
        <button className="pri" onClick={() => window.print()}>Cetak / Simpan PDF</button>
        <button onClick={() => window.close()}>Tutup</button>
      </div>

      <div className="paper">
        <div className="kop">
          <div>
            <h1>PT CIPTA HARMONI LESTARI</h1>
            <small>Harmoni One — Internal Office Memorandum</small>
          </div>
          <div className="no">
            Nomor<b>{d.no}</b>
            {TGL(d.created_at)}
          </div>
        </div>

        <h2 className="judul">INTERNAL OFFICE MEMORANDUM</h2>
        <div className="subjudul">Lembar pengesahan digital — sah tanpa tanda tangan basah</div>

        <div className="sec">DATA MEMORANDUM</div>
        <table className="dt"><tbody>
          <tr><td className="k">Perihal</td><td className="v">{d.perihal}</td></tr>
          <tr><td className="k">Jenis</td><td className="v">{d.jenis_label}</td></tr>
          <tr><td className="k">Divisi Pemohon</td><td className="v">{d.divisi}</td></tr>
          <tr><td className="k">Diajukan oleh</td><td className="v">{d.pengaju} · {TGL(d.created_at)}</td></tr>
          {d.ref_budget && <tr><td className="k">Referensi Anggaran</td><td className="v">{d.ref_budget}</td></tr>}
          <tr><td className="k">Status</td><td className="v">{d.status === 'Cair' ? 'Selesai — dana telah dicairkan' : d.tahap_label}</td></tr>
        </tbody></table>

        {d.uraian && <>
          <div className="sec">URAIAN</div>
          <div className="uraian">{d.uraian}</div>
        </>}

        {Number(d.nominal) > 0 && (
          <div className="total"><span>NOMINAL DIAJUKAN</span><b>{RP(d.nominal)}</b></div>)}

        <div className="sec">PENGESAHAN</div>
        <table className="sign">
          <thead><tr><th>Pos</th><th>Nama &amp; Jabatan</th><th>Waktu</th><th>Kode Verifikasi</th></tr></thead>
          <tbody>
            {d.diajukan_log && (
              <tr>
                <td>Pengajuan</td>
                <td><span className="nm">{d.diajukan_log.oleh}</span><br />
                  <span style={{ color: '#68766E' }}>Pemohon — {d.divisi}</span></td>
                <td>{JAM(d.diajukan_log.created_at)}</td>
                <td><span className="kode">—</span></td>
              </tr>)}
            {d.pengesahan.map((g, i) => (
              <tr key={i}>
                <td>{g.pos}</td>
                <td><span className="nm">{g.oleh}</span>{g.kode_petugas ? ' · ' + g.kode_petugas : ''}<br />
                  <span style={{ color: '#68766E' }}>{g.jabatan}</span>
                  {g.alasan && <><br /><span style={{ color: '#8A8F84', fontSize: 11 }}>{g.alasan}</span></>}</td>
                <td>{JAM(g.waktu)}</td>
                <td><span className="kode">{g.kode}</span></td>
              </tr>))}
            {d.menunggu.map((m, i) => (
              <tr key={'w' + i}>
                <td className="tunggu">{m.pos}</td>
                <td className="tunggu">menunggu {m.jabatan}</td>
                <td className="tunggu">—</td>
                <td className="tunggu">—</td>
              </tr>))}
          </tbody>
        </table>

        {d.files.length > 0 && <>
          <div className="sec">LAMPIRAN</div>
          <div className="lamp">
            {d.files.map((f, i) => (
              <div className="row" key={i}>
                <span>{i + 1}. {f.filename} <span style={{ color: '#8A8F84' }}>· {KB(f.ukuran || 0)} · diunggah {f.uploaded_by}</span></span>
                <span className="sid">{f.sidik || '—'}</span>
              </div>))}
          </div>
          <div className="catatan" style={{ marginTop: 10 }}>
            Kolom kanan adalah <b>sidik digital</b> tiap lampiran. Bila berkas diganti atau diubah setelah
            diunggah, sidiknya tidak akan sama dengan yang tercetak di sini.
          </div>
        </>}

        <div className="catatan">
          <b>Keabsahan dokumen.</b> Setiap baris pengesahan di atas berasal dari persetujuan yang tercatat
          di dalam sistem Harmoni One, lengkap dengan pelaku dan waktunya. Kode verifikasi dihitung dari isi
          keputusan itu sendiri, sehingga tidak dapat dibuat ulang apabila datanya diubah.
          Keaslian dokumen ini dapat diperiksa dengan membandingkan kode tersebut pada menu IOM.
        </div>

        <div className="kaki">
          Dicetak otomatis oleh Harmoni One pada {TGL(new Date())} oleh {d.pencetak}.<br />
          PT Cipta Harmoni Lestari — dokumen sah tanpa tanda tangan basah bila disertai nomor dan kode verifikasi di atas.
        </div>
      </div>
    </div>
  );
}
