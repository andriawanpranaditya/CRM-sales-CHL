'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

// Log Aktivitas — siapa login, siapa membuka halaman apa, siapa input/update/hapus data apa (khusus manager)
const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const geserHari = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const PERAN = { manager: 'Manager', admin: 'Admin', markom: 'Marcom', sales: 'Sales' };
const WARNA_AKSI = {
  Login: '#23694A', Logout: '#6B7A70', 'Login gagal': '#B3402F', Akses: '#28527A', Input: '#C9922E', Upload: '#C9922E', Impor: '#C9922E',
  Update: '#7A5A28', 'Oper ke Sales': '#7A5A28', 'Ganti password': '#7A5A28', Nonaktifkan: '#B3402F', 'Uji coba': '#6B7A70',
  Hapus: '#B3402F', 'Hapus SEMUA data': '#B3402F', Unduh: '#28527A',
};
const KATEGORI = [['', 'Semua aktivitas'], ['login', 'Login / Logout'], ['gagal', 'Login gagal'], ['akses', 'Akses halaman'], ['unduh', 'Unduh data'],
  ['input', 'Input data'], ['update', 'Update data'], ['hapus', 'Hapus data']];
const jam = w => new Date(w).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const relatif = w => {
  if (!w) return '—';
  const m = Math.round((Date.now() - new Date(w).getTime()) / 60000);
  if (m < 1) return 'baru saja'; if (m < 60) return m + ' menit lalu';
  const j = Math.round(m / 60); if (j < 24) return j + ' jam lalu';
  return Math.round(j / 24) + ' hari lalu';
};

export default function LogPage() {
  const [periode, setPeriode] = useState('hari');
  const [d1, setD1] = useState(hariIni());
  const [d2, setD2] = useState(hariIni());
  const [siapa, setSiapa] = useState('');
  const [kat, setKat] = useState('');
  const [cari, setCari] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  function pilihPeriode(p) {
    setPeriode(p);
    const h = hariIni();
    if (p === 'hari') { setD1(h); setD2(h); }
    else if (p === '7') { setD1(geserHari(h, -6)); setD2(h); }
    else if (p === '30') { setD1(geserHari(h, -29)); setD2(h); }
    else if (p === 'bulan') { setD1(h.slice(0, 8) + '01'); setD2(h); }
  }
  async function muat() {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ d1, d2, limit: '1500' });
      if (siapa) qs.set('user', siapa); if (kat) qs.set('kategori', kat); if (cari.trim()) qs.set('q', cari.trim());
      setData(await api('/api/log?' + qs.toString()));
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { muat(); }, [d1, d2, siapa, kat]); // eslint-disable-line

  const ringkas = data?.ringkas || [];
  const tot = useMemo(() => ringkas.reduce((a, r) => ({
    user: a.user + 1, login: a.login + r.n_login, akses: a.akses + r.n_akses, input: a.input + r.n_input,
    update: a.update + r.n_update, hapus: a.hapus + r.n_hapus, gagal: a.gagal + r.n_gagal,
  }), { user: 0, login: 0, akses: 0, input: 0, update: 0, hapus: 0, gagal: 0 }), [ringkas]);
  const tidakAktif = useMemo(() => {
    const ada = new Set(ringkas.map(r => r.username));
    return (data?.users || []).filter(u => u.active !== false && !ada.has(u.username));
  }, [data, ringkas]);

  function unduhCSV() {
    const rows = data?.rows || [];
    if (!rows.length) return toast('Tidak ada data untuk diunduh');
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const isi = [['Waktu (WIB)', 'Username', 'Nama', 'Peran', 'Aktivitas', 'Modul', 'Keterangan', 'Perangkat', 'IP'].map(esc).join(',')]
      .concat(rows.map(r => [jam(r.waktu), r.username, r.nama, PERAN[r.role] || r.role, r.aksi, r.modul, r.detail, r.perangkat, r.ip].map(esc).join(',')));
    const blob = new Blob(['\ufeff' + isi.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `log-aktivitas-crm_${d1}_sd_${d2}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <>
      <Toast />
      <div className="page-head"><div><h1>Log Aktivitas</h1>
        <div className="sub">Siapa login, siapa membuka halaman apa, dan siapa input / update / hapus data — tercatat otomatis per akun (waktu WIB, disimpan 400 hari)</div></div>
        <div className="stamp"><b>{(data?.rows || []).length}</b> catatan</div></div>

      <div className="fu-toolbar">
        {[['hari', 'Hari Ini'], ['7', '7 Hari'], ['30', '30 Hari'], ['bulan', 'Bulan Ini'], ['pilih', 'Pilih Tanggal']].map(([k, l]) => (
          <button key={k} className={'sort-btn' + (periode === k ? ' active' : '')} onClick={() => pilihPeriode(k)}>{l}</button>))}
        {periode === 'pilih' && (<>
          <input type="date" className="sort-filter" style={{ marginLeft: 0 }} value={d1} onChange={e => setD1(e.target.value)} title="Dari tanggal" />
          <input type="date" className="sort-filter" style={{ marginLeft: 0 }} value={d2} onChange={e => setD2(e.target.value)} title="Sampai tanggal" />
        </>)}
        <select className="sort-filter" value={siapa} onChange={e => setSiapa(e.target.value)}>
          <option value="">Semua pengguna</option>
          {(data?.users || []).map(u => <option key={u.username} value={u.username}>{u.name} ({PERAN[u.role] || u.role}){u.active === false ? ' — nonaktif' : ''}</option>)}
        </select>
        <select className="sort-filter" value={kat} onChange={e => setKat(e.target.value)}>
          {KATEGORI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="sort-filter" style={{ minWidth: 170 }} placeholder="Cari keterangan / ID lead…" value={cari}
          onChange={e => setCari(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') muat(); }} />
        <button className="sort-btn" onClick={muat} disabled={busy}>{busy ? 'Memuat…' : '⟳ Segarkan'}</button>
        <button className="sort-btn" onClick={unduhCSV}>⬇ CSV</button>
      </div>

      {!data ? <div className="loading">Memuat…</div> : (<>
        <div className="kpi-grid kpi-compact" style={{ marginBottom: 12 }}>
          <div className="kpi"><div className="kpi-label">Pengguna Aktif</div><div className="kpi-val" style={{ color: 'var(--green)' }}>{tot.user}</div></div>
          <div className="kpi"><div className="kpi-label">Login</div><div className="kpi-val">{tot.login}</div></div>
          <div className="kpi"><div className="kpi-label">Akses Halaman</div><div className="kpi-val" style={{ color: '#28527A' }}>{tot.akses}</div></div>
          <div className="kpi"><div className="kpi-label">Input</div><div className="kpi-val" style={{ color: 'var(--brass)' }}>{tot.input}</div></div>
          <div className="kpi"><div className="kpi-label">Update</div><div className="kpi-val">{tot.update}</div></div>
          <div className="kpi"><div className="kpi-label">Hapus</div><div className="kpi-val" style={{ color: 'var(--red)' }}>{tot.hapus}</div></div>
          <div className="kpi"><div className="kpi-label">Login Gagal</div><div className="kpi-val" style={{ color: tot.gagal ? 'var(--red)' : undefined }}>{tot.gagal}</div></div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Ringkasan per Pengguna <span className="hint">(periode terpilih — klik nama untuk melihat jejaknya)</span></h3>
          <div className="tbl-wrap tbl-compact"><table>
            <thead><tr><th>Pengguna</th><th>Peran</th><th>Terakhir Aktif</th><th>Login Terakhir</th><th className="num">Login</th><th className="num">Akses</th>
              <th className="num">Input</th><th className="num">Update</th><th className="num">Hapus</th><th>Perangkat Terakhir</th></tr></thead>
            <tbody>{ringkas.length ? ringkas.map(r => (
              <tr key={r.username} style={{ cursor: 'pointer' }} onClick={() => setSiapa(siapa === r.username ? '' : r.username)}>
                <td data-label="Pengguna"><b>{r.nama || r.username}</b> <span className="hint">@{r.username}</span>{r.n_gagal ? <div className="hint" style={{ color: 'var(--red)' }}>{r.n_gagal}× login gagal</div> : null}</td>
                <td data-label="Peran">{PERAN[r.role] || r.role || '—'}</td>
                <td data-label="Terakhir Aktif">{relatif(r.terakhir)}<div className="hint">{jam(r.terakhir)}</div></td>
                <td data-label="Login Terakhir">{r.login_terakhir ? jam(r.login_terakhir) : <span className="hint">— (sesi lama)</span>}</td>
                <td className="num" data-label="Login">{r.n_login}</td>
                <td className="num" data-label="Akses">{r.n_akses}</td>
                <td className="num" data-label="Input"><b>{r.n_input}</b></td>
                <td className="num" data-label="Update">{r.n_update}</td>
                <td className="num" data-label="Hapus" style={{ color: r.n_hapus ? 'var(--red)' : undefined }}>{r.n_hapus}</td>
                <td data-label="Perangkat">{r.perangkat || '—'}</td>
              </tr>))
              : <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada aktivitas pada periode ini.</td></tr>}</tbody>
          </table></div>
          {tidakAktif.length > 0 && <span className="hint">Tidak ada aktivitas pada periode ini: {tidakAktif.map(u => `${u.name} (${PERAN[u.role] || u.role}${u.terakhir_aktif ? ', terakhir ' + relatif(u.terakhir_aktif) : ', belum pernah tercatat'})`).join(' · ')}</span>}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Jejak Aktivitas {siapa ? <span className="hint">— {(data.users || []).find(u => u.username === siapa)?.name || siapa} <button className="sort-btn" style={{ padding: '1px 8px' }} onClick={() => setSiapa('')}>× semua</button></span> : null}</h3>
          <div className="tbl-wrap tbl-compact"><table>
            <thead><tr><th>Waktu (WIB)</th><th>Pengguna</th><th>Aktivitas</th><th>Modul</th><th>Keterangan</th><th>Perangkat</th></tr></thead>
            <tbody>{(data.rows || []).length ? data.rows.map(r => (
              <tr key={r.id}>
                <td data-label="Waktu" style={{ whiteSpace: 'nowrap' }}>{jam(r.waktu)}</td>
                <td data-label="Pengguna"><b>{r.nama || r.username || '—'}</b><div className="hint">{PERAN[r.role] || r.role || ''}</div></td>
                <td data-label="Aktivitas"><span className="badge" style={{ background: (WARNA_AKSI[r.aksi] || '#6B7A70') + '22', color: WARNA_AKSI[r.aksi] || '#6B7A70' }}>{r.aksi}</span></td>
                <td data-label="Modul">{r.modul || '—'}</td>
                <td data-label="Keterangan" style={{ maxWidth: 420 }}>{r.detail || '—'}</td>
                <td data-label="Perangkat"><span className="hint">{r.perangkat || '—'}{r.ip ? ' · ' + r.ip : ''}</span></td>
              </tr>))
              : <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Tidak ada catatan untuk filter ini.</td></tr>}</tbody>
          </table></div>
          {(data.rows || []).length >= 1500 && <span className="hint">Ditampilkan 1.500 catatan terbaru — persempit periode atau pilih pengguna untuk melihat lebih lengkap.</span>}
        </div>
      </>)}
    </>
  );
}
