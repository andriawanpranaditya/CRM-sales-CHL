import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { catat } from '@/lib/log';
import { bolehDigital, tokenAds, sumberToken, mGet, mPost, mHapus, mSemua, daftarAkun, faktorUang, bacaBatas, simpanBatas, BATAS_BAWAAN,
  siapkanMedia, situsWp, wp, teksKeHtml } from '@/lib/digital';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODUL = 'Digital Marketing';
const TOLAK = () => Response.json({ error: 'Menu ini sementara khusus akun Head of Sales & Marketing' }, { status: 403 });
const galat = (pesan, status = 400) => Response.json({ error: pesan }, { status });
const HASIL = ['onsite_conversion.messaging_conversation_started_7d', 'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'link_click'];
const rp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const idAkun = v => String(v || '').replace(/^act_/, '').replace(/[^0-9]/g, '');
const idObj = v => String(v || '').replace(/[^0-9_]/g, '');
const tunggu = ms => new Promise(r => setTimeout(r, ms));

async function masuk() {
  const { user, err } = await requireUser('manager'); if (err) return { err };
  if (!bolehDigital(user)) return { err: TOLAK() };
  return { user };
}
async function mataUangAkun(akun) {
  try { return (await mGet('act_' + akun, { fields: 'currency' })).currency || 'IDR'; } catch { return 'IDR'; }
}

// ===================== BACA =====================
export async function GET(req) {
  const { err } = await masuk(); if (err) return err;
  const q = new URL(req.url).searchParams, bagian = q.get('bagian') || 'status', sql = db();
  try {
    if (bagian === 'status') {
      const batas = await bacaBatas(sql);
      const wps = situsWp().map(s => ({ project: s.project, url: s.url }));
      if (!tokenAds()) return Response.json({ token: false, akun: [], batas, batasBawaan: BATAS_BAWAAN, wp: wps });
      let akun = [], izin = [], galatToken = '';
      try { akun = await daftarAkun(); } catch (e) { galatToken = e.message; }
      try { izin = ((await mGet('me/permissions')).data || []).filter(p => p.status === 'granted').map(p => p.permission); } catch {}
      return Response.json({ token: true, sumberToken: sumberToken(), galatToken, akun, izin, batas, batasBawaan: BATAS_BAWAAN, wp: wps });
    }

    if (bagian === 'iklan') {
      const akun = idAkun(q.get('akun')); if (!akun) return galat('Akun iklan belum dipilih');
      // Hemat panggilan ke Meta (akun iklan dibatasi jumlah panggilannya): campaign + ad set + iklan diambil dalam SATU panggilan bersarang.
      // Bawaan: hanya campaign yang saklarnya ON. ?mati=1 → campaign yang mati (dimuat hanya bila diminta).
      const mati = q.get('mati') === '1';
      const mataUang = /^[A-Z]{3}$/.test(q.get('mu') || '') ? q.get('mu') : 'IDR', f = faktorUang(mataUang);
      const FA = 'id,name,status,effective_status,adset_id,campaign_id,creative{thumbnail_url,object_type}';
      const FS = `id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,targeting,ads.limit(40){${FA}}`;
      const pohon = await mSemua(`act_${akun}/campaigns`, { fields: `id,name,status,effective_status,objective,daily_budget,lifetime_budget,adsets.limit(25){${FS}}`,
        effective_status: JSON.stringify(mati ? ['PAUSED'] : ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES']), limit: mati ? 25 : 50 }, mati ? 3 : 2);
      const camp = pohon, adset = pohon.flatMap(c => c.adsets?.data || []), ads = adset.flatMap(a => a.ads?.data || []);
      const ins = mati ? [] : await mSemua(`act_${akun}/insights`, { level: 'ad', date_preset: 'last_7d', fields: 'ad_id,adset_id,campaign_id,spend,impressions,actions', limit: 300 }, 2).catch(() => []);
      const hasilDari = a => { for (const t of HASIL) { const x = (a || []).find(y => y.action_type === t); if (x) return { n: Number(x.value) || 0, jenis: t }; } return { n: 0, jenis: '' }; };
      const perAd = {}, perSet = {}, perCamp = {};
      const tambah = (o, k, s, i, h) => { const x = o[k] || (o[k] = { biaya: 0, tayang: 0, hasil: 0 }); x.biaya += s; x.tayang += i; x.hasil += h; };
      for (const r of ins) { const s = Number(r.spend) || 0, i = Number(r.impressions) || 0, h = hasilDari(r.actions).n;
        tambah(perAd, r.ad_id, s, i, h); tambah(perSet, r.adset_id, s, i, h); tambah(perCamp, r.campaign_id, s, i, h); }
      const uang = v => v ? Math.round(Number(v) / f) : null;
      const nol = { biaya: 0, tayang: 0, hasil: 0 };
      const tgt = t => t ? { usia_min: (Array.isArray(t.age_range) && t.age_range[0]) || t.age_min || null, usia_maks: (Array.isArray(t.age_range) && t.age_range[1]) || t.age_max || null, gender: (t.genders || []).length === 1 ? (t.genders[0] === 1 ? 'pria' : 'wanita') : 'semua',
        lokasi: [...(t.geo_locations?.cities || []).map(c => c.name + (c.radius ? ` +${c.radius}${c.distance_unit === 'mile' ? 'mil' : 'km'}` : '')), ...(t.geo_locations?.regions || []).map(c => c.name),
          ...(t.geo_locations?.custom_locations || []).map(c => (c.name || c.address_string || 'Titik peta') + (c.radius ? ` +${c.radius}km` : '')), ...(t.geo_locations?.countries || [])].slice(0, 12),
        otomatis: t.targeting_automation?.advantage_audience === 1 } : null;
      return Response.json({ akun, mata_uang: mataUang, mati,
        campaign: camp.map(c => ({ id: c.id, nama: c.name, nyala: c.status === 'ACTIVE', status: c.effective_status, tujuan: c.objective, harian: uang(c.daily_budget), total: uang(c.lifetime_budget), k7: perCamp[c.id] || nol })),
        adset: adset.map(a => ({ id: a.id, nama: a.name, campaign_id: a.campaign_id, nyala: a.status === 'ACTIVE', status: a.effective_status, harian: uang(a.daily_budget), total: uang(a.lifetime_budget), sasaran: a.optimization_goal, target: tgt(a.targeting), k7: perSet[a.id] || nol })),
        iklan: ads.map(a => ({ id: a.id, nama: a.name, adset_id: a.adset_id, campaign_id: a.campaign_id, nyala: a.status === 'ACTIVE', status: a.effective_status, gambar: a.creative?.thumbnail_url || '', jenis: a.creative?.object_type || '', k7: perAd[a.id] || nol })) });
    }

    if (bagian === 'penempatan') { // iklan tayang di mana saja (Facebook / Instagram / Audience Network / Messenger) — 30 hari terakhir, per campaign
      const akun = idAkun(q.get('akun')); if (!akun) return galat('Akun iklan belum dipilih');
      const f = faktorUang(/^[A-Z]{3}$/.test(q.get('mu') || '') ? q.get('mu') : 'IDR');
      const rows = await mSemua(`act_${akun}/insights`, { level: 'campaign', date_preset: 'last_30d', breakdowns: 'publisher_platform,platform_position',
        fields: 'campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions', limit: 300 }, 2);
      const NAMA = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network (aplikasi & situs pihak ketiga)', messenger: 'Messenger', threads: 'Threads', whatsapp: 'WhatsApp' };
      const hasil = a => { for (const t of HASIL) { const x = (a || []).find(y => y.action_type === t); if (x) return Number(x.value) || 0; } return 0; };
      return Response.json({ baris: rows.map(r => ({ campaign_id: r.campaign_id, campaign: r.campaign_name, platform: NAMA[r.publisher_platform] || r.publisher_platform, kode: r.publisher_platform,
        posisi: String(r.platform_position || '').replace(/_/g, ' '), biaya: Math.round(Number(r.spend) || 0), tayang: Number(r.impressions) || 0, klik: Number(r.inline_link_clicks) || 0, hasil: hasil(r.actions) }))
        .sort((a, b) => b.biaya - a.biaya) });
    }

    if (bagian === 'halaman') { // Halaman Facebook & akun Instagram yang bisa diposting dengan token ini
      const h = await mSemua('me/accounts', { fields: 'id,name,instagram_business_account{id,username}', limit: 50 }, 2);
      return Response.json({ halaman: h.map(x => ({ id: x.id, nama: x.name, ig: x.instagram_business_account ? { id: x.instagram_business_account.id, nama: x.instagram_business_account.username } : null })) });
    }

    if (bagian === 'organik') { // postingan terakhir di Halaman Facebook & Instagram (untuk dilihat / dihapus)
      const page = idObj(q.get('page_id')); if (!page) return galat('Halaman belum dipilih');
      const h = await mGet(page, { fields: 'name,access_token,instagram_business_account' });
      if (!h.access_token) return galat('Token tidak punya akses ke Halaman ini');
      const ig = h.instagram_business_account?.id, out = { fb: [], ig: [], galatFb: '', galatIg: '' };
      try { out.fb = ((await mGet(`${page}/posts`, { fields: 'id,message,created_time,full_picture,permalink_url', limit: 8 }, h.access_token)).data || [])
        .map(p => ({ id: p.id, teks: p.message || '', tgl: p.created_time, gambar: p.full_picture || '', link: p.permalink_url || '' })); } catch (e) { out.galatFb = e.message; }
      if (ig) { try { out.ig = ((await mGet(`${ig}/media`, { fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp', limit: 8 }, h.access_token)).data || [])
        .map(p => ({ id: p.id, teks: p.caption || '', tgl: p.timestamp, gambar: p.thumbnail_url || (p.media_type === 'VIDEO' ? '' : p.media_url) || '', link: p.permalink || '', jenis: p.media_type })); } catch (e) { out.galatIg = e.message; } }
      return Response.json(out);
    }

    if (bagian === 'wp') {
      const s = situsWp().find(x => x.project === q.get('project')) || situsWp()[0];
      if (!s) return Response.json({ siap: false, artikel: [], kategori: [] });
      const [artikel, kategori] = await Promise.all([
        wp(s, 'posts?per_page=12&status=publish,draft,future&context=edit&_fields=id,date,status,link,title'),
        wp(s, 'categories?per_page=50&_fields=id,name,count').catch(() => []),
      ]);
      return Response.json({ siap: true, project: s.project, url: s.url,
        artikel: artikel.map(a => ({ id: a.id, tgl: a.date, status: a.status, link: a.link, judul: a.title?.raw || a.title?.rendered || '(tanpa judul)' })),
        kategori: kategori.map(k => ({ id: k.id, nama: k.name })) });
    }

    if (bagian === 'riwayat') {
      const r = await sql`SELECT waktu, nama, aksi, detail FROM activity_log WHERE modul = ${MODUL} ORDER BY waktu DESC LIMIT 40`.catch(() => []);
      return Response.json({ riwayat: r });
    }
    return galat('Bagian tidak dikenal');
  } catch (e) { return galat(e.message || 'Gagal memuat', 502); }
}

// ===================== UBAH =====================
export async function POST(req) {
  const { user, err } = await masuk(); if (err) return err;
  let b; try { b = await req.json(); } catch { return galat('Data tidak terbaca (mungkin gambar terlalu besar)'); }
  const sql = db();
  const log = (aksi, detail) => catat(sql, { user, aksi, modul: MODUL, detail, req });
  try {
    // ---- batas anggaran harian ----
    if (b.aksi === 'batas') { const n = await simpanBatas(sql, b.harian); await log('Update', 'batas anggaran harian → ' + rp(n)); return Response.json({ ok: true, batas: n }); }

    // ---- nyalakan / matikan campaign, ad set, atau iklan ----
    if (b.aksi === 'status') {
      const id = idObj(b.id); if (!id) return galat('ID kosong');
      const o = await mGet(id, { fields: b.jenis === 'ad' ? 'name,account_id' : 'name,account_id,daily_budget' });
      if (b.nyala && o.daily_budget) {
        const batas = await bacaBatas(sql), harian = Number(o.daily_budget) / faktorUang(await mataUangAkun(o.account_id));
        if (harian > batas) return galat(`Anggaran harian "${o.name}" ${rp(harian)} melebihi batas ${rp(batas)}. Turunkan anggarannya atau naikkan batas di tab Pengaturan.`);
      }
      await mPost(id, { status: b.nyala ? 'ACTIVE' : 'PAUSED' });
      await log('Update', `${b.nyala ? 'NYALAKAN' : 'MATIKAN'} ${b.jenis || 'objek'}: ${o.name} (${id})`);
      return Response.json({ ok: true });
    }

    // ---- ubah anggaran harian ----
    if (b.aksi === 'budget') {
      const id = idObj(b.id), harian = Math.round(Number(b.harian) || 0);
      if (!id || harian <= 0) return galat('Anggaran harian belum diisi');
      const batas = await bacaBatas(sql);
      if (harian > batas) return galat(`Anggaran ${rp(harian)} melebihi batas harian ${rp(batas)}. Naikkan batas dulu di tab Pengaturan bila memang disengaja.`);
      const o = await mGet(id, { fields: 'name,account_id,daily_budget,lifetime_budget' });
      if (!o.daily_budget) return galat(o.lifetime_budget ? `"${o.name}" memakai anggaran total (bukan harian) — ubah di Ads Manager.` : `"${o.name}" tidak punya anggaran sendiri — anggarannya diatur di tingkat ${b.jenis === 'adset' ? 'campaign' : 'ad set'}.`);
      const f = faktorUang(await mataUangAkun(o.account_id)), lama = Number(o.daily_budget) / f;
      await mPost(id, { daily_budget: harian * f });
      await log('Update', `anggaran harian ${b.jenis || ''}: ${o.name} · ${rp(lama)} → ${rp(harian)}`);
      return Response.json({ ok: true, lama, baru: harian });
    }

    // ---- ubah target usia & gender ad set (lokasi & minat tetap seperti semula) ----
    if (b.aksi === 'target') {
      const id = idObj(b.id); if (!id) return galat('Ad set belum dipilih');
      const min = Math.round(Number(b.usia_min)), maks = Math.round(Number(b.usia_maks));
      if (!(min >= 18 && maks <= 65 && min <= maks)) return galat('Rentang usia harus antara 18 dan 65');
      const o = await mGet(id, { fields: 'name,targeting' });
      const t = { ...(o.targeting || {}) };
      if (t.targeting_automation?.advantage_audience === 1) {
        // Advantage+ audience: usia pilihan Anda menjadi SARAN (age_range); batas kerasnya hanya usia minimum (maks 25) dan Meta mewajibkan batas atas 65
        t.age_range = [min, maks]; t.age_min = Math.min(min, 25); t.age_max = 65;
      } else { t.age_min = min; t.age_max = maks; delete t.age_range; }
      if (b.gender === 'pria') t.genders = [1]; else if (b.gender === 'wanita') t.genders = [2]; else delete t.genders;
      await mPost(id, { targeting: t });
      await log('Update', `target ad set: ${o.name} · usia ${min}–${maks} · ${b.gender || 'semua'}`);
      return Response.json({ ok: true, saran: t.targeting_automation?.advantage_audience === 1 });
    }

    // ---- pasang iklan baru: materi + caption baru, tujuan & formulir disalin dari iklan contoh. Selalu dibuat MATI dulu. ----
    if (b.aksi === 'iklan_baru') {
      const contoh = idObj(b.contoh_id), nama = String(b.nama || '').trim().slice(0, 120), caption = String(b.caption || '').trim();
      if (!contoh) return galat('Pilih iklan contoh dulu'); if (!nama) return galat('Nama iklan belum diisi');
      if (!caption) return galat('Caption belum diisi'); if (!b.gambar) return galat('Gambar belum dipilih');
      const src = await mGet(contoh, { fields: 'name,account_id,adset_id,creative{object_story_spec}' });
      const akun = idAkun(src.account_id), adset = idObj(b.adset_id) || src.adset_id;
      const spec = src.creative?.object_story_spec;
      if (!spec?.link_data || spec.link_data.child_attachments) return galat(`Iklan contoh "${src.name}" bukan iklan satu gambar (video/carousel/postingan). Pilih iklan contoh lain yang berupa satu gambar.`);
      if (adset !== src.adset_id) { const s = await mGet(adset, { fields: 'account_id' }); if (idAkun(s.account_id) !== akun) return galat('Ad set tujuan dan iklan contoh harus di akun iklan yang sama'); }
      const up = await mPost(`act_${akun}/adimages`, { bytes: String(b.gambar) });
      const hash = Object.values(up.images || {})[0]?.hash; if (!hash) return galat('Meta tidak mengembalikan kode gambar — coba unggah ulang');
      const ld = { ...spec.link_data, image_hash: hash, message: caption };
      delete ld.picture; delete ld.image_crops;
      if (String(b.judul || '').trim()) ld.name = String(b.judul).trim().slice(0, 80);
      const kreatif = await mPost(`act_${akun}/adcreatives`, { name: nama, object_story_spec: { ...spec, link_data: ld } });
      const iklan = await mPost(`act_${akun}/ads`, { name: nama, adset_id: adset, creative: { creative_id: kreatif.id }, status: 'PAUSED' });
      await log('Input', `iklan baru (masih MATI): ${nama} · ad set ${adset} · contoh: ${src.name}`);
      return Response.json({ ok: true, id: iklan.id });
    }

    // ---- hapus iklan (hanya iklan yang saklarnya MATI) ----
    if (b.aksi === 'hapus_iklan') {
      const id = idObj(b.id); if (!id) return galat('Iklan belum dipilih');
      const o = await mGet(id, { fields: 'name,status,adset{name}' });
      if (o.status === 'ACTIVE') return galat(`Iklan "${o.name}" masih ON. Matikan dulu, baru bisa dihapus.`);
      await mHapus(id);
      await log('Hapus', `iklan: ${o.name} (${id}) · ad set ${o.adset?.name || '-'}`);
      return Response.json({ ok: true });
    }

    // ---- hapus postingan organik (Facebook / Instagram) ----
    if (b.aksi === 'hapus_organik') {
      const page = idObj(b.page_id), id = idObj(b.id), di = b.di === 'ig' ? 'ig' : 'fb';
      if (!page || !id) return galat('Postingan belum dipilih');
      const h = await mGet(page, { fields: 'name,access_token' });
      if (!h.access_token) return galat('Token tidak punya akses ke Halaman ini');
      try { await mHapus(id, h.access_token); }
      catch (e) {
        if (di === 'ig') return galat('Instagram menolak menghapus: ' + e.message + ' — menghapus postingan Instagram butuh izin instagram_manage_contents di token.', 502);
        return galat('Facebook menolak menghapus: ' + e.message, 502);
      }
      await log('Hapus', `postingan ${di === 'ig' ? 'Instagram' : 'Facebook'} ${h.name}: ${String(b.teks || '').slice(0, 80) || id}`);
      return Response.json({ ok: true });
    }

    // ---- posting organik ke Halaman Facebook dan/atau Instagram ----
    if (b.aksi === 'organik') {
      const page = idObj(b.page_id), caption = String(b.caption || '').trim(), ke = Array.isArray(b.ke) ? b.ke : [];
      if (!page) return galat('Halaman belum dipilih'); if (!b.gambar) return galat('Gambar belum dipilih'); if (!ke.length) return galat('Pilih Facebook dan/atau Instagram');
      const h = await mGet(page, { fields: 'name,access_token,instagram_business_account' });
      if (!h.access_token) return galat('Token tidak punya izin memposting ke Halaman ini (butuh pages_manage_posts & pages_read_engagement, dan Halaman harus ditugaskan ke System User).');
      const hasil = {}, gagal = {};
      if (ke.includes('fb')) {
        try {
          const fd = new FormData();
          fd.set('source', new Blob([Buffer.from(String(b.gambar), 'base64')], { type: 'image/jpeg' }), 'materi.jpg');
          fd.set('caption', caption); fd.set('access_token', h.access_token);
          const r = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v23.0'}/${page}/photos`, { method: 'POST', body: fd, signal: AbortSignal.timeout(45000) });
          const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error?.error_user_msg || j.error?.message || 'HTTP ' + r.status);
          hasil.fb = j.post_id || j.id;
        } catch (e) { gagal.fb = e.message; }
      }
      if (ke.includes('ig')) {
        const ig = h.instagram_business_account?.id;
        if (!ig) gagal.ig = 'Halaman ini belum terhubung ke akun Instagram bisnis';
        else {
          let idMedia = null;
          try {
            await siapkanMedia(sql);
            await sql`DELETE FROM dm_media WHERE created_at < now() - interval '1 hour'`;
            const kunci = randomBytes(18).toString('hex');
            idMedia = (await sql`INSERT INTO dm_media (kunci, mime, data) VALUES (${kunci}, 'image/jpeg', ${String(b.gambar)}) RETURNING id`)[0].id;
            const url = `${new URL(req.url).origin}/api/digital/media?id=${idMedia}&k=${kunci}`;
            const c = await mPost(`${ig}/media`, { image_url: url, caption }, h.access_token);
            for (let i = 0; i < 8; i++) { const s = await mGet(c.id, { fields: 'status_code' }, h.access_token);
              if (s.status_code === 'FINISHED') break; if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram menolak gambarnya (cek rasio: antara 4:5 dan 1.91:1)'); await tunggu(2000); }
            hasil.ig = (await mPost(`${ig}/media_publish`, { creation_id: c.id }, h.access_token)).id;
          } catch (e) { gagal.ig = e.message; }
          finally { if (idMedia) await sql`DELETE FROM dm_media WHERE id = ${idMedia}`.catch(() => {}); }
        }
      }
      const ok = Object.keys(hasil);
      if (ok.length) await log('Input', `posting organik ${h.name}: ${ok.join(' + ')}${Object.keys(gagal).length ? ' · gagal: ' + Object.keys(gagal).join(', ') : ''} · ${caption.slice(0, 80)}`);
      if (!ok.length) return galat(Object.entries(gagal).map(([k, v]) => `${k === 'fb' ? 'Facebook' : 'Instagram'}: ${v}`).join(' · '), 502);
      return Response.json({ ok: true, hasil, gagal });
    }

    // ---- artikel / news website (WordPress) ----
    if (b.aksi === 'wp_post') {
      const s = situsWp().find(x => x.project === b.project); if (!s) return galat('Website project ini belum disambungkan');
      const judul = String(b.judul || '').trim(), isi = String(b.isi || '').trim(), status = b.terbit ? 'publish' : 'draft';
      if (!judul) return galat('Judul belum diisi'); if (isi.length < 50) return galat('Isi artikel terlalu pendek');
      let featured, gambarAtas = '';
      if (b.gambar) {
        const m = await wp(s, 'media', { method: 'POST', body: Buffer.from(String(b.gambar), 'base64'),
          headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="news-${Date.now()}.jpg"` } });
        featured = m.id;
        // Tema website tidak menampilkan gambar utama di halaman artikel — jadi gambar juga dipasang di awal isi (pola artikel yang sudah ada)
        const besar = m.media_details?.sizes?.large?.source_url || m.source_url;
        if (besar) gambarAtas = `<!-- wp:image {"id":${m.id},"sizeSlug":"large","linkDestination":"none"} -->\n<figure class="wp-block-image size-large"><img src="${besar}" alt="${judul.replace(/"/g, '&quot;')}" class="wp-image-${m.id}"/></figure>\n<!-- /wp:image -->\n\n`;
      }
      const data = { title: judul, content: gambarAtas + teksKeHtml(isi), status, excerpt: String(b.ringkas || '').trim() || undefined, featured_media: featured,
        categories: Number(b.kategori) ? [Number(b.kategori)] : undefined };
      const p = await wp(s, 'posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      await log('Input', `artikel website ${s.project} (${status === 'publish' ? 'TERBIT' : 'draf'}): ${judul}`);
      return Response.json({ ok: true, id: p.id, link: p.link, status: p.status });
    }
    if (b.aksi === 'wp_status') { // terbitkan draf / tarik kembali jadi draf
      const s = situsWp().find(x => x.project === b.project); if (!s) return galat('Website project ini belum disambungkan');
      const id = Number(b.id); if (!id) return galat('Artikel belum dipilih');
      const p = await wp(s, 'posts/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: b.terbit ? 'publish' : 'draft' }) });
      await log('Update', `artikel website ${s.project} → ${b.terbit ? 'TERBIT' : 'draf'}: ${p.title?.rendered || id}`);
      return Response.json({ ok: true, link: p.link, status: p.status });
    }
    if (b.aksi === 'wp_hapus') { // pindah ke Trash WordPress (masih bisa dipulihkan dari admin WordPress selama 30 hari)
      const s = situsWp().find(x => x.project === b.project); if (!s) return galat('Website project ini belum disambungkan');
      const id = Number(b.id); if (!id) return galat('Artikel belum dipilih');
      const p = await wp(s, 'posts/' + id, { method: 'DELETE' });
      await log('Hapus', `artikel website ${s.project} → Trash: ${p.title?.rendered || p.title?.raw || id}`);
      return Response.json({ ok: true });
    }
    return galat('Aksi tidak dikenal');
  } catch (e) { return galat(e.message || 'Gagal', 502); }
}
