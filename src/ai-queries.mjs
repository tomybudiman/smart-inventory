// Fungsi baca untuk asisten AI (function calling). Dijalankan aplikasi pada data realtime yang sama dengan tabel,
// sehingga angka (jumlah, total, rekap) dihitung oleh kode, bukan ditebak model. Murni agar dapat diuji.
import {
  getInventoryContextSummary,
  getPeminjamanPerawatanContextSummary,
  hitungUnitDipinjam,
  isPeminjamanTerlambat
} from "./inventory-logic.mjs";

export const READ_TOOL_NAMES = ["cariBarang", "cariPeminjaman", "cariPerawatan", "rekapInventaris"];

export function isReadTool(name) {
  return READ_TOOL_NAMES.includes(name);
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const limitOf = (n) => Math.min(Math.max(parseInt(n, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
const norm = (value) => String(value ?? "").trim().toLowerCase();
const contains = (text, query) => norm(text).includes(norm(query));
const given = (value) => value !== undefined && value !== null && value !== "";
const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
const rupiah = (n) => `Rp ${(Number(n) || 0).toLocaleString("id-ID")}`;

// Selisih hari antara dua tanggal YYYY-MM-DD
function daysBetween(from, to) {
  const utc = (d) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86400000);
}

// Daftar dipotong agar respons ke model tetap ringkas; total tetap dihitung dari semua hasil
function withLimit(rows, args) {
  const limit = limitOf(args.batas);
  return { daftar: rows.slice(0, limit), dipotong: rows.length > limit };
}

function barangRows(args, ctx) {
  return Object.entries(ctx.inventoryData || {})
    .filter(([, b]) =>
      (!given(args.kata) || contains(b.namaBarang, args.kata) || contains(b.lokasi, args.kata)) &&
      (!given(args.kategori) || norm(b.kategori) === norm(args.kategori)) &&
      (!given(args.kondisi) || norm(b.kondisi) === norm(args.kondisi)) &&
      (!given(args.lokasi) || contains(b.lokasi, args.lokasi)))
    .map(([id, b]) => {
      const jumlah = parseInt(b.jumlah, 10) || 0;
      const unitDipinjam = hitungUnitDipinjam(ctx.peminjamanData, id);
      return {
        id,
        namaBarang: b.namaBarang || "",
        kategori: b.kategori || "",
        jumlah,
        kondisi: b.kondisi || "",
        lokasi: (b.lokasi || "").trim(),
        unitDipinjam,
        unitTersedia: Math.max(jumlah - unitDipinjam, 0)
      };
    })
    .sort((a, b) => a.namaBarang.localeCompare(b.namaBarang, "id"));
}

function peminjamanRows(args, ctx) {
  const namaBarang = (id) => ctx.inventoryData?.[id]?.namaBarang || "(barang tidak ditemukan)";
  return Object.entries(ctx.peminjamanData || {})
    .map(([id, p]) => {
      const terlambat = isPeminjamanTerlambat(p, ctx.today);
      return {
        id,
        barangId: p.barangId || "",
        namaBarang: namaBarang(p.barangId),
        peminjam: p.peminjam || "",
        jumlah: parseInt(p.jumlah, 10) || 0,
        tanggalPinjam: p.tanggalPinjam || "",
        tanggalKembali: p.tanggalKembali || "",
        status: p.status || "",
        terlambat,
        hariTerlambat: terlambat ? daysBetween(p.tanggalKembali, ctx.today) : 0
      };
    })
    .filter((p) =>
      (!given(args.status) || norm(p.status) === norm(args.status)) &&
      (typeof args.terlambat !== "boolean" || p.terlambat === args.terlambat) &&
      (!given(args.peminjam) || contains(p.peminjam, args.peminjam)) &&
      (!given(args.barangId) || p.barangId === args.barangId) &&
      (!given(args.kataBarang) || contains(p.namaBarang, args.kataBarang)) &&
      (!given(args.dariTanggal) || p.tanggalPinjam >= args.dariTanggal) &&
      (!given(args.sampaiTanggal) || p.tanggalPinjam <= args.sampaiTanggal))
    .sort((a, b) => b.tanggalPinjam.localeCompare(a.tanggalPinjam));
}

function perawatanRows(args, ctx) {
  const namaBarang = (id) => ctx.inventoryData?.[id]?.namaBarang || "(barang tidak ditemukan)";
  return Object.entries(ctx.perawatanData || {})
    .map(([id, r]) => ({
      id,
      barangId: r.barangId || "",
      namaBarang: namaBarang(r.barangId),
      jenis: r.jenis || "",
      tanggal: r.tanggal || "",
      biaya: Number(r.biaya) || 0,
      status: r.status || "",
      deskripsi: r.deskripsi || ""
    }))
    .filter((r) =>
      (!given(args.status) || norm(r.status) === norm(args.status)) &&
      (!given(args.jenis) || norm(r.jenis) === norm(args.jenis)) &&
      (!given(args.barangId) || r.barangId === args.barangId) &&
      (!given(args.kata) || contains(r.namaBarang, args.kata) || contains(r.deskripsi, args.kata)) &&
      (!given(args.dariTanggal) || r.tanggal >= args.dariTanggal) &&
      (!given(args.sampaiTanggal) || r.tanggal <= args.sampaiTanggal))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/**
 * Jalankan satu fungsi baca. ctx: { inventoryData, peminjamanData, perawatanData, today (YYYY-MM-DD) }.
 * Hasilnya objek JSON yang dikirim kembali ke Gemini sebagai functionResponse.
 */
export function runAiQuery(name, args, ctx) {
  const params = args || {};
  switch (name) {
    case "cariBarang": {
      const rows = barangRows(params, ctx);
      return { jumlahHasil: rows.length, totalUnit: sum(rows, "jumlah"), totalUnitTersedia: sum(rows, "unitTersedia"), ...withLimit(rows, params) };
    }
    case "cariPeminjaman": {
      const rows = peminjamanRows(params, ctx);
      return { jumlahHasil: rows.length, totalUnit: sum(rows, "jumlah"), ...withLimit(rows, params) };
    }
    case "cariPerawatan": {
      const rows = perawatanRows(params, ctx);
      return { jumlahHasil: rows.length, totalBiaya: sum(rows, "biaya"), ...withLimit(rows, params) };
    }
    case "rekapInventaris": {
      const by = ["kategori", "kondisi", "lokasi"].includes(params.kelompokkan) ? params.kelompokkan : "kategori";
      const rows = barangRows(params, ctx);
      const groups = new Map();
      for (const row of rows) {
        const key = row[by] || "(kosong)";
        const group = groups.get(key) || { kelompok: key, jumlahBarang: 0, totalUnit: 0, unitDipinjam: 0, unitTersedia: 0 };
        group.jumlahBarang++;
        group.totalUnit += row.jumlah;
        group.unitDipinjam += row.unitDipinjam;
        group.unitTersedia += row.unitTersedia;
        groups.set(key, group);
      }
      return {
        kelompokkan: by,
        jumlahBarang: rows.length,
        totalUnit: sum(rows, "jumlah"),
        kelompok: [...groups.values()].sort((a, b) => a.kelompok.localeCompare(b.kelompok, "id"))
      };
    }
    default:
      return { error: `Fungsi "${name}" tidak dikenal.` };
  }
}

/**
 * Teks data untuk instruksi sistem Gemini. Data kecil: daftar lengkap (cepat, ID langsung tersedia).
 * Data besar: hanya ringkasan; detail, angka, dan ID diambil lewat fungsi baca.
 */
export function buildAiDataContext(ctx, maxRecords = 60) {
  const counts = [ctx.inventoryData, ctx.peminjamanData, ctx.perawatanData].map((data) => Object.keys(data || {}).length);
  if (counts[0] + counts[1] + counts[2] <= maxRecords) {
    return `=== DATA INVENTARIS REALTIME SAAT INI ===
${getInventoryContextSummary(ctx.inventoryData)}
=========================================

=== DATA PEMINJAMAN & PERAWATAN REALTIME ===
${getPeminjamanPerawatanContextSummary(ctx.inventoryData, ctx.peminjamanData, ctx.perawatanData, ctx.today)}
============================================`;
  }

  const barang = runAiQuery("cariBarang", { batas: 1 }, ctx);
  const kondisi = runAiQuery("rekapInventaris", { kelompokkan: "kondisi" }, ctx).kelompok
    .map((g) => `${g.kelompok} ${g.totalUnit} unit`).join(", ");
  const aktif = runAiQuery("cariPeminjaman", { status: "Dipinjam", batas: 1 }, ctx);
  const terlambat = runAiQuery("cariPeminjaman", { terlambat: true, batas: 1 }, ctx);
  const perawatan = runAiQuery("cariPerawatan", { batas: 1 }, ctx);
  const selesai = runAiQuery("cariPerawatan", { status: "Selesai", batas: 1 }, ctx);

  return `=== RINGKASAN DATA REALTIME ===
Tanggal hari ini: ${ctx.today}
Daftar lengkap tidak disertakan karena data besar (${counts[0]} barang, ${counts[1]} peminjaman, ${counts[2]} perawatan).
Gunakan fungsi cariBarang, cariPeminjaman, cariPerawatan, atau rekapInventaris untuk detail, angka, dan ID.
- Barang: ${barang.jumlahHasil} jenis, ${barang.totalUnit} unit (${barang.totalUnitTersedia} unit tersedia)
- Unit per kondisi: ${kondisi || "-"}
- Peminjaman aktif: ${aktif.jumlahHasil} catatan (${aktif.totalUnit} unit), terlambat dikembalikan: ${terlambat.jumlahHasil} catatan
- Perawatan: ${perawatan.jumlahHasil} catatan (${selesai.jumlahHasil} selesai), total biaya: ${rupiah(perawatan.totalBiaya)}
===============================`;
}
