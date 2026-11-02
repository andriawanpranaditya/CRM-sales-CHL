'use client';
import { useEffect, useState } from 'react';
import { api } from '@/components/util';
import { TEMPLATE } from '@/lib/alur';

const PERAN = { sales: 'Sales', adminsales: 'Admin Sales', collection: 'Collection & KPR',
  finance: 'Finance', project: 'Admin Project', estate: 'Estate', markom: 'Marcom', '-': '—' };
const WARNA = ['#7A5A18', '#7A4E1F', '#8A2F2F', '#5A3E7A', '#3D6B2E', '#0A3B2E', '#2F6E6A', '#68766E'];

// Syarat yang dijaga sistem sebelum berkas boleh diserahkan ke tahap berikutnya
const SYARAT = {
  1: ['Bukti transfer wajib diunggah', 'KTP konsumen wajib diunggah', 'Dokumen pendukung lain bila dipersyaratkan'],
  2: ['Mutasi rekening dikonfirmasi Finance (cross-check Booking Fee)', 'Data & berkas diverifikasi Admin Sales',
      'Surat Pesanan dan PPJB terbit otomatis'],
  3: ['Tanda tangan dan paraf konsumen dinyatakan lengkap', 'Batas tujuh hari kalender sejak dokumen terbit'],
  4: ['Manajemen mengesahkan Surat Pesanan dan PPJB'],
  5: ['Pembayaran mencapai 20% dari harga unit, ATAU akad kredit selesai'],
  6: ['Finance menyatakan Clear untuk Serah Terima'],
  7: ['Seluruh ceklis persiapan unit selesai', 'Tanggal serah terima sudah ditetapkan'],
  8: ['BAST sudah dicatat lewat tombol Catat Serah Terima'],
  9: ['Masa retensi selesai dan komplain tertangani'],
};
const DOKUMEN = {
  1: ['Tanda Terima Sementara (TTS)', 'Form Penjualan Sementara (FPS)'],
  2: ['Surat Pesanan (SP)', 'PPJB'],
  5: ['Kuitansi pembayaran'],
  8: ['Berita Acara Serah Terima (BAST)'],
};

export default function PanduanPage() {
  const [d, setD] = useState(null);
  const [me, setMe] = useState(null);
  useEffect(() => {
    Promise.all([api('/api/tahap?trx_id=0').catch(() => null), api('/api/auth/me')])
      .then(([t, u]) => { setD(t); setMe(u); }).catch(() => {});
  }, []);
  const TAHAP = (d && d.tahap) || [];

  return (
    <>
      <div className="page-head"><div><h1>Panduan Alur Penjualan</h1>
        <div className="sub">Urutan resmi berkas dari Reserved/Booking hingga pengelolaan Estate — inilah aturan yang dijalankan sistem</div></div></div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Prinsip dasar</h2>
        <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.75 }}>
          <li>Setiap berkas selalu <b>dipegang satu divisi</b>. Hanya divisi pemegang yang dapat menyerahkannya ke tahap berikutnya.</li>
          <li>Alur ini menjalankan <b>Kebijakan &amp; Prosedur Penjualan Produk Landed &amp; Komersial</b> yang berlaku — termasuk cross-check Booking Fee, batas tujuh hari penandatanganan, dan Sign Approval Manajemen.</li>
          <li>Penyerahan hanya diizinkan bila <b>syarat tahap terpenuhi</b>. Bila belum, sistem menolak dan menyebutkan alasannya.</li>
          <li>Berkas dapat <b>dikembalikan</b> ke divisi sebelumnya disertai alasan bila ada yang perlu diperbaiki.</li>
          <li>Setiap perpindahan <b>tercatat</b>: dari siapa, ke siapa, kapan, dengan catatan apa.</li>
          <li>Lonceng hanya berbunyi untuk hal yang menuntut tindakan. Pemantauan dilakukan di <b>Papan Alur</b>.</li>
        </ul>
      </div>

      {TAHAP.map(t => {
        const warna = WARNA[t.no - 1] || '#68766E';
        const punyaSaya = me && (t.pemegang === me.role || me.role === 'manager');
        return (
          <div className="card" key={t.no} style={{
            marginBottom: 10, borderLeft: '4px solid ' + warna,
            background: punyaSaya ? '#FBFAF4' : undefined,
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', background: warna, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0,
              }}>{t.no}</div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2 style={{ marginBottom: 2 }}>{t.nama}
                  {punyaSaya && <span className="badge" style={{ background: warna, color: '#fff', marginLeft: 8, fontSize: 11 }}>Divisi Anda</span>}
                </h2>
                <div className="hint" style={{ marginTop: 0 }}>
                  Dipegang <b>{PERAN[t.pemegang] || t.pemegang}</b> · {t.ringkas}</div>

                {SYARAT[t.no] && (
                  <div style={{ marginTop: 8 }}>
                    <div className="hint" style={{ margin: 0, fontWeight: 700 }}>Syarat sebelum diserahkan:</div>
                    <ul style={{ paddingLeft: 18, fontSize: 13, margin: '2px 0 0' }}>
                      {SYARAT[t.no].map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  </div>)}

                {DOKUMEN[t.no] && (
                  <div style={{ marginTop: 6 }}>
                    <span className="hint" style={{ fontWeight: 700 }}>Dokumen: </span>
                    {DOKUMEN[t.no].map((x, i) => (
                      <span key={i} className="badge" style={{ background: '#F4F1E6', color: '#6B531C', marginRight: 4 }}>{x}</span>))}
                  </div>)}

                {t.berikut && <div className="hint" style={{ marginTop: 6 }}>→ {t.berikut}</div>}
              </div>
            </div>
          </div>);
      })}

      {!TAHAP.length && <div className="card"><div className="hint" style={{ margin: 0 }}>Memuat panduan…</div></div>}

      <div className="card" style={{ marginTop: 4, marginBottom: 14 }}>
        <h2>Alur IOM — Internal Office Memorandum</h2>
        <div className="hint" style={{ marginTop: 0 }}>
          Memo resmi antar divisi — untuk pengajuan dana, pengadaan, usulan kebijakan, perizinan,
          kepegawaian, dan keperluan lain yang perlu persetujuan berjenjang. Jalur ini terpisah dari
          alur penjualan dan berjalan pada jabatan, bukan divisi operasional. Siapa pun boleh mengajukan:
        </div>
        <ol style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.8, marginTop: 8 }}>
          <li><b>Pembuatan IOM</b> — pemohon mengisi perihal, uraian, dan nominal bila berkaitan dengan biaya</li>
          <li><b>Verifikasi Divisi</b> — Kepala Divisi memastikan kebutuhan wajar</li>
          <li><b>Verifikasi Budget</b> — Budget Control mengunci alokasi anggaran</li>
          <li><b>Approval Project CEO</b> — kesesuaian dengan sasaran proyek</li>
          <li><b>Approval CFO</b> — kesiapan arus kas</li>
          <li><b>Approval CEO</b> — persetujuan akhir manajemen</li>
          <li><b>IOM Pencairan Dana</b> — Finance menyiapkan dokumen pencairan</li>
          <li><b>Eksekusi Pembayaran</b> — Treasury mencairkan dana</li>
        </ol>
        <div className="hint" style={{ marginTop: 8 }}>
          Setiap pos wajib menuliskan alasan keputusan, dan dapat mengembalikan IOM ke pengaju untuk revisi.
          IOM yang mengendap lebih dari 1 hari kerja di satu pos ditandai terlambat.
        </div>
      </div>

      <div className="card" style={{ marginTop: 4, marginBottom: 14 }}>
        <h2>Alur KPR &amp; AJB — Tim Collection</h2>
        <div className="hint" style={{ marginTop: 0 }}>
          Mengikuti SOP Tim Collection. Berjalan di dalam tahap 5 (Penagihan &amp; Proses Kredit) di atas — ceklisnya
          muncul otomatis di menu <b>Proses Divisi</b> begitu kontrak terverifikasi, dan nomor urut mengikuti jeda
          hari di bawah sebagai perkiraan pengingat (bukan SLA baku, dapat diisi ulang sesuai kebutuhan tim).
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 10 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="hint" style={{ fontWeight: 700, margin: 0 }}>Bagian 2 — Proses KPR <span className="badge" style={{ background: '#F4F1E6', color: '#6B531C', fontWeight: 400 }}>hanya skema KPR</span></div>
            <ol style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.85, marginTop: 6 }}>
              {TEMPLATE.collectionKPR.map((it, i) => <li key={i}>{it.judul.replace(/^KPR — /, '')}</li>)}
            </ol>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="hint" style={{ fontWeight: 700, margin: 0 }}>Bagian 3 — Proses AJB <span className="badge" style={{ background: '#F4F1E6', color: '#6B531C', fontWeight: 400 }}>semua skema</span></div>
            <ol style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.85, marginTop: 6 }}>
              {TEMPLATE.collectionAJB.map((it, i) => <li key={i}>{it.judul.replace(/^AJB — /, '')}</li>)}
            </ol>
            <div className="hint" style={{ marginTop: 4 }}>Berlaku untuk kontrak KPR (setelah akad) maupun tunai (setelah lunas 100%) — dibuat sekaligus saat verifikasi.</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 4 }}>
        <h2>Berjalan paralel di luar rantai</h2>
        <div className="hint" style={{ marginTop: 0 }}>
          Beberapa divisi bekerja bersamaan sejak berkas terverifikasi, tanpa menahan perpindahan tahap:
        </div>
        <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.7, marginTop: 6 }}>
          <li><b>Marcom</b> — menyiapkan hadiah promo, tenggatnya otomatis mengikuti tanggal serah terima (H-7).</li>
          <li><b>Admin Sales</b> — mengajukan komisi begitu pembayaran mencapai 20% atau akad selesai.</li>
          <li><b>Finance</b> — menyetujui pembayaran komisi setelah disetujui Manager.</li>
        </ul>
      </div>
    </>
  );
}
