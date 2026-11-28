import { db } from '@/lib/db';
import { normWA } from '@/lib/kontak';
import { agentDariKode, kodeAgent, kontakChat, waAkun, siapkanFlash, bacaSetting, jadwal, posisi, pemilikLink, pemilikBawaan, infoUnit, daftarUnit, tokenBaru, kodePesan, hariIni, bersih, buatLeadFlash, sahkanDaftar, kodeVerif, teksVerif, perluVerif, WA_RESMI,
  PROJECT, BOOKING_FEE, MENIT_BAYAR, PAKET, CARA_BAYAR, NAMA_GRUP } from '@/lib/flashsale';

export const dynamic = 'force-dynamic';

// PUBLIK (tanpa login) — dipakai halaman /flashsale
const tolak = (error, status = 400) => Response.json({ error }, { status });
const bentukPesan = p => ({ kode: p.kode, status: p.status, unit: p.unit, tipe: p.tipe, paket: p.paket, paketIsi: p.paket_isi, bayar: p.cara_bayar, simulasi: p.simulasi,
  harga: Number(p.harga) || 0, expires: p.expires_at ? new Date(p.expires_at).getTime() : 0, dibuat: new Date(p.created_at).getTime(), alasan: p.alasan || '' });

// Yang perlu diketahui halaman publik untuk layar verifikasi (null = tidak perlu verifikasi)
const verifInfo = (setting, d) => perluVerif(setting, d) ? { kode: d.verif_kode, nomor: WA_RESMI, teks: teksVerif(d.verif_kode), hp: d.wa } : null;
const hpSah = waN => waN && /^628\d{7,12}$/.test(waN);

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
  const agent = ref?.leadAgent && q.get('ag') ? await agentDariKode(sql, ref.username, q.get('ag')) : null;
  let pesanan = null, saya = null;
  let d = q.get('token') ? await ambilDaftar(sql, q.get('token')) : null;
  // Aturan verifikasi dimatikan saat ada pendaftar yang belum terverifikasi → lead-nya tetap dibuat
  if (d && !setting.verifWA && d.verif_kode && !d.verified_at && !d.lead_code && !d.uji) { try { d = await sahkanDaftar(sql, d, 'aturan-mati'); } catch (e) { console.error('sahkan', e); } }
  if (d) {
    pesanan = (await sql`SELECT * FROM flash_pesan WHERE daftar_id = ${d.id} ORDER BY id DESC LIMIT 20`).map(bentukPesan);
    saya = { nama: d.nama, sales: d.pemilik || '', agent: d.agent_nama || '', verif: verifInfo(setting, d) };
  }
  return Response.json({ ok: true, now: Date.now(), mulai: j.mulai, selesai: j.selesai, uji: setting.uji, kuota: setting.kuota, klaim,
    tutup: [...tutup], ref: q.get('ref') ? (ref ? { ok: true, nama: ref.nama, leadAgent: ref.leadAgent, agent: agent ? { nama: agent.nama, kantor: agent.kantor } : null } : { ok: false }) : null,
    kontak: await kontakChat(sql, { ref, agent, daftar: d }).then(k => ({ wa: k.wa, nama: k.nama })).catch(() => null),
    tokenOk: q.get('token') ? !!d : null, saya, pesanan, bookingFee: BOOKING_FEE, menitBayar: MENIT_BAYAR });
}

export async function POST(req) {
  const sql = db(); await siapkanFlash(sql);
  const b = await req.json().catch(() => ({}));
  if (b.website) return Response.json({ ok: true }); // jebakan bot
  const setting = await bacaSetting(sql), j = jadwal(setting);

  // ---- Agent di bawah lead agent membuat link pribadinya (tanpa persetujuan) ----
  if (b.aksi === 'agent-daftar') {
    const ref = await pemilikLink(sql, b.ref);
    if (!ref || !ref.leadAgent) return tolak('Link ini tidak berlaku. Minta link terbaru ke koordinator agent Anda.', 404);
    const nama = bersih(b.nama, 80), kantor = bersih(b.kantor, 100), wa = bersih(b.wa, 30), waN = normWA(wa);
    if (nama.length < 3) return tolak('Isi nama Anda.');
    if (kantor.length < 2) return tolak('Isi nama kantor / agency Anda.');
    if (!hpSah(waN)) return tolak('Nomor WhatsApp belum benar. Contoh: 081234567890.');
    const lama = (await sql`SELECT * FROM flash_agent WHERE ref_username = ${ref.username} AND wa_norm = ${waN} LIMIT 1`)[0];
    if (lama) {
      const u = (await sql`UPDATE flash_agent SET nama = ${nama}, kantor = ${kantor}, wa = ${wa}, updated_at = now() WHERE id = ${lama.id} RETURNING kode`)[0];
      return Response.json({ ok: true, kode: u.kode, lama: true });
    }
    const sehari = (await sql`SELECT count(*)::int AS n FROM flash_agent WHERE created_at > now() - interval '1 day'`)[0]?.n || 0;
    if (sehari >= 500) return tolak('Pendaftaran agent sedang ramai. Coba lagi beberapa saat.', 429);
    for (let i = 0; i < 5; i++) {
      const kode = kodeAgent();
      const ins = await sql`INSERT INTO flash_agent (kode, ref_username, nama, kantor, wa, wa_norm) VALUES (${kode}, ${ref.username}, ${nama}, ${kantor}, ${wa}, ${waN})
        ON CONFLICT (kode) DO NOTHING RETURNING kode`;
      if (ins[0]) return Response.json({ ok: true, kode: ins[0].kode });
    }
    return tolak('Gagal membuat link. Coba lagi.', 500);
  }

  // ---- Daftar: konsumen masuk platform → lead CRM ----
  if (b.aksi === 'daftar') {
    const nama = bersih(b.nama, 100), email = bersih(b.email, 120).toLowerCase(), domisili = bersih(b.domisili, 200), wa = bersih(b.hp, 30), waN = normWA(wa);
    if (nama.length < 3) return tolak('Isi nama lengkap Anda.');
    if (!hpSah(waN)) return tolak('Nomor HP belum benar. Contoh: 081234567890.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return tolak('Email belum benar. Contoh: nama@email.com.');
    if (domisili.length < 5) return tolak('Isi alamat domisili Anda.');
    // Sudah pernah daftar dengan nomor ini → dikenali (email harus sama)
    const lama = (await sql`SELECT * FROM flash_daftar WHERE wa_norm = ${waN} AND COALESCE(uji, false) = ${setting.uji} ORDER BY id LIMIT 1`)[0];
    const lamaBelumSah = lama && perluVerif(setting, lama);
    if (lama && !lamaBelumSah) {
      if ((lama.email || '').toLowerCase() !== email) return tolak('Nomor ini sudah terdaftar dengan email lain. Pakai email yang sama seperti saat mendaftar.', 409);
      return Response.json({ ok: true, token: lama.token, sales: lama.pemilik || '', lama: true, verif: null });
    }
    // Pendaftaran lama dengan nomor ini belum terverifikasi dan emailnya sama → lanjutkan verifikasinya
    if (lamaBelumSah && (lama.email || '').toLowerCase() === email) return Response.json({ ok: true, token: lama.token, sales: lama.pemilik || '', lama: true, verif: verifInfo(setting, lama) });
    const sehari = (await sql`SELECT count(*)::int AS n FROM flash_daftar WHERE created_at > now() - interval '1 day'`)[0]?.n || 0;
    if (sehari >= 3000) return tolak('Pendaftaran sedang sangat ramai. Coba lagi beberapa saat.', 429);
    let ref = null;
    if (b.ref) { ref = await pemilikLink(sql, b.ref); if (!ref) return tolak('Kode sales tidak dikenal. Periksa lagi atau kosongkan.'); }
    // Agent: dari kode link (?ag=) yang tersimpan di CRM; link lama (?a=&k=) tetap diterima tanpa nomor WA
    const ag = ref?.leadAgent && b.ag ? await agentDariKode(sql, ref.username, b.ag) : null;
    const agentNama = ag ? ag.nama : ref?.leadAgent ? bersih(b.agent_nama, 80) : '', agentKantor = ag ? ag.kantor : ref?.leadAgent ? bersih(b.agent_kantor, 100) : '';
    const bawaan = ref ? null : await pemilikBawaan(sql);
    let pemilik = ref ? ref.nama : bawaan.nama, leadCode = null, leadBaru = false;
    const data = { nama, wa, wa_norm: waN, email, domisili, ref_username: ref?.username || '', agent_nama: agentNama, agent_kantor: agentKantor, agent_wa: ag?.wa_norm || '', pemilik };
    // Verifikasi WA menyala → lead CRM baru dibuat setelah nomornya terbukti benar
    if (!setting.uji && !setting.verifWA) { const r = await buatLeadFlash(sql, data); leadCode = r.leadCode; pemilik = r.pemilik; leadBaru = r.leadBaru; }
    const token = tokenBaru(), kode = setting.verifWA ? kodeVerif() : null;
    // Nomor yang sama pernah didaftarkan orang lain tetapi tidak pernah terverifikasi → digantikan pendaftaran ini
    if (lamaBelumSah) await sql`DELETE FROM flash_daftar WHERE id = ${lama.id} AND verified_at IS NULL AND NOT EXISTS (SELECT 1 FROM flash_pesan WHERE daftar_id = ${lama.id})`;
    const baru = (await sql`INSERT INTO flash_daftar (token, nama, wa, wa_norm, email, domisili, ref_username, agent_nama, agent_kantor, agent_kode, agent_wa, lead_code, pemilik, lead_baru, uji, verif_kode)
      VALUES (${token}, ${nama}, ${wa}, ${waN}, ${email}, ${domisili}, ${ref?.username || ''}, ${agentNama}, ${agentKantor}, ${ag?.kode || null}, ${ag?.wa_norm || null}, ${leadCode}, ${pemilik}, ${leadBaru}, ${setting.uji}, ${kode}) RETURNING *`)[0];
    return Response.json({ ok: true, token, sales: pemilik, verif: verifInfo(setting, baru) });
  }

  const d = await ambilDaftar(sql, b.token);
  if (!d) return tolak('Sesi Anda tidak dikenali. Silakan daftar ulang.', 401);

  // ---- Salah ketik nomor: ganti nomor selama belum terverifikasi ----
  if (b.aksi === 'ganti-nomor') {
    if (!perluVerif(setting, d)) return tolak('Nomor Anda sudah terverifikasi.');
    const wa = bersih(b.hp, 30), waN = normWA(wa);
    if (!hpSah(waN)) return tolak('Nomor HP belum benar. Contoh: 081234567890.');
    const pakai = (await sql`SELECT id FROM flash_daftar WHERE wa_norm = ${waN} AND id <> ${d.id} AND verified_at IS NOT NULL AND COALESCE(uji, false) = ${!!d.uji} LIMIT 1`)[0];
    if (pakai) return tolak('Nomor ini sudah terdaftar. Masuk dengan nomor dan email yang sama seperti saat mendaftar.', 409);
    const u = (await sql`UPDATE flash_daftar SET wa = ${wa}, wa_norm = ${waN}, verif_kode = ${kodeVerif()} WHERE id = ${d.id} RETURNING *`)[0];
    return Response.json({ ok: true, verif: verifInfo(setting, u) });
  }
  // ---- Konsumen menekan tombol Tanya → dicatat & pemilik lead diberi tahu (paling sering sekali per jam) ----
  if (b.aksi === 'tanya') {
    const baruSaja = d.tanya_at && Date.now() - new Date(d.tanya_at).getTime() < 3600000;
    await sql`UPDATE flash_daftar SET tanya_n = COALESCE(tanya_n, 0) + 1, tanya_at = now() WHERE id = ${d.id}`;
    if (!baruSaja && !d.uji) {
      try {
        const k = await kontakChat(sql, { daftar: d }), { kirimPush } = await import('@/lib/push');
        const hari = hariIni().split('-').reverse().join('/');
        if (d.lead_code) await sql`UPDATE leads SET catatan = TRIM(BOTH ' ·' FROM COALESCE(catatan, '') || ${' · Bertanya via WhatsApp dari platform Flash Sale ' + hari + ' (ke ' + k.nama + ')'}), updated_at = now() WHERE lead_code = ${d.lead_code}`.catch(() => {});
        const isi = `${d.nama} · ${d.wa} membuka chat WhatsApp ke ${k.jenis === 'agent' ? 'agent ' + k.nama : k.jenis === 'resmi' ? 'nomor resmi' : k.nama}`;
        const tujuan = k.jenis === 'resmi' || !d.pemilik ? { role: 'manager' } : { usernames: (await sql`SELECT username FROM users WHERE active = true AND lower(name) = lower(${d.pemilik})`).map(x => x.username) };
        await kirimPush(sql, tujuan, { judul: '💬 Konsumen Flash Sale bertanya', isi, url: '/flashsale-kelola', tag: 'fst-' + d.id });
      } catch (e) { console.error('tanya', e); }
    }
    return Response.json({ ok: true });
  }
  if (perluVerif(setting, d)) return tolak('Verifikasi nomor WhatsApp Anda dulu untuk melanjutkan.', 403);

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
