// Step 06 Write (G3 P9, owner change 2): Improve selections made in the real
// editor, across bold, italic, list items, headings and a "Verify: no source"
// marker, and the whole section. For each one, the request body (selection,
// before, after) and the text the server would read (the draft, else the
// current version) are captured. Each line "P9CASE <base64 JSON>" is checked
// by the function's own rule (selectionInText) in
// tests/browser/write/selection-check.ts:
//   tests/browser/run.sh write t-selection.js | deno run tests/browser/write/selection-check.ts
// The PASS lines here check the browser side: the request is sent, the
// typing is saved as a draft before the request (the flush), and the
// selection is an exact part of the saved text.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const g = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, ms = 5000) => page.waitForFunction(fn, arg, { timeout: ms });
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForSelector('.wr-ver, .wr-panel .wr-soon', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
  };
  /** Selects from the n-th character of `a` to the m-th character of `b` (text in the editor, first match); null a = the whole editor. */
  const select = (a, n, b, m) => g(([a, n, b, m]) => {
    const ed = document.querySelector('[data-editor]');
    ed.focus();
    const r = document.createRange();
    if (a === null) {
      // The whole section from the first to the last text node.
      const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      const all = [];
      for (let t = w.nextNode(); t; t = w.nextNode()) if (t.nodeValue.trim()) all.push(t);
      r.setStart(all[0], 0);
      r.setEnd(all[all.length - 1], all[all.length - 1].nodeValue.length);
    }
    else {
      const find = (s) => {
        const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) { const i = t.nodeValue.indexOf(s); if (i >= 0) return [t, i]; }
        throw new Error(`not in the editor: ${s}`);
      };
      const [ta, ia] = find(a), [tb, ib] = find(b);
      r.setStart(ta, ia + n);
      r.setEnd(tb, ib + m);
    }
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }, [a, n, b, m]);
  const b64 = (o) => g((j) => btoa(unescape(encodeURIComponent(j))), JSON.stringify(o));
  const MARK = '[Verify: no source]';
  const MD = [
    '## Before you start',
    `Sit near the front of a **sturdy chair**. Keep your *feet flat* on the floor. Most people feel looser within a week. ${MARK}`,
    '- Sit tall\n- Let your **hands rest** on your thighs\n- Breathe out slowly',
    '## Shoulder rolls',
    'Lift your shoulders toward your ears. Roll them back and down. Do this *five* times.'
  ].join('\n\n');
  st.addVersion(st.s43, MD, 'manual');
  await page.setViewportSize({ width: 1440, height: 960 });

  /** One Improve request from a selection; returns { body, stored }. */
  const improveFrom = async (name, a, n, b, m, typeFirst) => {
    await open(W1, st.s43);
    const t0 = Date.now();
    if (typeFirst) {
      // Typed right before Improve, so autosave has not sent it yet: the flush must.
      await select(typeFirst, typeFirst.length, typeFirst, typeFirst.length);
      await page.keyboard.type(' Then rest.');
    }
    if (a === 'CTRL_A') {
      await g(() => document.querySelector('[data-editor]').focus());
      await page.keyboard.press('ControlOrMeta+A');
    } else await select(a, n, b, m);
    await page.waitForSelector('[data-imp-float]', { timeout: 3000 });
    await page.click('[data-imp-float]');
    await page.waitForSelector('[data-imp-menu]', { timeout: 3000 });
    await page.click('[data-imp-act="edit_format"]');
    await until(() => window.__imp.requests.length === 1);
    const body = await g(() => window.__imp.requests[0].body);
    const sentAt = Date.now();
    const d = st.drafts[st.s43];
    const v = st.versions.find((x) => x.id === st.sectionOf(st.s43).s.current_version_id);
    const stored = { draft: d ? d.content : null, version: v ? v.content : null };
    ok(body.stage === 'section_improve' && body.sectionId === st.s43, `${name}: the request is sent`);
    const text = stored.draft ?? stored.version;
    const at = text.indexOf(body.selection);
    ok(at >= 0 && text.slice(0, at).trim().endsWith(body.before) && text.slice(at + body.selection.length).trim().startsWith(body.after),
      `${name}: the selection is part of the saved text, before and after touch it: ${JSON.stringify(body.selection).slice(0, 120)}`);
    if (typeFirst) {
      const draftAt = (st.timeline.filter(([w, at]) => w === 'draft' && at >= t0)[0] || [])[1];
      ok(!!draftAt && draftAt <= sentAt && /Then rest\./.test(stored.draft || '') && body.selection.includes('Then rest.'),
        `${name}: the typing is saved as a draft before the request (flush): ${JSON.stringify(stored.draft).slice(-60)}`);
    }
    log.push(`P9CASE ${await b64({ name, body: { selection: body.selection, before: body.before, after: body.after }, stored })}`);
    await g(() => window.__imp.reply(200, { stage: 'section_improve', action: 'edit_format', unchanged: true }));
    await page.waitForTimeout(200);
  };

  await improveFrom('inside bold', 'sturdy', 2, 'sturdy', 5);
  await improveFrom('across bold and italic', 'front of a', 0, 'feet flat', 4);
  await improveFrom('across the marker into a list item', 'looser', 0, 'Sit tall', 3);
  await improveFrom('across list items', 'hands rest', 2, 'Breathe out slowly', 7);
  await improveFrom('a list item into a heading', 'Breathe out', 0, 'Shoulder rolls', 4);
  await improveFrom('a heading into a paragraph', 'Shoulder rolls', 3, 'toward your ears', 5);
  await improveFrom('italic at the end of the section', 'Roll them', 0, 'five', 2);
  await improveFrom('the whole section', null, 0, null, 0);
  await improveFrom('the whole section with Ctrl+A', 'CTRL_A', 0, null, 0);
  await improveFrom('typed just before Improve (flush)', 'Do this', 0, 'Then rest.', 10, 'times.');

  return log.join('\n');
};
