// deno test --allow-read tests/section-check-key.test.js   (from the repo root)
// The section check fingerprint (E10.4) lives in two places: the browser
// (js/section-check-key.js) and the generate function (lib/section_check.ts),
// which saves it with each AI check. The browser compares the two to show
// "Out of date". This test fails if they ever give different keys.
import { assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import { sectionCheckKey, siblingParts } from "../supabase/functions/generate/lib/section_check.ts";
import "../js/section-check-key.js";

const browserKey = globalThis.kdpSectionCheckKey;
const V = "70000001-0000-4000-8000-000000000000";
const base = {
  versionId: V, kind: "chapter", chapterTitle: "Upper Body: Neck, Shoulders, Arms", objective: "Reader can do 6 upper-body moves, none overhead",
  sectionTitle: "Shoulder rolls, both ways", lockedAt: "2026-10-01T09:00:00.123456+00:00", penName: "Nora Hale",
  voice: { tones: ["warm", "encouraging"], reading_level: "general", perspective: "second", sentences: "short", paragraphs: "short",
    sample: "You don't need a mat. You need a sturdy chair and five quiet minutes. " + "Sit tall, let your shoulders drop. ".repeat(40) },
  // G3 P10: the word target and the chapter's other sections ("<n> <title>").
  wordTarget: 450, siblings: ["1 Neck turns and tilts", "3 Arm circles below the shoulder"],
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
    ["no target, no siblings (introduction)", { ...base, kind: "intro", wordTarget: null, siblings: [] }],
    ["the parts left out (keys made before G3 P10 had none)", { ...base, wordTarget: undefined, siblings: undefined }],
    ["a sibling with no title", { ...base, siblings: ["1 ", "3 Arm circles below the shoulder"] }],
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
    ["word target (G3 P10)", { ...base, wordTarget: 600 }],
    ["no word target", { ...base, wordTarget: null }],
    ["a sibling renamed", { ...base, siblings: ["1 Neck turns", "3 Arm circles below the shoulder"] }],
    ["the siblings moved", { ...base, siblings: ["2 Neck turns and tilts", "3 Arm circles below the shoulder"] }],
    ["a sibling added", { ...base, siblings: [...base.siblings, "4 Rest"] }],
  ]) assertNotEquals(browserKey(p), k, name);
  // Target 0 is no target, as the prompt sends it.
  assertEquals(browserKey({ ...base, wordTarget: 0 }), browserKey({ ...base, wordTarget: null }));
  // Spaces around a value do not.
  assertEquals(browserKey({ ...base, sectionTitle: "  Shoulder rolls, both ways " }), k);
});

Deno.test("section check key: a pinned value (a change to the parts or the hash shows here)", () => {
  const p = { versionId: V, kind: "chapter", chapterTitle: "A", objective: "B", sectionTitle: "C", lockedAt: null, penName: null, voice: null };
  // G3 P10 changed the parts (target and siblings added): was 9693357c0bef14d1.
  assertEquals(browserKey(p), "b9d39da34ee8fb03");
  assertEquals(sectionCheckKey(p), "b9d39da34ee8fb03");
  assertEquals(browserKey({ versionId: "", kind: "", chapterTitle: "", objective: "", sectionTitle: "", lockedAt: "", penName: "", voice: {} }).length, 16);
});

Deno.test("section check key: the siblings, browser and server the same (G3 P10)", () => {
  const sections = [{ id: "a", title: "Neck turns and tilts" }, { id: "b", title: "Shoulder rolls, both ways" }, { id: "c", title: " Arm circles " }, { id: "d", title: null }];
  const want = ["1 Neck turns and tilts", "3 Arm circles", "4 "];
  assertEquals(siblingParts("chapter", sections, "b"), want);
  assertEquals(browserKey.siblings("chapter", sections, "b"), want);
  assertEquals(siblingParts("intro", sections, "b"), []);
  assertEquals(browserKey.siblings("conclusion", sections, "b"), []);
});
