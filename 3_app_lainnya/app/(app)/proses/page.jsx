'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp } from '@/components/util';

const DIV_LIST = [
  ['collection', 'Collection & KPR'], ['finance', 'Finance'],
  ['project', 'Admin Project'], ['markom', 'Marcom'], ['estate', 'Estate'],
];

// Sisa hari menuju deadline -> label & warna
function tenggat(d, selesai) {
  if (selesai) return ['Selesai', '#DCEAE2', '#12604B'];
  if (!d) return ['Tanpa tenggat', '#EFEDE3', '#6B7265'];
  const h = Math.ceil((new Date(d) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (h < 0) return ['Terlambat ' + Math.abs(h) + " hari", '#F6DADA', '#8A2F2F'];
  if (h === 0) return ['Hari ini', '#FBE3D6', '#8A3F14'];
  if (h <= 7) return ['H-' + h, '#FBF0DA', '#7A5A18'];
  return ['H-' + h, '#E9EEE6', '#3D6B2E'];
}

export default function ProsesPage() {
  const [d, setD] = useState(null);
  const [me, setMe] = useState(null);
  const [divisi, setDivisi] = useState('');
  const [sembunyi, setSembunyi] = useState(true);
  const [edit, setEdit] = useState(null);
  const [jadwal, setJadwal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState('');

  const load = (dv) => api('/api/proses' + (dv ? '?divisi=' + dv : '')).then(setD).catch(e => toast(e.message));
  useEffect(() => {
    Promise.all([api('/api/proses'), api('/api/auth/me')])
      .then(([p, u]) => { setD(p); setMe(u); setDivisi(p.divisi || ''); }).catch(e => { toast(e.message); setGagal(e.message); });
  }, []);
  if (gagal) return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2>Halaman Proses Divisi gagal dimuat</h2>
      <div className="note" style={{ marginBottom: 10 }}>{gagal}</div>
      <div className="hint">Bila pesan di atas menyebut kolom atau tabel yang tidak dikenal, struktur
        database belum diperbarui. Minta pengelola sistem menjalankan pembaruan database sekali,
        lalu muat ulang halaman ini.</div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }}
        onClick={() => window.location.reload()}>Muat ulang</button>
    </div>);
  if (!d || !me) return <div className="loading">Memuat…</div>;

  const isMgr = me.role === 'administrator';
  const rows = sembunyi ? d.rows.filter(r => r.status !== 'Selesai') : d.rows;
  // Kelompokkan per transaksi supaya terlihat sebagai berkas per konsumen
  const grup = {};
  rows.forEach(r => { (grup[r.trx_id] = grup[r.trx_id] || []).push(r); });
  const belum = d.rows.filter(r => r.status !== 'Selesai').length;

  async function toggle(it) {
    try {
      await api('/api/proses', { method: 'PATCH', body: JSON.stringify({ id: it.id, aksi: 'toggle' }) });
      await load(divisi);
    } catch (e) { toast(e.message); }
  }
  async function simpan() {
    setBusy(true);
    try {
      await api('/api/proses', { method: 'PATCH', body: JSON.stringify(edit) });
      toast('Tersimpan'); setEdit(null); await load(divisi);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function aturJadwal() {
    if (!jadwal || !jadwal.tanggal) return;
    setBusy(true);
    try {
      await api('/api/proses', { method: 'PUT', body: JSON.stringify(jadwal) });
      toast('Jadwal serah terima tersimpan — Marcom, Sales & Estate diberi tahu');
      setJadwal(null); await load(divisi);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  // Cetak BAST: BAST biasa memakai format bawaan sampai Legal menetapkan redaksinya; kategori lain memakai templat
  const cetakBast = h => {
    const kat = h.bast_kategori || 'bast';
    return kat === 'bast' && !(d.templatTerisi || []).includes('bast')
      ? '/cetak?id=' + h.trx_id + '&jenis=bast' : '/cetak-bast?id=' + h.trx_id + '&dok=' + kat;
  };
  async function serahTerima(h) {
    const pilih = prompt('Kategori serah terima untuk ' + (h.nama || h.lead_code) + ' (' + (h.unit || '') + '):\n\n1 = BAST\n2 = BAST Pinjam Pakai\n3 = BAST Serah Terima Otomatis\n4 = BAST PPN DTP', '1');
    if (pilih === null) return;
    const kategori = { '1': 'bast', '2': 'pinjam_pakai', '3': 'sto', '4': 'ppn_dtp' }[pilih.trim()];
    if (!kategori) return toast('Pilih angka 1–4');
    if (!confirm('Catat serah terima unit ' + (h.nama || h.lead_code) + ' (' + (h.unit || '') + ')?\n\nBAST akan terbit dan unit resmi beralih ke pengelolaan Estate.')) return;
    setBusy(true);
    try {
      const r = await api('/api/serahterima', { method: 'POST', body: JSON.stringify({ trx_id: h.trx_id, kategori }) });
      toast('Serah terima tercatat (' + r.no_bast + ') — dokumen siap dicetak, Estate diberi tahu');
      await load(divisi);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  async function hapus(it) {
    if (!confirm('Hapus item "' + it.judul + '"?')) return;
    try { await api('/api/proses', { method: 'DELETE', body: JSON.stringify({ id: it.id }) }); await load(divisi); }
    catch (e) { toast(e.message); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Proses {d.label}</h1>
        <div className="sub">Daftar kerja per transaksi — tercipta otomatis saat Admin Sales memverifikasi penjualan</div></div>
        <div className="stamp"><b>{belum}</b> belum selesai</div></div>

      {isMgr && (
        <div className="fu-toolbar">
          <button className={'sort-btn' + (!divisi ? ' active' : '')}
            onClick={() => { setDivisi(''); load(''); }}>Semua Divisi</button>
          {DIV_LIST.map(([k, l]) => (
            <button key={k} className={'sort-btn' + (divisi === k ? ' active' : '')}
              onClick={() => { setDivisi(k); load(k); }}>{l}</button>))}
        </div>
      )}

      <div className="fu-toolbar">
        <button className={'sort-btn' + (sembunyi ? ' active' : '')} onClick={() => setSembunyi(v => !v)}>
          {sembunyi ? 'Sembunyikan yang selesai ✓' : 'Tampilkan semua'}
        </button>
      </div>

      {edit && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--brass)' }}>
          <h2>Ubah item — {edit.judul}</h2>
          <div className="form-grid">
            <div className="field"><label>Judul pekerjaan</label>
              <input value={edit.judul} onChange={e => setEdit({ ...edit, judul: e.target.value })} /></div>
            <div className="field"><label>Tenggat</label>
              <input type="date" value={edit.deadline || ''} onChange={e => setEdit({ ...edit, deadline: e.target.value })} /></div>
            <div className="field"><label>Nilai (Rp) — untuk tagihan / hadiah</label>
              <input type="number" value={edit.nilai || ''} onChange={e => setEdit({ ...edit, nilai: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Catatan</label>
              <input value={edit.catatan || ''} onChange={e => setEdit({ ...edit, catatan: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={simpan} disabled={busy}>Simpan</button>
            <button className="sort-btn" onClick={() => setEdit(null)}>Batal</button>
          </div>
        </div>
      )}

      {!Object.keys(grup).length && (
        <div className="card"><div className="hint" style={{ margin: 0 }}>
          Belum ada pekerjaan. Item muncul otomatis begitu Admin Sales memverifikasi transaksi baru.
        </div></div>)}

      {Object.entries(grup).map(([trxId, items]) => {
        const h = items[0];
        return (
          <div className="card" key={trxId} style={{ marginBottom: 12 }}>
            <h2 style={{ marginBottom: 2 }}>{h.nama || h.lead_code}
              <span className="hint" style={{ fontWeight: 400 }}> · {h.project} {h.unit} · {h.jenis}</span></h2>
            <div className="hint" style={{ marginTop: 0 }}>
              Sales: {h.sales || '—'} · Cara bayar: {h.bayar || '—'}
              {h.harga_unit > 0 ? ' · Nilai transaksi: ' + fmtRp(h.harga_unit) : ''}
              {h.tgl_serah_terima ? ' · Serah terima: ' + fmtDate(h.tgl_serah_terima) : ''}
              {isMgr ? ' · Divisi: ' + (DIV_LIST.find(x => x[0] === h.divisi) || [])[1] : ''}
            </div>
            {(me.role === 'project' || isMgr) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <label className="hint" style={{ margin: 0 }}>Tanggal serah terima:</label>
                <input type="date" defaultValue={h.tgl_serah_terima || ''} style={{ maxWidth: 170 }}
                  onChange={e => setJadwal({ trx_id: h.trx_id, tanggal: e.target.value })} />
                <button className="sort-btn" disabled={busy || !jadwal || jadwal.trx_id !== h.trx_id}
                  onClick={aturJadwal}>Simpan jadwal</button>
                <span className="hint" style={{ margin: 0 }}>Deadline ceklis &amp; hadiah Marcom otomatis menyesuaikan (H-7).</span>
              </div>)}
            {(me.role === 'collection' || me.role === 'finance' || isMgr) && ['collection', 'finance'].includes(h.divisi) && (
              <div style={{ marginTop: 8 }}>
                <button className="sort-btn" onClick={() => window.open('/cetak?id=' + h.trx_id + '&jenis=kuitansi', '_blank')}>
                  Cetak Kuitansi Pembayaran</button>
              </div>)}
            {(me.role === 'project' || isMgr) && h.divisi === 'project' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                {h.bast_at
                  ? <><span className="badge" style={{ background: '#DCEAE2', color: '#12604B' }}>
                      Serah terima selesai · {fmtDate(h.bast_at)}</span>
                    <span className="badge" style={{ background: '#F1EFE6', color: '#5B5B4B' }}>{{ pinjam_pakai: 'Pinjam Pakai', sto: 'Serah Terima Otomatis', ppn_dtp: 'PPN DTP' }[h.bast_kategori] || 'BAST'}{h.no_bast ? ' · ' + h.no_bast : ''}</span>
                    <button className="sort-btn" onClick={() => window.open(cetakBast(h), '_blank')}>Cetak BAST</button>
                    {h.bast_kategori === 'pinjam_pakai' && <button className="sort-btn" onClick={() => window.open('/cetak-bast?id=' + h.trx_id + '&dok=perjanjian_pinjam_pakai', '_blank')}>Perjanjian Pinjam Pakai</button>}
                    <button className="sort-btn" onClick={() => window.open('/cetak-bast?id=' + h.trx_id + '&dok=undangan', '_blank')}>Undangan</button>
                    <button className="sort-btn" onClick={() => window.open('/cetak-bast?id=' + h.trx_id + '&dok=surat_kuasa', '_blank')}>Surat Kuasa</button></>
                  : <><button className="btn btn-primary" style={{ width: 'auto', padding: '7px 14px' }}
                      disabled={busy} onClick={() => serahTerima(h)}>Catat Serah Terima (BAST)</button>
                    <span className="hint" style={{ margin: 0 }}>Seluruh ceklis persiapan wajib selesai lebih dulu.</span></>}
              </div>)}
            <div style={{ marginTop: 10 }}>
              {items.map(it => {
                const [lbl, bg, fg] = tenggat(it.deadline, it.status === 'Selesai');
                return (
                  <div key={it.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px',
                    borderBottom: '1px dashed var(--line)',
                  }}>
                    <input type="checkbox" checked={it.status === 'Selesai'} onChange={() => toggle(it)}
                      disabled={!d.boleh} style={{ marginTop: 3, width: 17, height: 17, accentColor: '#12604B' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ textDecoration: it.status === 'Selesai' ? 'line-through' : 'none',
                        color: it.status === 'Selesai' ? 'var(--muted)' : 'inherit', fontSize: 14 }}>{it.judul}</div>
                      {it.catatan && <div className="hint" style={{ margin: 0 }}>{it.catatan}</div>}
                      {it.nilai > 0 && <div className="hint" style={{ margin: 0 }}>{fmtRp(it.nilai)}</div>}
                      {it.selesai_by && <div className="hint" style={{ margin: 0 }}>✓ {it.selesai_by} · {fmtDate(it.selesai_at)}</div>}
                    </div>
                    <span className="badge" style={{ background: bg, color: fg, whiteSpace: 'nowrap' }}>{lbl}</span>
                    {d.boleh && <>
                      <button className="sort-btn" style={{ padding: '3px 8px' }}
                        onClick={() => setEdit({ id: it.id, judul: it.judul, deadline: it.deadline || '', nilai: it.nilai || '', catatan: it.catatan || '' })}>Ubah</button>
                      <button className="sort-btn" style={{ padding: '3px 8px', color: 'var(--red)' }}
                        onClick={() => hapus(it)}>×</button>
                    </>}
                  </div>);
              })}
            </div>
          </div>);
      })}
      <Toast />
    </>
  );
}
