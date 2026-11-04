// NicheInk · tests: helpers for the real-engine browser tests (E13.1).
// /tests/browser/format/lib.mjs, used by t-engine-real.mjs, t-fallback.mjs,
// t-safari.mjs and tools/make-style-samples.mjs.
//   ensureServer()        tests/browser/serve.py on port 5500 (started if nothing answers)
//   chrome({ profile })   headless Chrome (playwright-core), a page, and CDP network counts
//   safari()              real Safari through safaridriver on port 4567
//   PAGE                  the engine test page
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PW = process.env.PLAYWRIGHT_CORE || '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core';
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../../..');
export const OUT = path.join(HERE, 'out');
export const BASE = 'http://127.0.0.1:5500/';
export const PAGE = `${BASE}tests/browser/format/engine.html`;
export const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
export const log = (...x) => console.log(new Date().toISOString().slice(11, 19), ...x);

export async function ensureServer() {
  const up = async () => { try { return (await fetch(PAGE)).ok; } catch { return false; } };
  if (await up()) return null;
  const p = spawn('python3', ['tests/browser/serve.py'], { cwd: REPO, stdio: 'ignore', detached: true });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await up())) throw new Error('serve.py did not start on port 5500');
  return p;
}

export const tmpProfile = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `nicheink-${name}-`));

/** Headless Chrome on a profile (a new empty one = a cold cache). net: every CDN request with wire and decoded bytes. */
export async function chrome({ profile = tmpProfile('chrome') } = {}) {
  const { chromium } = require(PW);
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, wire: 0, decoded: 0, cache: null }));
  cdp.on('Network.requestServedFromCache', (e) => { const r = reqs.get(e.requestId); if (r) r.cache = 'memory'; });
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r && e.response.fromDiskCache) r.cache = 'disk'; });
  cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.decoded += e.dataLength; });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.wire = e.encodedDataLength; });
  // The worker's requests are not in the page's CDP session: count every request of the
  // context too (Playwright sees worker requests). wire = the compressed body as received.
  const ctxReqs = [];
  ctx.on('requestfinished', async (req) => {
    if (!/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//.test(req.url())) return;
    const row = { url: req.url(), wire: 0, decoded: 0, cache: null };
    ctxReqs.push(row);
    try {
      const s = await req.sizes();
      const res = await req.response();
      // A response from the HTTP cache has no body on the wire (Playwright gives a size of 0 or less).
      row.wire = Math.max(0, s.responseBodySize);
      row.cache = s.responseBodySize <= 0 ? 'http cache' : null;
      const len = res && Number((await res.allHeaders())['content-length']);
      row.headerLength = Number.isFinite(len) ? len : null;
    } catch { /* closed */ }
  });
  const version = ctx.browser() ? ctx.browser().version() : null;
  return {
    ctx, page, errors, profile, version,
    net: () => [...reqs.values()].filter((r) => /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//.test(r.url)),
    /** Every CDN request of the context (page and workers), wire bytes only. */
    allNet: () => ctxReqs.slice(),
    resetNet: () => { reqs.clear(); ctxReqs.length = 0; },
    async open() { await page.goto(PAGE, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => globalThis.kdpFormatEngine && globalThis.kdpPlaceholderBook); },
    async close(keep = false) { await ctx.close(); if (!keep) fs.rmSync(profile, { recursive: true, force: true }); }
  };
}

/** Real Safari through safaridriver (port 4567, "Allow remote automation" on). */
export async function safari() {
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
  const s = await call('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  const sid = s.sessionId;
  await call('POST', `/session/${sid}/timeouts`, { script: 900000, pageLoad: 120000 });
  return {
    version: s.capabilities.browserVersion,
    open: () => call('POST', `/session/${sid}/url`, { url: PAGE }),
    /** Run an async function body in the page; it must end by calling done(value). */
    run: (body, args = []) => call('POST', `/session/${sid}/execute/async`, { script: `const done = arguments[arguments.length - 1]; (async (...a) => { ${body} })(...arguments).then(done, (e) => done({ error: String(e && e.message) }));`, args }),
    async close() { await call('DELETE', `/session/${sid}`); if (driver) process.kill(-driver.pid); }
  };
}

export function save(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2));
  return path.join(OUT, name);
}
