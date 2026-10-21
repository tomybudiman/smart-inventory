// Modul Perawatan Barang (node /perawatan): CRUD dan tabel riwayat servis, perbaikan, kalibrasi.
import { db, ref, push, set, update, remove, onValue } from "./firebase.js";
import { escapeHtml, toIsoDate, validatePerawatan } from "../inventory-logic.mjs";
import { state } from "./state.js";
import { fillBarangSelect, formatRupiah, formatTanggal, getNamaBarang, getStatusBadge, openDeleteModal, showFormAlert, showToast } from "./ui.js";

let unsubscribePerawatan = null;

// Perawatan Elements
const perawatanModal = new bootstrap.Modal(document.getElementById("perawatanModal"));
const perawatanForm = document.getElementById("perawatanForm");
const perawatanIdInput = document.getElementById("perawatanId");
const perawatanBarangInput = document.getElementById("perawatanBarang");
const perawatanJenisInput = document.getElementById("perawatanJenis");
const perawatanTanggalInput = document.getElementById("perawatanTanggal");
const perawatanStatusInput = document.getElementById("perawatanStatus");
const perawatanBiayaInput = document.getElementById("perawatanBiaya");
const perawatanDeskripsiInput = document.getElementById("perawatanDeskripsi");
const perawatanFormAlert = document.getElementById("perawatanFormAlert");
const perawatanModalTitle = document.getElementById("perawatanModalTitle");
const btnSavePerawatan = document.getElementById("btnSavePerawatan");
const btnSavePerawatanSpinner = document.getElementById("btnSavePerawatanSpinner");
const btnSavePerawatanText = document.getElementById("btnSavePerawatanText");
const btnOpenAddPerawatan = document.getElementById("btnOpenAddPerawatan");
const perawatanTableBody = document.getElementById("perawatanTableBody");
const perawatanLoading = document.getElementById("perawatanLoading");
const perawatanEmptyState = document.getElementById("perawatanEmptyState");
const perawatanCountLabel = document.getElementById("perawatanCountLabel");
const searchPerawatan = document.getElementById("searchPerawatan");
const filterStatusPerawatan = document.getElementById("filterStatusPerawatan");
const statPerawatanAktif = document.getElementById("statPerawatanAktif");
const statPerawatanSelesai = document.getElementById("statPerawatanSelesai");
const statPerawatanBiaya = document.getElementById("statPerawatanBiaya");
const badgePerawatanAktif = document.getElementById("badgePerawatanAktif");

export function refreshPerawatanBarangOptions() {
  fillBarangSelect(perawatanBarangInput, false);
}

const perawatanRef = ref(db, "perawatan");

export function stopListeningToPerawatan() {
  if (unsubscribePerawatan) {
    unsubscribePerawatan();
    unsubscribePerawatan = null;
  }
}

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

export function renderPerawatanTable() {
  const searchTerm = searchPerawatan.value.toLowerCase().trim();
  const statusFilter = filterStatusPerawatan.value;
  const keys = Object.keys(state.perawatanData);

  let countSelesai = 0;
  let totalBiaya = 0;
  keys.forEach((k) => {
    if (state.perawatanData[k].status === "Selesai") countSelesai++;
    totalBiaya += Number(state.perawatanData[k].biaya) || 0;
  });

  statPerawatanAktif.textContent = (keys.length - countSelesai).toLocaleString("id-ID");
  statPerawatanSelesai.textContent = countSelesai.toLocaleString("id-ID");
  statPerawatanBiaya.textContent = formatRupiah(totalBiaya);
  badgePerawatanAktif.textContent = keys.length - countSelesai;

  const filteredKeys = keys.filter((key) => {
    const r = state.perawatanData[key];
    const matchesSearch = !searchTerm ||
      getNamaBarang(r.barangId).toLowerCase().includes(searchTerm) ||
      (r.jenis || "").toLowerCase().includes(searchTerm) ||
      (r.deskripsi || "").toLowerCase().includes(searchTerm);
    const matchesStatus = !statusFilter || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => (state.perawatanData[b].tanggal || "").localeCompare(state.perawatanData[a].tanggal || ""));

  perawatanCountLabel.textContent = `Menampilkan ${filteredKeys.length} dari ${keys.length} perawatan`;
  const isLoading = !perawatanLoading.classList.contains("d-none");
  perawatanEmptyState.classList.toggle("d-none", isLoading || filteredKeys.length > 0);

  perawatanTableBody.innerHTML = filteredKeys.map((key, index) => {
    const r = state.perawatanData[key];
    return `
      <tr>
        <td class="text-center text-muted fw-semibold">${index + 1}</td>
        <td>
          <div class="fw-bold text-dark">${escapeHtml(getNamaBarang(r.barangId))}</div>
          <small class="text-muted" style="font-size: 0.75rem;">Oleh: ${escapeHtml(r.createdBy || "-")}</small>
        </td>
        <td><span class="badge bg-light text-dark border px-2 py-1">${escapeHtml(r.jenis || "-")}</span></td>
        <td><div class="small text-truncate" style="max-width: 260px;" title="${escapeHtml(r.deskripsi || "")}">${escapeHtml(r.deskripsi || "-")}</div></td>
        <td><span class="small">${formatTanggal(r.tanggal)}</span></td>
        <td class="text-end"><span class="fw-semibold small">${formatRupiah(r.biaya)}</span></td>
        <td>${getStatusBadge(r.status)}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-outline-primary" data-action="edit" data-id="${key}" title="Edit Perawatan">
              <i class="bi bi-pencil-square"></i>
            </button>
            <button class="btn btn-outline-danger" data-action="hapus" data-id="${key}" title="Hapus Perawatan">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Buka form perawatan: tanpa key = catat baru, dengan key = edit
function openPerawatanModal(key = "") {
  if (!key && Object.keys(state.inventoryData).length === 0) {
    showToast("Tambahkan barang ke inventaris terlebih dahulu.", false);
    return;
  }
  const r = key ? state.perawatanData[key] : null;

  perawatanForm.reset();
  perawatanForm.classList.remove("was-validated");
  showFormAlert(perawatanFormAlert, []);
  refreshPerawatanBarangOptions();

  perawatanIdInput.value = key;
  perawatanBarangInput.value = r?.barangId || "";
  perawatanJenisInput.value = r?.jenis || "";
  perawatanTanggalInput.value = r?.tanggal || toIsoDate(new Date());
  perawatanStatusInput.value = r?.status || "Dijadwalkan";
  perawatanBiayaInput.value = r?.biaya ?? 0;
  perawatanDeskripsiInput.value = r?.deskripsi || "";

  perawatanModalTitle.textContent = key ? "Edit Data Perawatan" : "Catat Perawatan Baru";
  btnSavePerawatanText.textContent = key ? "Perbarui Data" : "Simpan Data";
  perawatanModal.show();
}

btnOpenAddPerawatan.addEventListener("click", () => openPerawatanModal());

// Aksi tombol pada baris tabel (event delegation)
perawatanTableBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const key = btn.dataset.id;
  const r = state.perawatanData[key];
  if (!r) return;

  if (btn.dataset.action === "edit") {
    openPerawatanModal(key);
  } else if (btn.dataset.action === "hapus") {
    openDeleteModal(
      "Hapus Catatan Perawatan?",
      `Yakin ingin menghapus catatan <strong>${escapeHtml(r.jenis || "perawatan")}</strong> untuk <strong>"${escapeHtml(getNamaBarang(r.barangId))}"</strong>?`,
      "Catatan perawatan berhasil dihapus.",
      () => deletePerawatan(key)
    );
  }
});

// [CREATE & UPDATE] Submit form perawatan
perawatanForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showFormAlert(perawatanFormAlert, []);

  if (!perawatanForm.checkValidity()) {
    e.stopPropagation();
    perawatanForm.classList.add("was-validated");
    return;
  }

  const key = perawatanIdInput.value;
  const isEdit = Boolean(key);

  const perawatanPayload = {
    barangId: perawatanBarangInput.value,
    jenis: perawatanJenisInput.value,
    deskripsi: perawatanDeskripsiInput.value.trim(),
    tanggal: perawatanTanggalInput.value,
    biaya: parseInt(perawatanBiayaInput.value, 10) || 0,
    status: perawatanStatusInput.value,
    createdBy: state.currentUser ? state.currentUser.email : "Anonim",
    updatedAt: new Date().toISOString()
  };

  const errors = validatePerawatan(perawatanPayload, state.inventoryData);
  if (errors.length > 0) {
    showFormAlert(perawatanFormAlert, errors);
    return;
  }

  btnSavePerawatan.disabled = true;
  btnSavePerawatanSpinner.classList.remove("d-none");
  btnSavePerawatanText.textContent = isEdit ? "Memperbarui..." : "Menyimpan...";

  try {
    if (isEdit) {
      await updatePerawatan(key, perawatanPayload);
      showToast("Data perawatan berhasil diperbarui!");
    } else {
      await createPerawatan(perawatanPayload);
      showToast("Perawatan berhasil dicatat!");
    }
    perawatanModal.hide();
  } catch (error) {
    console.error("Gagal menyimpan perawatan:", error);
    showToast("Gagal menyimpan data perawatan. Periksa koneksi dan security rules.", false);
  } finally {
    btnSavePerawatan.disabled = false;
    btnSavePerawatanSpinner.classList.add("d-none");
    btnSavePerawatanText.textContent = isEdit ? "Perbarui Data" : "Simpan Data";
  }
});

searchPerawatan.addEventListener("input", renderPerawatanTable);
filterStatusPerawatan.addEventListener("change", renderPerawatanTable);
