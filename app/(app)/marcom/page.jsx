'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, fmtDate, todayISO } from '@/components/util';

const PLATFORM = ['Instagram', 'Facebook', 'Tiktok', 'Google', 'Youtube', 'Website', 'Lainnya'];
const FORMAT = ['Reels / Short Video', 'Carousel', 'Single Post', 'Story', 'Video Panjang', 'Live', 'Search Ads', 'Display / Banner', 'Lainnya'];
const TUJUAN_C = ['leads', 'awareness', 'promo', 'traffic', 'event'];
const K0 = { tgl: todayISO(), platform: 'Instagram', project: '', format: 'Reels / Short Video', topik: '', hook: '', jam: '', durasi: '', link: '' };
const BULAN_ID = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agt', 'sep', 'okt', 'nov', 'des'];
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
  const [periode, setPeriode] = useState('bulan'); // bulan | semua | custom
  const [d1, setD1] = useState(''); const [d2, setD2] = useState('');
  const [k, setK] = useState(K0); const [kEdit, setKEdit] = useState(null);
  const [c, setC] = useState(C0); const [cEdit, setCEdit] = useState(null);
  const [m, setM] = useState(M0);
  const [a, setA] = useState(A0); const [aEdit, setAEdit] = useState(null);
  const [lk, setLk] = useState(null);
  const AM0 = { campaign: '', keterangan: '', total: '', mulai: todayISO().slice(0, 7), bulan: '3' };
  const [am, setAm] = useState(AM0);
  const [tg, setTg] = useState({ d1: '', d2: '', sumber: '', campaign: '', konten: '' });
  const [tgRows, setTgRows] = useState(null);
  const [tgPick, setTgPick] = useState({});

  const rentang = useMemo(() => {
    if (periode === 'bulan') { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth(), 1).toISOString().slice(0, 10), todayISO()]; }
    if (periode === 'custom') return [d1 || '', d2 || ''];
    return ['', ''];
  }, [periode, d1, d2]);

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
    try {
      const r = await api('/api/mi-sync');
      const ringkas = (r.hasil || []).map(h => `${h.sumber}: ${h.status} (${h.baris} baris)`).join(' · ');
      toast(ringkas || 'Selesai');
      await muat();
    } catch (e) { toast(/504/.test(e.message) ? 'Tarikan melewati batas waktu server — data sebagian mungkin sudah tersimpan, klik Tarik lagi.' : e.message); await muat(); } finally { setNarik(false); }
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
    if (totSpend > 0) R.ringkas.push(`Belanja iklan ${rp(totSpend)} — CPL ${per(totSpend, F.l0)}, CPQL ${per(totSpend, F.l2)}, biaya per Booking ${per(totSpend, F.l3)}.`);
    const sumber = (data.bySumber || []).filter(r => r.kunci !== '(tanpa data)' && r.l0 > 0);
    const topVol = [...sumber].sort((a, b) => b.l0 - a.l0)[0];
    const topKual = [...sumber].filter(r => r.l0 >= 3).sort((a, b) => (b.l2 / b.l0) - (a.l2 / a.l0))[0];
    if (topVol) R.ringkas.push(`Sumber lead terbanyak: ${topVol.kunci} (${topVol.l0} lead).` + (topKual && topKual.kunci !== topVol.kunci ? ` Kualitas terbaik: ${topKual.kunci} (${pc(topKual.l2 / topKual.l0)} jadi berkualitas).` : ''));
    if ((data.contents || []).length) {
      const fBest = polaFormat.find(r => r.er !== null);
      R.ringkas.push(`${data.contents.length} konten tercatat` + (fBest ? `; format dengan engagement tertinggi: ${fBest.format} (ER ${pct(fBest.er)}).` : '.'));
    }
    const webOk = !fProj || /bio/i.test(fProj);
    const ga4 = data.ga4 || [], gsc = data.gsc || [];
    if (webOk && ga4.length) {
      const ses = ga4.reduce((a, r) => a + Number(r.sessions || 0), 0);
      const kev = ga4.reduce((a, r) => a + Number(r.key_events || 0), 0);
      R.ringkas.push(`Website: ${ses.toLocaleString('id-ID')} sesi, terbanyak dari ${ga4[0].source_medium}; ${kev} key event (klik WA).`);
    }
    if (audDomisili.length && audDomisili[0].nama !== '(kosong)') R.ringkas.push(`Domisili lead berkualitas terbanyak: ${audDomisili.slice(0, 3).filter(d => d.nama !== '(kosong)').map(d => d.nama + ' (' + d.l2 + ')').join(', ')}.`);
    if (sedikit && F.l0 > 0) R.ringkas.push('⚠ Data masih sedikit (< 20 lead) — anggap kesimpulan di bawah sebagai sinyal awal, belum pola tetap.');

    // ---------- YANG HARUS DIPERBAIKI ----------
    const camp = data.byCampaign || [];
    const tanpa = camp.find(r => r.kunci === '(tanpa data)');
    const tc = data.tanpaCamp || [];
    const iklanTanpa = tc.filter(r => /ads/i.test(r.sumber));
    const nIklanTanpa = iklanTanpa.reduce((a, r) => a + r.n, 0);
    if (nIklanTanpa > 0) R.perbaiki.push(`${nIklanTanpa} lead dari iklan berbayar (${iklanTanpa.map(r => r.sumber + ' ' + r.n).join(', ')}) belum punya campaign — biaya iklannya tidak tersambung ke hasil. Tandai lewat Tandai Lead Massal di tab Iklan (daftarkan campaign-nya dulu bila belum ada).`);
    void tanpa;
    camp.filter(r => r.kunci !== '(tanpa data)' && (spendMap[r.kunci] || 0) > 0 && r.l2 === 0 && r.l0 >= 1).forEach(r => R.perbaiki.push(`Campaign ${r.kunci} sudah menghabiskan ${rp(spendMap[r.kunci])} tapi belum menghasilkan satu pun lead berkualitas — evaluasi audiens & kreatifnya, atau hentikan.`));
    Object.entries(spendMap).filter(([k, v]) => v > 0 && k !== '(tanpa data)' && !camp.find(r => r.kunci === k)).forEach(([k, v]) => R.perbaiki.push(`Campaign ${k} berbelanja ${rp(v)} tapi tidak ada satu pun lead yang tercatat dengannya — cek apakah link iklannya sudah pakai UTM dari tombol 🔗 Link.`));
    (data.campaigns || []).filter(c => c.status === 'Aktif' && !(spendMap[c.nama] > 0)).slice(0, 3).forEach(c => R.perbaiki.push(`Campaign aktif ${c.nama} belum punya entri spend pada periode ini — catat performanya di tab Iklan agar CPQL bisa dihitung.`));
    sumber.filter(r => r.l0 >= 5 && r.l2 / r.l0 < 0.1).forEach(r => R.perbaiki.push(`Sumber ${r.kunci}: ${r.l0} lead tapi hanya ${r.l2} berkualitas (${pc(r.l2 / r.l0)}) — volume tinggi, kualitas rendah. Perketat targeting/kualifikasi di sumber ini.`));
    if (F.l0 >= 5 && F.l1 / F.l0 < 0.7) R.perbaiki.push(`Hanya ${pc(F.l1 / F.l0)} lead yang sudah di-follow up — ${F.l0 - F.l1} lead belum disentuh sama sekali. Lead yang dibiarkan cepat dingin; koordinasikan kecepatan respon dengan tim sales.`);
    if (F.l2 >= 3 && F.l3 === 0) R.perbaiki.push(`${F.l2} lead berkualitas belum ada yang Booking — dorong site visit & penawaran khusus bersama sales.`);
    const kontenTanpaAngka = (data.contents || []).filter(x => !Number(x.reach)).length;
    if (kontenTanpaAngka) R.perbaiki.push(`${kontenTanpaAngka} konten belum di-update angka performanya — pola konten yang menang belum bisa dibaca utuh. Update mingguan di tab Konten.`);
    const kontenTanpaAtribut = (data.contents || []).filter(x => !x.topik || !x.jam).length;
    if (kontenTanpaAtribut) R.perbaiki.push(`${kontenTanpaAtribut} konten tanpa topik/jam tayang — atribut ini bahan analisa "algoritma", lengkapi lewat Edit.`);
    const kosongDom = audDomisili.find(d => d.nama === '(kosong)');
    if (kosongDom && kosongDom.l2 >= 2) R.perbaiki.push(`${kosongDom.l2} lead berkualitas tanpa domisili — isi domisili saat input agar targeting wilayah akurat.`);
    if (webOk && ga4.length && ga4.reduce((a, r) => a + Number(r.key_events || 0), 0) === 0) R.perbaiki.push('Key event website (klik WA) masih 0 — pastikan event click sudah ditandai sebagai key event di GA4, dan cek ulang dalam beberapa hari.');
    if (webOk && !ga4.length) R.perbaiki.push('Data website belum masuk — klik Tarik Data Sekarang di tab Website & SEO atau cek koneksi GA4.');
    tim.filter(u => u.active && u.konten_bln === 0).forEach(u => R.perbaiki.push(`${u.name} belum mencatat konten bulan ini — pastikan tiap konten tayang tercatat agar output tim terukur.`));

    // ---------- SARAN STRATEGI BULAN DEPAN ----------
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
    if (fBest) R.saran.push(`Produksi konten: perbanyak format ${fBest.format}${jBest ? `, tayangkan di slot ${jBest.jam}` : ''} — kombinasi dengan engagement terbaik sejauh ini.`);
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
  }, [data, totFunnel, totSpend, spendMap, polaFormat, polaJam, audDomisili, audTujuan, tim, fProj]); // eslint-disable-line

  async function salinResume() {
    if (!resume) return;
    const label = (fProj || 'Semua Project') + ' · ' + (periode === 'bulan' ? 'Bulan Ini' : periode === 'semua' ? 'Semua Periode' : (rentang[0] + ' s.d. ' + rentang[1]));
    const blok = (judul, arr) => judul + '\n' + arr.map(x => '• ' + x).join('\n');
    const teks = 'RESUME ANALISA MARKETING — ' + label + '\n\n' + blok('RINGKASAN', resume.ringkas) + '\n\n' + blok('YANG HARUS DIPERBAIKI', resume.perbaiki.length ? resume.perbaiki : ['Tidak ada temuan kritis.']) + '\n\n' + blok('SARAN STRATEGI BULAN DEPAN', resume.saran);
    try { await navigator.clipboard.writeText(teks); toast('Resume tersalin 📋'); } catch { window.prompt('Salin manual:', teks); }
  }

  if (!data) return <div className="loading">Memuat…</div>;
  const camps = (data.campaigns || []).filter(x => !fProj || x.project === fProj || !x.project);

  return (
    <>
      <div className="page-head"><div><h1>Analisa Marcom</h1>
        <div className="sub">Konten & iklan tim marcom vs hasil di CRM — L0 lead masuk · L1 tersentuh FU · L2 berkualitas (Warm/Hot/Site Visit+) · L3 Booking</div></div>
        <div className="stamp">Spend: <b>{fmtRp(totSpend)}</b></div></div>

      <div className="form-tabs" style={{ marginBottom: 10 }}>
        {[['insight', '1 · Insight'], ['konten', '2 · Konten'], ['iklan', '3 · Iklan'], ['tim', '4 · Output Tim'], ['web', '5 · Website & SEO']].map(([key, t]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{t}</button>))}
      </div>

      <div className="fu-toolbar" style={{ marginBottom: 8 }}>
        <button className={'sort-btn' + (!fProj ? ' active' : '')} onClick={() => setFProj('')}>Semua Project</button>
        {(set.project || []).map(p => <button key={p} className={'sort-btn' + (fProj === p ? ' active' : '')} onClick={() => setFProj(p)}>{p}</button>)}
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
              <ul style={{ margin: '4px 0 10px', paddingLeft: 20, lineHeight: 1.55 }}>{resume.perbaiki.length ? resume.perbaiki.map((x, i) => <li key={i}>{x}</li>) : <li>Tidak ada temuan kritis — pertahankan disiplin input.</li>}</ul>
              <b style={{ color: 'var(--brass)' }}>Saran Strategi Bulan Depan</b>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20, lineHeight: 1.55 }}>{resume.saran.map((x, i) => <li key={i}>{x}</li>)}</ul>
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
          <h3 style={{ marginTop: 0 }}>Update Angka Performa <span className="hint">(seminggu sekali — pilih konten, angka terakhir otomatis terisi; ubah yang berubah saja)</span></h3>
          <div className="form-grid">
            <div className="field"><label>Konten <span className="req">*</span></label>
              <select value={m.content_id} onChange={e => isiAngka(e.target.value)}><option value="">— pilih konten —</option>
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
                <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { isiAngka(x.id); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('Angka terakhir sudah terisi — ubah yang berubah saja, lalu Simpan Angka'); }}>Angka</button>
                <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)' }} onClick={() => hapus('konten', x.id, x.topik || x.format)}>Hapus</button>
              </span></td>
            </tr>)) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada konten tercatat pada periode ini.</td></tr>}</tbody>
        </table></div>
      </>)}

      {tab === 'iklan' && (<>
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{cEdit ? 'Edit Campaign' : 'Daftarkan Campaign'} <span className="hint">(nama HARUS sama dengan utm_campaign & nama di platform iklan)</span></h3>
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

        {lk && (() => { const kode = lk.format + '-' + String(lk.no || 1).padStart(2, '0'); const sep = (lk.url || '').includes('?') ? '&' : '?'; const link = (lk.url || '') + sep + 'utm_source=' + lk.source + '&utm_medium=' + lk.medium + '&utm_campaign=' + lk.nama + '&utm_content=' + kode; const salin = async (teks, apa) => { try { await navigator.clipboard.writeText(teks); toast(apa + ' tersalin 📋'); } catch { window.prompt('Salin manual:', teks); } }; return (
          <div className="card" style={{ marginBottom: 12, border: '1.5px solid var(--brass)' }}>
            <h3 style={{ marginTop: 0 }}>🔗 Buat Link — <span style={{ fontFamily: 'monospace' }}>{lk.nama}</span></h3>
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
            <span className="hint">Nama ad di Ads Manager = kode kreatif ({kode}). Nomor naik untuk tiap kreatif baru di campaign yang sama.</span>
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
                  <td data-label="Aksi"><button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--red)' }} onClick={() => hapus('amort', x.id, (x.keterangan || x.campaign))}>Hapus</button></td>
                </tr>); })}</tbody>
            </table></div>
          )}
          <span className="hint">Biaya hanya dihitung untuk bulan yang sudah berjalan, dan otomatis masuk ke kolom Spend, CPL, CPQL & report. Jangan input biaya yang sama lagi di Catat Performa Iklan — nanti terhitung dobel.</span>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Catat Performa Iklan <span className="hint">(mingguan per campaign/kreatif dari Ads Manager — nanti otomatis saat konektor API aktif)</span></h3>
          <div className="form-grid">
            <div className="field"><label>Tanggal</label><input type="date" {...fa('tgl')} /></div>
            <div className="field"><label>Campaign <span className="req">*</span></label>
              <select {...fa('campaign')}><option value="">— pilih —</option>{camps.filter(x => x.status === 'Aktif').map(x => <option key={x.id} value={x.nama}>{x.nama}</option>)}</select>
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
                    <button className="sort-btn" style={{ padding: '3px 9px', color: 'var(--brass)' }} onClick={() => { setLk({ nama: x.nama, url: 'https://', format: 'reels', no: 1, source: ({ 'Meta (FB+IG)': 'meta', Facebook: 'facebook', Instagram: 'instagram', Tiktok: 'tiktok', Google: 'google', Youtube: 'youtube', Website: 'website' })[x.platform] || 'meta', medium: x.platform === 'Website' ? 'referral' : 'cpc' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>🔗 Link</button>
                    <button className="sort-btn" style={{ padding: '3px 9px' }} onClick={() => { setCEdit(x.id); setC({ nama: x.nama, platform: x.platform || 'Meta (FB+IG)', project: x.project || '', tujuan: x.tujuan || 'leads', bulan: bulanIni, extra: '', budget: x.budget || '', status: x.status || 'Aktif', catatan: x.catatan || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
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

      {tab === 'web' && (<>
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Website & SEO <span className="hint">(otomatis dari GA4, Search Console & Instagram — cron harian 05.30 WIB)</span></h3>
            <button className="btn btn-primary" style={{ width: 'auto' }} disabled={narik} onClick={tarikSekarang}>{narik ? 'Menarik data…' : '⟳ Tarik Data Sekarang'}</button>
          </div>
          {(!data.ga4 || !data.ga4.length) && (!data.gsc || !data.gsc.length) && (
            <p className="hint" style={{ marginBottom: 0 }}>Belum ada data. Pastikan environment variable Google (GOOGLE_SA_EMAIL, GOOGLE_SA_KEY, GA4_PROPERTY_ID, GSC_SITE_URL) sudah diisi di Vercel & /api/setup sudah dijalankan, lalu klik Tarik Data Sekarang.</p>
          )}
        </div>
        <div className="two-col">
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Trafik Website per Sumber (GA4)</h3>
            <div className="tbl-wrap tbl-compact"><table>
              <thead><tr><th>Source / Medium</th><th className="num">Sessions</th><th className="num">Users</th><th className="num">Key Events</th></tr></thead>
              <tbody>{(data.ga4 || []).length ? (data.ga4 || []).map(r => (
                <tr key={r.source_medium}><td data-label="Sumber"><b>{r.source_medium}</b></td>
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
