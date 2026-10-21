import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildActionHistoryNote, isIsoDate, prepareAiAction } from "../src/ai-actions.mjs";

const ctx = {
  today: "2026-10-22",
  options: {
    kategori: ["Elektronik", "ATK", "Perabot", "Hardware Jaringan"],
    kondisi: ["Baik", "Rusak Ringan", "Rusak Berat"],
    statusPeminjaman: ["Dipinjam", "Dikembalikan"],
    jenisPerawatan: ["Servis Rutin", "Perbaikan", "Kalibrasi"],
    statusPerawatan: ["Dijadwalkan", "Dalam Proses", "Selesai"]
  },
  inventoryData: {
    b1: { namaBarang: "Proyektor", kategori: "Elektronik", jumlah: 3, kondisi: "Baik", lokasi: "Ruang Rapat", createdBy: "a@x.id", updatedAt: "t" },
    b2: { namaBarang: "Laptop", kategori: "Elektronik", jumlah: 5, kondisi: "Baik", lokasi: "Lab 2", createdBy: "a@x.id", updatedAt: "t" }
  },
  peminjamanData: {
    p1: { barangId: "b1", peminjam: "Budi", jumlah: 2, tanggalPinjam: "2026-10-20", tanggalKembali: "2026-10-27", status: "Dipinjam" }
  },
  perawatanData: {
    r1: { barangId: "b1", jenis: "Perbaikan", deskripsi: "Ganti lampu", tanggal: "2026-10-21", biaya: 150000, status: "Dijadwalkan" }
  }
};
const prepare = (name, args) => prepareAiAction({ name, args }, ctx);

describe("isIsoDate", () => {
  test("format & tanggal kalender", () => {
    assert.equal(isIsoDate("2026-10-22"), true);
    assert.equal(isIsoDate("2026-02-30"), false);
    assert.equal(isIsoDate("22/10/2026"), false);
    assert.equal(isIsoDate(""), false);
    assert.equal(isIsoDate(undefined), false);
  });
});

describe("prepareAiAction: barang", () => {
  test("ubah barang: hanya field yang berubah, payload lengkap", () => {
    const a = prepare("usulkanUbahBarang", { barangId: "b2", kondisi: "Rusak Ringan", jumlah: 5 });
    assert.equal(a.kind, "update");
    assert.equal(a.node, "inventaris");
    assert.equal(a.key, "b2");
    assert.deepEqual(a.errors, []);
    assert.deepEqual(a.rows, [{ field: "kondisi", label: "Kondisi", before: "Baik", after: "Rusak Ringan" }]);
    assert.deepEqual(a.payload, { namaBarang: "Laptop", kategori: "Elektronik", jumlah: 5, kondisi: "Rusak Ringan", lokasi: "Lab 2" });
  });

  test("ubah barang: nilai di luar pilihan & tanpa perubahan ditolak", () => {
    assert.deepEqual(prepare("usulkanUbahBarang", { barangId: "b2", kondisi: "Hancur" }).errors, ['Kondisi "Hancur" tidak dikenal.']);
    assert.deepEqual(prepare("usulkanUbahBarang", { barangId: "b2", jumlah: 0 }).errors, ["Jumlah harus bilangan bulat minimal 1."]);
    assert.deepEqual(prepare("usulkanUbahBarang", { barangId: "b2", lokasi: "Lab 2" }).errors, ["Tidak ada perubahan dibanding data saat ini."]);
  });

  test("ID yang tidak ada ditolak", () => {
    const a = prepare("usulkanUbahBarang", { barangId: "zzz", jumlah: 2 });
    assert.equal(a.payload, null);
    assert.deepEqual(a.errors, ['Barang dengan ID "zzz" tidak ditemukan.']);
    assert.deepEqual(prepare("usulkanHapusBarang", {}).errors, ['Barang dengan ID "-" tidak ditemukan.']);
  });

  test("hapus barang menyebutkan catatan terkait yang ikut terhapus", () => {
    const a = prepare("usulkanHapusBarang", { barangId: "b1" });
    assert.equal(a.kind, "delete");
    assert.deepEqual(a.errors, []);
    assert.deepEqual(a.related, { peminjaman: 1, perawatan: 1 });
    assert.equal(a.rows.find((r) => r.field === "namaBarang").before, "Proyektor");
  });
});

describe("prepareAiAction: peminjaman", () => {
  test("catat peminjaman: default tanggal pinjam hari ini, jumlah 1, status Dipinjam", () => {
    const a = prepare("usulkanPeminjaman", { barangId: "b2", peminjam: " Sari ", tanggalKembali: "2026-10-29" });
    assert.equal(a.kind, "create");
    assert.deepEqual(a.errors, []);
    assert.deepEqual(a.payload, {
      barangId: "b2", peminjam: "Sari", jumlah: 1, tanggalPinjam: "2026-10-22", tanggalKembali: "2026-10-29", status: "Dipinjam"
    });
    assert.equal(a.subject, "Sari · Laptop");
  });

  test("catat peminjaman: stok, format tanggal, dan barang divalidasi seperti form", () => {
    assert.deepEqual(
      prepare("usulkanPeminjaman", { barangId: "b1", peminjam: "Andi", jumlah: 2, tanggalKembali: "2026-10-30" }).errors,
      ["Jumlah melebihi unit yang tersedia (1 unit)."]
    );
    assert.deepEqual(
      prepare("usulkanPeminjaman", { barangId: "b2", peminjam: "Andi", tanggalKembali: "30 Oktober" }).errors,
      ["Batas kembali harus berformat YYYY-MM-DD."]
    );
    assert.deepEqual(
      prepare("usulkanPeminjaman", { barangId: "b2", peminjam: "Andi", tanggalKembali: "2026-10-01" }).errors,
      ["Batas kembali tidak boleh sebelum tanggal pinjam."]
    );
    assert.ok(prepare("usulkanPeminjaman", { barangId: "x", peminjam: "", tanggalKembali: "2026-10-29" }).errors
      .includes("Barang tidak ditemukan di inventaris."));
  });

  test("ubah peminjaman: tandai dikembalikan", () => {
    const a = prepare("usulkanUbahPeminjaman", { peminjamanId: "p1", status: "Dikembalikan" });
    assert.deepEqual(a.errors, []);
    assert.deepEqual(a.rows, [{ field: "status", label: "Status", before: "Dipinjam", after: "Dikembalikan" }]);
    assert.equal(a.payload.status, "Dikembalikan");
    assert.equal(a.payload.barangId, "b1");
  });

  test("ubah peminjaman: unit milik catatan itu sendiri tidak dihitung, barangId tidak bisa diganti", () => {
    assert.deepEqual(prepare("usulkanUbahPeminjaman", { peminjamanId: "p1", jumlah: 3 }).errors, []);
    assert.deepEqual(prepare("usulkanUbahPeminjaman", { peminjamanId: "p1", jumlah: 4 }).errors, ["Jumlah melebihi unit yang tersedia (3 unit)."]);
    assert.equal(prepare("usulkanUbahPeminjaman", { peminjamanId: "p1", barangId: "b2", jumlah: 1 }).payload.barangId, "b1");
    assert.deepEqual(prepare("usulkanUbahPeminjaman", { peminjamanId: "p1", status: "Hilang" }).errors, ['Status "Hilang" tidak dikenal.']);
  });

  test("hapus peminjaman", () => {
    const a = prepare("usulkanHapusPeminjaman", { peminjamanId: "p1" });
    assert.equal(a.kind, "delete");
    assert.equal(a.subject, "Budi · Proyektor");
    assert.deepEqual(prepare("usulkanHapusPeminjaman", { peminjamanId: "p9" }).errors, ['Catatan peminjaman dengan ID "p9" tidak ditemukan.']);
  });
});

describe("prepareAiAction: perawatan", () => {
  test("catat perawatan: default tanggal hari ini, biaya 0, status Dijadwalkan", () => {
    const a = prepare("usulkanPerawatan", { barangId: "b2", jenis: "Kalibrasi", deskripsi: "Kalibrasi layar" });
    assert.deepEqual(a.errors, []);
    assert.deepEqual(a.payload, {
      barangId: "b2", jenis: "Kalibrasi", deskripsi: "Kalibrasi layar", tanggal: "2026-10-22", biaya: 0, status: "Dijadwalkan"
    });
  });

  test("catat perawatan: jenis, deskripsi, biaya, dan tanggal divalidasi", () => {
    assert.deepEqual(
      prepare("usulkanPerawatan", { barangId: "b2", jenis: "Cuci", deskripsi: "", biaya: -5, tanggal: "besok" }).errors,
      ['Jenis "Cuci" tidak dikenal.', "Tanggal harus berformat YYYY-MM-DD.", "Deskripsi perawatan wajib diisi.", "Biaya harus bilangan bulat minimal 0."]
    );
  });

  test("ubah perawatan: status selesai & biaya", () => {
    const a = prepare("usulkanUbahPerawatan", { perawatanId: "r1", status: "Selesai", biaya: 175000 });
    assert.deepEqual(a.errors, []);
    assert.deepEqual(a.rows.map((r) => r.field), ["biaya", "status"]);
    assert.equal(a.payload.deskripsi, "Ganti lampu");
  });

  test("hapus perawatan & aksi tidak dikenal", () => {
    assert.deepEqual(prepare("usulkanHapusPerawatan", { perawatanId: "r1" }).errors, []);
    const unknown = prepareAiAction({ name: "hapusSemua", args: {} }, ctx);
    assert.equal(unknown.kind, "unknown");
    assert.deepEqual(unknown.errors, ['Aksi "hapusSemua" tidak dikenal.']);
  });
});

describe("buildActionHistoryNote", () => {
  test("memuat judul, subjek, ID, perubahan, dan status", () => {
    const note = buildActionHistoryNote(prepare("usulkanUbahPeminjaman", { peminjamanId: "p1", status: "Dikembalikan" }), "sudah disimpan");
    assert.equal(
      note,
      '[SISTEM] Kartu konfirmasi "Ubah Data Peminjaman" (Budi · Proyektor, ID p1) ditampilkan; perubahan: Status Dipinjam → Dikembalikan. Status: sudah disimpan.'
    );
  });
});
