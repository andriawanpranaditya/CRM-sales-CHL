import { db, siapkanStatusLog } from '@/lib/db';
import { normWA } from '@/lib/kontak';
import { siapkanFlash, bacaSetting, jadwal, posisi, pemilikLink, pemilikBawaan, infoUnit, daftarUnit, tokenBaru, kodePesan, hariIni, bersih,
  PROJECT, BOOKING_FEE, MENIT_BAYAR, PAKET, CARA_BAYAR, NAMA_GRUP } from '@/lib/flashsale';

export const dynamic = 'force-dynamic';

// PUBLIK (tanpa login) — dipakai halaman /flashsale
const tolak = (error, status = 400) => Response.json({ error }, { status });
const bentukPesan = p => ({ kode: p.kode, status: p.status, unit: p.unit, tipe: p.tipe, paket: p.paket, paketIsi: p.paket_isi, bayar: p.cara_bayar, simulasi: p.simulasi,
  harga: Number(p.harga) || 0, expires: p.expires_at ? new Date(p.expires_at).getTime() : 0, dibuat: new Date(p.created_at).getTime(), alasan: p.alasan || '' });

async function ambilDaftar(sql, token) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(String(token || ''))) return null;
  return (await sql`SELECT * FROM flash_daftar WHERE token = ${token} LIMIT 1`)[0] || null;
}

// GET: jadwal, stok, kuota, pemilik link, dan (bila sudah daftar) pesanan konsumen
export async function GET(req) {
  const sql = db(); await siapkanFlash(sql);
  const q = new URL(req.url).searchParams;
  const setting = await bacaSetting(sql), j = jadwal(setting);
  const { tutup, klaim } = await posisi(sql, setting.uji);
  const ref = q.get('ref') ? await pemilikLink(sql, q.get('ref')) : null;
  let pesanan = null, saya = null;
  const d = q.get('token') ? await ambilDaftar(sql, q.get('token')) : null;
  if (d) {
    pesanan = (await sql`SELECT * FROM flash_pesan WHERE daftar_id = ${d.id} ORDER BY id DESC LIMIT 20`).map(bentukPesan);
    saya = { nama: d.nama, sales: d.pemilik || '', agent: d.agent_nama || '' };
  }
  return Response.json({ ok: true, now: Date.now(), mulai: j.mulai, selesai: j.selesai, uji: setting.uji, kuota: setting.kuota, klaim,
    tutup: [...tutup], ref: q.get('ref') ? (ref ? { ok: true, nama: ref.nama, leadAgent: ref.leadAgent } : { ok: false }) : null,
    tokenOk: q.get('token') ? !!d : null, saya, pesanan, bookingFee: BOOKING_FEE, menitBayar: MENIT_BAYAR });
}

export async function POST(req) {
  const sql = db(); await siapkanFlash(sql);
  const b = await req.json().catch(() => ({}));
  if (b.website) return Response.json({ ok: true }); // jebakan bot
  const setting = await bacaSetting(sql), j = jadwal(setting);

  // ---- Daftar: konsumen masuk platform → lead CRM ----
  if (b.aksi === 'daftar') {
    const nama = bersih(b.nama, 100), email = bersih(b.email, 120).toLowerCase(), domisili = bersih(b.domisili, 200), wa = bersih(b.hp, 30), waN = normWA(wa);
    if (nama.length < 3) return tolak('Isi nama lengkap Anda.');
    if (!waN || !/^628\d{7,12}$/.test(waN)) return tolak('Nomor HP belum benar. Contoh: 081234567890.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return tolak('Email belum benar. Contoh: nama@email.com.');
    if (domisili.length < 5) return tolak('Isi alamat domisili Anda.');
    // Sudah pernah daftar dengan nomor ini → dikenali (email harus sama)
    const lama = (await sql`SELECT * FROM flash_daftar WHERE wa_norm = ${waN} AND COALESCE(uji, false) = ${setting.uji} ORDER BY id LIMIT 1`)[0];
    if (lama) {
      if ((lama.email || '').toLowerCase() !== email) return tolak('Nomor ini sudah terdaftar dengan email lain. Pakai email yang sama seperti saat mendaftar.', 409);
      return Response.json({ ok: true, token: lama.token, sales: lama.pemilik || '', lama: true });
    }
    const sehari = (await sql`SELECT count(*)::int AS n FROM flash_daftar WHERE created_at > now() - interval '1 day'`)[0]?.n || 0;
    if (sehari >= 3000) return tolak('Pendaftaran sedang sangat ramai. Coba lagi beberapa saat.', 429);
    let ref = null;
    if (b.ref) { ref = await pemilikLink(sql, b.ref); if (!ref) return tolak('Kode sales tidak dikenal. Periksa lagi atau kosongkan.'); }
    const agentNama = ref?.leadAgent ? bersih(b.agent_nama, 80) : '', agentKantor = ref?.leadAgent ? bersih(b.agent_kantor, 100) : '';
    const bawaan = ref ? null : await pemilikBawaan(sql);
    let pemilik = ref ? ref.nama : bawaan.nama, leadCode = null, leadBaru = false;
    if (!setting.uji) {
      // Aturan pencatat pertama: nomor yang sudah ada di CRM tetap milik sales yang lebih dulu mencatatnya
      const ada = await sql`SELECT l.lead_code, l.sales FROM leads l
        WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(l.wa,''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${waN}
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(l.kontak, '[]'::jsonb)) k
                      WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(k->>'wa',''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${waN})
        ORDER BY l.id LIMIT 1`.catch(() => sql`SELECT lead_code, sales FROM leads WHERE regexp_replace(regexp_replace(regexp_replace(COALESCE(wa,''), '[^0-9]', '', 'g'), '^0', '62'), '^8', '628') = ${waN} ORDER BY id LIMIT 1`);
      const jejak = 'Daftar Flash Sale ' + hariIni().split('-').reverse().join('/') + (ref ? ' lewat link ' + ref.nama : ' tanpa kode') + (agentNama ? ` · Agent: ${agentNama}${agentKantor ? ' (' + agentKantor + ')' : ''}` : '');
      if (ada.length) {
        leadCode = ada[0].lead_code; pemilik = ada[0].sales || pemilik;
        await sql`UPDATE leads SET catatan = TRIM(BOTH ' ·' FROM COALESCE(catatan, '') || ${' · ' + jejak}), updated_at = now() WHERE lead_code = ${leadCode}`.catch(() => {});
        if (!ada[0].sales && pemilik) await sql`UPDATE leads SET sales = ${pemilik} WHERE lead_code = ${leadCode}`.catch(() => {});
      } else {
        await siapkanStatusLog(sql);
        const ins = await sql`INSERT INTO leads (tgl, nama, wa, email, domisili, sumber, project, sales, status, catatan, created_by)
          VALUES (${hariIni()}, ${nama}, ${wa}, ${email}, ${domisili}, 'Flash Sale', ${PROJECT}, ${pemilik}, 'New', ${jejak}, 'flashsale') RETURNING id`;
        leadCode = 'LEAD-' + String(ins[0].id).padStart(4, '0'); leadBaru = true;
        await sql`UPDATE leads SET lead_code = ${leadCode} WHERE id = ${ins[0].id}`;
        if (agentNama) await sql`UPDATE leads SET sales_tipe = 'agent', sales_kantor = ${agentKantor} WHERE id = ${ins[0].id}`.catch(() => {});
        if (pemilik) {
          try { await sql`INSERT INTO lead_assign (lead_code, dari, ke, oleh) VALUES (${leadCode}, ${''}, ${pemilik}, 'flashsale')`; } catch {}
          try { const { siapkanFuWajib, mulaiJadwalBaru } = await import('@/lib/fuwajib-db'); await siapkanFuWajib(sql); await mulaiJadwalBaru(sql, leadCode); } catch (e) { console.error('fu flashsale', e); }
          try { const { kirimPush } = await import('@/lib/push'); const u = await sql`SELECT username FROM users WHERE name = ${pemilik} AND active = true`;
            if (u.length) await kirimPush(sql, { usernames: u.map(x => x.username) }, { judul: '⚡ Lead Flash Sale baru', isi: `${nama} · ${wa}${agentNama ? ' · agent ' + agentNama : ''}`, url: '/leads?lead=' + encodeURIComponent(leadCode), tag: 'fs-' + leadCode }); } catch (e) { console.error('push flashsale', e); }
        }
      }
    }
    const token = tokenBaru();
    await sql`INSERT INTO flash_daftar (token, nama, wa, wa_norm, email, domisili, ref_username, agent_nama, agent_kantor, lead_code, pemilik, lead_baru, uji)
      VALUES (${token}, ${nama}, ${wa}, ${waN}, ${email}, ${domisili}, ${ref?.username || ''}, ${agentNama}, ${agentKantor}, ${leadCode}, ${pemilik}, ${leadBaru}, ${setting.uji})`;
    return Response.json({ ok: true, token, sales: pemilik });
  }

  const d = await ambilDaftar(sql, b.token);
  if (!d) return tolak('Sesi Anda tidak dikenali. Silakan daftar ulang.', 401);

  // ---- Pesan: kunci unit selama batas waktu bayar ----
  if (b.aksi === 'pesan') {
    if (j.fase !== 'live') return tolak(j.fase === 'before' ? 'Flash sale belum dibuka.' : 'Flash sale periode ini sudah ditutup.');
    const unit = bersih(b.unit, 40), info = infoUnit(unit);
    if (!info || !(await daftarUnit(sql)).includes(unit)) return tolak('Unit tidak dikenal.');
    const paket = (PAKET[info.grup] || []).find(p => p[0] === b.paket);
    if (!paket) return tolak('Pilih paket hadiah terlebih dahulu.');
    const bayar = CARA_BAYAR.includes(b.bayar) ? b.bayar : 'KPR';
    const punya = (await sql`SELECT count(*)::int AS n FROM flash_pesan WHERE daftar_id = ${d.id} AND status IN ('menunggu', 'dibayar')`)[0]?.n || 0;
    if (punya >= 2) return tolak('Anda masih punya pesanan yang belum selesai. Selesaikan atau batalkan dulu di menu Pesanan & Bayar.');
    const { tutup, klaim } = await posisi(sql, setting.uji);
    if (tutup.has(unit)) return tolak('Maaf, unit ini sudah tidak tersedia. Pilih unit lain.', 409);
    if ((klaim[info.grup] || 0) >= (setting.kuota[info.grup] ?? 0)) return tolak(`Maaf, kuota promo ${NAMA_GRUP[info.grup]} baru saja penuh.`, 409);
    const kode = kodePesan(), harga = info.harga - paket[2];
    const ins = await sql`INSERT INTO flash_pesan (kode, daftar_id, lead_code, unit, grup, tipe, paket, paket_isi, cara_bayar, simulasi, harga, status, uji, expires_at)
      VALUES (${kode}, ${d.id}, ${d.lead_code}, ${unit}, ${info.grup}, ${info.tipe}, ${paket[0]}, ${paket[1]}, ${bayar}, ${bersih(b.simulasi, 200)}, ${harga}, 'menunggu', ${setting.uji},
              now() + ${MENIT_BAYAR + ' minutes'}::interval) RETURNING *`;
    // Dua orang menekan bersamaan: yang tercatat lebih dulu yang menang
    const dobel = await sql`SELECT id FROM flash_pesan WHERE unit = ${unit} AND status IN ('menunggu', 'dibayar', 'lunas') AND COALESCE(uji, false) = ${setting.uji} ORDER BY id LIMIT 1`;
    if (dobel[0]?.id !== ins[0].id) { await sql`DELETE FROM flash_pesan WHERE id = ${ins[0].id}`; return tolak('Maaf, unit ini sudah tidak tersedia. Pilih unit lain.', 409); }
    return Response.json({ ok: true, pesanan: bentukPesan(ins[0]) });
  }

  const p = b.kode ? (await sql`SELECT * FROM flash_pesan WHERE kode = ${String(b.kode).slice(0, 20)} AND daftar_id = ${d.id} LIMIT 1`)[0] : null;
  if (!p) return tolak('Pesanan tidak ditemukan.', 404);

  // ---- Konsumen menyatakan sudah membayar → menunggu verifikasi tim ----
  if (b.aksi === 'bayar') {
    if (p.status === 'dibayar' || p.status === 'lunas') return Response.json({ ok: true, pesanan: bentukPesan(p) });
    if (p.status !== 'menunggu' || new Date(p.expires_at).getTime() < Date.now()) {
      await sql`UPDATE flash_pesan SET status = 'kedaluwarsa' WHERE id = ${p.id} AND status = 'menunggu'`;
      return tolak('Waktu pembayaran sudah habis, unit dibuka kembali. Silakan pesan ulang.', 410);
    }
    const u = (await sql`UPDATE flash_pesan SET status = 'dibayar' WHERE id = ${p.id} RETURNING *`)[0];
    if (!p.uji) {
      try { const { kirimPush } = await import('@/lib/push');
        await kirimPush(sql, { role: 'manager' }, { judul: '⚡ Booking fee Flash Sale perlu dicek', isi: `${d.nama} · ${p.unit} · ${p.kode} · sales ${d.pemilik || '-'}`, url: '/flashsale-kelola', tag: 'fsb-' + p.kode }); } catch (e) { console.error('push bayar', e); }
    }
    return Response.json({ ok: true, pesanan: bentukPesan(u) });
  }
  if (b.aksi === 'batal') {
    if (p.status !== 'menunggu') return tolak('Pesanan ini tidak bisa dibatalkan dari sini. Hubungi tim Bio District.');
    const u = (await sql`UPDATE flash_pesan SET status = 'batal', alasan = 'Dibatalkan konsumen' WHERE id = ${p.id} RETURNING *`)[0];
    return Response.json({ ok: true, pesanan: bentukPesan(u) });
  }
  return tolak('Aksi tidak dikenal.');
}
