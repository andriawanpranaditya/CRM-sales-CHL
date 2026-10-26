// ===== Standar Follow Up Wajib Sales =====
// Dipakai bersama oleh server (validasi & jadwal) dan form Follow Up (panel jadwal & rekomendasi pesan).
//
// JALUR
//   'baru'      : lead baru (sejak dioper ke sales / diinput). Selama konsumen BELUM membalas:
//                 Hari 1, 2, 3 (berturut-turut), Hari 5, Hari 7, lalu undangan visit setiap KAMIS
//                 untuk weekend selama 4 minggu berikutnya  → total 9 sentuhan.
//   'openhouse' : lead lama aktif (saat aturan diberlakukan) → undangan Open House weekend setiap Kamis, 4 minggu.
//   'lama'      : lead lama yang sudah Appointment / Site Visit → langsung mode percakapan.
// MODE
//   'wajib'      sentuhan Hari 1–7       · 'undangan'  undangan weekend (Kamis)
//   'percakapan' konsumen sudah membalas → FU berikutnya wajib dijadwalkan maksimal 7 hari
//   'tuntas'     9 sentuhan tanpa balasan → sales wajib memilih Drop atau Nurture bulanan
//   'nurture'    kabar bulanan (30 hari)
// Konsumen yang sudah membalas lalu diam 2 kali FU berturut-turut → kembali ke undangan weekend (4 Kamis).
import { BIO_TIPE, BIO_STANDAR, BIO_PL, BIO_PROMO, PERMAI, PERMAI_PL } from './pricelist';

export const HARI_WAJIB = [0, 1, 2, 4, 6];             // offset Hari 1, 2, 3, 5, 7
export const LABEL_HARI = ['Hari 1', 'Hari 2', 'Hari 3', 'Hari 5', 'Hari 7'];
export const JUMLAH_UNDANGAN = 4;
export const TOTAL_SENTUHAN = HARI_WAJIB.length + JUMLAH_UNDANGAN; // 9
export const MAKS_HARI_PERCAKAPAN = 7;
export const STATUS_SELESAI = ['Booking', 'Closing', 'Drop', 'Lost'];
export const NURTURE = 'Nurture bulanan';
export const ALASAN_TUNTAS = 'Tidak ada respon setelah 9 sentuhan';
// Drop sebelum jadwal tuntas (lead belum pernah membalas) hanya untuk alasan berikut
export const ALASAN_DROP_DINI = ['Nomor tidak aktif / salah sambung', 'Minta tidak dihubungi lagi', 'Sudah beli di tempat lain', 'Bukan calon pembeli (agent / tanya lowongan)'];
export const ALASAN_DROP_LAIN = ['Budget tidak sesuai', 'Lokasi tidak sesuai', 'Hanya bertanya / tidak berminat'];

// ---------- tanggal (string YYYY-MM-DD, zona WIB) ----------
// WIB = UTC+7 tanpa musim panas → dihitung aritmetika. TIDAK memakai Intl 'en-CA': di sebagian iPhone (pengaturan
// region/kalender/format tanggal tertentu) hasil Intl bukan YYYY-MM-DD sehingga perhitungan tanggal gagal ("Invalid Date").
const keWIB = d => new Date(d.getTime() + 7 * 3600000);
export const tglWIBdari = d => { const t = d instanceof Date ? d : new Date(d); return isNaN(t) ? null : keWIB(t).toISOString().slice(0, 10); };
export const hariIniWIB = () => keWIB(new Date()).toISOString().slice(0, 10);
// Tanggal wajar 'YYYY-MM-DD' (tahun 2000–2100). Data dengan tanggal salah ketik (mis. tahun 20266) atau format aneh
// dianggap kosong — TIDAK boleh membuat halaman crash ("Invalid Date" di iPhone/Safari).
const TGL_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const tglValid = t => { const m = TGL_RE.exec(t || ''); return !!m && +m[1] >= 2000 && +m[1] <= 2100 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 && !isNaN(Date.parse(t + 'T00:00:00Z')); };
export function keTgl(x) {
  try {
    if (!x) return null;
    let t = null;
    if (x instanceof Date) t = isNaN(x) ? null : x.toISOString().slice(0, 10);
    else {
      const s = String(x).trim();
      if (TGL_RE.test(s)) t = s;
      else if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?Z$/.test(s)) t = s.slice(0, 10); // kolom date dari JSON
      else {
        const d = new Date(/^\d{4}-\d{2}-\d{2} /.test(s) ? s.replace(' ', 'T') : s); // Safari tidak bisa membaca "YYYY-MM-DD HH:MM"
        t = isNaN(d) ? s.slice(0, 10) : tglWIBdari(d);
      }
    }
    return tglValid(t) ? t : null;
  } catch { return null; }
}
export const tambahHari = (t, n) => {
  const ms = Date.parse((tglValid(t) ? t : hariIniWIB()) + 'T00:00:00Z') + n * 86400000;
  return isNaN(ms) ? hariIniWIB() : new Date(ms).toISOString().slice(0, 10);
};
const hariMinggu = t => new Date((tglValid(t) ? t : hariIniWIB()) + 'T00:00:00Z').getUTCDay(); // 0 Minggu … 4 Kamis
export const kamisMulai = t => tambahHari(t, (4 - hariMinggu(t) + 7) % 7);        // Kamis ≥ t
export const kamisSetelah = t => tambahHari(t, ((4 - hariMinggu(t) + 7) % 7) || 7); // Kamis > t
const maks = (a, b) => (a > b ? a : b);
export const selisihHari = (a, b) => (tglValid(a) && tglValid(b)) ? Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000) : 0;
export const fmtTglPanjang = t => tglValid(t) ? new Date(t + 'T00:00:00Z').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '-';

// ---------- riwayat ----------
// Sentuhan sales = follow up oleh siapa pun selain Marcom & balasan otomatis WA, bukan catatan "Leads to Sales",
// sejak tanggal mulai jadwal. riwayat boleh berisi FU semua lead (difilter berdasarkan lead_code).
export function sentuhanSales(lead, riwayat, mulai) {
  return (riwayat || [])
    .filter(f => f.lead_code === lead.lead_code)
    .filter(f => (f.oleh_role || '') !== 'markom' && f.created_by !== 'auto-wa' && !String(f.detail || '').startsWith('Leads to Sales'))
    .map(f => ({ ...f, _tgl: keTgl(f.tgl) || keTgl(f.created_at) }))
    .filter(f => !mulai || (f._tgl && f._tgl >= mulai))
    .sort((a, b) => (a.id || 0) - (b.id || 0));
}
export const mulaiJadwal = lead => keTgl(lead.fu_mulai) || keTgl(lead.created_at) || keTgl(lead.tgl) || hariIniWIB();

// ---------- inti: posisi lead dalam jadwal ----------
export function statusFU(lead, riwayat, today = hariIniWIB()) {
  try { return statusFUInti(lead, riwayat, today); } catch (e) { return { aktif: false, mode: 'tidak', error: String(e && e.message || e) }; }
}
function statusFUInti(lead, riwayat, today) {
  if (!lead || !String(lead.sales || '').trim() || STATUS_SELESAI.includes(lead.status)) return { aktif: false, mode: 'tidak' };
  const jalur = lead.fu_jalur || 'baru';
  const mulai = mulaiJadwal(lead);
  const r = sentuhanSales(lead, riwayat, mulai);
  const n = r.length;
  const last = r[n - 1] || null;
  const tLast = last ? last._tgl : null;
  const dasar = { aktif: true, jalur, mulai, nFu: n, terakhir: tLast, ke: n + 1, total: TOTAL_SENTUHAN };
  const hasil = o => ({ ...dasar, ...o, telat: o.jatuh ? selisihHari(today, o.jatuh) : 0 });

  if (last && last.next_action === NURTURE) return hasil({ mode: 'nurture', jenis: 'nurture', jatuh: tambahHari(tLast, 30), label: 'Nurture bulanan', tujuan: 'Kabar bulanan: promo, progres, info baru' });

  let iBalas = -1;
  r.forEach((f, i) => { if (f.balas === true) iBalas = i; });
  const pernahBalas = iBalas >= 0;

  if (pernahBalas || jalur === 'lama') {
    const diam = pernahBalas ? n - 1 - iBalas : 0;
    if (diam < 2) {
      const dasarTgl = tLast || mulai;
      return hasil({ mode: 'percakapan', jenis: 'percakapan', pernahBalas, jatuh: keTgl(lead.next_fu) || tambahHari(dasarTgl, MAKS_HARI_PERCAKAPAN),
        batas: tambahHari(maks(today, dasarTgl), MAKS_HARI_PERCAKAPAN), label: 'Mode percakapan', tujuan: 'Lanjutkan percakapan sampai jadwal kunjungan' });
    }
    const sudah = diam - 2; // undangan ulang yang sudah dikirim
    if (sudah >= JUMLAH_UNDANGAN) return hasil({ mode: 'tuntas', jenis: 'tuntas', pernahBalas, jatuh: tambahHari(tLast, 7), label: 'Jadwal tuntas', tujuan: 'Putuskan: Drop atau Nurture bulanan' });
    return hasil({ mode: 'undangan', jenis: 'undangan', pernahBalas, undanganKe: sudah + 1, jatuh: kamisSetelah(tLast),
      label: `Undangan visit ${sudah + 1} dari ${JUMLAH_UNDANGAN} (konsumen diam lagi)`, tujuan: 'Undang visit weekend' });
  }

  if (jalur === 'openhouse') {
    if (n >= JUMLAH_UNDANGAN) return hasil({ mode: 'tuntas', jenis: 'tuntas', jatuh: tambahHari(tLast, 7), label: 'Jadwal tuntas', tujuan: 'Putuskan: Drop atau Nurture bulanan', total: JUMLAH_UNDANGAN });
    const jatuh = n === 0 ? kamisMulai(mulai) : kamisSetelah(tLast);
    return hasil({ mode: 'undangan', jenis: 'openhouse', undanganKe: n + 1, total: JUMLAH_UNDANGAN, jatuh,
      label: `Undangan Open House ${n + 1} dari ${JUMLAH_UNDANGAN}`, tujuan: 'Undang Open House weekend' });
  }

  // jalur baru, konsumen belum pernah membalas
  if (n < HARI_WAJIB.length) {
    const jadwal = tambahHari(mulai, HARI_WAJIB[n]);
    const jatuh = n === 0 ? jadwal : maks(jadwal, tambahHari(tLast, 1));
    return hasil({ mode: 'wajib', jenis: ['h1', 'h2', 'h3', 'h5', 'h7'][n], jatuh,
      label: `Sentuhan ${n + 1} dari ${TOTAL_SENTUHAN} · ${LABEL_HARI[n]}`, tujuan: TUJUAN[['h1', 'h2', 'h3', 'h5', 'h7'][n]] });
  }
  if (n < TOTAL_SENTUHAN) {
    const k = n - HARI_WAJIB.length;
    const jadwal = tambahHari(kamisSetelah(tambahHari(mulai, 6)), 7 * k);
    return hasil({ mode: 'undangan', jenis: 'undangan', undanganKe: k + 1, jatuh: maks(jadwal, kamisSetelah(tLast)),
      label: `Sentuhan ${n + 1} dari ${TOTAL_SENTUHAN} · Undangan visit ${k + 1} dari ${JUMLAH_UNDANGAN}`, tujuan: TUJUAN.undangan });
  }
  return hasil({ mode: 'tuntas', jenis: 'tuntas', jatuh: tambahHari(tLast, 7), label: 'Jadwal tuntas (9 sentuhan)', tujuan: 'Putuskan: Drop atau Nurture bulanan' });
}

export const TUJUAN = {
  h1: 'Lanjutkan topik konsumen, perkenalan, satu pertanyaan kebutuhan (maks. 1 jam setelah diterima)',
  h2: 'Info spesifik sesuai minat: tipe, harga, simulasi cicilan',
  h3: 'Bukti nyata: foto/video unit & kawasan, pertanyaan ringan',
  h5: 'Sudut baru: promo berlaku / simulasi KPR personal, tawarkan telepon singkat',
  h7: 'Tanya preferensi: masih mencari? lebih nyaman dihubungi kapan/lewat apa',
  undangan: 'Undangan visit weekend (dikirim Kamis) — 2 pilihan jam + share lokasi',
};

// Daftar jadwal lengkap (untuk garis waktu di form & halaman kepatuhan)
export function rencanaJadwal(lead, riwayat) {
  try { return rencanaJadwalInti(lead, riwayat); } catch { return []; }
}
function rencanaJadwalInti(lead, riwayat) {
  const jalur = lead.fu_jalur || 'baru';
  const mulai = mulaiJadwal(lead);
  const r = sentuhanSales(lead, riwayat, mulai);
  const list = [];
  if (jalur === 'openhouse') {
    for (let k = 0; k < JUMLAH_UNDANGAN; k++) list.push({ label: 'Open House ' + (k + 1), tgl: tambahHari(kamisMulai(mulai), 7 * k) });
  } else if (jalur === 'baru') {
    HARI_WAJIB.forEach((o, i) => list.push({ label: LABEL_HARI[i], tgl: tambahHari(mulai, o) }));
    const k0 = kamisSetelah(tambahHari(mulai, 6));
    for (let k = 0; k < JUMLAH_UNDANGAN; k++) list.push({ label: 'Undangan ' + (k + 1), tgl: tambahHari(k0, 7 * k) });
  }
  return list.map((x, i) => ({ ...x, selesai: !!r[i], tglFu: r[i] ? r[i]._tgl : null, balas: r[i] ? r[i].balas : null }));
}

// ---------- aturan status ----------
// Hasil: { status, otomatis: bool, error: string|null }
export function aturStatus({ ke, balas, statusDipilih, statusLead }) {
  const st = statusDipilih || statusLead || 'New';
  if (balas === true && st === 'New') return { status: st, error: 'Konsumen membalas — status tidak boleh tetap New. Pilih status sesuai perkembangan (mis. Warm).' };
  if (balas === false && ke >= 2 && st === 'New') return { status: 'Cold', otomatis: true, error: null };
  return { status: st, error: null };
}

// ---------- kepatuhan (per FU: dikerjakan sebelum/tepat jatuh tempo?) ----------
export function riwayatKepatuhan(lead, riwayat) {
  try { return riwayatKepatuhanInti(lead, riwayat); } catch { return []; }
}
function riwayatKepatuhanInti(lead, riwayat) {
  const mulai = mulaiJadwal(lead);
  const r = sentuhanSales(lead, riwayat, mulai);
  const out = [];
  for (let i = 0; i < r.length; i++) {
    const st = statusFU({ ...lead, status: 'New', next_fu: null }, r.slice(0, i), r[i]._tgl);
    if (!st.aktif || st.mode === 'percakapan' || st.mode === 'nurture' || st.mode === 'tuntas') continue;
    out.push({ tgl: r[i]._tgl, jatuh: st.jatuh, tepat: r[i]._tgl <= st.jatuh });
  }
  return out;
}

// ============ Penyusun pesan rekomendasi (dari riwayat lead) ============
const rpJuta = n => 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' juta';
const rpHarga = n => n >= 1e9 ? 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M' : rpJuta(n);
const salamJam = (d = new Date()) => { const h = keWIB(d).getUTCHours(); return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam'; };
const kunciProyek = p => /permai/i.test(p || '') ? 'permai' : /bio/i.test(p || '') ? 'bio' : null;
const namaProyek = p => kunciProyek(p) === 'bio' ? 'Bio District' : kunciProyek(p) === 'permai' ? 'Permai Indah' : (p || 'project kami');

// Info proyek diambil dari price list resmi (lib/pricelist) — bukan teks promo yang ditanam di template
function infoProyek(key, tipe) {
  if (key === 'bio') {
    const t = BIO_TIPE[String(tipe || '').replace(/tipe\s*/i, '').trim().toUpperCase()] || BIO_TIPE.A || BIO_STANDAR[0];
    return {
      harga: `Tipe ${t.tipe} (LB ${t.lb} m² / LT ${t.lt} m²) mulai *${rpHarga(t.standar)}*`,
      cicil: `ilustrasi KPR bunga ${BIO_PL.bunga || '2,75%'} sekitar *${rpJuta(t.cicil[0])}/bulan* (tenor ${(BIO_PL.tenor || [25])[0]} tahun)`,
      promo: `promo *${BIO_PROMO.judul}* (${BIO_PROMO.periode.split('·')[0].trim()}) — hadiah langsung: Tipe A ${BIO_PROMO.hadiah.A}, Tipe B ${BIO_PROMO.hadiah.B}, Tipe C ${BIO_PROMO.hadiah.C}`,
      bukti: 'hanya *63 unit* dengan konsep resort living, unit *ready* siap huni, ±3 menit ke Stasiun KRL Rawa Buntu',
      acara: '*Open House – Grand Rewards Weekend*', tempat: 'Marketing Gallery Bio District', waktu: 'Sabtu–Minggu pukul 10.00–16.00',
      jam: ['10.00', '14.00'],
    };
  }
  if (key === 'permai') {
    return {
      harga: `rumah LT ${PERMAI.lt} mulai *${rpJuta(PERMAI.harga)}*, booking fee hanya Rp${PERMAI.bf.toLocaleString('id-ID')}`,
      cicil: `cicilan KPR BTN subsidi sekitar *${rpJuta(PERMAI_PL.cicil[20])}/bulan* (tenor 20 tahun)`,
      promo: `KPR subsidi BTN dengan booking fee Rp${PERMAI.bf.toLocaleString('id-ID')} dan cicilan mulai ${rpJuta(PERMAI_PL.cicil[20])}/bulan`,
      bukti: 'rumah tapak LT 60 m², hanya ±4 menit ke Stasiun KRL Cilejit',
      acara: '*Open House*', tempat: 'Marketing Gallery Permai Indah', waktu: 'Sabtu–Minggu',
      jam: ['10.00', '14.00'],
    };
  }
  return { harga: 'harga & simulasi terbaru', cicil: 'simulasi cicilan sesuai budget', promo: 'program penjualan yang sedang berjalan', bukti: 'foto dan video unit', acara: '*Open House*', tempat: 'kantor pemasaran kami', waktu: 'Sabtu–Minggu', jam: ['10.00', '14.00'] };
}

// Sudut pesan dari riwayat: objection, catatan, konteks oper, ringkasan chat AI
export function sudutLead(lead, riwayat, konteks = '') {
  const teks = [lead.catatan, lead.ai_ringkasan, konteks, ...(riwayat || []).filter(f => f.lead_code === lead.lead_code).map(f => (f.objection || '') + ' ' + (f.detail || ''))].join(' ').toLowerCase();
  const budget = Number(lead.budget) || 0;
  return {
    harga: /harga|mahal|budget|dp\b|uang muka|angsur|cicil|kpr|bunga/.test(teks) || /kpr/i.test(lead.bayar || ''),
    keluarga: /istri|suami|keluarga|pasangan|orang ?tua|anak/.test(teks),
    lokasi: /jauh|lokasi|akses|macet|stasiun|krl|transport/.test(teks),
    investasi: /investasi|sewa|disewakan/.test(teks + ' ' + (lead.tujuan || '').toLowerCase()),
    budgetRendah: kunciProyek(lead.project) === 'bio' && budget > 0 && budget < 1e9,
    walkin: /walk/i.test(lead.sumber || ''),
  };
}

function hariWeekend(today) {
  const sabtu = tambahHari(today, (6 - hariMinggu(today) + 7) % 7); // Sabtu terdekat (≥ hari ini)
  const minggu = tambahHari(sabtu, 1);
  const f = t => new Date(t + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return { sabtu: f(sabtu), minggu: f(minggu) };
}

// Konteks yang ditanyakan konsumen saat dioper Marcom (dari catatan "Leads to Sales → … · Konteks: …")
export function konteksOper(lead, riwayat) {
  const h = (riwayat || []).filter(f => f.lead_code === lead.lead_code && String(f.detail || '').startsWith('Leads to Sales')).sort((a, b) => (b.id || 0) - (a.id || 0))[0];
  const m = h ? /Konteks:\s*([\s\S]+)$/.exec(String(h.detail || '')) : null;
  return m ? m[1].trim() : '';
}

export function susunPesan(arg) {
  try { return susunPesanInti(arg); } catch { return ''; }
}
function susunPesanInti({ lead, riwayat, st, salesNama, today = hariIniWIB() }) {
  if (!lead || !st || !st.aktif || st.mode === 'tuntas') return '';
  const key = kunciProyek(lead.project), P = namaProyek(lead.project), I = infoProyek(key, lead.tipe);
  const konteks = konteksOper(lead, riwayat);
  const s = sudutLead(lead, riwayat, konteks);
  const nama = (lead.nama || '').split(' ')[0] || '';
  const sapa = `Selamat ${salamJam()} Kak ${nama}`.trim();
  const saya = salesNama ? `Saya ${salesNama}, konsultan properti ${P}` : `Saya konsultan properti ${P}`;
  const dariMarcom = !!konteks;
  const alt = s.budgetRendah ? `\n\nKalau Kakak mencari pilihan dengan cicilan lebih ringan, kami juga punya *Permai Indah* — ${infoProyek('permai').harga}, ${infoProyek('permai').cicil}.` : '';
  const wk = hariWeekend(today);
  const pilihJam = `Lebih nyaman *Sabtu ${wk.sabtu}* atau *Minggu ${wk.minggu}*, jam ${I.jam[0]} atau ${I.jam[1]}?`;

  switch (st.jenis) {
    case 'h1':
      if (s.walkin) return `${sapa} 🙏\n\n${saya}. Terima kasih sudah berkunjung ke ${P}. Dari unit yang Kakak lihat, mana yang paling berkesan?\n\nNanti saya siapkan simulasi cara bayarnya supaya Kakak bisa bandingkan dengan tenang.`;
      if (dariMarcom) return `${sapa} 🙏\n\n${saya} — melanjutkan chat Kakak dengan admin kami soal *${konteks}*.\n\n${s.harga ? `Sebagai gambaran, ${I.harga}, ${I.cicil}.` : `Singkatnya, ${I.bukti}.`}\n\nSupaya info yang saya kirim pas, rencananya untuk ditempati sendiri atau investasi, Kak?`;
      return `${sapa} 🙏\n\n${saya}. Terima kasih sudah tertarik dengan ${P}${lead.sumber ? ' (melalui ' + lead.sumber + ')' : ''}.\n\nSupaya info yang saya kirim pas, boleh tahu rencananya untuk ditempati sendiri atau investasi, Kak?`;
    case 'h2':
      if (s.walkin) return `${sapa} 🙏\n\nSesuai kunjungan kemarin, saya rangkum ya Kak: ${I.harga}, ${I.cicil}.${alt}\n\nMau saya hitungkan simulasi sesuai uang muka & cicilan yang nyaman untuk Kakak?`;
      return `${sapa} 🙏\n\nSaya kirimkan info ringkas ${P} ya Kak: ${I.harga}, ${I.cicil}.${alt}\n\n${s.harga ? 'Berapa kisaran cicilan per bulan yang nyaman untuk Kakak? Saya carikan tipe & skema yang pas.' : 'Mau saya buatkan simulasi sesuai budget Kakak?'}`;
    case 'h3':
      return `${sapa} 🙏\n\nSaya lampirkan foto & video unit serta suasana kawasan ${P} ya Kak 🏡 — ${I.bukti}.${s.lokasi ? '\n\nSaya juga bisa kirimkan video rute dan share lokasi supaya Kakak bisa lihat aksesnya.' : ''}${s.keluarga ? '\n\nMateri ini mudah diteruskan ke keluarga untuk didiskusikan bersama.' : ''}\n\nBoleh saya kirimkan juga denahnya, Kak? Cukup balas *YA*.`;
    case 'h5':
      return `${sapa} 🙏\n\nAda info baru yang mungkin pas untuk Kakak: ${I.promo}.${s.harga ? `\n\nKalau dihitung per bulan, ${I.cicil} — bisa saya sesuaikan dengan uang muka yang Kakak siapkan.` : ''}\n\nKalau lebih praktis, boleh saya telepon 5 menit untuk jelaskan simulasinya? Kapan waktu yang pas, Kak?`;
    case 'h7':
      return `${sapa} 🙏\n\nSaya tidak ingin mengganggu, Kak. Boleh dibalas angka saja ya:\n1️⃣ Masih mencari rumah — kirimkan info terbaru\n2️⃣ Lebih nyaman ditelepon\n3️⃣ Sedang tidak mencari dulu\n\nTerima kasih banyak 🙏`;
    case 'undangan':
    case 'openhouse': {
      const k = st.undanganKe || 1;
      const buka = st.jenis === 'openhouse' && k === 1 ? `${sapa} 🙏\n\nSemoga Kakak sehat selalu. Weekend ini ${P} mengadakan *Open House* dan saya ingin mengundang Kakak secara khusus.`
        : `${sapa} 🙏\n\nWeekend ini ada ${I.acara} di ${I.tempat} (${I.waktu}).`;
      const isi = [
        `Kakak bisa lihat langsung unit contoh dan suasana kawasannya — ${I.bukti}.`,
        `Kunjungan paling enak sambil ajak keluarga atau pasangan, supaya bisa diputuskan bersama. Anak-anak juga bisa ikut 😊`,
        `Saya siapkan simulasi cicilan khusus untuk Kakak, jadi saat datang tinggal dicocokkan dengan kebutuhan — ${I.cicil}.`,
        `Ini undangan terakhir saya di bulan ini, Kak. ${I.promo.charAt(0).toUpperCase() + I.promo.slice(1)}.`,
      ];
      const urut = s.keluarga ? [1, 0, 2, 3] : s.harga ? [2, 0, 1, 3] : [0, 1, 2, 3];
      const lok = s.lokasi ? '\n\nSaya kirimkan share lokasi & rutenya ya Kak.' : '';
      return `${buka}\n\n${isi[urut[(k - 1) % 4]]}${lok}\n\n${pilihJam} Saya siapkan jadwalnya 🙏`;
    }
    case 'nurture':
      return `${sapa} 🙏\n\nSekadar kabar bulan ini dari ${P}: ${I.promo}.\n\nKalau Kakak sedang mempertimbangkan rumah lagi, saya siap bantu kapan saja 🙏`;
    case 'percakapan':
    default: {
      const lastFu = (riwayat || []).filter(f => f.lead_code === lead.lead_code).sort((a, b) => (b.id || 0) - (a.id || 0))[0];
      const topik = lastFu && lastFu.objection ? ' soal ' + lastFu.objection : '';
      return `${sapa} 🙏\n\nMenyambung obrolan kita sebelumnya${topik}. ${s.harga ? `Saya sudah siapkan simulasi: ${I.cicil}.` : `Ada info terbaru: ${I.promo}.`}\n\nKalau berkenan, kita jadwalkan kunjungan ya Kak. ${pilihJam}`;
    }
  }
}
