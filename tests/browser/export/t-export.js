// E11 Export dialog (design 24b): states 1 to 9 and the book header entry
// (11). The real download is opened (the .docx with tests/lib/unzip.js). The
// include rule through the real dialog: for the shared fixture cases
// (tests/fixtures/export-include.json) the recorded versions equal the
// cases' `expected`, the same lists supabase/tests/sql/t_export_include.sql
// records and finds not changed in export_badges (owner note, STOP 2).
// Screenshots at 1440 and 900.
// Run: tests/browser/run.sh export t-export.js
const test = async (page) => {
  const out = globalThis.__log = [];
  const ok = (name, cond, got) => E11.check(out, name, !!cond, got);
  const S = () => globalThis.__store;
  const T = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
  const D = () => T('.exp-dialog');
  const go = () => page.locator('.exp-dialog [data-exp-go]');
  async function fresh(modes = {}, width = 1440) {
    globalThis.__modes = modes;
    await setupE11(page);
    await page.setViewportSize({ width, height: 900 });
  }
  async function fromCard(bookId) {
    await page.goto(`${E11.base}/app/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-book-menu="${bookId}"]`).waitFor({ timeout: 10000 });
    await page.locator(`[data-book-menu="${bookId}"]`).click();
    await page.locator('#bookMenu [data-action="export"]').click();
  }
  const ready = () => page.locator('.exp-dialog [data-exp-go], .exp-dialog .exp-empty, .exp-dialog [data-exp-retry]').first().waitFor({ timeout: 10000 });
  async function exportNow() {
    const dl = page.waitForEvent('download', { timeout: 15000 });
    await go().click();
    const d = await dl;
    await page.locator('.exp-dialog [data-exp-done]').waitFor({ timeout: 10000 });
    return d.suggestedFilename();
  }
  const lastBlob = (kind) => page.evaluate(async (kind) => {
    const b = window.__blobs[window.__blobs.length - 1];
    if (kind === 'text') return b.text();
    const { unzip } = await import('/tests/lib/unzip.js');
    const files = await unzip(await b.arrayBuffer());
    return files.get('word/document.xml');
  }, kind);
  const blobs = () => page.evaluate(() => new Set(window.__blobs).size);
  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 10000 }).catch(() => out.push('shot timeout ' + name));
  async function tallShot(name) {
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: 2200 });
    await page.waitForTimeout(150);
    await page.locator('.exp-dialog').screenshot({ path: `${SHOTS}/${name}.png`, timeout: 10000 }).catch(() => out.push('shot timeout ' + name));
    await page.setViewportSize(vp);
  }

  /* ── 11 + 1. From the book header: ready ── */
  await fresh();
  await page.goto(`${E11.base}/app/book.html?id=${E11.B1}&step=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-book-head]:not([hidden]) [data-export]').waitFor({ timeout: 10000 });
  const order = await page.evaluate(() => [...document.querySelector('.book-head-next').children].filter((e) => !e.hidden).map((e) => e.matches('[data-export]') ? 'export' : e.matches('[data-next]') ? 'next' : e.className));
  ok('11 header: Export (secondary) left of Next', order[0] === 'export' && order[order.length - 1] === 'next' && (await page.locator('[data-export]').getAttribute('class')).includes('btn-secondary'), order);
  await page.locator('[data-export]').click();
  await ready();
  ok('1 opens on the book: title, pen name', (await T('#expTitle')) === 'Export book' && (await T('[data-exp-sub]')) === 'Chair Yoga for Seniors Over 60 · Nora Hale');
  ok('1 focus on the chosen format', await page.evaluate(() => document.activeElement.matches('input[value="docx"]')));
  const d1 = await D();
  ok('1 format: Word checked, Markdown, v2 formats off', await page.locator('input[value="docx"]').isChecked() && d1.includes('Markdown (.md)') && d1.includes('Print PDF, EPUB, Google Drive Coming in v2'));
  ok('1 include: all 10, "10 Final."', (await T('#expInclude option:checked')) === 'All sections with text (10)' && (await T('#expIncludeHelp')) === '10 Final.');
  ok('1 parts: Intro and Conclusion shown, About off, Chapters always', d1.includes('Introduction 1 section') && d1.includes('Conclusion 1 section') && d1.includes("About the author Nora Hale's bio from Pen Names Off")
    && await page.locator('.exp-tick.is-locked input').isDisabled() && !(await page.locator('[data-exp-part="about"]').isChecked()));
  ok('1 copyright row: this year and the pen name', d1.includes(`"Copyright © ${new Date().getFullYear()} Nora Hale. All rights reserved." and a short disclaimer. Edit it in Word.`));
  ok('1 layout: page size from the Brief, page numbers from the Introduction, margins, text', d1.includes('Page size 6 × 9 in, from the Brief Change in Brief')
    && d1.includes('Centered in the footer, from 1 on the Introduction. The title, copyright and contents pages have none.') && d1.includes('Margins 0.75 in on every side.') && d1.includes('Georgia 11 pt'));
  ok('1 page strip: front pages with no number, then 1 on the Intro', (await page.locator('.exp-sheet.is-front').count()) === 3 && (await T('.exp-pg:nth-child(4)')) === '1 Intro', await T('.exp-pages'));
  ok('1 ready line', d1.includes('Ready. All 10 sections are Final. No open Verify marks.'));
  ok('1 AI note: by sections, advice only', d1.includes("For KDP's AI question Advice only") && d1.includes('AI first draft: 7 sections') && d1.includes('AI edits only: 2') && d1.includes('Your own text: 1')
    && (await page.locator('.exp-split').getAttribute('aria-label')).startsWith('AI first draft'));
  ok('1 Export .docx on', (await go().innerText()).trim() === 'Export .docx' && await go().isEnabled());
  await shot('export-ready-1440');
  await tallShot('export-ready-full');
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(200);
  await shot('export-ready-900');
  ok('1 no sideways scroll at 900', await page.evaluate(() => document.documentElement.scrollWidth <= 900));
  const small = await page.evaluate(() => [...document.querySelectorAll('.exp-dialog button, .exp-dialog a, .exp-dialog select, .exp-dialog .exp-tick, .exp-dialog .exp-ack, .exp-dialog .exp-choice')]
    .filter((e) => e.offsetParent && e.getBoundingClientRect().height < 43.5).map((e) => e.outerHTML.slice(0, 70)));
  ok('1 every control in the dialog is 44 px', small.length === 0, small);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('11 Esc closes; focus back on Export', !(await page.locator('.exp-dialog[open]').count()) && await page.evaluate(() => document.activeElement.matches('[data-export]')));

  /* ── 9. Export the .docx from the header ── */
  await page.locator('[data-export]').click();
  await ready();
  const name = await exportNow();
  ok('9 download: chair-yoga-for-seniors-over-60.docx', name === 'chair-yoga-for-seniors-over-60.docx', name);
  const xml = await lastBlob('docx');
  ok('9 the file: the book, numbers from 1 in the body, no marks', xml.includes('Chair Yoga for Seniors Over 60') && /<w:pgNumType w:start="1"\/>/.test(xml) && !xml.includes('Verify') && /w:w="8640" w:h="12960"/.test(xml));
  const row = S().exports[S().exports.length - 1];
  ok('9 recorded: docx, all, the default parts, every section in order', row.format === 'docx' && row.include === 'all' && JSON.stringify(row.parts) === '{"title":true,"copyright":true,"contents":true,"intro":true,"conclusion":true,"about":false}'
    && JSON.stringify(row.versions) === JSON.stringify(['v-s01', 'v-s11', 'v-s12', 'v-s21', 'v-s22', 'v-s31', 'v-s32', 'v-s41', 'v-s42', 'v-s91']), row);
  const done = await D();
  ok('9 success: Book exported, the file row, the badge note', (await T('#expTitle')) === 'Book exported' && done.includes('Done. The file is in your downloads.')
    && done.includes('chair-yoga-for-seniors-over-60.docx') && done.includes('6 × 9 in · 10 sections ·') && done.includes('The Books page now shows "DOCX exported'));
  ok('9 focus on Done', await page.evaluate(() => document.activeElement.matches('[data-exp-done]')));
  await shot('export-9-done-1440');
  await page.locator('[data-exp-done]').click();

  /* ── The include rule through the real dialog (shared fixture) ── */
  await fresh();
  await page.goto(`${E11.base}/app/dashboard.html`, { waitUntil: 'domcontentloaded' });
  const FX = await page.evaluate(() => fetch('/tests/fixtures/export-include.json').then((r) => r.json()));
  const fxData = (book) => {
    const byPos = (a, b) => a.position - b.position;
    const now = new Date().toISOString();
    return { book: { id: E11.B1, title: 'Fixture Book', subtitle: null, pen_name: 'Nora Hale', bio: 'Bio.', trim: '6x9' }, known: { brief: {}, research: { sources: [], competitors: [], insights: null } }, now,
      chapters: [...FX.books[book]].sort(byPos).map((c) => ({ id: c.key, kind: c.kind, position: c.position, title: c.key, objective: null, needs_review: false,
        sections: [...c.sections].sort(byPos).map((s) => ({ id: s.key, position: s.position, title: s.key, status: s.status, needs_review: false, ai: 'none', unsaved: false,
          version: s.content === null ? null : { id: s.key, version_no: 1, content: s.content, partial: !!s.partial, word_count: 1 },
          run: s.running ? { started_at: new Date(Date.now() - 30000).toISOString(), heartbeat_at: new Date(Date.now() - 2000).toISOString() } : null })) })) };
  };
  const UI = {
    'all-sections-all-parts': async () => {},
    'final-only': async () => { await page.locator('#expInclude').selectOption('final'); },
    'intro-and-conclusion-off': async () => { for (const k of ['title', 'copyright', 'contents', 'intro', 'conclusion']) await page.locator(`[data-exp-part="${k}"]`).uncheck(); },
    'final-only-no-intro': async () => { await page.locator('#expInclude').selectOption('final'); await page.locator('[data-exp-part="intro"]').uncheck(); },
    'order-by-position': async () => {}
  };
  for (const c of FX.cases) {
    if (!UI[c.name]) { ok(`include rule: a UI for ${c.name}`, false); continue; }
    S().exportData[E11.B1] = fxData(c.book);
    if (c.name === 'final-only-no-intro') S().exportData[E11.B1].book.bio = 'Bio.';
    await fromCard(E11.B1);
    await ready();
    await UI[c.name]();
    if (c.name === 'final-only-no-intro') await page.locator('[data-exp-part="about"]').check();
    if (await page.locator('[data-exp-ack]').count()) await page.locator('[data-exp-ack]').check();
    if (c.name === 'all-sections-all-parts') ok('6 a running section: "Writing now", the button names the saved version', (await D()).includes('Writing now: 2.3 c2c.') && (await go().innerText()).trim() === 'Export with v1');
    await exportNow();
    const r = S().exports[S().exports.length - 1];
    ok(`include rule (same as export_badges) through the dialog: ${c.name}`, JSON.stringify(r.versions) === JSON.stringify(c.expected) && r.include === c.include
      && JSON.stringify(r.parts) === JSON.stringify(c.parts), [r.versions, r.include, r.parts]);
    await page.locator('[data-exp-done]').click();
  }

  /* ── 2a, 2b. Marks and notes (book 2) ── */
  await fresh();
  await fromCard(E11.B2);
  await ready();
  const d2 = await D();
  ok('2a warning: 4 open Verify marks (3 marks + 1 number)', d2.includes('Warning: 4 open Verify marks. These sentences have a number or claim with no source in your Research.'), d2.slice(0, 400));
  const rows = await page.locator('.exp-marks li').allInnerTexts();
  ok('2a the list: section, count', JSON.stringify(rows.map((r) => r.replace(/\s+/g, ' ').trim())) === JSON.stringify(['2.1 Shoulder rolls 2 marks', '3.1 Twist one 1 number, no mark', '4.1 Slow breaths 1 mark']), rows);
  ok('2a each links to the section in 06 Write', (await page.locator('.exp-marks a').first().getAttribute('href')) === `book.html?id=${E11.B2}&step=6&section=s21`);
  ok('2a Export off until the tick, with the reason', await go().isDisabled() && (await T('#expWhy')) === 'Tick the box above to export.' && (await go().getAttribute('aria-describedby')) === 'expWhy');
  ok('2a notes: Draft and Reviewed in the file', d2.includes('2 sections are Draft and 1 is Reviewed. They are in the file. Choose "Final only" to leave them out.'));
  ok('2a notes: no text, left out', d2.includes('3 sections have no text: 5.1, 5.2 and 5.3. They are left out.'));
  ok('2a notes: Needs review', d2.includes('Needs review: chapter 4. The positioning changed after it was written.'));
  ok('2a notes: unsaved edits, the saved version', d2.includes('1.2 has unsaved edits. The file uses v6, its last saved version.'));
  ok('2a notes: a stopped Generate', d2.includes('1.1 ends where a Generate was stopped (partial text).'));
  ok('2a no ready line', !d2.includes('Ready.'));
  await tallShot('export-2a-marks-full');
  await shot('export-2a-marks-1440');
  await page.locator('[data-exp-ack]').check();
  ok('2b tick set: Export on, no reason', await go().isEnabled() && !(await page.locator('#expWhy').count()) && (await go().innerText()).trim() === 'Export .docx');
  await page.keyboard.press('Escape');
  await fromCard(E11.B2);
  await ready();
  ok('2b the tick resets when the dialog opens again', !(await page.locator('[data-exp-ack]').isChecked()) && await go().isDisabled());

  /* ── 3. Final only ── */
  await page.locator('#expInclude').selectOption('final');
  await page.waitForTimeout(100);
  const d3 = await D();
  ok('3 include: Final only (7 of 10)', (await T('#expInclude option:checked')) === 'Final only (7 of 10)', await T('#expInclude option:checked'));
  ok('3 left out: the sections that are not Final', d3.includes('Left out: 3 sections that are not Final.') && d3.includes('1.2 Breathing (Draft) · 2.2 Neck stretches (Draft) · 3.2 Twist two (Reviewed)'), d3.slice(0, 700));
  ok('3 marks follow the file (3.1 is Final, 2.1 and 4.1 too)', d3.includes('Warning: 4 open Verify marks.'));
  ok('3 focus stays on Include', await page.evaluate(() => document.activeElement.id === 'expInclude'));
  S().exportData[E11.B2] = E11.exportData('final');
  await page.keyboard.press('Escape');
  await fromCard(E11.B2);
  await ready();
  await page.locator('#expInclude').selectOption('final');
  await page.waitForTimeout(100);
  const d3b = await D();
  ok('3 a chapter with no Final section is left out with its title', d3b.includes('Chapter 4 and Chapter 5 have no Final section, so they are left out with their titles. The contents list follows.'), d3b.slice(0, 900));
  ok('3 the note says how the chapters in the file are numbered (owner, STOP 3)', d3b.includes('The contents list follows. Chapters in the file are numbered 1 to 3.'), d3b.slice(0, 900));
  await page.locator('[data-exp-ack]').check();
  await exportNow();
  const x3 = await lastBlob('docx');
  ok('3 and the file agrees: Chapter 1 to Chapter 3, no Chapter 4', ['Chapter 1: Getting started', 'Chapter 2: Shoulders', 'Chapter 3: Seated twists'].every((t) => x3.includes(`>${t}<`)) && !/>Chapter 4/.test(x3),
    (x3.match(/>Chapter \d[^<]*</g) || []));
  await page.locator('[data-exp-done]').click();
  await fromCard(E11.B2);
  await ready();
  await page.locator('#expInclude').selectOption('final');
  await page.waitForTimeout(100);
  await tallShot('export-3-final-only-full');
  await page.keyboard.press('Escape');

  /* ── 4. Markdown ── */
  await fromCard(E11.B1);
  await ready();
  await page.locator('input[value="md"]').check();
  await page.waitForTimeout(100);
  const d4 = await D();
  ok('4 Markdown: its layout facts and Export .md', d4.includes('One .md file, same order and same book parts as the Word file.') && d4.includes('No page size and no page numbers in Markdown.') && (await go().innerText()).trim() === 'Export .md');
  await shot('export-4-markdown-1440');
  const badgeCalls = S().calls.filter((c) => c.includes('export_badges')).length;
  const mdName = await exportNow();
  const md = await lastBlob('text');
  ok('4 the .md file', mdName === 'chair-yoga-for-seniors-over-60.md' && md.startsWith('# Chair Yoga for Seniors Over 60\n\n*Gentle moves for every day*\n\nby Nora Hale') && !md.includes('[Verify'), md.slice(0, 120));
  ok('4 recorded as md; the Books badge is not read again', S().exports[S().exports.length - 1].format === 'md' && S().calls.filter((c) => c.includes('export_badges')).length === badgeCalls);
  ok('4 success says Markdown is a backup', (await D()).includes('Markdown exports are a backup. The Books badge follows Word exports.'));
  await page.locator('[data-exp-done]').click();

  /* ── 5. Empty ── */
  await fromCard(E11.B3);
  await ready();
  const d5 = await D();
  ok('5 empty: one next step', d5.includes('Nothing to export yet') && d5.includes('No section has saved text. Write at least one section in 06 Write, then come back.')
    && (await page.locator('.exp-empty a').getAttribute('href')) === `book.html?id=${E11.B3}&step=6` && !(await page.locator('#expInclude').count()));
  ok('5 Export off: "Write a section first."', await page.locator('.exp-foot .btn-primary').isDisabled() && (await T('#expWhy')) === 'Write a section first.');
  await shot('export-5-empty-1440');
  await page.keyboard.press('Escape');

  /* ── 6. Locked, then the run ends ── */
  S().exportData[E11.B1] = E11.exportData('running');
  await fromCard(E11.B1);
  await ready();
  ok('6 locked: writing now, export with the saved version', (await D()).includes('Writing now: 3.1 Twist one. Generate is still running for this section.')
    && (await D()).includes('Wait for it to finish, or export now with v4, its last saved version. The new text will not be in the file.') && (await go().innerText()).trim() === 'Export with v4');
  await shot('export-6-locked-1440');
  S().exportData[E11.B1] = E11.exportData('ready');
  await page.waitForFunction(() => !document.querySelector('.exp-dialog').innerText.includes('Writing now'), null, { timeout: 9000 });
  ok('6 rechecked: the run ended, the alert goes, "Export .docx"', (await go().innerText()).trim() === 'Export .docx');
  await page.keyboard.press('Escape');

  /* ── 7. Building, and Cancel ── */
  await fresh({ docxSlow: 2500 });
  await fromCard(E11.B1);
  await ready();
  const before = S().exports.length, b0 = await blobs();
  await go().click();
  await page.locator('.exp-steps li.is-now').waitFor({ timeout: 4000 });
  ok('7 building: the steps, Loading the Word tool now', (await T('.exp-steps li.is-now')) === 'Loading the Word tool' && (await T('.exp-steps')).includes('Reading 10 sections')
    && (await T('.exp-foot')).includes('Building…') && await page.evaluate(() => document.activeElement.matches('[data-exp-cancel]')));
  await shot('export-7-building-1440');
  await page.locator('[data-exp-cancel]').click();
  await page.waitForTimeout(3000);
  ok('7 Cancel: back to the choices; nothing saved or recorded', (await go().count()) === 1 && S().exports.length === before && (await blobs()) === b0);
  await page.keyboard.press('Escape');

  /* ── 8a. The Word tool fails; Export .md instead ── */
  await fresh({ docxFail: true });
  await fromCard(E11.B1);
  await ready();
  await go().click();
  await page.locator('[data-exp-retry="lib"]').waitFor({ timeout: 8000 });
  ok('8a error: the Word tool, with Try again and Export .md instead', (await D()).includes("Error: we couldn't load the Word tool. Check your connection and try again. Your book is safe. Markdown export still works without it.")
    && await page.evaluate(() => document.activeElement.matches('[data-exp-retry]')));
  await shot('export-8a-error-1440');
  const dl8 = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('[data-exp-md]').click();
  ok('8a Export .md instead works', (await (await dl8).suggestedFilename()).endsWith('.md'));
  await page.locator('[data-exp-done]').waitFor({ timeout: 8000 });
  await page.locator('[data-exp-done]').click();

  /* ── 8b. Reading fails (at open, at build) ── */
  await fresh({ exportFail: 1 });
  await fromCard(E11.B1);
  await page.locator('[data-exp-retry="read"]').waitFor({ timeout: 8000 });
  ok('8b at open: "we couldn\'t read your book", Try again', (await D()).includes("Error: we couldn't read your book. Check your connection and try again. Your text is safe. Nothing was exported."));
  await shot('export-8b-error-1440');
  await page.locator('[data-exp-retry]').click();
  await ready();
  ok('8b Try again loads the choices', (await go().count()) === 1);
  globalThis.__modes.exportFail = 1;
  await go().click();
  await page.locator('[data-exp-retry="read"]').waitFor({ timeout: 8000 });
  const dl9 = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('[data-exp-retry]').click();
  await dl9;
  await page.locator('[data-exp-done]').waitFor({ timeout: 8000 });
  ok('8b at build: Try again exports', (await T('#expTitle')) === 'Book exported');
  await page.locator('[data-exp-done]').click();

  /* ── 9. The record fails; Try again records only ── */
  await fresh({ recordFail: true });
  await fromCard(E11.B1);
  await ready();
  await exportNow();
  const nb = await blobs(), nr = S().exports.length;
  ok('9 record failed: the file is fine, a warning with Try again', (await D()).includes("We couldn't record this export, so the Books badge may be missing.") && await page.evaluate(() => document.activeElement.matches('[data-exp-record]')));
  globalThis.__modes.recordFail = false;
  await page.locator('[data-exp-record]').click();
  await page.waitForFunction(() => !document.querySelector('[data-exp-record]'), null, { timeout: 5000 });
  ok('9 Try again records once more, no new file', S().exports.length === nr + 1 && (await blobs()) === nb && (await D()).includes('The Books page now shows'));
  await page.locator('[data-exp-again]').click();
  await ready();
  ok('9 Export again: back to the choices', (await go().count()) === 1);
  await page.keyboard.press('Escape');

  return out.join('\n');
};
