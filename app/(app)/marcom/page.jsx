'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, fmtDate, todayISO } from '@/components/util';

const PLATFORM = ['Instagram', 'Facebook', 'Tiktok', 'Google', 'Youtube', 'Website', 'Lainnya'];
const FORMAT = ['Reels / Short Video', 'Carousel', 'Single Post', 'Story', 'Video Panjang', 'Live', 'Search Ads', 'Display / Banner', 'Lainnya'];
const TUJUAN_C = ['leads', 'awareness', 'engagement', 'promo', 'traffic', 'event'];
const K0 = { tgl: todayISO(), platform: 'Instagram', project: '', format: 'Reels / Short Video', topik: '', hook: '', jam: '', durasi: '', link: '' };
const BULAN_ID = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agt', 'sep', 'okt', 'nov', 'des'];
const ymdLokal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const NAMA_BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const ANALISA_MULAI = '2026-09';
const pilihanBulan = (() => { const out = []; const d = new Date(); d.setDate(1); for (let i = 0; i < 24; i++) { const v = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); if (v < ANALISA_MULAI) break; out.push({ v, t: NAMA_BLN[d.getMonth()] + ' ' + d.getFullYear() }); d.setMonth(d.getMonth() - 1); } return out; })();
const bulanOpts = (() => { const out = []; const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 12); for (let i = 0; i < 25; i++) { out.push(BULAN_ID[d.getMonth()] + String(d.getFullYear()).slice(2)); d.setMonth(d.getMonth() + 1); } return out; })();
const bulanIni = (() => { const d = new Date(); return BULAN_ID[d.getMonth()] + String(d.getFullYear()).slice(2); })();
const slugP = pr => (String(pr || '').trim().split(/\s+/)[0] || '').toLowerCase();
const sanitEx = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const KODE_FORMAT = ['reels', 'carousel', 'single', 'story', 'video', 'search', 'pmax', 'display', 'banner', 'live'];
const PLATFORM_C = ['Meta (FB+IG)', 'Google', 'Tiktok', 'Youtube', 'Website', 'Offline (Event/Banner/Kanvasing)', 'Lainnya'];
const UTM_SRC = ['meta', 'facebook', 'instagram', 'tiktok', 'google', 'youtube', 'website', 'whatsapp'];
const UTM_MED = ['cpc', 'social', 'banner', 'email', 'referral'];
const C0 = { nama: '', platform: 'Meta (FB+IG)', project: '', tujuan: 'leads', bulan: bulanIni, extra: '', budget: '', status: 'Aktif', catatan: '' };
const M0 = { content_id: '', tgl: todayISO(), reach: '', like_n: '', komentar: '', share_n: '', save_n: '', view3: '', view_full: '', klik_bio: '' };
const A0 = { tgl: todayISO(), campaign: '', kreatif: '', spend: '', impresi: '', reach: '', klik: '', hasil: '', catatan: '' };

// ===== Audit iklan Meta (Fase 2) =====
const USIA_META = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const tengahUsiaMeta = k => k === '65+' ? 70 : (k.split('-').map(Number).reduce((a, b) => a + b, 0) / 2);
const dalamUsiaPersona = (k, pr) => pr ? (t => t >= pr.usiaMin - 2 && t <= pr.usiaMax + 2)(tengahUsiaMeta(k)) : true;
const wilayahTarget = w => /banten|jakarta/i.test(w || '');
function ringkasDim(rows, dim, kunci) {
  const g = {};
  (rows || []).filter(r => r.dim === dim).forEach(r => { const k = kunci(r); g[k] = g[k] || { k, spend: 0, impresi: 0, klik: 0, hasil: 0 }; g[k].spend += Number(r.spend) || 0; g[k].impresi += r.impresi || 0; g[k].klik += r.klik || 0; g[k].hasil += r.hasil || 0; });
  const tot = Object.values(g).reduce((a, x) => a + x.spend, 0);
  return Object.values(g).map(x => ({ ...x, share: tot ? x.spend / tot : 0, ctr: x.impresi ? x.klik / x.impresi : null, cph: x.hasil ? x.spend / x.hasil : null })).sort((a, b) => b.spend - a.spend);
}
// Reach rate = reach ÷ follower; patokan berbeda untuk Reels vs feed (post & carousel)
const PATOKAN_RR = { reels: [0.15, 0.30, 0.60], feed: [0.05, 0.10, 0.20] };
const jenisRR = f => /reels|video/i.test(f || '') ? 'reels' : 'feed';
function labelRR(rr, format) {
  if (rr === null || rr === undefined) return null;
  const [b, g, sb] = PATOKAN_RR[jenisRR(format)];
  if (rr >= sb) return { t: 'Sangat bagus', c: 'var(--green)', w: 800 };
  if (rr >= g) return { t: 'Bagus', c: 'var(--green)', w: 600 };
  if (rr >= b) return { t: 'Biasa', c: 'var(--muted)', w: 500 };
  return { t: 'Rendah', c: 'var(--red)', w: 600 };
}
const er = (r) => { const reach = Number(r.reach) || 0; if (!reach) return null; return ((Number(r.like_n) || 0) + (Number(r.komentar) || 0) + (Number(r.share_n) || 0) + (Number(r.save_n) || 0)) / reach; };
const pct = (x) => x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%';
const per = (spend, n) => (spend > 0 && n > 0) ? fmtRp(Math.round(spend / n)) : '—';
const jamBucket = (j) => { const h = parseInt(String(j || '').split(/[:.]/)[0], 10); if (isNaN(h)) return null; return h < 10 ? 'Pagi (<10)' : h < 15 ? 'Siang (10–14)' : h < 19 ? 'Sore (15–18)' : 'Malam (≥19)'; };

export default function MarcomPage() {
  const [tab, setTab] = useState('insight');
  const [data, setData] = useState(null);
  const [set, setSet] = useState({ project: [] });
  const [busy, setBusy] = useState(false);
  const [fProj, setFProj] = useState('');
  const [periode, setPeriode] = useState('bulan'); // bulan | perbulan | semua | custom
  const [bln, setBln] = useState((pilihanBulan[1] || pilihanBulan[0]).v);
  const [d1, setD1] = useState(''); const [d2, setD2] = useState('');
  const [k, setK] = useState(K0); const [kEdit, setKEdit] = useState(null);
  const [c, setC] = useState(C0); const [cEdit, setCEdit] = useState(null);
  const [m, setM] = useState(M0);
  const [a, setA] = useState(A0); const [aEdit, setAEdit] = useState(null);
  const [lk, setLk] = useState(null);
  const [formManual, setFormManual] = useState(false);
  const [iSort, setISort] = useState({ key: 'hasil', dir: 'desc' }); // urutan tabel Performa per Iklan
  const [iAktif, setIAktif] = useState(false); // hanya iklan yang sedang aktif
  const [personaEdit, setPersonaEdit] = useState(null); // { project, areaInti, areaLuas, hargaMin, usiaMin, usiaMax, tujuan, catatan }
  const [kSort, setKSort] = useState({ key: 'tgl', dir: 'desc' }); // urutan tabel konten
  const [showSpendManual, setShowSpendManual] = useState(false);
  const [gb, setGb] = useState(null); // { dari, ke }
  const AM0 = { campaign: '', keterangan: '', total: '', mulai: todayISO().slice(0, 7), bulan: '3' };
  const [am, setAm] = useState(AM0);
  const [tg, setTg] = useState({ d1: '', d2: '', sumber: '', campaign: '', konten: '' });
  const [tgRows, setTgRows] = useState(null);
  const [tgPick, setTgPick] = useState({});

  const rentang = useMemo(() => {
    if (periode === 'bulan') { const t = new Date(); return [ymdLokal(new Date(t.getFullYear(), t.getMonth(), 1)), todayISO()]; }
    if (periode === 'perbulan') { const [y, m] = bln.split('-').map(Number); return [ymdLokal(new Date(y, m - 1, 1)), ymdLokal(new Date(y, m, 0))]; }
    if (periode === 'custom') return [d1 || '', d2 || ''];
    return ['', ''];
  }, [periode, d1, d2, bln]);

  const muat = () => Promise.all([
    api('/api/marcom?d1=' + rentang[0] + '&d2=' + rentang[1] + '&project=' + encodeURIComponent(fProj)),
    api('/api/settings'),
  ]).then(([d, s]) => { setData(d); setSet(s); }).catch(e => toast(e.message));
  useEffect(() => { muat(); }, [rentang[0], rentang[1], fProj]); // eslint-disable-line

  const fk = key => ({ value: k[key], onChange: e => setK({ ...k, [key]: e.target.value }) });
  const fc = key => ({ value: c[key], onChange: e => setC({ ...c, [key]: e.target.value }) });
  const fm = key => ({ value: m[key], onChange: e => setM({ ...m, [key]: e.target.value }) });
  const fa = key => ({ value: a[key], onChange: e => setA({ ...a, [key]: e.target.value }) });
  const namaGen = [slugP(c.project) || 'chl', c.tujuan, c.bulan].filter(Boolean).join('_') + (sanitEx(c.extra) ? '_' + sanitEx(c.extra) : '');

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

  const [narik, setNarik] = useState(false);
  async function tarikSekarang() {
    setNarik(true);
    const TAHAP = [['web', 'GA4 & Search Console'], ['instagram', 'Instagram'], ['meta', 'Meta Ads'], ['meta-rinci', 'Rincian Meta']];
    const catatan = [];
    for (const [k, label] of TAHAP) {
      setNarik(label);
      // Instagram dicicil: bila server melaporkan "sisa" postingan tertunda, panggil lanjutan (maks 4 putaran)
      for (let putaran = 0; putaran < 5; putaran++) {
        try {
          const r = await api('/api/mi-sync?sumber=' + k + (putaran ? '&lanjut=1' : ''));
          const sisa = (r.hasil || []).reduce((a, h) => a + (Number(h.sisa) || 0), 0);
          if (sisa > 0 && putaran < 4) { setNarik(`${label} (lanjutan ${putaran + 1}, sisa ${sisa})`); continue; }
          (r.hasil || []).forEach(h => catatan.push(`${h.sumber}: ${h.status === 'sukses' ? '✓' : h.status}`));
        } catch (e) { catatan.push(`${label}: ${/504/.test(e.message) ? 'melewati batas waktu' : 'gagal'}`); }
        break;
      }
    }
    toast(catatan.join(' · '));
    await muat(); setNarik(false);
  }

  async function gabungCampaign() {
    if (!gb || !gb.ke) return toast('Pilih campaign tujuan');
    if (!confirm(`Gabungkan "${gb.dari}" ke "${gb.ke}"?\nTag lead, entri spend & biaya berulang ikut pindah, lalu "${gb.dari}" dihapus. Tidak bisa dibatalkan.`)) return;
    setBusy(true);
    try {
      const r = await api('/api/marcom', { method: 'PATCH', body: JSON.stringify({ jenis: 'gabung', dari: gb.dari, ke: gb.ke }) });
      toast(`Digabung ✅ — ${r.lead} lead & ${r.entri} entri spend dipindahkan`);
      setGb(null); await muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function cariUntagged() {
    try {
      const r = await api('/api/marcom?list=untagged&project=' + encodeURIComponent(fProj) + '&d1=' + (tg.d1 || '') + '&d2=' + (tg.d2 || ''));
      setTgRows(r); setTgPick({});
      if (!r.length) toast('Tidak ada lead tanpa campaign pada filter ini 👍');
    } catch (e) { toast(e.message); }
  }
  async function tandaiMassal() {
    const ids = Object.keys(tgPick).filter(k => tgPick[k]).map(Number);
    if (!ids.length) return toast('Centang lead yang mau ditandai');
    if (!tg.campaign) return toast('Pilih campaign tujuan');
    if (!confirm(`Tandai ${ids.length} lead ke campaign "${tg.campaign}"${tg.konten ? ' dengan kreatif ' + tg.konten : ''}?`)) return;
    setBusy(true);
    try {
      const r = await api('/api/marcom', { method: 'PATCH', body: JSON.stringify({ jenis: 'tag', ids, campaign: tg.campaign, konten: tg.konten.trim() }) });
      toast(r.jumlah + ' lead ditandai ✅');
      await cariUntagged(); await muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  // Isi form Angka dengan angka terakhir konten (jebakan "kolom kosong jadi 0" hilang)
  function isiAngka(id) {
    const x = (data?.contents || []).find(c => String(c.id) === String(id));
    const n = k => (x && x[k] !== null && x[k] !== undefined) ? String(x[k]) : '';
    setM({ content_id: String(id || ''), tgl: todayISO(), reach: n('reach'), like_n: n('like_n'), komentar: n('komentar'), share_n: n('share_n'), save_n: n('save_n'), view3: n('view3'), view_full: n('view_full'), klik_bio: n('klik_bio') });
  }

  // ===== Insight (dihitung dari data GET) =====
  const spendMap = useMemo(() => Object.fromEntries((data?.spend || []).map(s => [s.kunci, Number(s.spend) || 0])), [data]);
  const totSpend = useMemo(() => Object.values(spendMap).reduce((x, y) => x + y, 0), [spendMap]);
  const totFunnel = useMemo(() => (data?.bySumber || []).reduce((t, r) => ({ l0: t.l0 + r.l0, l1: t.l1 + r.l1, l2: t.l2 + r.l2, l3: t.l3 + r.l3, nilai: t.nilai + Number(r.nilai || 0) }), { l0: 0, l1: 0, l2: 0, l3: 0, nilai: 0 }), [data]);
  // Funnel lead yang punya campaign (berbayar/terukur) — dasar CPL/CPQL/biaya per Booking yang jujur
  const paidFunnel = useMemo(() => (data?.byCampaign || []).filter(r => r.kunci !== '(tanpa data)').reduce((t, r) => ({ l0: t.l0 + r.l0, l2: t.l2 + r.l2, l3: t.l3 + r.l3 }), { l0: 0, l2: 0, l3: 0 }), [data]);
  const polaFormat = useMemo(() => {
    const g = {};
    (data?.contents || []).forEach(x => {
      const key = x.format || '-'; g[key] = g[key] || { n: 0, reach: 0, eng: 0, klik: 0, like: 0, kom: 0, share: 0, save: 0, views: 0 };
      g[key].n++; g[key].reach += Number(x.reach) || 0; g[key].klik += Number(x.klik_bio) || 0;
      g[key].like += Number(x.like_n) || 0; g[key].kom += Number(x.komentar) || 0; g[key].share += Number(x.share_n) || 0; g[key].save += Number(x.save_n) || 0; g[key].views += Number(x.view3) || 0;
      g[key].eng += (Number(x.like_n) || 0) + (Number(x.komentar) || 0) + (Number(x.share_n) || 0) + (Number(x.save_n) || 0);
    });
    return Object.entries(g).map(([f, v]) => ({ format: f, ...v, er: v.reach ? v.eng / v.reach : null })).sort((x, y) => (y.er || 0) - (x.er || 0));
  }, [data]);
  const polaTopik = useMemo(() => {
    const g = {};
    (data?.contents || []).forEach(x => {
      const key = String(x.topik || '').trim(); if (!key) return;
      g[key] = g[key] || { n: 0, reach: 0, eng: 0, klik: 0, like: 0, kom: 0, share: 0, save: 0, views: 0 };
      g[key].n++; g[key].reach += Number(x.reach) || 0; g[key].klik += Number(x.klik_bio) || 0;
      g[key].like += Number(x.like_n) || 0; g[key].kom += Number(x.komentar) || 0; g[key].share += Number(x.share_n) || 0; g[key].save += Number(x.save_n) || 0; g[key].views += Number(x.view3) || 0;
      g[key].eng += (Number(x.like_n) || 0) + (Number(x.komentar) || 0) + (Number(x.share_n) || 0) + (Number(x.save_n) || 0);
    });
    return Object.entries(g).map(([t, v]) => ({ topik: t, ...v, er: v.reach ? v.eng / v.reach : null })).sort((a, b) => (b.er || 0) - (a.er || 0));
  }, [data]);
  const follower = Number(data?.igAkun?.followers) || 0;
  const rr = x => follower && Number(x.reach) ? Number(x.reach) / follower : null;
  const rrRata = useMemo(() => {
    const g = { reels: [], feed: [] };
    (data?.contents || []).filter(x => x.platform === 'Instagram').forEach(x => { const v = rr(x); if (v !== null) g[jenisRR(x.format)].push(v); });
    const avg = a => a.length ? a.reduce((t, v) => t + v, 0) / a.length : null;
    return { reels: avg(g.reels), feed: avg(g.feed), nReels: g.reels.length, nFeed: g.feed.length };
  }, [data, follower]); // eslint-disable-line
  const totalEng = useMemo(() => (data?.contents || []).reduce((t, x) => ({ n: t.n + 1, reach: t.reach + (Number(x.reach) || 0), like: t.like + (Number(x.like_n) || 0), kom: t.kom + (Number(x.komentar) || 0), share: t.share + (Number(x.share_n) || 0), save: t.save + (Number(x.save_n) || 0), views: t.views + (Number(x.view3) || 0), klik: t.klik + (Number(x.klik_bio) || 0) }), { n: 0, reach: 0, like: 0, kom: 0, share: 0, save: 0, views: 0, klik: 0 }), [data]);
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

  // ===== Resume Analisa otomatis — ringkasan, yang harus diperbaiki, saran bulan depan =====
  const resume = useMemo(() => {
    if (!data) return null;
    const R = { ringkas: [], perbaiki: [], saran: [] };
    const rp = n => fmtRp(Math.round(n));
    const pc = x => Math.round(x * 100) + '%';
    const F = totFunnel;
    const sedikit = F.l0 < 20;

    // ---------- RINGKASAN ----------
    if (F.l0 === 0) {
      R.ringkas.push('Belum ada lead masuk pada filter ini — resume akan terisi begitu lead tercatat di CRM.');
    } else {
      R.ringkas.push(`${F.l0} lead masuk, ${F.l2} berkualitas (${pc(F.l2 / F.l0)}), ${F.l3} Booking${F.nilai ? ' senilai ' + rp(F.nilai) : ''}.`);
      if (F.l1 >= 0) R.ringkas.push(`${pc(F.l1 / F.l0)} lead sudah tersentuh follow up.`);
    }
    if (totSpend > 0) {
      const plat = {};
      Object.entries(spendMap).forEach(([k, v]) => { if (!v) return; const p0 = String(((data.campaigns || []).find(c => c.nama === k) || {}).platform || 'Lainnya').replace(/ \(.*\)/, ''); plat[p0] = (plat[p0] || 0) + v; });
      R.ringkas.push('Belanja per platform: ' + Object.entries(plat).sort((a, b) => b[1] - a[1]).map(([p0, v]) => `${p0} ${rp(v)}`).join(' · ') + '.');
    }
    if (totSpend > 0) R.ringkas.push(`Belanja iklan ${rp(totSpend)} untuk ${paidFunnel.l0} lead ber-campaign — CPL ${per(totSpend, paidFunnel.l0)}, CPQL ${per(totSpend, paidFunnel.l2)}, biaya per Booking ${per(totSpend, paidFunnel.l3)}.` + (paidFunnel.l3 === 0 && F.l3 > 0 ? ' Booking periode ini belum berasal dari lead ber-campaign.' : ''));
    const sumber = (data.bySumber || []).filter(r => r.kunci !== '(tanpa data)' && r.l0 > 0);
    const topVol = [...sumber].sort((a, b) => b.l0 - a.l0)[0];
    const topKual = [...sumber].filter(r => r.l0 >= 3 && !/walk/i.test(r.kunci)).sort((a, b) => (b.l2 / b.l0) - (a.l2 / a.l0))[0]; // Walk In otomatis berkualitas — tidak dibandingkan
    if (topVol) R.ringkas.push(`Sumber lead terbanyak: ${topVol.kunci} (${topVol.l0} lead).` + (topKual && topKual.kunci !== topVol.kunci ? ` Kualitas terbaik: ${topKual.kunci} (${pc(topKual.l2 / topKual.l0)} jadi berkualitas).` : ''));
    if ((data.contents || []).length) {
      const fBest = polaFormat.find(r => r.er !== null);
      R.ringkas.push(`${data.contents.length} konten tercatat` + (fBest ? `; format dengan engagement tertinggi: ${fBest.format} (ER ${pct(fBest.er)}).` : '.'));
      if (follower) R.ringkas.push(`Follower Instagram ${follower.toLocaleString('id-ID')}${data.igAkun.followersAwal !== null && data.igAkun.followersAwal !== undefined ? ` (${follower - data.igAkun.followersAwal >= 0 ? '+' : ''}${follower - data.igAkun.followersAwal} pada periode ini)` : ''}; reach rate rata-rata Reels ${rrRata.reels !== null ? pct(rrRata.reels) : '—'}, feed ${rrRata.feed !== null ? pct(rrRata.feed) : '—'} (patokan bagus: Reels ≥30%, feed ≥10%).`);
      if (follower && rrRata.nReels >= 2 && rrRata.reels < 0.15) R.perbaiki.push(`Reach rate Reels baru ${pct(rrRata.reels)} dari follower (patokan minimal 15%) — Reels belum menjangkau di luar audiens lama. Perkuat 3 detik pertama (hook visual), pakai audio yang sedang ramai, dan unggah di jam dengan engagement terbaik.`);
      if (totalEng.n) R.ringkas.push(`Engagement ${totalEng.n} konten: ${totalEng.like.toLocaleString('id-ID')} like · ${totalEng.kom} komentar · ${totalEng.share} share · ${totalEng.save} save · ${totalEng.views.toLocaleString('id-ID')} views · ${totalEng.klik} klik bio.`);
    }
    const webOk = !fProj || /bio/i.test(fProj);
    const ga4 = data.ga4 || [], gsc = data.gsc || [];
    if (webOk && ga4.length) {
      const ses = ga4.reduce((a, r) => a + Number(r.sessions || 0), 0);
      const kev = ga4.reduce((a, r) => a + Number(r.key_events || 0), 0);
      const sesPangle = ga4.filter(r => /pangle/i.test(r.source_medium)).reduce((a, r) => a + Number(r.sessions || 0), 0);
      const topAsli = ga4.find(r => !/pangle/i.test(r.source_medium));
      R.ringkas.push(`Website: ${(ses - sesPangle).toLocaleString('id-ID')} sesi pengunjung sungguhan${sesPangle ? ` (di luar ${sesPangle.toLocaleString('id-ID')} sesi Pangle yang tidak dihitung sebagai minat)` : ''}, terbanyak dari ${topAsli ? topAsli.source_medium : '-'}; ${kev} key event (klik WA).`);
    }
    if (audDomisili.length && audDomisili[0].nama !== '(kosong)') R.ringkas.push(`Domisili lead berkualitas terbanyak: ${audDomisili.slice(0, 3).filter(d => d.nama !== '(kosong)').map(d => d.nama + ' (' + d.l2 + ')').join(', ')}.`);
    if (sedikit && F.l0 > 0) R.ringkas.push('⚠ Data masih sedikit (< 20 lead) — anggap kesimpulan di bawah sebagai sinyal awal, belum pola tetap.');

    const ho = data.handoff || [];
    const hoDioper = ho.reduce((a, r) => a + r.dioper, 0), hoBalas = ho.reduce((a, r) => a + r.membalas, 0);
    if (hoDioper) R.ringkas.push(`${hoDioper} lead dioper marcom ke sales; ${hoBalas} (${pc(hoBalas / hoDioper)}) masih membalas setelah serah terima.`);

    const bd = data.bookingDetail || [];
    const asalLead = b => /walk/i.test(b.sumber) ? `Walk In via ${b.walkin_info || '-'}` : (b.campaign && b.campaign !== '(tanpa data)' ? `${b.sumber} · ${b.campaign}` : b.sumber);
    if (bd.length) {
      const hs = bd.map(b => Number(b.hari)).filter(h => !isNaN(h));
      const rata = hs.length ? Math.round(hs.reduce((a, h) => a + h, 0) / hs.length) : null;
      R.ringkas.push(`Booking dari marketing: ${bd.length} unit senilai ${rp(bd.reduce((a, b) => a + (Number(b.nilai) || 0), 0))}` + (rata !== null ? `; rata-rata ${rata} hari dari lead masuk sampai booking (tercepat ${Math.min(...hs)}, terlama ${Math.max(...hs)} hari).` : '.'));
      bd.slice(0, 8).forEach(b => R.ringkas.push(`${b.lead_code} — ${asalLead(b)}: masuk ${fmtDate(b.tgl_lead)}, booking ${fmtDate(b.tgl_booking)} (${b.hari} hari, ${b.nfu} follow up${b.sales ? ', sales ' + b.sales : ''}).`));
    }
    if (data.bookingLain) R.ringkas.push(`${data.bookingLain} booking lain di periode ini berasal dari lead non-marketing (referral, kanvasing, WA langsung ke sales) — tidak dihitung sebagai hasil marketing.`);

    // ---------- YANG HARUS DIPERBAIKI ----------
    const camp = data.byCampaign || [];
    const tanpa = camp.find(r => r.kunci === '(tanpa data)');
    const tc = data.tanpaCamp || [];
    const iklanTanpa = tc.filter(r => /ads/i.test(r.sumber));
    const nIklanTanpa = iklanTanpa.reduce((a, r) => a + r.n, 0);
    if (nIklanTanpa > 0) R.perbaiki.push(`${nIklanTanpa} lead dari iklan berbayar (${iklanTanpa.map(r => r.sumber + ' ' + r.n).join(', ')}) belum punya campaign — biaya iklannya tidak tersambung ke hasil. Tandai lewat Tandai Lead Massal di tab Iklan (daftarkan campaign-nya dulu bila belum ada).`);
    void tanpa;
    // Penilaian per campaign hanya bila datanya cukup: spend >= Rp500 rb di periode ini ATAU periode sudah >= 14 hari.
    // Campaign yang sudah Selesai tidak masuk "perbaiki" (biayanya tetap dihitung).
    const hariPeriode = (() => { const a1 = rentang[0] ? new Date(rentang[0]) : null; const a2 = rentang[1] ? new Date(rentang[1]) : new Date(); return a1 ? Math.max(1, Math.round((a2 - a1) / 86400000) + 1) : 999; })();
    const infoCamp = k => (data.campaigns || []).find(c => c.nama === k) || {};
    const layakNilai = k => infoCamp(k).status !== 'Selesai' && ((spendMap[k] || 0) >= 500000 || hariPeriode >= 14);
    let ditahan = 0;
    camp.filter(r => r.kunci !== '(tanpa data)' && (spendMap[r.kunci] || 0) > 0 && r.l2 === 0 && r.l0 >= 1).forEach(r => {
      if (!layakNilai(r.kunci)) { ditahan++; return; }
      R.perbaiki.push(`Campaign ${r.kunci} sudah menghabiskan ${rp(spendMap[r.kunci])} tapi belum menghasilkan satu pun lead berkualitas — evaluasi audiens & kreatifnya, atau hentikan.`);
    });
    const tujuanOf = k => infoCamp(k).tujuan || 'leads';
    const hp = data.hasilPlat || {};
    const tanpaLead = Object.entries(spendMap).filter(([k, v]) => v > 0 && k !== '(tanpa data)' && !camp.find(r => r.kunci === k));
    const atas = tanpaLead.filter(([k]) => ['traffic', 'awareness', 'engagement'].includes(tujuanOf(k)) && !(hp[k] > 0));
    tanpaLead.filter(([k]) => !atas.find(([a]) => a === k)).forEach(([k, v]) => {
      if (!layakNilai(k)) { ditahan++; return; }
      R.perbaiki.push(hp[k] > 0
        ? `Campaign ${k} (${rp(v)}): platform mencatat ${hp[k]} percakapan/lead, tapi belum ada satu pun lead CRM yang ditandai ke campaign ini — untuk iklan baru, pakai kode iklan WA dari tombol 🔗 Link agar lead bisa ditandai otomatis.`
        : `Campaign ${k} berbelanja ${rp(v)} tapi tidak ada satu pun lead yang tercatat dengannya — cek apakah link iklannya sudah pakai UTM atau kode iklan WA dari tombol 🔗 Link.`);
    });
    if (atas.length) R.ringkas.push(`${atas.length} campaign funnel atas (traffic/awareness/engagement) menghabiskan ${rp(atas.reduce((a, [, v]) => a + v, 0))} — tugasnya mendatangkan kunjungan & jangkauan, jadi dinilai dari klik/biaya per klik, bukan jumlah lead.`);
    if (ditahan) R.ringkas.push(`Penilaian ${ditahan} campaign ditahan dulu — periode baru berjalan ${hariPeriode} hari dan spend-nya masih kecil. Penilaian muncul setelah periode ≥ 14 hari atau spend campaign ≥ Rp500 rb (atau campaign sudah selesai: biayanya tetap dihitung, tanpa peringatan).`);
    // Campaign aktif tanpa spend: hanya untuk campaign yang spend-nya dicatat manual (Meta ditarik otomatis)
    (data.campaigns || []).filter(c => c.status === 'Aktif' && c.sumber !== 'meta-api' && !(spendMap[c.nama] > 0) && hariPeriode >= 7).slice(0, 3).forEach(c => R.perbaiki.push(`Campaign aktif ${c.nama} belum punya entri spend pada periode ini — catat performanya di tab Iklan agar CPQL bisa dihitung.`));
    sumber.filter(r => r.l0 >= 5 && r.l2 / r.l0 < 0.1).forEach(r => R.perbaiki.push(`Sumber ${r.kunci}: ${r.l0} lead tapi hanya ${r.l2} berkualitas (${pc(r.l2 / r.l0)}) — volume tinggi, kualitas rendah. Perketat targeting/kualifikasi di sumber ini.`));
    if (F.l0 >= 5 && F.l1 / F.l0 < 0.7) R.perbaiki.push(`Hanya ${pc(F.l1 / F.l0)} lead yang sudah di-follow up — ${F.l0 - F.l1} lead belum disentuh sama sekali. Lead yang dibiarkan cepat dingin; koordinasikan kecepatan respon dengan tim sales.`);
    if (F.l2 >= 3 && F.l3 === 0) R.perbaiki.push(`${F.l2} lead berkualitas belum ada yang Booking — dorong site visit & penawaran khusus bersama sales.`);
    const kontenTanpaAngka = (data.contents || []).filter(x => !Number(x.reach)).length;
    if (kontenTanpaAngka) R.perbaiki.push(`${kontenTanpaAngka} konten belum di-update angka performanya — pola konten yang menang belum bisa dibaca utuh. Update mingguan di tab Konten.`);
    const kontenTanpaAtribut = (data.contents || []).filter(x => !x.topik || !x.jam).length;
    if (kontenTanpaAtribut) R.perbaiki.push(`${kontenTanpaAtribut} konten tanpa topik/jam tayang — atribut ini bahan analisa "algoritma", lengkapi lewat tombol Lengkapi di tab Konten.`);
    const kosongDom = audDomisili.find(d => d.nama === '(kosong)');
    if (kosongDom && kosongDom.l2 >= 2) R.perbaiki.push(`${kosongDom.l2} lead berkualitas tanpa domisili — isi domisili saat input agar targeting wilayah akurat.`);
    if (webOk && ga4.length && ga4.reduce((a, r) => a + Number(r.key_events || 0), 0) === 0) R.perbaiki.push('Key event website (klik WA) masih 0 — pastikan event click sudah ditandai sebagai key event di GA4, dan cek ulang dalam beberapa hari.');
    if (webOk && ga4.length) {
      const sesTot = ga4.reduce((a, r) => a + Number(r.sessions || 0), 0);
      const pangle = ga4.filter(r => /pangle/i.test(r.source_medium)).reduce((a, r) => a + Number(r.sessions || 0), 0);
      if ((data.pangle7 || 0) > 0) R.perbaiki.push(`Trafik Pangle masih masuk dalam 7 hari terakhir (${data.pangle7} sesi) — ada iklan TikTok yang tayang di jaringan aplikasi pihak ketiga. Matikan penempatan Pangle di TikTok Ads Manager (Ad group › Placements › Select placement › hanya TikTok).`);
      else if (sesTot && pangle / sesTot >= 0.1) R.ringkas.push(`Catatan: ${pc(pangle / sesTot)} sesi website periode ini (${pangle.toLocaleString('id-ID')}) berasal dari Pangle — iklan TikTok yang sudah berhenti. Trafik ini tidak dihitung sebagai minat; saat iklan TikTok dijalankan lagi, pakai Select placement tanpa Pangle.`);
      const adaSpendTiktok = Object.entries(spendMap).some(([k, v]) => v > 0 && /tiktok/i.test(String(((data.campaigns || []).find(c => c.nama === k) || {}).platform || '')));
      if (pangle > 0 && !adaSpendTiktok) R.perbaiki.push(`Ada ${pangle.toLocaleString('id-ID')} sesi dari iklan TikTok (via Pangle) di periode ini, tapi belum ada spend TikTok yang tercatat — biaya iklan TikTok belum masuk analisa. Daftarkan campaign platform Tiktok dan catat spend-nya dari TikTok Ads Manager › Reporting.`);
    }
    if (webOk && !ga4.length) R.perbaiki.push('Data website belum masuk — klik Tarik Data Sekarang di tab Website & SEO atau cek koneksi GA4.');
    // Bila Instagram sudah ditarik otomatis, konten tidak lagi dicatat manual per orang — aturan ini hanya berlaku saat input manual
    if (!(data.contents || []).some(c => c.created_by === 'auto-instagram')) tim.filter(u => u.active && u.konten_bln === 0).forEach(u => R.perbaiki.push(`${u.name} belum mencatat konten bulan ini — pastikan tiap konten tayang tercatat agar output tim terukur.`));

    if (hoDioper >= 3 && hoBalas / hoDioper < 0.5) {
      const terendah = [...ho].filter(r => r.dioper >= 2).sort((a, b) => (a.membalas / a.dioper) - (b.membalas / b.dioper))[0];
      R.perbaiki.push(`Hanya ${pc(hoBalas / hoDioper)} lead yang masih membalas setelah dioper ke sales${terendah ? ` (terendah: ${terendah.sales} ${terendah.membalas}/${terendah.dioper})` : ''} — pastikan marcom mengisi konteks & mengirim pesan "Kabari Lead", dan sales menyapa < 1 jam memakai template lanjutan, bukan sapaan umum.`);
    }

    // Lead masuk tapi belum tercatat (periode): angka platform vs lead CRM
    {
      const metaChat = Object.entries(data.hasilPlat || {}).filter(([k]) => infoCamp(k).sumber === 'meta-api').reduce((a, [, v]) => a + (Number(v) || 0), 0);
      const leadMeta = (data.bySumber || []).filter(r => /facebook|instagram|whatsapp|meta/i.test(r.kunci)).reduce((a, r) => a + r.l0, 0);
      if (metaChat - leadMeta >= 5 && leadMeta < metaChat * 0.7) R.perbaiki.push(`Iklan Meta mencatat ${metaChat} percakapan WA, tapi lead Facebook Ads/Instagram/WhatsApp yang tercatat di CRM hanya ${leadMeta} — sekitar ${metaChat - leadMeta} chat kemungkinan belum dibalas atau belum diinput. Cek WA tim marcom & sales, input semua lead yang masuk.`);
      const klikWA = webOk ? (data.ga4 || []).reduce((a, r) => a + Number(r.key_events || 0), 0) : 0;
      const leadWeb = (data.bySumber || []).filter(r => /website/i.test(r.kunci)).reduce((a, r) => a + r.l0, 0);
      if (klikWA >= 5 && leadWeb < klikWA * 0.3) R.perbaiki.push(`Website mencatat ${klikWA} klik WA, tapi lead bersumber Website di CRM hanya ${leadWeb}. Sebagian klik bisa berulang dari orang yang sama, tapi selisih sebesar ini menandakan ada chat dari website yang belum diinput.`);
    }

    // Kecocokan lead terhadap persona target
    {
      const ft = data.fit?.total;
      if (ft && ft.n) {
        const dinilai = ft.n - ft.kurang;
        R.ringkas.push(`Kecocokan target persona: ${dinilai ? pct(ft.cocok / dinilai) : '—'} cocok dari ${dinilai} lead yang datanya cukup (${ft.cocok} cocok · ${ft.sebagian} sebagian · ${ft.tidak} tidak); ${ft.kurang} lead datanya belum lengkap untuk dinilai.`);
        if (ft.n >= 5 && ft.kurang / ft.n > 0.5) R.perbaiki.push(`${pct(ft.kurang / ft.n)} lead belum punya data kualifikasi yang cukup (domisili, budget, cara bayar, usia, tujuan) — kecocokan target tidak bisa dinilai. Wajibkan skrip 3 pertanyaan sebelum oper ke sales.`);
        const srcs = Object.entries(data.fit.bySumber || {}).map(([k, r]) => ({ k, d: r.n - r.kurang, c: r.cocok })).filter(r => r.d >= 3);
        const terburuk = srcs.filter(r => r.c / r.d < 0.3).sort((a, b) => a.c / a.d - b.c / b.d)[0];
        const terbaik = srcs.sort((a, b) => b.c / b.d - a.c / a.d)[0];
        if (dinilai >= 5 && ft.cocok / dinilai < 0.3) R.perbaiki.push(`Baru ${pct(ft.cocok / dinilai)} lead yang cocok target persona${terburuk ? ` (terendah: ${terburuk.k} ${terburuk.c}/${terburuk.d})` : ''} — perketat targeting lokasi & usia, dan tampilkan harga mulai di materi iklan.`);
        if (terbaik && terbaik.c / terbaik.d >= 0.5) R.saran.push(`Sumber paling cocok target: ${terbaik.k} (${terbaik.c} dari ${terbaik.d} lead cocok persona) — prioritaskan budget & konten untuk kanal ini.`);
      }
    }

    // ---------- SARAN STRATEGI ----------
    const efektif = camp.filter(r => r.kunci !== '(tanpa data)' && (spendMap[r.kunci] || 0) > 0 && r.l2 > 0)
      .map(r => ({ ...r, cpql: spendMap[r.kunci] / r.l2 })).sort((a, b) => a.cpql - b.cpql);
    if (efektif.length >= 2) {
      const best = efektif[0], worst = efektif[efektif.length - 1];
      R.saran.push(`Realokasi budget: geser porsi dari ${worst.kunci} (CPQL ${rp(worst.cpql)}) ke ${best.kunci} (CPQL ${rp(best.cpql)}) — tiap rupiah di ${best.kunci} menghasilkan lead berkualitas ${(worst.cpql / best.cpql).toFixed(1)}× lebih murah.`);
    } else if (efektif.length === 1) {
      R.saran.push(`Pertahankan ${efektif[0].kunci} (CPQL ${rp(efektif[0].cpql)}) dan uji satu campaign pembanding dengan audiens/kreatif berbeda agar ada tolok ukur efisiensi.`);
    }
    if (topKual) R.saran.push(`Perbesar kanal ${topKual.kunci} — rasio lead berkualitasnya paling tinggi (${pc(topKual.l2 / topKual.l0)}).`);
    const fBest = polaFormat.find(r => r.er !== null && r.n >= 2) || polaFormat.find(r => r.er !== null);
    const jBest = polaJam.find(j => j.er !== null);
    const tBest = polaTopik.find(r => r.er !== null && r.n >= 2) || polaTopik.find(r => r.er !== null);
    if (fBest) R.saran.push(`Produksi konten: perbanyak format ${fBest.format}${tBest ? ` bertopik "${tBest.topik}" (ER ${pct(tBest.er)})` : ''}${jBest ? `, tayangkan di slot ${jBest.jam}` : ''} — kombinasi dengan engagement terbaik sejauh ini.`);
    const kBest = (data.byKonten || []).filter(r => r.l2 > 0).sort((a, b) => b.l2 - a.l2)[0];
    if (kBest) R.saran.push(`Kreatif ${kBest.kunci} menghasilkan ${kBest.l2} lead berkualitas — buat 2–3 variasi turunannya (hook/visual berbeda, pesan sama).`);
    const domTop = audDomisili.filter(d => d.nama !== '(kosong)').slice(0, 3);
    if (domTop.length) R.saran.push(`Targeting wilayah: fokuskan iklan di ${domTop.map(d => d.nama).join(', ')} — asal lead yang terbukti berkualitas.`);
    const tTop = audTujuan.filter(t => t.nama !== '-')[0];
    if (tTop) R.saran.push(`Pesan utama: mayoritas lead berkualitas bertujuan "${tTop.nama}" — angkat sudut pandang itu di copy iklan & konten.`);
    if (webOk && gsc.length) {
      const peluang = gsc.filter(q => Number(q.impressions) >= 20 && Number(q.position) > 3 && Number(q.position) <= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 3);
      if (peluang.length) R.saran.push(`SEO: kata kunci ${peluang.map(q => '"' + q.query + '" (posisi ' + q.position + ')').join(', ')} sudah sering muncul tapi belum di 3 besar — buat/optimasi artikel khusus untuknya.`);
      const topQ = gsc.filter(q => Number(q.clicks) > 0)[0];
      if (topQ) R.saran.push(`Google Ads: uji kata kunci "${topQ.query}" — terbukti mendatangkan klik organik, potensial dipercepat dengan iklan pencarian.`);
    }
    const offline = tc.filter(r => /banner|spanduk|pameran|event|kanvas/i.test(r.sumber));
    const nOff = offline.reduce((a, r) => a + r.n, 0);
    if (nOff >= 3) R.saran.push(`Ada ${nOff} lead dari aktivitas offline (${offline.map(r => r.sumber + ' ' + r.n).join(', ')}) tanpa campaign. Daftarkan tiap aktivitas sebagai campaign platform Offline beserta biayanya (cetak, booth, honor) — biaya per lead offline jadi bisa dibandingkan langsung dengan iklan digital.`);
    if (!R.saran.length) R.saran.push('Belum cukup data untuk saran spesifik — jalankan minimal satu campaign ber-UTM dan catat konten secara rutin selama 2–4 minggu.');
    return R;
  }, [data, totFunnel, paidFunnel, totSpend, spendMap, polaFormat, polaJam, polaTopik, totalEng, rrRata, follower, audDomisili, audTujuan, tim, fProj, rentang]); // eslint-disable-line

  async function salinResume() {
    if (!resume) return;
    const label = (fProj || 'Semua Project') + ' · ' + (periode === 'bulan' ? 'Bulan Ini' : periode === 'perbulan' ? (pilihanBulan.find(o => o.v === bln) || {}).t : periode === 'semua' ? 'Sejak Sep 2026' : (rentang[0] + ' s.d. ' + rentang[1]));
    const blok = (judul, arr) => judul + '\n' + arr.map(x => '• ' + x).join('\n');
    const teks = 'RESUME ANALISA MARKETING — ' + label + '\n\n' + blok('RINGKASAN', resume.ringkas) + '\n\n' + blok('PRIORITAS PERBAIKAN', resumeFinal.perbaiki.length ? resumeFinal.perbaiki : ['Tidak ada temuan kritis.']) + '\n\n' + blok('SARAN STRATEGI', resumeFinal.saran);
    try { await navigator.clipboard.writeText(teks); toast('Resume tersalin 📋'); } catch { window.prompt('Salin manual:', teks); }
  }

  // ===== Rapor Marketing (Diagnosa): vonis 🟢🟡🔴 per indikator + saran =====
  const rapor = useMemo(() => {
    if (!data) return [];
    const v = (n, bagus, cukup, kecilLebihBaik) => n === null || n === undefined || isNaN(n) ? '⚪' : kecilLebihBaik ? (n <= bagus ? '🟢' : n <= cukup ? '🟡' : '🔴') : (n >= bagus ? '🟢' : n >= cukup ? '🟡' : '🔴');
    const rp0 = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
    const rows = [];
    const add = (lapis, indikator, nilai, txt, patokan, vonis, saran) => rows.push({ lapis, indikator, nilai, txt, patokan, vonis, saran });
    // Jangkauan
    add('Jangkauan', 'Reach rate Reels', rrRata.reels, rrRata.reels !== null ? pct(rrRata.reels) : '—', 'bagus ≥30% · cukup ≥15% follower', v(rrRata.reels, 0.30, 0.15),
      'Perkuat hook 3 detik pertama (gerak + teks besar), pakai audio yang sedang ramai, durasi 15–30 detik, unggah di jam engagement terbaik.');
    add('Jangkauan', 'Reach rate feed (post & carousel)', rrRata.feed, rrRata.feed !== null ? pct(rrRata.feed) : '—', 'bagus ≥10% · cukup ≥5% follower', v(rrRata.feed, 0.10, 0.05),
      'Perbanyak Carousel informatif (denah, simulasi cicilan, perbandingan tipe) dan boost konten dengan ER tertinggi.');
    const fAwal = Number(data.igAkun?.followersAwal) || 0, fKini = Number(data.igAkun?.followers) || 0;
    const tumbuh = fAwal && fKini ? (fKini - fAwal) / fAwal : null;
    add('Jangkauan', 'Pertumbuhan follower', tumbuh, tumbuh !== null ? `${fKini - fAwal >= 0 ? '+' : ''}${fKini - fAwal} (${pct(tumbuh)})` : '—', 'bagus ≥2% · cukup ≥0,5% per periode', v(tumbuh, 0.02, 0.005),
      'Ajak follow di akhir Reels, buat collab post dengan agent/akun lokal Serpong–BSD, dan jalankan konten seri mingguan yang membuat orang menunggu lanjutannya.');
    // Algoritma
    const erRata = totalEng.reach ? (totalEng.like + totalEng.kom + totalEng.share + totalEng.save) / totalEng.reach : null;
    add('Algoritma & engagement', 'Engagement rate rata-rata', erRata, erRata !== null ? pct(erRata) : '—', 'bagus ≥6% · cukup ≥3%', v(erRata, 0.06, 0.03),
      'Tutup caption dengan pertanyaan, balas setiap komentar dalam 1 jam pertama, pakai carousel untuk informasi detail.');
    const ssRata = totalEng.reach ? (totalEng.share + totalEng.save) / totalEng.reach : null;
    add('Algoritma & engagement', 'Rasio save + share terhadap reach', ssRata, ssRata !== null ? pct(ssRata) : '—', 'bagus ≥2% · cukup ≥1%', v(ssRata, 0.02, 0.01),
      'Save & share paling diperhitungkan algoritma. Buat konten referensi yang layak disimpan: checklist KPR, rute ke St. Rawa Buntu, perbandingan tipe & cicilan.');
    // Iklan
    const meta = (data.ads || []).filter(x => x.sumber === 'meta-api');
    const imp = meta.reduce((t, x) => t + (Number(x.impresi) || 0), 0), klk = meta.reduce((t, x) => t + (Number(x.klik) || 0), 0), spM = meta.reduce((t, x) => t + (Number(x.spend) || 0), 0);
    const ctr = imp ? klk / imp : null, cpc = klk ? spM / klk : null;
    add('Iklan', 'CTR iklan Meta (klik link ÷ impresi)', ctr, ctr !== null ? pct(ctr) : '—', 'bagus ≥1% · cukup ≥0,5%', v(ctr, 0.01, 0.005),
      'Ganti materi: unit nyata + hadiah per tipe tampil di 1 detik pertama, harga "mulai Rp1,5 M" di visual; uji 2–3 variasi kreatif per ad set.');
    add('Iklan', 'Biaya per klik iklan Meta', cpc, cpc !== null ? rp0(cpc) : '—', 'bagus ≤Rp1.500 · cukup ≤Rp3.000', v(cpc, 1500, 3000, true),
      'Persempit lokasi ke area inti persona, matikan penempatan Audience Network, hentikan ad set dengan CTR terendah.');
    // Audiens organik & retensi Reels (Fase 3)
    {
      const prA = data.persona?.[fProj || 'BIO DISTRICT'];
      const du = data.igDemo?.usia || [];
      const totU = du.reduce((a, r) => a + (r.nilai || 0), 0);
      const dalam = totU && prA ? du.filter(r => dalamUsiaPersona(String(r.kunci).replace('+', '-99').replace('-99', '+'), prA)).reduce((a, r) => a + r.nilai, 0) / totU : null;
      add('Jangkauan', 'Follower dalam usia persona', dalam, dalam !== null ? pct(dalam) : '—', 'bagus ≥50% · cukup ≥30%', v(dalam, 0.5, 0.3),
        'Audiens organik belum sesuai persona: angkat topik keluarga, KPR rumah pertama, dan rute kerja ke Jakarta; kolaborasi dengan akun lifestyle keluarga Serpong–BSD.');
      const ret = (data.contents || []).filter(x => /reels|video/i.test(x.format || '') && Number(x.avg_watch) && parseFloat(x.durasi)).map(x => Number(x.avg_watch) / parseFloat(x.durasi));
      const retR = ret.length ? ret.reduce((a, n) => a + n, 0) / ret.length : null;
      add('Algoritma & engagement', 'Retensi Reels (rata-rata ditonton ÷ durasi)', retR, retR !== null ? pct(retR) : '—', 'bagus ≥50% · cukup ≥30% (isi Durasi di CRM)', v(retR, 0.5, 0.3),
        'Penonton keluar sebelum pesan utama: taruh hal paling menarik di 3 detik pertama, potong pembuka yang lambat, tampilkan harga atau hadiah sebelum detik ke-5.');
    }
    // Targeting iklan terhadap persona (Fase 2)
    {
      const prA = data.persona?.[fProj || 'BIO DISTRICT'];
      const usia = ringkasDim(data.breakdown, 'usia_gender', r => r.k1);
      const wil = ringkasDim(data.breakdown, 'wilayah', r => r.k1);
      const pen = ringkasDim(data.breakdown, 'penempatan', r => r.k1);
      const luarUsia = usia.length ? usia.filter(x => !dalamUsiaPersona(x.k, prA)).reduce((a, x) => a + x.share, 0) : null;
      const luarWil = wil.length ? wil.filter(x => !wilayahTarget(x.k)).reduce((a, x) => a + x.share, 0) : null;
      const an = pen.length ? pen.filter(x => /audience_network/.test(x.k)).reduce((a, x) => a + x.share, 0) : null;
      add('Iklan', 'Spend di luar usia persona', luarUsia, luarUsia !== null ? pct(luarUsia) : '—', 'bagus ≤15% · cukup ≤30% dari spend', v(luarUsia, 0.15, 0.30, true),
        `Batasi usia ad set ke ${prA ? prA.usiaMin + '–' + (prA.usiaMax + 10) : 'rentang persona'}; bila Advantage+ audience aktif, isi usia minimum sebagai batas keras.`);
      add('Iklan', 'Spend di luar Banten & DKI Jakarta', luarWil, luarWil !== null ? pct(luarWil) : '—', 'bagus ≤10% · cukup ≤25% dari spend', v(luarWil, 0.10, 0.25, true),
        'Ganti lokasi ad set menjadi titik radius di sekitar Serpong–BSD (mis. 15–25 km) plus Jakarta Barat, bukan seluruh Indonesia atau provinsi.');
      add('Iklan', 'Spend di Audience Network', an, an !== null ? pct(an) : '—', 'bagus ≤5% · cukup ≤15% dari spend', v(an, 0.05, 0.15, true),
        'Matikan penempatan Audience Network (aplikasi pihak ketiga): kliknya murah tapi jarang menjadi calon pembeli.');
    }
    // Niat → tercatat
    const metaChat = Object.entries(data.hasilPlat || {}).filter(([k]) => ((data.campaigns || []).find(c => c.nama === k) || {}).sumber === 'meta-api').reduce((a, [, n]) => a + (Number(n) || 0), 0);
    const leadMeta = (data.bySumber || []).filter(r => /facebook|instagram|whatsapp|meta/i.test(r.kunci)).reduce((a, r) => a + r.l0, 0);
    const rMeta = metaChat ? Math.min(1, leadMeta / metaChat) : null;
    add('Niat beli', 'Chat iklan Meta yang tercatat jadi lead', rMeta, metaChat ? `${leadMeta} dari ${metaChat}` : '—', 'bagus ≥70% · cukup ≥40%', v(rMeta, 0.7, 0.4),
      'Setiap chat iklan diinput hari itu juga; selesaikan sambungan WA otomatis ke CRM.');
    const klikWA = (data.ga4 || []).reduce((t, r) => t + Number(r.key_events || 0), 0);
    const leadWeb = (data.bySumber || []).filter(r => /website/i.test(r.kunci)).reduce((a, r) => a + r.l0, 0);
    const rWeb = klikWA ? Math.min(1, leadWeb / klikWA) : null;
    add('Niat beli', 'Klik WA website yang tercatat jadi lead', rWeb, klikWA ? `${leadWeb} dari ${klikWA}` : '—', 'bagus ≥70% · cukup ≥40%', v(rWeb, 0.7, 0.4),
      'Input setiap chat dari website; pastikan tombol WA website memakai pesan berkode agar asalnya terbaca.');
    // Kualitas lead (persona)
    const ft = data.fit?.total || { n: 0 };
    const dinilai = ft.n - (ft.kurang || 0);
    const pCocok = dinilai > 0 ? ft.cocok / dinilai : null, pLengkap = ft.n ? dinilai / ft.n : null;
    const pr = data.persona?.[fProj || 'BIO DISTRICT'];
    add('Kualitas lead', 'Lead cocok target persona', pCocok, pCocok !== null ? `${pct(pCocok)} (${ft.cocok} dari ${dinilai})` : '—', 'bagus ≥50% · cukup ≥30%', v(pCocok, 0.5, 0.3),
      `Arahkan targeting iklan ke area inti persona${pr ? ` dan usia ${pr.usiaMin}–${pr.usiaMax}` : ''}; tampilkan harga "mulai Rp1,5 M" di materi agar calon pembeli di luar target tersaring sejak awal.`);
    add('Kualitas lead', 'Data kualifikasi lead lengkap (≥3 kolom)', pLengkap, pLengkap !== null ? `${pct(pLengkap)} (${dinilai} dari ${ft.n})` : '—', 'bagus ≥70% · cukup ≥40%', v(pLengkap, 0.7, 0.4),
      'Sebelum oper ke sales, marcom wajib menanyakan domisili, budget, cara bayar, usia, dan tujuan beli (skrip 3 pertanyaan) lalu mengisinya di CRM.');
    const l2r = totFunnel.l0 ? totFunnel.l2 / totFunnel.l0 : null;
    add('Kualitas lead', 'Lead berkualitas (L2 ÷ lead masuk)', l2r, l2r !== null ? pct(l2r) : '—', 'bagus ≥25% · cukup ≥15%', v(l2r, 0.25, 0.15),
      'Ajak setiap lead yang membalas menjadwalkan kunjungan weekend; ubah status di setiap follow up agar pergerakan terbaca.');
    const cpql = paidFunnel.l2 ? totSpend / paidFunnel.l2 : null;
    add('Kualitas lead', 'Biaya per lead berkualitas (CPQL)', cpql, cpql !== null ? rp0(cpql) : '—', 'bagus ≤Rp1,5 jt · cukup ≤Rp2,5 jt', v(cpql, 1500000, 2500000, true),
      'Geser budget ke campaign dengan CPQL & % cocok target terbaik (lihat tabel di bawah); hentikan campaign tanpa lead cocok setelah spend Rp1 jt.');
    // Penjualan
    const bd = data.bookingDetail || [];
    const hari = (() => { const a1 = rentang[0] ? new Date(rentang[0]) : null; const a2 = rentang[1] ? new Date(rentang[1]) : new Date(); return a1 ? Math.round((a2 - a1) / 86400000) + 1 : 999; })();
    add('Penjualan', 'Booking dari lead marketing', bd.length, `${bd.length} unit`, 'target Oktober: 2 unit in-house dari marketing', hari < 14 ? '⚪' : bd.length >= 2 ? '🟢' : bd.length === 1 ? '🟡' : '🔴',
      'Fokus mengundang lead cocok target ke Grand Rewards Weekend dan tutup dengan pilihan reserved hari itu atau pengajuan KPR 3 hari.');
    const hs = bd.map(b => Number(b.hari)).filter(n => !isNaN(n));
    const lama = hs.length ? hs.reduce((a, n) => a + n, 0) / hs.length : null;
    add('Penjualan', 'Lama lead masuk sampai booking', lama, lama !== null ? `${Math.round(lama)} hari` : '—', 'bagus ≤30 hari · cukup ≤60 hari', v(lama, 30, 60, true),
      'Percepat dengan pra-persetujuan KPR sebelum kunjungan dan batas waktu promo hadiah yang jelas.');
    return rows;
  }, [data, rrRata, totalEng, totFunnel, paidFunnel, totSpend, fProj, rentang]); // eslint-disable-line

  // ===== Brief Bulan Depan (Fase 3): disusun dari data yang terbukti, bukan template =====
  const brief = useMemo(() => {
    if (!data) return null;
    const prB = data.persona?.[fProj || 'BIO DISTRICT'];
    const L = { audiens: [], konten: [], iklan: [], tim: [] };
    if (prB) L.audiens.push(`Persona: domisili ${prB.areaInti.slice(0, 6).join(', ')}${prB.areaLuas.length ? ' (perluasan ' + prB.areaLuas.slice(0, 3).join(', ') + ')' : ''}; usia ${prB.usiaMin}–${prB.usiaMax}; kemampuan beli ≥ ${fmtRp(prB.hargaMin)}; tujuan ${prB.tujuan}.`);
    const usiaAds = ringkasDim(data.breakdown, 'usia_gender', r => r.k1).filter(x => x.hasil > 0 && dalamUsiaPersona(x.k, prB));
    const bestAge = [...usiaAds].sort((a, b) => (a.cph || 1e18) - (b.cph || 1e18))[0];
    if (bestAge) L.audiens.push(`Usia persona dengan biaya per chat termurah di iklan: ${bestAge.k} (${fmtRp(Math.round(bestAge.cph))} per chat).`);
    const bestUl = [...(data.usiaLead || [])].sort((a, b) => b.cocok - a.cocok)[0];
    if (bestUl && bestUl.cocok) L.audiens.push(`Usia penyumbang lead cocok terbanyak di CRM: ${bestUl.k} (${bestUl.cocok} lead).`);
    if (data.igDemo?.kota?.length) L.audiens.push(`Kota follower Instagram teratas: ${data.igDemo.kota.slice(0, 4).map(k => k.kunci).join(', ')}.`);
    const fB = polaFormat[0], tB = polaTopik.find(r => r.er !== null && r.n >= 2) || polaTopik[0], jB = polaJam[0];
    if (fB) L.konten.push(`Format utama: ${fB.format} (ER ${pct(fB.er)})${polaFormat[1] ? `, pendamping ${polaFormat[1].format}` : ''}.`);
    if (tB) L.konten.push(`Topik dengan engagement tertinggi: ${tB.topik} (ER ${pct(tB.er)}) — ulangi dengan sudut baru minimal 2× sebulan.`);
    if (jB) L.konten.push(`Jam tayang terbaik: ${jB.jam}.`);
    if (rrRata.reels !== null && rrRata.reels < 0.15) L.konten.push('Reels belum menjangkau di luar follower: buka dengan gerak dan teks besar di detik pertama, durasi 15–30 detik, audio yang sedang ramai.');
    L.konten.push('Komposisi mingguan: 2 Reels (memperluas jangkauan) + 2 Carousel (memancing save & share); setiap konten diberi Topik dan Hook di CRM.');
    const camp = Object.entries(data.fit?.byCampaign || {}).filter(([k]) => k !== '(tanpa data)' && spendMap[k]).map(([k, r]) => ({ k, sp: spendMap[k], cocok: r.cocok, bpc: r.cocok ? spendMap[k] / r.cocok : null }));
    camp.filter(c => c.bpc !== null).sort((a, b) => a.bpc - b.bpc).slice(0, 2).forEach(c => L.iklan.push(`Naikkan budget: ${c.k} — ${fmtRp(Math.round(c.bpc))} per lead cocok persona.`));
    camp.filter(c => !c.cocok && c.sp >= 1000000).forEach(c => L.iklan.push(`Hentikan atau ganti materi: ${c.k} — ${fmtRp(Math.round(c.sp))} tanpa satu pun lead cocok persona.`));
    rapor.filter(r => r.lapis === 'Iklan' && r.vonis === '🔴').forEach(r => L.iklan.push(`${r.indikator} ${r.txt} → ${r.saran}`));
    if (!L.iklan.length) L.iklan.push('Struktur iklan sudah sehat; uji 1 variasi kreatif baru per campaign setiap 2 minggu.');
    rapor.filter(r => ['Kualitas lead', 'Niat beli', 'Penjualan'].includes(r.lapis) && r.vonis === '🔴').forEach(r => L.tim.push(`${r.indikator} ${r.txt} → ${r.saran}`));
    if (!L.tim.length) L.tim.push('Pertahankan disiplin input: kualifikasi lead lengkap, status diperbarui di setiap follow up.');
    return L;
  }, [data, rapor, polaFormat, polaTopik, polaJam, rrRata, spendMap, fProj]); // eslint-disable-line

  // Resume = ringkasan eksekutif; prioritas diambil dari vonis merah Diagnosa (satu sumber), lalu temuan operasional
  const resumeFinal = useMemo(() => {
    if (!resume) return null;
    const URUT = ['Kualitas lead', 'Penjualan', 'Iklan', 'Niat beli', 'Algoritma & engagement', 'Jangkauan'];
    const merah = rapor.filter(r => r.vonis === '🔴').sort((a, b) => URUT.indexOf(a.lapis) - URUT.indexOf(b.lapis)).map(r => `${r.indikator}: ${r.txt} (patokan ${r.patokan}) — ${r.saran}`);
    const semua = [...merah, ...resume.perbaiki];
    const saran = [...(brief?.iklan || []).slice(0, 2), ...resume.saran].filter((x, i, a) => a.indexOf(x) === i);
    return { ringkas: resume.ringkas, perbaiki: semua.slice(0, 5), sisa: Math.max(0, semua.length - 5), saran: saran.slice(0, 5) };
  }, [resume, rapor, brief]);

  if (!data) return <div className="loading">Memuat…</div>;
  const camps = (data.campaigns || []).filter(x => !fProj || x.project === fProj || !x.project);
  const metaApi = (data.ads || []).some(x => x.sumber === 'meta-api') || (data.campaigns || []).some(x => x.sumber === 'meta-api');
  const igAktif = (data.contents || []).some(x => x.created_by === 'auto-instagram');
  const igTanpaTopik = (data.contents || []).filter(x => x.platform === 'Instagram' && !x.topik).length;
  const igEdit = kEdit && k.platform === 'Instagram' && igAktif;

  return (
    <>
      <div className="page-head"><div><h1>Analisa Marcom</h1>
        <div className="sub">Konten & iklan tim marcom vs hasil di CRM — L0 lead masuk · L1 tersentuh FU · L2 berkualitas (pernah Warm/Hot/Site Visit+, atau Walk In) · data analisa mulai 1 Sep 2026 · L3 Booking (dihitung pada tanggal booking)</div></div>
        <div className="stamp">Spend: <b>{fmtRp(totSpend)}</b></div></div>

      <div className="form-tabs" style={{ marginBottom: 10 }}>
        {[['insight', '1 · Insight'], ['konten', '2 · Konten'], ['iklan', '3 · Iklan'], ['tim', '4 · Output Tim'], ['web', '5 · Website & SEO'], ['diagnosa', '6 · Diagnosa']].map(([key, t]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{t}</button>))}
      </div>

      <div className="fu-toolbar" style={{ marginBottom: 8 }}>
        <button className={'sort-btn' + (!fProj ? ' active' : '')} onClick={() => setFProj('')}>Semua Project</button>
        {(set.project || []).map(p => <button key={p} className={'sort-btn' + (fProj === p ? ' active' : '')} onClick={() => setFProj(p)}>{p}</button>)}
      </div>
      <div className="fu-toolbar" style={{ marginBottom: 12 }}>
        {[['bulan', 'Bulan Ini'], ['perbulan', 'Per Bulan'], ['semua', 'Sejak Sep 2026'], ['custom', 'Pilih Tanggal']].map(([v, t]) => (
          <button key={v} className={'sort-btn' + (periode === v ? ' active' : '')} onClick={() => setPeriode(v)}>{t}</button>))}
        {periode === 'perbulan' && (
          <select className="sort-filter" style={{ marginLeft: 0 }} value={bln} onChange={e => setBln(e.target.value)}>
            {pilihanBulan.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
          </select>)}
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
          <div className="kpi"><div className="kpi-label">CPL / CPQL / per Booking <span style={{ fontWeight: 400 }}>(lead ber-campaign)</span></div><div className="kpi-val" style={{ fontSize: 14 }}>{per(totSpend, paidFunnel.l0)} / {per(totSpend, paidFunnel.l2)} / {per(totSpend, paidFunnel.l3)}</div></div>
        </div>

        {resume && (
          <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--brass)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>🧭 Resume Analisa <span className="hint">(otomatis dari data yang masuk — ikut filter project & periode)</span></h3>
              <button className="sort-btn" onClick={salinResume}>📋 Salin Resume</button>
            </div>
            <div style={{ marginTop: 10 }}>
              <b style={{ color: 'var(--green)' }}>Ringkasan</b>
              <ul style={{ margin: '4px 0 10px', paddingLeft: 20, lineHeight: 1.55 }}>{resume.ringkas.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <b style={{ color: 'var(--red)' }}>Yang Harus Diperbaiki</b>
              <ul style={{ margin: '4px 0 10px', paddingLeft: 20, lineHeight: 1.55 }}>{resumeFinal.perbaiki.length ? resumeFinal.perbaiki.map((x, i) => <li key={i}>{x}</li>) : <li>Tidak ada temuan kritis — pertahankan disiplin input.</li>}
                {resumeFinal.sisa ? <li className="hint" style={{ listStyle: 'none', marginLeft: -20 }}>… dan {resumeFinal.sisa} poin lainnya — lihat detail di tab <b>6 · Diagnosa</b>.</li> : null}</ul>
              <b style={{ color: 'var(--brass)' }}>Saran Strategi</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20, lineHeight: 1.55 }}>{resumeFinal.saran.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          </div>
        )}

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

        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Booking dari Marketing <span className="hint">(dihitung pada tanggal booking; lead dari marcom, campaign, kanal marketing, atau walk in via media marketing)</span></h3>
          <div className="tbl-wrap tbl-compact"><table>
            <thead><tr><th>Lead</th><th>Asal</th><th>Sales</th><th>Lead Masuk</th><th>Booking</th><th className="num">Lama (hari)</th><th className="num">Follow Up</th><th className="num">Nilai</th></tr></thead>
            <tbody>{(data.bookingDetail || []).length ? (data.bookingDetail || []).map(b => (
              <tr key={b.lead_code + (b.unit || '')}>
                <td data-label="Lead"><b>{b.lead_code}</b>{b.unit ? <div className="hint">{b.unit}</div> : null}</td>
                <td data-label="Asal">{/walk/i.test(b.sumber) ? 'Walk In via ' + (b.walkin_info || '-') : b.sumber}{b.campaign && b.campaign !== '(tanpa data)' ? <div className="hint">{b.campaign}</div> : null}</td>
                <td data-label="Sales">{b.sales || '—'}</td>
                <td data-label="Masuk">{fmtDate(b.tgl_lead)}</td>
                <td data-label="Booking">{fmtDate(b.tgl_booking)}</td>
                <td className="num" data-label="Lama"><b>{b.hari}</b></td>
                <td className="num" data-label="FU">{b.nfu}</td>
                <td className="num" data-label="Nilai">{Number(b.nilai) ? fmtRp(b.nilai) : '—'}</td>
              </tr>))
              : <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada booking dari lead marketing pada periode ini.</td></tr>}</tbody>
          </table></div>
          {data.bookingLain ? <span className="hint">{data.bookingLain} booking lain berasal dari lead non-marketing (referral, kanvasing, WA langsung ke sales) dan tidak dihitung di sini.</span> : null}
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
              <thead><tr><th>Format</th><th className="num">Jml</th><th className="num">Reach</th><th className="num">Like</th><th className="num">Komentar</th><th className="num">Share</th><th className="num">Save</th><th className="num">Views</th><th className="num">ER</th><th className="num">Klik Bio</th></tr></thead>
              <tbody>{polaFormat.map(r => (
                <tr key={r.format}><td data-label="Format">{r.format}</td><td className="num" data-label="Jml">{r.n}</td>
                  <td className="num" data-label="Reach">{r.reach.toLocaleString('id-ID')}</td>
                  <td className="num" data-label="Like">{r.like.toLocaleString('id-ID')}</td><td className="num" data-label="Komentar">{r.kom}</td><td className="num" data-label="Share">{r.share}</td><td className="num" data-label="Save">{r.save}</td><td className="num" data-label="Views">{r.views.toLocaleString('id-ID')}</td>
                  <td className="num" data-label="ER"><b>{pct(r.er)}</b></td><td className="num" data-label="Klik">{r.klik}</td></tr>))}</tbody>
            </table></div>
            {polaJam.length > 0 && <div className="hint" style={{ marginTop: 8 }}>Jam tayang terbaik (ER): {polaJam.map(j => `${j.jam} ${pct(j.er)}`).join(' · ')}</div>}
            {polaTopik.length > 0 && (
              <div className="tbl-wrap tbl-compact" style={{ marginTop: 10 }}><table>
                <thead><tr><th>Topik</th><th className="num">Jml</th><th className="num">Reach</th><th className="num">Like</th><th className="num">Komentar</th><th className="num">Share</th><th className="num">Save</th><th className="num">Views</th><th className="num">ER</th><th className="num">Klik Bio</th></tr></thead>
                <tbody>{polaTopik.map(r => (
                  <tr key={r.topik}><td data-label="Topik">{r.topik}</td><td className="num" data-label="Jml">{r.n}</td>
                    <td className="num" data-label="Reach">{r.reach.toLocaleString('id-ID')}</td>
                    <td className="num" data-label="Like">{r.like.toLocaleString('id-ID')}</td><td className="num" data-label="Komentar">{r.kom}</td><td className="num" data-label="Share">{r.share}</td><td className="num" data-label="Save">{r.save}</td><td className="num" data-label="Views">{r.views.toLocaleString('id-ID')}</td>
                    <td className="num" data-label="ER"><b>{pct(r.er)}</b></td><td className="num" data-label="Klik">{r.klik}</td></tr>))}</tbody>
              </table></div>)}
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
        {igAktif && !kEdit && !formManual && (
          <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--brass)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div><b>⚡ Konten Instagram masuk otomatis tiap pagi</b> — tanggal, jam, format, link & semua angkanya.
                <div className="hint">Tugas tim: klik <b>Lengkapi</b> pada konten Instagram untuk mengisi <b>Topik</b> (dan <b>Hook</b> untuk Reels).{igTanpaTopik ? ` Masih ${igTanpaTopik} konten tanpa topik.` : ' Semua konten sudah bertopik 👍'}</div></div>
              <button className="sort-btn" onClick={() => setFormManual(true)}>➕ Catat Konten Manual (Facebook / TikTok / lainnya)</button>
            </div>
          </div>
        )}
        {(!igAktif || kEdit || formManual) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{igEdit ? 'Lengkapi Konten Instagram' : kEdit ? 'Edit Konten' : 'Catat Konten Manual'} <span className="hint">{igEdit ? '(tanggal, jam, format, link & angka sudah otomatis — cukup isi topik & hook)' : '(untuk platform yang belum tersambung otomatis)'}</span></h3>
          <div className="form-grid">
            {!igEdit && <div className="field"><label>Tanggal Tayang</label><input type="date" {...fk('tgl')} /></div>}
            {!igEdit && <div className="field"><label>Platform <span className="req">*</span></label><select {...fk('platform')}>{PLATFORM.map(p => <option key={p}>{p}</option>)}</select></div>}
            <div className="field"><label>Project</label><select {...fk('project')}><option value="">— pilih —</option>{(set.project || []).map(p => <option key={p}>{p}</option>)}</select></div>
            {!igEdit && <div className="field"><label>Format <span className="req">*</span></label><select {...fk('format')}>{FORMAT.map(f => <option key={f}>{f}</option>)}</select></div>}
            <div className="field"><label>Topik <span className="hint">(pilih kategori atau ketik baru)</span></label>
              {(() => {
                const saran = [...new Set([...(set.topik || []), ...(data.contents || []).map(x => String(x.topik || '').trim()).filter(Boolean)])];
                return (<>
                  <input list="dl-topik" {...fk('topik')} placeholder="mis. Promo & Harga"
                    onBlur={e => { const v = e.target.value.trim(); const c = saran.find(x => x.toLowerCase() === v.toLowerCase()); setK(cur => ({ ...cur, topik: c || v })); }} />
                  <datalist id="dl-topik">{saran.map(x => <option key={x} value={x} />)}</datalist>
                </>);
              })()}</div>
            <div className="field"><label>Hook (3 detik pertama)</label><input {...fk('hook')} placeholder={k.format && k.format.startsWith('Reels') ? 'adegan — gerakan kamera — audio' : 'teks slide/gambar pertama'} /></div>
            {!igEdit && <div className="field"><label>Jam Tayang</label><input {...fk('jam')} placeholder="contoh: 19:00" /></div>}
            <div className="field"><label>Durasi</label><input {...fk('durasi')} placeholder="contoh: 30 dtk" /></div>
            {!igEdit && <div className="field" style={{ gridColumn: '1/-1' }}><label>Link Konten</label><input {...fk('link')} placeholder="https://…" /></div>}
          </div>
          <div className="form-foot">
            <button className="btn btn-primary" disabled={busy} onClick={() => simpan('konten', k, kEdit, () => { setKEdit(null); setFormManual(false); setK({ ...K0, tgl: todayISO() }); })}>{kEdit ? 'Simpan Perubahan' : 'Simpan Konten'}</button>
            {(kEdit || formManual) && <button className="sort-btn" onClick={() => { setKEdit(null); setFormManual(false); setK({ ...K0, tgl: todayISO() }); }}>Batal</button>}
          </div>
        </div>
        )}

        {(!igAktif || (m.content_id && ((data.contents || []).find(c => String(c.id) === String(m.content_id)) || {}).platform !== 'Instagram')) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Update Angka Performa <span className="hint">(seminggu sekali — pilih konten, angka terakhir otomatis terisi; ubah yang berubah saja)</span></h3>
          <div className="form-grid">
            <div className="field"><label>Konten <span className="req">*</span></label>
              <select value={m.content_id} onChange={e => isiAngka(e.target.value)}><option value="">— pilih konten —</option>
                {(data.contents || []).filter(x => !igAktif || x.platform !== 'Instagram').map(x => <option key={x.id} value={x.id}>{fmtDate(x.tgl)} · {x.platform} · {(x.topik || x.format || '').slice(0, 40)}</option>)}</select></div>
            <div className="field"><label>Per Tanggal</label><input type="date" {...fm('tgl')} /></div>
            <div className="field"><label>Reach</label><input type="number" min="0" {...fm('reach')} /></div>
            <div className="field"><label>Like</label><input type="number" min="0" {...fm('like_n')} /></div>
            <div className="field"><label>Komentar</label><input type="number" min="0" {...fm('komentar')} /></div>
            <div className="field"><label>Share</label><input type="number" min="0" {...fm('share_n')} /></div>
            <div className="field"><label>Save</label><input type="number" min="0" {...fm('save_n')} /></div>
            <div className="field"><label>Views</label><input type="number" min="0" {...fm('view3')} /></div>
            <div className="field"><label>View Selesai</label><input type="number" min="0" {...fm('view_full')} /></div>
            <div className="field"><label>Klik Bio / Link</label><input type="number" min="0" {...fm('klik_bio')} /></div>
          </div>
          <div className="form-foot"><button className="btn btn-primary" disabled={busy} onClick={() => simpan('metrik', m, null, () => setM({ ...M0, tgl: todayISO() }))}>Simpan Angka</button>
            {igAktif && <button className="sort-btn" onClick={() => setM({ ...M0, tgl: todayISO() })}>Tutup</button>}</div>
        </div>
        )}

        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Total Engagement Periode Ini <span className="hint">({totalEng.n} konten · ER = (like + komentar + share + save) ÷ reach)</span></h3>
          <div className="kpi-grid kpi-compact">
            {[['Follower IG', follower ? follower.toLocaleString('id-ID') + (data.igAkun.followersAwal !== null && data.igAkun.followersAwal !== undefined && follower - data.igAkun.followersAwal !== 0 ? ` (${follower - data.igAkun.followersAwal > 0 ? '+' : ''}${follower - data.igAkun.followersAwal})` : '') : '—'],
              ['Reach rate Reels', rrRata.reels !== null ? pct(rrRata.reels) : '—'], ['Reach rate feed', rrRata.feed !== null ? pct(rrRata.feed) : '—'],
              ['Reach', totalEng.reach], ['Like', totalEng.like], ['Komentar', totalEng.kom], ['Share', totalEng.share], ['Save', totalEng.save], ['Views', totalEng.views], ['Klik Bio', totalEng.klik], ['ER rata-rata', totalEng.reach ? pct((totalEng.like + totalEng.kom + totalEng.share + totalEng.save) / totalEng.reach) : '—']].map(([l, v]) => (
              <div className="kpi" key={l}><div className="kpi-label">{l}</div><div className="kpi-val">{typeof v === 'number' ? v.toLocaleString('id-ID') : v}</div></div>))}
          </div>
        </div>
        <div className="tbl-wrap tbl-compact"><table>
          <thead><tr>{[['tgl', 'Tanggal'], ['platform', 'Platform'], ['format', 'Format'], ['topik', 'Topik / Hook'], ['jam', 'Jam'], ['reach', 'Reach'], ['rr', 'Reach Rate'], ['like_n', 'Like'], ['komentar', 'Komentar'], ['share_n', 'Share'], ['save_n', 'Save'], ['view3', 'Views'], ['er', 'ER'], ['klik_bio', 'Klik Bio']].map(([k, t]) => (
            <th key={k} className={['reach', 'rr', 'like_n', 'komentar', 'share_n', 'save_n', 'view3', 'er', 'klik_bio'].includes(k) ? 'num' : ''} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Klik untuk mengurutkan"
              onClick={() => setKSort(s0 => ({ key: k, dir: s0.key === k && s0.dir === 'desc' ? 'asc' : 'desc' }))}>{t}{kSort.key === k ? (kSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}</th>))}<th>Aksi</th></tr></thead>
          <tbody>{(data.contents || []).length ? [...(data.contents || [])].sort((a, b) => {
            const k = kSort.key, d = kSort.dir === 'desc' ? -1 : 1;
            const v = x => k === 'er' ? (er(x) ?? -1) : k === 'rr' ? (rr(x) ?? -1) : ['tgl', 'platform', 'format', 'topik', 'jam'].includes(k) ? String(x[k] || '') : (Number(x[k]) || 0);
            const va = v(a), vb = v(b);
            return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * d;
          }).map(x => (
            <tr key={x.id}>
              <td data-label="Tanggal">{fmtDate(x.tgl)}</td>
              <td data-label="Platform">{x.platform}{igAktif && x.platform === 'Instagram' ? <div className="hint">⚡ otomatis</div> : null}</td>
              <td data-label="Format"><span className="badge b-new">{x.format}</span></td>
              <td data-label="Topik"><b>{x.topik || '—'}</b>{x.hook ? <div className="hint">{x.hook}</div> : null}</td>
              <td data-label="Jam">{x.jam || '—'}</td>
              <td className="num" data-label="Reach">{Number(x.reach) ? Number(x.reach).toLocaleString('id-ID') : '—'}</td>
              <td className="num" data-label="Reach Rate">{(() => { const v = rr(x), l = labelRR(v, x.format); return v === null ? '—' : <span style={{ color: l.c, fontWeight: l.w }} title={'Patokan ' + (jenisRR(x.format) === 'reels' ? 'Reels: biasa 15%, bagus 30%, sangat bagus 60%' : 'feed: biasa 5%, bagus 10%, sangat bagus 20%')}>{pct(v)}<div className="hint" style={{ color: l.c }}>{l.t}</div></span>; })()}</td>
              <td className="num" data-label="Like">{Number(x.like_n) ? Number(x.like_n).toLocaleString('id-ID') : '—'}</td>
              <td className="num" data-label="Komentar">{Number(x.komentar) || '—'}</td>
              <td className="num" data-label="Share">{Number(x.share_n) || '—'}</td>
              <td className="num" data-label="Save">{Number(x.save_n) || '—'}</td>
              <td className="num" data-label="Views">{Number(x.view3) ? Number(x.view3).toLocaleString('id-ID') : '—'}{Number(x.avg_watch) ? <div className="hint" title="rata-rata waktu tonton Reels">⏱ {String(x.avg_watch).replace('.', ',')} dtk{parseFloat(x.durasi) ? ` (${Math.round(Number(x.avg_watch) / parseFloat(x.durasi) * 100)}%)` : ''}</div> : null}</td>
              <td className="num" data-label="ER"><b>{pct(er(x))}</b></td>
              <td className="num" data-label="Klik">{x.klik_bio || '—'}</td>
              <td data-label="Aksi"><span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="sort-btn" style={{ padding: '3px 9px', ...(igAktif && x.platform === 'Instagram' && !x.topik ? { color: 'var(--brass)', fontWeight: 700 } : {}) }} onClick={() => { setKEdit(x.id); setK({ tgl: String(x.tgl || '').slice(0, 10), platform: x.platform || 'Instagram', project: x.project || '', format: x.format || FORMAT[0], topik: x.topik || '', hook: x.hook || '', jam: x.jam || '', durasi: x.durasi || '', link: x.link || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{igAktif && x.platform === 'Instagram' ? 'Lengkapi' : 'Edit'}</button>
                {!(igAktif && x.platform === 'Instagram') && <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { isiAngka(x.id); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('Angka terakhir sudah terisi — ubah yang berubah saja, lalu Simpan Angka'); }}>Angka</button>}
                {data.me?.role !== 'ceo' && <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)' }} onClick={() => hapus('konten', x.id, x.topik || x.format)}>Hapus</button>}
              </span></td>
            </tr>)) : <tr><td colSpan={15} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada konten tercatat pada periode ini.</td></tr>}</tbody>
        </table></div>
      </>)}

      {tab === 'iklan' && (<>
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{cEdit ? 'Edit Campaign' : 'Daftarkan Campaign'} <span className="hint">{metaApi ? '(campaign Meta terdaftar otomatis dari Ads Manager — daftarkan manual untuk Google, TikTok & Offline)' : '(nama HARUS sama dengan utm_campaign & nama di platform iklan)'}</span></h3>
          <div className="form-grid">
            {cEdit && <div className="field" style={{ gridColumn: '1/-1' }}><label>Nama Campaign (terkunci)</label><input value={c.nama} disabled style={{ fontFamily: 'monospace', fontWeight: 700 }} /></div>}
            <div className="field"><label>Project <span className="req">*</span></label><select {...fc('project')}><option value="">— pilih —</option>{(set.project || []).map(p => <option key={p}>{p}</option>)}</select></div>
            <div className="field"><label>Tujuan</label><select {...fc('tujuan')}>{TUJUAN_C.map(t => <option key={t}>{t}</option>)}</select></div>
            {!cEdit && <div className="field"><label>Bulan</label><select {...fc('bulan')}>{bulanOpts.map(b => <option key={b}>{b}</option>)}</select></div>}
            {!cEdit && <div className="field"><label>Pembeda (opsional)</label><input {...fc('extra')} placeholder="mis. lebaran / retargeting" /></div>}
            {!cEdit && <div className="field" style={{ gridColumn: '1/-1' }}><label>Nama Campaign — otomatis, pakai nama ini juga di Ads Manager</label><input value={namaGen} readOnly onFocus={e => e.target.select()} style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--green)' }} /></div>}
            <div className="field"><label>Platform</label><select {...fc('platform')}>{PLATFORM_C.map(p => <option key={p}>{p}</option>)}{c.platform && !PLATFORM_C.includes(c.platform) && <option>{c.platform}</option>}</select></div>
            <div className="field"><label>Budget Rencana (Rp)</label><input type="number" min="0" {...fc('budget')} /></div>
            <div className="field"><label>Status</label><select {...fc('status')}><option>Aktif</option><option>Selesai</option></select></div>
            <div className="field" style={{ gridColumn: '1/-1' }}><label>Catatan</label><input {...fc('catatan')} placeholder="target audiens, penempatan, dsb" /></div>
          </div>
          <div className="form-foot">
            <button className="btn btn-primary" disabled={busy} onClick={() => { if (!cEdit && !c.project) return toast('Pilih project dulu'); simpan('campaign', { ...c, nama: cEdit ? c.nama : namaGen }, cEdit, () => { setCEdit(null); setC({ ...C0 }); }); }}>{cEdit ? 'Simpan Perubahan' : 'Simpan Campaign'}</button>
            {cEdit && <button className="sort-btn" onClick={() => { setCEdit(null); setC(C0); }}>Batal edit</button>}
          </div>
        </div>

        {lk && (() => {
          const salin = async (teks, apa) => { try { await navigator.clipboard.writeText(teks); toast(apa + ' tersalin 📋'); } catch { window.prompt('Salin manual:', teks); } };
          // --- Mode Link Website (UTM) ---
          const kode = lk.format + '-' + String(lk.no || 1).padStart(2, '0');
          const sep = (lk.url || '').includes('?') ? '&' : '?';
          const link = (lk.url || '') + sep + 'utm_source=' + lk.source + '&utm_medium=' + lk.medium + '&utm_campaign=' + lk.nama + '&utm_content=' + kode;
          // --- Mode Kode WA: inisial project + id campaign + nomor iklan (mis. BD14-2) ---
          const inisial = (String(lk.project || 'CHL').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase() + 'X').slice(0, 2);
          const kodeWA = inisial + lk.id + '-' + (parseInt(lk.noWa, 10) || 1);
          const pesan = (lk.teks || '').trim() + ' (' + kodeWA + ')';
          const nomor = String(lk.wa || '').replace(/[^0-9]/g, '').replace(/^0/, '62');
          const linkWA = 'https://wa.me/' + nomor + '?text=' + encodeURIComponent(pesan);
          return (
          <div className="card" style={{ marginBottom: 12, border: '1.5px solid var(--brass)' }}>
            <h3 style={{ marginTop: 0 }}>🔗 Buat Link & Kode — <span style={{ fontFamily: 'monospace' }}>{lk.nama}</span></h3>
            <div className="fu-toolbar" style={{ marginBottom: 10 }}>
              <button className={'sort-btn' + (lk.mode === 'wa' ? ' active' : '')} onClick={() => setLk({ ...lk, mode: 'wa' })}>💬 Kode WA (iklan ke chat WhatsApp)</button>
              <button className={'sort-btn' + (lk.mode !== 'wa' ? ' active' : '')} onClick={() => setLk({ ...lk, mode: 'web' })}>🌐 Link Website (UTM)</button>
            </div>
            {lk.mode === 'wa' ? (<>
              <div className="form-grid">
                <div className="field"><label>Nomor Iklan di Campaign Ini</label><input type="number" min="1" value={lk.noWa} onChange={e => setLk({ ...lk, noWa: e.target.value })} /></div>
                <div className="field"><label>Nomor WA Tujuan</label><input value={lk.wa} onChange={e => setLk({ ...lk, wa: e.target.value })} placeholder="6281…" /></div>
                <div className="field"><label>Kode Iklan</label><input value={kodeWA} readOnly style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--green)' }} /></div>
                <div className="field" style={{ gridColumn: '1/-1' }}><label>Kalimat Pembuka</label><input value={lk.teks} onChange={e => setLk({ ...lk, teks: e.target.value })} /></div>
                <div className="field" style={{ gridColumn: '1/-1' }}><label>PESAN WA OTOMATIS — tempel di Ads Manager › Message template › Prefilled message</label><input value={pesan} readOnly onFocus={e => e.target.select()} style={{ fontWeight: 600 }} /></div>
                <div className="field" style={{ gridColumn: '1/-1' }}><label>LINK WA — untuk iklan Traffic ke wa.me, bio, atau tombol</label><input value={linkWA} readOnly onFocus={e => e.target.select()} style={{ fontFamily: 'monospace', fontSize: 12 }} /></div>
              </div>
              <div className="form-foot">
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => salin(pesan, 'Pesan WA')}>📋 Salin Pesan</button>
                <button className="sort-btn" onClick={() => salin(linkWA, 'Link WA')}>📋 Salin Link WA</button>
                <button className="sort-btn" onClick={() => salin(kodeWA, 'Kode iklan')}>📋 Salin Kode</button>
                <button className="sort-btn" onClick={() => setLk(null)}>Tutup</button>
              </div>
              <span className="hint">Satu kode per iklan: naikkan Nomor Iklan untuk tiap iklan baru di campaign yang sama. Saat lead masuk, sales cukup ketik kode {kodeWA} di kolom <b>Kode Iklan</b> pada Form Input — campaign & kreatif terisi otomatis.</span>
            </>) : (<>
              <div className="form-grid">
                <div className="field"><label>URL Tujuan (landing page)</label><input value={lk.url} onChange={e => setLk({ ...lk, url: e.target.value })} placeholder="https://…" /></div>
                <div className="field"><label>Format Kreatif</label><select value={lk.format} onChange={e => setLk({ ...lk, format: e.target.value })}>{KODE_FORMAT.map(f => <option key={f}>{f}</option>)}</select></div>
                <div className="field"><label>Nomor Kreatif</label><input type="number" min="1" value={lk.no} onChange={e => setLk({ ...lk, no: e.target.value })} /></div>
                <div className="field"><label>utm_source</label><select value={lk.source} onChange={e => setLk({ ...lk, source: e.target.value })}>{UTM_SRC.map(f => <option key={f}>{f}</option>)}</select></div>
                <div className="field"><label>utm_medium</label><select value={lk.medium} onChange={e => setLk({ ...lk, medium: e.target.value })}>{UTM_MED.map(f => <option key={f}>{f}</option>)}</select></div>
                <div className="field"><label>Kode Kreatif (utm_content)</label><input value={kode} readOnly style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--green)' }} /></div>
                <div className="field" style={{ gridColumn: '1/-1' }}><label>LINK FINAL — pasang di iklan / bio</label><input value={link} readOnly onFocus={e => e.target.select()} style={{ fontFamily: 'monospace', fontSize: 12 }} /></div>
              </div>
              <div className="form-foot">
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => salin(link, 'Link')}>📋 Salin Link</button>
                <button className="sort-btn" onClick={() => salin(kode, 'Kode kreatif')}>📋 Salin Kode</button>
                <button className="sort-btn" onClick={() => setLk(null)}>Tutup</button>
              </div>
              <span className="hint">Untuk iklan yang mengarah ke website. Nama ad di Ads Manager = kode kreatif ({kode}).</span>
            </>)}
          </div>); })()}

        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>🏷️ Tandai Lead Massal <span className="hint">(lead tanpa campaign{fProj ? ' · ' + fProj : ''} — tandai banyak sekaligus)</span></h3>
          <div className="form-grid">
            <div className="field"><label>Lead Masuk Dari</label><input type="date" value={tg.d1} onChange={e => setTg({ ...tg, d1: e.target.value })} /></div>
            <div className="field"><label>Sampai</label><input type="date" value={tg.d2} onChange={e => setTg({ ...tg, d2: e.target.value })} /></div>
            <div className="field"><label>&nbsp;</label><button className="btn btn-primary" style={{ width: 'auto' }} onClick={cariUntagged}>🔍 Cari Lead Tanpa Campaign</button></div>
          </div>
          {tgRows && tgRows.length > 0 && (() => {
            const sumberOpts = [...new Set(tgRows.map(r => r.sumber || '(kosong)'))];
            const tampil = tgRows.filter(r => !tg.sumber || (r.sumber || '(kosong)') === tg.sumber);
            const nPick = tampil.filter(r => tgPick[r.id]).length;
            return (<>
              <div className="fu-toolbar" style={{ margin: '10px 0' }}>
                <button className={'sort-btn' + (!tg.sumber ? ' active' : '')} onClick={() => setTg({ ...tg, sumber: '' })}>Semua Sumber ({tgRows.length})</button>
                {sumberOpts.map(o => <button key={o} className={'sort-btn' + (tg.sumber === o ? ' active' : '')} onClick={() => setTg({ ...tg, sumber: o })}>{o} ({tgRows.filter(r => (r.sumber || '(kosong)') === o).length})</button>)}
              </div>
              <div className="tbl-wrap tbl-compact" style={{ maxHeight: 340, overflowY: 'auto' }}><table>
                <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={tampil.length > 0 && nPick === tampil.length} onChange={e => { const n = { ...tgPick }; tampil.forEach(r => { n[r.id] = e.target.checked; }); setTgPick(n); }} /></th><th>Tgl Masuk</th><th>ID</th><th>Nama</th><th>Sumber</th><th>Status</th></tr></thead>
                <tbody>{tampil.map(r => (
                  <tr key={r.id} onClick={() => setTgPick({ ...tgPick, [r.id]: !tgPick[r.id] })} style={{ cursor: 'pointer' }}>
                    <td><input type="checkbox" checked={!!tgPick[r.id]} readOnly /></td>
                    <td data-label="Tgl">{fmtDate(r.tgl)}</td><td data-label="ID">{r.lead_code}</td><td data-label="Nama"><b>{r.nama}</b></td>
                    <td data-label="Sumber">{r.sumber || '—'}</td><td data-label="Status">{r.status}</td></tr>))}</tbody>
              </table></div>
              <div className="form-grid" style={{ marginTop: 10 }}>
                <div className="field"><label>Tandai ke Campaign <span className="req">*</span></label>
                  <select value={tg.campaign} onChange={e => setTg({ ...tg, campaign: e.target.value })}><option value="">— pilih —</option>{camps.map(x => <option key={x.id} value={x.nama}>{x.nama}</option>)}</select></div>
                <div className="field"><label>Kode Kreatif (opsional)</label><input value={tg.konten} onChange={e => setTg({ ...tg, konten: e.target.value })} placeholder="reels-01" /></div>
                <div className="field"><label>&nbsp;</label><button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy || !nPick} onClick={tandaiMassal}>🏷️ Tandai {nPick} Lead</button></div>
              </div>
              <span className="hint">Klik baris untuk mencentang. Centang hanya lead yang JELAS dari campaign itu — yang ragu biarkan kosong. Lead organik/offline (Website, WhatsApp, Referral, Walk In, dll) tidak wajib punya campaign, kecuali aktivitasnya didaftarkan sebagai campaign platform Offline.</span>
            </>);
          })()}
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>📆 Biaya Berulang <span className="hint">(banner, billboard, sewa booth, dll — isi sekali, disebar rata per bulan otomatis)</span></h3>
          <div className="form-grid">
            <div className="field"><label>Campaign <span className="req">*</span></label>
              <select value={am.campaign} onChange={e => setAm({ ...am, campaign: e.target.value })}><option value="">— pilih —</option>{camps.map(x => <option key={x.id} value={x.nama}>{x.nama}</option>)}</select></div>
            <div className="field"><label>Keterangan</label><input value={am.keterangan} onChange={e => setAm({ ...am, keterangan: e.target.value })} placeholder="mis. Billboard 2026 / Banner materi Sep–Nov" /></div>
            <div className="field"><label>Total Biaya (Rp) <span className="req">*</span></label><input type="number" min="0" value={am.total} onChange={e => setAm({ ...am, total: e.target.value })} placeholder="21500000" /></div>
            <div className="field"><label>Mulai Tayang (bulan) <span className="req">*</span></label><input type="month" value={am.mulai} onChange={e => setAm({ ...am, mulai: e.target.value })} /></div>
            <div className="field"><label>Masa Tayang (bulan) <span className="req">*</span></label><input type="number" min="1" max="60" value={am.bulan} onChange={e => setAm({ ...am, bulan: e.target.value })} /></div>
            <div className="field"><label>Per Bulan</label><input readOnly value={Number(am.total) > 0 && Number(am.bulan) > 0 ? fmtRp(Math.round(Number(am.total) / Number(am.bulan))) : '—'} style={{ fontWeight: 700, color: 'var(--green)' }} /></div>
          </div>
          <div className="form-foot"><button className="btn btn-primary" disabled={busy} onClick={() => simpan('amort', { ...am, mulai: am.mulai + '-01' }, null, () => setAm({ ...AM0 }))}>Simpan Biaya Berulang</button></div>
          {(data.amort || []).length > 0 && (
            <div className="tbl-wrap tbl-compact" style={{ marginTop: 10 }}><table>
              <thead><tr><th>Campaign</th><th>Keterangan</th><th className="num">Total</th><th>Mulai</th><th className="num">Masa</th><th className="num">Per Bulan</th><th className="num">Berjalan</th><th>Aksi</th></tr></thead>
              <tbody>{(data.amort || []).map(x => {
                const mulai = (x.mulai instanceof Date ? x.mulai.toISOString() : String(x.mulai)).slice(0, 7);
                const [yy, mm] = mulai.split('-').map(Number); const t = new Date();
                const jalan = Math.min(Number(x.bulan), Math.max(0, (t.getFullYear() - yy) * 12 + (t.getMonth() + 1 - mm) + 1));
                return (<tr key={x.id}>
                  <td data-label="Campaign"><b>{x.campaign}</b></td><td data-label="Ket">{x.keterangan || '—'}</td>
                  <td className="num" data-label="Total">{fmtRp(x.total)}</td><td data-label="Mulai">{mulai}</td>
                  <td className="num" data-label="Masa">{x.bulan} bln</td><td className="num" data-label="Per Bulan">{fmtRp(Math.round(Number(x.total) / Number(x.bulan)))}</td>
                  <td className="num" data-label="Berjalan">{jalan}/{x.bulan} bln</td>
                  <td data-label="Aksi">{data.me?.role !== 'ceo' && <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)' }} onClick={() => hapus('amort', x.id, (x.keterangan || x.campaign))}>Hapus</button>}</td>
                </tr>); })}</tbody>
            </table></div>
          )}
          <span className="hint">Biaya hanya dihitung untuk bulan yang sudah berjalan, dan otomatis masuk ke kolom Spend, CPL, CPQL & report. Jangan input biaya yang sama lagi di Catat Performa Iklan — nanti terhitung dobel.</span>
        </div>

        {!showSpendManual && (
          <div className="card" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="hint">Spend Meta ditarik otomatis, biaya offline lewat Biaya Berulang. Pencatatan manual hanya untuk Google Ads, TikTok & platform lain yang belum tersambung.</span>
            <button className="sort-btn" onClick={() => setShowSpendManual(true)}>➕ Catat Spend Manual (Google / TikTok / lainnya)</button>
          </div>
        )}
        {showSpendManual && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Catat Performa Iklan <span className="hint">{metaApi ? '(spend Meta ditarik otomatis tiap pagi — form ini untuk Google, TikTok & lainnya)' : '(mingguan per campaign/kreatif dari Ads Manager)'}</span></h3>
          <div className="form-grid">
            <div className="field"><label>Tanggal</label><input type="date" {...fa('tgl')} /></div>
            <div className="field"><label>Campaign <span className="req">*</span></label>
              <select {...fa('campaign')}><option value="">— pilih —</option>{camps.filter(x => x.status === 'Aktif' && !(metaApi && String(x.platform || '').startsWith('Meta'))).map(x => <option key={x.id} value={x.nama}>{x.nama}</option>)}</select>
              {a.campaign && (() => { const sa = (data.spendAll || []).find(r => r.campaign === a.campaign); return <span className="hint" style={{ color: 'var(--brass)' }}>{sa ? `Sudah tercatat ${fmtRp(sa.total)} dari ${sa.entri} entri (terakhir ${fmtDate(sa.terakhir)}). Isi spend SEJAK entri terakhir saja, bukan total.` : 'Belum ada entri — isi spend sejak campaign mulai sampai tanggal ini.'}</span>; })()}</div>
            <div className="field"><label>Kreatif (utm_content)</label><input {...fa('kreatif')} placeholder="reels-01" /></div>
            <div className="field"><label>Spend (Rp)</label><input type="number" min="0" {...fa('spend')} /></div>
            <div className="field"><label>Impresi</label><input type="number" min="0" {...fa('impresi')} /></div>
            <div className="field"><label>Reach</label><input type="number" min="0" {...fa('reach')} /></div>
            <div className="field"><label>Klik</label><input type="number" min="0" {...fa('klik')} /></div>
            <div className="field"><label>Hasil (versi platform)</label><input type="number" min="0" {...fa('hasil')} /></div>
          </div>
          <div className="form-foot">
            <button className="btn btn-primary" disabled={busy} onClick={() => simpan('iklan', a, aEdit, () => { setAEdit(null); setA({ ...A0, tgl: todayISO() }); })}>{aEdit ? 'Simpan Perubahan' : 'Simpan Entri'}</button>
            <button className="sort-btn" onClick={() => { setShowSpendManual(false); setAEdit(null); }}>Tutup</button>
            {aEdit && <button className="sort-btn" onClick={() => { setAEdit(null); setA({ ...A0, tgl: todayISO() }); }}>Batal edit</button>}
          </div>
        </div>
        )}

        <div className="two-col">
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Daftar Campaign</h3>
        {gb && (
          <div id="panel-gabung" className="card" style={{ marginBottom: 12, border: '1.5px solid var(--brass)' }}>
            <h3 style={{ marginTop: 0 }}>🔀 Gabungkan Campaign <span className="hint">(untuk campaign yang sama tapi tercatat dengan dua nama)</span></h3>
            <div className="form-grid">
              <div className="field"><label>Campaign yang digabungkan (akan dihapus)</label><input value={gb.dari} readOnly style={{ fontWeight: 700 }} /></div>
              <div className="field"><label>Gabungkan ke <span className="req">*</span></label>
                <select value={gb.ke} onChange={e => setGb({ ...gb, ke: e.target.value })}><option value="">— pilih campaign tujuan —</option>
                  {(data.campaigns || []).filter(c => c.nama !== gb.dari).map(c => <option key={c.id} value={c.nama}>{c.nama}{c.sumber === 'meta-api' ? ' (Meta)' : ''}</option>)}</select></div>
            </div>
            <div className="form-foot">
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy || !gb.ke} onClick={gabungCampaign}>Gabungkan</button>
              <button className="sort-btn" onClick={() => setGb(null)}>Batal</button>
            </div>
            <span className="hint">Tag lead, entri spend manual & biaya berulang dipindahkan ke campaign tujuan. Bila campaign tujuan ditarik otomatis dari Meta, entri spend manual lama otomatis tidak dihitung lagi (tidak dobel).</span>
          </div>
        )}
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Nama</th><th>Platform</th><th>Project</th><th className="num">Budget</th><th className="num">Spend</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>{camps.length ? camps.map(x => (
                <tr key={x.id}>
                  <td data-label="Nama"><b>{x.nama}</b>{x.sumber === 'meta-api' ? <div className="hint">⚡ otomatis dari Meta Ads</div> : null}{x.meta_info ? <div className="hint" style={{ color: /^Belum tersambung/.test(x.meta_info) ? 'var(--red)' : undefined }}>{x.meta_info}</div> : null}</td><td data-label="Platform">{x.platform}</td><td data-label="Project">{x.project || '—'}</td>
                  <td className="num" data-label="Budget">{Number(x.budget) ? fmtRp(x.budget) : '—'}</td>
                  <td className="num" data-label="Spend">{spendMap[x.nama] ? fmtRp(spendMap[x.nama]) : '—'}</td>
                  <td data-label="Status"><span className={'badge ' + (x.status === 'Aktif' ? 'b-warm' : 'b-cold')}>{x.status}</span></td>
                  <td data-label="Aksi"><span style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--brass)' }} onClick={() => { setLk({ id: x.id, project: x.project || fProj || '', mode: String(x.platform || '').startsWith('Meta') ? 'wa' : 'web', noWa: 1, wa: '6281385237865', teks: 'Halo ' + (x.project ? x.project.replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()) : 'Bio District') + ', saya mau info rumahnya', nama: x.nama, url: 'https://', format: 'reels', no: 1, source: ({ 'Meta (FB+IG)': 'meta', Facebook: 'facebook', Instagram: 'instagram', Tiktok: 'tiktok', Google: 'google', Youtube: 'youtube', Website: 'website' })[x.platform] || 'meta', medium: x.platform === 'Website' ? 'referral' : 'cpc' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>🔗 Link</button>
                    <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { setCEdit(x.id); setC({ nama: x.nama, platform: x.platform || 'Meta (FB+IG)', project: x.project || '', tujuan: x.tujuan || 'leads', bulan: bulanIni, extra: '', budget: x.budget || '', status: x.status || 'Aktif', catatan: x.catatan || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                    {data.me && data.me.role === 'manager' && <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { setGb({ dari: x.nama, ke: '' }); setTimeout(() => { const el = document.getElementById('panel-gabung'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50); }}>Gabungkan</button>}
                    {data.me?.role !== 'ceo' && <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)' }} onClick={() => hapus('campaign', x.id, x.nama)}>Hapus</button>}
                  </span></td>
                </tr>)) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada campaign — daftarkan dulu di form atas.</td></tr>}</tbody>
            </table></div>
          </div>
          {(data.perIklan || []).length > 0 && (() => {
            const lk = Object.fromEntries((data.leadKonten || []).map(r => [r.k, r]));
            const fk = Object.fromEntries(Object.entries(data.fit?.byKonten || {}).map(([k, r]) => [k.toLowerCase(), r]));
            const rows = (data.perIklan || []).map(r => {
              const sp = Number(r.spend) || 0, k = String(r.kreatif || '').toLowerCase();
              return { ...r, sp, ctr: r.impresi ? r.klik / r.impresi : null, cph: r.hasil ? sp / r.hasil : null, tpr: r.views3 ? r.thruplay / r.views3 : null,
                lead: lk[k]?.n || 0, l2: lk[k]?.l2 || 0, cocok: fk[k]?.cocok || 0, aktif: r.status === 'ACTIVE' };
            }).filter(r => !iAktif || r.aktif);
            const juara = {};
            const top = (key, syarat, kecil) => { const c = rows.filter(syarat).sort((a, b) => kecil ? a[key] - b[key] : b[key] - a[key])[0]; if (c) juara[key] = c; };
            top('hasil', r => r.hasil > 0); top('cph', r => r.hasil >= 3, true); top('ctr', r => r.impresi >= 1000); top('views3', r => r.views3 > 0); top('tpr', r => r.views3 >= 100); top('cocok', r => r.cocok > 0);
            const LBL = { hasil: 'chat terbanyak', cph: 'biaya/chat termurah', ctr: 'CTR tertinggi', views3: 'views terbanyak', tpr: 'ditonton tuntas terbaik', cocok: 'lead cocok terbanyak' };
            const kol = [['kreatif', 'Iklan'], ['status', 'Status'], ['sp', 'Spend'], ['impresi', 'Impresi'], ['klik', 'Klik'], ['ctr', 'CTR'], ['hasil', 'Hasil (chat)'], ['cph', 'Biaya / hasil'],
              ['views3', 'Views 3 dtk'], ['thruplay', 'ThruPlay'], ['tpr', '% tuntas'], ['lead', 'Lead CRM'], ['l2', 'Berkualitas'], ['cocok', 'Cocok persona']];
            const NUM = new Set(['sp', 'impresi', 'klik', 'ctr', 'hasil', 'cph', 'views3', 'thruplay', 'tpr', 'lead', 'l2', 'cocok']);
            const urut = [...rows].sort((a, b) => { const k = iSort.key, d = iSort.dir === 'desc' ? -1 : 1; const va = a[k] ?? (NUM.has(k) ? -1 : ''), vb = b[k] ?? (NUM.has(k) ? -1 : '');
              return (typeof va === 'string' ? String(va).localeCompare(String(vb)) : va - vb) * d; });
            const rpS = n => n === null || n === undefined ? '—' : fmtRp(Math.round(n));
            const nf = n => Number(n || 0).toLocaleString('id-ID');
            return (
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>📊 Performa per Iklan — Meta Ads <span className="hint">(ikut periode & project · klik judul kolom untuk mengurutkan)</span></h3>
                  <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={iAktif} onChange={e => setIAktif(e.target.checked)} /> hanya iklan yang sedang aktif</label>
                </div>
                {Object.keys(juara).length > 0 && <div className="hint" style={{ margin: '8px 0', lineHeight: 1.7 }}>🏆 {Object.entries(juara).map(([k, r]) => <span key={k} style={{ marginRight: 14 }}><b>{LBL[k]}:</b> {r.kreatif}</span>)}</div>}
                <div className="tbl-wrap tbl-compact"><table>
                  <thead><tr>{kol.map(([k, t]) => <th key={k} className={NUM.has(k) ? 'num' : ''} style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
                    onClick={() => setISort(s0 => ({ key: k, dir: s0.key === k && s0.dir === 'desc' ? 'asc' : 'desc' }))}>{t}{iSort.key === k ? (iSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}</th>)}</tr></thead>
                  <tbody>{urut.map(r => (
                    <tr key={r.campaign + '|' + r.kreatif}>
                      <td data-label="Iklan" style={{ minWidth: 200 }}><b>{r.kreatif || '(tanpa nama)'}</b>{Object.entries(juara).filter(([, j]) => j === r).map(([k]) => <span key={k} title={LBL[k]}> 🏆</span>)}<div className="hint">{r.campaign}</div></td>
                      <td data-label="Status">{r.status ? (() => { const ST = { ACTIVE: ['Tayang', 'b-close'], PAUSED: ['Iklan dijeda', 'b-cold'], CAMPAIGN_PAUSED: ['Campaign dijeda', 'b-cold'], ADSET_PAUSED: ['Ad set dijeda', 'b-cold'],
                        PENDING_REVIEW: ['Ditinjau Meta', 'b-warm'], IN_PROCESS: ['Diproses', 'b-warm'], WITH_ISSUES: ['Bermasalah', 'b-overdue'], DISAPPROVED: ['Ditolak Meta', 'b-overdue'], ARCHIVED: ['Diarsipkan', 'b-cold'], DELETED: ['Dihapus', 'b-cold'] };
                        const [t, c] = ST[r.status] || [r.status.toLowerCase().replace(/_/g, ' '), 'b-cold']; return <span className={'badge ' + c} title={'Status Meta: ' + r.status}>{t}</span>; })() : '—'}</td>
                      <td className="num" data-label="Spend">{rpS(r.sp)}</td>
                      <td className="num" data-label="Impresi">{nf(r.impresi)}</td>
                      <td className="num" data-label="Klik">{nf(r.klik)}</td>
                      <td className="num" data-label="CTR">{r.ctr !== null ? pct(r.ctr) : '—'}</td>
                      <td className="num" data-label="Hasil"><b>{nf(r.hasil)}</b></td>
                      <td className="num" data-label="Biaya/hasil">{rpS(r.cph)}</td>
                      <td className="num" data-label="Views 3 dtk">{r.views3 ? nf(r.views3) : '—'}</td>
                      <td className="num" data-label="ThruPlay">{r.thruplay ? nf(r.thruplay) : '—'}</td>
                      <td className="num" data-label="% tuntas">{r.tpr !== null ? pct(r.tpr) : '—'}</td>
                      <td className="num" data-label="Lead CRM">{r.lead || '—'}</td>
                      <td className="num" data-label="Berkualitas">{r.l2 || '—'}</td>
                      <td className="num" data-label="Cocok persona" style={{ color: r.cocok ? 'var(--green)' : undefined }}><b>{r.cocok || '—'}</b></td>
                    </tr>))}</tbody>
                </table></div>
                <p className="hint" style={{ marginTop: 6 }}>Hasil = percakapan WA / lead versi Meta. Views 3 dtk & ThruPlay hanya untuk iklan video (ThruPlay = ditonton tuntas atau minimal 15 detik). Lead CRM, Berkualitas & Cocok persona dihitung dari lead yang kolom Konten-nya sama dengan nama iklan — pakai kode iklan WA dari panel 🔗 Link agar tercatat otomatis. Juara biaya/hasil minimal 3 hasil, juara CTR minimal 1.000 impresi.</p>
              </div>);
          })()}

          {(data.ads || []).some(x => x.sumber !== 'meta-api') && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Entri Performa Manual {metaApi ? <span className="hint">(data Meta Ads otomatis tidak ditampilkan di sini — lihat kolom Spend di Daftar Campaign)</span> : null}</h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Tanggal</th><th>Campaign</th><th>Kreatif</th><th className="num">Spend</th><th className="num">Klik</th><th className="num">Hasil</th><th>Aksi</th></tr></thead>
              <tbody>{(data.ads || []).filter(x => x.sumber !== 'meta-api').length ? (data.ads || []).filter(x => x.sumber !== 'meta-api').slice(0, 60).map(x => (
                <tr key={x.id}>
                  <td data-label="Tanggal">{fmtDate(x.tgl)}</td><td data-label="Campaign">{x.campaign}{(data.ads || []).some(y => y.sumber === 'meta-api' && String(y.campaign).toLowerCase() === String(x.campaign).toLowerCase()) ? <div className="hint" style={{ color: 'var(--brass)' }}>digantikan data API — tidak dihitung, boleh dihapus</div> : null}</td><td data-label="Kreatif">{x.kreatif || '—'}</td>
                  <td className="num" data-label="Spend">{fmtRp(x.spend)}</td><td className="num" data-label="Klik">{x.klik || 0}</td><td className="num" data-label="Hasil">{x.hasil || 0}</td>
                  <td data-label="Aksi"><span style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { setShowSpendManual(true); setAEdit(x.id); setA({ tgl: String(x.tgl || '').slice(0, 10), campaign: x.campaign || '', kreatif: x.kreatif || '', spend: x.spend || '', impresi: x.impresi || '', reach: x.reach || '', klik: x.klik || '', hasil: x.hasil || '', catatan: x.catatan || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                    {data.me?.role !== 'ceo' && <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)' }} onClick={() => hapus('iklan', x.id, x.campaign + ' ' + fmtDate(x.tgl))}>Hapus</button>}
                  </span></td>
                </tr>)) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada entri performa iklan.</td></tr>}</tbody>
            </table></div>
          </div>
          )}
        </div>
      </>)}

      {tab === 'diagnosa' && (() => {
        const projP = fProj || 'BIO DISTRICT';
        const pr = (data.persona || {})[projP];
        const isMgr = data.me && (data.me.role === 'manager' || data.me.role === 'ceo');
        const baris = obj => Object.entries(obj || {}).map(([k, r]) => ({ k, ...r, dinilai: r.n - r.kurang, pc: (r.n - r.kurang) > 0 ? r.cocok / (r.n - r.kurang) : null })).sort((a, b) => b.n - a.n);
        const simpanPersona = async () => {
          try {
            await api('/api/marcom', { method: 'PATCH', body: JSON.stringify({ jenis: 'persona', project: personaEdit.project, data: personaEdit }) });
            toast('Persona disimpan ✅'); setPersonaEdit(null); await muat();
          } catch (e) { toast(e.message); }
        };
        const warna = { '🟢': 'var(--green)', '🟡': 'var(--brass)', '🔴': 'var(--red)', '⚪': 'var(--muted)' };
        return (<>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>🎯 Persona Target — {projP}</h3>
              {isMgr && !personaEdit && <button className="sort-btn" onClick={() => setPersonaEdit({ project: projP, areaInti: (pr?.areaInti || []).join(', '), areaLuas: (pr?.areaLuas || []).join(', '), hargaMin: pr?.hargaMin || '', usiaMin: pr?.usiaMin || '', usiaMax: pr?.usiaMax || '', tujuan: pr?.tujuan || 'ditempati', catatan: pr?.catatan || '' })}>{pr ? 'Edit persona' : 'Buat persona'}</button>}
            </div>
            {!personaEdit && (pr ? (
              <div className="hint" style={{ marginTop: 8, lineHeight: 1.7 }}>
                <b>Area inti:</b> {pr.areaInti.join(', ')} · <b>Perluasan:</b> {pr.areaLuas.join(', ') || '—'}<br />
                <b>Kemampuan beli:</b> ≥ {fmtRp(pr.hargaMin)} · <b>Usia:</b> {pr.usiaMin}–{pr.usiaMax} tahun · <b>Tujuan:</b> {pr.tujuan}<br />
                <b>Skor kecocokan (0–100):</b> domisili inti 30 / perluasan 15 · budget ≥ harga min 30 (≥80%: 15) · cara bayar terisi 15 · usia dalam rentang 15 (±5 th: 7) · tujuan ditempati 10 / investasi 7. ≥70 cocok · 40–69 sebagian · &lt;40 tidak · &lt;3 kolom terisi = data kurang.
                {pr.catatan ? <><br /><i>{pr.catatan}</i></> : null}
              </div>) : <p className="hint">Belum ada persona untuk {projP}. Lead project ini belum dinilai kecocokannya.</p>)}
            {personaEdit && (<>
              <div className="form-grid" style={{ marginTop: 10 }}>
                <div className="field" style={{ gridColumn: '1/-1' }}><label>Area inti (pisahkan dengan koma)</label><input value={personaEdit.areaInti} onChange={e => setPersonaEdit({ ...personaEdit, areaInti: e.target.value })} /></div>
                <div className="field" style={{ gridColumn: '1/-1' }}><label>Area perluasan</label><input value={personaEdit.areaLuas} onChange={e => setPersonaEdit({ ...personaEdit, areaLuas: e.target.value })} /></div>
                <div className="field"><label>Kemampuan beli minimal (Rp)</label><input type="number" value={personaEdit.hargaMin} onChange={e => setPersonaEdit({ ...personaEdit, hargaMin: e.target.value })} /></div>
                <div className="field"><label>Usia dari</label><input type="number" value={personaEdit.usiaMin} onChange={e => setPersonaEdit({ ...personaEdit, usiaMin: e.target.value })} /></div>
                <div className="field"><label>Usia sampai</label><input type="number" value={personaEdit.usiaMax} onChange={e => setPersonaEdit({ ...personaEdit, usiaMax: e.target.value })} /></div>
                <div className="field"><label>Tujuan utama</label><input value={personaEdit.tujuan} onChange={e => setPersonaEdit({ ...personaEdit, tujuan: e.target.value })} /></div>
                <div className="field" style={{ gridColumn: '1/-1' }}><label>Catatan</label><input value={personaEdit.catatan} onChange={e => setPersonaEdit({ ...personaEdit, catatan: e.target.value })} /></div>
              </div>
              <div className="form-foot"><button className="btn btn-primary" style={{ width: 'auto' }} onClick={simpanPersona}>Simpan Persona</button><button className="sort-btn" onClick={() => setPersonaEdit(null)}>Batal</button></div>
            </>)}
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>📋 Rapor Marketing <span className="hint">(ikut filter project & periode · 🟢 bagus · 🟡 cukup · 🔴 perlu perbaikan · ⚪ data belum cukup)</span></h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Lapisan</th><th>Indikator</th><th className="num">Hasil</th><th>Patokan</th><th>Vonis</th><th>Saran</th></tr></thead>
              <tbody>{rapor.map((r, i) => (
                <tr key={i}>
                  <td data-label="Lapisan" className="hint">{i === 0 || rapor[i - 1].lapis !== r.lapis ? <b>{r.lapis}</b> : ''}</td>
                  <td data-label="Indikator">{r.indikator}</td>
                  <td className="num" data-label="Hasil"><b style={{ color: warna[r.vonis] }}>{r.txt}</b></td>
                  <td data-label="Patokan" className="hint">{r.patokan}</td>
                  <td data-label="Vonis" style={{ fontSize: 18 }}>{r.vonis}</td>
                  <td data-label="Saran" className="hint">{r.vonis === '🟢' ? 'Pertahankan.' : r.vonis === '⚪' ? 'Data belum cukup untuk dinilai.' : r.saran}</td>
                </tr>))}</tbody>
            </table></div>
          </div>

          <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--brass)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>🧭 Brief Bulan Depan <span className="hint">(disusun otomatis dari data yang terbukti membawa lead cocok persona)</span></h3>
              <button className="sort-btn" onClick={async () => {
                const t = 'BRIEF KONTEN & IKLAN — ' + projP + '\n\nAUDIENS\n' + brief.audiens.map(x => '• ' + x).join('\n') + '\n\nKONTEN\n' + brief.konten.map(x => '• ' + x).join('\n') + '\n\nIKLAN\n' + brief.iklan.map(x => '• ' + x).join('\n') + '\n\nTIM\n' + brief.tim.map(x => '• ' + x).join('\n');
                try { await navigator.clipboard.writeText(t); toast('Brief tersalin 📋'); } catch { window.prompt('Salin manual:', t); }
              }}>📋 Salin Brief</button>
            </div>
            {[['🎯 Audiens', brief.audiens], ['🎬 Konten', brief.konten], ['📣 Iklan', brief.iklan], ['👥 Tim marcom & sales', brief.tim]].map(([j, xs]) => xs.length ? (
              <div key={j} style={{ marginTop: 10 }}><b>{j}</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20, lineHeight: 1.55 }}>{xs.map((x, i) => <li key={i}>{x}</li>)}</ul></div>) : null)}
          </div>

          {data.igDemo && (() => {
            const totU = (data.igDemo.usia || []).reduce((a, r) => a + (r.nilai || 0), 0);
            const totG = (data.igDemo.gender || []).reduce((a, r) => a + (r.nilai || 0), 0);
            const totK = (data.igDemo.kota || []).reduce((a, r) => a + (r.nilai || 0), 0);
            return (
              <div className="card" style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>👥 Audiens Follower Instagram <span className="hint">(per {fmtDate(data.igDemo.tgl)} · dibandingkan dengan persona {projP})</span></h3>
                <div className="grid two-col">
                  <div><h4 style={{ margin: '4px 0' }}>Usia</h4>
                    {(data.igDemo.usia || []).sort((a, b) => String(a.kunci).localeCompare(String(b.kunci))).map(r => (
                      <div key={r.kunci} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0' }}>
                        <span style={{ width: 50 }}>{r.kunci}</span>
                        <div style={{ flex: 1, background: 'var(--line)', borderRadius: 4, height: 10 }}><div style={{ width: (totU ? r.nilai / totU * 100 : 0) + '%', height: 10, borderRadius: 4, background: dalamUsiaPersona(String(r.kunci), pr) ? 'var(--green)' : 'var(--muted)' }} /></div>
                        <span className="hint" style={{ width: 46, textAlign: 'right' }}>{totU ? pct(r.nilai / totU) : '—'}</span></div>))}
                    <span className="hint">Hijau = dalam rentang usia persona.</span></div>
                  <div><h4 style={{ margin: '4px 0' }}>Gender & kota teratas</h4>
                    <div className="hint">{(data.igDemo.gender || []).map(r => `${r.kunci === 'F' ? 'Wanita' : r.kunci === 'M' ? 'Pria' : r.kunci} ${totG ? pct(r.nilai / totG) : ''}`).join(' · ')}</div>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>{(data.igDemo.kota || []).slice(0, 8).map(r => <li key={r.kunci} className="hint">{r.kunci} — {totK ? pct(r.nilai / totK) : r.nilai}</li>)}</ul></div>
                </div>
              </div>);
          })()}

          {(() => {
            const prA = pr;
            const usia = ringkasDim(data.breakdown, 'usia_gender', r => r.k1);
            const gender = ringkasDim(data.breakdown, 'usia_gender', r => r.k2 === 'male' ? 'Pria' : r.k2 === 'female' ? 'Wanita' : 'Tidak diketahui');
            const wil = ringkasDim(data.breakdown, 'wilayah', r => r.k1);
            const pen = ringkasDim(data.breakdown, 'penempatan', r => r.k1 + (r.k2 ? ' · ' + r.k2.replace(/_/g, ' ') : ''));
            const ul = Object.fromEntries((data.usiaLead || []).map(x => [x.k, x]));
            const rpS = n => n === null || n === undefined ? '—' : fmtRp(Math.round(n));
            const tabel = (judul, rows, kolomExtra, flag) => rows.length ? (
              <div style={{ marginBottom: 12 }}>
                <h4 style={{ margin: '6px 0' }}>{judul}</h4>
                <div className="tbl-wrap tbl-compact"><table>
                  <thead><tr><th>Kelompok</th><th className="num">Spend</th><th className="num">% spend</th><th className="num">CTR</th><th className="num">Hasil (chat/lead)</th><th className="num">Biaya / hasil</th>{kolomExtra ? kolomExtra.head : null}<th>Catatan</th></tr></thead>
                  <tbody>{rows.slice(0, 12).map(x => { const f = flag ? flag(x) : null; return (
                    <tr key={x.k}><td><b>{x.k}</b></td><td className="num">{rpS(x.spend)}</td><td className="num">{pct(x.share)}</td><td className="num">{x.ctr !== null ? pct(x.ctr) : '—'}</td><td className="num">{x.hasil}</td><td className="num">{rpS(x.cph)}</td>
                      {kolomExtra ? kolomExtra.cell(x) : null}<td className="hint" style={{ color: f && f.buruk ? 'var(--red)' : undefined }}>{f ? f.teks : ''}</td></tr>); })}</tbody>
                </table></div>
              </div>) : null;
            const ada = usia.length || wil.length || pen.length || (data.targeting || []).length;
            return (
              <div className="card" style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>🔎 Audit Iklan Meta <span className="hint">(ditarik otomatis tiap pagi · dibandingkan dengan persona {projP})</span></h3>
                {!ada && <p className="hint">Belum ada data rincian iklan. Data muncul setelah tarikan Meta Ads berikutnya (⟳ Tarik Data Sekarang di tab Website & SEO).</p>}
                {tabel('Per usia (dibandingkan dengan usia lead di CRM)', USIA_META.map(k => usia.find(x => x.k === k)).filter(Boolean),
                  { head: <><th className="num">Lead CRM</th><th className="num">Lead cocok</th></>, cell: x => <><td className="num">{ul[x.k]?.n || 0}</td><td className="num" style={{ color: 'var(--green)' }}>{ul[x.k]?.cocok || 0}</td></> },
                  x => dalamUsiaPersona(x.k, prA) ? { teks: 'dalam rentang persona' } : { teks: x.share >= 0.1 ? 'di luar persona — pertimbangkan dikeluarkan' : 'di luar persona', buruk: x.share >= 0.1 })}
                {tabel('Per gender', gender, null, null)}
                {tabel('Per wilayah', wil, null, x => wilayahTarget(x.k) ? { teks: 'area target' } : { teks: x.share >= 0.05 ? 'di luar area target — persempit lokasi' : 'di luar area target', buruk: x.share >= 0.05 })}
                {tabel('Per penempatan', pen, null, x => /audience_network/.test(x.k) ? { teks: 'aplikasi pihak ketiga — matikan', buruk: true } : null)}
                {(data.targeting || []).length ? (
                  <div>
                    <h4 style={{ margin: '6px 0' }}>Targeting yang terpasang per ad set</h4>
                    <div className="tbl-wrap tbl-compact"><table>
                      <thead><tr><th>Campaign · Ad set</th><th>Status</th><th>Usia</th><th>Gender</th><th>Lokasi</th><th>Minat</th><th>Penempatan</th><th>Temuan audit</th></tr></thead>
                      <tbody>{data.targeting.map(t => {
                        const temuan = [];
                        if (prA && t.usia_min && t.usia_min < prA.usiaMin - 5) temuan.push(`usia mulai ${t.usia_min}, jauh di bawah persona ${prA.usiaMin}`);
                        if (prA && t.usia_max && t.usia_max > prA.usiaMax + 15) temuan.push(`usia sampai ${t.usia_max}`);
                        if (/indonesia|^id$/i.test(t.lokasi || '') || /\bID\b/.test(t.lokasi || '')) temuan.push('lokasi seluruh Indonesia — terlalu luas');
                        if (/audience_network/.test(t.penempatan || '')) temuan.push('Audience Network aktif');
                        if (t.advantage) temuan.push('Advantage+ audience: usia & gender hanya saran untuk Meta');
                        return (
                          <tr key={t.adset_id}><td><b>{t.campaign}</b><div className="hint">{t.nama}</div></td><td className="hint">{t.status}</td><td>{t.usia_min || 18}–{t.usia_max || 65}</td><td className="hint">{t.gender}</td>
                            <td className="hint" style={{ maxWidth: 220 }}>{t.lokasi || '—'}</td><td className="hint" style={{ maxWidth: 200 }}>{t.minat || 'tanpa minat khusus'}</td><td className="hint">{t.penempatan}</td>
                            <td className="hint" style={{ color: temuan.length ? 'var(--red)' : 'var(--green)' }}>{temuan.length ? temuan.join(' · ') : 'sesuai persona'}</td></tr>); })}</tbody>
                    </table></div>
                  </div>) : null}
                <p className="hint" style={{ marginTop: 6 }}>Wilayah dari Meta hanya sampai tingkat provinsi, jadi Tangerang dan Serpong terbaca sebagai Banten. Hasil = percakapan WA atau lead versi Meta; bandingkan dengan kolom Lead CRM untuk melihat yang benar-benar tercatat dan cocok persona.</p>
              </div>);
          })()}

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Kualitas Lead terhadap Persona <span className="hint">(lead masuk pada periode · % cocok dihitung dari lead yang datanya cukup)</span></h3>
            {[['Per sumber lead', baris(data.fit?.bySumber), false], ['Per campaign', baris(data.fit?.byCampaign), true], ['Per kreatif / kode iklan', baris(data.fit?.byKonten), false]].map(([judul, rows, pakaiSpend]) => rows.length ? (
              <div key={judul} style={{ marginBottom: 12 }}>
                <h4 style={{ margin: '6px 0' }}>{judul}</h4>
                <div className="tbl-wrap tbl-compact"><table>
                  <thead><tr><th>Asal</th><th className="num">Lead</th><th className="num">Cocok</th><th className="num">Sebagian</th><th className="num">Tidak</th><th className="num">Data kurang</th><th className="num">% cocok</th>{pakaiSpend ? <th className="num">Biaya per lead cocok</th> : null}</tr></thead>
                  <tbody>{rows.map(r => (
                    <tr key={r.k}><td data-label="Asal"><b>{r.k}</b></td><td className="num">{r.n}</td><td className="num" style={{ color: 'var(--green)' }}><b>{r.cocok}</b></td><td className="num">{r.sebagian}</td><td className="num" style={{ color: r.tidak ? 'var(--red)' : undefined }}>{r.tidak}</td><td className="num hint">{r.kurang}</td>
                      <td className="num"><b>{r.pc !== null ? pct(r.pc) : '—'}</b></td>
                      {pakaiSpend ? <td className="num">{spendMap[r.k] ? (r.cocok ? fmtRp(Math.round(spendMap[r.k] / r.cocok)) : <span style={{ color: 'var(--red)' }}>{fmtRp(spendMap[r.k])} · 0 cocok</span>) : '—'}</td> : null}</tr>))}</tbody>
                </table></div>
              </div>) : null)}
            {!(data.fit?.total?.n) && <p className="hint">Belum ada lead dengan persona pada periode ini.</p>}
          </div>
        </>);
      })()}

      {tab === 'web' && (<>
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Website & SEO <span className="hint">(otomatis dari GA4, Search Console & Instagram — cron harian 05.30 WIB)</span></h3>
            <button className="btn btn-primary" style={{ width: 'auto' }} disabled={narik} onClick={tarikSekarang}>{narik ? `Menarik ${typeof narik === 'string' ? narik : 'data'}…` : '⟳ Tarik Data Sekarang'}</button>
          </div>
          {(!data.ga4 || !data.ga4.length) && (!data.gsc || !data.gsc.length) && (
            <p className="hint" style={{ marginBottom: 0 }}>Belum ada data. Pastikan environment variable Google (GOOGLE_SA_EMAIL, GOOGLE_SA_KEY, GA4_PROPERTY_ID, GSC_SITE_URL) sudah diisi di Vercel & /api/setup sudah dijalankan, lalu klik Tarik Data Sekarang.</p>
          )}
        </div>
        <div className="two-col">
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Trafik Website per Sumber (GA4) <span className="hint">(website biodistrictofficial.com — tidak mengikuti filter project)</span></h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Source / Medium</th><th className="num">Sessions</th><th className="num">Users</th><th className="num">Key Events</th></tr></thead>
              <tbody>{(data.ga4 || []).length ? (data.ga4 || []).map(r => (
                <tr key={r.source_medium} style={/pangle/i.test(r.source_medium) ? { opacity: .6 } : undefined}><td data-label="Sumber"><b>{r.source_medium}</b>{/pangle/i.test(r.source_medium) ? <div className="hint" style={{ color: 'var(--red)' }}>⚠ iklan TikTok di aplikasi pihak ketiga — tidak dihitung sebagai minat</div> : null}{r.source_medium === '(data not available)' ? <div className="hint">kunjungan 1–2 hari terakhir yang masih diproses GA4 — terbagi ke sumber aslinya setelah tarikan berikutnya</div> : null}{r.source_medium === '(not set)' ? <div className="hint" style={{ color: 'var(--brass)' }}>sumber tidak terbaca GA4 — wajarnya hanya beberapa persen; bila besar, cek tag GA4 dobel di website</div> : null}</td>
                  <td className="num" data-label="Sessions">{Number(r.sessions).toLocaleString('id-ID')}</td>
                  <td className="num" data-label="Users">{Number(r.users).toLocaleString('id-ID')}</td>
                  <td className="num" data-label="Key Events"><b>{r.key_events}</b></td></tr>))
                : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada data GA4.</td></tr>}</tbody>
            </table></div>
            <span className="hint">Key Events = event penting yang disetel di GA4 (klik WA, submit form, klik telepon).</span>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Kata Kunci Pencarian (Search Console)</h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Query</th><th className="num">Klik</th><th className="num">Impresi</th><th className="num">Posisi</th></tr></thead>
              <tbody>{(data.gsc || []).length ? (data.gsc || []).map(r => (
                <tr key={r.query}><td data-label="Query"><b>{r.query}</b></td>
                  <td className="num" data-label="Klik"><b>{r.clicks}</b></td>
                  <td className="num" data-label="Impresi">{Number(r.impressions).toLocaleString('id-ID')}</td>
                  <td className="num" data-label="Posisi">{r.position}</td></tr>))
                : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada data Search Console (datanya terlambat ±2 hari dari Google).</td></tr>}</tbody>
            </table></div>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Riwayat Tarikan Data</h3>
          <div className="tbl-wrap tbl-compact"><table>
            <thead><tr><th>Waktu</th><th>Sumber</th><th>Status</th><th className="num">Baris</th><th>Keterangan</th></tr></thead>
            <tbody>{(data.synclog || []).length ? (data.synclog || []).map(r => (
              <tr key={r.id}><td data-label="Waktu">{new Date(r.waktu).toLocaleString('id-ID')}</td>
                <td data-label="Sumber">{r.sumber}</td>
                <td data-label="Status"><span className={'badge ' + (r.status === 'sukses' ? 'b-warm' : r.status === 'gagal' ? 'b-hot' : 'b-cold')}>{r.status}</span></td>
                <td className="num" data-label="Baris">{r.baris}</td>
                <td data-label="Ket" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.pesan}</td></tr>))
              : <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum pernah menarik data.</td></tr>}</tbody>
          </table></div>
          <span className="hint">Instagram ikut ditarik di sini (hasilnya masuk ke tab Konten). Konektor Meta Ads, Google Ads & TikTok aktif otomatis begitu token masing-masing terpasang di Vercel.</span>
        </div>
      </>)}

      {tab === 'tim' && (<>
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Respon Lead Setelah Dioper ke Sales <span className="hint">(membalas = sales menandai "lead membalas" atau status lead naik sesudah serah terima)</span></h3>
          <div className="tbl-wrap tbl-compact"><table>
            <thead><tr><th>Sales</th><th className="num">Lead Dioper</th><th className="num">Masih Membalas</th><th className="num">Rasio</th></tr></thead>
            <tbody>{(data.handoff || []).length ? (data.handoff || []).map(r => (
              <tr key={r.sales}><td data-label="Sales"><b>{r.sales}</b></td>
                <td className="num" data-label="Dioper">{r.dioper}</td>
                <td className="num" data-label="Membalas">{r.membalas}</td>
                <td className="num" data-label="Rasio"><b style={{ color: r.dioper && r.membalas / r.dioper < 0.5 ? 'var(--red)' : 'var(--green)' }}>{r.dioper ? Math.round(r.membalas / r.dioper * 100) + '%' : '—'}</b></td></tr>))
              : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18 }}>Belum ada lead yang dioper pada periode ini.</td></tr>}</tbody>
          </table></div>
          <span className="hint">Kolom "Lead membalas?" di form follow up sales baru tersedia sejak pembaruan ini, jadi angka periode sebelumnya hanya dihitung dari kenaikan status lead.</span>
        </div>
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
