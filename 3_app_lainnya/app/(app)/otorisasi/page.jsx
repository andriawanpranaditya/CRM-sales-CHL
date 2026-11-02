'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp } from '@/components/util';
import PasswordInput from '@/components/PasswordInput';

const SB = {
  Menunggu:  { bg: '#FBF0DA', fg: '#7A5A18' },
  Disetujui: { bg: '#DEEDE5', fg: '#12604B' },
  Ditolak:   { bg: '#FBEDEC', fg: '#A5352F' },
};

export default function OtorisasiPage() {
  const [d, setD] = useState(null);
  const [gagal, setGagal] = useState('');
  const [tab, setTab] = useState('giliran');
  const [putus, setPutus] = useState(null);     // { id, keputusan }
  const [pin, setPin] = useState('');
  const [alasan, setAlasan] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState('');       // 'pin' | 'delegasi' | 'periksa'
  const [del, setDel] = useState(null);
  const [formDel, setFormDel] = useState(null);
  const [cek, setCek] = useState({ kode: '', hasil: null });
  const [formPin, setFormPin] = useState({ pin: '', ulang: '', lama: '', password: '' });

  const load = () => api('/api/otorisasi').then(setD).catch(e => { toast(e.message); setGagal(e.message); });
  useEffect(() => { load(); }, []);

  if (gagal) return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2>Halaman Otorisasi gagal dimuat</h2>
      <div className="note" style={{ marginBottom: 10 }}>{gagal}</div>
      <div className="hint">Bila pesan menyebut tabel atau kolom yang tidak dikenal, struktur database
        belum diperbarui. Minta Administrator menjalankan pembaruan database sekali.</div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }}
        onClick={() => window.location.reload()}>Muat ulang</button>
    </div>);
  if (!d) return <div className="loading">Memuat…</div>;

  const me = d.me;
  const giliran = d.rows.filter(r => d.giliranSaya.includes(r.id));
  const saya = d.rows.filter(r => r.diminta_oleh === me.name);
  const rows = tab === 'giliran' ? giliran
    : tab === 'saya' ? saya
    : tab === 'menunggu' ? d.rows.filter(r => r.status === 'Menunggu')
    : d.rows;

  async function putuskan() {
    setBusy(true);
    try {
      const r = await api('/api/otorisasi', { method: 'PATCH',
        body: JSON.stringify({ id: putus.id, keputusan: putus.keputusan, pin, alasan }) });
      toast(putus.keputusan === 'Disetujui'
        ? 'Disetujui — kode otorisasi ' + r.kode
        : 'Ditolak, pemohon diberi tahu');
      setPutus(null); setPin(''); setAlasan(''); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  async function simpanPin() {
    if (formPin.pin !== formPin.ulang) return toast('Ulangi PIN belum sama.');
    setBusy(true);
    try {
      await api('/api/otorisasi/pin', { method: 'POST', body: JSON.stringify(formPin) });
      toast('PIN otorisasi tersimpan'); setPanel(''); setFormPin({ pin: '', ulang: '', lama: '', password: '' }); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  async function bukaDelegasi() {
    setPanel('delegasi');
    if (!del) { try { setDel(await api('/api/otorisasi/delegasi')); } catch (e) { toast(e.message); } }
  }
  async function simpanDelegasi() {
    setBusy(true);
    try {
      await api('/api/otorisasi/delegasi', { method: 'POST', body: JSON.stringify(formDel) });
      toast('Delegasi tersimpan'); setFormDel(null); setDel(await api('/api/otorisasi/delegasi')); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function akhiriDelegasi(id) {
    if (!confirm('Akhiri delegasi ini sekarang?')) return;
    try {
      await api('/api/otorisasi/delegasi', { method: 'PATCH', body: JSON.stringify({ id }) });
      setDel(await api('/api/otorisasi/delegasi')); toast('Delegasi diakhiri');
    } catch (e) { toast(e.message); }
  }
  async function periksaKode() {
    try { setCek(v => ({ ...v, hasil: null })); const h = await api('/api/otorisasi/periksa?kode=' + encodeURIComponent(cek.kode));
      setCek(v => ({ ...v, hasil: h })); } catch (e) { toast(e.message); }
  }
  async function periksaRantai() {
    try { const h = await api('/api/otorisasi/periksa?rantai=1');
      toast(h.utuh ? '✓ Rantai jejak utuh — ' + h.total + ' catatan terverifikasi'
        : '⚠ ' + h.rusak.length + ' catatan tidak utuh dari ' + h.total);
      setCek(v => ({ ...v, hasil: { rantai: h } })); } catch (e) { toast(e.message); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Otorisasi</h1>
        <div className="sub">Persetujuan berjenjang yang menahan tindakan — {me.kode || 'tanpa kode'}
          {me.jabatan ? ' · ' + (d.jabatan[me.jabatan] || me.jabatan) : ''}
          {me.divisi ? ' · ' + me.divisi : ''}</div></div>
        <div className="stamp"><b>{giliran.length}</b> menunggu Anda</div></div>

      {!me.punyaPin && me.jabatan && (
        <div className="note" style={{ marginBottom: 14 }}>
          Anda memegang jabatan otorisasi namun belum menetapkan PIN. Otorisasi tidak dapat dilakukan
          sebelum PIN ditetapkan. <b>Tetapkan sekarang lewat tombol PIN Otorisasi.</b>
        </div>)}

      {d.delegasi.length > 0 && (
        <div className="note" style={{ marginBottom: 14, background: '#F3EFF8', borderColor: '#D8CCE8', color: '#5A3E7A' }}>
          Anda sedang memegang wewenang pengganti: {d.delegasi.map(x =>
            (d.jabatan[x.jabatan] || x.jabatan) + ' mewakili ' + x.pemberi_nama +
            ' (' + fmtDate(x.mulai) + ' – ' + fmtDate(x.selesai) + ')').join(' · ')}
        </div>)}

      <div className="fu-toolbar">
        {[['giliran', 'Menunggu keputusan saya (' + giliran.length + ')'],
          ['saya', 'Permintaan saya (' + saya.length + ')'],
          ['menunggu', 'Semua menunggu'], ['', 'Riwayat']].map(([k, l]) => (
          <button key={k} className={'sort-btn tab-utama' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <button className="sort-btn" onClick={() => setPanel(panel === 'pin' ? '' : 'pin')}>🔐 PIN Otorisasi</button>
          {(me.jabatan || me.role === 'administrator') &&
            <button className="sort-btn" onClick={bukaDelegasi}>👥 Delegasi</button>}
          <button className="sort-btn" onClick={() => setPanel(panel === 'periksa' ? '' : 'periksa')}>🔎 Periksa Keaslian</button>
        </span>
      </div>

      {panel === 'pin' && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--brass)' }}>
          <h2>{me.punyaPin ? 'Ubah PIN Otorisasi' : 'Tetapkan PIN Otorisasi'}</h2>
          <div className="hint">PIN enam angka, terpisah dari kata sandi login. Disimpan terenkripsi —
            tidak dapat dibaca siapa pun, termasuk Administrator. Wajib dimasukkan setiap kali mengotorisasi.</div>
          <div className="form-grid" style={{ marginTop: 10 }}>
            {me.punyaPin
              ? <div className="field"><label>PIN lama</label>
                  <PasswordInput value={formPin.lama} onChange={e => setFormPin({ ...formPin, lama: e.target.value })} /></div>
              : <div className="field"><label>Kata sandi akun (untuk memastikan ini Anda)</label>
                  <PasswordInput value={formPin.password} onChange={e => setFormPin({ ...formPin, password: e.target.value })} /></div>}
            <div className="field"><label>PIN baru (6 angka)</label>
              <PasswordInput value={formPin.pin} onChange={e => setFormPin({ ...formPin, pin: e.target.value })} /></div>
            <div className="field"><label>Ulangi PIN baru</label>
              <PasswordInput value={formPin.ulang} onChange={e => setFormPin({ ...formPin, ulang: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanPin}>Simpan PIN</button>
            <button className="sort-btn" onClick={() => setPanel('')}>Tutup</button>
          </div>
        </div>)}

      {panel === 'periksa' && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--brass)' }}>
          <h2>Periksa Keaslian Otorisasi</h2>
          <div className="hint">Masukkan kode otorisasi yang tercetak pada dokumen untuk memastikan
            siapa yang mengotorisasi dan apakah datanya masih utuh.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <input value={cek.kode} onChange={e => setCek({ ...cek, kode: e.target.value.toUpperCase() })}
              placeholder="mis. K7M2-9XQ4" style={{ maxWidth: 200, fontFamily: 'ui-monospace, Menlo, monospace' }} />
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={periksaKode}>Periksa</button>
            <button className="sort-btn" onClick={periksaRantai}>Uji keutuhan seluruh rantai jejak</button>
          </div>
          {cek.hasil && cek.hasil.rantai && (
            <div className="note" style={{ marginTop: 12,
              background: cek.hasil.rantai.utuh ? '#EDF3EF' : '#FBEDEC',
              borderColor: cek.hasil.rantai.utuh ? '#BBD3B5' : '#EED3D1',
              color: cek.hasil.rantai.utuh ? '#12604B' : '#A5352F' }}>
              {cek.hasil.rantai.utuh
                ? '✓ Seluruh ' + cek.hasil.rantai.total + ' catatan otorisasi utuh — tidak ada yang diubah atau dihapus.'
                : '⚠ ' + cek.hasil.rantai.rusak.length + ' catatan tidak utuh: ' +
                  cek.hasil.rantai.rusak.map(x => '#' + x.id + ' (' + x.sebab + ')').join('; ')}
            </div>)}
          {cek.hasil && cek.hasil.data && (
            <div className="card" style={{ marginTop: 12, background: cek.hasil.sah ? '#F7FBF8' : '#FDF5F4' }}>
              <div style={{ fontWeight: 700, color: cek.hasil.sah ? '#12604B' : '#A5352F', marginBottom: 8 }}>
                {cek.hasil.sah ? '✓ ' : '⚠ '}{cek.hasil.pesan}</div>
              <table><tbody>
                <tr><td style={{ color: 'var(--muted)', width: 180 }}>Tindakan</td><td><b>{cek.hasil.data.tindakan}</b></td></tr>
                <tr><td style={{ color: 'var(--muted)' }}>Keputusan</td><td>{cek.hasil.data.keputusan}
                  {cek.hasil.data.alasan ? ' — ' + cek.hasil.data.alasan : ''}</td></tr>
                <tr><td style={{ color: 'var(--muted)' }}>Diotorisasi oleh</td><td><b>{cek.hasil.data.oleh}</b>
                  {cek.hasil.data.oleh_kode ? ' (' + cek.hasil.data.oleh_kode + ')' : ''}
                  {cek.hasil.data.jabatan ? ' · ' + (d.jabatan[cek.hasil.data.jabatan] || cek.hasil.data.jabatan) : ''}</td></tr>
                {cek.hasil.data.mewakili && <tr><td style={{ color: 'var(--muted)' }}>Mewakili</td>
                  <td>{cek.hasil.data.mewakili} ({cek.hasil.data.mewakili_kode})</td></tr>}
                <tr><td style={{ color: 'var(--muted)' }}>Diminta oleh</td><td>{cek.hasil.data.diminta_oleh}
                  {cek.hasil.data.diminta_kode ? ' (' + cek.hasil.data.diminta_kode + ')' : ''}</td></tr>
                <tr><td style={{ color: 'var(--muted)' }}>Waktu</td><td>{fmtDate(cek.hasil.data.diputus_at)}</td></tr>
              </tbody></table>
            </div>)}
          {cek.hasil && !cek.hasil.data && !cek.hasil.rantai && (
            <div className="note" style={{ marginTop: 12, background: '#FBEDEC', borderColor: '#EED3D1', color: '#A5352F' }}>
              {cek.hasil.pesan}</div>)}
        </div>)}

      {panel === 'delegasi' && del && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--brass)' }}>
          <h2>Delegasi Wewenang</h2>
          <div className="hint">Dipakai bila Anda benar-benar tidak dapat mengotorisasi — aplikasi ini
            dapat dibuka dari ponsel, jadi delegasi hanya untuk keadaan yang tidak memungkinkan sama sekali.
            Otorisasi oleh pengganti selalu tercatat atas namanya sendiri, disertai keterangan mewakili siapa.</div>

          {!formDel ? (
            <button className="btn btn-primary" style={{ width: 'auto', marginTop: 10 }}
              onClick={() => setFormDel({ pengganti_id: '', mulai: '', selesai: '', alasan: '', pin: '',
                darurat: me.role === 'administrator' && !me.jabatan, pemberi_id: '' })}>
              + Tunjuk pengganti</button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div className="form-grid">
                {formDel.darurat && (
                  <div className="field"><label>Pejabat yang berhalangan</label>
                    <select value={formDel.pemberi_id} onChange={e => setFormDel({ ...formDel, pemberi_id: e.target.value })}>
                      <option value="">— pilih —</option>
                      {del.calon.filter(c => c.jabatan).map(c =>
                        <option key={c.id} value={c.id}>{c.name} — {d.jabatan[c.jabatan] || c.jabatan}{c.divisi ? ' · ' + c.divisi : ''}</option>)}
                    </select></div>)}
                <div className="field"><label>Pengganti</label>
                  <select value={formDel.pengganti_id} onChange={e => setFormDel({ ...formDel, pengganti_id: e.target.value })}>
                    <option value="">— pilih —</option>
                    {del.calon.map(c => <option key={c.id} value={c.id}>
                      {c.name} ({c.kode_petugas || '—'}){c.jabatan ? ' · ' + (d.jabatan[c.jabatan] || c.jabatan) : ''}</option>)}
                  </select></div>
                <div className="field"><label>Mulai</label>
                  <input type="date" value={formDel.mulai} onChange={e => setFormDel({ ...formDel, mulai: e.target.value })} /></div>
                <div className="field"><label>Selesai</label>
                  <input type="date" value={formDel.selesai} onChange={e => setFormDel({ ...formDel, selesai: e.target.value })} /></div>
                <div className="field" style={{ gridColumn: '1 / -1' }}><label>Alasan</label>
                  <input value={formDel.alasan} onChange={e => setFormDel({ ...formDel, alasan: e.target.value })}
                    placeholder="mis. cuti sakit, perjalanan dinas tanpa sinyal" /></div>
                {!formDel.darurat && (
                  <div className="field"><label>PIN Otorisasi Anda</label>
                    <PasswordInput value={formDel.pin} onChange={e => setFormDel({ ...formDel, pin: e.target.value })} /></div>)}
              </div>
              {formDel.darurat && <div className="note" style={{ marginTop: 8 }}>
                Delegasi darurat dibuka oleh Administrator dan tercatat sebagai kejadian khusus pada jejak audit.</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanDelegasi}>Simpan</button>
                <button className="sort-btn" onClick={() => setFormDel(null)}>Batal</button>
              </div>
            </div>)}

          <div className="tbl-wrap" style={{ marginTop: 14 }}><table>
            <thead><tr><th>Jabatan</th><th>Pemberi</th><th>Pengganti</th><th>Periode</th><th>Alasan</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {del.rows.map(x => {
                const berlaku = x.aktif && x.selesai >= new Date().toISOString().slice(0, 10);
                return (
                  <tr key={x.id}>
                    <td data-label="Jabatan">{d.jabatan[x.jabatan] || x.jabatan}{x.divisi ? ' · ' + x.divisi : ''}</td>
                    <td data-label="Pemberi">{x.pemberi_nama} <span className="hint">{x.pemberi_kode}</span></td>
                    <td data-label="Pengganti">{x.pengganti_nama} <span className="hint">{x.pengganti_kode}</span></td>
                    <td data-label="Periode">{fmtDate(x.mulai)} – {fmtDate(x.selesai)}</td>
                    <td data-label="Alasan">{x.alasan || '—'}{x.darurat ? ' · darurat oleh ' + (x.dibuka_oleh || '') : ''}</td>
                    <td data-label="Status"><span className="badge" style={{
                      background: berlaku ? '#DEEDE5' : '#EFEDE3', color: berlaku ? '#12604B' : '#68766E' }}>
                      {berlaku ? 'Berlaku' : 'Berakhir'}</span></td>
                    <td>{berlaku && <button className="sort-btn" style={{ padding: '3px 9px' }}
                      onClick={() => akhiriDelegasi(x.id)}>Akhiri</button>}</td>
                  </tr>);
              })}
              {!del.rows.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 18, color: 'var(--muted)' }}>
                Belum ada delegasi.</td></tr>}
            </tbody>
          </table></div>
          <button className="sort-btn" style={{ marginTop: 10 }} onClick={() => setPanel('')}>Tutup</button>
        </div>)}

      {putus && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--brass)' }}>
          <h2>{putus.keputusan === 'Disetujui' ? 'Setujui permintaan' : 'Tolak permintaan'}</h2>
          <div className="hint">{putus.ringkas}</div>
          <div className="form-grid" style={{ marginTop: 10 }}>
            <div className="field"><label>PIN Otorisasi</label>
              <PasswordInput value={pin} onChange={e => setPin(e.target.value)} autoFocus /></div>
            <div className="field" style={{ gridColumn: '2 / -1' }}>
              <label>{putus.keputusan === 'Ditolak' ? 'Alasan penolakan (wajib)' : 'Catatan (opsional)'}</label>
              <input value={alasan} onChange={e => setAlasan(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className={'btn ' + (putus.keputusan === 'Disetujui' ? 'btn-primary' : '')}
              style={{ width: 'auto' }} disabled={busy || !pin} onClick={putuskan}>
              {putus.keputusan === 'Disetujui' ? 'Setujui dengan PIN' : 'Tolak dengan PIN'}</button>
            <button className="sort-btn" onClick={() => { setPutus(null); setPin(''); setAlasan(''); }}>Batal</button>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Keputusan menghasilkan kode otorisasi yang tercetak pada dokumen dan tidak dapat dibuat ulang bila datanya diubah.
          </div>
        </div>)}

      {rows.map(r => (
        <div className="card" key={r.id} style={{ marginBottom: 11,
          borderLeft: '4px solid ' + (SB[r.status] || SB.Menunggu).fg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{d.tindakan[r.jenis]?.nama || r.jenis}</div>
              <div className="hint" style={{ marginTop: 2 }}>{r.ringkas}</div>
              <div className="hint" style={{ margin: 0 }}>
                Diminta {r.diminta_oleh} {r.diminta_kode ? '(' + r.diminta_kode + ')' : ''} · {fmtDate(r.diminta_at)}
                {' · perlu '}{d.jabatan[r.jabatan] || r.jabatan}{r.divisi ? ' ' + r.divisi : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {r.nilai > 0 && <div style={{ fontSize: 16, fontWeight: 800, color: '#0A3B2E' }}>{fmtRp(r.nilai)}</div>}
              <span className="badge" style={{ background: (SB[r.status] || SB.Menunggu).bg,
                color: (SB[r.status] || SB.Menunggu).fg, marginTop: 5, display: 'inline-block' }}>{r.status}</span>
            </div>
          </div>

          {r.status !== 'Menunggu' && (
            <div className="hint" style={{ marginTop: 9, borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
              {r.keputusan} oleh <b>{r.oleh}</b> {r.oleh_kode ? '(' + r.oleh_kode + ')' : ''}
              {r.mewakili ? ' — mewakili ' + r.mewakili + ' (' + (r.mewakili_kode || '') + ')' : ''}
              {' · '}{fmtDate(r.diputus_at)}
              {r.kode && <> · kode <b style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{r.kode}</b></>}
              {r.alasan ? <><br />{r.alasan}</> : null}
            </div>)}

          {r.status === 'Menunggu' && d.giliranSaya.includes(r.id) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 15px' }}
                disabled={!me.punyaPin}
                onClick={() => { setPutus({ ...r, keputusan: 'Disetujui' }); setPin(''); setAlasan(''); }}>
                Setujui</button>
              <button className="sort-btn" disabled={!me.punyaPin}
                onClick={() => { setPutus({ ...r, keputusan: 'Ditolak' }); setPin(''); setAlasan(''); }}>
                Tolak</button>
              {!me.punyaPin && <span className="hint" style={{ margin: 0 }}>Tetapkan PIN Otorisasi lebih dulu.</span>}
            </div>)}
        </div>))}

      {!rows.length && <div className="card"><div className="hint" style={{ margin: 0 }}>
        {tab === 'giliran' ? 'Tidak ada permintaan yang menunggu keputusan Anda.' : 'Belum ada data pada saringan ini.'}
      </div></div>}
      <Toast />
    </>
  );
}
