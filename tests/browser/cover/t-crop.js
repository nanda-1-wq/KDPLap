// E16 Part 6: crop (design 62, the design's cropping, clampPic, crop drag, onCropZoom, resetCrop, coverFit).
// Crop from the bar, a double-click or Enter on a selected picture; 4 black bars and 4 black corners (labelled
// buttons, arrow keys too), no rotate handle, a dashed frame; an edge drag cuts the box (20 px at least) and the
// picture stays put; a drag on the picture moves it inside the box (never past an edge), arrow keys too; Zoom 100
// to 300 % around the middle; Reset; Done and Escape; the faded ghost of the whole picture behind the box; crop
// mode ends on select, undo and delete; the DPI badge follows (natW · 70 / pw).
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  await PIC.ready(page);
  await PIC.make(page, 'a', { w: 3000, h: 2000, type: 'image/jpeg', name: 'desk.jpg' });
  await PIC.pick(page, 'a'); await PIC.idle(page); await PIC.drawn(page);
  const id = (await PIC.layers(page)).pop().id;
  // A box 300 × 300 over a 3:2 picture: covered, so the picture is wider than the box (room to move sideways).
  await page.evaluate((id) => { const E = window.kdpBookSteps[9]._debug(), l = E.cover.layers.find((x) => x.id === id); E.setLayer(id, Object.assign({ x: 560, y: 120, w: 300, h: 300 }, kdpCover.model.coverFit(l, { w: 300, h: 300 }))); E.select(id); }, id);
  const L = () => page.evaluate((id) => window.kdpBookSteps[9]._debug().cover.layers.find((x) => x.id === id), id);
  const crop = () => page.evaluate(() => window.kdpBookSteps[9]._debug().cropping);
  let l = await L();
  ok(Math.abs(l.pw - 450) < 1e-6 && Math.abs(l.ph - 300) < 1e-6 && Math.abs(l.px + 75) < 1e-6, `fitted: the picture 450 × 300 centered (px ${l.px})`);

  /* Start crop: the bar button. */
  await page.click('[data-k="crop"]');
  ok(await crop() === id, 'Crop starts crop mode');
  ok(await page.$eval('[data-textbar]', (b) => b.getAttribute('aria-label') === 'Crop the picture'), 'the bar: "Crop the picture"');
  const barText = await CV.txt(page, '[data-textbar]');
  ok(/^Crop Drag the black handles to cut the edges\. Drag the picture to move it\. Zoom/.test(barText) && /Reset/.test(barText) && /Done/.test(barText), `the crop bar is the design's: ${barText.slice(0, 90)}…`);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-crop-zoom]')), 'focus goes to Zoom');
  const hs = await page.$$eval('[data-handle]', (a) => a.map((h) => [h.dataset.handle, h.dataset.c, h.getAttribute('aria-label')]));
  ok(hs.length === 8 && hs.every((h) => h[0] === 'crop') && hs.map((h) => h[1]).join(' ') === 'nw n ne e se s sw w', `8 crop handles: ${hs.map((h) => h[1]).join(' ')}`);
  ok(hs.every((h) => /^Drag to crop, .+\. Arrow keys work too\.$/.test(h[2])), 'each is a labelled button ("Drag to crop, top left. Arrow keys work too.")');
  ok(!(await page.$('[data-handle="rot"]')) && !(await page.$('.cv-rotline')), 'no rotate handle while cropping');
  ok(await page.$eval('[data-selbox]', (n) => n.classList.contains('is-crop') && getComputedStyle(n).outlineStyle === 'dashed'), 'the frame is dashed');
  const sizes = await page.evaluate(() => [...document.querySelectorAll('[data-handle="crop"]')].map((h) => { const r = h.getBoundingClientRect(); return [h.dataset.c, Math.round(r.width), Math.round(r.height), getComputedStyle(h).backgroundColor]; }));
  ok(sizes.filter((s) => s[0].length === 2).every((s) => s[1] === 12 && s[2] === 12) && sizes.filter((s) => s[0] === 'n' || s[0] === 's').every((s) => s[1] === 26 && s[2] === 7) && sizes.filter((s) => s[0] === 'e' || s[0] === 'w').every((s) => s[1] === 7 && s[2] === 26), 'corners 12 × 12, bars 26 × 7 (the design\'s, at zoom 1)');
  ok(sizes.every((s) => s[3] === 'rgb(28, 28, 26)'), 'black (ink) handles');
  const area = await page.evaluate(() => [...document.querySelectorAll('[data-handle="crop"]')].map((h) => { const a = getComputedStyle(h, '::after'), z = window.kdpBookSteps[9]._debug().view.z; return Math.min(parseFloat(a.width), parseFloat(a.height)) * z; }));
  ok(area.every((a) => a >= 43.5), 'each has a 44 × 44 click area');

  /* The ghost: outside the box, the picture shows faded (left of the box, 30 px out, where the picture reaches 75 px). */
  await page.waitForTimeout(200);
  const box = await page.$eval(`[data-hit="${id}"]`, (n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  const zoom = await page.evaluate(() => window.kdpBookSteps[9]._debug().view.z);
  const out = await CV.px(page, box.l - 30 * zoom, box.t + 20);
  await page.click('[data-k="crop-done"]');
  await page.waitForTimeout(250);
  const outOff = await CV.px(page, box.l - 30 * zoom, box.t + 20);
  ok(out.join() !== outOff.join(), `the ghost shows outside the box while cropping (${out} vs ${outOff} after Done)`);
  ok(await crop() == null && await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-k="crop"]')), 'Done ends crop mode; focus back on Crop');
  ok(await page.$$eval('[data-handle]', (a) => a.length) === 5 && await page.$$eval('[data-handle="scale"]', (a) => a.length) === 4, 'back to the 4 corners and rotate');

  /* Double-click and Enter start it too. */
  const [cx, cy] = await CV.center(page, id);
  await page.mouse.dblclick(cx, cy);
  ok(await crop() === id, 'a double-click on the picture starts crop mode');
  await page.keyboard.press('Escape');
  ok(await crop() == null && (await CV.state(page)).sel === id, 'Escape ends crop mode and keeps the picture selected');
  await page.focus(`[data-hit="${id}"]`); await page.keyboard.press('Enter');
  ok(await crop() === id, 'Enter on the selected picture\'s box starts crop mode');

  /* Edge drags: the right bar in 100 px, the left bar in 50 px; the picture stays where it was on the cover. */
  const hpos = (c) => page.$eval(`[data-handle="crop"][data-c="${c}"]`, (h) => { const r = h.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const drag = async ([x, y], dx, dy) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 }); await page.mouse.move(x + dx, y + dy, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(50); };
  l = await L();
  const picX = l.x + l.px;
  await drag(await hpos('e'), -100 * zoom, 0);
  let m = await L();
  ok(Math.abs(m.w - 200) < 0.6 && Math.abs(m.x - l.x) < 1e-6 && Math.abs(m.pw - l.pw) < 1e-6, `the right bar cuts the box to ${m.w.toFixed(1)} px; the picture is unchanged`);
  await drag(await hpos('w'), 50 * zoom, 0);
  m = await L();
  ok(Math.abs(m.w - 150) < 1 && Math.abs((m.x + m.px) - picX) < 1e-6, `the left bar cuts 50 px; the picture stays put on the cover (x + px = ${(m.x + m.px).toFixed(2)})`);
  ok(m.x > l.x + 49, 'the box moved right');
  await drag(await hpos('s'), 0, -400 * zoom);
  m = await L();
  ok(Math.abs(m.h - 20) < 1e-6, `a bar never cuts under 20 px (h ${m.h})`);
  await drag(await hpos('s'), 0, 900 * zoom);
  m = await L();
  ok(Math.abs(m.h - (m.py + m.ph)) < 1e-6, `nor past the picture's edge (h ${m.h.toFixed(1)} = py + ph)`);
  // keyboard on a crop handle
  await page.focus('[data-handle="crop"][data-c="e"]');
  const w0 = (await L()).w;
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
  ok(Math.abs((await L()).w - (w0 - 11)) < 1e-6, 'arrow keys on the right bar: 1 px, Shift 10 px');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.handle === 'crop'), 'the handle keeps focus');

  /* Reset (coverFit), then move the picture: drag and arrows, clamped. */
  await page.click('[data-k="crop-reset"]');
  m = await L();
  ok(Math.abs(m.px - (m.w - m.pw) / 2) < 1e-6 && Math.abs(Math.max(m.w / m.pw, m.h / m.ph) - 1) < 1e-6, 'Reset fits the picture to the box again');
  const [hx, hy] = await CV.center(page, id);
  await drag([hx, hy], 500 * zoom, 0);
  m = await L();
  ok(Math.abs(m.px) < 1e-6, `a drag to the right stops at the picture's left edge (px ${m.px})`);
  await drag([hx, hy], -1000 * zoom, 0);
  m = await L();
  ok(Math.abs(m.px - (m.w - m.pw)) < 1e-6, `a drag to the left stops at its right edge (px ${m.px.toFixed(1)})`);
  await page.focus(`[data-hit="${id}"]`);
  const p0 = (await L()).px;
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowRight');
  const mv = await L();
  ok(Math.abs(mv.px - (p0 + 11)) < 1e-6 && mv.x === m.x, 'arrow keys in crop mode move the picture inside the box (1 px, Shift 10 px), not the layer');

  /* Zoom 200 %: twice the fill size around the middle; DPI halves; 100 % is the floor. */
  await page.click('[data-k="crop-reset"]');
  m = await L();
  const dpi0 = Math.round(m.natW * 70 / m.pw);
  ok((await CV.txt(page, '[data-dpi]')).includes(`${dpi0} DPI`) && (await CV.txt(page, '[data-crop-pct]')) === '100%', `Zoom 100 %, DPI ${dpi0} in the crop bar`);
  await page.$eval('[data-crop-zoom]', (i) => { i.value = '200'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  const z2 = await L();
  ok(Math.abs(z2.pw - 2 * m.pw) < 1e-6 && Math.abs((z2.w / 2 - z2.px) / z2.pw - (m.w / 2 - m.px) / m.pw) < 1e-6, 'Zoom 200 %: twice the size, the middle kept');
  ok((await CV.txt(page, '[data-crop-pct]')) === '200%' && (await CV.txt(page, '[data-dpi]')).includes(`${Math.round(z2.natW * 70 / z2.pw)} DPI`), `the % and the DPI follow (${await CV.txt(page, '[data-dpi]')})`);
  await page.$eval('[data-crop-zoom]', (i) => i.dispatchEvent(new Event('change', { bubbles: true })));
  ok(await page.$eval('[data-crop-zoom]', (i) => i.min === '100' && i.max === '300' && i.step === '5'), 'Zoom runs 100 to 300 % in 5 % steps');
  await page.waitForTimeout(600);

  /* Crop mode ends on select, undo and delete. */
  const title = await CV.layer(page, 'title');
  await page.focus(`[data-hit="${title.id}"]`); await page.keyboard.press('Enter');
  ok(await crop() == null, 'selecting another layer ends crop mode');
  await page.focus(`[data-hit="${id}"]`); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  ok(await crop() === id, 'crop again');
  await page.keyboard.press('Meta+z');
  ok(await crop() == null, 'Undo ends crop mode');
  ok(Math.abs((await L()).pw - m.pw) < 1e-6, 'Undo takes the zoom back');
  await page.focus(`[data-hit="${id}"]`); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.focus(`[data-hit="${id}"]`);
  await page.keyboard.press('Delete');
  ok(await crop() == null && !(await L()), 'Delete removes the picture and ends crop mode');
  await page.keyboard.press('Meta+z');
  ok(!!(await L()), 'Undo brings it back');
  ok(await page.evaluate((id) => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.images.state(E, E.cover.layers.find((l) => l.id === id)); }, id) === 'ready', 'still drawn after undo (the store keeps the picture)');

  /* Locking or hiding it from the Layers panel ends crop mode (the Zoom and arrow keys must not move a locked picture). */
  await page.focus(`[data-hit="${id}"]`); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  ok(await crop() === id, 'crop again');
  await page.click('[data-tool="layers"]');
  await page.click(`[data-lk="${id}"]`);
  ok((await L()).lock && await crop() == null, 'locked from the Layers panel: crop mode ends');
  ok(!(await page.$('[data-crop-zoom]')) && !(await page.$('[data-handle="crop"]')), 'no crop bar or handles on a locked picture');
  await page.evaluate((id) => { const E = window.kdpBookSteps[9]._debug(); E.setLayer(id, { lock: false }); E.select(null); }, id);
  await page.click('[data-tool="text"]');

  /* A locked picture cannot be cropped. */
  await page.focus(`[data-hit="${id}"]`); await page.keyboard.press('Enter');
  await page.click('[data-k="lock"]');
  ok(await page.$eval('[data-k="crop"]', (b) => b.getAttribute('aria-disabled') === 'true' && b.title === 'Unlock the picture first'), 'locked: Crop is off ("Unlock the picture first")');
  await page.click('[data-k="crop"]', { force: true });
  ok(await crop() == null, 'and does nothing');

  /* The DPI badge: green 300 and up, amber 200 to 299 ("may print soft"), red under 200 ("too low"), each with an icon. */
  await page.click('[data-k="lock"]');
  const badge = async (pw) => { await page.evaluate(([id, pw]) => window.kdpBookSteps[9]._debug().setLayer(id, { pw, ph: pw * 2 / 3 }), [id, pw]); return page.$eval('[data-dpi]', (b) => [b.className, b.innerText.trim(), !!b.querySelector('svg'), b.title]); };
  let bd = await badge(700);
  ok(/is-ok/.test(bd[0]) && bd[1] === '300 DPI' && bd[2], `3000 px over 700 px: "${bd[1]}", green, with a check icon`);
  bd = await badge(710);
  ok(/is-warn/.test(bd[0]) && bd[1] === '296 DPI · may print soft' && bd[2], `under 300: "${bd[1]}", amber, icon`);
  bd = await badge(1050);
  ok(/is-warn/.test(bd[0]) && bd[1] === '200 DPI · may print soft', `200: "${bd[1]}"`);
  bd = await badge(1060);
  ok(/is-bad/.test(bd[0]) && bd[1] === '198 DPI · too low' && bd[2], `under 200: "${bd[1]}", red, icon`);
  ok(bd[3] === 'KDP asks for 300 DPI or more. DPI drops when you make the picture bigger or crop into it.', 'its title is the design\'s help');
  const c10 = await page.evaluate((id) => kdpCover.checks.run(window.kdpBookSteps[9]._debug().cover).filter((c) => c.id === id && c.code === 'C10').map((c) => c.sev), id);
  ok(c10.join() === 'error', 'under 200 DPI is a C10 Must fix');
  ok(st.cdn.filter((c) => c.startsWith('NET ')).length === 0 && CV.mockErrors().length === 0, 'no network, no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
