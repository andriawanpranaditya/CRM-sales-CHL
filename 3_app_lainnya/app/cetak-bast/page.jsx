'use client';
import { useEffect, useState } from 'react';

// Cetak dokumen serah terima berbasis templat redaksi (BAST, Pinjam Pakai, STO, PPN DTP, Perjanjian, Undangan, Surat Kuasa).
// Redaksi ditetapkan Legal. Selama belum ada, dokumen bertanda DRAFT dan hanya memuat data ringkas.
export default function CetakBast() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    fetch('/api/cetak-bast?id=' + q.get('id') + '&dok=' + (q.get('dok') || 'bast'))
      .then(r => r.json()).then(x => (x.error ? setErr(x.error) : setD(x))).catch(() => setErr('Gagal memuat data.'));
  }, []);
  if (err) return <div style={{ padding: 40, fontFamily: 'system-ui' }}>{err}</div>;
  if (!d) return <div style={{ padding: 40, fontFamily: 'system-ui' }}>Memuat dokumen…</div>;
  const p = d.perusahaan;
  const paragraf = String(d.isi || '').split(/\n{2,}/).filter(x => x.trim());
  return (
    <div className="sheet">
      <style>{`
        *{box-sizing:border-box}
        html,body{margin:0;background:#EFEDE6}
        .sheet{max-width:820px;margin:0 auto;padding:26px 16px 60px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#1B211A}
        .paper{position:relative;background:#fff;padding:44px 46px;border:1px solid #DCDACE;border-radius:6px;font-size:13.5px;line-height:1.75}
        .kop{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #123B2C;padding-bottom:14px;margin-bottom:22px}
        .kop h1{margin:0;font-size:19px;letter-spacing:.06em;color:#123B2C}
        .kop small{display:block;font-size:11px;color:#6B7265;margin-top:3px}
        .kop .no{text-align:right;font-size:11.5px;color:#6B7265;line-height:1.7}.kop .no b{display:block;font-size:13px;color:#1B211A}
        h2.judul{text-align:center;font-size:16.5px;letter-spacing:.08em;margin:0 0 4px}
        .sub{text-align:center;font-size:11.5px;color:#6B7265;margin-bottom:22px}
        .isi p{margin:0 0 12px;white-space:pre-wrap;text-align:justify}
        table.dt{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px}
        table.dt td{padding:6px 0;vertical-align:top;border-bottom:1px dashed #E5E3D8}table.dt td.k{width:34%;color:#6B7265}table.dt td.v{font-weight:600}
        .draft{background:#FFF1D6;border:2px dashed #C9962B;border-radius:8px;padding:12px 16px;color:#7A5210;font-weight:700;margin-bottom:18px;text-align:center}
        .cap{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;font-size:92px;font-weight:900;color:rgba(200,150,40,.13);transform:rotate(-24deg);letter-spacing:.1em}
        .ttd{display:flex;justify-content:space-between;gap:24px;margin-top:40px;text-align:center;font-size:12.5px}
        .ttd div{flex:1}.ttd .garis{margin-top:70px;border-top:1px solid #1B211A;padding-top:5px;font-weight:600}
        .kaki{margin-top:26px;padding-top:12px;border-top:1px solid #E5E3D8;font-size:10px;color:#8A8F84;text-align:center}
        .bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:12px;margin-bottom:14px;background:#EFEDE6;z-index:5}
        .bar button{font-family:inherit;font-size:13px;font-weight:700;padding:11px 18px;min-height:44px;border-radius:8px;border:1.5px solid #C9C6B6;background:#fff;cursor:pointer}
        .bar button.pri{background:#123B2C;color:#fff;border-color:#123B2C}
        @media print{html,body{background:#fff}@page{margin:14mm}.bar{display:none}.sheet{padding:0;max-width:none}.paper{border:none;padding:0}}
      `}</style>
      <div className="bar"><button className="pri" onClick={() => window.print()}>Cetak / Simpan PDF</button><button onClick={() => window.close()}>Tutup</button></div>
      <div className="paper">
        {d.draft && <div className="cap">DRAFT</div>}
        <div className="kop">
          <div><h1>{(p && p.nama_pt) || 'PT CIPTA HARMONI LESTARI'}</h1>
            <small>{p && (p.alamat || p.telp) ? [p.alamat, p.telp ? 'Telp. ' + p.telp : ''].filter(Boolean).join(' · ') : 'Harmoni One — Sistem Terpadu Penjualan'}</small></div>
          <div className="no"><b>{d.nomor || '—'}</b>{d.kategori}</div>
        </div>
        <h2 className="judul">{d.judul}</h2>
        <div className="sub">{d.data.project} · Unit {d.data.unit}</div>
        {d.draft ? (<>
          <div className="draft">DRAFT — redaksi dokumen ini belum ditetapkan Legal.<br /><span style={{ fontWeight: 400 }}>Halaman ini hanya memuat data; jangan dipakai sebagai dokumen resmi.</span></div>
          <table className="dt"><tbody>
            <tr><td className="k">Nomor</td><td className="v">{d.nomor || '—'}</td></tr>
            <tr><td className="k">Konsumen</td><td className="v">{d.data.nama}</td></tr>
            <tr><td className="k">Alamat</td><td className="v">{d.data.alamat || '—'}</td></tr>
            <tr><td className="k">No. KTP / NPWP</td><td className="v">{d.data.ktp || '—'} / {d.data.npwp || '—'}</td></tr>
            <tr><td className="k">Unit</td><td className="v">{d.data.project} · {d.data.unit}</td></tr>
            <tr><td className="k">No. Surat Pemesanan / P3U</td><td className="v">{d.data.no_sp || '—'} / {d.data.no_ppjb || '—'}</td></tr>
            <tr><td className="k">Tanggal serah terima</td><td className="v">{d.data.tgl_serah_terima || '—'}</td></tr>
            <tr><td className="k">Nilai kontrak</td><td className="v">{d.data.nilai_kontrak || '—'}</td></tr>
          </tbody></table>
        </>) : (<div className="isi">{paragraf.map((x, i) => <p key={i}>{x}</p>)}</div>)}
        {d.dispensasi && <div style={{ fontSize: 11.5, color: '#6B531C' }}>Serah terima ini dilakukan dengan dispensasi direksi (menyimpang dari prosedur pembayaran).</div>}
        <div className="ttd">
          <div>Pihak Pengembang<div className="garis">{d.data.perusahaan || ' '}</div></div>
          <div>Pihak Konsumen<div className="garis">{d.data.nama}</div></div>
        </div>
        <div className="kaki">Diterbitkan melalui Harmoni One · dicetak oleh {d.pencetak} · {new Date().toLocaleString('id-ID')}</div>
      </div>
    </div>
  );
}
