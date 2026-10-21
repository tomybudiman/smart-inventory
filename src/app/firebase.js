// Konfigurasi & inisialisasi Firebase (Authentication & Realtime Database).
// Konfigurasi diisi Vite saat build dari file .env.local (lihat .env.example).
// Fungsi SDK yang dipakai modul lain diekspor ulang dari sini agar versi SDK cukup diatur di satu tempat.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  reload
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
export { ref, push, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY_HERE",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID"
};

// Inisialisasi Firebase App, Auth, dan Database
export let app, auth, db;
export let isFirebaseConfigured = true;

try {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("YOUR_API_KEY")) {
    isFirebaseConfigured = false;
    console.warn("PERINGATAN: Konfigurasi Firebase belum diatur. Isi VITE_FIREBASE_* di .env.local sesuai .env.example.");
  }
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  auth.languageCode = "id"; // email verifikasi dikirim dalam Bahasa Indonesia
  db = getDatabase(app);
} catch (err) {
  console.error("Gagal menginisialisasi Firebase:", err);
}
