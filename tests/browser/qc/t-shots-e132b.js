// E13.2b STOP 3 (never in a sweep): 07 Quality Control, KDP rules, "too long" with the trim's limit (T8):
// an 8.5 × 11 book of about 200,000 words is about 710 pages; KDP takes at most 590 at 8.5 × 11 on white.
// Files go to docs/reviews/e13-2b-stop3/.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/qc$/, 'docs/reviews/e13-2b-stop3');
  await page.setViewportSize({ width: 1440, height: 1100 });
  st.brief.trim_size = '8.5x11';
  st.book.trim = '8.5x11';   // this mock's export_json reads the book row (the real one reads the Brief)
  const long = Array.from({ length: 860 }, (_, i) => `${'Study a small part of the day and keep a calm quiet focus on one daily habit at a time. '.repeat(11)}`).join('\n\n');
  st.edit(st.section('2.1'), long);
  await QC.open7(page);
  const n = st.writes.filter((w) => w.table === 'qc_runs').length;
  await page.click('[data-run]');
  for (let i = 0; i < 1200 && st.writes.filter((w) => w.table === 'qc_runs').length === n; i++) await page.waitForTimeout(100);
  await page.waitForFunction(() => !document.querySelector('[data-running]'), null, { timeout: 60000 });
  const sent = st.writes.filter((w) => w.table === 'qc_runs').pop().body;
  log.push(`INFO sent words ${sent.words}, sections ${sent.sections}, trim in store ${st.brief.trim_size}, 2.1 words ${st.section('2.1').version.content.split(/\s+/).length}`);
  const g7 = page.locator('.qc-g:has([data-group="7"])');
  if ((await g7.locator('.qc-gb').getAttribute('aria-expanded')) !== 'true') await g7.locator('.qc-gb').click();
  const t8 = await g7.innerText();
  ok(/About \d+ pages\. KDP takes at most 590 at 8\.5 × 11 in on white paper\./.test(t8), `T8: ${t8.replace(/\s+/g, ' ').slice(0, 200)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await g7.screenshot({ path: `${OUT}/07-kdp-rules-8.5x11-1440.png` });
  log.push('PASS 07-kdp-rules-8.5x11-1440.png');
  st.brief.trim_size = '6x9';
  st.book.trim = '6x9';
  return log.join('\n');
};
