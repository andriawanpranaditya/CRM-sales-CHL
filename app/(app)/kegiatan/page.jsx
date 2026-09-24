'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, fmtDate, todayISO } from '@/components/util';

const JENIS = ['Kanvasing', 'Open Table', 'Product Knowledge / Agent Gathering', 'Pameran & Event', 'Lainnya'];
const WARNA = { 'Kanvasing': '#23694A', 'Open Table': '#C9922E', 'Product Knowledge / Agent Gathering': '#28527A', 'Pameran & Event': '#B3402F', 'Lainnya': '#6B7A70' };
const KOSONG = { tgl: todayISO(), jenis: 'Kanvasing', project: '', lokasi: '', pic: '', jml_lead: '', biaya: '', catatan: '' };

export default function KegiatanPage() {
  const [tab, setTab] = useState('input');
  const [me, setMe] = useState(null);
  const [set, setSet] = useState({ project: [], sales: [] });
  const [rows, setRows] = useState(null);
  const [f, setF] = useState(KOSONG);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  // filter daftar
  const [fProj, setFProj] = useState('');
  const [fJenis, setFJenis] = useState('');
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('');

  const muat = () => Promise.all([api('/api/kegiatan'), api('/api/settings'), api('/api/auth/me')])
    .then(([k, s, u]) => { setRows(k); setSet(s); setMe(u); if (u.role === 'sales') setF(x => ({ ...x, pic: x.pic || u.name })); })
    .catch(e => toast(e.message));
  useEffect(() => { muat(); }, []); // eslint-disable-line

  const bisaInput = me && ['manager', 'markom', 'sales'].includes(me.role);
  const ff = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });

  async function simpan() {
    if (!f.lokasi.trim()) return toast('Lokasi / tempat wajib diisi');
    setBusy(true);
    try {
      if (editId) { await api('/api/kegiatan', { method: 'PATCH', body: JSON.stringify({ id: editId, ...f }) }); toast('Kegiatan diperbarui'); }
      else { await api('/api/kegiatan', { method: 'POST', body: JSON.stringify(f) }); toast('Kegiatan tersimpan ✅'); }
      setEditId(null);
      setF({ ...KOSONG, tgl: todayISO(), pic: me?.role === 'sales' ? me.name : '' });
      await muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function hapus(k) {
    if (!confirm(`Hapus kegiatan ${k.jenis} · ${k.lokasi} (${fmtDate(k.tgl)})?`)) return;
    try { await api('/api/kegiatan?id=' + k.id, { method: 'DELETE' }); toast('Kegiatan dihapus'); muat(); }
    catch (e) { toast(e.message); }
  }
  function mulaiEdit(k) {
    setEditId(k.id); setTab('input');
    setF({ tgl: String(k.tgl || '').slice(0, 10), jenis: k.jenis, project: k.project || '', lokasi: k.lokasi || '', pic: k.pic || '', jml_lead: k.jml_lead || '', biaya: k.biaya || '', catatan: k.catatan || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const daftar = useMemo(() => (rows || []).filter(k => {
    const t = String(k.tgl || '').slice(0, 10);
    return (!fProj || k.project === fProj) && (!fJenis || k.jenis === fJenis) && (!d1 || t >= d1) && (!d2 || t <= d2);
  }), [rows, fProj, fJenis, d1, d2]);
  const totLead = daftar.reduce((a, k) => a + (Number(k.jml_lead) || 0), 0);
  const totBiaya = daftar.reduce((a, k) => a + (Number(k.biaya) || 0), 0);

  if (!rows) return <div className="loading">Memuat…</div>;

  return (
    <>
      <div className="page-head"><div><h1>Kegiatan Sales</h1>
        <div className="sub">Kanvasing, open table, product knowledge &amp; event — data kegiatan tersimpan, foto dilampirkan saat membuat report</div></div>
        <div className="stamp"><b>{daftar.length}</b> kegiatan</div></div>

      <div className="form-tabs" style={{ marginBottom: 12 }}>
        {bisaInput && <button className={tab === 'input' ? 'active' : ''} onClick={() => setTab('input')}>1 · {editId ? 'Edit Kegiatan' : 'Input Kegiatan'}</button>}
        <button className={tab === 'daftar' ? 'active' : ''} onClick={() => setTab('daftar')}>2 · Daftar Kegiatan</button>
      </div>

      {tab === 'input' && bisaInput && (
        <div className="card">
          <div className="form-grid">
            <div className="field"><label>Tanggal</label><input type="date" {...ff('tgl')} /></div>
            <div className="field"><label>Jenis Kegiatan <span className="req">*</span></label>
              <select {...ff('jenis')}>{JENIS.map(j => <option key={j}>{j}</option>)}</select></div>
            <div className="field"><label>Project</label>
              <select {...ff('project')}><option value="">— pilih —</option>{(set.project || []).map(p => <option key={p}>{p}</option>)}</select></div>
            <div className="field"><label>Lokasi / Tempat <span className="req">*</span></label>
              <input {...ff('lokasi')} placeholder="contoh: AEON Mall BSD" /></div>
            <div className="field"><label>PIC / Peserta</label>
              <input {...ff('pic')} placeholder="nama sales yang ikut, pisahkan dengan koma" /></div>
            <div className="field"><label>Jumlah Lead Didapat</label>
              <input type="number" min="0" {...ff('jml_lead')} placeholder="0" /></div>
            <div className="field"><label>Biaya (Rp)</label>
              <input type="number" min="0" {...ff('biaya')} placeholder="opsional" />
              {Number(f.biaya) > 0 && Number(f.jml_lead) > 0 && <span className="hint">Biaya per lead: {fmtRp(Math.round(Number(f.biaya) / Number(f.jml_lead)))}</span>}</div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Catatan Hasil</label>
              <textarea rows={2} {...ff('catatan')} placeholder="hasil kegiatan, respon pengunjung, tindak lanjut…" /></div>
          </div>
          <div className="form-foot">
            <button className="btn btn-primary" onClick={simpan} disabled={busy}>{editId ? 'Simpan Perubahan' : 'Simpan Kegiatan'}</button>
            {editId && <button className="sort-btn" onClick={() => { setEditId(null); setF({ ...KOSONG, tgl: todayISO(), pic: me?.role === 'sales' ? me.name : '' }); }}>Batal edit</button>}
            <span className="hint">Foto kegiatan dilampirkan nanti saat membuat report Word/PDF — tidak disimpan di aplikasi.</span>
          </div>
        </div>
      )}

      {tab === 'daftar' && (<>
        <div className="fu-toolbar">
          <button className={'sort-btn' + (!fProj ? ' active' : '')} onClick={() => setFProj('')}>Semua Project</button>
          {(set.project || []).map(p => <button key={p} className={'sort-btn' + (fProj === p ? ' active' : '')} onClick={() => setFProj(p)}>{p}</button>)}
          <select className="sort-filter" value={fJenis} onChange={e => setFJenis(e.target.value)}>
            <option value="">Semua Jenis</option>{JENIS.map(j => <option key={j}>{j}</option>)}
          </select>
          <input type="date" className="sort-filter" style={{ marginLeft: 0 }} value={d1} onChange={e => setD1(e.target.value)} title="Dari tanggal" />
          <input type="date" className="sort-filter" style={{ marginLeft: 0 }} value={d2} onChange={e => setD2(e.target.value)} title="Sampai tanggal" />
        </div>

        <div className="kpi-grid" style={{ marginBottom: 12 }}>
          <div className="kpi"><div className="kpi-label">Total Kegiatan</div><div className="kpi-val" style={{ color: 'var(--green)' }}>{daftar.length}</div></div>
          <div className="kpi"><div className="kpi-label">Lead Didapat</div><div className="kpi-val" style={{ color: 'var(--brass)' }}>{totLead}</div></div>
          <div className="kpi"><div className="kpi-label">Total Biaya</div><div className="kpi-val" style={{ fontSize: 18 }}>{fmtRp(totBiaya)}</div></div>
          <div className="kpi"><div className="kpi-label">Biaya per Lead</div><div className="kpi-val" style={{ fontSize: 18 }}>{totLead ? fmtRp(Math.round(totBiaya / totLead)) : '—'}</div></div>
        </div>

        <div className="tbl-wrap tbl-compact"><table>
          <thead><tr><th>Tanggal</th><th>Jenis</th><th>Lokasi</th><th>Project</th><th>PIC</th><th className="num">Lead</th><th className="num">Biaya</th><th>Catatan</th><th>Aksi</th></tr></thead>
          <tbody>
            {daftar.length ? daftar.map(k => (
              <tr key={k.id}>
                <td data-label="Tanggal">{fmtDate(k.tgl)}</td>
                <td data-label="Jenis"><span className="badge" style={{ background: (WARNA[k.jenis] || '#6B7A70') + '22', color: WARNA[k.jenis] || '#6B7A70' }}>{k.jenis}</span></td>
                <td data-label="Lokasi"><b>{k.lokasi}</b></td>
                <td data-label="Project">{k.project || '—'}</td>
                <td data-label="PIC">{k.pic || '—'}</td>
                <td className="num" data-label="Lead"><b>{k.jml_lead || 0}</b></td>
                <td className="num" data-label="Biaya">{Number(k.biaya) ? fmtRp(k.biaya) : '—'}</td>
                <td data-label="Catatan">{k.catatan || '—'}</td>
                <td data-label="Aksi">
                  {me && (me.role === 'manager' || k.created_by === me.username) ? (
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => mulaiEdit(k)}>Edit</button>
                      <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)', borderColor: 'var(--red-soft)' }} onClick={() => hapus(k)}>Hapus</button>
                    </span>) : <span className="hint">—</span>}
                </td>
              </tr>)) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada kegiatan pada filter ini.</td></tr>}
          </tbody>
        </table></div>
      </>)}
      <Toast />
    </>
  );
}
