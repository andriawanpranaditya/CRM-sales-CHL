'use client';
// Pengaturan Formulir WA otomatis (nama, domisili, budget) untuk lead baru yang chat ke nomor WA project
import { useEffect, useState } from 'react';
import { api } from '@/components/util';
import { toast } from '@/components/Toast';

const rpTeks = n => Number(n || 0).toLocaleString('id-ID');
const keBaris = arr => (arr || []).join('\n');
const budgetKeBaris = arr => (arr || []).map(([t, n]) => `${t} = ${rpTeks(n)}`).join('\n');
const barisKeBudget = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => { const [t, n] = x.split('='); return [String(t || '').trim(), Number(String(n || '').replace(/\D/g, '')) || 0]; });

export default function FormWA() {
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [teks, setTeks] = useState({});
  const [busy, setBusy] = useState('');
  const [tes, setTes] = useState({});
  const muat = () => api('/api/distribusi?form=1', { silent: true }).then(x => {
    setD(x); setF(x.form);
    setTeks(Object.fromEntries(Object.entries(x.form.opsi).map(([p, o]) => [p, { domisili: keBaris(o.domisili), budget: budgetKeBaris(o.budget) }])));
  }).catch(e => toast(e.message));
  useEffect(() => { muat(); }, []);
  if (!d || !f) return <div className="card" style={{ marginTop: 14 }}><h2>📝 Formulir WA otomatis</h2><p className="hint">Memuat…</p></div>;

  const projects = Object.keys(f.opsi);
  const susun = () => ({ ...f, opsi: Object.fromEntries(projects.map(p => [p, { domisili: String(teks[p]?.domisili || '').split('\n').map(x => x.trim()).filter(Boolean), budget: barisKeBudget(teks[p]?.budget) }])) });
  async function simpan() {
    setBusy('simpan');
    try { const x = await api('/api/distribusi', { method: 'POST', body: JSON.stringify({ aksi: 'form-simpan', form: susun() }) }); setF(x.form); toast('Formulir WA tersimpan'); }
    catch (e) { toast(e.message); } finally { setBusy(''); }
  }
  async function buat(p) {
    setBusy('buat' + p);
    try { await api('/api/distribusi', { method: 'POST', body: JSON.stringify({ aksi: 'form-simpan', form: susun() }) });
      const x = await api('/api/distribusi', { method: 'POST', body: JSON.stringify({ aksi: 'form-buat', project: p }) }); setF(x.form); toast('Formulir dibuat & dipublikasikan untuk ' + p + ' (Flow ID ' + x.flow_id + ')'); }
    catch (e) { toast(e.message); } finally { setBusy(''); }
  }
  async function kirimTes(p) {
    setBusy('tes' + p);
    try { await api('/api/distribusi', { method: 'POST', body: JSON.stringify({ aksi: 'form-simpan', form: susun() }) });
      const x = await api('/api/distribusi', { method: 'POST', body: JSON.stringify({ aksi: 'form-tes', project: p, wa: tes[p] || '' }) });
      toast(x.jenis === 'flow' ? 'Formulir WA terkirim — cek WhatsApp nomor tujuan' : 'Terkirim sebagai pesan format isian (Flow ID belum ada / formulir gagal)'); }
    catch (e) { toast(e.message + ' — nomor tujuan harus chat dulu ke nomor WA project dalam 24 jam terakhir'); } finally { setBusy(''); }
  }
  const salinJson = () => navigator.clipboard?.writeText(JSON.stringify(d.flowJson, null, 2)).then(() => toast('Rancangan formulir (JSON) disalin')).catch(() => toast('Gagal menyalin'));
  const st = d.statistik || {};

  return (<div className="card" style={{ marginTop: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>📝 Formulir WA otomatis — nama, domisili, budget</h2>
      <button className={'ds-saklar' + (f.aktif ? ' on' : '')} onClick={() => setF({ ...f, aktif: !f.aktif })}><i />{f.aktif ? 'Aktif' : 'Mati'}</button>
    </div>
    <p className="hint" style={{ marginTop: 0 }}>Setiap nomor baru yang chat ke WA project otomatis menerima formulir (WhatsApp Flows). Jawabannya mengisi data lead → lead menjadi 🔥 dan masuk antrian Marcom.
      Bila formulir tidak bisa dibuka / Flow ID belum ada, CRM mengirim pesan format isian teks dan membaca balasannya. 30 hari terakhir: <b>{st.dikirim || 0}</b> dikirim · <b>{st.terisi || 0}</b> terisi lengkap.</p>
    {!d.token && <div className="note">Token WhatsApp (WA_TOKEN / META_TOKEN) belum terpasang di Vercel — formulir belum bisa dikirim.</div>}
    <div className="ds-aturan">
      <div className="field penuh"><label>Pesan pembuka (dikirim bersama tombol Isi Data)</label><textarea rows={2} value={f.pembuka} onChange={e => setF({ ...f, pembuka: e.target.value })} /><span className="hint">Kode: {'{project}'}</span></div>
      <div className="field penuh"><label>Balasan setelah data lengkap</label><textarea rows={2} value={f.terima_kasih} onChange={e => setF({ ...f, terima_kasih: e.target.value })} /><span className="hint">Kode: {'{nama}'} {'{project}'} · kosongkan bila tidak perlu</span></div>
    </div>
    {projects.map(p => (<div key={p} className="ds-krit" style={{ marginTop: 10 }}>
      <b>{p}</b>
      <div className="ds-aturan">
        <div className="field"><label>Pilihan domisili (1 baris = 1 pilihan, maks. 30 huruf)</label><textarea rows={5} value={teks[p]?.domisili || ''} onChange={e => setTeks({ ...teks, [p]: { ...teks[p], domisili: e.target.value } })} /></div>
        <div className="field"><label>Pilihan budget — format: teks = nilai rupiah</label><textarea rows={5} value={teks[p]?.budget || ''} onChange={e => setTeks({ ...teks, [p]: { ...teks[p], budget: e.target.value } })} />
          <span className="hint">Nilai rupiah dipakai untuk kolom Budget lead & batas budget minimal 🔥</span></div>
        <div className="field"><label>Flow ID formulir {f.flow[p] ? '✓' : ''}</label><input value={f.flow[p] || ''} placeholder="otomatis / dari WhatsApp Manager" onChange={e => setF({ ...f, flow: { ...f.flow, [p]: e.target.value.replace(/\D/g, '') } })} />
          <span className="hint">{d.waba[p] ? 'Akun WA Business terdeteksi' : 'Akun WA Business belum terdeteksi (tunggu ada chat masuk)'}</span></div>
        <div className="field"><label>Kirim tes ke nomor</label><input value={tes[p] || ''} placeholder="08xx (harus chat dulu ke nomor WA project)" onChange={e => setTes({ ...tes, [p]: e.target.value })} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="sort-btn" disabled={!!busy} onClick={() => buat(p)}>{busy === 'buat' + p ? '⏳ Membuat…' : f.flow[p] ? '↻ Buat ulang formulir otomatis' : '⚡ Buat formulir otomatis'}</button>
        <button className="sort-btn" disabled={!!busy || !tes[p]} onClick={() => kirimTes(p)}>{busy === 'tes' + p ? '⏳…' : '📲 Kirim tes'}</button>
      </div>
    </div>))}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
      <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!!busy} onClick={simpan}>{busy === 'simpan' ? 'Menyimpan…' : 'Simpan formulir'}</button>
      <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 14px' }} onClick={salinJson}>Salin rancangan formulir (JSON)</button>
      <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Mode <select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })} style={{ fontSize: 12 }}><option value="published">Publikasi</option><option value="draft">Draft (uji)</option></select></label>
    </div>
    <details className="ds-panduan" style={{ marginTop: 10 }}><summary className="hint">Cara membuat formulir manual di WhatsApp Manager (bila tombol otomatis gagal)</summary>
      <ol><li>Buka <b>business.facebook.com → WhatsApp Manager → Account tools → Flows → Create Flow</b>. Nama bebas, kategori <i>Lead generation</i>, template <i>Default / tanpa endpoint</i>.</li>
        <li>Buka tab <b>Editor (JSON)</b>, hapus isinya, tempel hasil <b>Salin rancangan formulir (JSON)</b>, lalu <b>Save → Publish</b>.</li>
        <li>Salin <b>Flow ID</b>-nya ke kolom Flow ID project di atas → <b>Simpan formulir</b>. Satu formulir boleh dipakai untuk semua project di akun WA yang sama.</li></ol></details>
  </div>);
}
