// ===== Template resmi WhatsApp untuk Standar FU Wajib (nomor official) =====
// Di luar jendela 24 jam, WhatsApp hanya menerima pesan template yang sudah disetujui Meta.
// Paket ini bisa diajukan sekali dari Inbox WhatsApp (Administrator) lalu ditinjau Meta (biasanya beberapa menit s.d. 1 hari).
// Variabel: {{1}} nama konsumen · {{2}} project · {{3}} nama sales · {{4}} info (harga/promo/undangan, terisi otomatis)
// Aturan Meta: variabel tidak boleh di awal/akhir badan pesan, isian tanpa baris baru.
export const TEMPLATE_STANDAR = [
  { name: 'perkenalan_konsultan', category: 'UTILITY', untuk: ['h1', 'oper'],
    body: 'Halo Kak {{1}}, terima kasih sudah menghubungi {{2}}. Mulai sekarang Kakak dibantu oleh {{3}}, konsultan properti kami, di nomor ini juga. Silakan balas pesan ini bila ada yang ingin ditanyakan ya Kak.',
    contoh: ['Budi', 'Bio District', 'Icha'] },
  { name: 'fu_info_unit', category: 'MARKETING', untuk: ['h2', 'percakapan'],
    body: 'Halo Kak {{1}}, saya {{3}} dari {{2}}. Berikut info singkat yang mungkin Kakak perlukan: {{4}}. Mau saya buatkan simulasi sesuai budget Kakak?',
    contoh: ['Budi', 'Bio District', 'Icha', 'Tipe A mulai Rp1,55 M dengan cicilan sekitar Rp7,2 juta per bulan'] },
  { name: 'fu_bukti_unit', category: 'MARKETING', untuk: ['h3'],
    body: 'Halo Kak {{1}}, saya {{3}} dari {{2}}. Sekilas tentang kawasan kami: {{4}}. Boleh saya kirimkan foto dan video unitnya? Cukup balas YA.',
    contoh: ['Budi', 'Bio District', 'Icha', 'hanya 63 unit konsep resort living, unit ready, 3 menit ke Stasiun Rawa Buntu'] },
  { name: 'fu_promo', category: 'MARKETING', untuk: ['h5', 'nurture'],
    body: 'Halo Kak {{1}}, saya {{3}} dari {{2}}. Ada info terbaru yang mungkin pas untuk Kakak: {{4}}. Boleh saya telepon sebentar untuk menjelaskan simulasinya?',
    contoh: ['Budi', 'Bio District', 'Icha', 'promo Grand Rewards dengan hadiah langsung'] },
  { name: 'fu_preferensi', category: 'MARKETING', untuk: ['h7'],
    body: 'Halo Kak {{1}}, saya {{3}} dari {{2}}. Saya tidak ingin mengganggu, boleh dibalas angka saja: 1 masih mencari rumah, 2 lebih nyaman ditelepon, 3 sedang tidak mencari dulu. Terima kasih Kak.',
    contoh: ['Budi', 'Bio District', 'Icha'] },
  { name: 'undangan_visit', category: 'MARKETING', untuk: ['undangan', 'openhouse'],
    body: 'Halo Kak {{1}}, saya {{3}} dari {{2}}. Weekend ini kami mengadakan {{4}} dan saya ingin mengundang Kakak secara khusus. Kakak lebih nyaman datang hari Sabtu atau Minggu?',
    contoh: ['Budi', 'Bio District', 'Icha', 'Open House di Marketing Gallery, Sabtu–Minggu pukul 10.00–16.00'] },
];
// Perkiraan biaya per pesan (Indonesia, tarif Meta 2026 — cek tagihan di WhatsApp Manager untuk angka pasti)
export const BIAYA = { MARKETING: 630, UTILITY: 360, AUTHENTICATION: 360 };

// Bentuk pengajuan ke Meta (POST /{waba_id}/message_templates)
export function defPengajuan(t) {
  return {
    name: t.name, language: 'id', category: t.category,
    components: [{ type: 'BODY', text: t.body, example: { body_text: [t.contoh] } }],
  };
}
// Template yang disarankan untuk tahap FU wajib tertentu
export const saranTemplate = jenis => (TEMPLATE_STANDAR.find(t => t.untuk.includes(jenis)) || TEMPLATE_STANDAR[1]).name;
// Isian bersih untuk parameter template (tanpa baris baru, tanpa format tebal)
export const bersihIsian = v => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\*/g, '').replace(/ {4,}/g, '   ').trim().slice(0, 900) || '-';
