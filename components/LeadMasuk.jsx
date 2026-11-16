'use client';
// Distribusi lead: pop-up "Lead baru" dengan hitung mundur + alarm berulang selama CRM terbuka (sales),
// sekaligus pengecek cadangan tiap menit untuk semua peran (bila cron-job.org belum dipasang).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bukaWA } from '@/components/util';

const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const jam = t => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(':', '.');
const rapiProject = p => String(p || '').toLowerCase().replace(/\b\w/g, h => h.toUpperCase());

// ===== Alarm (Web Audio — tanpa file suara) =====
let ctx = null;
function siapkanAudio() {
  try { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch {}
  return ctx;
}
function bunyi() {
  const c = siapkanAudio(); if (!c || c.state !== 'running') return false;
  const t0 = c.currentTime;
  [[880, 0], [1175, .18], [880, .36], [1175, .54]].forEach(([f, d]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = f; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.25, t0 + d + .02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + .16);
    o.start(t0 + d); o.stop(t0 + d + .17);
  });
  try { navigator.vibrate && navigator.vibrate([300, 120, 300]); } catch {}
  return true;
}
export function tesAlarm() { siapkanAudio(); setTimeout(bunyi, 60); }

export default function LeadMasuk({ user }) {
  const router = useRouter();
  const sales = user.role === 'sales' && !user.leadAgent;
  const [daftar, setDaftar] = useState([]);
  const [i, setI] = useState(0);
  const [kini, setKini] = useState(Date.now());
  const [selisih, setSelisih] = useState(0); // jam server - jam HP
  const [senyap, setSenyap] = useState(0);
  const [suaraOk, setSuaraOk] = useState(true);
  const [proses, setProses] = useState(false);
  const ditutup = useRef(new Set());

  const muat = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    fetch('/api/distribusi?saya=1', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      setSelisih(new Date(d.now).getTime() - Date.now());
      if (sales) setDaftar((d.pending || []).filter(x => !ditutup.current.has(x.id)));
    }).catch(() => {});
  }, [sales]);

  useEffect(() => {
    if (user.leadAgent) return;
    muat();
    const t = setInterval(muat, sales ? 15000 : 60000);
    const lihat = () => { if (document.visibilityState === 'visible') muat(); };
    document.addEventListener('visibilitychange', lihat);
    // Browser hanya mengizinkan suara setelah ada sentuhan pertama di halaman
    const sentuh = () => siapkanAudio();
    window.addEventListener('pointerdown', sentuh, { passive: true });
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', lihat); window.removeEventListener('pointerdown', sentuh); };
  }, [muat, sales, user.leadAgent]);

  const ada = daftar.length > 0;
  useEffect(() => { if (!ada) return; const t = setInterval(() => setKini(Date.now()), 1000); return () => clearInterval(t); }, [ada]);

  const L = daftar[Math.min(i, daftar.length - 1)];
  const sekarang = kini + selisih;
  const mulaiHitung = L ? new Date(L.jam_hitung).getTime() : 0;
  const berjalan = L && sekarang >= mulaiHitung;

  // Alarm berulang tiap ±2,5 detik selama ada lead menunggu (jam kerja) dan belum disenyapkan
  useEffect(() => {
    if (!ada || !berjalan || Date.now() < senyap) return;
    const main = () => { if (document.visibilityState === 'visible') setSuaraOk(bunyi()); };
    main();
    const t = setInterval(main, 2500);
    return () => clearInterval(t);
  }, [ada, berjalan, senyap, L?.id]);
  useEffect(() => { if (!senyap) return; const t = setTimeout(() => setSenyap(0), Math.max(0, senyap - Date.now())); return () => clearTimeout(t); }, [senyap]);

  if (!sales || !L) return null;

  const bk = new Date(L.batas_kuning).getTime(), bo = new Date(L.batas_oper).getTime();
  let angka, ket, nada;
  if (!berjalan) { angka = jam(mulaiHitung); ket = `Masuk di luar jam kerja — waktu respon mulai dihitung pukul ${jam(mulaiHitung)}`; nada = 'tenang'; }
  else if (sekarang < bk) { angka = mmss(bk - sekarang); ket = `sisa waktu respon ideal (${L.batas} menit)${L.maks ? '' : ` · dialihkan setelah ${L.batas_alih} menit`}`; nada = sekarang > bk - 120000 ? 'kuning' : 'hijau'; }
  else if (!L.maks && sekarang < bo) { angka = mmss(bo - sekarang); ket = 'lewat batas ideal — lead DIALIHKAN ke sales lain bila waktu habis'; nada = 'merah'; }
  else { angka = '+' + mmss(sekarang - bk); ket = 'terlambat — Manager sudah diberi tahu, hubungi sekarang'; nada = 'merah'; }

  const tutup = id => { ditutup.current.add(id); setDaftar(d => d.filter(x => x.id !== id)); setI(0); };
  const respon = (cara) => fetch('/api/distribusi', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aksi: 'respon', lead_code: L.lead_code, cara }) }).catch(() => {});
  const hubungiWA = () => { respon('WA'); if (L.wa) bukaWA(L.wa, L.pesan); tutup(L.id); };
  const telepon = async () => { setProses(true); await respon('Telepon'); setProses(false); tutup(L.id); router.push('/form?tab=fu&lead=' + encodeURIComponent(L.lead_code)); };
  const asal = L.pembuat_role === 'markom' ? 'dari Marcom' : /auto-wa/.test(L.created_by || '') || /Otomatis dari WA/.test(L.catatan || '') ? 'chat WhatsApp' : L.pembuat ? 'dari ' + L.pembuat : '';

  return (
    <div className="lm-overlay" role="alertdialog" aria-modal="true" aria-label="Lead baru menunggu respon" onPointerDown={() => siapkanAudio()}>
      <div className={'lm-pop lm-' + nada}>
        <div className="lm-head">
          <div><div className="lm-eyebrow">{L.urutan > 1 && L.dari ? 'LEAD DIALIHKAN KE ANDA' : 'LEAD BARU'} · BATAS RESPON</div>
            <div className="lm-nama">{L.nama}</div></div>
          {daftar.length > 1 && <div className="lm-hal"><button onClick={() => setI((i + daftar.length - 1) % daftar.length)} aria-label="Sebelumnya">‹</button>{(i % daftar.length) + 1}/{daftar.length}<button onClick={() => setI((i + 1) % daftar.length)} aria-label="Berikutnya">›</button></div>}
        </div>
        <div className="lm-hitung"><div className="lm-angka">{angka}</div><div className="lm-ket">{ket}</div></div>
        <div className="lm-isi">
          <div className="lm-baris"><span>Project</span><b>{rapiProject(L.project) || '—'}</b></div>
          <div className="lm-baris"><span>Sumber</span><b>{L.sumber || '—'}</b></div>
          {(L.tipe || L.bayar) && <div className="lm-baris"><span>Minat</span><b>{[L.tipe, L.bayar].filter(Boolean).join(' · ')}</b></div>}
          <div className="lm-baris"><span>Masuk</span><b>{jam(L.mulai)}{asal ? ' · ' + asal : ''}</b></div>
          {L.urutan > 1 && L.dari && <div className="lm-baris"><span>Dialihkan</span><b>dari {L.dari} (tidak merespon)</b></div>}
          {L.wa && <div className="lm-pesan"><span>Pesan pembuka siap kirim:</span>“{L.pesan}”</div>}
          {!L.wa && <div className="lm-pesan"><span>Lead ini belum punya nomor WA</span>Hubungi lewat kontak lain lalu catat follow up.</div>}
        </div>
        <div className="lm-aksi">
          {L.wa && <button className="lm-wa" onClick={hubungiWA}>💬 Hubungi via WA sekarang</button>}
          <button className="lm-tel" onClick={telepon} disabled={proses}>📞 Sudah ditelepon — catat follow up</button>
          <div className="lm-kecil">
            {!suaraOk && berjalan && <button onClick={() => { siapkanAudio(); setSuaraOk(bunyi()); }}>🔔 Ketuk untuk bunyikan alarm</button>}
            {berjalan && <button onClick={() => setSenyap(Date.now() + 60000)} disabled={Date.now() < senyap}>{Date.now() < senyap ? '🔕 Senyap 1 menit' : '🔕 Senyapkan 1 menit'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
