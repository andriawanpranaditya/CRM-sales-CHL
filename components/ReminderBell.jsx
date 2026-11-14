'use client';
import { useEffect, useRef, useState } from 'react';
import { api, fmtDate, bukaWA } from '@/components/util';

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
  // Manager: pemeriksaan ringan tiap ±40 detik — transaksi baru & laporan agent langsung muncul (dengan bunyi & notifikasi perangkat)
  const [baru, setBaru] = useState({ trx: [], agent: [], belumDibaca: 0 });
  const kunciDibaca = 'crm_notif_dibaca_' + (user?.username || '');
  async function cekBaru(awal = false) {
    if (user?.role !== 'manager') return;
    try {
      const d = await api('/api/notif-baru', { silent: true });
      let dibaca = 0; try { dibaca = Number(localStorage.getItem(kunciDibaca) || 0); } catch {}
      if (!dibaca && awal) { dibaca = Math.max(0, ...d.trx.map(x => x.id)); try { localStorage.setItem(kunciDibaca, String(dibaca)); } catch {} }
      const trxBaru = d.trx.filter(x => x.id > dibaca);
      const agentLama = (dataRef.current?.agentMenunggu || []).map(x => x.id);
      const agentBaru = d.agent.filter(x => !agentLama.includes(x.id));
      setBaru(b => {
        const sebelum = b.trx.map(x => x.id).concat(b.agent.map(x => 'a' + x.id));
        const muncul = [...trxBaru.filter(x => !sebelum.includes(x.id)), ...(awal ? [] : agentBaru.filter(x => !sebelum.includes('a' + x.id)))];
        if (muncul.length && !awal) {
          playChime();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const x = muncul[0];
            try { new Notification('CRM Sales CHL', { body: x.jenis ? `${x.jenis === 'Batal' ? '❌' : '🧾'} ${x.jenis}: ${x.nama || x.lead_code} · ${x.unit || x.project} (${x.sales || '-'})` : `📥 Laporan agent: ${x.konsumen} (${x.lead_agent})`, icon: '/icon-192.png' }); } catch {}
          }
        }
        return { trx: trxBaru, agent: d.agent, belumDibaca: trxBaru.length };
      });
      if (agentBaru.length && !awal) load();
    } catch {}
  }

  async function load() {
    try {
      const d = await api('/api/reminders', { silent: true });
      setData(d); dataRef.current = d;
      // Notifikasi browser (sekali per hari per perangkat, bila diizinkan)
      if (d.total > 0 && typeof Notification !== 'undefined' && Notification.permission === 'granted' && !notified.current) {
        const key = 'crm_notif_' + d.today;
        if (!localStorage.getItem(key)) {
          new Notification('CRM Sales CHL — Pengingat', {
            body: d.peran === 'collection' ? `💰 ${(d.tunggakan || []).length} tunggakan · 📅 ${(d.jatuhTempo || []).length} jatuh tempo · 🏦 ${(d.akad || []).length} akad` : `📅 ${d.hariIni.length} FU hari ini` + (d.terlambat.length ? ` · ⚠️ ${d.terlambat.length} terlambat` : '') + ((d.stok || []).length ? ` · 🗺 ${d.stok.length} unit perlu ditandai di Master Stock` : '') + ((d.celah || []).length ? ` · 📩 ada lead masuk yang belum tercatat` : ''),
            icon: '/icon-192.png', badge: '/icon-192.png',
          });
          try { localStorage.setItem(key, '1'); } catch {}
          notified.current = true;
        }
      }
    } catch {}
  }

  useEffect(() => {
    // Refresh tiap 5 menit HANYA saat layar terlihat (tab di belakang / HP terkunci tidak menarik data);
    // begitu aplikasi dibuka lagi dan sudah >5 menit, lonceng langsung diperbarui.
    let terakhir = Date.now();
    load();
    const segar = () => { if (document.visibilityState === 'visible' && Date.now() - terakhir >= 5 * 60 * 1000) { terakhir = Date.now(); load(); } };
    const t = setInterval(segar, 60 * 1000);
    cekBaru(true);
    const cepat = () => { if (document.visibilityState === 'visible') cekBaru(); };
    const t2 = setInterval(cepat, 40 * 1000);
    document.addEventListener('visibilitychange', cepat);
    window.addEventListener('focus', cepat);
    const dibacaLain = () => setBaru(x => ({ ...x, trx: [], belumDibaca: 0 })); // lonceng lain (HP/desktop) sudah dibaca
    window.addEventListener('crm-notif-dibaca', dibacaLain);
    document.addEventListener('visibilitychange', segar);

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
      clearInterval(t); clearInterval(t2);
      document.removeEventListener('visibilitychange', cepat); window.removeEventListener('focus', cepat); window.removeEventListener('crm-notif-dibaca', dibacaLain);
      document.removeEventListener('visibilitychange', segar);
      window.removeEventListener('pointerdown', onFirstTouch);
      window.removeEventListener('keydown', onFirstTouch);
    };
  }, []);

  const total = (data ? data.total : 0) + baru.belumDibaca;

  function toggle() {
    if (!open && data && data.total > 0) playChime();
    if (open && baru.trx.length) { const maks = Math.max(...baru.trx.map(x => x.id)); try { localStorage.setItem(kunciDibaca, String(maks)); } catch {} setBaru(b => ({ ...b, trx: [], belumDibaca: 0 })); window.dispatchEvent(new Event('crm-notif-dibaca')); }
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
          ? <span className="hint"> — {r.sales ? r.sales : null}{r.markom ? <span style={{ color: 'var(--blue)' }}>{r.sales ? ' · ' : ''}Marcom: {r.markom}</span> : null}</span>
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
      <button className={'bell-btn' + (total ? ' has' : '')} onClick={toggle} aria-label="Pengingat">
        🔔{total > 0 && <span className="bell-badge">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && <>
        <div className="bell-backdrop" onClick={() => setOpen(false)} />
        <div className="bell-panel">
          <div className="bell-head">{data?.peran === 'collection' ? 'Pengingat Collection & KPR' : 'Pengingat Follow Up'} {data ? '— ' + fmtDate(data.today) : ''}</div>
          {baru.trx.length > 0 && <div className="bell-list" style={{ paddingBottom: 0 }}>
            <div className="bell-sub">🧾 Transaksi baru ({baru.trx.length})</div>
            {baru.trx.map(x => (<a key={'tx' + x.id} href={'/leads?lead=' + encodeURIComponent(x.lead_code || '')} className="rem-item" style={{ borderLeftColor: x.jenis === 'Batal' ? 'var(--red)' : x.jenis === 'Booking' ? 'var(--green)' : 'var(--brass, #C99C4F)' }}>
              <span><b>{x.nama || x.lead_code}</b> · {x.unit || '-'}<br /><span className="hint">{x.project} · {x.sales || '-'} · {new Date(x.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
              <span className={'badge ' + (x.jenis === 'Batal' ? 'b-overdue' : x.jenis === 'Booking' ? 'b-close' : 'b-today')}>{x.jenis}</span></a>))}
          </div>}
          {!data || !total ? (
            <div className="hint" style={{ padding: '14px 16px' }}>✅ Tidak ada pengingat. Mantap!</div>
          ) : (
            <div className="bell-list">
              {data.peran === 'collection' && <>
                {(data.tunggakan || []).length > 0 && <><div className="bell-sub">💰 Tunggakan ({data.tunggakan.length})</div>
                  {data.tunggakan.map(r => (<a key={'tg' + r.id} href={'/collection?tab=tagihan&lead=' + r.lead_code} className="rem-item" style={{ borderLeftColor: 'var(--red)' }}>
                    <b>{r.nama}</b> · {r.unit}<br /><span className="hint">{r.ket} · sisa Rp {Number(r.sisa).toLocaleString('id-ID')} · lewat {r.hariLewat} hari</span></a>))}</>}
                {(data.jatuhTempo || []).length > 0 && <><div className="bell-sub">📅 Jatuh tempo hari ini / besok ({data.jatuhTempo.length})</div>
                  {data.jatuhTempo.map(r => (<a key={'jt' + r.id} href={'/collection?tab=tagihan&lead=' + r.lead_code} className="rem-item" style={{ borderLeftColor: 'var(--blue)' }}>
                    <b>{r.nama}</b> · {r.unit}<br /><span className="hint">{r.ket} · Rp {Number(r.sisa).toLocaleString('id-ID')} · {r.jatuh_tempo === data.today ? 'hari ini' : 'besok'}</span></a>))}</>}
                {(data.akad || []).length > 0 && <><div className="bell-sub">🏦 Akad ({data.akad.length})</div>
                  {data.akad.map(a => (<a key={'ak' + a.id} href={'/kpr-proses?id=' + a.id} className="rem-item" style={{ borderLeftColor: a.lewat ? 'var(--red)' : 'var(--brass)' }}>
                    <b>{a.nama}</b> · {a.unit}<br /><span className="hint">{a.lewat ? 'Akad ' + fmtDate(a.tgl) + ' sudah lewat — isi realisasi' : 'Akad ' + fmtDate(a.tgl)}{a.bank ? ' · ' + a.bank : ''}</span></a>))}</>}
                {(data.kendala || []).length > 0 && <><div className="bell-sub">⚠ Kendala berkas / bank ({data.kendala.length})</div>
                  {data.kendala.map(k => (<a key={'kd' + k.id} href={'/kpr-proses?id=' + k.id} className="rem-item" style={{ borderLeftColor: 'var(--brass)' }}>
                    <b>{k.nama}</b> · {k.unit}<br /><span className="hint">{k.kendala} · {k.hari} hari</span></a>))}</>}
              </>}
              {(data.janjian || []).length > 0 && <>
                <div className="bell-sub">📅 Janjian visit ({data.janjian.length})</div>
                {data.janjian.map(j => (
                  <a key={'j' + j.id} href="/janjian" className="rem-item" style={{ borderLeftColor: j.perlu_update ? 'var(--red)' : 'var(--blue)' }}>
                    <span><b>{j.nama || j.lead_code}</b> <span className="hint">({j.jenis}{user.role !== 'sales' ? ' · ' + j.sales : ''})</span>
                      <br /><span className="hint">{fmtDate(j.tgl)} pukul {String(j.jam).replace(':', '.')} · {j.lokasi}</span></span>
                    <span className={'badge ' + (j.perlu_update ? 'b-overdue' : j.tgl === data.today ? 'b-today' : 'b-new')}>{j.perlu_update ? 'PERLU UPDATE' : j.tgl === data.today ? 'HARI INI' : 'BESOK'}</span>
                  </a>))}
                {(data.terlambat.length + data.hariIni.length) > 0 && <div className="bell-sub">Follow up</div>}
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
              {data.terlambat.map(r => <Item key={'t' + r.lead_code} r={r} late />)}
              {data.hariIni.map(r => <Item key={'h' + r.lead_code} r={r} />)}
              {(data.agentMenunggu || []).length > 0 && <>
                <div className="bell-sub">📥 Laporan kunjungan agent — perlu dicek ({data.agentMenunggu.length})</div>
                {data.agentMenunggu.map(x => (
                  <a key={'ag' + x.id} href="/kunjungan-agent" className="rem-item" style={{ borderLeftColor: 'var(--brass, #C99C4F)' }}>
                    <span><b>{x.konsumen}</b><br /><span className="hint">{x.lead_agent} · agent {x.agent_nama} · kunjungan {x.tgl}</span></span>
                    <span className="badge b-today">Cek</span></a>))}
              </>}
              {(data.aiSiap || []).length > 0 && <>
                <div className="bell-sub">🤖 Dari asisten AI — siap dioper ({data.aiSiap.length})</div>
                {data.aiSiap.map(l => (
                  <a key={l.lead_code} href="/form" className="rem-item" style={{ borderLeftColor: l.ai_status === 'eskalasi' ? 'var(--red)' : 'var(--green)' }}>
                    <span><b>{l.lead_code} · {l.nama}</b><br /><span className="hint">{l.ai_status === 'eskalasi' ? '⚠ Minta bicara dengan tim — ' : '✓ Kualifikasi lengkap — '}{l.ai_ringkasan || 'lihat chat WA'}</span></span>
                    <span className={'badge ' + (l.ai_status === 'eskalasi' ? 'b-overdue' : 'b-close')}>{l.ai_status === 'eskalasi' ? 'Segera' : 'Oper'}</span>
                  </a>))}
              </>}
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
            {data?.peran === 'collection' ? 'Ketuk untuk membuka tagihan atau proses KPR konsumen.' : 'Ketuk lead untuk mencatat follow up di Form Input.'}
            {typeof Notification !== 'undefined' && Notification.permission === 'default' &&
              <> · <a href="#" onClick={e => { e.preventDefault(); Notification.requestPermission(); }}>Aktifkan notifikasi perangkat</a></>}
          </div>
        </div>
      </>}
    </div>
  );
}
