import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanOther, linkOther, daftarkanOther, tokenOther } from '@/lib/other-sales';

export const dynamic = 'force-dynamic';

// Lead yang sama di project ini berdasarkan nomor WA konsumen (WA utama atau kontak tambahan)
async function cariLeadSama(sql, lap) {
  const wa = String(lap.konsumen_wa || '').replace(/\D/g, '').replace(/^0/, '62').replace(/^8/, '628');
  if (wa.length < 9) return null;
  try {
    return (await sql`SELECT lead_code, nama, sales, status FROM leads l WHERE project = ${lap.project} AND (
      regexp_replace(regexp_replace(regexp_replace(COALESCE(l.wa,''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${wa}
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(l.kontak, '[]'::jsonb)) k WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(k->>'wa',''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${wa}))
      ORDER BY id LIMIT 1`)[0] || null;
  } catch { return (await sql`SELECT lead_code, nama, sales, status FROM leads WHERE project = ${lap.project} AND regexp_replace(regexp_replace(regexp_replace(COALESCE(wa,''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${wa} ORDER BY id LIMIT 1`.catch(() => []))[0] || null; }
}

// Manager: kiriman Other Sales → setujui (jadi lead dengan PIC Other Sales) / tolak / hapus yang ditolak · kelola link
export async function GET() {
  const { err } = await requireUser(['manager']); if (err) return err;
  const sql = db(); await siapkanOther(sql);
  const links = await linkOther(sql);
  const laporan = await sql`SELECT o.*, o.tgl::text AS tgl, EXISTS (SELECT 1 FROM transactions t WHERE t.lead_code = o.lead_code AND t.jenis IN ('Booking', 'Closing')) AS booking
    FROM other_laporan o ORDER BY (o.status = 'Menunggu') DESC, o.created_at DESC LIMIT 300`;
  for (const x of laporan) if (x.status === 'Menunggu') x.leadAda = await cariLeadSama(sql, x);
  const daftar = await sql`SELECT s.*, (SELECT count(*)::int FROM leads l WHERE l.other_id = s.id) AS lead,
      (SELECT count(*)::int FROM leads l JOIN transactions t ON t.lead_code = l.lead_code WHERE l.other_id = s.id AND t.jenis IN ('Booking', 'Closing')) AS booking
    FROM other_sales s ORDER BY s.created_at DESC LIMIT 200`;
  return Response.json({ links, laporan, daftar, menunggu: laporan.filter(x => x.status === 'Menunggu').length });
}
export async function POST(req) {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  const sql = db(); await siapkanOther(sql);
  const b = await req.json().catch(() => ({}));
  if (b.aksi === 'link-baru') {
    await sql`UPDATE other_link SET aktif = false WHERE project = ${b.project}`;
    await sql`INSERT INTO other_link (project, token) VALUES (${b.project}, ${tokenOther(b.project)})`;
    return Response.json({ ok: true });
  }
  if (b.aksi === 'hapus-ditolak') {
    const r = b.semua ? await sql`DELETE FROM other_laporan WHERE status = 'Ditolak' RETURNING id` : await sql`DELETE FROM other_laporan WHERE id = ${Number(b.id)} AND status = 'Ditolak' RETURNING id`;
    if (!r.length) return Response.json({ error: 'Hanya kiriman yang ditolak yang bisa dihapus' }, { status: 400 });
    return Response.json({ ok: true, terhapus: r.length });
  }
  const lap = (await sql`SELECT *, tgl::text AS tgl FROM other_laporan WHERE id = ${Number(b.id)}`)[0];
  if (!lap) return Response.json({ error: 'Kiriman tidak ditemukan' }, { status: 404 });
  if (lap.status !== 'Menunggu') return Response.json({ error: 'Kiriman ini sudah ' + lap.status.toLowerCase() }, { status: 400 });
  if (b.aksi === 'tolak') {
    await sql`UPDATE other_laporan SET status = 'Ditolak', alasan = ${String(b.alasan || '').slice(0, 300)}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${lap.id}`;
    return Response.json({ ok: true });
  }
  if (b.aksi !== 'setujui') return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
  // Unit masih bebas?
  const { unitTersedia } = await import('@/lib/other-sales');
  if (lap.unit) { const bebas = await unitTersedia(sql, lap.project); if (!bebas.includes(lap.unit)) return Response.json({ error: `Unit ${lap.unit} sudah diambil transaksi lain — tolak kiriman ini atau minta Other Sales memilih unit lain` }, { status: 400 }); }
  const os = await daftarkanOther(sql, lap.project, { nama: lap.nama, jenis: lap.jenis, divisi: lap.divisi, hp: lap.hp, ktp: lap.ktp, npwp: lap.npwp }, user.username);
  const catatan = [`Other Sales: ${lap.nama} (${lap.jenis}${lap.divisi ? ' – ' + lap.divisi : ''}, HP ${lap.hp})`, lap.catatan].filter(Boolean).join(' · ');
  const tglL = lap.tgl || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const statusL = lap.trx_jenis === 'Booking' ? 'Booking' : 'Hot';
  // Konsumen sudah ada sebagai lead (mis. diinput Marcom & belum dioper)? → pakai lead itu, PIC diganti ke Other Sales
  const ada = await cariLeadSama(sql, lap);
  let kode;
  if (ada) {
    kode = ada.lead_code;
    await sql`UPDATE leads SET sales = ${os.nama}, other_id = ${os.id}, sales_tipe = ${lap.jenis === 'External' ? 'other-external' : 'other-internal'},
      email = COALESCE(NULLIF(email, ''), ${lap.konsumen_email || ''}), bayar = COALESCE(NULLIF(bayar, ''), ${lap.bayar || ''}), status = ${statusL},
      catatan = TRIM(BOTH ' ·' FROM COALESCE(catatan, '') || ${' · ' + catatan}), updated_at = now() WHERE lead_code = ${kode}`;
    try { await sql`INSERT INTO lead_assign (lead_code, dari, ke, oleh) VALUES (${kode}, ${ada.sales || ''}, ${os.nama}, ${user.username})`; } catch {}
  } else {
    const ins = await sql`INSERT INTO leads (tgl, nama, wa, email, sumber, project, bayar, domisili, budget, sales, status, catatan, created_by)
      VALUES (${tglL}, ${lap.konsumen}, ${lap.konsumen_wa || ''}, ${lap.konsumen_email || ''}, 'Other Sales', ${lap.project}, ${lap.bayar || ''}, ${lap.alamat || ''}, 0, ${os.nama}, ${statusL}, ${catatan}, ${user.username}) RETURNING id`;
    kode = 'LEAD-' + String(ins[0].id).padStart(4, '0');
    await sql`UPDATE leads SET lead_code = ${kode}, other_id = ${os.id}, sales_tipe = ${lap.jenis === 'External' ? 'other-external' : 'other-internal'} WHERE id = ${ins[0].id}`;
  }
  if (lap.trx_jenis && lap.unit) {
    // Berkas transaksi (bukti transfer, KTP, NPWP) → sama seperti upload di Form Input
    const B = lap.berkas || {};
    for (const [jenis, ref] of [['transfer', B.transfer], ['ktp', B.ktp], ['npwp', B.npwp]]) {
      if (!ref || !String(ref).startsWith('db:')) continue;
      const dok = (await sql`SELECT mime, data FROM other_dok WHERE id = ${Number(String(ref).slice(3))}`)[0];
      if (dok) await sql`INSERT INTO trx_files (project, unit, lead_code, jenis, filename, mime, data, uploaded_by)
        VALUES (${lap.project}, ${lap.unit}, ${kode}, ${jenis}, ${jenis + '.jpg'}, ${dok.mime || 'image/jpeg'}, ${dok.data}, ${user.username})
        ON CONFLICT (project, unit, lead_code, jenis) DO UPDATE SET data = EXCLUDED.data, mime = EXCLUDED.mime, uploaded_by = EXCLUDED.uploaded_by, created_at = now()`.catch(e => console.error('berkas other', e));
    }
    await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, catatan, project, bayar, unit, created_by)
      VALUES (${kode}, ${lap.trx_jenis}, ${tglL}, ${Number(lap.nilai) || 0}, ${'Other Sales: ' + os.nama}, ${lap.project}, ${lap.bayar || ''}, ${lap.unit}, ${user.username})`;
    await sql`CREATE TABLE IF NOT EXISTS konsumen (lead_code text PRIMARY KEY, nama_ktp text, nik text, npwp text, email text, alamat text, rt_rw text,
      kel_desa text, kecamatan text, kota_kab text, provinsi text, alamat_domisili text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`INSERT INTO konsumen (lead_code, nama_ktp, nik, email, alamat_domisili, updated_by) VALUES (${kode}, ${lap.konsumen}, ${lap.konsumen_nik || ''}, ${lap.konsumen_email || ''}, ${lap.alamat || ''}, ${user.username})
      ON CONFLICT (lead_code) DO UPDATE SET nama_ktp = EXCLUDED.nama_ktp, nik = EXCLUDED.nik, email = EXCLUDED.email, alamat_domisili = EXCLUDED.alamat_domisili, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    if (lap.trx_jenis === 'Booking') await sql`DELETE FROM unit_manual WHERE project = ${lap.project} AND unit = ${lap.unit}`.catch(() => {});
  }
  await sql`UPDATE other_laporan SET status = 'Disetujui', lead_code = ${kode}, other_id = ${os.id}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${lap.id}`;
  return Response.json({ ok: true, lead_code: kode });
}
