'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate } from '@/components/util';
import { isianTemplateFU } from '@/lib/fuwajib';

// ===== Inbox WhatsApp: chat tim lewat WhatsApp Cloud API tanpa Meta Business Suite =====
const TEMPLATE = [
  ['📄 Simulasi KPR', 'Halo {nama}, berikut gambaran simulasi KPR untuk {project}: DP mulai 10%, tenor sampai 20 tahun dengan bank rekanan (program bunga fix berjenjang). Boleh saya kirimkan simulasi lengkap untuk tipe yang Kakak minati?'],
  ['📍 Lokasi & maps', 'Lokasi {project} bisa dilihat di sini ya Kak: {maps}. Marketing gallery buka setiap hari 09.00–17.00.'],
  ['🏠 Price list', 'Berikut price list {project} terbaru ya Kak. Harga sudah termasuk biaya-biaya (All In). Ada tipe tertentu yang ingin ditanyakan lebih detail?'],
  ['📅 Ajak visit', 'Kalau berkenan, Kakak bisa datang langsung melihat unit {project}. Hari dan jam berapa yang pas? Nanti saya siapkan dan temani selama kunjungan.'],
  ['🙏 Terima kasih', 'Terima kasih sudah menghubungi {project}, Kak {nama}. Kalau ada pertanyaan lain, langsung chat saja ya, saya siap bantu 🙏'],
];
const MAPS = { 'BIO DISTRICT': 'https://maps.app.goo.gl/biodistrict', 'PERMAI INDAH': 'https://maps.app.goo.gl/permaiindah' };
const fmtWA = w => { const s = String(w || ''); if (s.startsWith('62')) { const n = '0' + s.slice(2); return n.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3'); } return s; };
const jam = t => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const kapan = t => { const d = new Date(t), h = new Date(); const sama = d.toDateString() === h.toDateString(); const kemarin = new Date(h.getTime() - 86400000).toDateString() === d.toDateString(); return sama ? jam(t) : kemarin ? 'Kemarin' : fmtDate(t.slice ? t.slice(0, 10) : d.toISOString().slice(0, 10)); };
const tglGrup = t => new Date(t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
const sisaTeks = j => j >= 1 ? `${Math.floor(j)} jam ${Math.round((j % 1) * 60)} menit` : `${Math.round(j * 60)} menit`;

export default function WaInbox() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('semua');
  const [cari, setCari] = useState('');
  const [wa, setWa] = useState('');
  const [th, setTh] = useState(null);
  const [teks, setTeks] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);
  const [jOper, setJOper] = useState(null);   // jendela oper ke sales
  const [jTpl, setJTpl] = useState(null);     // jendela kirim template resmi
  const [jArsip, setJArsip] = useState(null); // daftar chat siap diarsipkan di HP official (Marcom)
  const bawah = useRef(null);
  const muatDaftar = () => api('/api/wa-inbox', { silent: true }).then(setData).catch(e => toast(e.message));
  // Polling hemat: saat diam (polling) hanya minta pesan BARU setelah id terakhir; percakapan penuh hanya saat dibuka / setelah aksi
  const akhirRef = useRef({ wa: '', id: 0 });
  const muatThread = (w = wa, diam = false) => {
    if (!w) return;
    const inkr = diam && akhirRef.current.wa === w && akhirRef.current.id > 0;
    return api('/api/wa-inbox?wa=' + w + (inkr ? '&after=' + akhirRef.current.id : ''), { silent: diam }).then(t => {
      if (t.inkremental) setTh(prev => (prev && prev.wa === w ? { ...t, pesan: [...prev.pesan, ...t.pesan] } : t));
      else setTh(t);
      if (t.pesan.length) akhirRef.current = { wa: w, id: t.pesan[t.pesan.length - 1].id };
      else if (!t.inkremental) akhirRef.current = { wa: w, id: 0 };
      if (!diam || (t.inkremental && t.pesan.length)) setTimeout(() => bawah.current?.scrollIntoView({ block: 'end' }), 50);
    }).catch(e => toast(e.message));
  };
  const terlihat = () => document.visibilityState === 'visible';
  useEffect(() => { muatDaftar(); const t = setInterval(() => { if (terlihat()) muatDaftar(); }, 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!wa) return; akhirRef.current = { wa: '', id: 0 }; muatThread(wa); const t = setInterval(() => { if (terlihat()) muatThread(wa, true); }, 5000); return () => clearInterval(t); }, [wa]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('arsip')) bukaArsip(); }, []);
  async function bukaArsip() {
    setJArsip({ memuat: true });
    try { const d = await api('/api/wa-arsip', { silent: true }); setJArsip({ rows: d.rows, pilih: d.rows.map(r => r.wa) }); }
    catch (e) { setJArsip(null); toast(e.message); }
  }
  async function tandaiArsip() {
    if (!jArsip.pilih.length) return toast('Centang chat yang sudah diarsipkan di HP');
    setBusy(true);
    try { const r = await api('/api/wa-arsip', { method: 'POST', body: JSON.stringify({ wa: jArsip.pilih }) }); toast(r.jumlah + ' chat ditandai sudah diarsipkan'); bukaArsip(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { const q = new URLSearchParams(window.location.search); const w = q.get('wa'); if (w) { setWa(w.replace(/[^0-9]/g, '')); setMobileThread(true); if (q.get('teks')) setTeks(q.get('teks')); } }, []);

  const me = data?.me;
  const daftar = useMemo(() => {
    let d = data?.daftar || [];
    if (filter === 'belum') d = d.filter(x => x.peran === 'user');
    else if (filter === 'ai') d = d.filter(x => !x.sales && x.ai_status && !['diambil_tim', 'nonaktif'].includes(x.ai_status));
    else if (filter === 'orang') d = d.filter(x => x.ai_status === 'eskalasi' || x.ai_status === 'siap_oper');
    else if (filter === 'sudah') d = d.filter(x => !!x.sales);
    if (cari.trim()) { const c = cari.trim().toLowerCase(); d = d.filter(x => (x.nama || '').toLowerCase().includes(c) || x.wa.includes(c.replace(/[^0-9]/g, '')) || (x.lead_code || '').toLowerCase().includes(c)); }
    return d;
  }, [data, filter, cari, me]);
  const jml = k => { const d = data?.daftar || []; return k === 'semua' ? d.length : k === 'belum' ? d.filter(x => x.peran === 'user').length : k === 'ai' ? d.filter(x => !x.sales && x.ai_status && !['diambil_tim', 'nonaktif'].includes(x.ai_status)).length : k === 'orang' ? d.filter(x => x.ai_status === 'eskalasi' || x.ai_status === 'siap_oper').length : d.filter(x => !!x.sales).length; };
  const buka = w => { setWa(w); setMobileThread(true); setTeks(''); };
  const isiTemplate = t => { const l = th?.lead; setTeks(t.replace(/\{nama\}/g, (l?.nama || '').replace(/^WA .*/, 'Kak') || 'Kak').replace(/\{project\}/g, (l?.project || '').replace(/\b\w+/g, w => w.charAt(0) + w.slice(1).toLowerCase()) || 'project kami').replace(/\{maps\}/g, MAPS[l?.project] || '')); };
  async function kirim() {
    if (!teks.trim() || busy) return;
    setBusy(true);
    try { await api('/api/wa-inbox', { method: 'POST', body: JSON.stringify({ wa, teks }) }); setTeks(''); await muatThread(wa); muatDaftar(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function aksi(a) {
    try { const r = await api('/api/wa-inbox', { method: 'POST', body: JSON.stringify({ wa, aksi: a }) }); toast(r.aksi || 'Tersimpan'); muatThread(wa, true); muatDaftar(); } catch (e) { toast(e.message); }
  }
  function bukaOper() {
    const l = th?.lead; if (!l) return toast('Lead belum terbentuk untuk nomor ini');
    const nm = (l.nama || '').replace(/^WA .*/, '').split(' ')[0] || 'Kak';
    setJOper({ sales: l.sales || '', konteks: l.ai_ringkasan || '', kenalkan: true,
      teks: `Halo Kak ${nm} 🙏 Perkenalkan, mulai sekarang Kakak akan dibantu oleh {sales}, konsultan properti ${(l.project || '').replace(/\b\w+/g, w => w.charAt(0) + w.slice(1).toLowerCase())} kami, di nomor ini juga. {sales} siap membantu info unit, simulasi, sampai jadwal kunjungan ya Kak.` });
  }
  async function kirimOper() {
    if (!jOper.sales) return toast('Pilih sales');
    setBusy(true);
    try {
      const r = await api('/api/wa-inbox', { method: 'POST', body: JSON.stringify({ wa, aksi: 'oper', sales: jOper.sales, konteks: jOper.konteks, kenalkan: jOper.kenalkan, teks: jOper.teks.replace(/\{sales\}/g, jOper.sales) }) });
      toast(r.aksi + ' · perkenalan ' + r.kenalan); setJOper(null); muatThread(wa); muatDaftar();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function bukaTemplate() {
    const l = th?.lead;
    setJTpl({ memuat: true });
    try {
      const d = await api('/api/wa-template?project=' + encodeURIComponent(l?.project || ''), { silent: true });
      const ok = (d.templates || []).filter(t => t.status === 'APPROVED');
      const pilih = ok.find(t => t.name === th?.fu?.template) || ok[0] || null;
      setJTpl({ ...d, ok, pilih: pilih ? pilih.name : '', isian: isiAwal(pilih) });
    } catch (e) { setJTpl(null); toast(e.message); }
  }
  function isiAwal(t) {
    if (!t) return [];
    const l = th?.lead, x = isianTemplateFU(l || {}, th?.fu?.jenis || 'h2', (l && l.sales) || me?.name);
    return Array.from({ length: t.jumlahIsian }, (_, i) => [x.nama, x.project, x.sales, x.info][i] || '');
  }
  const tplPilih = () => (jTpl?.ok || []).find(t => t.name === jTpl.pilih);
  const pratinjau = () => { const t = tplPilih(); return t ? t.body.replace(/\{\{(\d+)\}\}/g, (_, n) => jTpl.isian[Number(n) - 1] || '…') : ''; };
  async function kirimTpl() {
    const t = tplPilih(); if (!t) return;
    if (jTpl.isian.some(v => !String(v || '').trim())) return toast('Lengkapi semua isian template');
    setBusy(true);
    try {
      const r = await api('/api/wa-inbox', { method: 'POST', body: JSON.stringify({ wa, aksi: 'template', name: t.name, language: t.language, isian: jTpl.isian, pratinjau: pratinjau() }) });
      toast('Template terkirim' + (r.fu && r.fu.label ? ' · berikutnya: ' + r.fu.label + (r.fu.next ? ' (' + fmtDate(r.fu.next) + ')' : '') : '')); setJTpl(null); muatThread(wa); muatDaftar();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function ajukanStandar() {
    if (!window.confirm('Ajukan paket template standar FU wajib ke Meta untuk ditinjau? Template yang sudah ada dilewati.')) return;
    try { const r = await api('/api/wa-template', { method: 'POST', body: JSON.stringify({ aksi: 'ajukan', project: th?.lead?.project || '' }) }); toast(r.hasil.map(h => h.name + ': ' + h.status).join(' · ')); bukaTemplate(); }
    catch (e) { toast(e.message); }
  }
  async function simpanLampiran(id) {
    try { const r = await api('/api/wa-inbox', { method: 'POST', body: JSON.stringify({ wa, aksi: 'simpan_lampiran', id }) }); toast(r.aksi || 'Tersimpan'); muatThread(wa); }
    catch (e) { toast(e.message); }
  }
  const aiAktif = l => l && !l.sales && l.ai_status && !['diambil_tim', 'nonaktif'].includes(l.ai_status);

  if (!data) return <div className="loading">Memuat inbox…</div>;
  const l = th?.lead;
  return (
    <>
      <Toast />
      <div className="page-head"><div><h1>Inbox WhatsApp</h1>
        <div className="sub">Chat calon pembeli dari WhatsApp Cloud API — AI menjawab lebih dulu, tim bisa ambil alih kapan saja{data.nomor?.length ? ' · nomor: ' + data.nomor.map(n => `${fmtWA(n.display)} (${n.project || '?'})`).join(', ') : ' · belum ada nomor terhubung (menunggu pesan pertama lewat webhook)'}</div></div></div>
      <div className="fu-toolbar" style={{ marginBottom: 10 }}>
        {me && ['administrator', 'headsales', 'salesmanager', 'markom'].includes(me.role) && <button className="sort-btn" style={{ fontWeight: 700 }} onClick={bukaArsip} title="Daftar chat yang bisa diarsipkan di HP WhatsApp official">🗄 Siap diarsipkan</button>}
        {[['semua', 'Semua'], ['belum', 'Belum dibalas'], ['ai', 'AI aktif'], ['orang', 'Minta orang'], ['sudah', 'Sudah dioper']].map(([k, lb]) => (
          <button key={k} className={'sort-btn tab-utama' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>{lb} ({jml(k)})</button>))}
      </div>
      <div className={'wa-wrap' + (mobileThread ? ' thread' : '')}>
        <div className="wa-list card">
          <input className="sort-filter" placeholder="🔍 Cari nama / nomor / kode lead…" value={cari} onChange={e => setCari(e.target.value)} style={{ width: '100%', marginBottom: 6 }} />
          {daftar.length ? daftar.map(x => (
            <button key={x.wa} className={'wa-ci' + (wa === x.wa ? ' on' : '')} onClick={() => buka(x.wa)}>
              <span className="wa-av">{(x.nama || '?').replace(/^WA .*/, '?').charAt(0).toUpperCase()}</span>
              <span className="wa-cm">
                <span className="wa-ct"><b>{x.nama && !/^WA /.test(x.nama) ? x.nama : fmtWA(x.wa)}</b><span className="hint">{kapan(x.terakhir)}</span></span>
                <span className="wa-cl">{x.peran === 'user' ? '' : x.peran === 'ai' ? '🤖 ' : '↩ '}{x.isi}</span>
                <span className="wa-cb">
                  {aiAktif(x) && <span className="kp-pill sm kp-ok">🤖 AI aktif</span>}
                  {(x.ai_status === 'eskalasi' || x.ai_status === 'siap_oper') && <span className="kp-pill sm kp-no">⚠ {x.ai_status === 'eskalasi' ? 'Minta orang' : 'Siap dioper'}</span>}
                  {x.sales && <span className="kp-pill sm kp-run">👤 {x.sales}</span>}
                  {x.belum > 0 && <span className="wa-unread">{x.belum}</span>}
                </span>
              </span>
            </button>))
            : <p className="hint" style={{ padding: 10 }}>Belum ada percakapan{filter !== 'semua' ? ' di filter ini' : ''}.</p>}
        </div>

        <div className="wa-th card">
          {!wa ? <div className="wa-kosong"><div style={{ fontSize: 40 }}>💬</div><p className="hint">Pilih percakapan di kiri. Pesan baru masuk otomatis setiap beberapa detik.</p></div> : !th ? <div className="loading">Memuat percakapan…</div> : (<>
            <div className="wa-hd">
              <div style={{ minWidth: 0 }}>
                <button className="sort-btn wa-back" onClick={() => setMobileThread(false)}>‹ Daftar</button>
                <div className="wa-nm">{l?.nama && !/^WA /.test(l.nama) ? l.nama : fmtWA(wa)} <span className="hint">· {fmtWA(wa)}</span></div>
                <div className="bd-chips kp" style={{ marginTop: 4 }}>
                  {l ? <>{l.lead_code && <Link href={'/leads?lead=' + encodeURIComponent(l.lead_code)} className="kp-pill sm kp-wait">{l.lead_code}</Link>}<span className="kp-pill sm kp-wait">{l.project}</span><span className="kp-pill sm kp-wait">{l.status}</span>
                    {(l.sumber || l.campaign) && <span className="kp-pill sm kp-wait">{[l.sumber, l.campaign].filter(Boolean).join(' · ')}</span>}
                    {aiAktif(l) ? <span className="kp-pill sm kp-ok">🤖 AI aktif</span> : <span className="kp-pill sm kp-run">{l.sales ? '👤 ' + l.sales : 'AI berhenti · belum ada sales'}</span>}</>
                    : <span className="kp-pill sm kp-no">Lead belum terbentuk</span>}
                </div>
                {l?.ai_ringkasan && <div className="hint" style={{ marginTop: 4 }}>🤖 Ringkasan AI: {l.ai_ringkasan}</div>}
                {th.fu && <div className="hint" style={{ marginTop: 4 }}>📋 FU wajib: <b>{th.fu.label}</b> · jatuh tempo {fmtDate(th.fu.jatuh)}{th.fu.telat > 0 ? <b style={{ color: 'var(--red)' }}> · terlambat {th.fu.telat} hari</b> : ''}</div>}
                {(th.lampiran || []).length > 0 && <div className="hint" style={{ marginTop: 4 }}>📎 Lampiran tersimpan: {th.lampiran.map(x => <a key={x.id} href={'/api/wa-media?lampiran=' + x.id + '&unduh=1'} style={{ marginRight: 8 }}>{x.nama_file}</a>)}</div>}
              </div>
              <div className="wa-aksi">
                {l && th.bolehOper && aiAktif(l) && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => aksi('ambil')}>✋ Ambil alih (AI berhenti)</button>}
                {l && th.bolehOper && !aiAktif(l) && !l.sales && <button className="sort-btn" onClick={() => aksi('ai_lanjut')}>🤖 Lanjutkan AI</button>}
                {l && th.bolehOper && <button className="sort-btn" onClick={bukaOper}>👤 {l.sales ? 'Ganti sales' : 'Oper ke sales'}</button>}
                {l?.lead_code && <Link className="sort-btn" href={'/janjian?tab=janji'}>📅 Buat janji</Link>}
                {l?.lead_code && <Link className="sort-btn" href={'/leads?lead=' + encodeURIComponent(l.lead_code)}>Buka lead ›</Link>}
              </div>
            </div>
            <div className="wa-msgs">
              {th.pesan.length ? th.pesan.map((p, i) => {
                const hariBaru = i === 0 || new Date(p.created_at).toDateString() !== new Date(th.pesan[i - 1].created_at).toDateString();
                return (<div key={p.id}>
                  {hariBaru && <div className="wa-hari"><span>{tglGrup(p.created_at)}</span></div>}
                  <div className={'wa-b ' + (p.peran === 'user' ? 'in' : p.peran === 'ai' ? 'ai' : 'tim')}>
                    {p.peran !== 'user' && <span className="wa-who">{p.peran === 'ai' ? '🤖 Asisten AI' : (p.oleh || 'Tim') + (p.oleh ? ' (tim)' : '')}</span>}
                    <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.isi}</span>
                    {p.media_id && <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <a className="sort-btn" style={{ padding: '2px 9px', fontSize: 11.5 }} href={'/api/wa-media?p=' + p.id} target="_blank" rel="noreferrer">👁 Lihat</a>
                      {p.lampiran_id ? <a className="sort-btn" style={{ padding: '2px 9px', fontSize: 11.5 }} href={'/api/wa-media?lampiran=' + p.lampiran_id + '&unduh=1'}>✓ Tersimpan · unduh</a>
                        : <button className="sort-btn" style={{ padding: '2px 9px', fontSize: 11.5 }} onClick={() => simpanLampiran(p.id)}>💾 Simpan</button>}
                    </span>}
                    <span className="wa-j">{jam(p.created_at)}</span>
                  </div></div>);
              }) : <p className="hint" style={{ padding: 14 }}>Belum ada pesan.</p>}
              <div ref={bawah} />
            </div>
            {th.hanyaLihat ? <div className="wa-comp hint" style={{ padding: 12 }}>Mode lihat — CEO Project memantau percakapan; balasan &amp; oper dilakukan Head of Sales &amp; Marketing, Sales Manager, Marcom, atau sales.</div> :
            <div className="wa-comp">
              <div className="wa-tpl">{TEMPLATE.map(([lb, t]) => <button key={lb} className="sort-btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => isiTemplate(t)}>{lb}</button>)}</div>
              <div className="wa-inp">
                <textarea value={teks} onChange={e => setTeks(e.target.value)} placeholder={th.bisaBalas ? 'Tulis balasan sebagai tim… (Enter kirim, Shift+Enter baris baru)' : 'Tidak bisa membalas sekarang'} disabled={!th.bisaBalas || busy} rows={2}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirim(); } }} />
                <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!th.bisaBalas || busy || !teks.trim()} onClick={kirim}>{busy ? 'Mengirim…' : 'Kirim ➤'}</button>
                <button className={th.bisaBalas ? 'sort-btn' : 'btn btn-primary'} style={{ width: 'auto' }} disabled={busy || !th.adaNomor} onClick={bukaTemplate}>📨 Kirim template</button>
              </div>
              <div className="hint">
                {th.sisaJam > 0 ? <>Jendela balas 24 jam sejak pesan terakhir konsumen: <b style={{ color: th.sisaJam < 2 ? 'var(--red)' : 'var(--green)' }}>sisa {sisaTeks(th.sisaJam)}</b>. </> : <b style={{ color: 'var(--red)' }}>Jendela 24 jam sudah lewat — gunakan 📨 Kirim template (template resmi, berbayar ±Rp630/pesan) untuk menyapa lagi. </b>}
                {!th.nomorPengirim && 'Nomor pengirim project ini belum dikenal CRM (menunggu pesan pertama lewat webhook). '}
                {l && aiAktif(l) ? 'Balasan tim akan menghentikan AI untuk lead ini. ' : ''}Pesan dari CRM tercatat di riwayat follow up lead.
              </div>
            </div>}
          </>)}
        </div>
      </div>
      {jOper && <div onClick={e => { if (e.target === e.currentTarget && !busy) setJOper(null); }} style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }}>
        <div className="card" style={{ width: 'min(560px, 100%)', margin: '24px 0' }}>
          <h3 style={{ marginTop: 0 }}>Oper ke sales · {th?.lead?.nama}</h3>
          <div className="field"><label>Sales</label>
            <select value={jOper.sales} onChange={e => setJOper({ ...jOper, sales: e.target.value })}><option value="">— pilih —</option>{(data.sales || []).map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label>Konteks untuk sales (apa yang ditanyakan konsumen)</label>
            <textarea rows={2} value={jOper.konteks} onChange={e => setJOper({ ...jOper, konteks: e.target.value })} /></div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0' }}><input type="checkbox" style={{ width: 'auto' }} checked={jOper.kenalkan} onChange={e => setJOper({ ...jOper, kenalkan: e.target.checked })} /> Kirim pesan perkenalan dari nomor official</label>
          {jOper.kenalkan && <div className="field"><label>Pesan perkenalan <span className="hint">({'{sales}'} diganti nama sales; di luar 24 jam otomatis memakai template resmi "perkenalan_konsultan")</span></label>
            <textarea rows={4} value={jOper.teks} onChange={e => setJOper({ ...jOper, teks: e.target.value })} /></div>}
          <div className="hint">Lead pindah ke Inbox sales tersebut, jadwal FU wajib dimulai (Hari 1, maks. 1 jam), dan HP sales menerima notifikasi.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={kirimOper}>{busy ? 'Memproses…' : 'Oper sekarang'}</button><button className="sort-btn" onClick={() => setJOper(null)}>Batal</button></div>
        </div></div>}
      {jTpl && <div onClick={e => { if (e.target === e.currentTarget && !busy) setJTpl(null); }} style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }}>
        <div className="card" style={{ width: 'min(620px, 100%)', margin: '24px 0' }}>
          <h3 style={{ marginTop: 0 }}>Kirim template resmi WhatsApp</h3>
          {jTpl.memuat ? <div className="loading">Memuat template…</div> : !jTpl.ok?.length ? (<>
            <p className="hint">{jTpl.pesan || 'Belum ada template yang disetujui Meta untuk nomor ini.'}</p>
            {['administrator', 'headsales', 'salesmanager'].includes(me?.role) && jTpl.siap && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={ajukanStandar}>Ajukan paket template standar FU wajib</button>}
            {!['administrator', 'headsales', 'salesmanager'].includes(me?.role) && <p className="hint">Minta Administrator mengajukan paket template standar dari menu ini.</p>}
          </>) : (<>
            <div className="field"><label>Template {th?.fu ? <span className="hint">(disarankan untuk {th.fu.label})</span> : null}</label>
              <select value={jTpl.pilih} onChange={e => { const t = jTpl.ok.find(x => x.name === e.target.value); setJTpl({ ...jTpl, pilih: e.target.value, isian: isiAwal(t) }); }}>
                {jTpl.ok.map(t => <option key={t.name} value={t.name}>{t.name} · {t.category === 'MARKETING' ? 'Marketing' : t.category === 'UTILITY' ? 'Utility' : t.category}</option>)}</select></div>
            {jTpl.isian.map((v, i) => <div className="field" key={i}><label>Isian {'{{' + (i + 1) + '}}'} {['(nama konsumen)', '(project)', '(nama sales)', '(info)'][i] || ''}</label>
              <input value={v} onChange={e => { const x = [...jTpl.isian]; x[i] = e.target.value; setJTpl({ ...jTpl, isian: x }); }} /></div>)}
            <div className="note" style={{ whiteSpace: 'pre-wrap' }}>{pratinjau()}</div>
            <div className="hint" style={{ margin: '6px 0' }}>Perkiraan biaya ±Rp{((jTpl.biaya || {})[tplPilih()?.category] || 630).toLocaleString('id-ID')} per pesan. Tercatat otomatis sebagai sentuhan FU wajib (konsumen belum membalas) dan jadwal berikutnya dihitung sendiri.</div>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={kirimTpl}>{busy ? 'Mengirim…' : 'Kirim template'}</button><button className="sort-btn" onClick={() => setJTpl(null)}>Batal</button></div>
          </>)}
        </div></div>}

      {jArsip && <div onClick={e => { if (e.target === e.currentTarget && !busy) setJArsip(null); }} style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }}>
        <div className="card" style={{ width: 'min(620px, 100%)', margin: '24px 0' }}>
          <h3 style={{ marginTop: 0 }}>🗄 Siap diarsipkan di HP official</h3>
          <div className="hint" style={{ marginBottom: 8 }}>Lead yang sudah dioper ke sales atau selesai (Drop/Booking). Arsipkan chat-nya di aplikasi WhatsApp Business (tekan lama → centang beberapa → Arsip), lalu tandai di sini. Riwayat chat tetap tersimpan lengkap di Harmoni One. Jangan lupa: buka aplikasi WhatsApp Business minimal tiap 14 hari.</div>
          {jArsip.memuat ? <div className="loading">Memuat…</div> : !jArsip.rows.length ? <p className="hint">✅ Tidak ada chat yang perlu diarsipkan.</p> : (<>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0 6px' }}><input type="checkbox" style={{ width: 'auto' }} checked={jArsip.pilih.length === jArsip.rows.length}
              onChange={e => setJArsip({ ...jArsip, pilih: e.target.checked ? jArsip.rows.map(r => r.wa) : [] })} /> <b>Pilih semua ({jArsip.rows.length})</b></label>
            <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
              {jArsip.rows.map(r => (<label key={r.wa} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid var(--line)' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={jArsip.pilih.includes(r.wa)} onChange={() => setJArsip({ ...jArsip, pilih: jArsip.pilih.includes(r.wa) ? jArsip.pilih.filter(x => x !== r.wa) : [...jArsip.pilih, r.wa] })} />
                <span style={{ flex: 1, minWidth: 0 }}><b>{r.nama}</b> · {fmtWA(r.wa)}<br /><span className="hint">{r.lead_code} · {r.project} · {r.alasan}</span></span></label>))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={tandaiArsip}>{busy ? 'Menyimpan…' : 'Tandai sudah diarsipkan (' + jArsip.pilih.length + ')'}</button><button className="sort-btn" onClick={() => setJArsip(null)}>Tutup</button></div>
          </>)}
        </div></div>}
    </>
  );
}
