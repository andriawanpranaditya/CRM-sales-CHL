import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { TAHAP_IOM, JABATAN, bolehProses } from '@/lib/iom';
import { GET as remindersGET } from '@/app/api/reminders/route';
import { GET as piutangGET } from '@/app/api/piutang/route';
import { GET as kontrolGET } from '@/app/api/kontrol-proses/route';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// Beranda per pengguna: satu panggilan yang merangkum apa yang perlu dikerjakan HARI INI oleh
// pengguna ini, sesuai perannya. Angka diambil dari logika yang sama dengan menu aslinya (lonceng,
// Piutang, KPR & AJB) — beranda hanya merangkum, tidak menghitung versi sendiri.

const hariIniWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const tambahHari = (t, n) => new Date(new Date(t + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const panggil = async (fn, url) => { try { const r = await fn(new Request('http://x' + url)); return r.ok ? await r.json() : null; } catch { return null; } };

async function _GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const role = user.role === 'manager' ? 'administrator' : user.role;
  const admin = role === 'administrator';
  const hariIni = hariIniWIB(), awalBulan = hariIni.slice(0, 8) + '01', seminggu = tambahHari(hariIni, 7);
  const me = (await sql`SELECT name, jabatan, divisi FROM users WHERE id = ${user.id}`)[0] || {};

  const kpi = [];        // { label, nilai, catatan, href, nada: 'merah'|'kuning'|'hijau'|'' }
  const tindakan = [];   // { judul, sub, href, nada, tgl, grup }
  const tambahTindakan = (grup, arr) => arr.forEach(x => tindakan.push({ grup, ...x }));

  // ---------- Umum: otorisasi, IOM, pemberitahuan, pekerjaan divisi ----------
  const delegasi = await sql`SELECT jabatan, divisi FROM delegasi WHERE pengganti_id = ${user.id} AND aktif = true AND CURRENT_DATE BETWEEN mulai AND selesai`.catch(() => []);
  const jabatanSaya = [me.jabatan, ...delegasi.map(d => d.jabatan)].filter(Boolean);
  const divisiSaya = [me.divisi, ...delegasi.map(d => d.divisi)].filter(Boolean);
  const otor = jabatanSaya.length ? await sql`SELECT id, ringkas, jenis, diminta_oleh, created_at::text AS dibuat FROM otorisasi
      WHERE status = 'Menunggu' AND jabatan = ANY(${jabatanSaya}) AND (divisi IS NULL OR divisi = '' OR divisi = ANY(${divisiSaya}))
      ORDER BY id LIMIT 50`.catch(() => []) : [];
  const otorSemua = admin ? Number((await sql`SELECT count(*)::int n FROM otorisasi WHERE status = 'Menunggu'`.catch(() => [{ n: 0 }]))[0].n) : 0;
  tambahTindakan('Otorisasi', otor.slice(0, 8).map(o => ({ judul: o.ringkas || o.jenis, sub: 'diminta ' + (o.diminta_oleh || '—'), href: '/otorisasi', nada: 'kuning', tgl: String(o.dibuat).slice(0, 10) })));

  const iomBerjalan = await sql`SELECT id, no, perihal, tahap, status, divisi, pengaju_username, catatan_revisi FROM iom WHERE status NOT IN ('Cair', 'Ditolak') ORDER BY id`.catch(() => []);
  const userIom = { ...user, jabatan: me.jabatan || '' };
  const iomGiliran = iomBerjalan.filter(i => i.status !== 'Revisi' && bolehProses(userIom, i.tahap)
    && !(TAHAP_IOM.find(t => t.no === i.tahap)?.pic === 'kadiv' && me.divisi && i.divisi && i.divisi !== me.divisi));
  const iomRevisi = iomBerjalan.filter(i => i.status === 'Revisi' && i.pengaju_username === user.username);
  tambahTindakan('IOM', iomGiliran.slice(0, 6).map(i => ({ judul: i.no + ' · ' + i.perihal, sub: 'menunggu ' + (JABATAN[TAHAP_IOM.find(t => t.no === i.tahap)?.pic] || 'Anda'), href: '/iom', nada: 'kuning' })));
  tambahTindakan('IOM', iomRevisi.map(i => ({ judul: i.no + ' · ' + i.perihal, sub: 'dikembalikan untuk revisi: ' + (i.catatan_revisi || ''), href: '/iom', nada: 'merah' })));

  const notif = await sql`SELECT id, judul, pesan, created_at::text AS dibuat FROM notifikasi WHERE role_tujuan = ${role} AND dibaca = false ORDER BY id DESC LIMIT 6`.catch(() => []);
  const notifJml = Number((await sql`SELECT count(*)::int n FROM notifikasi WHERE role_tujuan = ${role} AND dibaca = false`.catch(() => [{ n: 0 }]))[0].n);

  const rem = await panggil(remindersGET, '/api/reminders') || {};
  const tugas = rem.tugas || [];
  const tugasTerlambat = tugas.filter(t => t.deadline < hariIni), tugasDekat = tugas.filter(t => t.deadline >= hariIni);
  if (['collection', 'finance', 'project', 'markom', 'estate'].includes(role) || admin)
    // Tahap KPR/AJB milik Collection tampil di kelompok "KPR & AJB" (dengan posisi tahapnya) — tidak diulang di sini
    tambahTindakan('Pekerjaan divisi', tugas.filter(t => !((role === 'collection' || admin) && /^(KPR|AJB) —/.test(t.judul))).slice(0, 10).map(t => ({ judul: t.judul, sub: [t.nama, t.project, t.unit].filter(Boolean).join(' · ') + (admin ? ' · ' + t.divisi : ''),
      href: t.judul.startsWith('KPR —') || t.judul.startsWith('AJB —') ? '/kontrol-proses' : '/proses', nada: t.deadline < hariIni ? 'merah' : 'kuning', tgl: t.deadline })));

  // ---------- Per peran ----------
  const penjualanBulan = async (sales) => {
    const r = sales
      ? await sql`SELECT t.jenis, count(*)::int n, COALESCE(sum(t.harga_unit), 0)::bigint nilai FROM transactions t JOIN leads l ON l.lead_code = t.lead_code
          WHERE t.jenis IN ('Reserved', 'Booking') AND t.tgl >= ${awalBulan} AND t.batal_at IS NULL AND l.sales = ${sales} GROUP BY t.jenis`
      : await sql`SELECT t.jenis, count(*)::int n, COALESCE(sum(t.harga_unit), 0)::bigint nilai FROM transactions t
          WHERE t.jenis IN ('Reserved', 'Booking') AND t.tgl >= ${awalBulan} AND t.batal_at IS NULL GROUP BY t.jenis`;
    const o = { Reserved: { n: 0, nilai: 0 }, Booking: { n: 0, nilai: 0 } };
    r.forEach(x => { o[x.jenis] = { n: x.n, nilai: Number(x.nilai) }; });
    return o;
  };
  const fuTerlambat = rem.terlambat || [], fuHariIni = rem.hariIni || [];

  if (role === 'sales') {
    const aktif = Number((await sql`SELECT count(*)::int n FROM leads WHERE sales = ${user.name} AND status NOT IN ('Drop', 'Lost', 'Closing')`)[0].n);
    const p = await penjualanBulan(user.name);
    kpi.push({ label: 'Lead aktif saya', nilai: aktif, href: '/form' },
      { label: 'Follow up hari ini', nilai: fuHariIni.length, href: '/form', nada: fuHariIni.length ? 'kuning' : '' },
      { label: 'Follow up terlambat', nilai: fuTerlambat.length, href: '/form', nada: fuTerlambat.length ? 'merah' : 'hijau' },
      { label: 'Reserved bulan ini', nilai: p.Reserved.n, href: '/booking', catatan: 'belum diakui penjualan' },
      { label: 'Booking bulan ini', nilai: p.Booking.n, href: '/booking', catatan: 'Rp ' + p.Booking.nilai.toLocaleString('id-ID'), nada: p.Booking.n ? 'hijau' : '' });
  }
  if (role === 'markom') {
    const r = (await sql`SELECT count(*)::int semua, count(*) FILTER (WHERE created_by = ${user.username})::int saya,
        count(*) FILTER (WHERE (sales IS NULL OR sales = '') AND status NOT IN ('Drop', 'Lost'))::int tanpa_sales
      FROM leads WHERE tgl >= ${awalBulan}`)[0];
    kpi.push({ label: 'Lead masuk bulan ini', nilai: r.semua, href: '/dashboard' },
      { label: 'Lead input saya', nilai: r.saya, href: '/leads' },
      { label: 'Belum diserahkan ke Sales', nilai: r.tanpa_sales, href: '/form', nada: r.tanpa_sales ? 'kuning' : 'hijau' },
      { label: 'Follow up terlambat', nilai: fuTerlambat.length, href: '/followup', nada: fuTerlambat.length ? 'merah' : 'hijau' });
  }
  if (['sales', 'markom'].includes(role)) {
    tambahTindakan('Follow up', [...fuTerlambat, ...fuHariIni].slice(0, 10).map(l => ({ judul: l.nama + ' · ' + (l.project || ''), sub: l.lead_code + (l.sales && role !== 'sales' ? ' · ' + l.sales : ''),
      href: role === 'sales' ? '/form' : '/followup', nada: l.next_fu < hariIni ? 'merah' : 'kuning', tgl: l.next_fu })));
  }
  if (['sales', 'adminsales'].includes(role) || admin) {
    tambahTindakan('Reservasi hampir lewat', (rem.reservasi || []).slice(0, 8).map(r => ({ judul: r.nama + ' · ' + r.project + ' ' + r.unit, sub: r.sales ? 'Sales: ' + r.sales : '',
      href: '/booking', nada: r.tgl_expire < hariIni ? 'merah' : 'kuning', tgl: r.tgl_expire })));
    tambahTindakan('Tanda tangan dokumen (7 hari)', (rem.ttd || []).slice(0, 8).map(r => ({ judul: (r.nama || r.lead_code) + ' · ' + r.project + ' ' + r.unit, sub: 'tenggat tanda tangan SP/PPJB',
      href: '/verifikasi', nada: r.ttd_deadline < hariIni ? 'merah' : 'kuning', tgl: r.ttd_deadline })));
  }
  if (role === 'adminsales' || admin) {
    const v = (await sql`SELECT count(*) FILTER (WHERE finance_konfirmasi_at IS NOT NULL)::int siap, count(*) FILTER (WHERE finance_konfirmasi_at IS NULL)::int tunggu_fin
      FROM transactions WHERE verif_status = 'Menunggu' AND jenis IN ('Reserved', 'Booking', 'Closing') AND batal_at IS NULL`)[0];
    const kom = Number((await sql`SELECT count(*)::int n FROM komisi WHERE status = 'Layak'`.catch(() => [{ n: 0 }]))[0].n);
    if (role === 'adminsales') kpi.push(
      { label: 'Siap diverifikasi', nilai: v.siap, href: '/verifikasi', nada: v.siap ? 'kuning' : 'hijau', catatan: 'mutasi sudah dikonfirmasi Finance' },
      { label: 'Menunggu konfirmasi Finance', nilai: v.tunggu_fin, href: '/verifikasi' },
      { label: 'Tanda tangan mendekati tenggat', nilai: (rem.ttd || []).length, href: '/verifikasi', nada: (rem.ttd || []).length ? 'merah' : 'hijau' },
      { label: 'Komisi layak diajukan', nilai: kom, href: '/komisi', nada: kom ? 'kuning' : '' });
    if (v.siap && role === 'adminsales') tambahTindakan('Verifikasi', [{ judul: v.siap + ' transaksi siap diverifikasi', sub: 'terbitkan Surat Pesanan & PPJB', href: '/verifikasi', nada: 'kuning' }]);
    if (kom && role === 'adminsales') tambahTindakan('Komisi', [{ judul: kom + ' komisi sales layak diajukan', sub: 'pembayaran konsumen ≥ 20% atau akad selesai', href: '/komisi', nada: 'kuning' }]);
  }
  if (role === 'collection' || admin) {
    const tg = rem.tagihan || [];
    const telat = tg.filter(t => t.jatuh_tempo < hariIni), dekat = tg.filter(t => t.jatuh_tempo >= hariIni);
    const piu = await panggil(piutangGET, '/api/piutang') || { rows: [] };
    const aktifPiu = (piu.rows || []).filter(r => !r.batal_at);
    const spLayak = aktifPiu.filter(r => r.sp_disarankan);
    const tunggakan = aktifPiu.reduce((a, r) => a + Number(r.tunggakan || 0), 0);
    const perluFU = aktifPiu.filter(r => Number(r.tunggakan || 0) > 0 && !r.follow_up_ada && !Number(r.sp_terakhir || 0));
    const kon = await panggil(kontrolGET, '/api/kontrol-proses') || { kpr: [], ajb: [] };
    const kprTelat = (kon.kpr || []).filter(r => r.terlambat > 0), ajbTelat = (kon.ajb || []).filter(r => r.terlambat > 0);
    if (role === 'collection') kpi.push(
      { label: 'Tunggakan', nilai: 'Rp ' + tunggakan.toLocaleString('id-ID'), href: '/piutang', nada: tunggakan ? 'merah' : 'hijau', catatan: aktifPiu.filter(r => Number(r.tunggakan || 0) > 0).length + ' kontrak' },
      { label: 'Jatuh tempo ≤ 3 hari', nilai: dekat.length, href: '/piutang', nada: dekat.length ? 'kuning' : '' },
      { label: 'SP layak terbit', nilai: spLayak.length, href: '/piutang', nada: spLayak.length ? 'merah' : 'hijau' },
      { label: 'KPR terlambat tahap', nilai: kprTelat.length, href: '/kontrol-proses', nada: kprTelat.length ? 'merah' : 'hijau', catatan: (kon.kpr || []).filter(r => !r.selesai).length + ' sedang berjalan' },
      { label: 'AJB terlambat tahap', nilai: ajbTelat.length, href: '/kontrol-proses', nada: ajbTelat.length ? 'merah' : 'hijau' });
    tambahTindakan('Penagihan', [
      ...spLayak.slice(0, 6).map(r => ({ judul: (r.nama || r.lead_code) + ' · ' + r.unit, sub: 'SP' + r.sp_disarankan + ' layak diterbitkan', href: '/piutang', nada: 'merah' })),
      ...perluFU.slice(0, 6).map(r => ({ judul: (r.nama || r.lead_code) + ' · ' + r.unit, sub: 'menunggak — catat follow up (syarat SP1)', href: '/piutang', nada: 'kuning' })),
      ...telat.slice(0, 6).map(t => ({ judul: t.nama_konsumen + ' · ' + t.unit, sub: t.nama + ' · sisa Rp ' + Number(t.sisa).toLocaleString('id-ID'), href: '/piutang', nada: 'merah', tgl: t.jatuh_tempo })),
      ...dekat.slice(0, 6).map(t => ({ judul: t.nama_konsumen + ' · ' + t.unit, sub: t.nama + ' · Rp ' + Number(t.sisa).toLocaleString('id-ID'), href: '/piutang', nada: 'kuning', tgl: t.jatuh_tempo })),
    ]);
    const batas3 = tambahHari(hariIni, 3);
    const kprAjbDekat = [...(kon.kpr || []).map(r => ({ ...r, jenis: 'KPR' })), ...(kon.ajb || []).map(r => ({ ...r, jenis: 'AJB' }))]
      .filter(r => !r.selesai && r.aktif !== false && r.deadline && r.deadline <= batas3);
    tambahTindakan('KPR & AJB', kprAjbDekat.slice(0, 10).map(r => ({ judul: r.nama + ' · ' + r.unit, sub: r.jenis + ' tahap ' + r.tahap_no + '/' + r.jumlah + ' · ' + r.tahap_nama + (r.terlambat > 0 ? ' · terlambat ' + r.terlambat + ' hari' : ''),
      href: '/kontrol-proses', nada: r.terlambat > 0 ? 'merah' : 'kuning', tgl: r.deadline })));
    if (admin) kpi.push({ label: 'Tunggakan', nilai: 'Rp ' + tunggakan.toLocaleString('id-ID'), href: '/piutang', nada: tunggakan ? 'merah' : 'hijau', catatan: spLayak.length + ' SP layak terbit' });
  }
  if (role === 'finance' || admin) {
    const f = (await sql`SELECT
        (SELECT count(*)::int FROM transactions WHERE verif_status = 'Menunggu' AND finance_konfirmasi_at IS NULL AND jenis IN ('Reserved', 'Booking', 'Closing') AND batal_at IS NULL) mutasi,
        (SELECT count(*)::int FROM pembayaran WHERE status = 'TTS') tts,
        (SELECT COALESCE(sum(nilai), 0)::bigint FROM pembayaran WHERE status = 'KW' AND tgl >= ${awalBulan} AND COALESCE(cara, '') <> 'Pencairan KPR') masuk,
        (SELECT count(*)::int FROM komisi WHERE status = 'Disetujui') komisi,
        (SELECT count(*)::int FROM pembatalan WHERE status_refund = 'Diajukan') refund`.catch(() => [{ mutasi: 0, tts: 0, masuk: 0, komisi: 0, refund: 0 }]))[0];
    if (role === 'finance') kpi.push(
      { label: 'Konfirmasi mutasi menunggu', nilai: f.mutasi, href: '/verifikasi', nada: f.mutasi ? 'kuning' : 'hijau', catatan: 'gerbang sebelum verifikasi Admin Sales' },
      { label: 'TTS menunggu kuitansi', nilai: f.tts, href: '/piutang', nada: f.tts ? 'kuning' : 'hijau' },
      { label: 'Penerimaan bulan ini', nilai: 'Rp ' + Number(f.masuk).toLocaleString('id-ID'), href: '/piutang', catatan: 'kuitansi terbit, di luar pencairan bank' },
      { label: 'Komisi siap dibayar', nilai: f.komisi, href: '/komisi', nada: f.komisi ? 'kuning' : '' },
      { label: 'Pengembalian dana diajukan', nilai: f.refund, href: '/piutang', nada: f.refund ? 'kuning' : '' });
    if (role === 'finance') {
      const tts = await sql`SELECT p.id, p.nilai, p.tgl::text AS tgl, p.no_tts, t.unit, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama FROM pembayaran p
          JOIN transactions t ON t.id = p.trx_id LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE p.status = 'TTS' ORDER BY p.tgl LIMIT 8`.catch(() => []);
      tambahTindakan('Keuangan', [
        ...(f.mutasi ? [{ judul: f.mutasi + ' mutasi rekening menunggu konfirmasi', sub: 'cek booking fee masuk rekening', href: '/verifikasi', nada: 'kuning' }] : []),
        ...tts.map(p => ({ judul: (p.nama || '—') + ' · ' + p.unit, sub: (p.no_tts || 'TTS') + ' · Rp ' + Number(p.nilai).toLocaleString('id-ID') + ' — terbitkan kuitansi', href: '/piutang', nada: 'kuning', tgl: p.tgl })),
        ...(f.komisi ? [{ judul: f.komisi + ' komisi sudah disetujui', sub: 'menunggu pembayaran', href: '/komisi', nada: 'kuning' }] : []),
        ...(f.refund ? [{ judul: f.refund + ' pengembalian dana diajukan', sub: 'menunggu pembayaran ke konsumen', href: '/piutang', nada: 'kuning' }] : []),
      ]);
    }
    if (admin) kpi.push({ label: 'Penerimaan bulan ini', nilai: 'Rp ' + Number(f.masuk).toLocaleString('id-ID'), href: '/piutang', catatan: f.tts + ' TTS menunggu kuitansi' });
  }
  if (['project', 'estate'].includes(role) || admin) {
    const st = await sql`SELECT t.id, t.unit, t.tgl_serah_terima::text AS tgl, t.bast_at, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama
        FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
        WHERE t.batal_at IS NULL AND t.tgl_serah_terima IS NOT NULL AND t.bast_at IS NULL AND t.tgl_serah_terima <= ${seminggu} ORDER BY t.tgl_serah_terima LIMIT 20`.catch(() => []);
    const bastBulan = Number((await sql`SELECT count(*)::int n FROM transactions WHERE bast_at >= ${awalBulan} AND batal_at IS NULL`.catch(() => [{ n: 0 }]))[0].n);
    const lewat = st.filter(x => x.tgl < hariIni);
    if (role === 'project') kpi.push(
      { label: 'Serah terima ≤ 7 hari', nilai: st.length - lewat.length, href: '/proses', nada: st.length - lewat.length ? 'kuning' : '' },
      { label: 'Serah terima lewat jadwal', nilai: lewat.length, href: '/proses', nada: lewat.length ? 'merah' : 'hijau', catatan: 'BAST belum dicatat' },
      { label: 'BAST bulan ini', nilai: bastBulan, href: '/proses', nada: 'hijau' });
    if (role === 'estate') kpi.push({ label: 'Unit diserahkan bulan ini', nilai: bastBulan, href: '/proses', catatan: 'penghuni baru', nada: 'hijau' },
      { label: 'Serah terima ≤ 7 hari', nilai: st.length, href: '/proses', catatan: 'siapkan penyambutan penghuni' });
    if (role === 'project') tambahTindakan('Serah terima', st.map(x => ({ judul: x.nama + ' · ' + x.project + ' ' + x.unit, sub: x.tgl < hariIni ? 'jadwal terlewat — catat BAST' : 'jadwal serah terima', href: '/proses', nada: x.tgl < hariIni ? 'merah' : 'kuning', tgl: x.tgl })));
  }
  if (role === 'project' || role === 'estate' || role === 'markom') {
    kpi.push({ label: 'Pekerjaan divisi terlambat', nilai: tugasTerlambat.length, href: '/proses', nada: tugasTerlambat.length ? 'merah' : 'hijau', catatan: tugasDekat.length + ' jatuh tempo ≤ 3 hari' });
  }
  if (role === 'admin' || admin) {
    const p = await penjualanBulan(null);
    kpi.unshift({ label: 'Booking bulan ini', nilai: p.Booking.n, href: '/booking', catatan: 'Rp ' + p.Booking.nilai.toLocaleString('id-ID'), nada: p.Booking.n ? 'hijau' : '' },
      { label: 'Reserved bulan ini', nilai: p.Reserved.n, href: '/booking', catatan: 'belum diakui penjualan' });
    if (role === 'admin') {
      const lead = Number((await sql`SELECT count(*)::int n FROM leads WHERE tgl >= ${awalBulan}`)[0].n);
      kpi.push({ label: 'Lead masuk bulan ini', nilai: lead, href: '/dashboard' });
    }
  }
  if (admin) {
    kpi.push({ label: 'Otorisasi menunggu', nilai: otorSemua, href: '/otorisasi', nada: otorSemua ? 'kuning' : 'hijau', catatan: 'seluruh divisi' },
      { label: 'Pekerjaan divisi terlambat', nilai: tugasTerlambat.length, href: '/proses', nada: tugasTerlambat.length ? 'merah' : 'hijau',
        catatan: Object.entries(tugasTerlambat.reduce((m, t) => { m[t.divisi] = (m[t.divisi] || 0) + 1; return m; }, {})).map(([d, n]) => d + ' ' + n).join(' · ') || 'semua tepat waktu' });
  }
  if (otor.length && !admin) kpi.push({ label: 'Menunggu persetujuan saya', nilai: otor.length, href: '/otorisasi', nada: 'kuning' });
  if (iomGiliran.length) kpi.push({ label: 'IOM menunggu saya', nilai: iomGiliran.length, href: '/iom', nada: 'kuning' });

  // urutan tindakan: merah dulu, lalu kuning; di dalamnya tanggal terlama dulu
  const bobot = { merah: 0, kuning: 1, hijau: 2, '': 3 };
  tindakan.sort((a, b) => (bobot[a.nada || ''] - bobot[b.nada || '']) || String(a.tgl || '9').localeCompare(String(b.tgl || '9')));

  return jsonProyek(user, {
    hari_ini: hariIni, nama: me.name || user.name, role, jabatan: me.jabatan ? (JABATAN[me.jabatan] || me.jabatan) : '', divisi: me.divisi || '',
    kpi, tindakan: tindakan.slice(0, 40), jumlah_tindakan: tindakan.length,
    notifikasi: notif, notifikasi_jumlah: notifJml,
  });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
