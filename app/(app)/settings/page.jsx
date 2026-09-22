'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

const LABELS = { status: 'Status Pipeline', sumber: 'Sumber Lead', project: 'Project', tipe: 'Tipe / Unit', tujuan: 'Tujuan Pembelian', bayar: 'Cara Pembayaran' };

export default function SettingsPage() {
  const [vals, setVals] = useState(null);
  const [units, setUnits] = useState({});
  const [projList, setProjList] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/settings').then(s => {
      const v = {}; Object.keys(LABELS).forEach(k => v[k] = (s[k] || []).join('\n'));
      setVals(v);
      setProjList(s.project || []);
      const u = {}; (s.project || []).forEach(p => u[p] = ((s.units || {})[p] || []).join('\n'));
      setUnits(u);
    }).catch(e => toast(e.message));
  }, []);

  async function simpan() {
    setBusy(true);
    try {
      const body = {}; Object.keys(LABELS).forEach(k => body[k] = vals[k].split('\n').map(x => x.trim()).filter(Boolean));
      body.units = {}; Object.keys(units).forEach(p => body.units[p] = units[p].split('\n').map(x => x.trim()).filter(Boolean));
      await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
      toast('Settings tersimpan — semua dropdown ter-update');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  if (!vals) return <div className="loading">Memuat…</div>;
  return (
    <>
      <div className="page-head"><div><h1>Settings</h1>
        <div className="sub">Master data dropdown — satu baris = satu pilihan. Semua form otomatis mengikuti.</div></div></div>
      <div className="note">Daftar <b>Sales / PIC</b> tidak lagi diatur di sini — otomatis mengikuti akun sales aktif di menu <b>Pengguna</b>.</div>
      <div className="set-grid">
        {Object.entries(LABELS).map(([k, label]) => (
          <div className="field" key={k}><label>{label}</label>
            <textarea value={vals[k]} onChange={e => setVals({ ...vals, [k]: e.target.value })} /></div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Blok / Unit per Project</h2>
        <div className="note">Daftar ini mengisi dropdown <b>Blok/Unit</b> di Form Booking dan penandaan di <b>Master Stock</b>. Satu baris = satu unit. Format: <b>Bio Ave 3 no.15</b> atau <b>Blok A4 no.15</b>. Daftar awal dibuat dari siteplan — silakan sesuaikan dengan stok resmi.</div>
        <div className="set-grid">
          {projList.map(p => (
            <div className="field" key={'unit-' + p}><label>{p} ({(units[p] || '').split('\n').filter(Boolean).length} unit)</label>
              <textarea style={{ minHeight: 260 }} value={units[p] || ''} onChange={e => setUnits({ ...units, [p]: e.target.value })} /></div>
          ))}
        </div>
      </div>

      <div className="form-foot">
        <button className="btn btn-primary" onClick={simpan} disabled={busy}>Simpan Settings</button>
      </div>

      <UkuranDatabase />

      <div className="card" style={{ marginTop: 18, borderColor: 'var(--red-soft)' }}>
        <h2 style={{ color: 'var(--red)' }}>Zona Berbahaya</h2>
        <div className="note" style={{ background: 'var(--red-soft)', borderColor: '#EAC2BA', color: 'var(--red)' }}>
          Menghapus SEMUA lead, follow up, dan transaksi dari database secara permanen. Akun pengguna &amp; settings tidak ikut terhapus. Sebaiknya <b>Download Excel</b> dulu di Dashboard sebagai arsip.
        </div>
        <button className="btn btn-danger" style={{ width: 'auto' }} onClick={async () => {
          const c = prompt('Ketik persis: HAPUS SEMUA\nuntuk menghapus seluruh data lead, follow up, dan transaksi.');
          if (c === null) return;
          try {
            const d = await api('/api/leads', { method: 'DELETE', body: JSON.stringify({ all: true, confirm: c }) });
            toast('Data terhapus: ' + d.terhapus.lead + ' lead, ' + d.terhapus.followup + ' FU, ' + d.terhapus.transaksi + ' transaksi');
          } catch (e) { toast(e.message); }
        }}>🗑 Hapus SEMUA Data (Clear)</button>
      </div>
      <Toast />
    </>
  );
}


// ===== Pantauan ukuran database (hanya baca) =====
const NAMA_TABEL = {
  leads: 'Lead', followups: 'Follow up', transactions: 'Transaksi', trx_files: 'Berkas KTP / Bukti Transfer',
  unit_manual: 'Tanda stok manual', unit_positions: 'Posisi titik peta', users: 'Pengguna', settings: 'Pengaturan',
  lead_assign: 'Riwayat serah terima lead',
};
function ukuran(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(2).replace('.', ',') + ' GB';
  if (b >= 1048576) return (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
  return Math.max(1, Math.round(b / 1024)) + ' KB';
}
function UkuranDatabase() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const muat = () => { setErr(''); fetch('/api/db-size', { cache: 'no-store' }).then(r => r.json()).then(x => x.error ? setErr(x.error) : setD(x)).catch(() => setErr('Gagal memuat')); };
  useEffect(() => { muat(); }, []);
  const maks = d ? Math.max(1, ...d.tabel.map(t => t.bytes)) : 1;
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Ukuran Database</h2>
      {err ? <span className="hint">{err}</span> : !d ? <span className="hint">Memuat…</span> : (<>
        <div className="hint" style={{ marginBottom: 10 }}>
          Total terpakai: <b style={{ fontSize: 16, color: 'var(--ink)' }}>{ukuran(d.total)}</b>
          {d.berkas ? <> · berkas lampiran <b>{d.berkas.jumlah}</b> file ({ukuran(d.berkas.bytes)})</> : null}
          {' '}— bandingkan dengan batas penyimpanan paket Neon Anda (lihat dashboard Neon → Usage).
        </div>
        {d.tabel.map(t => (
          <div key={t.nama} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,220px) 1fr 90px', gap: 10, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>{NAMA_TABEL[t.nama] || t.nama}<span className="hint"> · ±{t.perkiraan_baris > 0 ? t.perkiraan_baris.toLocaleString('id-ID') : '0'} baris</span></span>
            <div style={{ background: '#EDEBE3', borderRadius: 6, height: 10, overflow: 'hidden' }}>
              <div style={{ width: Math.max(2, t.bytes / maks * 100) + '%', height: '100%', background: t.nama === 'trx_files' ? '#C9922E' : '#23694A', borderRadius: 6 }} /></div>
            <b style={{ fontSize: 13, textAlign: 'right' }}>{ukuran(t.bytes)}</b>
          </div>))}
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="sort-btn" onClick={muat}>↻ Perbarui</button>
          <span className="hint">Hanya pemantauan — tidak ada data yang dihapus otomatis. Berkas lampiran biasanya penyumbang terbesar.</span>
        </div>
      </>)}
    </div>
  );
}
