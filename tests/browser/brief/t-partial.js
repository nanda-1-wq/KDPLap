// R1 (ultrareview 2026-10-07): one save sends Brief fields (book_briefs) and
// book fields (books) together. When only one write fails, only its fields go
// back or wait for Retry; the part that saved stays on screen and is not sent again.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const NEW_TOPIC = 'Chair yoga for stiff knees and hips';
  const line = () => page.$eval('[data-saved-line]', (e) => ({ state: e.dataset.state, text: e.innerText, retry: !!e.querySelector('[data-retry-save]') }));
  const waitLine = (state) => page.waitForFunction((s) => (document.querySelector('[data-saved-line]') || {}).dataset?.state === s, state, { timeout: 8000 });
  const open = async (id) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bf-pen:not([disabled])', { timeout: 10000 });
  };
  // Topic (debounced) then pen name (saves at once): both go out in one save.
  const editBoth = () => page.evaluate(([topic, pen]) => {
    const t = document.querySelector('#bf-topic_text');
    t.value = topic; t.dispatchEvent(new Event('input', { bubbles: true }));
    const s = document.querySelector('#bf-pen');
    s.value = pen; s.dispatchEvent(new Event('change', { bubbles: true }));
  }, [NEW_TOPIC, PA]);
  const writesFrom = (n) => st.writes.slice(n);
  await page.setViewportSize({ width: 1440, height: 1000 });

  // A. The book write is refused (42501, pen name not the user's); the Brief write works.
  await open(B2);
  globalThis.__modes.bookFail = { status: 403, code: '42501' };
  let n = st.writes.length;
  await editBoth();
  await waitLine('error');
  globalThis.__modes.bookFail = null;
  let w = writesFrom(n);
  ok(w.some((x) => x.table === 'book_briefs' && x.body.topic_text === NEW_TOPIC && !x.failed) && w.some((x) => x.table === 'books' && x.failed), `A: one save, Brief saved, book refused (${w.map((x) => x.table + (x.failed ? '!' : '')).join(', ')})`);
  ok(st.books[B2].brief.topic_text === NEW_TOPIC, 'A: the database has the new topic');
  ok((await page.inputValue('#bf-topic_text')) === NEW_TOPIC, `A: the saved topic stays on screen: "${await page.inputValue('#bf-topic_text')}"`);
  ok((await page.inputValue('#bf-pen')) === '', `A: only the pen name goes back: "${await page.inputValue('#bf-pen')}"`);
  ok((await line()).text.includes('That pen name is not available'), `A: message: "${(await line()).text}"`);
  ok((await page.innerText('.book-id-title')) === NEW_TOPIC, `A: the sidebar shows the saved topic: "${await page.innerText('.book-id-title')}"`);
  n = st.writes.length;
  await page.focus('#bf-topic_text');
  await page.focus('#bf-series_name').catch(() => page.keyboard.press('Tab'));
  await page.waitForTimeout(1100);
  ok(writesFrom(n).length === 0, `A: the topic is not sent again (${writesFrom(n).length} writes)`);

  // B. The book write fails for a network reason (Retry); the Brief write works.
  await open(B1);
  globalThis.__modes.bookFail = { status: 500, code: 'XX000' };
  await editBoth();
  await waitLine('error');
  globalThis.__modes.bookFail = null;
  ok((await line()).retry, 'B: Retry shows');
  ok((await page.inputValue('#bf-topic_text')) === NEW_TOPIC && (await page.inputValue('#bf-pen')) === PA, 'B: both edits stay on screen');
  n = st.writes.length;
  await page.click('[data-retry-save]');
  await waitLine('saved');
  w = writesFrom(n);
  ok(w.length === 1 && w[0].table === 'books' && w[0].body.pen_name_id === PA, `B: Retry sends only the pen name (${w.map((x) => x.table + ' ' + Object.keys(x.body).join('+')).join(', ')})`);

  // C. The Brief write is refused (23514); the book write still goes out and works.
  await open(B3);
  globalThis.__modes.briefFail = { status: 400, code: '23514' };
  n = st.writes.length;
  await editBoth();
  await waitLine('error');
  globalThis.__modes.briefFail = null;
  w = writesFrom(n);
  ok(w.some((x) => x.table === 'books' && x.body.pen_name_id === PA && !x.failed), `C: the pen name is still saved (${w.map((x) => x.table + (x.failed ? '!' : '')).join(', ')})`);
  ok((await page.inputValue('#bf-pen')) === PA, `C: the pen name stays: "${await page.inputValue('#bf-pen')}"`);
  ok((await page.inputValue('#bf-topic_text')) === 'Chair yoga for seniors with stiff joints', `C: only the topic goes back: "${await page.inputValue('#bf-topic_text')}"`);
  ok((await line()).text.includes('breaks a Brief rule'), `C: message names the Brief: "${(await line()).text}"`);

  await page.screenshot({ path: `${SHOTS}/brief-partial.png`, timeout: 5000 }).catch(() => {});
  return log.join('\n');
};
