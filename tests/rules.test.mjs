// Menjaga agar database.rules.json tidak menyimpang dari form di index.html.
// Catatan: berkas ini memeriksa kesesuaian isi aturan, bukan menjalankan Firebase Rules engine.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const rules = JSON.parse(readFileSync(new URL("database.rules.json", root), "utf8"));
const html = readFileSync(new URL("index.html", root), "utf8");
const inventaris = rules.rules.inventaris;
const item = inventaris.$itemId;
const peminjaman = rules.rules.peminjaman;
const pinjam = peminjaman.$peminjamanId;
const perawatan = rules.rules.perawatan;
const rawat = perawatan.$perawatanId;

function selectOptions(id) {
  const m = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(m, `<select id="${id}"> tidak ditemukan di index.html`);
  return [...m[1].matchAll(/<option value="([^"]*)"/g)].map((x) => x[1]).filter(Boolean);
}

// Nama field pada objek `const <name> = { ... };` yang disimpan form ke database
function payloadKeys(name) {
  const block = html.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`));
  assert.ok(block, `blok ${name} tidak ditemukan di index.html`);
  return [...block[1].matchAll(/^\s+(\w+):/gm)].map((x) => x[1]);
}

const quoted = (rule) => [...rule.matchAll(/== '([^']+)'/g)].map((x) => x[1]);
const sorted = (arr) => [...arr].sort();
// Data hanya untuk pengguna login yang emailnya sudah diverifikasi
const VERIFIED_ONLY = "auth != null && auth.token.email_verified == true";
const requiredFields = (node) => [...node[".validate"].matchAll(/'(\w+)'/g)].map((x) => x[1]);
const ruleFields = (node) => Object.keys(node).filter((k) => !k.startsWith(".") && !k.startsWith("$"));

describe("database.rules.json", () => {
  test("baca/tulis mewajibkan login dengan email terverifikasi", () => {
    assert.equal(inventaris[".read"], VERIFIED_ONLY);
    assert.equal(inventaris[".write"], VERIFIED_ONLY);
  });

  test("daftar kategori sama dengan form", () => {
    assert.deepEqual(sorted(quoted(item.kategori[".validate"])), sorted(selectOptions("kategori")));
  });

  test("daftar kondisi sama dengan form", () => {
    assert.deepEqual(sorted(quoted(item.kondisi[".validate"])), sorted(selectOptions("kondisi")));
  });

  test("field wajib sama dengan payload yang disimpan form", () => {
    const keys = payloadKeys("payload");
    assert.deepEqual(sorted(requiredFields(item)), sorted(keys));
    assert.deepEqual(sorted(ruleFields(item)), sorted(keys));
  });

  test("jumlah wajib bilangan bulat minimal 1", () => {
    const rule = item.jumlah[".validate"];
    assert.ok(rule.includes("isNumber()"));
    assert.ok(rule.includes(">= 1"));
    assert.ok(rule.includes("% 1 == 0"));
  });

  test("field di luar skema ditolak", () => {
    assert.equal(item.$other[".validate"], false);
  });

  test("firebase.json menunjuk ke berkas rules", () => {
    const cfg = JSON.parse(readFileSync(new URL("firebase.json", root), "utf8"));
    assert.equal(cfg.database.rules, "database.rules.json");
  });
});

describe("database.rules.json: peminjaman & perawatan", () => {
  for (const [name, node] of [["peminjaman", peminjaman], ["perawatan", perawatan]]) {
    test(`${name}: baca/tulis mewajibkan login dengan email terverifikasi`, () => {
      assert.equal(node[".read"], VERIFIED_ONLY);
      assert.equal(node[".write"], VERIFIED_ONLY);
    });
  }

  test("peminjaman: field wajib sama dengan payload yang disimpan form", () => {
    const keys = payloadKeys("peminjamanPayload");
    assert.deepEqual(sorted(requiredFields(pinjam)), sorted(keys));
    assert.deepEqual(sorted(ruleFields(pinjam)), sorted(keys));
  });

  test("perawatan: field wajib sama dengan payload yang disimpan form", () => {
    const keys = payloadKeys("perawatanPayload");
    assert.deepEqual(sorted(requiredFields(rawat)), sorted(keys));
    assert.deepEqual(sorted(ruleFields(rawat)), sorted(keys));
  });

  test("status peminjaman sama dengan form", () => {
    assert.deepEqual(sorted(quoted(pinjam.status[".validate"])), sorted(selectOptions("peminjamanStatus")));
  });

  test("jenis dan status perawatan sama dengan form", () => {
    assert.deepEqual(sorted(quoted(rawat.jenis[".validate"])), sorted(selectOptions("perawatanJenis")));
    assert.deepEqual(sorted(quoted(rawat.status[".validate"])), sorted(selectOptions("perawatanStatus")));
  });

  test("barangId wajib merujuk ke barang yang ada di inventaris", () => {
    for (const node of [pinjam, rawat]) {
      assert.ok(node.barangId[".validate"].includes("root.child('inventaris/' + newData.val()).exists()"));
    }
  });

  test("jumlah peminjaman bilangan bulat minimal 1, biaya perawatan minimal 0", () => {
    assert.ok(pinjam.jumlah[".validate"].includes(">= 1"));
    assert.ok(rawat.biaya[".validate"].includes(">= 0"));
    for (const rule of [pinjam.jumlah[".validate"], rawat.biaya[".validate"]]) {
      assert.ok(rule.includes("isNumber()"));
      assert.ok(rule.includes("% 1 == 0"));
    }
  });

  test("field di luar skema ditolak", () => {
    assert.equal(pinjam.$other[".validate"], false);
    assert.equal(rawat.$other[".validate"], false);
  });
});
