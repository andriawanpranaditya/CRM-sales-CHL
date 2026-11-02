// Pembacaan KTP & kartu NPWP langsung di browser (Tesseract.js). Foto tidak
// dikirim ke layanan mana pun. Hasilnya USULAN: setiap nilai diberi tanda
// 'ragu' bila pembacaan tidak konsisten, dan tidak pernah ditebak.
//
// Pengalaman uji dengan foto asli: kartu NPWP model baru terbaca bersih
// (nomor, NIK, nama, alamat); KTP lebih sulit — NIK dibaca ulang khusus
// angka dari pita barisnya, lalu dicocokkan silang dengan NIK di kartu NPWP.

const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
let muatan = null, worker = null, lapor = null;   // lapor = penerima kemajuan pembacaan yang sedang berjalan

function muatTesseract() {
  if (typeof window === 'undefined') return Promise.reject(new Error('hanya di browser'));
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!muatan) {
    muatan = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CDN; s.async = true;
      s.onload = () => (window.Tesseract ? res(window.Tesseract) : rej(new Error('Tesseract tidak termuat')));
      s.onerror = () => rej(new Error('Gagal memuat pembaca teks'));
      document.head.appendChild(s);
    });
  }
  return muatan;
}

async function ambilWorker(onProgress) {
  const T = await muatTesseract();
  lapor = onProgress || null;
  if (!worker) {
    worker = await T.createWorker('eng', 1, {
      logger: m => { if (lapor && m.status === 'recognizing text') lapor(Math.round(m.progress * 60)); },
    });
  }
  return worker;
}

// Abu-abu + kontras tinggi pada lebar ~1800px — hasil terbaik dari beberapa
// varian yang diuji pada KTP berlatar biru bermotif.
function siapkanCitra(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const sk = Math.min(2, Math.max(0.3, 1800 / Math.max(img.width, img.height)));
      const w = Math.round(img.width * sk), h = Math.round(img.height * sk);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h), p = d.data;
      const abu = document.createElement('canvas'); abu.width = w; abu.height = h;
      const da = abu.getContext('2d').createImageData(w, h);
      for (let i = 0; i < p.length; i += 4) {
        const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        da.data[i] = da.data[i + 1] = da.data[i + 2] = g; da.data[i + 3] = 255;
        p[i] = p[i + 1] = p[i + 2] = Math.max(0, Math.min(255, (g - 128) * 1.6 + 128));
      }
      abu.getContext('2d').putImageData(da, 0, 0);
      ctx.putImageData(d, 0, 0);
      cv.abu = abu;
      URL.revokeObjectURL(url); res(cv);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Foto tidak dapat dibaca')); };
    img.src = url;
  });
}

// ---------- pengurai teks ----------
const rapikanDigit = s => s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/[Ss]/g, '5')
  .replace(/[Bb]/g, '8').replace(/[Zz]/g, '2').replace(/[gq]/g, '9');

const setelahLabel = (baris, label) => {
  const m = baris.match(new RegExp(label + '\\s*[:=.]?\\s*([0-9OoIlSsBbZzgq][0-9OoIlSsBbZzgq .\\-]{10,40})', 'i'));
  return m ? rapikanDigit(m[1]).replace(/\D/g, '') : '';
};
const nilaiLabel = (baris, label) => {
  const m = baris.match(new RegExp('^\\s*' + label + '\\s*[:=\\-.>]*\\s*(.+)$', 'i'));
  return m ? m[1].trim().replace(/\s{2,}/g, ' ') : '';
};

// NIK Indonesia: 6 digit wilayah · DDMMYY (perempuan: DD+40) · 4 digit urut
export function nikMasukAkal(nik) {
  if (!/^\d{16}$/.test(nik)) return false;
  const dd = Number(nik.slice(6, 8)), mm = Number(nik.slice(8, 10));
  const hari = dd > 40 ? dd - 40 : dd;
  return hari >= 1 && hari <= 31 && mm >= 1 && mm <= 12 && Number(nik.slice(0, 2)) >= 11;
}

export function uraiKTP(teks) {
  const baris = teks.split(/\n+/).map(b => b.trim()).filter(Boolean);
  const o = { nikBaris: '', nama: '', alamat: '', rtrw: '', kel: '', kec: '', kota: '', prov: '' };
  for (const b of baris) {
    if (!o.nikBaris && /N\s*I\s*K/i.test(b)) o.nikBaris = setelahLabel(b, 'N\\s*I\\s*K');
    if (!o.prov && /PROVINSI/i.test(b)) o.prov = b.replace(/.*PROVINSI\s*/i, '').replace(/[^A-Z ]/gi, '').trim();
    else if (!o.kota && /^(KOTA|KABUPATEN)\b/i.test(b)) o.kota = b.replace(/[^A-Z ]/gi, '').trim();
    else if (!o.nama && /^Nama\b/i.test(b)) o.nama = nilaiLabel(b, 'Nama').toUpperCase().replace(/[^A-Z' .,]/g, '').trim();
    else if (!o.alamat && /^Alamat\b/i.test(b)) o.alamat = nilaiLabel(b, 'Alamat').replace(/\s{2,}/g, ' ');
    else if (!o.rtrw && /^R\s*T\s*\/?\s*R\s*W/i.test(b)) {
      const d = rapikanDigit(nilaiLabel(b, 'R\\s*T\\s*\\/?\\s*R\\s*W\\w*')).match(/\d{3}\s*\/\s*\d{3}/);
      o.rtrw = d ? d[0].replace(/\s/g, '') : '';
    }
    else if (!o.kel && /^Kel\s*\/?\s*Desa/i.test(b)) o.kel = nilaiLabel(b, 'Kel\\s*\\/?\\s*Desa').replace(/[^A-Z ]/gi, '').trim();
    else if (!o.kec && /^Kecamatan/i.test(b)) o.kec = nilaiLabel(b, 'Kecamatan').replace(/[^A-Z ]/gi, '').trim();
  }
  const rt = o.rtrw ? 'RT ' + o.rtrw.split('/')[0] + ' RW ' + o.rtrw.split('/')[1] : '';
  o.alamatKtp = [o.alamat, rt, o.kel ? 'Kel. ' + o.kel : '', o.kec ? 'Kec. ' + o.kec : '', o.kota, o.prov]
    .filter(Boolean).join(', ');
  return o;
}

export function uraiNPWP(teks) {
  const baris = teks.split(/\n+/).map(b => b.trim()).filter(Boolean);
  const o = { npwp: '', nik: '', nama: '', alamat: '' };
  for (const b of baris) {
    // Nomor NPWP format lama 00.000.000.0-000.000 (15 digit) — dibaca dengan toleransi salah huruf
    if (!o.npwp) {
      const m = rapikanDigit(b).match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[.\s]?\d[-\s]?\d{3}[.\s]?\d{3}/);
      if (m) { const d = m[0].replace(/\D/g, ''); if (d.length === 15) o.npwp = d; }
    }
    // NIK 16 digit pada kartu model baru — font bersih, dibaca apa adanya tanpa toleransi
    if (!o.nik) { const m = b.match(/(?<!\d)\d{16}(?!\d)/); if (m && nikMasukAkal(m[0])) o.nik = m[0]; }
  }
  // Nomor NPWP model baru = NIK (16 digit) bila nomor 15 digit tidak ada
  if (!o.npwp && o.nik) o.npwp = o.nik;
  const iNo = baris.findIndex(b => /\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}/.test(rapikanDigit(b)) || /(?<!\d)\d{16}(?!\d)/.test(b));
  for (let i = Math.max(0, iNo + 1); i < baris.length && !o.nama; i++) {
    const t = baris[i].replace(/\d{16}.*$/, '').replace(/[^A-Z' .,]/g, '').trim();
    if (/^[A-Z][A-Z' .,]{3,}$/.test(t) && !/KPP|PRATAMA|DJP|DIREKTORAT|KEMENTERIAN|NPWP/.test(t)) o.nama = t;
  }
  const iNama = o.nama ? baris.findIndex(b => b.includes(o.nama)) : -1;
  const al = [];
  for (let i = iNama + 1; i < baris.length && iNama >= 0; i++) {
    const b = baris[i];
    // Baris tanggal penerbitan (dd/mm/yyyy — atau mm/yyyy bila salah baca) mengakhiri alamat
    if (/\d{2}\/\d{4}/.test(b) || /djp|kementerian|direktorat/i.test(b)) break;
    // Kode QR di kiri kartu menghasilkan sampah di awal baris. Buang kata demi kata
    // sampai bertemu kata alamat yang wajar: kata baku alamat, atau kata huruf ≥ 4.
    const kata = b.split(/\s+/);
    const baku = /^(JL|JLN|JALAN|PERUM|PERUMAHAN|KOMP|KOMPLEK|KOMPLEKS|GG|GANG|KP|KAMPUNG|DUSUN|DESA|KEL|KELURAHAN|KEC|KECAMATAN|KOTA|KAB|KABUPATEN|RT|RW|BLOK|BLK|NO|CLUSTER|CLUSTER|TAMAN|GRAHA|VILLA|PURI|BUMI|GRIYA|PONDOK|BUKIT|CIPTA)\.?$/i;
    let mulai = 0;
    while (mulai < kata.length && !(baku.test(kata[mulai]) || /^[A-Z]{4,}$/.test(kata[mulai]))) mulai += 1;
    if (mulai >= kata.length) continue;
    let t = kata.slice(mulai).join(' ').replace(/[^A-Z0-9 .\/,()\-]/g, '').replace(/\s{2,}/g, ' ').replace(/[\s.,]+$/, '').trim();
    if (t.length > 3) al.push(t);
  }
  o.alamat = al.join(', ');
  // Pecah sedapatnya ke susunan KTP: baris 1 = jalan + RT/RW, baris 2 = kel/kec, baris 3 = kota/provinsi
  const b1 = al[0] || '', rt = b1.match(/RT\.?\s*(\d{1,3})\s*RW\.?\s*(\d{1,3})/i);
  o.bagian = {
    alamat: b1.replace(/RT\.?\s*\d{1,3}\s*RW\.?\s*\d{1,3}/i, '').replace(/[\s,]+$/, '').trim(),
    rtrw: rt ? rt[1].padStart(3, '0') + '/' + rt[2].padStart(3, '0') : '',
    kel: al[1] || '', kec: '', kota: al[2] || '', prov: '',
  };
  return o;
}

// ---------- pembacaan pita per label (KTP) ----------
// Tiap nilai dibaca dari pita di kanan labelnya dengan aturan huruf yang sesuai,
// dalam beberapa varian pra-pemrosesan; hasil berkeyakinan tertinggi yang dipakai.
const LABEL_KTP = {
  nik: /^N\W*I\W*K$/i, nama: /^Nama$/i, alamat: /^Alamat$/i, rtrw: /^R\W*T\W*\/?\W*R\W*W\w*$/i,
  kel: /^Kel\W*Desa$/i, kec: /^Kecamatan$/i,
};
const WL_KTP = {
  nik: '0123456789', rtrw: '0123456789/', nama: "ABCDEFGHIJKLMNOPQRSTUVWXYZ '.,-",
  alamat: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /.,-', kel: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ', kec: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ',
};

function potongPitaLabel(abu, kata, faktor, mode) {
  const { x1, y0, y1 } = kata.bbox, h = y1 - y0;
  const sx = x1 + Math.round(h * 0.3), sy = Math.max(0, y0 - Math.round(h * 0.55));
  const sw = Math.max(10, Math.round(abu.width * 0.70) - sx), sh = Math.min(abu.height, y1 + Math.round(h * 0.55)) - sy;
  const out = document.createElement('canvas'); out.width = sw * faktor; out.height = sh * faktor;
  const ctx = out.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(abu, sx, sy, sw, sh, 0, 0, out.width, out.height);
  if (mode !== 'abu') {
    const d = ctx.getImageData(0, 0, out.width, out.height), p = d.data;
    if (mode === 'auto') {          // regang kontras: 2% tergelap -> 0, 2% terterang -> 255
      const hist = new Array(256).fill(0); for (let i = 0; i < p.length; i += 4) hist[p[i]] += 1;
      const n = p.length / 4; let lo = 0, hi = 255, c = 0;
      for (let v = 0; v < 256; v++) { c += hist[v]; if (c > n * 0.02) { lo = v; break; } }
      c = 0; for (let v = 255; v >= 0; v--) { c += hist[v]; if (c > n * 0.02) { hi = v; break; } }
      const r = Math.max(1, hi - lo);
      for (let i = 0; i < p.length; i += 4) { const v = Math.max(0, Math.min(255, (p[i] - lo) * 255 / r)); p[i] = p[i + 1] = p[i + 2] = v; }
    } else if (mode === 'otsu') {   // hitam-putih
      for (let i = 0; i < p.length; i += 4) { const v = p[i] > 150 ? 255 : 0; p[i] = p[i + 1] = p[i + 2] = v; }
    }
    ctx.putImageData(d, 0, 0);
  }
  return out;
}

async function bacaPitaTerbaik(w, abu, kata, wl, onLangkah) {
  const varian = [[2, 'abu'], [3, 'abu'], [3, 'auto'], [3, 'otsu']];
  const hasil = [];
  await w.setParameters({ tessedit_char_whitelist: wl, tessedit_pageseg_mode: '7' });
  for (const [f, mode] of varian) {
    try {
      const r = await w.recognize(potongPitaLabel(abu, kata, f, mode));
      const kataOk = ((r.data && r.data.words) || []).filter(x => x.text && x.text.trim() && x.confidence >= 0);
      const teks = kataOk.map(x => x.text).join(' ').replace(/^[\s:.\-]+/, '').replace(/\s{2,}/g, ' ').trim();
      const conf = kataOk.length ? kataOk.reduce((a, x) => a + x.confidence, 0) / kataOk.length : 0;
      if (teks) hasil.push({ teks, conf });
    } catch {}
    if (onLangkah) onLangkah();
  }
  return hasil;
}

// Pilih NIK terbaik dari sejumlah kandidat: harus 16 digit & masuk akal;
// bila beberapa memenuhi, yang paling sepakat dengan kandidat lain per posisi
function pilihNIK(kandidat) {
  const layak = [...new Set(kandidat.filter(k => k && k.length === 16))];
  const valid = layak.filter(nikMasukAkal);
  const pool = valid.length ? valid : layak;
  if (!pool.length) return { nik: '', ragu: [] };
  const skor = k => pool.reduce((a, o) => a + [...k].filter((c, i) => c === o[i]).length, 0);
  const terbaik = pool.sort((a, b) => skor(b) - skor(a))[0];
  const ragu = [];
  for (let i = 0; i < 16; i++) if (pool.some(o => o[i] !== terbaik[i])) ragu.push(i);
  return { nik: terbaik, ragu: valid.length === 1 && layak.length > 1 ? [] : ragu };
}

// ---------- antarmuka ----------
// jenis 'ktp'  -> { nik, nikRagu:[posisi], nama, alamatKtp, teks }
// jenis 'npwp' -> { npwp, nik, nama, alamat, teks }
export async function bacaKartu(file, jenis, onProgress) {
  const w = await ambilWorker(onProgress);
  const cv = await siapkanCitra(file);
  await w.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '6' });
  const { data } = await w.recognize(cv);
  const teks = (data && data.text) || '';

  if (jenis === 'npwp') { lapor = null; return { ...uraiNPWP(teks), teks }; }

  const k = uraiKTP(teks);
  const nikPenuh = k.nikBaris.length >= 16 ? k.nikBaris.slice(0, 16) : '';
  const kandidatNIK = [];   // dari pita khusus angka — didahulukan atas hasil baca penuh
  const bagian = { alamat: k.alamat, rtrw: k.rtrw, kel: k.kel, kec: k.kec, kota: k.kota, prov: k.prov };
  let nama = k.nama;
  const kataSemua = (data && data.words) || [];
  const abu = cv.abu || cv;
  // Pembacaan per pita: label ditemukan dari kotak kata hasil baca penuh
  const label = {};
  for (const [kunci, re] of Object.entries(LABEL_KTP)) {
    const kata = kataSemua.find(x => x.bbox && re.test((x.text || '').trim()));
    if (kata) label[kunci] = kata;
  }
  const total = Object.keys(label).length * 4; let langkah = 0;
  const maju = () => { langkah += 1; if (lapor) lapor(60 + Math.round(langkah / Math.max(1, total) * 40)); };
  for (const [kunci, kata] of Object.entries(label)) {
    const hasil = await bacaPitaTerbaik(w, abu, kata, WL_KTP[kunci], maju);
    if (!hasil.length) continue;
    if (kunci === 'nik') { hasil.forEach(h => { const d = h.teks.replace(/\D/g, ''); if (d.length === 16) kandidatNIK.push(d); }); continue; }
    const terbaik = hasil.sort((a, b) => b.conf - a.conf)[0];
    if (kunci === 'rtrw') { const m = terbaik.teks.match(/(\d{3})\s*\/?\s*(\d{3})/); if (m) bagian.rtrw = m[1] + '/' + m[2]; continue; }
    if (terbaik.conf < 30 && (kunci === 'nama' ? nama : bagian[kunci])) continue;   // hasil lemah tidak menimpa baca penuh
    const bersih = terbaik.teks.replace(/\s{2,}/g, ' ').trim();
    if (kunci === 'nama') nama = bersih; else bagian[kunci] = bersih;
  }
  await w.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '6' });
  let { nik, ragu } = pilihNIK([...kandidatNIK, nikPenuh]);
  if (nik && !nikMasukAkal(nik)) ragu = ragu.length ? ragu : [-1];   // -1 = struktur tidak wajar
  const rt = bagian.rtrw ? 'RT ' + bagian.rtrw.split('/')[0] + ' RW ' + bagian.rtrw.split('/')[1] : '';
  const alamatKtp = [bagian.alamat, rt, bagian.kel ? 'Kel. ' + bagian.kel : '', bagian.kec ? 'Kec. ' + bagian.kec : '', bagian.kota, bagian.prov].filter(Boolean).join(', ');
  lapor = null;
  return { nik, nikRagu: ragu, nama, alamatKtp, bagian, teks };
}

// Kompatibilitas dengan pemanggil lama
export async function bacaNomor(file, jenis, onProgress) {
  const r = await bacaKartu(file, jenis, onProgress);
  return { nomor: jenis === 'ktp' ? r.nik : r.npwp, teks: r.teks };
}
