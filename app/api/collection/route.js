import { db } from '@/lib/db';
import { requireUser, lihatBaris, pesanProyek } from '@/lib/auth';
import { denganLog } from '@/lib/log';
import { siapkanKpr, sinkronKpr, statusKpr } from '@/lib/kpr';
import { siapkanCollection, siapkanKontrak, daftarTagihan, ringkasTagihan, daftarKontrak, resumeKontrak } from '@/lib/collection';
import { imporPermaiKontrak } from '@/lib/impor-permai';
import { daftarBerkas } from '@/lib/kpr';

export const dynamic = 'force-dynamic';
const LIHAT = ['manager', 'ceo', 'collection'], UBAH = ['manager', 'collection']; // CEO hanya melihat
const hariWIB = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const geser = (t, n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// Data KPR untuk ringkasan Collection & KPR
async function dataKpr(sql, user, pp, hariIni) {
  await siapkanKpr(sql); await sinkronKpr(sql);
  const rows = await sql`SELECT k.id, k.lead_code, k.unit, k.profil, k.berkas, k.slik_tgl, k.akad_bank_id, k.akad_tgl::text AS akad_tgl, k.akad_realisasi::text AS akad_realisasi, k.updated_at,
      l.nama, l.sales, l.wa, l.created_by AS lead_by, COALESCE(NULLIF(k.project, ''), l.project, '') AS project,
      (SELECT t.jenis FROM transactions t WHERE t.lead_code = k.lead_code ORDER BY t.id DESC LIMIT 1) AS trx_terakhir,
      (SELECT t.nilai_jual FROM transactions t WHERE t.lead_code = k.lead_code AND t.nilai_jual IS NOT NULL ORDER BY t.id DESC LIMIT 1) AS harga
    FROM kpr k LEFT JOIN leads l ON l.lead_code = k.lead_code
    WHERE (${pp}::text[] IS NULL OR COALESCE(NULLIF(k.project, ''), l.project, '') = ANY(${pp}::text[]))`;
  const ids = rows.map(r => r.id);
  const banks = ids.length ? await sql`SELECT id, kpr_id, bank, ao_nama, tahap, kendala, tgl_ajukan::text AS tgl_ajukan, updated_at FROM kpr_bank WHERE kpr_id = ANY(${ids}::int[]) ORDER BY id` : [];
  const list = rows.filter(r => lihatBaris(user, { project: r.project, sales: r.sales, created_by: r.lead_by })).map(r => {
    const bk = banks.filter(b => b.kpr_id === r.id), st = statusKpr(r, bk, r.trx_terakhir);
    return { ...r, banks: bk, status: st, diam: Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86400000),
      kendala: bk.filter(b => b.kendala && !['Ditolak', 'Tidak dilanjutkan'].includes(b.tahap)).map(b => `${b.bank}: ${b.kendala}`).join(' · '),
      akadBank: (bk.find(b => b.id === r.akad_bank_id) || {}).bank || '' };
  }).filter(r => r.trx_terakhir !== 'Batal');
  const bln = hariIni.slice(0, 7), thn = hariIni.slice(0, 4);
  const berjalan = list.filter(r => r.status.kategori === 'berjalan'), sp3k = list.filter(r => r.status.kategori === 'sp3k'), akad = list.filter(r => r.status.kategori === 'akad');
  const tahap = {}; berjalan.forEach(r => { tahap[r.status.label] = (tahap[r.status.label] || 0) + 1; });
  const akadBulan = list.filter(r => (r.akad_realisasi || '').startsWith(bln));
  const perBank = {};
  banks.forEach(b => { const r = list.find(x => x.id === b.kpr_id); if (!r) return; const x = perBank[b.bank] || (perBank[b.bank] = { bank: b.bank, diajukan: 0, analisa: 0, sp3k: 0, ditolak: 0, akadTahun: 0, hariSp3k: [] });
    if (['Diajukan', 'Kumpul berkas'].includes(b.tahap)) x.diajukan++; else if (b.tahap === 'Analisa kredit') x.analisa++; else if (b.tahap === 'SP3K terbit') x.sp3k++; else if (b.tahap === 'Ditolak') x.ditolak++;
    if (r.akadBank === b.bank && (r.akad_realisasi || '').startsWith(thn)) x.akadTahun++;
    if (b.tahap === 'SP3K terbit' && b.tgl_ajukan && b.updated_at) x.hariSp3k.push(Math.round((new Date(b.updated_at) - Date.parse(b.tgl_ajukan)) / 86400000)); });
  const jadwalAkad = list.filter(r => r.status.kategori === 'akad' && r.akad_tgl).map(r => ({ tgl: r.akad_tgl, id: r.id, lead_code: r.lead_code, nama: r.nama, unit: r.unit, project: r.project, sales: r.sales, bank: r.akadBank, nilai: Number(r.harga || 0), lewat: r.akad_tgl < hariIni })).sort((a, b) => a.tgl.localeCompare(b.tgl));
  return { list, ringkas: { berjalan: berjalan.length, tahap, sp3k: sp3k.length, sp3kJadwal: akad.length, akad: akad.length, akadBulan: akadBulan.length, akadBulanNilai: akadBulan.reduce((a, r) => a + Number(r.harga || 0), 0), selesaiTahun: list.filter(r => (r.akad_realisasi || '').startsWith(thn)).length },
    perBank: Object.values(perBank).map(x => ({ ...x, hariSp3k: x.hariSp3k.length ? Math.round(x.hariSp3k.reduce((a, b) => a + b, 0) / x.hariSp3k.length) : null })).sort((a, b) => (b.diajukan + b.analisa + b.sp3k) - (a.diajukan + a.analisa + a.sp3k)), jadwalAkad };
}

export async function GET(req) {
  const { user, err } = await requireUser(LIHAT); if (err) return err;
  const sql = db();
  await siapkanCollection(sql);
  const q = new URL(req.url).searchParams;
  const pj = q.get('project') || null;
  if (pj && user.projects && !user.projects.includes(pj)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  const pp = pj ? [pj] : user.projects;
  const hariIni = hariWIB();
  if (q.get('riwayat')) { // riwayat pembayaran satu konsumen
    const kode = q.get('riwayat');
    const bayar = await sql`SELECT p.id, p.tagihan_id, p.tgl::text AS tgl, p.nominal, p.cara, p.bukti_nama, p.catatan, p.created_by, p.created_at, g.ket FROM pembayaran p LEFT JOIN tagihan g ON g.id = p.tagihan_id WHERE p.lead_code = ${kode} ORDER BY p.tgl DESC, p.id DESC`;
    return Response.json({ bayar });
  }
  await siapkanKontrak(sql);
  const [tagihan, kpr, tgt, kontrakSemua, berkas] = await Promise.all([daftarTagihan(sql, { pp, hariIni }), dataKpr(sql, user, pp, hariIni), sql`SELECT items FROM settings WHERE key = 'target_akad'`.catch(() => []), daftarKontrak(sql, { pp, hariIni }), daftarBerkas(sql)]);
  const kontrak = kontrakSemua.filter(r => lihatBaris(user, { project: r.project, sales: r.sales, created_by: r.lead_by }));
  const stokBelum = await sql`SELECT items FROM settings WHERE key = 'units'`.then(x => { const u = x[0]?.items || {}; return Object.entries(u).filter(([p]) => !pp || pp.includes(p)).reduce((a, [, v]) => a + (Array.isArray(v) ? v.length : 0), 0); }).catch(() => 0);
  const rows = tagihan.filter(r => lihatBaris(user, { project: r.project, sales: r.sales, created_by: r.lead_by }));
  const target = tgt[0]?.items || {};
  // Perlu tindakan: tunggakan, akad lewat, berkas/kendala lama, SP3K belum pilih bank, jatuh tempo besok, KPR diam
  const perhatian = [];
  rows.filter(r => r.status === 'Tunggakan' || r.status === 'Kurang bayar').sort((a, b) => b.hariLewat - a.hariLewat).slice(0, 5).forEach(r => perhatian.push({ level: 'merah', judul: `${r.ket} ${r.nama} lewat ${r.hariLewat} hari — sisa ${fmt(r.sisa)}`, sub: [r.unit, r.bayar, r.sales].filter(Boolean).join(' · '), href: '/collection?tab=tagihan&lead=' + r.lead_code, tombol: 'Tagih' }));
  kpr.jadwalAkad.filter(a => a.lewat).forEach(a => perhatian.push({ level: 'merah', judul: `Akad ${a.nama} dijadwalkan ${a.tgl} — realisasi belum diisi`, sub: [a.unit, a.bank, a.sales].filter(Boolean).join(' · '), href: '/kpr-proses?id=' + a.id, tombol: 'Isi' }));
  kpr.list.filter(r => r.status.kategori === 'berjalan' && r.kendala && r.diam >= 3).slice(0, 4).forEach(r => perhatian.push({ level: 'merah', judul: `Kendala ${r.nama}: ${r.kendala}`, sub: [r.unit, r.status.label, r.sales, r.diam + ' hari'].filter(Boolean).join(' · '), href: '/kpr-proses?id=' + r.id, tombol: 'Ingatkan' }));
  kpr.list.filter(r => r.status.kategori === 'sp3k').forEach(r => perhatian.push({ level: 'emas', judul: `SP3K ${r.nama} terbit — belum pilih bank akad`, sub: [r.unit, r.banks.map(b => b.bank).join(' & '), r.sales].filter(Boolean).join(' · '), href: '/kpr-proses?id=' + r.id, tombol: 'Jadwalkan' }));
  rows.filter(r => r.sisa > 0 && r.hariKe >= 0 && r.hariKe <= 1).slice(0, 4).forEach(r => perhatian.push({ level: 'emas', judul: `${r.ket} ${r.nama} jatuh tempo ${r.hariKe === 0 ? 'hari ini' : 'besok'} — ${fmt(r.sisa)}`, sub: [r.unit, r.bayar].filter(Boolean).join(' · '), href: '/collection?tab=tagihan&lead=' + r.lead_code, tombol: 'Ingatkan' }));
  kpr.list.filter(r => ['berjalan', 'sp3k', 'akad'].includes(r.status.kategori) && r.diam > 3 && !r.kendala).slice(0, 3).forEach(r => perhatian.push({ level: 'emas', judul: `KPR ${r.nama} tidak di-update ${r.diam} hari`, sub: [r.unit, r.status.label, r.banks.map(b => b.bank).join(', ')].filter(Boolean).join(' · '), href: '/kpr-proses?id=' + r.id, tombol: 'Update' }));
  // jadwal 14 hari: akad + jatuh tempo
  const t14 = geser(hariIni, 14);
  const jadwal = [
    ...kpr.jadwalAkad.filter(a => a.tgl >= hariIni && a.tgl <= t14).map(a => ({ tgl: a.tgl, nama: a.nama, unit: a.unit, sales: a.sales, kejadian: 'Akad KPR' + (a.bank ? ' · ' + a.bank : ''), nilai: a.nilai, jenis: 'akad', href: '/kpr-proses?id=' + a.id })),
    ...rows.filter(r => r.sisa > 0 && r.jatuh_tempo >= hariIni && r.jatuh_tempo <= t14).map(r => ({ tgl: r.jatuh_tempo, nama: r.nama, unit: r.unit, sales: r.sales, kejadian: r.ket, nilai: r.sisa, jenis: 'tagihan', href: '/collection?tab=tagihan&lead=' + r.lead_code })),
  ].sort((a, b) => a.tgl.localeCompare(b.tgl));
  return Response.json({ hariIni, project: pj, readOnly: user.role === 'ceo', me: { name: user.name, role: user.role }, tagihan: rows, ringkasTagihan: ringkasTagihan(rows, hariIni), kpr: kpr.ringkas, kprList: kpr.list.map(r => ({ id: r.id, lead_code: r.lead_code, nama: r.nama, unit: r.unit, project: r.project, sales: r.sales, status: r.status, banks: r.banks.map(b => b.bank), kendala: r.kendala, diam: r.diam, akad_tgl: r.akad_tgl, akad_realisasi: r.akad_realisasi, akadBank: r.akadBank })),
    perBank: kpr.perBank, jadwalAkad: kpr.jadwalAkad, perhatian, jadwal, target, targetBulan: Number((target[hariIni.slice(0, 7)] || {})[pj || 'SEMUA'] || 0),
    kontrak, resume: resumeKontrak(kontrak), unitBelumTerjual: Math.max(0, stokBelum - kontrak.length), berkas });
}
const fmt = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

async function _POST(req) {
  const { user, err } = await requireUser(UBAH); if (err) return err;
  const sql = db();
  await siapkanCollection(sql);
  const b = await req.json().catch(() => ({}));
  if (b.aksi === 'bayar') {
    const g = b.tagihan_id ? (await sql`SELECT id, lead_code, project, ket, nominal FROM tagihan WHERE id = ${Number(b.tagihan_id)}`)[0] : null;
    const kode = g?.lead_code || b.lead_code;
    if (!kode) return Response.json({ error: 'Pilih tagihan / konsumen' }, { status: 400 });
    const nominal = Number(b.nominal); if (!nominal || nominal <= 0) return Response.json({ error: 'Nominal wajib diisi' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.tgl || '')) return Response.json({ error: 'Tanggal bayar wajib diisi' }, { status: 400 });
    const l = (await sql`SELECT nama, project, sales, created_by FROM leads WHERE lead_code = ${kode}`)[0];
    if (l && !lihatBaris(user, l)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
    const bukti = b.bukti_data && String(b.bukti_data).length < 4_000_000 ? b.bukti_data : null;
    const ins = await sql`INSERT INTO pembayaran (tagihan_id, lead_code, tgl, nominal, cara, bukti_nama, bukti_mime, bukti_data, catatan, created_by)
      VALUES (${g?.id || null}, ${kode}, ${b.tgl}, ${nominal}, ${b.cara || ''}, ${bukti ? (b.bukti_nama || 'bukti') : null}, ${bukti ? (b.bukti_mime || '') : null}, ${bukti}, ${b.catatan || ''}, ${user.username}) RETURNING id`;
    // tercatat di riwayat follow up lead agar sales tahu
    const detailFU = '💰 Pembayaran diterima ' + fmt(nominal) + (g ? ' — ' + g.ket : '') + (b.cara ? ' via ' + b.cara : '') + (b.catatan ? ' · ' + b.catatan : '');
    try { await sql`INSERT INTO followups (lead_code, tgl, detail, objection, next_action, next_tgl, wa_pesan, created_by, balas)
      VALUES (${kode}, ${b.tgl}, ${detailFU}, '', '', null, '', ${user.username}, null)`; } catch {}
    return Response.json({ ok: true, id: ins[0].id, lead_code: kode, nama: l?.nama, aksi: 'Catat pembayaran ' + fmt(nominal) });
  }
  if (b.aksi === 'hapus_bayar') {
    const p = (await sql`DELETE FROM pembayaran WHERE id = ${Number(b.id)} RETURNING lead_code, nominal`)[0];
    if (!p) return Response.json({ error: 'Pembayaran tidak ditemukan' }, { status: 404 });
    return Response.json({ ok: true, lead_code: p.lead_code, aksi: 'Hapus pembayaran ' + fmt(p.nominal) });
  }
  if (b.aksi === 'ubah_tagihan') {
    const g = (await sql`SELECT id, lead_code FROM tagihan WHERE id = ${Number(b.id)}`)[0];
    if (!g) return Response.json({ error: 'Tagihan tidak ditemukan' }, { status: 404 });
    const jt = /^\d{4}-\d{2}-\d{2}$/.test(b.jatuh_tempo || '') ? b.jatuh_tempo : null, nom = Number(b.nominal) || 0, nonaktif = b.nonaktif === true;
    await sql`UPDATE tagihan SET jatuh_tempo = ${jt}, nominal = ${nom}, ket = ${b.ket || ''},
      nonaktif = ${nonaktif}, catatan = ${b.catatan || ''}, sumber = 'manual', updated_at = now() WHERE id = ${g.id}`;
    return Response.json({ ok: true, lead_code: g.lead_code, aksi: b.nonaktif ? 'Hapus tagihan' : 'Ubah tagihan' });
  }
  if (b.aksi === 'tambah_tagihan') {
    const l = (await sql`SELECT nama, project FROM leads WHERE lead_code = ${b.lead_code || ''}`)[0];
    if (!l) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
    const mx = (await sql`SELECT COALESCE(max(urut), 0)::int AS m FROM tagihan WHERE lead_code = ${b.lead_code} AND unit = ${b.unit || ''}`)[0].m;
    await sql`INSERT INTO tagihan (lead_code, project, unit, urut, jenis, ket, jatuh_tempo, nominal, sumber) VALUES (${b.lead_code}, ${l.project || ''}, ${b.unit || ''}, ${mx + 100}, ${b.jenis || 'Lainnya'}, ${b.ket || 'Tagihan'}, ${b.jatuh_tempo || null}, ${Number(b.nominal) || 0}, 'manual')`;
    return Response.json({ ok: true, lead_code: b.lead_code, nama: l.nama, aksi: 'Tambah tagihan' });
  }
  if (b.aksi === 'impor_permai') {
    const hasil = await imporPermaiKontrak(sql, user, { cek: b.cek === true });
    return Response.json({ ok: true, ...hasil, aksi: (b.cek ? 'Cek impor' : 'Impor') + ' kontrak Permai Indah' });
  }
  if (b.aksi === 'ubah_kontrak') { // data kontrak per konsumen: no kontrak, skema, tipe sales, potensi batal, catatan
    const l = (await sql`SELECT lead_code, nama, project, sales, created_by FROM leads WHERE lead_code = ${b.lead_code || ''}`)[0];
    if (!l) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
    if (!lihatBaris(user, l)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
    await siapkanKontrak(sql);
    await sql`UPDATE leads SET sales_tipe = ${b.sales_tipe || ''}, sales_kantor = ${b.sales_kantor || ''}, sales_hp = ${b.sales_hp || ''}, potensi_batal = ${b.potensi_batal === true}, updated_at = now() WHERE lead_code = ${l.lead_code}`;
    await sql`UPDATE transactions SET no_kontrak = ${b.no_kontrak || ''}, skema = ${b.skema || ''} WHERE lead_code = ${l.lead_code} AND unit = ${b.unit || ''} AND jenis IN ('Booking', 'Closing')`;
    if ('catatan' in b) await sql`UPDATE transactions SET catatan = ${b.catatan || ''} WHERE lead_code = ${l.lead_code} AND unit = ${b.unit || ''} AND jenis IN ('Booking', 'Closing')`;
    return Response.json({ ok: true, lead_code: l.lead_code, nama: l.nama, aksi: 'Ubah data kontrak' });
  }
  if (b.aksi === 'target') { // target akad per bulan & project — disiapkan, angka diisi manual
    const bulan = String(b.bulan || '').slice(0, 7); if (!/^\d{4}-\d{2}$/.test(bulan)) return Response.json({ error: 'Bulan tidak valid' }, { status: 400 });
    const cur = (await sql`SELECT items FROM settings WHERE key = 'target_akad'`.catch(() => []))[0]?.items || {};
    cur[bulan] = { ...(cur[bulan] || {}), [b.project || 'SEMUA']: Number(b.n) || 0 };
    await sql`INSERT INTO settings (key, items) VALUES ('target_akad', ${JSON.stringify(cur)}::jsonb) ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(cur)}::jsonb`;
    return Response.json({ ok: true, aksi: `Target akad ${bulan} ${b.project || 'semua'} = ${Number(b.n) || 0}` });
  }
  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}
const ringkas = ({ out }) => ({ detail: [out.lead_code, out.nama, out.aksi].filter(Boolean).join(' · ') });
export const POST = denganLog('Collection & KPR', _POST, ringkas);
