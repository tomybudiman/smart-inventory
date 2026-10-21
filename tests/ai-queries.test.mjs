import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildAiDataContext, isReadTool, runAiQuery } from "../src/ai-queries.mjs";

const ctx = {
  today: "2026-10-22",
  inventoryData: {
    b1: { namaBarang: "Proyektor Epson", kategori: "Elektronik", jumlah: 3, kondisi: "Baik", lokasi: "Ruang Rapat" },
    b2: { namaBarang: "Laptop Asus", kategori: "Elektronik", jumlah: 5, kondisi: "Rusak Ringan", lokasi: "Lab Komputer 2" },
    b3: { namaBarang: "Kursi Lipat", kategori: "Perabot", jumlah: "10", kondisi: "Baik", lokasi: " Ruang Rapat " }
  },
  peminjamanData: {
    p1: { barangId: "b1", peminjam: "Budi Santoso", jumlah: 2, tanggalPinjam: "2026-10-10", tanggalKembali: "2026-10-19", status: "Dipinjam" },
    p2: { barangId: "b3", peminjam: "Sari", jumlah: 4, tanggalPinjam: "2026-10-21", tanggalKembali: "2026-10-28", status: "Dipinjam" },
    p3: { barangId: "b2", peminjam: "Andi", jumlah: 1, tanggalPinjam: "2026-09-01", tanggalKembali: "2026-09-05", status: "Dikembalikan" }
  },
  perawatanData: {
    r1: { barangId: "b1", jenis: "Perbaikan", deskripsi: "Ganti lampu", tanggal: "2026-10-15", biaya: 150000, status: "Selesai" },
    r2: { barangId: "b2", jenis: "Servis Rutin", deskripsi: "Bersihkan kipas", tanggal: "2026-09-20", biaya: 50000, status: "Dijadwalkan" }
  }
};
const run = (name, args) => runAiQuery(name, args, ctx);

describe("isReadTool", () => {
  test("hanya empat fungsi baca", () => {
    assert.equal(isReadTool("cariBarang"), true);
    assert.equal(isReadTool("rekapInventaris"), true);
    assert.equal(isReadTool("usulkanUbahBarang"), false);
  });
});

describe("cariBarang", () => {
  test("tanpa filter: semua barang, total unit & unit tersedia dihitung kode", () => {
    const r = run("cariBarang", {});
    assert.equal(r.jumlahHasil, 3);
    assert.equal(r.totalUnit, 18);
    assert.equal(r.totalUnitTersedia, 12);
    assert.deepEqual(r.daftar.map((b) => b.namaBarang), ["Kursi Lipat", "Laptop Asus", "Proyektor Epson"]);
    assert.deepEqual(r.daftar.find((b) => b.id === "b1"), {
      id: "b1", namaBarang: "Proyektor Epson", kategori: "Elektronik", jumlah: 3, kondisi: "Baik",
      lokasi: "Ruang Rapat", unitDipinjam: 2, unitTersedia: 1
    });
  });

  test("filter kata (nama/lokasi), kategori, kondisi, lokasi; tidak peka huruf besar", () => {
    assert.deepEqual(run("cariBarang", { kata: "LAPTOP" }).daftar.map((b) => b.id), ["b2"]);
    assert.deepEqual(run("cariBarang", { kata: "rapat" }).daftar.map((b) => b.id), ["b3", "b1"]);
    assert.equal(run("cariBarang", { kategori: "elektronik", kondisi: "Baik" }).jumlahHasil, 1);
    assert.equal(run("cariBarang", { lokasi: "lab" }).totalUnit, 5);
    assert.equal(run("cariBarang", { kata: "tidak ada" }).jumlahHasil, 0);
  });

  test("batas memotong daftar tetapi total tetap dari semua hasil", () => {
    const r = run("cariBarang", { batas: 1 });
    assert.equal(r.daftar.length, 1);
    assert.equal(r.dipotong, true);
    assert.equal(r.totalUnit, 18);
  });
});

describe("cariPeminjaman", () => {
  test("terlambat beserta jumlah hari keterlambatan", () => {
    const r = run("cariPeminjaman", { terlambat: true });
    assert.equal(r.jumlahHasil, 1);
    assert.equal(r.daftar[0].peminjam, "Budi Santoso");
    assert.equal(r.daftar[0].namaBarang, "Proyektor Epson");
    assert.equal(r.daftar[0].hariTerlambat, 3);
  });

  test("status, peminjam, nama barang, dan rentang tanggal pinjam", () => {
    assert.equal(run("cariPeminjaman", { status: "Dipinjam" }).totalUnit, 6);
    assert.deepEqual(run("cariPeminjaman", { peminjam: "sari" }).daftar.map((p) => p.id), ["p2"]);
    assert.deepEqual(run("cariPeminjaman", { kataBarang: "laptop" }).daftar.map((p) => p.id), ["p3"]);
    assert.deepEqual(run("cariPeminjaman", { dariTanggal: "2026-10-01", sampaiTanggal: "2026-10-31" }).daftar.map((p) => p.id), ["p2", "p1"]);
    assert.equal(run("cariPeminjaman", { terlambat: false, status: "Dipinjam" }).jumlahHasil, 1);
  });
});

describe("cariPerawatan", () => {
  test("total biaya & filter", () => {
    assert.equal(run("cariPerawatan", {}).totalBiaya, 200000);
    assert.equal(run("cariPerawatan", { status: "Selesai" }).totalBiaya, 150000);
    assert.deepEqual(run("cariPerawatan", { jenis: "servis rutin" }).daftar.map((r) => r.id), ["r2"]);
    assert.deepEqual(run("cariPerawatan", { kata: "lampu" }).daftar.map((r) => r.id), ["r1"]);
    assert.equal(run("cariPerawatan", { dariTanggal: "2026-10-01" }).jumlahHasil, 1);
  });
});

describe("rekapInventaris", () => {
  test("per kategori", () => {
    assert.deepEqual(run("rekapInventaris", { kelompokkan: "kategori" }).kelompok, [
      { kelompok: "Elektronik", jumlahBarang: 2, totalUnit: 8, unitDipinjam: 2, unitTersedia: 6 },
      { kelompok: "Perabot", jumlahBarang: 1, totalUnit: 10, unitDipinjam: 4, unitTersedia: 6 }
    ]);
  });

  test("per lokasi (spasi dirapikan) dan dengan filter", () => {
    const r = run("rekapInventaris", { kelompokkan: "lokasi", kondisi: "Baik" });
    assert.equal(r.jumlahBarang, 2);
    assert.deepEqual(r.kelompok, [{ kelompok: "Ruang Rapat", jumlahBarang: 2, totalUnit: 13, unitDipinjam: 6, unitTersedia: 7 }]);
  });

  test("kelompokkan tidak dikenal memakai kategori; fungsi tidak dikenal mengembalikan error", () => {
    assert.equal(run("rekapInventaris", { kelompokkan: "warna" }).kelompokkan, "kategori");
    assert.deepEqual(run("hapusSemua", {}), { error: 'Fungsi "hapusSemua" tidak dikenal.' });
  });
});

describe("buildAiDataContext", () => {
  test("data kecil: daftar lengkap seperti sebelumnya", () => {
    const text = buildAiDataContext(ctx);
    assert.ok(text.includes("=== DATA INVENTARIS REALTIME SAAT INI ==="));
    assert.ok(text.includes("[ID: b1] Proyektor Epson"));
    assert.ok(text.includes("Peminjam: Budi Santoso"));
  });

  test("data besar: hanya ringkasan dengan angka dari fungsi baca", () => {
    const text = buildAiDataContext(ctx, 5);
    assert.ok(text.startsWith("=== RINGKASAN DATA REALTIME ==="));
    assert.ok(!text.includes("[ID:"));
    assert.ok(text.includes("(3 barang, 3 peminjaman, 2 perawatan)"));
    assert.ok(text.includes("- Barang: 3 jenis, 18 unit (12 unit tersedia)"));
    assert.ok(text.includes("- Unit per kondisi: Baik 13 unit, Rusak Ringan 5 unit"));
    assert.ok(text.includes("- Peminjaman aktif: 2 catatan (6 unit), terlambat dikembalikan: 1 catatan"));
    assert.ok(text.includes("- Perawatan: 2 catatan (1 selesai), total biaya: Rp 200.000"));
  });
});
