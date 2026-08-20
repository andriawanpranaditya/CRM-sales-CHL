'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

const LABELS = { status: 'Status Pipeline', sumber: 'Sumber Lead', project: 'Project', tipe: 'Tipe / Unit', tujuan: 'Tujuan Pembelian', bayar: 'Cara Pembayaran' };

export default function SettingsPage() {
  const [vals, setVals] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/settings').then(s => {
      const v = {}; Object.keys(LABELS).forEach(k => v[k] = (s[k] || []).join('\n'));
      setVals(v);
    }).catch(e => toast(e.message));
  }, []);

  async function simpan() {
    setBusy(true);
    try {
      const body = {}; Object.keys(LABELS).forEach(k => body[k] = vals[k].split('\n').map(x => x.trim()).filter(Boolean));
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
      <div className="form-foot">
        <button className="btn btn-primary" onClick={simpan} disabled={busy}>Simpan Settings</button>
      </div>

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
