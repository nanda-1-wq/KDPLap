// Step 06 Write, E17 Part 8 (design 84): the book part states. Save failed (the foot: red icon and word,
// Retry, "Your text stays on screen…", the text kept; Retry saves), offline (the same words for offline; back
// online sends it again by itself), the loading lines ("Loading the book part…", then the editor), the Checks
// tab on a part (the bold line and the 07 line), and the states Parts 4 and 5 built (no bio, Also by with no
// other books) still there. Hostile part text is text, never HTML. Focus ring on Retry; 200% text.
// Run: tests/browser/run.sh write t-e17-states.js
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const g = (fn, arg) => page.evaluate(fn, arg);
  const until = async (fn, arg, ms = 4000) => { try { await page.waitForFunction(([src, a]) => { try { return (0, eval)(`(${src})`)(a); } catch (e) { return false; } }, [fn.toString(), arg], { timeout: ms }); return true; } catch (e) { return false; } };
  const part = (k) => st.partOf(W1, k);
  const open = async (q = '', w = 1440, h = 900) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${W1}&step=6${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-ms-list', { timeout: 10000 });
    await page.waitForSelector('.wr-editor, .wr-fixed, .wr-ab', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
  };
  const foot = () => g(() => {
    const f = document.querySelector('[data-foot]');
    const t = f && f.querySelector('[data-foot-text]');
    const b = f && f.querySelector('[data-foot-retry]');
    const u = f && f.querySelector('[data-foot-under]');
    return {
      text: t ? t.textContent.replace(/\s+/g, ' ').trim() : null, red: t ? t.classList.contains('is-error') : false, icon: !!(t && t.querySelector('svg')),
      color: t ? getComputedStyle(t).color : null, danger: (() => { const p = document.createElement('span'); p.style.color = 'var(--danger)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })(),
      retry: b ? Math.round(b.getBoundingClientRect().height) : 0, under: u ? u.textContent.trim() : null, save: !!(f && f.querySelector('[data-save-version]'))
    };
  });
  const edText = () => g(() => document.querySelector('[data-editor]').innerText.trim());
  const drafts = () => st.writes.filter((w) => w.table === 'book_part_drafts');
  /** The autosave is done: saved, nothing left (before any navigation, or the page asks "Leave site?"). */
  const saved = () => until(() => kdpBookSteps[6].saveState() === 'saved', null, 6000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // A "Leave site?" means a save was still waiting: recorded (a FAIL), then accepted so the session never hangs.
  const leave = [];
  const onDialog = (d) => { leave.push(`${d.type()} @ ${log.length}`); d.accept().catch(() => {}); };
  page.on('dialog', onDialog);

  globalThis.__modes.parts = 1;
  part('dedication').enabled = true;
  part('about_author').enabled = true;
  part('also_by').enabled = true;

  /* ── Loading a book part: gray lines and the words, then the editor ── */
  await open(`&section=${st.s42}`);
  globalThis.__modes.partTextSlow = 900;
  await page.click(`[data-part="${part('dedication').id}"]`);
  const shownLoading = await until(() => !!document.querySelector('[data-part-loading]'), null, 2000);
  const L = await g(() => {
    const b = document.querySelector('[data-part-loading]');
    if (!b) return null;
    const n = b.querySelector('[role="status"]');
    return { lines: b.querySelectorAll('.skel').length, hidden: b.querySelector('.skel').closest('[aria-hidden="true"]') !== null, note: n ? n.textContent : null,
      visible: n ? n.getBoundingClientRect().height > 0 && getComputedStyle(n).position !== 'absolute' : false };
  });
  ok(shownLoading && L && L.lines === 4 && L.hidden && L.note === 'Loading the book part…' && L.visible, `84 loading: 4 gray lines (hidden from readers) and "Loading the book part…" shown (${JSON.stringify(L)})`);
  await until(() => !!document.querySelector('[data-editor]') && !document.querySelector('[data-part-loading]'), null, 5000);
  ok(await g(() => document.querySelector('#wrSecTitle').textContent === 'Dedication'), 'loading: then the editor');
  globalThis.__modes.partTextSlow = 0;

  /* ── Save failed: the foot ── */
  globalThis.__modes.partDraftError = 99;
  await page.click('[data-editor]');
  await page.keyboard.type('For my teachers.');
  const failed = await until(() => !!document.querySelector('[data-foot-retry]'), null, 6000);
  let F = await foot();
  ok(failed && F.text === 'Not saved. Check your connection.' && F.red && F.icon && F.color === F.danger, `84 save failed: red icon and word in the foot (${JSON.stringify(F)})`);
  ok(F.retry >= 44 && F.under === 'Your text stays on screen. The app tries again when you are back online.' && F.save, `84 save failed: Retry 44 px, the under line, Save version kept (${F.retry})`);
  ok((await edText()) === 'For my teachers.', 'save failed: the text stays on screen');
  ok(/Couldn't save\./.test(await g(() => document.querySelector('[data-saved-line]').textContent)), 'the sidebar save line says it too (one aria-live place)');
  // Focus ring on Retry (2 px ink, 2 px offset).
  await g(() => document.querySelector('[data-foot-retry]').focus());
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await g(() => { const s = getComputedStyle(document.activeElement); return [document.activeElement.hasAttribute('data-foot-retry'), s.outlineStyle, s.outlineWidth, s.outlineOffset]; });
  ok(ring[0] && ring[1] !== 'none' && ring[2] === '2px' && ring[3] === '2px', `Retry: focus ring 2 px, offset 2 px (${JSON.stringify(ring)})`);
  // Retry, the server is back: the draft is saved and the foot is calm again.
  globalThis.__modes.partDraftError = 0;
  const n1 = drafts().length;
  await page.click('[data-foot-retry]');
  // The foot calms while the save runs ("Saving…" is the sidebar's): wait for the save itself.
  await saved();
  F = await foot();
  ok(drafts().length === n1 + 1 && st.parts.drafts[part('dedication').id] && st.parts.drafts[part('dedication').id].content === 'For my teachers.' && !F.red && F.retry === 0,
    `Retry: one draft save, the text saved, the foot calm (${drafts().length - n1} ${JSON.stringify(st.parts.drafts[part('dedication').id])} ${F.text})`);

  /* ── Offline: the offline words, and back online sends it again by itself ── */
  await g(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
  globalThis.__modes.partDraftOffline = 1;
  await page.click('[data-editor]');
  await page.keyboard.press('End');
  await page.keyboard.type(' And my students.');
  await until(() => !!document.querySelector('[data-foot-retry]'), null, 6000);
  F = await foot();
  ok(F.text === 'Not saved. You are offline.' && F.red && F.icon && F.retry >= 44 && /back online/.test(F.under || ''), `offline: "Not saved. You are offline." with Retry (${F.text})`);
  const n2 = drafts().length;
  await g(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')); });
  await saved();
  ok(drafts().length === n2 + 1 && st.parts.drafts[part('dedication').id].content === 'For my teachers. And my students.', `back online: the draft goes again by itself, once (${drafts().length - n2} ${JSON.stringify(st.parts.drafts[part('dedication').id])})`);
  ok(!(await foot()).red, 'back online: the foot is calm');

  /* ── Checks tab on a part ── */
  await page.click('[data-tab="checks"]').catch(async () => { await page.click('[data-panel-toggle]'); await page.click('[data-tab="checks"]'); });
  await until(() => document.querySelector('[data-panel-kind="checks-part"]'));
  const C = await g(() => { const p = document.querySelector('[data-panel-kind="checks-part"]'); const t = p.querySelector('.wr-soon-title'); return { title: t ? t.textContent : null, weight: t ? getComputedStyle(t).fontWeight : null, all: p.textContent.replace(/\s+/g, ' ') }; });
  ok(C.title === 'Book parts have no checks.' && Number(C.weight) >= 600 && /AI checks are for chapters\. 07 Quality Control still tells you when a part is on but empty or not Final\./.test(C.all),
    `84 Checks tab: the bold line and the 07 line (${C.all})`);

  /* ── Hostile part text is text ── */
  const hostile = '<img src=x onerror="window.__xss=1"> # $ @ * _ & < > " \'';
  st.parts.versions.push({ id: '8a000000-0000-4000-8000-0000000000f1', part_id: part('dedication').id, version_no: 9, content: hostile, word_count: 12, source: 'manual', label: null, partial: false, created_at: new Date().toISOString() });
  part('dedication').current_version_id = '8a000000-0000-4000-8000-0000000000f1';
  delete st.parts.drafts[part('dedication').id];
  await open(`&part=${part('dedication').id}`);
  ok(await g(() => !window.__xss && !document.querySelector('[data-editor] img') && document.querySelector('[data-editor]').innerText.includes('<img src=x')), 'hostile part text: shown as text, never an element');

  /* ── Parts 4 and 5 states are still there (Step 0) ── */
  const bio = st.penBio;
  st.penBio = '';
  await open(`&part=${part('about_author').id}`);
  await until(() => !!document.querySelector('[data-no-bio]'));
  ok(/This pen name has no bio yet\./.test(await g(() => (document.querySelector('[data-no-bio]') || {}).textContent || '')), '84 no bio: the card shows (Part 5)');
  st.penBio = bio;
  st.parts.others[W1] = [];
  st.parts.alsoBy[W1] = [];
  await open(`&part=${part('also_by').id}`);
  await until(() => !!document.querySelector('[data-ab-empty]'));
  ok(/No other books with the pen name .+ yet\./.test(await g(() => (document.querySelector('[data-ab-empty]') || {}).textContent || '')), '84 Also by with no other books: the state shows (Part 5)');

  /* ── 200% text at 1440 and 900: the failed foot wraps, no sideways scroll ── */
  for (const w of [1440, 900]) {
    await open(`&part=${part('dedication').id}`, w, 900);
    globalThis.__modes.partDraftError = 99;
    await g(() => { document.documentElement.style.fontSize = '200%'; });
    await page.click('[data-editor]');
    await page.keyboard.press('End');
    await page.keyboard.type(' x');
    await until(() => !!document.querySelector('[data-foot-retry]'), null, 6000);
    const z = await g(() => ({ side: document.documentElement.scrollWidth > innerWidth + 1, retry: (() => { const r = document.querySelector('[data-foot-retry]').getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; })() }));
    ok(!z.side && z.retry, `${w} at 200% text: no sideways scroll, Retry inside the window (${JSON.stringify(z)})`);
    globalThis.__modes.partDraftError = 0;
    await page.click('[data-foot-retry]');
    await saved();
    await g(() => { document.documentElement.style.fontSize = ''; });
  }

  ok(errs.length === 0, `no page errors (${errs.join(' | ')})`);
  ok(leave.length === 0, `no "Leave site?" dialog (${leave.join(', ')})`);
  page.off('dialog', onDialog);
  return log.join('\n');
};
