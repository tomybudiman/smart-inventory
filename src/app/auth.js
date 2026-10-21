// Autentikasi petugas: login, register, logout, dan verifikasi email (Firebase Authentication).
import {
  auth,
  isFirebaseConfigured,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  reload
} from "./firebase.js";
import { mapAuthErrorMessage } from "../inventory-logic.mjs";
import { state } from "./state.js";
import { showToast } from "./ui.js";

let resendCooldownTimer = null; // jeda tombol kirim ulang email verifikasi

// Views
const initialLoading = document.getElementById("initialLoading");
const authView = document.getElementById("authView");
const dashboardView = document.getElementById("dashboardView");
const navUserSection = document.getElementById("navUserSection");
const navUserEmail = document.getElementById("navUserEmail");

// Auth Elements
const formLogin = document.getElementById("formLogin");
const formRegister = document.getElementById("formRegister");
const btnLoginSubmit = document.getElementById("btnLoginSubmit");
const btnRegisterSubmit = document.getElementById("btnRegisterSubmit");
const btnLogout = document.getElementById("btnLogout");
const authAlert = document.getElementById("authAlert");
const authAlertText = document.getElementById("authAlertText");

// Email Verification Elements
const verifyView = document.getElementById("verifyView");
const verifyEmailAddress = document.getElementById("verifyEmailAddress");
const verifyAlert = document.getElementById("verifyAlert");
const btnCheckVerified = document.getElementById("btnCheckVerified");
const btnResendVerification = document.getElementById("btnResendVerification");
const btnVerifyLogout = document.getElementById("btnVerifyLogout");

function showAuthAlert(message) {
  authAlertText.textContent = message;
  authAlert.classList.remove("d-none");
}

function hideAuthAlert() {
  authAlert.classList.add("d-none");
  authAlertText.textContent = "";
}

// type: kelas warna alert Bootstrap (danger, warning, success); message kosong = sembunyikan
function showVerifyAlert(message, type = "danger") {
  verifyAlert.className = `alert alert-${type} py-2 px-3 small text-start mb-3${message ? "" : " d-none"}`;
  verifyAlert.textContent = message;
}

// Diisi main.js lewat initAuth(): mulai/hentikan sinkronisasi data dan reset chat AI
let hooks = { startSync() {}, stopSync() {}, resetChat() {} };

// Pantau sesi login: dashboard hanya untuk akun yang emailnya sudah terverifikasi
export function initAuth(callbacks) {
  hooks = { ...hooks, ...callbacks };

  if (auth) {
    onAuthStateChanged(auth, (user) => {
      // Hilangkan initial splash loader
      initialLoading.style.opacity = "0";
      setTimeout(() => initialLoading.classList.add("d-none"), 250);

      if (user && user.emailVerified) {
        // --- USER SUDAH LOGIN & EMAIL TERVERIFIKASI ---
        state.currentUser = user;
        authView.classList.add("d-none");
        verifyView.classList.add("d-none");
        dashboardView.classList.remove("d-none");
        navUserSection.classList.remove("d-none");
        navUserEmail.textContent = user.email;

        // Aktifkan Realtime Database Listener (inventaris, peminjaman, perawatan)
        hooks.startSync();
      } else {
        // --- GUEST, atau LOGIN tetapi email belum diverifikasi (belum boleh mengakses data) ---
        state.currentUser = null;
        state.inventoryData = {};
        state.peminjamanData = {};
        state.perawatanData = {};
        hooks.stopSync();
        hooks.resetChat(); // riwayat chat AI tidak boleh terbawa ke akun lain
        dashboardView.classList.add("d-none");
        navUserSection.classList.add("d-none");

        if (user) {
          authView.classList.add("d-none");
          verifyView.classList.remove("d-none");
          verifyEmailAddress.textContent = user.email;
        } else {
          verifyView.classList.add("d-none");
          authView.classList.remove("d-none");
          showVerifyAlert(""); // pesan verifikasi akun sebelumnya tidak boleh terbawa
        }

        if (!isFirebaseConfigured) {
          showAuthAlert("Konfigurasi Firebase belum diisi. Isi VITE_FIREBASE_* di file .env.local sesuai .env.example.");
        }
      }
    });
  } else {
    initialLoading.classList.add("d-none");
    authView.classList.remove("d-none");
    showAuthAlert("Firebase SDK gagal dimulai. Pastikan firebaseConfig telah dikonfigurasi.");
  }
}

// Handler Login
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthAlert();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showAuthAlert("Harap isi email dan kata sandi.");
    return;
  }

  btnLoginSubmit.disabled = true;
  btnLoginSubmit.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Memproses...`;

  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    formLogin.reset();
    // Akun yang belum terverifikasi diarahkan ke halaman verifikasi oleh onAuthStateChanged
    if (user.emailVerified) showToast("Login berhasil! Selamat datang.");
  } catch (error) {
    console.error("Login Error:", error);
    showAuthAlert(mapAuthErrorMessage(error.code || error.message));
  } finally {
    btnLoginSubmit.disabled = false;
    btnLoginSubmit.innerHTML = `<span>Masuk Sekarang</span><i class="bi bi-arrow-right"></i>`;
  }
});

// Handler Register
formRegister.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthAlert();

  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirm = document.getElementById("regPasswordConfirm").value;

  if (!email || !password || !confirm) {
    showAuthAlert("Semua kolom registrasi wajib diisi.");
    return;
  }

  if (password.length < 6) {
    showAuthAlert("Kata sandi minimal harus 6 karakter.");
    return;
  }

  if (password !== confirm) {
    showAuthAlert("Konfirmasi kata sandi tidak cocok.");
    return;
  }

  btnRegisterSubmit.disabled = true;
  btnRegisterSubmit.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Mendaftarkan...`;

  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    formRegister.reset();
    try {
      // Firebase mengirim email berisi tautan verifikasi ke alamat yang didaftarkan
      await sendEmailVerification(user);
      startResendCooldown();
      showToast("Pendaftaran berhasil! Tautan verifikasi telah dikirim ke email Anda.");
    } catch (error) {
      // Akun sudah dibuat; email bisa dikirim ulang dari halaman verifikasi
      console.error("Gagal mengirim email verifikasi:", error);
      showVerifyAlert("Akun berhasil dibuat, tetapi email verifikasi gagal dikirim. Silakan klik Kirim Ulang.", "warning");
    }
  } catch (error) {
    console.error("Register Error:", error);
    showAuthAlert(mapAuthErrorMessage(error.code || error.message));
  } finally {
    btnRegisterSubmit.disabled = false;
    btnRegisterSubmit.innerHTML = `<span>Daftarkan Akun</span><i class="bi bi-check2-circle"></i>`;
  }
});

// Handler Logout (navbar dashboard & halaman verifikasi email)
async function handleLogout() {
  // Lepas listener sebelum sesi berakhir agar tidak memicu error permission setelah logout
  hooks.stopSync();
  try {
    await signOut(auth);
    showToast("Anda telah berhasil keluar.", true);
  } catch (error) {
    console.error("Logout Error:", error);
    showToast("Gagal melakukan proses logout.", false);
    // Logout gagal: pengguna masih login, aktifkan kembali sinkronisasi data
    if (state.currentUser) hooks.startSync();
  }
}

btnLogout.addEventListener("click", handleLogout);
btnVerifyLogout.addEventListener("click", handleLogout);

// -------------------------------------------------------------
// 5B. VERIFIKASI EMAIL (sendEmailVerification)
// -------------------------------------------------------------

// Cek ulang status verifikasi. Token diperbarui agar klaim email_verified yang dibaca
// Security Rules & proxy Gemini ikut berubah, lalu halaman dimuat ulang supaya koneksi
// Realtime Database dimulai dengan token baru tersebut.
async function checkEmailVerified({ silent = false } = {}) {
  const user = auth.currentUser;
  if (!user || user.emailVerified) return;

  btnCheckVerified.disabled = true;
  try {
    await reload(user);
    if (user.emailVerified) {
      await user.getIdToken(true);
      window.location.reload();
      return;
    }
    if (!silent) showVerifyAlert("Email belum terverifikasi. Klik tautan di email Anda terlebih dahulu.", "warning");
  } catch (error) {
    console.error("Gagal memeriksa status verifikasi:", error);
    if (!silent) showVerifyAlert(mapAuthErrorMessage(error.code || error.message));
  } finally {
    btnCheckVerified.disabled = false;
  }
}

// Tombol kirim ulang dikunci sementara agar tidak terkena batas pengiriman Firebase
function startResendCooldown(seconds = 60) {
  clearInterval(resendCooldownTimer);
  let remaining = seconds;
  const tick = () => {
    btnResendVerification.disabled = remaining > 0;
    btnResendVerification.textContent = remaining > 0
      ? `Kirim Ulang Email Verifikasi (${remaining})`
      : "Kirim Ulang Email Verifikasi";
    if (remaining <= 0) clearInterval(resendCooldownTimer);
    remaining--;
  };
  tick();
  resendCooldownTimer = setInterval(tick, 1000);
}

btnCheckVerified.addEventListener("click", () => checkEmailVerified());

btnResendVerification.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  btnResendVerification.disabled = true;
  try {
    await sendEmailVerification(user);
    showVerifyAlert(`Email verifikasi telah dikirim ulang ke ${user.email}.`, "success");
    startResendCooldown();
  } catch (error) {
    console.error("Gagal mengirim ulang email verifikasi:", error);
    showVerifyAlert(mapAuthErrorMessage(error.code || error.message));
    btnResendVerification.disabled = false;
  }
});

// Saat pengguna kembali ke tab ini setelah mengklik tautan di email, cek otomatis
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !verifyView.classList.contains("d-none")) {
    checkEmailVerified({ silent: true });
  }
});
