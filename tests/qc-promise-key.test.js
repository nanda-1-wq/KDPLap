// deno test --allow-read tests/qc-promise-key.test.js   (from the repo root)
// 07 Quality Control, E14.2: promiseKey (js/qc-promise-key.js), and E14.5: its
// server twin (lib/promise_check.ts promiseKey). tests/fixtures/qc-promise-key.json
// holds fixed values and both twins run on it (plan 4.9), so the two cannot
// differ. Do not change a value to make a test pass.
import { assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import "../js/word-budget.js";
import "../js/sentences.js";
import "../js/text-checks.js";
import "../js/export-rules.js";
import "../js/section-check-key.js";
import "../js/qc-promise-key.js";
import { promiseKey, promiseSections } from "../supabase/functions/generate/lib/promise_check.ts";

const K = globalThis.kdpQcPromiseKey;
const FIXED = JSON.parse(Deno.readTextFileSync(new URL("./fixtures/qc-promise-key.json", import.meta.url)));

Deno.test("promiseKey: the fixed values both twins must give", () => {
  assertEquals(FIXED.cases.length >= 7, true);
  for (const c of FIXED.cases) assertEquals(K(c.input), c.key, c.name);
});

Deno.test("promiseKey: the server twin gives the same fixed values", () => {
  for (const c of FIXED.cases) assertEquals(promiseKey(c.input), c.key, c.name);
});

Deno.test("promiseKey: the twins agree on odd text too", () => {
  const base = { versionIds: ["v1", "v2"], chapterTitle: "Evenings", objective: "Reader can wind down", lockedAt: "2026-10-01T09:00:00.123456+00:00" };
  for (const p of [
    base, { ...base, chapterTitle: null }, { ...base, objective: undefined }, { ...base, lockedAt: null }, { ...base, versionIds: [] }, {},
    { ...base, chapterTitle: "“Pain-Free” Yoga — Café Moves 🧘 椅子ヨガ" }, { ...base, chapterTitle: "a\u0001b", objective: "c\u0002d" }, { ...base, objective: "  spaces\n" },
  ]) assertEquals(promiseKey(p), K(p), JSON.stringify(p));
});

Deno.test("the twins list the same versions: same blank rule (0019 text_is_blank), same order", () => {
  const texts = { a: "Text.", b: " \n\t\r\f\v", c: "", d: "\u00a0", e: "More.", f: null };
  const ids = Object.keys(texts);
  const browser = { sections: ids.map((id) => ({ version: texts[id] === null ? null : { id, content: texts[id] } })) };
  const outline = { sections: ids.map((id) => ({ id: `s${id}`, title: null, current_version_id: texts[id] === null ? null : id })) };
  const versions = ids.filter((id) => texts[id] !== null).map((id) => ({ id, content: texts[id] }));
  const server = promiseSections(outline, 2, versions).map((s) => s.versionId);
  assertEquals(server, K.versionIds(browser));
  assertEquals(server, ["a", "d", "e"]);
});

Deno.test("promiseKey: 16 hex; every input moves it; spaces around the text do not", () => {
  const base = { versionIds: ["v1", "v2"], chapterTitle: "Evenings", objective: "Reader can wind down", lockedAt: "2026-10-01T09:00:00.123456+00:00" };
  const key = K(base);
  assertMatch(key, /^[0-9a-f]{16}$/);
  assertNotEquals(K({ ...base, versionIds: ["v2", "v1"] }), key);
  assertNotEquals(K({ ...base, versionIds: ["v1"] }), key);
  assertNotEquals(K({ ...base, chapterTitle: "Mornings" }), key);
  assertNotEquals(K({ ...base, objective: "Other" }), key);
  assertNotEquals(K({ ...base, lockedAt: null }), key);
  assertEquals(K({ ...base, chapterTitle: "  Evenings\n" }), key);
  // The two separators keep the parts apart.
  assertNotEquals(K({ ...base, versionIds: ["v1v2"] }), key);
  assertNotEquals(K({ ...base, chapterTitle: "Reader", objective: "Evenings" }), K({ ...base, chapterTitle: "Evenings", objective: "Reader" }));
});

Deno.test("versionIds: sections with text, in order; ofChapter reads the chapter", () => {
  const v = (id, content) => ({ version: { id, content } });
  const chapter = { title: "Evenings", objective: null, sections: [v("a", "Text."), { version: null }, v("b", " \n\t"), v("c", "More.")] };
  assertEquals(K.versionIds(chapter), ["a", "c"]);
  assertEquals(K.versionIds(null), []);
  assertEquals(K.ofChapter(chapter, { locked_at: "x" }), K({ versionIds: ["a", "c"], chapterTitle: "Evenings", objective: null, lockedAt: "x" }));
  assertEquals(K.ofChapter(chapter, null), K({ versionIds: ["a", "c"], chapterTitle: "Evenings" }));
});
