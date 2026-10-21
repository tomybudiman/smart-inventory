# 📦 Sistem Inventaris Barang Lab & Kantor (SPA)

Aplikasi Web *Single Page Application* (SPA) modern dan responsif untuk pencatatan dan pengelolaan inventaris laboratorium & kantor secara realtime. Dibangun menggunakan **HTML5**, **Bootstrap 5.3**, dan **Firebase Modular SDK v10** (Authentication & Realtime Database).

---

## 👤 Akun Demo untuk Pengujian
Gunakan kredensial akun demo berikut untuk masuk dan menguji seluruh fitur sistem:
- **Email / Username**: `atirtana@student.ciputra.ac.id`
- **Password**: `123456`

---

## 🚀 Fitur Utama

1. **Autentikasi Pengguna (Firebase Auth)**:
   - Form Login & Registrasi dengan validasi input (email & panjang password minimal 6 karakter).
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

4. **Skema Data Node (`/inventaris`)**:
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
   - Ringkasan statistik (KPI Cards): Total Item, Total Unit Fisik, Kondisi Baik, Perlu Perbaikan.
   - Live Search (pencarian nama & lokasi) dan Filter ganda berdasarkan Kategori & Kondisi.
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

### 3. Buat & Aktifkan Firebase Realtime Database
1. Di bilah menu sebelah kiri, masuk ke **Build** > **Realtime Database**.
2. Klik **Create Database**, pilih lokasi server terdekat (misal: `Singapore (asia-southeast1)` atau default `United States`).
3. Pilih mode awal **Start in locked mode** (atau test mode), lalu klik **Enable**.

### 4. Atur Security Rules Realtime Database
Pilih tab **Rules** pada Realtime Database, lalu masukkan aturan berikut yang **mewajibkan user terautentikasi (`auth != null`)**:

```json
{
  "rules": {
    "inventaris": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "peminjaman": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "perawatan": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```
Klik tombol **Publish** untuk menerapkan aturan.

**Aturan dengan validasi data (disarankan).** Repository ini menyertakan `database.rules.json`. Selain mewajibkan login, aturan tersebut memeriksa setiap barang di `/inventaris`: ketujuh field skema (`namaBarang`, `kategori`, `jumlah`, `kondisi`, `lokasi`, `createdBy`, `updatedAt`) wajib ada, `kategori` dan `kondisi` harus salah satu nilai pada form, `jumlah` harus bilangan bulat minimal 1, dan field di luar skema ditolak. Aturan serupa berlaku untuk `/peminjaman` dan `/perawatan`; selain itu `barangId` wajib merujuk ke barang yang ada di `/inventaris` dan tanggal wajib berformat YYYY-MM-DD. Terapkan dengan salah satu cara berikut:

- **Console:** salin isi `database.rules.json` ke tab **Rules**, uji di **Rules Playground**, lalu klik **Publish**.
- **CLI:** `npx firebase-tools login`, lalu `npx firebase-tools deploy --only database --project <project-id>`.

> Catatan: data lama yang memiliki field di luar skema tetap terbaca, tetapi penyimpanan ulang (edit) barang tersebut akan ditolak. Panjang teks tidak dibatasi. Jika daftar pilihan pada form (kategori, kondisi, status, jenis perawatan) diubah, ubah juga `database.rules.json` (`npm test` akan gagal jika keduanya tidak sama).

### 5. Atur Kredensial Firebase & Gemini AI (Environment Variables)

Untuk deployment di **Railway / Vercel**:
Masuk ke menu **Variables** di dashboard Railway/Vercel proyek Anda, lalu tambahkan variabel berikut:

```env
# Firebase Configuration (Nilai kredensial disamarkan / blur)
VITE_FIREBASE_API_KEY=AIzaSy***********************************
VITE_FIREBASE_AUTH_DOMAIN=inventaris-***.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://inventaris-***-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=inventaris-***
VITE_FIREBASE_STORAGE_BUCKET=inventaris-***.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1075*********
VITE_FIREBASE_APP_ID=1:1075*********:web:********************

# Google Gemini AI Configuration (Model Terbaru: Gemini 3.8 Flash)
VITE_GEMINI_API_KEY=AIzaSy***********************************
VITE_GEMINI_MODEL=gemini-3.8-flash
```

> **Catatan Railway**:
> - Dapatkan Gemini API Key gratis di [Google AI Studio](https://aistudio.google.com/).
> - Variabel berawalan `VITE_` akan otomatis diinjeksi saat Railway menjalankan proses build (`npm run build`).

Untuk pengujian **Lokal**:
Salin contoh file environment ke `.env.local` (file ini otomatis diabaikan oleh `.gitignore` sehingga tidak akan terunggah ke Git/GitHub):
```bash
cp .env.example .env.local
```
Lalu lengkapi nilai kredensial proyek Anda di `.env.local`.

---

## 🤖 Fitur Asisten AI Gemini (Chat Inventaris Cerdas)

Aplikasi telah dilengkapi widget chat asisten cerdas ditenagai **Google Gemini AI** model terbaru (**`gemini-3.8-flash`** dengan auto-fallback ke `gemini-3.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.0-flash`, dan `gemini-1.5-flash`):

- **Koneksi Realtime Otomatis**: Asisten AI membaca seluruh data inventaris yang aktif secara otomatis (jumlah unit, nama barang, kategori, kondisi baik/rusak, dan sebaran lokasi ruangan).
- **Rekomendasi Pintar**: Mampu memberikan analisis kondisi alat lab, rekomendasi jadwal servis, dan SOP perawatan berkala.
- **Tambah Barang via Chat**: Ketik permintaan seperti *"Tambah 10 kursi lipat dan 2 proyektor Epson di Ruang Rapat"*. Asisten menampilkan kartu konfirmasi berisi draft barang (divalidasi dengan aturan yang sama seperti form, plus penanda *Lokasi baru*), dan barang baru tersimpan ke Realtime Database setelah petugas menekan **Simpan**.
- **Dukungan Format Markdown**: Respon disajikan rapi dengan poin-poin, penekanan teks penting, dan tabel.
- **Tombol Salin & Bersihkan**: Memudahkan menyalin jawaban atau mereset percakapan.
- **Panel Pengaturan Fleksibel**: Pengguna dapat melihat status koneksi Railway atau menguji API Key secara lokal via ikon ⚙️ Pengaturan di dalam widget chat.

---

## 💻 Cara Menjalankan Aplikasi

Aplikasi dibangun menggunakan Vite untuk performa cepat dan kemudahan deployment:

1. **Jalankan Mode Pengembangan (Local Dev)**:
   ```bash
   npm run dev
   ```
   Aplikasi akan terbuka otomatis di browser pada `http://localhost:5173`.

2. **Build untuk Produksi (Railway / Production)**:
   ```bash
   npm run build
   ```
   Folder `dist` siap dideploy ke Railway Static / Web Service.

3. **Deploy ke Google Cloud Run**:
   ```bash
   npm run deploy:cloudrun
   ```
   Perintah ini membangun aplikasi dengan mode `cloudrun` (`.env.cloudrun`), lalu men-deploy service `smart-inventory` di region `asia-southeast2` ke project gcloud yang aktif. Pada mode ini, Gemini dipanggil lewat proxy `server.mjs`, sehingga API key tidak ikut tertanam di JavaScript dan fitur AI hanya bisa dipakai petugas yang sudah login.

   Pada deploy pertama, tambahkan environment variable server (deploy berikutnya otomatis memakai nilai yang sama):
   ```bash
   npm run build:cloudrun
   gcloud run deploy smart-inventory --source . --region asia-southeast2 --allow-unauthenticated --max-instances 2 \
     --update-env-vars GEMINI_API_KEY=<gemini_api_key>,FIREBASE_API_KEY=<firebase_web_api_key>
   ```

4. **Jalankan Pengujian** (Node.js 20.11 atau lebih baru, tanpa dependensi tambahan):
   ```bash
   npm test
   ```
   Pengujian mencakup logika murni di `src/inventory-logic.mjs` (validasi usulan AI, konteks AI, escape HTML, markdown, pesan error auth), server proxy `server.mjs` (verifikasi token, pembatasan model, penyaringan field, path traversal), dan kesesuaian `database.rules.json` dengan form pada `index.html`.
