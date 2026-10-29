// deno test --allow-read tests/brand-name.test.js   (from the repo root)
// The rename to NicheInk (docs/reviews/2026-10-29-rename-nicheink-plan.md,
// design 40): no "KDP Lab" where a user sees it, every page title ends in
// "NicheInk", the Amazon disclaimer stays, the wordmark markup and its no-wrap
// rule, "PUZZLE TOOLS", and relative links only, so the site works at the
// domain root and still works under /KDPLap/ if the custom domain is rolled back.
import { assert, assertEquals } from "jsr:@std/assert@1";

const ROOT = new URL("../", import.meta.url);
const read = (p) => Deno.readTextFileSync(new URL(p, ROOT));
const list = (dir, ext) => [...Deno.readDirSync(new URL(dir, ROOT))]
  .filter((e) => e.isFile && e.name.endsWith(ext)).map((e) => dir + e.name).sort();
const exists = (p) => { try { Deno.statSync(new URL(p, ROOT)); return true; } catch { return false; } };

// Served pages. app/editor.html (the old low-content editor, linked from nowhere) stays as it is.
const AUTH = ["login.html", "signup.html", "forgot-password.html", "reset-password.html"];
const PAGES = ["index.html", ...AUTH, "landing/index.html",
  ...list("app/", ".html").filter((p) => p !== "app/editor.html"), ...list("app/generators/", ".html")];
const SCRIPTS = list("js/", ".js");
const STYLES = [...list("css/", ".css"), "landing/landing.css", "design/design-tokens.css"];
const SERVED = [...PAGES, ...SCRIPTS, ...STYLES];

// Comments are not UI: the "KDP Lab — …" file headers stay (plan 14b, Q8).
const code = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const WORDMARK = '<span class="niche">Niche</span><span class="ink">Ink</span>';
const LEGAL_AUTH = "KDP is a trademark of Amazon. NicheInk is independent and not affiliated with Amazon.";
const LEGAL_LANDING = "Kindle Direct Publishing (KDP) is a trademark of Amazon. NicheInk is independent and not affiliated with Amazon.";

Deno.test("the scan covers every served page, script and style", () => {
  assertEquals(PAGES.length, 15);
  assert(SCRIPTS.length >= 40 && SCRIPTS.includes("js/shell.js"), String(SCRIPTS.length));
  assertEquals(STYLES.length, 4);
});

Deno.test("no \"KDP Lab\" where a user sees it", () => {
  for (const p of SERVED) {
    const s = code(read(p));
    assert(!/KDP\s*Lab\b|KDP\s*LAB\b|KDPLAB/.test(s), `${p}: ${s.match(/.{0,40}KDP\s*Lab.{0,40}|.{0,40}KDP\s*LAB.{0,40}/i)}`);
    assert(!/>KDP<\/span>/.test(s), `${p}: old wordmark`);
  }
});

Deno.test("every page title names NicheInk (\"… · NicheInk\"; the landing starts with it), in the HTML and when the page sets it", () => {
  for (const p of PAGES) {
    const t = read(p).match(/<title>([^<]*)<\/title>/);
    assert(t && (t[1] === "NicheInk" || t[1].endsWith(" · NicheInk") || t[1].startsWith("NicheInk · ")), `${p}: ${t && t[1]}`);
  }
  let seen = 0;
  for (const p of SCRIPTS) {
    for (const m of code(read(p)).matchAll(/document\.title\s*=\s*([`'"])(.*?)\1/g)) {
      seen++;
      assert(m[2].endsWith(" · NicheInk"), `${p}: ${m[2]}`);
    }
  }
  assertEquals(seen, 5);
  assertEquals(read("landing/index.html").match(/<title>([^<]*)<\/title>/)[1], "NicheInk · An AI studio for nonfiction books");
  assertEquals(read("app/generators/sudoku.html").match(/<title>([^<]*)<\/title>/)[1], "Sudoku Generator · NicheInk");
});

Deno.test("the Amazon disclaimer stays, with the new name", () => {
  for (const p of AUTH) assert(read(p).includes(`<p class="auth-legal">${LEGAL_AUTH}</p>`), p);
  assert(read("landing/index.html").includes(`<span>${LEGAL_LANDING}</span>`));
});

Deno.test("the wordmark: Niche + Ink spans, colors from the tokens, never wraps", () => {
  for (const p of [...AUTH, "js/shell.js"]) assert(read(p).includes(WORDMARK), p);
  assert(read("landing/index.html").includes('<span class="wordmark-niche">Niche</span><span class="wordmark-ink">Ink</span>'));
  const app = read("css/app.css"), auth = read("css/auth.css"), lp = read("landing/landing.css");
  assert(/\.sidebar-logo-text \{[^}]*white-space: nowrap;/.test(app));
  assert(app.includes(".sidebar-logo-text .niche { color: var(--brand-navy); }") && app.includes(".sidebar-logo-text .ink { color: var(--brand-blue); }"));
  assert(/\.auth-logo-text \{[^}]*white-space: nowrap;/.test(auth));
  assert(auth.includes(".auth-logo-text .niche { color: var(--lp-heading); }") && auth.includes(".auth-logo-text .ink { color: var(--lp-accent); }"));
  assert(/\.wordmark \{[^}]*white-space: nowrap;/.test(lp));
  assert(lp.includes(".wordmark-niche { color: var(--lp-heading); }") && lp.includes(".wordmark-ink { color: var(--lp-accent); }"));
  for (const [p, s] of [["css/app.css", app], ["css/auth.css", auth], ["landing/landing.css", lp]]) {
    assert(!/\.kdp\b|\.lab\b|wordmark-kdp|wordmark-lab/.test(s), p);
  }
});

Deno.test("the sidebar says PUZZLE TOOLS; the landing chip and lead are the design 40 text", () => {
  const shell = read("js/shell.js"), lp = read("landing/index.html");
  assert(shell.includes(">PUZZLE TOOLS<") && !shell.includes("KDP TOOLS"));
  assert(lp.includes('<span class="status-dot"></span>IN EARLY TESTING</span>') && !lp.includes("BEING REBUILT"));
  assert(lp.includes('<p class="lead">NicheInk helps you validate a topic, plan the book, and write it chapter by chapter, in your own voice. It launches after testing on real books.</p>'));
  assert(lp.includes('content="NicheInk is an AI studio that helps you validate a topic, plan the book, and write nonfiction chapter by chapter, in your own voice."'));
  assert(lp.includes("<span>© 2026 NicheInk · Built by Adnan</span>"));
  assert(lp.includes('href="https://x.com/3Desso"'));
});

Deno.test("relative links only: no /KDPLap/, no github.io, no <base>, no root-absolute paths", () => {
  for (const p of SERVED) {
    const s = read(p);
    assert(!s.includes("/KDPLap/") && !s.includes("github.io"), `${p}: an address of the old site`);
    assert(!/<base\b/i.test(s), `${p}: <base>`);
    assert(!/\b(?:href|src)\s*=\s*["']\/(?!\/)/.test(s), `${p}: ${s.match(/.{0,30}\b(?:href|src)\s*=\s*["']\/(?!\/).{0,30}/)}`);
    assert(!/url\(\s*["']?\/(?!\/)/.test(s), `${p}: root-absolute url()`);
    assert(!/["'`]\/(?:app|js|css|landing|design|login|signup|index|reset|forgot)\b/.test(code(s)), `${p}: ${code(s).match(/.{0,30}["'`]\/(?:app|js|css|landing|design|login|signup|index|reset|forgot)\b.{0,30}/)}`);
  }
});

Deno.test("robots.txt asks crawlers to skip project files, not the pages or what they load", () => {
  const lines = read("robots.txt").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  assertEquals(lines[0], "User-agent: *");
  const off = lines.filter((l) => l.startsWith("Disallow:")).map((l) => l.slice(9).trim());
  for (const p of ["/app/", "/docs/", "/tests/", "/supabase/", "/design/screens/", "/landing/archive/"]) assert(off.includes(p), p);
  for (const p of off) {
    for (const page of ["/", "/index.html", "/login.html", "/landing/index.html", "/landing/landing.css", "/design/design-tokens.css", "/design/logo/favicon.svg", "/js/supabase.js", "/css/auth.css"]) {
      assert(!page.startsWith(p), `"Disallow: ${p}" blocks ${page}`);
    }
  }
});

Deno.test("CNAME, once GitHub writes it, holds only nicheink.com", () => {
  if (exists("CNAME")) assertEquals(read("CNAME").trim(), "nicheink.com");
});
