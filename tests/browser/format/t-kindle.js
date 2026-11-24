// E13.3 Part 3: the Kindle preview in 08 (designs 41d, 41e; plan section 3). Mocked: no Supabase, no print
// engine needed. The switch, the sandbox, paging (buttons, arrow keys outside and inside the frame), contents
// jumps (mouse and Enter), external links inert, A A A, the place after a change (same part, at its start;
// owner STOP 3 addition 1), a resize to 900 (addition 2), every 41e state (A building, B error, C nothing
// Final, D a trim outside the print list, E the Ready box lines, F Full screen), keyboard, focus rings, 44 px,
// and the 200-chapter golden book's timings (addition 3; numbers only, in the log as NOTE lines).
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const note = (s) => log.push(`NOTE ${s}`);
  const dbg = () => page.evaluate(() => {
    const x = window.kdpBookSteps[8]._debug();
    return { state: x.kb.state, shown: x.kb.shown, ms: x.kb.ms, key: x.kb.key, kp: x.kp ? x.kp.state() : null, label: x.kp ? x.kp.label() : '' };
  });
  const ready = (t = 10000) => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.kb.state === 'ready' && x.kp && x.kp.state().ready; }, null, { timeout: t });
  const kindle = async () => { await page.click('[data-fmt-mode="kindle"]'); await ready(); };
  const screenOf = (id) => page.evaluate((i) => window.kdpBookSteps[8]._debug().kp.screenOf(i), id);
  const goTo = (n) => page.evaluate((i) => window.kdpBookSteps[8]._debug().kp.goTo(i), n);
  const where = async () => (await dbg()).kp;
  const settle = () => page.waitForTimeout(250);
  /** A real mouse click on an element inside the shown frame (found from the parent: same origin). */
  async function clickIn(selector) {
    const r = await page.evaluate((s) => {
      const f = document.querySelector('.kp-frame:not(.is-next)');
      const el = f.contentDocument.querySelector(s);
      if (!el) return null;
      const fr = f.getBoundingClientRect(), er = el.getBoundingClientRect();
      return { x: fr.left + er.left + Math.min(8, er.width / 2), y: fr.top + er.top + er.height / 2, inView: er.left >= 0 && er.right <= f.clientWidth + 1 };
    }, selector);
    if (!r) throw new Error(`no ${selector} in the frame`);
    await page.mouse.click(r.x, r.y);
    return r;
  }
  /** The screen an element without an id sits on (as kindle-preview.js counts). */
  const screenOfSel = (selector) => page.evaluate((s) => {
    const f = document.querySelector('.kp-frame:not(.is-next)');
    const d = f.contentDocument, se = d.scrollingElement, W = f.contentWindow.innerWidth;
    return Math.floor((d.querySelector(s).getBoundingClientRect().left + se.scrollLeft + 1) / W);
  }, selector);
  const sandboxes = () => page.$$eval('iframe', (fs) => fs.map((f) => f.getAttribute('sandbox')));
  const box = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });

  await page.setViewportSize({ width: 1440, height: 1000 });

  /* 1. The switch (41d): the bar, the device, the caption; Print gives the print area back. */
  await FM.open(page);
  ok(await page.$eval('[data-kp-wrap]', (w) => w.hidden) && await page.$eval('[data-kp-sizes]', (w) => w.hidden) && await page.$eval('[data-kp-chips]', (w) => w.hidden), 'Print mode: no Kindle area, no A A A, no Kindle chips');
  await kindle();
  ok(await page.$eval('[data-fmt-mode="kindle"]', (b) => b.getAttribute('aria-pressed') === 'true') && await page.$eval('[data-fmt-wrap]', (w) => w.hidden), 'Kindle: pressed, the print area hidden');
  ok((await FM.all(page, '.kp-chip')).join('|') === 'EPUB 3 · clickable contents|No page numbers' && !(await FM.has(page, '.fmt-chip')), `chips: ${(await FM.all(page, '.kp-chip')).join('|')}`);
  ok(await page.$eval('[data-kp-sizes]', (g) => g.getAttribute('role') === 'group' && g.getAttribute('aria-label') === 'Text size' && [...g.querySelectorAll('button')].map((b) => `${b.getAttribute('aria-label')}:${b.getAttribute('aria-pressed')}`).join('|') === 'Small text:false|Medium text:true|Large text:false'), 'A A A: a labeled group, Medium pressed');
  ok(!(await page.$eval('[data-fmt-full]', (b) => b.disabled)), 'Full screen: on');
  ok((await FM.txt(page, '.kp-loc')) === 'Location, not page number', 'the screen says: Location, not page number');
  ok((await FM.txt(page, '[data-kp-cap]')) === "Text reflows. The number of screens changes with the text size. This is NicheInk's preview of your EPUB, not Kindle's own screen: KDP's Previewer is the final check.", 'the caption (41d)');
  let d0 = await dbg();
  ok(/^Screen 1 of \d+$/.test(d0.label) && (await FM.txt(page, '[data-kp-label]')) === d0.label && await page.$eval('[data-kp-label]', (l) => l.getAttribute('aria-live') === 'polite'), `the pager: ${d0.label}, read aloud politely`);
  ok(await page.$eval('[data-kp-prev]', (b) => b.disabled && b.getAttribute('aria-label') === 'Previous screen') && await page.$eval('[data-kp-next]', (b) => !b.disabled && b.getAttribute('aria-label') === 'Next screen'), 'Previous off on screen 1, Next on; both labeled');
  ok(await page.$eval('[data-fmt-state]', (x) => !x.offsetParent) && await page.$eval('[data-fmt-stage]', (x) => !x.offsetParent), 'no print state or pages shown in Kindle mode');
  note(`mock book (17 sections, about 10,000 words) at 1440, Medium: ${d0.kp.screens} screens; build ${d0.ms.build.toFixed(1)} ms, first screen ${Math.round(d0.ms.first)} ms`);

  /* 2. The sandbox: exactly "allow-same-origin"; no script runs inside. */
  ok((await sandboxes()).every((s) => s === 'allow-same-origin') && (await sandboxes()).length === 1, `the sandbox attribute: ${JSON.stringify(await sandboxes())}`);
  ok(await page.evaluate(() => {
    const f = document.querySelector('.kp-frame');
    const dd = f.contentDocument;
    const sc = dd.createElement('script');
    sc.textContent = 'window.parent.__kpRan = true;';
    dd.body.append(sc);
    const img = dd.createElement('img');
    img.setAttribute('onerror', 'window.parent.__kpRan = true;');
    img.src = 'data:,x';
    dd.body.append(img);
    return new Promise((r) => setTimeout(() => { sc.remove(); img.remove(); r(window.__kpRan !== true && !f.sandbox.contains('allow-scripts') && !f.sandbox.contains('allow-popups') && !dd.querySelector('script')); }, 300));
  }), 'no script runs in the frame (a script and an onerror were added from the parent: neither ran)');

  /* 3. Paging: buttons, arrow keys outside the frame and inside it, the last screen. */
  await page.click('[data-kp-next]');
  ok((await where()).screen === 1 && (await FM.txt(page, '[data-kp-label]')) === `Screen 2 of ${d0.kp.screens}` && !(await page.$eval('[data-kp-prev]', (b) => b.disabled)), 'Next: Screen 2, Previous on');
  await page.focus('[data-kp-next]');
  await page.keyboard.press('ArrowRight');
  ok((await where()).screen === 2, 'ArrowRight (focus on a page button): Screen 3');
  await page.keyboard.press('ArrowLeft');
  ok((await where()).screen === 1, 'ArrowLeft: Screen 2');
  await page.focus('.kp-frame:not(.is-next)');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  ok((await where()).screen === 3, 'ArrowRight twice with the focus inside the frame: Screen 4');
  const scrolled = await page.evaluate(() => { const f = document.querySelector('.kp-frame'); return f.contentDocument.scrollingElement.scrollLeft / f.contentWindow.innerWidth; });
  ok(scrolled === 3, `the frame shows exactly screen 4 (scroll ${scrolled} screens)`);
  await goTo(d0.kp.screens - 1);
  ok((await FM.txt(page, '[data-kp-label]')) === `Screen ${d0.kp.screens} of ${d0.kp.screens}` && await page.$eval('[data-kp-next]', (b) => b.disabled), 'the last screen: Next off');
  await page.click('[data-kp-prev]');
  ok((await where()).screen === d0.kp.screens - 2, 'Previous from the last screen');

  /* 4. Contents: a mouse click jumps to the part; Enter on a link too; sections when "Show sections too" is on. */
  await goTo(await screenOf('contents'));
  await clickIn('#contents a[href="#c04"]');
  let w = await where();
  ok(w.part === 'c04' && w.screen === await screenOf('c04'), `contents link "Spaced practice": its first screen (${w.screen}, part ${w.part})`);
  await goTo(await screenOf('contents'));
  await page.evaluate(() => document.querySelector('.kp-frame').contentDocument.querySelector('#contents a[href="#c06"]').focus());
  await page.keyboard.press('Enter');
  w = await where();
  ok(w.part === 'c06' && w.screen === await screenOf('c06'), 'Enter on a contents link: the part');
  ok(await page.evaluate(() => [...document.querySelector('.kp-frame').contentDocument.querySelectorAll('#contents a[href]')].every((a) => a.tabIndex === -1)), 'off the contents screen, the contents links take no Tab');
  await goTo(await screenOf('contents'));
  ok(await page.evaluate(() => [...document.querySelector('.kp-frame').contentDocument.querySelectorAll('#contents a[href]')].every((a) => a.tabIndex === 0)), 'on the contents screen, its links take Tab');
  await page.click('[data-fmt-flag="contents_sections"]');
  await FM.saved(page);
  await page.waitForFunction(() => { const f = document.querySelector('.kp-frame:not(.is-next)'); return f && f.contentDocument && f.contentDocument.querySelector('a[href="#c04--s2"]') && window.kdpBookSteps[8]._debug().kb.state === 'ready'; }, null, { timeout: 5000 });
  await goTo(await screenOf('contents'));
  await clickIn('#contents a[href="#c04--s2"]');
  w = await where();
  ok(w.part === 'c04' && w.screen === await screenOf('c04--s2') && w.screen > await screenOf('c04'), `a section link: the screen of that section (${w.screen})`);
  await page.click('[data-fmt-flag="contents_sections"]');
  await FM.saved(page);
  await ready();

  /* 5. A A A: the reader size; the count changes; the reader stays on the same part, at its start (addition 1). */
  const start3 = await screenOf('c03');
  await goTo(start3 + 2);
  const mCount = (await where()).screens;
  const frameBefore = await page.evaluate(() => { const f = document.querySelector('.kp-frame'); f.dataset.t = 'same'; return true; });
  await page.click('[data-kp-size="l"]');
  w = await where();
  ok(w.size === 'l' && w.screens > mCount && w.part === 'c03' && w.screen === await screenOf('c03'), `Large: ${mCount} -> ${w.screens} screens, still Chapter 2 at its start (${w.screen})`);
  ok(await page.$eval('[data-kp-size="l"]', (b) => b.getAttribute('aria-pressed') === 'true') && await page.$eval('[data-kp-size="m"]', (b) => b.getAttribute('aria-pressed') === 'false'), 'Large pressed, Medium not');
  const lCount = w.screens;
  await goTo((await screenOf('c03')) + 1);
  await page.click('[data-kp-size="s"]');
  w = await where();
  ok(w.screens < mCount && w.part === 'c03' && w.screen === await screenOf('c03'), `Small: ${w.screens} screens, still Chapter 2 at its start`);
  const sCount = w.screens;
  await page.click('[data-kp-size="m"]');
  w = await where();
  ok(w.screens === mCount && w.part === 'c03', 'Medium again: the same count as before');
  ok(frameBefore && await page.evaluate(() => document.querySelectorAll('.kp-frame').length === 1 && document.querySelector('.kp-frame').dataset.t === 'same'), 'A A A never rebuilds (the same frame)');
  note(`mock book screens: Small ${sCount}, Medium ${mCount}, Large ${lCount}`);

  /* 6. 41e A on a rebuild: 300 ms after a change, the old screen stays dimmed, the status line, A A A and the pager off.
        The reader stays on the same part, at its start (addition 1). A print-only change does not rebuild. */
  await page.evaluate(() => {
    const k = window.kdpBookSteps[8]._debug().kp;
    const s = k.show;
    k.show = (...a) => new Promise((r) => { window.__kpRelease = () => { window.__kpRelease = null; r(s(...a)); }; });
  });
  const start4 = await screenOf('c04');
  await goTo(start4 + 2);
  await page.selectOption('[data-fmt-select="chapter_label"]', 'number');
  await page.waitForTimeout(120);
  ok((await dbg()).state === 'waiting', 'a change: waits (300 ms) before it builds');
  await page.waitForFunction(() => typeof window.__kpRelease === 'function', null, { timeout: 2000 });
  const busy = await page.evaluate(() => ({
    dim: document.querySelector('[data-kp-wrap]').classList.contains('is-updating') && getComputedStyle(document.querySelector('.kp-host')).opacity === '0.45',
    old: document.querySelectorAll('.kp-frame:not(.is-next)').length === 1,
    skel: document.querySelector('[data-kp-skel]').hidden,
    status: document.querySelector('[data-kp-status]').hidden ? null : document.querySelector('[data-kp-status]').textContent.trim(),
    nav: document.querySelector('[data-kp-nav]').hidden,
    sizes: [...document.querySelectorAll('[data-kp-sizes] button')].every((b) => b.disabled)
  }));
  ok(busy.dim && busy.old && busy.skel && busy.status === 'Building the Kindle preview…' && busy.nav && busy.sizes, `rebuild (41e A): ${JSON.stringify(busy)}`);
  await page.evaluate(() => window.__kpRelease());
  await ready();
  w = await where();
  ok(w.part === 'c04' && w.screen === await screenOf('c04'), `after the rebuild: the same part (Chapter 3), at its start (${w.screen})`);
  ok(await page.evaluate(() => { const f = document.querySelector('.kp-frame').contentDocument; return f.querySelector('#c04 .chapter-label').textContent === '3'; }), 'the rebuild shows the new label ("3")');
  ok((await sandboxes()).every((s) => s === 'allow-same-origin') && (await sandboxes()).length === 1, 'after a rebuild: one frame, the same sandbox');
  await page.evaluate(() => { document.querySelector('.kp-frame').dataset.t = 'keep'; });
  const keyBefore = (await dbg()).key;
  await page.click('[data-fmt-flag="drop_cap"]');
  await FM.saved(page);
  await page.waitForTimeout(600);
  ok((await dbg()).state === 'ready' && (await dbg()).key === keyBefore && await page.evaluate(() => document.querySelector('.kp-frame').dataset.t === 'keep'), 'drop cap (print only): no Kindle rebuild');
  await page.click('[data-fmt-flag="drop_cap"]');
  await page.selectOption('[data-fmt-select="chapter_label"]', 'chapter');
  await FM.saved(page);
  await page.waitForFunction(() => typeof window.__kpRelease === 'function', null, { timeout: 2000 });
  await page.evaluate(() => window.__kpRelease());
  await ready();

  /* 7. 41e A on the first open: the skeleton and the quiet line; A A A, the pager and Full screen off. */
  await FM.open(page);
  await page.evaluate(() => {
    const c = window.kdpKindlePreview.create;
    window.kdpKindlePreview.create = (h, o) => {
      const k = c(h, o);
      const s = k.show;
      k.show = (...a) => new Promise((r) => { window.__kpRelease = () => r(s(...a)); });
      return k;
    };
  });
  await page.click('[data-fmt-mode="kindle"]');
  await page.waitForFunction(() => typeof window.__kpRelease === 'function', null, { timeout: 3000 });
  const a = await page.evaluate(() => ({
    skel: !document.querySelector('[data-kp-skel]').hidden,
    status: document.querySelector('[data-kp-status]').hidden ? null : document.querySelector('[data-kp-status]').textContent.trim(),
    role: document.querySelector('[data-kp-status]').getAttribute('role'),
    nav: document.querySelector('[data-kp-nav]').hidden,
    sizes: [...document.querySelectorAll('[data-kp-sizes] button')].every((b) => b.disabled && getComputedStyle(b).opacity === '0.45'),
    full: document.querySelector('[data-fmt-full]').disabled,
    chips: !document.querySelector('[data-kp-chips]').hidden,
    progress: !!document.querySelector('[data-kp-wrap] [role="progressbar"]')
  }));
  ok(a.skel && a.status === 'Building the Kindle preview…' && a.role === 'status' && a.nav && a.sizes && a.full && a.chips && !a.progress, `first open (41e A): ${JSON.stringify(a)}`);
  await page.evaluate(() => window.__kpRelease());
  await ready();
  ok(await page.$eval('[data-kp-skel]', (s) => s.hidden) && !(await page.$eval('[data-kp-nav]', (n) => n.hidden)), 'then the first screen, the pager');

  /* 8. 41e B: the error box (danger), Try again. Focus moves only when it was in the preview column. */
  await FM.open(page);
  await kindle();
  await page.evaluate(() => { window.__kpBuild = window.kdpEpub.build; window.kdpEpub.build = () => { throw new Error('mock: build failed'); }; });
  await page.click('.fmt-style:has(input[value="warm"])');
  await page.waitForSelector('[data-kp-msg].is-danger:not([hidden])', { timeout: 3000 });
  ok((await FM.txt(page, '[data-kp-msg]')) === 'The Kindle preview could not be built Nothing in your book changed. Try again. If it keeps failing, your Print PDF is not affected. Try again', `error: ${await FM.txt(page, '[data-kp-msg]')}`);
  const b = await page.evaluate(() => {
    const m = document.querySelector('[data-kp-msg]');
    return {
      role: m.getAttribute('role'), icon: !!m.querySelector('svg'), border: getComputedStyle(m).borderTopColor, title: getComputedStyle(m.querySelector('.kp-msg-title')).color,
      dev: document.querySelector('[data-kp-dev]').hidden, nav: document.querySelector('[data-kp-nav]').hidden, chips: document.querySelector('[data-kp-chips]').hidden,
      sizes: [...document.querySelectorAll('[data-kp-sizes] button')].every((x) => x.disabled), full: document.querySelector('[data-fmt-full]').disabled,
      btn: m.querySelector('[data-kp-retry]').className, focus: document.activeElement.matches('[data-kp-retry]')
    };
  });
  ok(b.role === 'alert' && b.icon && b.border === 'rgb(180, 35, 24)' && b.title === 'rgb(180, 35, 24)' && b.dev && b.nav && b.chips && b.sizes && b.full && /btn-primary/.test(b.btn), `error (41e B): danger red, icon and words, no pager, A A A off (${JSON.stringify(b)})`);
  ok(!b.focus, 'a settings change that fails does not take the focus from the settings');
  await page.click('[data-kp-retry]');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.activeElement.matches('[data-kp-retry]')) && await FM.has(page, '[data-kp-msg].is-danger:not([hidden])'), 'Try again that fails again: the focus moves to Try again');
  await page.evaluate(() => { window.kdpEpub.build = window.__kpBuild; });
  await page.click('[data-kp-retry]');
  await ready();
  ok(await page.$eval('[data-kp-msg]', (m) => m.hidden) && !(await page.$eval('[data-kp-dev]', (x) => x.hidden)), 'Try again: the device again');
  ok(await page.evaluate(() => document.activeElement.matches('.kp-frame')), 'Try again that works: the focus goes to the book screen');
  await page.click('.fmt-style:has(input[value="classic"])');
  await FM.saved(page);
  await ready();

  /* 9. 41e C: nothing Final. The built Print words with "Kindle preview" (G6: "Go to 06 Write"). */
  for (const s of st.sections()) s.status = 'draft';
  await FM.open(page);
  await page.click('[data-fmt-mode="kindle"]');
  await page.waitForSelector('[data-kp-msg]:not([hidden])', { timeout: 3000 });
  ok((await FM.txt(page, '[data-kp-msg]')) === 'Nothing to format yet Only Final sections go into the Kindle preview. Mark sections Final in 06 Write. Go to 06 Write', `nothing Final (41e C): ${await FM.txt(page, '[data-kp-msg]')}`);
  const c = await page.evaluate(() => ({
    role: document.querySelector('[data-kp-msg]').getAttribute('role'), danger: document.querySelector('[data-kp-msg]').classList.contains('is-danger'),
    dev: document.querySelector('[data-kp-dev]').hidden, nav: document.querySelector('[data-kp-nav]').hidden, ready: document.querySelector('[data-fmt-ready]').innerHTML.trim(),
    sizes: [...document.querySelectorAll('[data-kp-sizes] button')].every((x) => x.disabled), full: document.querySelector('[data-fmt-full]').disabled,
    frames: document.querySelectorAll('iframe').length, href: document.querySelector('[data-kp-msg] a').getAttribute('href')
  }));
  ok(c.role === 'status' && !c.danger && c.dev && c.nav && c.ready === '' && c.sizes && c.full && c.frames === 0 && /step=6$/.test(c.href), `nothing Final: no device, no Ready box, nothing built (${JSON.stringify(c)})`);
  await page.click('[data-kp-msg] a');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Write', null, { timeout: 5000 });
  ok(/step=6/.test(page.url()), 'Go to 06 Write: opens 06 Write');
  for (const s of st.sections()) s.status = 'final';

  /* 10. 41e D: a trim outside the print list. Kindle works (no engine), Print keeps its message. */
  st.brief.trim_size = '7x10';
  st.cdn = [];
  await FM.open(page);
  await kindle();
  ok(/^Screen 1 of \d+$/.test(await FM.txt(page, '[data-kp-label]')) && st.cdn.length === 0, `7 x 10: the Kindle preview works, no engine download (${st.cdn.length} engine files)`);
  ok(!/7 × 10|trim/i.test(await FM.txt(page, '[data-fmt-ready]')), `7 x 10: the Kindle Ready box says nothing about the trim: ${await FM.txt(page, '[data-fmt-ready]')}`);
  await page.click('[data-fmt-mode="print"]');
  ok((await FM.txt(page, '[data-fmt-state] .fmt-state-title')) === 'No Print PDF for 7 × 10 in', 'Print at 7 x 10: the built trim message');
  st.brief.trim_size = '6x9';

  /* 11. 41e E: the Ready box. Green with the 07 line; then only the true warning lines, in order, with their links. */
  await FM.open(page);
  await kindle();
  ok((await FM.txt(page, '[data-fmt-ready]')) === 'Ready for Kindle. All 17 sections Final. The reader picks the font, so there is no font check. 07 Quality Control has not run yet. Run it', `green (41d): ${await FM.txt(page, '[data-fmt-ready]')}`);
  ok(await page.$eval('[data-fmt-ready] .alert', (x) => x.getAttribute('role') === 'status' && x.classList.contains('fmt-alert-ok')) && await page.$eval('[data-fmt-tocheck]', (t) => t.hidden), 'green: a status, no to-check chip in Kindle mode');
  const keep = { pen: st.book.pen_name, c11: st.chapters[1].sections[1].status, c21: st.chapters[2].sections[0].status, c30: st.chapters[3].sections[0].needs_review, c31: st.chapters[3].sections[1].version.content, c40: st.chapters[4].sections[0].version.content, c50: st.chapters[5].sections[0].version.content };
  st.chapters[1].sections[1].status = 'draft';
  st.chapters[2].sections[0].status = 'reviewed';
  st.chapters[3].sections[0].needs_review = true;
  st.book.pen_name = '';
  st.chapters[3].sections[1].version.content += '\n\nAlso on [Kobo](https://www.kobo.com/us/en/ebook/micro-study) and [our site](https://example.com/micro).';
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await FM.open(page);
  await kindle();
  const lines = await FM.all(page, '[data-fmt-ready] li');
  ok(lines.join('|') === '2 sections are not Final. The EPUB leaves them out. Show them|1 section needs review in 07 Quality Control. See results|No pen name. The EPUB will have no author, and KDP needs it to match your title setup. Add a pen name|Chapter 3 links to another ebook store (kobo.com). KDP may remove links like this. Go to the section', `warning lines (41e E): ${lines.join(' | ')}`);
  ok((await FM.txt(page, '[data-fmt-ready] .fmt-alert-body > strong')) === 'Check before you export the EPUB.' && (await FM.txt(page, '[data-fmt-ready] .kp-warn-foot')) === 'The reader picks the font, so there is no font check.' && await page.$eval('[data-fmt-ready] .alert', (x) => x.classList.contains('alert-warning') && x.getAttribute('role') === 'status' && !!x.querySelector('svg')), 'the warning box: the heading, the font line, icon and words');
  const links = await page.$$eval('[data-fmt-ready] li a', (as) => as.map((x) => ({ t: x.textContent, href: x.getAttribute('href'), go: x.dataset.fmtGo || null })));
  ok(links[0].href.endsWith(`step=6&section=${encodeURIComponent(st.chapters[1].sections[1].id)}`) && links[1].go === '7' && links[2].go === '1' && links[3].href.endsWith(`step=6&section=${encodeURIComponent(st.chapters[3].sections[1].id)}`), `the link targets: ${JSON.stringify(links)}`);
  ok(!(await FM.has(page, '[data-fmt-ready] .fmt-qc-line')), 'the warning box has no 07 line (as 41e E)');
  // External links do nothing: no href, a real click leaves the frame and the screen as they are, no request, no window.
  ok(await page.evaluate(() => { const dd = document.querySelector('.kp-frame').contentDocument; const ex = [...dd.querySelectorAll('a[data-kp-external]')]; return ex.length === 2 && ex.every((x) => !x.hasAttribute('href')) && !dd.querySelector('a[href^="http"], a[href^="mailto"]'); }), 'external links: no href in the frame (2 of them)');
  await goTo(await screenOfSel('a[data-kp-external]'));
  const before = await where();
  const pagesBefore = page.context().pages().length;
  requests.length = 0;
  await clickIn('a[data-kp-external]');
  await page.waitForTimeout(500);
  const after = await where();
  const loc = await page.evaluate(() => document.querySelector('.kp-frame').contentWindow.location.href);
  ok(after.screen === before.screen && loc === 'about:srcdoc' && page.context().pages().length === pagesBefore && !requests.some((u) => /kobo\.com|example\.com/.test(u)), `an external link click does nothing (screen ${after.screen}, ${loc}, ${requests.length} requests)`);
  await page.click('[data-fmt-ready] li a[data-fmt-go="1"]');
  await page.waitForFunction(() => /step=1/.test(location.search), null, { timeout: 5000 });
  ok(/step=1/.test(page.url()), 'Add a pen name: opens 01 Brief');
  // Two sections with store links (a subdomain, Google Play Books); Play apps and a look-alike host are not stores.
  st.chapters[4].sections[0].version.content += '\n\nSee [Play Books](https://play.google.com/store/books/details?id=x).';
  st.chapters[5].sections[0].version.content += '\n\n[Apps](https://play.google.com/store/apps/details?id=y) and [a shop](https://notkobo.com/a).';
  await FM.open(page);
  await kindle();
  const l4 = (await FM.all(page, '[data-fmt-ready] li'))[3];
  ok(l4 === '2 sections link to other ebook stores (kobo.com, play.google.com), first in Chapter 3. KDP may remove links like this. Go to the section', `two store links: ${l4}`);
  st.chapters[1].sections[1].status = keep.c11;
  st.chapters[2].sections[0].status = keep.c21;
  st.chapters[3].sections[0].needs_review = keep.c30;
  st.book.pen_name = keep.pen;
  st.chapters[3].sections[1].version.content = keep.c31;
  st.chapters[4].sections[0].version.content = keep.c40;
  st.chapters[5].sections[0].version.content = keep.c50;

  /* 12. Keyboard: Tab reaches A A A, Full screen and the pager; each shows the 2 px ring, 2 px offset. 44 px targets. */
  await FM.open(page);
  await kindle();
  await page.click('[data-kp-next]');
  await page.focus('[data-fmt-mode="kindle"]');
  const rings = {};
  const ringOf = () => page.evaluate(() => {
    const e = document.activeElement;
    const s = getComputedStyle(e);
    const name = e.dataset.kpSize ? `size-${e.dataset.kpSize}` : e.matches('[data-fmt-full]') ? 'full' : e.matches('[data-kp-prev]') ? 'prev' : e.matches('[data-kp-next]') ? 'next' : e.matches('.kp-frame') ? 'frame' : e.tagName;
    return { name, ring: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineOffset}` };
  });
  const order = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    const r = await ringOf();
    order.push(r.name);
    rings[r.name] = r.ring;
  }
  ok(order.join(',') === 'size-s,size-m,size-l,full,frame', `Tab order after the switch: ${order.join(', ')}`);
  // Inside the frame Tab walks the book's links (the browser's own order); the pager comes after the frame.
  await page.focus('[data-kp-next]');
  await page.keyboard.press('Shift+Tab');
  let r2 = await ringOf();
  rings[r2.name] = r2.ring;
  await page.keyboard.press('Tab');
  r2 = await ringOf();
  rings[r2.name] = r2.ring;
  ok(['size-s', 'size-m', 'size-l', 'full', 'prev', 'next', 'frame'].every((k) => rings[k] === 'solid 2px 2px'), `focus rings, 2 px solid, 2 px offset: ${JSON.stringify(rings)}`);
  const sizes = {};
  for (const s of ['[data-fmt-mode="kindle"]', '[data-kp-size="s"]', '[data-kp-size="m"]', '[data-kp-size="l"]', '[data-fmt-full]', '[data-kp-prev]', '[data-kp-next]']) sizes[s] = await box(s);
  ok(Object.values(sizes).every((x) => x.w >= 44 && x.h >= 44), `44 px targets: ${JSON.stringify(sizes)}`);
  await page.evaluate(() => { window.__kpBuild = window.kdpEpub.build; window.kdpEpub.build = () => { throw new Error('mock'); }; });
  await page.click('.fmt-style:has(input[value="clean"])');
  await page.waitForSelector('[data-kp-retry]', { timeout: 3000 });
  const tr = await box('[data-kp-retry]');
  await page.focus('[data-kp-retry]');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  ok(tr.h >= 44 && tr.w >= 44 && await page.$eval('[data-kp-retry]', (x) => { const s = getComputedStyle(x); return document.activeElement === x && s.outlineStyle === 'solid' && s.outlineWidth === '2px' && s.outlineOffset === '2px'; }), `Try again: ${tr.w} x ${tr.h}, the ring`);
  await page.evaluate(() => { window.kdpEpub.build = window.__kpBuild; });
  await page.click('[data-kp-retry]');
  await ready();
  await page.click('.fmt-style:has(input[value="classic"])');
  await FM.saved(page);
  await ready();

  /* 13. 41e F: Full screen. Modal, dark, focus kept inside; A A A and paging there; Esc (also from inside the frame)
         returns to 08 on the same screen; the focus goes back to Full screen. */
  const start5 = await screenOf('c05');
  await goTo(start5 + 2);
  const atOpen = await where();
  await page.focus('[data-fmt-full]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('dialog.kp-full[open]', { timeout: 3000 });
  await page.waitForFunction((s) => { const x = window.kdpBookSteps[8]._debug().kp.state(); return x.ready && x.screen === s; }, atOpen.screen, { timeout: 3000 });
  const f = await page.evaluate(() => {
    const dl = document.querySelector('dialog.kp-full');
    return {
      modal: dl.matches(':modal'), dev: !!dl.querySelector('[data-kp-dev] .kp-frame'), bg: getComputedStyle(dl).backgroundColor,
      focus: document.activeElement.matches('[data-full-close]') && document.activeElement.textContent.trim() === 'Exit full screen',
      label: dl.querySelector('[data-kp-label]').textContent, sizes: dl.querySelectorAll('[data-kp-size]').length, title: document.getElementById(dl.getAttribute('aria-labelledby')).textContent,
      w: Math.round(dl.querySelector('.kp-scr').getBoundingClientRect().width)
    };
  });
  ok(f.modal && f.dev && f.bg === 'rgb(61, 61, 57)' && f.focus && f.sizes === 3 && f.title === 'Kindle preview' && f.w === 440, `Full screen (41e F): ${JSON.stringify(f)}`);
  ok(f.label === `Screen ${atOpen.screen + 1} of ${atOpen.screens}`, `Full screen keeps the same screen: ${f.label}`);
  ok(await page.$eval('dialog.kp-full [data-full-close]', (x) => { const s = getComputedStyle(x); return s.outlineStyle === 'solid' && s.outlineWidth === '2px' && s.outlineColor === 'rgb(255, 255, 255)'; }), 'the focus ring shows on the dark background (2 px, light)');
  await page.keyboard.press('ArrowRight');
  ok((await where()).screen === atOpen.screen + 1 && (await FM.txt(page, 'dialog.kp-full [data-kp-label]')) === `Screen ${atOpen.screen + 2} of ${atOpen.screens}`, 'ArrowRight in Full screen: the next screen, its label there');
  let inside = true;
  const tabFrom = (await where()).screen;
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    // As the print view (t-full): the dialog, or body for the browser's own step out of a modal dialog; never the page behind.
    inside = inside && await page.evaluate(() => !!document.activeElement.closest('dialog.kp-full') || document.activeElement === document.body);
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+Tab');
    inside = inside && await page.evaluate(() => !!document.activeElement.closest('dialog.kp-full') || document.activeElement === document.body);
  }
  ok(inside, 'Tab and Shift+Tab keep the focus inside Full screen (never the page behind)');
  ok((await where()).screen === tabFrom, 'Tab through the book never moves the reader to another screen');
  await page.click('dialog.kp-full [data-kp-size="l"]');
  w = await where();
  ok(w.size === 'l' && w.part === 'c05' && w.screen === await screenOf('c05') && await page.$eval('.fmt-bar [data-kp-size="l"]', (x) => x.getAttribute('aria-pressed') === 'true'), `Large in Full screen: same part at its start; the bar's A A A follows (${w.screen})`);
  await page.click('dialog.kp-full [data-kp-size="m"]');
  await page.click('dialog.kp-full [data-kp-next]');
  await ready();
  const inFull = await where();
  await page.focus('dialog.kp-full [data-full-close]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.fmt-full'), null, { timeout: 3000 });
  await page.waitForFunction((s) => { const x = window.kdpBookSteps[8]._debug().kp.state(); return x.ready && x.screen === s; }, inFull.screen, { timeout: 3000 }).catch(() => {});
  w = await where();
  ok(w.screen === inFull.screen && (await FM.txt(page, '[data-kp-label]')) === `Screen ${inFull.screen + 1} of ${inFull.screens}` && await page.evaluate(() => !!document.querySelector('[data-kp-wrap] [data-kp-dev] .kp-frame')), `Esc: back in 08 on the same screen (${w.screen + 1})`);
  ok(await page.evaluate(() => document.activeElement.matches('[data-fmt-full]')), 'Esc: the focus is back on Full screen');
  await page.click('[data-fmt-full]');
  await page.waitForSelector('dialog.kp-full[open]', { timeout: 3000 });
  // The moved frame loads again: wait until its document is the book again (the reader stylesheet is there).
  await page.waitForFunction(() => { const f = document.querySelector('dialog.kp-full .kp-frame'); const dd = f && f.contentDocument; return dd && dd.readyState === 'complete' && dd.getElementById('kp-reader'); }, null, { timeout: 3000 });
  await settle();
  await page.focus('dialog.kp-full .kp-frame');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.fmt-full'), null, { timeout: 3000 }).catch(() => {});
  ok(!(await FM.has(page, 'dialog.fmt-full')), 'Esc with the focus inside the frame also ends Full screen');

  /* 14. Resize 1440 -> 900 (addition 2): the smaller screen, the count again, the same part at its start; no sideways scroll. */
  await ready();
  const start3b = await screenOf('c03');
  await goTo(start3b + 3);
  const wide = await where();
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForFunction((n) => { const x = window.kdpBookSteps[8]._debug().kp.state(); return x.screens !== n; }, wide.screens, { timeout: 3000 });
  await settle();
  w = await where();
  const scr = await box('.kp-scr');
  ok(scr.w === 380 && scr.h === 540, `900: the 41d screen, 380 x 540 (${scr.w} x ${scr.h})`);
  ok(w.screens > wide.screens && w.part === 'c03' && w.screen === await screenOf('c03'), `900: ${wide.screens} -> ${w.screens} screens, still Chapter 2 at its start (${w.screen})`);
  ok(await FM.noScroll(page), '900: no sideways scroll');
  ok(await page.evaluate(() => { const bar = document.querySelector('.fmt-bar').getBoundingClientRect(); return [...document.querySelectorAll('.fmt-bar button:not([hidden]), .fmt-bar .kp-chip')].filter((x) => x.offsetParent).every((x) => { const r = x.getBoundingClientRect(); return r.left >= bar.left - 0.5 && r.right <= bar.right + 0.5; }); }), '900: the bar wraps inside the column');
  await page.click('[data-fmt-full]');
  await page.waitForSelector('dialog.kp-full[open]', { timeout: 3000 });
  await settle();
  ok(await page.evaluate(() => { const dl = document.querySelector('dialog.kp-full'); const r = dl.getBoundingClientRect(); return r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && dl.scrollWidth <= dl.clientWidth; }), '900: Full screen fits the window');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.fmt-full'), null, { timeout: 3000 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction((n) => window.kdpBookSteps[8]._debug().kp.state().screens === n, wide.screens, { timeout: 3000 });
  await settle();
  w = await where();
  ok(w.part === 'c03' && w.screen === await screenOf('c03'), 'back to 1440: the same part at its start');

  /* 15. The 200-chapter golden book (addition 3): build time, first screen, one page turn, screens at each size. */
  await page.addScriptTag({ url: '/tests/fixtures/epub-books.js' });
  const long = await page.evaluate(() => window.kdpEpubBooks.longBook().chapters);
  const saved = st.chapters.splice(0, st.chapters.length, ...long.map((ch) => ({ needs_review: false, objective: null, ...ch, sections: ch.sections.map((s) => ({ needs_review: false, ai: 'none', unsaved: false, run: null, word_target: 300, ...s })) })));
  st.format.contents_sections = true;
  await FM.open(page);
  const t0 = Date.now();
  await page.click('[data-fmt-mode="kindle"]');
  await ready(60000);
  const wall = Date.now() - t0;
  const L = await dbg();
  const turn = await page.evaluate(async () => {
    const k = window.kdpBookSteps[8]._debug().kp;
    const t = performance.now();
    k.go(1);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t;
  });
  const counts = {};
  const sizeMs = {};
  for (const s of ['s', 'm', 'l']) {
    const t = Date.now();
    await page.click(`[data-kp-size="${s}"]`);
    sizeMs[s] = Date.now() - t;
    counts[s] = (await where()).screens;
  }
  const lastPart = await page.evaluate(() => { const k = window.kdpBookSteps[8]._debug().kp; return k.screenOf('c200'); });
  ok(L.state === 'ready' && counts.s < counts.m && counts.m < counts.l && lastPart > 0, `the long book shows (${L.kp.screens} screens at Medium)`);
  note(`long-200 golden book, 1440, Medium: build ${L.ms.build.toFixed(1)} ms, first screen ${Math.round(L.ms.first)} ms (click to ready ${wall} ms), one page turn ${turn.toFixed(1)} ms; screens Small ${counts.s}, Medium ${counts.m}, Large ${counts.l}; A A A change (click to count) s ${sizeMs.s} ms, m ${sizeMs.m} ms, l ${sizeMs.l} ms`);
  await page.click('[data-kp-size="m"]');
  st.chapters.splice(0, st.chapters.length, ...saved);
  st.format.contents_sections = false;

  ok((await sandboxes()).every((s) => s === 'allow-same-origin'), 'every frame made in this test: exactly "allow-same-origin"');
  if (st.calls.some((x) => String(x).startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((x) => String(x).startsWith('ERR')).join(' | '));
  return log.join('\n');
};
