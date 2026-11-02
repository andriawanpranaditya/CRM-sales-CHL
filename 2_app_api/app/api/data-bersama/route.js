import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { createHash } from 'crypto';
import { TAB, NAMA_FASE, AKSES_TAB, BOLEH_SENSITIF, ambilTab, samarkan } from '@/lib/dataBersama';

export const dynamic = 'force-dynamic';

// GET                    -> daftar tab yang boleh dibuka peran ini
// GET ?tab=Sales         -> kolom + baris
// GET ?tab=Sales&stamp=  -> { sama: true } bila tidak ada perubahan sejak pemuatan terakhir
export async function GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const boleh = AKSES_TAB[user.role] || [];
  const q = new URL(req.url).searchParams;
  const tab = q.get('tab');

  if (!tab) {
    return Response.json({ tabs: boleh.map(n => ({ nama: n, tersedia: TAB[n].fase <= 1,
      fase: TAB[n].fase, keterangan: TAB[n].fase > 1 ? NAMA_FASE[TAB[n].fase] : '' })) });
  }
  if (!TAB[tab]) return Response.json({ error: 'Tab tidak dikenal' }, { status: 404 });
  if (!boleh.includes(tab)) return Response.json({ error: 'Peran Anda tidak memiliki akses ke data ' + tab }, { status: 403 });

  const rows = await ambilTab(db(), tab);
  if (rows === null) {
    return Response.json({ tersedia: false, kolom: TAB[tab].kolom, keterangan: NAMA_FASE[TAB[tab].fase] });
  }
  const isi = samarkan(rows, BOLEH_SENSITIF.includes(user.role));
  // Sidik isi data — halaman yang terbuka cukup menanyakan "ada perubahan?"
  // tanpa harus menerima ulang seluruh baris bila tidak ada yang berubah
  const stamp = createHash('sha1').update(JSON.stringify(isi)).digest('hex').slice(0, 16);
  if (q.get('stamp') === stamp) return Response.json({ sama: true, stamp, waktu: new Date().toISOString() });
  return Response.json({ tersedia: true, kolom: TAB[tab].kolom, rows: isi, stamp, waktu: new Date().toISOString(),
    disamarkan: !BOLEH_SENSITIF.includes(user.role) });
}
