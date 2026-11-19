'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/components/util';
import Toast, { toast } from '@/components/Toast';
import { bolehDigital } from '@/lib/digital-akses';

const rp = n => n || n === 0 ? 'Rp' + Math.round(Number(n)).toLocaleString('id-ID') : '—';
const angka = n => Math.round(Number(n) || 0).toLocaleString('id-ID');
const STATUS = { ACTIVE: ['Tayang', 'kp-ok'], PAUSED: ['Mati', 'kp-no'], CAMPAIGN_PAUSED: ['Campaign mati', 'kp-no'], ADSET_PAUSED: ['Ad set mati', 'kp-no'],
  IN_PROCESS: ['Diproses', ''], PENDING_REVIEW: ['Direview Meta', ''], WITH_ISSUES: ['Bermasalah', 'kp-no'], DISAPPROVED: ['Ditolak Meta', 'kp-no'] };
const TAB = [['iklan', 'Kelola Iklan Meta'], ['baru', 'Pasang Iklan Baru'], ['organik', 'Posting Organik'], ['web', 'Artikel Website'], ['atur', 'Riwayat & Pengaturan']];
const kirim = (aksi, data) => api('/api/digital', { method: 'POST', body: JSON.stringify({ aksi, ...data }) });

// Kecilkan gambar di perangkat sebelum dikirim (JPEG, sisi terpanjang maks 1600px) — hemat kuota & lolos batas unggah
function kecilkan(file, maks = 1600) {
  return new Promise((ok, gagal) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maks / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL('image/jpeg', 0.88); URL.revokeObjectURL(url);
      ok({ pratinjau: d, data: d.split(',')[1], lebar: c.width, tinggi: c.height });
    };
    img.onerror = () => { URL.revokeObjectURL(url); gagal(new Error('Berkas ini bukan gambar yang bisa dibaca')); };
    img.src = url;
  });
}
function PilihGambar({ gambar, setGambar, catatan }) {
  const pilih = async e => { const f = e.target.files?.[0]; if (!f) return; try { setGambar(await kecilkan(f)); } catch (x) { toast(x.message); } e.target.value = ''; };
  return (<div className="field"><label>Gambar materi <span className="req">*</span></label>
    <input type="file" accept="image/*" onChange={pilih} />
    {gambar && <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <img src={gambar.pratinjau} alt="Pratinjau materi" style={{ maxWidth: 160, maxHeight: 200, borderRadius: 10, border: '1px solid var(--line)' }} />
      <div className="hint">{gambar.lebar}×{gambar.tinggi}px<br /><button type="button" className="sort-btn" style={{ marginTop: 6 }} onClick={() => setGambar(null)}>Ganti</button></div></div>}
    {catatan && <div className="hint" style={{ marginTop: 4 }}>{catatan}</div>}</div>);
}
const Pil = ({ status }) => { const [t, k] = STATUS[status] || [status, '']; return <span className={'kp-pill sm ' + k}>{t}</span>; };
const K7 = ({ k }) => <span className="hint">7 hari: {rp(k.biaya)} · {angka(k.tayang)} tayang · {angka(k.hasil)} hasil</span>;

export default function DigitalMarketing() {
  const [me, setMe] = useState(null);
  const [st, setSt] = useState(null);
  const [tab, setTab] = useState('iklan');
  const [akun, setAkun] = useState('');
  const [d, setD] = useState(null);          // data iklan akun terpilih
  const [buka, setBuka] = useState({});      // campaign / ad set yang dibentangkan
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => { api('/api/auth/me').then(setMe).catch(() => setMe({})); }, []);
  const muatStatus = () => api('/api/digital?bagian=status').then(r => { setSt(r); setAkun(a => a || r.akun?.[0]?.id || ''); }).catch(e => { toast(e.message); setSt({ galat: e.message, akun: [], wp: [] }); });
  useEffect(() => { if (me && bolehDigital(me)) muatStatus(); }, [me]); // eslint-disable-line
  const muatIklan = () => { if (!akun) return; setD(null); api('/api/digital?bagian=iklan&akun=' + akun).then(setD).catch(e => { toast(e.message); setD({ galat: e.message, campaign: [], adset: [], iklan: [] }); }); };
  useEffect(() => { if (akun && (tab === 'iklan' || tab === 'baru')) muatIklan(); }, [akun, tab === 'iklan' || tab === 'baru']); // eslint-disable-line

  async function jalankan(pesanYakin, aksi, data, sukses, sesudah = muatIklan) {
    if (pesanYakin && !window.confirm(pesanYakin)) return;
    setSibuk(true);
    try { const r = await kirim(aksi, data); toast(typeof sukses === 'function' ? sukses(r) : sukses); sesudah && sesudah(r); return r; }
    catch (e) { toast(e.message); } finally { setSibuk(false); }
  }

  if (!me) return <div className="loading">Memuat…</div>;
  if (!bolehDigital(me)) return <div className="card"><h2>Digital Marketing</h2><p className="hint">Menu ini sementara khusus akun Head of Sales &amp; Marketing.</p></div>;
  if (!st) return <div className="loading">Memuat…</div>;

  const akunDipilih = st.akun.find(a => a.id === akun);
  const izin = st.izin || [], punya = p => izin.includes(p);

  return (<>
    <Toast />
    <div className="page-head"><div><h1>Digital Marketing</h1>
      <div className="sub">Kelola iklan Meta, posting organik, dan artikel website dari satu tempat · sementara hanya untuk akun Anda</div></div></div>

    {!st.token && <div className="note" style={{ borderLeft: '4px solid var(--red)' }}><b>Token Meta belum dipasang.</b> Isi <code>META_ADS_TOKEN</code> di Vercel (token System User dengan izin <code>ads_management</code>), lalu Redeploy.</div>}
    {st.token && st.galatToken && <div className="note" style={{ borderLeft: '4px solid var(--red)' }}><b>Token Meta bermasalah:</b> {st.galatToken}</div>}
    {st.token && !st.galatToken && !punya('ads_management') && <div className="note"><b>Token yang terpasang ({st.sumberToken}) belum punya izin <code>ads_management</code>.</b> Daftar iklan tetap bisa dibaca, tapi menyalakan/mematikan, mengubah anggaran, dan memasang iklan akan ditolak Meta sampai token berizin lengkap dipasang di <code>META_ADS_TOKEN</code>.</div>}

    <div className="fu-toolbar">
      {TAB.map(([k, l]) => <button key={k} className={'sort-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>)}
    </div>

    {(tab === 'iklan' || tab === 'baru') && <div className="fu-toolbar">
      {st.akun.map(a => <button key={a.id} className={'chip-proyek' + (akun === a.id ? ' active' : '')} onClick={() => setAkun(a.id)}>{a.project || a.nama}</button>)}
      {akunDipilih && <span className="hint">Akun iklan: {akunDipilih.nama} ({akunDipilih.id}){akunDipilih.galat ? ' · ' + akunDipilih.galat : ''}</span>}
      <button className="sort-btn" onClick={muatIklan} disabled={!akun}>Muat ulang</button>
    </div>}

    {tab === 'iklan' && <TabIklan d={d} buka={buka} setBuka={setBuka} sibuk={sibuk} jalankan={jalankan} batas={st.batas} />}
    {tab === 'baru' && <TabBaru d={d} sibuk={sibuk} jalankan={jalankan} keIklan={() => setTab('iklan')} />}
    {tab === 'organik' && <TabOrganik sibuk={sibuk} setSibuk={setSibuk} punya={punya} />}
    {tab === 'web' && <TabWeb situs={st.wp} sibuk={sibuk} setSibuk={setSibuk} />}
    {tab === 'atur' && <TabAtur st={st} muatStatus={muatStatus} sibuk={sibuk} jalankan={jalankan} />}
  </>);
}

// ===================== KELOLA IKLAN =====================
function TabIklan({ d, buka, setBuka, sibuk, jalankan, batas }) {
  const [ubah, setUbah] = useState(null); // { jenis:'budget'|'target', id, ... }
  if (!d) return <div className="loading">Memuat iklan dari Meta…</div>;
  if (d.galat) return <div className="note" style={{ borderLeft: '4px solid var(--red)' }}>Gagal memuat iklan: {d.galat}</div>;
  if (!d.campaign.length) return <div className="card"><p className="hint">Tidak ada campaign aktif atau mati di akun ini.</p></div>;
  const tog = id => setBuka(b => ({ ...b, [id]: !b[id] }));
  const saklar = (o, jenis, label) => (<button className={'sort-btn' + (o.nyala ? ' active' : '')} disabled={sibuk} style={{ padding: '4px 10px', fontSize: 11.5 }}
    onClick={() => jalankan(`${o.nyala ? 'MATIKAN' : 'NYALAKAN'} ${label} "${o.nama}"?${o.nyala ? '' : '\n\nSetelah menyala, iklan mulai memakai anggaran.'}`, 'status', { id: o.id, jenis, nyala: !o.nyala }, `${label} ${o.nyala ? 'dimatikan' : 'dinyalakan'} ✅`)}>
    {o.nyala ? 'ON' : 'OFF'}</button>);
  const anggaran = (o, jenis) => o.harian
    ? <button className="sort-btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setUbah({ jenis: 'budget', tingkat: jenis, id: o.id, nama: o.nama, lama: o.harian, harian: String(o.harian) })}>{rp(o.harian)}/hari ✎</button>
    : o.total ? <span className="hint">total {rp(o.total)}</span> : null;

  return (<>
    {ubah?.jenis === 'budget' && <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--green)' }}>
      <h3 style={{ margin: '0 0 8px' }}>Ubah anggaran harian — {ubah.nama}</h3>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0, minWidth: 200 }}><label>Anggaran per hari (Rp)</label>
          <input inputMode="numeric" value={ubah.harian} onChange={e => setUbah({ ...ubah, harian: e.target.value.replace(/[^0-9]/g, '') })} /></div>
        <button className="btn btn-primary" disabled={sibuk || !Number(ubah.harian) || Number(ubah.harian) === ubah.lama}
          onClick={async () => { const r = await jalankan(`Ubah anggaran harian "${ubah.nama}"\ndari ${rp(ubah.lama)} menjadi ${rp(ubah.harian)}?`, 'budget', { id: ubah.id, jenis: ubah.tingkat, harian: Number(ubah.harian) }, 'Anggaran diubah ✅'); if (r) setUbah(null); }}>Simpan</button>
        <button className="btn btn-ghost" onClick={() => setUbah(null)}>Batal</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>Sekarang {rp(ubah.lama)}/hari · batas pengaman {rp(batas)}/hari (ubah di tab Riwayat &amp; Pengaturan).</div></div>}

    {ubah?.jenis === 'target' && <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--green)' }}>
      <h3 style={{ margin: '0 0 8px' }}>Ubah target — {ubah.nama}</h3>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0, width: 110 }}><label>Usia min</label><input inputMode="numeric" value={ubah.usia_min} onChange={e => setUbah({ ...ubah, usia_min: e.target.value.replace(/[^0-9]/g, '') })} /></div>
        <div className="field" style={{ margin: 0, width: 110 }}><label>Usia maks</label><input inputMode="numeric" value={ubah.usia_maks} onChange={e => setUbah({ ...ubah, usia_maks: e.target.value.replace(/[^0-9]/g, '') })} /></div>
        <div className="field" style={{ margin: 0, width: 150 }}><label>Gender</label>
          <select value={ubah.gender} onChange={e => setUbah({ ...ubah, gender: e.target.value })}><option value="semua">Semua</option><option value="pria">Pria</option><option value="wanita">Wanita</option></select></div>
        <button className="btn btn-primary" disabled={sibuk}
          onClick={async () => { const r = await jalankan(`Ubah target "${ubah.nama}" menjadi usia ${ubah.usia_min}–${ubah.usia_maks}, ${ubah.gender}?\n\nPerubahan target membuat Meta mengulang fase belajar ad set ini.`, 'target', { id: ubah.id, usia_min: ubah.usia_min, usia_maks: ubah.usia_maks, gender: ubah.gender }, 'Target diubah ✅'); if (r) setUbah(null); }}>Simpan</button>
        <button className="btn btn-ghost" onClick={() => setUbah(null)}>Batal</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>Lokasi &amp; minat tidak berubah{ubah.lokasi?.length ? ' · lokasi sekarang: ' + ubah.lokasi.join(', ') : ''}.{ubah.otomatis ? ' Ad set ini memakai Advantage+ audience — Meta bisa menolak batas usia tertentu.' : ''}</div></div>}

    {d.campaign.map(c => { const sets = d.adset.filter(a => a.campaign_id === c.id);
      return (<div key={c.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {saklar(c, 'campaign', 'Campaign')}
          <button type="button" onClick={() => tog(c.id)} style={{ background: 'none', border: 'none', color: 'var(--ink)', font: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0, textAlign: 'left' }}>{buka[c.id] ? '▾' : '▸'} {c.nama}</button>
          <Pil status={c.status} />{anggaran(c, 'campaign')}
          <span className="hint">{String(c.tujuan || '').replace('OUTCOME_', '').toLowerCase()} · {sets.length} ad set</span>
        </div>
        <div style={{ marginTop: 4 }}><K7 k={c.k7} /></div>
        {buka[c.id] && sets.map(a => { const iklan = d.iklan.filter(i => i.adset_id === a.id), t = a.target;
          return (<div key={a.id} style={{ margin: '10px 0 0 14px', paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {saklar(a, 'adset', 'Ad set')}
              <button type="button" onClick={() => tog(a.id)} style={{ background: 'none', border: 'none', color: 'var(--ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left' }}>{buka[a.id] ? '▾' : '▸'} {a.nama}</button>
              <Pil status={a.status} />{anggaran(a, 'adset')}
              {t && <button className="sort-btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setUbah({ jenis: 'target', id: a.id, nama: a.nama, usia_min: String(t.usia_min || 18), usia_maks: String(t.usia_maks || 65), gender: t.gender, lokasi: t.lokasi, otomatis: t.otomatis })}>
                usia {t.usia_min || 18}–{t.usia_maks || 65} · {t.gender} ✎</button>}
            </div>
            <div style={{ marginTop: 4 }}><K7 k={a.k7} />{t?.lokasi?.length ? <span className="hint"> · lokasi: {t.lokasi.join(', ')}</span> : null}</div>
            {buka[a.id] && iklan.map(i => (<div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0 0 14px' }}>
              {saklar(i, 'ad', 'Iklan')}
              {i.gambar ? <img src={i.gambar} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} /> : null}
              <b style={{ fontSize: 13 }}>{i.nama}</b><Pil status={i.status} /><K7 k={i.k7} />
            </div>))}
            {buka[a.id] && !iklan.length && <div className="hint" style={{ margin: '8px 0 0 14px' }}>Belum ada iklan di ad set ini.</div>}
          </div>); })}
      </div>); })}
    <div className="hint">“Hasil” = percakapan WhatsApp/lead/klik yang dicatat Meta 7 hari terakhir. Perubahan di sini langsung berlaku di Meta dan tercatat di tab Riwayat.</div>
  </>);
}

// ===================== PASANG IKLAN BARU =====================
function TabBaru({ d, sibuk, jalankan, keIklan }) {
  const [f, setF] = useState({ contoh_id: '', nama: '', judul: '', caption: '' });
  const [gambar, setGambar] = useState(null);
  const contohList = useMemo(() => (d?.iklan || []).filter(i => !/VIDEO/i.test(i.jenis || '')), [d]);
  if (!d) return <div className="loading">Memuat iklan dari Meta…</div>;
  if (d.galat) return <div className="note" style={{ borderLeft: '4px solid var(--red)' }}>Gagal memuat iklan: {d.galat}</div>;
  const contoh = d.iklan.find(i => i.id === f.contoh_id), set = contoh && d.adset.find(a => a.id === contoh.adset_id), camp = contoh && d.campaign.find(c => c.id === contoh.campaign_id);
  const siap = f.contoh_id && f.nama.trim() && f.caption.trim() && gambar;
  return (<div className="card">
    <h2>Pasang iklan baru dari materi</h2>
    <p className="hint" style={{ marginBottom: 12 }}>Iklan baru dipasang di ad set yang sama dengan <b>iklan contoh</b>, dan menyalin tujuannya (WhatsApp, formulir, tombol) dari iklan itu — yang berganti hanya gambar dan caption.
      Iklan selalu dibuat dalam keadaan <b>MATI</b>; nyalakan dari tab Kelola Iklan setelah Anda cek.</p>
    <div className="field"><label>Iklan contoh (menentukan campaign, ad set, target &amp; formulir) <span className="req">*</span></label>
      <select value={f.contoh_id} onChange={e => setF({ ...f, contoh_id: e.target.value })}>
        <option value="">— pilih iklan gambar yang sudah ada —</option>
        {d.campaign.map(c => { const isi = contohList.filter(i => i.campaign_id === c.id); return isi.length ? <optgroup key={c.id} label={c.nama}>{isi.map(i => <option key={i.id} value={i.id}>{i.nama} ({(STATUS[i.status] || [i.status])[0]})</option>)}</optgroup> : null; })}
      </select>
      {contoh && <div className="hint" style={{ marginTop: 4 }}>Akan dipasang di: {camp?.nama} › {set?.nama}{set?.harian ? ` · ${rp(set.harian)}/hari` : camp?.harian ? ` · ${rp(camp.harian)}/hari (campaign)` : ''}</div>}</div>
    <div className="field"><label>Nama iklan (untuk Anda, tidak tampil ke publik) <span className="req">*</span></label>
      <input value={f.nama} maxLength={120} onChange={e => setF({ ...f, nama: e.target.value })} placeholder="mis. Image 2 - Promo November" /></div>
    <PilihGambar gambar={gambar} setGambar={setGambar} catatan="Paling aman rasio 1:1 atau 4:5. Video belum bisa dipasang dari sini." />
    <div className="field"><label>Caption / teks utama <span className="req">*</span></label>
      <textarea rows={6} value={f.caption} onChange={e => setF({ ...f, caption: e.target.value })} /></div>
    <div className="field"><label>Judul (opsional — kosongkan untuk memakai judul iklan contoh)</label>
      <input value={f.judul} maxLength={80} onChange={e => setF({ ...f, judul: e.target.value })} /></div>
    <button className="btn btn-primary" disabled={!siap || sibuk}
      onClick={() => jalankan(`Pasang iklan "${f.nama}" di ad set "${set?.nama}"?\n\nIklan dibuat dalam keadaan MATI dan belum memakai anggaran.`, 'iklan_baru', { ...f, adset_id: contoh.adset_id, gambar: gambar.data },
        'Iklan dibuat (masih MATI) ✅ — cek lalu nyalakan di tab Kelola Iklan', () => { setF({ contoh_id: f.contoh_id, nama: '', judul: '', caption: '' }); setGambar(null); keIklan(); })}>
      {sibuk ? 'Memasang…' : 'Pasang iklan (dibuat MATI dulu)'}</button>
  </div>);
}

// ===================== POSTING ORGANIK =====================
function TabOrganik({ sibuk, setSibuk, punya }) {
  const [hal, setHal] = useState(null);
  const [page, setPage] = useState('');
  const [ke, setKe] = useState({ fb: true, ig: true });
  const [caption, setCaption] = useState('');
  const [gambar, setGambar] = useState(null);
  useEffect(() => { api('/api/digital?bagian=halaman').then(r => { setHal(r.halaman); setPage(r.halaman[0]?.id || ''); }).catch(e => { toast(e.message); setHal([]); }); }, []);
  if (!hal) return <div className="loading">Memuat Halaman…</div>;
  if (!hal.length) return <div className="note"><b>Belum ada Halaman Facebook yang bisa diposting dengan token ini.</b> Tugaskan Halaman Bio District / Permai Indah ke System User di Business Settings, dan pastikan token punya izin <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, dan <code>instagram_content_publish</code>.</div>;
  const h = hal.find(x => x.id === page), tujuan = [ke.fb && 'fb', ke.ig && h?.ig && 'ig'].filter(Boolean);
  async function posting() {
    const nama = tujuan.map(t => t === 'fb' ? 'Facebook' : 'Instagram @' + h.ig.nama).join(' dan ');
    if (!window.confirm(`Posting SEKARANG ke ${nama} (${h.nama})?\n\nPostingan langsung tampil ke publik.`)) return;
    setSibuk(true);
    try {
      const r = await kirim('organik', { page_id: page, ke: tujuan, caption, gambar: gambar.data });
      const g = Object.entries(r.gagal || {});
      toast(g.length ? 'Sebagian berhasil. Gagal — ' + g.map(([k, v]) => `${k === 'fb' ? 'Facebook' : 'Instagram'}: ${v}`).join(' · ') : 'Postingan terbit ✅');
      if (!g.length) { setCaption(''); setGambar(null); }
    } catch (e) { toast(e.message); } finally { setSibuk(false); }
  }
  return (<div className="card">
    <h2>Posting organik (langsung terbit)</h2>
    {!punya('pages_manage_posts') && <div className="note">Token belum punya izin <code>pages_manage_posts</code> — posting akan ditolak Meta sampai izinnya ditambahkan.</div>}
    <div className="fu-toolbar">{hal.map(x => <button key={x.id} className={'sort-btn' + (page === x.id ? ' active' : '')} onClick={() => setPage(x.id)}>{x.nama}</button>)}</div>
    <div className="fu-toolbar">
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={ke.fb} onChange={e => setKe({ ...ke, fb: e.target.checked })} /> Halaman Facebook</label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: h?.ig ? 1 : .5 }}><input type="checkbox" disabled={!h?.ig} checked={ke.ig && !!h?.ig} onChange={e => setKe({ ...ke, ig: e.target.checked })} /> Instagram {h?.ig ? '@' + h.ig.nama : '(belum terhubung ke Halaman ini)'}</label>
    </div>
    <PilihGambar gambar={gambar} setGambar={setGambar} catatan="Satu gambar per postingan. Instagram hanya menerima rasio antara 4:5 (potret) dan 1.91:1 (lanskap). Carousel, Reels & video belum bisa dari sini." />
    <div className="field"><label>Caption</label><textarea rows={7} value={caption} onChange={e => setCaption(e.target.value)} /></div>
    <button className="btn btn-primary" disabled={sibuk || !gambar || !tujuan.length} onClick={posting}>{sibuk ? 'Memposting…' : 'Posting sekarang'}</button>
  </div>);
}

// ===================== ARTIKEL WEBSITE =====================
function TabWeb({ situs, sibuk, setSibuk }) {
  const [proj, setProj] = useState(situs[0]?.project || '');
  const [w, setW] = useState(null);
  const [f, setF] = useState({ judul: '', ringkas: '', isi: '', kategori: '' });
  const [gambar, setGambar] = useState(null);
  const muat = () => { if (!proj) return; setW(null); api('/api/digital?bagian=wp&project=' + encodeURIComponent(proj)).then(setW).catch(e => { toast(e.message); setW({ galat: e.message, artikel: [], kategori: [] }); }); };
  useEffect(muat, [proj]); // eslint-disable-line
  if (!situs.length) return <div className="note"><b>Website belum disambungkan.</b> Isi <code>WP_BIO_URL</code> (mis. https://biodistrictofficial.com), <code>WP_BIO_USER</code>, dan <code>WP_BIO_APP_PASSWORD</code> di Vercel lalu Redeploy.
    Application Password dibuat di WordPress: Users → Profile → Application Passwords.</div>;
  async function simpan(terbit) {
    if (terbit && !window.confirm(`TERBITKAN artikel "${f.judul}" ke website ${proj} sekarang?\n\nArtikel langsung tampil ke publik.`)) return;
    setSibuk(true);
    try { const r = await kirim('wp_post', { project: proj, ...f, gambar: gambar?.data, terbit });
      toast(terbit ? 'Artikel terbit ✅' : 'Tersimpan sebagai draf ✅'); setF({ judul: '', ringkas: '', isi: '', kategori: f.kategori }); setGambar(null); muat(); return r; }
    catch (e) { toast(e.message); } finally { setSibuk(false); }
  }
  async function ubahStatus(a, terbit) {
    if (!window.confirm(`${terbit ? 'TERBITKAN' : 'Tarik kembali jadi draf'}: "${a.judul}"?`)) return;
    setSibuk(true);
    try { await kirim('wp_status', { project: proj, id: a.id, terbit }); toast(terbit ? 'Artikel terbit ✅' : 'Artikel ditarik jadi draf ✅'); muat(); } catch (e) { toast(e.message); } finally { setSibuk(false); }
  }
  const siap = f.judul.trim() && f.isi.trim().length >= 50;
  return (<>
    <div className="fu-toolbar">{situs.map(s => <button key={s.project} className={'chip-proyek' + (proj === s.project ? ' active' : '')} onClick={() => setProj(s.project)}>{s.project}</button>)}
      <span className="hint">{situs.find(s => s.project === proj)?.url}</span></div>
    {w?.galat && <div className="note" style={{ borderLeft: '4px solid var(--red)' }}>{w.galat}</div>}
    <div className="card" style={{ marginBottom: 12 }}>
      <h2>Tulis artikel / news</h2>
      <div className="field"><label>Judul <span className="req">*</span></label><input value={f.judul} onChange={e => setF({ ...f, judul: e.target.value })} /></div>
      <div className="field"><label>Ringkasan (1–2 kalimat, tampil di daftar artikel &amp; hasil pencarian)</label><textarea rows={2} value={f.ringkas} onChange={e => setF({ ...f, ringkas: e.target.value })} /></div>
      <div className="field"><label>Isi artikel <span className="req">*</span></label><textarea rows={14} value={f.isi} onChange={e => setF({ ...f, isi: e.target.value })} />
        <div className="hint" style={{ marginTop: 4 }}>Baris kosong = paragraf baru · awali baris dengan <code>## </code> untuk subjudul · awali dengan <code>- </code> untuk butir daftar.</div></div>
      {w?.kategori?.length > 0 && <div className="field"><label>Kategori</label>
        <select value={f.kategori} onChange={e => setF({ ...f, kategori: e.target.value })}><option value="">— bawaan website —</option>{w.kategori.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}</select></div>}
      <PilihGambar gambar={gambar} setGambar={setGambar} catatan="Opsional — menjadi gambar utama artikel." />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" disabled={!siap || sibuk} onClick={() => simpan(false)}>Simpan sebagai draf</button>
        <button className="btn btn-primary" disabled={!siap || sibuk} onClick={() => simpan(true)}>{sibuk ? 'Mengirim…' : 'Terbitkan sekarang'}</button>
      </div>
    </div>
    <div className="card"><h2>Artikel terakhir di website</h2>
      {!w ? <div className="loading">Memuat…</div> : !w.artikel.length ? <p className="hint">Belum ada artikel.</p> :
        w.artikel.map(a => (<div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '7px 0', borderTop: '1px solid var(--line)' }}>
          <span className={'kp-pill sm ' + (a.status === 'publish' ? 'kp-ok' : 'kp-no')}>{a.status === 'publish' ? 'Terbit' : a.status === 'future' ? 'Terjadwal' : 'Draf'}</span>
          <a href={a.link} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{a.judul}</a>
          <span className="hint">{new Date(a.tgl).toLocaleDateString('id-ID')}</span>
          {a.status === 'draft' && <button className="sort-btn" disabled={sibuk} onClick={() => ubahStatus(a, true)}>Terbitkan</button>}
          {a.status === 'publish' && <button className="sort-btn" disabled={sibuk} onClick={() => ubahStatus(a, false)}>Tarik jadi draf</button>}
        </div>))}
    </div>
  </>);
}

// ===================== RIWAYAT & PENGATURAN =====================
function TabAtur({ st, muatStatus, sibuk, jalankan }) {
  const [batas, setBatas] = useState(String(st.batas));
  const [rw, setRw] = useState(null);
  const muat = () => api('/api/digital?bagian=riwayat').then(r => setRw(r.riwayat)).catch(() => setRw([]));
  useEffect(() => { muat(); }, []);
  const cek = (ok, teks) => <div>{ok ? '✅' : '❌'} {teks}</div>;
  const izin = st.izin || [];
  return (<>
    <div className="card" style={{ marginBottom: 12 }}>
      <h2>Batas anggaran harian (pengaman)</h2>
      <p className="hint" style={{ marginBottom: 8 }}>Dari CRM, anggaran harian satu campaign/ad set tidak bisa diisi di atas angka ini, dan campaign/ad set dengan anggaran di atasnya tidak bisa dinyalakan. Gunanya mencegah salah ketik (mis. kelebihan nol).</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0, minWidth: 200 }}><label>Maksimum per hari (Rp)</label><input inputMode="numeric" value={batas} onChange={e => setBatas(e.target.value.replace(/[^0-9]/g, ''))} /></div>
        <button className="btn btn-primary" disabled={sibuk || !Number(batas) || Number(batas) === st.batas}
          onClick={() => jalankan(`Ubah batas anggaran harian menjadi Rp${Number(batas).toLocaleString('id-ID')}?`, 'batas', { harian: Number(batas) }, 'Batas disimpan ✅', () => { muatStatus(); muat(); })}>Simpan batas</button>
      </div></div>
    <div className="card" style={{ marginBottom: 12 }}>
      <h2>Sambungan</h2>
      <div className="ai-cek">
        {cek(st.token && !st.galatToken, <>Token Meta{st.sumberToken ? ' — ' + st.sumberToken : ' — belum dipasang (META_ADS_TOKEN)'}</>)}
        {cek(izin.includes('ads_management'), <><b>ads_management</b> — menyalakan/mematikan, anggaran, target, pasang iklan</>)}
        {cek(izin.includes('pages_manage_posts') && izin.includes('pages_read_engagement'), <><b>pages_manage_posts</b> + <b>pages_read_engagement</b> — posting ke Halaman Facebook</>)}
        {cek(izin.includes('instagram_content_publish'), <><b>instagram_content_publish</b> — posting ke Instagram</>)}
        {cek(st.akun.length > 0, <>Akun iklan: {st.akun.map(a => `${a.project || a.nama} (${a.id})`).join(' · ') || 'belum ada'}</>)}
        {cek(st.wp.length > 0, <>Website: {st.wp.map(s => `${s.project} — ${s.url}`).join(' · ') || 'belum disambungkan (WP_BIO_URL, WP_BIO_USER, WP_BIO_APP_PASSWORD)'}</>)}
      </div></div>
    <div className="card"><h2>Riwayat perubahan (40 terakhir)</h2>
      {!rw ? <div className="loading">Memuat…</div> : !rw.length ? <p className="hint">Belum ada perubahan dari menu ini.</p> :
        rw.map((r, i) => (<div key={i} style={{ padding: '6px 0', borderTop: i ? '1px solid var(--line)' : 'none', fontSize: 13 }}>
          <span className="hint">{new Date(r.waktu).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })} · {r.nama}</span><br />{r.detail}</div>))}
    </div>
  </>);
}
