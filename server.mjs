// Server produksi untuk Cloud Run.
// - Menyajikan hasil build (dist/) dari `npm run build:cloudrun`.
// - Meneruskan request Gemini dari petugas yang sudah login, sehingga
//   GEMINI_API_KEY hanya ada di server dan tidak pernah sampai ke browser.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const DIST_DIR = process.env.DIST_DIR || join(import.meta.dirname, "dist");
const { GEMINI_API_KEY, FIREBASE_API_KEY } = process.env;
// URL upstream dan DIST_DIR dapat diganti lewat environment variable. Hanya dipakai oleh
// tests/server.test.mjs; di produksi biarkan kosong agar memakai nilai bawaan di bawah.
const IDENTITY_TOOLKIT_URL = process.env.IDENTITY_TOOLKIT_URL || "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";

// Sama dengan pilihan model di panel pengaturan chat (index.html)
const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 2048;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function sendError(res, status, message) {
  // Format error sama dengan Gemini API agar ditangani oleh kode chat yang sudah ada
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: { message } }));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return { error: [413, "Permintaan terlalu besar."] };
    chunks.push(chunk);
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { error: [400, "Body request bukan JSON yang valid."] };
  }
}

// Verifikasi Firebase ID token lewat Identity Toolkit (token ditolak jika palsu atau kedaluwarsa).
// Mengembalikan data akun, atau null jika token tidak valid.
async function lookupFirebaseUser(idToken) {
  const response = await fetch(
    `${IDENTITY_TOOLKIT_URL}?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.users?.[0] || null;
}

async function handleGemini(req, res, model) {
  if (!ALLOWED_MODELS.has(model)) return sendError(res, 400, `Model ${model} tidak diizinkan.`);

  const idToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = idToken ? await lookupFirebaseUser(idToken) : null;
  if (!user) return sendError(res, 401, "Sesi login tidak valid. Silakan login ulang.");
  // Sama dengan Security Rules: hanya akun yang emailnya sudah diverifikasi
  if (!user.emailVerified) return sendError(res, 403, "Email belum diverifikasi. Silakan verifikasi email Anda terlebih dahulu.");

  const { body, error } = await readJsonBody(req);
  if (error) return sendError(res, ...error);

  // Hanya field yang dipakai aplikasi yang diteruskan, dengan batas panjang jawaban
  const upstreamBody = {
    system_instruction: body.system_instruction,
    contents: body.contents,
    tools: body.tools,
    generationConfig: {
      temperature: body.generationConfig?.temperature,
      maxOutputTokens: Math.min(Number(body.generationConfig?.maxOutputTokens) || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)
    }
  };

  const upstream = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify(upstreamBody)
  });
  res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(await upstream.text());
}

async function serveStatic(req, res, pathname) {
  // normalize() + cek prefix mencegah path traversal keluar dari folder dist
  const filePath = join(DIST_DIR, normalize(pathname === "/" ? "/index.html" : pathname));
  if (!filePath.startsWith(DIST_DIR + sep)) return sendError(res, 404, "Tidak ditemukan.");

  let data;
  try {
    data = await readFile(filePath);
  } catch {
    return sendError(res, 404, "Tidak ditemukan.");
  }

  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
    // File di /assets/ punya hash di namanya, jadi aman di-cache lama
    "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"
  });
  res.end(req.method === "HEAD" ? undefined : data);
}

if (!GEMINI_API_KEY || !FIREBASE_API_KEY) {
  console.error("Environment variable GEMINI_API_KEY dan FIREBASE_API_KEY wajib di-set.");
  process.exit(1);
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    const geminiMatch = pathname.match(/^\/api\/gemini\/([\w.-]+)$/);
    if (geminiMatch) {
      if (req.method !== "POST") return sendError(res, 405, "Gunakan metode POST.");
      return await handleGemini(req, res, geminiMatch[1]);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405, "Metode tidak didukung.");
    await serveStatic(req, res, pathname);
  } catch (err) {
    console.error("Request gagal:", err);
    if (!res.headersSent) sendError(res, 502, "Gagal menghubungi layanan Gemini.");
  }
}).listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
