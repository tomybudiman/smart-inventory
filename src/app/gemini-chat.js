// Asisten AI Gemini: widget chat, konteks data realtime, dan usulan tambah barang (function calling).
// Build Cloud Run memanggil Gemini lewat proxy server.mjs; mode lokal memakai API key dari .env.local / browser.
import { db, env, isFirebaseConfigured, push, update } from "./firebase.js";
import { escapeHtml, formatMarkdown, toIsoDate, validateProposedItem } from "../inventory-logic.mjs";
import { buildAiDataContext, isReadTool, runAiQuery } from "../ai-queries.mjs";
import { buildActionHistoryNote, prepareAiAction } from "../ai-actions.mjs";
import { deleteBarang, inventarisRef, updateBarang } from "./inventaris.js";
import { createPeminjaman, deletePeminjaman, updatePeminjaman } from "./peminjaman.js";
import { createPerawatan, deletePerawatan, updatePerawatan } from "./perawatan.js";
import { state } from "./state.js";
import { formatRupiah, formatTanggal, getKondisiBadge, getNamaBarang, showToast } from "./ui.js";

const btnGeminiChatToggle = document.getElementById("btnGeminiChatToggle");
const geminiChatWindow = document.getElementById("geminiChatWindow");
const btnGeminiCloseChat = document.getElementById("btnGeminiCloseChat");
const btnGeminiClearChat = document.getElementById("btnGeminiClearChat");
const btnGeminiSettingsToggle = document.getElementById("btnGeminiSettingsToggle");
const geminiSettingsPanel = document.getElementById("geminiSettingsPanel");
const btnGeminiCloseSettings = document.getElementById("btnGeminiCloseSettings");
const geminiApiKeyInput = document.getElementById("geminiApiKeyInput");
const geminiModelSelect = document.getElementById("geminiModelSelect");
const btnToggleApiKeyVisibility = document.getElementById("btnToggleApiKeyVisibility");
const btnSaveGeminiSettings = document.getElementById("btnSaveGeminiSettings");
const geminiApiKeyStatusNote = document.getElementById("geminiApiKeyStatusNote");
const geminiModelBadge = document.getElementById("geminiModelBadge");
const geminiMessages = document.getElementById("geminiMessages");
const geminiChatForm = document.getElementById("geminiChatForm");
const geminiChatInput = document.getElementById("geminiChatInput");
const btnGeminiSend = document.getElementById("btnGeminiSend");

let geminiChatHistory = [];
let isGeminiWaiting = false;
let chatEpoch = 0; // naik setiap chat direset; jawaban AI dari epoch lama diabaikan

// Build Cloud Run (--mode cloudrun) memanggil Gemini lewat proxy server.mjs,
// sehingga API key tidak pernah sampai ke browser
const GEMINI_PROXY_URL = (env.VITE_GEMINI_PROXY_URL || "").trim();

// Helper: Mendapatkan API Key aktif untuk mode tanpa proxy (environment build vs Local Storage)
function getActiveGeminiApiKey() {
  return (env.VITE_GEMINI_API_KEY && env.VITE_GEMINI_API_KEY.trim() && !env.VITE_GEMINI_API_KEY.includes("YOUR_GEMINI_API_KEY"))
    ? env.VITE_GEMINI_API_KEY.trim()
    : (localStorage.getItem("custom_gemini_api_key") || "").trim();
}

// Helper: Mendapatkan Model aktif
function getActiveGeminiModel() {
  return localStorage.getItem("custom_gemini_model") ||
    (env.VITE_GEMINI_MODEL && env.VITE_GEMINI_MODEL.trim() ? env.VITE_GEMINI_MODEL.trim() : "gemini-3.8-flash");
}

// Update Tampilan UI Pengaturan & Status
function refreshGeminiConfigUI() {
  const activeKey = getActiveGeminiApiKey();
  const activeModel = getActiveGeminiModel();

  geminiModelBadge.textContent = activeModel;
  geminiModelSelect.value = activeModel;

  if (GEMINI_PROXY_URL) {
    geminiApiKeyInput.value = "";
    geminiApiKeyInput.placeholder = "Dikelola oleh server";
    geminiApiKeyInput.disabled = true;
    geminiApiKeyStatusNote.innerHTML = '<span class="text-success fw-semibold"><i class="bi bi-shield-lock-fill me-1"></i>Tersambung via server (API key tersimpan aman di server)</span>';
  } else if (env.VITE_GEMINI_API_KEY && env.VITE_GEMINI_API_KEY.trim() && !env.VITE_GEMINI_API_KEY.includes("YOUR_GEMINI_API_KEY")) {
    geminiApiKeyInput.value = "••••••••••••••••••••••••";
    geminiApiKeyInput.disabled = true;
    geminiApiKeyStatusNote.innerHTML = '<span class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i>Tersambung via environment build (VITE_GEMINI_API_KEY)</span>';
  } else if (localStorage.getItem("custom_gemini_api_key")) {
    geminiApiKeyInput.value = localStorage.getItem("custom_gemini_api_key");
    geminiApiKeyInput.disabled = false;
    geminiApiKeyStatusNote.innerHTML = '<span class="text-primary fw-semibold"><i class="bi bi-hdd-fill me-1"></i>Tersimpan di Penyimpanan Browser</span>';
  } else {
    geminiApiKeyInput.value = "";
    geminiApiKeyInput.disabled = false;
    geminiApiKeyStatusNote.innerHTML = '<span class="text-danger fw-semibold"><i class="bi bi-exclamation-triangle-fill me-1"></i>Belum dikonfigurasi. Isi VITE_GEMINI_API_KEY di .env.local atau masukkan di sini.</span>';
  }
}

// Toggle Chat Window
btnGeminiChatToggle.addEventListener("click", () => {
  const isHidden = geminiChatWindow.classList.contains("d-none");
  if (isHidden) {
    geminiChatWindow.classList.remove("d-none");
    refreshGeminiConfigUI();
    geminiChatInput.focus();
    scrollToBottom();
  } else {
    geminiChatWindow.classList.add("d-none");
  }
});

btnGeminiCloseChat.addEventListener("click", () => {
  geminiChatWindow.classList.add("d-none");
});

// Toggle Settings Panel
btnGeminiSettingsToggle.addEventListener("click", () => {
  geminiSettingsPanel.classList.toggle("d-none");
  refreshGeminiConfigUI();
});

btnGeminiCloseSettings.addEventListener("click", () => {
  geminiSettingsPanel.classList.add("d-none");
});

// Toggle Eye Visibility API Key
btnToggleApiKeyVisibility.addEventListener("click", () => {
  if (geminiApiKeyInput.type === "password") {
    geminiApiKeyInput.type = "text";
    btnToggleApiKeyVisibility.innerHTML = '<i class="bi bi-eye-slash"></i>';
  } else {
    geminiApiKeyInput.type = "password";
    btnToggleApiKeyVisibility.innerHTML = '<i class="bi bi-eye"></i>';
  }
});

// Simpan Pengaturan Lokal
btnSaveGeminiSettings.addEventListener("click", () => {
  const customKey = geminiApiKeyInput.value.trim();
  const customModel = geminiModelSelect.value;

  if (!geminiApiKeyInput.disabled && customKey && !customKey.startsWith("•••")) {
    localStorage.setItem("custom_gemini_api_key", customKey);
  }
  localStorage.setItem("custom_gemini_model", customModel);

  refreshGeminiConfigUI();
  geminiSettingsPanel.classList.add("d-none");
  showToast("Pengaturan Gemini AI berhasil disimpan!");
});

// Bersihkan Riwayat Chat (juga dipanggil saat logout agar tidak terbawa ke akun lain)
export function resetChat() {
  chatEpoch++; // jawaban AI yang masih ditunggu akan diabaikan
  hideTypingIndicator();
  geminiChatHistory = [];
  const messages = geminiMessages.querySelectorAll(".gemini-msg");
  messages.forEach((msg, idx) => {
    if (idx > 0) msg.remove();
  });
}

btnGeminiClearChat.addEventListener("click", () => {
  resetChat();
  showToast("Riwayat percakapan telah dibersihkan.");
});

function scrollToBottom() {
  geminiMessages.scrollTop = geminiMessages.scrollHeight;
}

// Tambahkan Bubble Pesan ke Chat Window
function appendChatMessage(role, content, rawMarkdown = true) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `gemini-msg ${role === "user" ? "gemini-msg-user" : "gemini-msg-bot"}`;

  if (role === "user") {
    msgDiv.textContent = content;
  } else {
    const header = document.createElement("div");
    header.className = "d-flex align-items-center justify-content-between mb-1 text-primary fw-semibold";
    header.style.fontSize = "0.78rem";
    header.innerHTML = `
      <div class="d-flex align-items-center gap-1">
        <i class="bi bi-robot"></i>
        <span>Asisten Inventaris</span>
      </div>
      <button class="btn btn-link btn-sm p-0 text-muted copy-btn" title="Salin Jawaban" style="font-size: 0.72rem;">
        <i class="bi bi-copy"></i>
      </button>
    `;

    const body = document.createElement("div");
    body.innerHTML = rawMarkdown ? formatMarkdown(content) : content;

    msgDiv.appendChild(header);
    msgDiv.appendChild(body);

    // Copy button event
    const copyBtn = msgDiv.querySelector(".copy-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(content).then(() => {
          copyBtn.innerHTML = '<i class="bi bi-check text-success"></i>';
          setTimeout(() => { copyBtn.innerHTML = '<i class="bi bi-copy"></i>'; }, 2000);
        });
      });
    }
  }

  geminiMessages.appendChild(msgDiv);
  scrollToBottom();
  return msgDiv;
}

// Indikator Mengetik
let typingBubble = null;
function showTypingIndicator() {
  if (typingBubble) return;
  typingBubble = document.createElement("div");
  typingBubble.className = "gemini-msg gemini-msg-bot";
  typingBubble.innerHTML = `
    <div class="gemini-typing">
      <div class="gemini-typing-dot"></div>
      <div class="gemini-typing-dot"></div>
      <div class="gemini-typing-dot"></div>
    </div>
  `;
  geminiMessages.appendChild(typingBubble);
  scrollToBottom();
}

function hideTypingIndicator() {
  if (typingBubble) {
    typingBubble.remove();
    typingBubble = null;
  }
}

// -------------------------------------------------------------
// CRUD VIA AI (Function Calling + Kartu Konfirmasi)
// Gemini hanya mengusulkan perubahan; data baru ditulis ke database
// setelah petugas menekan tombol konfirmasi pada kartu di chat.
// -------------------------------------------------------------
// Pilihan kategori & kondisi diambil dari form Tambah Barang agar selalu sama
const KATEGORI_OPTIONS = Array.from(document.getElementById("kategori").options).map(o => o.value).filter(Boolean);
const KONDISI_OPTIONS = Array.from(document.getElementById("kondisi").options).map(o => o.value).filter(Boolean);

// Pilihan status & jenis diambil dari form Peminjaman/Perawatan agar selalu sama
const optionValues = (id) => Array.from(document.getElementById(id).options).map(o => o.value).filter(Boolean);
const AI_OPTIONS = {
  kategori: KATEGORI_OPTIONS,
  kondisi: KONDISI_OPTIONS,
  statusPeminjaman: optionValues("peminjamanStatus"),
  jenisPerawatan: optionValues("perawatanJenis"),
  statusPerawatan: optionValues("perawatanStatus")
};

const idParam = (description) => ({ type: "string", description: `${description} Salin persis dari [ID: ...] pada data.` });
const dateParam = (description) => ({ type: "string", description: `${description} Format YYYY-MM-DD.` });
const KONFIRMASI = "Data BELUM berubah sampai petugas menekan tombol konfirmasi pada kartu.";

// Usulan ubah/hapus barang dan catat/ubah/hapus peminjaman & perawatan (lihat src/ai-actions.mjs)
const ACTION_DECLARATIONS = [
  {
    name: "usulkanUbahBarang",
    description: `Menampilkan kartu konfirmasi perubahan data satu barang. Isi hanya field yang berubah. ${KONFIRMASI}`,
    parameters: {
      type: "object",
      properties: {
        barangId: idParam("ID barang di inventaris."),
        namaBarang: { type: "string", description: "Nama barang baru." },
        kategori: { type: "string", enum: KATEGORI_OPTIONS },
        jumlah: { type: "integer", description: "Jumlah unit fisik, minimal 1." },
        kondisi: { type: "string", enum: KONDISI_OPTIONS },
        lokasi: { type: "string", description: "Nama ruangan atau lokasi penyimpanan." }
      },
      required: ["barangId"]
    }
  },
  {
    name: "usulkanHapusBarang",
    description: `Menampilkan kartu konfirmasi penghapusan satu barang beserta seluruh catatan peminjaman & perawatannya. ${KONFIRMASI}`,
    parameters: { type: "object", properties: { barangId: idParam("ID barang di inventaris.") }, required: ["barangId"] }
  },
  {
    name: "usulkanPeminjaman",
    description: `Menampilkan kartu konfirmasi pencatatan peminjaman baru (status Dipinjam). ${KONFIRMASI}`,
    parameters: {
      type: "object",
      properties: {
        barangId: idParam("ID barang yang dipinjam."),
        peminjam: { type: "string", description: "Nama peminjam." },
        jumlah: { type: "integer", description: "Jumlah unit yang dipinjam, minimal 1." },
        tanggalPinjam: dateParam("Tanggal pinjam; kosongkan untuk hari ini."),
        tanggalKembali: dateParam("Batas tanggal kembali.")
      },
      required: ["barangId", "peminjam", "tanggalKembali"]
    }
  },
  {
    name: "usulkanUbahPeminjaman",
    description: `Menampilkan kartu konfirmasi perubahan satu catatan peminjaman, termasuk menandai barang sudah dikembalikan (status Dikembalikan). Isi hanya field yang berubah. ${KONFIRMASI}`,
    parameters: {
      type: "object",
      properties: {
        peminjamanId: idParam("ID catatan peminjaman."),
        peminjam: { type: "string", description: "Nama peminjam." },
        jumlah: { type: "integer", description: "Jumlah unit, minimal 1." },
        tanggalPinjam: dateParam("Tanggal pinjam."),
        tanggalKembali: dateParam("Batas tanggal kembali."),
        status: { type: "string", enum: AI_OPTIONS.statusPeminjaman }
      },
      required: ["peminjamanId"]
    }
  },
  {
    name: "usulkanHapusPeminjaman",
    description: `Menampilkan kartu konfirmasi penghapusan satu catatan peminjaman. ${KONFIRMASI}`,
    parameters: { type: "object", properties: { peminjamanId: idParam("ID catatan peminjaman.") }, required: ["peminjamanId"] }
  },
  {
    name: "usulkanPerawatan",
    description: `Menampilkan kartu konfirmasi pencatatan perawatan baru (servis rutin, perbaikan, atau kalibrasi). ${KONFIRMASI}`,
    parameters: {
      type: "object",
      properties: {
        barangId: idParam("ID barang yang dirawat."),
        jenis: { type: "string", enum: AI_OPTIONS.jenisPerawatan },
        deskripsi: { type: "string", description: "Deskripsi pekerjaan perawatan." },
        tanggal: dateParam("Tanggal perawatan; kosongkan untuk hari ini."),
        biaya: { type: "integer", description: "Biaya dalam Rupiah, minimal 0." },
        status: { type: "string", enum: AI_OPTIONS.statusPerawatan }
      },
      required: ["barangId", "jenis", "deskripsi"]
    }
  },
  {
    name: "usulkanUbahPerawatan",
    description: `Menampilkan kartu konfirmasi perubahan satu catatan perawatan. Isi hanya field yang berubah. ${KONFIRMASI}`,
    parameters: {
      type: "object",
      properties: {
        perawatanId: idParam("ID catatan perawatan."),
        jenis: { type: "string", enum: AI_OPTIONS.jenisPerawatan },
        deskripsi: { type: "string", description: "Deskripsi pekerjaan perawatan." },
        tanggal: dateParam("Tanggal perawatan."),
        biaya: { type: "integer", description: "Biaya dalam Rupiah, minimal 0." },
        status: { type: "string", enum: AI_OPTIONS.statusPerawatan }
      },
      required: ["perawatanId"]
    }
  },
  {
    name: "usulkanHapusPerawatan",
    description: `Menampilkan kartu konfirmasi penghapusan satu catatan perawatan. ${KONFIRMASI}`,
    parameters: { type: "object", properties: { perawatanId: idParam("ID catatan perawatan.") }, required: ["perawatanId"] }
  }
];

// Fungsi baca: dijalankan aplikasi pada data realtime, hasilnya dikirim kembali ke Gemini (lihat src/ai-queries.mjs)
const limitParam = { type: "integer", description: "Jumlah maksimum baris daftar (bawaan 50, maksimum 200). Total tetap dihitung dari semua hasil." };
const READ_DECLARATIONS = [
  {
    name: "cariBarang",
    description: "Mencari barang inventaris beserta ID, jumlah unit, unit yang sedang dipinjam, dan unit tersedia, serta total unit hasil pencarian. Semua filter opsional; tanpa filter = semua barang.",
    parameters: {
      type: "object",
      properties: {
        kata: { type: "string", description: "Potongan nama barang atau lokasi (tidak peka huruf besar/kecil)." },
        kategori: { type: "string", enum: KATEGORI_OPTIONS },
        kondisi: { type: "string", enum: KONDISI_OPTIONS },
        lokasi: { type: "string", description: "Potongan nama lokasi/ruangan." },
        batas: limitParam
      }
    }
  },
  {
    name: "cariPeminjaman",
    description: "Mencari catatan peminjaman beserta ID, nama barang, status, dan jumlah hari keterlambatan, serta total unit hasil pencarian. Semua filter opsional.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: AI_OPTIONS.statusPeminjaman },
        terlambat: { type: "boolean", description: "true = hanya yang terlambat dikembalikan; false = hanya yang tidak terlambat." },
        peminjam: { type: "string", description: "Potongan nama peminjam." },
        barangId: { type: "string", description: "ID barang." },
        kataBarang: { type: "string", description: "Potongan nama barang." },
        dariTanggal: dateParam("Tanggal pinjam paling awal."),
        sampaiTanggal: dateParam("Tanggal pinjam paling akhir."),
        batas: limitParam
      }
    }
  },
  {
    name: "cariPerawatan",
    description: "Mencari catatan perawatan beserta ID, nama barang, biaya, dan status, serta total biaya hasil pencarian. Semua filter opsional.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: AI_OPTIONS.statusPerawatan },
        jenis: { type: "string", enum: AI_OPTIONS.jenisPerawatan },
        barangId: { type: "string", description: "ID barang." },
        kata: { type: "string", description: "Potongan nama barang atau deskripsi pekerjaan." },
        dariTanggal: dateParam("Tanggal perawatan paling awal."),
        sampaiTanggal: dateParam("Tanggal perawatan paling akhir."),
        batas: limitParam
      }
    }
  },
  {
    name: "rekapInventaris",
    description: "Merekap barang per kategori, kondisi, atau lokasi: jumlah jenis barang, total unit, unit dipinjam, dan unit tersedia per kelompok. Filter opsional.",
    parameters: {
      type: "object",
      properties: {
        kelompokkan: { type: "string", enum: ["kategori", "kondisi", "lokasi"] },
        kategori: { type: "string", enum: KATEGORI_OPTIONS },
        kondisi: { type: "string", enum: KONDISI_OPTIONS },
        lokasi: { type: "string", description: "Potongan nama lokasi/ruangan." }
      },
      required: ["kelompokkan"]
    }
  }
];

// Batas langkah fungsi baca per pertanyaan agar tidak berputar tanpa akhir
const MAX_TOOL_STEPS = 5;

const GEMINI_TOOLS = [{
  function_declarations: [{
    name: "usulkanTambahBarang",
    description: "Menampilkan draft barang baru kepada petugas sebagai kartu konfirmasi. Data BELUM tersimpan sampai petugas menekan tombol Simpan pada kartu.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Daftar barang yang akan ditambahkan, satu entri per jenis barang.",
          items: {
            type: "object",
            properties: {
              namaBarang: { type: "string", description: "Nama barang, misalnya 'Laptop Asus Vivobook 14'." },
              kategori: { type: "string", enum: KATEGORI_OPTIONS, description: "Kategori barang." },
              jumlah: { type: "integer", description: "Jumlah unit fisik, minimal 1." },
              kondisi: { type: "string", enum: KONDISI_OPTIONS, description: "Kondisi barang." },
              lokasi: { type: "string", description: "Nama ruangan atau lokasi penyimpanan." }
            },
            required: ["namaBarang", "kategori", "jumlah", "kondisi", "lokasi"]
          }
        }
      },
      required: ["items"]
    }
  }, ...ACTION_DECLARATIONS, ...READ_DECLARATIONS]
}];

// Catatan usulan untuk riwayat chat. Disimpan sebagai teks (bukan functionCall)
// agar riwayat tetap valid walaupun model fallback berganti di tengah percakapan.
function buildProposalHistoryNote(entries, status) {
  const list = entries
    .map(({ item }) => `${item.namaBarang || "?"} (${item.jumlah} unit, ${item.kategori}, ${item.kondisi}, lokasi: ${item.lokasi})`)
    .join("; ");
  return `[SISTEM] Draft penambahan barang ditampilkan sebagai kartu konfirmasi: ${list}. Status: ${status}.`;
}

// Satu jawaban AI bisa memuat beberapa kartu; teks riwayatnya = jawaban + catatan status tiap kartu.
// Mengembalikan pembuat "slot" catatan: setiap kartu memperbarui slotnya sendiri.
function createHistoryNotes(historyEntry, replyText) {
  const notes = [];
  return () => {
    const index = notes.push("") - 1;
    return (note) => {
      notes[index] = note;
      historyEntry.parts[0].text = [replyText, ...notes].filter(Boolean).join("\n\n");
    };
  };
}

function appendProposalCard(rawItems, setNote) {
  const entries = rawItems.map((raw) => validateProposedItem(raw, KATEGORI_OPTIONS, KONDISI_OPTIONS));
  const validItems = entries.filter(e => e.errors.length === 0).map(e => e.item);
  const existingLocations = new Set(
    Object.values(state.inventoryData).map(i => (i.lokasi || "").trim().toLowerCase()).filter(Boolean)
  );
  const isNewLocation = (item) => Boolean(item.lokasi) && !existingLocations.has(item.lokasi.toLowerCase());
  const hasNewLocation = entries.some(e => e.errors.length === 0 && isNewLocation(e.item));

  const setHistoryStatus = (status) => setNote(buildProposalHistoryNote(entries, status));
  setHistoryStatus("menunggu konfirmasi petugas");

  const rowsHtml = entries.map(({ item, errors }) => `
    <div class="list-group-item px-0 py-2">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <span class="fw-semibold">${escapeHtml(item.namaBarang) || "<em>(tanpa nama)</em>"}</span>
        <span class="fw-semibold text-nowrap">${Number.isFinite(item.jumlah) ? item.jumlah : "?"} unit</span>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-1 mt-1 text-muted" style="font-size: 0.78rem;">
        <span>${escapeHtml(item.kategori) || "-"}</span>
        <span>&bull;</span>
        ${getKondisiBadge(escapeHtml(item.kondisi))}
        <span>&bull;</span>
        <span><i class="bi bi-geo-alt-fill text-danger"></i> ${escapeHtml(item.lokasi) || "-"}</span>
        ${isNewLocation(item) ? '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Lokasi baru</span>' : ""}
      </div>
      ${errors.length ? `<div class="text-danger mt-1" style="font-size: 0.75rem;"><i class="bi bi-exclamation-circle me-1"></i>${escapeHtml(errors.join("; "))} &mdash; tidak akan disimpan.</div>` : ""}
    </div>`).join("");

  const card = document.createElement("div");
  card.className = "gemini-msg gemini-msg-bot gemini-proposal";
  card.innerHTML = `
    <div class="d-flex align-items-center gap-1 mb-1 text-primary fw-semibold" style="font-size: 0.78rem;">
      <i class="bi bi-clipboard-plus"></i>
      <span>Draft Tambah Barang (${entries.length})</span>
    </div>
    <div class="list-group list-group-flush">${rowsHtml}</div>
    ${hasNewLocation ? `<div class="text-muted mt-2" style="font-size: 0.75rem;"><span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Lokasi baru</span> belum ada barang lain di lokasi ini. Pastikan penulisannya sudah benar.</div>` : ""}
    <div class="proposal-status text-muted mt-2" style="font-size: 0.75rem;">Periksa dulu. Barang baru tersimpan setelah Anda menekan <strong>Simpan</strong>.</div>
    <div class="proposal-actions d-flex gap-2 mt-2">
      <button type="button" class="btn btn-primary btn-sm rounded-3 fw-semibold d-flex align-items-center gap-1 btn-proposal-save" ${validItems.length ? "" : "disabled"}>
        <span class="spinner-border spinner-border-sm d-none" role="status"></span>
        <i class="bi bi-check2"></i>
        <span>Simpan ${validItems.length} Barang</span>
      </button>
      <button type="button" class="btn btn-outline-secondary btn-sm rounded-3 btn-proposal-cancel">Batal</button>
    </div>`;

  const statusEl = card.querySelector(".proposal-status");
  const actionsEl = card.querySelector(".proposal-actions");
  const btnSave = card.querySelector(".btn-proposal-save");
  const btnCancel = card.querySelector(".btn-proposal-cancel");
  const saveSpinner = btnSave.querySelector(".spinner-border");

  btnCancel.addEventListener("click", () => {
    actionsEl.remove();
    statusEl.innerHTML = '<i class="bi bi-x-circle me-1"></i>Dibatalkan. Tidak ada data yang disimpan.';
    setHistoryStatus("dibatalkan oleh petugas, tidak disimpan");
  });

  btnSave.addEventListener("click", async () => {
    if (!state.currentUser || !db || !isFirebaseConfigured) {
      statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Silakan login terlebih dahulu sebelum menyimpan.</span>';
      return;
    }

    btnSave.disabled = true;
    btnCancel.disabled = true;
    saveSpinner.classList.remove("d-none");

    // Multi-path update: semua barang tersimpan sekaligus, atau tidak sama sekali
    const updatedAt = new Date().toISOString();
    const updates = {};
    validItems.forEach((item) => {
      updates[push(inventarisRef).key] = { ...item, createdBy: state.currentUser.email, updatedAt };
    });

    try {
      await update(inventarisRef, updates);
      actionsEl.remove();
      statusEl.innerHTML = `<span class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i>${validItems.length} barang berhasil ditambahkan ke inventaris.</span>`;
      setHistoryStatus("sudah disimpan ke database oleh petugas");
      showToast(`${validItems.length} barang baru berhasil ditambahkan!`);
    } catch (error) {
      console.error("Gagal menyimpan barang dari AI:", error);
      statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Gagal menyimpan. Periksa koneksi dan security rules, lalu coba lagi.</span>';
      btnSave.disabled = false;
      btnCancel.disabled = false;
      saveSpinner.classList.add("d-none");
    }
  });

  geminiMessages.appendChild(card);
  scrollToBottom();
}

// Data & pilihan form terkini untuk menyusun/memvalidasi usulan aksi AI
function aiContext() {
  return {
    inventoryData: state.inventoryData,
    peminjamanData: state.peminjamanData,
    perawatanData: state.perawatanData,
    today: toIsoDate(new Date()),
    options: AI_OPTIONS
  };
}

// Penulisan data tiap jenis usulan memakai fungsi CRUD yang sama dengan form
const AI_EXECUTORS = {
  "inventaris:update": (action, meta) => updateBarang(action.key, { ...action.payload, ...meta }),
  "inventaris:delete": (action) => deleteBarang(action.key),
  "peminjaman:create": (action, meta) => createPeminjaman({ ...action.payload, ...meta }),
  "peminjaman:update": (action, meta) => updatePeminjaman(action.key, { ...action.payload, ...meta }),
  "peminjaman:delete": (action) => deletePeminjaman(action.key),
  "perawatan:create": (action, meta) => createPerawatan({ ...action.payload, ...meta }),
  "perawatan:update": (action, meta) => updatePerawatan(action.key, { ...action.payload, ...meta }),
  "perawatan:delete": (action) => deletePerawatan(action.key)
};

function formatActionValue(field, value) {
  if (value === undefined || value === null || value === "") return "-";
  if (field === "barangId") return escapeHtml(getNamaBarang(value));
  if (field === "biaya") return formatRupiah(value);
  if (field === "tanggal" || field === "tanggalPinjam" || field === "tanggalKembali") return escapeHtml(formatTanggal(value));
  if (field === "jumlah") return `${escapeHtml(String(value))} unit`;
  return escapeHtml(String(value));
}

const actionErrorsHtml = (errors) => errors.length
  ? `<div class="text-danger mt-2" style="font-size: 0.75rem;"><i class="bi bi-exclamation-circle me-1"></i>${escapeHtml(errors.join(" "))} &mdash; tidak dapat disimpan.</div>`
  : "";

// Kartu konfirmasi untuk usulan ubah/hapus barang dan catat/ubah/hapus peminjaman & perawatan
function appendActionCard(call, setNote) {
  const action = prepareAiAction(call, aiContext());
  const isDelete = action.kind === "delete";
  const confirmLabel = isDelete ? "Hapus" : action.kind === "update" ? "Simpan Perubahan" : "Simpan";
  const icon = { create: "bi-journal-plus", update: "bi-pencil-square", delete: "bi-trash3" }[action.kind] || "bi-question-circle";
  setNote(buildActionHistoryNote(action, action.errors.length ? "tidak valid, tidak dapat disimpan" : "menunggu konfirmasi petugas"));

  // Ubah: nilai lama dicoret -> nilai baru; catat: nilai baru; hapus: data yang akan dihapus
  const rowsHtml = action.rows.map((r) => `
    <tr>
      <td class="text-muted text-nowrap">${escapeHtml(r.label)}</td>
      <td>${action.kind === "update"
        ? `<span class="text-decoration-line-through text-muted">${formatActionValue(r.field, r.before)}</span>
           <i class="bi bi-arrow-right mx-1"></i><span class="fw-semibold">${formatActionValue(r.field, r.after)}</span>`
        : formatActionValue(r.field, isDelete ? r.before : r.after)}</td>
    </tr>`).join("");
  const relatedHtml = isDelete && (action.related?.peminjaman || action.related?.perawatan)
    ? `<div class="text-danger mt-2" style="font-size: 0.75rem;"><i class="bi bi-exclamation-triangle me-1"></i>${action.related.peminjaman} catatan peminjaman dan ${action.related.perawatan} catatan perawatan barang ini juga akan dihapus.</div>`
    : "";

  const card = document.createElement("div");
  card.className = "gemini-msg gemini-msg-bot gemini-proposal";
  card.innerHTML = `
    <div class="d-flex align-items-center gap-1 mb-1 ${isDelete ? "text-danger" : "text-primary"} fw-semibold" style="font-size: 0.78rem;">
      <i class="bi ${icon}"></i>
      <span>${escapeHtml(action.title)}</span>
    </div>
    <div class="fw-semibold mb-1">${escapeHtml(action.subject)}</div>
    ${rowsHtml ? `<table class="mb-0"><tbody>${rowsHtml}</tbody></table>` : ""}
    ${relatedHtml}
    <div class="action-errors">${actionErrorsHtml(action.errors)}</div>
    <div class="proposal-status text-muted mt-2" style="font-size: 0.75rem;">${action.errors.length ? "" : `Periksa dulu. Data baru berubah setelah Anda menekan <strong>${confirmLabel}</strong>.`}</div>
    <div class="proposal-actions d-flex gap-2 mt-2">
      <button type="button" class="btn ${isDelete ? "btn-danger" : "btn-primary"} btn-sm rounded-3 fw-semibold d-flex align-items-center gap-1 btn-proposal-save" ${action.errors.length ? "disabled" : ""}>
        <span class="spinner-border spinner-border-sm d-none" role="status"></span>
        <i class="bi ${isDelete ? "bi-trash3" : "bi-check2"}"></i>
        <span>${confirmLabel}</span>
      </button>
      <button type="button" class="btn btn-outline-secondary btn-sm rounded-3 btn-proposal-cancel">Batal</button>
    </div>`;

  const statusEl = card.querySelector(".proposal-status");
  const errorsEl = card.querySelector(".action-errors");
  const actionsEl = card.querySelector(".proposal-actions");
  const btnSave = card.querySelector(".btn-proposal-save");
  const btnCancel = card.querySelector(".btn-proposal-cancel");
  const saveSpinner = btnSave.querySelector(".spinner-border");

  btnCancel.addEventListener("click", () => {
    actionsEl.remove();
    statusEl.innerHTML = '<i class="bi bi-x-circle me-1"></i>Dibatalkan. Tidak ada data yang diubah.';
    setNote(buildActionHistoryNote(action, "dibatalkan oleh petugas, tidak disimpan"));
  });

  btnSave.addEventListener("click", async () => {
    if (!state.currentUser || !db || !isFirebaseConfigured) {
      statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Silakan login terlebih dahulu sebelum menyimpan.</span>';
      return;
    }

    // Validasi ulang dengan data terbaru: jika data berubah sejak kartu ditampilkan, minta usulan baru
    const fresh = prepareAiAction(call, aiContext());
    const shown = JSON.stringify([action.payload, action.related]);
    if (fresh.errors.length || JSON.stringify([fresh.payload, fresh.related]) !== shown) {
      errorsEl.innerHTML = actionErrorsHtml(fresh.errors);
      statusEl.innerHTML = '<span class="text-danger">Data sudah berubah sejak usulan ini dibuat. Minta asisten membuat usulan baru.</span>';
      btnSave.disabled = true;
      setNote(buildActionHistoryNote(action, "tidak disimpan karena data sudah berubah"));
      return;
    }

    btnSave.disabled = true;
    btnCancel.disabled = true;
    saveSpinner.classList.remove("d-none");

    try {
      await AI_EXECUTORS[`${action.node}:${action.kind}`](action, {
        createdBy: state.currentUser.email,
        updatedAt: new Date().toISOString()
      });
      actionsEl.remove();
      statusEl.innerHTML = `<span class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i>${isDelete ? "Data berhasil dihapus." : "Data berhasil disimpan."}</span>`;
      setNote(buildActionHistoryNote(action, isDelete ? "sudah dihapus oleh petugas" : "sudah disimpan ke database oleh petugas"));
      showToast(isDelete ? "Data berhasil dihapus." : "Data berhasil disimpan!");
    } catch (error) {
      console.error("Gagal menjalankan usulan AI:", error);
      statusEl.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Gagal menyimpan. Periksa koneksi dan security rules, lalu coba lagi.</span>';
      btnSave.disabled = false;
      btnCancel.disabled = false;
      saveSpinner.classList.add("d-none");
    }
  });

  geminiMessages.appendChild(card);
  scrollToBottom();
}

// Kirim satu request generateContent: lewat proxy server (build Cloud Run) atau langsung ke Google
async function callGeminiModel(model, payload, apiKey) {
  if (GEMINI_PROXY_URL) {
    const idToken = await state.currentUser.getIdToken();
    return fetch(`${GEMINI_PROXY_URL}/${encodeURIComponent(model)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
      body: JSON.stringify(payload)
    });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// Panggil Endpoint Gemini API (dengan Auto-Fallback Model)
async function requestGeminiAPI(conversationHistory, modelToUse, apiKey) {
  const dataContext = buildAiDataContext(aiContext());
  const systemInstruction = {
    parts: [
      {
        text: `Anda adalah "Asisten AI Inventaris Cerdas" untuk Sistem Inventaris Barang Laboratorium & Kantor.
Tugas utama Anda:
1. Menjawab pertanyaan pengguna seputar ketersediaan stok, jumlah unit, sebaran lokasi ruangan, dan kondisi barang (Baik, Rusak Ringan, Rusak Berat), serta peminjaman (peminjam, unit tersedia, batas kembali, keterlambatan) dan riwayat perawatan barang berdasarkan DATA REALTIME di bawah.
2. Memberikan rekomendasi jadwal pemeliharaan alat dengan memperhatikan riwayat perawatan yang tercatat, SOP operasional laboratorium/kantor, serta usulan tindakan perbaikan untuk barang yang rusak.
3. Membantu membuat rekap atau draft laporan inventaris yang rapi jika diminta oleh petugas.
4. Gunakan Bahasa Indonesia yang ramah, profesional, ringkas, dan solutif.
5. Format teks dengan rapi menggunakan Markdown (gunakan bullet points, bold untuk penekanan, atau tabel ringkas bila relevan).
6. Jika petugas meminta menambahkan barang baru, panggil fungsi usulkanTambahBarang berisi semua barang yang diminta. Fungsi ini hanya menampilkan draft; barang baru tersimpan setelah petugas menekan tombol "Simpan" pada kartu konfirmasi. Jangan pernah menyatakan barang sudah tersimpan.
   - Nama barang dan lokasi wajib jelas. Jika belum disebutkan, tanyakan dulu dan jangan menebak.
   - Jika jumlah tidak disebutkan, gunakan 1. Jika kondisi tidak disebutkan, gunakan "Baik".
   - Pilih kategori yang paling sesuai dari pilihan yang tersedia.
   - Jika lokasi yang disebut merujuk ke ruangan yang sudah ada di data, tulis nama lokasinya persis seperti di data.
7. Untuk perubahan data lainnya, panggil fungsi usulan yang sesuai: usulkanUbahBarang, usulkanHapusBarang, usulkanPeminjaman, usulkanUbahPeminjaman (termasuk menandai barang sudah dikembalikan), usulkanHapusPeminjaman, usulkanPerawatan, usulkanUbahPerawatan, dan usulkanHapusPerawatan. Semua fungsi ini hanya menampilkan kartu konfirmasi; data baru berubah setelah petugas menekan tombol konfirmasi. Jangan pernah menyatakan data sudah berubah atau terhapus.
   - Gunakan ID persis seperti pada data ([ID: ...]). Jika barang atau catatan yang dimaksud tidak ditemukan atau ada lebih dari satu kandidat, tanyakan dulu dan jangan menebak.
   - Untuk perubahan, isi hanya field yang berubah.
   - Tulis tanggal dengan format YYYY-MM-DD dan gunakan "Tanggal hari ini" pada data sebagai acuan. Jika batas kembali peminjaman belum disebutkan, tanyakan dulu.
   - Hanya usulkan penghapusan jika petugas memang memintanya. Menghapus barang juga menghapus seluruh catatan peminjaman dan perawatannya.
8. Baris berawalan [SISTEM] di riwayat percakapan dibuat otomatis oleh aplikasi. Jangan menulis baris seperti itu sendiri.
9. Untuk pertanyaan yang membutuhkan angka, rekap, filter, atau detail data (misalnya jumlah unit, unit tersedia, total biaya, barang di lokasi tertentu, peminjaman yang terlambat), panggil fungsi baca cariBarang, cariPeminjaman, cariPerawatan, atau rekapInventaris, lalu jawab berdasarkan hasilnya. Jangan menghitung sendiri dari daftar. Fungsi baca juga dapat dipakai untuk menemukan ID sebelum mengusulkan perubahan.

${dataContext}

Catatan penting:
Jika barang atau ruangan yang ditanyakan tidak ada di data di atas maupun di hasil fungsi cariBarang, jawab dengan ramah bahwa barang atau ruangan tersebut saat ini belum terdaftar di sistem inventaris.`
      }
    ]
  };

  const payload = {
    system_instruction: systemInstruction,
    contents: conversationHistory,
    tools: GEMINI_TOOLS,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };

  // Model fallback chain: mulai dari model terbaru
  const candidateModels = [
    modelToUse,
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;

  for (const m of candidateModels) {
    try {
      let contents = payload.contents;
      let replyText = "";
      const proposedItems = [];
      const actionCalls = [];

      // Model boleh meminta data lewat fungsi baca; aplikasi menjalankannya lalu mengirim hasilnya kembali,
      // sampai model menjawab tanpa fungsi baca. Usulan perubahan dikumpulkan untuk ditampilkan sebagai kartu.
      for (let step = 1; ; step++) {
        const response = await callGeminiModel(m, { ...payload, contents }, apiKey);

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          const errMsg = errJson.error?.message || `HTTP ${response.status}`;
          if (response.status === 404 || errMsg.toLowerCase().includes("not found")) {
            console.warn(`Model ${m} tidak tersedia (404), mencoba kandidat berikutnya...`);
            throw new Error(`404: ${errMsg}`);
          }
          throw new Error(errMsg);
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const stepText = parts
          .filter(p => typeof p.text === "string" && !p.thought)
          .map(p => p.text)
          .join("")
          .trim();
        if (stepText) replyText = stepText;

        const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);
        proposedItems.push(...calls
          .filter(c => c.name === "usulkanTambahBarang")
          .flatMap(c => Array.isArray(c.args?.items) ? c.args.items : []));
        actionCalls.push(...calls.filter(c => c.name !== "usulkanTambahBarang" && !isReadTool(c.name)));

        if (!calls.some(c => isReadTool(c.name))) break;
        if (step >= MAX_TOOL_STEPS) throw new Error("Asisten terlalu banyak meminta data. Coba sederhanakan pertanyaan.");

        // Setiap functionCall di giliran ini dijawab: fungsi baca dengan hasil query, usulan dengan status kartunya
        contents = [
          ...contents,
          { role: "model", parts },
          {
            role: "user",
            parts: calls.map(c => ({
              functionResponse: {
                name: c.name,
                response: isReadTool(c.name)
                  ? runAiQuery(c.name, c.args, aiContext())
                  : { hasil: "Kartu konfirmasi ditampilkan kepada petugas. Data belum berubah sampai petugas menekan tombol konfirmasi." }
              }
            }))
          }
        ];
      }

      if (!replyText && proposedItems.length === 0 && actionCalls.length === 0) {
        throw new Error("Respon teks dari model Gemini kosong.");
      }
      return { replyText, proposedItems, actionCalls, activeModel: m };
    } catch (err) {
      lastError = err;
      if (err.message && (err.message.includes("404") || err.message.toLowerCase().includes("not found"))) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Gagal terhubung ke layanan Gemini API.");
}

// Handler Kirim Pesan Pengguna
export async function handleUserMessage(promptText) {
  const text = promptText.trim();
  if (!text || isGeminiWaiting) return;

  const apiKey = getActiveGeminiApiKey();
  const currentModel = getActiveGeminiModel();

  // Tambahkan bubble user
  appendChatMessage("user", text);
  geminiChatInput.value = "";
  geminiChatInput.style.height = "auto";

  // Mode proxy butuh token login Firebase; mode langsung butuh API Key
  if (GEMINI_PROXY_URL) {
    if (!state.currentUser) {
      appendChatMessage("bot", "⚠️ <strong>Silakan login terlebih dahulu</strong> untuk memakai Asisten AI.", false);
      return;
    }
  } else if (!apiKey) {
    const notice = `⚠️ **Gemini API Key belum terkonfigurasi.**<br><br>
Agar asisten AI dapat menjawab:<br>
1. <strong>Pengembangan lokal:</strong> isi <code>VITE_GEMINI_API_KEY</code> di file <code>.env.local</code>, atau gunakan build Cloud Run yang memanggil Gemini lewat proxy server.<br><br>
2. <strong>Uji Langsung:</strong> Klik ikon <i class="bi bi-gear-fill"></i> <strong>Pengaturan</strong> di kanan atas chat ini untuk memasukkan API Key secara langsung (dapat dibuat gratis di <a href="https://aistudio.google.com/" target="_blank" rel="noopener">Google AI Studio</a>).`;
    appendChatMessage("bot", notice, false);
    geminiSettingsPanel.classList.remove("d-none");
    return;
  }

  // Siapkan history percakapan
  geminiChatHistory.push({
    role: "user",
    parts: [{ text: text }]
  });

  if (geminiChatHistory.length > 20) {
    geminiChatHistory = geminiChatHistory.slice(geminiChatHistory.length - 20);
  }

  // State loading
  isGeminiWaiting = true;
  btnGeminiSend.disabled = true;
  showTypingIndicator();
  const epoch = chatEpoch;

  try {
    const { replyText, proposedItems, actionCalls, activeModel } = await requestGeminiAPI(geminiChatHistory, currentModel, apiKey);
    if (epoch !== chatEpoch) return; // chat direset (mis. logout) selagi menunggu: abaikan jawaban
    hideTypingIndicator();

    // Simpan respon AI ke history (teksnya dilengkapi catatan status kartu-kartu usulan)
    const historyEntry = {
      role: "model",
      parts: [{ text: replyText }]
    };
    geminiChatHistory.push(historyEntry);

    // Update badge jika ada fallback model yang dipakai
    if (activeModel && activeModel !== currentModel) {
      geminiModelBadge.textContent = activeModel;
    }

    if (replyText) {
      appendChatMessage("bot", replyText, true);
    }
    const addNote = createHistoryNotes(historyEntry, replyText);
    if (proposedItems.length > 0) {
      appendProposalCard(proposedItems, addNote());
    }
    actionCalls.forEach((call) => appendActionCard(call, addNote()));
  } catch (error) {
    if (epoch !== chatEpoch) return;
    hideTypingIndicator();
    console.error("Gemini API Error:", error);
    const errorMsg = `❌ **Gagal memproses pesan:** ${escapeHtml(error.message || "Terjadi kesalahan koneksi")}.<br><br>
Periksa kembali apakah API Key Anda valid dan memiliki kuota di Google AI Studio.`;
    appendChatMessage("bot", errorMsg, false);
  } finally {
    isGeminiWaiting = false;
    btnGeminiSend.disabled = false;
    geminiChatInput.focus();
  }
}

// Submit Chat Form
geminiChatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleUserMessage(geminiChatInput.value);
});

// Enter to Send (Shift+Enter untuk baris baru)
geminiChatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleUserMessage(geminiChatInput.value);
  }
});

// Auto resize textarea
geminiChatInput.addEventListener("input", () => {
  geminiChatInput.style.height = "auto";
  geminiChatInput.style.height = Math.min(geminiChatInput.scrollHeight, 90) + "px";
});

// Quick Chips Event Delegation
geminiMessages.addEventListener("click", (e) => {
  const chip = e.target.closest(".gemini-chip-btn");
  if (chip && chip.dataset.prompt) {
    handleUserMessage(chip.dataset.prompt);
  }
});

// Inisialisasi awal UI Gemini
refreshGeminiConfigUI();
