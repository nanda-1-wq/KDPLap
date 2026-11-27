// node tests/browser/format/t-parts.mjs   (from the repo root; real CDN, Chrome)
// E17 Part 2: the print engine with book parts, for real, in headless Chrome.
//   1. the 16 group A golden builds (golden-group-a.json, no part on) give the same
//      bytes with the E17 book.typ and md2typst.js
//   2. the placeholder book (8 x 3) with every part on (tests/fixtures/part-cases.js,
//      hostile text included), 6 x 9, each style: no Typst warning, the PDF checks,
//      the 17 layout checks, and the front and back pages read back with pdf.js
//      (Q-3: foreword and preface have no page number and are listed without one;
//      Q-5: the contents lists foreword, preface, acknowledgments, about only)
//   3. saves docs/reviews/e17-part2/e17-print-6x9-all-parts.pdf (Classic)
// TEST text only. Results: tests/browser/format/out/parts.json. Exit code 1 when a check fails.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { chrome, ensureServer, save, log, REPO } from './lib.mjs';

createRequire(import.meta.url)('../../fixtures/part-cases.js');
const PARTS = globalThis.kdpPartCases.all();
const GOLDEN = JSON.parse(fs.readFileSync(new URL('./golden-group-a.json', import.meta.url), 'utf8')).builds;
const STYLES = ['classic', 'modern', 'clean', 'warm'];
const fails = [];
const expect = (ok, what) => { if (!ok) fails.push(what); return ok; };
const R = { date: new Date().toISOString() };

await ensureServer();
const w = await chrome();
await w.open();
try {
  log('1. golden group A builds, no part on');
  R.golden = [];
  for (const [key, g] of Object.entries(GOLDEN)) {
    const [style, trim] = key.split(' ');
    const r = await w.page.evaluate(async ({ style, trim }) => {
      const H = kdpFormatHarness;
      const e = H.engine();
      await e.load(style);
      const b = await H.build(e, { book: { chapters: 8, sections: 3 }, style, trim });
      return { sha: b.sha, pages: b.pages };
    }, { style, trim });
    const same = r.sha === g.sha && r.pages === g.pages;
    R.golden.push({ key, same });
    expect(same, `${key}: the PDF bytes changed with no part on`);
  }
  log('golden', R.golden.filter((x) => x.same).length, 'of', R.golden.length);

  log('2. every part on, 6 x 9');
  R.parts = [];
  for (const style of STYLES) {
    const r = await w.page.evaluate(async ({ style, PARTS }) => {
      const H = kdpFormatHarness;
      const e = H.engine();
      await e.load(style);
      const data = kdpPlaceholderBook.make({ chapters: 8, sections: 3 });
      data.book.trim = '6x9';
      data.book_parts = PARTS;
      const st = kdpFormatRules.normalize({ ...kdpFormatRules.defaults(), style });
      const model = kdpFormatRules.modelOf(data, st);
      const built = await e.build({ bookId: data.book.id, model, settings: st, extras: { year: 2026, trim: '6x9' } });
      const info = await kdpPdfCheck.read(built.pdf, { inflate: kdpPdfCheck.inflate });
      const checks = kdpPdfCheck.checks(info, { trim: '6x9', pages: built.pages });
      const titles = [...model.chapters.map((c) => kdpFormatTypst.chapterTitle(c)), 'Acknowledgments', 'About the author', 'A short request', `Also by ${data.book.pen_name}`];
      const pdfjs = await kdpTypstRun.loadPdfjs();
      const l = await kdpLayoutChecks.run(pdfjs, built.pdf, { meta: built.meta, trim: '6x9', titles, bookTitle: data.book.title, settings: st });
      // The text of every page, to read the front and back matter back.
      const doc = await pdfjs.getDocument({ data: built.pdf.slice() }).promise;
      const pages = [];
      let reviewLines = null;
      for (let p = 1; p <= doc.numPages; p++) {
        const c = await (await doc.getPage(p)).getTextContent();
        pages.push(c.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim());
        // The review page: the baseline (y) of each line and its first word, top to bottom.
        if (pages[p - 1].startsWith('A short request')) {
          const ys = new Map();
          for (const i of c.items) if (i.str.trim()) { const y = Math.round(i.transform[5] * 10) / 10; if (!ys.has(y)) ys.set(y, i.str.trim()); }
          reviewLines = [...ys.entries()].sort((a, b) => b[0] - a[0]).map(([y, first]) => ({ y, first }));
        }
      }
      return {
        pages: built.pages, diagnostics: built.diagnostics, checks: checks.map((c) => ({ key: c.key, pass: c.pass, detail: c.detail })),
        layoutFailed: l.checks.filter((c) => !c.pass).map((c) => `${c.name} (pages ${c.failPages.join(', ')})`), layoutPassed: l.checks.filter((c) => c.pass).length,
        text: pages, reviewLines, b64: style === 'classic' ? H.b64(built.pdf) : null, pen: data.book.pen_name
      };
    }, { style, PARTS });
    const tag = `${style} 6x9 all parts`;
    expect(r.diagnostics.length === 0, `${tag}: Typst warnings ${r.diagnostics.join('; ')}`);
    expect(r.checks.every((c) => c.pass), `${tag}: PDF checks ${JSON.stringify(r.checks.filter((c) => !c.pass))}`);
    expect(r.layoutPassed === 17, `${tag}: layout ${r.layoutFailed.join('; ')}`);
    const t = r.text;
    const find = (re, from = 0) => t.findIndex((s, i) => i >= from && re.test(s));
    const ded = find(/^For my mother\./), epi = find(/Small steps add up\./), toc = find(/^Contents/);
    const fwd = find(/^Foreword Foreword text\./), pre = find(/^Preface Preface text\./), intro = find(/^Introduction/, toc + 1);
    const ack = find(/^Acknowledgments Acknowledgments text\./), abo = find(/^About the author About text\./);
    const rev = find(/^A short request Thank you for reading/), also = find(new RegExp(`^Also by ${r.pen}`));
    const order = [ded, epi, toc, fwd, pre, intro, ack, abo, rev, also];
    expect(order.every((p, i) => p >= 0 && (i === 0 || p > order[i - 1])), `${tag}: page order ${order}`);
    // Physical page numbers are 0-based here; right-hand pages are even indexes.
    for (const [name, p] of [['dedication', ded], ['epigraph', epi], ['contents', toc], ['foreword', fwd], ['preface', pre]]) {
      expect(p % 2 === 0, `${tag}: ${name} on a right-hand page (index ${p})`);
      // The contents page ends with the back parts' page numbers; the layout checks cover its footer.
      if (name !== 'contents') expect(!/\s\d+$/.test(t[p]), `${tag}: ${name} has no page number ("${t[p].slice(-30)}")`);
    }
    const contents = t[toc];
    expect(/Foreword Preface Introduction/.test(contents), `${tag}: contents starts Foreword, Preface (no page number): ${contents.slice(0, 120)}`);
    expect(/Acknowledgments [. ]*\d+ About the author [. ]*\d+$/.test(contents), `${tag}: contents ends with Acknowledgments, About the author: ${contents.slice(-120)}`);
    expect(!/Dedication|Epigraph|A short request|Also by/.test(contents), `${tag}: Q-5 contents`);
    expect(/^Introduction/.test(t[intro]) && !/^\s*$/.test(t[intro]), `${tag}: body starts`);
    expect(t[rev].replace(/(\w)- (\w)/g, '$1$2').includes('If this book helped you, please think about leaving an honest review on Amazon.'), `${tag}: review words`);
    // Design 81: separate paragraphs. The gap before "If this book" and before the pen name is
    // larger than the line pitch inside the long paragraph (owner fix at STOP 2).
    const L = r.reviewLines || [];
    const iIf = L.findIndex((x) => x.first.startsWith('If')), iPen = L.length - 1;
    const pitch = iIf >= 0 && iIf + 1 < iPen ? L[iIf].y - L[iIf + 1].y : 0;
    const gapIf = iIf > 0 ? L[iIf - 1].y - L[iIf].y : 0, gapPen = iPen > 0 ? L[iPen - 1].y - L[iPen].y : 0;
    expect(pitch > 0 && gapIf > pitch * 1.3 && gapPen > pitch * 1.3, `${tag}: review paragraphs apart (pitch ${pitch}, gaps ${gapIf}, ${gapPen})`);
    expect(L[iPen] && L[iPen].first === r.pen, `${tag}: the pen name is the last line`);
    expect(t.join(' ').includes('# $ @ * _ & < > '), `${tag}: hostile text printed as typed`);
    expect(!t.join(' ').includes('Subtitle #'), `${tag}: Q-10 titles only`);
    R.parts.push({ style, review: t[rev], reviewGaps: { pitch, gapIf, gapPen }, pages: r.pages, order, layoutPassed: r.layoutPassed, front: t.slice(0, pre + 1).map((s) => s.slice(0, 90)) });
    log(tag, r.pages, 'pages', `${r.layoutPassed}/17`, 'order', order.join(','));
    if (r.b64) {
      const out = path.join(REPO, 'docs/reviews/e17-part2/e17-print-6x9-all-parts.pdf');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(r.b64, 'base64'));
      R.sample = { path: 'docs/reviews/e17-part2/e17-print-6x9-all-parts.pdf', bytes: fs.statSync(out).size };
    }
  }
} finally {
  await w.close();
}
R.fails = fails;
save('parts.json', R);
log(fails.length ? `FAILED ${fails.length}:\n${fails.join('\n')}` : 'all passed');
process.exit(fails.length ? 1 : 0);
