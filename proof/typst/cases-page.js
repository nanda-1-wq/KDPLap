/* ═══════════════════════════════════════════════════
   NicheInk — E13.0 Typst proof: print every converter case (throwaway)
   /proof/typst/cases-page.js   (cases.html; driven by run.mjs)

   One PDF, one case per page: the cases in cases.js (kdpTypst.blocks), then
   300 fuzz strings as plain text (kdpTypst.escapeText). pdf.js reads each
   page back. A case passes when the printed text matches (spaces removed,
   curly quotes read as straight) and its bold, italic, plain and link
   checks hold. Result in window.__result.
═══════════════════════════════════════════════════ */

(function () {
  const E = () => globalThis.kdpTypstEngine;
  const T = () => globalThis.kdpTypst;
  const out = document.getElementById('out');
  const flat = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, '');

  async function run() {
    const cases = globalThis.kdpTypstCases;
    const fuzz = globalThis.kdpTypstFuzz(13, 300);
    const pages = [...cases.map((c) => T().blocks(c.md)), ...fuzz.map((s) => T().escapeText(s))];
    const src = [
      '#set page(width: 5in, height: auto, margin: 0.4in)',
      '#set text(font: "Source Serif 4", size: 11pt, hyphenate: false)',
      '#set par(justify: false)',
      pages.join('\n\n#pagebreak()\n\n'),
    ].join('\n');

    const cc = await E().loadEngine({});
    const res = await E().compileBook(cc, src, null);
    if (res.error) throw new Error(`compile failed: ${res.diagnostics.map((d) => d.message || d).join('; ')}`);
    const pdfjs = await E().loadPdfjs();
    const doc = await pdfjs.getDocument({ data: res.pdf.slice(), verbosity: 0, fontExtraProperties: true }).promise;

    const rows = [];
    for (let i = 0; i < pages.length; i++) {
      const page = await doc.getPage(i + 1);
      await page.getOperatorList();   // loads the fonts, so their real names can be read
      const items = (await page.getTextContent()).items.filter((t) => t.str.length);
      const runs = items.map((t) => ({ str: t.str, font: (page.commonObjs.get(t.fontName) || {}).name || t.fontName }));
      const text = runs.map((r) => r.str).join('');
      const c = i < cases.length ? cases[i] : { name: `fuzz ${i - cases.length + 1}`, text: fuzz[i - cases.length], fuzz: true };
      const why = [];
      if (c.text != null && flat(text) !== flat(c.text)) why.push('text');
      const has = (word, re) => runs.some((r) => r.str.includes(word) && re.test(r.font));
      if (c.bold && !has(c.bold, /Bold/)) why.push('bold');
      if (c.italic && !has(c.italic, /Italic/)) why.push('italic');
      if (c.plain && runs.some((r) => !/-Regular$/.test(r.font))) why.push('plain');
      if (c.link) {
        const links = (await page.getAnnotations()).filter((a) => a.subtype === 'Link').map((a) => a.url || a.unsafeUrl);
        if (!links.some((u) => String(u).replace(/\/$/, "") === c.link)) why.push("link");
      }
      rows.push({ name: c.name, fuzz: !!c.fuzz, pass: !why.length, why, printed: c.glyph || (c.fuzz && why.length) ? text : undefined, fonts: c.glyph ? [...new Set(runs.map((r) => r.font))] : undefined });
      page.cleanup();
    }
    const named = rows.filter((r) => !r.fuzz);
    const fz = rows.filter((r) => r.fuzz);
    globalThis.__result = {
      cases: named,
      casesPassed: named.filter((r) => r.pass).length,
      casesTotal: named.length,
      fuzzPassed: fz.filter((r) => r.pass).length,
      fuzzTotal: fz.length,
      fuzzFailed: fz.filter((r) => !r.pass).slice(0, 10).map((r) => ({ name: r.name, input: fuzz[Number(r.name.slice(5)) - 1], printed: r.printed, why: r.why })),
      diagnostics: res.diagnostics.map((d) => `${d.severity}: ${d.message}`),
      compileMs: Math.round(res.ms.total),
      pages: doc.numPages,
    };
    out.textContent = JSON.stringify(globalThis.__result, null, 2);
  }

  run().catch((e) => {
    globalThis.__result = { error: String(e && e.stack || e) };
    out.textContent = globalThis.__result.error;
  });
})();
