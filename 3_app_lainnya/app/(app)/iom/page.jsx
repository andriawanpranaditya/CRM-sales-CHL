'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp } from '@/components/util';

const JENIS = { dana_program: 'Dana program', komisi: 'Program komisi', hadiah: 'Hadiah',
  operasional: 'Operasional', pengadaan: 'Pengadaan barang/jasa', kebijakan: 'Usulan kebijakan',
  perizinan: 'Perizinan & legal', sdm: 'Kepegawaian',
  subsidi_dp_akad: 'KPR — Subsidi DP & Biaya Akad', bphtb_ajb: 'AJB — BPHTB & Biaya AJB',
  lainnya: 'Lainnya' };
const DIVISI_LIST = ['Sales & Marketing', 'HRGA', 'Finance', 'Legal', 'Project', 'Estate', 'IT', 'Umum'];
// Ikon sederhana per jenis berkas
const IKON = { pdf: '📕' };
const ikonFile = n => IKON[String(n).split('.').pop().toLowerCase()] || '📎';
const ukuranKB = b => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

const WARNA = ['#7A5A18', '#7A4E1F', '#8A2F2F', '#274E7A', '#5A3E7A', '#0A3B2E', '#3D6B2E', '#2F6E6A', '#12604B'];

export default function IomPage() {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('perlu');
  const [buka, setBuka] = useState(null);      // id IOM yang dibuka rinciannya
  const [log, setLog] = useState({});
  const [form, setForm] = useState(null);
  const [putusan, setPutusan] = useState(null); // { id, aksi }
  const [pilihFile, setPilihFile] = useState([]);   // berkas yang dipilih di form pengajuan
  const [lampiran, setLampiran] = useState({});     // daftar lampiran per IOM yang sudah dibuka
  const [alasan, setAlasan] = useState('');
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState('');

  const load = () => api('/api/iom').then(setD).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);
  if (gagal) return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2>Halaman IOM gagal dimuat</h2>
      <div className="note" style={{ marginBottom: 10 }}>{gagal}</div>
      <div className="hint">Bila pesan di atas menyebut kolom atau tabel yang tidak dikenal, struktur
        database belum diperbarui. Minta pengelola sistem menjalankan pembaruan database sekali,
        lalu muat ulang halaman ini.</div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }}
        onClick={() => window.location.reload()}>Muat ulang</button>
    </div>);
  if (!d) return <div className="loading">Memuat…</div>;

  const TAHAP = d.tahap;
  const info = n => TAHAP.find(t => t.no === Number(n)) || TAHAP[0];
  const me = d.me;
  const giliranSaya = i => {
    const pos = info(i.tahap).pic;
    if (!pos || i.status === 'Cair') return false;
    return me.jabatan === pos || me.role === 'manager';
  };
  const punyaSaya = i => i.pengaju_username === me.username || i.pengaju === me.name;

  let rows = d.rows;
  if (tab === 'perlu') rows = rows.filter(i => giliranSaya(i) || (i.revisi && punyaSaya(i)));
  else if (tab === 'saya') rows = rows.filter(punyaSaya);
  else if (tab === 'berjalan') rows = rows.filter(i => i.status !== 'Cair');
  else if (tab === 'cair') rows = rows.filter(i => i.status === 'Cair');

  async function lihatLog(i) {
    if (buka === i.id) return setBuka(null);
    setBuka(i.id);
    if (!log[i.id]) {
      try { const x = await api('/api/iom/' + i.id); setLog(v => ({ ...v, [i.id]: x.log })); }
      catch (e) { toast(e.message); }
    }
  }
  // Baca berkas menjadi base64 agar dapat dikirim melalui API
  const bacaFile = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('Gagal membaca ' + f.name));
    r.readAsDataURL(f);
  });

  async function unggahBerkas(iomId, files) {
    for (const f of files) {
      if (f.size > 4 * 1024 * 1024) { toast(f.name + ' melebihi 4 MB — dilewati'); continue; }
      const data = await bacaFile(f);
      await api('/api/iom/berkas', { method: 'POST',
        body: JSON.stringify({ iom_id: iomId, filename: f.name, mime: f.type, data }) });
    }
  }

  async function lihatLampiran(i) {
    if (lampiran[i.id]) return;
    try {
      const x = await api('/api/iom/berkas?iom_id=' + i.id);
      setLampiran(v => ({ ...v, [i.id]: x.rows }));
    } catch (e) { toast(e.message); }
  }

  async function tambahLampiran(i, files) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      await unggahBerkas(i.id, files);
      const x = await api('/api/iom/berkas?iom_id=' + i.id);
      setLampiran(v => ({ ...v, [i.id]: x.rows }));
      toast('Lampiran ditambahkan'); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  async function hapusLampiran(i, f) {
    if (!confirm('Hapus lampiran ' + f.filename + '?')) return;
    try {
      await api('/api/iom/berkas', { method: 'DELETE', body: JSON.stringify({ id: f.id }) });
      const x = await api('/api/iom/berkas?iom_id=' + i.id);
      setLampiran(v => ({ ...v, [i.id]: x.rows }));
      await load();
    } catch (e) { toast(e.message); }
  }

  async function ajukan() {
    setBusy(true);
    try {
      const r = await api('/api/iom', { method: 'POST', body: JSON.stringify(form) });
      if (pilihFile.length) await unggahBerkas(r.id, pilihFile);
      toast('IOM ' + r.no + ' diajukan — menunggu verifikasi kepala divisi');
      setForm(null); setPilihFile([]); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function putuskan() {
    setBusy(true);
    try {
      await api('/api/iom', { method: 'PATCH', body: JSON.stringify({ ...putusan, alasan }) });
      toast(putusan.aksi === 'tolak' ? 'IOM dikembalikan ke pengaju'
        : putusan.aksi === 'ajukan_ulang' ? 'IOM diajukan ulang' : 'Disetujui & diteruskan');
      setPutusan(null); setAlasan(''); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  const jml = k => (k === 'perlu' ? d.rows.filter(i => giliranSaya(i) || (i.revisi && punyaSaya(i))).length
    : k === 'saya' ? d.rows.filter(punyaSaya).length
    : k === 'cair' ? d.rows.filter(i => i.status === 'Cair').length
    : d.rows.filter(i => i.status !== 'Cair').length);

  return (
    <>
      <div className="page-head"><div><h1>IOM</h1>
        <div className="sub">Internal Office Memorandum — memo resmi antar divisi yang berjalan melalui jalur verifikasi dan persetujuan
          {me.jabatan ? ' · jabatan Anda: ' + (d.jabatan[me.jabatan] || me.jabatan) : ''}</div></div>
        <div className="stamp"><b>{jml('perlu')}</b> perlu tindakan</div></div>

      <div className="fu-toolbar">
        {[['perlu', 'Perlu tindakan saya'], ['saya', 'Pengajuan saya'], ['berjalan', 'Berjalan'], ['cair', 'Cair'], ['', 'Semua']]
          .map(([k, l]) => (
            <button key={k} className={'sort-btn tab-utama' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>
              {l}{k ? ' (' + jml(k) + ')' : ''}</button>))}
        <button className="btn btn-primary" style={{ width: 'auto', marginLeft: 'auto' }}
          onClick={() => setForm({ jenis: 'dana_program', divisi: me.divisi || 'Sales & Marketing', perihal: '', uraian: '', nominal: '', ref_budget: '' })}>
          + Buat IOM</button>
      </div>

      {form && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--brass)' }}>
          <h2>Buat IOM baru</h2>
          <div className="form-grid">
            <div className="field"><label>Jenis memo</label>
              <select value={form.jenis} onChange={e => setForm({ ...form, jenis: e.target.value })}>
                {Object.entries(JENIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="field"><label>Divisi pemohon</label>
              <select value={form.divisi} onChange={e => setForm({ ...form, divisi: e.target.value })}>
                {DIVISI_LIST.map(v => <option key={v} value={v}>{v}</option>)}
              </select></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Perihal</label>
              <input value={form.perihal} onChange={e => setForm({ ...form, perihal: e.target.value })}
                placeholder="mis. Komisi penjualan cluster tahap 2" /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Uraian kebutuhan</label>
              <input value={form.uraian} onChange={e => setForm({ ...form, uraian: e.target.value })}
                placeholder="Jelaskan maksud dan peruntukannya secara ringkas" /></div>
            <div className="field"><label>Nominal (Rp) — isi 0 bila tidak berkaitan dengan biaya</label>
              <input type="number" value={form.nominal} onChange={e => setForm({ ...form, nominal: e.target.value })}
                placeholder="45000000" /></div>
            <div className="field"><label>No. referensi anggaran (bila ada)</label>
              <input value={form.ref_budget} onChange={e => setForm({ ...form, ref_budget: e.target.value })}
                placeholder="mis. BGT-SM-2026-011" /></div>
          </div>
          {form.nominal > 0 && <div className="hint">Nominal: <b>{fmtRp(form.nominal)}</b></div>}

          <div className="field" style={{ marginTop: 4 }}>
            <label>Lampiran — berformat PDF, maks. 4 MB per berkas</label>
            <input type="file" multiple accept=".pdf,application/pdf"
              onChange={e => setPilihFile(Array.from(e.target.files || []))} />
            <div className="hint" style={{ marginTop: 5 }}>
              Dokumen Word atau Excel disimpan dulu sebagai PDF (Simpan Sebagai → PDF). PDF dipilih agar
              isinya tidak berubah dan keasliannya dapat dijamin lewat sidik digital pada lembar pengesahan.
            </div>
          </div>
          {pilihFile.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {pilihFile.map((f, i) => (
                <span key={i} className="badge" style={{ background: '#F1EFE6', color: '#4A5147' }}>
                  {ikonFile(f.name)} {f.name} · {ukuranKB(f.size)}</span>))}
              <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => setPilihFile([])}>Kosongkan</button>
            </div>)}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={ajukan}>Ajukan</button>
            <button className="sort-btn" onClick={() => setForm(null)}>Batal</button>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Setelah diajukan, IOM berjalan otomatis: Kepala Divisi → Budget Control → Project CEO → CFO → CEO → Finance → Treasury.
            Untuk memo tanpa biaya, pos Budget Control dan Treasury cukup meneruskan.
          </div>
        </div>
      )}

      {putusan && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--brass)' }}>
          <h2>{putusan.aksi === 'tolak' ? 'Kembalikan untuk revisi'
            : putusan.aksi === 'ajukan_ulang' ? 'Ajukan ulang IOM' : 'Setujui & teruskan'}</h2>
          <div className="field"><label>Alasan / catatan — tercatat pada jejak persetujuan</label>
            <input value={alasan} onChange={e => setAlasan(e.target.value)} autoFocus
              placeholder={putusan.aksi === 'tolak' ? 'Sebutkan yang perlu diperbaiki' : 'mis. Dokumen lengkap, anggaran tersedia'} /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className={'btn ' + (putusan.aksi === 'tolak' ? '' : 'btn-primary')}
              style={{ width: 'auto' }} disabled={busy || !alasan.trim()} onClick={putuskan}>
              {putusan.aksi === 'tolak' ? 'Kembalikan' : 'Kirim'}</button>
            <button className="sort-btn" onClick={() => { setPutusan(null); setAlasan(''); }}>Batal</button>
          </div>
        </div>
      )}

      {rows.map(i => {
        const t = info(i.tahap);
        const warna = i.revisi ? '#8A2F2F' : (WARNA[i.tahap - 1] || '#68766E');
        const telat = i.status !== 'Cair' && i.hari_di_pos > d.sla && !i.revisi;
        return (
          <div className="card" key={i.id} style={{ marginBottom: 12, borderLeft: '4px solid ' + warna }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ marginBottom: 2 }}>{i.no}
                  <span className="hint" style={{ fontWeight: 400 }}> · {JENIS[i.jenis] || i.jenis}</span></h2>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{i.perihal}</div>
                <div className="hint" style={{ marginTop: 2 }}>
                  {i.divisi} · diajukan {i.pengaju} · {fmtDate(i.created_at)}
                  {i.ref_budget ? ' · ' + i.ref_budget : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0A3B2E' }}>{fmtRp(i.nominal)}</div>
                <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 5, flexWrap: 'wrap' }}>
                  {telat && <span className="badge b-overdue">⚠ {i.hari_di_pos} hari di pos ini</span>}
                  <span className="badge" style={{ background: warna, color: '#fff' }}>
                    {i.revisi ? 'Perlu revisi' : i.status === 'Cair' ? 'Cair' : t.nama}</span>
                </div>
              </div>
            </div>

            {/* Jejak pos approval */}
            <div style={{ display: 'flex', gap: 3, margin: '12px 0 4px', flexWrap: 'wrap' }}>
              {TAHAP.filter(x => x.no < TAHAP.length).map(x => (
                <div key={x.no} title={x.no + '. ' + x.nama} style={{
                  flex: '1 1 30px', height: 7, borderRadius: 4,
                  background: i.status === 'Cair' || x.no < i.tahap ? '#12604B' : x.no === i.tahap ? warna : '#E5E3D8',
                }} />))}
            </div>
            <div className="hint" style={{ marginTop: 0 }}>
              {i.status === 'Cair' ? 'Selesai — dana telah dicairkan'
                : i.revisi ? 'Dikembalikan ke pengaju: ' + (i.catatan_revisi || '')
                : 'Menunggu ' + (d.jabatan[t.pic] || t.pic) + ' · ' + t.ringkas}
            </div>
            {i.uraian && <div className="hint" style={{ marginTop: 4 }}>{i.uraian}</div>}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              {giliranSaya(i) && !i.revisi && <>
                <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 15px' }}
                  onClick={() => { setPutusan({ id: i.id, aksi: 'setuju' }); setAlasan(''); }}>{t.aksi}</button>
                {i.tahap <= 6 && <button className="sort-btn"
                  onClick={() => { setPutusan({ id: i.id, aksi: 'tolak' }); setAlasan(''); }}>Tolak — kembalikan</button>}
              </>}
              {i.revisi && punyaSaya(i) && (
                <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 15px' }}
                  onClick={() => { setPutusan({ id: i.id, aksi: 'ajukan_ulang' }); setAlasan(''); }}>Perbaiki &amp; ajukan ulang</button>)}
              <button className="sort-btn" onClick={() => lihatLog(i)}>
                {buka === i.id ? 'Tutup jejak' : 'Jejak persetujuan'}</button>
              <button className="sort-btn" onClick={() => lihatLampiran(i)}>
                📎 Lampiran{i.jml_file > 0 ? ' (' + i.jml_file + ')' : ''}</button>
              <button className="sort-btn"
                onClick={() => window.open('/cetak-iom?id=' + i.id, '_blank')}>🖨 Lembar Pengesahan</button>
            </div>

            {lampiran[i.id] && (
              <div style={{ marginTop: 10, borderTop: '1px dashed var(--line)', paddingTop: 9 }}>
                <div className="hint" style={{ margin: '0 0 6px', fontWeight: 700 }}>Lampiran memo</div>
                {!lampiran[i.id].length && <div className="hint">Belum ada lampiran.</div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {lampiran[i.id].map(f => (
                    <span key={f.id} className="badge" style={{ background: '#F1EFE6', color: '#4A5147',
                      display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <a href={'/api/iom/berkas?id=' + f.id} target="_blank" rel="noreferrer"
                        style={{ color: '#0E4C3B', textDecoration: 'none', fontWeight: 700 }}>
                        {ikonFile(f.filename)} {f.filename}</a>
                      <span className="hint" style={{ margin: 0 }}>{ukuranKB(f.ukuran || 0)}</span>
                      {f.sidik && <span className="hint" style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace' }}
                        title="Sidik digital berkas">{f.sidik}</span>}
                      {(f.uploaded_by === me.name || me.role === 'manager') &&
                        <button onClick={() => hapusLampiran(i, f)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)', fontWeight: 700 }}>×</button>}
                    </span>))}
                </div>
                {(punyaSaya(i) || me.role === 'manager') && i.status !== 'Cair' && (
                  <label className="sort-btn" style={{ display: 'inline-block', marginTop: 9, cursor: 'pointer' }}>
                    + Tambah lampiran
                    <input type="file" multiple hidden disabled={busy}
                      accept=".pdf,application/pdf"
                      onChange={e => { tambahLampiran(i, Array.from(e.target.files || [])); e.target.value = ''; }} />
                  </label>)}
              </div>)}

            {buka === i.id && (
              <div style={{ marginTop: 10, borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
                {!(log[i.id] || []).length && <div className="hint">Memuat…</div>}
                {(log[i.id] || []).map(g => (
                  <div key={g.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)', fontSize: 13 }}>
                    <b>{g.pos}</b> — {g.keputusan}
                    <span className="hint"> · {g.oleh} · {fmtDate(g.created_at)}</span>
                    {g.alasan && <div className="hint" style={{ margin: 0 }}>{g.alasan}</div>}
                  </div>))}
              </div>)}
          </div>);
      })}
      {!rows.length && <div className="card"><div className="hint" style={{ margin: 0 }}>
        {tab === 'perlu' ? 'Tidak ada IOM yang menunggu tindakan Anda.' : 'Belum ada IOM pada saringan ini.'}
      </div></div>}
      <Toast />
    </>
  );
}
