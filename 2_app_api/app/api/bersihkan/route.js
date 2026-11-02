import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Pembersihan data uji coba — menghapus lead beserta SELURUH jejaknya
// (transaksi, berkas, follow up, proses divisi, komisi, alur, otorisasi,
// pemberitahuan), dan mengosongkan seluruh pemberitahuan.
//
//   /api/bersihkan?key=SETUP_KEY&nama=harmoni,lestari,cipta,yosi          -> pratinjau
//   /api/bersihkan?key=SETUP_KEY&nama=harmoni,lestari,cipta,yosi&jalan=1  -> hapus
//   tambahkan &notif=0 bila pemberitahuan tidak ingin dikosongkan
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (!process.env.SETUP_KEY || q.get('key') !== process.env.SETUP_KEY) {
    return Response.json({ error: 'Kunci salah.' }, { status: 403 });
  }
  const nama = String(q.get('nama') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!nama.length) return Response.json({ error: 'Sebutkan nama lead: ?nama=harmoni,lestari' }, { status: 400 });
  const jalan = q.get('jalan') === '1';
  const hapusNotif = q.get('notif') !== '0';
  const sql = db();
  const jejak = [];

  try {
    // Lead yang cocok: nama atau nama KTP memuat salah satu kata (tidak peka huruf besar)
    const pola = nama.map(n => '%' + n.toLowerCase() + '%');
    const leads = await sql`SELECT lead_code, nama, nama_ktp, sales FROM leads
      WHERE lower(nama) LIKE ANY(${pola}) OR lower(COALESCE(nama_ktp, '')) LIKE ANY(${pola}) ORDER BY lead_code`;
    const kode = leads.map(l => l.lead_code);
    jejak.push('lead cocok: ' + leads.length + (leads.length ? ' — ' + leads.map(l => l.lead_code + ' (' + (l.nama_ktp || l.nama) + ')').join(', ') : ''));

    const trx = kode.length ? await sql`SELECT id FROM transactions WHERE lead_code = ANY(${kode})` : [];
    const trxId = trx.map(t => t.id);
    const hitung = async (label, f) => { const r = await f(); jejak.push(label + ': ' + Number(r[0].n)); return Number(r[0].n); };
    const n = {};
    if (kode.length) {
      n.transaksi = trxId.length; jejak.push('transaksi: ' + trxId.length);
      n.berkas = await hitung('berkas transaksi', () => sql`SELECT count(*)::int AS n FROM trx_files WHERE lead_code = ANY(${kode})`);
      n.fu = await hitung('follow up', () => sql`SELECT count(*)::int AS n FROM followups WHERE lead_code = ANY(${kode})`);
      n.proses = await hitung('proses divisi', () => sql`SELECT count(*)::int AS n FROM proses WHERE lead_code = ANY(${kode})`);
      n.komisi = await hitung('komisi', () => sql`SELECT count(*)::int AS n FROM komisi WHERE lead_code = ANY(${kode})`);
      n.alur = await hitung('riwayat alur', () => sql`SELECT count(*)::int AS n FROM alur_log WHERE lead_code = ANY(${kode})`);
      n.otor = trxId.length ? await hitung('otorisasi transaksi', () => sql`SELECT count(*)::int AS n FROM otorisasi WHERE objek = 'transaksi' AND objek_id = ANY(${trxId})`) : 0;
    }
    n.notif = await hitung(hapusNotif ? 'pemberitahuan (semua)' : 'pemberitahuan milik lead ini',
      () => hapusNotif ? sql`SELECT count(*)::int AS n FROM notifikasi` : sql`SELECT count(*)::int AS n FROM notifikasi WHERE lead_code = ANY(${kode})`);

    if (!jalan) return Response.json({ ok: true, mode: 'pratinjau', jejak, petunjuk: 'Tambahkan &jalan=1 untuk menghapus. Tindakan ini tidak dapat dibatalkan.' });

    if (kode.length) {
      if (trxId.length) await sql`DELETE FROM otorisasi WHERE objek = 'transaksi' AND objek_id = ANY(${trxId})`;
      await sql`DELETE FROM alur_log WHERE lead_code = ANY(${kode})`;
      await sql`DELETE FROM komisi WHERE lead_code = ANY(${kode})`;
      await sql`DELETE FROM proses WHERE lead_code = ANY(${kode})`;
      await sql`DELETE FROM trx_files WHERE lead_code = ANY(${kode})`;
      await sql`DELETE FROM followups WHERE lead_code = ANY(${kode})`;
      await sql`DELETE FROM transactions WHERE lead_code = ANY(${kode})`;
      if (!hapusNotif) await sql`DELETE FROM notifikasi WHERE lead_code = ANY(${kode})`;
      await sql`DELETE FROM leads WHERE lead_code = ANY(${kode})`;
    }
    if (hapusNotif) await sql`DELETE FROM notifikasi`;
    jejak.push('SELESAI · ' + kode.length + ' lead beserta seluruh jejaknya dihapus' + (hapusNotif ? ', seluruh pemberitahuan dikosongkan' : ''));
    return Response.json({ ok: true, mode: 'jalan', jejak });
  } catch (e) {
    return Response.json({ ok: false, pesan: e && e.message ? e.message : String(e), jejak }, { status: 500 });
  }
}
