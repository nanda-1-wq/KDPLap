// node proof/typst/run.mjs [--only=cold,cached,slownet,books,cpu,checks,cases] [--books=test-book,sample,large]
// E13.0 Typst proof (throwaway): runs every measurement in the installed
// Chrome (playwright-core, headless) and writes out/results.json.
//   cold     3 loads, each with a new empty profile
//   cached   5 loads, Chrome closed and opened again on the same profile
//   slownet  1 cold load at 10 Mbps down, 40 ms round trip
//   books    each book: first compile, 5 recompiles (same text, one edit), memory
//   cpu      the test book with the CPU slowed 4x
//   checks   each book: page count 3 ways, PDF boxes and fonts, layout, corners
//   cases    cases.html: every converter case and 300 fuzz strings
// Run make-sample.js first. Serves the repo with tests/browser/serve.py on
// port 5500 if nothing answers there. PDFs go to out/ (ignored by git).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const PW = process.env.PLAYWRIGHT_CORE || '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(PW);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'out');
const BASE = 'http://127.0.0.1:5500/proof/typst/';
require(path.join(HERE, 'pdf-check.js'));

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `=${d}`).split('=')[1];
const ONLY = new Set(arg('only', 'cold,cached,slownet,books,cpu,checks,cases').split(','));
const BOOKS = arg('books', 'test-book,sample,large').split(',');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const range = (a) => (a.length ? [Math.min(...a), Math.max(...a)] : null);
const log = (...x) => console.log(new Date().toISOString().slice(11, 19), ...x);

/* ── Local server ─────────────────────────── */

async function ensureServer() {
  const up = async () => { try { return (await fetch(`${BASE}bench.html`)).ok; } catch { return false; } };
  if (await up()) return null;
  const p = spawn('python3', ['tests/browser/serve.py'], { cwd: REPO, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await up())) throw new Error('serve.py did not start on port 5500');
  return p;
}

/* ── Memory: renderer processes of the Chrome that uses this profile ── */

function memorySampler(profile) {
  let peak = 0;
  let base = null;
  const sample = () => execFile('ps', ['-A', '-o', 'pid=,ppid=,rss=,command='], { maxBuffer: 1 << 24 }, (err, stdout) => {
    if (err) return;
    const rows = stdout.split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean)
      .map((m) => ({ pid: m[1], ppid: m[2], rss: Number(m[3]) * 1024, cmd: m[4] }));
    const main = rows.find((r) => r.cmd.includes(`--user-data-dir=${profile}`) && !r.cmd.includes('--type='));
    if (!main) return;
    const rss = rows.filter((r) => r.ppid === main.pid && r.cmd.includes('--type=renderer')).reduce((s, r) => s + r.rss, 0);
    if (base == null && rss) base = rss;
    peak = Math.max(peak, rss);
  });
  const t = setInterval(sample, 200);
  return { stop: () => { clearInterval(t); return { baseRendererMB: base && Math.round(base / 1048576), peakRendererMB: Math.round(peak / 1048576) }; } };
}

/* ── One page load ────────────────────────── */

async function runPage({ profile, url, slowNet = false, cpu = 0, wantPdf = false, timeoutMs = 900000 }) {
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, args: ['--enable-precise-memory-info'] });
  const mem = memorySampler(profile);
  try {
    const page = ctx.pages()[0] || await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Performance.enable');
    const reqs = new Map();
    cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, wire: 0, decoded: 0, cache: null, status: null }));
    cdp.on('Network.requestServedFromCache', (e) => { const r = reqs.get(e.requestId); if (r) r.cache = 'memory'; });
    cdp.on('Network.responseReceived', (e) => {
      const r = reqs.get(e.requestId);
      if (r) { r.status = e.response.status; if (e.response.fromDiskCache) r.cache = 'disk'; r.encoding = e.response.headers['content-encoding'] || null; }
    });
    cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.decoded += e.dataLength; });
    cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.wire = e.encodedDataLength; });
    if (slowNet) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
    if (cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(() => globalThis.__result, null, { timeout: timeoutMs, polling: 250 });
    const result = await page.evaluate(() => globalThis.__result);
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    let pdf = null;
    if (wantPdf && !result.error) {
      const b64 = await page.evaluate(() => {
        const b = globalThis.__pdf;
        let s = '';
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
        return btoa(s);
      });
      pdf = Buffer.from(b64, 'base64');
    }
    const network = [...reqs.values()].filter((r) => /^https?:/.test(r.url));
    return {
      result,
      network,
      memory: { ...mem.stop(), jsHeapUsedMB: Math.round(metrics.JSHeapUsedSize / 1048576), jsHeapTotalMB: Math.round(metrics.JSHeapTotalSize / 1048576) },
      pdf,
    };
  } finally {
    mem.stop();
    await ctx.close();
  }
}

const tmpProfile = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `typst-proof-${name}-`));
const short = (u) => u.replace('https://cdn.jsdelivr.net/npm/', 'jsdelivr:').replace(BASE, 'local:');
const kind = (u) => (/typst\.ts@.*main\.bundle/.test(u) ? 'engine js' : /\.wasm$/.test(u) ? 'engine wasm' : /\.ttf$/.test(u) ? 'fonts'
  : /pdfjs-dist/.test(u) ? 'pdf.js (checks only)' : u.startsWith(BASE) ? 'local files' : 'other');

function netSummary(network) {
  const by = {};
  for (const r of network) {
    const k = kind(r.url);
    by[k] = by[k] || { files: 0, wireBytes: 0, decodedBytes: 0, fromCache: 0 };
    by[k].files++;
    by[k].wireBytes += r.wire;
    by[k].decodedBytes += r.decoded;
    if (r.cache) by[k].fromCache++;
  }
  return by;
}

/* ── Scenarios ────────────────────────────── */

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await ensureServer();
  const results = {
    date: new Date().toISOString(),
    machine: {
      cpu: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string']).toString().trim(),
      memoryGB: Math.round(Number(execFileSync('sysctl', ['-n', 'hw.memsize']).toString()) / 2 ** 30),
      os: `${os.type()} ${os.release()}`,
      node: process.version,
      playwrightCore: require(`${PW}/package.json`).version,
    },
  };
  const save = () => fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const bench = (q) => `${BASE}bench.html?${q}`;
  const timing = (r) => ({ ...r.result.marks, compileTotal: r.result.compile.first.total });

  try {
    // Chrome version, once.
    {
      const b = await chromium.launch({ channel: 'chrome', headless: true });
      results.machine.chrome = b.version();
      await b.close();
    }

    if (ONLY.has('cold')) {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const profile = tmpProfile('cold');
        log('cold', i + 1);
        const r = await runPage({ profile, url: bench('book=test-book') });
        if (r.result.error) throw new Error(r.result.error);
        runs.push({ timing: timing(r), memory: r.memory, net: netSummary(r.network), requests: r.network.map((x) => ({ url: short(x.url), wire: x.wire, decoded: x.decoded, encoding: x.encoding, cache: x.cache })) });
        fs.rmSync(profile, { recursive: true, force: true });
      }
      results.cold = { runs, compilerReadyMedian: median(runs.map((x) => x.timing.compilerReady)), compilerReadyRange: range(runs.map((x) => x.timing.compilerReady)), firstPdfMedian: median(runs.map((x) => x.timing.firstPdf)), firstPdfRange: range(runs.map((x) => x.timing.firstPdf)) };
      save();
    }

    // One profile that stays warm for everything after this.
    const warm = tmpProfile('warm');
    log('warm-up load');
    await runPage({ profile: warm, url: bench('book=test-book') });

    if (ONLY.has('cached')) {
      const runs = [];
      for (let i = 0; i < 5; i++) {
        log('cached', i + 1);
        const r = await runPage({ profile: warm, url: bench('book=test-book') });
        runs.push({ timing: timing(r), net: netSummary(r.network) });
      }
      results.cached = { runs, compilerReadyMedian: median(runs.map((x) => x.timing.compilerReady)), compilerReadyRange: range(runs.map((x) => x.timing.compilerReady)), firstPdfMedian: median(runs.map((x) => x.timing.firstPdf)), firstPdfRange: range(runs.map((x) => x.timing.firstPdf)) };
      save();
    }

    if (ONLY.has('slownet')) {
      const profile = tmpProfile('slow');
      log('slow network');
      const r = await runPage({ profile, url: bench('book=test-book'), slowNet: true });
      results.slowNetwork = { conditions: '10 Mbps down, 5 Mbps up, 40 ms', timing: timing(r), net: netSummary(r.network) };
      fs.rmSync(profile, { recursive: true, force: true });
      save();
    }

    if (ONLY.has('books')) {
      log('idle page (memory baseline)');
      results.idleRenderer = (await runPage({ profile: warm, url: bench('idle=1') })).memory;
      results.books = {};
      for (const book of BOOKS) {
        log('book', book);
        const r = await runPage({ profile: warm, url: bench(`book=${book}&warm=5`) });
        if (r.result.error) throw new Error(`${book}: ${r.result.error}`);
        const x = r.result;
        results.books[book] = { words: x.words, chapters: x.chapters, pages: x.pages, compile: x.compile, memory: r.memory, diagnostics: x.diagnostics, typstVersion: x.typstVersion };
        save();
      }
    }

    if (ONLY.has('cpu')) {
      log('cpu 4x');
      const r = await runPage({ profile: warm, url: bench('book=test-book&warm=3'), cpu: 4 });
      results.cpu4x = { book: 'test-book', compile: r.result.compile, timing: timing(r) };
      save();
    }

    if (ONLY.has('checks')) {
      results.checks = {};
      for (const book of BOOKS) {
        log('checks', book);
        const r = await runPage({ profile: warm, url: bench(`book=${book}&checks=1`), wantPdf: true });
        if (r.result.error) throw new Error(`${book}: ${r.result.error}`);
        fs.writeFileSync(path.join(OUT, `${book}.pdf`), r.pdf);
        // The same reader again, in Node, on the saved file.
        const node = await globalThis.kdpPdfCheck.read(new Uint8Array(r.pdf), { inflate: async (b) => zlib.inflateSync(b) });
        results.checks[book] = { pages: r.result.pages, pdf: r.result.pdf, layout: r.result.layout, nodeReader: node.pageCount, fileBytes: r.pdf.length };
        save();
      }
    }

    if (ONLY.has('cases')) {
      log('cases');
      const r = await runPage({ profile: warm, url: `${BASE}cases.html` });
      results.cases = r.result;
      save();
    }
    fs.rmSync(warm, { recursive: true, force: true });
  } finally {
    if (server) server.kill();
  }
  save();
  log('done:', path.join(OUT, 'results.json'));
}

main().catch((e) => { console.error(e); process.exit(1); });
