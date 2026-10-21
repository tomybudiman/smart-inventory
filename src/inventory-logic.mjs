// Logika murni Smart Inventory (tanpa DOM dan tanpa Firebase).
// Dipisahkan dari index.html agar dapat diuji dengan `npm test`.
// Isi fungsi dipindahkan apa adanya dari index.html; hanya data yang sebelumnya
// dibaca dari variabel global kini diterima lewat parameter.

export function mapAuthErrorMessage(errorCode) {
  switch (errorCode) {
    case "auth/invalid-email":
      return "Format alamat email tidak valid.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email atau kata sandi yang Anda masukkan salah.";
    case "auth/email-already-in-use":
      return "Alamat email ini sudah terdaftar. Silakan login atau gunakan email lain.";
    case "auth/weak-password":
      return "Kata sandi terlalu lemah. Minimal 6 karakter.";
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan gagal. Silakan coba kembali sesaat lagi.";
    case "auth/network-request-failed":
      return "Gagal terhubung ke server. Periksa koneksi internet Anda.";
    case "auth/api-key-not-valid":
      return "Firebase API Key belum dikonfigurasi dengan benar di file index.html.";
    default:
      return `Terjadi kesalahan autentikasi: ${errorCode}`;
  }
}

// XSS Prevention Utility
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Render Format Markdown untuk Pesan AI
export function formatMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(text);

  // Code blocks ```code```
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="bg-dark text-light p-2.5 rounded-3 my-2 overflow-auto small"><code>${code.trim()}</code></pre>`;
  });

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code class="bg-light px-1.5 py-0.5 rounded text-danger small border">$1</code>');

  // Headers #, ##, ###
  html = html.replace(/^### (.*$)/gim, '<h6 class="fw-bold mt-2 mb-1 text-primary">$1</h6>');
  html = html.replace(/^## (.*$)/gim, '<h5 class="fw-bold mt-2 mb-1 text-primary">$1</h5>');
  html = html.replace(/^# (.*$)/gim, '<h5 class="fw-bold mt-2 mb-1 text-primary">$1</h5>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^\&gt;\s?(.*$)/gim, '<blockquote class="border-start border-3 border-primary ps-2 text-muted my-1.5 small">$1</blockquote>');

  // Tables
  html = html.replace(/((?:\|[^\n]+\|\r?\n?){2,})/g, (match) => {
    const lines = match.trim().split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return match;
    let tableHtml = '<div class="table-responsive my-2"><table class="table table-sm table-bordered mb-0" style="font-size: 0.78rem;">';
    lines.forEach((line, idx) => {
      if (line.includes("---")) return;
      const cols = line.split("|").filter((c, i, a) => i > 0 && i < a.length - 1).map(c => c.trim());
      if (idx === 0) {
        tableHtml += '<thead class="table-light"><tr>' + cols.map(c => `<th>${c}</th>`).join("") + '</tr></thead><tbody>';
      } else {
        tableHtml += '<tr>' + cols.map(c => `<td>${c}</td>`).join("") + '</tr>';
      }
    });
    tableHtml += '</tbody></table></div>';
    return tableHtml;
  });

  // Unordered lists (pembungkus <ul>/<ol> memakai fungsi: "$0" bukan token substitusi di JavaScript)
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ms-3">$1</li>');
  html = html.replace(/(<li class="ms-3">.*<\/li>\s*)+/g, (match) => `<ul class="mb-2 ps-1">${match}</ul>`);

  // Numbered lists
  html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li class="ms-3 list-numbered-item">$1</li>');
  html = html.replace(/(<li class="ms-3 list-numbered-item">.*<\/li>\s*)+/g, (match) => `<ol class="mb-2 ps-1">${match}</ol>`);

  // Paragraphs & Line breaks
  html = html.replace(/\n{2,}/g, '<div class="my-1.5"></div>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

// Ambil Snapshot Data Inventaris Realtime untuk Konteks Gemini
export function getInventoryContextSummary(inventoryData) {
  const keys = Object.keys(inventoryData || {});
  if (keys.length === 0) {
    return "Saat ini database inventaris masih kosong atau belum ada item yang terdaftar.";
  }

  let totalUnits = 0;
  let countBaik = 0;
  let countRusakRingan = 0;
  let countRusakBerat = 0;
  const locationsMap = {};
  const itemList = [];

  keys.forEach((k) => {
    const item = inventoryData[k] || {};
    const nama = item.namaBarang || "Tanpa Nama";
    const kat = item.kategori || "Umum";
    const qty = parseInt(item.jumlah, 10) || 0;
    const kon = item.kondisi || "Baik";
    const loc = (item.lokasi && item.lokasi.trim()) ? item.lokasi.trim() : "Lokasi Belum Ditentukan";

    totalUnits += qty;
    if (kon === "Baik") countBaik += qty;
    else if (kon === "Rusak Ringan") countRusakRingan += qty;
    else if (kon === "Rusak Berat") countRusakBerat += qty;

    if (!locationsMap[loc]) locationsMap[loc] = [];
    locationsMap[loc].push(`${nama} (${qty} unit, kondisi: ${kon})`);

    itemList.push(`- [ID: ${k}] ${nama} | Kategori: ${kat} | Jumlah: ${qty} Unit | Kondisi: ${kon} | Lokasi: ${loc} | Petugas: ${item.createdBy || '-'}`);
  });

  let locSummary = "";
  for (const [locName, items] of Object.entries(locationsMap)) {
    locSummary += `• Ruangan/Lokasi "${locName}": ${items.join("; ")}\n`;
  }

  return `RINGKASAN STATISTIK:
- Total Jenis Barang: ${keys.length} item
- Total Unit Fisik: ${totalUnits} unit
- Kondisi Baik: ${countBaik} unit
- Kondisi Rusak Ringan: ${countRusakRingan} unit
- Kondisi Rusak Berat: ${countRusakBerat} unit

SEBARAN BARANG PER RUANGAN:
${locSummary}
DAFTAR LENGKAP SEMUA BARANG:
${itemList.join("\n")}`;
}

// Validasi ulang usulan AI dengan aturan yang sama seperti form Tambah Barang.
// kategoriOptions & kondisiOptions diambil dari <select> pada form agar selalu sama.
export function validateProposedItem(raw, kategoriOptions, kondisiOptions) {
  const item = {
    namaBarang: String(raw?.namaBarang ?? "").trim(),
    kategori: String(raw?.kategori ?? "").trim(),
    jumlah: Number(raw?.jumlah),
    kondisi: String(raw?.kondisi ?? "").trim(),
    lokasi: String(raw?.lokasi ?? "").trim()
  };
  const errors = [];
  if (!item.namaBarang) errors.push("nama barang kosong");
  if (!kategoriOptions.includes(item.kategori)) errors.push(`kategori "${item.kategori || "-"}" tidak dikenal`);
  if (!Number.isInteger(item.jumlah) || item.jumlah < 1) errors.push("jumlah harus bilangan bulat minimal 1");
  if (!kondisiOptions.includes(item.kondisi)) errors.push(`kondisi "${item.kondisi || "-"}" tidak dikenal`);
  if (!item.lokasi) errors.push("lokasi kosong");
  return { item, errors };
}

// -------------------------------------------------------------
// Peminjaman & Perawatan (fungsi baru, bukan pindahan dari index.html)
// -------------------------------------------------------------

// Tanggal lokal dalam format YYYY-MM-DD, sama dengan nilai <input type="date">
export function toIsoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Key catatan peminjaman/perawatan yang merujuk ke barang tertentu
export function findRecordKeysByBarang(records, barangId) {
  return Object.keys(records || {}).filter((key) => records[key]?.barangId === barangId);
}

// Path multi-path update untuk menghapus barang beserta seluruh catatan terkait.
// Nilai null berarti hapus, sehingga semuanya terhapus sekaligus atau tidak sama sekali.
export function buildHapusBarangUpdates(barangId, peminjamanData, perawatanData) {
  const updates = { [`inventaris/${barangId}`]: null };
  for (const key of findRecordKeysByBarang(peminjamanData, barangId)) updates[`peminjaman/${key}`] = null;
  for (const key of findRecordKeysByBarang(perawatanData, barangId)) updates[`perawatan/${key}`] = null;
  return updates;
}

// Total unit suatu barang yang masih berstatus "Dipinjam".
// excludeKey: catatan yang sedang diedit, agar unitnya tidak terhitung dua kali.
export function hitungUnitDipinjam(peminjamanData, barangId, excludeKey = null) {
  let total = 0;
  for (const [key, p] of Object.entries(peminjamanData || {})) {
    if (key !== excludeKey && p?.barangId === barangId && p.status === "Dipinjam") {
      total += parseInt(p.jumlah, 10) || 0;
    }
  }
  return total;
}

// Terlambat = masih dipinjam dan batas kembalinya sudah lewat (today: YYYY-MM-DD)
export function isPeminjamanTerlambat(peminjaman, today) {
  return peminjaman?.status === "Dipinjam" && Boolean(peminjaman.tanggalKembali) && peminjaman.tanggalKembali < today;
}

// Validasi form peminjaman yang tidak tertangani atribut HTML (required, min).
// Mengembalikan daftar pesan error; daftar kosong berarti valid.
export function validatePeminjaman(data, inventoryData, peminjamanData, editKey = null) {
  const errors = [];
  const barang = inventoryData?.[data.barangId];
  if (!barang) errors.push("Barang tidak ditemukan di inventaris.");
  if (!data.peminjam) errors.push("Nama peminjam wajib diisi.");
  if (!Number.isInteger(data.jumlah) || data.jumlah < 1) errors.push("Jumlah minimal 1 unit.");
  if (data.tanggalKembali < data.tanggalPinjam) errors.push("Batas kembali tidak boleh sebelum tanggal pinjam.");
  if (barang && data.status === "Dipinjam") {
    const tersedia = (parseInt(barang.jumlah, 10) || 0) - hitungUnitDipinjam(peminjamanData, data.barangId, editKey);
    if (data.jumlah > tersedia) errors.push(`Jumlah melebihi unit yang tersedia (${Math.max(tersedia, 0)} unit).`);
  }
  return errors;
}

// Validasi form perawatan yang tidak tertangani atribut HTML
export function validatePerawatan(data, inventoryData) {
  const errors = [];
  if (!inventoryData?.[data.barangId]) errors.push("Barang tidak ditemukan di inventaris.");
  if (!data.deskripsi) errors.push("Deskripsi perawatan wajib diisi.");
  if (!Number.isInteger(data.biaya) || data.biaya < 0) errors.push("Biaya harus bilangan bulat minimal 0.");
  return errors;
}
