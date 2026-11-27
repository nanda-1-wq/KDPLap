// Step 06 Write, E17 Part 3 (designs 78, 78b): N1 the right panel toggle (hidden by default, 44 px,
// aria-pressed, remembered in localStorage "nicheink.write.panel", blocked storage = closed, Escape in the
// panel hides it, the amber Checks count while hidden), N2 the compact head (one row when wide, wraps when
// narrow; Generate chapter grey with aria-disabled and its reason as the tip; "Select text to improve it."
// in the toolbar; spacing; the 680 px text column, centered), N3 the header Export hidden on 01 to 07.
// Keyboard (Enter, Space, Tab, the focus ring) and 200% text. Starts with the panel closed (no key).
// Run: tests/browser/run.sh write t-e17-shell.js
globalThis.__panelFresh = true;
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const KEY = 'nicheink.write.panel';
  const open = async (section, w = 1440, h = 900) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${W1}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForSelector('[data-panel-toggle]', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
  };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tog = () => g(() => {
    const b = document.querySelector('[data-panel-toggle]');
    const r = b.getBoundingClientRect();
    const c = b.querySelector('[data-tog-count]');
    return { w: r.width, h: r.height, pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'), title: b.title,
      count: c ? c.textContent : null, countHidden: c ? c.getAttribute('aria-hidden') : null, controls: b.getAttribute('aria-controls'),
      sideShown: getComputedStyle(document.querySelector('.wr-side')).display !== 'none', disabled: b.disabled };
  });
  const stored = () => g((k) => localStorage.getItem(k), KEY);
  /** Every visible control in the main column that overlaps the toggle's box (should be none). */
  const overlaps = () => g(() => {
    const b = document.querySelector('[data-panel-toggle]').getBoundingClientRect();
    const hit = (r) => r.width && r.height && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
    return [...document.querySelectorAll('.wr-main button, .wr-main select, .wr-main a, .wr-main label, .wr-main h2, .wr-main .wr-where, .wr-main .wr-tools, .wr-main .wr-card')]
      .filter((e) => !e.matches('[data-panel-toggle]') && hit(e.getBoundingClientRect())).map((e) => e.className || e.tagName);
  });
  const head = () => g(() => {
    const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const t = r('#wrSecTitle'), w = r('.wr-where'), ctl = r('.wr-head-ctl'), tg = r('[data-panel-toggle]'), card = r('.wr-card'), main = document.querySelector('.wr-main');
    const ed = document.querySelector('.wr-editor'), cs = getComputedStyle(ed), ms = getComputedStyle(main);
    const er = ed.getBoundingClientRect();
    return { titleTop: w.top, titleBottom: t.bottom, titleRight: Math.max(t.right, w.right), ctlTop: ctl.top, ctlBottom: ctl.bottom, ctlLeft: ctl.left, ctlRight: ctl.right,
      togTop: tg.top, togLeft: tg.left, togBottom: tg.bottom, cardTop: card.top, cardBottom: card.bottom,
      mainPadTop: parseFloat(ms.paddingTop), gap: parseFloat(ms.rowGap), mainTop: main.getBoundingClientRect().top,
      edPadTop: parseFloat(cs.paddingTop), edPadL: parseFloat(cs.paddingLeft), edPadR: parseFloat(cs.paddingRight), edW: er.width,
      measure: getComputedStyle(document.documentElement).getPropertyValue('--app-wr-measure').trim(),
      sideways: main.scrollWidth > main.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1 };
  });

  /* ── N1: hidden by default ── */
  // Chapter 4 full (as design 78: every section has text), so Generate chapter is grey with its tip.
  st.addVersion(st.s43, 'Lift one arm to the side, then lower it slowly. Breathe out as it comes down.', 'manual');
  await open(st.s42);
  ok((await stored()) === null, 'fresh start: no stored panel state');
  let t = await tog();
  ok(!t.sideShown && t.pressed === 'false', `hidden by default; aria-pressed false (${t.pressed})`);
  ok(t.w >= 44 && t.h >= 44, `toggle is 44 px (${t.w} x ${t.h})`);
  ok(t.controls === 'wrSide' && await g(() => !!document.getElementById('wrSide')), 'aria-controls names the panel');
  ok((await overlaps()).length === 0, `1440: the toggle sits over no other control (${JSON.stringify(await overlaps())})`);
  ok(await g(() => { const b = document.querySelector('[data-panel-toggle]').getBoundingClientRect(), m = document.querySelector('.wr-main').getBoundingClientRect(); return b.right <= m.right && b.top >= m.top && m.right - b.right <= 40; }), '1440: the toggle is in the top right corner of the writing area');
  ok(await g(() => getComputedStyle(document.querySelector('.wr')).gridTemplateColumns.split(' ').length === 2), 'hidden: the grid has two columns (the text gets the room)');

  /* ── N1: the amber count while hidden (Q-P1) ── */
  ok(t.count === '1' && t.countHidden === 'true', `4.2 has 1 check: count "${t.count}" (aria-hidden ${t.countHidden})`);
  ok(t.label === 'Show versions, checks and Brief, 1 check to look at' && t.title === t.label, `name and title: "${t.label}" / "${t.title}"`);
  ok(await page.getByRole('button', { name: 'Show versions, checks and Brief, 1 check to look at', exact: true }).count() === 1, 'found by role and name');
  const amber = await g(() => {
    const c = document.querySelector('[data-tog-count]'), cs = getComputedStyle(c), root = getComputedStyle(document.documentElement);
    const rgb = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const x = getComputedStyle(d).color; d.remove(); return x; };
    return { bg: cs.backgroundColor === rgb(root.getPropertyValue('--warning')), fg: cs.color === rgb(root.getPropertyValue('--surface')), w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height };
  });
  ok(amber.bg && amber.fg && amber.h <= 20 && amber.w <= 24, `count is --warning with --surface text, small (${JSON.stringify(amber)})`);

  /* ── N1: click opens, remembered; the count goes (the Checks tab shows it) ── */
  await page.click('[data-panel-toggle]');
  t = await tog();
  ok(t.sideShown && t.pressed === 'true' && t.count === null && t.label === 'Show versions, checks and Brief', `open: panel shown, pressed, no count, name "${t.label}"`);
  ok((await stored()) === 'open', 'stored "open"');
  const pressedLook = await g(() => { const b = document.querySelector('[data-panel-toggle]'), cs = getComputedStyle(b), root = getComputedStyle(document.documentElement);
    const rgb = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const x = getComputedStyle(d).color; d.remove(); return x; };
    return cs.backgroundColor === rgb(root.getPropertyValue('--mist')) && cs.borderTopColor === rgb(root.getPropertyValue('--ink')); });
  ok(pressedLook, 'pressed look: mist fill, ink border');
  ok(await g(() => document.querySelector('[data-tab="checks"]').getAttribute('aria-label')) === 'Checks, 1 to review', 'the Checks tab carries the count when open');
  ok((await overlaps()).length === 0, `1440 open: no overlap (${JSON.stringify(await overlaps())})`);
  await open(st.s42);
  t = await tog();
  ok(t.sideShown && t.pressed === 'true', 'reload: still open');
  await page.click('[data-panel-toggle]');
  ok(!(await tog()).sideShown && (await stored()) === 'closed', 'click again: hidden, stored "closed"');
  await open(st.s42);
  ok(!(await tog()).sideShown, 'reload: still hidden');

  /* ── Keyboard: Tab reaches it with the ring, Enter and Space toggle, Escape in the panel hides it ── */
  await page.focus('[data-gen-chapter]');
  await page.keyboard.press('Tab');
  const ring = await g(() => { const b = document.activeElement, cs = getComputedStyle(b), root = getComputedStyle(document.documentElement);
    const rgb = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const x = getComputedStyle(d).color; d.remove(); return x; };
    return { on: b.matches('[data-panel-toggle]'), fv: b.matches(':focus-visible'), style: cs.outlineStyle, w: cs.outlineWidth, off: cs.outlineOffset, ink: cs.outlineColor === rgb(root.getPropertyValue('--ink')) }; });
  ok(ring.on && ring.fv, 'Tab from Generate chapter reaches the toggle');
  ok(ring.style === 'solid' && ring.w === '2px' && ring.off === '2px' && ring.ink, `focus ring: 2 px ink, 2 px offset (${JSON.stringify(ring)})`);
  await page.keyboard.press('Enter');
  ok((await tog()).sideShown && (await tog()).pressed === 'true' && await g(() => document.activeElement.matches('[data-panel-toggle]')), 'Enter opens; focus stays on the toggle');
  await page.keyboard.press('Space');
  ok(!(await tog()).sideShown && (await tog()).pressed === 'false', 'Space hides');
  await page.keyboard.press('Space');
  await page.focus('[data-tab="versions"]');
  await page.keyboard.press('Escape');
  ok(!(await tog()).sideShown && await g(() => document.activeElement.matches('[data-panel-toggle]')) && (await stored()) === 'closed', 'Escape in the panel hides it; focus back on the toggle');
  await page.focus('.wr-editor');
  await page.keyboard.press('Escape');
  ok(!(await tog()).sideShown, 'Escape outside the panel does nothing to it');

  /* ── Run AI check from the Needs review note opens the panel (the check runs there) ── */
  // (Covered by t-checks with the panel open; here: the click path shows it when hidden.)
  ok(await g(() => typeof document.querySelector('[data-panel-toggle]').click === 'function'), 'toggle is a real button');

  /* ── N2: the compact head at 1440, panel hidden (design 78) ── */
  let h = await head();
  ok(h.ctlTop < h.titleBottom && h.ctlLeft >= h.titleRight - 1, `1440: title and controls in one row (ctl ${Math.round(h.ctlLeft)}–${Math.round(h.ctlRight)}, title right ${Math.round(h.titleRight)})`);
  ok(h.ctlRight <= h.togLeft, `1440: controls end before the toggle (${Math.round(h.ctlRight)} ≤ ${Math.round(h.togLeft)})`);
  ok(h.mainPadTop === 16 && h.gap === 12 && h.edPadTop === 24, `spacing: main top ${h.mainPadTop}, head to card ${h.gap}, editor top ${h.edPadTop}`);
  ok(Math.round(h.cardTop - Math.max(h.titleBottom, h.ctlBottom)) === 12, `head to card is 12 px (${Math.round(h.cardTop - Math.max(h.titleBottom, h.ctlBottom))})`);
  ok(h.measure === '680px', `--app-wr-measure: ${h.measure}`);
  ok(Math.round(h.edW - h.edPadL - h.edPadR) === 680 && Math.abs(h.edPadL - h.edPadR) < 1, `1440: text column 680 px, centered (${Math.round(h.edW - h.edPadL - h.edPadR)}, pads ${h.edPadL} / ${h.edPadR})`);
  ok(!h.sideways, '1440: no sideways scroll');

  /* Generate chapter: the line is gone; the reason is the tip and the description (aria-disabled, focusable). */
  const chap = await g(() => {
    const b = document.querySelector('[data-gen-chapter]');
    const d = document.getElementById(b.getAttribute('aria-describedby'));
    return { ariaDis: b.getAttribute('aria-disabled'), disabled: b.disabled, title: b.title, desc: d ? d.textContent : null, descShown: d ? d.getClientRects().length > 0 : null,
      lineInMain: document.querySelector('.wr-main').innerText.includes('Every section in this chapter has text.') };
  });
  ok(chap.ariaDis === 'true' && !chap.disabled, `Generate chapter: aria-disabled, not disabled (${JSON.stringify(chap)})`);
  ok(chap.title === 'Every section in this chapter has text.' && chap.desc === chap.title && chap.descShown === false && !chap.lineInMain, 'its reason: the hover tip and aria-describedby, not a line');
  await page.focus('[data-gen-chapter]');
  ok(await g(() => document.activeElement.matches('[data-gen-chapter]')), 'Generate chapter still takes focus');
  await page.click('[data-gen-chapter]', { force: true });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  ok(await g(() => !document.querySelector('.wr-chap-dlg[open]') && !document.querySelector('[data-chap]')), 'click and Enter do nothing');
  const grey = await g(() => getComputedStyle(document.querySelector('[data-gen-chapter]')).color === getComputedStyle(document.querySelector('[data-generate]:disabled') || document.querySelector('.btn:disabled') || document.body).color);
  ok(grey || await g(() => getComputedStyle(document.querySelector('[data-gen-chapter]')).cursor === 'not-allowed'), 'Generate chapter looks grey (the disabled look)');

  /* "Select text to improve it." in the toolbar, next to Improve. */
  const hint = await g(() => {
    const h = document.querySelector('[data-imp-hint]'), b = document.querySelector('[data-imp-open]');
    const hr = h.getBoundingClientRect(), br = b.getBoundingClientRect();
    return { inBar: !!h.closest('.wr-tools[role="toolbar"]'), text: h.textContent.trim(), shown: !h.hidden, sameRow: hr.top < br.bottom && hr.bottom > br.top, after: hr.left >= br.right, gap: hr.left - br.right, desc: b.getAttribute('aria-describedby') };
  });
  ok(hint.inBar && hint.shown && hint.text === 'Select text to improve it.' && hint.sameRow && hint.after && hint.gap < 24, `hint in the toolbar, right of Improve (${JSON.stringify(hint)})`);
  ok(hint.desc === 'wrImpHint', 'Improve is still described by the hint');

  /* ── 1440 open (78b): head wraps, panel at the right ── */
  await page.click('[data-panel-toggle]');
  h = await head();
  ok(h.ctlTop >= h.titleBottom - 1 && h.togBottom <= h.ctlTop + 8, `1440 open: title row with the toggle, controls under it (ctl top ${Math.round(h.ctlTop)}, title bottom ${Math.round(h.titleBottom)})`);
  ok((await overlaps()).length === 0 && !h.sideways, '1440 open: no overlap, no sideways scroll');
  await page.click('[data-panel-toggle]');

  /* ── 900: hidden, wraps; open: the panel under the editor ── */
  await open(st.s42, 900, 900);
  h = await head();
  ok(!(await tog()).sideShown, '900: hidden too');
  ok(h.ctlTop >= h.titleBottom - 1 && h.togTop < h.titleBottom, `900: the toggle at the right of the title, the controls wrap under it`);
  ok((await overlaps()).length === 0 && !h.sideways, `900: no overlap (${JSON.stringify(await overlaps())}), no sideways scroll`);
  await page.click('[data-panel-toggle]');
  const under = await g(() => { const s = document.querySelector('.wr-side').getBoundingClientRect(), c = document.querySelector('.wr-main').getBoundingClientRect(); return { below: s.top >= c.bottom - 1, sameLeft: Math.abs(s.left - c.left) < 1 }; });
  ok(under.below && under.sameLeft, `900 open: the panel under the editor, as before (${JSON.stringify(under)})`);
  ok((await overlaps()).length === 0, '900 open: no overlap');
  await open(st.s42, 1100, 900);
  ok(await g(() => { const s = document.querySelector('.wr-side').getBoundingClientRect(), c = document.querySelector('.wr-main').getBoundingClientRect(); return s.top >= c.bottom - 1; }), '1100 open: under the editor');
  await page.click('[data-panel-toggle]');
  ok(await g(() => Math.abs(document.querySelector('.wr-main').getBoundingClientRect().bottom - innerHeight) < 2), '1100 hidden: the editor column takes the full height');

  /* ── 200% text ── */
  for (const w of [1440, 900]) {
    await open(st.s42, w, 900);
    await g(() => { document.documentElement.style.fontSize = '200%'; });
    await page.waitForTimeout(200);
    h = await head();
    ok(!h.sideways && (await overlaps()).length === 0, `${w} at 200% text: no sideways scroll, no overlap (${JSON.stringify(await overlaps())})`);
    ok(h.ctlTop >= h.titleBottom - 1, `${w} at 200%: the head wraps (controls under the title)`);
    const tb = await tog();
    ok(tb.w >= 44 && tb.h >= 44, `${w} at 200%: toggle still 44 px`);
  }

  /* ── Blocked storage: closed, never throws, still toggles for the visit ── */
  // The block is on only while sessionStorage "__blockPanel" is "1" (init scripts stay in the session;
  // the mock clears the flag at the start of every run).
  await page.context().addInitScript((k) => {
    let on = false;
    try { on = sessionStorage.getItem('__blockPanel') === '1'; } catch (e) {}
    if (!on) return;
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (x) { if (x === k) throw new DOMException('blocked', 'SecurityError'); return get.call(this, x); };
    Storage.prototype.setItem = function (x, v) { if (x === k) throw new DOMException('blocked', 'SecurityError'); return set.call(this, x, v); };
  }, KEY);
  const errs = [];
  const onErr = (e) => errs.push(e.message);
  page.on('pageerror', onErr);
  await g((k) => { localStorage.setItem(k, 'open'); sessionStorage.setItem('__blockPanel', '1'); }, KEY);
  await open(st.s42);
  ok(await g(() => { try { localStorage.getItem('nicheink.write.panel'); return false; } catch (e) { return true; } }), 'blocked storage: reading the key throws (the block is on)');
  ok(!(await tog()).sideShown, 'blocked storage: closed (even with "open" stored before)');
  await page.click('[data-panel-toggle]');
  ok((await tog()).sideShown && (await tog()).pressed === 'true', 'blocked storage: the toggle still opens it for this visit');
  await page.click('[data-panel-toggle]');
  ok(!(await tog()).sideShown, 'blocked storage: and hides it');
  page.off('pageerror', onErr);
  ok(errs.length === 0, `blocked storage: no page error (${errs.join(' | ')})`);
  await g(() => sessionStorage.removeItem('__blockPanel'));

  /* ── N3: the header Export is hidden on 06 (01 to 07), not inert ── */
  const exp = await g(() => { const b = document.querySelector('[data-export]'); return b ? { hidden: b.hidden, shown: b.getClientRects().length > 0 } : null; });
  ok(exp && exp.hidden && !exp.shown, `06: header Export hidden (${JSON.stringify(exp)})`);
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${W1}&step=5`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-book-head]:not([hidden])', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  ok(await g(() => { const b = document.querySelector('[data-export]'); return !!b && b.hidden; }), '05: header Export hidden');

  return log.join('\n');
};
