// Penggabungan lead dobel (disepakati dengan Head of Sales & Marketing, 13/11/2026).
// Semua data yang memakai lead_code (transaksi, berkas, follow up, janji temu, KPR, riwayat, percakapan WA, dll.)
// dipindahkan ke lead yang disimpan; data kosong di lead yang disimpan diisi dari lead yang digabung; lalu lead lama dihapus.
import { siapkanKontak, bersihKontak, normWA } from './kontak';

export const VERSI_GABUNG = '2026-11-13';
export const DAFTAR_GABUNG = [
  // A · WA sama
  { simpan: 'LEAD-0141', gabung: ['LEAD-0149'], ket: 'Susan — WA sama' },
  { simpan: 'LEAD-0067', gabung: ['LEAD-0041'], nama: 'Ignatius Widhi Ryandika', ket: 'Ryandika — WA sama' },
  // B · Kontrak ulang orang yang sama (lead impor)
  { simpan: 'LEAD-0518', gabung: ['LEAD-0664'], ket: 'Frangky Septian — kontrak ulang Bio Ave 3 no.11' },
  { simpan: 'LEAD-0662', gabung: ['LEAD-0671'], ket: 'Verrell Gunawan — kontrak ulang Bio Blv no.02' },
  { simpan: 'LEAD-0473', gabung: ['LEAD-0794'], ket: 'Adi Irawan — Blok A4 no.12' },
  { simpan: 'LEAD-0715', gabung: ['LEAD-0703'], ket: 'Ardenis Edbert Ramanta — Blok B5 no.01' },
  { simpan: 'LEAD-0470', gabung: ['LEAD-0788'], ket: 'Demmakria Erlinda Tambunan — Blok A6 no.18' },
  { simpan: 'LEAD-0465', gabung: ['LEAD-0741'], ket: 'Emyl Fahmy — Blok A8 no.12' },
  { simpan: 'LEAD-0469', gabung: ['LEAD-0787'], ket: 'Ester Monica — Blok A4 no.02' },
  { simpan: 'LEAD-0482', gabung: ['LEAD-0800'], ket: 'Irfan Arief Wicaksono — B1 no.10 / A7 no.02' },
  { simpan: 'LEAD-0467', gabung: ['LEAD-0744'], ket: 'Muhamad Akbar — Blok A3 no.02' },
  { simpan: 'LEAD-0464', gabung: ['LEAD-0740'], ket: 'Muhamad Fajri — Blok A4 no.01' },
  { simpan: 'LEAD-0472', gabung: ['LEAD-0792'], ket: 'Muhammad Alfarizi — Blok B5 no.01' },
  { simpan: 'LEAD-0475', gabung: ['LEAD-0799'], ket: 'Muhammad Iskandar — Blok A6 no.05' },
  { simpan: 'LEAD-0474', gabung: ['LEAD-0793'], ket: 'Muhammad Surya Albaina — Blok B3 no.08' },
  { simpan: 'LEAD-0484', gabung: ['LEAD-0802'], ket: 'Rivaldo Situmorang — A1 no.15 / B1 no.08' },
  { simpan: 'LEAD-0471', gabung: ['LEAD-0789'], ket: 'Sanitha M. Sianipar — Blok C2 no.18' },
  // C · Keputusan khusus
  { simpan: 'LEAD-0095', gabung: ['LEAD-0377'], kontak: true, ket: 'Sri Handayani — WA beda 1 digit, nomor lain disimpan sebagai nomor kedua' },
  { simpan: 'LEAD-0559', gabung: ['LEAD-0159', 'LEAD-0156'], kontak: true, ketKontak: 'nomor dari Marcom — tidak pernah dijawab', catatanAsal: 'Juga masuk lewat Marcom (LEAD-0156).', ket: 'Yudi — lead sales (referensi) dipakai, lead Marcom digabung' },
  { simpan: 'LEAD-0081', gabung: ['LEAD-0082'], ket: 'ikhsan — LEAD-0082 (nama "sebrina") dihapus, WA sama' },
];

const KOLOM_ISI = ['wa', 'email', 'domisili', 'kerja', 'tipe', 'tujuan', 'bayar', 'usia', 'gender', 'walkin_info', 'campaign', 'konten', 'sumber_detail'];

export async function gabungLead(sql, { cek = true, oleh = '' } = {}) {
  await siapkanKontak(sql);
  // Semua tabel yang punya kolom lead_code (kecuali leads)
  const tabel = (await sql`SELECT table_name FROM information_schema.columns WHERE column_name = 'lead_code' AND table_schema = current_schema() AND table_name <> 'leads'`).map(r => r.table_name);
  const hasil = [];
  for (const g of DAFTAR_GABUNG) {
    const semua = await sql`SELECT * FROM leads WHERE lead_code = ANY(${[g.simpan, ...g.gabung]}::text[])`;
    const utama = semua.find(l => l.lead_code === g.simpan);
    const lain = g.gabung.map(k => semua.find(l => l.lead_code === k)).filter(Boolean);
    const baris = { ...g, status: '', pindah: {}, pesan: [] };
    if (!utama) { baris.status = 'lewati'; baris.pesan.push(`${g.simpan} tidak ditemukan`); hasil.push(baris); continue; }
    if (!lain.length) { baris.status = 'sudah'; baris.pesan.push('lead yang digabung sudah tidak ada (sudah digabung sebelumnya)'); hasil.push(baris); continue; }
    baris.status = cek ? 'akan digabung' : 'digabung';
    baris.namaUtama = g.nama || utama.nama; baris.namaLain = lain.map(l => `${l.lead_code} ${l.nama}`);
    for (const t of tabel) {
      try {
        const n = (await sql(`SELECT count(*)::int AS n FROM "${t}" WHERE lead_code = ANY($1)`, [lain.map(l => l.lead_code)]))[0]?.n || 0;
        if (n) baris.pindah[t] = n;
      } catch {}
    }
    if (cek) { hasil.push(baris); continue; }
    // 1) pindahkan semua data terkait
    for (const t of Object.keys(baris.pindah)) {
      try { await sql(`UPDATE "${t}" SET lead_code = $1 WHERE lead_code = ANY($2)`, [g.simpan, lain.map(l => l.lead_code)]); }
      catch (e) { baris.pesan.push(`${t}: ${String(e.message || e).slice(0, 80)}`); }
    }
    // 2) lengkapi data kosong, nama, kontak tambahan, catatan
    const isi = {};
    for (const k of KOLOM_ISI) if (!String(utama[k] ?? '').trim()) { const v = lain.map(l => l[k]).find(v => String(v ?? '').trim()); if (v) isi[k] = v; }
    if (!Number(utama.budget)) { const v = lain.map(l => Number(l.budget)).find(v => v > 0); if (v) isi.budget = v; }
    let kontak = Array.isArray(utama.kontak) ? [...utama.kontak] : [];
    for (const l of lain) {
      if (Array.isArray(l.kontak)) kontak.push(...l.kontak);
      if (g.kontak && normWA(l.wa) && normWA(l.wa) !== normWA(isi.wa || utama.wa)) kontak.push({ nama: l.nama, hubungan: 'Nomor kedua', wa: l.wa, ket: g.ketKontak || `dari ${l.lead_code}` });
    }
    kontak = bersihKontak(kontak, isi.wa || utama.wa);
    const jejak = `Digabung dari ${lain.map(l => `${l.lead_code} (${l.nama}${l.sumber ? ', ' + l.sumber : ''}${l.sales ? ', ' + l.sales : ''})`).join(', ')} pada ${new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)}${oleh ? ' oleh ' + oleh : ''}.`;
    const catatan = [utama.catatan, g.catatanAsal, jejak].filter(x => String(x || '').trim()).join(' · ');
    for (const [k, v] of Object.entries(isi)) { try { await sql(`UPDATE leads SET "${k}" = $1 WHERE lead_code = $2`, [v, g.simpan]); } catch {} }
    await sql`UPDATE leads SET nama = ${g.nama || utama.nama}, kontak = ${JSON.stringify(kontak)}::jsonb, catatan = ${catatan}, updated_at = now() WHERE lead_code = ${g.simpan}`;
    // 3) hapus lead lama
    await sql`DELETE FROM leads WHERE lead_code = ANY(${lain.map(l => l.lead_code)}::text[])`;
    hasil.push(baris);
  }
  return hasil;
}
