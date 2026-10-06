'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/components/util';
import Toast, { toast } from '@/components/Toast';

export default function AsistenAI() {
  const [d, setD] = useState(null);
  const [proj, setProj] = useState('BIO DISTRICT');
  const [cfg, setCfg] = useState(null);
  const [chat, setChat] = useState([]);       // [{peran:'user'|'ai', isi, info?}]
  const [ketik, setKetik] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const bawah = useRef(null);

  const muat = () => api('/api/ai-asisten').then(r => { setD(r); const c = r.config.find(x => x.project === proj) || r.config[0]; if (c) { setProj(c.project); setCfg({ ...c }); } }).catch(e => toast(e.message));
  useEffect(() => { muat(); }, []); // eslint-disable-line
  useEffect(() => { if (d) { const c = d.config.find(x => x.project === proj); if (c) setCfg({ ...c }); setChat([]); } }, [proj]); // eslint-disable-line
  useEffect(() => { bawah.current && bawah.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat]);

  async function simpan() {
    try { await api('/api/ai-asisten', { method: 'PUT', body: JSON.stringify(cfg) }); toast('Pengaturan asisten disimpan ✅'); muat(); } catch (e) { toast(e.message); }
  }
  async function kirim() {
    const t = ketik.trim(); if (!t || sibuk) return;
    const baru = [...chat, { peran: 'user', isi: t }];
    setChat(baru); setKetik(''); setSibuk(true);
    try {
      const out = await api('/api/ai-asisten', { method: 'POST', body: JSON.stringify({ project: proj, pengetahuan: cfg.pengetahuan, riwayat: baru.map(x => ({ peran: x.peran, isi: x.isi })) }) });
      setChat([...baru, { peran: 'ai', isi: out.balasan || '(kosong)', info: out }]);
    } catch (e) { toast(e.message); setChat(baru); } finally { setSibuk(false); }
  }

  if (!d || !cfg) return <div className="loading">Memuat…</div>;
  const mgr = d.role === 'manager';
  const terakhir = [...chat].reverse().find(x => x.info)?.info;
  const dataGabung = chat.filter(x => x.info).reduce((acc, x) => { Object.entries(x.info.data || {}).forEach(([k, v]) => { if (v !== null && v !== '' && v !== undefined) acc[k] = v; }); return acc; }, {});

  return (<>
    <Toast />
    <div className="page-head"><div><h1>🤖 Asisten AI WhatsApp</h1>
      <div className="sub">Membalas chat calon pembeli 24 jam, mengkualifikasi, dan mengisi data lead otomatis · model {d.model}</div></div></div>

    {!d.apiKey && <div className="note" style={{ borderLeft: '4px solid var(--red)', marginBottom: 12 }}><b>ANTHROPIC_API_KEY belum dipasang di Vercel.</b> Simulasi & balasan otomatis belum bisa berjalan sampai kunci API dipasang.</div>}

    <div className="fu-toolbar" style={{ marginBottom: 12 }}>
      {d.config.map(c => <button key={c.project} className={'sort-btn' + (proj === c.project ? ' active' : '')} onClick={() => setProj(c.project)}>{c.project} {c.aktif ? '· 🟢 aktif' : '· ⚪ nonaktif'}</button>)}
      <span className="hint" style={{ marginLeft: 8 }}>30 hari terakhir: {d.statistik?.percakapan || 0} percakapan · {d.statistik?.balasan_ai || 0} balasan AI</span>
    </div>

    <div className="grid two-col">
      <div className="card">
        <h2>Pengaturan — {proj}</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 10px' }}>
          <input type="checkbox" checked={!!cfg.aktif} disabled={!mgr} onChange={e => setCfg({ ...cfg, aktif: e.target.checked })} />
          <b>Aktifkan balasan otomatis untuk chat WhatsApp {proj}</b></label>
        <div className="hint" style={{ marginBottom: 8 }}>AI berhenti otomatis untuk satu lead begitu tim membalas langsung dari HP, saat lead sudah punya sales, atau saat calon pembeli minta bicara dengan orang.</div>
        <div className="field"><label>Pengetahuan asisten (harga, tipe, promo, fasilitas, lokasi, jadwal kunjungan) — AI hanya menjawab dari sini</label>
          <textarea rows={18} value={cfg.pengetahuan || ''} readOnly={!mgr} onChange={e => setCfg({ ...cfg, pengetahuan: e.target.value })} style={{ fontFamily: 'inherit', fontSize: 13 }} /></div>
        {mgr && <div className="form-foot">
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={simpan}>Simpan Pengaturan</button>
          {d.bawaan?.[proj] && <button className="sort-btn" onClick={() => setCfg({ ...cfg, pengetahuan: d.bawaan[proj] })}>Isi dari data bawaan</button>}
        </div>}
        {!mgr && <span className="hint">Hanya manager yang bisa mengubah pengaturan; marcom bisa menguji di simulasi.</span>}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <h2>Simulasi Percakapan <span className="hint">(uji jawaban AI tanpa WhatsApp — memakai pengetahuan di kiri, termasuk yang belum disimpan)</span></h2>
        <div style={{ flex: 1, minHeight: 320, maxHeight: 460, overflowY: 'auto', background: 'var(--bg)', borderRadius: 10, padding: 10 }}>
          {!chat.length && <div className="hint" style={{ textAlign: 'center', padding: 30 }}>Ketik pesan sebagai calon pembeli, mis. <i>"Halo, mau info rumah Bio District dong"</i></div>}
          {chat.map((x, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: x.peran === 'user' ? 'flex-end' : 'flex-start', margin: '6px 0' }}>
              <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: 12, whiteSpace: 'pre-wrap', fontSize: 14,
                background: x.peran === 'user' ? '#DCF8C6' : 'var(--card)', border: '1px solid var(--line)' }}>
                {x.isi}
                {x.info && (x.info.siap_oper || x.info.eskalasi) && <div className="hint" style={{ marginTop: 4, color: x.info.eskalasi ? 'var(--red)' : 'var(--green)' }}>{x.info.eskalasi ? '⚠ Eskalasi ke tim' : '✓ Siap dioper ke sales'}</div>}
              </div></div>))}
          {sibuk && <div className="hint" style={{ margin: 6 }}>Asisten sedang mengetik…</div>}
          <div ref={bawah} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input style={{ flex: 1 }} value={ketik} onChange={e => setKetik(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') kirim(); }} placeholder="Tulis pesan calon pembeli…" />
          <button className="btn btn-primary" style={{ width: 'auto' }} disabled={sibuk || !d.apiKey} onClick={kirim}>Kirim</button>
          <button className="sort-btn" onClick={() => setChat([])}>Ulang</button>
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          <b>Data yang terbaca AI (akan mengisi CRM):</b>
          <div className="hint" style={{ marginTop: 4 }}>{Object.keys(dataGabung).length ? Object.entries(dataGabung).map(([k, v]) => `${k}: ${k === 'budget' ? 'Rp' + Number(v).toLocaleString('id-ID') : v}`).join(' · ') : '— belum ada —'}</div>
          {terakhir?.ringkasan && <div className="hint" style={{ marginTop: 4 }}><b>Ringkasan untuk sales:</b> {terakhir.ringkasan}</div>}
        </div>
      </div>
    </div>
  </>);
}
