// ===== Digital Marketing — siapa yang boleh membuka =====
// Sementara KHUSUS akun Andriawan (Head of Sales & Marketing). Dicek di menu (Shell), halaman, dan API.
// Untuk membuka ke tim nanti: ubah aturan di sini saja (mis. tambahkan role 'markom') — dan pasang alur persetujuan dulu.
export const bolehDigital = u => !!u && u.role === 'manager' && /andriawan/i.test(`${u.name || ''} ${u.username || ''}`);
