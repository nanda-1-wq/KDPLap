// Step 06 Write, E17 Part 5 (designs 80b, 82, 84): About the author (first open copies the pen name bio
// as v1 with no dialog; "Copy from pen name again" asks "Replace your About the author text?" with
// Cancel / Replace text (not red), Replace keeps the typed text as a version first, the focus comes back
// to the button; the pen name has no bio: the 84 note with Open Pen Names) and Also by (ticks for the
// other books with the same pen name, up/down arrows gray at the ends, typed books with Add and Remove,
// limits 200/200 and 20 books, hostile characters shown as typed, the print preview with titles only,
// the save error with Try again, the 84 state with no other books), keyboard, focus, 200% text.
// Run: tests/browser/run.sh write t-e17-about-alsoby.js
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
    await page.waitForTimeout(250);
  };
  const writes = (fn) => st.writes.filter((w) => w.fn === fn || w.table === fn);
  const text = (sel) => g((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
  const focusIs = (sel) => g((s) => !!document.activeElement && document.activeElement.matches(s), sel);
  const live = () => g(() => { const e = document.querySelector('[data-live]'); return e ? e.textContent : ''; });
  const pill = () => g(() => { const b = [...document.querySelectorAll('[data-part]')].find((x) => /Also by/.test(x.textContent)); return b ? b.querySelector('.wr-pill').textContent.trim() : null; });
  const versionsOf = (k) => st.parts.versions.filter((v) => v.part_id === part(k).id).sort((a, b) => a.version_no - b.version_no);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  globalThis.__modes.parts = 1;

  /* ══ 80b: About the author ══ */
  part('about_author').enabled = true;
  const BIO = st.penBio;
  await open(`&part=${part('about_author').id}`);
  await until(() => document.querySelector('[data-editor]') && document.querySelector('[data-editor]').textContent.includes('chair yoga'));
  const ed1 = await text('[data-editor]');
  const v1 = versionsOf('about_author');
  ok(ed1 && ed1.includes('Nora Hale teaches chair yoga') && v1.length === 1 && v1[0].source === 'bio_copy' && v1[0].content === BIO,
    `first open: the bio is copied as v1 (${v1.map((v) => v.source).join(',')})`);
  ok(writes('copy_bio_to_about').length === 1 && writes('copy_bio_to_about')[0].body.p_base_version_id === null, 'first open: one copy call, from no version');
  ok(!(await g(() => !!document.querySelector('dialog[open]'))), 'first open: no dialog');
  ok(/Saved as v1 · copied from the pen name Nora Hale/.test(await text('[data-foot-text]')), `footer: "${await text('[data-foot-text]')}"`);
  ok(/Copied the pen name bio as version 1/.test(await live()), `announced: "${await live()}"`);
  const hd = await g(() => { const b = document.querySelector('[data-copy-bio]'); const s = document.querySelector('[data-status]'); return { btn: b ? b.textContent.trim() : null, before: !!(b && s && (b.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING)), h: b ? Math.round(b.getBoundingClientRect().height) : 0 }; });
  ok(hd.btn === 'Copy from pen name again' && hd.before && hd.h >= 44, `head: the button before Status, 44 px (${JSON.stringify(hd)})`);

  await open(`&part=${part('about_author').id}`);
  ok(writes('copy_bio_to_about').length === 1 && versionsOf('about_author').length === 1, 'reopen: no second copy');

  // Copy again, Cancel (keyboard: Enter on the button, focus on Cancel, then Cancel)
  await page.click('[data-editor]');
  await page.keyboard.press('End');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' She also bakes bread.');
  await page.waitForTimeout(150);
  await page.focus('[data-copy-bio]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('dialog[open]');
  const dlg = await g(() => { const d = document.querySelector('dialog[open]'); return { title: d.querySelector('h2').textContent, text: d.querySelector('[data-ask-text]').textContent, bold: (d.querySelector('[data-ask-text] strong') || {}).textContent || null,
    note: d.querySelector('[data-ask-note]').textContent, no: d.querySelector('[data-ask-no]').textContent, yes: d.querySelector('[data-ask-yes]').textContent, yesCls: d.querySelector('[data-ask-yes]').className,
    yesBg: getComputedStyle(d.querySelector('[data-ask-yes]')).backgroundColor, focus: document.activeElement === d.querySelector('[data-ask-no]') }; });
  ok(dlg.title === 'Replace your About the author text?' && dlg.bold === 'Nora Hale' && /in place of the text you have here/.test(dlg.text) && /kept as a version/.test(dlg.note),
    `dialog: title, the pen name in bold, the version note (${JSON.stringify([dlg.title, dlg.bold])})`);
  ok(dlg.no === 'Cancel' && dlg.yes === 'Replace text' && !/danger/.test(dlg.yesCls) && dlg.focus, `dialog: Cancel / Replace text, not red, focus on Cancel (${dlg.yesCls}, ${dlg.yesBg})`);
  await page.keyboard.press('Enter');   // Cancel has the focus
  await page.waitForTimeout(200);
  ok(!(await g(() => !!document.querySelector('dialog[open]'))) && writes('copy_bio_to_about').length === 1, 'Cancel: closed, nothing copied');
  ok(await focusIs('[data-copy-bio]'), 'Cancel: the focus is back on the button');
  ok((await text('[data-editor]')).includes('She also bakes bread.'), 'Cancel: the typed text stays');
  // Escape closes too
  await page.keyboard.press('Enter');
  await page.waitForSelector('dialog[open]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(!(await g(() => !!document.querySelector('dialog[open]'))) && (await focusIs('[data-copy-bio]')) && writes('copy_bio_to_about').length === 1, 'Escape: closed, focus back, nothing copied');

  // Replace
  await page.click('[data-copy-bio]');
  await page.waitForSelector('dialog[open]');
  await page.click('dialog[open] [data-ask-yes]');
  await until(() => document.querySelector('[data-editor]') && !document.querySelector('[data-editor]').textContent.includes('bakes bread'));
  await page.waitForTimeout(200);
  const vr = versionsOf('about_author');
  const typedV = vr.find((v) => v.source === 'manual');
  ok(writes('copy_bio_to_about').length === 2 && writes('copy_bio_to_about')[1].body.p_base_version_id === vr[0].id, 'Replace: one copy call, from the current version');
  ok(typedV && typedV.content.includes('She also bakes bread.'), `Replace: the typed text is kept as a version (${vr.map((v) => `v${v.version_no} ${v.source}`).join(', ')})`);
  // 0035: the current version already is the bio, so no new copy: the typed text is v2 (not current), v1 stays.
  const curV = vr.find((v) => v.id === part('about_author').current_version_id);
  ok(curV && curV.source === 'bio_copy' && curV.content === BIO && typedV && typedV.id !== curV.id, `Replace: the bio is the new current version (${vr.map((v) => `v${v.version_no} ${v.source}${v.id === part('about_author').current_version_id ? '*' : ''}`).join(', ')})`);
  ok(!(await text('[data-editor]')).includes('bakes bread') && (await text('[data-editor]')).includes('chair yoga'), 'Replace: the editor shows the bio');
  ok(await focusIs('[data-copy-bio]'), 'Replace: the focus is back on the button');
  ok(/Your earlier text is kept as a version\./.test(await live()), `Replace: announced (${await live()})`);
  const vlist = await g(() => [...document.querySelectorAll('.wr-side, [data-side]')].map((e) => e.textContent).join(' '));
  ok(/Copied from pen name/.test(vlist) || !(await g(() => !!document.querySelector('[data-panel-toggle][aria-expanded="true"]'))), 'versions: the bio version is named "Copied from pen name" (when the panel shows)');

  // Copy with nothing typed (empty editor) needs no dialog; copy error keeps the text
  globalThis.__modes.copyError = 1;
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Extra.');
  await page.waitForTimeout(150);
  await page.click('[data-copy-bio]');
  await page.waitForSelector('dialog[open]');
  await page.click('dialog[open] [data-ask-yes]');
  await until(() => !!document.querySelector('.alert-error'));
  ok(/couldn’t copy the pen name bio/.test(await text('.alert-error')) && (await text('[data-editor]')).includes('Extra.'), 'copy error: says so, the text stays');
  ok(await focusIs('[data-copy-bio]'), 'copy error: the focus is back on the button');

  /* ══ 84: the pen name has no bio ══ */
  st.penBio = '';
  const ab = part('about_author');
  st.parts.versions = st.parts.versions.filter((v) => v.part_id !== ab.id);
  delete st.parts.drafts[ab.id];
  ab.current_version_id = null;
  const before84 = writes('copy_bio_to_about').length;
  await open(`&part=${ab.id}`);
  await until(() => !!document.querySelector('[data-no-bio]'));
  const nb = await g(() => { const n = document.querySelector('[data-no-bio]'); const a = n && n.querySelector('a'); const ed = document.querySelector('[data-editor]');
    return { text: n ? n.textContent.replace(/\s+/g, ' ').trim() : null, link: a ? a.textContent : null, href: a ? a.getAttribute('href') : null, h: a ? Math.round(a.getBoundingClientRect().height) : 0,
      edit: ed ? ed.getAttribute('contenteditable') : null, empty: ed ? !ed.textContent.trim() : null }; });
  ok(nb.text && nb.text.startsWith('This pen name has no bio yet.') && /Write one in Pen Names, then copy it here\. Or write About the author here directly\./.test(nb.text), `no bio: the 84 words (${nb.text})`);
  ok(nb.link === 'Open Pen Names' && /^pen-name\.html\?id=/.test(nb.href) && nb.h >= 44, `no bio: Open Pen Names (${nb.href}, ${nb.h} px)`);
  ok(nb.edit === 'true' && nb.empty && versionsOf('about_author').length === 0 && writes('copy_bio_to_about').length === before84 + 1, 'no bio: the editor is empty and editable, no version made');
  await page.click('[data-copy-bio]');   // empty editor: no dialog
  await page.waitForTimeout(300);
  ok(!(await g(() => !!document.querySelector('dialog[open]'))) && !!(await g(() => document.querySelector('[data-no-bio]'))) && (await focusIs('[data-copy-bio]')), 'no bio: Copy again with no text asks nothing, the note stays, focus on the button');
  st.penBio = BIO;

  /* ══ 82: Also by ══ */
  const A = 'b0b0b0b0-0000-4000-8000-00000000000a', B = 'b0b0b0b0-0000-4000-8000-00000000000b';
  st.parts.others[W1] = [{ id: A, title: 'Chair Yoga for Beginners', subtitle: 'Gentle Moves for Adults over 60' }, { id: B, title: 'Sleep Better After 60', subtitle: null }];
  st.parts.alsoBy[W1] = [];
  part('also_by').enabled = true;
  const AID = part('also_by').id;
  const ab0 = writes('set_also_by').length;
  const S = () => g(() => {
    const t = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
    return {
      apps: [...document.querySelectorAll('.wr-ab-list:not(.wr-ab-typed) .wr-ab-row')].map((r) => ({ title: t(r.querySelector('.wr-ab-title')), on: r.querySelector('input').checked,
        up: r.querySelector('[data-ab-move="up"]') ? r.querySelector('[data-ab-move="up"]').getAttribute('aria-disabled') === 'true' : null,
        down: r.querySelector('[data-ab-move="down"]') ? r.querySelector('[data-ab-move="down"]').getAttribute('aria-disabled') === 'true' : null })),
      typed: [...document.querySelectorAll('.wr-ab-typed .wr-ab-row')].map((r) => ({ title: t(r.querySelector('.wr-ab-title')), sub: t(r.querySelector('.wr-ab-subtitle')) })),
      ph: t(document.querySelector('.wr-ab-ph')), print: [...document.querySelectorAll('.wr-ab-titles li')].map(t), none: t(document.querySelector('.wr-ab-none')),
      page: t(document.querySelector('.wr-ab-page')), tag: t(document.querySelector('.wr-fixed-tag')), empty: t(document.querySelector('[data-ab-empty]')),
      alert: t(document.querySelector('.wr-ab .alert-error'))
    };
  });
  await open(`&part=${AID}`);
  let s = await S();
  ok(s.apps.length === 2 && s.apps.every((x) => !x.on && x.up === null), `82: two other books, none ticked, no arrows (${JSON.stringify(s.apps)})`);
  ok(s.tag === 'Prints when 1 or more books are ticked' && (await pill()) === '0 books' && /left out of the files/.test(s.none), `82: the tag, "0 books", the preview says it is left out (${s.tag}, ${await pill()})`);
  ok((await text('#wrAbMine')) === 'Your books in NicheInk with the pen name Nora Hale', '82: the heading names the pen name');

  await page.click(`[data-ab-tick="${A}"]`);
  await until(() => document.querySelector('.wr-ab-ph'));
  s = await S();
  ok(JSON.stringify(writes('set_also_by').slice(-1)[0].body.p_entries) === JSON.stringify([{ book_id: A }]) && writes('set_also_by').length === ab0 + 1, 'tick: the whole list in one call');
  ok(s.ph === 'Also by Nora Hale' && JSON.stringify(s.print) === JSON.stringify(['Chair Yoga for Beginners']) && !/Gentle Moves/.test(s.page), `preview: "Also by Nora Hale", titles only (${JSON.stringify(s.print)})`);
  ok(s.apps[0].on && s.apps[0].up && s.apps[0].down && (await pill()) === '1 book', `tick: one book, both arrows gray (${JSON.stringify(s.apps[0])}, ${await pill()})`);
  ok(await focusIs(`[data-ab-tick="${A}"]`), 'tick: the focus stays on the box');

  // Keyboard: Space ticks B
  await page.focus(`[data-ab-tick="${B}"]`);
  await page.keyboard.press('Space');
  await until(() => document.querySelectorAll('.wr-ab-titles li').length === 2);
  s = await S();
  ok(s.apps[0].up && !s.apps[0].down && !s.apps[1].up && s.apps[1].down, `two ticked: gray only at the ends (${JSON.stringify(s.apps.map((x) => [x.up, x.down]))})`);
  const mv = await g(() => [...document.querySelectorAll('.wr-ab-move')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  ok(mv.every(([w, h]) => w >= 44 && h >= 44), `arrows are 44 px (${JSON.stringify(mv)})`);

  // Keyboard: Enter on B's up arrow
  await page.focus('[data-ab-group="app"][data-ab-i="1"][data-ab-move="up"]');
  await page.keyboard.press('Enter');
  await until(() => document.querySelector('.wr-ab-titles li') && document.querySelector('.wr-ab-titles li').textContent.includes('Sleep'));
  s = await S();
  ok(JSON.stringify(writes('set_also_by').slice(-1)[0].body.p_entries) === JSON.stringify([{ book_id: B }, { book_id: A }]) && s.print[0] === 'Sleep Better After 60', 'up arrow: B first, saved and shown');
  ok(await focusIs('[data-ab-group="app"][data-ab-i="0"][data-ab-move="up"]'), 'up arrow: the focus follows the book (now gray, still focused)');
  ok(/Sleep Better After 60 moved up\. Now 1 of 2\./.test(await live()), `up arrow: announced (${await live()})`);
  const ring = await g(() => { const c = getComputedStyle(document.activeElement); return [c.outlineStyle, c.outlineWidth, c.outlineOffset]; });
  ok(ring[0] === 'solid' && ring[1] === '2px' && ring[2] === '2px', `focus ring: 2 px, 2 px offset (${ring.join(' ')})`);
  // A gray arrow does nothing
  const nW = writes('set_also_by').length;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  ok(writes('set_also_by').length === nW, 'gray arrow: nothing is saved');

  // Typed books: required title, limits, hostile characters
  await page.click('[data-ab-add]');
  await page.waitForTimeout(150);
  const req = await g(() => ({ inv: document.querySelector('#wrAbTitle').getAttribute('aria-invalid'), err: (document.querySelector('#wrAbTitleErr') || {}).textContent || null, focus: document.activeElement.id }));
  ok(req.inv === 'true' && /Type the book title\./.test(req.err) && req.focus === 'wrAbTitle' && writes('set_also_by').length === nW, `empty title: error, focus on Title, nothing saved (${JSON.stringify(req)})`);
  const lim = await g(() => [document.querySelector('#wrAbTitle').maxLength, document.querySelector('#wrAbSub').maxLength]);
  ok(lim[0] === 200 && lim[1] === 200, `limits: Title and Subtitle hold 200 characters (${lim})`);
  await page.fill('#wrAbTitle', 'x'.repeat(250));
  await page.fill('#wrAbSub', 'y'.repeat(250));
  ok(JSON.stringify(await g(() => [document.querySelector('#wrAbTitle').value.length, document.querySelector('#wrAbSub').value.length])) === '[200,200]', 'limits: typing 250 keeps 200');
  const HOST = `<b>Bold</b> & "Quotes" 'x' # $ @ * _ <img src=x onerror="window.__xss=1">`;
  const HSUB = '<i>sub</i> & < >';
  await page.fill('#wrAbTitle', HOST);
  await page.fill('#wrAbSub', HSUB);
  await page.keyboard.press('Enter');   // the form submits
  await until(() => document.querySelectorAll('.wr-ab-typed .wr-ab-row').length === 1);
  s = await S();
  const lastE = writes('set_also_by').slice(-1)[0].body.p_entries;
  ok(JSON.stringify(lastE[2]) === JSON.stringify({ title: HOST, subtitle: HSUB }) && lastE.length === 3, 'add: the typed book goes last, as typed');
  ok(s.typed[0].title === HOST.replace(/\s+/g, ' ') && s.typed[0].sub === HSUB, `hostile: shown as typed (${s.typed[0].title})`);
  ok(s.print[2] === HOST.replace(/\s+/g, ' ') && !s.page.includes('sub</i>'), 'hostile: the preview shows the title as typed, no subtitle');
  const html = await g(() => ({ b: document.querySelectorAll('.wr-ab b, .wr-ab i, .wr-ab img').length, xss: !!window.__xss }));
  ok(html.b === 0 && !html.xss, `hostile: never HTML (${JSON.stringify(html)})`);
  ok((await g(() => [document.querySelector('#wrAbTitle').value, document.activeElement.id])).join('|') === '|wrAbTitle', 'add: the form is cleared, focus on Title');
  ok((await pill()) === '3 books', `pill: "3 books" (${await pill()})`);

  await page.fill('#wrAbTitle', '  Walk Every Day  ');
  await page.click('[data-ab-add]');
  await until(() => document.querySelectorAll('.wr-ab-typed .wr-ab-row').length === 2);
  s = await S();
  ok(s.typed[1].title === 'Walk Every Day' && s.typed[1].sub === null, 'add: spaces trimmed, no subtitle');
  // Typed order: Walk up
  await page.click('[data-ab-group="typed"][data-ab-i="1"][data-ab-move="up"]');
  await until(() => document.querySelector('.wr-ab-typed .wr-ab-title').textContent === 'Walk Every Day');
  ok(JSON.stringify(writes('set_also_by').slice(-1)[0].body.p_entries.slice(2).map((e) => e.title)) === JSON.stringify(['Walk Every Day', HOST]), 'typed up arrow: saved in the new order');
  // Remove the first typed book: focus goes to the next Remove
  await page.click('[data-ab-remove="0"]');
  await until(() => document.querySelectorAll('.wr-ab-typed .wr-ab-row').length === 1);
  ok(await focusIs('[data-ab-remove="0"]'), 'remove: the focus goes to the next Remove');
  ok(/Walk Every Day is removed\./.test(await live()), `remove: announced (${await live()})`);
  await page.keyboard.press('Enter');
  await until(() => !document.querySelector('.wr-ab-typed'));
  ok(await focusIs('#wrAbTitle'), 'remove the last: the focus goes to Title');

  // Untick A: it goes back to the list, unticked
  await page.click(`[data-ab-tick="${A}"]`);
  await until(() => document.querySelectorAll('.wr-ab-titles li').length === 1);
  s = await S();
  ok(JSON.stringify(writes('set_also_by').slice(-1)[0].body.p_entries) === JSON.stringify([{ book_id: B }]) && s.apps.length === 2 && s.apps.filter((x) => x.on).length === 1, `untick: saved, the book stays in the list unticked (${JSON.stringify(s.apps)})`);

  // Save error, then Try again
  globalThis.__modes.alsoByError = 1;
  await page.click(`[data-ab-tick="${A}"]`);
  await until(() => !!document.querySelector('.wr-ab .alert-error'));
  s = await S();
  ok(/couldn’t save the Also by list/.test(s.alert) && s.apps.filter((x) => x.on).length === 1, `save error: says so, the tick is undone (${s.alert})`);
  await page.click('[data-ab-retry]');
  await until(() => document.querySelectorAll('.wr-ab-titles li').length === 2);
  s = await S();
  ok(!s.alert && s.apps.filter((x) => x.on).length === 2, 'Try again: saved');

  // A pen name change: the old tick is hidden, and sent back as it was
  st.parts.alsoBy[W1] = [{ position: 1, book_id: B, title: 'Sleep Better After 60', subtitle: null, valid: true }, { position: 2, book_id: 'b0b0b0b0-0000-4000-8000-0000000000cc', title: 'Old Pen Book', subtitle: null, valid: false }];
  await open(`&part=${AID}`);
  s = await S();
  ok(!s.page.includes('Old Pen Book') && !JSON.stringify(s.apps).includes('Old Pen Book'), 'not valid: hidden');
  await page.fill('#wrAbTitle', 'Typed One');
  await page.click('[data-ab-add]');
  await until(() => document.querySelectorAll('.wr-ab-typed .wr-ab-row').length === 1);
  ok(JSON.stringify(writes('set_also_by').slice(-1)[0].body.p_entries) === JSON.stringify([{ book_id: B }, { book_id: 'b0b0b0b0-0000-4000-8000-0000000000cc' }, { title: 'Typed One', subtitle: null }]), 'not valid: kept in the list it sends');

  // 20 books: Add and new ticks stop
  st.parts.alsoBy[W1] = Array.from({ length: 20 }, (_, i) => ({ position: i + 1, book_id: null, title: `Book ${i + 1}`, subtitle: null, valid: true }));
  await open(`&part=${AID}`);
  const full = await g(() => ({ add: document.querySelector('[data-ab-add]').getAttribute('aria-disabled'), note: (document.querySelector('#wrAbFull') || {}).textContent || null, box: document.querySelector(`[data-ab-tick]`).getAttribute('aria-disabled') }));
  const nF = writes('set_also_by').length;
  await page.fill('#wrAbTitle', 'Book 21');
  // aria-disabled: Playwright waits for "enabled", so force the clicks to prove they do nothing.
  await page.click('[data-ab-add]', { force: true });
  await page.click(`[data-ab-tick="${A}"]`, { force: true });
  await page.waitForTimeout(250);
  ok(full.add === 'true' && /at most 20 books/.test(full.note) && full.box === 'true' && writes('set_also_by').length === nF && !(await g((a) => document.querySelector(`[data-ab-tick="${a}"]`).checked, A)), `20 books: Add and new ticks stop (${JSON.stringify(full)})`);

  /* ══ 84: no other books ══ */
  st.parts.others[W1] = [];
  st.parts.alsoBy[W1] = [];
  await open(`&part=${AID}`);
  s = await S();
  ok(s.empty && s.empty.startsWith('No other books with the pen name Nora Hale yet.') && /Add a book made outside NicheInk below, or turn Also by off\./.test(s.empty), `84: no other books (${s.empty})`);
  ok(!!(await g(() => document.querySelector('[data-ab-form]'))), '84: the form stays');

  /* ══ 200% text: no sideways scroll ══ */
  st.parts.others[W1] = [{ id: A, title: 'Chair Yoga for Beginners', subtitle: 'Gentle Moves for Adults over 60' }];
  st.parts.alsoBy[W1] = [{ position: 1, book_id: A, title: 'Chair Yoga for Beginners', subtitle: 'Gentle Moves for Adults over 60', valid: true }, { position: 2, book_id: null, title: 'Walk Every Day', subtitle: 'A Small Habit', valid: true }];
  for (const w of [1440, 900]) {
    for (const k of ['also_by', 'about_author']) {
      await open(`&part=${part(k).id}`, w, 900);
      await g(() => { document.documentElement.style.fontSize = '200%'; });
      await page.waitForTimeout(250);
      const z = await g(() => ({ side: document.documentElement.scrollWidth > innerWidth + 1, main: (() => { const m = document.querySelector('.wr-ab, [data-editor]'); return m ? m.scrollWidth <= m.clientWidth + 1 : false; })() }));
      ok(!z.side && z.main, `${k} ${w} at 200% text: no sideways scroll (${JSON.stringify(z)})`);
      await g(() => { document.documentElement.style.fontSize = ''; });
    }
  }

  ok(errs.length === 0, `no page errors (${errs.join(' | ')})`);
  return log.join('\n');
};
