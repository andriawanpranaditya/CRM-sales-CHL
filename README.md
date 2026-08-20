# CRM Sales CHL — Versi Database Bersama

Aplikasi web CRM untuk tim Sales & Marketing Cipta Harmoni Lestari.
Semua data tersimpan di **satu database Postgres** — input sales dari HP langsung
muncul di dashboard manager, real-time, tanpa kirim-kirim file.

## Fitur

- **Login per user** (username + password, sesi aman 30 hari)
- **Role Sales** — hanya bisa membuka Form Input; kolom Sales/PIC otomatis terkunci
  sesuai akun; hanya melihat lead miliknya sendiri
- **Role Manager** — Dashboard, Database Lead (ubah status via dropdown), Follow Up
  (reminder overdue/hari ini/upcoming), Booking & Closing, Report per Sales,
  Settings master dropdown, dan menu **Pengguna** untuk membuat akun tim
- Desain sama dengan versi HTML: tema hijau-emas CHL, logo, mobile-friendly
  (tabel jadi kartu, navigasi bawah)

## Cara Deploy (±15 menit, semua gratis)

### 1. Buat database di Neon
1. Daftar di https://neon.tech (gratis).
2. Buat project baru → salin **connection string** yang berlabel *pooled*
   (bentuknya `postgres://...-pooler....neon.tech/neondb?sslmode=require`).

### 2. Taruh kode di GitHub
1. Daftar/masuk https://github.com → **New repository** → beri nama `crm-chl-web`,
   pilih **Private** → Create.
2. Klik **uploading an existing file** → seret SEMUA isi folder project ini
   (bukan foldernya, tapi isinya) → Commit.

### 3. Deploy di Vercel
1. Daftar di https://vercel.com dengan akun GitHub tadi.
2. **Add New → Project** → pilih repo `crm-chl-web` → sebelum Deploy, buka
   **Environment Variables** dan isi 3 variabel:
   - `DATABASE_URL` = connection string Neon dari langkah 1
   - `AUTH_SECRET`  = teks acak panjang (min. 32 karakter, karang sendiri)
   - `SETUP_KEY`    = kunci rahasia sekali pakai (karang sendiri)
3. Klik **Deploy** → dapat alamat seperti `crm-chl-web.vercel.app`.

### 4. Inisialisasi database (sekali saja)
Buka di browser:
`https://ALAMAT-ANDA.vercel.app/api/setup?key=SETUP_KEY_ANDA`

Ini membuat semua tabel + akun pertama:
**username `manager`, password `manager123`** → login, lalu SEGERA ganti
password lewat menu Pengguna → Reset Password.

### 5. Buat akun tim
Login sebagai manager → menu **Pengguna** → tambah akun sales
(mis. username `putri`, nama `PUTRI`, peran Sales). Nama akun sales otomatis
muncul di dropdown Sales/PIC. Bagikan alamat aplikasi + akun ke tim;
di HP pilih *Add to Home Screen* agar tampil seperti aplikasi.

## Pengembangan lokal (opsional)

```bash
cp .env.example .env.local   # isi DATABASE_URL, AUTH_SECRET, SETUP_KEY
npm install
npm run dev                  # buka http://localhost:3000
```

## Struktur data
1

- `users` — akun (manager/sales, password ter-hash bcrypt)
- `leads` — data konsumen, kode LEAD-0001 otomatis
- `followups` — histori komunikasi per lead
- `transactions` — Booking/Closing/Batal (status lead ikut ter-update)
- `settings` — master dropdown (status, sumber, project, tipe, tujuan, bayar)
