'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/components/util';
import Toast, { toast as tampil } from '@/components/Toast';
import { tesAlarm } from '@/components/LeadMasuk';
import InputRupiah from '@/components/InputRupiah';
import FormWA from '@/components/FormWA';
import { DATA_PENYARING, rapikanKriteria, teksKriteria } from '@/lib/kualitas-lead';

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const PERIODE = [['hari', 'Hari ini'], ['7', '7 hari'], ['bulan', 'Bulan ini'], ['30', '30 hari']];
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const lama = d => d == null ? '—' : d < 60 ? d + ' dtk' : (d / 60).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' mnt';
const jam = t => t ? new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(':', '.') : '';
const pendek = p => String(p || '').split(/\s+/)[0] || '—';
const tglID = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' }) : '';

function statusLead(rows, now) {
  const r = rows[rows.length - 1];
  if (r.status === 'menunggu') {
    const bk = new Date(r.batas_kuning).getTime(), jh = new Date(r.jam_hitung).getTime();
    if (now < jh) return { cls: 'ds-biru', teks: 'menunggu · dihitung mulai ' + jam(jh), waktu: '—' };
    return now < bk ? { cls: 'ds-kuning', teks: 'menunggu respon', waktu: 'sisa ' + mmss(bk - now) }
      : { cls: 'ds-merah', teks: r.terlambat ? 'terlambat — belum direspon' : 'lewat batas ideal', waktu: 'lewat ' + mmss(Math.max(now - bk, 0)) };
  }
  if (r.status === 'direspon') return { cls: 'ds-hijau', teks: `✓ direspon ${lama(r.detik_respon)}${r.respon_cara ? ' · ' + r.respon_cara : ''}`, waktu: '—' };
  if (r.status === 'dialihkan') return { cls: 'ds-merah', teks: 'dialihkan ke sales lain — tidak direspon', waktu: '—' };
  if (r.status === 'tanpa_sales') return { cls: 'ds-merah', teks: 'tidak ada sales tersedia', waktu: '—' };
  if (r.status === 'dipindah') return { cls: 'ds-abu', teks: 'dioper / ditutup manual', waktu: '—' };
  return { cls: 'ds-abu', teks: r.status, waktu: '—' };
}

function PanduanHP({ terbuka }) {
  const [tes, setTes] = useState('');
  return (<details className="card ds-panduan" open={terbuka}>
    <summary>📱 Panduan setelan HP sales — agar notifikasi lead selalu berbunyi</summary>
    <ol>
      <li><b>Pasang CRM sebagai aplikasi.</b> Android (Chrome): ⋮ → <i>Tambahkan ke layar utama / Instal aplikasi</i>. iPhone (Safari): tombol <i>Share</i> → <i>Add to Home Screen</i>, lalu selalu buka CRM dari ikon itu.</li>
      <li><b>Izinkan notifikasi</b> saat CRM meminta (tombol “Aktifkan notifikasi HP”). Bila terlanjur ditolak: Setelan HP → Aplikasi → Chrome → Notifikasi → Izinkan.</li>
      <li><b>Prioritas tinggi & bersuara (Android):</b> Setelan → Aplikasi → Chrome → Notifikasi → kategori situs <i>crm-sales-chl.vercel.app</i> → aktifkan <i>Suara</i>, <i>Pop-up di layar</i> / <i>Prioritas</i>.</li>
      <li><b>Matikan penghemat baterai untuk Chrome:</b> Setelan → Aplikasi → Chrome → Baterai → <i>Tidak dibatasi</i>. Tanpa ini notifikasi bisa terlambat saat layar mati.</li>
      <li><b>Jangan pakai Mode Jangan Ganggu</b> selama jam kerja (atau kecualikan Chrome / aplikasi CRM).</li>
      <li>Notifikasi lead <b>diulang tiap menit</b> sampai Anda menekan <i>WA sekarang</i> atau mencatat follow up. Saat CRM terbuka, pop-up berbunyi terus sampai lead dihubungi.</li>
    </ol>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={async () => {
        try { const d = await api('/api/distribusi', { method: 'POST', body: JSON.stringify({ aksi: 'tes' }) }); setTes(d.terkirim ? '✓ Notifikasi uji terkirim ke ' + d.terkirim + ' perangkat — cek HP Anda.' : 'Belum ada perangkat terdaftar — aktifkan notifikasi HP dulu di perangkat ini.'); }
        catch (e) { setTes(e.message); } }}>📲 Kirim notifikasi uji ke HP saya</button>
      <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => tesAlarm()}>🔊 Tes bunyi alarm di layar</button>
    </div>
    {tes && <p className="hint" style={{ marginTop: 6 }}>{tes}</p>}
  </details>);
}

export default function DistribusiPage() {
  const [me, setMe] = useState(null);
  const [d, setD] = useState(null);
  const [periode, setPeriode] = useState('bulan');
  const [cfg, setCfg] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [simpan, setSimpan] = useState(false);
  const [antri, setAntri] = useState(null);

  const muat = useCallback(() => api('/api/distribusi?periode=' + periode, { silent: true }).then(x => { setD(x); setCfg(c => c && c._ubah ? c : x.cfg); }).catch(e => tampil(e.message)), [periode]);
  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => {}); }, []);
  useEffect(() => { muat(); const t = setInterval(muat, 20000); return () => clearInterval(t); }, [muat]);
  useEffect(() => { if (!me || me.role === 'sales') return; const m = () => api('/api/distribusi?antrian=1', { silent: true }).then(setAntri).catch(() => {}); m(); const t = setInterval(m, 30000); return () => clearInterval(t); }, [me]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const offset = d ? new Date(d.now).getTime() - Date.now() : 0;
  const kini = now + offset;
  const manager = me?.role === 'manager';
  const sales = me?.role === 'sales';

  const perLead = useMemo(() => {
    if (!d) return [];
    const g = new Map();
    d.hari.forEach(r => { if (!g.has(r.lead_code)) g.set(r.lead_code, []); g.get(r.lead_code).push(r); });
    return [...g.values()].sort((a, b) => b[0].id - a[0].id);
  }, [d]);

  const statSales = useMemo(() => {
    if (!d) return [];
    const batas = (d.cfg?.batas_respon || 5) * 60;
    return d.sales.map(s => {
      const r = d.rentang.filter(x => x.username === s.username);
      const res = r.filter(x => x.status === 'direspon' && x.detik_respon != null);
      const rata = res.length ? Math.round(res.reduce((a, x) => a + x.detik_respon, 0) / res.length) : null;
      return { ...s, diterima: r.length, direspon: res.length, rata, cepat: res.length ? Math.round(res.filter(x => x.detik_respon <= batas).length / r.filter(x => x.status !== 'menunggu' && x.status !== 'dipindah').length * 100) || 0 : null,
        dialihkan: r.filter(x => x.status === 'dialihkan').length, menunggu: r.filter(x => x.status === 'menunggu').length };
    });
  }, [d]);

  async function ubahTersedia(s, ya, sampai) {
    try { await api('/api/distribusi', { method: 'POST', body: JSON.stringify({ aksi: 'tersedia', username: s.username, tersedia: ya, sampai: sampai || null }) }); muat(); tampil(ya ? s.name + ' kembali menerima lead' : s.name + ' tidak menerima lead baru' + (sampai ? ' s.d. ' + tglID(sampai) : '')); }
    catch (e) { tampil(e.message); }
  }
  async function simpanAturan(baru) {
    setSimpan(true);
    try { const x = await api('/api/distribusi', { method: 'POST', body: JSON.stringify({ aksi: 'setelan', cfg: baru }) }); setCfg(x.cfg); tampil('Aturan distribusi tersimpan'); muat(); }
    catch (e) { tampil(e.message); } finally { setSimpan(false); }
  }
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v, _ubah: true }));

  if (!me || !d || !cfg) return <div className="loading">Memuat…</div>;
  if (!['manager', 'ceo', 'sales'].includes(me.role)) return <div className="card"><h2>Distribusi Lead</h2><p className="hint">Menu ini untuk Manager & Sales.</p></div>;

  const kpiHari = (() => {
    const leads = perLead.filter(rs => (new Date(rs[0].mulai).getTime() + 7 * 3600e3) >= new Date(d.today + 'T00:00:00Z').getTime());
    // Dasar persentase: setiap penugasan yang sudah selesai (direspon atau dialihkan karena tidak merespon)
    const selesai = d.hari.filter(r => r.sales && ['direspon', 'dialihkan'].includes(r.status));
    const cepat = selesai.filter(r => r.status === 'direspon' && r.detik_respon <= cfg.batas_respon * 60).length;
    return { masuk: leads.length, menunggu: perLead.filter(rs => rs[rs.length - 1].status === 'menunggu').length,
      cepat: selesai.length ? Math.round(cepat / selesai.length * 100) + '%' : '—', dialihkan: d.hari.filter(r => r.status === 'dialihkan').length };
  })();
  const cronHidup = d.cron && kini - new Date(d.cron).getTime() < 3 * 60e3;
  const urlCron = typeof window !== 'undefined' && cfg.kunci ? `${window.location.origin}/api/cron/distribusi-lead?key=${cfg.kunci}` : '';
  const saya = sales ? d.sales[0] : null;
  const st = sales ? statSales[0] : null;

  return (<>
    <div className="page-head">
      <div><h1>Distribusi Lead</h1>
        <div className="sub">{sales ? 'Lead baru dibagi bergiliran ke sales · hubungi dalam ' + cfg.batas_respon + ' menit, lewat ' + cfg.batas_oper + ' menit dialihkan ke sales lain'
          : 'Lead baru dibagi otomatis bergiliran ke sales project · batas respon dihitung pada jam kerja ' + cfg.jam_mulai.replace(':', '.') + '–' + cfg.jam_selesai.replace(':', '.')}</div></div>
      {manager && <button className={'ds-saklar' + (cfg.aktif ? ' on' : '')} onClick={() => { if (cfg.aktif && !confirm('Matikan distribusi otomatis?\n\nLead baru tidak dibagi otomatis & tidak ada batas respon sampai diaktifkan lagi.')) return; simpanAturan({ ...cfg, aktif: !cfg.aktif }); }}>
        <i />{cfg.aktif ? 'Distribusi otomatis AKTIF' : 'Distribusi otomatis MATI'}</button>}
      {sales && saya && <button className={'ds-saklar' + (saya.tersedia ? ' on' : '')} onClick={() => ubahTersedia(saya, !saya.tersedia)}>
        <i />{saya.tersedia ? 'Saya tersedia menerima lead' : 'Tidak tersedia' + (saya.tersedia_sampai ? ' s.d. ' + tglID(saya.tersedia_sampai) : '')}</button>}
    </div>

    {!cfg.aktif && <div className="note">Distribusi otomatis sedang <b>dimatikan</b> — lead baru tanpa sales menunggu dioper manual oleh Marcom / Manager.</div>}
    {sales && saya && !saya.tersedia && <div className="note">Anda tidak menerima lead baru{saya.tersedia_sampai ? ' sampai ' + tglID(saya.tersedia_sampai) : ''}. Aktifkan lagi bila sudah kembali bekerja.
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>Sampai: <input type="date" value={saya.tersedia_sampai || ''} onChange={e => ubahTersedia(saya, false, e.target.value)} /></span></div>}

    <div className="kpi-grid" style={{ marginBottom: 14 }}>
      {sales ? (<>
        <div className="kpi"><div className="kpi-label">Lead diterima · bulan ini</div><div className="kpi-val">{st?.diterima || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Rata-rata respon</div><div className="kpi-val">{lama(st?.rata)}</div></div>
        <div className="kpi"><div className="kpi-label">Respon ≤ {cfg.batas_respon} menit</div><div className="kpi-val">{st?.cepat == null ? '—' : st.cepat + '%'}</div></div>
        <div className="kpi"><div className="kpi-label">Dialihkan (tidak merespon)</div><div className="kpi-val" style={{ color: st?.dialihkan ? 'var(--red)' : undefined }}>{st?.dialihkan || 0}</div></div>
      </>) : (<>
        <div className="kpi"><div className="kpi-label">Lead masuk hari ini</div><div className="kpi-val">{kpiHari.masuk}</div></div>
        <div className="kpi"><div className="kpi-label">Menunggu respon</div><div className="kpi-val" style={{ color: kpiHari.menunggu ? 'var(--brass)' : undefined }}>{kpiHari.menunggu}</div></div>
        <div className="kpi"><div className="kpi-label">Respon ≤ {cfg.batas_respon} mnt · hari ini</div><div className="kpi-val">{kpiHari.cepat}</div></div>
        <div className="kpi"><div className="kpi-label">Dialihkan hari ini</div><div className="kpi-val" style={{ color: kpiHari.dialihkan ? 'var(--red)' : undefined }}>{kpiHari.dialihkan}</div></div>
      </>)}
    </div>

    <div className="ds-top">
      <div>
      <div className="card">
        <h2>⏱️ {sales ? 'Lead saya hari ini' : 'Lead masuk hari ini — status respon'}</h2>
        {!perLead.length ? <p className="hint">Belum ada lead yang dibagi hari ini.</p> : (
          <table className="ds-tbl"><thead><tr><th>Lead</th><th>Sales</th><th>Waktu</th><th>Status</th></tr></thead><tbody>
            {perLead.map(rs => { const r = rs[rs.length - 1], s = statusLead(rs, kini);
              const rantai = rs.filter(x => x.sales).map(x => x.sales).reverse();
              return (<tr key={r.lead_code}>
                <td className="mb-judul"><b>{r.nama || r.lead_code}</b><small>{pendek(r.project)} · {r.sumber || '—'} · masuk {jam(rs[0].mulai)}{r.mode === 'manual' ? ' · dioper manual' : ''}</small></td>
                <td>{rantai.length ? <><b>{rantai[0]}</b>{rantai.length > 1 && <small>← {rantai.slice(1).join(' ← ')}</small>}</> : '—'}</td>
                <td className="ds-waktu">{s.waktu}</td>
                <td><span className={'ds-chip ' + s.cls}>{s.teks}</span>{rs.some(x => x.status === 'dialihkan') && <small>dialihkan {rs.filter(x => x.status === 'dialihkan').length}× · {cfg.batas_oper} mnt tanpa respon</small>}</td>
              </tr>); })}
          </tbody></table>)}
      </div>
      {!sales && antri && <div className="card" style={{ marginTop: 14 }}>
        <h2>📤 Antrian Marcom — belum dioper ({antri.antrian.length})</h2>
        {!antri.antrian.length ? <p className="hint">Semua lead sudah dioper ke sales.</p> : (
          <table className="ds-tbl"><thead><tr><th>Lead</th><th>Kualitas</th><th>Dibagi otomatis</th></tr></thead><tbody>
            {[...antri.antrian].sort((a, b) => (a.label === 'siap' ? 0 : 1) - (b.label === 'siap' ? 0 : 1)).slice(0, 15).map(x => { const sisa = x.batas_bagi ? new Date(x.batas_bagi).getTime() - kini : null;
              return (<tr key={x.lead_code}>
                <td className="mb-judul"><b>{x.nama}</b><small>{x.lead_code} · {pendek(x.project)} · {x.sumber || '—'} · masuk {jam(x.masuk)}</small></td>
                <td><span className={'ds-chip ' + (x.label === 'siap' ? 'ds-merah' : x.label === 'nurture' ? 'ds-kuning' : 'ds-abu')}>{x.ikon} {x.teks}</span>{x.label !== 'siap' && <small>kurang: {x.kurang.slice(0, 3).join(', ')}</small>}</td>
                <td className="ds-waktu">{sisa == null ? '—' : sisa > 0 ? 'dalam ' + mmss(sisa) : 'segera'}</td>
              </tr>); })}
          </tbody></table>)}
      </div>}
      </div>

      {manager ? (<div className="card">
        <h2>⚙️ Aturan pembagian</h2>
        <div className="ds-aturan">
          <div className="field"><label>Jam kerja mulai</label><input type="time" value={cfg.jam_mulai} onChange={e => set('jam_mulai', e.target.value)} /></div>
          <div className="field"><label>Jam kerja selesai</label><input type="time" value={cfg.jam_selesai} onChange={e => set('jam_selesai', e.target.value)} /></div>
          <div className="field"><label>Target respon (menit)</label><input type="number" min="1" value={cfg.batas_respon} onChange={e => set('batas_respon', e.target.value)} /></div>
          <div className="field"><label>Dialihkan setelah (menit)</label><input type="number" min="2" value={cfg.batas_oper} onChange={e => set('batas_oper', e.target.value)} /></div>
          <div className="field"><label>Maks. dialihkan per lead</label><input type="number" min="0" max="5" value={cfg.maks_oper} onChange={e => set('maks_oper', e.target.value)} /></div>
          <div className="field"><label>Lewati sales dgn lead belum direspon &gt;</label><input type="number" min="1" value={cfg.maks_antrian} onChange={e => set('maks_antrian', e.target.value)} /></div>
          <div className="field"><label>Ulang notifikasi tiap (menit)</label><input type="number" min="1" max="30" value={cfg.ulang_notif} onChange={e => set('ulang_notif', e.target.value)} /></div>
          <div className="field"><label>Tunggu Marcom oper (menit)</label><input type="number" min="0" value={cfg.tunggu_marcom} onChange={e => set('tunggu_marcom', e.target.value)} /></div>
          <div className="field penuh"><label>Lead yang dibagi otomatis</label><select value={cfg.hanya_siap ? '1' : '0'} onChange={e => set('hanya_siap', e.target.value === '1')}>
            <option value="1">Hanya lead 🔥 Siap oper (nama jelas + min. 2 data penyaring)</option><option value="0">Semua lead tanpa sales</option></select></div>
          <div className="field penuh ds-kriteria"><label>🔥 Kriteria Siap oper</label>
            {(() => { const K = rapikanKriteria(cfg.kriteria); const setK = (k, v) => set('kriteria', { ...K, [k]: v });
              return (<div className="ds-krit">
                <label className="ds-cek"><input type="checkbox" checked={K.nama_wajib} onChange={e => setK('nama_wajib', e.target.checked)} /> Nama jelas wajib (bukan "WA 08xx")</label>
                <div className="ds-krit-sub">Data penyaring yang dihitung:</div>
                <div className="ds-hari">{DATA_PENYARING.map(([k, l]) => (<label key={k}><input type="checkbox" checked={K.data.includes(k)}
                  onChange={e => setK('data', e.target.checked ? [...K.data, k] : K.data.filter(x => x !== k))} />{l}</label>))}</div>
                <label className="ds-cek">Minimal <input type="number" min="0" max={K.data.length} value={K.minimal} style={{ width: 64 }} onChange={e => setK('minimal', e.target.value)} /> data dari {K.data.length} yang dicentang harus terisi</label>
                <label className="ds-cek"><input type="checkbox" checked={K.jauh_nurture} onChange={e => setK('jauh_nurture', e.target.checked)} /> Rencana beli &gt; 6 bulan = nurture (tidak dibagi ke sales)</label>
                <div className="ds-krit-sub">Budget minimal per project (kosongkan = bebas):</div>
                <div className="ds-aturan">{(d.projects || []).map(p => (<div className="field" key={p}><label>{p}</label>
                  <InputRupiah value={K.budget_min[p] || ''} onChange={e => setK('budget_min', { ...K.budget_min, [p]: Number(e.target.value) || 0 })} placeholder="bebas" /></div>))}</div>
                <p className="hint" style={{ margin: 0 }}>Aturan sekarang: <b>{teksKriteria(K)}</b>. Lead dengan budget terisi tapi di bawah minimum tidak menjadi 🔥.</p>
              </div>); })()}</div>
          <div className="field penuh"><label>Hari kerja</label><div className="ds-hari">{HARI.map((h, n) => (<label key={h}><input type="checkbox" checked={cfg.hari.includes(n)}
            onChange={e => set('hari', e.target.checked ? [...cfg.hari, n] : cfg.hari.filter(x => x !== n))} />{h}</label>))}</div></div>
          <div className="field penuh"><label>Pesan pembuka WA (otomatis terisi)</label><textarea rows={3} value={cfg.pesan} onChange={e => set('pesan', e.target.value)} />
            <span className="hint">Kode: {'{sapaan}'} {'{nama}'} {'{sales}'} {'{project}'}</span></div>
        </div>
        <p className="hint" style={{ margin: '10px 0' }}>Lead masuk ke antrian Marcom dulu · {cfg.tunggu_marcom > 0 ? `lead ${cfg.hanya_siap ? '🔥 ' : ''}yang belum dioper ${cfg.tunggu_marcom} menit (jam kerja) dibagi otomatis bergiliran` : 'lead langsung dibagi bergiliran tanpa menunggu Marcom'} · oper manual Marcom ikut dihitung dalam giliran · lead Drop &gt; 90 hari yang chat lagi masuk antrian lagi.</p>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={simpan} onClick={() => { const { _ubah, kunci, mulai, ...b } = cfg; simpanAturan(b); }}>{simpan ? 'Menyimpan…' : 'Simpan aturan'}</button>
      </div>) : (<div className="card">
        <h2>⚙️ Aturan</h2>
        <ul className="ds-langkah" style={{ marginLeft: 16 }}>
          <li>Jam kerja {cfg.jam_mulai.replace(':', '.')}–{cfg.jam_selesai.replace(':', '.')} ({cfg.hari.length === 7 ? 'setiap hari' : cfg.hari.map(n => HARI[n]).join(', ')})</li>
          <li>Hubungi lead dalam <b>{cfg.batas_respon} menit</b> — lewat <b>{cfg.batas_oper} menit</b> tanpa respon, lead dialihkan ke sales lain</li>
          <li>Dianggap merespon: tekan <i>WA sekarang</i>, catat follow up, atau buat janji temu</li>
          <li>Berlaku untuk lead yang dioper Marcom maupun yang dibagi otomatis</li>
          <li>Notifikasi diulang tiap {cfg.ulang_notif} menit sampai lead direspon</li>
        </ul>
      </div>)}
    </div>

    {!sales && <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>📊 Kecepatan respon sales</h2>
        <div className="ds-periode">{PERIODE.map(([k, l]) => <button key={k} className={periode === k ? 'on' : ''} onClick={() => setPeriode(k)}>{l}</button>)}</div>
      </div>
      <div style={{ overflowX: 'auto' }}><table className="ds-tbl"><thead><tr><th>Sales</th><th>Lead diterima</th><th>Rata-rata respon</th><th>Respon ≤ {cfg.batas_respon} mnt</th><th>Dialihkan</th><th>Ketersediaan</th></tr></thead><tbody>
        {statSales.map(s => (<tr key={s.username}>
          <td className="mb-judul"><b>{s.name}</b><small>{Array.isArray(s.projects) && s.projects.length ? s.projects.map(pendek).join(', ') : 'semua project'}</small></td>
          <td>{s.diterima}{s.menunggu ? <small>{s.menunggu} menunggu</small> : null}</td>
          <td className="ds-waktu">{lama(s.rata)}</td>
          <td>{s.cepat == null ? '—' : <span className={'ds-chip ' + (s.cepat >= 80 ? 'ds-hijau' : s.cepat >= 60 ? 'ds-kuning' : 'ds-merah')}>{s.cepat}%</span>}</td>
          <td style={{ color: s.dialihkan ? 'var(--red)' : undefined, fontWeight: 800 }}>{s.dialihkan}</td>
          <td>{manager ? (<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className={'ds-chip ' + (s.tersedia ? 'ds-hijau' : 'ds-kuning')} style={{ border: 0, cursor: 'pointer' }} onClick={() => ubahTersedia(s, !s.tersedia)}>{s.tersedia ? '✓ tersedia' : '🌴 tidak tersedia'}</button>
            {!s.tersedia && <input type="date" value={s.tersedia_sampai || ''} title="Tidak tersedia sampai tanggal" onChange={e => ubahTersedia(s, false, e.target.value)} style={{ fontSize: 12 }} />}</span>)
            : <span className={'ds-chip ' + (s.tersedia ? 'ds-hijau' : 'ds-kuning')}>{s.tersedia ? '✓ tersedia' : '🌴 tidak tersedia' + (s.tersedia_sampai ? ' s.d. ' + tglID(s.tersedia_sampai) : '')}</span>}</td>
        </tr>))}
      </tbody></table></div>
    </div>}

    {manager && <div className="card" style={{ marginTop: 14 }}>
      <h2>⏲️ Pengecek otomatis tiap menit (cron-job.org)</h2>
      <p style={{ fontSize: 13.5 }}>{cronHidup ? <span className="ds-chip ds-hijau">✓ Terpasang · terakhir jalan {jam(d.cron)}</span>
        : <span className="ds-chip ds-merah">Belum terpasang</span>}{' '}
        <span className="hint">{cronHidup ? 'Lead dibagi, notifikasi diulang & lead dialihkan tepat waktu walau tidak ada yang membuka CRM.' : 'Sementara ini pengecekan hanya berjalan saat ada yang membuka CRM — pasang agar pengalihan 10 menit selalu tepat waktu.'}</span></p>
      <div className="ds-url" style={{ marginTop: 8 }}><code>{urlCron}</code>
        <button className="sort-btn" onClick={() => { navigator.clipboard?.writeText(urlCron).then(() => tampil('Link disalin')).catch(() => {}); }}>Salin</button></div>
      <ol className="ds-langkah">
        <li>Buka <b>cron-job.org</b> → <i>Sign up</i> (gratis) lalu login.</li>
        <li>Klik <b>CREATE CRONJOB</b>. Title: <i>CRM Distribusi Lead</i>. URL: tempel link di atas.</li>
        <li>Execution schedule: <b>Every 1 minute(s)</b> → <b>CREATE</b>.</li>
        <li>Dalam 1–2 menit status di atas berubah menjadi <b>✓ Terpasang</b>. Link ini rahasia — jangan dibagikan.</li>
      </ol>
      <button className="btn btn-ghost" style={{ width: 'auto', marginTop: 10, padding: '8px 16px' }} onClick={async () => {
        try { const x = await api('/api/distribusi', { method: 'POST', body: JSON.stringify({ aksi: 'jalankan' }) }); tampil(`Dicek: ${x.dibagi || 0} dibagi · ${x.dialihkan || 0} dialihkan · ${x.notif || 0} notifikasi`); muat(); }
        catch (e) { tampil(e.message); } }}>Jalankan pengecekan sekarang</button>
    </div>}

    {manager && <FormWA />}

    <div style={{ marginTop: 14 }}><PanduanHP terbuka={sales} /></div>
    <Toast />
  </>);
}
