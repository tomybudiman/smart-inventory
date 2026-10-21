// Penyusunan & validasi usulan aksi asisten AI (function calling) untuk kartu konfirmasi:
// ubah/hapus barang, serta catat/ubah/hapus peminjaman dan perawatan.
// Murni (tanpa DOM/Firebase) agar dapat diuji. Data baru ditulis setelah petugas menekan tombol konfirmasi,
// dan usulan divalidasi ulang dengan data terbaru tepat sebelum disimpan.
import { findRecordKeysByBarang, validatePeminjaman, validatePerawatan, validateProposedItem } from "./inventory-logic.mjs";

const BARANG_FIELDS = ["namaBarang", "kategori", "jumlah", "kondisi", "lokasi"];
const PEMINJAMAN_FIELDS = ["barangId", "peminjam", "jumlah", "tanggalPinjam", "tanggalKembali", "status"];
const PERAWATAN_FIELDS = ["barangId", "jenis", "deskripsi", "tanggal", "biaya", "status"];

export const FIELD_LABELS = {
  namaBarang: "Nama barang",
  kategori: "Kategori",
  jumlah: "Jumlah",
  kondisi: "Kondisi",
  lokasi: "Lokasi",
  barangId: "Barang",
  peminjam: "Peminjam",
  tanggalPinjam: "Tanggal pinjam",
  tanggalKembali: "Batas kembali",
  status: "Status",
  jenis: "Jenis",
  deskripsi: "Deskripsi",
  tanggal: "Tanggal",
  biaya: "Biaya"
};

// YYYY-MM-DD yang benar-benar ada di kalender
export function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const pick = (record, fields) => Object.fromEntries(fields.map((f) => [f, record?.[f]]));

// Hanya field yang benar-benar diisi AI (null/undefined diabaikan)
const provided = (args, fields) =>
  Object.fromEntries(fields.filter((f) => args?.[f] !== undefined && args?.[f] !== null).map((f) => [f, args[f]]));

const rowsOf = (record, fields, side) => fields.map((field) => ({ field, label: FIELD_LABELS[field], [side]: record[field] }));

const diffRows = (before, after, fields) =>
  fields
    .filter((f) => String(before[f] ?? "") !== String(after[f] ?? ""))
    .map((field) => ({ field, label: FIELD_LABELS[field], before: before[field], after: after[field] }));

// Pesan dari validator form ("nama barang kosong") dijadikan kalimat
const sentence = (msg) => msg.charAt(0).toUpperCase() + msg.slice(1) + (msg.endsWith(".") ? "" : ".");

const namaBarang = (ctx, id) => ctx.inventoryData?.[id]?.namaBarang || "(barang tidak ditemukan)";

function normalizePeminjaman(data) {
  return {
    barangId: String(data.barangId ?? "").trim(),
    peminjam: String(data.peminjam ?? "").trim(),
    jumlah: Number(data.jumlah),
    tanggalPinjam: String(data.tanggalPinjam ?? "").trim(),
    tanggalKembali: String(data.tanggalKembali ?? "").trim(),
    status: String(data.status ?? "").trim()
  };
}

function checkPeminjaman(data, ctx, editKey) {
  const errors = [];
  if (!ctx.options.statusPeminjaman.includes(data.status)) errors.push(`Status "${data.status || "-"}" tidak dikenal.`);
  const datesValid = isIsoDate(data.tanggalPinjam) && isIsoDate(data.tanggalKembali);
  if (!isIsoDate(data.tanggalPinjam)) errors.push("Tanggal pinjam harus berformat YYYY-MM-DD.");
  if (!isIsoDate(data.tanggalKembali)) errors.push("Batas kembali harus berformat YYYY-MM-DD.");
  // Urutan tanggal hanya dibandingkan jika keduanya valid (tanggal kosong dianggap sama)
  const forCheck = datesValid ? data : { ...data, tanggalPinjam: "", tanggalKembali: "" };
  return [...errors, ...validatePeminjaman(forCheck, ctx.inventoryData, ctx.peminjamanData, editKey)];
}

function normalizePerawatan(data) {
  return {
    barangId: String(data.barangId ?? "").trim(),
    jenis: String(data.jenis ?? "").trim(),
    deskripsi: String(data.deskripsi ?? "").trim(),
    tanggal: String(data.tanggal ?? "").trim(),
    biaya: Number(data.biaya),
    status: String(data.status ?? "").trim()
  };
}

function checkPerawatan(data, ctx) {
  const errors = [];
  if (!ctx.options.jenisPerawatan.includes(data.jenis)) errors.push(`Jenis "${data.jenis || "-"}" tidak dikenal.`);
  if (!ctx.options.statusPerawatan.includes(data.status)) errors.push(`Status "${data.status || "-"}" tidak dikenal.`);
  if (!isIsoDate(data.tanggal)) errors.push("Tanggal harus berformat YYYY-MM-DD.");
  return [...errors, ...validatePerawatan(data, ctx.inventoryData)];
}

function notFound(kind, node, title, key, what) {
  return { kind, node, key, title, subject: key || "-", rows: [], payload: null, errors: [`${what} dengan ID "${key || "-"}" tidak ditemukan.`] };
}

function withChanges(action) {
  if (action.rows.length === 0) action.errors.push("Tidak ada perubahan dibanding data saat ini.");
  return action;
}

/**
 * Susun usulan aksi dari satu functionCall Gemini.
 * ctx: { inventoryData, peminjamanData, perawatanData, today (YYYY-MM-DD),
 *        options: { kategori, kondisi, statusPeminjaman, jenisPerawatan, statusPerawatan } }
 * Hasil: { kind: create|update|delete, node, key, title, subject, rows, payload, errors, related? }
 * rows: untuk create berisi { after }, update { before, after } (hanya yang berubah), delete { before }.
 */
export function prepareAiAction(call, ctx) {
  const args = call?.args || {};

  switch (call?.name) {
    case "usulkanUbahBarang": {
      const key = String(args.barangId ?? "");
      const target = ctx.inventoryData?.[key];
      if (!target) return notFound("update", "inventaris", "Ubah Data Barang", key, "Barang");
      const before = pick(target, BARANG_FIELDS);
      const { item, errors } = validateProposedItem(
        { ...before, ...provided(args, BARANG_FIELDS) }, ctx.options.kategori, ctx.options.kondisi
      );
      return withChanges({
        kind: "update", node: "inventaris", key, title: "Ubah Data Barang", subject: target.namaBarang,
        rows: diffRows(before, item, BARANG_FIELDS), payload: item, errors: errors.map(sentence)
      });
    }

    case "usulkanHapusBarang": {
      const key = String(args.barangId ?? "");
      const target = ctx.inventoryData?.[key];
      if (!target) return notFound("delete", "inventaris", "Hapus Barang", key, "Barang");
      return {
        kind: "delete", node: "inventaris", key, title: "Hapus Barang", subject: target.namaBarang,
        rows: rowsOf(target, BARANG_FIELDS, "before"), payload: null, errors: [],
        related: {
          peminjaman: findRecordKeysByBarang(ctx.peminjamanData, key).length,
          perawatan: findRecordKeysByBarang(ctx.perawatanData, key).length
        }
      };
    }

    case "usulkanPeminjaman": {
      const data = normalizePeminjaman({
        ...args, jumlah: args.jumlah ?? 1, tanggalPinjam: args.tanggalPinjam || ctx.today, status: "Dipinjam"
      });
      return {
        kind: "create", node: "peminjaman", key: null, title: "Catat Peminjaman",
        subject: `${data.peminjam || "-"} · ${namaBarang(ctx, data.barangId)}`,
        rows: rowsOf(data, PEMINJAMAN_FIELDS, "after"), payload: data, errors: checkPeminjaman(data, ctx, null)
      };
    }

    case "usulkanUbahPeminjaman": {
      const key = String(args.peminjamanId ?? "");
      const target = ctx.peminjamanData?.[key];
      if (!target) return notFound("update", "peminjaman", "Ubah Data Peminjaman", key, "Catatan peminjaman");
      const before = normalizePeminjaman(target);
      const data = normalizePeminjaman({ ...before, ...provided(args, PEMINJAMAN_FIELDS.filter((f) => f !== "barangId")) });
      return withChanges({
        kind: "update", node: "peminjaman", key, title: "Ubah Data Peminjaman",
        subject: `${before.peminjam || "-"} · ${namaBarang(ctx, before.barangId)}`,
        rows: diffRows(before, data, PEMINJAMAN_FIELDS), payload: data, errors: checkPeminjaman(data, ctx, key)
      });
    }

    case "usulkanHapusPeminjaman": {
      const key = String(args.peminjamanId ?? "");
      const target = ctx.peminjamanData?.[key];
      if (!target) return notFound("delete", "peminjaman", "Hapus Catatan Peminjaman", key, "Catatan peminjaman");
      const before = normalizePeminjaman(target);
      return {
        kind: "delete", node: "peminjaman", key, title: "Hapus Catatan Peminjaman",
        subject: `${before.peminjam || "-"} · ${namaBarang(ctx, before.barangId)}`,
        rows: rowsOf(before, PEMINJAMAN_FIELDS, "before"), payload: null, errors: []
      };
    }

    case "usulkanPerawatan": {
      const data = normalizePerawatan({
        ...args, tanggal: args.tanggal || ctx.today, biaya: args.biaya ?? 0, status: args.status || "Dijadwalkan"
      });
      return {
        kind: "create", node: "perawatan", key: null, title: "Catat Perawatan",
        subject: `${data.jenis || "-"} · ${namaBarang(ctx, data.barangId)}`,
        rows: rowsOf(data, PERAWATAN_FIELDS, "after"), payload: data, errors: checkPerawatan(data, ctx)
      };
    }

    case "usulkanUbahPerawatan": {
      const key = String(args.perawatanId ?? "");
      const target = ctx.perawatanData?.[key];
      if (!target) return notFound("update", "perawatan", "Ubah Data Perawatan", key, "Catatan perawatan");
      const before = normalizePerawatan(target);
      const data = normalizePerawatan({ ...before, ...provided(args, PERAWATAN_FIELDS.filter((f) => f !== "barangId")) });
      return withChanges({
        kind: "update", node: "perawatan", key, title: "Ubah Data Perawatan",
        subject: `${before.jenis || "-"} · ${namaBarang(ctx, before.barangId)}`,
        rows: diffRows(before, data, PERAWATAN_FIELDS), payload: data, errors: checkPerawatan(data, ctx)
      });
    }

    case "usulkanHapusPerawatan": {
      const key = String(args.perawatanId ?? "");
      const target = ctx.perawatanData?.[key];
      if (!target) return notFound("delete", "perawatan", "Hapus Catatan Perawatan", key, "Catatan perawatan");
      const before = normalizePerawatan(target);
      return {
        kind: "delete", node: "perawatan", key, title: "Hapus Catatan Perawatan",
        subject: `${before.jenis || "-"} · ${namaBarang(ctx, before.barangId)}`,
        rows: rowsOf(before, PERAWATAN_FIELDS, "before"), payload: null, errors: []
      };
    }

    default:
      return {
        kind: "unknown", node: null, key: null, title: "Aksi Tidak Dikenal", subject: call?.name || "-",
        rows: [], payload: null, errors: [`Aksi "${call?.name || "-"}" tidak dikenal.`]
      };
  }
}

// Catatan kartu untuk riwayat chat (teks, bukan functionCall) agar AI tahu status usulannya
export function buildActionHistoryNote(action, status) {
  const target = action.key ? `, ID ${action.key}` : "";
  const changes = action.kind === "update"
    ? `; perubahan: ${action.rows.map((r) => `${r.label} ${r.before ?? "-"} → ${r.after ?? "-"}`).join(", ") || "-"}`
    : "";
  return `[SISTEM] Kartu konfirmasi "${action.title}" (${action.subject}${target}) ditampilkan${changes}. Status: ${status}.`;
}
