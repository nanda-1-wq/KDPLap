// deno test --allow-read tests/section-check-key.test.js   (from the repo root)
// The section check fingerprint (E10.4) lives in two places: the browser
// (js/section-check-key.js) and the generate function (lib/section_check.ts),
// which saves it with each AI check. The browser compares the two to show
// "Out of date". This test fails if they ever give different keys.
import { assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import { sectionCheckKey } from "../supabase/functions/generate/lib/section_check.ts";
import "../js/section-check-key.js";

const browserKey = globalThis.kdpSectionCheckKey;
const V = "70000001-0000-4000-8000-000000000000";
const base = {
  versionId: V, kind: "chapter", chapterTitle: "Upper Body: Neck, Shoulders, Arms", objective: "Reader can do 6 upper-body moves, none overhead",
  sectionTitle: "Shoulder rolls, both ways", lockedAt: "2026-10-01T09:00:00.123456+00:00", penName: "Nora Hale",
  voice: { tones: ["warm", "encouraging"], reading_level: "general", perspective: "second", sentences: "short", paragraphs: "short",
    sample: "You don't need a mat. You need a sturdy chair and five quiet minutes. " + "Sit tall, let your shoulders drop. ".repeat(40) },
};

Deno.test("section check key: browser and server give the same key", () => {
  const cases = [
    ["design 22, 4.2", base],
    ["unlocked", { ...base, lockedAt: null }],
    ["introduction (no title, no objective)", { ...base, kind: "intro", chapterTitle: null, objective: null, sectionTitle: null }],
    ["no pen name, no voice", { ...base, penName: null, voice: null }],
    ["voice as {}", { ...base, voice: {} }],
    ["odd voice values (numbers, a list, spaces)", { ...base, voice: { tones: ["warm", 3, " direct "], reading_level: 5, perspective: ["second"], sample: "  Sit.  " } }],
    ["quotes, accents, emoji and CJK", { ...base, chapterTitle: "“Pain-Free” Yoga — Café Moves 🧘 椅子ヨガ", sectionTitle: "Tabs\tand  spaces\nand a line" }],
    ["the separator inside a title", { ...base, sectionTitle: "a\u0001b" }],
  ];
  for (const [name, p] of cases) {
    const b = browserKey(p);
    assertMatch(b, /^[0-9a-f]{16}$/, name);
    assertEquals(b, sectionCheckKey(p), name);
  }
});

Deno.test("section check key: each part changes it", () => {
  const k = browserKey(base);
  for (const [name, p] of [
    ["version", { ...base, versionId: "70000002-0000-4000-8000-000000000000" }],
    ["kind", { ...base, kind: "conclusion" }],
    ["chapter title", { ...base, chapterTitle: "Upper Body" }],
    ["objective", { ...base, objective: "Reader can do 6 moves" }],
    ["section title", { ...base, sectionTitle: "Shoulder rolls" }],
    ["lock time", { ...base, lockedAt: "2026-10-02T09:00:00+00:00" }],
    ["pen name", { ...base, penName: "Ruth Hale" }],
    ["tones", { ...base, voice: { ...base.voice, tones: ["formal"] } }],
    ["sample", { ...base, voice: { ...base.voice, sample: "Short." } }],
  ]) assertNotEquals(browserKey(p), k, name);
  // Spaces around a value do not.
  assertEquals(browserKey({ ...base, sectionTitle: "  Shoulder rolls, both ways " }), k);
});

Deno.test("section check key: a pinned value (a change to the parts or the hash shows here)", () => {
  const p = { versionId: V, kind: "chapter", chapterTitle: "A", objective: "B", sectionTitle: "C", lockedAt: null, penName: null, voice: null };
  assertEquals(browserKey(p), "9693357c0bef14d1");
  assertEquals(sectionCheckKey(p), "9693357c0bef14d1");
  assertEquals(browserKey({ versionId: "", kind: "", chapterTitle: "", objective: "", sectionTitle: "", lockedAt: "", penName: "", voice: {} }).length, 16);
});
