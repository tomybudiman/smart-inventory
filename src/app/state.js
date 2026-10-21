// Data bersama antar-modul. Modul lain mengubah properti objek ini (bukan variabel terpisah),
// karena variabel yang di-export sebuah modul tidak dapat diubah nilainya oleh modul lain.
export const state = {
  currentUser: null, // pengguna login yang emailnya sudah terverifikasi
  inventoryData: {}, // Cache data dari Realtime Database { [key]: { ...data } }
  peminjamanData: {}, // Cache node /peminjaman
  perawatanData: {} // Cache node /perawatan
};
