import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildHapusBarangUpdates,
  escapeHtml,
  findRecordKeysByBarang,
  formatMarkdown,
  getInventoryContextSummary,
  hitungUnitDipinjam,
  isPeminjamanTerlambat,
  mapAuthErrorMessage,
  toIsoDate,
  validatePeminjaman,
  validatePerawatan,
  validateProposedItem
} from "../src/inventory-logic.mjs";

const KATEGORI = ["Elektronik", "ATK", "Perabot", "Hardware Jaringan"];
const KONDISI = ["Baik", "Rusak Ringan", "Rusak Berat"];
const validate = (raw) => validateProposedItem(raw, KATEGORI, KONDISI);

describe("escapeHtml", () => {
  test("meng-escape lima karakter berbahaya", () => {
    assert.equal(
      escapeHtml(`<a href="x" onclick='y'>&</a>`),
      "&lt;a href=&quot;x&quot; onclick=&#039;y&#039;&gt;&amp;&lt;/a&gt;"
    );
  });

  test("nilai kosong menghasilkan string kosong", () => {
    assert.equal(escapeHtml(""), "");
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });

  test("nilai non-string diubah menjadi string", () => {
    assert.equal(escapeHtml(5), "5");
  });
});

describe("validateProposedItem", () => {
  test("usulan valid lolos dan nilainya dirapikan (trim)", () => {
    const { item, errors } = validate({
      namaBarang: "  Proyektor Epson ",
      kategori: "Elektronik",
      jumlah: 2,
      kondisi: "Baik",
      lokasi: " Ruang Rapat  "
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(item, {
      namaBarang: "Proyektor Epson",
      kategori: "Elektronik",
      jumlah: 2,
      kondisi: "Baik",
      lokasi: "Ruang Rapat"
    });
  });

  test("jumlah berupa string angka diterima", () => {
    const { item, errors } = validate({ namaBarang: "Kursi", kategori: "Perabot", jumlah: "3", kondisi: "Baik", lokasi: "Gudang" });
    assert.deepEqual(errors, []);
    assert.equal(item.jumlah, 3);
  });

  for (const jumlah of [0, -1, 1.5, "abc", undefined, null, NaN]) {
    test(`jumlah ${String(jumlah)} ditolak`, () => {
      const { errors } = validate({ namaBarang: "Kursi", kategori: "Perabot", jumlah, kondisi: "Baik", lokasi: "Gudang" });
      assert.deepEqual(errors, ["jumlah harus bilangan bulat minimal 1"]);
    });
  }

  test("kategori dan kondisi di luar pilihan ditolak", () => {
    const { errors } = validate({ namaBarang: "Meja", kategori: "Furnitur", jumlah: 1, kondisi: "Hancur", lokasi: "Gudang" });
    assert.deepEqual(errors, ['kategori "Furnitur" tidak dikenal', 'kondisi "Hancur" tidak dikenal']);
  });

  test("nama dan lokasi kosong ditolak", () => {
    const { errors } = validate({ namaBarang: "   ", kategori: "ATK", jumlah: 1, kondisi: "Baik", lokasi: "" });
    assert.deepEqual(errors, ["nama barang kosong", "lokasi kosong"]);
  });

  test("input kosong total menghasilkan lima kesalahan, bukan crash", () => {
    assert.equal(validate(undefined).errors.length, 5);
    assert.equal(validate(null).errors.length, 5);
  });

  test("memakai daftar pilihan yang diberikan, bukan daftar tetap", () => {
    const { errors } = validateProposedItem(
      { namaBarang: "X", kategori: "Lain", jumlah: 1, kondisi: "Bagus", lokasi: "Y" },
      ["Lain"],
      ["Bagus"]
    );
    assert.deepEqual(errors, []);
  });
});

describe("getInventoryContextSummary", () => {
  const KOSONG = "Saat ini database inventaris masih kosong atau belum ada item yang terdaftar.";

  test("data kosong atau tidak ada", () => {
    assert.equal(getInventoryContextSummary({}), KOSONG);
    assert.equal(getInventoryContextSummary(undefined), KOSONG);
  });

  const data = {
    k1: { namaBarang: "Laptop", kategori: "Elektronik", jumlah: 5, kondisi: "Baik", lokasi: "Lab 1", createdBy: "a@x.com" },
    k2: { namaBarang: "Proyektor", kategori: "Elektronik", jumlah: 2, kondisi: "Rusak Ringan", lokasi: " Lab 1 " },
    k3: { namaBarang: "Kursi", kategori: "Perabot", jumlah: "10", kondisi: "Rusak Berat", lokasi: "Gudang" },
    k4: {}
  };
  const summary = getInventoryContextSummary(data);

  test("statistik total dan per kondisi", () => {
    assert.match(summary, /- Total Jenis Barang: 4 item/);
    assert.match(summary, /- Total Unit Fisik: 17 unit/);
    assert.match(summary, /- Kondisi Baik: 5 unit/);
    assert.match(summary, /- Kondisi Rusak Ringan: 2 unit/);
    assert.match(summary, /- Kondisi Rusak Berat: 10 unit/);
  });

  test("barang dikelompokkan per ruangan (lokasi di-trim)", () => {
    assert.ok(
      summary.includes('• Ruangan/Lokasi "Lab 1": Laptop (5 unit, kondisi: Baik); Proyektor (2 unit, kondisi: Rusak Ringan)')
    );
    assert.ok(summary.includes('• Ruangan/Lokasi "Gudang": Kursi (10 unit, kondisi: Rusak Berat)'));
  });

  test("daftar lengkap memuat ID dan petugas", () => {
    assert.ok(
      summary.includes("- [ID: k1] Laptop | Kategori: Elektronik | Jumlah: 5 Unit | Kondisi: Baik | Lokasi: Lab 1 | Petugas: a@x.com")
    );
  });

  test("field yang hilang memakai nilai bawaan", () => {
    assert.ok(
      summary.includes(
        "- [ID: k4] Tanpa Nama | Kategori: Umum | Jumlah: 0 Unit | Kondisi: Baik | Lokasi: Lokasi Belum Ditentukan | Petugas: -"
      )
    );
  });
});

describe("mapAuthErrorMessage", () => {
  test("kredensial salah dipetakan ke satu pesan", () => {
    const expected = "Email atau kata sandi yang Anda masukkan salah.";
    for (const code of ["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"]) {
      assert.equal(mapAuthErrorMessage(code), expected);
    }
  });

  test("kode lain dipetakan ke pesan berbahasa Indonesia", () => {
    assert.match(mapAuthErrorMessage("auth/email-already-in-use"), /sudah terdaftar/);
    assert.match(mapAuthErrorMessage("auth/weak-password"), /Minimal 6 karakter/);
    assert.match(mapAuthErrorMessage("auth/network-request-failed"), /koneksi internet/);
  });

  test("kode tidak dikenal ditampilkan apa adanya", () => {
    assert.equal(mapAuthErrorMessage("auth/xyz"), "Terjadi kesalahan autentikasi: auth/xyz");
  });
});

describe("formatMarkdown", () => {
  test("input kosong", () => {
    assert.equal(formatMarkdown(""), "");
    assert.equal(formatMarkdown(null), "");
  });

  test("HTML dari AI tidak lolos (pencegahan XSS)", () => {
    const out = formatMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    assert.ok(!out.includes("<script"));
    assert.ok(!out.includes("<img"));
    assert.ok(out.includes("&lt;script&gt;"));
  });

  test("format dasar markdown dirender", () => {
    assert.ok(formatMarkdown("**tebal**").includes("<strong>tebal</strong>"));
    assert.ok(formatMarkdown("# Judul").includes("<h5"));
    assert.ok(formatMarkdown("pakai `kode` ini").includes("<code"));
  });

  test("daftar berbutir menjadi ul/li", () => {
    const out = formatMarkdown("- satu\n- dua");
    assert.ok(out.includes("<ul"));
    assert.equal(out.match(/<li/g).length, 2);
  });
});

describe("toIsoDate", () => {
  test("memakai tanggal lokal dengan nol di depan", () => {
    assert.equal(toIsoDate(new Date(2026, 0, 5)), "2026-01-05");
    assert.equal(toIsoDate(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
  });
});

describe("peminjaman & perawatan", () => {
  const inventory = {
    b1: { namaBarang: "Proyektor", jumlah: 3 },
    b2: { namaBarang: "Laptop", jumlah: "5" }
  };
  const peminjaman = {
    p1: { barangId: "b1", jumlah: 2, status: "Dipinjam", tanggalKembali: "2026-10-20" },
    p2: { barangId: "b1", jumlah: 1, status: "Dikembalikan", tanggalKembali: "2026-10-01" },
    p3: { barangId: "b2", jumlah: "1", status: "Dipinjam", tanggalKembali: "2026-10-25" }
  };
  const perawatan = {
    r1: { barangId: "b1" },
    r2: { barangId: "b2" },
    r3: { barangId: "b1" }
  };

  test("findRecordKeysByBarang mencari catatan per barang", () => {
    assert.deepEqual(findRecordKeysByBarang(peminjaman, "b1"), ["p1", "p2"]);
    assert.deepEqual(findRecordKeysByBarang(perawatan, "b1"), ["r1", "r3"]);
    assert.deepEqual(findRecordKeysByBarang(undefined, "b1"), []);
  });

  test("buildHapusBarangUpdates menghapus barang beserta seluruh catatan terkait", () => {
    assert.deepEqual(buildHapusBarangUpdates("b1", peminjaman, perawatan), {
      "inventaris/b1": null,
      "peminjaman/p1": null,
      "peminjaman/p2": null,
      "perawatan/r1": null,
      "perawatan/r3": null
    });
    assert.deepEqual(buildHapusBarangUpdates("b9", peminjaman, perawatan), { "inventaris/b9": null });
  });

  test("hitungUnitDipinjam hanya menghitung yang masih dipinjam", () => {
    assert.equal(hitungUnitDipinjam(peminjaman, "b1"), 2);
    assert.equal(hitungUnitDipinjam(peminjaman, "b2"), 1);
    assert.equal(hitungUnitDipinjam(peminjaman, "b1", "p1"), 0);
    assert.equal(hitungUnitDipinjam({}, "b1"), 0);
  });

  test("isPeminjamanTerlambat", () => {
    assert.equal(isPeminjamanTerlambat(peminjaman.p1, "2026-10-21"), true);
    assert.equal(isPeminjamanTerlambat(peminjaman.p1, "2026-10-20"), false, "hari batas kembali belum terlambat");
    assert.equal(isPeminjamanTerlambat(peminjaman.p2, "2026-10-21"), false, "sudah dikembalikan");
    assert.equal(isPeminjamanTerlambat(undefined, "2026-10-21"), false);
  });

  const pinjamValid = {
    barangId: "b1", peminjam: "Budi", jumlah: 1,
    tanggalPinjam: "2026-10-21", tanggalKembali: "2026-10-28", status: "Dipinjam"
  };

  test("validatePeminjaman menerima data valid", () => {
    assert.deepEqual(validatePeminjaman(pinjamValid, inventory, peminjaman), []);
  });

  test("validatePeminjaman menolak jumlah melebihi unit tersedia", () => {
    assert.deepEqual(validatePeminjaman({ ...pinjamValid, jumlah: 2 }, inventory, peminjaman), [
      "Jumlah melebihi unit yang tersedia (1 unit)."
    ]);
  });

  test("validatePeminjaman: saat edit, unit catatan itu sendiri tidak dihitung", () => {
    assert.deepEqual(validatePeminjaman({ ...pinjamValid, jumlah: 3 }, inventory, peminjaman, "p1"), []);
  });

  test("validatePeminjaman: status Dikembalikan tidak dibatasi stok", () => {
    assert.deepEqual(validatePeminjaman({ ...pinjamValid, jumlah: 3, status: "Dikembalikan" }, inventory, peminjaman), []);
  });

  test("validatePeminjaman menolak barang tidak dikenal, peminjam kosong, dan tanggal terbalik", () => {
    const errors = validatePeminjaman(
      { ...pinjamValid, barangId: "x", peminjam: "", jumlah: 0, tanggalKembali: "2026-10-20" },
      inventory,
      peminjaman
    );
    assert.deepEqual(errors, [
      "Barang tidak ditemukan di inventaris.",
      "Nama peminjam wajib diisi.",
      "Jumlah minimal 1 unit.",
      "Batas kembali tidak boleh sebelum tanggal pinjam."
    ]);
  });

  test("validatePerawatan", () => {
    const valid = { barangId: "b2", deskripsi: "Ganti baterai", biaya: 0 };
    assert.deepEqual(validatePerawatan(valid, inventory), []);
    assert.deepEqual(validatePerawatan({ barangId: "x", deskripsi: "", biaya: -1 }, inventory), [
      "Barang tidak ditemukan di inventaris.",
      "Deskripsi perawatan wajib diisi.",
      "Biaya harus bilangan bulat minimal 0."
    ]);
    assert.deepEqual(validatePerawatan({ ...valid, biaya: 1.5 }, inventory), ["Biaya harus bilangan bulat minimal 0."]);
  });
});
