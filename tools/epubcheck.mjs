#!/usr/bin/env node
// NicheInk · EPUBCheck runner (E13.3 Part 1, plan section 5). Tests and local checks
// only: never on the server, never in the browser.
//
//   node tools/epubcheck.mjs <file.epub> [more.epub ...]
//       Runs EPUBCheck v5.4.0 on each file and prints every message word for word.
//   EPUB_OUT=<folder> node tools/epubcheck.mjs --golden
//       Builds the golden EPUB set (tests/fixtures/epub-books.js) into EPUB_OUT
//       (default tests/.cache/epubcheck/golden/), runs our 3 checks and EPUBCheck on
//       every file, and prints every message word for word.
//
// The rule: 0 fatal, 0 errors, 0 warnings. Exit code 1 otherwise. Messages are never
// silenced or filtered: no suppression flags, no message filter, no lowered severity
// (owner, Nov 23). EPUBCheck runs with its defaults plus --json (the report file).
//
// EPUBCheck is downloaded once from its GitHub release into tests/.cache/epubcheck/
// (gitignored) and checked against the pinned sha256 below before every run.
// Needs Java 21 and Node 22 or later. Reads no .env file, calls no NicheInk service.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VERSION = "5.4.0";
const URL_ZIP = `https://github.com/w3c/epubcheck/releases/download/v${VERSION}/epubcheck-${VERSION}.zip`;
// The release asset digest GitHub publishes for epubcheck-5.4.0.zip (33,093,170 bytes).
const ZIP_SHA256 = "33350c61038e71dfb3d45a76aed04bf5481e6d5500cb780f6e98db8bbd15a28c";
// The jar inside that zip, recorded at STOP 1 (Nov 24, 2026).
const JAR_SHA256 = "2146665a124998dc6c908010ffe0d09dc4f4c8014f2c8fd6a1aa11f64c40ac93";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(REPO, "tests", ".cache", "epubcheck");
const ZIP = join(CACHE, `epubcheck-${VERSION}.zip`);
const JAR = join(CACHE, `epubcheck-${VERSION}`, "epubcheck.jar");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The jar: download and unzip once, then check both hashes on every run. */
async function jar() {
  mkdirSync(CACHE, { recursive: true });
  if (!existsSync(ZIP)) {
    console.log(`Downloading EPUBCheck ${VERSION} from ${URL_ZIP}`);
    const res = await fetch(URL_ZIP);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (sha256(bytes) !== ZIP_SHA256) throw new Error(`the downloaded zip has sha256 ${sha256(bytes)}, pinned ${ZIP_SHA256}. Nothing was saved.`);
    writeFileSync(ZIP, bytes);
  }
  const zipHash = sha256(readFileSync(ZIP));
  if (zipHash !== ZIP_SHA256) throw new Error(`${ZIP} has sha256 ${zipHash}, pinned ${ZIP_SHA256}. Delete it and run again.`);
  if (!existsSync(JAR)) {
    rmSync(join(CACHE, `epubcheck-${VERSION}`), { recursive: true, force: true });
    execFileSync("unzip", ["-q", ZIP, "-d", CACHE], { stdio: "inherit" });
  }
  const jarHash = sha256(readFileSync(JAR));
  if (JAR_SHA256 && jarHash !== JAR_SHA256) throw new Error(`${JAR} has sha256 ${jarHash}, pinned ${JAR_SHA256}.`);
  return { path: JAR, zipHash, jarHash };
}

/** Runs EPUBCheck on one file. Returns { counts, messages, version, exit }. */
function epubcheck(jarPath, file) {
  const out = join(CACHE, `report-${process.pid}.json`);
  rmSync(out, { force: true });
  const r = spawnSync("java", ["-jar", jarPath, file, "--json", out], { encoding: "utf8" });
  if (!existsSync(out)) throw new Error(`EPUBCheck wrote no report for ${file}:\n${r.stdout}\n${r.stderr}`);
  const report = JSON.parse(readFileSync(out, "utf8"));
  rmSync(out, { force: true });
  const counts = { FATAL: 0, ERROR: 0, WARNING: 0, INFO: 0, USAGE: 0 };
  for (const m of report.messages || []) counts[m.severity] = (counts[m.severity] || 0) + 1;
  return { counts, messages: report.messages || [], version: report.checker && report.checker.checkerVersion, exit: r.status };
}

/** Every message, word for word, with every location. */
function printMessages(messages) {
  for (const m of messages) {
    console.log(`  ${m.severity}(${m.ID}): ${m.message}`);
    for (const l of m.locations || []) console.log(`      at ${l.path}${l.line > 0 ? `(${l.line},${l.column})` : ""}${l.context ? `: ${l.context}` : ""}`);
    if (m.additionalLocations) console.log(`      and ${m.additionalLocations} more location(s)`);
    if (m.suggestion) console.log(`      suggestion: ${m.suggestion}`);
  }
}

/** Builds the golden set with the app's own code (the same files the browser loads). */
async function golden(outDir) {
  for (const f of ["js/markdown-lite.js", "js/word-budget.js", "js/sentences.js", "js/text-checks.js", "js/export-rules.js",
    "js/export-build.js", "js/format-rules.js", "js/format/md2typst.js", "js/cover/zip.js", "js/format/epub.js",
    "js/format/epub-check.js", "tests/fixtures/epub-books.js"]) await import(pathToFileURL(join(REPO, f)).href);
  const { wellFormed } = await import(pathToFileURL(join(REPO, "tests/lib/xml-strict.js")).href);
  const { kdpEpub: E, kdpEpubCheck: C, kdpFormatRules: F, kdpEpubBooks: B } = globalThis;
  mkdirSync(outDir, { recursive: true });
  const out = [];
  for (const g of B.golden) {
    const st = { ...F.defaults(), ...g.settings };
    const d = B.data(g.data || {});
    const bytes = E.make(F.modelOf(d, st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY });
    const file = join(outDir, `${g.name}.epub`);
    writeFileSync(file, bytes);
    const own = C.checks(C.read(bytes), { expect: { title: d.book.title, subtitle: d.book.subtitle, author: d.book.pen_name, isbn: st.isbn || null }, wellFormed });
    out.push({ file, own });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.log("usage: node tools/epubcheck.mjs <file.epub> ... | --golden"); process.exit(2); }
  const j = await jar();
  console.log(`EPUBCheck ${VERSION}: zip sha256 ${j.zipHash} (pinned), jar sha256 ${j.jarHash}${JAR_SHA256 ? " (pinned)" : " (not pinned yet)"}`);
  console.log(`Java: ${spawnSync("java", ["-version"], { encoding: "utf8" }).stderr.split("\n")[0]}`);
  let items;
  if (args[0] === "--golden") {
    const dir = resolve(process.env.EPUB_OUT || join(CACHE, "golden"));
    console.log(`Golden set into ${dir}`);
    items = await golden(dir);
  } else {
    items = args.map((a) => ({ file: resolve(a), own: null }));
  }
  const total = { FATAL: 0, ERROR: 0, WARNING: 0, INFO: 0, USAGE: 0 };
  let ownFailed = 0;
  for (const it of items) {
    const bytes = readFileSync(it.file);
    const r = epubcheck(j.path, it.file);
    for (const k of Object.keys(total)) total[k] += r.counts[k] || 0;
    console.log(`\n${basename(it.file)}  ${statSync(it.file).size} bytes  sha256 ${sha256(bytes)}`);
    console.log(`  EPUBCheck ${r.version}: ${r.counts.FATAL} fatal, ${r.counts.ERROR} errors, ${r.counts.WARNING} warnings, ${r.counts.INFO} infos, ${r.counts.USAGE} usages (exit ${r.exit})`);
    printMessages(r.messages);
    if (it.own) {
      const bad = it.own.filter((c) => !c.pass);
      ownFailed += bad.length ? 1 : 0;
      console.log(`  Our checks: ${it.own.map((c) => `${c.name} ${c.pass ? "pass" : `FAIL (${c.detail})`}`).join(", ")}`);
    }
  }
  const clean = total.FATAL === 0 && total.ERROR === 0 && total.WARNING === 0 && ownFailed === 0;
  console.log(`\nTotal over ${items.length} file(s): ${total.FATAL} fatal, ${total.ERROR} errors, ${total.WARNING} warnings, ${total.INFO} infos, ${total.USAGE} usages${items[0].own ? `; our checks failed on ${ownFailed} file(s)` : ""}`);
  console.log(clean ? "RESULT: 0 fatal, 0 errors, 0 warnings" : "RESULT: NOT CLEAN (see every message above)");
  process.exit(clean ? 0 : 1);
}

main().catch((e) => { console.error(`epubcheck.mjs: ${e.message}`); process.exit(2); });
