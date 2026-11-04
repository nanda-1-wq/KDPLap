// node tools/check-format-cdn.mjs   (from the repo root; network)
// 08 Format, E13.1: every pinned file in js/format/files.js, three ways:
// jsdelivr, unpkg and the npm tarball (its own sha512 checked against the
// registry first). Each must have the size and the sha384 that files.js pins.
// Run it after any change to files.js. Downloads go to a new temp folder,
// are only hashed (tarballs are unpacked, never run) and are deleted at the end.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../js/format/files.js');
const F = globalThis.kdpFormatFiles;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nicheink-cdn-'));
const sri = (b) => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const tarballs = new Map();
async function fromTarball(pkg, file) {
  if (!tarballs.has(pkg)) {
    const at = pkg.lastIndexOf('@');
    const meta = await (await fetch(`https://registry.npmjs.org/${pkg.slice(0, at)}/${pkg.slice(at + 1)}`)).json();
    const tgz = await get(meta.dist.tarball);
    const integrity = `sha512-${crypto.createHash('sha512').update(tgz).digest('base64')}`;
    if (integrity !== meta.dist.integrity) throw new Error(`${pkg}: tarball integrity does not match the registry`);
    const dir = fs.mkdtempSync(path.join(TMP, 'pkg-'));
    fs.writeFileSync(path.join(dir, 'p.tgz'), tgz);
    execFileSync('tar', ['-xzf', path.join(dir, 'p.tgz'), '-C', dir]);
    tarballs.set(pkg, path.join(dir, 'package'));
  }
  return fs.readFileSync(path.join(tarballs.get(pkg), file));
}

let bad = 0;
try {
  for (const f of F.all()) {
    const [jsd, unpkg] = await Promise.all(F.urls(f).map(get));
    const npm = await fromTarball(f.pkg, f.path);
    const row = [['jsdelivr', jsd], ['unpkg', unpkg], ['npm', npm]].map(([k, b]) => [k, b.length === f.bytes && sri(b) === f.sri]);
    const ok = row.every(([, x]) => x);
    if (!ok) bad++;
    console.log(ok ? 'PASS' : 'FAIL', `${f.pkg}/${f.path}`, f.bytes, row.map(([k, x]) => `${k}:${x ? 'ok' : 'MISMATCH'}`).join(' '));
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(bad ? `${bad} file(s) do not match files.js` : `all ${F.all().length} files match on jsdelivr, unpkg and npm`);
process.exit(bad ? 1 : 0);
