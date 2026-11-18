// E16.1 item 3 (design 77, owner Nov 18): snap with a lit guide and a magnet.
// Targets across: both bleed edges, both trim lines, the 4 live-area lines, both folds, the back, spine and front
// centers. Down: both bleed edges, both trim lines, the live-area top and bottom, the middle. An item's left edge,
// center and right edge (top, middle, bottom) snap within 6 screen px, exactly; it stays held until the free
// point is 16 px away (the magnet), unless another target is nearer (dragging past the trim reaches the bleed
// edge). The lit guide (2 px magenta) shows on each held axis, also with Guide lines off, and goes on pointer up.
// A photo's resize corner snaps its moving edge the same way (owner: "a photo stretched to the edge sticks
// exactly to the bleed edge"). Snap off: none. Rotated: its upright bounds snap. Arrow keys: no snap.
// One Undo step per drag.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  await page.evaluate(() => window.kdpBookSteps[9]._debug().applyLayout('picband'));
  await page.waitForTimeout(200);
  const E = (fn, arg) => page.evaluate(([f, a]) => new Function('E', 'a', f)(window.kdpBookSteps[9]._debug(), a), [fn, arg]);   // test-only: runs fixed test code in the mock page
  const G = await page.evaluate(() => kdpCover.geo.geo(window.kdpBookSteps[9]._debug().cover.fmt));
  const z = (await CV.state(page)).z;
  const P = await E('return E.cover.layers.find((l) => l.type === "image").id');
  const T = await E('return E.cover.layers.find((l) => l.src === "title").id');
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  /** Only this layer shows (one hit box), at this box; the rest hidden. */
  const only = async (id, patch) => { await E(`E.commitLayers(E.cover.layers.map((l) => Object.assign({}, l, { hidden: l.id !== a.id }, l.id === a.id ? a.patch : {}))); E.select(a.id); E.view_.sync();`, { id, patch }); await page.waitForTimeout(120); };
  const L = (id) => E('return E.cover.layers.find((l) => l.id === a);', id);
  const lines = () => page.evaluate(() => {
    const v = document.querySelector('[data-snapline]'), h = document.querySelector('[data-snapline-h]');
    const r = (e) => (e.hidden ? null : e.getBoundingClientRect());
    const ws = document.querySelector('[data-ws]').getBoundingClientRect();
    const rv = r(v), rh = r(h);
    return { v: rv && rv.left + rv.width / 2 - ws.left, h: rh && rh.top + rh.height / 2 - ws.top, w: rv ? rv.width : rh ? rh.height : 0, glow: getComputedStyle(v).boxShadow };
  });
  const sx = (bx) => E('return E.view.px + a * E.view.z;', bx);
  const sy = (by) => E('return E.view.py + a * E.view.z;', by);
  /** Press on the layer's box, move by (dx, dy) screen px in 8 steps; hold: keep the button down. */
  async function drag(id, dx, dy, hold) {
    const c = await page.$eval(`[data-hit="${id}"]`, (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.move(c[0], c[1]); await page.mouse.down();
    await page.mouse.move(c[0] + dx, c[1] + dy, { steps: 8 });
    const out = { l: await L(id), lit: await lines(), at: [c[0] + dx, c[1] + dy] };
    if (!hold) await page.mouse.up();
    return out;
  }
  const W = 120, H = 80, pic = (x, y) => ({ x, y, w: W, h: H, rot: 0, px: 0, py: 0, pw: W, ph: H });
  const calmY = G.H * 0.3, calmX = 60;   // no target near any of the item's 3 points on the other axis

  /* Across: each target, from 30 screen px away to 3 px away (gap). k: 0 left edge, 1 center, 2 right edge.
     The spine is about 7 screen px wide: its fold and center targets are 4 board px apart, so the nearest one wins;
     the spine cases come from outside the spine or end 1 px away. */
  const X = [['left bleed edge', 0, 0, -1], ['left trim line', G.b, 0, 1], ['back live-area left', G.liveBack.x0, 0, 1], ['back live-area right', G.liveBack.x1, 2, -1],
    ['spine fold left', G.foldL, 2, -1], ['spine fold right', G.foldR, 0, 1], ['front live-area left', G.liveFront.x0, 0, 1], ['front live-area right', G.liveFront.x1, 2, -1],
    ['right trim line', G.W - G.b, 2, -1], ['right bleed edge', G.W, 2, 1], ['back center', G.backCX, 1, 1], ['spine center', G.spineCX, 1, 1, 1], ['front center', G.frontCX, 1, -1]];
  for (const [name, t, k, side, gap = 3] of X) {
    // side 1: start right of the target and move left; -1: start left and move right.
    const x0 = t + side * 30 / z - k * W / 2;
    await only(P, pic(x0, calmY));
    const d = await drag(P, -side * (30 - gap), 0);
    const got = d.l.x + k * W / 2;
    ok(close(got, t), `${name}: the ${['left edge', 'center', 'right edge'][k]} lands exactly on it (${got.toFixed(3)} / ${t.toFixed(3)})`);
    ok(d.lit.v != null && Math.abs(d.lit.v - (await sx(t))) <= 1 && d.lit.h == null, `${name}: the lit guide at the target, across only`);
  }
  ok(/rgba\(214, 36, 159, 0\.22\) 0px 0px 0px 3px/.test((await lines()).glow), `the lit guide has its soft glow (${(await lines()).glow})`);

  /* Down: top, middle, bottom. */
  const Y = [['top bleed edge', 0, 0, -1], ['top trim line', G.b, 0, 1], ['live-area top', G.liveBack.y0, 0, 1], ['middle', G.midY, 1, 1],
    ['live-area bottom', G.liveBack.y1, 2, -1], ['bottom trim line', G.H - G.b, 2, -1], ['bottom bleed edge', G.H, 2, -1]];
  for (const [name, t, k, side] of Y) {
    const y0 = t + side * 30 / z - k * H / 2;
    await only(P, pic(calmX, y0));
    const d = await drag(P, 0, -side * 27);
    const got = d.l.y + k * H / 2;
    ok(close(got, t), `${name}: the ${['top', 'middle', 'bottom'][k]} lands exactly on it (${got.toFixed(3)} / ${t.toFixed(3)})`);
    ok(d.lit.h != null && Math.abs(d.lit.h - (await sy(t))) <= 1 && d.lit.v == null, `${name}: the lit guide at the target, down only`);
  }

  /* The lit guide: 2 px, shown during the drag, gone on pointer up. */
  await only(P, pic(G.liveBack.x0 + 30 / z, calmY));
  let d = await drag(P, -27, 0, true);
  ok(Math.round(d.lit.w) === 2, `the lit guide is 2 px (${d.lit.w})`);
  // The magnet: +10 px further: still held; +10 more (20 from the target): it lets go.
  await page.mouse.move(d.at[0] + 10, d.at[1], { steps: 4 });
  let l = await L(P), lit = await lines();
  ok(close(l.x, G.liveBack.x0) && lit.v != null, `magnet: 10 px past, it stays on the line (${l.x.toFixed(2)})`);
  await page.mouse.move(d.at[0] + 20, d.at[1], { steps: 4 });
  l = await L(P); lit = await lines();
  ok(!close(l.x, G.liveBack.x0) && Math.abs(l.x - (G.liveBack.x0 + 23 / z)) < 0.01 && lit.v == null, `magnet: 20 px away it lets go and follows the pointer (${l.x.toFixed(2)})`);
  await page.mouse.up();
  ok((await lines()).v == null && (await lines()).h == null, 'pointer up: no lit guide');

  /* Past the trim to the bleed edge: the trim holds first, the nearer bleed edge takes over. */
  await only(P, pic(G.b + 20 / z, calmY));
  d = await drag(P, -(20 + G.b * z) - 2, 0);
  ok(close(d.l.x, 0), `dragged out past the trim line, the left edge sticks to the bleed edge (${d.l.x.toFixed(3)})`);

  /* Both axes at once. */
  await only(P, pic(G.liveFront.x0 + 4 / z, G.liveFront.y0 + 4 / z));
  d = await drag(P, -1, -1);
  ok(close(d.l.x, G.liveFront.x0) && close(d.l.y, G.liveFront.y0) && d.lit.v != null && d.lit.h != null, 'x and y at once: the corner on the live-area corner, both guides lit');

  /* Guide lines off: the lit guide still shows. */
  await page.uncheck('[data-k="guides"]');
  await only(P, pic(G.frontCX - W / 2 + 30 / z, calmY));
  d = await drag(P, -27, 0);
  ok(close(d.l.x + W / 2, G.frontCX) && d.lit.v != null, 'Guide lines off: it still snaps, the lit guide shows');
  await page.check('[data-k="guides"]');

  /* The title (text) on the front center. */
  await only(T, {});
  const tl = await L(T);
  await E('E.setLayer(a.id, { x: a.x });', { id: T, x: G.frontCX - tl.w / 2 + 30 / z });
  await page.waitForTimeout(120);
  d = await drag(T, -27, 0);
  ok(close(d.l.x + d.l.w / 2, G.frontCX), 'the title: its center on the front center');

  /* A rotated picture: its upright bounds snap. */
  await only(P, Object.assign(pic(0, calmY), { rot: 30 }));
  const bb = await E('const l = E.cover.layers.find((x) => x.id === a); return kdpCover.model.bbox(l, E.textH);', P);
  await E('const l = E.cover.layers.find((x) => x.id === a.id); E.setLayer(a.id, { x: l.x + (a.t - a.bx) + a.off });', { id: P, t: G.liveBack.x0, bx: bb.x, off: 30 / z });
  await page.waitForTimeout(120);
  d = await drag(P, -27, 0);
  const bb2 = await E('const l = E.cover.layers.find((x) => x.id === a); return kdpCover.model.bbox(l, E.textH);', P);
  ok(close(bb2.x, G.liveBack.x0), `rotated 30°: the bounds' left edge on the live-area line (${bb2.x.toFixed(3)})`);

  /* Resize: the corner's moving edge snaps (the photo stretched to the bleed edge). */
  await only(P, pic(G.W - W - 30 / z, calmY));
  let hd = await page.$eval('[data-handle="scale"][data-c="se"]', (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(hd[0], hd[1]); await page.mouse.down(); await page.mouse.move(hd[0] + 28, hd[1], { steps: 8 });
  l = await L(P); lit = await lines();
  ok(close(l.x + l.w, G.W) && close(l.h / l.w, H / W) && lit.v != null, `resize (bottom right corner): the right edge sticks to the right bleed edge, the shape kept (${(l.x + l.w).toFixed(3)} / ${G.W})`);
  await page.mouse.up();
  await only(P, pic(30 / z + 2, calmY));
  hd = await page.$eval('[data-handle="scale"][data-c="nw"]', (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(hd[0], hd[1]); await page.mouse.down(); await page.mouse.move(hd[0] - 31, hd[1], { steps: 8 });
  l = await L(P);
  ok(close(l.x, 0) && close(l.x + l.w, 30 / z + 2 + W), `resize (top left corner): the left edge sticks to the left bleed edge, the right edge stays (${l.x.toFixed(3)})`);
  await page.mouse.up();

  /* Snap off: nothing snaps, no guide. */
  await page.uncheck('[data-k="snap"]');
  await only(P, pic(G.liveBack.x0 + 30 / z, calmY));
  d = await drag(P, -27, 0);
  ok(Math.abs(d.l.x - (G.liveBack.x0 + 3 / z)) < 0.01 && d.lit.v == null, `Snap off: it stops where the pointer puts it (${d.l.x.toFixed(3)}), no guide`);
  await page.check('[data-k="snap"]');

  /* Arrow keys: 1 px steps, no snap. */
  await only(P, pic(G.liveBack.x0 + 2, calmY));
  await page.focus(`[data-hit="${P}"]`);
  await page.keyboard.press('ArrowLeft');
  l = await L(P);
  ok(close(l.x, G.liveBack.x0 + 1), `arrow key: 1 px, no snap (${l.x.toFixed(3)})`);

  /* One Undo step per drag, magnet or not. */
  await only(P, pic(G.liveBack.x0 + 30 / z, calmY));
  await page.waitForTimeout(600);
  const h0 = await E('return E.hist.size().past;');
  d = await drag(P, -27, 0, true);
  await page.mouse.move(d.at[0] + 10, d.at[1], { steps: 3 }); await page.mouse.move(d.at[0] - 5, d.at[1], { steps: 3 });
  await page.mouse.up();
  ok((await E('return E.hist.size().past;')) === h0 + 1, 'one drag with the magnet: one Undo step');

  await E('E.commitLayers(E.cover.layers.map((l) => Object.assign({}, l, { hidden: false })));');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
