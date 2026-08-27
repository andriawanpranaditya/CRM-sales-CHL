'use client';
import { useEffect, useRef, useState } from 'react';
import { api, fmtDate, waLink } from '@/components/util';

// Suara "ding" dua nada dibuat langsung oleh browser (tanpa file audio)
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch {}
}

export default function ReminderBell({ user }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const notified = useRef(false);
  const dataRef = useRef(null);

  async function load() {
    try {
      const d = await api('/api/reminders');
      setData(d); dataRef.current = d;
      // Notifikasi browser (sekali per hari per perangkat, bila diizinkan)
      if (d.total > 0 && typeof Notification !== 'undefined' && Notification.permission === 'granted' && !notified.current) {
        const key = 'crm_notif_' + d.today;
        if (!localStorage.getItem(key)) {
          new Notification('CRM Sales CHL — Pengingat', {
            body: `📅 ${d.hariIni.length} FU hari ini` + (d.terlambat.length ? ` · ⚠️ ${d.terlambat.length} terlambat` : '') + ((d.stok || []).length ? ` · 🗺 ${d.stok.length} unit perlu ditandai di Master Stock` : ''),
            icon: '/icon-192.png', badge: '/icon-192.png',
          });
          try { localStorage.setItem(key, '1'); } catch {}
          notified.current = true;
        }
      }
    } catch {}
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000); // refresh tiap 5 menit

    // Bunyi "ding" + getar pada interaksi PERTAMA pengguna hari ini bila ada FU jatuh tempo
    // (browser hanya mengizinkan suara setelah pengguna menyentuh halaman)
    const onFirstTouch = () => {
      const d = dataRef.current;
      if (d && d.total > 0) {
        const key = 'crm_chime_' + d.today;
        if (!localStorage.getItem(key)) {
          playChime();
          try { localStorage.setItem(key, '1'); } catch {}
        }
      }
      window.removeEventListener('pointerdown', onFirstTouch);
      window.removeEventListener('keydown', onFirstTouch);
    };
    window.addEventListener('pointerdown', onFirstTouch);
    window.addEventListener('keydown', onFirstTouch);

    return () => {
      clearInterval(t);
      window.removeEventListener('pointerdown', onFirstTouch);
      window.removeEventListener('keydown', onFirstTouch);
    };
  }, []);

  const total = data ? data.total : 0;

  function toggle() {
    if (!open && data && data.total > 0) playChime();
    setOpen(v => !v);
    // Minta izin notifikasi browser saat pertama kali lonceng dibuka
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  const Item = ({ r, late }) => (
    <a href="/form" className="rem-item" style={late ? { borderLeftColor: 'var(--red)' } : {}}>
      <span>
        <b>{r.nama}</b> <span className="hint">({r.lead_code}{r.project ? ' · ' + r.project : ''})</span>
        {user.role === 'manager' && r.sales ? <span className="hint"> — {r.sales}</span> : null}
        <br /><span className="hint">WA: {r.wa || '-'} · Jadwal: {fmtDate(r.next_fu)}</span>
      </span>
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <span className={'badge ' + (late ? 'b-overdue' : 'b-today')}>{late ? 'TERLAMBAT' : 'HARI INI'}</span>
        {r.wa ? <span className="badge b-close" style={{ cursor: 'pointer' }}
          onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(waLink(r.wa, ''), '_blank'); }}>📲 WA</span> : null}
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
          <div className="bell-head">Pengingat Follow Up {data ? '— ' + fmtDate(data.today) : ''}</div>
          {!data || !total ? (
            <div className="hint" style={{ padding: '14px 16px' }}>✅ Tidak ada pengingat. Mantap!</div>
          ) : (
            <div className="bell-list">
              {data.terlambat.map(r => <Item key={'t' + r.lead_code} r={r} late />)}
              {data.hariIni.map(r => <Item key={'h' + r.lead_code} r={r} />)}
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
