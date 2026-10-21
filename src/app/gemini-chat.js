// Asisten AI Gemini: widget chat, konteks data realtime, dan usulan tambah barang (function calling).
// Build Cloud Run memanggil Gemini lewat proxy server.mjs; mode lokal memakai API key dari .env.local / browser.
import { db, env, isFirebaseConfigured, push, update } from "./firebase.js";
import {
  escapeHtml,
  formatMarkdown,
  getInventoryContextSummary,
  getPeminjamanPerawatanContextSummary,
  toIsoDate,
  validateProposedItem
} from "../inventory-logic.mjs";
import { inventarisRef } from "./inventaris.js";
import { state } from "./state.js";
import { getKondisiBadge, showToast } from "./ui.js";

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
// TAMBAH BARANG VIA AI (Function Calling + Kartu Konfirmasi)
// Gemini hanya mengusulkan draft; data baru ditulis ke database
// setelah petugas menekan "Simpan" pada kartu konfirmasi di chat.
// -------------------------------------------------------------
// Pilihan kategori & kondisi diambil dari form Tambah Barang agar selalu sama
const KATEGORI_OPTIONS = Array.from(document.getElementById("kategori").options).map(o => o.value).filter(Boolean);
const KONDISI_OPTIONS = Array.from(document.getElementById("kondisi").options).map(o => o.value).filter(Boolean);

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
  }]
}];

// Catatan usulan untuk riwayat chat. Disimpan sebagai teks (bukan functionCall)
// agar riwayat tetap valid walaupun model fallback berganti di tengah percakapan.
function buildProposalHistoryNote(entries, status) {
  const list = entries
    .map(({ item }) => `${item.namaBarang || "?"} (${item.jumlah} unit, ${item.kategori}, ${item.kondisi}, lokasi: ${item.lokasi})`)
    .join("; ");
  return `[SISTEM] Draft penambahan barang ditampilkan sebagai kartu konfirmasi: ${list}. Status: ${status}.`;
}

function appendProposalCard(rawItems, historyEntry, replyText) {
  const entries = rawItems.map((raw) => validateProposedItem(raw, KATEGORI_OPTIONS, KONDISI_OPTIONS));
  const validItems = entries.filter(e => e.errors.length === 0).map(e => e.item);
  const existingLocations = new Set(
    Object.values(state.inventoryData).map(i => (i.lokasi || "").trim().toLowerCase()).filter(Boolean)
  );
  const isNewLocation = (item) => Boolean(item.lokasi) && !existingLocations.has(item.lokasi.toLowerCase());
  const hasNewLocation = entries.some(e => e.errors.length === 0 && isNewLocation(e.item));

  const setHistoryStatus = (status) => {
    historyEntry.parts[0].text = (replyText ? replyText + "\n\n" : "") + buildProposalHistoryNote(entries, status);
  };
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
  const inventoryContext = getInventoryContextSummary(state.inventoryData);
  const transaksiContext = getPeminjamanPerawatanContextSummary(state.inventoryData, state.peminjamanData, state.perawatanData, toIsoDate(new Date()));
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
7. Anda tidak dapat mengubah atau menghapus data barang, dan tidak dapat mencatat, mengubah, atau menghapus data peminjaman maupun perawatan. Jika diminta, arahkan petugas memakai tombol Edit atau Hapus di tabel inventaris, atau tab Peminjaman / Perawatan.
8. Baris berawalan [SISTEM] di riwayat percakapan dibuat otomatis oleh aplikasi. Jangan menulis baris seperti itu sendiri.

=== DATA INVENTARIS REALTIME SAAT INI ===
${inventoryContext}
=========================================

=== DATA PEMINJAMAN & PERAWATAN REALTIME ===
${transaksiContext}
============================================

Catatan penting:
Jika pengguna bertanya tentang barang atau ruangan yang tidak tercantum dalam data di atas, jawab dengan ramah bahwa barang atau ruangan tersebut saat ini belum terdaftar di sistem inventaris.`
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
      const response = await callGeminiModel(m, payload, apiKey);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${response.status}`;
        if (response.status === 404 || errMsg.toLowerCase().includes("not found")) {
          console.warn(`Model ${m} tidak tersedia (404), mencoba kandidat berikutnya...`);
          lastError = new Error(errMsg);
          continue;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const replyText = parts
        .filter(p => typeof p.text === "string" && !p.thought)
        .map(p => p.text)
        .join("")
        .trim();
      const proposedItems = parts
        .filter(p => p.functionCall?.name === "usulkanTambahBarang")
        .flatMap(p => Array.isArray(p.functionCall.args?.items) ? p.functionCall.args.items : []);
      if (!replyText && proposedItems.length === 0) {
        throw new Error("Respon teks dari model Gemini kosong.");
      }
      return { replyText, proposedItems, activeModel: m };
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
    const { replyText, proposedItems, activeModel } = await requestGeminiAPI(geminiChatHistory, currentModel, apiKey);
    if (epoch !== chatEpoch) return; // chat direset (mis. logout) selagi menunggu: abaikan jawaban
    hideTypingIndicator();

    // Simpan respon AI ke history (teksnya dilengkapi catatan usulan oleh appendProposalCard)
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
    if (proposedItems.length > 0) {
      appendProposalCard(proposedItems, historyEntry, replyText);
    }
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
