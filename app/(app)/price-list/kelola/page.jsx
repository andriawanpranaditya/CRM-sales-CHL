'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp } from '@/components/util';
import { BIO_PL, PERMAI_PL } from '@/lib/pricelist';
import { usePriceList, muatPriceList } from '@/components/usePriceList';

// ===== Update Price List (Manager & Admin) =====
// 1) Unduh template Excel berisi price list yang berlaku  2) ubah harga  3) upload → pratinjau perubahan  4) terapkan
export default function KelolaPriceList() {
  const plv = usePriceList();
  const [me, setMe] = useState(null);
  const [riwayat, setRiwayat] = useState([]);
  const [pra, setPra] = useState(null);
  const [namaFile, setNamaFile] = useState('');
  const [catatan, setCatatan] = useState('');
  const [busy, setBusy] = useState('');
  const muatRiwayat = () => api('/api/pricelist?riwayat=1').then(r => setRiwayat(r.riwayat || [])).catch(e => toast(e.message));
  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => {}); muatRiwayat(); }, []);

  async function unduhTemplate() {
    setBusy('template');
    try {
      const r = await fetch('/api/pricelist?template=1');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Gagal membuat template');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = `Template Price List CRM ${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('Template terunduh — ubah harga yang berubah, lalu upload kembali');
    } catch (e) { toast(e.message); } finally { setBusy(''); }
  }
  function pilihFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return toast('Gunakan file Excel .xlsx dari template');
    if (f.size > 5 * 1024 * 1024) return toast('File terlalu besar (maks. 5 MB)');
    setNamaFile(f.name); setPra(null); setBusy('baca');
    const rd = new FileReader();
    rd.onload = async () => {
      try { setPra(await api('/api/pricelist', { method: 'POST', body: JSON.stringify({ aksi: 'pratinjau', file: rd.result }) })); }
      catch (err) { toast(err.message); } finally { setBusy(''); }
    };
    rd.onerror = () => { setBusy(''); toast('File tidak bisa dibaca'); };
    rd.readAsDataURL(f);
  }
  async function terapkan() {
    if (!pra || pra.salah.length) return;
    if (!confirm(`Terapkan price list baru?\n\n${pra.perubahan.length} perubahan akan langsung dipakai di menu Price List, Simulasi Cara Bayar, dan pesan follow up semua pengguna.`)) return;
    setBusy('simpan');
    try {
      await api('/api/pricelist', { method: 'POST', body: JSON.stringify({ aksi: 'simpan', data: pra.data, catatan }) });
      await muatPriceList(true);
      setPra(null); setNamaFile(''); setCatatan(''); muatRiwayat();
      toast('Price list baru diterapkan ✅');
    } catch (e) { toast(e.message); } finally { setBusy(''); }
  }
  async function kembalikan(v) {
    if (!confirm(`Kembalikan price list ke versi #${v.id}?\n${v.catatan || ''}`)) return;
    setBusy('kembali' + v.id);
    try { await api('/api/pricelist', { method: 'POST', body: JSON.stringify({ aksi: 'kembalikan', id: v.id }) }); await muatPriceList(true); muatRiwayat(); toast('Versi #' + v.id + ' dipakai kembali'); }
    catch (e) { toast(e.message); } finally { setBusy(''); }
  }

  if (!me || !plv) return <><Toast /><div className="loading">Memuat…</div></>;
  if (!['manager', 'admin'].includes(me.role)) return <><Toast /><p className="hint">Halaman ini khusus Manager &amp; Admin.</p></>;
  const tampil = v => typeof v === 'number' ? (v >= 100000 ? fmtRp(v) : v.toLocaleString('id-ID')) : String(v ?? '');
  return (
    <>
      <Toast />
      <div className="page-head"><div><h1>Update Price List</h1>
        <div className="sub">Perubahan harga langsung dipakai menu Price List, Simulasi Cara Bayar, dan pesan rekomendasi follow up — tanpa ubah kode</div></div>
        <Link href="/price-list" className="sort-btn">‹ Kembali ke Price List</Link></div>

      <div className="card">
        <b>Price list berlaku</b>
        <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.7 }}>
          Bio District: <b>{BIO_PL.tanggal}</b> · Permai Indah: <b>{PERMAI_PL.tanggal}</b><br />
          <span className="hint">{plv.bawaan ? 'Masih memakai price list bawaan aplikasi.' : `Diperbarui ${plv.oleh} · ${new Date(plv.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${plv.catatan ? ' · ' + plv.catatan : ''}`}</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <b>Langkah 1 — Unduh template</b>
        <p className="hint" style={{ margin: '4px 0 10px' }}>Template berisi price list yang berlaku sekarang (tipe, unit irreguler, cicilan, promo, cara bayar, catatan, Permai). Ubah hanya yang berubah.</p>
        <button className="btn btn-primary" disabled={busy === 'template'} onClick={unduhTemplate}>{busy === 'template' ? 'Menyiapkan…' : '⬇ Unduh template Excel'}</button>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <b>Langkah 2 — Upload price list baru</b>
        <p className="hint" style={{ margin: '4px 0 10px' }}>Upload file .xlsx hasil langkah 1. Perubahan ditampilkan dulu — belum ada yang berubah sebelum Anda menekan Terapkan.</p>
        <label className="btn" style={{ cursor: 'pointer', display: 'inline-block' }}>
          {busy === 'baca' ? 'Membaca file…' : '⬆ Pilih file Excel'}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pilihFile} style={{ display: 'none' }} />
        </label>
        {namaFile && <span className="hint" style={{ marginLeft: 8 }}>{namaFile}</span>}

        {pra && <div style={{ marginTop: 12 }}>
          {pra.salah.length > 0 && <div className="note" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
            <b>Perbaiki dulu di Excel ({pra.salah.length}):</b><ul style={{ margin: '4px 0 0 18px' }}>{pra.salah.slice(0, 30).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {pra.peringatan.length > 0 && <div className="note" style={{ marginTop: 8 }}>
            <b>Periksa ({pra.peringatan.length}):</b><ul style={{ margin: '4px 0 0 18px' }}>{pra.peringatan.slice(0, 30).map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          <div style={{ marginTop: 10 }}><b>{pra.perubahan.length ? `${pra.perubahan.length} perubahan` : 'Tidak ada perubahan dibanding price list berlaku'}</b></div>
          {pra.perubahan.length > 0 && <div className="tbl-wrap tbl-compact" style={{ marginTop: 6, maxHeight: 420, overflow: 'auto' }}><table>
            <thead><tr><th>Bagian</th><th>Lama</th><th>Baru</th></tr></thead>
            <tbody>{pra.perubahan.slice(0, 400).map((x, i) => <tr key={i}><td>{x.label}</td><td className="hint">{tampil(x.lama)}</td><td><b>{tampil(x.baru)}</b></td></tr>)}</tbody>
          </table></div>}
          <div className="field" style={{ marginTop: 10 }}><label>Catatan versi (opsional)</label>
            <input value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="mis. Price list Bio 1 November 2026 — kenaikan harga 3%" /></div>
          <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={!!pra.salah.length || !pra.perubahan.length || busy === 'simpan'} onClick={terapkan}>
            {busy === 'simpan' ? 'Menerapkan…' : '✅ Terapkan price list baru'}</button>
        </div>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <b>Riwayat versi</b>
        <div className="tbl-wrap tbl-compact" style={{ marginTop: 6 }}><table>
          <thead><tr><th>#</th><th>Waktu</th><th>Oleh</th><th>Bio · Permai</th><th>Catatan</th><th></th></tr></thead>
          <tbody>{riwayat.length ? riwayat.map((v, i) => (
            <tr key={v.id}><td>{v.id}</td><td>{new Date(v.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              <td>{v.oleh}</td><td>{v.tgl_bio || '-'} · {v.tgl_permai || '-'}</td><td>{v.catatan}</td>
              <td>{i === 0 ? <span className="badge b-close">BERLAKU</span> : <button className="sort-btn" disabled={busy === 'kembali' + v.id} onClick={() => kembalikan(v)}>Kembalikan</button>}</td></tr>))
            : <tr><td colSpan={6} className="hint">Belum ada versi tersimpan — saat ini memakai price list bawaan aplikasi.</td></tr>}</tbody>
        </table></div>
      </div>
    </>
  );
}
