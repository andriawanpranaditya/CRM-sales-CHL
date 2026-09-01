'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, waLink, bukaWA, todayISO, fmtDate, reminder, BADGE } from '@/components/util';

const EMPTY = { tgl: '', nama: '', wa: '', email: '', domisili: '', kerja: '', sumber: '', walkin_info: '', project: '', tipe: '', tujuan: '', budget: '', bayar: '', sales: '', status: 'New', catatan: '', next_fu: '' };
const WALKIN_INFO = ['Banner / Spanduk', 'Website', 'Instagram', 'Facebook Ads', 'Google Ads', 'Tiktok', 'WhatsApp', 'Referral', 'Pameran / Event', 'Kanvasing', 'Marketplace Properti', 'Lainnya'];

// ===== Template Follow Up Markom (sumber: template_FU.docx) =====
// ===== Template FU Sales untuk lead baru tanpa respon: Day-1 / Day-3 / Day-7 =====
const TSALES = {
  bio: {
    nama: 'BIO District Serpong', harga: 'Rp1,55 Miliar, unit ready stock',
    unggul: [
      'Hanya *63 private residences* dengan konsep resort living — clubhouse, jogging track & BBQ area di tengah lingkungan hijau 🌿',
      'Lokasi di jantung Serpong: *3 menit ke Stasiun Rawa Buntu*, dekat AEON Mall, The Breeze, QBIG & ICE BSD, serta sekolah ternama (Sinarmas World Academy, BINUS, Prasetiya Mulya)',
      '*Booking fee hanya Rp5 juta, DP 0%* (subsidi DP 10%), ilustrasi KPR bunga 2,75% mulai ±Rp7,2 juta/bulan',
    ],
  },
  permai: {
    nama: 'Permai Indah Cilejit', harga: 'Rp185 juta',
    unggul: [
      '*TANPA DP*, biaya KPR, Notaris & AJB *GRATIS* — angsuran seringan biaya kontrakan ✅',
      'Hanya *4 menit ke Stasiun KRL Cilejit*, 45 menit ke Tanah Abang, 15 menit ke Serpong — pasar & SD hanya selangkah dari rumah',
      'Konsep *rumah tumbuh* LT 60 m² dengan 2 kamar tidur, lingkungan asri berpagar sawah lindung, hanya *164 unit* dengan legalitas jelas & akses satu pintu',
    ],
  },
};
function salamJam() { const h = new Date().getHours(); return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam'; }
function templateSalesDay(day, l) {
  const key = /bio/i.test(l.project || '') ? 'bio' : /permai/i.test(l.project || '') ? 'permai' : null;
  const P = key ? TSALES[key] : { nama: l.project || 'project kami', harga: null, unggul: [] };
  const nama = l.nama || 'Kak';
  if (day === 1) {
    return `Selamat ${salamJam()} Kak ${nama}, semoga hari ini menyenangkan 😊

Menindaklanjuti ketertarikan Kakak terhadap *${P.nama}*${P.harga ? ' (harga mulai *' + P.harga + '*)' : ''}, izinkan kami merangkum keunggulan utamanya:
${P.unggul.map(u => '• ' + u).join('\n')}

Apabila berkenan, kami dapat mengaturkan jadwal survey lokasi gratis atau simulasi KPR tanpa biaya di waktu yang Kakak tentukan. Cukup balas pesan ini, saya siap membantu. Terima kasih 🙏`;
  }
  if (day === 3) {
    return `Selamat ${salamJam()} Kak ${nama} 🙏

Ada informasi yang sayang untuk dilewatkan: saat ini *${P.nama}* memiliki program penawaran khusus yang berlaku terbatas untuk pembelian periode ini.

Apakah Kakak berkenan kami kirimkan detail penawarannya? Cukup balas *"YA"* pada pesan ini, dan saya akan menghubungi Kakak secara langsung.`;
  }
  return `Selamat ${salamJam()} Kak ${nama},

Kami memahami bahwa memilih hunian adalah keputusan penting yang memerlukan waktu dan pertimbangan matang. Karena itu, ini menjadi pesan terakhir dari kami agar tidak mengganggu kenyamanan Kakak 🙏

Kapan pun Kakak kembali mempertimbangkan *${P.nama}*, kami selalu siap melayani melalui nomor ini.

Terima kasih atas waktu dan kepercayaannya. Semoga senantiasa diberikan kesehatan dan kelancaran 🌿`;
}

// Next Action yang menghentikan jadwal FU (Tgl Next FU dimatikan)
const TANPA_NEXT = ['Drop', 'Reserved', 'Booking'];
const DAY_FU = ['Follow Up day-1', 'Follow Up day-3', 'Follow Up day-7', 'Follow Up day-21', 'Follow Up day-60', 'Reply'];
const TFU_BIO = {
  'Follow Up day-1': `Terima kasih sudah menghubungi BIO District 🌿

Hunian modern READY TO MOVE IN dengan konsep BIOphilic di Central Serpong yang mengutamakan ruang hijau, kenyamanan, dan akses strategis ke pusat kota, dirancang untuk kualitas hidup & nilai jangka panjang.

Our Concept,
https://youtu.be/YF9TM-EKebA?si=IwqrmGbKXumP9OGZ

Untuk info premium offers atau jadwal kunjungan, ketik: ✨INFO✨ dan kami akan bantu untuk mendapatkan hunian terbaik.

Don't miss the Golden Chance!`,
  'Follow Up day-3': `Halo Bapak/Ibu 😊
Kami ingin menyapa kembali terkait ketertarikan Anda dengan hunian BIO District 🌿

Kami dengan senang hati memberikan informasi lebih lanjut sesuai kebutuhan & preferensi Anda 🙌

Kunjungi Website kami untuk update premium offers terbaru https://biodistrictofficial.com/

Balas: INFO✨ dan kami akan bantu kirimkan informasi lebih lanjut 📲`,
  'Follow Up day-7': `Halo Bapak/Ibu, semoga kabar baik selalu untuk Anda 😊

Banyak dari calon penghuni kami awalnya hanya mencari rumah, namun akhirnya memilih tempat yang benar-benar bisa mendukung kualitas hidup, lebih tenang, lebih hijau, dan tetap dekat dengan pusat aktivitas.
https://youtu.be/ylxNy7EVryE?si=UXmDFPLkKJryDlJ5

Balas: INFO✨ dan kami akan bantu kirimkan informasi lebih lanjut 📲`,
  'Follow Up day-21': `*attach e-brosur*

Halo Bapak/Ibu 😊
Kami menyapa kembali dari BIO District 🌿

Kami ingin menginformasikan bahwa saat ini terdapat pembaruan terkait premium offers yang mungkin dapat menjadi pertimbangan Anda.
Agar tidak terlewat, kami mengundang Bapak/Ibu untuk datang langsung melihat show unit dan merasakan konsep BIOphilic Living yang kami hadirkan 🌿
Dengan kunjungan langsung, kami juga bisa bantu arahkan pilihan unit terbaik yang masih tersedia sesuai preferensi Bapak/Ibu.

📅 Apakah Bapak/Ibu berkenan untuk kami jadwalkan kunjungan dalam waktu dekat?😊

Terima kasih atas waktu dan perhatian Anda 🌿`,
  'Follow Up day-60': `Halo Bapak/Ibu 😊
Kami kembali menghubungi terkait hunian di BIO District 🌿

Kami kirimkan video virtual tour Type B untuk membantu Bapak/Ibu melihat langsung konsep ruang dan kenyamanan unit kami dari rumah.

Virtual tour Type B URL Link:
https://www.youtube.com/watch?si=1MoK1LuT-xKJE2sQ&v=zQEJXY9AHRo&feature=youtu.be

Video ini dapat membantu memberikan gambaran lebih jelas mengenai konsep BIOphilic Living yang kami hadirkan. Hunian yang dirancang untuk kenyamanan, ruang hijau, dan kualitas hidup yang lebih baik.

Jika setelah melihat videonya Bapak/Ibu tertarik untuk survey langsung ke show unit, kami dengan senang hati siap bantu jadwalkan kunjungan sesuai waktu yang fleksibel 😊

Balas VISIT✨ untuk detail unit tersedia atau penjadwalan visit.`,
  'Reply': `Halo Kak {nama}, hope you doing well👋
Terima kasih telah menghubungi BIO District Serpong🏡

Perkenalkan, saya {officer}, Relation Officer BIO District.
mohon lengkapi data berikut untuk kami kirimkan detail mengenai BIO District:
Nama lengkap :
Domisili :
tujuan pembelian (hunian / investasi):

Salam Hangat,
BIO District Serpong`,
};
const TFU_PERMAI = `Halo Bapak/Ibu, terima kasih atas minat Anda terhadap rumah di Permai Indah🏡
Sebagai bentuk apresiasi terhadap calon pemilik, berikut informasi terkait benefit & promo eksklusif yang sedang berlaku:
✅ Biaya KPR GRATIS
✅ Biaya Notaris GRATIS
✅ AJB GRATIS
✅ TANPA DP
Mohon bantuan untuk mengisi data berikut agar tim konsultasi rumah kami dapat segera menghubungi dan memberikan Anda informasi yang Anda inginkan:
Nama:
Domisili:
Tujuan Pembelian (Tempat Tinggal / Investasi):`;

export default function FormPage() {
  const [tab, setTab] = useState('lead');
  const [set, setSet] = useState(null);
  const [me, setMe] = useState(null);
  const [leads, setLeads] = useState([]);
  const [lead, setLead] = useState({ ...EMPTY, tgl: todayISO() });
  const [fu, setFu] = useState({ lead_code: '', tgl: todayISO(), detail: '', objection: '', next_action: '', next_tgl: '', wa_pesan: '' });
  const [l2s, setL2s] = useState({ lead_code: '', tgl: todayISO(), pesan: '', sales: '' });
  const [dup, setDup] = useState(null); // info lead duplikat dari server
  const [salesWA, setSalesWA] = useState([]);
  const [trx, setTrx] = useState({ lead_code: '', jenis: 'Booking', tgl: todayISO(), nilai: '', catatan: '', project: '', bayar: '', unit: '' });
  const [stok, setStok] = useState([]);
  const [berkas, setBerkas] = useState(null);
  const [upBusy, setUpBusy] = useState('');
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [fus, setFus] = useState([]);
  const [editId, setEditId] = useState(null);

  async function refresh() {
    const [s, l, u, f, st] = await Promise.all([api('/api/settings'), api('/api/leads'), api('/api/auth/me'), api('/api/followups'), api('/api/stock')]);
    setSet(s); setLeads(l); setMe(u); setFus(f); setStok(st.status || []);
    if (u.role === 'sales') setLead(x => ({ ...x, sales: u.name }));
  }
  useEffect(() => { refresh().catch(e => toast(e.message)); }, []);

  useEffect(() => {
    setBerkas(null);
    if (trx.lead_code && trx.project && trx.unit) {
      api('/api/berkas?project=' + encodeURIComponent(trx.project) + '&unit=' + encodeURIComponent(trx.unit) + '&lead_code=' + encodeURIComponent(trx.lead_code))
        .then(setBerkas).catch(() => {});
    }
  }, [trx.lead_code, trx.project, trx.unit]);

  function kecilkanFoto(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1400;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = rej;
      img.src = url;
    });
  }

  async function uploadBerkas(jenisB, file) {
    if (!file) return;
    if (!trx.lead_code || !trx.project || !trx.unit) return toast('Pilih ID Lead, Project & Blok/Unit dulu');
    setUpBusy(jenisB);
    try {
      let dataUrl;
      if (file.type.startsWith('image/')) dataUrl = await kecilkanFoto(file);
      else if (file.type === 'application/pdf') {
        if (file.size > 2 * 1024 * 1024) throw new Error('PDF maksimal 2 MB');
        dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      } else throw new Error('Format harus foto (JPG/PNG) atau PDF');
      const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
      const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
      await api('/api/berkas', {
        method: 'POST',
        body: JSON.stringify({ project: trx.project, unit: trx.unit, lead_code: trx.lead_code, jenis: jenisB, filename: file.name, mime, data }),
      });
      toast((jenisB === 'ktp' ? 'KTP' : 'Bukti Transfer') + ' terupload ✔');
      setBerkas(b => ({ ...(b || {}), [jenisB]: true }));
    } catch (e) { toast(e.message); } finally { setUpBusy(''); }
  }

  const F = (obj, setObj) => (k, extra = {}) => ({
    value: obj[k] ?? '', onChange: e => setObj({ ...obj, [k]: e.target.value }), ...extra,
  });
  const fl = F(lead, setLead), ff = F(fu, setFu), ft = F(trx, setTrx);
  const opsi = k => [''].concat(set?.[k] || []).map(o => <option key={k + o} value={o}>{o || '— pilih —'}</option>);
  const leadOpt = [<option key="" value="">— pilih —</option>].concat(
    leads.map(l => <option key={l.lead_code} value={l.lead_code}>{l.lead_code} — {l.nama}</option>));

  async function simpanLead() {
    if (!lead.nama.trim()) return toast('Nama Konsumen wajib diisi');
    if (!isMarkom && !lead.sales) return toast('Sales / PIC wajib dipilih');
    if (/walk/i.test(lead.sumber || '') && !lead.walkin_info) return toast('Pilih Walk In tahu dari mana');
    setBusy(true);
    try {
      if (editId) {
        await api('/api/leads', { method: 'PATCH', body: JSON.stringify({ id: editId, ...lead }) });
        toast('Lead berhasil diperbarui');
      } else {
        const d = await api('/api/leads', { method: 'POST', body: JSON.stringify(lead) });
        toast('Lead tersimpan — ' + d.lead_code);
      }
      setEditId(null); setDup(null);
      setLead({ ...EMPTY, tgl: todayISO(), sales: me?.role === 'sales' ? me.name : '' });
      setLeads(await api('/api/leads'));
    } catch (e) {
      if (e.status === 409 && e.data && e.data.dup) {
        setDup(e.data.dup);
        if (me?.role === 'manager' && confirm(e.message + '\n\nTetap simpan sebagai lead TERPISAH? (khusus manager)')) {
          try {
            const d2 = await api('/api/leads', { method: 'POST', body: JSON.stringify({ ...lead, force: true }) });
            toast('Lead tersimpan (dipaksa) — ' + d2.lead_code); setDup(null);
            setLead({ ...EMPTY, tgl: todayISO(), sales: '' }); setLeads(await api('/api/leads'));
          } catch (e2) { toast(e2.message); }
        } else toast(e.message);
      } else toast(e.message);
    } finally { setBusy(false); }
  }

  function mulaiEdit(l) {
    setEditId(l.id);
    setTab('lead');
    const d10 = x => x ? String(x).slice(0, 10) : '';
    setLead({ tgl: d10(l.tgl), nama: l.nama || '', wa: l.wa || '', email: l.email || '', domisili: l.domisili || '',
      kerja: l.kerja || '', sumber: l.sumber || '', project: l.project || '', tipe: l.tipe || '', tujuan: l.tujuan || '',
      budget: l.budget || '', bayar: l.bayar || '', sales: l.sales || '', status: l.status || 'New',
      catatan: l.catatan || '', next_fu: d10(l.next_fu) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Mode edit: ' + l.lead_code + ' — ubah lalu klik Update Lead');
  }

  function batalEdit() {
    setEditId(null);
    setLead({ ...EMPTY, tgl: todayISO(), sales: me?.role === 'sales' ? me.name : '' });
  }
  const isMarkom = me && me.role === 'markom';
  useEffect(() => { if (isMarkom) api('/api/users').then(setSalesWA).catch(() => {}); }, [isMarkom]);
  useEffect(() => { if (isMarkom && tab === 'trx') setTab('lead'); }, [isMarkom, tab]);

  // Template FU markom sesuai project & day
  function templateDayFU(day, l) {
    if (!day) return '';
    const proj = (l && l.project) || '';
    if (/permai/i.test(proj)) return TFU_PERMAI;
    const t = TFU_BIO[day] || '';
    return t.replace('{nama}', (l && l.nama) || 'Kak').replace('{officer}', (me && me.name) || 'tim BIO District');
  }
  // Template pesan oper lead ke sales (Leads to Sales)
  function templateL2S(l, salesName) {
    if (!l) return '';
    return `Halo ${salesName || '[Sales]'} 👋
Ada lead baru untuk segera di-follow up:

🆔 ID Lead: ${l.lead_code} (sudah ada di CRM Anda — langsung follow up di tab Follow Up, JANGAN input ulang)
🧑 Nama: ${l.nama || '-'}
📱 No. WA: ${l.wa || '-'}
🏠 Project: ${l.project || '-'}
🔎 Sumber: ${l.sumber || '-'}
📝 Keterangan: ${l.catatan || '-'}

Mohon langsung disapa ya, semangat closing! 💪`;
  }
  async function kirimL2S() {
    if (!l2s.lead_code) return toast('Pilih ID Lead dulu');
    if (!l2s.sales) return toast('Pilih Sales tujuan dulu');
    const lObj = leads.find(x => x.lead_code === l2s.lead_code);
    const sObj = salesWA.find(x => x.name === l2s.sales);
    if (!sObj || !sObj.wa) return toast('Sales ini belum punya No. WA — minta manager mengisinya di menu Pengguna');
    const diHP = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let winWA = null;
    if (!diHP) { try { winWA = window.open('', '_blank'); } catch {} }
    setBusy(true);
    try {
      await api('/api/leads', { method: 'PATCH', body: JSON.stringify({ id: lObj.id, sales: l2s.sales }) });
      await api('/api/followups', { method: 'POST', body: JSON.stringify({ lead_code: l2s.lead_code, tgl: l2s.tgl, detail: 'Leads to Sales → ' + l2s.sales, wa_pesan: l2s.pesan }) });
      toast('Lead dioper ke ' + l2s.sales + ' — WhatsApp terbuka, tinggal kirim 📲');
      if (diHP) setTimeout(() => { bukaWA(sObj.wa, l2s.pesan); }, 350);
      else bukaWA(sObj.wa, l2s.pesan, winWA);
      setL2s({ lead_code: '', tgl: todayISO(), pesan: '', sales: '' });
      refresh().catch(() => {});
    } catch (e) { if (winWA) { try { winWA.close(); } catch {} } toast(e.message); } finally { setBusy(false); }
  }

  // 💡 Pelatih penjualan: rekomendasi follow up berdasarkan analisa FU terakhir lead
  function rekomendasiFU(l, riwayat) {
    if (!l) return [];
    const rec = [];
    const last = riwayat[0] || null;
    const hari = last && last.tgl ? Math.floor((Date.now() - new Date(last.tgl).getTime()) / 86400000) : null;
    const ob = ((last && (last.objection || '')) + ' ' + (last && (last.detail || ''))).toLowerCase();
    const st = l.status;

    if (!last) {
      rec.push(['Respon kilat ⚡', 'Lead belum pernah di-follow up — hubungi HARI INI. Lead yang disentuh <24 jam jauh lebih besar peluang closing-nya. Perkenalan singkat, lalu gali kebutuhan: tipe yang dicari, budget, dan rencana pakai (huni/investasi). Tutup dengan janji konkret: kirim pricelist + ajakan pilih jadwal survey.']);
    }
    if (/harga|mahal|budget|dp|uang muka|angsuran|cicil|kpr/.test(ob)) {
      rec.push(['Jinakkan objection harga 💰', 'Jangan berdebat soal mahal — pindahkan ke angka bulanan: kirim simulasi angsuran paling ringan & bandingkan dengan biaya sewa/kontrakan. Tanyakan angka nyaman per bulannya, lalu carikan tipe/skema yang masuk. Kalau tetap berat, tawarkan unit alternatif tanpa menurunkan gengsi pilihannya.']);
    }
    if (/istri|suami|keluarga|orang tua|diskusi|pikir|rembuk/.test(ob)) {
      rec.push(['Libatkan pengambil keputusan 👨‍👩‍👧', 'Keputusan properti jarang diambil sendirian. Ajak pasangan/keluarga ikut site visit — beri 2 pilihan waktu konkret (Sabtu pagi / Minggu sore). Kirim materi ringkas (foto unit + harga + akses) yang gampang di-forward ke keluarganya, biar dia yang "jualan" di rumah.']);
    }
    if (/jauh|lokasi|akses|angkot|transport|stasiun|macet|jalan/.test(ob)) {
      rec.push(['Jual akses, bukan jarak 🛣', 'Objection lokasi dilawan dengan bukti: kirim video rute dari titik transport terdekat, share loc, dan rencana pengembangan area. Tawarkan jemput/antar survey — begitu merasakan sendiri rutenya, keberatan biasanya cair.']);
    }
    if (last && hari !== null && hari >= 7 && rec.length < 3) {
      rec.push(['Bangunkan kembali 🔄', `Sudah ${hari} hari tanpa kabar. Jangan buka dengan "bagaimana kabarnya, jadi ambil?" — kirim VALUE baru: unit favoritnya mulai menipis, promo bulan ini, atau progres pembangunan. Lead lama merespon info baru, bukan tagihan keputusan.`]);
    }
    if (st === 'Hot' && rec.length < 3) {
      rec.push(['Kunci komitmen 🔒', 'Lead sudah panas — jangan biarkan dingin oleh waktu. Tawarkan reserved / tanda jadi ringan untuk MENGUNCI unit & harga hari ini, plus deadline halus: "harga menyesuaikan bulan depan" atau "unit ini sedang ditanyakan orang lain". Hot yang tidak diberi alasan memutuskan hari ini akan jadi Warm minggu depan.']);
    }
    if (st === 'Site Visit' && rec.length < 3) {
      rec.push(['Panaskan selagi hangat 🔥', 'Dia sudah datang — itu sinyal serius. Follow up maksimal H+1: tanya unit mana yang paling berkesan, jawab keraguannya, lalu langsung tawarkan reserved unit favoritnya sebelum dilihat orang lain.']);
    }
    if (st === 'Appointment' && rec.length < 3) {
      rec.push(['Amankan janji 📅', 'Konfirmasi H-1 + kirim share location & nama Anda. Siapkan data unit + simulasi sesuai profilnya supaya saat bertemu langsung ke inti. Janji yang tidak dikonfirmasi = kursi kosong.']);
    }
    if (st === 'Booking' && rec.length < 3) {
      rec.push(['Kawal & panen referral 🤝', 'Kawal kelengkapan berkas & jadwal pembayaran biar tidak batal di tengah jalan. Dan ini momen emas: pembeli yang baru deal sedang senang-senangnya — minta referral: "siapa teman/saudara yang juga lagi cari rumah?"']);
    }
    if (st === 'Warm' && rec.length < 3) {
      rec.push(['Naikkan suhu 🌡', 'Kirim satu info bernilai (tipe terlaris / sisa unit / promo) + satu pertanyaan terbuka tentang pertimbangan utamanya. Lalu ajak site visit dengan 2 pilihan waktu — pertanyaan "mau Sabtu atau Minggu?" lebih ampuh daripada "kapan ada waktu?"']);
    }
    if ((st === 'New' || st === 'Cold') && last && rec.length < 3) {
      rec.push(['Gali kebutuhan dulu 🎯', 'Jangan buru-buru jualan — bertanyalah: tipe yang dicari, budget, kapan rencana beli, untuk siapa. Lead yang merasa didengar jauh lebih mudah diajak survey. Baru setelah itu tembakkan unit yang paling pas.']);
    }
    if (last && !last.next_tgl && rec.length < 3) {
      rec.push(['Selalu tinggalkan jejak 📌', 'FU terakhir tidak punya jadwal lanjutan. Akhiri setiap chat dengan janji konkret ("saya info promonya Jumat ya") dan isi Tgl Next Follow Up — lead tanpa jadwal = lead yang menguap.']);
    }
    return rec.slice(0, 3);
  }

  // Pilih template sales otomatis: lead belum merespon (New/Cold) -> Day-1 / Day-3 / Day-7 sesuai jumlah FU sebelumnya
  function templateSales(l) {
    if (!l) return '';
    const n = fus.filter(f => f.lead_code === l.lead_code).length;
    const belumRespon = !l.status || l.status === 'New' || l.status === 'Cold';
    if (belumRespon && n === 0) return templateSalesDay(1, l);
    if (belumRespon && n === 1) return templateSalesDay(3, l);
    if (belumRespon && n === 2) return templateSalesDay(7, l);
    return templateWA(l);
  }

  // Template pesan WA percakapan biasa — bebas diedit sales
  function templateWA(l) {
    const h = new Date().getHours();
    const salam = h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam';
    const nama = (l && l.nama) ? l.nama : 'Bapak/Ibu';
    const proj = (l && l.project) ? ` terkait project ${l.project}` : '';
    const sales = (me && me.name) ? me.name : 'tim Sales';
    return `Selamat ${salam} Bapak/Ibu ${nama} 🙏\n\nSaya ${sales} dari Cipta Harmoni Lestari,${proj ? proj + '.' : ' menindaklanjuti komunikasi kita sebelumnya.'} Apakah ada yang bisa kami bantu — info harga terbaru, simulasi pembayaran, atau jadwal survey lokasi?\n\nDitunggu kabar baiknya, terima kasih 🙏`;
  }

  async function simpanFU() {
    if (!fu.lead_code) return toast('Pilih ID Lead dulu');
    if (!fu.detail.trim()) return toast(isMarkom ? 'Pilih Day Follow Up dulu' : 'Detail Komunikasi wajib diisi');
    // Siapkan link WA SEKARANG (masih dalam sentuhan pengguna — syarat iPhone/Safari)
    const leadFu = leads.find(x => x.lead_code === fu.lead_code);
    const pesan = (fu.wa_pesan || '').trim();
    const dropFU = fu.next_action === 'Drop';
    const stopFU = TANPA_NEXT.includes(fu.next_action); // Drop / Reserved / Booking: tidak perlu buka WA
    const urlWA = (leadFu && leadFu.wa && !stopFU) ? waLink(leadFu.wa, pesan) : null;
    const diHP = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    // Desktop: buka tab kosong secara sinkron dulu (lolos popup blocker), lalu diarahkan setelah tersimpan
    let winWA = null;
    if (urlWA && !diHP) { try { winWA = window.open('', '_blank'); } catch {} }
    setBusy(true);
    try {
      await api('/api/followups', { method: 'POST', body: JSON.stringify(fu) });
      if (urlWA) {
        toast(pesan ? 'Tersimpan — membuka WhatsApp, tinggal klik kirim 📲' : 'Tersimpan — membuka WhatsApp 📲');
        if (diHP) {
          // HP: skema whatsapp:// — terbuka di WhatsApp biasa MAUPUN WA Business
          setTimeout(() => { bukaWA(leadFu.wa, pesan); }, 350);
        } else {
          bukaWA(leadFu.wa, pesan, winWA);
        }
      } else {
        toast(dropFU ? 'Follow up tersimpan — lead ditandai Drop, pengingat dimatikan' : stopFU ? 'Follow up tersimpan — konsumen ' + fu.next_action + ', jadwal FU dihentikan' : 'Follow up tersimpan (lead belum punya nomor WA)');
      }
      setFu({ lead_code: '', tgl: todayISO(), detail: '', objection: '', next_action: '', next_tgl: '', wa_pesan: '' });
      Promise.all([api('/api/leads'), api('/api/followups'), api('/api/stock')]).then(([l, f, st]) => { setLeads(l); setFus(f); setStok(st.status || []); });
    } catch (e) { if (winWA) { try { winWA.close(); } catch {} } toast(e.message); } finally { setBusy(false); }
  }
  async function simpanTrx() {
    if (!trx.lead_code) return toast('Pilih ID Lead dulu');
    if (!Number(trx.nilai)) return toast('Nilai (Rp) wajib diisi angka');
    if (trx.unit && trx.project && trx.jenis !== 'Batal' && berkas && !berkas.adaTrxSebelumnya && !berkas.transfer) {
      return toast('Upload Bukti Transfer dulu untuk transaksi pertama di unit ini.');
    }
    setBusy(true);
    try {
      await api('/api/trx', { method: 'POST', body: JSON.stringify(trx) });
      toast('Transaksi tersimpan — status pipeline ter-update');
      setTrx({ lead_code: '', jenis: 'Booking', tgl: todayISO(), nilai: '', catatan: '', project: '', bayar: '', unit: '' });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  if (!set) return <div className="loading">Memuat…</div>;
  return (
    <>
      <div className="page-head"><div><h1>Form Input</h1>
        <div className="sub">Data langsung tersimpan ke database bersama. Tanda <span style={{ color: 'var(--red)' }}>*</span> wajib diisi.</div></div></div>
      <div className="form-tabs">
        {(isMarkom
          ? [['lead', '1 · Lead Baru'], ['fu', '2 · Follow Up'], ['l2s', '3 · Leads to Sales']]
          : [['lead', '1 · Lead Baru'], ['fu', '2 · Follow Up'], ['trx', '3 · Reserved / Booking']]).map(([k, t]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{t}</button>))}
      </div>

      {tab === 'lead' && <div className="card" style={editId ? { borderColor: 'var(--brass)', borderWidth: 2 } : undefined}>
        {editId && <div className="note">✏️ Sedang mengedit lead <b>{leads.find(l => l.id === editId)?.lead_code}</b> — perbaiki datanya lalu klik <b>Update Lead</b>, atau <b>Batal</b> untuk kembali input baru.</div>}
        <div className="form-grid">
          <div className="field"><label>Tanggal Lead</label><input type="date" {...fl('tgl')} /></div>
          <div className="field"><label>Nama Konsumen <span className="req">*</span></label><input {...fl('nama')} placeholder="Nama lengkap" /></div>
          <div className="field"><label>WhatsApp</label><input {...fl('wa')} placeholder="08xxxxxxxxxx" /></div>
          <div className="field"><label>Email</label><input type="email" {...fl('email')} /></div>
          {!isMarkom && <div className="field"><label>Domisili</label><input {...fl('domisili')} /></div>}
          {!isMarkom && <div className="field"><label>Pekerjaan</label><input {...fl('kerja')} /></div>}
          <div className="field"><label>Sumber Lead</label><select {...fl('sumber')}>{opsi('sumber')}</select></div>
          {!isMarkom && /walk/i.test(lead.sumber || '') && (
            <div className="field"><label>Walk In — tahu dari mana? <span className="req">*</span></label>
              <select value={lead.walkin_info || ''} onChange={e => setLead({ ...lead, walkin_info: e.target.value })}>
                <option value="">— pilih —</option>
                {WALKIN_INFO.map(w => <option key={w}>{w}</option>)}
              </select></div>
          )}
          <div className="field"><label>Project</label><select {...fl('project')}>{opsi('project')}</select></div>
          {!isMarkom && <div className="field"><label>Tipe / Unit</label><select {...fl('tipe')}>{opsi('tipe')}</select></div>}
          {!isMarkom && <div className="field"><label>Tujuan Pembelian</label><select {...fl('tujuan')}>{opsi('tujuan')}</select></div>}
          {!isMarkom && <div className="field"><label>Budget (Rp)</label><input type="number" min="0" {...fl('budget')} placeholder="contoh: 500000000" /></div>}
          {!isMarkom && <div className="field"><label>Cara Pembayaran</label><select {...fl('bayar')}>{opsi('bayar')}</select></div>}
          {!isMarkom && <div className="field"><label>Sales / PIC <span className="req">*</span></label>
            {me?.role === 'sales'
              ? <input value={me.name} disabled />
              : <select {...fl('sales')}>{opsi('sales')}</select>}
          </div>}
          {!isMarkom && <div className="field"><label>Status Awal</label><select {...fl('status')}>{(set.status || []).filter(o => o !== 'Booking' && o !== 'Closing').map(o => <option key={o}>{o}</option>)}</select></div>}
          <div className="field"><label>Tgl Next Follow Up</label><input type="date" {...fl('next_fu')} /></div>
          <div className="field"><label>Catatan</label><input {...fl('catatan')} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={simpanLead} disabled={busy}>{editId ? 'Update Lead' : 'Simpan Lead'}</button>
          {editId && <button className="btn btn-ghost" onClick={batalEdit}>Batal</button>}
          <span className="hint">{editId ? 'Perubahan langsung tersimpan ke database.' : 'ID Lead dibuat otomatis oleh sistem.'}</span>
          {dup && (
            <div style={{ flexBasis: '100%', background: '#F9E7E3', border: '1px solid #B3402F', borderRadius: 10, padding: '10px 14px', marginTop: 8 }}>
              <b style={{ color: '#B3402F' }}>🛑 Nomor WA sudah terdaftar:</b> {dup.lead_code} — <b>{dup.nama}</b> · {dup.project || '-'} · status {dup.status} · PIC {dup.sales || 'belum ada'}{dup.pembuat_role === 'markom' ? ' · dari Marcom ' + dup.pembuat : ''}
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {leads.find(x => x.lead_code === dup.lead_code)
                  ? <button className="btn btn-primary" style={{ padding: '6px 12px' }} onClick={() => { const l = leads.find(x => x.lead_code === dup.lead_code); setTab('fu'); setFu({ ...fu, lead_code: dup.lead_code, wa_pesan: l ? templateSales(l) : '' }); setDup(null); }}>↻ Buka di Follow Up</button>
                  : <span className="hint">Lead ini belum ada di daftar Anda — minta {dup.pembuat_role === 'markom' ? 'Marcom mengopernya lewat Leads to Sales' : 'manager memindahkan PIC-nya'}.</span>}
                <button className="sort-btn" onClick={() => setDup(null)}>Tutup</button>
              </div>
            </div>)}
        </div>
      </div>}

      {tab === 'fu' && <div className="card">
        <div className="form-grid">
          <div className="field"><label>ID Lead <span className="req">*</span></label>
            <select value={fu.lead_code} onChange={e => {
              const l = leads.find(x => x.lead_code === e.target.value);
              if (isMarkom) { setFu({ ...fu, lead_code: e.target.value, wa_pesan: fu.detail ? templateDayFU(fu.detail, l) : '' }); return; }
              const otoIsi = !fu.wa_pesan.trim() || fu.wa_pesan.startsWith('Selamat ');
              setFu({ ...fu, lead_code: e.target.value, wa_pesan: (otoIsi && l) ? templateSales(l) : fu.wa_pesan });
            }}>{leadOpt}</select></div>
          {!isMarkom && fu.lead_code ? (() => {
            const lSel = leads.find(x => x.lead_code === fu.lead_code);
            const riw = fus.filter(f => f.lead_code === fu.lead_code).sort((a, b) => (b.id || 0) - (a.id || 0));
            const rec = rekomendasiFU(lSel, riw);
            if (!rec.length) return null;
            return (
              <div style={{ gridColumn: '1/-1', background: '#FBF1DC', border: '1px solid #C9922E', borderRadius: 10, padding: '10px 14px' }}>
                <b style={{ color: '#8a5f14' }}>💡 Rekomendasi Follow Up{riw[0] ? ' — analisa FU terakhir ' + fmtDate(riw[0].tgl) : ' — lead belum pernah di-FU'}</b>
                <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                  {rec.map((r, i) => <li key={i} style={{ marginBottom: 5, fontSize: 13.5 }}><b>{r[0]}:</b> {r[1]}</li>)}
                </ul>
              </div>
            );
          })() : null}
          <div className="field"><label>Tanggal Follow Up</label><input type="date" {...ff('tgl')} /></div>
          {isMarkom
            ? <div className="field"><label>Day Follow Up <span className="req">*</span></label>
              <select value={fu.detail} onChange={e => {
                const l = leads.find(x => x.lead_code === fu.lead_code);
                setFu({ ...fu, detail: e.target.value, wa_pesan: templateDayFU(e.target.value, l) });
              }}>
                <option value="">— pilih day —</option>
                {DAY_FU.map(d => <option key={d}>{d}</option>)}
              </select></div>
            : <div className="field" style={{ gridColumn: '1/-1' }}><label>Detail Komunikasi <span className="req">*</span></label>
              <textarea rows={2} {...ff('detail')} /></div>}
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Pesan WhatsApp <span className="hint">(otomatis terisi template saat lead dipilih{!isMarkom && fu.lead_code ? (() => { const l = leads.find(x => x.lead_code === fu.lead_code); const n = fus.filter(f => f.lead_code === fu.lead_code).length; const br = l && (!l.status || l.status === 'New' || l.status === 'Cold'); return br && n <= 2 ? ' — Day-' + [1, 3, 7][n] + ' lead belum respon' : ''; })() : ''} — silakan edit sesuka hati; setelah Simpan, WA terbuka tinggal klik kirim)</span>
              <button type="button" className="sort-btn" style={{ marginLeft: 8, padding: '2px 9px' }}
                onClick={() => setFu({ ...fu, wa_pesan: isMarkom ? templateDayFU(fu.detail, leads.find(x => x.lead_code === fu.lead_code)) : templateSales(leads.find(x => x.lead_code === fu.lead_code)) })}>↺ Isi Template</button>
              {fu.wa_pesan ? <button type="button" className="sort-btn" style={{ marginLeft: 6, padding: '2px 9px' }}
                onClick={() => setFu({ ...fu, wa_pesan: '' })}>✕ Kosongkan</button> : null}
            </label>
            <textarea rows={5} value={fu.wa_pesan} onChange={e => setFu({ ...fu, wa_pesan: e.target.value })}
              placeholder="Pilih lead dulu — template pesan akan terisi otomatis di sini." /></div>
          {!isMarkom && <div className="field"><label>Objection</label><input {...ff('objection')} /></div>}
          {!isMarkom && <div className="field"><label>Next Action</label>
            <select value={fu.next_action} onChange={e => setFu({ ...fu, next_action: e.target.value, next_tgl: TANPA_NEXT.includes(e.target.value) ? '' : fu.next_tgl })}>
              <option value="">— pilih —</option>
              <option value="Lanjut Follow Up">Lanjut Follow Up</option>
              <option value="Reserved">Reserved — konsumen sudah reserved</option>
              <option value="Booking">Booking — konsumen sudah booking</option>
              <option value="Drop">Drop</option>
            </select></div>}
          <div className="field"><label>Tgl Next Follow Up{TANPA_NEXT.includes(fu.next_action) ? ' (nonaktif — ' + fu.next_action + ')' : ''}</label>
            <input type="date" {...ff('next_tgl')} disabled={TANPA_NEXT.includes(fu.next_action)} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={simpanFU} disabled={busy}>Simpan Follow Up</button>
          <span className="hint">Reminder MERAH = overdue, KUNING = hari ini, HIJAU = upcoming.</span>
        </div>
      </div>}

      {isMarkom && tab === 'l2s' && <div className="card">
        <div className="note" style={{ marginBottom: 10 }}>📮 <b>Leads to Sales</b> — oper lead ke sales: pilih lead & sales tujuan, pesan berisi data konsumen tersusun otomatis, klik <b>Kirim</b> → lead resmi berpindah ke sales tsb & WhatsApp sales terbuka berisi pesannya.</div>
        <div className="form-grid">
          <div className="field"><label>ID Lead <span className="req">*</span></label>
            <select value={l2s.lead_code} onChange={e => {
              const l = leads.find(x => x.lead_code === e.target.value);
              const oto = !l2s.pesan.trim() || l2s.pesan.startsWith('Halo ');
              setL2s({ ...l2s, lead_code: e.target.value, pesan: (oto && l) ? templateL2S(l, l2s.sales) : l2s.pesan });
            }}>{leadOpt}</select></div>
          <div className="field"><label>Tanggal</label><input type="date" value={l2s.tgl} onChange={e => setL2s({ ...l2s, tgl: e.target.value })} /></div>
          <div className="field"><label>Sales Tujuan <span className="req">*</span></label>
            <select value={l2s.sales} onChange={e => {
              const l = leads.find(x => x.lead_code === l2s.lead_code);
              const oto = !l2s.pesan.trim() || l2s.pesan.startsWith('Halo ');
              setL2s({ ...l2s, sales: e.target.value, pesan: (oto && l) ? templateL2S(l, e.target.value) : l2s.pesan });
            }}>
              <option value="">— pilih sales —</option>
              {salesWA.map(u2 => <option key={u2.id} value={u2.name}>{u2.name}{u2.wa ? '' : ' (belum ada No. WA)'}</option>)}
            </select></div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>Pesan WhatsApp ke Sales <span className="hint">(otomatis berisi nama, nomor WA & keterangan konsumen — bebas diedit)</span>
              <button type="button" className="sort-btn" style={{ marginLeft: 8, padding: '2px 9px' }}
                onClick={() => setL2s({ ...l2s, pesan: templateL2S(leads.find(x => x.lead_code === l2s.lead_code), l2s.sales) })}>↺ Isi Template</button>
            </label>
            <textarea rows={7} value={l2s.pesan} onChange={e => setL2s({ ...l2s, pesan: e.target.value })}
              placeholder="Pilih lead & sales — pesan akan tersusun otomatis di sini." /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={kirimL2S} disabled={busy}>📲 Kirim</button>
          <span className="hint">Lead otomatis berpindah menjadi milik sales terpilih & tercatat di riwayat follow up.</span>
        </div>
      </div>}

      {tab === 'trx' && <div className="card">
        <div className="form-grid">
          <div className="field"><label>ID Lead <span className="req">*</span></label>
            <select value={trx.lead_code} onChange={e => {
              const l = leads.find(x => x.lead_code === e.target.value);
              setTrx({ ...trx, lead_code: e.target.value, project: (l && l.project) || trx.project, bayar: (l && l.bayar) || trx.bayar });
            }}>{leadOpt}</select></div>
          <div className="field"><label>Project</label><select {...ft('project')}>{opsi('project')}</select></div>
          <div className="field"><label>Blok / Unit</label>
            {(set.units && set.units[trx.project] && set.units[trx.project].length)
              ? (() => {
                  const stMap = {};
                  stok.forEach(u2 => { if (u2.project === trx.project) stMap[u2.unit] = u2; });
                  return <select {...ft('unit')}>
                    <option value="">— pilih —</option>
                    {set.units[trx.project].map(u => {
                      const st = stMap[u];
                      // Unit tertutup tetap bisa dipilih oleh LEAD PEMILIKNYA (untuk naik ke Booking/Closing atau Batal)
                      const milikSendiri = st && st.lead_code && st.lead_code === trx.lead_code;
                      const kunci = !!st && !milikSendiri;
                      const label = !st ? u
                        : (st.warna === 'merah' ? '🔴 ' : '🟡 ') + u +
                          (milikSendiri ? ' — unit lead ini' : st.warna === 'merah' ? ' — TERJUAL' : ' — RESERVED');
                      return <option key={'u' + u} value={u} disabled={kunci}>{label}</option>;
                    })}
                  </select>;
                })()
              : <input {...ft('unit')} placeholder={trx.project ? 'ketik blok/unit' : 'pilih project dulu'} />}
            <span className="hint">🔴 terjual · 🟡 reserved — terkunci, kecuali unit milik lead yang sedang dipilih.</span>
          </div>
          <div className="field"><label>Cara Bayar</label><select {...ft('bayar')}>{opsi('bayar')}</select></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Berkas Transaksi (KTP &amp; Bukti Transfer)</label>
            {!(trx.lead_code && trx.project && trx.unit) ? (
              <span className="hint">Pilih ID Lead, Project &amp; Blok/Unit dulu untuk mengelola berkas.</span>
            ) : berkas && berkas.adaTrxSebelumnya ? (
              <div className="note" style={{ marginBottom: 0 }}>✔ Berkas transaksi pertama unit ini sudah tersimpan — update ke Booking/Batal <b>tidak perlu upload lagi</b>, langsung Simpan.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <b style={{ fontSize: 12.5, minWidth: 105 }}>Bukti Transfer <span className="req">*</span></b>
                  {berkas && berkas.transfer
                    ? <span className="badge b-close">✔ TERUPLOAD</span>
                    : <input type="file" accept="image/*,application/pdf" disabled={upBusy !== ''}
                        onChange={e => uploadBerkas('transfer', e.target.files[0])} />}
                  {upBusy === 'transfer' && <span className="hint">Mengupload…</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <b style={{ fontSize: 12.5, minWidth: 105 }}>KTP</b>
                  {berkas && berkas.ktp
                    ? <span className="badge b-close">✔ TERUPLOAD</span>
                    : <input type="file" accept="image/*,application/pdf" disabled={upBusy !== ''}
                        onChange={e => uploadBerkas('ktp', e.target.files[0])} />}
                  {upBusy === 'ktp' && <span className="hint">Mengupload…</span>}
                </div>
                <span className="hint">Wajib minimal Bukti Transfer untuk transaksi pertama di unit ini. Foto dikompres otomatis; PDF maks 2 MB.</span>
              </div>
            )}
          </div>
          <div className="field"><label>Jenis Transaksi <span className="req">*</span></label>
            <select {...ft('jenis')}><option>Reserved</option><option>Booking</option><option>Batal</option></select></div>
          <div className="field"><label>Tanggal</label><input type="date" {...ft('tgl')} /></div>
          <div className="field"><label>Nilai (Rp) <span className="req">*</span></label><input type="number" min="0" {...ft('nilai')} /></div>
          <div className="field"><label>Catatan</label><input {...ft('catatan')} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={simpanTrx} disabled={busy}>Simpan Transaksi</button>
          <span className="hint">Booking/Batal meng-update status pipeline otomatis (Batal → Drop). Reserved tidak mengubah status.</span>
        </div>
      </div>}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" style={{ flex: '2 1 240px' }} onClick={() => setShowPw(false) || setShowList(v => !v)}>
          {showList ? '▲ Tutup Daftar' : '▼ Lihat Lead & Hasil Follow Up Saya (' + leads.length + ' lead)'}
        </button>
        <button className="btn btn-ghost" style={{ flex: '1 1 160px' }} onClick={() => setShowList(false) || setShowPw(v => !v)}>
          🔑 Ganti Password
        </button>
      </div>

      {showPw && <div className="card" style={{ marginTop: 12 }}>
        <h2>Ganti Password Saya</h2>
        <div className="form-grid">
          <div className="field"><label>Password Lama</label>
            <input type="password" value={pwOld} onChange={e => setPwOld(e.target.value)} /></div>
          <div className="field"><label>Password Baru (min. 5 karakter)</label>
            <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" disabled={busy} onClick={async () => {
            if (!pwOld || !pwNew) return toast('Isi password lama dan baru');
            setBusy(true);
            try {
              await api('/api/users', { method: 'PUT', body: JSON.stringify({ oldPassword: pwOld, newPassword: pwNew }) });
              toast('Password berhasil diganti — pakai password baru saat login berikutnya');
              setPwOld(''); setPwNew(''); setShowPw(false);
            } catch (e) { toast(e.message); } finally { setBusy(false); }
          }}>Simpan Password Baru</button>
        </div>
      </div>}

      {showList && <div style={{ marginTop: 12 }}>
        <div className="tbl-wrap"><table>
          <thead><tr><th>ID Lead</th><th>Nama</th><th>Status</th><th>FU Terakhir</th><th>Hasil / Next Action</th><th>Next FU</th><th>Aksi</th></tr></thead>
          <tbody>
            {leads.length ? [...leads].reverse().map(l => {
              const myFus = fus.filter(f => f.lead_code === l.lead_code);
              const last = myFus[0];
              const nfu = l.next_fu || (last && last.next_tgl);
              const r = reminder(nfu);
              return <tr key={l.lead_code}>
                <td data-label="ID Lead"><span className="id-tag">{l.lead_code}</span></td>
                <td data-label="Nama"><b>{l.nama}</b>{myFus.length > 0 && <span className="hint"> · {myFus.length}x FU</span>}</td>
                <td data-label="Status"><span className={'badge ' + (BADGE[l.status] || 'b-cold')}>{l.status}</span></td>
                <td data-label="FU Terakhir">{last ? <>{fmtDate(last.tgl)}<br /><span className="hint">{last.detail}</span></> : <span style={{ color: 'var(--muted)' }}>belum ada</span>}</td>
                <td data-label="Hasil / Next Action">{last ? (last.next_action || last.objection || '—') : '—'}</td>
                <td data-label="Next FU">{nfu ? <>{fmtDate(nfu)}{r && <> <span className={'badge ' + r[1]}>{r[0]}</span></>}</> : '—'}</td>
                <td data-label="Aksi"><button className="sort-btn" onClick={() => mulaiEdit(l)}>✏️ Edit</button></td>
              </tr>;
            }) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada lead — input lead pertama Anda di tab 1.</td></tr>}
          </tbody>
        </table></div>
      </div>}

      <Toast />
    </>
  );
}
