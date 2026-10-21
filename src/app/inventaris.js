// Modul Inventaris Barang (node /inventaris): CRUD, tabel, sebaran lokasi, dan modal detail.
import { db, ref, push, set, update, onValue } from "./firebase.js";
import { buildHapusBarangUpdates, escapeHtml, findRecordKeysByBarang } from "../inventory-logic.mjs";
import { state } from "./state.js";
import { formatDate, getKondisiBadge, openDeleteModal, showToast } from "./ui.js";

let unsubscribeInventory = null; // fungsi pelepas listener onValue (null jika belum berlangganan)

const itemModalElement = document.getElementById("itemModal");
const itemModal = new bootstrap.Modal(itemModalElement);

// Dashboard & Table Elements
const tableBody = document.getElementById("inventoryTableBody");
const tableLoading = document.getElementById("tableLoading");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const filterKategori = document.getElementById("filterKategori");
const filterKondisi = document.getElementById("filterKondisi");
const recordCountLabel = document.getElementById("recordCountLabel");

// KPI Counters
const statTotalItem = document.getElementById("statTotalItem");
const statTotalUnit = document.getElementById("statTotalUnit");
const statTotalLokasi = document.getElementById("statTotalLokasi");
const statKondisiBaik = document.getElementById("statKondisiBaik");
const statPerluPerbaikan = document.getElementById("statPerluPerbaikan");

// View Mode & Location Elements
const btnModeTable = document.getElementById("btnModeTable");
const btnModeLocation = document.getElementById("btnModeLocation");
const tableViewWrapper = document.getElementById("tableViewWrapper");
const locationViewWrapper = document.getElementById("locationViewWrapper");
const locationCardsContainer = document.getElementById("locationCardsContainer");
const badgeTotalLocations = document.getElementById("badgeTotalLocations");
let currentViewMode = "table";

// View Detail Modal Elements
const detailModalElement = document.getElementById("detailModal");
const detailModal = new bootstrap.Modal(detailModalElement);
const detailNamaBarang = document.getElementById("detailNamaBarang");
const detailKategoriBadge = document.getElementById("detailKategoriBadge");
const detailKondisiBadge = document.getElementById("detailKondisiBadge");
const detailLokasi = document.getElementById("detailLokasi");
const detailLokasiOtherItemsNote = document.getElementById("detailLokasiOtherItemsNote");
const detailJumlah = document.getElementById("detailJumlah");
const detailCreatedBy = document.getElementById("detailCreatedBy");
const detailUpdatedAt = document.getElementById("detailUpdatedAt");
const detailOtherItemsList = document.getElementById("detailOtherItemsList");
const btnDetailToEdit = document.getElementById("btnDetailToEdit");
let currentDetailKey = null;

// CRUD Modal Elements
const itemForm = document.getElementById("itemForm");
const itemIdInput = document.getElementById("itemId");
const namaBarangInput = document.getElementById("namaBarang");
const kategoriInput = document.getElementById("kategori");
const jumlahInput = document.getElementById("jumlah");
const kondisiInput = document.getElementById("kondisi");
const lokasiInput = document.getElementById("lokasi");
const itemModalTitle = document.getElementById("itemModalTitle");
const itemModalIcon = document.getElementById("itemModalIcon");
const btnSaveItem = document.getElementById("btnSaveItem");
const btnSaveSpinner = document.getElementById("btnSaveSpinner");
const btnSaveText = document.getElementById("btnSaveText");
const btnOpenAddModal = document.getElementById("btnOpenAddModal");

// Dipanggil setiap data inventaris berubah; diisi main.js untuk menyegarkan tab lain
let notifyDataChange = () => {};

export function onInventarisChange(handler) {
  notifyDataChange = handler;
}

export const inventarisRef = ref(db, "inventaris");

// Lepas listener onValue agar tidak menumpuk saat login ulang dan berhenti saat logout
export function stopListeningToInventory() {
  if (unsubscribeInventory) {
    unsubscribeInventory();
    unsubscribeInventory = null;
  }
}

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

// Render & Filter Tabel Inventaris & Sebaran Lokasi
function renderInventoryTable() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const katFilter = filterKategori.value;
  const kondFilter = filterKondisi.value;

  tableBody.innerHTML = "";

  let keys = Object.keys(state.inventoryData);

  // Update Statistik KPI menyeluruh
  let totalItem = keys.length;
  let totalUnit = 0;
  let countBaik = 0;
  let countPerluPerbaikan = 0;
  const uniqueLocations = new Set();

  keys.forEach((k) => {
    const item = state.inventoryData[k];
    const qty = parseInt(item.jumlah) || 0;
    totalUnit += qty;
    if (item.kondisi === "Baik") {
      countBaik += qty;
    } else {
      countPerluPerbaikan += qty;
    }
    if (item.lokasi && item.lokasi.trim()) {
      uniqueLocations.add(item.lokasi.trim());
    }
  });

  statTotalItem.textContent = totalItem.toLocaleString("id-ID");
  statTotalUnit.textContent = totalUnit.toLocaleString("id-ID");
  statTotalLokasi.textContent = uniqueLocations.size.toLocaleString("id-ID");
  badgeTotalLocations.textContent = uniqueLocations.size;
  statKondisiBaik.textContent = countBaik.toLocaleString("id-ID");
  statPerluPerbaikan.textContent = countPerluPerbaikan.toLocaleString("id-ID");

  // Filter Data
  const filteredKeys = keys.filter((key) => {
    const item = state.inventoryData[key];
    const matchesSearch = !searchTerm || 
      (item.namaBarang && item.namaBarang.toLowerCase().includes(searchTerm)) ||
      (item.lokasi && item.lokasi.toLowerCase().includes(searchTerm));
    const matchesKat = !katFilter || item.kategori === katFilter;
    const matchesKond = !kondFilter || item.kondisi === kondFilter;
    return matchesSearch && matchesKat && matchesKond;
  });

  recordCountLabel.textContent = `Menampilkan ${filteredKeys.length} dari ${totalItem} barang (${uniqueLocations.size} lokasi)`;

  if (filteredKeys.length === 0) {
    emptyState.classList.remove("d-none");
    locationCardsContainer.innerHTML = "";
    return;
  }

  emptyState.classList.add("d-none");

  // 1. Render Baris Tabel
  filteredKeys.forEach((key, index) => {
    const item = state.inventoryData[key];
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="text-center text-muted fw-semibold">${index + 1}</td>
      <td>
        <div class="fw-bold text-dark">${escapeHtml(item.namaBarang || "-")}</div>
        <small class="text-muted" style="font-size: 0.75rem;">Oleh: ${escapeHtml(item.createdBy || "-")}</small>
      </td>
      <td><span class="badge bg-light text-dark border px-2 py-1">${escapeHtml(item.kategori || "-")}</span></td>
      <td class="text-center"><span class="fw-semibold">${item.jumlah || 0}</span></td>
      <td>${getKondisiBadge(item.kondisi)}</td>
      <td>
        <div class="d-flex align-items-center gap-1.5 text-secondary">
          <i class="bi bi-geo-alt-fill text-danger" style="font-size: 0.9rem;"></i>
          <span class="fw-medium">${escapeHtml(item.lokasi || "-")}</span>
        </div>
      </td>
      <td><span class="small text-muted">${formatDate(item.updatedAt)}</span></td>
      <td class="text-end">
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-info btn-view" data-id="${key}" title="Lihat Lokasi & Detail">
            <i class="bi bi-eye"></i>
          </button>
          <button class="btn btn-outline-primary btn-edit" data-id="${key}" title="Edit Data">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-outline-danger btn-delete" data-id="${key}" data-name="${escapeHtml(item.namaBarang || 'Barang')}" title="Hapus Data">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </td>
    `;

    tableBody.appendChild(tr);
  });

  // 2. Render Sebaran Lokasi Ruangan
  renderLocationCards(filteredKeys);

  // Attach Event Listener ke tombol View, Edit, & Delete
  document.querySelectorAll(".btn-view").forEach(btn => {
    btn.addEventListener("click", () => openDetailModal(btn.dataset.id));
  });

  document.querySelectorAll(".btn-edit").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.id));
  });

  document.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", () => openDeleteBarangModal(btn.dataset.id, btn.dataset.name));
  });
}

// Render Kartu Sebaran Lokasi Alat
function renderLocationCards(filteredKeys) {
  locationCardsContainer.innerHTML = "";

  if (filteredKeys.length === 0) return;

  // Kelompokkan barang berdasarkan lokasi
  const locationGroups = {};
  filteredKeys.forEach((key) => {
    const item = state.inventoryData[key];
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

    const col = document.createElement("div");
    col.className = "col-12 col-md-6 col-xl-4";

    let itemsHtml = itemsInLoc.map((it) => `
      <div class="list-group-item d-flex align-items-center justify-content-between p-2.5 border-start-0 border-end-0">
        <div class="me-2 text-truncate">
          <div class="fw-semibold text-dark text-truncate" title="${escapeHtml(it.namaBarang || '')}">${escapeHtml(it.namaBarang || '-')}</div>
          <div class="d-flex align-items-center gap-1.5 mt-0.5">
            <span class="badge bg-light text-secondary border" style="font-size: 0.7rem;">${escapeHtml(it.kategori || "-")}</span>
            <span class="text-muted" style="font-size: 0.75rem;">• ${it.jumlah || 0} unit</span>
            ${getKondisiBadge(it.kondisi)}
          </div>
        </div>
        <button class="btn btn-outline-info btn-sm rounded-circle p-1.5 btn-view-loc-item flex-shrink-0" data-id="${it.key}" title="Lihat Detail & Lokasi" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
          <i class="bi bi-eye"></i>
        </button>
      </div>
    `).join("");

    col.innerHTML = `
      <div class="location-room-card h-100 shadow-sm">
        <div class="p-3 bg-light border-bottom d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2.5">
            <div class="room-icon-box shadow-sm flex-shrink-0">
              <i class="bi bi-door-open-fill"></i>
            </div>
            <div>
              <h6 class="fw-bold text-dark mb-0 text-truncate" style="max-width: 170px;" title="${escapeHtml(locName)}">${escapeHtml(locName)}</h6>
              <small class="text-muted" style="font-size: 0.75rem;">${itemsInLoc.length} Item &bull; ${locTotalUnit} Unit</small>
            </div>
          </div>
          <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1" style="font-size: 0.75rem;">
            <i class="bi bi-geo-alt-fill me-1 text-danger"></i>Ruangan
          </span>
        </div>
        <div class="list-group list-group-flush" style="max-height: 280px; overflow-y: auto;">
          ${itemsHtml}
        </div>
      </div>
    `;

    locationCardsContainer.appendChild(col);
  });

  // Attach Event Listener ke tombol view pada kartu lokasi
  document.querySelectorAll(".btn-view-loc-item").forEach(btn => {
    btn.addEventListener("click", () => openDetailModal(btn.dataset.id));
  });
}

// [VIEW DETAIL] Buka modal detail dan rincian lokasi
function openDetailModal(key) {
  const item = state.inventoryData[key];
  if (!item) return;

  currentDetailKey = key;
  detailNamaBarang.textContent = item.namaBarang || "-";
  detailKategoriBadge.textContent = item.kategori || "-";
  detailKondisiBadge.innerHTML = getKondisiBadge(item.kondisi);
  detailLokasi.textContent = item.lokasi || "-";
  detailJumlah.textContent = `${item.jumlah || 0} Unit`;
  detailCreatedBy.textContent = item.createdBy || "-";
  detailUpdatedAt.textContent = formatDate(item.updatedAt);

  // Cari barang lain yang berada di lokasi yang sama
  const targetLoc = (item.lokasi || "").trim().toLowerCase();
  const otherItemsInSameLoc = Object.keys(state.inventoryData)
    .filter(k => k !== key && (state.inventoryData[k].lokasi || "").trim().toLowerCase() === targetLoc)
    .map(k => state.inventoryData[k]);

  detailOtherItemsList.innerHTML = "";
  if (otherItemsInSameLoc.length > 0) {
    detailLokasiOtherItemsNote.textContent = `Terdapat ${otherItemsInSameLoc.length} barang/alat lain yang juga berada di ruangan ini.`;
    otherItemsInSameLoc.forEach(other => {
      const div = document.createElement("div");
      div.className = "list-group-item px-0 py-1.5 d-flex align-items-center justify-content-between border-0";
      div.innerHTML = `
        <div class="d-flex align-items-center gap-2 text-truncate">
          <i class="bi bi-box-seam text-secondary"></i>
          <span class="text-dark fw-medium text-truncate">${escapeHtml(other.namaBarang || "-")}</span>
          <span class="badge bg-light text-muted border">${other.jumlah || 0} unit</span>
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

// Handler Tombol Edit dari Modal Detail
btnDetailToEdit.addEventListener("click", () => {
  detailModal.hide();
  if (currentDetailKey) {
    openEditModal(currentDetailKey);
  }
});

// Handler Switch Mode Tampilan (Tabel vs Sebaran Lokasi)
function switchViewMode(mode) {
  currentViewMode = mode;
  if (mode === "table") {
    btnModeTable.classList.add("active", "btn-white", "shadow-sm");
    btnModeTable.classList.remove("btn-light", "text-secondary");
    btnModeLocation.classList.remove("active", "btn-white", "shadow-sm");
    btnModeLocation.classList.add("btn-light", "text-secondary");
    tableViewWrapper.classList.remove("d-none");
    locationViewWrapper.classList.add("d-none");
  } else {
    btnModeLocation.classList.add("active", "btn-white", "shadow-sm");
    btnModeLocation.classList.remove("btn-light", "text-secondary");
    btnModeTable.classList.remove("active", "btn-white", "shadow-sm");
    btnModeTable.classList.add("btn-light", "text-secondary");
    tableViewWrapper.classList.add("d-none");
    locationViewWrapper.classList.remove("d-none");
  }
}

btnModeTable.addEventListener("click", () => switchViewMode("table"));
btnModeLocation.addEventListener("click", () => switchViewMode("location"));

// Modal Create Mode Reset
btnOpenAddModal.addEventListener("click", () => {
  itemForm.reset();
  itemForm.classList.remove("was-validated");
  itemIdInput.value = "";
  jumlahInput.value = "1";
  kondisiInput.value = "Baik";
  itemModalTitle.textContent = "Tambah Barang Baru";
  itemModalIcon.className = "bi bi-plus-circle me-1 text-primary";
  btnSaveText.textContent = "Simpan Data";
});

// [UPDATE PRE-FILL] Buka modal dan isi nilai
function openEditModal(key) {
  const item = state.inventoryData[key];
  if (!item) return;

  itemForm.reset();
  itemForm.classList.remove("was-validated");
  itemIdInput.value = key;
  namaBarangInput.value = item.namaBarang || "";
  kategoriInput.value = item.kategori || "";
  jumlahInput.value = item.jumlah || 1;
  kondisiInput.value = item.kondisi || "Baik";
  lokasiInput.value = item.lokasi || "";

  itemModalTitle.textContent = "Edit Data Barang";
  itemModalIcon.className = "bi bi-pencil-square me-1 text-warning";
  btnSaveText.textContent = "Perbarui Data";

  itemModal.show();
}

// [CREATE] Tambah barang baru (push + set)
async function createBarang(payload) {
  await set(push(inventarisRef), payload);
}

// [UPDATE] Perbarui data barang
export async function updateBarang(key, payload) {
  await update(ref(db, `inventaris/${key}`), payload);
}

// [CREATE & UPDATE] Submit Form Handler
itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!itemForm.checkValidity()) {
    e.stopPropagation();
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
    createdBy: state.currentUser ? state.currentUser.email : "Anonim",
    updatedAt: new Date().toISOString()
  };

  // Loading state tombol submit modal
  btnSaveItem.disabled = true;
  btnSaveSpinner.classList.remove("d-none");
  btnSaveText.textContent = isEdit ? "Memperbarui..." : "Menyimpan...";

  try {
    if (isEdit) {
      await updateBarang(key, payload);
      showToast("Data barang berhasil diperbarui!");
    } else {
      await createBarang(payload);
      showToast("Barang baru berhasil ditambahkan!");
    }

    itemModal.hide();
    itemForm.reset();
    itemForm.classList.remove("was-validated");
  } catch (error) {
    console.error("Gagal menyimpan data:", error);
    showToast("Gagal menyimpan data barang. Periksa koneksi dan security rules.", false);
  } finally {
    btnSaveItem.disabled = false;
    btnSaveSpinner.classList.add("d-none");
    btnSaveText.textContent = isEdit ? "Perbarui Data" : "Simpan Data";
  }
});

// [DELETE] Buka konfirmasi hapus barang, sebutkan catatan terkait yang ikut terhapus
function openDeleteBarangModal(key, name) {
  const jumlahPeminjaman = findRecordKeysByBarang(state.peminjamanData, key).length;
  const jumlahPerawatan = findRecordKeysByBarang(state.perawatanData, key).length;
  let prompt = `Yakin ingin menghapus <strong>"${escapeHtml(name)}"</strong> dari inventaris?`;
  if (jumlahPeminjaman || jumlahPerawatan) {
    prompt += `<br><span class="text-danger">${jumlahPeminjaman} catatan peminjaman dan ${jumlahPerawatan} catatan perawatan barang ini juga akan dihapus.</span>`;
  }
  openDeleteModal("Hapus Barang Ini?", prompt, "Barang berhasil dihapus dari inventaris.", () => deleteBarang(key));
}

// [DELETE] Hapus barang beserta catatan peminjaman & perawatannya dalam satu multi-path update
export async function deleteBarang(key) {
  await update(ref(db), buildHapusBarangUpdates(key, state.peminjamanData, state.perawatanData));
}

// Filter & Search Event Listeners
searchInput.addEventListener("input", renderInventoryTable);
filterKategori.addEventListener("change", renderInventoryTable);
filterKondisi.addEventListener("change", renderInventoryTable);
