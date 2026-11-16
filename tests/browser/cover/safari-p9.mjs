// node tests/browser/cover/safari-p9.mjs   (from the repo root; real Safari through safaridriver)
// E16 Part 9, owner STOP 9: a short Safari pass of Preview final and the narrow layout: the Checks drawer, Preview
// final (As printed, With bleed, black and white, the Kindle and search-size pictures painted), the window at 1024 px
// (the panel over the cover; Text effects with every slider in view), at 800 px (the notice) and back.
// Mocked as safari-editor.mjs: a small server on port 5511 puts tests/browser/cover/safari-stub.js into app/book.html,
// so every Supabase call is answered in the page; the run fails if one request reaches the Supabase host. Real clicks
// and keys go through WebDriver. Results: $COVER_OUT/safari-p9.json and safari-p9-*.png. Exit 1 on a failed check.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, OUT, save, log } from './lib.mjs';
import { spawn } from 'node:child_process';

/** safaridriver as in tests/browser/format/lib.mjs safari(), plus a 1440 × 900 window (Safari opens 800 × 600, under 09's 900 px). */
async function safari() {
  const WD = 'http://127.0.0.1:4567';
  const alive = async () => { try { return (await fetch(`${WD}/status`)).ok; } catch { return false; } };
  let driver = null;
  if (!(await alive())) {
    driver = spawn('safaridriver', ['-p', '4567'], { stdio: 'ignore', detached: true });
    for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const call = async (method, p, body) => {
    const r = await fetch(WD + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    if (!r.ok) throw new Error(`${p}: ${JSON.stringify(j.value || j).slice(0, 300)}`);
    return j.value;
  };
  const se = await call('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  const sid = se.sessionId;
  await call('POST', `/session/${sid}/timeouts`, { script: 900000, pageLoad: 120000 });
  await call('POST', `/session/${sid}/window/rect`, { x: 0, y: 0, width: 1440, height: 900 });
  return {
    version: se.capabilities.browserVersion,
    open: (url) => call('POST', `/session/${sid}/url`, { url }),
    run: (body, args = []) => call('POST', `/session/${sid}/execute/async`, { script: `const done = arguments[arguments.length - 1]; (async (...a) => { ${body} })(...arguments).then(done, (e) => done({ error: String(e && e.message) }));`, args }),
    // real input through WebDriver (not page scripts): element clicks, pointer and key actions, a file on the real field
    el: async (css) => Object.values(await call('POST', `/session/${sid}/element`, { using: 'css selector', value: css }))[0],
    click: async (css) => { const id = Object.values(await call('POST', `/session/${sid}/element`, { using: 'css selector', value: css }))[0]; await call('POST', `/session/${sid}/element/${id}/click`, {}); },
    sendFile: async (css, file) => { const id = Object.values(await call('POST', `/session/${sid}/element`, { using: 'css selector', value: css }))[0]; await call('POST', `/session/${sid}/element/${id}/value`, { text: file }); },
    actions: (list) => call('POST', `/session/${sid}/actions`, { actions: list }),
    release: () => call('DELETE', `/session/${sid}/actions`),
    rect: (width, height) => call('POST', `/session/${sid}/window/rect`, { x: 0, y: 0, width, height }),
    shot: async (file) => { const b64 = await call('GET', `/session/${sid}/screenshot`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(b64, 'base64')); },
    async close() { await call('DELETE', `/session/${sid}`); if (driver) process.kill(-driver.pid); }
  };
}

const PORT = 5511;
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml', json: 'application/json', ttf: 'font/ttf', woff2: 'font/woff2', txt: 'text/plain' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(REPO, u === '/' ? 'index.html' : u);
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(p);
  if (u === '/app/book.html') {
    const html = body.toString('utf8');
    const at = html.indexOf('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js');
    if (at < 0) { res.writeHead(500); res.end('no supabase-js tag'); return; }
    body = Buffer.from(html.slice(0, at) + '<script src="../tests/browser/cover/safari-stub.js"></script>\n  ' + html.slice(at));
  }
  res.writeHead(200, { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

let pass = 0;
const fails = [];
const R = { date: new Date().toISOString(), steps: {} };
const expect = (ok, what) => { if (ok) pass++; else fails.push(what); return ok; };
const s = await safari();
R.safari = s.version;
const W = 'const wait = async (f, ms = 20000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 50)); } };';
// A real click that is tried again when the bar was drawn again under it (WebDriver then clicks a replaced element).
const clickFor = async (css, cond) => { for (let i = 0; i < 4; i++) { try { await s.click(css); } catch (e) { /* drawn again: try once more */ } if (await s.run(`for (let i = 0; i < 20; i++) { if (${cond}) return true; await new Promise((r) => setTimeout(r, 50)); } return false;`)) return true; } return false; };
const st = (expr) => s.run(`const E = window.kdpBookSteps[9]._debug(), C = window.kdpCover; return (${expr});`);
try {
  log('Safari', s.version);
  await s.open(`http://127.0.0.1:${PORT}/app/book.html?id=c9c9c9c9-0000-4000-8000-000000000009&step=9`);
  const open = await s.run(`for (let i = 0; i < 600; i++) { const m = window.kdpBookSteps && window.kdpBookSteps[9]; const E = m && m._debug(); if (E && E.status === 'ready' && E.painted > 0) return { ok: true, w: innerWidth, h: innerHeight }; if (E && (E.status === 'error' || E.status === 'locked')) return { ok: false, status: E.status }; await new Promise((r) => setTimeout(r, 100)); } return { ok: false, status: 'timeout' };`);
  R.steps.open = open;
  expect(open.ok, `the editor opens in Safari: ${JSON.stringify(open)}`);
  // Safari's window has a toolbar: the window is made taller by its height, so the page itself is 1440 × 900 (as Chrome's viewport).
  const chrome = await s.run(`return outerHeight - innerHeight;`);
  const view = async (w, h) => { const got = await s.rect(w, h + chrome); (R.rects = R.rects || []).push([w, h + chrome, got && got.width, got && got.height]); await s.run(`await new Promise((r) => setTimeout(r, 300)); return true;`); };
  await view(1440, 900);
  R.steps.viewport = await s.run(`return [innerWidth, innerHeight];`);

  // The design's book on the cover: Band with the warm blurb (layouts.js), its fonts loaded; the subtitle at 6 pt (F70).
  R.steps.band = await s.run(`${W} const E = window.kdpBookSteps[9]._debug(), C = window.kdpCover;
    const blurb = 'You signed up for the course. Then work, family and tired evenings got in the way. This book is for the nights you have twenty minutes and almost no energy left.';
    const r = C.layouts.build('band', { title: 'Micro Study Habits for Busy Adult Learners', subtitle: 'How to Keep Up With Your Course After Work, Even on Low-Energy Days', pen: 'Adnan Haroun' }, E.cover.fmt, 1, blurb);
    await C.fonts.loadAll(r.layers);
    r.layers.find((l) => l.src === 'subtitle').size = 6;
    E.commitLayers(r.layers);
    await wait(() => E.saveState === 'saved' && !E.saver.pending(), 15000);
    return { layers: E.cover.layers.length, chip: document.querySelector('[data-k="chk"]').textContent.trim() };`);
  expect(R.steps.band.layers === 5 && R.steps.band.chip === '1 to fix', `Band on the cover, the chip says 1 to fix: ${JSON.stringify(R.steps.band)}`);

  log('checks drawer');
  R.steps.before = await s.run(`const E = window.kdpBookSteps[9]._debug(); const c = document.querySelector('[data-k="chk"]'); const r = c && c.getBoundingClientRect(); return { w: innerWidth, h: innerHeight, mode: E.width, tiny: !!document.querySelector('[data-tiny]'), inert: document.querySelector('.book-layout').inert, chk: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width)] : null, at: r ? (document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) || {}).className : null };`);
  await s.shot(path.join(OUT, 'safari-p9-before.png')).catch(() => {});
  await clickFor('[data-k="chk"]', `!!document.querySelector('aside[aria-label="Checks"]')`);
  R.steps.checks = await st(`(() => { const a = document.querySelector('aside[aria-label="Checks"]'); if (!a) return null; const r = a.getBoundingClientRect(); return { w: Math.round(r.width), items: [...a.querySelectorAll('.cv-ck-item')].map((n) => n.dataset.ckCode + ':' + n.querySelector('.cv-ck-tag').textContent.trim()), focus: document.activeElement && document.activeElement.textContent.trim() }; })()`);
  expect(R.steps.checks && R.steps.checks.w === 380 && R.steps.checks.items.join() === 'C2:Must fix' && R.steps.checks.focus === 'Show me', `a real click opens the drawer: ${JSON.stringify(R.steps.checks)}`);
  await s.shot(path.join(OUT, 'safari-p9-checks-1440.png')).catch(() => {});
  await s.click('[data-ck-show]');
  R.steps.showMe = await st(`{ sel: E.sel, sub: E.cover.layers.find((l) => l.src === 'subtitle').id, open: E.checksOpen, focus: document.activeElement && document.activeElement.dataset.hit }`);
  expect(R.steps.showMe.sel === R.steps.showMe.sub && !R.steps.showMe.open && String(R.steps.showMe.focus) === String(R.steps.showMe.sub), `Show me: the subtitle selected, the drawer closed, its box focused: ${JSON.stringify(R.steps.showMe)}`);
  await s.run(`const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.src === 'subtitle'); E.setLayer(l.id, { size: 13 }); E.select(null); return true;`);

  log('preview final');
  await clickFor('[data-k="pv"]', `!!document.querySelector('[data-pv]')`);
  const PV = `${W} const E = window.kdpBookSteps[9]._debug(); await wait(() => E.pv.painted > 0, 15000); await new Promise((r) => setTimeout(r, 300));
    const px = (sel, fx, fy) => { const c = document.querySelector(sel), d = c.width / c.getBoundingClientRect().width, r = c.getBoundingClientRect(); return [...c.getContext('2d').getImageData(Math.round(r.width * fx * d), Math.round(r.height * fy * d), 1, 1).data].slice(0, 3); };
    const size = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };`;
  R.steps.preview = await s.run(`${PV}
    const g = kdpCover.geo.geo(E.cover.fmt);
    return { modal: !!document.querySelector('[role="dialog"][aria-modal="true"][data-pv]'), big: size('[data-pv-big]'), shape: (g.W - 2 * g.b) / g.trimH, navy: px('[data-pv-big]', 0.75, 0.5), corner: px('[data-pv-big]', 0.01, 0.01), bg: E.cover.bg,
      kindle: size('[data-pv-kindle]'), kNavy: px('[data-pv-kindle]', 0.5, 0.4), thumb: size('[data-pv-thumb]'), tNavy: px('[data-pv-thumb]', 0.5, 0.4),
      words: document.querySelector('.cv-pv-kcard .cv-pv-p').textContent, note: document.querySelector('[data-pv-note]').textContent, focus: document.activeElement && document.activeElement.textContent.trim(), dpr: devicePixelRatio, cw: document.querySelector('[data-pv-big]').width };`);
  const P = R.steps.preview;
  const navy = (c) => c && c[2] > c[0] + 30 && c[0] < 70;
  expect(P.modal && P.focus === 'Back to editing', `Preview final opens as a modal, focus on Back to editing: ${P.focus}`);
  expect(Math.abs(P.big[0] / P.big[1] - P.shape) < 0.01 && P.big[0] <= 940 && P.big[1] <= 660 && Math.abs(P.cw - P.big[0] * P.dpr) <= 2, `As printed: ${P.big.join(' × ')} px, the trim box's shape, ${P.cw} device px wide`);
  expect(navy(P.navy) && navy(P.kNavy) && navy(P.tNavy), `Safari paints the cover, the Kindle and the search size (navy ${P.navy} / ${P.kNavy} / ${P.tNavy})`);
  expect(P.kindle.join('×') === '200×320' && P.thumb.join('×') === '75×120', 'Kindle 200 × 320, search size 75 × 120');
  expect(/0\.19 in trimmed from each side/.test(P.words) && /Everything you see here goes into your files/.test(P.note), 'the Kindle words and the line under the cover');
  await s.shot(path.join(OUT, 'safari-p9-preview-1440.png')).catch(() => {});
  await s.click('[data-pv-cut="0"]');
  await s.click('.cv-pv-gray input');
  R.steps.bleedBw = await s.run(`${PV} const g = kdpCover.geo.geo(E.cover.fmt);
    return { big: size('[data-pv-big]'), shape: g.W / g.H, gray: [...document.querySelectorAll('.cv-pv .is-gray')].map((n) => getComputedStyle(n).filter), pressed: document.querySelector('[data-pv-cut="0"]').getAttribute('aria-pressed') };`);
  expect(Math.abs(R.steps.bleedBw.big[0] / R.steps.bleedBw.big[1] - R.steps.bleedBw.shape) < 0.01 && R.steps.bleedBw.pressed === 'true', `With bleed: ${R.steps.bleedBw.big.join(' × ')} px, the wrap's shape`);
  expect(R.steps.bleedBw.gray.length === 3 && R.steps.bleedBw.gray.every((f) => f === 'grayscale(1)'), `Black and white check: ${R.steps.bleedBw.gray}`);
  await s.shot(path.join(OUT, 'safari-p9-preview-bleed-bw-1440.png')).catch(() => {});
  await s.actions([{ type: 'key', id: 'k', actions: [{ type: 'keyDown', value: '' }, { type: 'keyUp', value: '' }] }]);
  await s.release();
  R.steps.escape = await st(`{ open: E.pv.open, focus: document.activeElement && document.activeElement.dataset.k }`);
  expect(!R.steps.escape.open && R.steps.escape.focus === 'pv', `Escape closes it, focus on Preview final: ${JSON.stringify(R.steps.escape)}`);

  log('1024 px');
  await view(1024, 900);
  R.steps.narrow = await s.run(`${W} await new Promise((r) => setTimeout(r, 400)); const E = window.kdpBookSteps[9]._debug();
    return { w: innerWidth, mode: E.width, cls: document.querySelector('[data-cover]').classList.contains('cv-narrow'), panel: getComputedStyle(document.querySelector('[data-panel]')).display, note: getComputedStyle(document.querySelector('[data-next-note]')).display, scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth };`);
  expect(R.steps.narrow.mode === 'narrow' && R.steps.narrow.cls && R.steps.narrow.panel === 'none' && R.steps.narrow.note === 'none' && R.steps.narrow.scroll, `the window at ${R.steps.narrow.w} px: narrow, the panel closed, the reason line hidden, no sideways scroll`);
  await clickFor('[data-tool="images"]', `document.querySelector('[data-cover]').classList.contains('cv-panel-open')`);
  R.steps.overlay = await st(`(() => { const p = document.querySelector('[data-panel]'), r = p.getBoundingClientRect(), c = getComputedStyle(p); return { pos: c.position, z: c.zIndex, kind: p.dataset.kind, w: Math.round(r.width) }; })()`);
  expect(R.steps.overlay.pos === 'absolute' && R.steps.overlay.kind === 'images', `a real click on Images: the panel over the cover (${JSON.stringify(R.steps.overlay)})`);
  await s.shot(path.join(OUT, 'safari-p9-narrow-1024.png')).catch(() => {});
  await clickFor('[data-tool="images"]', `!document.querySelector('[data-cover]').classList.contains('cv-panel-open')`);
  expect((await st(`getComputedStyle(document.querySelector('[data-panel]')).display`)) === 'none', 'Images again: closed');
  // Text effects at 1024 (the STOP 5 note): every style shows every slider without a scroll.
  R.steps.fx = await s.run(`${W} const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'title'); E.select(t.id);
    await new Promise((r) => setTimeout(r, 100)); document.querySelector('[data-k="fx"]').click(); await wait(() => document.querySelector('.cv-pop-fx'));
    const out = []; const tiles = document.querySelectorAll('.cv-fx-tile').length;
    for (let i = 0; i < tiles; i++) { document.querySelectorAll('.cv-fx-tile')[i].click(); await new Promise((r) => setTimeout(r, 120));
      const p = document.querySelector('.cv-pop-fx'), b = p.getBoundingClientRect().bottom, box = p.querySelector('.cv-fx-box');
      out.push(box ? Math.min(...[...box.querySelectorAll('input[type=range]')].map((x) => Math.round(b - x.getBoundingClientRect().bottom))) : 99); }
    document.querySelectorAll('.cv-fx-tile')[1].click(); await new Promise((r) => setTimeout(r, 150));
    return { tiles, room: out };`);
  expect(R.steps.fx.tiles === 9 && R.steps.fx.room.every((d) => d >= 2), `Text effects at 1024: every slider in view in all 9 styles (room ${R.steps.fx.room.join('/')} px)`);
  await s.shot(path.join(OUT, 'safari-p9-effects-1024.png')).catch(() => {});
  await s.actions([{ type: 'key', id: 'k', actions: [{ type: 'keyDown', value: '' }, { type: 'keyUp', value: '' }] }]);
  await s.release();

  // The page at 1024 × 848 (Safari's own 900 px window): what a slightly shorter window shows (for the report).
  await view(1024, 848);
  R.steps.fx848 = await s.run(`${W} const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'title'); E.select(t.id);
    await new Promise((r) => setTimeout(r, 100)); document.querySelector('[data-k="fx"]').click(); await wait(() => document.querySelector('.cv-pop-fx'));
    const out = []; for (let i = 0; i < 9; i++) { document.querySelectorAll('.cv-fx-tile')[i].click(); await new Promise((r) => setTimeout(r, 120));
      const p = document.querySelector('.cv-pop-fx'), b = p.getBoundingClientRect().bottom, box = p.querySelector('.cv-fx-box');
      out.push(box ? Math.min(...[...box.querySelectorAll('input[type=range]')].map((x) => Math.round(b - x.getBoundingClientRect().bottom))) : 99); }
    document.querySelector('[data-k="fx-cancel"], [data-fx-cancel]') ? document.querySelector('[data-k="fx-cancel"], [data-fx-cancel]').click() : null;
    return { h: innerHeight, room: out, scrolls: getComputedStyle(document.querySelector('.cv-pop-fx') || document.body).overflowY };`);
  await s.actions([{ type: 'key', id: 'k', actions: [{ type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' }] }]);
  await s.release();
  await view(1024, 900);

  log('800 px');
  // wait until the last change is saved, so the notice can say so
  await s.run(`${W} const E = window.kdpBookSteps[9]._debug(); await wait(() => E.saveState === 'saved' && !E.saver.pending(), 15000); return true;`);
  await view(800, 900);
  R.steps.at800 = await s.run(`const E = window.kdpBookSteps[9]._debug(); return { w: innerWidth, outer: outerWidth, mode: E.width, status: E.status, tiny: !!document.querySelector('[data-tiny]'), inert: document.querySelector('.book-layout').inert };`);
  R.steps.tiny = await s.run(`${W} await wait(() => document.querySelector('[data-tiny]'), 5000); await new Promise((r) => setTimeout(r, 200));
    const d = document.querySelector('[data-tiny]').getBoundingClientRect();
    return { w: innerWidth, p: document.querySelector('.cv-tiny-p').textContent, saved: document.querySelector('[data-tiny-save]').textContent, full: d.width === innerWidth && d.height === innerHeight, inert: document.querySelector('.book-layout').inert, scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth };`);
  expect(R.steps.tiny.full && R.steps.tiny.inert && R.steps.tiny.p.includes(`This window is ${R.steps.tiny.w} px.`) && R.steps.tiny.saved === 'Your cover is saved. Nothing is lost.' && R.steps.tiny.scroll, `at ${R.steps.tiny.w} px: the notice over the whole window, the page inert, "${R.steps.tiny.p}"`);
  await s.shot(path.join(OUT, 'safari-p9-tiny-800.png')).catch(() => {});
  await view(1440, 900);
  R.steps.back = await s.run(`${W} await new Promise((r) => setTimeout(r, 400)); const E = window.kdpBookSteps[9]._debug(); return { mode: E.width, tiny: !!document.querySelector('[data-tiny]'), inert: document.querySelector('.book-layout').inert, layers: E.cover.layers.length };`);
  expect(R.steps.back.mode === 'wide' && !R.steps.back.tiny && !R.steps.back.inert && R.steps.back.layers === 5, `back to 1440: the editor as it was: ${JSON.stringify(R.steps.back)}`);

  R.network = await s.run(`const S = window.__sbStub; return { unknown: S.unknown, calls: S.calls.length, resources: performance.getEntriesByType('resource').filter((e) => e.name.indexOf('supabase.co') >= 0).map((e) => e.name) };`);
  expect(R.network.unknown.length === 0, `no unknown Supabase call: ${JSON.stringify(R.network.unknown)}`);
  expect(R.network.resources.length === 0, `no request reached the Supabase host (${R.network.calls} calls answered in the page)`);
} catch (e) {
  fails.push(`ERR ${e.message}`);
} finally {
  await s.close().catch(() => {});
  server.close();
}
R.pass = pass; R.fails = fails;
const file = save('safari-p9.json', R);
for (const f of fails) console.log('FAIL', f);
console.log(`${pass} pass, ${fails.length} fail → ${file}`);
process.exit(fails.length ? 1 : 0);
