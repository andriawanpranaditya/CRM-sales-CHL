'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, waLink } from '@/components/util';
import InputRupiah from '@/components/InputRupiah';

// ===== Proses KPR — monitoring pengajuan KPR konsumen (Sales, Manager, CEO Project) =====
const TAHAP_URUT = ['Verifikasi & SLIK', 'Diajukan ke bank', 'Kumpul berkas', 'Analisa kredit', 'SP3K terbit / Ditolak'];
const KELAS = { berjalan: 'kp-run', sp3k: 'kp-ok', akad: 'kp-ok', selesai: 'kp-done', ditolak: 'kp-no', menunggu: 'kp-mute' };
const KELAS_TAHAP = { 'Diajukan': 'kp-run', 'Kumpul berkas': 'kp-wait', 'Analisa kredit': 'kp-run', 'SP3K terbit': 'kp-ok', 'Ditolak': 'kp-no', 'Tidak dilanjutkan': 'kp-mute' };
const tgl = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const relatif = n => n <= 0 ? 'hari ini' : n === 1 ? 'kemarin' : n + ' hari lalu';
const keBase64 = f => new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = gagal; r.readAsDataURL(f); });

function Langkah({ n, kategori }) {
  return <div className="kp-steps" aria-label={`${n} dari 5 tahap`}>{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= n ? (kategori === 'ditolak' ? 'f no' : ['akad', 'sp3k', 'selesai'].includes(kategori) ? 'f ok' : 'f') : ''} />)}</div>;
}
const labelStatus = r => r.status.kategori === 'selesai' ? `Done · akad ${tgl(r.akad_realisasi)}` : r.status.kategori === 'akad' ? `SP3K · rencana akad ${tgl(r.akad_tgl)}` : r.status.label;

export default function ProsesKprPage() {
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('berjalan');
  const [proj, setProj] = useState(''); // filter per project (Manager / CEO / Collection)
  const [projek, setProjek] = useState([]);
  const [cari, setCari] = useState('');
  const [pilih, setPilih] = useState(null);
  const [aturBerkas, setAturBerkas] = useState(null);
  const [leads, setLeads] = useState([]);
  const [baruLead, setBaruLead] = useState('');

  const muat = () => api('/api/kpr').then(setData).catch(e => toast(e.message));
  useEffect(() => {
    api('/api/auth/me').then(setMe).catch(() => {});
    api('/api/settings').then(s => setProjek(s.project || [])).catch(() => {});
    muat();
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setPilih(Number(id));
  }, []);
  useEffect(() => { if (me && me.role === 'sales') api('/api/leads').then(setLeads).catch(() => {}); }, [me]);

  const readOnly = me?.role === 'ceo'; // CEO hanya melihat
  const rows = (data?.rows || []).filter(r => !proj || r.project === proj);
  const jumlah = useMemo(() => ({
    berjalan: rows.filter(r => !r.batal && r.status.kategori === 'berjalan').length,
    sp3k: rows.filter(r => !r.batal && r.status.kategori === 'sp3k').length,
    akad: rows.filter(r => !r.batal && r.status.kategori === 'akad').length,
    selesai: rows.filter(r => !r.batal && r.status.kategori === 'selesai').length,
    ditolak: rows.filter(r => !r.batal && r.status.kategori === 'ditolak').length,
    batal: rows.filter(r => r.batal).length,
    menunggu: rows.filter(r => !r.batal && r.status.kategori === 'menunggu').length,
  }), [rows]);
  const tampil = rows.filter(r => (filter === 'batal' ? r.batal : !r.batal && r.status.kategori === filter))
    .filter(r => !cari.trim() || `${r.nama} ${r.lead_code} ${r.unit} ${r.sales} ${r.banks.map(b => b.bank).join(' ')}`.toLowerCase().includes(cari.toLowerCase()));

  async function buatBaru() {
    if (!baruLead) return toast('Pilih lead');
    try { const r = await api('/api/kpr', { method: 'POST', body: JSON.stringify({ jenis: 'baru', lead_code: baruLead }) }); toast('Kartu KPR dibuat'); setBaruLead(''); await muat(); setPilih(r.id); }
    catch (e) { toast(e.message); }
  }

  if (pilih) return <Detail id={pilih} me={me} kembali={() => { setPilih(null); muat(); }} />;

  return (
    <div className={readOnly ? 'kp-ro' : ''}>
      <Toast />
      <div className={'page-head' + (readOnly ? ' kp-ro-head' : '')}><div><h1>Proses KPR{readOnly ? <span className="hint" style={{ fontSize: 13, marginLeft: 8 }}>· hanya lihat</span> : null}</h1>
        <div className="sub">Pantau pengajuan KPR konsumen sejak Booking: Verifikasi &amp; SLIK → Diajukan ke bank → Kumpul berkas → Analisa kredit → SP3K terbit / Ditolak → akad</div></div>
        {me?.role === 'manager' && <button className="sort-btn" onClick={() => setAturBerkas(JSON.parse(JSON.stringify(data?.berkas || {})))}>⚙ Atur daftar berkas</button>}
      </div>
      {projek.length > 1 && me && me.role !== 'sales' && <div className="fu-toolbar" style={{ marginBottom: 10 }}>
        <span className="hint" style={{ fontWeight: 600 }}>Project:</span>
        <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua</button>
        {projek.map(p => <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>)}
      </div>}

      {aturBerkas && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Daftar berkas per profil pemohon <span className="hint">(satu berkas per baris)</span></h3>
          <div className="form-grid">
            {(data?.PROFIL || []).map(p => (
              <div className="field" key={p}><label>{p}</label>
                <textarea rows={8} value={(aturBerkas[p] || []).join('\n')} onChange={e => setAturBerkas({ ...aturBerkas, [p]: e.target.value.split('\n') })} /></div>))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" onClick={async () => {
              try { await api('/api/kpr', { method: 'PATCH', body: JSON.stringify({ jenis: 'atur_berkas', data: aturBerkas }) }); toast('Daftar berkas disimpan'); setAturBerkas(null); muat(); } catch (e) { toast(e.message); }
            }}>Simpan</button>
            <button className="sort-btn" onClick={() => setAturBerkas(null)}>Batal</button>
          </div>
        </div>)}

      <div className="fu-toolbar">
        {[['berjalan', 'Berjalan'], ['sp3k', 'SP3K (pilih akad)'], ['akad', 'Rencana akad'], ['selesai', 'Done'], ['ditolak', 'Ditolak'], ['menunggu', 'Menunggu Booking'], ['batal', 'Transaksi batal']].map(([k, l]) => (
          (!['batal', 'menunggu'].includes(k) || jumlah[k]) ? <button key={k} className={'sort-btn' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>{l} ({jumlah[k]})</button> : null))}
        <input className="sort-filter" placeholder="Cari nama / unit / bank…" value={cari} onChange={e => setCari(e.target.value)} style={{ minWidth: 180 }} />
      </div>

      {me?.role === 'sales' && (
        <div className="hint" style={{ margin: '0 0 12px' }}>Proses KPR mulai dihitung setelah Booking: kartu terbentuk otomatis saat Booking dengan cara bayar KPR.
          <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8, flexWrap: 'wrap' }}>
            <select className="sort-filter" value={baruLead} onChange={e => setBaruLead(e.target.value)}>
              <option value="">+ Buat manual untuk lead yang sudah Booking…</option>
              {leads.filter(l => !rows.some(r => r.lead_code === l.lead_code)).map(l => <option key={l.lead_code} value={l.lead_code}>{l.lead_code} — {l.nama}</option>)}
            </select>
            {baruLead && <button className="sort-btn active" onClick={buatBaru}>Buat</button>}
          </span>
        </div>)}

      {!data ? <div className="loading">Memuat…</div> : tampil.length ? (
        <div className="kp-list">
          {tampil.map(r => (
            <button key={r.id} className={'kp-card' + (['berjalan', 'sp3k', 'akad'].includes(r.status.kategori) && r.diam_hari > 3 ? ' diam' : '')} onClick={() => setPilih(r.id)}>
              <div className="kp-top"><div><b>{r.nama || r.lead_code}</b><div className="hint">{[r.project, r.unit, me?.role !== 'sales' ? r.sales : ''].filter(Boolean).join(' · ')}</div></div>
                <span className={'kp-pill ' + (KELAS[r.status.kategori] || 'kp-run')}>{labelStatus(r)}</span></div>
              <Langkah n={r.status.langkah} kategori={r.status.kategori} />
              <div className="kp-banks">{r.banks.length ? r.banks.map(b => (
                <div key={b.id}><span><b>{b.bank}</b>{b.ao_nama ? ' · AO ' + b.ao_nama : ''}</span><span className={'kp-pill sm ' + (KELAS_TAHAP[b.tahap] || '')}>{b.tahap}</span></div>))
                : <span className="hint">{r.slik_tgl ? 'SLIK selesai — belum diajukan ke bank' : 'Isi hasil Verifikasi & SLIK'}</span>}</div>
              <div className="kp-foot"><span className={r.berkas_ok >= r.berkas_total && r.berkas_total ? 'ok' : ''}>Berkas {r.berkas_ok}/{r.berkas_total} · {r.profil}</span>
                <span className={['berjalan', 'sp3k', 'akad'].includes(r.status.kategori) && r.diam_hari > 3 ? 'merah' : 'hint'}>update {relatif(r.diam_hari)}</span></div>
              {r.kendala && <div className="kp-kendala">Kendala: {r.kendala}</div>}
            </button>))}
        </div>) : <p className="hint">Belum ada konsumen di kelompok ini.</p>}
    </div>
  );
}

function Detail({ id, me, kembali }) {
  const [d, setD] = useState(null);
  const [k, setK] = useState(null);
  const [bankBaru, setBankBaru] = useState(null);
  const [akad, setAkad] = useState({ bank_id: '', akad_tgl: '', akad_catatan: '', akad_realisasi: '' });
  const [busy, setBusy] = useState(false);
  const muat = () => api('/api/kpr?id=' + id).then(x => {
    setD(x); setK(x.kpr);
    setAkad({ bank_id: x.kpr.akad_bank_id || '', akad_tgl: x.kpr.akad_tgl || '', akad_catatan: x.kpr.akad_catatan || '', akad_realisasi: x.kpr.akad_realisasi || '' });
  }).catch(e => { toast(e.message); });
  useEffect(() => { muat(); }, [id]); // eslint-disable-line

  if (!d || !k) return (<><Toast /><button className="sort-btn" onClick={kembali}>‹ Kembali</button><div className="loading">Memuat…</div></>);
  const daftar = d.berkas[k.profil] || [];
  const centang = Array.isArray(k.berkas) ? k.berkas : [];
  const sp3k = d.banks.filter(b => b.tahap === 'SP3K terbit' || b.id === k.akad_bank_id);
  const simpan = async (body, pesan) => {
    setBusy(true);
    try { await api('/api/kpr', { method: 'PATCH', body: JSON.stringify(body) }); toast(pesan || 'Tersimpan'); await muat(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <Toast />
      <button className="sort-btn" onClick={kembali} style={{ marginBottom: 10 }}>‹ Kembali ke daftar</button>
      <div className="kp-head">
        <b style={{ fontSize: 19 }}>{k.nama || k.lead_code}</b>
        <span>{[k.lead_code, k.proj, k.unit, d.trx ? `${d.trx.jenis} ${tgl(d.trx.tgl)}` : '', k.sales].filter(Boolean).join(' · ')}</span>
        <span className={'kp-pill ' + (KELAS[d.status.kategori] || 'kp-run')} style={{ alignSelf: 'flex-start' }}>{d.status.kategori === 'selesai' ? `Done · akad terealisasi ${tgl(k.akad_realisasi)}` : d.status.kategori === 'akad' ? `SP3K · rencana akad ${tgl(k.akad_tgl)}` : d.status.label}</span>
      </div>

      {d.status.kategori === 'menunggu' && <div className="note" style={{ marginBottom: 12 }}>Konsumen ini masih Reserved. Proses KPR baru dihitung berjalan setelah Booking — pengajuan ke bank bisa dimulai setelah transaksi naik ke Booking.</div>}
      <div className="kp-grid">
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Plafon &amp; tenor</h3>
          <div className="form-grid">
            <div className="field"><label>Plafon diajukan (Rp)</label><InputRupiah value={k.plafon ?? ''} onChange={e => setK({ ...k, plafon: e.target.value })} placeholder="mis. 1.850.000.000" />
              {k.plafon ? <span className="hint">{fmtRp(k.plafon)}</span> : null}</div>
            <div className="field"><label>Tenor (tahun)</label><input inputMode="numeric" value={k.tenor ?? ''} onChange={e => setK({ ...k, tenor: e.target.value.replace(/\D/g, '') })} /></div>
          </div>
          <button className="sort-btn active" disabled={busy} onClick={() => simpan({ jenis: 'kpr', id, plafon: k.plafon, tenor: k.tenor })}>Simpan</button>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>1 · Verifikasi &amp; SLIK {k.slik_tgl ? <span className="hint">✓ {tgl(k.slik_tgl)}</span> : null}</h3>
          <div className="form-grid">
            <div className="field"><label>Hasil</label><select value={k.slik_status || ''} onChange={e => setK({ ...k, slik_status: e.target.value })}>
              <option value="">— pilih —</option><option>Aman (kol 1)</option><option>Perlu perhatian (kol 2)</option><option>Bermasalah (kol 3–5)</option></select></div>
            <div className="field"><label>Tanggal cek</label><input type="date" value={k.slik_tgl || ''} onChange={e => setK({ ...k, slik_tgl: e.target.value })} /></div>
            <div className="field full"><label>Catatan</label><input value={k.slik_catatan || ''} onChange={e => setK({ ...k, slik_catatan: e.target.value })} /></div>
          </div>
          <span className="hint">Dicek sekali per konsumen, berlaku untuk semua bank.</span>
          <button className="sort-btn active" disabled={busy} onClick={() => simpan({ jenis: 'kpr', id, slik_status: k.slik_status, slik_tgl: k.slik_tgl, slik_catatan: k.slik_catatan })}>Simpan SLIK</button>
        </section>
      </div>

      <section className="card kp-sec" style={{ marginTop: 12 }}>
        <div className="bd-head"><h3 style={{ margin: 0 }}>Pengajuan ke bank ({d.banks.length})</h3>
          {!k.akad_bank_id && <button className="sort-btn" onClick={() => setBankBaru({ bank: '', ao_nama: '', ao_wa: '', cabang: '', tgl_ajukan: new Date().toISOString().slice(0, 10) })}>+ Tambah bank</button>}</div>
        <span className="hint">Konsumen boleh diajukan ke lebih dari satu bank. Tiap bank punya tahap, AO, kendala, dan dokumen hasilnya sendiri.</span>
        {bankBaru && (
          <div className="kp-bank baru">
            <div className="form-grid">
              <div className="field"><label>Bank</label><select value={bankBaru.bank} onChange={e => setBankBaru({ ...bankBaru, bank: e.target.value })}><option value="">— pilih —</option>{d.BANK_KPR.map(x => <option key={x}>{x}</option>)}</select></div>
              <div className="field"><label>Cabang</label><input value={bankBaru.cabang} onChange={e => setBankBaru({ ...bankBaru, cabang: e.target.value })} /></div>
              <div className="field"><label>Nama AO</label><input value={bankBaru.ao_nama} onChange={e => setBankBaru({ ...bankBaru, ao_nama: e.target.value })} /></div>
              <div className="field"><label>No. WA AO</label><input value={bankBaru.ao_wa} onChange={e => setBankBaru({ ...bankBaru, ao_wa: e.target.value })} /></div>
              <div className="field"><label>Tanggal diajukan</label><input type="date" value={bankBaru.tgl_ajukan} onChange={e => setBankBaru({ ...bankBaru, tgl_ajukan: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="sort-btn active" disabled={busy} onClick={async () => {
                setBusy(true);
                try { await api('/api/kpr', { method: 'POST', body: JSON.stringify({ jenis: 'bank', kpr_id: id, ...bankBaru }) }); toast('Pengajuan bank ditambahkan'); setBankBaru(null); await muat(); }
                catch (e) { toast(e.message); } finally { setBusy(false); }
              }}>Simpan pengajuan</button>
              <button className="sort-btn" onClick={() => setBankBaru(null)}>Batal</button>
            </div>
          </div>)}
        {d.banks.map(b => <KartuBank key={b.id} b={b} d={d} me={me} akadId={k.akad_bank_id} busy={busy} setBusy={setBusy} muat={muat} />)}
      </section>

      {(sp3k.length > 0 || k.akad_tgl || k.akad_realisasi) && (
        <section className="card kp-akad" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Akad {k.akad_realisasi ? <span className="kp-pill kp-done">Done</span> : null}</h3>
          <div className="form-grid">
            <div className="field"><label>Bank yang dipakai akad</label><select value={akad.bank_id} onChange={e => setAkad({ ...akad, bank_id: e.target.value })}>
              <option value="">{sp3k.length ? '— pilih bank ber-SP3K —' : '— bank belum dicatat (tambah pengajuan bank di atas) —'}</option>{sp3k.map(b => <option key={b.id} value={b.id}>{b.bank}{b.plafon_setuju ? ' · ' + fmtRp(b.plafon_setuju) : ''}</option>)}</select></div>
            <div className="field"><label>Rencana tanggal akad</label><input type="date" value={akad.akad_tgl} onChange={e => setAkad({ ...akad, akad_tgl: e.target.value })} /></div>
            <div className="field"><label>Tanggal realisasi akad</label><input type="date" disabled={!k.akad_bank_id && !k.akad_tgl} value={akad.akad_realisasi} onChange={e => setAkad({ ...akad, akad_realisasi: e.target.value })} />
              <span className="hint">{k.akad_bank_id || k.akad_tgl ? 'Isi setelah akad benar-benar terlaksana — status menjadi Done (Selesai di report)' : 'Aktif setelah rencana akad disimpan'}</span></div>
            <div className="field full"><label>Catatan akad</label><input value={akad.akad_catatan} onChange={e => setAkad({ ...akad, akad_catatan: e.target.value })} placeholder="lokasi, jam, notaris" /></div>
          </div>
          <span className="hint">Bank lain yang juga menerbitkan SP3K otomatis tercatat "Tidak dilanjutkan".</span>
          <button className="btn btn-primary" disabled={busy} onClick={() => simpan({ jenis: 'akad', id, ...akad, bank_id: Number(akad.bank_id) }, akad.akad_realisasi ? 'Akad terealisasi — KPR Done' : 'Rencana akad disimpan')}>{akad.akad_realisasi ? 'Simpan — tandai Done' : 'Simpan akad'}</button>
        </section>)}

      <div className="kp-grid" style={{ marginTop: 12 }}>
        <section className="card">
          <div className="bd-head"><h3 style={{ margin: 0 }}>Kelengkapan berkas</h3><b style={{ color: centang.filter(x => daftar.includes(x)).length >= daftar.length ? 'var(--green)' : 'var(--brass)' }}>{centang.filter(x => daftar.includes(x)).length}/{daftar.length}</b></div>
          <div className="field"><label>Profil pemohon</label>
            <div className="kp-seg">{d.PROFIL.map(p => <button key={p} aria-pressed={k.profil === p} onClick={() => setK({ ...k, profil: p, berkas: [] })}>{p}</button>)}</div></div>
          {daftar.map(x => (
            <label key={x} className="kp-ck"><input type="checkbox" checked={centang.includes(x)} onChange={() => setK({ ...k, berkas: centang.includes(x) ? centang.filter(y => y !== x) : [...centang, x] })} />{x}</label>))}
          <span className="hint">Satu set berkas per konsumen untuk semua bank; permintaan tambahan bank dicatat di kendala bank itu.</span>
          <button className="sort-btn active" disabled={busy} onClick={() => simpan({ jenis: 'kpr', id, profil: k.profil, berkas: centang })}>Simpan berkas</button>
        </section>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Catatan &amp; riwayat</h3>
          <div className="field"><label>Catatan update</label><textarea rows={3} value={k.catatan || ''} onChange={e => setK({ ...k, catatan: e.target.value })} /></div>
          <button className="sort-btn active" disabled={busy} onClick={() => simpan({ jenis: 'kpr', id, catatan: k.catatan })}>Simpan catatan</button>
          <div className="kp-log">{d.log.map((l, i) => (
            <div key={i}><span className="dot" /><div><b>{new Date(l.waktu).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · {l.isi}</b><div className="hint">{l.oleh}</div></div></div>))}</div>
        </section>
      </div>
    </>
  );
}

function KartuBank({ b, d, me, akadId, busy, setBusy, muat }) {
  const [f, setF] = useState({ ...b, tgl_ajukan: b.tgl_ajukan || '' });
  const [file, setFile] = useState(null);
  useEffect(() => { setF({ ...b, tgl_ajukan: b.tgl_ajukan || '' }); setFile(null); }, [b]);
  const hasil = f.tahap === 'SP3K terbit' || f.tahap === 'Ditolak';
  const kunci = b.tahap === 'Tidak dilanjutkan' || akadId === b.id;
  async function simpan() {
    setBusy(true);
    try {
      const body = { jenis: 'bank', id: b.id, bank: f.bank, ao_nama: f.ao_nama, ao_wa: f.ao_wa, cabang: f.cabang, tgl_ajukan: f.tgl_ajukan, tahap: f.tahap, kendala: f.kendala, plafon_setuju: f.plafon_setuju };
      if (file) body.dok = { nama: file.name, mime: file.type, data: await keBase64(file) };
      await api('/api/kpr', { method: 'PATCH', body: JSON.stringify(body) });
      toast(b.bank + ' diperbarui'); await muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  return (
    <div className={'kp-bank' + (akadId === b.id ? ' akad' : b.tahap === 'Tidak dilanjutkan' ? ' mute' : '')}>
      <div className="bd-head"><b style={{ fontSize: 15 }}>{b.bank}{akadId === b.id ? ' · ✓ dipilih untuk akad' : ''}</b>
        <span className={'kp-pill ' + (KELAS_TAHAP[b.tahap] || '')}>{b.tahap}</span></div>
      <div className="form-grid">
        <div className="field"><label>Nama AO</label><input disabled={kunci} value={f.ao_nama || ''} onChange={e => setF({ ...f, ao_nama: e.target.value })} /></div>
        <div className="field"><label>No. WA AO</label><input disabled={kunci} value={f.ao_wa || ''} onChange={e => setF({ ...f, ao_wa: e.target.value })} />
          {b.ao_wa && waLink(b.ao_wa) ? <a className="hint" href={waLink(b.ao_wa)} target="_blank" rel="noreferrer">Chat AO</a> : null}</div>
        <div className="field"><label>Cabang</label><input disabled={kunci} value={f.cabang || ''} onChange={e => setF({ ...f, cabang: e.target.value })} /></div>
        <div className="field"><label>Tanggal diajukan</label><input disabled={kunci} type="date" value={f.tgl_ajukan || ''} onChange={e => setF({ ...f, tgl_ajukan: e.target.value })} /></div>
        <div className="field"><label>Tahap di bank ini</label><select disabled={kunci} value={f.tahap} onChange={e => setF({ ...f, tahap: e.target.value })}>
          {['Diajukan', 'Kumpul berkas', 'Analisa kredit', 'SP3K terbit', 'Ditolak'].map(t => <option key={t}>{t}</option>)}</select></div>
        {f.tahap === 'SP3K terbit' && <div className="field"><label>Plafon disetujui (Rp)</label><InputRupiah disabled={kunci} value={f.plafon_setuju ?? ''} onChange={e => setF({ ...f, plafon_setuju: e.target.value })} /></div>}
        <div className="field full"><label>Kendala</label><input disabled={kunci} value={f.kendala || ''} onChange={e => setF({ ...f, kendala: e.target.value })} placeholder="kosongkan bila tidak ada" /></div>
      </div>
      <div className={'kp-upload' + (hasil ? '' : ' off')}>
        {b.ada_dok ? <a href={'/api/kpr?dok=' + b.id} target="_blank" rel="noreferrer">📄 {b.dok_nama}</a> : null}
        {hasil && !kunci ? (<label>{b.ada_dok ? 'Ganti' : 'Upload'} {f.tahap === 'Ditolak' ? 'surat penolakan' : 'SP3K'} (wajib)
          <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} /></label>)
          : !b.ada_dok ? <span>Upload SP3K / surat penolakan — aktif setelah tahap SP3K terbit atau Ditolak dipilih</span> : null}
        {file ? <span className="hint">{file.name}</span> : null}
      </div>
      {!kunci && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="sort-btn active" disabled={busy} onClick={simpan}>Simpan {b.bank}</button>
        {(me?.role === 'manager' || me?.role === 'sales') && !['SP3K terbit', 'Ditolak'].includes(b.tahap) && (
          <button className="sort-btn" style={{ color: 'var(--red)' }} disabled={busy} onClick={async () => {
            if (!confirm(`Hapus pengajuan ${b.bank}? (untuk salah input)`)) return;
            try { await api('/api/kpr?bank=' + b.id, { method: 'DELETE' }); toast('Dihapus'); muat(); } catch (e) { toast(e.message); }
          }}>Hapus</button>)}
      </div>}
    </div>
  );
}
