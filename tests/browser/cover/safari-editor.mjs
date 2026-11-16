// node tests/browser/cover/safari-editor.mjs   (from the repo root; real Safari through safaridriver)
// E16 Part 6, owner STOP 4: a short Safari pass of the 09 Cover editor: text, effects, shapes, images (upload, PNG,
// a large photo, a PDF page, crop, adjust, mask), undo, save. Mocked: a small server on port 5511 serves the repo and
// puts tests/browser/cover/safari-stub.js into app/book.html before supabase-js, so every Supabase call is answered in
// the page (WebDriver cannot route requests). The run fails if one request reaches the Supabase host.
// CDN files (supabase-js, fonts, pdf.js) load from the real CDNs, as in t-safari-real.mjs.
// Results: $COVER_OUT/safari-editor.json and safari-editor-*.png (WebDriver screenshots). Exit 1 on a failed check.
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
const E = 'const E = window.kdpBookSteps[9]._debug(), C = window.kdpCover; const wait = async (f, ms = 20000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 50)); } }; const settle = () => wait(() => E.saver && E.saveState === "saved" && !E.saver.pending(), 15000); const px = (x, y) => { const c = document.querySelector("[data-canvas]"), r = c.getBoundingClientRect(), d = devicePixelRatio || 1; return [...c.getContext("2d").getImageData(Math.round((x - r.left) * d), Math.round((y - r.top) * d), 1, 1).data]; }; const repaint = async () => { const p0 = E.painted; await wait(() => E.painted > p0, 15000); await new Promise((r) => setTimeout(r, 60)); }; const box = (id) => document.querySelector(`[data-hit="${id}"]`).getBoundingClientRect(); const inked = (id) => { const b = box(id); let n = 0; for (let i = 1; i < 10; i++) for (let j = 1; j < 6; j++) { const p = px(b.left + b.width * i / 10, b.top + b.height * j / 6); if (p[3] > 0) n++; } return n; };';
try {
  log('Safari', s.version);
  await s.open(`http://127.0.0.1:${PORT}/app/book.html?id=c9c9c9c9-0000-4000-8000-000000000009&step=9`);
  const open = await s.run(`for (let i = 0; i < 600; i++) { const m = window.kdpBookSteps && window.kdpBookSteps[9]; const E = m && m._debug(); if (E && E.status === 'ready' && E.painted > 0) return { ok: true, layers: E.cover.layers.length }; if (E && (E.status === 'error' || E.status === 'locked')) return { ok: false, status: E.status }; await new Promise((r) => setTimeout(r, 100)); } return { ok: false, status: 'timeout' };`);
  R.steps.open = open;
  expect(open.ok, `the editor opens in Safari: ${JSON.stringify(open)}`);

  log('real input');
  {
    const real = {};
    const st = (expr) => s.run(`const E = window.kdpBookSteps[9]._debug(); return (${expr});`);
    const EL = 'element-6066-11e4-a52e-4f735466cecf';
    // a click on Add a heading, then a double-click on its box and keys typed into the box
    await s.click('[data-add-text="heading"]');
    await s.run(`for (let i = 0; i < 100 && window.kdpBookSteps[9]._debug().cover.layers.length < 1; i++) await new Promise((r) => setTimeout(r, 50)); return true;`);
    real.added = await st('E.cover.layers.length');
    const hid = await st('String(E.cover.layers[0].id)');
    const hit = await s.el(`[data-hit="${hid}"]`);
    await s.actions([{ type: 'pointer', id: 'm', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', origin: { [EL]: hit }, x: 0, y: 0 }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }, { type: 'pause', duration: 60 }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }]);
    await s.release();
    real.editing = await st('E.editing != null');
    const keys = [...' Now'].flatMap((ch) => [{ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch }]);
    await s.actions([{ type: 'key', id: 'k', actions: keys }]);
    await s.release();
    await s.run(`await new Promise((r) => setTimeout(r, 200)); return true;`);
    real.text = await st('E.cover.layers[0].text');
    // the Images tool and the rights box by clicks; then a file on the real file field
    await s.click('[data-tool="images"]');
    await s.click('[data-rights]');
    real.rights = await st('E.img.rights');
    const n0 = await st('E.cover.layers.length');
    try { await s.sendFile('[data-up-file]', path.join(REPO, 'design/screens/62-09-cover-image-crop.png')); real.fileVia = 'WebDriver file field'; }
    catch (e) { real.fileVia = 'not supported by safaridriver: ' + e.message.slice(0, 120); }
    await s.run(`for (let i = 0; i < 300; i++) { const E = window.kdpBookSteps[9]._debug(); if (E.cover.layers.length > ${n0} && !E.img.busy) break; await new Promise((r) => setTimeout(r, 100)); } return true;`);
    real.picture = await st(`(() => { const l = E.cover.layers[E.cover.layers.length - 1]; return l.type === 'image' ? { natW: l.natW, natH: l.natH, name: l.name, state: kdpCover.images.state(E, l) } : null; })()`);
    if (real.picture) {
      // Crop by a click on the bar, then a pointer drag on the right crop bar
      await s.click('[data-textbar] [data-k="crop"]');
      const pid = await st('String(E.cropping)');
      const w0 = await st('E.cover.layers.find((l) => String(l.id) === ' + JSON.stringify(pid) + ').w');
      const hd = await s.el('[data-handle="crop"][data-c="e"]');
      await s.actions([{ type: 'pointer', id: 'm', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', origin: { [EL]: hd }, x: 0, y: 0 }, { type: 'pointerDown', button: 0 }, { type: 'pointerMove', origin: 'pointer', x: -30, y: 0, duration: 150 }, { type: 'pointerMove', origin: 'pointer', x: -30, y: 0, duration: 150 }, { type: 'pointerUp', button: 0 }] }]);
      await s.release();
      const w1 = await st('E.cover.layers.find((l) => String(l.id) === ' + JSON.stringify(pid) + ').w');
      real.crop = { cropping: pid !== 'null', w0, w1 };
      await s.click('[data-textbar] [data-k="crop-done"]');
    }
    // remove what this section added, so the scripted steps below start from an empty cover
    await s.run(`const E = window.kdpBookSteps[9]._debug(); E.commitLayers([]); return true;`);
    R.steps.real = real;
    expect(real.added === 1 && real.editing && /Now$/.test(real.text), `real clicks and keys: Add a heading, double-click, typed "${real.text}"`);
    expect(real.rights === true, 'a real click ticks the rights box');
    expect(/^WebDriver/.test(real.fileVia) && real.picture && real.picture.natW === 2880 && real.picture.state === 'ready', `a PNG set on the real file field: ${real.fileVia}, ${JSON.stringify(real.picture)}`);
    expect(real.crop && real.crop.cropping && real.crop.w1 < real.crop.w0 - 30, `a real pointer drag on the right crop bar: ${JSON.stringify(real.crop)}`);
  }

  log('text and effects');
  R.steps.text = await s.run(`${E}
    await E.addText('heading'); await wait(() => E.cover.layers.length === 1);
    const t = E.cover.layers[0];
    E.setText(t.id, 'Micro Study Habits');
    await repaint();
    const plain = inked(t.id);
    E.patchLayer(t.id, { fx: Object.assign({}, t.fx, { style: 'shadow', color: '#1C1C1A', int: 100, dist: 8, dir: 45, blur: 0 }) });
    await repaint();
    const fx = inked(t.id);
    E.patchLayer(t.id, { curve: 40 });
    await repaint();
    return { plain, fx, curved: inked(t.id), font: t.font, h: E.textH(E.cover.layers[0]) };`);
  expect(R.steps.text.plain > 3 && R.steps.text.fx > 0 && R.steps.text.curved > 0, `text and its shadow and curve are drawn: ${JSON.stringify(R.steps.text)}`);

  log('shapes');
  R.steps.shapes = await s.run(`${E}
    E.addShape('star'); await wait(() => E.cover.layers.length === 2);
    const sh = E.cover.layers[1];
    E.patchLayer(sh.id, { fillMode: 'grad', fill: '#E07A5F', fill2: '#2E5E7E', gAngle: 135, sw: 3, scolor: '#1C1C1A' });
    await repaint();
    return { inked: inked(sh.id), kind: sh.kind };`);
  expect(R.steps.shapes.inked > 10, `a star with a gradient and a border is drawn: ${JSON.stringify(R.steps.shapes)}`);

  log('images');
  R.steps.images = await s.run(`${E}
    const mk = async (w, h, type, alpha) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      if (!alpha) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6FA8DC'); gr.addColorStop(1, '#F6C58F'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#C0392B'; g.fillRect(0, 0, w * 0.15, h * 0.15); }
      else { g.fillStyle = '#7A2E2E'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.4, 0, 7); g.fill(); }
      const b = await new Promise((r) => c.toBlob(r, type, 0.85)); c.width = 0; return new File([b], type === 'image/png' ? 'cut.png' : 'photo.jpg', { type }); };
    E.showPanel('images'); E.img.rights = true; E.refreshPanel();
    const out = {};
    let f = await mk(1800, 1200, 'image/jpeg');
    await C.images.takeFile(E, f); await wait(() => !E.img.busy);
    out.err1 = E.img.err;
    const im = E.cover.layers[E.cover.layers.length - 1];
    out.jpg = { type: im.type, natW: im.natW, state: C.images.state(E, im) };
    await repaint();
    const b = box(im.id); out.redCorner = px(b.left + 6, b.top + 6);
    f = await mk(800, 800, 'image/png', true);
    await C.images.takeFile(E, f); await wait(() => !E.img.busy);
    const pn = E.cover.layers[E.cover.layers.length - 1];
    out.png = { transparent: pn.transparent, mime: (window.__sbStub.assets.find((a) => a.id === pn.asset) || {}).mime };
    // a large photo: 6000 x 4000 (24 MP; the screen keeps a 4,096 px copy)
    const t0 = performance.now();
    f = await mk(6000, 4000, 'image/jpeg');
    out.bigBytes = f.size;
    await C.images.takeFile(E, f); await wait(() => !E.img.busy, 60000);
    const bg = E.cover.layers[E.cover.layers.length - 1];
    out.big = { natW: bg.natW, natH: bg.natH, err: E.img.err, ms: Math.round(performance.now() - t0), screen: E.pics.get(bg.asset) && E.pics.get(bg.asset).src.width };
    // the pictures were all added in the middle of the front: spread them (the first on the back cover, alone)
    E.setLayer(im.id, Object.assign({ x: 40, y: 380, w: 300, h: 200 }, C.model.coverFit(E.cover.layers.find((x) => x.id === im.id), { w: 300, h: 300 * 2 / 3 })));
    E.setLayer(bg.id, Object.assign({ x: 60, y: 40, w: 150, h: 100 }, C.model.coverFit(bg, { w: 150, h: 100 })));
    // crop: zoom 200 %, move the picture, then a circle mask, brightness, sepia
    const mid = () => { const q = box(im.id); return px(q.left + q.width / 2, q.top + q.height / 2); };
    await repaint(); out.midPlaced = mid();
    { const q = box(im.id), c = document.querySelector('[data-canvas]').getBoundingClientRect(); out.geom = { win: [innerWidth, innerHeight], box: [q.left, q.top, q.width, q.height], canvas: [c.left, c.top, c.width, c.height], z: E.view.z, dpr: devicePixelRatio }; }
    E.select(im.id); E.startCrop(im.id);
    const l0 = E.cover.layers.find((x) => x.id === im.id);
    E.patchLayer(im.id, C.images.zoomPatch(l0, 200));
    await repaint(); out.midZoom = mid();
    E.movePic(-20, 0);
    const l1 = E.cover.layers.find((x) => x.id === im.id);
    out.crop = { zoomed: Math.abs(l1.pw - 2 * l0.pw) < 1e-6, moved: l1.px < l0.px, cropping: E.cropping === im.id };
    E.endCrop(false);
    await repaint(); out.midEnd = mid();
    E.patchLayer(im.id, { mask: 'circle' }); await repaint(); out.midCircle = mid();
    E.patchLayer(im.id, { mask: 'circle', bri: 120, look: 'sepia' });
    await repaint();
    const b2 = box(im.id); out.circleCorner = px(b2.left + 3, b2.top + 3); out.middle = px(b2.left + b2.width / 2, b2.top + b2.height / 2);
    out.layers = E.cover.layers.length;
    return out;`);
  const I = R.steps.images;
  expect(!I.err1 && I.jpg.type === 'image' && I.jpg.natW === 1800 && I.jpg.state === 'ready', `JPG upload: ${JSON.stringify(I.jpg)} ${I.err1}`);
  expect(I.redCorner[0] > 150 && I.redCorner[1] < 90, `the uploaded picture is drawn (red corner ${I.redCorner})`);
  expect(I.png.transparent && I.png.mime === 'image/png', `PNG keeps its transparency: ${JSON.stringify(I.png)}`);
  expect(!I.big.err && I.big.natW === 6000 && I.big.screen === 4096, `a 6000 × 4000 photo: stored, screen copy ${I.big.screen} px, ${I.big.ms} ms`);
  expect(I.crop.zoomed && I.crop.moved && I.crop.cropping, `crop zoom and move: ${JSON.stringify(I.crop)}`);
  expect(I.circleCorner[3] === 0 && I.middle[3] === 255, `circle mask cuts the corner (${I.circleCorner}), the middle shows (${I.middle})`);

  await s.shot(path.join(OUT, 'safari-editor-images.png')).catch(() => {});
  log('PDF page');
  R.steps.pdf = await s.run(`${E}
    const pdf = '%PDF-1.4\\n1 0 obj\\n<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n2 0 obj\\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\\nendobj\\n3 0 obj\\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>\\nendobj\\n4 0 obj\\n<< /Length 30 >>\\nstream\\n0 g 100 300 200 200 re f\\nendstream\\nendobj\\ntrailer\\n<< /Root 1 0 R >>\\n%%EOF\\n';
    const n0 = E.cover.layers.length;
    await C.images.takePdf(E, new File([pdf], 'one-page.pdf', { type: 'application/pdf' }));
    await wait(() => !E.img.busy, 60000);
    const chooser = E.img.pdf ? E.img.pdf.pages : null, err0 = E.img.err;
    if (E.img.pdf) { await C.images.placePdf(E); await wait(() => !E.img.busy, 60000); }
    const row = window.__sbStub.assets[window.__sbStub.assets.length - 1];
    return { chooser, err0, err: E.img.err, added: E.cover.layers.length === n0 + 1, row: row && { source: row.source, w: row.width, h: row.height, mime: row.mime } };`);
  const P = R.steps.pdf;
  expect(P.chooser === 1 && P.added && P.row && P.row.source === 'pdf' && P.row.w === 2550 && P.row.h === 3300, `a PDF page at 300 DPI: ${JSON.stringify(P)}`);

  log('undo and save');
  R.steps.undo = await s.run(`${E}
    await new Promise((r) => setTimeout(r, 600));
    const n = E.cover.layers.length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    const after = E.cover.layers.length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true }));
    const redo = E.cover.layers.length;
    await settle();
    const S = window.__sbStub;
    return { n, after, redo, saves: S.saves, rev: S.design.rev, savedLayers: S.design.layers.length, sameAsScreen: JSON.stringify(S.design.layers) === JSON.stringify(E.cover.layers), history: S.history.length };`);
  const U = R.steps.undo;
  expect(U.after === U.n - 1 && U.redo === U.n, `Cmd+Z takes the last layer away, Shift+Cmd+Z brings it back: ${U.n} → ${U.after} → ${U.redo}`);
  expect(U.saves > 0 && U.sameAsScreen && U.history === 1, `autosave: ${U.saves} saves, rev ${U.rev}, the saved layers equal the screen, 1 visit snapshot`);

  await s.shot(path.join(OUT, 'safari-editor-final.png')).catch(() => {});
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
const file = save('safari-editor.json', R);
for (const f of fails) console.log('FAIL', f);
console.log(`${pass} pass, ${fails.length} fail → ${file}`);
process.exit(fails.length ? 1 : 0);
