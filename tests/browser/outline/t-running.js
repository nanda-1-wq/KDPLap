// E10.2 review 1: a section that Generate is writing right now counts as
// writing (0020 section_has_writing sees a fresh run), so 05 cannot remove it
// mid-stream. Two cases: outline_json already says has_writing (the run had
// started before 05 loaded), and the run starts after 05 loaded (the server
// refuses the delete; the section stays).
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const ch = (n) => `.otl-ch:not(.otl-fixed):nth-child(${n + 1})`;
  const open = async () => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${B1}&step=5`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.otl-list', { timeout: 10000 });
    await page.waitForTimeout(300);
    await page.click(`${ch(3)} [data-toggle]`).catch(() => {});
    await page.waitForTimeout(200);
  };
  const dels = () => st.writes.filter((w) => w.method === 'DELETE').length;
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. The run started before 05 loaded: outline_json says has_writing (no version, no draft).
  const s31 = st.outline[B1][3].sections[0];
  s31.has_writing = true;
  ok(!s31.current_version_id && !s31.has_draft, 'setup: 3.1 has no version and no draft, only a running Generate');
  await open();
  await page.click(`#otlSD-${s31.id}`);
  ok((await txt('dialog[open] h2')) === 'Section 3.1 has writing', `title: ${await txt('dialog[open] h2')}`);
  ok(/^This section has writing, so it can’t be deleted\./.test(await txt('dialog[open] .delete-text')), `text: ${await txt('dialog[open] .delete-text')}`);
  ok(await page.$eval('dialog[open] [data-confirm]', (b) => b.hidden) && (await txt('dialog[open] [data-close]')) === 'Close', 'only Close');
  await page.click('dialog[open] [data-close]');

  // 2. The run starts after 05 loaded: the dialog offers Remove, the server refuses, the section stays.
  const s32 = st.outline[B1][3].sections[1];
  ok(typeof s32.has_writing !== 'boolean' || !s32.has_writing, 'setup: 3.2 is not writing when 05 loads');
  await page.click(`#otlSD-${s32.id}`);
  ok((await txt('dialog[open] h2')) === 'Remove section 3.2?', `title: ${await txt('dialog[open] h2')}`);
  s32.has_writing = true;              // Generate starts on 3.2 in another tab
  const before = dels();
  await page.click('dialog[open] [data-confirm]');
  await page.waitForFunction(() => { const e = document.querySelector('dialog[open] .delete-error'); return e && !e.hidden; }, null, { timeout: 5000 }).catch(() => {});
  ok(dels() === before + 1, 'the delete was sent once');
  ok(/This section has writing, so it can’t be deleted\./.test(await txt('dialog[open]')), `refused: ${await txt('dialog[open]')}`);
  await page.click('dialog[open] [data-close]');
  ok(st.outline[B1][3].sections.some((x) => x.id === s32.id) && !!(await page.$(`#otlSD-${s32.id}`)), 'the section stays, on the server and on screen');
  return log.join('\n');
};
