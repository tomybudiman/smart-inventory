// Helper tampilan yang dipakai bersama: toast, format tanggal/Rupiah, badge, alert form,
// modal konfirmasi hapus, dan pilihan barang pada form peminjaman & perawatan.
import { escapeHtml, hitungUnitDipinjam } from "../inventory-logic.mjs";
import { state } from "./state.js";

// Bootstrap Toast & Modal Konfirmasi Hapus
const deleteModal = new bootstrap.Modal(document.getElementById("deleteModal"));
const toastElement = document.getElementById("appToast");
const toastInstance = new bootstrap.Toast(toastElement, { delay: 3500 });
const btnConfirmDelete = document.getElementById("btnConfirmDelete");
const btnDeleteSpinner = document.getElementById("btnDeleteSpinner");
const deleteModalTitle = document.getElementById("deleteModalTitle");
const deleteItemNamePrompt = document.getElementById("deleteItemNamePrompt");
let pendingDelete = null; // { successMessage, run } untuk modal konfirmasi hapus

export function showToast(message, isSuccess = true) {
  toastElement.className = `toast align-items-center text-white border-0 shadow ${isSuccess ? 'bg-success' : 'bg-danger'}`;
  document.getElementById("toastMessage").innerHTML = `
    <i class="bi ${isSuccess ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} fs-5"></i>
    <span>${message}</span>
  `;
  toastInstance.show();
}

export function formatDate(isoString) {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch {
    return isoString;
  }
}

export function getKondisiBadge(kondisi) {
  if (kondisi === "Baik") {
    return `<span class="badge badge-kondisi-baik px-2.5 py-1 rounded-pill"><i class="bi bi-check2 me-1"></i>Baik</span>`;
  } else if (kondisi === "Rusak Ringan") {
    return `<span class="badge badge-kondisi-rusak-ringan px-2.5 py-1 rounded-pill"><i class="bi bi-exclamation-triangle me-1"></i>Rusak Ringan</span>`;
  } else if (kondisi === "Rusak Berat") {
    return `<span class="badge badge-kondisi-rusak-berat px-2.5 py-1 rounded-pill"><i class="bi bi-x-circle me-1"></i>Rusak Berat</span>`;
  }
  return `<span class="badge bg-secondary">${kondisi || '-'}</span>`;
}

// Tanggal tanpa jam dari nilai YYYY-MM-DD (<input type="date">), dibaca sebagai tanggal lokal
export function formatTanggal(isoDate) {
  if (!isoDate) return "-";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(y, m - 1, d));
}

export function formatRupiah(angka) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(angka) || 0);
}

// Badge status peminjaman ("Terlambat" dihitung, bukan disimpan) & perawatan
const STATUS_BADGE_CLASS = {
  "Dipinjam": "bg-warning-subtle text-warning-emphasis border-warning-subtle",
  "Terlambat": "bg-danger-subtle text-danger border-danger-subtle",
  "Dikembalikan": "bg-success-subtle text-success border-success-subtle",
  "Dijadwalkan": "bg-secondary-subtle text-secondary-emphasis border-secondary-subtle",
  "Dalam Proses": "bg-primary-subtle text-primary border-primary-subtle",
  "Selesai": "bg-success-subtle text-success border-success-subtle"
};

export function getStatusBadge(status) {
  const cls = STATUS_BADGE_CLASS[status] || "bg-light text-secondary";
  return `<span class="badge border ${cls} px-2.5 py-1 rounded-pill">${escapeHtml(status || "-")}</span>`;
}

// Nama barang untuk tabel peminjaman & perawatan
export function getNamaBarang(barangId) {
  return state.inventoryData[barangId]?.namaBarang || "(barang tidak ditemukan)";
}

// Tampilkan daftar error validasi di dalam modal form (daftar kosong = sembunyikan)
export function showFormAlert(alertElement, errors) {
  alertElement.innerHTML = errors.map((err) => escapeHtml(err)).join("<br>");
  alertElement.classList.toggle("d-none", errors.length === 0);
}

// Modal konfirmasi hapus dipakai bersama oleh ketiga modul; run = fungsi hapus yang dijalankan
export function openDeleteModal(title, promptHtml, successMessage, run) {
  pendingDelete = { successMessage, run };
  deleteModalTitle.textContent = title;
  deleteItemNamePrompt.innerHTML = promptHtml;
  deleteModal.show();
}

btnConfirmDelete.addEventListener("click", async () => {
  if (!pendingDelete) return;

  btnConfirmDelete.disabled = true;
  btnDeleteSpinner.classList.remove("d-none");

  try {
    await pendingDelete.run();
    showToast(pendingDelete.successMessage);
    pendingDelete = null;
    deleteModal.hide();
  } catch (error) {
    console.error("Gagal menghapus:", error);
    showToast("Gagal menghapus data. Periksa hak akses database.", false);
  } finally {
    btnConfirmDelete.disabled = false;
    btnDeleteSpinner.classList.add("d-none");
  }
});

// Isi <select> barang pada form peminjaman & perawatan dari cache inventaris.
// Pilihan yang sedang dipilih dipertahankan agar update realtime tidak mengganggu form yang terbuka.
export function fillBarangSelect(select, withStock) {
  const selected = select.value;
  const keys = Object.keys(state.inventoryData).sort((a, b) =>
    (state.inventoryData[a].namaBarang || "").localeCompare(state.inventoryData[b].namaBarang || "", "id"));

  select.innerHTML = `<option value="" disabled selected>Pilih Barang</option>` + keys.map((key) => {
    const item = state.inventoryData[key];
    let label = `${item.namaBarang || "-"} — ${item.lokasi || "-"}`;
    if (withStock) {
      const tersedia = (parseInt(item.jumlah, 10) || 0) - hitungUnitDipinjam(state.peminjamanData, key);
      label += ` (tersedia ${Math.max(tersedia, 0)} dari ${item.jumlah || 0} unit)`;
    }
    return `<option value="${key}">${escapeHtml(label)}</option>`;
  }).join("");
  select.value = selected;
}
