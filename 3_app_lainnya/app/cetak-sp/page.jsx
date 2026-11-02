'use client';
import { useEffect, useState } from 'react';

const RP = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const TGL = d => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
const ROMAWI = { 1: 'I', 2: 'II', 3: 'III' };

// Isi imbauan menurut tingkat. Rumusan konsekuensi sengaja merujuk P3U/PPJB, tidak memuat
// angka atau sanksi tersendiri — wajib ditinjau Legal sebelum dipakai untuk penagihan resmi.
const ISI = {
  1: { pembuka: 'Berdasarkan catatan kami, terdapat kewajiban pembayaran Bapak/Ibu yang telah melewati jatuh tempo. Melalui surat ini kami mengingatkan agar kewajiban tersebut segera diselesaikan.',
       penutup: 'Apabila pembayaran telah dilakukan, mohon abaikan surat ini dan sampaikan bukti pembayaran kepada kami. Apabila terdapat kendala, silakan menghubungi kami untuk mencari penyelesaian bersama.' },
  2: { pembuka: 'Surat ini merupakan tindak lanjut dari Surat Peringatan I. Hingga saat ini kewajiban pembayaran Bapak/Ibu masih belum diselesaikan dan telah melewati jatuh tempo.',
       penutup: 'Kami meminta Bapak/Ibu segera menyelesaikan kewajiban tersebut dalam batas waktu di atas. Keterlambatan berlanjut dapat berdampak pada hak-hak Bapak/Ibu sesuai ketentuan dalam Perjanjian Persetujuan Pemesanan Unit (P3U/PPJB).' },
  3: { pembuka: 'Surat ini merupakan Surat Peringatan terakhir, tindak lanjut dari Surat Peringatan I dan II yang belum dipenuhi.',
       penutup: 'Apabila kewajiban tidak diselesaikan dalam batas waktu di atas, pengembang akan menempuh langkah sebagaimana diatur dalam Perjanjian Persetujuan Pemesanan Unit (P3U/PPJB), termasuk kemungkinan pembatalan pemesanan dengan akibat hukum sesuai ketentuan perjanjian tersebut.' },
};

export default function CetakSP() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    fetch('/api/cetak-sp?id=' + id).then(r => r.json()).then(x => (x.error ? setErr(x.error) : setD(x))).catch(() => setErr('Gagal memuat data.'));
  }, []);
  if (err) return <div style={{ padding: 40, fontFamily: 'system-ui' }}>{err}</div>;
  if (!d) return <div style={{ padding: 40, fontFamily: 'system-ui' }}>Memuat surat…</div>;

  const { sp, kontrak: k, perusahaan: p, baris } = d;
  const isi = ISI[sp.tingkat];
  const totalPokok = baris.reduce((a, r) => a + r.sisa, 0), totalDenda = baris.reduce((a, r) => a + r.denda, 0);
  return (
    <div className="sheet">
      <style>{`
        *{box-sizing:border-box}
        html,body{margin:0;background:#EFEDE6}
        .sheet{max-width:820px;margin:0 auto;padding:26px 16px 60px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#1B211A}
        .paper{background:#fff;padding:44px 46px;border:1px solid #DCDACE;border-radius:6px;font-size:13px;line-height:1.7}
        .kop{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #123B2C;padding-bottom:14px;margin-bottom:22px}
        .kop h1{margin:0;font-size:19px;letter-spacing:.06em;color:#123B2C}
        .kop small{display:block;font-size:11px;color:#6B7265;margin-top:3px}
        .meta td{padding:1px 14px 1px 0;vertical-align:top}
        table.rinci{width:100%;border-collapse:collapse;margin:14px 0;font-size:12.5px}
        table.rinci th{background:#0A3B2E;color:#DCE7E0;text-align:left;font-size:10px;letter-spacing:.05em;text-transform:uppercase;padding:8px 10px}
        table.rinci td{padding:8px 10px;border-bottom:1px solid #EFEDE3}
        table.rinci td.n,table.rinci th.n{text-align:right}
        table.rinci tr.tot td{font-weight:800;background:#F4F1E6}
        .batas{background:#FFF8E9;border:1px solid #E8D9AE;border-radius:6px;padding:10px 14px;margin:14px 0;font-weight:700;color:#6B531C}
        .ttd{display:flex;justify-content:space-between;gap:24px;margin-top:38px;text-align:center;font-size:12px}
        .ttd div{flex:1}.ttd .garis{margin-top:64px;border-top:1px solid #1B211A;padding-top:5px;font-weight:600}
        .kaki{margin-top:26px;padding-top:12px;border-top:1px solid #E5E3D8;font-size:10px;color:#8A8F84;text-align:center}
        .bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:12px;margin-bottom:14px;background:#EFEDE6;z-index:5}
        .bar button{font-family:inherit;font-size:13px;font-weight:700;padding:11px 18px;min-height:44px;border-radius:8px;border:1.5px solid #C9C6B6;background:#fff;cursor:pointer}
        .bar button.pri{background:#123B2C;color:#fff;border-color:#123B2C}
        @media print{html,body{background:#fff}@page{margin:14mm}.bar{display:none}.sheet{padding:0;max-width:none}.paper{border:none;padding:0}}
      `}</style>
      <div className="bar"><button className="pri" onClick={() => window.print()}>Cetak / Simpan PDF</button><button onClick={() => window.close()}>Tutup</button></div>
      <div className="paper">
        <div className="kop">
          <div>
            <h1>{(p && p.nama_pt) || 'PT CIPTA HARMONI LESTARI'}</h1>
            <small>{p && (p.alamat || p.telp) ? [p.alamat, p.telp ? 'Telp. ' + p.telp : ''].filter(Boolean).join(' · ') : 'Harmoni One — Sistem Terpadu Penjualan'}</small>
          </div>
        </div>
        <table className="meta"><tbody>
          <tr><td>Nomor</td><td>: <b>{sp.no_surat}</b></td></tr>
          <tr><td>Tanggal</td><td>: {TGL(sp.tgl_terbit)}</td></tr>
          <tr><td>Perihal</td><td>: <b>Surat Peringatan {ROMAWI[sp.tingkat]} — Keterlambatan Pembayaran</b></td></tr>
        </tbody></table>
        <p style={{ marginTop: 18 }}>Kepada Yth.<br /><b>{k.nama}</b><br />{k.alamat || ''}</p>
        <p>Dengan hormat,</p>
        <p>{isi.pembuka}</p>
        <table className="meta"><tbody>
          <tr><td>Project / Unit</td><td>: {k.project} · {k.unit}</td></tr>
          <tr><td>No. Surat Pemesanan</td><td>: {k.no_sp || '—'}</td></tr>
          <tr><td>Nilai Kontrak</td><td>: {RP(k.harga_unit)}</td></tr>
        </tbody></table>
        <table className="rinci">
          <thead><tr><th>Kewajiban</th><th>Jatuh Tempo</th><th className="n">Terlambat</th><th className="n">Sisa Tertunggak</th><th className="n">Denda*</th></tr></thead>
          <tbody>
            {baris.map((r, i) => (<tr key={i}><td>{r.nama}</td><td>{TGL(r.jatuh_tempo)}</td><td className="n">{r.hari} hari</td><td className="n">{RP(r.sisa)}</td><td className="n">{RP(r.denda)}</td></tr>))}
            <tr className="tot"><td colSpan={3}>Total</td><td className="n">{RP(totalPokok)}</td><td className="n">{RP(totalDenda)}</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: '#6B7265' }}>*Denda keterlambatan dihitung {d.tarif.persen_per_hari}% per hari dari sisa tertunggak, sampai dengan tanggal surat ini.</div>
        <div className="batas">Mohon kewajiban di atas diselesaikan paling lambat {TGL(sp.batas_bayar)}.</div>
        <p>{isi.penutup}</p>
        <p>Demikian surat ini kami sampaikan. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.</p>
        <div className="ttd">
          <div>Hormat kami,<div className="garis">Collection</div></div>
          <div>Mengetahui,<div className="garis">Manajemen</div></div>
        </div>
        <div className="kaki">Diterbitkan melalui Harmoni One · dicetak oleh {d.pencetak} · {new Date().toLocaleString('id-ID')}</div>
      </div>
    </div>
  );
}
