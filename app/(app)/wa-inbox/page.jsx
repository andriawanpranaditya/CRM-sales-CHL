'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate } from '@/components/util';

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
  const bawah = useRef(null);
  const muatDaftar = () => api('/api/wa-inbox').then(setData).catch(e => toast(e.message));
  const muatThread = (w = wa, diam = false) => w && api('/api/wa-inbox?wa=' + w).then(t => { setTh(t); if (!diam) setTimeout(() => bawah.current?.scrollIntoView({ block: 'end' }), 50); }).catch(e => toast(e.message));
  useEffect(() => { muatDaftar(); const t = setInterval(muatDaftar, 8000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!wa) return; muatThread(wa); const t = setInterval(() => muatThread(wa, true), 5000); return () => clearInterval(t); }, [wa]);
  useEffect(() => { const w = new URLSearchParams(window.location.search).get('wa'); if (w) { setWa(w.replace(/[^0-9]/g, '')); setMobileThread(true); } }, []);

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
  async function oper() {
    const l = th?.lead; if (!l) return toast('Lead belum terbentuk untuk nomor ini');
    const nama = window.prompt('Oper lead ke sales (ketik nama sales persis seperti di CRM):', l.sales || ''); if (!nama) return;
    try { await api('/api/leads', { method: 'PATCH', body: JSON.stringify({ id: l.id, sales: nama.trim() }) }); toast('Lead dioper ke ' + nama.trim()); muatThread(wa, true); muatDaftar(); } catch (e) { toast(e.message); }
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
        {[['semua', 'Semua'], ['belum', 'Belum dibalas'], ['ai', 'AI aktif'], ['orang', 'Minta orang'], ['sudah', 'Sudah dioper']].map(([k, lb]) => (
          <button key={k} className={'sort-btn' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>{lb} ({jml(k)})</button>))}
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
              </div>
              <div className="wa-aksi">
                {l && aiAktif(l) && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => aksi('ambil')}>✋ Ambil alih (AI berhenti)</button>}
                {l && !aiAktif(l) && !l.sales && <button className="sort-btn" onClick={() => aksi('ai_lanjut')}>🤖 Lanjutkan AI</button>}
                {l && <button className="sort-btn" onClick={oper}>👤 {l.sales ? 'Ganti sales' : 'Oper ke sales'}</button>}
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
                    <span className="wa-j">{jam(p.created_at)}</span>
                  </div></div>);
              }) : <p className="hint" style={{ padding: 14 }}>Belum ada pesan.</p>}
              <div ref={bawah} />
            </div>
            <div className="wa-comp">
              <div className="wa-tpl">{TEMPLATE.map(([lb, t]) => <button key={lb} className="sort-btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => isiTemplate(t)}>{lb}</button>)}</div>
              <div className="wa-inp">
                <textarea value={teks} onChange={e => setTeks(e.target.value)} placeholder={th.bisaBalas ? 'Tulis balasan sebagai tim… (Enter kirim, Shift+Enter baris baru)' : 'Tidak bisa membalas sekarang'} disabled={!th.bisaBalas || busy} rows={2}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirim(); } }} />
                <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!th.bisaBalas || busy || !teks.trim()} onClick={kirim}>{busy ? 'Mengirim…' : 'Kirim ➤'}</button>
              </div>
              <div className="hint">
                {th.sisaJam > 0 ? <>Jendela balas 24 jam sejak pesan terakhir konsumen: <b style={{ color: th.sisaJam < 2 ? 'var(--red)' : 'var(--green)' }}>sisa {sisaTeks(th.sisaJam)}</b>. </> : <b style={{ color: 'var(--red)' }}>Jendela 24 jam sudah lewat — WhatsApp hanya menerima balasan setelah konsumen mengirim pesan lagi. </b>}
                {!th.nomorPengirim && 'Nomor pengirim project ini belum dikenal CRM (menunggu pesan pertama lewat webhook). '}
                {l && aiAktif(l) ? 'Balasan tim akan menghentikan AI untuk lead ini. ' : ''}Pesan dari CRM tercatat di riwayat follow up lead.
              </div>
            </div>
          </>)}
        </div>
      </div>
    </>
  );
}
