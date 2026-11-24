// ===== Distribusi lead otomatis + batas respon =====
// Lead baru tanpa sales dibagi bergiliran ke sales project. Sales wajib merespon (FU / WA / janjian) dalam
// batas_respon menit (jam kerja); lewat batas_oper menit tanpa respon → otomatis dialihkan ke sales berikutnya.
// Mesin dijalankan tiap menit oleh cron-job.org (/api/cron/distribusi-lead?key=…) + cadangan saat CRM dibuka.
import { kirimPush } from '@/lib/push';
import { kualitasLead, rapikanKriteria, teksKriteria, KRITERIA_DEFAULT } from '@/lib/kualitas-lead';

const WIB = 7 * 3600e3;
export const DEFAULT_DIST = {
  aktif: true, jam_mulai: '08:00', jam_selesai: '20:00', hari: [0, 1, 2, 3, 4, 5, 6],
  batas_respon: 5, batas_oper: 10, maks_oper: 2, maks_antrian: 3, ulang_notif: 1, tunggu_ai: 30,
  tunggu_marcom: 30, hanya_siap: true, kriteria: KRITERIA_DEFAULT, // Opsi A: lead 🔥 menunggu dioper Marcom maks. 30 menit jam kerja, lalu dibagi otomatis
  pesan: 'Halo {sapaan} {nama}, saya {sales} dari {project}. Terima kasih sudah menghubungi kami 🙏 Boleh saya bantu info unit, harga & promo yang sedang berjalan?',
};

// ---------- Hitungan jam kerja (WIB) ----------
const menitDari = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const tengahMalam = t => Math.floor((t + WIB) / 864e5) * 864e5 - WIB; // UTC ms pukul 00.00 WIB pada hari t
function jendela(cfg, hari0) {
  const dow = new Date(hari0 + WIB).getUTCDay();
  if (!cfg.hari.includes(dow)) return null;
  return [hari0 + menitDari(cfg.jam_mulai) * 60e3, hari0 + menitDari(cfg.jam_selesai) * 60e3];
}
// Saat paling awal ≥ t yang berada di jam kerja
export function mulaiHitung(cfg, t) {
  let d = tengahMalam(t);
  for (let i = 0; i < 9; i++, d += 864e5) { const w = jendela(cfg, d); if (w && t < w[1]) return Math.max(t, w[0]); }
  return t;
}
export const dalamJamKerja = (cfg, t) => mulaiHitung(cfg, t) === t;
// t + ms waktu kerja
export function tambahKerja(cfg, t, ms) {
  let cur = mulaiHitung(cfg, t), sisa = ms;
  for (let i = 0; i < 40; i++) {
    const w = jendela(cfg, tengahMalam(cur));
    if (!w) return cur + sisa;
    if (sisa <= w[1] - cur) return cur + sisa;
    sisa -= w[1] - cur; cur = mulaiHitung(cfg, w[1]);
  }
  return cur + sisa;
}
// Detik kerja di antara a dan b
export function detikKerja(cfg, a, b) {
  if (!(b > a)) return 0;
  let tot = 0;
  for (let d = tengahMalam(a), i = 0; d <= b && i < 120; d += 864e5, i++) {
    const w = jendela(cfg, d); if (!w) continue;
    const s = Math.max(a, w[0]), e = Math.min(b, w[1]); if (e > s) tot += e - s;
  }
  return Math.round(tot / 1000);
}

// ---------- Tabel & setelan ----------
let siap = false;
export async function siapkanDistribusi(sql) {
  if (siap) return;
  await sql`CREATE TABLE IF NOT EXISTS lead_distribusi (
    id serial PRIMARY KEY, lead_code text NOT NULL, project text, sales text NOT NULL DEFAULT '', username text,
    urutan int NOT NULL DEFAULT 1, mode text NOT NULL DEFAULT 'otomatis', alasan text, dari text,
    mulai timestamptz NOT NULL DEFAULT now(), jam_hitung timestamptz, batas_kuning timestamptz, batas_oper timestamptz,
    status text NOT NULL DEFAULT 'menunggu', respon_at timestamptz, respon_cara text, detik_respon int,
    peringatan boolean NOT NULL DEFAULT false, terlambat boolean NOT NULL DEFAULT false,
    push_n int NOT NULL DEFAULT 0, push_at timestamptz, selesai_at timestamptz)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ld_status ON lead_distribusi (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ld_lead ON lead_distribusi (lead_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ld_mulai ON lead_distribusi (mulai)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tersedia boolean DEFAULT true`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tersedia_sampai date`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS lead_agent boolean DEFAULT false`;
  try { await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_status text`; } catch {}
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS rencana_beli text`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS siap_oper_at timestamptz`; // kapan lead jadi 🔥 (hitungan tunggu Marcom)
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS antri_sejak timestamptz`;  // lead lama yang masuk antrian lagi (Drop > 90 hari chat lagi)
  siap = true;
}

function rapikanCfg(x) {
  const c = { ...DEFAULT_DIST, ...(x || {}) };
  const jam = s => /^\d{1,2}:\d{2}$/.test(String(s)) ? String(s).padStart(5, '0') : null;
  c.jam_mulai = jam(c.jam_mulai) || DEFAULT_DIST.jam_mulai; c.jam_selesai = jam(c.jam_selesai) || DEFAULT_DIST.jam_selesai;
  if (menitDari(c.jam_selesai) <= menitDari(c.jam_mulai)) { c.jam_mulai = DEFAULT_DIST.jam_mulai; c.jam_selesai = DEFAULT_DIST.jam_selesai; }
  c.hari = Array.isArray(c.hari) ? [...new Set(c.hari.map(Number).filter(n => n >= 0 && n <= 6))] : DEFAULT_DIST.hari;
  if (!c.hari.length) c.hari = DEFAULT_DIST.hari;
  const ang = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  c.batas_respon = ang(c.batas_respon, 1, 120, 5);
  c.batas_oper = Math.max(c.batas_respon + 1, ang(c.batas_oper, 2, 240, 10));
  c.maks_oper = ang(c.maks_oper, 0, 5, 2);
  c.maks_antrian = ang(c.maks_antrian, 1, 50, 3);
  c.ulang_notif = ang(c.ulang_notif, 1, 30, 1);
  c.tunggu_ai = ang(c.tunggu_ai, 0, 240, 30);
  c.tunggu_marcom = ang(c.tunggu_marcom, 0, 480, 30);
  c.hanya_siap = c.hanya_siap !== false;
  c.kriteria = rapikanKriteria(c.kriteria);
  c.aktif = c.aktif !== false;
  c.pesan = String(c.pesan || DEFAULT_DIST.pesan).slice(0, 600);
  return c;
}

// Setelan tersimpan di settings 'distribusi_lead'. Pertama kali dibuat: dicatat waktu mulai (lead lama tidak ikut dibagi) + kunci cron.
export async function ambilCfg(sql) {
  const r = await sql`SELECT items FROM settings WHERE key = 'distribusi_lead'`.catch(() => []);
  if (r[0]?.items?.mulai && r[0]?.items?.kunci) return rapikanCfg(r[0].items);
  const awal = { ...DEFAULT_DIST, ...(r[0]?.items || {}), mulai: r[0]?.items?.mulai || new Date().toISOString(),
    kunci: r[0]?.items?.kunci || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 20) };
  await sql`INSERT INTO settings (key, items) VALUES ('distribusi_lead', ${JSON.stringify(awal)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET items = settings.items || ${JSON.stringify({ mulai: awal.mulai, kunci: awal.kunci })}::jsonb
    WHERE NOT (settings.items ? 'mulai' AND settings.items ? 'kunci')`;
  const u = await sql`SELECT items FROM settings WHERE key = 'distribusi_lead'`;
  return rapikanCfg(u[0]?.items || awal);
}
export async function simpanCfg(sql, baru) {
  const lama = await ambilCfg(sql);
  const c = rapikanCfg({ ...lama, ...baru, mulai: lama.mulai, kunci: lama.kunci });
  // Baru diaktifkan kembali → lead yang masuk selama nonaktif tidak ikut dibagi mendadak
  if (c.aktif && !lama.aktif) c.mulai = new Date().toISOString();
  await sql`UPDATE settings SET items = ${JSON.stringify(c)}::jsonb WHERE key = 'distribusi_lead'`;
  return c;
}

// ---------- Teks ----------
const rapiProject = p => String(p || '').toLowerCase().replace(/\b\w/g, h => h.toUpperCase()) || 'Cipta Harmoni Lestari';
const namaPanggil = n => /^WA\s/i.test(String(n || '')) ? '' : String(n || '').trim().split(/\s+/)[0];
export function pesanPembuka(cfg, lead, salesNama) {
  return String(cfg.pesan || DEFAULT_DIST.pesan)
    .replace(/\{sapaan\}/g, 'Bapak/Ibu').replace(/\{nama\}/g, namaPanggil(lead.nama))
    .replace(/\{sales\}/g, String(salesNama || '').split(/\s+/)[0]).replace(/\{project\}/g, rapiProject(lead.project))
    .replace(/\s{2,}/g, ' ').replace(/ ,/g, ',').trim();
}
export function linkWA(nomor, teks) {
  let n = String(nomor || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1); else if (n.startsWith('8')) n = '62' + n;
  return n.length >= 9 ? 'https://wa.me/' + n + (teks ? '?text=' + encodeURIComponent(teks) : '') : null;
}
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const jamWIB = t => { const d = new Date(t + WIB); return String(d.getUTCHours()).padStart(2, '0') + '.' + String(d.getUTCMinutes()).padStart(2, '0'); };

async function pushLead(sql, cfg, row, lead, jenis, extra = {}) {
  const now = Date.now();
  const info = [lead.nama, rapiProject(lead.project), lead.sumber, lead.tipe].filter(Boolean).join(' · ');
  const bk = new Date(row.batas_kuning).getTime(), bo = new Date(row.batas_oper).getTime(), jh = new Date(row.jam_hitung).getTime();
  let judul, isi;
  if (jenis === 'baru' || jenis === 'dialihkan') {
    judul = jenis === 'baru' ? `📩 Lead baru — hubungi dalam ${cfg.batas_respon} menit` : `📩 Lead dialihkan ke Anda — hubungi dalam ${cfg.batas_respon} menit`;
    isi = info + (extra.dari ? `\nDialihkan dari ${extra.dari} (tidak merespon ${cfg.batas_oper} menit)` : '')
      + (jh > now + 60e3 ? `\nMasuk di luar jam kerja — waktu respon mulai dihitung ${jamWIB(jh)}` : '');
  } else if (jenis === 'kuning') {
    judul = `⏰ Sudah ${cfg.batas_respon} menit — segera hubungi`;
    isi = `${lead.nama} belum direspon. ${!extra.akhir ? `${mmss(bo - now)} lagi dialihkan ke sales lain.` : 'Hubungi sekarang.'}`;
  } else if (jenis === 'ulang') {
    judul = now < bk ? `📩 ${lead.nama} menunggu — sisa ${mmss(bk - now)}` : (!extra.akhir && now < bo ? `⚠️ ${mmss(bo - now)} lagi dialihkan` : `⚠️ ${lead.nama} belum dihubungi`);
    isi = info + '\nKetuk "WA sekarang" untuk menghubungi.';
  } else return 0;
  const wa = linkWA(lead.wa, pesanPembuka(cfg, lead, row.sales));
  return kirimPush(sql, { usernames: [row.username] }, {
    judul, isi, url: '/beranda?lead=' + row.lead_code, tag: 'lead-' + row.lead_code,
    aksi: wa ? [{ action: 'hubungi', title: '💬 WA sekarang' }, { action: 'buka', title: 'Buka CRM' }] : [{ action: 'buka', title: 'Buka CRM' }],
    data: { lead: row.lead_code, wa, alarm: true },
  });
}

// ---------- Pilih sales ----------
async function calonSales(sql, project, kecuali = []) {
  const rows = await sql`SELECT u.id, u.name, u.username, u.projects,
      (SELECT count(*)::int FROM lead_distribusi d WHERE d.username = u.username AND d.status = 'menunggu') AS antri
    FROM users u WHERE u.role = 'sales' AND u.active = true AND COALESCE(u.lead_agent, false) = false
      AND (COALESCE(u.tersedia, true) = true OR (u.tersedia_sampai IS NOT NULL AND u.tersedia_sampai < (now() + interval '7 hours')::date))
    ORDER BY u.id`;
  return rows.filter(u => !kecuali.includes(u.name) && (!project || !Array.isArray(u.projects) || !u.projects.length || u.projects.includes(project)));
}
async function pilihSales(sql, cfg, project, kecuali) {
  const semua = await calonSales(sql, project, []);
  const rr = (await sql`SELECT items FROM settings WHERE key = 'distribusi_rr'`.catch(() => []))[0]?.items || {};
  const kunci = project || '_';
  // Giliran dihitung dari urutan semua sales (termasuk yang sudah dicoba) agar tetap adil saat pengalihan
  const i0 = semua.findIndex(u => u.username === rr[kunci]);
  const urut = [...semua.slice(i0 + 1), ...semua.slice(0, i0 + 1)].filter(u => !kecuali.includes(u.name));
  if (!urut.length) return null;
  // Lewati sales yang masih menahan lebih dari maks_antrian lead belum direspon; bila semua penuh → yang antriannya paling sedikit
  const dipilih = urut.find(u => u.antri <= cfg.maks_antrian) || [...urut].sort((a, b) => a.antri - b.antri)[0];
  await sql`INSERT INTO settings (key, items) VALUES ('distribusi_rr', ${JSON.stringify({ [kunci]: dipilih.username })}::jsonb)
    ON CONFLICT (key) DO UPDATE SET items = settings.items || ${JSON.stringify({ [kunci]: dipilih.username })}::jsonb`;
  return dipilih;
}

async function catatBaris(sql, cfg, { lead, sales, urutan, mode, alasan, dari }) {
  const now = Date.now();
  const jh = mulaiHitung(cfg, now), bk = tambahKerja(cfg, now, cfg.batas_respon * 60e3), bo = tambahKerja(cfg, now, cfg.batas_oper * 60e3);
  const r = await sql`INSERT INTO lead_distribusi (lead_code, project, sales, username, urutan, mode, alasan, dari, jam_hitung, batas_kuning, batas_oper, push_n, push_at)
    VALUES (${lead.lead_code}, ${lead.project || ''}, ${sales.name}, ${sales.username}, ${urutan}, ${mode}, ${alasan || ''}, ${dari || ''},
      ${new Date(jh).toISOString()}::timestamptz, ${new Date(bk).toISOString()}::timestamptz, ${new Date(bo).toISOString()}::timestamptz, 1, now())
    RETURNING *`;
  return r[0];
}

// Lead langsung ditetapkan sales-nya (bergiliran). Dipanggil saat lead tanpa sales masuk & oleh mesin tiap menit.
export async function distribusikanLead(sql, cfg, lead, { alasan = 'Lead baru' } = {}) {
  const s = await pilihSales(sql, cfg, lead.project, []);
  if (!s) {
    const sudah = await sql`SELECT 1 FROM lead_distribusi WHERE lead_code = ${lead.lead_code} AND status = 'tanpa_sales' AND mulai > now() - interval '30 minutes' LIMIT 1`;
    if (!sudah.length) {
      await sql`INSERT INTO lead_distribusi (lead_code, project, sales, status, alasan, selesai_at) VALUES (${lead.lead_code}, ${lead.project || ''}, '', 'tanpa_sales', 'Tidak ada sales tersedia', now())`;
      await kirimPush(sql, { role: 'manager' }, { judul: '⚠️ Lead baru tanpa sales', isi: `${lead.nama} · ${rapiProject(lead.project)} — tidak ada sales yang tersedia untuk dibagi. Oper manual dari Database Lead.`, url: '/distribusi', tag: 'dist-kosong-' + lead.lead_code });
    }
    return null;
  }
  const up = await sql`UPDATE leads SET sales = ${s.name}, updated_at = now() WHERE lead_code = ${lead.lead_code} AND COALESCE(sales, '') = '' RETURNING lead_code`;
  if (!up.length) return null; // sudah dipegang sales lain (diinput / dioper manual bersamaan)
  try { await sql`INSERT INTO lead_assign (lead_code, dari, ke, oleh) VALUES (${lead.lead_code}, '', ${s.name}, 'sistem-distribusi')`; } catch {}
  try { const { mulaiJadwalBaru } = await import('@/lib/fuwajib-db'); await mulaiJadwalBaru(sql, lead.lead_code); } catch {}
  const row = await catatBaris(sql, cfg, { lead, sales: s, urutan: 1, mode: 'otomatis', alasan });
  await pushLead(sql, cfg, row, lead, 'baru');
  return row;
}

// Lead yang dioper manual oleh Marcom / Manager: diukur waktu responnya, dialihkan bila tidak direspon, dan dihitung dalam giliran
export async function catatOperManual(sql, leadCode, salesNama) {
  try {
    await siapkanDistribusi(sql);
    const cfg = await ambilCfg(sql);
    if (!cfg.aktif) return;
    await sql`UPDATE lead_distribusi SET status = 'dipindah', selesai_at = now() WHERE lead_code = ${leadCode} AND status = 'menunggu'`;
    const u = (await sql`SELECT name, username FROM users WHERE name = ${salesNama} AND role = 'sales' AND active = true LIMIT 1`)[0];
    const lead = (await sql`SELECT lead_code, nama, wa, project, sumber, tipe, status FROM leads WHERE lead_code = ${leadCode}`)[0];
    if (!u || !lead || !['New', ''].includes(lead.status || '')) return;
    const n = (await sql`SELECT count(*)::int AS n FROM lead_distribusi WHERE lead_code = ${leadCode} AND sales <> ''`)[0].n;
    await catatBaris(sql, cfg, { lead, sales: u, urutan: n + 1, mode: 'manual', alasan: 'Dioper manual' });
    const kunci = lead.project || '_';
    await sql`INSERT INTO settings (key, items) VALUES ('distribusi_rr', ${JSON.stringify({ [kunci]: u.username })}::jsonb)
      ON CONFLICT (key) DO UPDATE SET items = settings.items || ${JSON.stringify({ [kunci]: u.username })}::jsonb`;
  } catch (e) { console.error('dist manual', e); }
}

// Sales merespon (FU / WA / janjian / telepon) → hitungan berhenti
export async function tandaiRespon(sql, leadCode, username, cara) {
  try {
    await siapkanDistribusi(sql);
    const rows = await sql`SELECT * FROM lead_distribusi WHERE lead_code = ${leadCode} AND status = 'menunggu' AND (${username || ''} = '' OR username = ${username || ''})`;
    if (!rows.length) return null;
    const cfg = await ambilCfg(sql);
    const r = rows[0], now = Date.now();
    const det = detikKerja(cfg, new Date(r.mulai).getTime(), now);
    await sql`UPDATE lead_distribusi SET status = 'direspon', respon_at = now(), respon_cara = ${cara || 'FU'}, detik_respon = ${det}, selesai_at = now() WHERE id = ${r.id} AND status = 'menunggu'`;
    return { detik: det };
  } catch (e) { console.error('tandai respon', e); return null; }
}

// ---------- Antrian Marcom ----------
async function antreanMentah(sql, cfg) {
  return sql`SELECT l.lead_code, l.nama, l.wa, l.project, l.sumber, l.tipe, l.bayar, l.budget, l.domisili, l.rencana_beli, l.siap_oper_at, l.created_at, l.created_by
    FROM leads l
    WHERE COALESCE(l.sales, '') = '' AND COALESCE(l.status, 'New') NOT IN ('Drop', 'Batal', 'Booking', 'Closing', 'Reserved')
      AND COALESCE(l.antri_sejak, l.created_at) >= ${cfg.mulai}::timestamptz AND l.lead_code IS NOT NULL
      AND (COALESCE(l.ai_status, '') <> 'aktif' OR l.created_at < now() - make_interval(mins => ${cfg.tunggu_ai}::int))
      AND NOT EXISTS (SELECT 1 FROM lead_distribusi d WHERE d.lead_code = l.lead_code AND d.status = 'tanpa_sales' AND d.mulai > now() - interval '30 minutes')
    ORDER BY l.id LIMIT 300`;
}
// Untuk Marcom & Manager: antrian belum dioper (dengan label & batas waktu) + lead yang baru dibagi otomatis
export async function antrianMarcom(sql) {
  await siapkanDistribusi(sql);
  const cfg = await ambilCfg(sql);
  const now = Date.now();
  const rows = cfg.aktif ? await antreanMentah(sql, cfg) : [];
  const antrian = rows.map(l => {
    const q = kualitasLead(l, cfg.kriteria);
    const ikut = !cfg.hanya_siap || q.label === 'siap';
    const batas = ikut && cfg.tunggu_marcom > 0 ? tambahKerja(cfg, l.siap_oper_at ? new Date(l.siap_oper_at).getTime() : now, cfg.tunggu_marcom * 60e3) : null;
    return { lead_code: l.lead_code, nama: l.nama, project: l.project, sumber: l.sumber, masuk: l.created_at, ...q, batas_bagi: batas ? new Date(batas).toISOString() : null };
  });
  const dibagi = await sql`SELECT d.lead_code, d.sales, d.mulai, d.alasan, d.status, l.nama, l.project FROM lead_distribusi d JOIN leads l ON l.lead_code = d.lead_code
    WHERE d.urutan = 1 AND d.mode = 'otomatis' AND d.mulai > now() - interval '2 days' ORDER BY d.id DESC LIMIT 30`;
  return { now: new Date().toISOString(), aktif: cfg.aktif, tunggu_marcom: cfg.tunggu_marcom, hanya_siap: cfg.hanya_siap, kriteria: cfg.kriteria, teks_kriteria: teksKriteria(cfg.kriteria), batas_respon: cfg.batas_respon, batas_oper: cfg.batas_oper, antrian, dibagi };
}
// Dipanggil setelah lead disimpan: catat kapan lead jadi 🔥; bila tanpa masa tunggu Marcom → langsung dibagi
export async function cekAntrian(sql, leadCode) {
  try {
    await siapkanDistribusi(sql);
    const cfg = await ambilCfg(sql);
    if (!cfg.aktif) return null;
    const l = (await sql`SELECT lead_code, nama, wa, project, sumber, tipe, bayar, budget, domisili, rencana_beli, siap_oper_at, sales, status FROM leads WHERE lead_code = ${leadCode}`)[0];
    if (!l || l.sales || ['Drop', 'Batal', 'Booking', 'Closing', 'Reserved'].includes(l.status)) return null;
    const q = kualitasLead(l, cfg.kriteria);
    if (cfg.hanya_siap && q.label !== 'siap') { if (l.siap_oper_at) await sql`UPDATE leads SET siap_oper_at = NULL WHERE lead_code = ${leadCode}`; return null; }
    if (cfg.tunggu_marcom === 0) return distribusikanLead(sql, cfg, l);
    if (!l.siap_oper_at) await sql`UPDATE leads SET siap_oper_at = now() WHERE lead_code = ${leadCode} AND siap_oper_at IS NULL`;
    return null;
  } catch (e) { console.error('cek antrian', e); return null; }
}

// ---------- Mesin (tiap menit) ----------
let tickSiap = false;
// Kunci ringan: hanya satu proses per ~45 detik (cron-job.org & CRM yang terbuka bisa memanggil bersamaan)
export async function jalankanDistribusi(sql, { paksa = false } = {}) {
  await siapkanDistribusi(sql);
  const cfg = await ambilCfg(sql);
  if (!tickSiap) { await sql`INSERT INTO settings (key, items) VALUES ('distribusi_tick', ${JSON.stringify({ t: '2000-01-01T00:00:00Z' })}::jsonb) ON CONFLICT (key) DO NOTHING`; tickSiap = true; }
  const kunci = paksa ? await sql`UPDATE settings SET items = jsonb_build_object('t', now()) WHERE key = 'distribusi_tick' RETURNING key`
    : await sql`UPDATE settings SET items = jsonb_build_object('t', now()) WHERE key = 'distribusi_tick' AND (items->>'t')::timestamptz < now() - interval '45 seconds' RETURNING key`;
  if (!kunci.length) return { lewat: true };
  const hasil = { dibagi: 0, dialihkan: 0, notif: 0, direspon: 0, ditutup: 0 };
  if (!cfg.aktif) return { ...hasil, nonaktif: true };
  const now = Date.now();

  // 1) Antrian Marcom: lead tanpa sales (masuk sejak fitur aktif). Lead 🔥 ditunggu dioper Marcom maks. tunggu_marcom menit jam kerja,
  //    lewat dari itu dibagi otomatis. Lead 🟡 / ⚪ tetap di Marcom (bila hanya_siap).
  const antri = await antreanMentah(sql, cfg);
  for (const l of antri) {
    try {
      const q = kualitasLead(l, cfg.kriteria);
      if (cfg.hanya_siap && q.label !== 'siap') { if (l.siap_oper_at) await sql`UPDATE leads SET siap_oper_at = NULL WHERE lead_code = ${l.lead_code}`; continue; }
      const siapAt = l.siap_oper_at ? new Date(l.siap_oper_at).getTime() : now;
      if (!l.siap_oper_at) await sql`UPDATE leads SET siap_oper_at = now() WHERE lead_code = ${l.lead_code} AND siap_oper_at IS NULL`;
      if (cfg.tunggu_marcom > 0 && now < tambahKerja(cfg, siapAt, cfg.tunggu_marcom * 60e3)) continue;
      const row = await distribusikanLead(sql, cfg, l, { alasan: cfg.tunggu_marcom > 0 ? `Belum dioper Marcom ${cfg.tunggu_marcom} menit` : 'Lead baru' });
      if (row) {
        hasil.dibagi++;
        if (cfg.tunggu_marcom > 0) await kirimPush(sql, { role: 'markom' }, { judul: '🤖 Lead dibagi otomatis', isi: `${l.nama} (${rapiProject(l.project)}) → ${row.sales}. Belum dioper ${cfg.tunggu_marcom} menit — tidak perlu oper lagi, cukup kirim konteks bila ada.`, url: '/form?tab=l2s&lead=' + l.lead_code, tag: 'dibagi-' + l.lead_code });
      }
    } catch (e) { console.error('dist bagi', l.lead_code, e); }
  }

  // 2) Lead yang sedang menunggu respon
  const tunggu = await sql`SELECT d.*, l.nama, l.wa, l.project AS l_project, l.sumber, l.tipe, l.sales AS l_sales, l.status AS l_status,
      EXISTS (SELECT 1 FROM followups f WHERE f.lead_code = d.lead_code AND f.created_by = d.username AND f.created_at >= d.mulai) AS ada_fu
    FROM lead_distribusi d JOIN leads l ON l.lead_code = d.lead_code WHERE d.status = 'menunggu' ORDER BY d.id`;
  for (const r of tunggu) {
    try {
      const lead = { lead_code: r.lead_code, nama: r.nama, wa: r.wa, project: r.l_project, sumber: r.sumber, tipe: r.tipe };
      if ((r.l_sales || '') !== r.sales || ['Drop', 'Batal', 'Booking', 'Closing', 'Reserved'].includes(r.l_status)) {
        await sql`UPDATE lead_distribusi SET status = 'dipindah', selesai_at = now() WHERE id = ${r.id} AND status = 'menunggu'`; hasil.ditutup++; continue;
      }
      if (r.ada_fu) { await tandaiRespon(sql, r.lead_code, r.username, 'FU'); hasil.direspon++; continue; }
      const bk = new Date(r.batas_kuning).getTime(), bo = new Date(r.batas_oper).getTime(), jh = new Date(r.jam_hitung).getTime();
      const bisaAlih = r.urutan <= cfg.maks_oper; // berlaku juga untuk lead yang dioper manual Marcom / Manager
      if (now >= bo && bisaAlih) {
        const dicoba = (await sql`SELECT DISTINCT sales FROM lead_distribusi WHERE lead_code = ${r.lead_code} AND sales <> ''`).map(x => x.sales);
        const s = await pilihSales(sql, cfg, r.l_project, dicoba);
        if (s) {
          const ok = await sql`UPDATE lead_distribusi SET status = 'dialihkan', selesai_at = now() WHERE id = ${r.id} AND status = 'menunggu' RETURNING id`;
          if (!ok.length) continue;
          const up = await sql`UPDATE leads SET sales = ${s.name}, updated_at = now() WHERE lead_code = ${r.lead_code} AND sales = ${r.sales} RETURNING lead_code`;
          if (!up.length) continue;
          try { await sql`INSERT INTO lead_assign (lead_code, dari, ke, oleh) VALUES (${r.lead_code}, ${r.sales}, ${s.name}, 'sistem-distribusi')`; } catch {}
          try { const { mulaiJadwalBaru } = await import('@/lib/fuwajib-db'); await mulaiJadwalBaru(sql, r.lead_code); } catch {}
          const row = await catatBaris(sql, cfg, { lead, sales: s, urutan: r.urutan + 1, mode: 'otomatis', alasan: `Tidak direspon ${cfg.batas_oper} menit oleh ${r.sales}`, dari: r.sales });
          await pushLead(sql, cfg, row, lead, 'dialihkan', { dari: r.sales });
          await kirimPush(sql, { usernames: [r.username] }, { judul: '↪️ Lead dialihkan', isi: `${r.nama} dialihkan ke sales lain karena belum dihubungi ${cfg.batas_oper} menit.`, url: '/beranda', tag: 'lead-' + r.lead_code });
          hasil.dialihkan++; continue;
        }
        // Tidak ada sales lain → tetap di sales ini, Manager diberi tahu
      }
      if (now >= bo && !r.terlambat) {
        await sql`UPDATE lead_distribusi SET terlambat = true WHERE id = ${r.id}`;
        await kirimPush(sql, { role: 'manager' }, { judul: '🚨 Lead belum direspon', isi: `${r.nama} (${rapiProject(r.l_project)}) belum dihubungi ${r.sales} lebih dari ${cfg.batas_oper} menit${r.urutan > 1 ? ' — sudah dialihkan maksimal' : ''}.`, url: '/distribusi', tag: 'dist-telat-' + r.lead_code });
      }
      if (!dalamJamKerja(cfg, now) || now < jh) continue; // di luar jam kerja: tidak ada notifikasi ulang
      const akhir = !bisaAlih || now >= bo;
      const jarak = now >= bo ? 5 * 60e3 : cfg.ulang_notif * 60e3; // lewat batas: ulang tiap 5 menit (maks. 20 kali)
      const terakhir = r.push_at ? new Date(r.push_at).getTime() : 0;
      if (now >= bk && !r.peringatan) {
        await sql`UPDATE lead_distribusi SET peringatan = true, push_n = push_n + 1, push_at = now() WHERE id = ${r.id}`;
        await pushLead(sql, cfg, r, lead, 'kuning', { akhir }); hasil.notif++; continue;
      }
      if (now - terakhir >= jarak - 8000 && r.push_n < 40) {
        await sql`UPDATE lead_distribusi SET push_n = push_n + 1, push_at = now() WHERE id = ${r.id}`;
        await pushLead(sql, cfg, r, lead, 'ulang', { akhir }); hasil.notif++;
      }
    } catch (e) { console.error('dist tunggu', r.lead_code, e); }
  }
  return hasil;
}

// Lead menunggu respon milik satu sales (untuk pop-up di CRM)
export async function leadMenungguSaya(sql, username) {
  await siapkanDistribusi(sql);
  const cfg = await ambilCfg(sql);
  const rows = await sql`SELECT d.id, d.lead_code, d.sales, d.urutan, d.mode, d.dari, d.mulai, d.jam_hitung, d.batas_kuning, d.batas_oper, d.terlambat,
      l.nama, l.wa, l.project, l.sumber, l.tipe, l.bayar, l.catatan, l.created_by, u.role AS pembuat_role, u.name AS pembuat
    FROM lead_distribusi d JOIN leads l ON l.lead_code = d.lead_code LEFT JOIN users u ON u.username = l.created_by
    WHERE d.status = 'menunggu' AND d.username = ${username} AND l.sales = d.sales ORDER BY d.id`;
  return rows.map(r => ({ ...r, batas: cfg.batas_respon, batas_alih: cfg.batas_oper, maks: r.urutan > cfg.maks_oper, pesan: pesanPembuka(cfg, r, r.sales), wa_link: linkWA(r.wa, pesanPembuka(cfg, r, r.sales)) }));
}
