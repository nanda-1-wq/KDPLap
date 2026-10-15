// Step 06 Write (E10.3): the Improve menu, every browser case of plan §10,
// and (G3) a lost connection (P8) and a passage the server did not find (P9).
// The page's fetch answers section_improve with a reply this test sends
// (mock.js, window.__imp.reply); apply_suggestion runs the checks of 0021 in
// the mock. Screenshots at 1440 and 900 px go to tests/browser/shots/write/.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const modes = globalThis.__modes;
  const g = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, ms = 5000) => page.waitForFunction(fn, arg, { timeout: ms });
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const has = (sel) => page.$(sel).then((e) => !!e);
  const writes = (fn) => st.writes.filter((w) => w.fn === fn);
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForSelector('.wr-ver, .wr-panel .wr-soon', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
  };
  /** Selects from the n-th character of `a` to the m-th character of `b` (text in the editor, first match). */
  const select = (a, n, b, m) => g(([a, n, b, m]) => {
    const ed = document.querySelector('[data-editor]');
    const find = (s) => {
      const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) { const i = t.nodeValue.indexOf(s); if (i >= 0) return [t, i]; }
      throw new Error(`not in the editor: ${s}`);
    };
    const [ta, ia] = find(a), [tb, ib] = find(b);
    ed.focus();
    const r = document.createRange();
    r.setStart(ta, ia + n);
    r.setEnd(tb, ib + m);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }, [a, n, b, m]);
  const selected = () => g(() => getSelection().toString().replace(/\s+/g, ' ').trim());
  const imps = () => g(() => window.__imp.requests.map((r) => r.body));
  const reply = (status, body) => g(([s, b]) => window.__imp.reply(s, b), [status, body]);
  let sgn = 0;
  /** A suggestion: saved in the mock's table (for apply_suggestion), then sent as the reply. */
  const suggest = async (extra = {}) => {
    const req = (await imps()).slice(-1)[0];
    const id = `5a000000-0000-4000-8000-${String(++sgn).padStart(12, '0')}`;
    const output = extra.text;
    st.suggestions[id] = { id, section_id: req.sectionId, action: req.action, selection: req.selection, output, base_version_id: req.baseVersionId, used_at: null, created_at: new Date().toISOString() };
    await reply(200, { stage: 'section_improve', suggestionId: id, action: req.action, text: output, words: { before: st.count(req.selection), after: st.count(output) },
      flagged: extra.flagged || 0, notes: { markersLost: 0, newNames: [], structureChanged: null, ...(extra.notes || {}) } });
    return { id, req };
  };
  const card = () => page.$eval('[data-imp-card]', (c) => c.dataset.impCard).catch(() => '');
  const waitCard = (k) => until((k) => (document.querySelector('[data-imp-card]') || {}).dataset?.impCard === k, k);
  const openMenu = async (via = '[data-imp-float]') => {
    await page.waitForSelector(via, { timeout: 3000 });
    await page.click(via);
    await page.waitForSelector('[data-imp-menu]', { timeout: 3000 });
  };
  const shots = async (name) => {
    await page.screenshot({ path: `${SHOTS}/t-improve-${name}-1440.png` });
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/t-improve-${name}-900.png` });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(250);
  };
  await page.setViewportSize({ width: 1440, height: 960 });

  // 1. No selection: the toolbar button is off with the hint; no floating button.
  await open(W1, st.s42);
  const none = await g(() => {
    const b = document.querySelector('[data-imp-open]');
    const h = document.querySelector('[data-imp-hint]');
    return { off: b.disabled, desc: b.getAttribute('aria-describedby'), hint: h.hidden ? '' : h.innerText.trim(), float: !!document.querySelector('[data-imp-float]'), h: b.getBoundingClientRect().height };
  });
  ok(none.off && none.desc === 'wrImpHint' && none.hint === 'Select text to improve it.' && !none.float, `no selection: ${JSON.stringify(none)}`);
  ok(none.h >= 44, 'toolbar Improve is at least 44 px');

  // 2. A selection mid-word to mid-sentence: the floating button (44 px, covers no words), the toolbar button on.
  await select('lift your shoulders', 7, 'Do this', 4);
  await page.waitForSelector('[data-imp-float]:not([hidden])', { timeout: 3000 });
  const fl = await g(() => {
    const f = document.querySelector('[data-imp-float]').getBoundingClientRect();
    const ed = document.querySelector('[data-editor]');
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let covers = 0;
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const r = document.createRange(); r.selectNodeContents(t);
      for (const x of r.getClientRects()) if (x.right > f.left && x.left < f.right && x.bottom > f.top && x.top < f.bottom) covers++;
    }
    const sel = getSelection().getRangeAt(0).getClientRects();
    const end = sel[sel.length - 1];
    return { h: f.height, covers, below: f.top >= end.bottom, on: !document.querySelector('[data-imp-open]').disabled, hint: document.querySelector('[data-imp-hint]').hidden };
  });
  ok(fl.h >= 44 && fl.covers === 0 && fl.below, `floating button below the selection, covers no text: ${JSON.stringify(fl)}`);
  ok(fl.on && fl.hint, 'toolbar Improve is on, no hint');
  /** The selection fully inside the editor's visible box; the button too, over no words and not on the hint under the editor. */
  const fits = () => g(() => {
    const ed = document.querySelector('[data-editor]');
    const r0 = ed.getBoundingClientRect();
    const main = document.querySelector('.wr-main').getBoundingClientRect();
    const box = { top: Math.max(r0.top, main.top, 0), bottom: Math.min(r0.bottom, main.bottom, innerHeight) };
    const f = document.querySelector('[data-imp-float]');
    const fr = f && !f.hidden ? f.getBoundingClientRect() : null;
    const sel = getSelection().getRangeAt(0).getBoundingClientRect();
    const hint = document.querySelector('[data-hint]');
    const hr = hint && !hint.hidden ? hint.getBoundingClientRect() : null;
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let covers = 0;
    if (fr) for (let t = w.nextNode(); t; t = w.nextNode()) {
      const r = document.createRange(); r.selectNodeContents(t);
      for (const x of r.getClientRects()) if (x.right > fr.left && x.left < fr.right && x.bottom > fr.top && x.top < fr.bottom) covers++;
    }
    return {
      selIn: sel.top >= box.top - 0.5 && sel.bottom <= box.bottom + 0.5,
      floatIn: !!fr && fr.top >= box.top - 0.5 && fr.bottom <= box.bottom + 0.5,
      covers,
      onHint: !!fr && !!hr && fr.bottom > hr.top && fr.top < hr.bottom
    };
  });
  const fit1440 = await fits();
  ok(fit1440.selIn && fit1440.floatIn && !fit1440.covers && !fit1440.onHint, `1440: selection and button inside the editor: ${JSON.stringify(fit1440)}`);
  await page.screenshot({ path: `${SHOTS}/t-improve-trigger-1440.png` });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(300);
  const fit900 = await fits();
  ok(fit900.selIn && fit900.floatIn && !fit900.covers && !fit900.onHint, `900: selection and button inside the editor, not on the hint: ${JSON.stringify(fit900)}`);
  await page.screenshot({ path: `${SHOTS}/t-improve-trigger-900.png` });
  // A new selection at 900 px near the editor's bottom edge: scrolled into view.
  await g(() => { const ed = document.querySelector('[data-editor]'); ed.scrollTop = 0; });
  await select('Keep both feet', 0, 'Keep both feet', 9);
  await page.waitForTimeout(300);
  const fitLow = await fits();
  ok(fitLow.selIn && fitLow.floatIn && !fitLow.covers && !fitLow.onHint, `900, a selection at the bottom edge is scrolled into view: ${JSON.stringify(fitLow)}`);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(250);
  await select('lift your shoulders', 7, 'Do this', 4);
  await page.waitForSelector('[data-imp-float]:not([hidden])', { timeout: 3000 });

  // 3. The menu: snapped to whole sentences, the header, 7 items, Create image off with "v2", 44 px, keyboard, Esc.
  await openMenu();
  ok((await selected()) === 'Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this five times.', `snapped: "${await selected()}"`);
  ok((await txt('.wr-imp-head')) === '2 sentences · 22 words', `menu header: "${await txt('.wr-imp-head')}"`);
  const items = await page.$$eval('[data-imp-menu] [role="menuitem"]', (bs) => bs.map((b) => ({ t: b.querySelector('.wr-imp-mi-t').innerText, s: b.querySelector('.wr-imp-mi-s').innerText, off: b.getAttribute('aria-disabled') === 'true', h: b.getBoundingClientRect().height, pill: (b.querySelector('.wr-imp-pill') || {}).innerText || '' })));
  ok(items.length === 7 && items.map((i) => i.t).join('|') === 'Edit and format|Improve|Expand|Shorten|Humanize|Custom instruction|Create image', `items: ${items.map((i) => i.t).join('|')}`);
  ok(items[4].s === 'Natural reading in your voice', `Humanize subtitle: ${items[4].s}`);
  ok(items[6].off && items[6].pill === 'v2' && items.slice(0, 6).every((i) => !i.off), 'only Create image is off, with "v2"');
  ok(items.every((i) => i.h >= 44), `every item 44 px: ${items.map((i) => Math.round(i.h)).join(',')}`);
  ok(await g(() => document.activeElement.dataset.impAct === 'edit_format'), 'focus on the first item');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  ok(await g(() => document.activeElement.dataset.impAct === 'expand'), 'ArrowDown moves through the items');
  await page.keyboard.press('ArrowUp');
  ok(await g(() => document.activeElement.dataset.impAct === 'improve'), 'ArrowUp moves back');
  await shots('menu');
  // At 900 px (shots() resized and back): the menu stays by the button, inside the window.
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(300);
  const m900 = await g(() => {
    const m = document.querySelector('[data-imp-menu]').getBoundingClientRect();
    const f = document.querySelector('[data-imp-float]');
    const a = (f && !f.hidden ? f : document.querySelector('[data-imp-open]')).getBoundingClientRect();
    return { near: Math.abs(m.top - a.bottom) < 12 || Math.abs(m.bottom - a.top) < 12, inside: m.top >= 0 && m.bottom <= innerHeight && m.left >= 0 && m.right <= innerWidth };
  });
  ok(m900.near && m900.inside, `900: the menu by its button, inside the window: ${JSON.stringify(m900)}`);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  ok(!(await has('[data-imp-menu]')) && await g(() => document.activeElement === document.querySelector('[data-editor]')) && (await selected()).startsWith('Now lift'), 'Esc closes the menu; focus back in the editor with the selection');
  // The toolbar button opens the same menu (keyboard users), and Enter picks an item.
  await page.click('[data-imp-open]');
  await page.waitForSelector('[data-imp-menu]');
  ok(await g(() => document.querySelector('[data-imp-open]').getAttribute('aria-expanded') === 'true'), 'toolbar button: aria-expanded');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await until(() => window.__imp.requests.length === 1);

  // 4. Loading: the request, the card, Generate off, Improve off, the highlight, the editor stays editable.
  const r1 = (await imps())[0];
  const cur42 = st.sectionOf(st.s42).s.current_version_id;
  ok(r1.stage === 'section_improve' && r1.bookId === W1 && r1.sectionId === st.s42 && r1.baseVersionId === cur42 && r1.action === 'improve' && !('instruction' in r1), `request: ${JSON.stringify({ ...r1, before: undefined, after: undefined, selection: undefined })}`);
  ok(r1.selection === 'Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**.', `selection: ${r1.selection}`);
  ok(r1.before === '## Shoulder rolls, both ways\n\nShoulder rolls ease the stiffness that builds up after long hours of sitting. Studies show shoulder rolls cut neck pain by 40%.', `before: ${JSON.stringify(r1.before)}`);
  ok(r1.after === 'Keep your neck long and your *chin* level. If anything pinches, make the circle smaller.\n\n- Sit near the front of your chair\n- Keep both feet flat on the floor', `after: ${JSON.stringify(r1.after)}`);
  ok(Object.keys(r1).join(',') === 'stage,bookId,sectionId,baseVersionId,action,selection,before,after', `keys: ${Object.keys(r1)}`);
  await waitCard('loading');
  ok((await txt('#wrImpTitle')) === 'Improving 2 sentences…' && (await txt('[data-imp] .chip-label')) === 'IMPROVE · 4.2', `loading card: ${await txt('[data-imp]')}`);
  ok(/You can keep writing\. If you change these sentences, the result cannot be used\./.test(await txt('[data-imp]')), 'loading note');
  ok(await g(() => document.activeElement && document.activeElement.hasAttribute('data-imp-cancel')), 'focus on Cancel');
  const gates = await g(() => ({
    gen: document.querySelector('[data-generate]').disabled,
    genWhy: (document.getElementById(document.querySelector('[data-generate]').getAttribute('aria-describedby')) || {}).innerText,
    imp: document.querySelector('[data-imp-open]').disabled,
    hint: document.querySelector('[data-imp-hint]').innerText.trim(),
    editable: document.querySelector('[data-editor]').getAttribute('contenteditable'),
    hl: !!(window.CSS && CSS.highlights && CSS.highlights.has('kdp-improve'))
  }));
  ok(gates.gen && gates.genWhy === 'Wait for Improve to finish.', `Generate off while loading: ${JSON.stringify(gates)}`);
  ok(gates.imp && gates.hint === 'Accept or reject the suggestion first.', `Improve off while loading: ${gates.hint}`);
  ok(gates.editable === 'true' && gates.hl, 'the editor stays editable; the passage is highlighted');
  await shots('loading');

  // 5. Cancel: the request is aborted; "Stopped"; nothing written.
  const w0 = st.writes.length;
  await page.click('[data-imp-cancel]');
  await waitCard('stopped');
  ok((await g(() => window.__imp.aborted)) === 1, 'Cancel aborts the request');
  ok(/Your text did not change\. The tokens already used count toward your usage\./.test(await txt('[data-imp]')), `stopped: ${await txt('[data-imp]')}`);
  ok(st.writes.length === w0, 'Cancel writes nothing');
  ok(!(await page.$eval('[data-generate]', (b) => b.disabled)), 'Generate is on again after Cancel');
  await shots('stopped');
  await page.click('[data-imp-close]');
  ok((await card()) === '', 'Close removes the card');

  // 6. Error with retry: the same body is sent again; refusals and limits.
  await select('Now lift', 0, 'five times', 3);
  await openMenu();
  await page.click('[data-imp-act="shorten"]');
  await until(() => window.__imp.requests.length === 2);
  await reply(502, { error: 'ai_unavailable' });
  await waitCard('error');
  ok((await txt('#wrImpTitle')) === 'Improve stopped' && /The AI service did not respond\. Your text is safe\. This attempt was not counted in your usage\./.test(await txt('[data-imp] .alert')), `error: ${await txt('[data-imp] .alert')}`);
  ok(await has('[data-imp] .alert-error svg'), 'the error has an icon');
  await shots('error');
  await page.click('[data-imp-retry]');
  await until(() => window.__imp.requests.length === 3);
  const [, r2, r3] = await imps();
  ok(JSON.stringify(r2) === JSON.stringify(r3) && r2.action === 'shorten', 'Try again sends the same body');
  await reply(429, { error: 'rate_limited' });
  await waitCard('error');
  ok(/Too many requests\. Wait a minute, then try again\./.test(await txt('[data-imp]')) && await has('[data-imp-retry]'), 'rate limit: the message and Try again');
  await page.click('[data-imp-retry]');
  await until(() => window.__imp.requests.length === 4);
  await reply(429, { error: 'monthly_limit' });
  await waitCard('error');
  ok(/You have used this month’s AI allowance\./.test(await txt('[data-imp]')) && !(await has('[data-imp-retry]')), 'monthly limit: no Try again');
  await page.click('[data-imp-close]');
  await select('Now lift', 0, 'five times', 3);
  await openMenu();
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 5);
  await reply(422, { error: 'selection_too_long', words: 1600 });
  await waitCard('error');
  ok(/Select up to 1,500 words\. You selected 1,600\./.test(await txt('[data-imp]')), `server limit: ${await txt('[data-imp] .alert')}`);
  await page.click('[data-imp-close]');

  // 7. The suggestion: word diff, the 4 notes, Accept / Try again / Reject. Generate is off while it is open.
  await select('Studies show', 3, 'by 40%', 2);
  await openMenu();
  ok((await selected()) === 'Studies show shoulder rolls cut neck pain by 40%.', `one sentence: "${await selected()}"`);
  await page.keyboard.press('Escape');
  await select('Now lift', 0, 'chin', 2);
  await openMenu();
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 6);
  const OUT = 'Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**, then rest. Most people feel looser within a week. [Verify: no source] Keep your neck long and your *chin* level. Ruth likes to pair this with slow breathing.';
  // Consistent with the server: the passage has no source marks, so none can be lost.
  const s1 = await suggest({ text: OUT, flagged: 1, notes: { markersLost: 0, newNames: ['Ruth'], structureChanged: { headings: false, paragraphs: null, listItems: { before: 3, after: 2 } } } });
  ok(s1.req.selection === 'Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**. Keep your neck long and your *chin* level.', `3 sentences: ${s1.req.selection}`);
  await waitCard('review');
  // Words as md_word_count counts them (the source flag is not words).
  ok((await txt('#wrImpTitle')) === 'Improved: 30 → 47 words', `title: "${await txt('#wrImpTitle')}"`);
  const diff = await g(() => ({ del: [...document.querySelectorAll('[data-imp-diff] del')].map((d) => d.innerText.trim()), ins: [...document.querySelectorAll('[data-imp-diff] ins')].map((d) => d.innerText.trim()), pill: !!document.querySelector('[data-imp-diff] .wr-imp-flag svg') }));
  ok(diff.ins.some((t) => /then rest\./.test(t)) && diff.ins.some((t) => /Ruth likes/.test(t)) && diff.pill, `diff: ${JSON.stringify(diff)}`);
  ok(/Removed/.test(await txt('[data-imp] .wr-cmp-legend')) && /Added/.test(await txt('[data-imp] .wr-cmp-legend')), 'legend: Removed and Added');
  const notes = await page.$$eval('[data-imp] .wr-imp-n', (ns) => ns.map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
  ok(notes.join(' | ') === 'Source: 1 claim needs a source. | Names: New names: Ruth. Check them. | Structure: The structure changed: 3 list items became 2.', `notes (no Marks note when nothing was lost): ${notes.join(' | ')}`);
  ok(await page.$$eval('[data-imp] .wr-imp-n svg', (s) => s.length === 3), 'every note has an icon');
  ok((await txt('[data-imp-accept]')) === 'Accept' && (await txt('[data-imp-again]')) === 'Try again' && (await txt('[data-imp-reject]')) === 'Reject', 'Accept, Try again, Reject');
  ok(/Accept saves a new version\. You can restore the old one in Versions\./.test(await txt('[data-imp]')), 'help line');
  ok(await page.$eval('[data-generate]', (b) => b.disabled) && (await txt('#wrImpGenWhy')) === 'Accept or reject the suggestion first.', 'Generate is off while a suggestion is open');
  const btnH = await page.$$eval('[data-imp] button', (bs) => bs.map((b) => b.getBoundingClientRect().height));
  ok(btnH.every((h) => h >= 44), `card buttons 44 px: ${btnH.map(Math.round)}`);

  // 8. Reject: nothing written; the passage is selected again.
  const w1 = st.writes.length;
  await page.click('[data-imp-reject]');
  ok((await card()) === '' && st.writes.length === w1, 'Reject writes nothing');
  ok((await selected()).startsWith('Now lift') && (await selected()).endsWith('chin level.'), `Reject selects the passage: "${await selected()}"`);
  ok(st.suggestions[s1.id].used_at === null, 'the suggestion stays unused');

  // 9. Accept (clean): only apply_suggestion, the right base and full text; the editor; Versions "Improved"; Ctrl+Z.
  await openMenu();
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 7);
  const s2 = await suggest({ text: OUT });
  await waitCard('review');
  const before9 = st.writes.length;
  await page.click('[data-imp-accept]');
  await until(() => !document.querySelector('[data-imp-card]'));
  const w9 = st.writes.slice(before9);
  const V3 = st.versions.find((v) => v.id === cur42).content;
  const FULL = V3.replace(s2.req.selection, OUT);
  ok(w9.length === 1 && w9[0].fn === 'apply_suggestion', `only apply_suggestion: ${w9.map((w) => w.fn || w.table)}`);
  ok(w9[0].body.p_suggestion_id === s2.id && w9[0].body.p_base_version_id === cur42 && w9[0].body.p_full_text === FULL, 'apply: the suggestion, the current base, the full text');
  const v4 = st.versions.find((v) => v.id === st.sectionOf(st.s42).s.current_version_id);
  ok(v4.version_no === 4 && v4.source === 'improve' && v4.content === FULL, `v4: ${v4.version_no} ${v4.source}`);
  ok(await g((full) => kdpMarkdown.fromDom(document.querySelector('[data-editor]')) === full, FULL), 'the editor holds the new text');
  await page.waitForSelector('.wr-ver.is-current', { timeout: 3000 });
  await until(() => /^v4 · Improved/.test(document.querySelector('.wr-ver.is-current').innerText));
  ok(/^v4 · Improved Current/.test(await txt('.wr-ver.is-current')), `Versions: ${await txt('.wr-ver.is-current')}`);
  ok(/^Saved as v4 · /.test(await txt('[data-foot-text]')) && /Saved as version 4 · Improved\./.test(await txt('[data-live]')), `foot and message: ${await txt('[data-foot-text]')} / ${await txt('[data-live]')}`);
  ok(st.suggestions[s2.id].used_at !== null, 'the suggestion is used');
  ok(!(await page.$eval('[data-generate]', (b) => b.disabled)), 'Generate is on again');
  await shots('accepted');
  // Ctrl+Z: the old text, as unsaved typing (a draft from the new version).
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(1300);
  const undo = await g(() => kdpMarkdown.fromDom(document.querySelector('[data-editor]')));
  ok(undo === V3, `Ctrl+Z gives the old text back: ${JSON.stringify(undo)} vs ${JSON.stringify(V3)}`);
  const d42 = st.drafts[st.s42];
  ok(d42 && d42.content === V3 && d42.base_version_id === v4.id, `a draft from v4: ${JSON.stringify(d42 && { base: d42.base_version_id === v4.id, same: d42.content === V3 })}`);
  ok(/Unsaved changes since v4/.test(await txt('[data-foot-text]')), 'foot: unsaved changes since v4');
  await page.click('[data-save-version]');
  await until(() => /Saved as v5/.test(document.querySelector('[data-foot-text]').innerText));

  // 10. Accept with unsaved edits: save_version first, then apply with its id; no draft between them.
  await select('Sit near', 0, 'Sit near', 3);
  await page.keyboard.press('End');
  await page.keyboard.type(' today');
  await page.waitForTimeout(100);
  await select('Shoulder rolls ease', 3, 'Shoulder rolls ease', 9);
  await openMenu();
  await page.click('[data-imp-act="humanize"]');
  await until(() => window.__imp.requests.length === 8);
  const OUT10 = 'Shoulder rolls ease the stiffness of long sitting.';
  const s3 = await suggest({ text: OUT10 });
  await waitCard('review');
  modes.versionDelay = 300;
  const before10 = st.writes.length;
  await page.click('[data-imp-accept]');
  await page.waitForSelector('[data-imp-card="applying"]', { timeout: 2000 }).catch(() => {});
  const applying = await g(() => ({ ro: document.querySelector('[data-editor]').getAttribute('contenteditable'), acc: (document.querySelector('[data-imp-accept]') || {}).disabled, saving: /Saving…/.test((document.querySelector('[data-imp]') || {}).innerText || '') }));
  ok(applying.ro === 'false' && applying.acc && applying.saving, `applying: read only, Accept off, "Saving…": ${JSON.stringify(applying)}`);
  await page.screenshot({ path: `${SHOTS}/t-improve-applying-1440.png` });
  await until(() => !document.querySelector('[data-imp-card]'));
  modes.versionDelay = 0;
  const w10 = st.writes.slice(before10).filter((w) => w.fn || w.table === 'section_drafts');
  const sv10 = w10.findIndex((w) => w.fn === 'save_version'), ap10 = w10.findIndex((w) => w.fn === 'apply_suggestion');
  ok(sv10 >= 0 && ap10 > sv10, `order: ${w10.map((w) => w.fn || w.table).join(' → ')}`);
  ok(!w10.slice(sv10 + 1, ap10).some((w) => w.table === 'section_drafts'), 'no draft write between save_version and apply_suggestion (autosave paused)');
  const man = st.versions.filter((v) => v.section_id === st.s42 && v.source === 'manual').slice(-1)[0];
  ok(w10[ap10].body.p_base_version_id === man.id && /today/.test(man.content), 'apply uses the new manual version as its base');
  ok(st.versions.find((v) => v.id === st.sectionOf(st.s42).s.current_version_id).source === 'humanize', 'the current version is Humanized');
  ok(!st.drafts[st.s42], 'no draft left');

  // 11. Text changed: typing inside the passage while loading; no RPC; Copy suggestion.
  await select('Keep your neck', 0, 'Keep your neck', 4);
  await openMenu();
  await page.click('[data-imp-act="edit_format"]');
  await until(() => window.__imp.requests.length === 9);
  const r11 = (await imps())[8];
  await select('Keep your neck', 5, 'Keep your neck', 9);
  await page.keyboard.type('throat');
  await page.waitForTimeout(100);
  const before11 = st.writes.filter((w) => w.fn).length;
  await suggest({ text: r11.selection.replace('neck long', 'neck tall') });
  await waitCard('changed');
  ok((await txt('#wrImpTitle')) === 'The text changed' && /Check this: the selected text changed while the AI was working, so the suggestion was not used\./.test(await txt('[data-imp] .alert')), 'text changed card');
  ok(await has('[data-imp-copy]') && !(await has('[data-imp-accept]')), 'Copy suggestion, no Accept');
  ok(st.writes.filter((w) => w.fn).length === before11, 'no RPC');
  await shots('changed');
  await page.click('[data-imp-close]');
  await page.click('[data-save-version]');
  await until(() => !document.querySelector('[data-save-version]') || document.querySelector('[data-save-version]').disabled);

  // 12. Moved but unique: typing before the passage while loading; applied in the new place.
  await select('Shoulder rolls ease', 0, 'Shoulder rolls ease', 4);
  await openMenu();
  await page.click('[data-imp-act="expand"]');
  await until(() => window.__imp.requests.length === 10);
  const r12 = (await imps())[9];
  await select('Shoulder rolls, both', 0, 'Shoulder rolls, both', 0);
  await page.keyboard.type('Easy ');
  await page.waitForTimeout(100);
  const OUT12 = `${r12.selection} It also helps you sleep.`;
  const s12 = await suggest({ text: OUT12 });
  await waitCard('review');
  await page.click('[data-imp-accept]');
  await until(() => !document.querySelector('[data-imp-card]'));
  const cur12 = st.versions.find((v) => v.id === st.sectionOf(st.s42).s.current_version_id);
  ok(cur12.source === 'expand' && cur12.content.startsWith('## Easy Shoulder rolls') && cur12.content.includes(OUT12), `moved: applied in the new place (${cur12.source})`);
  ok(st.suggestions[s12.id].used_at !== null, 'the moved suggestion is used');

  // 13. Conflict at Accept: another tab saved; the conflict card; the suggestion stays; Accept after the choice.
  await select('Shoulder rolls ease', 0, 'Shoulder rolls ease', 4);
  await openMenu();
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 11);
  const r13 = (await imps())[10];
  const OUT13 = r13.selection.replace('stiffness', 'tightness');
  const s13 = await suggest({ text: OUT13 });
  await waitCard('review');
  await select('Sit near', 0, 'Sit near', 3);
  await page.keyboard.press('End');
  await page.keyboard.type(' now');
  await page.waitForTimeout(1000);
  const other = st.versions.find((v) => v.id === st.sectionOf(st.s42).s.current_version_id).content + '\n\nSaved in the other tab.';
  st.addVersion(st.s42, other, 'manual');
  await page.click('[data-imp-accept]');
  await page.waitForSelector('[data-use-draft]', { timeout: 5000 });
  ok((await card()) === 'review', 'the suggestion stays open behind the conflict card');
  ok(await page.$eval('[data-imp-accept]', (b) => b.disabled) && (await txt('[data-imp-hint]')) === 'Choose which text to keep first.', 'Accept and Improve wait for the choice');
  ok(!writes('apply_suggestion').some((w) => w.body.p_suggestion_id === s13.id), 'no apply before the choice');
  await shots('conflict');
  await page.click('[data-use-draft]');
  await until(() => !document.querySelector('[data-use-draft]'));
  await page.waitForTimeout(300);
  ok((await card()) === 'review' && !(await page.$eval('[data-imp-accept]', (b) => b.disabled)), 'after the choice, Accept is on');
  await page.click('[data-imp-accept]');
  await until(() => !document.querySelector('[data-imp-card]'));
  const cur13 = st.versions.find((v) => v.id === st.sectionOf(st.s42).s.current_version_id);
  ok(cur13.source === 'improve' && cur13.content.includes('tightness') && cur13.content.includes(' now'), 'Accept after the conflict: applied on the chosen text');

  // 14. Leave with an open suggestion: the confirm; Stay keeps it; Leave writes nothing.
  await select('Shoulder rolls ease', 0, 'Shoulder rolls ease', 4);
  await openMenu();
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 12);
  await suggest({ text: 'Shoulder rolls ease tight shoulders.' });
  await waitCard('review');
  await page.click(`[data-section="${st.s43}"]`);
  await page.waitForSelector('dialog[open]', { timeout: 3000 });
  ok((await txt('#wrAskTitle')) === 'Leave without the suggestion?' && /You have a suggestion you have not applied\. Leave anyway\? Your text stays as it is\./.test(await txt('dialog[open]')), 'leave confirm');
  ok((await txt('dialog[open] [data-ask-no]')) === 'Stay' && (await txt('dialog[open] [data-ask-yes]')) === 'Leave', 'Stay and Leave');
  await shots('leave');
  await page.click('dialog[open] [data-ask-no]');
  ok((await card()) === 'review' && /4\.2/.test(await txt('#wrSecTitle')), 'Stay keeps the suggestion');
  const w14 = st.writes.filter((w) => w.fn === 'apply_suggestion').length;
  await page.click(`[data-section="${st.s43}"]`);
  await page.waitForSelector('dialog[open]');
  await page.click('dialog[open] [data-ask-yes]');
  await until(() => /4\.3/.test(document.querySelector('#wrSecTitle')?.innerText || ''));
  ok((await card()) === '' && st.writes.filter((w) => w.fn === 'apply_suggestion').length === w14, 'Leave: another section, nothing applied');

  // 15. Snapping: a source marker joins its sentence; a list marker joins; too short; Custom box.
  const MARKED = 'Hold your arms out to the sides. Studies show arm circles cut shoulder pain by 30%. [Verify: no source] Over 300 readers tried it. [Verify: no source] Rest now.\n\n- Circle forward ten times\n- Circle back ten times';
  st.addVersion(st.s43, MARKED, 'manual');
  await open(W1, st.s43);
  await select('arm circles cut', 2, 'arm circles cut', 6);
  await openMenu();
  ok((await txt('.wr-imp-head')) === '1 sentence · 9 words', `marker sentence: ${await txt('.wr-imp-head')}`);
  ok(/Studies show arm circles cut shoulder pain by 30%\. ?Verify: no source$/.test(await selected()), `the marker joins the passage: "${await selected()}"`);
  await page.click('[data-imp-act="shorten"]');
  await until(() => window.__imp.requests.length === 1);   // a new page: the count starts again
  ok((await imps())[0].selection === 'Studies show arm circles cut shoulder pain by 30%. [Verify: no source]', `sent with the marker: ${(await imps())[0].selection}`);
  await page.click('[data-imp-cancel]');
  await page.click('[data-imp-close]');
  // All four notes, consistent with the server: 2 marks in the passage, 1 kept (markersLost 1, flagged 1).
  await select('Studies show', 2, 'Over 300', 3);
  await openMenu();
  await page.click('[data-imp-act="humanize"]');
  await until(() => window.__imp.requests.length === 2);
  const r4 = (await imps())[1];
  ok(r4.selection === 'Studies show arm circles cut shoulder pain by 30%. [Verify: no source] Over 300 readers tried it. [Verify: no source]', `two marked sentences: ${r4.selection}`);
  await suggest({ text: 'Arm circles can ease stiff shoulders.\n\nRuth and 300 other readers tried it. [Verify: no source]', flagged: 1,
    notes: { markersLost: 1, newNames: ['Ruth'], structureChanged: { headings: false, paragraphs: { before: 1, after: 2 }, listItems: null } } });
  await waitCard('review');
  const notes4 = await page.$$eval('[data-imp] .wr-imp-n', (ns) => ns.map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
  ok(notes4.join(' | ') === 'Source: 1 claim needs a source. | Marks: 1 source mark from the original is missing. Check that no claim lost its mark. | Names: New names: Ruth. Check them. | Structure: The structure changed: 1 paragraph became 2.', `four notes: ${notes4.join(' | ')}`);
  ok(await page.$$eval('[data-imp] .wr-imp-n svg', (x) => x.length === 4), 'every note has an icon');
  await shots('review');
  await page.click('[data-imp-reject]');
  await select('Circle forward', 3, 'Circle back', 3);
  await openMenu();
  await page.keyboard.press('Escape');
  await page.click('[data-imp-open]');
  await page.waitForSelector('[data-imp-menu]');
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 3);
  ok((await imps())[2].selection === '- Circle forward ten times\n- Circle back ten times', `list marker joins: ${JSON.stringify((await imps())[2].selection)}`);
  await page.click('[data-imp-cancel]');
  await page.click('[data-imp-close]');
  await select('Rest now', 1, 'Rest now', 3);
  await openMenu();
  const short = await g(() => ({ head: document.querySelector('.wr-imp-head').innerText, note: (document.querySelector('.wr-imp-note') || {}).innerText, off: [...document.querySelectorAll('[data-imp-act]')].every((b) => b.getAttribute('aria-disabled') === 'true') }));
  ok(short.head === '1 sentence · 2 words' && short.note === 'Select at least 3 words.' && short.off, `too short: ${JSON.stringify(short)}`);
  await page.click('[data-imp-act="improve"]', { force: true });   // aria-disabled: Playwright would wait
  ok((await imps()).length === 3, 'an off item sends nothing');
  await shots('too-short');
  await page.keyboard.press('Escape');
  // Custom: the box, the counter, Send off when empty, 300 characters, Back.
  await select('Hold your arms', 0, 'Hold your arms', 4);
  await openMenu();
  await page.click('[data-imp-act="custom"]');
  await page.waitForSelector('[data-imp-ask]');
  const box0 = await g(() => ({ label: document.querySelector('label[for="wrImpAsk"]').innerText, count: document.querySelector('[data-imp-count]').innerText, send: document.querySelector('[data-imp-send]').disabled, focus: document.activeElement.hasAttribute('data-imp-ask'), role: document.querySelector('[data-imp-menu]').getAttribute('role') }));
  ok(box0.label === 'What should change?' && box0.count === '0 / 300' && box0.send && box0.focus && box0.role === 'dialog', `custom box: ${JSON.stringify(box0)}`);
  await page.keyboard.type('   ');
  ok(await page.$eval('[data-imp-send]', (b) => b.disabled), 'Send is off for spaces only');
  await page.fill('[data-imp-ask]', 'x'.repeat(310));
  await page.dispatchEvent('[data-imp-ask]', 'input');
  ok((await page.$eval('[data-imp-ask]', (t) => t.value.length)) === 300 && (await txt('[data-imp-count]')) === '300 / 300', 'at most 300 characters');
  await page.fill('[data-imp-ask]', '');
  await page.type('[data-imp-ask]', 'Use shorter sentences and speak to the reader as "you".');
  ok((await txt('[data-imp-count]')) === '55 / 300' && !(await page.$eval('[data-imp-send]', (b) => b.disabled)), 'the counter; Send on');
  await shots('custom');
  await page.click('[data-imp-back]');
  ok(await has('[data-imp-menu][role="menu"]'), 'Back: the menu again');
  await page.click('[data-imp-act="custom"]');
  ok((await page.$eval('[data-imp-ask]', (t) => t.value)) === 'Use shorter sentences and speak to the reader as "you".', 'the instruction is kept');
  await page.click('[data-imp-send]');
  await until(() => window.__imp.requests.length === 4);
  const r15 = (await imps())[3];
  ok(r15.action === 'custom' && r15.instruction === 'Use shorter sentences and speak to the reader as "you".' && Object.keys(r15).slice(-1)[0] === 'instruction', `custom request: ${r15.action} ${r15.instruction}`);
  await reply(200, { stage: 'section_improve', action: 'custom', unchanged: true });
  await waitCard('nochange');
  ok((await txt('#wrImpTitle')) === 'No changes suggested' && /The text already does this\. Nothing was saved\. This request counts toward your usage\./.test(await txt('[data-imp]')) && (await txt('[data-imp] .chip-label')) === 'CUSTOM INSTRUCTION · 4.3', `no change: ${await txt('[data-imp]')}`);
  await shots('nochange');
  await page.click('[data-imp-close]');

  // 16. Long selections: Expand off over 1,000 words; everything off over 1,500 words.
  await open(W7, st.long);
  await g(() => { const ed = document.querySelector('[data-editor]'); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await openMenu('[data-imp-open]');
  const long = await g(() => ({ head: document.querySelector('.wr-imp-head').innerText, expand: document.querySelector('[data-imp-act="expand"]').getAttribute('aria-disabled'), why: (document.getElementById('wrImpWhy-expand') || {}).innerText, others: [...document.querySelectorAll('[data-imp-act]:not([data-imp-act="expand"])')].every((b) => !b.getAttribute('aria-disabled')) }));
  ok(/· 1,1\d\d words$/.test(long.head) && long.expand === 'true' && long.why === 'Select up to 1,000 words to expand.' && long.others, `Expand off over 1,000: ${JSON.stringify(long)}`);
  await shots('expand-off');
  await page.keyboard.press('Escape');
  const big = Array.from({ length: 140 }, (_, i) => `Sit tall and breathe out slowly as you count to ten, part ${i + 1}.`).join(' ');
  st.addVersion(st.s51, big, 'manual');
  await open(W1, st.s51);
  await g(() => { const ed = document.querySelector('[data-editor]'); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await openMenu('[data-imp-open]');
  const huge = await g(() => ({ head: document.querySelector('.wr-imp-head').innerText, note: (document.querySelector('.wr-imp-note') || {}).innerText, off: [...document.querySelectorAll('[data-imp-act]')].every((b) => b.getAttribute('aria-disabled') === 'true') }));
  ok(huge.head === '140 sentences · 1,820 words' && huge.note === 'Select up to 1,500 words. You selected 1,820.' && huge.off, `over 1,500: ${JSON.stringify(huge)}`);
  await shots('too-long');
  await page.keyboard.press('Escape');

  // 17. The floating button flips above when only that fits: the top of a paragraph taller than the editor.
  await select('Sit tall and', 0, 'Sit tall and', 3);
  await page.waitForTimeout(300);
  const flip = await g(() => {
    const f = document.querySelector('[data-imp-float]');
    if (!f) return null;
    const fr = f.getBoundingClientRect();
    const sel = getSelection().getRangeAt(0).getBoundingClientRect();
    return { above: fr.bottom <= sel.top, gapTop: !!document.querySelector('[data-editor] .wr-imp-gap-top'), hidden: f.hidden };
  });
  const fitFlip = await fits();
  ok(flip && flip.above && flip.gapTop && !flip.hidden && fitFlip.selIn && fitFlip.floatIn && !fitFlip.covers, `flips above, both inside the editor: ${JSON.stringify({ ...flip, ...fitFlip })}`);
  await page.keyboard.press('ArrowRight');

  // 18. Improve off: every reason. Positioning not locked (W6, Needs review too).
  await open(W6, st.w6s);
  await select('Our joints', 0, 'Our joints', 3);
  await page.waitForTimeout(200);
  const pos = await g(() => ({ off: document.querySelector('[data-imp-open]').disabled, hint: document.querySelector('[data-imp-hint]').innerText.trim(), link: !!document.querySelector('[data-imp-hint] a[data-go-step="3"]'), float: !!document.querySelector('[data-imp-float]') }));
  ok(pos.off && pos.hint === 'Lock the positioning in 03 to use Improve. Go to 03' && pos.link && !pos.float, `positioning: ${JSON.stringify(pos)}`);
  await shots('off-positioning');
  // A conflict card (another tab saved; W5 1.1): off with its reason.
  await open(W5, st.c11);
  ok(await has('[data-use-draft]') && (await txt('[data-imp-hint]')) === 'Choose which text to keep first.' && await page.$eval('[data-imp-open]', (b) => b.disabled), 'conflict card: Improve off');
  // Generate running in another tab: off; the server's 409 is shown too.
  st.runs[st.s52] = { run_id: 'a0000000-0000-4000-8000-000000000099', state: 'running', end_reason: null, version_id: null, started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), stop_requested_at: null, ended_at: null };
  st.addVersion(st.s52, 'Breathe in for four counts. Hold for four counts. Breathe out for four counts.', 'manual');
  await open(W1, st.s52);
  await page.waitForTimeout(300);
  ok((await txt('[data-imp-hint]')) === 'This section is being written in another tab or window.' && await page.$eval('[data-imp-open]', (b) => b.disabled), 'other tab: Improve off');
  delete st.runs[st.s52];
  await open(W1, st.s52);
  await select('Hold for', 0, 'Hold for', 2);
  await openMenu();
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 1);
  await reply(409, { error: 'run_in_progress' });
  await waitCard('error');
  ok(/This section is being written in another tab or window\./.test(await txt('[data-imp] .alert')) && (await txt('[data-imp-hint]')) === 'This section is being written in another tab or window.', '409 run_in_progress: shown, Improve off');
  // Generate running here: the editor is read only, Improve off with its reason.
  await open(W1, st.s43);
  await page.click('[data-generate]');
  await until(() => window.__gen.requests.length >= 1);
  await page.waitForTimeout(200);
  ok((await txt('[data-imp-hint]')) === 'Wait for the section to finish writing.' && await page.$eval('[data-imp-open]', (b) => b.disabled), 'Generate here: Improve off');
  await shots('off-generate');
  await g(() => { window.__gen.send('start', { runId: 'a0000000-0000-4000-8000-000000000098', aim: 100, target: 500, mode: 'continue', recovered: null }); window.__gen.send('done', { reason: 'ai_error', partial: false, counted: false }); window.__gen.send('saved', { versionId: null, versionNo: null, words: 0, current: false, partial: false, conflict: false, flagged: 0 }); window.__gen.close(); });
  await page.waitForSelector('[data-gen-retry]', { timeout: 5000 }).catch(() => {});

  // 19. Needs review (positioning locked): Improve works, the alert stays after Accept.
  st.sectionOf(st.s42).s.needs_review = true;
  await open(W1, st.s42);
  ok(/Needs review\./.test(await txt('[data-notes]')), 'Needs review alert');
  await select('Shoulder rolls ease', 0, 'Shoulder rolls ease', 4);
  await openMenu();
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 1);
  const r19 = (await imps())[0];
  await suggest({ text: `${r19.selection} Breathe slowly.` });
  await waitCard('review');
  await page.click('[data-imp-accept]');
  await until(() => !document.querySelector('[data-imp-card]'));
  ok(/Needs review\./.test(await txt('[data-notes]')) && st.sectionOf(st.s42).s.needs_review === true, 'Accept keeps Needs review');

  // 20. Accept errors: an old suggestion; a save error with Try again.
  await select('Shoulder rolls ease', 0, 'Shoulder rolls ease', 4);
  await openMenu();
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 2);
  const r20 = (await imps())[1];
  await suggest({ text: `${r20.selection} Rest after.` });
  await waitCard('review');
  modes.expired = true;
  await page.click('[data-imp-accept]');
  await waitCard('error');
  ok(/This suggestion is too old\. Ask again\./.test(await txt('[data-imp] .alert')), `expired: ${await txt('[data-imp] .alert')}`);
  modes.expired = false;
  await page.click('[data-imp-retry]');
  await until(() => window.__imp.requests.length === 3);
  const r20b = (await imps())[2];
  ok(r20b.selection === r20.selection && r20b.action === 'improve', 'Ask again: a new request for the same passage');
  await suggest({ text: `${r20.selection} Rest after.` });
  await waitCard('review');
  modes.applyError = true;
  await page.click('[data-imp-accept]');
  await waitCard('error');
  ok(/We couldn’t save the change\. Your text is safe\./.test(await txt('[data-imp] .alert')), `save error: ${await txt('[data-imp] .alert')}`);
  modes.applyError = false;
  const nApply = writes('apply_suggestion').length;
  await page.click('[data-imp-retry]');
  await until(() => !document.querySelector('[data-imp-card]'));
  const last = writes('apply_suggestion').slice(-1)[0];
  ok(writes('apply_suggestion').length === nApply + 1 && st.versions.find((v) => v.id === st.sectionOf(st.s42).s.current_version_id).content.includes('sitting. Rest after.'), `Try again after a save error: applied (${writes('apply_suggestion').length - nApply}, ${await txt('[data-imp]')}, ${JSON.stringify(last && last.body.p_full_text.slice(0, 120))})`);
  ok((await imps()).length === 3, 'Try again after a save error makes no new AI call');

  // G3 P8: a lost connection may have reached the server, so the call may count.
  await open(W1, st.s42);
  await select('Now lift', 0, 'five times', 3);
  await openMenu();
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length === 1);
  await g(() => window.__imp.fail());
  await waitCard('error');
  ok(/We couldn’t reach KDP Lab\. Check your connection\. Your text is safe\. If the AI had already finished, this call may still count\./.test(await txt('[data-imp] .alert'))
    && !/not counted/.test(await txt('[data-imp] .alert')) && await has('[data-imp-retry]'), `network: may count, Try again: ${await txt('[data-imp] .alert')}`);
  // G3 P9: the server did not find the passage in the saved section: a warning with Try again, not counted.
  await page.click('[data-imp-retry]');
  await until(() => window.__imp.requests.length === 2);
  await reply(409, { error: 'selection_not_in_text' });
  await waitCard('error');
  ok(/We couldn’t find the selected text in your saved section\. Try again\. Your text is safe\. This attempt was not counted in your usage\./.test(await txt('[data-imp] .alert'))
    && await has('[data-imp] .alert-warning') && await has('[data-imp-retry]'), `selection_not_in_text: ${await txt('[data-imp] .alert')}`);
  await shots('not-in-text');

  return log.join('\n');
};
