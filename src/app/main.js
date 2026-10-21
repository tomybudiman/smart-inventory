// Titik masuk aplikasi: memuat semua modul lalu menghubungkan alur antar-modul.
import { auth, db } from "./firebase.js";
import { initAuth } from "./auth.js";
import { listenToInventoryChanges, onInventarisChange, stopListeningToInventory } from "./inventaris.js";
import { listenToPeminjamanChanges, refreshPeminjamanBarangOptions, renderPeminjamanTable, stopListeningToPeminjaman } from "./peminjaman.js";
import { listenToPerawatanChanges, refreshPerawatanBarangOptions, renderPerawatanTable, stopListeningToPerawatan } from "./perawatan.js";
import { handleUserMessage, resetChat } from "./gemini-chat.js";

// Nama & stok barang juga dipakai tab peminjaman dan perawatan
onInventarisChange(() => {
  renderPeminjamanTable();
  renderPerawatanTable();
  refreshPeminjamanBarangOptions();
  refreshPerawatanBarangOptions();
});

// Sinkronisasi ketiga node dimulai saat login (email terverifikasi) dan dihentikan saat logout
initAuth({
  startSync() {
    listenToInventoryChanges();
    listenToPeminjamanChanges();
    listenToPerawatanChanges();
  },
  stopSync() {
    stopListeningToInventory();
    stopListeningToPeminjaman();
    stopListeningToPerawatan();
  },
  resetChat
});

// Expose functions globally jika dibutuhkan inspeksi
window._app = { auth, db, handleUserMessage };
