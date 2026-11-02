import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { DENDA_DEFAULT, bacaDenda } from '@/lib/denda';
import { SP_DEFAULT, bacaSP } from '@/lib/penagihan';

export const dynamic = 'force-dynamic';

// Kebijakan penagihan (berlaku untuk semua project): tarif denda & jenjang Surat Peringatan
export async function GET() {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  return Response.json({ denda: await bacaDenda(sql, null), sp: await bacaSP(sql, null), bawaan: { denda: DENDA_DEFAULT, sp: SP_DEFAULT } });
}

export async function POST(req) {
  const { err } = await requireUser(['administrator', 'headsales', 'salesmanager']); if (err) return err;
  const b = await req.json();
  const persen = Number(b.persen_per_hari);
  const sp1 = Math.round(Number(b.sp1_hari)), sp2 = Math.round(Number(b.sp2_hari)), sp3 = Math.round(Number(b.sp3_hari));
  const batas = Math.round(Number(b.batas_bayar_hari));
  if (!(persen >= 0 && persen <= 5)) return Response.json({ error: 'Tarif denda harus antara 0 dan 5 (% per hari)' }, { status: 400 });
  if (![sp1, sp2, sp3, batas].every(n => Number.isInteger(n) && n > 0)) return Response.json({ error: 'Jeda hari SP dan batas bayar harus bilangan bulat > 0' }, { status: 400 });
  if (!(sp1 < sp2 && sp2 < sp3)) return Response.json({ error: 'Jeda harus berurutan: SP1 < SP2 < SP3' }, { status: 400 });
  const sql = db();
  // Pengaturan per-project yang mungkin sudah ada dipertahankan; hanya bagian "default" yang diganti
  const simpan = async (key, isi) => {
    const r = await sql`SELECT items FROM settings WHERE key = ${key}`;
    const lama = (r.length && r[0].items && typeof r[0].items === 'object' && !Array.isArray(r[0].items)) ? r[0].items : {};
    await sql`INSERT INTO settings (key, items) VALUES (${key}, ${JSON.stringify({ ...lama, default: isi })})
      ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
  };
  await simpan('denda', { persen_per_hari: persen });
  await simpan('sp', { sp1_hari: sp1, sp2_hari: sp2, sp3_hari: sp3, batas_bayar_hari: batas });
  return Response.json({ ok: true });
}
