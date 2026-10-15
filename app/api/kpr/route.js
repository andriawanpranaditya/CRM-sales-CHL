import { db } from '@/lib/db';
import { requireUser, lihatBaris, pesanProyek } from '@/lib/auth';
import { denganLog } from '@/lib/log';
import { siapkanKpr, sinkronKpr, statusKpr, daftarBerkas, BANK_KPR, TAHAP_BANK, PROFIL, BERKAS_DEFAULT } from '@/lib/kpr';

export const dynamic = 'force-dynamic';

const PERAN = ['manager', 'ceo', 'sales'];
const tglAtauNull = v => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const angka = v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[^\d.]/g, '')) || null);

// Ambil KPR + lead-nya, lalu cek hak akses: sales hanya konsumen miliknya; manager/CEO sesuai akses project
async function ambil(sql, user, id) {
  const r = await sql`SELECT k.*, l.nama, l.wa, l.sales, l.created_by AS lead_by, COALESCE(NULLIF(k.project, ''), l.project, '') AS proj
    FROM kpr k LEFT JOIN leads l ON l.lead_code = k.lead_code WHERE k.id = ${Number(id) || 0}`;
  if (!r.length) return { err: Response.json({ error: 'Data KPR tidak ditemukan' }, { status: 404 }) };
  const k = r[0];
  if (user.role === 'sales' && k.sales !== user.name) return { err: Response.json({ error: 'Konsumen ini bukan milik Anda' }, { status: 403 }) };
  if (!lihatBaris(user, { project: k.proj, sales: k.sales, created_by: k.lead_by })) return { err: Response.json({ error: pesanProyek(user) }, { status: 403 }) };
  return { k };
}
async function catatLog(sql, kprId, user, isi) {
  if (!isi) return;
  await sql`INSERT INTO kpr_log (kpr_id, oleh, isi) VALUES (${kprId}, ${user.name}, ${String(isi).slice(0, 500)})`;
  await sql`UPDATE kpr SET updated_at = now(), updated_by = ${user.name} WHERE id = ${kprId}`;
}

export async function GET(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanKpr(sql);
  const q = new URL(req.url).searchParams;

  // Unduh dokumen hasil bank (SP3K / surat penolakan)
  if (q.get('dok')) {
    const b = await sql`SELECT kpr_id, dok_nama, dok_mime, dok_data FROM kpr_bank WHERE id = ${Number(q.get('dok')) || 0}`;
    if (!b.length || !b[0].dok_data) return Response.json({ error: 'Dokumen tidak ada' }, { status: 404 });
    const { err: e2 } = await ambil(sql, user, b[0].kpr_id); if (e2) return e2;
    return new Response(Buffer.from(b[0].dok_data, 'base64'), { headers: {
      'Content-Type': b[0].dok_mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(b[0].dok_nama || 'dokumen')}"` } });
  }

  const berkas = await daftarBerkas(sql);
  // Detail satu konsumen
  if (q.get('id')) {
    const { k, err: e2 } = await ambil(sql, user, q.get('id')); if (e2) return e2;
    const banks = await sql`SELECT id, kpr_id, bank, ao_nama, ao_wa, cabang, tgl_ajukan::text AS tgl_ajukan, tahap, kendala, plafon_setuju,
        dok_nama, dok_at, (dok_data IS NOT NULL) AS ada_dok, updated_at FROM kpr_bank WHERE kpr_id = ${k.id} ORDER BY id`;
    const log = await sql`SELECT waktu, oleh, isi FROM kpr_log WHERE kpr_id = ${k.id} ORDER BY waktu DESC LIMIT 50`;
    const trx = await sql`SELECT jenis, tgl::text AS tgl, unit FROM transactions WHERE lead_code = ${k.lead_code} ORDER BY id DESC LIMIT 1`;
    const jenisTrx = trx[0]?.jenis || null;
    return Response.json({ kpr: { ...k, slik_tgl: k.slik_tgl ? String(k.slik_tgl instanceof Date ? k.slik_tgl.toISOString() : k.slik_tgl).slice(0, 10) : null,
      akad_tgl: k.akad_tgl ? String(k.akad_tgl instanceof Date ? k.akad_tgl.toISOString() : k.akad_tgl).slice(0, 10) : null,
      akad_realisasi: k.akad_realisasi ? String(k.akad_realisasi instanceof Date ? k.akad_realisasi.toISOString() : k.akad_realisasi).slice(0, 10) : null },
      banks, log, trx: trx[0] || null, status: statusKpr(k, banks, jenisTrx), berkas, BANK_KPR, TAHAP_BANK, PROFIL });
  }

  // Daftar
  await sinkronKpr(sql);
  let rows = await sql`SELECT k.id, k.lead_code, k.unit, k.profil, k.berkas, k.plafon, k.tenor, k.slik_tgl::text AS slik_tgl, k.slik_status,
      k.akad_bank_id, k.akad_tgl::text AS akad_tgl, k.akad_realisasi::text AS akad_realisasi, k.updated_at, k.updated_by,
      l.nama, l.sales, l.created_by AS lead_by, COALESCE(NULLIF(k.project, ''), l.project, '') AS project,
      (SELECT t.jenis FROM transactions t WHERE t.lead_code = k.lead_code ORDER BY t.id DESC LIMIT 1) AS trx_terakhir
    FROM kpr k LEFT JOIN leads l ON l.lead_code = k.lead_code
    WHERE (${user.role === 'sales' ? user.name : null}::text IS NULL OR l.sales = ${user.role === 'sales' ? user.name : null})
    ORDER BY k.updated_at DESC`;
  rows = rows.filter(r => lihatBaris(user, { project: r.project, sales: r.sales, created_by: r.lead_by }));
  const ids = rows.map(r => r.id);
  const banks = ids.length ? await sql`SELECT id, kpr_id, bank, ao_nama, cabang, tahap, kendala, updated_at FROM kpr_bank WHERE kpr_id = ANY(${ids}::int[]) ORDER BY id` : [];
  const hari = 86400000;
  const out = rows.map(r => {
    const bk = banks.filter(b => b.kpr_id === r.id);
    const st = statusKpr(r, bk, r.trx_terakhir);
    const daftar = berkas[r.profil] || [];
    const centang = Array.isArray(r.berkas) ? r.berkas.filter(x => daftar.includes(x)).length : 0;
    const diam = Math.floor((Date.now() - new Date(r.updated_at).getTime()) / hari);
    return { ...r, banks: bk, status: st, berkas_ok: centang, berkas_total: daftar.length, diam_hari: diam,
      batal: r.trx_terakhir === 'Batal', kendala: bk.filter(b => b.kendala && !['Ditolak', 'Tidak dilanjutkan'].includes(b.tahap)).map(b => b.kendala).join(' · ') };
  });
  return Response.json({ rows: out, berkas, BANK_KPR, PROFIL });
}

// Tambah: kartu KPR manual (lead dengan Reserved/Booking) atau pengajuan ke bank baru
async function _POST(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanKpr(sql);
  const b = await req.json().catch(() => ({}));
  if (b.jenis === 'baru') {
    const l = await sql`SELECT l.lead_code, l.project, l.sales, l.created_by FROM leads l WHERE l.lead_code = ${b.lead_code || ''}`;
    if (!l.length) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
    if (user.role === 'sales' && l[0].sales !== user.name) return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
    if (!lihatBaris(user, l[0])) return Response.json({ error: pesanProyek(user) }, { status: 403 });
    const t = await sql`SELECT unit, COALESCE(NULLIF(project, ''), ${l[0].project || ''}) AS project FROM transactions
      WHERE lead_code = ${l[0].lead_code} AND jenis IN ('Booking', 'Closing') ORDER BY id DESC LIMIT 1`;
    if (!t.length) return Response.json({ error: 'Proses KPR dimulai setelah Booking — lead ini belum Booking' }, { status: 400 });
    const r = await sql`INSERT INTO kpr (lead_code, project, unit, updated_by) VALUES (${l[0].lead_code}, ${t[0].project}, ${t[0].unit || ''}, ${user.name})
      ON CONFLICT (lead_code) DO UPDATE SET updated_at = kpr.updated_at RETURNING id`;
    await catatLog(sql, r[0].id, user, 'Kartu KPR dibuat');
    return Response.json({ ok: true, id: r[0].id, lead_code: l[0].lead_code });
  }
  if (b.jenis === 'bank') {
    const { k, err: e2 } = await ambil(sql, user, b.kpr_id); if (e2) return e2;
    if (!k.slik_tgl) return Response.json({ error: 'Isi hasil Verifikasi & SLIK dulu sebelum mengajukan ke bank' }, { status: 400 });
    const tj = await sql`SELECT jenis FROM transactions WHERE lead_code = ${k.lead_code} ORDER BY id DESC LIMIT 1`;
    if (tj[0]?.jenis === 'Reserved') return Response.json({ error: 'Proses KPR dimulai setelah Booking — naikkan transaksi ke Booking dulu' }, { status: 400 });
    if (k.akad_bank_id) return Response.json({ error: 'Bank akad sudah dipilih — pengajuan bank sudah ditutup' }, { status: 400 });
    const bank = String(b.bank || '').trim();
    if (!bank) return Response.json({ error: 'Pilih bank' }, { status: 400 });
    const r = await sql`INSERT INTO kpr_bank (kpr_id, bank, ao_nama, ao_wa, cabang, tgl_ajukan)
      VALUES (${k.id}, ${bank}, ${b.ao_nama || ''}, ${b.ao_wa || ''}, ${b.cabang || ''}, ${tglAtauNull(b.tgl_ajukan) || new Date().toISOString().slice(0, 10)}) RETURNING id`;
    await catatLog(sql, k.id, user, `Diajukan ke ${bank}` + (b.cabang ? ` (${b.cabang})` : '') + (b.ao_nama ? `, AO ${b.ao_nama}` : ''));
    return Response.json({ ok: true, id: r[0].id, lead_code: k.lead_code, nama: k.nama });
  }
  return Response.json({ error: 'Jenis tidak dikenal' }, { status: 400 });
}

async function _PATCH(req) {
  const { user, err } = await requireUser(PERAN); if (err) return err;
  const sql = db();
  await siapkanKpr(sql);
  const b = await req.json().catch(() => ({}));

  // Daftar berkas per profil — khusus manager
  if (b.jenis === 'atur_berkas') {
    if (user.role !== 'manager') return Response.json({ error: 'Hanya manager' }, { status: 403 });
    const data = {};
    for (const p of PROFIL) data[p] = (Array.isArray(b.data?.[p]) ? b.data[p] : BERKAS_DEFAULT[p]).map(x => String(x).trim()).filter(Boolean).slice(0, 30);
    await sql`INSERT INTO settings (key, items) VALUES ('kpr_berkas', ${JSON.stringify(data)}) ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
    return Response.json({ ok: true });
  }

  if (b.jenis === 'kpr') {
    const { k, err: e2 } = await ambil(sql, user, b.id); if (e2) return e2;
    const berkas = await daftarBerkas(sql);
    const profil = PROFIL.includes(b.profil) ? b.profil : k.profil;
    const centang = Array.isArray(b.berkas) ? b.berkas.filter(x => (berkas[profil] || []).includes(x)) : k.berkas;
    const slikTgl = 'slik_tgl' in b ? tglAtauNull(b.slik_tgl) : k.slik_tgl;
    await sql`UPDATE kpr SET profil = ${profil}, berkas = ${JSON.stringify(centang || [])}::jsonb,
      plafon = ${'plafon' in b ? angka(b.plafon) : k.plafon}, tenor = ${'tenor' in b ? angka(b.tenor) : k.tenor},
      slik_status = ${'slik_status' in b ? (b.slik_status || null) : k.slik_status}, slik_tgl = ${slikTgl},
      slik_catatan = ${'slik_catatan' in b ? (b.slik_catatan || '') : k.slik_catatan}, catatan = ${'catatan' in b ? (b.catatan || '') : k.catatan}
      WHERE id = ${k.id}`;
    const isi = [];
    if (b.slik_status && b.slik_status !== k.slik_status) isi.push(`Verifikasi & SLIK: ${b.slik_status}` + (b.slik_catatan ? ` (${b.slik_catatan})` : ''));
    if (profil !== k.profil) isi.push(`Profil pemohon: ${profil}`);
    if (Array.isArray(b.berkas)) isi.push(`Berkas ${centang.length}/${(berkas[profil] || []).length} lengkap`);
    if ('plafon' in b || 'tenor' in b) isi.push('Plafon/tenor diperbarui');
    if (b.catatan && b.catatan !== k.catatan) isi.push('Catatan: ' + b.catatan);
    await catatLog(sql, k.id, user, isi.join(' · ') || 'Data KPR diperbarui');
    return Response.json({ ok: true, lead_code: k.lead_code, nama: k.nama });
  }

  if (b.jenis === 'bank') {
    const bk = await sql`SELECT * FROM kpr_bank WHERE id = ${Number(b.id) || 0}`;
    if (!bk.length) return Response.json({ error: 'Pengajuan bank tidak ditemukan' }, { status: 404 });
    const { k, err: e2 } = await ambil(sql, user, bk[0].kpr_id); if (e2) return e2;
    const lama = bk[0];
    const tahap = TAHAP_BANK.includes(b.tahap) ? b.tahap : lama.tahap;
    if (tahap === 'Tidak dilanjutkan' && lama.tahap !== 'Tidak dilanjutkan') return Response.json({ error: '"Tidak dilanjutkan" terisi otomatis saat bank lain dipilih untuk akad' }, { status: 400 });
    // Dokumen hasil bank: hanya boleh saat SP3K terbit / Ditolak, dan wajib ada untuk menutup hasil
    const dok = b.dok && b.dok.data ? b.dok : null;
    if (dok && !['SP3K terbit', 'Ditolak'].includes(tahap)) return Response.json({ error: 'Upload hanya untuk SP3K atau surat penolakan bank' }, { status: 400 });
    if (dok && String(dok.data).length > 3_500_000) return Response.json({ error: 'File terlalu besar (maks ± 2,5 MB)' }, { status: 400 });
    if (['SP3K terbit', 'Ditolak'].includes(tahap) && !dok && !lama.dok_data) {
      return Response.json({ error: `Upload ${tahap === 'Ditolak' ? 'surat penolakan' : 'SP3K'} dari bank dulu` }, { status: 400 });
    }
    await sql`UPDATE kpr_bank SET bank = ${b.bank || lama.bank}, ao_nama = ${'ao_nama' in b ? b.ao_nama : lama.ao_nama}, ao_wa = ${'ao_wa' in b ? b.ao_wa : lama.ao_wa},
      cabang = ${'cabang' in b ? b.cabang : lama.cabang}, tgl_ajukan = ${'tgl_ajukan' in b ? tglAtauNull(b.tgl_ajukan) : lama.tgl_ajukan},
      tahap = ${tahap}, kendala = ${'kendala' in b ? b.kendala : lama.kendala}, plafon_setuju = ${'plafon_setuju' in b ? angka(b.plafon_setuju) : lama.plafon_setuju},
      dok_nama = ${dok ? dok.nama || 'dokumen' : lama.dok_nama}, dok_mime = ${dok ? dok.mime || 'application/octet-stream' : lama.dok_mime},
      dok_data = ${dok ? dok.data : lama.dok_data}, dok_at = ${dok ? new Date().toISOString() : lama.dok_at}, updated_at = now()
      WHERE id = ${lama.id}`;
    const isi = [];
    if (tahap !== lama.tahap) isi.push(`${lama.bank} → ${tahap}`);
    if ('kendala' in b && (b.kendala || '') !== (lama.kendala || '')) isi.push(b.kendala ? `Kendala ${lama.bank}: ${b.kendala}` : `Kendala ${lama.bank} selesai`);
    if (dok) isi.push(`Upload ${tahap === 'Ditolak' ? 'surat penolakan' : 'SP3K'} ${lama.bank}`);
    if (!isi.length) isi.push(`Data ${lama.bank} diperbarui`);
    await catatLog(sql, k.id, user, isi.join(' · '));
    return Response.json({ ok: true, lead_code: k.lead_code, nama: k.nama, bank: lama.bank, tahap });
  }

  // Pilih bank akad + rencana tanggal akad; bank lain yang SP3K otomatis "Tidak dilanjutkan"
  if (b.jenis === 'akad') {
    const { k, err: e2 } = await ambil(sql, user, b.id); if (e2) return e2;
    const bankId = Number(b.bank_id) || k.akad_bank_id || 0;
    const bk = await sql`SELECT id, bank, tahap FROM kpr_bank WHERE id = ${bankId} AND kpr_id = ${k.id}`;
    if (!bk.length || (bk[0].tahap !== 'SP3K terbit' && bk[0].id !== k.akad_bank_id)) return Response.json({ error: 'Pilih bank yang sudah menerbitkan SP3K' }, { status: 400 });
    const lamaTgl = k.akad_tgl ? String(k.akad_tgl instanceof Date ? k.akad_tgl.toISOString() : k.akad_tgl).slice(0, 10) : null;
    const lamaReal = k.akad_realisasi ? String(k.akad_realisasi instanceof Date ? k.akad_realisasi.toISOString() : k.akad_realisasi).slice(0, 10) : null;
    const tgl = 'akad_tgl' in b ? tglAtauNull(b.akad_tgl) : lamaTgl;
    if (!tgl) return Response.json({ error: 'Isi rencana tanggal akad' }, { status: 400 });
    // Tanggal realisasi akad: diisi setelah akad benar-benar terlaksana → status KPR menjadi Done (Selesai di report)
    const real = 'akad_realisasi' in b ? tglAtauNull(b.akad_realisasi) : lamaReal;
    const hari = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    if (real && real > hari) return Response.json({ error: 'Tanggal realisasi akad tidak boleh di masa depan — isi setelah akad terlaksana' }, { status: 400 });
    await sql`UPDATE kpr SET akad_bank_id = ${bk[0].id}, akad_tgl = ${tgl}, akad_realisasi = ${real},
      akad_catatan = ${'akad_catatan' in b ? (b.akad_catatan || '') : (k.akad_catatan || '')} WHERE id = ${k.id}`;
    const lain = await sql`UPDATE kpr_bank SET tahap = 'Tidak dilanjutkan', updated_at = now()
      WHERE kpr_id = ${k.id} AND id <> ${bk[0].id} AND tahap = 'SP3K terbit' RETURNING bank`;
    const isi = [];
    if (bk[0].id !== k.akad_bank_id || tgl !== lamaTgl) isi.push(`Akad: ${bk[0].bank}, rencana ${tgl}`);
    if (lain.length) isi.push(`${lain.map(x => x.bank).join(', ')} tidak dilanjutkan`);
    if (real && real !== lamaReal) isi.push(`Akad terealisasi ${real} — KPR selesai (Done)`);
    if (!real && lamaReal) isi.push('Tanggal realisasi akad dikosongkan');
    await catatLog(sql, k.id, user, isi.join(' · ') || 'Data akad diperbarui');
    return Response.json({ ok: true, lead_code: k.lead_code, nama: k.nama, bank: bk[0].bank, tahap: real ? 'Done' : undefined });
  }
  return Response.json({ error: 'Jenis tidak dikenal' }, { status: 400 });
}

// Hapus pengajuan bank yang salah input (bukan hasil akhir) — manager / sales pemilik
async function _DELETE(req) {
  const { user, err } = await requireUser(['manager', 'sales']); if (err) return err;
  const sql = db();
  await siapkanKpr(sql);
  const id = Number(new URL(req.url).searchParams.get('bank')) || 0;
  const bk = await sql`SELECT id, kpr_id, bank, tahap FROM kpr_bank WHERE id = ${id}`;
  if (!bk.length) return Response.json({ error: 'Tidak ditemukan' }, { status: 404 });
  const { k, err: e2 } = await ambil(sql, user, bk[0].kpr_id); if (e2) return e2;
  if (k.akad_bank_id === bk[0].id) return Response.json({ error: 'Bank ini dipakai untuk akad' }, { status: 400 });
  await sql`DELETE FROM kpr_bank WHERE id = ${id}`;
  await catatLog(sql, k.id, user, `Pengajuan ${bk[0].bank} dihapus (salah input)`);
  return Response.json({ ok: true, lead_code: k.lead_code, nama: k.nama, bank: bk[0].bank });
}

const ringkas = ({ body, out, method }) => ({
  modul: 'Proses KPR',
  detail: [out.lead_code, out.nama, out.bank, out.tahap, body.jenis === 'akad' ? 'pilih bank akad' : body.jenis === 'atur_berkas' ? 'atur daftar berkas' : ''].filter(Boolean).join(' · '),
});
export const POST = denganLog('Proses KPR', _POST, ringkas);
export const PATCH = denganLog('Proses KPR', _PATCH, ringkas);
export const DELETE = denganLog('Proses KPR', _DELETE, ringkas);
