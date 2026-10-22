# 📋 LAPORAN AKHIR PROYEK
## Sistem Inventaris Barang Laboratorium & Kantor (SPA)

- **Mata Kuliah / Proyek**: Cloud Computing
- **Status**: Seluruh requirement wajib terpenuhi dan sudah berjalan di produksi, ditambah layanan cloud di luar Firebase
- **Teknologi**: HTML5, Bootstrap 5.3, Firebase Modular SDK v10 (Authentication & Realtime Database), Vite 5, Node.js 22, Google Cloud Run, Google Gemini API
- **Aplikasi (Live)**: [https://smart-inventory-rxwyj62gha-et.a.run.app](https://smart-inventory-rxwyj62gha-et.a.run.app)
- **Repositori GitHub**: [https://github.com/tomybudiman/smart-inventory](https://github.com/tomybudiman/smart-inventory)
- **Akun Demo Pengujian**:
  - Email / Username: `hello@tomybudi.dev`
  - Password: `test12345678`
  - Email akun ini sudah diverifikasi, sehingga dapat langsung masuk ke dashboard.

> Laporan ini melanjutkan `LAPORAN_CHECKPOINT_3.md` (progres 95%) dan menggambarkan kondisi aplikasi per 22 Oktober 2026.

---

## ✅ Pemenuhan Requirement

| No | Requirement | Status | Implementasi |
|---|---|---|---|
| 1 | Total 12 fungsi CRUD yang terhubung ke Firebase Realtime Database | ✅ Terpenuhi | 3 modul (`/inventaris`, `/peminjaman`, `/perawatan`) × Create, Read, Update, Delete = **12 fungsi**, ditambah 2 operasi tambahan |
| 2 | Register & login menggunakan Firebase Authentication | ✅ Terpenuhi | `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `signOut`, `onAuthStateChanged` |
| 3 | Webmailer Firebase: email verifikasi dikirim setelah register | ✅ Terpenuhi | `sendEmailVerification`; akun yang belum terverifikasi tidak bisa masuk dashboard, membaca/menulis data, maupun memakai asisten AI |
| ➕ | Layanan cloud lain (poin tambahan) | ✅ Ada | Google Cloud Run, Cloud Build, Artifact Registry, Google Gemini API, Cloud Logging |

### Perubahan Sejak Checkpoint 3

1. **Modul Peminjaman Barang** (`/peminjaman`): CRUD lengkap, validasi stok tersedia, status *Terlambat* otomatis, dan tombol cepat *Tandai Dikembalikan*.
2. **Modul Perawatan Barang** (`/perawatan`): CRUD lengkap untuk servis rutin, perbaikan, dan kalibrasi beserta biaya dan status.
3. **Hapus berantai**: menghapus barang ikut menghapus catatan peminjaman & perawatannya dalam satu operasi atomik.
4. **Verifikasi email** setelah register, ditegakkan di aplikasi, Security Rules, dan server proxy.
5. **Deployment pindah dari Railway ke Google Cloud Run**, dengan server proxy agar Gemini API key tidak lagi tertanam di JavaScript browser.
6. **Asisten AI membaca data peminjaman & perawatan**: dapat menjawab barang yang sedang dipinjam, unit tersedia, keterlambatan, dan riwayat perawatan.
7. **Asisten AI dapat melakukan CRUD lewat kartu konfirmasi**: tambah/ubah/hapus barang dan catat/ubah/hapus peminjaman & perawatan, dengan validasi yang sama seperti form dan pemeriksaan ulang terhadap data terbaru tepat sebelum disimpan.
8. **Asisten AI memakai fungsi baca** (`cariBarang`, `cariPeminjaman`, `cariPerawatan`, `rekapInventaris`): angka, rekap, dan filter dihitung oleh aplikasi pada data realtime lalu dikirim kembali ke Gemini, sehingga jawaban lebih akurat dan tetap ringkas saat data bertambah.
9. **Asisten AI dibatasi untuk urusan inventaris**: instruksi (termasuk batasan topik), daftar fungsi, dan batas jawaban disusun oleh server sehingga tidak dapat diubah dari browser; pertanyaan di luar topik (misalnya coding) ditolak, dan request yang terlalu besar atau berisi gambar/file ditolak server.
10. **Kode dipecah per fitur**: `index.html` kini hanya berisi markup; CSS ada di `src/styles/` dan JavaScript di modul ES `src/app/` (auth, inventaris, peminjaman, perawatan, asisten AI), digabungkan kembali oleh Vite saat build.
11. **Security Rules dengan validasi skema** untuk ketiga node, dan **121 pengujian otomatis** (`npm test`).

---

## 1️⃣ Requirement 1: 12 Fungsi CRUD (Firebase Realtime Database)

### Daftar Fungsi

| Operasi | Inventaris (`/inventaris`) | Peminjaman (`/peminjaman`) | Perawatan (`/perawatan`) |
|---|---|---|---|
| **Create** | `createBarang()` · `push()` + `set()` | `createPeminjaman()` · `push()` + `set()` | `createPerawatan()` · `push()` + `set()` |
| **Read** | `listenToInventoryChanges()` · `onValue()` | `listenToPeminjamanChanges()` · `onValue()` | `listenToPerawatanChanges()` · `onValue()` |
| **Update** | `updateBarang()` · `update()` | `updatePeminjaman()` · `update()` | `updatePerawatan()` · `update()` |
| **Delete** | `deleteBarang()` · multi-path `update()` | `deletePeminjaman()` · `remove()` | `deletePerawatan()` · `remove()` |

Operasi tambahan di luar 12 fungsi di atas:
- **CRUD via Asisten AI**: Gemini dapat mengusulkan tambah, ubah, dan hapus barang serta catat, ubah, dan hapus peminjaman dan perawatan (*function calling*). Setiap usulan tampil sebagai kartu konfirmasi dan dijalankan dengan fungsi CRUD yang sama seperti tabel di atas; data baru berubah setelah petugas menekan tombol konfirmasi.
- **Update cepat** `kembalikanPeminjaman()`: menandai peminjaman sebagai *Dikembalikan* langsung dari tabel.

Fungsi CRUD berada di modul `src/app/inventaris.js`, `src/app/peminjaman.js`, dan `src/app/perawatan.js`; logika validasi murni dipisahkan ke `src/inventory-logic.mjs` agar dapat diuji.

### Skema Data

| Node | Field |
|---|---|
| `/inventaris/{id}` | `namaBarang`, `kategori` (Elektronik / ATK / Perabot / Hardware Jaringan), `jumlah` (≥ 1), `kondisi` (Baik / Rusak Ringan / Rusak Berat), `lokasi`, `createdBy`, `updatedAt` |
| `/peminjaman/{id}` | `barangId` (key di `/inventaris`), `peminjam`, `jumlah` (≥ 1), `tanggalPinjam`, `tanggalKembali` (YYYY-MM-DD), `status` (Dipinjam / Dikembalikan), `createdBy`, `updatedAt` |
| `/perawatan/{id}` | `barangId`, `jenis` (Servis Rutin / Perbaikan / Kalibrasi), `deskripsi`, `tanggal` (YYYY-MM-DD), `biaya` (Rupiah, ≥ 0), `status` (Dijadwalkan / Dalam Proses / Selesai), `createdBy`, `updatedAt` |

### A. Modul Inventaris Barang (`src/app/inventaris.js`)

```javascript
// [READ / SYNC] Realtime listener via onValue()
export function listenToInventoryChanges() {
  stopListeningToInventory();
  tableLoading.classList.remove("d-none");
  emptyState.classList.add("d-none");

  unsubscribeInventory = onValue(inventarisRef, (snapshot) => {
    tableLoading.classList.add("d-none");
    const val = snapshot.val();
    state.inventoryData = val || {};
    renderInventoryTable();
    // Nama & stok barang juga dipakai tab peminjaman dan perawatan
    notifyDataChange();
  }, (error) => {
    tableLoading.classList.add("d-none");
    if (!state.currentUser) return; // sesi sudah berakhir (mis. setelah logout): abaikan error permission
    console.error("Database onValue error:", error);
    showToast("Gagal memuat data dari database. Periksa Realtime Database Security Rules!", false);
  });
}

// [CREATE] Tambah barang baru (push + set)
async function createBarang(payload) {
  await set(push(inventarisRef), payload);
}

// [UPDATE] Perbarui data barang
export async function updateBarang(key, payload) {
  await update(ref(db, `inventaris/${key}`), payload);
}

// [DELETE] Hapus barang beserta catatan peminjaman & perawatannya dalam satu multi-path update
export async function deleteBarang(key) {
  await update(ref(db), buildHapusBarangUpdates(key, state.peminjamanData, state.perawatanData));
}
```

Path yang dihapus disusun oleh fungsi murni berikut (`src/inventory-logic.mjs`):

```javascript
// Path multi-path update untuk menghapus barang beserta seluruh catatan terkait.
// Nilai null berarti hapus, sehingga semuanya terhapus sekaligus atau tidak sama sekali.
export function buildHapusBarangUpdates(barangId, peminjamanData, perawatanData) {
  const updates = { [`inventaris/${barangId}`]: null };
  for (const key of findRecordKeysByBarang(peminjamanData, barangId)) updates[`peminjaman/${key}`] = null;
  for (const key of findRecordKeysByBarang(perawatanData, barangId)) updates[`perawatan/${key}`] = null;
  return updates;
}
```

### B. Modul Peminjaman Barang (`src/app/peminjaman.js`)

```javascript
// [READ / SYNC] Realtime listener via onValue()
export function listenToPeminjamanChanges() {
  stopListeningToPeminjaman();
  peminjamanLoading.classList.remove("d-none");
  peminjamanEmptyState.classList.add("d-none");

  unsubscribePeminjaman = onValue(peminjamanRef, (snapshot) => {
    peminjamanLoading.classList.add("d-none");
    state.peminjamanData = snapshot.val() || {};
    renderPeminjamanTable();
    refreshPeminjamanBarangOptions(); // unit tersedia ikut berubah
  }, (error) => {
    peminjamanLoading.classList.add("d-none");
    if (!state.currentUser) return; // sesi sudah berakhir: abaikan error permission
    console.error("Database onValue error (peminjaman):", error);
    showToast("Gagal memuat data peminjaman. Periksa Realtime Database Security Rules!", false);
  });
}

// [CREATE] Catat peminjaman baru (push + set)
export async function createPeminjaman(payload) {
  await set(push(peminjamanRef), payload);
}

// [UPDATE] Perbarui data peminjaman dari form edit
export async function updatePeminjaman(key, payload) {
  await update(ref(db, `peminjaman/${key}`), payload);
}

// [UPDATE] Tandai barang sudah dikembalikan (aksi cepat dari tabel)
async function kembalikanPeminjaman(key) {
  await update(ref(db, `peminjaman/${key}`), {
    status: "Dikembalikan",
    updatedAt: new Date().toISOString()
  });
}

// [DELETE] Hapus catatan peminjaman
export async function deletePeminjaman(key) {
  await remove(ref(db, `peminjaman/${key}`));
}
```

Sebelum disimpan, form peminjaman divalidasi agar jumlah tidak melebihi unit yang masih tersedia:

```javascript
// Validasi form peminjaman yang tidak tertangani atribut HTML (required, min).
// Mengembalikan daftar pesan error; daftar kosong berarti valid.
export function validatePeminjaman(data, inventoryData, peminjamanData, editKey = null) {
  const errors = [];
  const barang = inventoryData?.[data.barangId];
  if (!barang) errors.push("Barang tidak ditemukan di inventaris.");
  if (!data.peminjam) errors.push("Nama peminjam wajib diisi.");
  if (!Number.isInteger(data.jumlah) || data.jumlah < 1) errors.push("Jumlah minimal 1 unit.");
  if (data.tanggalKembali < data.tanggalPinjam) errors.push("Batas kembali tidak boleh sebelum tanggal pinjam.");
  if (barang && data.status === "Dipinjam") {
    const tersedia = (parseInt(barang.jumlah, 10) || 0) - hitungUnitDipinjam(peminjamanData, data.barangId, editKey);
    if (data.jumlah > tersedia) errors.push(`Jumlah melebihi unit yang tersedia (${Math.max(tersedia, 0)} unit).`);
  }
  return errors;
}
```

### C. Modul Perawatan Barang (`src/app/perawatan.js`)

```javascript
// [READ / SYNC] Realtime listener via onValue()
export function listenToPerawatanChanges() {
  stopListeningToPerawatan();
  perawatanLoading.classList.remove("d-none");
  perawatanEmptyState.classList.add("d-none");

  unsubscribePerawatan = onValue(perawatanRef, (snapshot) => {
    perawatanLoading.classList.add("d-none");
    state.perawatanData = snapshot.val() || {};
    renderPerawatanTable();
  }, (error) => {
    perawatanLoading.classList.add("d-none");
    if (!state.currentUser) return; // sesi sudah berakhir: abaikan error permission
    console.error("Database onValue error (perawatan):", error);
    showToast("Gagal memuat data perawatan. Periksa Realtime Database Security Rules!", false);
  });
}

// [CREATE] Catat perawatan baru (push + set)
export async function createPerawatan(payload) {
  await set(push(perawatanRef), payload);
}

// [UPDATE] Perbarui data perawatan
export async function updatePerawatan(key, payload) {
  await update(ref(db, `perawatan/${key}`), payload);
}

// [DELETE] Hapus catatan perawatan
export async function deletePerawatan(key) {
  await remove(ref(db, `perawatan/${key}`));
}
```

### D. Security Rules (`database.rules.json`)

Setiap node hanya dapat dibaca/ditulis oleh pengguna yang login **dan** emailnya sudah terverifikasi. Setiap field divalidasi, field di luar skema ditolak, dan `barangId` wajib merujuk ke barang yang benar-benar ada. Contoh untuk node `/peminjaman`:

```json
"peminjaman": {
  ".read": "auth != null && auth.token.email_verified == true",
  ".write": "auth != null && auth.token.email_verified == true",
  "$peminjamanId": {
    ".validate": "newData.hasChildren(['barangId', 'peminjam', 'jumlah', 'tanggalPinjam', 'tanggalKembali', 'status', 'createdBy', 'updatedAt'])",
    "barangId": {
      ".validate": "newData.isString() && newData.val().length > 0 && !newData.val().contains('/') && root.child('inventaris/' + newData.val()).exists()"
    },
    "peminjam": {
      ".validate": "newData.isString() && newData.val().length > 0"
    },
    "jumlah": {
      ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() % 1 == 0"
    },
    "tanggalPinjam": {
      ".validate": "newData.isString() && newData.val().matches(/^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/)"
    },
    "tanggalKembali": {
      ".validate": "newData.isString() && newData.val().matches(/^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/)"
    },
    "status": {
      ".validate": "newData.isString() && (newData.val() == 'Dipinjam' || newData.val() == 'Dikembalikan')"
    },
    "createdBy": {
      ".validate": "newData.isString() && newData.val().length > 0"
    },
    "updatedAt": {
      ".validate": "newData.isString() && newData.val().length > 0"
    },
    "$other": {
      ".validate": false
    }
  }
}
```

---

## 2️⃣ Requirement 2: Register & Login (Firebase Authentication)

Seluruh alur autentikasi berada di `src/app/auth.js`.

### A. Login Petugas (`signInWithEmailAndPassword`)

```javascript
// Handler Login
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthAlert();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showAuthAlert("Harap isi email dan kata sandi.");
    return;
  }

  btnLoginSubmit.disabled = true;
  btnLoginSubmit.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Memproses...`;

  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    formLogin.reset();
    // Akun yang belum terverifikasi diarahkan ke halaman verifikasi oleh onAuthStateChanged
    if (user.emailVerified) showToast("Login berhasil! Selamat datang.");
  } catch (error) {
    console.error("Login Error:", error);
    showAuthAlert(mapAuthErrorMessage(error.code || error.message));
  } finally {
    btnLoginSubmit.disabled = false;
    btnLoginSubmit.innerHTML = `<span>Masuk Sekarang</span><i class="bi bi-arrow-right"></i>`;
  }
});
```

### B. Registrasi Petugas Baru (`createUserWithEmailAndPassword`)

Setelah akun dibuat, email verifikasi langsung dikirim (lihat Requirement 3).

```javascript
// Handler Register
formRegister.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthAlert();

  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirm = document.getElementById("regPasswordConfirm").value;

  if (!email || !password || !confirm) {
    showAuthAlert("Semua kolom registrasi wajib diisi.");
    return;
  }

  if (password.length < 6) {
    showAuthAlert("Kata sandi minimal harus 6 karakter.");
    return;
  }

  if (password !== confirm) {
    showAuthAlert("Konfirmasi kata sandi tidak cocok.");
    return;
  }

  btnRegisterSubmit.disabled = true;
  btnRegisterSubmit.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Mendaftarkan...`;

  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    formRegister.reset();
    try {
      // Firebase mengirim email berisi tautan verifikasi ke alamat yang didaftarkan
      await sendEmailVerification(user);
      startResendCooldown();
      showToast("Pendaftaran berhasil! Tautan verifikasi telah dikirim ke email Anda.");
    } catch (error) {
      // Akun sudah dibuat; email bisa dikirim ulang dari halaman verifikasi
      console.error("Gagal mengirim email verifikasi:", error);
      showVerifyAlert("Akun berhasil dibuat, tetapi email verifikasi gagal dikirim. Silakan klik Kirim Ulang.", "warning");
    }
  } catch (error) {
    console.error("Register Error:", error);
    showAuthAlert(mapAuthErrorMessage(error.code || error.message));
  } finally {
    btnRegisterSubmit.disabled = false;
    btnRegisterSubmit.innerHTML = `<span>Daftarkan Akun</span><i class="bi bi-check2-circle"></i>`;
  }
});
```

### C. Pengelolaan Sesi Reaktif (`onAuthStateChanged`)

Dashboard hanya ditampilkan untuk akun yang emailnya sudah terverifikasi. Akun yang belum terverifikasi diarahkan ke halaman *Verifikasi Email Anda*.

```javascript
onAuthStateChanged(auth, (user) => {
  // Hilangkan initial splash loader
  initialLoading.style.opacity = "0";
  setTimeout(() => initialLoading.classList.add("d-none"), 250);

  if (user && user.emailVerified) {
    // --- USER SUDAH LOGIN & EMAIL TERVERIFIKASI ---
    state.currentUser = user;
    authView.classList.add("d-none");
    verifyView.classList.add("d-none");
    dashboardView.classList.remove("d-none");
    navUserSection.classList.remove("d-none");
    navUserEmail.textContent = user.email;

    // Aktifkan Realtime Database Listener (inventaris, peminjaman, perawatan)
    hooks.startSync();
  } else {
    // --- GUEST, atau LOGIN tetapi email belum diverifikasi (belum boleh mengakses data) ---
    state.currentUser = null;
    state.inventoryData = {};
    state.peminjamanData = {};
    state.perawatanData = {};
    hooks.stopSync();
    hooks.resetChat(); // riwayat chat AI tidak boleh terbawa ke akun lain
    dashboardView.classList.add("d-none");
    navUserSection.classList.add("d-none");

    if (user) {
      authView.classList.add("d-none");
      verifyView.classList.remove("d-none");
      verifyEmailAddress.textContent = user.email;
    } else {
      verifyView.classList.add("d-none");
      authView.classList.remove("d-none");
      showVerifyAlert(""); // pesan verifikasi akun sebelumnya tidak boleh terbawa
    }

    if (!isFirebaseConfigured) {
      showAuthAlert("Konfigurasi Firebase belum diisi. Isi VITE_FIREBASE_* di file .env.local sesuai .env.example.");
    }
  }
});
```

---

## 3️⃣ Requirement 3: Email Verifikasi Setelah Register (Firebase)

### Alur

1. Pengguna mendaftar → aplikasi memanggil `sendEmailVerification(user)`. Firebase mengirim email berisi tautan verifikasi dari `noreply@<project-id>.firebaseapp.com`, dalam Bahasa Indonesia (`auth.languageCode = "id"`).
2. Pengguna diarahkan ke halaman **Verifikasi Email Anda** yang berisi tombol *Saya Sudah Verifikasi*, *Kirim Ulang Email Verifikasi* (jeda 60 detik untuk menghindari batas pengiriman Firebase), dan *Keluar*.
3. Pengguna mengklik tautan di email. Saat kembali ke tab aplikasi, status verifikasi dicek otomatis (atau lewat tombol *Saya Sudah Verifikasi*).
4. Setelah terverifikasi, ID token diperbarui agar klaim `email_verified` ikut berubah, lalu pengguna masuk ke dashboard.

Verifikasi ditegakkan di **tiga lapis**: tampilan aplikasi, Security Rules (`auth.token.email_verified == true`), dan server proxy Gemini (menolak dengan HTTP 403).

### A. Cek Ulang Status Verifikasi

```javascript
// Cek ulang status verifikasi. Token diperbarui agar klaim email_verified yang dibaca
// Security Rules & proxy Gemini ikut berubah, lalu halaman dimuat ulang supaya koneksi
// Realtime Database dimulai dengan token baru tersebut.
async function checkEmailVerified({ silent = false } = {}) {
  const user = auth.currentUser;
  if (!user || user.emailVerified) return;

  btnCheckVerified.disabled = true;
  try {
    await reload(user);
    if (user.emailVerified) {
      await user.getIdToken(true);
      window.location.reload();
      return;
    }
    if (!silent) showVerifyAlert("Email belum terverifikasi. Klik tautan di email Anda terlebih dahulu.", "warning");
  } catch (error) {
    console.error("Gagal memeriksa status verifikasi:", error);
    if (!silent) showVerifyAlert(mapAuthErrorMessage(error.code || error.message));
  } finally {
    btnCheckVerified.disabled = false;
  }
}
```

### B. Kirim Ulang Email Verifikasi

```javascript
btnResendVerification.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  btnResendVerification.disabled = true;
  try {
    await sendEmailVerification(user);
    showVerifyAlert(`Email verifikasi telah dikirim ulang ke ${user.email}.`, "success");
    startResendCooldown();
  } catch (error) {
    console.error("Gagal mengirim ulang email verifikasi:", error);
    showVerifyAlert(mapAuthErrorMessage(error.code || error.message));
    btnResendVerification.disabled = false;
  }
});
```

### C. Penegakan di Server Proxy (`server.mjs`)

```javascript
// Verifikasi Firebase ID token lewat Identity Toolkit (token ditolak jika palsu atau kedaluwarsa).
// Mengembalikan data akun, atau null jika token tidak valid.
async function lookupFirebaseUser(idToken) {
  const response = await fetch(
    `${IDENTITY_TOOLKIT_URL}?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.users?.[0] || null;
}

// Di dalam handleGemini():
const idToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
const user = idToken ? await lookupFirebaseUser(idToken) : null;
if (!user) return sendError(res, 401, "Sesi login tidak valid. Silakan login ulang.");
// Sama dengan Security Rules: hanya akun yang emailnya sudah diverifikasi
if (!user.emailVerified) return sendError(res, 403, "Email belum diverifikasi. Silakan verifikasi email Anda terlebih dahulu.");
```

---

## ☁️ Layanan Cloud Tambahan (Poin Tambahan)

| Layanan | Peran dalam Aplikasi |
|---|---|
| **Google Cloud Run** | Menjalankan `server.mjs` (Node.js 22) sebagai container: menyajikan aplikasi SPA dan menjadi proxy aman ke Gemini API. Region `asia-southeast2` (Jakarta), 1 vCPU, 512 MiB, maksimal 2 instance, akses publik lewat HTTPS. |
| **Google Cloud Build** | Membangun image container dari `Dockerfile` (`node:22-alpine`) setiap kali `gcloud run deploy --source .` dijalankan. |
| **Artifact Registry** | Menyimpan image container hasil build (repositori `cloud-run-source-deploy`, region `asia-southeast2`). |
| **Google Gemini API** | Asisten AI inventaris (`gemini-3.8-flash` dengan fallback otomatis) yang membaca data inventaris, peminjaman, dan perawatan secara realtime, menjawab pertanyaan berisi angka lewat fungsi baca yang dijalankan aplikasi, serta dapat mengusulkan tambah, ubah, dan hapus data (barang, peminjaman, perawatan) lewat kartu konfirmasi. |
| **Cloud Logging** | Menampung log server Cloud Run untuk memantau error setelah deploy. |

### Arsitektur

```
                         ┌──────────────────────────────────────────────┐
                         │  Browser: SPA (HTML + Bootstrap + Firebase)  │
                         └──────┬───────────────────────────┬───────────┘
        halaman, aset &         │                           │  Firebase SDK (langsung)
        /api/gemini/* (HTTPS)   │                           │
                                ▼                           ▼
       ┌────────────────────────────────────┐   ┌─────────────────────────────────────┐
       │ Google Cloud Run (asia-southeast2) │   │ Firebase Authentication             │
       │ server.mjs                         │   │  └ email verifikasi (webmailer)     │
       │  • sajikan dist/                   │   │ Firebase Realtime Database          │
       │  • cek ID token + email terverif.  │   │  (asia-southeast1)                  │
       │  • batasi model & panjang jawaban  │   │  /inventaris /peminjaman /perawatan │
       └───────────────┬────────────────────┘   │  └ Security Rules + validasi skema  │
                       │ GEMINI_API_KEY          └─────────────────────────────────────┘
                       ▼   (hanya di server)
       ┌────────────────────────────────────┐
       │ Google Gemini API                  │
       └────────────────────────────────────┘
```

### Alur Deployment

```bash
npm run deploy:cloudrun
```

1. `vite build --mode cloudrun` membangun folder `dist/`. Konfigurasi Firebase dibaca dari `.env.local`; `.env.cloudrun` mengosongkan Gemini API key dan mengarahkan chat ke proxy `/api/gemini`.
2. `gcloud run deploy --source .` mengunggah `Dockerfile`, `server.mjs`, dan `dist/` (diatur `.gcloudignore`, file `.env` tidak ikut terunggah).
3. **Cloud Build** membangun image → disimpan di **Artifact Registry** → **Cloud Run** membuat revisi baru dan mengalihkan 100% traffic ke revisi tersebut.
4. Security Rules di-deploy terpisah ke Firebase dari `database.rules.json`.

### Keamanan

- **Gemini API key hanya ada di server** (environment variable Cloud Run), tidak tertanam di JavaScript yang diunduh browser.
- **Proxy Gemini** memverifikasi Firebase ID token lewat Identity Toolkit, menolak akun yang emailnya belum diverifikasi (403), hanya mengizinkan model dari daftar, membatasi panjang jawaban (2048 token) dan ukuran request (2 MB), serta hanya meneruskan field yang dipakai aplikasi.
- **Security Rules** mewajibkan login dengan email terverifikasi dan memvalidasi setiap field.
- **Asisten AI hanya untuk urusan inventaris**: instruksi sistem berisi batasan topik dan jawaban penolakan baku untuk permintaan lain (misalnya menulis kode). Instruksi, daftar fungsi, dan batas jawaban disusun server dari `src/ai-config.mjs`, jadi tidak dapat diganti walaupun proxy dipanggil langsung; data dari database disisipkan sebagai data dalam blok `<data>`, bukan sebagai instruksi.
- **Batas ukuran request di server**: pesan petugas maksimal 1.000 karakter, riwayat maksimal 40 entri, total percakapan dan ringkasan data dibatasi, serta hanya teks dan pemanggilan fungsi yang diizinkan (gambar/file ditolak).
- **Aksi asisten AI tidak pernah langsung menulis data**: Gemini hanya mengusulkan; aplikasi memvalidasi usulan, menampilkannya sebagai kartu konfirmasi, memeriksanya ulang dengan data terbaru, lalu menyimpannya dengan akun petugas sehingga Security Rules tetap berlaku.
- **Pencegahan XSS**: semua data dari database dan jawaban AI di-*escape* sebelum ditampilkan.

---

## 🧪 Pengujian

`npm test` menjalankan **121 pengujian otomatis** (Node.js test runner, tanpa dependensi tambahan):

- **`tests/inventory-logic.test.mjs`**: validasi usulan AI, validasi peminjaman & perawatan (stok tersedia, tanggal, biaya), status terlambat, hapus berantai, konteks AI (inventaris, peminjaman, perawatan), escape HTML, markdown, dan pesan error auth.
- **`tests/ai-config.test.mjs`**: konfigurasi asisten AI (pilihan sama dengan form, setiap fungsi yang dideklarasikan benar-benar ditangani, batasan topik pada instruksi, data tidak dapat keluar dari blok `<data>`, validasi ukuran & jenis isi request).
- **`tests/ai-queries.test.mjs`**: fungsi baca asisten AI (filter, total unit & biaya, unit tersedia, hari keterlambatan, rekap per kategori/kondisi/lokasi) dan ringkasan data untuk Gemini saat data besar.
- **`tests/ai-actions.test.mjs`**: penyusunan & validasi usulan aksi asisten AI (ubah/hapus barang, catat/ubah/hapus peminjaman & perawatan, ID tidak dikenal, stok, format tanggal).
- **`tests/rules.test.mjs`**: kesesuaian `database.rules.json` dengan form (pilihan kategori/kondisi/status/jenis, field wajib, syarat email terverifikasi); markup form dibaca dari `index.html` dan payload dari modul `src/app/`.
- **`tests/server.test.mjs`**: server proxy sebagai proses sungguhan dengan layanan Google tiruan (token tidak valid → 401, email belum diverifikasi → 403, instruksi/fungsi/konfigurasi kiriman browser diabaikan, request terlalu besar atau berisi gambar/fungsi liar → 400, pembatasan model, penyaringan field, path traversal).

Selama pengembangan, Security Rules dan alur aplikasi juga diuji di **Firebase Emulator Suite** (Authentication + Realtime Database) dengan skenario end-to-end di Chrome: register → email verifikasi → dashboard, CRUD di ketiga modul, validasi stok, status terlambat, hapus berantai, CRUD lewat kartu konfirmasi asisten AI, fungsi baca bertahap (model meminta data → aplikasi menjawab → model menjawab petugas, dibatasi 5 langkah) dengan respons Gemini disimulasikan, serta tampilan ponsel. Skrip uji emulator ini dijalankan terpisah dan tidak disertakan di repositori.

Pengiriman email verifikasi juga sudah dicoba langsung di aplikasi produksi: email diterima, tautan verifikasi berfungsi, dan akun dapat masuk ke dashboard setelahnya.

---

## 🚀 Status Repositori & Deployment

- **Branch Utama**: `master`
- **Komit Terakhir**:
  - `778dfba feat: Add AI actions and queries for inventory, loans, and maintenance management with validation, testing, and comprehensive logic`
  - `af8dbe5 feat: Implement Firebase authentication for user login, registration, email verification, and logout; add AI-powered "Gemini Chat" widget.`
  - `339e5fc feat: Enhance AI assistant to summarize real-time loan and maintenance data, update logic, UI prompts, tests, and documentation`
  - `958e3aa chore: Add final project report and update environment configuration guidelines for local and cloud deployment`
- **Cloud Run**: service `smart-inventory`, region `asia-southeast2`, revisi aktif `smart-inventory-00006-vrp` (100% traffic)
- **Environment Variables (Kredensial Disamarkan untuk Keamanan)**:
  - Server Cloud Run: `GEMINI_API_KEY`: `AIzaSy***********************************`, `FIREBASE_API_KEY`: `AIzaSy***********************************`
  - Build (`.env.local`): `VITE_FIREBASE_API_KEY`: `AIzaSy***********************************`, `VITE_FIREBASE_PROJECT_ID`: `alpha-bravo-*****`, `VITE_FIREBASE_DATABASE_URL`: `https://alpha-bravo-*****-default-rtdb.asia-southeast1.firebasedatabase.app`, `VITE_GEMINI_MODEL`: `gemini-3.8-flash`
  - Build (`.env.cloudrun`): `VITE_GEMINI_API_KEY`: *(sengaja dikosongkan)*, `VITE_GEMINI_PROXY_URL`: `/api/gemini`

---
*Laporan akhir mata kuliah Cloud Computing: Sistem Inventaris Barang Lab & Kantor.*
