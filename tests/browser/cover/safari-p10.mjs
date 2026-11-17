// node tests/browser/cover/safari-p10.mjs   (from the repo root; real Safari through safaridriver)
// E16 Part 10, owner STOP 10: a short Safari pass of the export. The design's sample book (Band + the warm blurb),
// real clicks: Export cover → the dialog → Export, with the real engine (Safari loads the Typst files and the fonts from
// the real CDNs, as the app does); the 11 KDP checks of the PDF, the PNG header, the Kindle JPG read back (1600 × 2560,
// plain sRGB); the rows; Download (each file) and Download all (.zip) caught in the page (the anchor's click, so no
// Safari download prompt; the zip read back: signatures, names, CRC-32 of each file); a JPG export (Safari's canvas
// JPEG writer); Stop (a real click) records nothing; the header "Done" and Next on.
// It first proves that real input reaches the page (a click on the Checks chip): with another app in front, Safari
// delivers no event at all (document.hasFocus() false), and the run stops with that reason.
// Mocked as safari-editor.mjs: a small server on port 5511 puts tests/browser/cover/safari-stub.js into app/book.html,
// so every Supabase call is answered in the page; the run fails if one request reaches the Supabase host. Real clicks
// and keys go through WebDriver. Results: $COVER_OUT/safari-p10.json and safari-p10-*.png. Exit 1 on a failed check.
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
const clickErrs = [];
// A real pointer press at the element's middle (WebDriver actions), used when the element click delivered no event.
const press = async (css) => {
  const r = await s.run(`const b = document.querySelector(${JSON.stringify(css)}).getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];`);
  await s.actions([{ type: 'pointer', id: 'm', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', duration: 0, x: r[0], y: r[1], origin: 'viewport' }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }]);
  await s.release();
};
const clickFor = async (css, cond) => { for (let i = 0; i < 4; i++) { try { if (i < 2) await s.click(css); else { clickErrs.push(`${css}: element click gave no event, try ${i + 1} with pointer actions`); await press(css); } } catch (e) { clickErrs.push(`${css}: ${String(e.message).slice(0, 200)}`); } if (await s.run(`for (let i = 0; i < 20; i++) { if (${cond}) return true; await new Promise((r) => setTimeout(r, 50)); } return false;`)) return true; } return false; };
const phase = (p, ms = 240000) => s.run(`const t = Date.now(); for (;;) { const d = document.querySelector('[data-exdlg] .cv-ex'); if (d && (d.dataset.exPhase === '${p}' || d.dataset.exPhase === 'failed')) return d.dataset.exPhase;
  if (Date.now() - t > ${ms}) { const E = window.kdpBookSteps[9]._debug(); return 'timeout ' + JSON.stringify({ phase: E.ex && E.ex.phase, step: E.ex && E.ex.step, open: E.ex && E.ex.open, save: E.saveState, calls: window.__sbStub.calls.slice(-6), eng: E.exEngine ? E.exEngine.stats : null, mode: E.exEngine ? E.exEngine.mode('x') : null, real: Object.keys(window.__real || {}) }); }
  await new Promise((r) => setTimeout(r, 200)); }`);
try {
  log('Safari', s.version);
  await s.open(`http://127.0.0.1:${PORT}/app/book.html?id=c9c9c9c9-0000-4000-8000-000000000009&step=9`);
  const open = await s.run(`for (let i = 0; i < 600; i++) { const m = window.kdpBookSteps && window.kdpBookSteps[9]; const E = m && m._debug(); if (E && E.status === 'ready' && E.painted > 0) return { ok: true }; if (E && (E.status === 'error' || E.status === 'locked')) return { ok: false, status: E.status }; await new Promise((r) => setTimeout(r, 100)); } return { ok: false, status: 'timeout' };`);
  expect(open.ok, `the editor opens in Safari: ${JSON.stringify(open)}`);
  const chrome = await s.run(`return outerHeight - innerHeight;`);
  await s.rect(1440, 900 + chrome);
  await s.run(`await new Promise((r) => setTimeout(r, 300)); return true;`);
  R.steps.viewport = await s.run(`return [innerWidth, innerHeight];`);
  // The sample book: Band with the warm blurb (design 59), its fonts loaded, saved.
  R.steps.band = await s.run(`${W} const E = window.kdpBookSteps[9]._debug(), C = window.kdpCover;
    const blurb = 'You signed up for the course. Then work, family and tired evenings got in the way. This book is for the nights you have twenty minutes and almost no energy left.';
    const r = C.layouts.build('band', { title: 'Micro Study Habits for Busy Adult Learners', subtitle: 'How to Keep Up With Your Course After Work, Even on Low-Energy Days', pen: 'Adnan Haroun' }, E.cover.fmt, 1, blurb);
    await C.fonts.loadAll(r.layers);
    E.commitLayers(r.layers);
    await wait(() => E.saveState === 'saved' && !E.saver.pending(), 15000);
    // Keep what the builders return; catch the downloads (the anchor's click) so Safari shows no prompt.
    const X = C.export; window.__real = {}; window.__dl = [];
    X.__p = X.print; X.__i = X.image; X.__k = X.kindle;
    X.print = async (...a) => { const t0 = performance.now(); const r = await X.__p(...a); window.__real.print = { ok: r.ok, checks: r.checks.map((c) => ({ name: c.name, pass: c.pass, detail: c.detail })), bytes: r.pdf.length, ms: Math.round(performance.now() - t0) }; return r; };
    X.image = async (...a) => { const r = await X.__i(...a); window.__real.image = { w: r.w, h: r.h, type: r.type, bytes: r.bytes.length, ms: Math.round(r.ms), sniff: C.imagePrep.sniff(r.bytes) }; return r; };
    X.kindle = async (...a) => { const r = await X.__k(...a); window.__real.kindle = { w: r.w, h: r.h, mode: r.mode, color: r.color, size: r.size, bytes: r.bytes.length, ms: Math.round(r.ms) }; return r; };
    HTMLAnchorElement.prototype.click = function () { const a = this; window.__dl.push({ name: a.download, href: a.href }); };
    return { layers: E.cover.layers.length, chip: document.querySelector('[data-k="chk"]').textContent.trim() };`);
  expect(R.steps.band.layers >= 5 && /Ready/.test(R.steps.band.chip), `Band + blurb on the cover, Ready: ${JSON.stringify(R.steps.band)}`);

  log('export (PNG + Kindle)');
  await s.run(`window.__clk = []; ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => document.addEventListener(t, (e) => window.__clk.push(t + ' ' + (e.target.closest && e.target.closest('[data-export]') ? 'export ' : '') + (e.target.className || e.target.tagName) + ' ' + Math.round(e.clientX) + ',' + Math.round(e.clientY)), true)); return true;`);
  try { await s.click('[data-k="chk"]'); } catch (e) { clickErrs.push('probe chk: ' + e.message); }
  R.steps.probe = await s.run(`await new Promise((r) => setTimeout(r, 500)); return { events: window.__clk.slice(), drawer: !!document.querySelector('aside[aria-label="Checks"]'), focused: document.hasFocus(), vis: document.visibilityState };`);
  // Real input reaches the page only while the Safari window has the focus (another app in front: no event at all).
  if (!R.steps.probe.events.length) throw new Error(`Safari takes no real input (window focus ${R.steps.probe.focused}): a click on the Checks chip gave no event. Bring the Safari window to the front and run again.`);
  await s.click('[data-k="chk"]');   // close the drawer again
  await s.run('window.__clk = []; return true;');
  R.steps.pre = await s.run(`const E = window.kdpBookSteps[9]._debug(); const b = document.querySelector('[data-export]'), r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { w: innerWidth, h: innerHeight, mode: E.width, status: E.status, btn: [Math.round(r.left), Math.round(r.top), Math.round(r.width)], at: at && (at.outerHTML || '').slice(0, 120), dis: b.getAttribute('aria-disabled') };`);
  await clickFor('[data-export]', `!!document.querySelector('[data-exdlg]')`);
  R.steps.after = await s.run(`const E = window.kdpBookSteps[9]._debug(); return { dlg: !!document.querySelector('[data-exdlg]'), clicks: window.__clk, ex: E.ex ? { open: E.ex.open, phase: E.ex.phase } : null, status: E.status, width: E.width, active: document.activeElement && document.activeElement.outerHTML.slice(0, 80) };`);
  R.steps.ready = await s.run(`return { sub: document.querySelector('#cv-ex-sub').textContent, focus: document.activeElement && document.activeElement.dataset.k, img: document.querySelector('[data-ex-img]').checked, kindle: document.querySelector('[data-ex-kindle]').checked };`);
  expect(R.steps.ready.sub === '6 × 9 in · 54 pages · white paper · spine 0.122 in' && R.steps.ready.focus === 'ex-img' && R.steps.ready.img && R.steps.ready.kindle, `a real click on Export cover: the dialog, ready: ${JSON.stringify(R.steps.ready)}`);
  await s.shot(path.join(OUT, 'safari-p10-ready-1440.png')).catch(() => {});
  const t0 = Date.now();
  await s.click('[data-ex-go]');
  R.steps.phase1 = await phase('done');
  R.steps.ms1 = Date.now() - t0;
  R.steps.real = await s.run(`return window.__real;`);
  const real = R.steps.real;
  expect(R.steps.phase1 === 'done', `a real click on Export: done in ${R.steps.ms1} ms (${R.steps.phase1}; ${await s.run(`const t = document.querySelector('[data-ex-failed]'); return t ? t.textContent : '';`)})`);
  if (real.print) for (const c of real.print.checks) expect(c.pass, `PDF: ${c.name}: ${c.detail}`);
  expect(real.image && real.image.w === 3712 && real.image.h === 2775 && real.image.sniff && real.image.sniff.type === 'image/png', `PNG 3712 × 2775 (header read back): ${JSON.stringify(real.image)}`);
  expect(real.kindle && real.kindle.size && real.kindle.size.w === 1600 && real.kindle.size.h === 2560 && real.kindle.color && real.kindle.color.ok, `Kindle JPG 1600 × 2560, plain sRGB: ${JSON.stringify(real.kindle && real.kindle.color)}`);
  R.steps.done = await s.run(`const S = window.__sbStub; return { files: [...document.querySelectorAll('[data-ex-file]')].map((e) => e.querySelector('.cv-ex-fn').textContent + ' · ' + e.querySelector('.cv-ex-fw').textContent.split(' · ').pop()), rows: S.exports.map((x) => x.kind), my: S.my.length, note: document.querySelector('[data-next-note]').textContent, next: !document.querySelector('[data-next]').disabled };`);
  expect(R.steps.done.files.length === 3 && R.steps.done.rows.join() === 'print,image,kindle' && R.steps.done.my === 1, `3 files, one insert of 3 rows, My layouts saved: ${JSON.stringify(R.steps.done)}`);
  expect(R.steps.done.note === 'Done: cover files exported.' && R.steps.done.next, 'the header: Done, Next on');
  await s.shot(path.join(OUT, 'safari-p10-done-1440.png')).catch(() => {});
  // Download (a real click) and Download all (.zip): read back in the page.
  await s.click('[data-ex-dl="0"]');
  await s.click('[data-ex-zip]');
  R.steps.zip = await s.run(`${W} await wait(() => window.__dl.length >= 2, 30000);
    const z = window.__dl.find((d) => /\.zip$/.test(d.name)); const bytes = new Uint8Array(await (await fetch(z.href)).arrayBuffer());
    const dv = new DataView(bytes.buffer), C = window.kdpCover, E = window.kdpBookSteps[9]._debug();
    let eocd = bytes.length - 22; const n = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    const out = []; let p = cdOff;
    for (let i = 0; i < n; i++) { const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl)); const lnl = dv.getUint16(off + 26, true);
      const data = bytes.subarray(off + 30 + lnl, off + 30 + lnl + size);
      out.push({ name, size, crcOk: C.zip.crc32(data) === crc, local: dv.getUint32(off, true) === 0x04034b50, same: E.ex.files.some((f) => f.name === name && f.bytes.length === size) }); p += 46 + nl; }
    return { names: window.__dl.map((d) => d.name), eocd: dv.getUint32(eocd, true) === 0x06054b50, entries: out };`);
  expect(R.steps.zip.names[0].endsWith('_cover.pdf') && R.steps.zip.names[1].endsWith('_cover_files.zip'), `Download and Download all: ${R.steps.zip.names.join(', ')}`);
  expect(R.steps.zip.eocd && R.steps.zip.entries.length === 3 && R.steps.zip.entries.every((e) => e.crcOk && e.local && e.same), `the zip read back in Safari: 3 entries, signatures and CRC-32 match: ${JSON.stringify(R.steps.zip.entries.map((e) => [e.name.slice(-16), e.size, e.crcOk]))}`);
  await s.click('[data-k="ex-done"]');

  log('export (JPG, no Kindle)');
  await clickFor('[data-export]', `!!document.querySelector('[data-exdlg]')`);
  await s.click('[data-ex-fmt="jpg"]');
  await s.click('label.cv-ex-opt.is-label');
  await s.run(`window.__real = {}; return true;`);
  await s.click('[data-ex-go]');
  R.steps.phase2 = await phase('done');
  R.steps.jpg = await s.run(`return { image: window.__real.image, kindle: !!window.__real.kindle, rows: window.__sbStub.exports.map((x) => x.kind).slice(3) };`);
  expect(R.steps.phase2 === 'done' && R.steps.jpg.image && R.steps.jpg.image.sniff && R.steps.jpg.image.sniff.type === 'image/jpeg' && R.steps.jpg.image.sniff.w === 3712 && !R.steps.jpg.kindle && R.steps.jpg.rows.join() === 'print,image', `JPG, no Kindle: Safari's JPEG writer paints 3712 × 2775, rows print, image: ${JSON.stringify(R.steps.jpg)}`);
  await s.click('[data-k="ex-done"]');

  log('Stop');
  await s.run(`const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'title'); E.setLayer(t.id, { x: t.x + 1 }); return true;`);
  await s.run(`${W} const E = window.kdpBookSteps[9]._debug(); await wait(() => E.saveState === 'saved' && !E.saver.pending(), 15000); kdpCover.exportDialog.test.hold = (k) => (k === 'image' ? new Promise((r) => { window.__held = k; window.__rel = r; }) : null); return true;`);
  const rows0 = await s.run(`return window.__sbStub.exports.length;`);
  await clickFor('[data-export]', `!!document.querySelector('[data-exdlg]')`);
  await s.click('[data-ex-go]');
  await s.run(`${W} await wait(() => window.__held === 'image', 120000); return true;`);
  await s.shot(path.join(OUT, 'safari-p10-busy-1440.png')).catch(() => {});
  await s.click('[data-ex-stop]');
  R.steps.stop = await s.run(`${W} kdpCover.exportDialog.test.hold = null; window.__rel(); await new Promise((r) => setTimeout(r, 2500));
    return { open: !!document.querySelector('[data-exdlg]'), rows: window.__sbStub.exports.length, note: document.querySelector('[data-next-note]').textContent, next: !document.querySelector('[data-next]').disabled };`);
  expect(!R.steps.stop.open && R.steps.stop.rows === rows0 && R.steps.stop.note === 'Not done yet: export the cover files.' && !R.steps.stop.next, `a real click on Stop: closed, nothing recorded, not done: ${JSON.stringify(R.steps.stop)}`);

  R.network = await s.run(`const S = window.__sbStub; return { unknown: S.unknown, calls: S.calls.length, resources: performance.getEntriesByType('resource').filter((e) => e.name.indexOf('supabase.co') >= 0).map((e) => e.name) };`);
  expect(R.network.unknown.length === 0, `no unknown Supabase call: ${JSON.stringify(R.network.unknown)}`);
  expect(R.network.resources.length === 0, `no request reached the Supabase host (${R.network.calls} calls answered in the page)`);
} catch (e) {
  fails.push(`ERR ${e.message}`);
} finally {
  await s.close().catch(() => {});
  server.close();
}
R.pass = pass; R.fails = fails; R.clickErrs = clickErrs;
const file = save('safari-p10.json', R);
for (const f of fails) console.log('FAIL', f);
console.log(`${pass} pass, ${fails.length} fail → ${file}`);
process.exit(fails.length ? 1 : 0);
