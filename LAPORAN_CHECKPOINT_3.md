# 📋 LAPORAN PROGRESS CHECKPOINT 3 (95%)
## Sistem Inventaris Barang Laboratorium & Kantor (SPA)

> **Catatan:** Ini adalah dokumen historis progres Checkpoint 3 (13 Oktober 2026). Isinya, termasuk platform deployment, repositori, akun demo, dan cuplikan kode, sudah tidak sesuai dengan kondisi terbaru. Kondisi terkini (deployment Google Cloud Run, modul peminjaman & perawatan, verifikasi email, dan akun demo) ada di [`LAPORAN_AKHIR.md`](LAPORAN_AKHIR.md).

- **Mata Kuliah / Proyek**: Tugas Proyek Pengembangan Aplikasi Web (Checkpoint 3)
- **Status Progres**: **95% Selesai** (Fitur Utama CRUD, Autentikasi, Analytics Ruangan, & Integrasi Gemini AI Berfungsi Penuh)
- **Teknologi**: HTML5, Bootstrap 5.3, Firebase Modular SDK v10 (Auth & Realtime Database), Google Gemini 3.8 Flash API, Vite
- **Repositori GitHub**: [https://github.com/tirtana888/sistem-inventaris-lab-kantor](https://github.com/tirtana888/sistem-inventaris-lab-kantor)
- **Deployment Platform**: Railway / Vercel (Production Ready)
- **Akun Demo Pengujian**:
  - Email / Username: `atirtana@student.ciputra.ac.id`
  - Password: `123456`

---


## 🎯 Ringkasan Pencapaian Progres (95%)

Pada Checkpoint 3 ini, sistem telah menyelesaikan seluruh fungsionalitas inti (*core features*) dan fitur penunjang modern:
1. **Autentikasi Petugas Terverifikasi (Firebase Auth)**: Login, Register, Logout, dan proteksi sesi reaktif.
2. **Manajemen Inventaris Realtime (Firebase Realtime Database CRUD)**: Create, Read/Sync realtime multi-user, Update, dan Delete dengan validasi.
3. **Statistik KPI & Dual View Mode**: Metrik kuantitas fisik, persentase kelayakan (Baik vs Perlu Perbaikan), serta tampilan Tabel vs Kartu Sebaran Ruangan (*Location Room Cards*).
4. **Relasi Penempatan Ruangan**: Modal detail mampu mendeteksi dan menampilkan barang lain yang berada di ruangan yang sama.
5. **Asisten AI Inventaris (Google Gemini 3.8 Flash)**: Chatbot interaktif bertenaga AI model terbaru yang terhubung langsung dengan basis data inventaris aktif (*context-aware RAG*) untuk konsultasi stok, laporan kerusakan, dan SOP perawatan.

---

## 💻 Daftar Fungsi yang Selesai & Capture Coding

Berikut adalah dokumentasi fungsi-fungsi teknis yang telah selesai diimplementasikan beserta cuplikan kode sumber aslinya dari `index.html`:

---

### 1. Modul Autentikasi Pengguna (Firebase Auth)

#### A. Fungsi Login Petugas (`signInWithEmailAndPassword`)
Memvalidasi kredensial pengguna dan mengautentikasi petugas ke Firebase Authentication.
```javascript
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthAlert();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showAuthAlert("Harap isi email dan kata sandi.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    formLogin.reset();
    showToast("Login berhasil! Selamat datang.");
  } catch (error) {
    console.error("Login gagal:", error);
    showAuthAlert(mapAuthErrorMessage(error.code));
  }
});
```

#### B. Fungsi Registrasi Petugas Baru (`createUserWithEmailAndPassword`)
Mendaftarkan akun petugas baru dengan validasi password dan konfirmasi password.
```javascript
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

  if (password !== confirm) {
    showAuthAlert("Konfirmasi kata sandi tidak cocok.");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    formRegister.reset();
    showToast("Pendaftaran berhasil! Akun langsung aktif.");
  } catch (error) {
    console.error("Registrasi gagal:", error);
    showAuthAlert(mapAuthErrorMessage(error.code));
  }
});
```

#### C. Pengelolaan Sesi Reaktif (`onAuthStateChanged`)
Mendeteksi perubahan sesi masuk/keluar secara *real-time* dan melakukan pergantian *view* secara instan.
```javascript
if (auth) {
  onAuthStateChanged(auth, (user) => {
    initialLoading.style.opacity = "0";
    setTimeout(() => initialLoading.classList.add("d-none"), 250);

    if (user) {
      currentUser = user;
      authView.classList.add("d-none");
      dashboardView.classList.remove("d-none");
      navUserSection.classList.remove("d-none");
      navUserEmail.textContent = user.email;

      // Mengaktifkan listener sinkronisasi database
      listenToInventoryChanges();
    } else {
      currentUser = null;
      dashboardView.classList.add("d-none");
      navUserSection.classList.add("d-none");
      authView.classList.remove("d-none");
    }
  });
}
```

---

### 2. Modul CRUD & Sinkronisasi Realtime Database

#### A. Sinkronisasi Data Realtime Multi-User (`onValue`)
Mendengarkan setiap penambahan, pengubahan, atau penghapusan data secara *real-time* di simpul database `/inventaris`.
```javascript
function listenToInventoryChanges() {
  if (!db || !isFirebaseConfigured) {
    tableLoading.classList.add("d-none");
    return;
  }

  tableLoading.classList.remove("d-none");
  const inventarisRef = ref(db, "inventaris");

  onValue(inventarisRef, (snapshot) => {
    tableLoading.classList.add("d-none");
    if (snapshot.exists()) {
      inventoryData = snapshot.val();
    } else {
      inventoryData = {};
    }
    renderInventoryTable();
  }, (error) => {
    tableLoading.classList.add("d-none");
    console.error("Gagal mendengarkan database:", error);
    showToast("Gagal memuat data inventaris.", false);
  });
}
```

#### B. Simpan & Perbarui Data Barang (`set()`, `push()`, & `update()`)
Menangani penyimpanan barang baru (`push` + `set`) dan pembaruan barang yang ada (`update`).
```javascript
itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!itemForm.checkValidity()) {
    itemForm.classList.add("was-validated");
    return;
  }

  const key = itemIdInput.value;
  const isEdit = Boolean(key);

  const payload = {
    namaBarang: namaBarangInput.value.trim(),
    kategori: kategoriInput.value,
    jumlah: parseInt(jumlahInput.value, 10) || 1,
    kondisi: kondisiInput.value,
    lokasi: lokasiInput.value.trim(),
    createdBy: currentUser ? currentUser.email : "Anonim",
    updatedAt: new Date().toISOString()
  };

  try {
    if (isEdit) {
      const targetRef = ref(db, `inventaris/${key}`);
      await update(targetRef, payload);
      showToast("Data barang berhasil diperbarui!");
    } else {
      const newRef = push(inventarisRef);
      await set(newRef, payload);
      showToast("Barang baru berhasil ditambahkan!");
    }
    itemModal.hide();
    itemForm.reset();
  } catch (error) {
    console.error("Gagal menyimpan data:", error);
    showToast("Gagal menyimpan data barang.", false);
  }
});
```

#### C. Hapus Data Barang (`remove()`)
Mengeksekusi penghapusan node spesifik setelah konfirmasi petugas di dialog modal.
```javascript
btnConfirmDelete.addEventListener("click", async () => {
  if (!deleteTargetKey) return;

  btnConfirmDelete.disabled = true;
  btnDeleteSpinner.classList.remove("d-none");

  try {
    const targetRef = ref(db, `inventaris/${deleteTargetKey}`);
    await remove(targetRef);
    showToast("Barang berhasil dihapus dari inventaris.");
    deleteModal.hide();
  } catch (error) {
    console.error("Gagal menghapus:", error);
    showToast("Gagal menghapus barang.", false);
  } finally {
    btnConfirmDelete.disabled = false;
    btnDeleteSpinner.classList.add("d-none");
    deleteTargetKey = null;
  }
});
```

---

### 3. Modul Visualisasi, KPI Metrics & Relasi Ruangan

#### A. Perhitungan Statistik & KPI Realtime (`renderInventoryTable`)
Menghitung total item, total unit fisik, rasio kondisi Baik vs Rusak, serta jumlah ruangan unik secara dinamis.
```javascript
function renderInventoryTable() {
  const keys = Object.keys(inventoryData);
  let totalItem = keys.length;
  let totalUnit = 0;
  let countBaik = 0;
  let countPerluPerbaikan = 0;
  const uniqueLocations = new Set();

  keys.forEach((key) => {
    const item = inventoryData[key];
    const qty = parseInt(item.jumlah) || 0;
    totalUnit += qty;
    if (item.kondisi === "Baik") {
      countBaik += qty;
    } else {
      countPerluPerbaikan += qty;
    }
    if (item.lokasi && item.lokasi.trim()) {
      uniqueLocations.add(item.lokasi.trim().toLowerCase());
    }
  });

  // Pembaruan teks widget KPI
  statTotalItem.textContent = totalItem.toLocaleString("id-ID");
  statTotalUnit.textContent = totalUnit.toLocaleString("id-ID");
  statTotalLokasi.textContent = uniqueLocations.size.toLocaleString("id-ID");
  badgeTotalLocations.textContent = uniqueLocations.size;
  statKondisiBaik.textContent = countBaik.toLocaleString("id-ID");
  statPerluPerbaikan.textContent = countPerluPerbaikan.toLocaleString("id-ID");
  ...
}
```

#### B. Visualisasi Sebaran Ruangan (`renderLocationCards`)
Mengelompokkan barang berdasarkan lokasi/ruangan dan menyajikannya dalam kartu interaktif.
```javascript
function renderLocationCards(filteredKeys) {
  locationCardsContainer.innerHTML = "";
  if (filteredKeys.length === 0) return;

  const locationGroups = {};
  filteredKeys.forEach((key) => {
    const item = inventoryData[key];
    const locName = (item.lokasi && item.lokasi.trim()) ? item.lokasi.trim() : "Lokasi Belum Ditentukan";
    if (!locationGroups[locName]) {
      locationGroups[locName] = [];
    }
    locationGroups[locName].push({ key, ...item });
  });

  const locNames = Object.keys(locationGroups).sort();
  locNames.forEach((locName) => {
    const itemsInLoc = locationGroups[locName];
    let locTotalUnit = 0;
    itemsInLoc.forEach(i => { locTotalUnit += (parseInt(i.jumlah) || 0); });
    ...
  });
}
```

#### C. Relasi Penempatan Ruangan pada Detail Modal (`openDetailModal`)
Mendeteksi dan menyajikan barang-barang lain yang berada di ruangan yang sama dengan barang yang dipilih.
```javascript
function openDetailModal(key) {
  const item = inventoryData[key];
  if (!item) return;

  currentDetailKey = key;
  detailNamaBarang.textContent = item.namaBarang || "-";
  detailKategoriBadge.textContent = item.kategori || "-";
  detailKondisiBadge.innerHTML = getKondisiBadge(item.kondisi);
  detailLokasi.textContent = item.lokasi || "-";
  detailJumlah.textContent = `${item.jumlah || 0} Unit`;

  // Deteksi barang lain di ruangan yang sama
  const targetLoc = (item.lokasi || "").trim().toLowerCase();
  const otherItemsInSameLoc = Object.keys(inventoryData)
    .filter(k => k !== key && (inventoryData[k].lokasi || "").trim().toLowerCase() === targetLoc)
    .map(k => inventoryData[k]);

  detailOtherItemsList.innerHTML = "";
  if (otherItemsInSameLoc.length > 0) {
    detailLokasiOtherItemsNote.textContent = `Terdapat ${otherItemsInSameLoc.length} barang/alat lain yang juga berada di ruangan ini.`;
    otherItemsInSameLoc.forEach(other => {
      const div = document.createElement("div");
      div.className = "list-group-item d-flex justify-content-between align-items-center px-0 py-2";
      div.innerHTML = `
        <div>
          <div class="fw-semibold">${escapeHtml(other.namaBarang)}</div>
          <small class="text-muted">${other.kategori} &bull; ${other.jumlah} unit</small>
        </div>
        ${getKondisiBadge(other.kondisi)}
      `;
      detailOtherItemsList.appendChild(div);
    });
  } else {
    detailLokasiOtherItemsNote.textContent = `Hanya barang ini yang terdaftar di lokasi ini.`;
    detailOtherItemsList.innerHTML = `<div class="text-muted fst-italic py-1">Tidak ada barang lain yang tercatat di lokasi ini.</div>`;
  }

  detailModal.show();
}
```

---

### 4. Modul Integrasi Chatbot Asisten Cerdas (Google Gemini 3.8 Flash)

#### A. Ekstraksi Konteks Database Realtime untuk AI (`getInventoryContextSummary`)
Menyiapkan ringkasan data inventaris terkini untuk disuntikkan ke dalam *System Instruction* Gemini.
```javascript
function getInventoryContextSummary() {
  const keys = Object.keys(inventoryData || {});
  if (keys.length === 0) {
    return "Saat ini database inventaris masih kosong atau belum ada item yang terdaftar.";
  }

  let totalUnits = 0;
  let countBaik = 0, countRusakRingan = 0, countRusakBerat = 0;
  const locationsMap = {};
  const itemList = [];

  keys.forEach((k) => {
    const item = inventoryData[k] || {};
    const nama = item.namaBarang || "Tanpa Nama";
    const kat = item.kategori || "Umum";
    const qty = parseInt(item.jumlah, 10) || 0;
    const kon = item.kondisi || "Baik";
    const loc = (item.lokasi && item.lokasi.trim()) ? item.lokasi.trim() : "Lokasi Belum Ditentukan";

    totalUnits += qty;
    if (kon === "Baik") countBaik += qty;
    else if (kon === "Rusak Ringan") countRusakRingan += qty;
    else if (kon === "Rusak Berat") countRusakBerat += qty;

    if (!locationsMap[loc]) locationsMap[loc] = [];
    locationsMap[loc].push(`${nama} (${qty} unit, kondisi: ${kon})`);

    itemList.push(`- [ID: ${k}] ${nama} | Kategori: ${kat} | Jumlah: ${qty} Unit | Kondisi: ${kon} | Lokasi: ${loc} | Petugas: ${item.createdBy || '-'}`);
  });

  let locSummary = "";
  for (const [locName, items] of Object.entries(locationsMap)) {
    locSummary += `• Ruangan/Lokasi "${locName}": ${items.join("; ")}\n`;
  }

  return `RINGKASAN STATISTIK:
- Total Jenis Barang: ${keys.length} item
- Total Unit Fisik: ${totalUnits} unit
- Kondisi Baik: ${countBaik} unit
- Kondisi Rusak Ringan: ${countRusakRingan} unit
- Kondisi Rusak Berat: ${countRusakBerat} unit

SEBARAN BARANG PER RUANGAN:
${locSummary}
DAFTAR LENGKAP SEMUA BARANG:
${itemList.join("\n")}`;
}
```

#### B. Pemanggilan Endpoint Gemini API dengan Rantai Auto-Fallback (`requestGeminiAPI`)
Memanggil REST API Google Gemini model `gemini-3.8-flash` dan menyediakan fallback bertingkat otomatis.
```javascript
async function requestGeminiAPI(conversationHistory, modelToUse, apiKey) {
  const inventoryContext = getInventoryContextSummary();
  const systemInstruction = {
    parts: [
      {
        text: `Anda adalah "Asisten AI Inventaris Cerdas" untuk Sistem Inventaris Barang Laboratorium & Kantor.
Tugas utama Anda:
1. Menjawab pertanyaan pengguna seputar ketersediaan stok, jumlah unit, sebaran lokasi ruangan, dan kondisi barang berdasarkan DATA INVENTARIS REALTIME.
2. Memberikan rekomendasi jadwal pemeliharaan alat, SOP operasional, serta usulan perbaikan.
3. Gunakan Bahasa Indonesia yang ramah, profesional, dan format Markdown rapi.

=== DATA INVENTARIS REALTIME SAAT INI ===
${inventoryContext}
=========================================`
      }
    ]
  };

  const payload = {
    system_instruction: systemInstruction,
    contents: conversationHistory,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };

  // Rantai fallback model dimulai dari model terbaru
  const candidateModels = [
    modelToUse,
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;

  for (const m of candidateModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${response.status}`;
        if (response.status === 404 || errMsg.toLowerCase().includes("not found")) {
          lastError = new Error(errMsg);
          continue; // Coba model berikutnya jika 404
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return { replyText, activeModel: m };
    } catch (err) {
      lastError = err;
      if (err.message && (err.message.includes("404") || err.message.toLowerCase().includes("not found"))) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Gagal terhubung ke layanan Gemini API.");
}
```

---

## 🚀 Status Repositori & Deployment GitHub

- **Branch Utama**: `main`
- **Komit Terakhir**:
  - `feat: integrate Google Gemini 3.8 Flash AI chat assistant with live inventory context`
  - `Merge pull request #1 from tirtana888/feature/gemini-ai-chat`
- **Railway Deployment**: Otomatis mentrigger build dan deploy setiap kali ada perubahan pada branch `main`.
- **Environment Variables (Kredensial Disamarkan / Blur untuk Keamanan)**:
  - `VITE_FIREBASE_API_KEY`: `AIzaSy***********************************`
  - `VITE_FIREBASE_AUTH_DOMAIN`: `inventaris-***.firebaseapp.com`
  - `VITE_FIREBASE_DATABASE_URL`: `https://inventaris-***-default-rtdb.asia-southeast1.firebasedatabase.app`
  - `VITE_FIREBASE_PROJECT_ID`: `inventaris-***`
  - `VITE_FIREBASE_STORAGE_BUCKET`: `inventaris-***.firebasestorage.app`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`: `1075*********`
  - `VITE_FIREBASE_APP_ID`: `1:1075*********:web:********************`
  - `VITE_GEMINI_API_KEY`: `AIzaSy***********************************`
  - `VITE_GEMINI_MODEL`: `gemini-3.8-flash`


---
*Laporan dibuat secara sistematis untuk pemenuhan Checkpoint 3 Pengembangan Aplikasi Web Inventaris Lab & Kantor.*
