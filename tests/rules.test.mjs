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

function selectOptions(id) {
  const m = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(m, `<select id="${id}"> tidak ditemukan di index.html`);
  return [...m[1].matchAll(/<option value="([^"]*)"/g)].map((x) => x[1]).filter(Boolean);
}

const quoted = (rule) => [...rule.matchAll(/== '([^']+)'/g)].map((x) => x[1]);
const sorted = (arr) => [...arr].sort();

describe("database.rules.json", () => {
  test("baca/tulis mewajibkan pengguna login", () => {
    assert.equal(inventaris[".read"], "auth != null");
    assert.equal(inventaris[".write"], "auth != null");
  });

  test("daftar kategori sama dengan form", () => {
    assert.deepEqual(sorted(quoted(item.kategori[".validate"])), sorted(selectOptions("kategori")));
  });

  test("daftar kondisi sama dengan form", () => {
    assert.deepEqual(sorted(quoted(item.kondisi[".validate"])), sorted(selectOptions("kondisi")));
  });

  test("field wajib sama dengan payload yang disimpan form", () => {
    const block = html.match(/const payload = \{([\s\S]*?)\};/);
    assert.ok(block, "blok payload tidak ditemukan di index.html");
    const payloadKeys = [...block[1].matchAll(/^\s+(\w+):/gm)].map((x) => x[1]);

    const required = [...item[".validate"].matchAll(/'(\w+)'/g)].map((x) => x[1]);
    const ruleKeys = Object.keys(item).filter((k) => !k.startsWith(".") && !k.startsWith("$"));

    assert.deepEqual(sorted(required), sorted(payloadKeys));
    assert.deepEqual(sorted(ruleKeys), sorted(payloadKeys));
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
