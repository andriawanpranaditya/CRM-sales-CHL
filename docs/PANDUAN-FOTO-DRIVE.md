# Memasang penyimpanan foto kunjungan di Google Drive (±10 menit per project)

Foto janji temu, walk in, dan laporan kunjungan agent disimpan di Google Drive, bukan di database CRM.
Lakukan langkah ini **dua kali**: sekali di akun Bio District, sekali di akun Permai Indah.

| Project | Akun Google |
|---|---|
| Bio District | marketing@biodistrictofficial.com |
| Permai Indah | permaiindahmkt@gmail.com |

## 1. Buat kunci rahasia (sekali saja, dipakai kedua akun)
Buat teks acak minimal 24 karakter, mis. `chl-foto-8Kd2Lq93xVb7Tz1Pm4Rw`. Simpan baik-baik.

## 2. Pasang script di akun Google
1. Login ke akun Google project tersebut, buka **https://script.google.com** → **New project**.
2. Hapus isi editor, tempel seluruh isi berkas `docs/foto-drive.gs`.
3. Ganti `GANTI_DENGAN_KUNCI_RAHASIA` dengan kunci dari langkah 1. Klik **Save** (ikon disket), beri nama proyek "CRM CHL Foto".
4. Klik **Deploy → New deployment** → ikon ⚙ **Select type → Web app**.
   - Description: `CRM foto`
   - **Execute as: Me**
   - **Who has access: Anyone**
5. Klik **Deploy** → **Authorize access** → pilih akun → **Advanced → Go to CRM CHL Foto (unsafe)** → **Allow**.
   (Peringatan ini normal karena script buatan sendiri; script hanya mengakses folder "CRM CHL - Foto Kunjungan".)
6. Salin **Web app URL** (berakhiran `/exec`).

## 3. Isi Environment Variables di Vercel
Vercel → project CRM → **Settings → Environment Variables**, tambahkan:

| Name | Value |
|---|---|
| `GDRIVE_KUNCI` | kunci rahasia dari langkah 1 |
| `GDRIVE_BIO_URL` | Web app URL dari akun Bio District |
| `GDRIVE_PERMAI_URL` | Web app URL dari akun Permai Indah |

Lalu **Redeploy** project CRM.

## 4. Selesai
Foto tersimpan di Google Drive akun masing-masing, folder **CRM CHL - Foto Kunjungan**, dikelompokkan per bulan.
Folder tetap privat — CRM membukanya lewat script dengan kunci rahasia.
Selama variabel belum diisi, CRM tetap berjalan; kolom foto tampil dengan keterangan "penyimpanan foto belum dipasang" dan tidak diwajibkan.
