// Modul Peminjaman Barang (node /peminjaman): CRUD, tabel, dan status keterlambatan.
import { db, ref, push, set, update, remove, onValue } from "./firebase.js";
import { escapeHtml, isPeminjamanTerlambat, toIsoDate, validatePeminjaman } from "../inventory-logic.mjs";
import { state } from "./state.js";
import { fillBarangSelect, formatTanggal, getNamaBarang, getStatusBadge, openDeleteModal, showFormAlert, showToast } from "./ui.js";

let unsubscribePeminjaman = null;

// Peminjaman Elements
const peminjamanModal = new bootstrap.Modal(document.getElementById("peminjamanModal"));
const peminjamanForm = document.getElementById("peminjamanForm");
const peminjamanIdInput = document.getElementById("peminjamanId");
const peminjamanBarangInput = document.getElementById("peminjamanBarang");
const peminjamanPeminjamInput = document.getElementById("peminjamanPeminjam");
const peminjamanJumlahInput = document.getElementById("peminjamanJumlah");
const peminjamanTanggalPinjamInput = document.getElementById("peminjamanTanggalPinjam");
const peminjamanTanggalKembaliInput = document.getElementById("peminjamanTanggalKembali");
const peminjamanStatusInput = document.getElementById("peminjamanStatus");
const peminjamanFormAlert = document.getElementById("peminjamanFormAlert");
const peminjamanModalTitle = document.getElementById("peminjamanModalTitle");
const btnSavePeminjaman = document.getElementById("btnSavePeminjaman");
const btnSavePeminjamanSpinner = document.getElementById("btnSavePeminjamanSpinner");
const btnSavePeminjamanText = document.getElementById("btnSavePeminjamanText");
const btnOpenAddPeminjaman = document.getElementById("btnOpenAddPeminjaman");
const peminjamanTableBody = document.getElementById("peminjamanTableBody");
const peminjamanLoading = document.getElementById("peminjamanLoading");
const peminjamanEmptyState = document.getElementById("peminjamanEmptyState");
const peminjamanCountLabel = document.getElementById("peminjamanCountLabel");
const searchPeminjaman = document.getElementById("searchPeminjaman");
const filterStatusPeminjaman = document.getElementById("filterStatusPeminjaman");
const statPeminjamanAktif = document.getElementById("statPeminjamanAktif");
const statPeminjamanTerlambat = document.getElementById("statPeminjamanTerlambat");
const statPeminjamanSelesai = document.getElementById("statPeminjamanSelesai");
const badgePeminjamanAktif = document.getElementById("badgePeminjamanAktif");

// Pilihan barang pada form, lengkap dengan unit yang masih tersedia
export function refreshPeminjamanBarangOptions() {
  fillBarangSelect(peminjamanBarangInput, true);
}

const peminjamanRef = ref(db, "peminjaman");

export function stopListeningToPeminjaman() {
  if (unsubscribePeminjaman) {
    unsubscribePeminjaman();
    unsubscribePeminjaman = null;
  }
}

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
async function createPeminjaman(payload) {
  await set(push(peminjamanRef), payload);
}

// [UPDATE] Perbarui data peminjaman dari form edit
async function updatePeminjaman(key, payload) {
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
async function deletePeminjaman(key) {
  await remove(ref(db, `peminjaman/${key}`));
}

export function renderPeminjamanTable() {
  const today = toIsoDate(new Date());
  const searchTerm = searchPeminjaman.value.toLowerCase().trim();
  const statusFilter = filterStatusPeminjaman.value;
  const keys = Object.keys(state.peminjamanData);

  let countAktif = 0;
  let countTerlambat = 0;
  keys.forEach((k) => {
    if (state.peminjamanData[k].status === "Dipinjam") countAktif++;
    if (isPeminjamanTerlambat(state.peminjamanData[k], today)) countTerlambat++;
  });

  statPeminjamanAktif.textContent = countAktif.toLocaleString("id-ID");
  statPeminjamanTerlambat.textContent = countTerlambat.toLocaleString("id-ID");
  statPeminjamanSelesai.textContent = (keys.length - countAktif).toLocaleString("id-ID");
  badgePeminjamanAktif.textContent = countAktif;

  // "Terlambat" bukan status tersimpan, melainkan dihitung dari batas kembali
  const filteredKeys = keys.filter((key) => {
    const p = state.peminjamanData[key];
    const matchesSearch = !searchTerm ||
      getNamaBarang(p.barangId).toLowerCase().includes(searchTerm) ||
      (p.peminjam || "").toLowerCase().includes(searchTerm);
    const matchesStatus = !statusFilter ||
      (statusFilter === "Terlambat" ? isPeminjamanTerlambat(p, today) : p.status === statusFilter);
    return matchesSearch && matchesStatus;
  }).sort((a, b) => (state.peminjamanData[b].tanggalPinjam || "").localeCompare(state.peminjamanData[a].tanggalPinjam || ""));

  peminjamanCountLabel.textContent = `Menampilkan ${filteredKeys.length} dari ${keys.length} peminjaman`;
  const isLoading = !peminjamanLoading.classList.contains("d-none");
  peminjamanEmptyState.classList.toggle("d-none", isLoading || filteredKeys.length > 0);

  peminjamanTableBody.innerHTML = filteredKeys.map((key, index) => {
    const p = state.peminjamanData[key];
    const terlambat = isPeminjamanTerlambat(p, today);
    const btnKembalikan = p.status === "Dipinjam"
      ? `<button class="btn btn-outline-success" data-action="kembalikan" data-id="${key}" title="Tandai Sudah Dikembalikan">
           <i class="bi bi-box-arrow-in-down-left"></i>
         </button>`
      : "";

    return `
      <tr>
        <td class="text-center text-muted fw-semibold">${index + 1}</td>
        <td>
          <div class="fw-bold text-dark">${escapeHtml(getNamaBarang(p.barangId))}</div>
          <small class="text-muted" style="font-size: 0.75rem;">Oleh: ${escapeHtml(p.createdBy || "-")}</small>
        </td>
        <td class="fw-medium">${escapeHtml(p.peminjam || "-")}</td>
        <td class="text-center"><span class="fw-semibold">${p.jumlah || 0}</span></td>
        <td><span class="small">${formatTanggal(p.tanggalPinjam)}</span></td>
        <td><span class="small ${terlambat ? "text-danger fw-semibold" : ""}">${formatTanggal(p.tanggalKembali)}</span></td>
        <td>${getStatusBadge(terlambat ? "Terlambat" : p.status)}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm" role="group">
            ${btnKembalikan}
            <button class="btn btn-outline-primary" data-action="edit" data-id="${key}" title="Edit Peminjaman">
              <i class="bi bi-pencil-square"></i>
            </button>
            <button class="btn btn-outline-danger" data-action="hapus" data-id="${key}" title="Hapus Peminjaman">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Buka form peminjaman: tanpa key = catat baru, dengan key = edit
function openPeminjamanModal(key = "") {
  if (!key && Object.keys(state.inventoryData).length === 0) {
    showToast("Tambahkan barang ke inventaris terlebih dahulu.", false);
    return;
  }
  const p = key ? state.peminjamanData[key] : null;

  peminjamanForm.reset();
  peminjamanForm.classList.remove("was-validated");
  showFormAlert(peminjamanFormAlert, []);
  refreshPeminjamanBarangOptions();

  peminjamanIdInput.value = key;
  peminjamanBarangInput.value = p?.barangId || "";
  peminjamanPeminjamInput.value = p?.peminjam || "";
  peminjamanJumlahInput.value = p?.jumlah || 1;
  peminjamanTanggalPinjamInput.value = p?.tanggalPinjam || toIsoDate(new Date());
  peminjamanTanggalKembaliInput.value = p?.tanggalKembali || "";
  peminjamanStatusInput.value = p?.status || "Dipinjam";

  peminjamanModalTitle.textContent = key ? "Edit Data Peminjaman" : "Catat Peminjaman Baru";
  btnSavePeminjamanText.textContent = key ? "Perbarui Data" : "Simpan Data";
  peminjamanModal.show();
}

btnOpenAddPeminjaman.addEventListener("click", () => openPeminjamanModal());

// Aksi tombol pada baris tabel (event delegation)
peminjamanTableBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const key = btn.dataset.id;
  const p = state.peminjamanData[key];
  if (!p) return;

  if (btn.dataset.action === "edit") {
    openPeminjamanModal(key);
  } else if (btn.dataset.action === "hapus") {
    openDeleteModal(
      "Hapus Catatan Peminjaman?",
      `Yakin ingin menghapus peminjaman <strong>"${escapeHtml(getNamaBarang(p.barangId))}"</strong> oleh <strong>${escapeHtml(p.peminjam || "-")}</strong>?`,
      "Catatan peminjaman berhasil dihapus.",
      () => deletePeminjaman(key)
    );
  } else if (btn.dataset.action === "kembalikan") {
    btn.disabled = true;
    try {
      await kembalikanPeminjaman(key);
      showToast("Barang ditandai sudah dikembalikan.");
    } catch (error) {
      console.error("Gagal memperbarui status peminjaman:", error);
      showToast("Gagal memperbarui status peminjaman.", false);
      btn.disabled = false;
    }
  }
});

// [CREATE & UPDATE] Submit form peminjaman
peminjamanForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showFormAlert(peminjamanFormAlert, []);

  if (!peminjamanForm.checkValidity()) {
    e.stopPropagation();
    peminjamanForm.classList.add("was-validated");
    return;
  }

  const key = peminjamanIdInput.value;
  const isEdit = Boolean(key);

  const peminjamanPayload = {
    barangId: peminjamanBarangInput.value,
    peminjam: peminjamanPeminjamInput.value.trim(),
    jumlah: parseInt(peminjamanJumlahInput.value, 10) || 1,
    tanggalPinjam: peminjamanTanggalPinjamInput.value,
    tanggalKembali: peminjamanTanggalKembaliInput.value,
    status: peminjamanStatusInput.value,
    createdBy: state.currentUser ? state.currentUser.email : "Anonim",
    updatedAt: new Date().toISOString()
  };

  const errors = validatePeminjaman(peminjamanPayload, state.inventoryData, state.peminjamanData, key || null);
  if (errors.length > 0) {
    showFormAlert(peminjamanFormAlert, errors);
    return;
  }

  btnSavePeminjaman.disabled = true;
  btnSavePeminjamanSpinner.classList.remove("d-none");
  btnSavePeminjamanText.textContent = isEdit ? "Memperbarui..." : "Menyimpan...";

  try {
    if (isEdit) {
      await updatePeminjaman(key, peminjamanPayload);
      showToast("Data peminjaman berhasil diperbarui!");
    } else {
      await createPeminjaman(peminjamanPayload);
      showToast("Peminjaman berhasil dicatat!");
    }
    peminjamanModal.hide();
  } catch (error) {
    console.error("Gagal menyimpan peminjaman:", error);
    showToast("Gagal menyimpan data peminjaman. Periksa koneksi dan security rules.", false);
  } finally {
    btnSavePeminjaman.disabled = false;
    btnSavePeminjamanSpinner.classList.add("d-none");
    btnSavePeminjamanText.textContent = isEdit ? "Perbarui Data" : "Simpan Data";
  }
});

searchPeminjaman.addEventListener("input", renderPeminjamanTable);
filterStatusPeminjaman.addEventListener("change", renderPeminjamanTable);
