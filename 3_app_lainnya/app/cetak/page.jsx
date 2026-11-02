'use client';
import { useEffect, useState } from 'react';

const RP = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const TGL = d => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const terbilangTanggal = () => new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

// Nama tindakan otorisasi agar terbaca awam pada dokumen
const NAMA_OTORISASI = {
  verifikasi_sp: 'Penerbitan Surat Pesanan & PPJB',
  clear_serah: 'Status Clear untuk Serah Terima',
  bast: 'Pelaksanaan serah terima unit (BAST)',
  komisi_ajukan: 'Pengajuan komisi Sales',
  batal_transaksi: 'Pembatalan transaksi',
  ubah_harga: 'Perubahan nilai transaksi',
};
const JABATAN_OTOR = { kadiv: 'Kepala Divisi', pceo: 'Project CEO', cfo: 'CFO', ceo: 'CEO' };

const JUDUL = {
  tts: ['TANDA TERIMA SEMENTARA', 'Bukti penerimaan pembayaran tanda jadi / booking fee'],
  fps: ['FORMULIR PEMESANAN UNIT', 'FPU — data pemesanan unit dan data konsumen'],
  sp: ['SURAT PEMESANAN UNIT', 'SPU — pemesanan unit yang telah terverifikasi'],
  ppjb: ['PERJANJIAN PERSETUJUAN PEMESANAN UNIT', 'P3U / PPJB — perjanjian antara pengembang dan pembeli'],
  bast: ['BERITA ACARA SERAH TERIMA', 'Serah terima unit dari pengembang kepada pembeli'],
  kuitansi: ['KUITANSI PEMBAYARAN', 'Bukti penerimaan pembayaran resmi'],
};

export default function CetakPage() {
  const [d, setD] = useState(null);
  const [errMsg, setErr] = useState('');
  const [jenis, setJenis] = useState('tts');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const j = q.get('jenis') || 'tts';
    setJenis(JUDUL[j] ? j : 'tts');
    fetch('/api/cetak?id=' + q.get('id'))
      .then(r => r.json())
      .then(x => (x.error ? setErr(x.error) : setD(x)))
      .catch(() => setErr('Gagal memuat data.'));
  }, []);

  if (errMsg) return <div className="pad">{errMsg}</div>;
  if (!d) return <div className="pad">Memuat dokumen…</div>;

  const [judul, sub] = JUDUL[jenis];
  const resmi = jenis === 'sp' || jenis === 'ppjb' || jenis === 'bast' || jenis === 'kuitansi';
  const nomor = jenis === 'sp' ? d.no_sp : jenis === 'ppjb' ? d.no_ppjb
    : jenis === 'bast' ? (d.no_bast || 'BAST/HO/' + String(d.id).padStart(4, '0'))
    : jenis === 'kuitansi' ? 'KW/HO/' + String(d.id).padStart(4, '0')
    : (jenis === 'tts' ? 'KBF' : 'FPU') + '/HO/' + String(d.id).padStart(4, '0');

  return (
    <div className="sheet">
      <style>{`
        *{box-sizing:border-box}
        html,body{margin:0;background:#EFEDE6;-webkit-text-size-adjust:100%;text-size-adjust:100%}
        .pad{padding:40px;font-family:system-ui,sans-serif}
        .sheet{max-width:820px;margin:0 auto;padding:26px 16px calc(60px + env(safe-area-inset-bottom,0));
          font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#1B211A}
        .paper{background:#fff;padding:44px 46px;border:1px solid #DCDACE;border-radius:6px}
        @media(max-width:640px){
          .paper{padding:26px 20px}
          .kop{flex-direction:column;gap:10px}
          .kop .no{text-align:left}
          .ttd{flex-direction:column;gap:28px}
          .ttd .garis{margin-top:48px}
          table.dt td.k{width:44%}
        }
        .kop{display:flex;justify-content:space-between;align-items:flex-start;
          border-bottom:2.5px solid #123B2C;padding-bottom:14px;margin-bottom:22px}
        .kop h1{margin:0;font-size:19px;letter-spacing:.06em;color:#123B2C}
        .kop small{display:block;font-size:11px;color:#6B7265;margin-top:3px;letter-spacing:.02em}
        .kop .no{text-align:right;font-size:11.5px;color:#6B7265;line-height:1.7}
        .kop .no b{display:block;font-size:13px;color:#1B211A}
        h2.judul{text-align:center;font-size:16.5px;letter-spacing:.08em;margin:0 0 4px}
        .subjudul{text-align:center;font-size:11.5px;color:#6B7265;margin-bottom:24px}
        table.dt{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:13px}
        table.dt td{padding:7px 0;vertical-align:top;border-bottom:1px dashed #E5E3D8}
        table.dt td.k{width:38%;color:#6B7265}
        table.dt td.v{font-weight:600}
        .sec{font-size:11px;font-weight:800;letter-spacing:.06em;color:#6B7265;
          margin:22px 0 6px;padding-bottom:4px;border-bottom:1.5px solid #123B2C}
        .total{display:flex;justify-content:space-between;align-items:center;background:#F4F1E6;
          border:1.5px solid #E0D6B8;border-radius:7px;padding:14px 18px;margin:8px 0 4px}
        .total span{font-size:12.5px;color:#6B531C;font-weight:700}
        .total b{font-size:19px;color:#123B2C}
        .pasal{font-size:12px;line-height:1.75;margin:8px 0 0;padding-left:18px}
        .pasal li{margin-bottom:6px}
        .catatan{background:#FFF8E9;border:1px solid #E8D9AE;border-radius:6px;
          padding:11px 14px;font-size:11.5px;line-height:1.6;color:#6B531C;margin-top:18px}
        .ttd{display:flex;justify-content:space-between;gap:24px;margin-top:38px;text-align:center;font-size:12px}
        .ttd div{flex:1}
        .ttd .garis{margin-top:64px;border-top:1px solid #1B211A;padding-top:5px;font-weight:600}
        table.otor{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px}
        table.otor th{background:#0A3B2E;color:#DCE7E0;text-align:left;font-size:9.5px;letter-spacing:.05em;
          text-transform:uppercase;padding:8px 10px;font-weight:700}
        table.otor td{padding:9px 10px;border-bottom:1px solid #EFEDE3;vertical-align:top}
        table.otor tr:last-child td{border-bottom:none}
        table.otor .nm{font-weight:700}
        table.otor .kode{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;
          color:#0E4C3B;background:#EEF3EF;border-radius:5px;padding:2px 8px;white-space:nowrap;letter-spacing:.06em}
        .kaki{margin-top:26px;padding-top:12px;border-top:1px solid #E5E3D8;
          font-size:10px;color:#8A8F84;text-align:center;line-height:1.6}
        .bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;
          padding:12px;margin-bottom:14px;background:#EFEDE6;z-index:5;flex-wrap:wrap}
        .bar button{font-family:inherit;font-size:13px;font-weight:700;padding:11px 18px;min-height:44px;
          border-radius:8px;border:1.5px solid #C9C6B6;background:#fff;cursor:pointer;color:#1B211A;
          -webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent}
        .bar button.pri{background:#123B2C;color:#fff;border-color:#123B2C}
        .bar button:hover{border-color:#123B2C}
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
            <h1>{(d.perusahaan && d.perusahaan.nama_pt) || 'PT CIPTA HARMONI LESTARI'}</h1>
            <small>{d.perusahaan && (d.perusahaan.alamat || d.perusahaan.telp)
              ? [d.perusahaan.alamat, d.perusahaan.telp ? 'Telp. ' + d.perusahaan.telp : ''].filter(Boolean).join(' · ')
              : 'Harmoni One — Sistem Terpadu Penjualan'}</small>
            {d.perusahaan && d.perusahaan.npwp && <small>NPWP {d.perusahaan.npwp}</small>}
          </div>
          <div className="no">
            Nomor<b>{nomor}</b>
            {terbilangTanggal()}
          </div>
        </div>

        <h2 className="judul">{judul}</h2>
        <div className="subjudul">{sub}</div>

        <div className="sec">DATA KONSUMEN</div>
        <table className="dt"><tbody>
          <tr><td className="k">Nama sesuai KTP</td><td className="v">{d.nama_ktp || d.nama || '—'}</td></tr>
          {d.nama_ktp && d.nama && d.nama_ktp.trim().toLowerCase() !== d.nama.trim().toLowerCase() &&
            <tr><td className="k">Nama Panggilan</td><td className="v">{d.nama}</td></tr>}
          {d.no_ktp && <tr><td className="k">NIK</td><td className="v">{d.no_ktp}</td></tr>}
          <tr><td className="k">No. WhatsApp</td><td className="v">{d.wa || '—'}</td></tr>
          <tr><td className="k">Email</td><td className="v">{d.email || '—'}</td></tr>
          {d.alamat_ktp && <tr><td className="k">Alamat sesuai KTP</td><td className="v">{d.alamat_ktp}</td></tr>}
          <tr><td className="k">Alamat Domisili</td><td className="v">{d.alamat_domisili || d.domisili || '—'}</td></tr>
          {d.npwp && <tr><td className="k">NPWP</td><td className="v">{d.npwp}</td></tr>}
          <tr><td className="k">Pekerjaan</td><td className="v">{d.kerja || '—'}</td></tr>
          <tr><td className="k">ID Lead</td><td className="v">{d.lead_code}</td></tr>
        </tbody></table>

        <div className="sec">DATA UNIT</div>
        <table className="dt"><tbody>
          <tr><td className="k">Project</td><td className="v">{d.project || '—'}</td></tr>
          <tr><td className="k">Blok / Unit</td><td className="v">{d.unit || '—'}</td></tr>
          <tr><td className="k">Tipe</td><td className="v">{d.tipe || '—'}</td></tr>
          {(resmi || d.harga_unit > 0) &&
            <tr><td className="k">Nilai Transaksi</td><td className="v">{d.harga_unit ? RP(d.harga_unit) : '—'}</td></tr>}
          <tr><td className="k">Cara Pembayaran</td><td className="v">{d.bayar || '—'}</td></tr>
        </tbody></table>

        <div className="sec">PEMBAYARAN</div>
        <table className="dt"><tbody>
          <tr><td className="k">Jenis Transaksi</td><td className="v">{d.jenis}</td></tr>
          <tr><td className="k">Tanggal Transaksi</td><td className="v">{TGL(d.tgl)}</td></tr>
          <tr><td className="k">Sales / PIC</td><td className="v">{d.sales || '—'}</td></tr>
          {resmi && <tr><td className="k">Diverifikasi oleh</td><td className="v">{d.verif_by || '—'}</td></tr>}
        </tbody></table>
        <div className="total">
          <span>{jenis === 'tts' ? 'DITERIMA PEMBAYARAN' : 'TOTAL PEMBAYARAN MASUK'}</span>
          <b>{RP(jenis === 'tts' ? d.nilai : d.total_bayar)}</b>
        </div>

        {jenis === 'kuitansi' && (
          <>
            <div className="sec">RIWAYAT PEMBAYARAN UNIT INI</div>
            <table className="dt"><tbody>
              {(d.riwayat || []).map((r, i) => (
                <tr key={i}>
                  <td className="k">{TGL(r.tgl)} — {r.jenis}{r.catatan ? ' · ' + r.catatan : ''}</td>
                  <td className="v" style={{ textAlign: 'right' }}>{RP(r.nilai)}</td>
                </tr>))}
            </tbody></table>
            {d.harga_unit > 0 && (
              <div className="catatan" style={{ marginTop: 4 }}>
                Nilai transaksi {RP(d.harga_unit)} · terbayar {RP(d.total_bayar)} ({((d.total_bayar / d.harga_unit) * 100).toFixed(1)}%)
                · sisa {RP(Math.max(0, d.harga_unit - d.total_bayar))}
              </div>)}
            <div className="catatan" style={{ marginTop: 10 }}>
              Kuitansi ini sah sebagai bukti penerimaan pembayaran. Simpan sebagai lampiran saat serah terima unit.
            </div>
          </>
        )}

        {jenis === 'bast' && (
          <>
            <div className="sec">PELAKSANAAN SERAH TERIMA</div>
            <table className="dt"><tbody>
              <tr><td className="k">Tanggal Serah Terima</td><td className="v">{TGL(d.tgl_serah_terima)}</td></tr>
              <tr><td className="k">Dicatat pada</td><td className="v">{d.bast_at ? TGL(d.bast_at) : 'Belum tercatat'}</td></tr>
            </tbody></table>
            <div className="sec">CEKLIS KESIAPAN UNIT</div>
            <ol className="pasal">
              {(d.ceklis || []).map((c, i) => (
                <li key={i}>{c.status === 'Selesai' ? '\u2713 ' : '\u25A1 '}{c.judul}
                  {c.selesai_by ? ' — ' + c.selesai_by : ''}</li>))}
            </ol>
            {(d.hadiah || []).length > 0 && <>
              <div className="sec">HADIAH PROMO</div>
              <ol className="pasal">
                {d.hadiah.map((h, i) => (
                  <li key={i}>{h.status === 'Selesai' ? '\u2713 ' : '\u25A1 '}{h.judul}</li>))}
              </ol>
            </>}
            {d.bast_dispensasi && (
              <div className="catatan" style={{ marginTop: 12, background: '#FBEDEC', borderColor: '#EED3D1', color: '#7A2822' }}>
                <b>Serah terima atas dispensasi.</b> Dilaksanakan sebelum seluruh syarat pembayaran pada
                Kebijakan &amp; Prosedur Penjualan terpenuhi{d.bast_dispensasi_alasan ? ' — ' + d.bast_dispensasi_alasan : ''}.
                Dispensasi diberikan oleh pejabat berwenang dan tercantum pada tabel Otorisasi di bawah.
                Kewajiban pembayaran Konsumen tidak gugur dengan diserahkannya unit ini.
              </div>)}

            <div className="sec">PERNYATAAN</div>
            <ol className="pasal">
              <li>Pembeli menyatakan telah menerima unit dalam kondisi sebagaimana diperiksa bersama pada tanggal serah terima.</li>
              <li>Penjual menyerahkan kunci, kartu akses, dan kelengkapan unit kepada Pembeli.</li>
              <li>Terhitung sejak tanggal ini, pengelolaan lingkungan beralih kepada Estate Management, termasuk kewajiban Iuran Pengelolaan Lingkungan (IPL).</li>
              <li>Masa retensi/garansi perbaikan berlaku 90 hari sejak tanggal serah terima. Komplain disampaikan melalui kanal Estate.</li>
            </ol>
          </>
        )}

        {jenis === 'ppjb' && (
          <>
            <div className="sec">KETENTUAN POKOK</div>
            <ol className="pasal">
              <li>Penjual mengikatkan diri untuk menjual dan Pembeli mengikatkan diri untuk membeli unit sebagaimana tercantum dalam Data Unit di atas.</li>
              <li>Pembayaran dilakukan sesuai skema yang disepakati dan tercatat dalam sistem. Setiap pembayaran dibuktikan dengan kuitansi resmi yang diterbitkan Penjual.</li>
              <li>Keterlambatan pembayaran melewati jatuh tempo dapat dikenakan denda sesuai ketentuan yang berlaku pada Penjual.</li>
              <li>Serah terima unit dilaksanakan setelah seluruh kewajiban pembayaran dan/atau akad kredit dinyatakan selesai oleh Divisi Legal &amp; Keuangan, dituangkan dalam Berita Acara Serah Terima (BAST).</li>
              <li>Setelah serah terima, pengelolaan lingkungan beralih kepada Estate Management, termasuk kewajiban Iuran Pengelolaan Lingkungan (IPL) dan masa retensi perbaikan.</li>
              <li>Hal-hal yang belum diatur dalam perjanjian ini akan dituangkan dalam Akta Jual Beli (AJB) di hadapan Notaris/PPAT yang ditunjuk.</li>
            </ol>
          </>
        )}

        {(jenis === 'sp' || jenis === 'ppjb') && (
          <div className="catatan" style={{ marginTop: 14 }}>
            <b>Ketentuan rangkap &amp; meterai.</b> {jenis === 'ppjb'
              ? 'Dicetak 2 (dua) rangkap. Meterai dibubuhkan pada kedua rangkap: satu tepat di atas Nama Perusahaan, satu tepat di atas Nama Konsumen. Rangkap bermeterai Nama Perusahaan diserahkan kepada Konsumen; rangkap bermeterai Nama Konsumen diarsipkan perusahaan.'
              : 'Dicetak 2 (dua) rangkap. Surat Pemesanan Unit tidak memerlukan meterai. Satu rangkap untuk Konsumen, satu rangkap diarsipkan perusahaan.'}
          </div>)}

        {jenis === 'sp' && (
          <>
            <div className="sec">KETENTUAN PESANAN</div>
            <ol className="pasal">
              <li>Surat Pesanan ini berlaku setelah data dan berkas konsumen diverifikasi oleh Admin Sales.</li>
              <li>Pemesanan mengikat unit tersebut atas nama konsumen dan tidak dapat dialihkan tanpa persetujuan tertulis Penjual.</li>
              <li>Pembatalan sepihak oleh konsumen tunduk pada ketentuan pengembalian dana yang berlaku.</li>
              <li>Surat Pesanan ini menjadi dasar penerbitan PPJB.</li>
            </ol>
          </>
        )}

        {(jenis === 'sp' || jenis === 'ppjb') && (
          <div className="catatan" style={{ marginTop: 14 }}>
            <b>Ketentuan rangkap dan meterai.</b>{' '}
            {jenis === 'sp'
              ? 'Surat Pemesanan Unit dicetak 2 (dua) rangkap dan tidak memerlukan meterai. Satu rangkap untuk konsumen melalui Sales/Agent, satu rangkap diarsipkan perusahaan.'
              : 'P3U/PPJB dicetak 2 (dua) rangkap dan dibubuhi meterai: satu rangkap dengan meterai tepat di atas Nama Perusahaan untuk diserahkan kepada konsumen, satu rangkap dengan meterai tepat di atas Nama Konsumen untuk arsip perusahaan.'}
            {' '}Konsumen wajib memberikan paraf pada setiap halaman, dan seluruh penandatanganan diselesaikan
            paling lama 7 (tujuh) hari kalender.
          </div>)}

        {!resmi && (
          <div className="catatan">
            <b>Dokumen sementara.</b> Berlaku sebagai bukti awal sebelum data diverifikasi Admin Sales.
            Surat Pesanan dan PPJB resmi akan diterbitkan setelah verifikasi berkas dinyatakan lengkap.
          </div>
        )}

        {d.catatan && <div className="catatan" style={{ marginTop: 10 }}><b>Catatan:</b> {d.catatan}</div>}

        {resmi && (d.otorisasi || []).length > 0 && (
          <>
            <div className="sec">OTORISASI</div>
            <table className="otor">
              <thead><tr><th>Tindakan</th><th>Pemberi otorisasi</th><th>Waktu</th><th>Kode</th></tr></thead>
              <tbody>
                {d.otorisasi.map((o, i) => (
                  <tr key={i}>
                    <td>{NAMA_OTORISASI[o.jenis] || o.jenis}</td>
                    <td>
                      <span className="nm">{o.oleh}</span>{o.oleh_kode ? ' · ' + o.oleh_kode : ''}<br />
                      <span style={{ color: '#68766E' }}>
                        {JABATAN_OTOR[o.oleh_jabatan || o.jabatan] || o.jabatan}
                        {o.divisi ? ' — ' + o.divisi : ''}
                      </span>
                      {o.mewakili && <><br /><span style={{ color: '#8A6B1E', fontSize: 10.5 }}>
                        mewakili {o.mewakili}{o.mewakili_kode ? ' · ' + o.mewakili_kode : ''}</span></>}
                    </td>
                    <td>{o.diputus_at ? new Date(o.diputus_at).toLocaleString('id-ID',
                      { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td><span className="kode">{o.kode || '—'}</span></td>
                  </tr>))}
              </tbody>
            </table>
            <div className="catatan" style={{ marginTop: 10 }}>
              <b>Memeriksa keaslian.</b> Setiap kode otorisasi di atas dihitung dari isi keputusan itu sendiri
              dan tidak dapat dibuat ulang apabila datanya diubah. Keasliannya dapat dicocokkan kapan saja
              pada menu Otorisasi di Harmoni One dengan memasukkan kode tersebut.
            </div>
          </>
        )}

        <div className="ttd">
          <div>Konsumen<div className="garis">{d.nama_ktp || d.nama || '(…………………)'}</div></div>
          <div>{jenis === 'bast' ? 'Admin Project' : jenis === 'kuitansi' ? 'Collection' : resmi ? 'Admin Sales' : 'Sales / PIC'}
            <div className="garis">{jenis === 'kuitansi' ? d.pencetak : resmi ? (d.verif_by || '(…………………)') : (d.sales || '(…………………)')}</div></div>
          {resmi && jenis !== 'kuitansi' && <div>{jenis === 'bast' ? 'Estate Management' : 'Mengetahui'}
            <div className="garis">{jenis === 'bast' ? '(…………………)' : 'Manajemen'}</div></div>}
        </div>

        <div className="kaki">
          Dokumen ini diterbitkan otomatis oleh Harmoni One pada {terbilangTanggal()} oleh {d.pencetak}.<br />
          PT Cipta Harmoni Lestari — dokumen sah tanpa tanda tangan basah bila disertai nomor dokumen
          {resmi && (d.otorisasi || []).length > 0 ? ' dan kode otorisasi' : ''} di atas.
        </div>
      </div>
    </div>
  );
}
