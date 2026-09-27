'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, fmtDate, todayISO } from '@/components/util';

const PLATFORM = ['Instagram', 'Facebook', 'Tiktok', 'Google', 'Youtube', 'Website', 'Lainnya'];
const FORMAT = ['Reels / Short Video', 'Carousel', 'Single Post', 'Story', 'Video Panjang', 'Live', 'Search Ads', 'Display / Banner', 'Lainnya'];
const TUJUAN_C = ['leads', 'awareness', 'promo', 'traffic', 'event'];
const K0 = { tgl: todayISO(), platform: 'Instagram', project: '', format: 'Reels / Short Video', topik: '', hook: '', jam: '', durasi: '', link: '' };
const C0 = { nama: '', platform: 'Facebook', project: '', tujuan: 'leads', budget: '', status: 'Aktif', catatan: '' };
const M0 = { content_id: '', tgl: todayISO(), reach: '', like_n: '', komentar: '', share_n: '', save_n: '', view3: '', view_full: '', klik_bio: '' };
const A0 = { tgl: todayISO(), campaign: '', kreatif: '', spend: '', impresi: '', reach: '', klik: '', hasil: '', catatan: '' };

const er = (r) => { const reach = Number(r.reach) || 0; if (!reach) return null; return ((Number(r.like_n) || 0) + (Number(r.komentar) || 0) + (Number(r.share_n) || 0) + (Number(r.save_n) || 0)) / reach; };
const pct = (x) => x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%';
const per = (spend, n) => (spend > 0 && n > 0) ? fmtRp(Math.round(spend / n)) : '—';
const jamBucket = (j) => { const h = parseInt(String(j || '').split(/[:.]/)[0], 10); if (isNaN(h)) return null; return h < 10 ? 'Pagi (<10)' : h < 15 ? 'Siang (10–14)' : h < 19 ? 'Sore (15–18)' : 'Malam (≥19)'; };

export default function MarcomPage() {
  const [tab, setTab] = useState('insight');
  const [data, setData] = useState(null);
  const [set, setSet] = useState({ project: [] });
  const [busy, setBusy] = useState(false);
  const [periode, setPeriode] = useState('bulan'); // bulan | semua | custom
  const [d1, setD1] = useState(''); const [d2, setD2] = useState('');
  const [k, setK] = useState(K0); const [kEdit, setKEdit] = useState(null);
  const [c, setC] = useState(C0); const [cEdit, setCEdit] = useState(null);
  const [m, setM] = useState(M0);
  const [a, setA] = useState(A0); const [aEdit, setAEdit] = useState(null);

  const rentang = useMemo(() => {
    if (periode === 'bulan') { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth(), 1).toISOString().slice(0, 10), todayISO()]; }
    if (periode === 'custom') return [d1 || '', d2 || ''];
    return ['', ''];
  }, [periode, d1, d2]);

  const muat = () => Promise.all([
    api('/api/marcom?d1=' + rentang[0] + '&d2=' + rentang[1]),
    api('/api/settings'),
  ]).then(([d, s]) => { setData(d); setSet(s); }).catch(e => toast(e.message));
  useEffect(() => { muat(); }, [rentang[0], rentang[1]]); // eslint-disable-line

  const fk = key => ({ value: k[key], onChange: e => setK({ ...k, [key]: e.target.value }) });
  const fc = key => ({ value: c[key], onChange: e => setC({ ...c, [key]: e.target.value }) });
  const fm = key => ({ value: m[key], onChange: e => setM({ ...m, [key]: e.target.value }) });
  const fa = key => ({ value: a[key], onChange: e => setA({ ...a, [key]: e.target.value }) });

  async function simpan(jenis, body, editId, reset) {
    setBusy(true);
    try {
      if (editId) await api('/api/marcom', { method: 'PATCH', body: JSON.stringify({ jenis, id: editId, ...body }) });
      else await api('/api/marcom', { method: 'POST', body: JSON.stringify({ jenis, ...body }) });
      toast(editId ? 'Perubahan tersimpan' : 'Tersimpan ✅');
      reset(); await muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function hapus(jenis, id, nama) {
    if (!confirm('Hapus ' + jenis + ' "' + nama + '"?' + (jenis === 'konten' ? '\nRiwayat angkanya ikut terhapus.' : ''))) return;
    try { await api('/api/marcom?jenis=' + jenis + '&id=' + id, { method: 'DELETE' }); toast('Terhapus'); muat(); }
    catch (e) { toast(e.message); }
  }

  // ===== Insight (dihitung dari data GET) =====
  const spendMap = useMemo(() => Object.fromEntries((data?.spend || []).map(s => [s.kunci, Number(s.spend) || 0])), [data]);
  const totSpend = useMemo(() => Object.values(spendMap).reduce((x, y) => x + y, 0), [spendMap]);
  const totFunnel = useMemo(() => (data?.bySumber || []).reduce((t, r) => ({ l0: t.l0 + r.l0, l1: t.l1 + r.l1, l2: t.l2 + r.l2, l3: t.l3 + r.l3, nilai: t.nilai + Number(r.nilai || 0) }), { l0: 0, l1: 0, l2: 0, l3: 0, nilai: 0 }), [data]);
  const polaFormat = useMemo(() => {
    const g = {};
    (data?.contents || []).forEach(x => {
      const key = x.format || '-'; g[key] = g[key] || { n: 0, reach: 0, eng: 0, klik: 0 };
      g[key].n++; g[key].reach += Number(x.reach) || 0; g[key].klik += Number(x.klik_bio) || 0;
      g[key].eng += (Number(x.like_n) || 0) + (Number(x.komentar) || 0) + (Number(x.share_n) || 0) + (Number(x.save_n) || 0);
    });
    return Object.entries(g).map(([f, v]) => ({ format: f, n: v.n, reach: v.reach, er: v.reach ? v.eng / v.reach : null, klik: v.klik })).sort((x, y) => (y.er || 0) - (x.er || 0));
  }, [data]);
  const polaJam = useMemo(() => {
    const g = {};
    (data?.contents || []).forEach(x => {
      const b = jamBucket(x.jam); if (!b) return;
      g[b] = g[b] || { n: 0, reach: 0, eng: 0 };
      g[b].n++; g[b].reach += Number(x.reach) || 0;
      g[b].eng += (Number(x.like_n) || 0) + (Number(x.komentar) || 0) + (Number(x.share_n) || 0) + (Number(x.save_n) || 0);
    });
    return Object.entries(g).map(([b, v]) => ({ jam: b, n: v.n, er: v.reach ? v.eng / v.reach : null })).sort((x, y) => (y.er || 0) - (x.er || 0));
  }, [data]);
  const audDomisili = useMemo(() => {
    const g = {};
    (data?.audiens || []).forEach(r => { const key = r.domisili; g[key] = g[key] || { l2: 0, l3: 0 }; g[key].l2 += r.l2; g[key].l3 += r.l3; });
    return Object.entries(g).map(([d, v]) => ({ nama: d, ...v })).sort((x, y) => y.l2 - x.l2).slice(0, 10);
  }, [data]);
  const audTujuan = useMemo(() => {
    const g = {};
    (data?.audiens || []).forEach(r => { const key = r.tujuan; g[key] = g[key] || { l2: 0, l3: 0 }; g[key].l2 += r.l2; g[key].l3 += r.l3; });
    return Object.entries(g).map(([d, v]) => ({ nama: d, ...v })).sort((x, y) => y.l2 - x.l2);
  }, [data]);
  const tim = useMemo(() => {
    const leadMap = Object.fromEntries((data?.timLead || []).map(r => [r.username, r]));
    return (data?.timKonten || []).map(u => ({ ...u, ...(leadMap[u.username] || { l0: 0, l0_bln: 0, l2: 0, l3: 0, nilai: 0 }) }));
  }, [data]);

  if (!data) return <div className="loading">Memuat…</div>;
  const camps = data.campaigns || [];

  return (
    <>
      <div className="page-head"><div><h1>Analisa Marcom</h1>
        <div className="sub">Konten & iklan tim marcom vs hasil di CRM — L0 lead masuk · L1 tersentuh FU · L2 berkualitas (Warm/Hot/Site Visit+) · L3 Booking</div></div>
        <div className="stamp">Spend: <b>{fmtRp(totSpend)}</b></div></div>

      <div className="form-tabs" style={{ marginBottom: 10 }}>
        {[['insight', '1 · Insight'], ['konten', '2 · Konten'], ['iklan', '3 · Iklan'], ['tim', '4 · Output Tim']].map(([key, t]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{t}</button>))}
      </div>

      <div className="fu-toolbar" style={{ marginBottom: 12 }}>
        {[['bulan', 'Bulan Ini'], ['semua', 'Semua Periode'], ['custom', 'Pilih Tanggal']].map(([v, t]) => (
          <button key={v} className={'sort-btn' + (periode === v ? ' active' : '')} onClick={() => setPeriode(v)}>{t}</button>))}
        {periode === 'custom' && (<>
          <input type="date" className="sort-filter" style={{ marginLeft: 0 }} value={d1} onChange={e => setD1(e.target.value)} />
          <input type="date" className="sort-filter" style={{ marginLeft: 0 }} value={d2} onChange={e => setD2(e.target.value)} />
        </>)}
      </div>

      {tab === 'insight' && (<>
        <div className="kpi-grid" style={{ marginBottom: 12 }}>
          <div className="kpi"><div className="kpi-label">Lead Masuk (L0)</div><div className="kpi-val" style={{ color: 'var(--green)' }}>{totFunnel.l0}</div></div>
          <div className="kpi"><div className="kpi-label">Lead Berkualitas (L2)</div><div className="kpi-val" style={{ color: 'var(--brass)' }}>{totFunnel.l2}</div></div>
          <div className="kpi"><div className="kpi-label">Booking (L3) · Nilai</div><div className="kpi-val" style={{ fontSize: 17 }}>{totFunnel.l3} · {fmtRp(totFunnel.nilai)}</div></div>
          <div className="kpi"><div className="kpi-label">CPL / CPQL / per Booking</div><div className="kpi-val" style={{ fontSize: 14 }}>{per(totSpend, totFunnel.l0)} / {per(totSpend, totFunnel.l2)} / {per(totSpend, totFunnel.l3)}</div></div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Performa per Campaign (closed-loop)</h3>
          <div className="tbl-wrap tbl-compact"><table>
            <thead><tr><th>Campaign</th><th className="num">Spend</th><th className="num">L0</th><th className="num">L1</th><th className="num">L2</th><th className="num">L3</th><th className="num">Nilai Booking</th><th className="num">CPL</th><th className="num">CPQL</th><th className="num">Biaya/Booking</th></tr></thead>
            <tbody>{(data.byCampaign || []).map(r => { const sp = spendMap[r.kunci] || 0; return (
              <tr key={r.kunci}><td data-label="Campaign"><b>{r.kunci}</b></td>
                <td className="num" data-label="Spend">{sp ? fmtRp(sp) : '—'}</td>
                <td className="num" data-label="L0">{r.l0}</td><td className="num" data-label="L1">{r.l1}</td>
                <td className="num" data-label="L2"><b>{r.l2}</b></td><td className="num" data-label="L3"><b>{r.l3}</b></td>
                <td className="num" data-label="Nilai">{Number(r.nilai) ? fmtRp(r.nilai) : '—'}</td>
                <td className="num" data-label="CPL">{per(sp, r.l0)}</td><td className="num" data-label="CPQL">{per(sp, r.l2)}</td>
                <td className="num" data-label="Biaya/Booking">{per(sp, r.l3)}</td></tr>); })}</tbody>
          </table></div>
          <span className="hint">Lead terhitung ke campaign bila kolom Campaign diisi saat input lead (otomatis bila link iklan memakai UTM sesuai taksonomi).</span>
        </div>

        <div className="two-col">
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Performa per Sumber Lead</h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Sumber</th><th className="num">L0</th><th className="num">L2</th><th className="num">L3</th><th className="num">Rasio L2/L0</th></tr></thead>
              <tbody>{(data.bySumber || []).map(r => (
                <tr key={r.kunci}><td data-label="Sumber">{r.kunci}</td><td className="num" data-label="L0">{r.l0}</td>
                  <td className="num" data-label="L2"><b>{r.l2}</b></td><td className="num" data-label="L3">{r.l3}</td>
                  <td className="num" data-label="Rasio">{r.l0 ? pct(r.l2 / r.l0) : '—'}</td></tr>))}</tbody>
            </table></div>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Kreatif / Konten Penghasil Lead</h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Kode Kreatif (utm_content)</th><th className="num">L0</th><th className="num">L2</th><th className="num">L3</th></tr></thead>
              <tbody>{(data.byKonten || []).length ? (data.byKonten || []).map(r => (
                <tr key={r.kunci}><td data-label="Kreatif"><b>{r.kunci}</b></td><td className="num" data-label="L0">{r.l0}</td>
                  <td className="num" data-label="L2"><b>{r.l2}</b></td><td className="num" data-label="L3">{r.l3}</td></tr>))
                : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada lead dengan kode kreatif — isi kolom Konten/Kreatif di Form Input.</td></tr>}</tbody>
            </table></div>
          </div>
        </div>

        <div className="two-col">
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Pola Konten yang Menang</h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Format</th><th className="num">Jml</th><th className="num">Total Reach</th><th className="num">ER</th><th className="num">Klik Bio</th></tr></thead>
              <tbody>{polaFormat.map(r => (
                <tr key={r.format}><td data-label="Format">{r.format}</td><td className="num" data-label="Jml">{r.n}</td>
                  <td className="num" data-label="Reach">{r.reach.toLocaleString('id-ID')}</td>
                  <td className="num" data-label="ER"><b>{pct(r.er)}</b></td><td className="num" data-label="Klik">{r.klik}</td></tr>))}</tbody>
            </table></div>
            {polaJam.length > 0 && <div className="hint" style={{ marginTop: 8 }}>Jam tayang terbaik (ER): {polaJam.map(j => `${j.jam} ${pct(j.er)}`).join(' · ')}</div>}
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Audiens yang Tepat (dari lead L2 & Booking)</h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Domisili</th><th className="num">L2</th><th className="num">Booking</th></tr></thead>
              <tbody>{audDomisili.map(r => (
                <tr key={r.nama}><td data-label="Domisili"><b>{r.nama}</b></td><td className="num" data-label="L2">{r.l2}</td><td className="num" data-label="Booking">{r.l3}</td></tr>))}</tbody>
            </table></div>
            <div className="hint" style={{ marginTop: 8 }}>Tujuan beli: {audTujuan.map(t => `${t.nama} ${t.l2}`).join(' · ') || '—'}. Data usia/gender menyusul saat konektor API platform aktif — untuk targeting, profil di atas (domisili & tujuan aktual yang closing) lebih akurat daripada klaim platform.</div>
          </div>
        </div>
      </>)}

      {tab === 'konten' && (<>
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{kEdit ? 'Edit Konten' : 'Catat Konten Tayang'} <span className="hint">(2 menit tiap posting — atribut inilah yang membuat "algoritma" bisa dibaca)</span></h3>
          <div className="form-grid">
            <div className="field"><label>Tanggal Tayang</label><input type="date" {...fk('tgl')} /></div>
            <div className="field"><label>Platform <span className="req">*</span></label><select {...fk('platform')}>{PLATFORM.map(p => <option key={p}>{p}</option>)}</select></div>
            <div className="field"><label>Project</label><select {...fk('project')}><option value="">— pilih —</option>{(set.project || []).map(p => <option key={p}>{p}</option>)}</select></div>
            <div className="field"><label>Format <span className="req">*</span></label><select {...fk('format')}>{FORMAT.map(f => <option key={f}>{f}</option>)}</select></div>
            <div className="field"><label>Topik</label><input {...fk('topik')} placeholder="contoh: promo DP 0% / progres pembangunan" /></div>
            <div className="field"><label>Hook (3 detik pertama)</label><input {...fk('hook')} placeholder="kalimat/adegan pembuka" /></div>
            <div className="field"><label>Jam Tayang</label><input {...fk('jam')} placeholder="contoh: 19:00" /></div>
            <div className="field"><label>Durasi</label><input {...fk('durasi')} placeholder="contoh: 30 dtk" /></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Link Konten</label><input {...fk('link')} placeholder="https://…" /></div>
          </div>
          <div className="form-foot">
            <button className="btn btn-primary" disabled={busy} onClick={() => simpan('konten', k, kEdit, () => { setKEdit(null); setK({ ...K0, tgl: todayISO() }); })}>{kEdit ? 'Simpan Perubahan' : 'Simpan Konten'}</button>
            {kEdit && <button className="sort-btn" onClick={() => { setKEdit(null); setK({ ...K0, tgl: todayISO() }); }}>Batal edit</button>}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Update Angka Performa <span className="hint">(seminggu sekali per konten — angka terbaru menimpa tanggal yang sama)</span></h3>
          <div className="form-grid">
            <div className="field"><label>Konten <span className="req">*</span></label>
              <select {...fm('content_id')}><option value="">— pilih konten —</option>
                {(data.contents || []).map(x => <option key={x.id} value={x.id}>{fmtDate(x.tgl)} · {x.platform} · {(x.topik || x.format || '').slice(0, 40)}</option>)}</select></div>
            <div className="field"><label>Per Tanggal</label><input type="date" {...fm('tgl')} /></div>
            <div className="field"><label>Reach</label><input type="number" min="0" {...fm('reach')} /></div>
            <div className="field"><label>Like</label><input type="number" min="0" {...fm('like_n')} /></div>
            <div className="field"><label>Komentar</label><input type="number" min="0" {...fm('komentar')} /></div>
            <div className="field"><label>Share</label><input type="number" min="0" {...fm('share_n')} /></div>
            <div className="field"><label>Save</label><input type="number" min="0" {...fm('save_n')} /></div>
            <div className="field"><label>View 3 dtk</label><input type="number" min="0" {...fm('view3')} /></div>
            <div className="field"><label>View Selesai</label><input type="number" min="0" {...fm('view_full')} /></div>
            <div className="field"><label>Klik Bio / Link</label><input type="number" min="0" {...fm('klik_bio')} /></div>
          </div>
          <div className="form-foot"><button className="btn btn-primary" disabled={busy} onClick={() => simpan('metrik', m, null, () => setM({ ...M0, tgl: todayISO() }))}>Simpan Angka</button></div>
        </div>

        <div className="tbl-wrap tbl-compact"><table>
          <thead><tr><th>Tanggal</th><th>Platform</th><th>Format</th><th>Topik / Hook</th><th>Jam</th><th className="num">Reach</th><th className="num">ER</th><th className="num">Klik Bio</th><th>Aksi</th></tr></thead>
          <tbody>{(data.contents || []).length ? (data.contents || []).map(x => (
            <tr key={x.id}>
              <td data-label="Tanggal">{fmtDate(x.tgl)}</td>
              <td data-label="Platform">{x.platform}</td>
              <td data-label="Format"><span className="badge b-new">{x.format}</span></td>
              <td data-label="Topik"><b>{x.topik || '—'}</b>{x.hook ? <div className="hint">{x.hook}</div> : null}</td>
              <td data-label="Jam">{x.jam || '—'}</td>
              <td className="num" data-label="Reach">{Number(x.reach) ? Number(x.reach).toLocaleString('id-ID') : '—'}</td>
              <td className="num" data-label="ER"><b>{pct(er(x))}</b></td>
              <td className="num" data-label="Klik">{x.klik_bio || '—'}</td>
              <td data-label="Aksi"><span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { setKEdit(x.id); setK({ tgl: String(x.tgl || '').slice(0, 10), platform: x.platform || 'Instagram', project: x.project || '', format: x.format || FORMAT[0], topik: x.topik || '', hook: x.hook || '', jam: x.jam || '', durasi: x.durasi || '', link: x.link || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { setM({ ...M0, content_id: String(x.id), tgl: todayISO() }); toast('Isi angka performanya lalu Simpan Angka'); }}>Angka</button>
                <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)' }} onClick={() => hapus('konten', x.id, x.topik || x.format)}>Hapus</button>
              </span></td>
            </tr>)) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada konten tercatat pada periode ini.</td></tr>}</tbody>
        </table></div>
      </>)}

      {tab === 'iklan' && (<>
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{cEdit ? 'Edit Campaign' : 'Daftarkan Campaign'} <span className="hint">(nama HARUS sama dengan utm_campaign & nama di platform iklan)</span></h3>
          <div className="form-grid">
            <div className="field"><label>Nama Campaign <span className="req">*</span></label><input {...fc('nama')} placeholder="bio_leads_sep26" disabled={!!cEdit} /></div>
            <div className="field"><label>Platform</label><select {...fc('platform')}>{PLATFORM.map(p => <option key={p}>{p}</option>)}</select></div>
            <div className="field"><label>Project</label><select {...fc('project')}><option value="">— pilih —</option>{(set.project || []).map(p => <option key={p}>{p}</option>)}</select></div>
            <div className="field"><label>Tujuan</label><select {...fc('tujuan')}>{TUJUAN_C.map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label>Budget Rencana (Rp)</label><input type="number" min="0" {...fc('budget')} /></div>
            <div className="field"><label>Status</label><select {...fc('status')}><option>Aktif</option><option>Selesai</option></select></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Catatan</label><input {...fc('catatan')} placeholder="target audiens, penempatan, dsb" /></div>
          </div>
          <div className="form-foot">
            <button className="btn btn-primary" disabled={busy} onClick={() => simpan('campaign', c, cEdit, () => { setCEdit(null); setC(C0); })}>{cEdit ? 'Simpan Perubahan' : 'Simpan Campaign'}</button>
            {cEdit && <button className="sort-btn" onClick={() => { setCEdit(null); setC(C0); }}>Batal edit</button>}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Catat Performa Iklan <span className="hint">(mingguan per campaign/kreatif dari Ads Manager — nanti otomatis saat konektor API aktif)</span></h3>
          <div className="form-grid">
            <div className="field"><label>Tanggal</label><input type="date" {...fa('tgl')} /></div>
            <div className="field"><label>Campaign <span className="req">*</span></label>
              <select {...fa('campaign')}><option value="">— pilih —</option>{camps.filter(x => x.status === 'Aktif').map(x => <option key={x.id} value={x.nama}>{x.nama}</option>)}</select></div>
            <div className="field"><label>Kreatif (utm_content)</label><input {...fa('kreatif')} placeholder="reels-01" /></div>
            <div className="field"><label>Spend (Rp)</label><input type="number" min="0" {...fa('spend')} /></div>
            <div className="field"><label>Impresi</label><input type="number" min="0" {...fa('impresi')} /></div>
            <div className="field"><label>Reach</label><input type="number" min="0" {...fa('reach')} /></div>
            <div className="field"><label>Klik</label><input type="number" min="0" {...fa('klik')} /></div>
            <div className="field"><label>Hasil (versi platform)</label><input type="number" min="0" {...fa('hasil')} /></div>
          </div>
          <div className="form-foot">
            <button className="btn btn-primary" disabled={busy} onClick={() => simpan('iklan', a, aEdit, () => { setAEdit(null); setA({ ...A0, tgl: todayISO() }); })}>{aEdit ? 'Simpan Perubahan' : 'Simpan Entri'}</button>
            {aEdit && <button className="sort-btn" onClick={() => { setAEdit(null); setA({ ...A0, tgl: todayISO() }); }}>Batal edit</button>}
          </div>
        </div>

        <div className="two-col">
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Daftar Campaign</h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Nama</th><th>Platform</th><th>Project</th><th className="num">Budget</th><th className="num">Spend</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>{camps.length ? camps.map(x => (
                <tr key={x.id}>
                  <td data-label="Nama"><b>{x.nama}</b></td><td data-label="Platform">{x.platform}</td><td data-label="Project">{x.project || '—'}</td>
                  <td className="num" data-label="Budget">{Number(x.budget) ? fmtRp(x.budget) : '—'}</td>
                  <td className="num" data-label="Spend">{spendMap[x.nama] ? fmtRp(spendMap[x.nama]) : '—'}</td>
                  <td data-label="Status"><span className={'badge ' + (x.status === 'Aktif' ? 'b-warm' : 'b-cold')}>{x.status}</span></td>
                  <td data-label="Aksi"><span style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { setCEdit(x.id); setC({ nama: x.nama, platform: x.platform || 'Facebook', project: x.project || '', tujuan: x.tujuan || 'leads', budget: x.budget || '', status: x.status || 'Aktif', catatan: x.catatan || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                    <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)' }} onClick={() => hapus('campaign', x.id, x.nama)}>Hapus</button>
                  </span></td>
                </tr>)) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada campaign — daftarkan dulu di form atas.</td></tr>}</tbody>
            </table></div>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Entri Performa Terakhir</h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Tanggal</th><th>Campaign</th><th>Kreatif</th><th className="num">Spend</th><th className="num">Klik</th><th className="num">Hasil</th><th>Aksi</th></tr></thead>
              <tbody>{(data.ads || []).length ? (data.ads || []).slice(0, 60).map(x => (
                <tr key={x.id}>
                  <td data-label="Tanggal">{fmtDate(x.tgl)}</td><td data-label="Campaign">{x.campaign}</td><td data-label="Kreatif">{x.kreatif || '—'}</td>
                  <td className="num" data-label="Spend">{fmtRp(x.spend)}</td><td className="num" data-label="Klik">{x.klik || 0}</td><td className="num" data-label="Hasil">{x.hasil || 0}</td>
                  <td data-label="Aksi"><span style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { setAEdit(x.id); setA({ tgl: String(x.tgl || '').slice(0, 10), campaign: x.campaign || '', kreatif: x.kreatif || '', spend: x.spend || '', impresi: x.impresi || '', reach: x.reach || '', klik: x.klik || '', hasil: x.hasil || '', catatan: x.catatan || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                    <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)' }} onClick={() => hapus('iklan', x.id, x.campaign + ' ' + fmtDate(x.tgl))}>Hapus</button>
                  </span></td>
                </tr>)) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada entri performa iklan.</td></tr>}</tbody>
            </table></div>
          </div>
        </div>
      </>)}

      {tab === 'tim' && (<>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Output Tim Marcom <span className="hint">(lead mengikuti periode terpilih; kolom "bulan ini" selalu bulan berjalan)</span></h3>
          <div className="tbl-wrap tbl-compact"><table>
            <thead><tr><th>Nama</th><th className="num">Konten (bln ini)</th><th className="num">Konten Total</th><th className="num">Entri Iklan</th><th className="num">Lead (bln ini)</th><th className="num">Lead</th><th className="num">L2</th><th className="num">Booking</th><th className="num">Nilai Booking</th></tr></thead>
            <tbody>{tim.length ? tim.map(u => (
              <tr key={u.username} style={u.active ? undefined : { opacity: .55 }}>
                <td data-label="Nama"><b>{u.name}</b>{u.active ? '' : ' (nonaktif)'}</td>
                <td className="num" data-label="Konten bln">{u.konten_bln}</td>
                <td className="num" data-label="Konten">{u.konten}</td>
                <td className="num" data-label="Iklan">{u.entri_iklan}</td>
                <td className="num" data-label="Lead bln"><b>{u.l0_bln}</b></td>
                <td className="num" data-label="Lead">{u.l0}</td>
                <td className="num" data-label="L2"><b>{u.l2}</b></td>
                <td className="num" data-label="Booking">{u.l3}</td>
                <td className="num" data-label="Nilai">{Number(u.nilai) ? fmtRp(u.nilai) : '—'}</td>
              </tr>)) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada akun dengan peran Marcom.</td></tr>}</tbody>
          </table></div>
          <span className="hint">Output dinilai dari hasil, bukan keramaian: lead berkualitas (L2) & Booking adalah angka yang menentukan. Lead terhitung ke marcom yang meng-input-nya di Form Input.</span>
        </div>
      </>)}

      <Toast />
    </>
  );
}
