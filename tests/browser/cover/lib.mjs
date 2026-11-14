// NicheInk · tests: helpers for the 09 Cover real-engine tests (E16 Part 2).
// /tests/browser/cover/lib.mjs, used by t-engine-real.mjs, t-safari-real.mjs,
// t-metrics-real.mjs and tools/cover-fonts-sprite.mjs.
//   coverChrome({ offline })  headless Chrome on the cover engine page. CDN files the
//                             tests already hold (tests/browser/.cache/format and
//                             .cache/cover-fonts, each checked against its sha384 in the
//                             page) are served from disk: the run does not depend on
//                             jsdelivr's speed. Anything else goes to the network.
//   coverSafari()             real Safari (safaridriver, port 4567) on the same page;
//                             Safari loads from the real CDNs (no route in WebDriver).
//   PAGE, OUT, save(name, data), saveBytes(name, bytes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chrome, safari, ensureServer, log, median } from '../format/lib.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../../..');
export const PAGE = 'http://127.0.0.1:5500/tests/browser/cover/engine.html';
// Results: COVER_OUT when set (a scratch folder), else tests/browser/cover/out (ignored by git).
export const OUT = process.env.COVER_OUT ? path.resolve(process.env.COVER_OUT) : path.join(HERE, 'out');
const CACHES = ['tests/browser/.cache/format', 'tests/browser/.cache/cover-fonts'].map((d) => path.join(REPO, d));
export { ensureServer, log, median };

const CDN = /^https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/(.+)$/;
const TYPES = { js: 'text/javascript', mjs: 'text/javascript', wasm: 'application/wasm', ttf: 'font/ttf' };

export async function coverChrome({ offline = true } = {}) {
  const c = await chrome();
  const served = { disk: 0, net: 0 };
  if (offline) {
    await c.ctx.route(CDN, async (route) => {
      const m = CDN.exec(route.request().url());
      const rel = decodeURIComponent(m[2]);
      for (const dir of CACHES) {
        const p = path.join(dir, rel);
        if (p.startsWith(dir) && fs.existsSync(p)) {
          served.disk++;
          return route.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': TYPES[p.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
        }
      }
      served.net++;
      return route.continue();
    });
  }
  return {
    ...c, served,
    async open() {
      await c.page.goto(PAGE, { waitUntil: 'domcontentloaded' });
      await c.page.waitForFunction(() => globalThis.kdpCoverHarness && globalThis.kdpCoverHarness.ready);
    }
  };
}

export async function coverSafari() {
  const s = await safari();
  return {
    ...s,
    open: async () => {
      await s.open(PAGE);
      return s.run(`for (let i = 0; i < 300 && !(globalThis.kdpCoverHarness && globalThis.kdpCoverHarness.ready); i++) await new Promise((r) => setTimeout(r, 100)); return !!globalThis.kdpCoverHarness;`);
    }
  };
}

export function save(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 1));
  return p;
}
export function saveBytes(dir, name, bytes) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from(bytes));
  return p;
}
export const fromB64 = (s) => Buffer.from(s, 'base64');
