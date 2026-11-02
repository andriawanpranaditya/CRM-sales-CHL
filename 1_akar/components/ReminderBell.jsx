'use client';
import { useEffect, useRef, useState } from 'react';
import { api, fmtDate, bukaWA } from '@/components/util';
import NotifikasiHP from '@/components/NotifikasiHP';

// Suara "ding" dua nada dibuat langsung oleh browser (tanpa file audio)
function playChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                       // WebView lawas tanpa Web Audio
    const ctx = new AC();
    // iOS memulai audio dalam keadaan tertahan sampai ada sentuhan pengguna
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const ding = (freq, t0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + 0.55);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + 0.6);
    };
    ding(880, 0);      // A5
    ding(1174.66, 0.18); // D6
    // iOS tidak mendukung getaran; Android akan menjalankannya
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch {}
}

// Safari mode penyamaran melempar error saat localStorage disentuh — semua
// akses dibungkus agar kegagalan penyimpanan tidak menghentikan pemuatan data.
const simpanAman = {
  ambil(k) { try { return localStorage.getItem(k); } catch { return null; } },
  simpan(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

export default function ReminderBell({ user }) {
  const [data, setData] = useState(null);
  const [notif, setNotif] = useState(null);   // notifikasi lintas divisi (alur penjualan)
  const [open, setOpen] = useState(false);
  const notified = useRef(false);
  const dataRef = useRef(null);

  const jumlahNotifRef = useRef(-1);   // untuk mendeteksi pemberitahuan yang benar-benar baru

  async function load() {
    try {
      const d = await api('/api/reminders');
      setData(d); dataRef.current = d;
      try {
        const n = await api('/api/notifikasi');
        setNotif(n);
        // Pemberitahuan lintas divisi yang baru tiba -> tampilkan notifikasi browser & bunyi
        const belum = Number((n && n.belum) || 0);
        if (jumlahNotifRef.current >= 0 && belum > jumlahNotifRef.current) {
          const terbaru = ((n && n.rows) || []).find(x => !x.dibaca);
          if (terbaru && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try { new Notification('Harmoni One — ' + terbaru.judul, { body: terbaru.pesan || '', icon: '/icon-192.png', badge: '/icon-192.png' }); } catch {}
          }
          try { playChime(); } catch {}
        }
        jumlahNotifRef.current = belum;
      } catch {}
      // Notifikasi browser (sekali per hari per perangkat, bila diizinkan)
      if (d.total > 0 && typeof Notification !== 'undefined' && Notification.permission === 'granted' && !notified.current) {
        const key = 'crm_notif_' + d.today;
        if (!simpanAman.ambil(key)) {
          new Notification('Harmoni One — Pengingat', {
            body: `📅 ${d.hariIni.length} FU hari ini` + (d.terlambat.length ? ` · ⚠️ ${d.terlambat.length} terlambat` : '') + ((d.stok || []).length ? ` · 🗺 ${d.stok.length} unit perlu ditandai di Master Stock` : ''),
            icon: '/icon-192.png', badge: '/icon-192.png',
          });
          simpanAman.simpan(key, '1');
          notified.current = true;
        }
      }
    } catch {}
  }

  useEffect(() => {
    load();
    // Periksa tiap 30 detik agar pemberitahuan antar divisi terasa langsung;
    // berhenti saat tab tidak dilihat dan segera memeriksa ulang begitu dibuka kembali
    // Periksa tiap 60 detik selama layar terlihat (hemat kuota database)
    const t = setInterval(() => { if (!document.hidden) load(); }, 60 * 1000);
    const kembali = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', kembali);

    // Bunyi "ding" + getar pada interaksi PERTAMA pengguna hari ini bila ada FU jatuh tempo
    // (browser hanya mengizinkan suara setelah pengguna menyentuh halaman)
    const onFirstTouch = () => {
      const d = dataRef.current;
      if (d && d.total > 0) {
        const key = 'crm_chime_' + d.today;
        if (!simpanAman.ambil(key)) {
          playChime();
          simpanAman.simpan(key, '1');
        }
      }
      window.removeEventListener('pointerdown', onFirstTouch);
      window.removeEventListener('keydown', onFirstTouch);
    };
    window.addEventListener('pointerdown', onFirstTouch);
    window.addEventListener('keydown', onFirstTouch);

    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', kembali);
      window.removeEventListener('pointerdown', onFirstTouch);
      window.removeEventListener('keydown', onFirstTouch);
    };
  }, []);

  const belumBaca = notif ? notif.belum : 0;
  const total = (data ? data.total : 0) + belumBaca;

  function toggle() {
    if (!open && data && data.total > 0) playChime();
    setOpen(v => !v);
    // Minta izin notifikasi browser saat pertama kali lonceng dibuka
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  const Item = ({ r, late }) => (
    <a href={'/form?tab=fu&lead=' + encodeURIComponent(r.lead_code)} className="rem-item" style={late ? { borderLeftColor: 'var(--red)' } : {}}>
      <span>
        <b>{r.nama}</b> <span className="hint">({r.lead_code}{r.project ? ' · ' + r.project : ''})</span>
        {user.role !== 'sales' && (r.sales || r.markom)
          ? <span className="hint"> — {r.sales ? r.sales : null}{r.markom ? <span style={{ color: '#28527A' }}>{r.sales ? ' · ' : ''}Marcom: {r.markom}</span> : null}</span>
          : null}
        <br /><span className="hint">WA: {r.wa || '-'} · Jadwal: {fmtDate(r.next_fu)}{r.fu_label ? ' · ' + r.fu_label : ''}</span>
      </span>
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <span className={'badge ' + (late ? 'b-overdue' : 'b-today')}>{late ? 'TERLAMBAT' : 'HARI INI'}</span>
        {r.wa ? <span className="badge b-close" style={{ cursor: 'pointer' }}
          onClick={e => { e.preventDefault(); e.stopPropagation(); bukaWA(r.wa, ''); }}>📲 WA</span> : null}
      </span>
    </a>
  );

  return (
    <div className="bell-wrap">
      <button className={'bell-btn' + (total ? ' has' : '')} onClick={toggle} aria-label="Pengingat follow up">
        🔔{total > 0 && <span className="bell-badge">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && <>
        <div className="bell-backdrop" onClick={() => setOpen(false)} />
        <div className="bell-panel">
          <div className="bell-head">Pemberitahuan {data ? '— ' + fmtDate(data.today) : ''}</div>
          <div style={{ padding: '0 12px' }}><NotifikasiHP mode="panel" /></div>
          {belumBaca > 0 && (
            <div className="bell-list" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="bell-sub">📣 Alur penjualan ({belumBaca} baru)</div>
              {notif.rows.filter(n => !n.dibaca).slice(0, 12).map(n => (
                <a key={n.id} href="/verifikasi" className="rem-item" style={{ borderLeftColor: 'var(--brass)' }}
                   onClick={() => api('/api/notifikasi', { method: 'POST', body: JSON.stringify({ id: n.id }) }).catch(() => {})}>
                  <span><b>{n.judul}</b><br /><span className="hint">{n.pesan}</span>
                    {n.jml_divisi > 1 && <><br /><span className="hint">Terkirim ke {n.jml_divisi} divisi: {n.divisi}</span></>}
                  </span>
                  <span className="badge b-warm">BARU</span>
                </a>
              ))}
              <div style={{ padding: '6px 14px' }}>
                <a href="#" className="hint" onClick={e => { e.preventDefault();
                  api('/api/notifikasi', { method: 'POST', body: JSON.stringify({ semua: true }) })
                    .then(() => api('/api/notifikasi')).then(setNotif).catch(() => {}); }}>
                  Tandai semua sudah dibaca</a>
              </div>
            </div>
          )}
          {!data || !data.total ? (
            belumBaca ? null : <div className="hint" style={{ padding: '14px 16px' }}>✅ Tidak ada pengingat. Mantap!</div>
          ) : (
            <div className="bell-list">
              {(data.celah || []).length > 0 && <>
                <div className="bell-sub">📩 Lead masuk belum tercatat</div>
                {data.celah.map(c => {
                  const web = c.sumber.startsWith('Website');
                  const t7 = data.celahTotal ? (web ? data.celahTotal.web : data.celahTotal.meta) : null;
                  return (
                    <a key={c.sumber} href="/form" className="rem-item" style={{ borderLeftColor: 'var(--red)' }}>
                      <span><b>{c.sumber}</b> <span className="hint">· {c.dari === c.sampai ? fmtDate(c.dari) : fmtDate(c.dari) + '–' + fmtDate(c.sampai)}</span><br />
                        <span className="hint">Platform <b>{c.platform}</b>{web ? ' klik WA' : ' percakapan'}, CRM baru <b>{c.crm}</b> lead
                          {t7 ? <> · 7 hari: {t7.platform} vs {t7.crm}</> : null} — cek chat WA &amp; input lead yang belum masuk.</span></span>
                      <span className="badge b-overdue">+{c.platform - c.crm}</span>
                    </a>);
                })}
              </>}
              {(data.tunggakanCrm || []).length > 0 && <><div className="bell-sub">💰 Tunggakan — Collection CRM ({data.tunggakanCrm.length})</div>
                {data.tunggakanCrm.map(r => (<a key={'tg' + r.id} href={'/collection?tab=tagihan&lead=' + r.lead_code} className="rem-item" style={{ borderLeftColor: 'var(--red)' }}>
                  <span><b>{r.nama}</b> · {r.unit}<br /><span className="hint">{r.ket} · lewat {r.hariLewat} hari · sisa Rp{Number(r.sisa || 0).toLocaleString('id-ID')}</span></span></a>))}</>}
              {(data.jatuhTempoCrm || []).length > 0 && <><div className="bell-sub">📅 Jatuh tempo hari ini / besok — Collection CRM ({data.jatuhTempoCrm.length})</div>
                {data.jatuhTempoCrm.map(r => (<a key={'jt' + r.id} href={'/collection?tab=tagihan&lead=' + r.lead_code} className="rem-item" style={{ borderLeftColor: 'var(--blue)' }}>
                  <span><b>{r.nama}</b> · {r.unit}<br /><span className="hint">{r.ket} · {fmtDate(r.jatuh_tempo)} · Rp{Number(r.sisa || 0).toLocaleString('id-ID')}</span></span></a>))}</>}
              {(data.akadCrm || []).length > 0 && <><div className="bell-sub">🏦 Akad KPR ({data.akadCrm.length})</div>
                {data.akadCrm.map(a => (<a key={'ak' + a.id} href={'/kpr-proses?id=' + a.id} className="rem-item" style={{ borderLeftColor: a.lewat ? 'var(--red)' : 'var(--brass)' }}>
                  <span><b>{a.nama}</b> · {a.unit}<br /><span className="hint">{fmtDate(a.tgl)}{a.bank ? ' · ' + a.bank : ''}{a.lewat ? ' · realisasi belum diisi' : ''}</span></span></a>))}</>}
              {(data.kendalaCrm || []).length > 0 && <><div className="bell-sub">⚠ Kendala berkas / bank ({data.kendalaCrm.length})</div>
                {data.kendalaCrm.map(k => (<a key={'kd' + k.id} href={'/kpr-proses?id=' + k.id} className="rem-item" style={{ borderLeftColor: 'var(--brass)' }}>
                  <span><b>{k.nama}</b> · {k.unit}<br /><span className="hint">{k.kendala} · {k.hari} hari</span></span></a>))}</>}
              {(data.janjian || []).length > 0 && <>
                <div className="bell-sub">📅 Janjian visit ({data.janjian.length})</div>
                {data.janjian.map(j => (
                  <a key={'j' + j.id} href="/janjian" className="rem-item" style={{ borderLeftColor: j.perlu_update ? 'var(--red)' : 'var(--blue)' }}>
                    <span><b>{j.nama || j.lead_code}</b> <span className="hint">({j.jenis}{user.role !== 'sales' ? ' · ' + j.sales : ''})</span>
                      <br /><span className="hint">{fmtDate(j.tgl)} pukul {String(j.jam).replace(':', '.')} · {j.lokasi}</span></span>
                    <span className={'badge ' + (j.perlu_update ? 'b-overdue' : j.tgl === data.today ? 'b-today' : 'b-new')}>{j.perlu_update ? 'PERLU UPDATE' : j.tgl === data.today ? 'HARI INI' : 'BESOK'}</span>
                  </a>))}
              </>}
              {(data.belumDisentuh || []).length > 0 && <>
                <div className="bell-sub">⏱ Lead baru belum disentuh &gt; 1 jam ({data.belumDisentuh.length})</div>
                {data.belumDisentuh.map(r => (
                  <a key={'bd' + r.lead_code} href={'/form?tab=fu&lead=' + encodeURIComponent(r.lead_code)} className="rem-item" style={{ borderLeftColor: 'var(--red)' }}>
                    <span><b>{r.nama}</b> <span className="hint">({r.lead_code}{r.project ? ' · ' + r.project : ''}{user.role !== 'sales' ? ' · ' + r.sales : ''})</span>
                      <br /><span className="hint">Diterima {r.jam} jam lalu · wajib Sentuhan 1 (Hari 1) segera</span></span>
                    <span className="badge b-overdue">SEGERA</span>
                  </a>))}
              </>}
              {(data.terlambat.length + data.hariIni.length) > 0 && ((data.janjian || []).length + (data.belumDisentuh || []).length) > 0 && <div className="bell-sub">Follow up</div>}
              {data.terlambat.map(r => <Item key={'t' + r.lead_code} r={r} late />)}
              {data.hariIni.map(r => <Item key={'h' + r.lead_code} r={r} />)}
              {(data.ttd || []).length > 0 && <>
                <div className="bell-sub">✍ Batas tanda tangan konsumen ({data.ttd.length})</div>
                {data.ttd.map(t => {
                  const telat = t.ttd_deadline < data.today;
                  return (
                    <a key={'s' + t.id} href="/alur" className="rem-item"
                       style={{ borderLeftColor: telat ? 'var(--red)' : 'var(--brass)' }}>
                      <span><b>{t.nama || t.lead_code}</b><br />
                        <span className="hint">{t.project} {t.unit} · batas {fmtDate(t.ttd_deadline)}</span></span>
                      <span className={'badge ' + (telat ? 'b-overdue' : 'b-warm')}>
                        {telat ? 'LEWAT BATAS' : 'SEGERA'}</span>
                    </a>);
                })}
              </>}
              {(data.tugas || []).length > 0 && <>
                <div className="bell-sub">⛭ Pekerjaan divisi ({data.tugas.length})</div>
                {data.tugas.map(t => {
                  const telat = t.deadline < data.today;
                  const iniHari = t.deadline === data.today;
                  return (
                    <a key={'g' + t.id} href="/proses" className="rem-item"
                       style={{ borderLeftColor: telat ? 'var(--red)' : 'var(--brass)' }}>
                      <span><b>{t.judul}</b><br />
                        <span className="hint">{t.nama || t.lead_code} · {t.project} {t.unit} · tenggat {fmtDate(t.deadline)}</span></span>
                      <span className={'badge ' + (telat ? 'b-overdue' : 'b-warm')}>
                        {telat ? 'TERLAMBAT' : iniHari ? 'HARI INI' : 'SEGERA'}</span>
                    </a>);
                })}
              </>}
              {(data.reservasi || []).length > 0 && <>
                <div className="bell-sub">⏳ Batas reservasi ({data.reservasi.length})</div>
                {data.reservasi.map(r => {
                  const lewat = r.tgl_expire < data.today;
                  return (
                    <a key={'rs' + r.id} href="/booking" className="rem-item"
                       style={{ borderLeftColor: lewat ? 'var(--red)' : 'var(--brass)' }}>
                      <span><b>{r.nama || r.lead_code}</b> · {r.project} {r.unit}<br />
                        <span className="hint">{lewat ? 'Reservasi berakhir ' + fmtDate(r.tgl_expire) + ' — unit dilepas; melanjutkan butuh otorisasi Manager Sales'
                          : 'Berlaku sampai ' + fmtDate(r.tgl_expire) + ' — segera Booking atau ajukan perpanjangan'}</span></span>
                      <span className={'badge ' + (lewat ? 'b-overdue' : 'b-warm')}>{lewat ? 'KEDALUWARSA' : 'SEGERA'}</span>
                    </a>);
                })}
              </>}
              {(data.tagihan || []).length > 0 && <>
                <div className="bell-sub">💳 Tagihan jatuh tempo ({data.tagihan.length})</div>
                {data.tagihan.map(t => {
                  const telat = t.jatuh_tempo < data.today;
                  const iniHari = t.jatuh_tempo === data.today;
                  return (
                    <a key={'tg' + t.id} href="/piutang" className="rem-item"
                       style={{ borderLeftColor: telat ? 'var(--red)' : 'var(--brass)' }}>
                      <span><b>{t.nama_konsumen || t.lead_code}</b> · {t.nama}<br />
                        <span className="hint">{t.project} {t.unit} · Rp {Number(t.sisa).toLocaleString('id-ID')} · jatuh tempo {fmtDate(t.jatuh_tempo)}</span></span>
                      <span className={'badge ' + (telat ? 'b-overdue' : 'b-warm')}>
                        {telat ? 'TERLAMBAT' : iniHari ? 'HARI INI' : 'SEGERA'}</span>
                    </a>);
                })}
              </>}
              {(data.stok || []).length > 0 && <>
                <div className="bell-sub">🗺 Penjualan baru — tandai di Master Stock ({data.stok.length})</div>
                {data.stok.map(u => (
                  <a key={u.project + u.unit} href="/stock" className="rem-item" style={{ borderLeftColor: u.warna === 'merah' ? 'var(--red)' : 'var(--brass)' }}>
                    <span><b>{u.unit}</b> <span className="hint">({u.project})</span><br />
                      <span className="hint">Klik untuk membuka Master Stock &amp; tandai lokasinya</span></span>
                    <span className={'badge ' + (u.warna === 'merah' ? 'b-lost' : 'b-warm')}>{u.warna === 'merah' ? 'TERJUAL' : 'RESERVED'}</span>
                  </a>
                ))}
              </>}
            </div>
          )}
          <div className="bell-foot">
            Ketuk lead untuk mencatat follow up di Form Input.
            {typeof Notification !== 'undefined' && Notification.permission === 'default' &&
              <> · <a href="#" onClick={e => { e.preventDefault(); Notification.requestPermission(); }}>Aktifkan notifikasi perangkat</a></>}
          </div>
        </div>
      </>}
    </div>
  );
}
