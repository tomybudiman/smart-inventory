# 📦 Sistem Inventaris Barang Lab & Kantor (SPA)

Aplikasi Web *Single Page Application* (SPA) modern dan responsif untuk pencatatan dan pengelolaan inventaris laboratorium & kantor secara realtime. Dibangun menggunakan **HTML5**, **Bootstrap 5.3**, dan **Firebase Modular SDK v10** (Authentication & Realtime Database), lalu di-deploy ke **Google Cloud Run**.

- **Aplikasi (Live)**: https://smart-inventory-rxwyj62gha-et.a.run.app
- **Laporan Proyek**: [`LAPORAN_AKHIR.md`](LAPORAN_AKHIR.md) (pemenuhan requirement, cuplikan kode, arsitektur, dan layanan cloud)

---

## 👤 Akun Demo untuk Pengujian
Gunakan kredensial akun demo berikut untuk masuk dan menguji seluruh fitur sistem:
- **Email / Username**: `hello@tomybudi.dev`
- **Password**: `test12345678`

Email akun demo ini sudah diverifikasi. Akun baru yang didaftarkan lewat form *Daftar* harus mengklik tautan verifikasi di email terlebih dahulu sebelum dapat mengakses data (periksa juga folder Spam).

---

## 🚀 Fitur Utama

1. **Autentikasi Pengguna (Firebase Auth)**:
   - Form Login & Registrasi dengan validasi input (email & panjang password minimal 6 karakter).
   - **Verifikasi email**: setelah register, Firebase mengirim email berisi tautan verifikasi (`sendEmailVerification()`, berbahasa Indonesia). Akun yang belum terverifikasi tertahan di halaman verifikasi (tombol cek status, kirim ulang dengan jeda 60 detik, dan pengecekan otomatis saat kembali ke tab) serta tidak dapat membaca/menulis data. Pada build Cloud Run, asisten AI juga hanya dapat dipakai akun yang sudah terverifikasi (diperiksa oleh server proxy).
   - Pengalihan tampilan instan (*reactive state management*) menggunakan `onAuthStateChanged()`.
   - Error handling ramah pengguna dalam Bahasa Indonesia (alert Bootstrap).
   - Logout session yang aman dengan `signOut()`.

2. **Manajemen Data Inventaris Realtime (CRUD)**:
   - **Create**: Tambah barang baru via modal interaktif (`push()` + `set()`).
   - **Read / Sync**: Sinkronisasi data realtime multi-user via `onValue()`.
   - **Update**: Edit rincian barang langsung dari modal (`update()`).
   - **Delete**: Hapus barang dengan dialog konfirmasi aman. Catatan peminjaman & perawatan barang tersebut ikut terhapus dalam satu multi-path `update()`.

3. **Peminjaman & Perawatan Barang (CRUD)** — tab terpisah di dashboard, masing-masing dengan Create (`push()` + `set()`), Read realtime (`onValue()`), Update (`update()`), dan Delete (`remove()`):
   - **Peminjaman**: catat peminjam, jumlah unit, tanggal pinjam & batas kembali. Jumlah dibatasi unit yang masih tersedia, peminjaman yang lewat batas ditandai *Terlambat*, dan ada tombol cepat **Tandai Dikembalikan**.
   - **Perawatan**: catat servis rutin, perbaikan, atau kalibrasi beserta tanggal, biaya, deskripsi, dan status (Dijadwalkan / Dalam Proses / Selesai).

4. **Skema Data (Realtime Database)**:

   **Node `/inventaris`**:
   - `namaBarang` (String)
   - `kategori` ("Elektronik", "ATK", "Perabot", "Hardware Jaringan")
   - `jumlah` (Number, minimal 1)
   - `kondisi` ("Baik", "Rusak Ringan", "Rusak Berat")
   - `lokasi` (String)
   - `createdBy` (Email petugas)
   - `updatedAt` (ISO Timestamp)

   **Node `/peminjaman`**: `barangId` (key barang di `/inventaris`), `peminjam`, `jumlah` (minimal 1), `tanggalPinjam` & `tanggalKembali` (YYYY-MM-DD), `status` ("Dipinjam", "Dikembalikan"), `createdBy`, `updatedAt`.

   **Node `/perawatan`**: `barangId`, `jenis` ("Servis Rutin", "Perbaikan", "Kalibrasi"), `deskripsi`, `tanggal` (YYYY-MM-DD), `biaya` (Rupiah, minimal 0), `status` ("Dijadwalkan", "Dalam Proses", "Selesai"), `createdBy`, `updatedAt`.

5. **Fitur Tambahan (UI/UX)**:
   - Ringkasan statistik (KPI Cards): Total Item, Total Unit Fisik, Lokasi / Ruangan, Kondisi Baik, Perlu Perbaikan. Tab Peminjaman dan Perawatan memiliki statistik sendiri (sedang dipinjam, terlambat, sudah dikembalikan; belum selesai, selesai, total biaya).
   - Dua mode tampilan inventaris: **Daftar Tabel** dan **Sebaran Lokasi Alat** (kartu per ruangan), serta modal **Detail Barang** yang menampilkan barang lain di ruangan yang sama.
   - Live Search (pencarian nama & lokasi) dan Filter ganda berdasarkan Kategori & Kondisi; tab Peminjaman dan Perawatan memiliki pencarian dan filter status sendiri.
   - Badge warna status kondisi barang (Hijau = Baik, Kuning = Rusak Ringan, Merah = Rusak Berat).
   - Toast notification feedback untuk setiap aksi data.

---

## 🛠️ Panduan Konfigurasi Firebase Console

### 1. Buat Proyek Firebase
1. Buka [Firebase Console](https://console.firebase.google.com/).
2. Klik **Add project** (Tambah Proyek), masukkan nama proyek (misal: `inventaris-lab`), lalu lanjutkan hingga selesai.

### 2. Aktifkan Firebase Authentication
1. Di bilah menu sebelah kiri, masuk ke menu **Build** > **Authentication**.
2. Klik tombol **Get Started**.
3. Di tab **Sign-in method**, pilih penyedia **Email/Password**.
4. Aktifkan opsi **Email/Password** (opsi Email link tidak perlu dicentang), lalu klik **Save**.
5. (Opsional) Di tab **Templates** > **Email address verification**, sesuaikan nama pengirim dan isi email verifikasi.

### 3. Buat & Aktifkan Firebase Realtime Database
1. Di bilah menu sebelah kiri, masuk ke **Build** > **Realtime Database**.
2. Klik **Create Database**, pilih lokasi server terdekat (disarankan `Singapore (asia-southeast1)`). URL database ditampilkan di bagian atas tab **Data** dan dipakai untuk `VITE_FIREBASE_DATABASE_URL`: lokasi Singapura berformat `https://<project-id>-default-rtdb.asia-southeast1.firebasedatabase.app`, sedangkan lokasi `United States` berformat `https://<project-id>-default-rtdb.firebaseio.com`.
3. Pilih mode awal **Start in locked mode** (atau test mode), lalu klik **Enable**.

### 4. Atur Security Rules Realtime Database
Pilih tab **Rules** pada Realtime Database, lalu masukkan aturan berikut yang **mewajibkan user login dengan email terverifikasi**:

```json
{
  "rules": {
    "inventaris": {
      ".read": "auth != null && auth.token.email_verified == true",
      ".write": "auth != null && auth.token.email_verified == true"
    },
    "peminjaman": {
      ".read": "auth != null && auth.token.email_verified == true",
      ".write": "auth != null && auth.token.email_verified == true"
    },
    "perawatan": {
      ".read": "auth != null && auth.token.email_verified == true",
      ".write": "auth != null && auth.token.email_verified == true"
    }
  }
}
```
Klik tombol **Publish** untuk menerapkan aturan.

**Aturan dengan validasi data (disarankan).** Repository ini menyertakan `database.rules.json`. Selain mewajibkan login, aturan tersebut memeriksa setiap barang di `/inventaris`: ketujuh field skema (`namaBarang`, `kategori`, `jumlah`, `kondisi`, `lokasi`, `createdBy`, `updatedAt`) wajib ada, `kategori` dan `kondisi` harus salah satu nilai pada form, `jumlah` harus bilangan bulat minimal 1, dan field di luar skema ditolak. Aturan serupa berlaku untuk `/peminjaman` dan `/perawatan`; selain itu `barangId` wajib merujuk ke barang yang ada di `/inventaris` dan tanggal wajib berformat YYYY-MM-DD. Terapkan dengan salah satu cara berikut:

- **Console:** salin isi `database.rules.json` ke tab **Rules**, uji di **Rules Playground**, lalu klik **Publish**.
- **CLI:** `npx firebase-tools login`, lalu `npx firebase-tools deploy --only database --project <project-id>`.

> Catatan: akun yang emailnya belum diverifikasi tidak dapat membaca maupun menulis data. Saat memperbarui produksi, deploy aplikasi lebih dulu baru kemudian rules, agar pengguna yang belum terverifikasi sudah diarahkan ke halaman verifikasi sebelum aksesnya ditutup.
>
> Data lama yang memiliki field di luar skema tetap terbaca, tetapi penyimpanan ulang (edit) barang tersebut akan ditolak. Panjang teks tidak dibatasi. Jika daftar pilihan pada form (kategori, kondisi, status, jenis perawatan) diubah, ubah juga `database.rules.json` (`npm test` akan gagal jika keduanya tidak sama).

### 5. Atur Kredensial Firebase & Gemini AI (Environment Variables)

Konfigurasi Firebase dibaca Vite saat build dari file `.env.local`. Salin contoh file environment (file `.env.local` otomatis diabaikan oleh `.gitignore` sehingga tidak akan terunggah ke Git/GitHub):
```bash
cp .env.example .env.local
```
Lalu lengkapi nilainya:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=YOUR_API_KEY_HERE
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID

# Google Gemini AI (hanya untuk pengembangan lokal)
VITE_GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
VITE_GEMINI_MODEL=gemini-3.8-flash
```

> **Catatan**:
> - Dapatkan Gemini API Key gratis di [Google AI Studio](https://aistudio.google.com/).
> - Build Cloud Run (`npm run build:cloudrun`) memakai `.env.cloudrun` yang mengosongkan `VITE_GEMINI_API_KEY`, sehingga API key tidak ikut tertanam di JavaScript. Di produksi, Gemini dipanggil lewat proxy `server.mjs` yang membaca `GEMINI_API_KEY` dan `FIREBASE_API_KEY` dari environment variable service Cloud Run (lihat *Deploy ke Google Cloud Run*).

---

## 🤖 Fitur Asisten AI Gemini (Chat Inventaris Cerdas)

Aplikasi telah dilengkapi widget chat asisten cerdas ditenagai **Google Gemini AI** model terbaru (**`gemini-3.8-flash`** dengan auto-fallback ke `gemini-3.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.0-flash`, dan `gemini-1.5-flash`):

- **Koneksi Realtime Otomatis**: Asisten AI membaca seluruh data inventaris yang aktif secara otomatis (jumlah unit, nama barang, kategori, kondisi baik/rusak, dan sebaran lokasi ruangan).
- **Rekomendasi Pintar**: Mampu memberikan analisis kondisi alat lab, rekomendasi jadwal servis, dan SOP perawatan berkala.
- **Tambah Barang via Chat**: Ketik permintaan seperti *"Tambah 10 kursi lipat dan 2 proyektor Epson di Ruang Rapat"*. Asisten menampilkan kartu konfirmasi berisi draft barang (divalidasi dengan aturan yang sama seperti form, plus penanda *Lokasi baru*), dan barang baru tersimpan ke Realtime Database setelah petugas menekan **Simpan**.
- **Dukungan Format Markdown**: Respon disajikan rapi dengan poin-poin, penekanan teks penting, dan tabel.
- **Tombol Salin & Bersihkan**: Memudahkan menyalin jawaban atau mereset percakapan.
- **Panel Pengaturan Fleksibel**: Pengguna dapat melihat status koneksi (proxy server Cloud Run atau API key lokal) dan memilih model Gemini via ikon ⚙️ Pengaturan di dalam widget chat.

---

## 💻 Cara Menjalankan Aplikasi

**Prasyarat**: Node.js 20.11 atau lebih baru, proyek Firebase yang sudah dikonfigurasi (lihat panduan di atas), dan file `.env.local`. Untuk deploy ke Cloud Run dibutuhkan juga [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`).

Aplikasi dibangun menggunakan Vite untuk performa cepat dan kemudahan deployment:

0. **Pasang Dependensi** (sekali setelah clone):
   ```bash
   npm ci
   ```

1. **Jalankan Mode Pengembangan (Local Dev)**:
   ```bash
   npm run dev
   ```
   Aplikasi akan terbuka otomatis di browser pada `http://localhost:5173`.

2. **Build Biasa (Tanpa Proxy)**:
   ```bash
   npm run build
   ```
   Menghasilkan folder `dist` yang dapat dicoba dengan `npm run preview`. Build ini menanamkan `VITE_GEMINI_API_KEY` ke JavaScript, jadi jangan dipakai untuk hosting publik; gunakan build Cloud Run di bawah.

3. **Deploy ke Google Cloud Run**:
   ```bash
   npm run deploy:cloudrun
   ```
   Aplikasi saat ini berjalan di https://smart-inventory-rxwyj62gha-et.a.run.app. Perintah di atas membangun aplikasi dengan mode `cloudrun` (`.env.cloudrun`), lalu men-deploy service `smart-inventory` di region `asia-southeast2` ke project gcloud yang aktif. Pada mode ini, Gemini dipanggil lewat proxy `server.mjs`, sehingga API key tidak ikut tertanam di JavaScript dan fitur AI hanya bisa dipakai petugas yang sudah login dan emailnya terverifikasi.

   Persiapan sekali di Google Cloud:
   ```bash
   gcloud auth login
   gcloud config set project <gcp-project-id>
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

   Pada deploy pertama, tambahkan environment variable server (deploy berikutnya otomatis memakai nilai yang sama). `FIREBASE_API_KEY` bernilai sama dengan `VITE_FIREBASE_API_KEY`:
   ```bash
   npm run build:cloudrun
   gcloud run deploy smart-inventory --source . --region asia-southeast2 --allow-unauthenticated --max-instances 2 \
     --update-env-vars GEMINI_API_KEY=<gemini_api_key>,FIREBASE_API_KEY=<firebase_web_api_key>
   ```

   Jika revisi baru bermasalah, kembalikan traffic ke revisi sebelumnya:
   ```bash
   gcloud run revisions list --service smart-inventory --region asia-southeast2
   gcloud run services update-traffic smart-inventory --region asia-southeast2 --to-revisions <nama-revisi>=100
   ```

4. **Jalankan Pengujian** (Node.js 20.11 atau lebih baru, tanpa dependensi tambahan):
   ```bash
   npm test
   ```
   Pengujian mencakup logika murni di `src/inventory-logic.mjs` (validasi usulan AI, validasi peminjaman & perawatan, status terlambat, hapus berantai, konteks AI, escape HTML, markdown, pesan error auth), server proxy `server.mjs` (verifikasi token, penolakan akun yang emailnya belum diverifikasi, pembatasan model, penyaringan field, path traversal), dan kesesuaian `database.rules.json` dengan form pada `index.html` untuk ketiga node.

---

## 🗂️ Struktur Proyek

| Berkas / Folder | Isi |
|---|---|
| `index.html` | Seluruh tampilan SPA dan logika aplikasi (auth, verifikasi email, CRUD tiga modul, asisten AI) |
| `src/inventory-logic.mjs` | Logika murni tanpa DOM/Firebase (validasi, perhitungan stok, konteks AI) agar dapat diuji |
| `server.mjs` | Server produksi Cloud Run: menyajikan `dist/` dan proxy Gemini (cek ID token & email terverifikasi) |
| `database.rules.json`, `firebase.json` | Security Rules Realtime Database dan konfigurasi deploy-nya |
| `Dockerfile`, `.gcloudignore` | Image container Cloud Run dan daftar berkas yang diunggah ke Cloud Build |
| `.env.example`, `.env.cloudrun` | Contoh konfigurasi lokal, dan konfigurasi build Cloud Run (tanpa Gemini API key) |
| `tests/` | Pengujian otomatis (`npm test`) |
| `LAPORAN_AKHIR.md` | Laporan akhir proyek; `LAPORAN_CHECKPOINT_3.md` adalah laporan progres sebelumnya |

Alur singkatnya: browser memuat aplikasi dari Cloud Run, lalu terhubung **langsung** ke Firebase Authentication dan Realtime Database lewat Firebase SDK. Hanya permintaan ke asisten AI yang melewati `server.mjs`, yang meneruskannya ke Gemini API dengan API key milik server.
