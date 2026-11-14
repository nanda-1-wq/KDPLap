// node tools/check-cover-fonts.mjs --check        (from the repo root; network for missing files)
// node tools/check-cover-fonts.mjs --all-cdns     (every file from jsdelivr AND unpkg: about 850 MB)
// 09 Cover, E16 Part 2 (plan §8): the cover font pins, like check-format-cdn.mjs for 08.
//   --check     every pinned file (js/cover/font-catalog.js) re-hashed: the local copy in
//               tests/browser/.cache/cover-fonts (downloaded from jsdelivr when missing) must
//               have the pinned size and sha384; the 20 design fonts' files are also
//               fetched from unpkg and must be the same bytes. Licences: OFL-1.1 or
//               Apache-2.0 only.
//   --all-cdns  every file from both CDNs (slow; run after a catalog change).
// Prints one line per problem, then "cover fonts ok: …" or exits 1.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
require('../js/cover/font-catalog.js');
const ROWS = globalThis.kdpCover.fontCatalog;
const CACHE = path.join(REPO, 'tests/browser/.cache/cover-fonts');
const DESIGN = ['Source Serif 4', 'EB Garamond', 'Lora', 'Playfair Display', 'Merriweather', 'Libre Baskerville', 'Roboto Slab',
  'IBM Plex Sans', 'Inter', 'Montserrat', 'Poppins', 'Raleway', 'Oswald', 'Bebas Neue', 'Abril Fatface', 'Anton',
  'Pacifico', 'Dancing Script', 'Great Vibes', 'Space Mono'];
const all = process.argv.includes('--all-cdns');
const sri = (b) => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
    catch (e) { if (i === 2) throw new Error(`${url}: ${e.message}`); await new Promise((r) => setTimeout(r, 1000 * (i + 1))); }
  }
}
async function pool(items, n, fn) { let at = 0; await Promise.all(Array.from({ length: n }, async () => { while (at < items.length) { const i = at++; await fn(items[i]); } })); }

const bad = [];
const files = [];
for (const [family, group, licence, pkg, faces] of ROWS) {
  if (!['OFL-1.1', 'Apache-2.0'].includes(licence)) bad.push(`${family}: licence ${licence}`);
  if (!['Serif', 'Sans', 'Display', 'Script', 'Mono'].includes(group)) bad.push(`${family}: group ${group}`);
  for (const [w, f] of Object.entries(faces)) files.push({ family, w, pkg, path: f[0], bytes: f[1], sri: f[2] });
}
for (const d of DESIGN) if (!ROWS.some((r) => r[0] === d)) bad.push(`design font missing: ${d}`);
let checked = 0, unpkg = 0;
await pool(files, 12, async (f) => {
  const local = path.join(CACHE, f.pkg, f.path);
  let b = fs.existsSync(local) ? fs.readFileSync(local) : null;
  if (!b || all) {
    b = await get(`https://cdn.jsdelivr.net/npm/${f.pkg}/${f.path}`);
    if (!all) { fs.mkdirSync(path.dirname(local), { recursive: true }); fs.writeFileSync(local, b); }
  }
  if (b.length !== f.bytes || sri(b) !== f.sri) bad.push(`${f.pkg}/${f.path}: ${b.length} bytes ${sri(b)} ≠ pinned ${f.bytes} ${f.sri}`);
  checked++;
  if (all || DESIGN.includes(f.family)) {
    const u = await get(`https://unpkg.com/${f.pkg}/${f.path}`);
    if (u.length !== f.bytes || sri(u) !== f.sri) bad.push(`unpkg ${f.pkg}/${f.path}: not the pinned bytes`);
    unpkg++;
  }
});
for (const b of bad) console.log(`FAIL ${b}`);
if (bad.length) process.exit(1);
console.log(`cover fonts ok: ${ROWS.length} families, ${checked} files at their pinned size and sha384${all ? ' on jsdelivr' : ''}, ${unpkg} also on unpkg; licences OFL-1.1 / Apache-2.0 only; the 20 design fonts present`);
