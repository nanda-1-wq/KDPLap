// NicheInk · print proof (E13.3): shows the Print PDF path is unchanged.
//
//   deno run --allow-read tools/print-fingerprint.mjs            (from the repo root)
//
// 1. The print-path files against docs/reviews/e17-print-before.sha (the baseline saved
//    on Nov 27, 2026, before any E17 code; the same 16 files as the E13.3 baseline of
//    Nov 23, plus this tool). Same as: shasum -a 256 -c <that file>. E17 changes some of
//    them on purpose, so a changed file is listed, not an error.
// 2. The Typst fingerprint: one sha256 over mainTyp() for 96 builds (4 styles x 3 labels
//    x 2 flag sets x 4 trims) plus blocks() of every converter case
//    (tests/fixtures/typst-cases.js). The baseline value is FINGERPRINT below. No E17
//    part is on in these builds, so it must never change.
// 3. E17: the parts fingerprint, the same 96 builds with every book part on
//    (tests/fixtures/part-cases.js, hostile text included), plus each part alone.
//    Its value is FINGERPRINT_PARTS below (saved at STOP 2, Nov 27, 2026).
// Exit code 1 when a fingerprint differs. Reads files only.

const FINGERPRINT = "1575accfb96bb1f5626d8eafb93c21e47e5f32b79a3c8a833b117650610c5685";
const FINGERPRINT_PARTS = "5979bce35dd32a70bb104f201e62a8ab497cb22fb00038b52b2da1f07bd78d17";
const REPO = new URL("..", import.meta.url);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes));

// 1. The files.
let ok = 0, bad = 0;
const lines = (await Deno.readTextFile(new URL("docs/reviews/e17-print-before.sha", REPO))).trim().split("\n");
for (const line of lines) {
  const [want, path] = line.split(/\s+/);
  const got = await sha(await Deno.readFile(new URL(path, REPO)));
  if (got === want) ok++; else bad++;
  console.log(`${path}: ${got === want ? "OK" : `changed since the E17 baseline (now ${got})`}`);
}
console.log(`files: ${ok}/${lines.length} unchanged`);

// 2. The fingerprint.
for (const f of ["js/markdown-lite.js", "js/word-budget.js", "js/sentences.js", "js/text-checks.js", "js/export-rules.js",
  "js/export-build.js", "js/format-rules.js", "js/format/md2typst.js", "tests/fixtures/typst-cases.js", "tests/fixtures/part-cases.js"]) await import(new URL(f, REPO).href);
const T = globalThis.kdpFormatTypst, F = globalThis.kdpFormatRules;
const v = (id, content) => ({ id, version_no: 1, content, partial: false, word_count: 1 });
const sec = (id, title, status, content) => ({ id, position: 1, title, status, version: content == null ? null : v(`v-${id}`, content) });
const data = { book: { id: "b", title: "Chair Yoga: \"Gentle\" #1", subtitle: "Moves for 60+ $5", pen_name: "Nora Hale", bio: "Nora teaches.\nShe lives by the sea.\n\nTwo cats.", trim: "5.5x8.5" },
  known: { brief: {}, research: { sources: [], competitors: [], insights: null } }, now: "2026-11-04T12:00:00Z",
  chapters: [
    { id: "ci", kind: "intro", position: 1, title: "", sections: [sec("si", "Why chairs", "final", "Chairs are *safe*.\n\nStart \"today\".")] },
    { id: "c1", kind: "chapter", position: 2, title: "Getting started", sections: [sec("s11", "Your chair", "final", "## Pick a chair\n\nNo wheels. [Verify: no source]\n\n> a quote\n\n1. one\n2. two")] },
    { id: "c2", kind: "chapter", position: 3, title: "", sections: [sec("s21", "", "final", "- Left\n- Right\n\nAfter the list. [link](https://example.com)")] },
    { id: "cc", kind: "conclusion", position: 5, title: "", sections: [sec("sc", "Keep going", "final", "The end.")] }] };
let all = "";
for (const style of F.STYLES) for (const chapter_label of F.CHAPTER_LABELS) for (const flags of [{}, { drop_cap: true, recto_start: false, running_header: false, contents_sections: true, parts: { ...F.defaults().parts, about: true, also_by: true }, isbn: "9781234567897", header_title: "Head" }]) {
  const st = { ...F.defaults(), style, chapter_label, ...flags };
  for (const trim of F.TRIMS) all += T.mainTyp(F.modelOf(data, st), st, { year: 2026, trim, alsoBy: [{ title: "Other", subtitle: "Sub" }] });
}
for (const c of globalThis.kdpTypstCases) all += T.blocks(c.md) + "\n";
const fp = await sha(new TextEncoder().encode(all));
console.log(`fingerprint: ${fp} (${all.length} chars) ${fp === FINGERPRINT ? "= baseline" : `DIFFERS from baseline ${FINGERPRINT}`}`);

// 3. The parts fingerprint.
const PC = globalThis.kdpPartCases;
const partSets = [PC.all(), ...PC.parts.map((p) => [JSON.parse(JSON.stringify(p))])];
let allParts = "";
for (const book_parts of partSets) {
  const d = { ...data, book_parts };
  for (const style of F.STYLES) for (const chapter_label of F.CHAPTER_LABELS) for (const flags of [{}, { drop_cap: true, recto_start: false, running_header: false, contents_sections: true, isbn: "9781234567897", header_title: "Head" }]) {
    const st = { ...F.defaults(), style, chapter_label, ...flags };
    for (const trim of F.TRIMS) allParts += T.mainTyp(F.modelOf(d, st), st, { year: 2026, trim, alsoBy: [{ title: "Not read", subtitle: "Sub" }] });
  }
}
const fpParts = await sha(new TextEncoder().encode(allParts));
console.log(`parts fingerprint: ${fpParts} (${allParts.length} chars, ${partSets.length} part sets x 96 builds) ${fpParts === FINGERPRINT_PARTS ? "= saved value" : `DIFFERS from saved value ${FINGERPRINT_PARTS || "(none yet)"}`}`);
console.log(`changed files: ${bad}`);
Deno.exit(fp === FINGERPRINT && fpParts === FINGERPRINT_PARTS ? 0 : 1);
