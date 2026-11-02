// ===== Pembaca KTP & NPWP gratis (Tesseract.js di browser) =====
// Peningkatan di atas OCR polos: (1) pembersihan foto — buang latar biru, kontras, ambang adaptif;
// (2) dua varian + pembacaan khusus angka utk NIK/NPWP; (3) aturan baku KTP — label fuzzy, koreksi huruf↔angka, validasi NIK.

export const LEBAR_OCR = 1600;
// skala: perbesar maksimal 2× (pembesaran berlebihan justru menghapus teks pada foto kecil/buram), lebar paling tinggi 1600 px
export const skalaOcr = lebarAsli => Math.min(2, LEBAR_OCR / lebarAsli);
export const PROV = { '11': 'ACEH', '12': 'SUMATERA UTARA', '13': 'SUMATERA BARAT', '14': 'RIAU', '15': 'JAMBI', '16': 'SUMATERA SELATAN', '17': 'BENGKULU', '18': 'LAMPUNG',
  '19': 'KEPULAUAN BANGKA BELITUNG', '21': 'KEPULAUAN RIAU', '31': 'DKI JAKARTA', '32': 'JAWA BARAT', '33': 'JAWA TENGAH', '34': 'DI YOGYAKARTA', '35': 'JAWA TIMUR', '36': 'BANTEN',
  '51': 'BALI', '52': 'NUSA TENGGARA BARAT', '53': 'NUSA TENGGARA TIMUR', '61': 'KALIMANTAN BARAT', '62': 'KALIMANTAN TENGAH', '63': 'KALIMANTAN SELATAN', '64': 'KALIMANTAN TIMUR',
  '65': 'KALIMANTAN UTARA', '71': 'SULAWESI UTARA', '72': 'SULAWESI TENGAH', '73': 'SULAWESI SELATAN', '74': 'SULAWESI TENGGARA', '75': 'GORONTALO', '76': 'SULAWESI BARAT',
  '81': 'MALUKU', '82': 'MALUKU UTARA', '91': 'PAPUA', '92': 'PAPUA BARAT', '93': 'PAPUA SELATAN', '94': 'PAPUA TENGAH', '95': 'PAPUA PEGUNUNGAN', '96': 'PAPUA BARAT DAYA' };

// ---------- 1. Pembersihan piksel (RGBA → RGBA), dipakai di browser (canvas) & uji (sharp) ----------
// Varian 'tegas': kanal maksimum (latar biru/pola warna jadi terang, tinta hitam tetap gelap) → regang kontras → ambang adaptif Bradley
// Varian 'halus': kanal maksimum → regang kontras saja (Tesseract memakai ambangnya sendiri)
export function bersihkan(data, w, h, varian = 'tegas') {
  const n = w * h, g = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2]; g[i] = Math.max(r, gg, b) * 0.85 + (0.299 * r + 0.587 * gg + 0.114 * b) * 0.15; }
  // regang kontras (persentil 2–98)
  const hist = new Uint32Array(256); for (let i = 0; i < n; i++) hist[g[i] | 0]++;
  let lo = 0, hi = 255, c = 0; for (; lo < 255 && (c += hist[lo]) < n * 0.02; lo++); c = 0; for (; hi > 0 && (c += hist[hi]) < n * 0.02; hi--);
  const sk = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) g[i] = Math.max(0, Math.min(255, (g[i] - lo) * sk));
  const out = new Uint8ClampedArray(n * 4);
  if (varian === 'halus') { for (let i = 0; i < n; i++) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g[i]; out[i * 4 + 3] = 255; } return out; }
  // redam bintik (median 3×3) sebelum ambang
  const md = new Float32Array(n), win = new Float32Array(9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y === 0 || x === 0 || y === h - 1 || x === w - 1) { md[y * w + x] = g[y * w + x]; continue; }
    let k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) win[k++] = g[(y + dy) * w + x + dx];
    win.sort(); md[y * w + x] = win[4];
  }
  g.set(md);
  // ambang adaptif Bradley (citra integral) — tahan silau & cahaya tidak rata
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { s += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s; } }
  const S = Math.max(15, Math.round(w / 28)), t = 0.13;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x1 = Math.max(0, x - S), x2 = Math.min(w - 1, x + S), y1 = Math.max(0, y - S), y2 = Math.min(h - 1, y + S);
    const cnt = (x2 - x1 + 1) * (y2 - y1 + 1);
    const sum = I[(y2 + 1) * (w + 1) + x2 + 1] - I[y1 * (w + 1) + x2 + 1] - I[(y2 + 1) * (w + 1) + x1] + I[y1 * (w + 1) + x1];
    const v = g[y * w + x] * cnt < sum * (1 - t) ? 0 : 255;
    const k = (y * w + x) * 4; out[k] = out[k + 1] = out[k + 2] = v; out[k + 3] = 255;
  }
  return out;
}

// ---------- 2. Aturan baku KTP ----------
const KE_ANGKA = { O: '0', o: '0', D: '0', Q: '0', U: '0', I: '1', l: '1', '|': '1', i: '1', '!': '1', L: '1', J: '1', Z: '2', z: '2', E: '3', A: '4', S: '5', s: '5', $: '5', G: '6', b: '6', T: '7', B: '8', g: '9', q: '9' };
export const keAngka = s => String(s || '').split('').map(ch => /\d/.test(ch) ? ch : (KE_ANGKA[ch] ?? '')).join('');
export function nikSah(nik) {
  if (!/^\d{16}$/.test(nik || '')) return false;
  if (!PROV[nik.slice(0, 2)]) return false;
  const tg = +nik.slice(6, 8), bl = +nik.slice(8, 10);
  return ((tg >= 1 && tg <= 31) || (tg >= 41 && tg <= 71)) && bl >= 1 && bl <= 12;
}
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const q = [i]; for (let j = 1; j <= n; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = q; } return p[n]; }
const LABEL = { nik: ['nik'], nama: ['nama'], ttl: ['tempattgllahir', 'tempatlahir'], jk: ['jeniskelamin'], alamat: ['alamat'], rt_rw: ['rtrw'], kel_desa: ['keldesa', 'kelurahan', 'desa'],
  kecamatan: ['kecamatan'], agama: ['agama'], kawin: ['statusperkawinan'], kerja: ['pekerjaan'], wn: ['kewarganegaraan'], berlaku: ['berlakuhingga'] };
function cocokLabel(teks) {
  const t = teks.toLowerCase().replace(/[^a-z]/g, '');
  let best = null;
  for (const [k, cands] of Object.entries(LABEL)) for (const c of cands) {
    if (!t || t[0] !== c[0]) continue;
    const pot = t.slice(0, c.length + 1); const d = Math.min(lev(pot, c), lev(t.slice(0, c.length), c));
    const r = 1 - d / c.length;
    if (r >= (c.length <= 4 ? 0.75 : 0.7) && (!best || r > best.r)) best = { k, r };
  }
  return best && best.k;
}
const bersihNilai = v => String(v || '').replace(/^[\s:;.=_\-–—]+/, '').replace(/[|_«»"“”]+/g, '').replace(/\s{2,}/g, ' ').trim();
const SAMBUNG = /^(NO\.?|BLOK|GG\.?|JL\.?|RT|RW|KAV\.?)$/;
function rapikan(v) {
  const t = String(v || '').split(' ').filter(Boolean);
  while (t.length > 1 && (/^[^A-Z0-9]+$/.test(t[t.length - 1]) || (/^[A-Z0-9]{1,2}$/.test(t[t.length - 1]) && !SAMBUNG.test(t[t.length - 2])))) t.pop();
  while (t.length > 1 && /^[^A-Z0-9]+$/.test(t[0])) t.shift();
  return t.join(' ');
}
const huruf = v => rapikan(bersihNilai(v).replace(/[^A-Za-z0-9 .,'/\-]/g, '').replace(/\s{2,}/g, ' ').trim().toUpperCase());

export function urai(teks) {
  const baris = String(teks || '').split('\n').map(s => s.trim()).filter(Boolean);
  const o = {};
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i];
    if (!o.provinsi && /PR[O0]V[I1l]NS[I1l]/i.test(b)) { o.provinsi = huruf(b.replace(/.*PR[O0]V[I1l]NS[I1l]/i, '')); continue; }
    if (!o.kota_kab && /^(K[O0]TA|KABUPATEN|KAB\.?)\s/i.test(b) && !/:/.test(b)) { o.kota_kab = huruf(b).replace(/^K0TA/, 'KOTA'); continue; }
    let lab = null, nilai = '';
    const idx = b.indexOf(':');
    if (idx > 0) { lab = cocokLabel(b.slice(0, idx)); nilai = b.slice(idx + 1); }
    if (!lab) { lab = cocokLabel(b); if (lab) nilai = b.replace(/^\S+(\s+\S+)?/, m => (cocokLabel(m.split(/\s+/)[0]) === lab && lab !== 'ttl' && lab !== 'kawin' && lab !== 'jk' && lab !== 'wn' && lab !== 'berlaku' && lab !== 'kel_desa' && lab !== 'rt_rw') ? m.replace(/^\S+/, '') : ''); }
    if (!lab) continue;
    if (lab === 'nik') { const a = keAngka(nilai || b.replace(/^\S+/, '')); const m = a.match(/\d{16}/); if (m && (!o.nik || nikSah(m[0]))) o.nik = m[0]; else if (!o.nik && a.length >= 14) o.nik_mentah = a; }
    else if (lab === 'nama' && !o.nama_ktp) o.nama_ktp = rapikan(huruf(nilai).replace(/[^A-Z .,']/g, '').trim());
    else if (lab === 'alamat' && !o.alamat) o.alamat = huruf(nilai);
    else if (lab === 'rt_rw' && !o.rt_rw) { const a = keAngka(nilai); if (a.length >= 6 && +a.slice(0, 3) <= 150 && +a.slice(3, 6) <= 150) o.rt_rw = a.slice(0, 3) + '/' + a.slice(3, 6); }
    else if (lab === 'kel_desa' && !o.kel_desa) o.kel_desa = rapikan(huruf(nilai).replace(/[^A-Z .\-']/g, '').trim());
    else if (lab === 'kecamatan' && !o.kecamatan) o.kecamatan = rapikan(huruf(nilai).replace(/[^A-Z .\-']/g, '').trim());
  }
  if (o.nik && PROV[o.nik.slice(0, 2)] && (!o.provinsi || lev(o.provinsi, PROV[o.nik.slice(0, 2)]) > 2)) o.provinsi = PROV[o.nik.slice(0, 2)];
  Object.keys(o).forEach(k => { if (!o[k]) delete o[k]; });
  return o;
}
export function uraiNpwp(teks) {
  const o = {}; const baris = String(teks || '').split('\n').map(s => s.trim()).filter(Boolean);
  for (let i = 0; i < baris.length; i++) {
    const a = keAngka(baris[i].replace(/[.\-\s]/g, (m) => m));
    const dg = a.replace(/\D/g, '');
    if (!o.npwp && /NPWP|\d{2}[.,]\d{3}/i.test(baris[i])) {
      const raw = keAngka(baris[i].replace(/^[^:]*:/, '').replace(/[.,\-\s]/g, ''));
      if (raw.length === 15) o.npwp = `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}.${raw.slice(8, 9)}-${raw.slice(9, 12)}.${raw.slice(12, 15)}`;
      else if (raw.length === 16) o.npwp = raw;
      if (o.npwp) { const nm = (baris[i + 1] || '').toUpperCase().replace(/[^A-Z .,']/g, '').trim(); if (nm.length >= 3 && !/KEMENTERIAN|DIREKTORAT/.test(nm)) o.nama_ktp = nm; }
    }
    void dg;
  }
  return o;
}
// mutu nilai teks: hukum token pendek/aneh (tanda hasil sampah)
function mutu(v) { const t = String(v || '').split(' ').filter(Boolean); if (!t.length) return 0;
  const buruk = t.filter(x => x.length <= 2 && !/^\d+$/.test(x) || !/[AIUEO0-9]/.test(x)).length; return 1 - buruk / t.length; }
export function mutuHasil(o) { let m = nikSah(o.nik) ? 4 : 0; for (const k of ['nama_ktp', 'alamat', 'kel_desa', 'kecamatan', 'kota_kab', 'provinsi']) if (o[k]) m += mutu(o[k]);
  if (/^\d{3}\/\d{3}$/.test(o.rt_rw || '')) m += 1; if (o.npwp) m += 4; return m; }
// gabungkan beberapa hasil: per kolom pilih nilai yang paling sering muncul; seri → dari hasil bermutu tertinggi
export function gabung(hasil) {
  const urut = [...hasil].sort((a, b) => mutuHasil(b) - mutuHasil(a)), o = {};
  const kolom = new Set(hasil.flatMap(h => Object.keys(h)));
  for (const k of kolom) {
    if (k.endsWith('_mentah')) continue;
    const vals = urut.map(h => h[k]).filter(Boolean).filter(v => k !== 'nik' || nikSah(v))
      .filter(v => !['nama_ktp', 'alamat', 'kel_desa', 'kecamatan'].includes(k) || (mutu(v) >= 0.6 && v.replace(/[^A-Z]/g, '').length >= 3));
    if (!vals.length) continue;
    const hit = {}; vals.forEach(v => { hit[v] = (hit[v] || 0) + 1; });
    o[k] = vals.reduce((a, v) => (hit[v] > hit[a] || (hit[v] === hit[a] && k !== 'nik' && mutu(v) > mutu(a)) ? v : a), vals[0]);
  }
  return o;
}
export const skor = o => Object.keys(o).filter(k => !k.endsWith('_mentah')).length + (nikSah(o.nik) ? 4 : 0);

// ---------- 3. Penjalan di browser ----------
let workerP = null;
async function pekerja() {
  if (!workerP) workerP = (async () => {
    const { createWorker } = await import('tesseract.js');
    return createWorker('ind', 1, { langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/ind@1.0.0/4.0.0_best_int', logger: () => {} });
  })();
  return workerP;
}
function kanvasDari(img, varian) {
  const sk = skalaOcr(img.width), w = Math.round(img.width * sk), h = Math.round(img.height * sk);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, h);
  if (varian !== 'asli') { const d = x.getImageData(0, 0, w, h); d.data.set(bersihkan(d.data, w, h, varian)); x.putImageData(d, 0, 0); }
  return c;
}
// file: File gambar (JPG/PNG yang bisa dibuka browser). jenis: 'ktp' | 'npwp'
export async function bacaKartu(file, jenis = 'ktp') {
  if (!file || !/^image\//.test(file.type)) throw new Error('Pembacaan otomatis hanya untuk foto (JPG/PNG); untuk PDF isi identitas manual.');
  const img = await createImageBitmap(file);
  const w = await pekerja();
  const uraiF = jenis === 'npwp' ? uraiNpwp : urai;
  const hasil = []; let tegas = null;
  for (const varian of ['asli', 'halus', 'tegas']) {
    const c = kanvasDari(img, varian);
    await w.setParameters({ tessedit_pageseg_mode: varian === 'asli' ? '3' : '6', tessedit_char_whitelist: '', preserve_interword_spaces: '1' });
    const { data } = await w.recognize(c);
    hasil.push(uraiF(data.text));
    if (varian === 'tegas') tegas = { c, data };
    const g = gabung(hasil);
    if (hasil.length >= 2 && (jenis === 'ktp' ? nikSah(g.nik) && mutuHasil(g) >= 10.5 : !!g.npwp)) break; // sudah meyakinkan
  }
  const terbaik = gabung(hasil);
  // Pembacaan khusus angka pada baris NIK bila NIK belum sah
  if (jenis === 'ktp' && !nikSah(terbaik.nik) && tegas) {
    const ln = (tegas.data.lines || []).find(l => /^\s*N[I1l]K/i.test(l.text));
    if (ln) {
      await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789' });
      const bb = ln.bbox, x0 = Math.max(0, bb.x0 + (bb.x1 - bb.x0) * 0.18);
      const { data } = await w.recognize(tegas.c, { rectangle: { left: Math.round(x0), top: Math.max(0, bb.y0 - 6), width: Math.round(bb.x1 - x0 + 8), height: Math.round(bb.y1 - bb.y0 + 12) } });
      const m = (data.text || '').replace(/\D/g, '').match(/\d{16}/);
      if (m && nikSah(m[0])) { terbaik.nik = m[0]; if (!terbaik.provinsi) terbaik.provinsi = PROV[m[0].slice(0, 2)]; }
      await w.setParameters({ tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' });
    }
  }
  if (terbaik.nik && PROV[terbaik.nik.slice(0, 2)]) terbaik.provinsi = PROV[terbaik.nik.slice(0, 2)];
  return terbaik;
}
