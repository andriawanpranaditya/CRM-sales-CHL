'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/components/util';
import { ROLE_INFO } from '@/components/Shell';

// Beranda per pengguna: sapaan, angka kunci peran, daftar yang perlu dikerjakan hari ini
// (merah = terlambat, kuning = segera), pemberitahuan belum dibaca, dan pintasan menu.
const NADA = { merah: { bg: '#FBEAEA', fg: '#8A2F2F', garis: '#C24545' }, kuning: { bg: '#FFF6E0', fg: '#7A5A18', garis: '#C9962B' }, hijau: { bg: '#E8F3EE', fg: '#12604B', garis: '#12604B' }, '': { bg: '#fff', fg: '#1B211A', garis: 'var(--line)' } };
const PINTASAN = {
  sales: [['/form', '✎', 'Form Input'], ['/booking', '✓', 'Reserved & Booking'], ['/stock', '🗺', 'Master Stock'], ['/kpr', '🧮', 'Simulasi Cara Bayar']],
  markom: [['/form', '✎', 'Form Input'], ['/leads', '☰', 'Database Lead'], ['/janjian', '📅', 'Janjian & Visitor'], ['/kegiatan', '📣', 'Kegiatan']],
  adminsales: [['/verifikasi', '✔', 'Verifikasi'], ['/booking', '✓', 'Reserved & Booking'], ['/komisi', '💰', 'Komisi Sales'], ['/data', '▦', 'Data Bersama']],
  collection: [['/piutang', '💳', 'Piutang'], ['/kontrol-proses', '🏦', 'KPR & AJB'], ['/proses', '⛭', 'Proses Divisi'], ['/data', '▦', 'Data Bersama']],
  finance: [['/verifikasi', '✔', 'Verifikasi'], ['/piutang', '💳', 'Piutang'], ['/komisi', '💰', 'Komisi Sales'], ['/iom', '📝', 'IOM']],
  project: [['/proses', '⛭', 'Proses Divisi'], ['/alur', '⇉', 'Papan Alur'], ['/stock', '🗺', 'Master Stock'], ['/data', '▦', 'Data Bersama']],
  estate: [['/proses', '⛭', 'Proses Divisi'], ['/alur', '⇉', 'Papan Alur'], ['/stock', '🗺', 'Master Stock'], ['/data', '▦', 'Data Bersama']],
  admin: [['/dashboard', '◧', 'Dashboard'], ['/booking', '✓', 'Reserved & Booking'], ['/piutang', '💳', 'Piutang'], ['/stock', '🗺', 'Master Stock']],
  administrator: [['/dashboard', '◧', 'Dashboard'], ['/alur', '⇉', 'Papan Alur'], ['/otorisasi', '🔐', 'Otorisasi'], ['/report', '▤', 'Report Sales']],
};
const tglPanjang = t => new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const tglPendek = t => (t ? new Date(String(t).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '');
function sapaan() {
  const j = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false }));
  return j < 11 ? 'Selamat pagi' : j < 15 ? 'Selamat siang' : j < 18 ? 'Selamat sore' : 'Selamat malam';
}

// ringkas = tampil di bawah Beranda penjualan: hanya daftar pekerjaan & pemberitahuan (tanpa sapaan, angka kunci, pintasan)
export default function BerandaDivisi({ ringkas = false }) {
  const [d, setD] = useState(null);
  const [galat, setGalat] = useState('');
  const [grup, setGrup] = useState('');
  const muat = () => api('/api/beranda-divisi').then(x => { setD(x); setGalat(''); }).catch(e => setGalat(e.message));
  useEffect(() => { muat(); const t = setInterval(muat, 120000); return () => clearInterval(t); }, []);

  if (galat && !d) return <div className="card"><b>Beranda belum dapat dimuat.</b><div className="hint">{galat}</div><button className="sort-btn" onClick={muat}>Coba lagi</button></div>;
  if (!d) return ringkas ? null : <div className="loading">Memuat…</div>;
  if (ringkas && !d.tindakan.length && !d.notifikasi.length) return null;
  const info = ROLE_INFO[d.role] || ROLE_INFO.sales;
  const grupList = [...new Set(d.tindakan.map(t => t.grup))];
  const daftar = d.tindakan.filter(t => !grup || t.grup === grup);
  const nMerah = d.tindakan.filter(t => t.nada === 'merah').length;

  return (
    <>
      {!ringkas && <><div className="page-head"><div>
        <h1>{sapaan()}, {String(d.nama || '').split(' ')[0]}</h1>
        <div className="sub">{tglPanjang(d.hari_ini)} · {info.label}{d.jabatan ? ' · ' + d.jabatan : ''}{d.divisi ? ' (' + d.divisi + ')' : ''}</div>
      </div></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
        {d.kpi.map((k, i) => { const n = NADA[k.nada || '']; return (
          <Link key={i} href={k.href || '#'} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ margin: 0, padding: '12px 14px', borderLeft: '4px solid ' + n.garis, background: n.bg, height: '100%' }}>
              <div className="hint" style={{ margin: 0, color: n.fg, fontWeight: 600 }}>{k.label}</div>
              <div style={{ fontSize: typeof k.nilai === 'string' && k.nilai.length > 10 ? 18 : 26, fontWeight: 800, color: n.fg, lineHeight: 1.25, marginTop: 2 }}>{k.nilai}</div>
              {k.catatan && <div className="hint" style={{ margin: '2px 0 0', fontSize: 11.5 }}>{k.catatan}</div>}
            </div>
          </Link>); })}
      </div>

      </>}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '2 1 420px', margin: 0 }}>
          <h2 style={{ marginBottom: 4 }}>Perlu dikerjakan {d.jumlah_tindakan ? <span className="hint" style={{ fontWeight: 400 }}>· {d.jumlah_tindakan}{nMerah ? ', ' + nMerah + ' terlambat' : ''}</span> : null}</h2>
          {grupList.length > 1 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 8px' }}>
            <button className={'sort-btn' + (!grup ? ' active' : '')} onClick={() => setGrup('')}>Semua</button>
            {grupList.map(g => <button key={g} className={'sort-btn' + (grup === g ? ' active' : '')} onClick={() => setGrup(g)}>{g} ({d.tindakan.filter(t => t.grup === g).length})</button>)}
          </div>}
          {!daftar.length && <div style={{ padding: '18px 4px', color: '#12604B', fontWeight: 600 }}>✓ Tidak ada pekerjaan yang menunggu. Semua tepat waktu.</div>}
          {daftar.map((t, i) => { const n = NADA[t.nada || '']; return (
            <Link key={i} href={t.href || '#'} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: n.garis, flex: '0 0 8px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.judul}</div>
                  <div className="hint" style={{ margin: 0, fontSize: 12 }}>{t.grup}{t.sub ? ' · ' + t.sub : ''}</div>
                </div>
                {t.tgl && <span style={{ fontSize: 12, fontWeight: 700, color: n.fg, whiteSpace: 'nowrap' }}>{t.tgl < d.hari_ini ? 'lewat ' : ''}{tglPendek(t.tgl)}</span>}
                <span className="hint" style={{ margin: 0 }}>›</span>
              </div>
            </Link>); })}
          {d.jumlah_tindakan > d.tindakan.length && <div className="hint" style={{ marginTop: 6 }}>Menampilkan {d.tindakan.length} teratas dari {d.jumlah_tindakan}.</div>}
        </div>

        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!ringkas && <div className="card" style={{ margin: 0 }}>
            <h2 style={{ marginBottom: 6 }}>Pintasan</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(PINTASAN[d.role] || PINTASAN.sales).map(([href, ico, label]) => (
                <Link key={href} href={href} className="sort-btn" style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-start', padding: '10px 10px', textDecoration: 'none' }}>
                  <span>{ico}</span><span style={{ fontSize: 13 }}>{label}</span></Link>))}
            </div>
          </div>}
          <div className="card" style={{ margin: 0 }}>
            <h2 style={{ marginBottom: 6 }}>Pemberitahuan {d.notifikasi_jumlah ? <span className="badge b-overdue">{d.notifikasi_jumlah} baru</span> : null}</h2>
            {!d.notifikasi.length && <div className="hint">Tidak ada pemberitahuan baru.</div>}
            {d.notifikasi.map(n => (
              <div key={n.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{n.judul}</div>
                {n.pesan && <div className="hint" style={{ margin: 0, fontSize: 12 }}>{n.pesan}</div>}
                <div className="hint" style={{ margin: 0, fontSize: 11 }}>{new Date(n.dibuat).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>))}
            {d.notifikasi_jumlah > 0 && <div className="hint" style={{ marginTop: 6 }}>Buka lonceng 🔔 di pojok atas untuk menandai sudah dibaca.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
