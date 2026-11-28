'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp } from '@/components/util';
import KartuQR from '@/components/KartuQR';

const JUDUL = 'Flash Sale Bio District';
const AJAKAN = 'Flash Sale Bio District 11–13 Desember 2026. Diskon s.d. Rp500 juta, hadiah langsung tanpa diundi, kuota terbatas. Daftar di sini:';
const FASE = { before: ['Belum dibuka', 'b-upcoming'], live: ['Sedang berlangsung', 'b-today'], ended: ['Sudah ditutup', 'b-lost'] };
const CHIP = { menunggu: ['Menunggu bayar', 'b-upcoming'], dibayar: ['Perlu dicek', 'b-overdue'], lunas: ['Booking fee lunas', 'b-today'], kedaluwarsa: ['Waktu habis', 'b-lost'], batal: ['Batal', 'b-lost'] };
const waktu = t => t ? new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '';
const keWIB = iso => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 16);   // untuk input datetime-local (WIB)
const dariWIB = v => v ? v + ':00+07:00' : '';

export default function FlashSaleKelola() {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false), [qr, setQr] = useState(null), [st, setSt] = useState(null), [tutup, setTutup] = useState(false);
  const muat = () => api('/api/flashsale/kelola').then(x => { setD(x); setSt(s => s || { mulai: keWIB(x.setting.mulai), selesai: keWIB(x.setting.selesai), uji: x.setting.uji, menu: x.setting.menu, verifWA: x.setting.verifWA, kuota: { ...x.setting.kuota } }); }).catch(e => { if (e.status === 403) setTutup(true); else toast(e.message); });
  useEffect(() => { muat(); const t = setInterval(() => { if (document.visibilityState === 'visible') api('/api/flashsale/kelola', { silent: true }).then(setD).catch(() => {}); }, 30000); return () => clearInterval(t); }, []);
  const aksi = async (body, pesan) => { setBusy(true); try { const r = await api('/api/flashsale/kelola', { method: 'POST', body: JSON.stringify(body) }); toast(typeof pesan === 'function' ? pesan(r) : pesan); await muat(); } catch (e) { toast(e.message); } finally { setBusy(false); } };
  if (tutup) return <div className="card"><b>⚡ Flash Sale</b><p className="hint" style={{ marginTop: 6 }}>Menu ini belum dibuka. Link flash sale akan tersedia di sini setelah programnya diumumkan.</p></div>;
  if (!d) return <><Toast /><div className="loading">Memuat Flash Sale…</div></>;
  const asal = typeof window !== 'undefined' ? window.location.origin : '';
  const salin = url => { navigator.clipboard?.writeText(url); toast('Link disalin'); };
  const Baris = ({ judul, ket, url }) => <div className="lk-row">
    <div className="lk-proj">{judul}<span className="tg-sub">{ket}</span></div><div className="lk-url">{url}</div>
    <div className="lk-aksi"><button className="sort-btn" onClick={() => setQr({ judul: JUDUL, url, project: 'BIO DISTRICT' })}>🔳 QR code</button>
      <button className="sort-btn" onClick={() => salin(url)}>📋 Salin link</button>
      <a className="sort-btn" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer" href={'https://wa.me/?text=' + encodeURIComponent(`${AJAKAN} ${url}`)}>💬 Kirim via WA</a></div></div>;
  const perlu = d.pesanan.filter(x => x.status === 'dibayar').length;
  const [fl, fc] = FASE[d.fase] || FASE.before;
  return (<>
    <Toast />
    <div className="page-head"><div><h1>Flash Sale Bio District <span className={'badge ' + fc} style={{ fontSize: 12, verticalAlign: 'middle' }}>{fl}</span>
      {d.setting.uji ? <span className="badge b-overdue" style={{ fontSize: 12, verticalAlign: 'middle', marginLeft: 6 }}>MODE UJI</span> : null}
      {d.pemilik && !d.setting.menu ? <span className="badge b-upcoming" style={{ fontSize: 12, verticalAlign: 'middle', marginLeft: 6 }}>Menu hanya terlihat oleh Anda</span> : null}
      {perlu ? <span className="badge b-overdue" style={{ fontSize: 12, verticalAlign: 'middle', marginLeft: 6 }}>{perlu} pembayaran perlu dicek</span> : null}</h1>
      <div className="sub">{waktu(d.setting.mulai)} – {waktu(d.setting.selesai)} WIB · konsumen mendaftar lewat link, lead langsung masuk Database Lead atas nama pemilik link</div></div>
      <a className="sort-btn" style={{ textDecoration: 'none' }} href="/flashsale" target="_blank" rel="noreferrer">↗ Buka halaman publik</a></div>

    <div className="card"><b>🎯 Kuota promo</b>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>{d.ringkas.map(r => <div key={r.grup} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 16px', minWidth: 120 }}>
        <div className="hint">{r.nama}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{r.terpakai}<span className="hint" style={{ fontSize: 14 }}> / {r.kuota}</span></div></div>)}</div>
      <p className="hint" style={{ marginTop: 10 }}>Terpakai = pesanan yang sedang menunggu bayar, perlu dicek, atau sudah lunas. Stok unit mengikuti Master Stock.</p></div>

    <div className="card" style={{ marginTop: 14 }}><b>🔗 Link Flash Sale</b>
      <div className="lk-list">
        {d.links.map(l => <div key={l.username}>
          <Baris judul={l.nama} ket={l.leadAgent ? 'Lead agent · link langsung ke konsumen' : l.manager ? 'Link atas nama Anda' : 'Sales · lead & penjualan tercatat atas namanya'} url={`${asal}/flashsale?ref=${encodeURIComponent(l.username)}`} />
          {l.leadAgent && <Baris judul={l.nama + ' · untuk agent'} ket="Bagikan ke agent: mereka mengisi nama, kantor & nomor WhatsApp, lalu mendapat link sendiri — tombol Tanya konsumennya tersambung ke WA agent itu" url={`${asal}/flashsale?ref=${encodeURIComponent(l.username)}&buat=1`} />}
        </div>)}
        {d.kelola && <Baris judul="Link umum" ket="Tanpa kode · iklan, Instagram, website, banner — lead masuk atas nama Head of Sales & Marketing" url={`${asal}/flashsale`} />}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>Nomor HP yang sudah ada di Database Lead tetap milik sales yang lebih dulu mencatatnya, walaupun mendaftar lewat link lain.</p></div>

    {(d.agents || []).length > 0 && <div className="card" style={{ marginTop: 14 }}><b>🧑‍💼 Agent</b> <span className="hint">{d.agents.length} agent membuat link sendiri</span>
      <div><table className="tg-tb lk-tabel" style={{ marginTop: 8 }}><thead><tr><th>Agent</th><th>Kantor</th><th>WhatsApp</th><th>Di bawah</th><th>Pendaftar</th><th>Kode link</th><th>Dibuat</th></tr></thead>
        <tbody>{d.agents.map(a => <tr key={a.kode}><td><b>{a.nama}</b></td><td>{a.kantor}</td>
          <td><a href={'https://wa.me/' + String(a.wa || '').replace(/\D/g, '').replace(/^0/, '62')} target="_blank" rel="noopener noreferrer">{a.wa}</a></td>
          <td>{a.lead_agent || a.ref_username}</td><td>{a.pendaftar}</td><td style={{ fontFamily: 'monospace' }}>{a.kode}</td><td style={{ whiteSpace: 'nowrap' }}>{waktu(a.created_at)}</td></tr>)}</tbody></table></div></div>}

    <div className="card" style={{ marginTop: 14 }}><b>🧾 Pesanan</b>
      {d.pesanan.length ? <div><table className="tg-tb lk-tabel" style={{ marginTop: 8 }}><thead><tr><th>Waktu</th><th>Kode</th><th>Konsumen</th><th>Unit</th><th>Paket &amp; cara bayar</th><th>Harga</th><th>Sales</th><th>Status</th><th></th></tr></thead>
        <tbody>{d.pesanan.map(x => { const [sl, sc] = CHIP[x.status] || [x.status, '']; return <tr key={x.id}>
          <td style={{ whiteSpace: 'nowrap' }}>{waktu(x.created_at)}</td>
          <td><b>{x.kode}</b>{x.uji ? <span className="tg-sub">uji coba</span> : null}</td>
          <td>{x.nama}<span className="tg-sub">{x.wa}{x.lead_code ? ' · ' + x.lead_code : ''}</span></td>
          <td style={{ whiteSpace: 'nowrap' }}>{x.unit}</td>
          <td>{x.paket_isi}<span className="tg-sub">{[x.cara_bayar, x.simulasi].filter(Boolean).join(' · ')}</span></td>
          <td style={{ whiteSpace: 'nowrap' }}>{fmtRp(x.harga)}</td>
          <td>{x.pemilik || '—'}{x.agent_nama ? <span className="tg-sub">Agent {x.agent_nama}{x.agent_kantor ? ' · ' + x.agent_kantor : ''}</span> : null}</td>
          <td><span className={'badge ' + sc}>{sl}</span>{x.alasan ? <span className="tg-sub">{x.alasan}</span> : null}{x.dicek_oleh ? <span className="tg-sub">oleh {x.dicek_oleh}</span> : null}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{d.kelola && ['dibayar', 'menunggu'].includes(x.status) && <>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '4px 10px' }} disabled={busy} onClick={() => { if (confirm(`Booking fee ${x.kode} (${x.nama}, ${x.unit}) sudah masuk rekening? Unit akan menjadi Reserved di Master Stock.`)) aksi({ aksi: 'lunas', id: x.id }, 'Booking fee dicatat lunas — unit Reserved'); }}>Booking fee masuk</button>{' '}
            <button className="sort-btn" disabled={busy} onClick={() => { const a = prompt('Alasan pesanan ditolak / dibatalkan?'); if (a) aksi({ aksi: 'tolak', id: x.id, alasan: a }, 'Pesanan dibatalkan, unit dibuka kembali'); }}>Tolak</button></>}</td>
        </tr>; })}</tbody></table></div>
        : <p className="hint" style={{ marginTop: 6 }}>Belum ada pesanan.</p>}</div>

    <div className="card" style={{ marginTop: 14 }}><b>👥 Pendaftar</b> <span className="hint">{d.daftar.length} orang</span>
      {d.daftar.length ? <div><table className="tg-tb lk-tabel" style={{ marginTop: 8 }}><thead><tr><th>Waktu</th><th>Nama</th><th>Kontak</th><th>Domisili</th><th>Sales</th><th>Lead</th></tr></thead>
        <tbody>{d.daftar.map(x => <tr key={x.id}>
          <td style={{ whiteSpace: 'nowrap' }}>{waktu(x.created_at)}</td>
          <td><b>{x.nama}</b>{x.uji ? <span className="tg-sub">uji coba</span> : null}</td>
          <td>{x.wa}<span className="tg-sub">{x.email}</span>
            {x.verified_at ? <span className="tg-sub" style={{ color: '#1f7a45' }}>✓ WA terverifikasi{x.verif_oleh && !['wa', 'aturan-mati'].includes(x.verif_oleh) ? ' (manual)' : ''}</span>
              : x.belumSah ? <span className="tg-sub" style={{ color: '#b3261e' }}>Belum verifikasi WA · kode {x.verif_kode}{d.kelola ? <> · <button className="sort-btn" style={{ padding: '2px 8px', fontSize: 11 }} disabled={busy} onClick={() => { if (confirm(`Tandai nomor ${x.wa} (${x.nama}) sudah terverifikasi? Pastikan dulu nomornya benar, misalnya dengan menelepon.`)) aksi({ aksi: 'sahkan', id: x.id }, 'Nomor ditandai terverifikasi'); }}>Tandai terverifikasi</button></> : null}</span> : null}</td>
          <td>{x.domisili}</td>
          <td>{x.pemilik || '—'}<span className="tg-sub">{x.agent_nama ? `Agent ${x.agent_nama}${x.agent_kantor ? ' · ' + x.agent_kantor : ''}${x.agent_wa ? ' · +' + x.agent_wa : ''}` : x.ref_username ? 'lewat link' : 'tanpa kode'}</span>
            {x.tanya_n ? <span className="tg-sub" style={{ color: '#1f7a45' }}>💬 {x.tanya_n}× buka chat WhatsApp{x.tanya_at ? ' · terakhir ' + waktu(x.tanya_at) : ''}</span> : null}</td>
          <td>{x.lead_code ? <a href={'/leads?lead=' + encodeURIComponent(x.lead_code)}>{x.lead_code}</a> : '—'}<span className="tg-sub">{x.lead_code ? (x.lead_baru ? 'lead baru' : 'sudah ada di CRM') : ''}</span></td>
        </tr>)}</tbody></table></div>
        : <p className="hint" style={{ marginTop: 6 }}>Belum ada pendaftar.</p>}</div>

    {d.kelola && st && <div className="card" style={{ marginTop: 14 }}><b>⚙ Pengaturan</b>
      <div className="form-grid" style={{ marginTop: 10 }}>
        <div className="field"><label>Mulai (WIB)</label><input type="datetime-local" value={st.mulai} onChange={e => setSt({ ...st, mulai: e.target.value })} /></div>
        <div className="field"><label>Selesai (WIB)</label><input type="datetime-local" value={st.selesai} onChange={e => setSt({ ...st, selesai: e.target.value })} /></div>
        {d.ringkas.map(r => <div className="field" key={r.grup}><label>Kuota {r.nama}</label><input type="number" min="0" max="99" value={st.kuota[r.grup] ?? ''} onChange={e => setSt({ ...st, kuota: { ...st.kuota, [r.grup]: e.target.value } })} /></div>)}
        {d.pemilik && <div className="field full"><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!st.menu} onChange={e => setSt({ ...st, menu: e.target.checked })} /> Tampilkan menu Flash Sale ke semua akun (sales, lead agent, Marcom, CEO) supaya mereka bisa menyalin &amp; mengirim link-nya</label></div>}
        <div className="field full"><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!st.verifWA} onChange={e => setSt({ ...st, verifWA: e.target.checked })} /> Wajib verifikasi nomor WhatsApp: pendaftar mengirim kode dari WA-nya ke nomor resmi Bio District sebelum bisa masuk. Lead baru tercatat setelah nomornya terverifikasi</label>
          <span className="hint">Chat terakhir yang diterima CRM di nomor resmi Bio District: {d.waTerakhir ? waktu(d.waTerakhir) : 'belum ada'}. Bila waktunya tidak bergerak saat ada chat masuk, sambungan WA sedang tidak menerima pesan, jadi jangan nyalakan aturan ini dulu.</span></div>
        <div className="field full"><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!st.uji} onChange={e => setSt({ ...st, uji: e.target.checked })} /> Mode uji coba: halaman publik langsung "berlangsung", pendaftar & pesanan TIDAK masuk Database Lead maupun Master Stock</label></div></div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
        <button className="sort-btn" disabled={busy} onClick={() => { if (confirm('Hapus semua pendaftar & pesanan uji coba?')) aksi({ aksi: 'hapus-uji' }, r => `Data uji dihapus: ${r.daftar} pendaftar, ${r.pesanan} pesanan`); }}>🗑 Hapus data uji</button>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={() => aksi({ aksi: 'setting', mulai: dariWIB(st.mulai), selesai: dariWIB(st.selesai), uji: st.uji, menu: st.menu, verifWA: st.verifWA, kuota: st.kuota }, 'Pengaturan disimpan')}>Simpan pengaturan</button></div>
    </div>}
    {qr && <KartuQR {...qr} ket="Scan untuk ikut Flash Sale" onTutup={() => setQr(null)} />}
  </>);
}
