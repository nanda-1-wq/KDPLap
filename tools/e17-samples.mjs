// NicheInk · E17 Part 2: sample files with every book part on (TEST text only).
//
//   deno run --allow-read --allow-write tools/e17-samples.mjs      (from the repo root)
//
// Builds the EPUB, DOCX and Markdown of the EPUB fixture book (tests/fixtures/epub-books.js,
// made-up text) with every part of tests/fixtures/part-cases.js on (hostile text included)
// into docs/reviews/e17-part2/. The Print PDF sample comes from tests/browser/format/t-parts.mjs.
// The DOCX needs the cached docx 9.5.1 (tests/browser/.cache/docx-9.5.1.js, as the tests).
// Never the owner's book text. Reads and writes local files only.

const REPO = new URL("..", import.meta.url);
for (const f of ["js/markdown-lite.js", "js/word-budget.js", "js/sentences.js", "js/text-checks.js", "js/export-rules.js",
  "js/export-build.js", "js/format-rules.js", "js/format/md2typst.js", "js/cover/zip.js", "js/format/epub.js",
  "tests/fixtures/epub-books.js", "tests/fixtures/part-cases.js"]) await import(new URL(f, REPO).href);
(0, eval)(`${await Deno.readTextFile(new URL("tests/browser/.cache/docx-9.5.1.js", REPO))}\nglobalThis.docx = docx;`);

const { kdpExportRules: R, kdpExportBuild: X, kdpFormatRules: F, kdpEpub: E, kdpEpubBooks: B, kdpPartCases: PC, docx } = globalThis;
const OUT = new URL("docs/reviews/e17-part2/", REPO);
await Deno.mkdir(OUT, { recursive: true });

const data = { ...B.data(), book_parts: PC.all() };
const st = { ...F.defaults(), parts: B.ALL_PARTS, trim: "6x9" };
const epub = E.make(F.modelOf(data, st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW });
const all = { title: true, copyright: true, contents: true, intro: true, conclusion: true, about: true };
const md = X.toMarkdown(R.model(data, { include: "final", format: "md", parts: all }), { year: 2026 });
const docxBytes = new Uint8Array(await docx.Packer.toArrayBuffer(X.toDocx(R.model(data, { include: "final", format: "docx", parts: all }), docx, { year: 2026 })));

const files = [["e17-all-parts.epub", epub], ["e17-all-parts.docx", docxBytes], ["e17-all-parts.md", new TextEncoder().encode(md)]];
for (const [name, bytes] of files) {
  await Deno.writeFile(new URL(name, OUT), bytes);
  console.log(`docs/reviews/e17-part2/${name}: ${bytes.length} bytes`);
}
