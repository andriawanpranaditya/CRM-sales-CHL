import { db, DEFAULT_SETTINGS } from '@/lib/db';
import { tentukanProject } from '@/lib/proyek';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ===== Google Ads → CRM (otomatis) =====
// Google Ads Script yang dipasang di tiap akun Google Ads mengirim data harian ke endpoint ini (terjadwal di Google Ads).
// Tanpa developer token / persetujuan API: cukup env GADS_PUSH_SECRET (kunci bersama dengan script).
// Isi kiriman: { akun: {id, nama}, dari, sampai, campaigns: [{id, nama, status, tipe}], rows: [{tgl, campaign_id, campaign,
//   adgroup_id, adgroup, spend, impresi, klik, hasil}] }
// Opsional: GADS_AKUN_PROJECT "123-456-7890:PERMAI INDAH,..." untuk mengunci project per akun.

const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
const tujuanGoogle = t => {
  const x = String(t || '').toUpperCase();
  if (/VIDEO|DEMAND_GEN|DISCOVERY/.test(x)) return 'awareness';
  if (/DISPLAY/.test(x)) return 'traffic';
  return 'leads'; // SEARCH, PERFORMANCE_MAX, dll.
};
const STATUS_ID = { PAUSED: 'dijeda (off)', REMOVED: 'dihapus' };

async function petaCampaign(sql) {
  const peta = new Map((await sql`SELECT nama FROM mi_campaigns`).map(c => [String(c.nama).toLowerCase(), c.nama]));
  try {
    (await sql`SELECT a.alias, a.nama FROM mi_campaign_alias a JOIN mi_campaigns c ON c.nama = a.nama`)
      .forEach(x => { if (!peta.has(String(x.alias).toLowerCase())) peta.set(String(x.alias).toLowerCase(), x.nama); });
  } catch {}
  return peta;
}

export async function POST(req) {
  const kunci = process.env.GADS_PUSH_SECRET;
  if (!kunci) return Response.json({ error: 'GADS_PUSH_SECRET belum diisi di Vercel' }, { status: 503 });
  const dapat = req.headers.get('x-crm-key') || new URL(req.url).searchParams.get('key');
  if (dapat !== kunci) return Response.json({ error: 'Kunci tidak cocok' }, { status: 401 });

  const sql = db();
  let b;
  try { b = await req.json(); } catch { return Response.json({ error: 'Isi kiriman bukan JSON' }, { status: 400 }); }
  const akunId = String(b?.akun?.id || '').trim(), akunNama = String(b?.akun?.nama || '').trim();
  const rows = Array.isArray(b?.rows) ? b.rows : [], camps = Array.isArray(b?.campaigns) ? b.campaigns : [];
  const dari = String(b?.dari || '').slice(0, 10), sampai = String(b?.sampai || '').slice(0, 10);
  if (!akunId || !/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) return Response.json({ error: 'akun.id, dari, sampai wajib' }, { status: 400 });

  let logId = null;
  try { logId = (await sql`INSERT INTO mi_sync_log (sumber, status, baris, pesan) VALUES ('Google Ads', 'berjalan', 0, ${'menerima data akun ' + (akunNama || akunId)}) RETURNING id`)[0]?.id; } catch {}
  const catat = async (status, baris, pesan) => {
    try {
      if (logId) await sql`UPDATE mi_sync_log SET status = ${status}, baris = ${baris}, pesan = ${pesan}, waktu = now() WHERE id = ${logId}`;
      else await sql`INSERT INTO mi_sync_log (sumber, status, baris, pesan) VALUES ('Google Ads', ${status}, ${baris}, ${pesan})`;
    } catch {}
  };

  try {
    // Kolom pendukung (aman diulang)
    for (const q of [
      () => sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS sumber text`,
      () => sql`ALTER TABLE mi_ads ADD COLUMN IF NOT EXISTS ext_key text`,
      () => sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_mi_ads_ext ON mi_ads (ext_key)`,
      () => sql`ALTER TABLE mi_campaigns ADD COLUMN IF NOT EXISTS sumber text`,
      () => sql`ALTER TABLE mi_campaigns ADD COLUMN IF NOT EXISTS meta_info text`,
    ]) { try { await q(); } catch {} }

    // Project campaign baru = project pemilik akun Google Ads (nama akun / awalan nama campaign)
    let daftarProject = DEFAULT_SETTINGS.project || [];
    try { const sp = await sql`SELECT items FROM settings WHERE key = 'project'`; if (Array.isArray(sp[0]?.items) && sp[0].items.length) daftarProject = sp[0].items; } catch {}
    const petaAkun = Object.fromEntries((process.env.GADS_AKUN_PROJECT || '').split(',').map(x => x.split(':').map(y => y.trim()))
      .filter(([a, p]) => a && p).map(([a, p]) => [a.replace(/-/g, ''), p]));
    const cadangan = process.env.IG_PROJECT || 'BIO DISTRICT';
    const projectUntuk = nm => tentukanProject(akunId.replace(/-/g, ''), akunNama, nm, daftarProject, petaAkun, cadangan);

    const peta = await petaCampaign(sql);
    const infoCamp = new Map(camps.map(c => [String(c.nama), c]));
    // Daftarkan campaign yang sudah mengeluarkan biaya / tayang tetapi belum ada di CRM
    const adaAktivitas = new Set(rows.filter(r => Number(r.spend) > 0 || Number(r.impresi) > 0).map(r => String(r.campaign)));
    let baru = 0;
    for (const nm of adaAktivitas) {
      if (!nm || peta.has(nm.toLowerCase())) continue;
      const c = infoCamp.get(nm) || {};
      await sql`INSERT INTO mi_campaigns (nama, platform, project, tujuan, budget, status, catatan, created_by, sumber)
        VALUES (${nm}, 'Google', ${projectUntuk(nm)}, ${tujuanGoogle(c.tipe)}, 0, ${c.status === 'ENABLED' ? 'Aktif' : 'Selesai'},
                'Terdaftar otomatis dari Google Ads', 'auto-gads', 'google-api')
        ON CONFLICT (nama) DO NOTHING`;
      peta.set(nm.toLowerCase(), nm); baru++;
    }

    // Simpan performa harian (upsert per akun · tanggal · campaign · ad group)
    const data = rows.filter(r => r.tgl && r.campaign).map(r => [
      `gads:${akunId.replace(/-/g, '')}:${String(r.tgl).slice(0, 10)}:${r.campaign_id || r.campaign}:${r.adgroup_id || '-'}`,
      String(r.tgl).slice(0, 10), peta.get(String(r.campaign).toLowerCase()) || String(r.campaign), String(r.adgroup || ''),
      Math.round((Number(r.spend) || 0) * 100) / 100, Math.round(Number(r.impresi) || 0), Math.round(Number(r.klik) || 0), Math.round(Number(r.hasil) || 0),
    ]);
    for (let i = 0; i < data.length; i += 500) {
      const p = data.slice(i, i + 500);
      await sql`INSERT INTO mi_ads (ext_key, tgl, campaign, kreatif, spend, impresi, reach, klik, hasil, sumber, created_by)
        SELECT x.k, x.t, x.c, x.kr, x.sp, x.im, 0, x.kl, x.ha, 'google-api', 'auto-gads'
        FROM unnest(${p.map(x => x[0])}::text[], ${p.map(x => x[1])}::date[], ${p.map(x => x[2])}::text[], ${p.map(x => x[3])}::text[],
                    ${p.map(x => x[4])}::numeric[], ${p.map(x => x[5])}::int[], ${p.map(x => x[6])}::int[], ${p.map(x => x[7])}::int[])
          AS x(k, t, c, kr, sp, im, kl, ha)
        ON CONFLICT (ext_key) DO UPDATE SET campaign = EXCLUDED.campaign, kreatif = EXCLUDED.kreatif, spend = EXCLUDED.spend,
          impresi = EXCLUDED.impresi, klik = EXCLUDED.klik, hasil = EXCLUDED.hasil`;
    }
    // Baris lama akun ini di rentang yang sama tetapi tidak dikirim lagi (mis. ad group dihapus) → dibuang agar tidak dobel
    const kunciBaru = data.map(x => x[0]);
    await sql`DELETE FROM mi_ads WHERE sumber = 'google-api' AND ext_key LIKE ${'gads:' + akunId.replace(/-/g, '') + ':%'}
      AND tgl >= ${dari}::date AND tgl <= ${sampai}::date AND NOT (ext_key = ANY(${kunciBaru}::text[]))`;

    // Status campaign di CRM: Aktif hanya bila ENABLED dan ada spend 3 hari terakhir
    const batas3 = new Date(Date.parse(sampai + 'T00:00:00Z') - 2 * 86400000).toISOString().slice(0, 10);
    const spend3 = {};
    rows.forEach(r => { if (String(r.tgl).slice(0, 10) >= batas3) spend3[r.campaign] = (spend3[r.campaign] || 0) + (Number(r.spend) || 0); });
    const hasil = new Map();
    for (const c of camps) {
      const crm = peta.get(String(c.nama).toLowerCase()); if (!crm) continue;
      const s3 = spend3[c.nama] || 0;
      const tayang = c.status === 'ENABLED' && s3 > 0;
      const ket = tayang ? `tayang · spend 3 hari ${rp(s3)}` : c.status !== 'ENABLED' ? (STATUS_ID[c.status] || String(c.status || '').toLowerCase())
        : 'aktif tapi tidak ada spend 3 hari terakhir (budget/jadwal/review)';
      const h = hasil.get(crm) || { tayang: false, ket: [] };
      h.tayang = h.tayang || tayang; h.ket.push(ket); hasil.set(crm, h);
    }
    for (const [crm, h] of hasil) {
      await sql`UPDATE mi_campaigns SET status = ${h.tayang ? 'Aktif' : 'Selesai'}, sumber = COALESCE(sumber, 'google-api'),
        meta_info = ${'Google: ' + [...new Set(h.ket)].slice(0, 3).join(' / ')} WHERE nama = ${crm}`;
    }

    const totalSpend = data.reduce((a, x) => a + x[4], 0);
    const pesan = `${dari} s.d. ${sampai} · akun ${akunNama || akunId} · ${new Set(data.map(x => x[2])).size} campaign · spend ${rp(totalSpend)}`
      + (baru ? ` · ${baru} campaign baru terdaftar` : '');
    await catat('sukses', data.length, pesan);
    return Response.json({ ok: true, pesan });
  } catch (e) {
    const pesan = String(e.message || e).slice(0, 400);
    await catat('gagal', 0, pesan);
    return Response.json({ error: pesan }, { status: 500 });
  }
}
