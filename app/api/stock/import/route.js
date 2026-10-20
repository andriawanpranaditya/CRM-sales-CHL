import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { denganLog } from '@/lib/log';

export const dynamic = 'force-dynamic';

// Data Weekly Report BIO DISTRICT s.d September 2026 (32 terjual + 1 reserved)
const DATA = [
  { u: "Bio Ave 1 no.02", s: "T", n: "Yuliono", a: "Andy Boy / Sunli Realty", v: 2717000000 },
  { u: "Bio Ave 1 no.03", s: "T", n: "Steven", a: "William Tan Jaya / Linktown", v: 3041000000 },
  { u: "Bio Ave 1 no.05", s: "T", n: "Elisusana", a: "Fahmi / Fam Estate", v: 3041000000 },
  { u: "Bio Ave 1 no.07", s: "T", n: "Badai Indragiri", a: "Kevin Sean Keefe Louhenapessy / Inhouse", v: 4227000000 },
  { u: "Bio Ave 2 no.05", s: "T", n: "Dewi Mirawati", a: "Sri Yamtini / Indopro", v: 4252000000 },
  { u: "Bio Ave 2 no.06", s: "T", n: "Johann Dandy Hartono", a: "Sri Yamtini / Sunli Realty", v: 2265000000 },
  { u: "Bio Ave 2 no.07", s: "T", n: "Shalita Selene Supian", a: "Sri Yamtini / Sunli Realty", v: 2275000000 },
  { u: "Bio Ave 2 no.08", s: "T", n: "Ivan Putra Wijaya", a: "Anggreani Anzany / Social Maison", v: 2300000000 },
  { u: "Bio Ave 2 no.09", s: "T", n: "David Chrisnanto Wijaya Kusuma", a: "Sri Yamtini / Indopro", v: 3591720000 },
  { u: "Bio Ave 3 no.03", s: "T", n: "D'Albertgati Ranapoja Soe", a: "Anggreani Anzany / Social Maison", v: 2294000000 },
  { u: "Bio Ave 3 no.05", s: "T", n: "Maryanti Hutabarat", a: "Sri Yamtini / Indopro", v: 3020886000 },
  { u: "Bio Ave 3 no.06", s: "T", n: "Muh. Yusril Nashrun Khairun Suweleh", a: "Risky Cardo / Carirumah88", v: 2703000000 },
  { u: "Bio Ave 3 no.07", s: "T", n: "Ayu Aditya", a: "Andy Boy / Sunli Realty", v: 2856000000 },
  { u: "Bio Ave 3 no.09", s: "T", n: "Sunu Arditya Sokya", a: "Chintya Amelia / Atlantis Realty", v: 3271000000 },
  { u: "Bio Ave 3 no.10", s: "T", n: "Naura Luthfia", a: "Sri Yamtini / Sunli Realty", v: 2310000000 },
  { u: "Bio Ave 3 no.11", s: "T", n: "Frangky Septian", a: "Sri Yamtini / Sunli Realty", v: 2939000000 },
  { u: "Bio Ave 3 no.12", s: "T", n: "Andy Wijaya", a: "Moh Thobie Prathama / Linktown", v: 2517832432 },
  { u: "Bio Ave 3 no.15", s: "T", n: "Yos Prabowo", a: "Ade Gunawan Lubis / Inhouse", v: 3422000000 },
  { u: "Bio Ave 5 no.03", s: "T", n: "Hikmah, S.Si,APT", a: "M. Rizky Maulana Nst / Linktown", v: 3422000000 },
  { u: "Bio Ave 5 no.08", s: "T", n: "Paulus Benny Siagian", a: "Hendri / Find Your Property", v: 2420000000 },
  { u: "Bio Ave 5 no.09", s: "T", n: "Akhmad Rianto Nugrohojati, SE", a: "Paulina / Fam Estate", v: 3097000000 },
  { u: "Bio Ave 5 no.10", s: "T", n: "Owen Orlando Sumakul", a: "Deanry Irsan / Linktown", v: 3041000000 },
  { u: "Bio Ave 5 no.11", s: "T", n: "Haryono", a: "Muhamad Subhi Djunari / Inhouse", v: 3277726589 },
  { u: "Bio Ave 5 no.15", s: "T", n: "Taufik Safroni", a: "Fahmi / Fam Estate", v: 2512265000 },
  { u: "Bio Ave 6 no.07", s: "T", n: "Muhammad Subhan", a: "Moh Thobie Prathama / Linktown", v: 1388889000 },
  { u: "Bio Blv no.03", s: "T", n: "Wartono", a: "Andy Boy / Sunli Realty", v: 2719000000 },
  { u: "Bio Blv no.05", s: "T", n: "Naomi Michelle", a: "Jourdeane Maximilllian Palekahelu / MS Property", v: 2769000000 },
  { u: "Bio Blv no.06", s: "T", n: "Andita Frida Aisha", a: "Sri Yamtini / Sunli Realty", v: 4972000000 },
  { u: "Bio Blv no.10", s: "T", n: "Pricillia Agyanatasya", a: "Sri Yamtini / Sunli Realty", v: 2269000000 },
  { u: "Bio Blv no.16", s: "T", n: "Ayu Wulan Sari", a: "Muhamad Subhi Djunari / Inhouse", v: 2439802703 },
  { u: "Bio Blv no.18", s: "T", n: "Siti Nurhaliza", a: "Kevin Sean Keefe Louhenapessy / Inhouse", v: 2355000000 },
  { u: "Bio Blv no.19", s: "T", n: "Dian Moris, S.Si.T", a: "Raeno Lingga Wisesa / Inhouse", v: 1670000000 },
  { u: "Bio Blv no.12", s: "R", n: "Mega Difary", a: "Putri Rejeki Triwijayanti / Inhouse", v: 2737634234 }
];
// Master unit BIO DISTRICT sesuai SITEPLAN RESMI — 63 unit
// (penomoran melewati 01, 04, 13, 14)
const MASTER63 = [
  'Bio Ave 1 no.02',
  'Bio Ave 1 no.03',
  'Bio Ave 1 no.05',
  'Bio Ave 1 no.06',
  'Bio Ave 1 no.07',
  'Bio Ave 1 no.08',
  'Bio Ave 2 no.02',
  'Bio Ave 2 no.03',
  'Bio Ave 2 no.05',
  'Bio Ave 2 no.06',
  'Bio Ave 2 no.07',
  'Bio Ave 2 no.08',
  'Bio Ave 2 no.09',
  'Bio Ave 3 no.02',
  'Bio Ave 3 no.03',
  'Bio Ave 3 no.05',
  'Bio Ave 3 no.06',
  'Bio Ave 3 no.07',
  'Bio Ave 3 no.08',
  'Bio Ave 3 no.09',
  'Bio Ave 3 no.10',
  'Bio Ave 3 no.11',
  'Bio Ave 3 no.12',
  'Bio Ave 3 no.15',
  'Bio Ave 3 no.16',
  'Bio Ave 3 no.17',
  'Bio Ave 3 no.18',
  'Bio Ave 3 no.19',
  'Bio Ave 3 no.20',
  'Bio Ave 5 no.02',
  'Bio Ave 5 no.03',
  'Bio Ave 5 no.05',
  'Bio Ave 5 no.06',
  'Bio Ave 5 no.07',
  'Bio Ave 5 no.08',
  'Bio Ave 5 no.09',
  'Bio Ave 5 no.10',
  'Bio Ave 5 no.11',
  'Bio Ave 5 no.12',
  'Bio Ave 5 no.15',
  'Bio Ave 5 no.16',
  'Bio Ave 6 no.02',
  'Bio Ave 6 no.03',
  'Bio Ave 6 no.05',
  'Bio Ave 6 no.06',
  'Bio Ave 6 no.07',
  'Bio Ave 7 no.02',
  'Bio Ave 7 no.03',
  'Bio Blv no.02',
  'Bio Blv no.03',
  'Bio Blv no.05',
  'Bio Blv no.06',
  'Bio Blv no.07',
  'Bio Blv no.08',
  'Bio Blv no.09',
  'Bio Blv no.10',
  'Bio Blv no.11',
  'Bio Blv no.12',
  'Bio Blv no.15',
  'Bio Blv no.16',
  'Bio Blv no.17',
  'Bio Blv no.18',
  'Bio Blv no.19'
];
// Data Laporan Penjualan PERMAI INDAH s.d Oktober 2026 (72 terjual, semua tipe 22,5/60 · KPR) — t = tgl kontrak, k = tgl akad kredit (kosong = belum akad)
const DATA_PERMAI = [
  { u: "Blok A8 no.02", s: "T", n: "Patrick Lim Batara Theofillus", a: "Kristina Hutapea / Ljhr Serpong", v: 185000000, t: "2025-12-21", k: "" },
  { u: "Blok A2 no.18", s: "T", n: "Wanda Hafidz Al Bashory", a: "Ahmad Huraefi / New Millenial Property", v: 185000000, t: "2025-12-21", k: "" },
  { u: "Blok A2 no.01", s: "T", n: "Agnes Fatmawati Fatimah", a: "Ari Putra", v: 185000000, t: "2025-12-21", k: "2026-04-10" },
  { u: "Blok B2 no.05", s: "T", n: "Michael Yusup", a: "Rustam Simanulang / Indomora Pro", v: 185000000, t: "2025-12-21", k: "" },
  { u: "Blok B2 no.03", s: "T", n: "Anastasia Astuti Situmorang", a: "Rustam Simanulang / Indomora Pro", v: 185000000, t: "2025-12-21", k: "" },
  { u: "Blok BLV no.02", s: "T", n: "Asep Apendi", a: "Agung Mulyana Ramdhani", v: 185000000, t: "2025-12-22", k: "" },
  { u: "Blok C2 no.07", s: "T", n: "Athalia Mevi Agustina", a: "Ari Putra", v: 185000000, t: "2025-12-22", k: "2026-04-23" },
  { u: "Blok B7 no.02", s: "T", n: "Didit Setyono", a: "Agung Mulyana Ramdhani", v: 185000000, t: "2025-12-22", k: "" },
  { u: "Blok B7 no.07", s: "T", n: "Zulfikar", a: "Ari Putra", v: 185000000, t: "2025-12-22", k: "2026-04-23" },
  { u: "Blok A3 no.01", s: "T", n: "Trisyanto Halim", a: "Agung Mulyana Ramdhani", v: 185000000, t: "2025-12-22", k: "" },
  { u: "Blok B4 no.01", s: "T", n: "Taufik Hidayat", a: "Agung Mulyana Ramdhani", v: 185000000, t: "2025-12-22", k: "" },
  { u: "Blok B7 no.06", s: "T", n: "Susilawati", a: "Andriawan Pranaditya", v: 185000000, t: "2025-12-22", k: "" },
  { u: "Blok B4 no.08", s: "T", n: "Arif Kurniawan", a: "Andriawan Pranaditya", v: 185000000, t: "2025-12-22", k: "" },
  { u: "Blok A1 no.16", s: "T", n: "Sunanda", a: "Richela Angriawan / Icon Property", v: 185000000, t: "2026-01-06", k: "" },
  { u: "Blok A1 no.10", s: "T", n: "Alexs Sandro Samosir", a: "Siska Sugianti / New Milenial Property", v: 185000000, t: "2026-01-28", k: "" },
  { u: "Blok B7 no.05", s: "T", n: "Komarudin", a: "Richa Doremifa Meilody Rusdiatman", v: 185000000, t: "2026-03-03", k: "" },
  { u: "Blok B2 no.02", s: "T", n: "Setio Nugroho", a: "Sri Antarsih Indriya / Wiguna Property", v: 185000000, t: "2026-03-06", k: "2026-03-11" },
  { u: "Blok B4 no.02", s: "T", n: "Rizaldy", a: "Sri Antarsih Indriya / Wiguna Property", v: 185000000, t: "2026-03-06", k: "2026-03-11" },
  { u: "Blok A2 no.12", s: "T", n: "Ahmad Muhamad", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-03-06", k: "2026-03-11" },
  { u: "Blok A2 no.03", s: "T", n: "Wahyuningsih", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-03-06", k: "2026-03-11" },
  { u: "Blok B4 no.06", s: "T", n: "Aulia Maharani Eka Aryanti", a: "Suharti / Property Pro Amazing", v: 185000000, t: "2026-03-06", k: "2026-03-11" },
  { u: "Blok A4 no.03", s: "T", n: "Desi Anjarwati", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-03-06", k: "2026-03-11" },
  { u: "Blok A6 no.10", s: "T", n: "Simplisius Aknoe", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-03-06", k: "2026-03-11" },
  { u: "Blok A2 no.08", s: "T", n: "Riska Nur Aini", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-03-06", k: "2026-03-11" },
  { u: "Blok B2 no.10", s: "T", n: "Irwan Zendrato", a: "Richa Doremifa Meilody Rusdiatman", v: 185000000, t: "2026-03-12", k: "" },
  { u: "Blok A6 no.01", s: "T", n: "Muhammad Rizky Akbar", a: "Chamnah Diana Rachmat / Ljh Realty Serpong", v: 185000000, t: "2026-04-09", k: "2026-04-10" },
  { u: "Blok A5 no.16", s: "T", n: "Azkia Inayah", a: "Suharti / Property Pro Amazing", v: 185000000, t: "2026-04-09", k: "2026-04-10" },
  { u: "Blok A6 no.15", s: "T", n: "Septi Dwiyaningsih", a: "Muhammad Jarkasih/ New Millenial Property", v: 185000000, t: "2026-04-09", k: "2026-04-10" },
  { u: "Blok A2 no.05", s: "T", n: "Sulemi", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-04-09", k: "2026-04-10" },
  { u: "Blok A2 no.11", s: "T", n: "Kristoforus Kolo", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-04-09", k: "2026-04-10" },
  { u: "Blok B1 no.07", s: "T", n: "Dimas Bagus", a: "Suharti / Property Pro Amazing", v: 185000000, t: "2026-04-09", k: "2026-04-23" },
  { u: "Blok A4 no.01", s: "T", n: "Muhamad Fajri", a: "Della Sasmita", v: 185000000, t: "2026-05-06", k: "2026-05-08" },
  { u: "Blok A8 no.12", s: "T", n: "Emyl Fahmy", a: "Della Sasmita", v: 185000000, t: "2026-05-06", k: "2026-05-12" },
  { u: "Blok B3 no.01", s: "T", n: "Sudariah", a: "Richa Doremifa Meilody Rusdiatman", v: 185000000, t: "2026-05-10", k: "" },
  { u: "Blok A3 no.02", s: "T", n: "Muhamad Akbar", a: "Elisabeth Maria Ratuela / Multi Property", v: 185000000, t: "2026-05-21", k: "2026-05-22" },
  { u: "Blok A8 no.07", s: "T", n: "Yunita Timo", a: "Muhammad Jarkasih/ New Millenial Property", v: 185000000, t: "2026-06-09", k: "" },
  { u: "Blok A4 no.02", s: "T", n: "Ester Monica", a: "Kristina Hutapea / Ljhr Serpong", v: 205350000, t: "2026-06-15", k: "2026-06-18" },
  { u: "Blok A6 no.18", s: "T", n: "Demmakria Erlinda Tambunan", a: "Kristina Hutapea / Ljhr Serpong", v: 205350000, t: "2026-06-15", k: "2026-06-18" },
  { u: "Blok C2 no.18", s: "T", n: "Sanitha M. Sianipar", a: "Agung Mulyana Ramdhani", v: 185000000, t: "2026-06-18", k: "2026-07-07" },
  { u: "Blok B5 no.01", s: "T", n: "Muhammad Alfarizi", a: "Richa Doremifa Meilody Rusdiatman", v: 185000000, t: "2026-06-24", k: "2026-07-07" },
  { u: "Blok A4 no.12", s: "T", n: "Adi Irawan", a: "Muhammad Jarkasih/ New Millenial Property", v: 185000000, t: "2026-06-25", k: "2026-06-26" },
  { u: "Blok B3 no.08", s: "T", n: "Muhammad Surya Albaina", a: "Muhammad Jarkasih/ New Millenial Property", v: 185000000, t: "2026-06-25", k: "2026-06-26" },
  { u: "Blok A6 no.05", s: "T", n: "Muhammad Iskandar", a: "Della Sasmita", v: 185000000, t: "2026-07-02", k: "2026-07-07" },
  { u: "Blok A1 no.01", s: "T", n: "Fitriani", a: "Michael / Harvest Property", v: 185000000, t: "2026-07-17", k: "" },
  { u: "Blok A5 no.02", s: "T", n: "Jimbri Kumayas", a: "Risma Nabilah", v: 185000000, t: "2026-07-18", k: "" },
  { u: "Blok B2 no.07", s: "T", n: "Ahmad Tori", a: "Elisabeth Maria Ratuela / Multi Property", v: 185000000, t: "2026-07-18", k: "2026-08-28" },
  { u: "Blok A5 no.01", s: "T", n: "Anisa Andriyani", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-07-18", k: "" },
  { u: "Blok A2 no.09", s: "T", n: "Nana Permana", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-07-18", k: "2026-08-28" },
  { u: "Blok B4 no.10", s: "T", n: "Dani Laksana Putra Setiadi", a: "Elisabeth Maria Ratuela / Multi Property", v: 185000000, t: "2026-07-18", k: "" },
  { u: "Blok B1 no.10", s: "T", n: "Irfan Arief Wicaksono", a: "Suharti / Property Pro Amazing", v: 185000000, t: "2026-07-18", k: "" },
  { u: "Blok B2 no.01", s: "T", n: "Muhammad Dafa Syahrian", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-07-18", k: "2026-09-29" },
  { u: "Blok A1 no.15", s: "T", n: "Rivaldo Situmorang", a: "Rustam Simanulang / Indomora Pro", v: 185000000, t: "2026-07-18", k: "" },
  { u: "Blok A5 no.06", s: "T", n: "Olga Olvie Tambariki", a: "Risma Nabilah", v: 185000000, t: "2026-07-18", k: "" },
  { u: "Blok B3 no.02", s: "T", n: "Muhibi", a: "Suharti / Property Pro Amazing", v: 185000000, t: "2026-07-20", k: "2026-09-25" },
  { u: "Blok A7 no.01", s: "T", n: "Usup", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-07-21", k: "2026-09-29" },
  { u: "Blok B3 no.05", s: "T", n: "Akhmadi", a: "Della Sasmita", v: 185000000, t: "2026-07-24", k: "2026-08-28" },
  { u: "Blok B4 no.05", s: "T", n: "Erwansyah", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-07-26", k: "" },
  { u: "Blok A7 no.02", s: "T", n: "Mualif", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-07-26", k: "" },
  { u: "Blok B7 no.08", s: "T", n: "Al Ikhsan Keisya Fitrah Ramadhan", a: "Chamnah Diana Rachmat / Ljh Realty Serpong", v: 185000000, t: "2026-07-29", k: "2026-08-28" },
  { u: "Blok B5 no.06", s: "T", n: "Jamhuri", a: "Chamnah Diana Rachmat / Ljh Realty Serpong", v: 185000000, t: "2026-08-03", k: "2026-09-29" },
  { u: "Blok A1 no.02", s: "T", n: "Dea Safira", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-08-13", k: "" },
  { u: "Blok A2 no.07", s: "T", n: "Oktaviyani Sulastri", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-08-17", k: "" },
  { u: "Blok B1 no.01", s: "T", n: "Ira Nurpalah", a: "Della Sasmita", v: 185000000, t: "2026-08-27", k: "" },
  { u: "Blok A8 no.01", s: "T", n: "Banu Adriansyah", a: "Meta Oktaria / Khanza Property", v: 185000000, t: "2026-08-27", k: "2026-10-05" },
  { u: "Blok A1 no.12", s: "T", n: "Muhammad Faiz", a: "Elisabeth Maria Ratuela / Multi Property", v: 185000000, t: "2026-09-01", k: "" },
  { u: "Blok B7 no.01", s: "T", n: "Nurjati Sidik Permono", a: "Deby Amalia", v: 185000000, t: "2026-09-03", k: "2026-09-29" },
  { u: "Blok A2 no.15", s: "T", n: "Ricky Navis Saputra", a: "Elisabeth Maria Ratuela / Multi Property", v: 185000000, t: "2026-09-24", k: "" },
  { u: "Blok B2 no.08", s: "T", n: "Eva Oktaviyanti", a: "Muhammad Jarkasih/ New Millenial Property", v: 185000000, t: "2026-09-27", k: "" },
  { u: "Blok B5 no.02", s: "T", n: "Ina Septiana", a: "Chamnah Diana Rachmat / Ljh Realty Serpong", v: 185000000, t: "2026-10-02", k: "" },
  { u: "Blok A6 no.02", s: "T", n: "Imanuel Apriadi Putra", a: "Kristina Hutapea / Ljhr Serpong", v: 185000000, t: "2026-10-03", k: "" },
  { u: "Blok C1 no.05", s: "T", n: "Donny Roganda Manurung", a: "Richa Doremifa Meilody Rusdiatman", v: 185000000, t: "2026-10-03", k: "" },
  { u: "Blok A1 no.06", s: "T", n: "Yuyun Ekasari", a: "Atika Purnamasari / Jendela123", v: 185000000, t: "2026-10-12", k: "" }
];
const SUMBER = { 'BIO DISTRICT': { data: DATA, label: 'Weekly Report s.d September 2026', master: MASTER63 }, 'PERMAI INDAH': { data: DATA_PERMAI, label: 'Laporan Penjualan s.d Oktober 2026', master: null } };

async function _POST(req) {
  const { err } = await requireUser(['manager', 'ceo']); if (err) return err;
  const sql = db();
  const body = await req.json().catch(() => ({}));
  const PROJ = SUMBER[body.project] ? body.project : 'BIO DISTRICT';
  const { data: DATA, master: MASTER } = SUMBER[PROJ];

  // 1) Master unit: BIO DISTRICT disetel ke daftar siteplan resmi (63 unit); PERMAI INDAH memakai daftar master yang sudah ada di Settings
  const st = await sql`SELECT items FROM settings WHERE key = 'units'`;
  const units = (st[0] && st[0].items) || {};
  const lama = Array.isArray(units[PROJ]) ? units[PROJ] : [];
  const MASTER63 = MASTER || lama;
  const hilang = MASTER ? lama.filter(u => !MASTER63.includes(u)) : [];   // unit lama yang tidak ada di siteplan
  const baru = MASTER ? MASTER63.filter(u => !lama.includes(u)) : [];     // unit siteplan yang belum terdaftar
  if (MASTER) {
    units[PROJ] = MASTER63;
    await sql`INSERT INTO settings (key, items) VALUES ('units', ${JSON.stringify(units)}::jsonb)
              ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(units)}::jsonb`;
  }

  // Tanda/posisi pada unit yang sudah tidak ada di daftar resmi — dilaporkan, TIDAK dihapus
  const semuaTanda = await sql`SELECT unit, status, sumber FROM unit_manual WHERE project = ${PROJ}`;
  // Tanda manual manager: bila manager & laporan sama-sama bilang TERJUAL → datanya disamakan dengan laporan (nama, agen, nilai, akad);
  // bila berbeda (manager: Reserved / Kosong, laporan: Terjual) → dibiarkan dan dilaporkan sebagai konflik untuk dicek manager
  const tandaManual = Object.fromEntries(semuaTanda.filter(t => t.sumber === 'manual' || t.status === 'Kosong').map(t => [t.unit, t.status]));
  const konflik = [], disamakan = [];
  const sisaTanda = semuaTanda.filter(x => hilang.includes(x.unit));

  // 2) Tandai status unit + nama pembeli
  const takDikenal = DATA.filter(d => !MASTER63.includes(d.u)).map(d => d.u);
  // Unit yang sudah punya transaksi aktif (non-Batal) dibiarkan mengikuti transaksi, bukan tanda manual
  const trxAktif = await sql`
    SELECT DISTINCT ON (t.unit) t.unit, t.jenis FROM transactions t
    LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE COALESCE(NULLIF(t.project, ''), l.project, '') = ${PROJ} AND t.unit <> ''
    ORDER BY t.unit, t.id DESC`;
  const adaTrx = trxAktif.filter(t => t.jenis !== 'Batal').map(t => t.unit);
  const lewatTrx = [];

  let terjual = 0, reserved = 0;
  const dihormati = [];
  for (const d of DATA) {
    if (tandaManual[d.u]) {
      const sama = (d.s === 'T' && tandaManual[d.u] === 'Terjual') || (d.s === 'R' && tandaManual[d.u] === 'Reserved');
      if (!sama) { konflik.push(`${d.u} (manager: ${tandaManual[d.u]}, laporan: ${d.s === 'T' ? 'Terjual' : 'Reserved'})`); dihormati.push(d.u); continue; }
      disamakan.push(d.u);
    }
    if (adaTrx.includes(d.u)) {
      await sql`DELETE FROM unit_manual WHERE project = ${PROJ} AND unit = ${d.u}`;
      lewatTrx.push(d.u);
      continue;
    }
    const status = d.s === 'T' ? 'Terjual' : 'Reserved';
    // Keterangan akad (bila ada) ikut disimpan di belakang nama agen agar terbaca di Master Stock: "… · akad 10 Apr 2026"
    const ket = d.k ? ' · akad ' + d.k : (d.t ? ' · kontrak ' + d.t : '');
    await sql`INSERT INTO unit_manual (project, unit, status, nama, sales, sumber, nilai)
              VALUES (${PROJ}, ${d.u}, ${status}, ${d.n}, ${(d.a || '') + ket}, 'import', ${d.v || null})
              ON CONFLICT (project, unit) DO UPDATE SET status = ${status}, nama = ${d.n}, sales = ${(d.a || '') + ket}, sumber = 'import', nilai = ${d.v || null}, updated_at = now()`;
    if (d.s === 'T') terjual++; else reserved++;
  }
  // 3) Bersihkan tanda manual lama di unit yang TIDAK ada dalam report (mis. bekas batal)
  const pakai = DATA.map(d => d.u);
  const bersih = [];
  for (const t of semuaTanda) {
    if (!pakai.includes(t.unit) && t.sumber === 'import') {
      await sql`DELETE FROM unit_manual WHERE project = ${PROJ} AND unit = ${t.unit}`;
      bersih.push(t.unit);
    }
  }

  return Response.json({
    ok: true, project: PROJ, terjual, reserved, takDikenal,
    totalUnit: MASTER63.length,
    unitBaru: baru.length,
    unitDibuang: hilang.length,
    tandaMenggantung: sisaTanda.map(x => x.unit + ' (' + x.status + ')'),
    tandaDibersihkan: bersih,
    ikutTransaksi: lewatTrx,
    dihormati, disamakan, konflik,
  });
}

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const POST = denganLog('Master Stock', _POST, ({ body }) => ({ aksi: 'Impor', detail: (SUMBER[body?.project] ? body.project + ' · ' + SUMBER[body.project].label : 'BIO DISTRICT · Weekly Report') }));
