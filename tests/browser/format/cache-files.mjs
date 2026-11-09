// node tests/browser/format/cache-files.mjs   (run by tests/browser/run.sh for the format suite)
// E13.1 Part 3: every pinned print-engine file (js/format/files.js) in
// tests/browser/.cache/format/<pkg>/<path>, checked against its sha384.
// The mocked 08 tests serve them from there for both CDNs (no network).
// Prints "cache ok <n>" or exits 1.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const DIR = path.join(REPO, 'tests/browser/.cache/format');
const box = {};
vm.runInNewContext(fs.readFileSync(path.join(REPO, 'js/format/files.js'), 'utf8'), { globalThis: box });
const F = box.kdpFormatFiles;
const sri = (b) => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;

let n = 0;
for (const f of F.all()) {
  const out = path.join(DIR, f.pkg, f.path);
  if (fs.existsSync(out) && sri(fs.readFileSync(out)) === f.sri) { n++; continue; }
  let ok = false;
  for (const url of F.urls(f)) {
    const r = await fetch(url).catch(() => null);
    if (!r || !r.ok) continue;
    const b = Buffer.from(await r.arrayBuffer());
    if (sri(b) !== f.sri) continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, b);
    ok = true;
    break;
  }
  if (!ok) { console.log(`cache FAIL ${f.pkg}/${f.path}`); process.exit(1); }
  n++;
}
console.log(`cache ok ${n}`);
