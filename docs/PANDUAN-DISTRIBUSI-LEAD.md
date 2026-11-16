# Distribusi Lead Otomatis + Batas Respon

## Cara kerja
1. **Lead masuk ke antrian Marcom dulu** (input Marcom tanpa sales, chat WA baru, lead Drop > 90 hari yang chat lagi).
   Marcom melengkapi data & mengoper lewat **Form Input → Leads to Sales** seperti biasa.
2. **Label kualitas** terisi otomatis dari isian Marcom:
   - 🔥 **Siap oper** — nama jelas + minimal 2 data penyaring (rencana beli ≤ 6 bulan, cara bayar, budget, domisili, tipe)
   - 🟡 **Perlu dilengkapi / nurture** — data belum cukup, atau rencana beli > 6 bulan
   - ⚪ **Belum ada data**
3. **Lead 🔥 yang belum dioper 30 menit (jam kerja) dibagi otomatis** bergiliran ke sales project. Marcom mendapat notifikasi
   (lonceng + HP): "Lead dibagi otomatis ke …" — lead hilang dari antrian; di Leads to Sales tombolnya menjadi
   **Kirim konteks ke [sales]** (lead tidak dipindah, hanya konteks yang dikirim). Lead 🟡 / ⚪ tidak dibagi otomatis.
4. Begitu lead dipegang sales (dioper Marcom atau dibagi otomatis), sales menerima notifikasi **“📩 Lead baru — hubungi dalam 5 menit”**
   dengan tombol **WA sekarang**. Notifikasi **diulang tiap 1 menit**; saat CRM terbuka muncul pop-up dengan **alarm berbunyi terus**.
5. Dianggap merespon bila sales: menekan **WA sekarang** / **Sudah ditelepon**, **mencatat follow up**, atau **membuat janji temu**.
6. Lewat **10 menit** tanpa respon → lead **dialihkan** ke sales berikutnya (maks. 2 kali), lalu muncul di lonceng Manager (🚨).
7. Waktu dihitung hanya pada **jam kerja 08.00–20.00**. Oper manual Marcom ikut dihitung dalam giliran supaya jatah lead adil.
8. Sales yang cuti/izin dapat diset **tidak tersedia** (sampai tanggal tertentu) — tidak menerima lead.

Semua aturan bisa diubah Manager di **Tim Sales → Distribusi Lead**.

## Pasang pengecek tiap menit (wajib, gratis) — cron-job.org
Vercel versi gratis hanya bisa menjalankan jadwal sekali sehari, jadi pengecekan tiap menit memakai cron-job.org.
1. Buka menu **Tim Sales → Distribusi Lead** (akun Manager) → salin link di kartu **Pengecek otomatis tiap menit**.
2. Buka **https://cron-job.org** → **Sign up** (gratis) → login.
3. Klik **CREATE CRONJOB** → Title: `CRM Distribusi Lead` → URL: tempel link tadi.
4. Execution schedule: **Every 1 minute(s)** → **CREATE**.
5. Dalam 1–2 menit kartu di CRM berubah menjadi **✓ Terpasang**.

Link berisi kunci rahasia — jangan dibagikan. Selama belum dipasang, pengecekan tetap berjalan setiap kali ada yang membuka CRM.

## Setelan HP sales (agar notifikasi selalu berbunyi)
1. Pasang CRM sebagai aplikasi (Android: Chrome ⋮ → Tambahkan ke layar utama · iPhone: Safari → Share → Add to Home Screen).
2. Izinkan notifikasi saat CRM meminta.
3. Android: Setelan → Aplikasi → Chrome → Notifikasi → situs CRM → aktifkan Suara & Pop-up di layar.
4. Setelan → Aplikasi → Chrome → Baterai → **Tidak dibatasi**.
5. Matikan Mode Jangan Ganggu selama jam kerja.
6. Uji: menu Distribusi Lead → **Kirim notifikasi uji ke HP saya**.

Catatan: notifikasi HP tidak bisa berbunyi terus-menerus (dibatasi sistem Android/iOS) — karena itu notifikasi diulang tiap menit,
dan alarm berbunyi terus hanya saat CRM sedang terbuka.
