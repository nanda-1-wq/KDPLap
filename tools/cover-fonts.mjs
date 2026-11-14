// node tools/cover-fonts.mjs   (from the repo root; network; about 900 downloads)
// 09 Cover, E16 Part 2 (plan §8): the cover font catalog.
//
// Rule (plan §8, owner B3):
//   - Google Fonts families (fonts.google.com/metadata/fonts) that include Latin;
//   - whose google/fonts METADATA.pb says `license: "OFL"` or `license: "APACHE2"`
//     (the field, not the folder name; UFL and every other licence are dropped);
//   - that @expo-google-fonts publishes as static TTFs (the 08 source);
//   - no kept file over 2 MB (owner, STOP 2, F5);
//   - the top 300 by Google Fonts popularity, always with the 20 design fonts.
//   Weights: the ones among 400, 600 and 700 that have their own file (plan D5).
//   A family Typst cannot tell from a more popular one (same family name, weight class and
//   width class in the files, e.g. Roboto Condensed = Roboto) is dropped (STOP 2 finding).
//   Groups: serif → Serif, sans serif → Sans, display → Display,
//   handwriting → Script, monospace → Mono; the 20 design fonts keep the
//   design's group (js/cover/model.js FONTS).
//
// Every file is downloaded from jsdelivr, hashed (sha384, the SRI the loader
// checks) and read: unitsPerEm, hhea ascender and descender, OS/2 cap height,
// and the name table (family names Typst matches, PostScript name).
// Files are cached in tests/browser/.cache/cover-fonts/ (ignored by git).
//
// Writes:
//   js/cover/font-catalog.js    the catalog (kdpCover.fontCatalog)
//   docs/reviews/e16-fonts.json the run's numbers (kept, dropped, why)
// The sprite (img/cover-fonts.png) and the notices list are made by
// tools/cover-fonts-sprite.mjs from the catalog.
//
// Flags: --limit N (default 300); --max-bytes N (drop families with a bigger
// file; default 2097152, owner STOP 2 F5; 0 = no cap); --keep-collisions.
// tools/check-cover-fonts.mjs re-checks the pins.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(REPO, 'tests/browser/.cache/cover-fonts');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = Number(arg('--limit', 300));
// --max-bytes N: drop a family with a kept file over N bytes. Default 2 MB (owner, STOP 2, F5: a font
// pick never downloads more than 2 MB; drops the big CJK families). --max-bytes 0: no cap.
const MAX_BYTES = Number(arg('--max-bytes', 2097152)) || 0;
const WEIGHTS = { 400: '400Regular', 600: '600SemiBold', 700: '700Bold' };
const GROUPS = { 'Serif': 'Serif', 'Sans Serif': 'Sans', 'Display': 'Display', 'Handwriting': 'Script', 'Monospace': 'Mono' };
// The 20 design fonts and their design groups (js/cover/model.js FONTS; plan §8 table).
const DESIGN = [
  ['Source Serif 4', 'Serif'], ['EB Garamond', 'Serif'], ['Lora', 'Serif'], ['Playfair Display', 'Serif'],
  ['Merriweather', 'Serif'], ['Libre Baskerville', 'Serif'], ['Roboto Slab', 'Serif'],
  ['IBM Plex Sans', 'Sans'], ['Inter', 'Sans'], ['Montserrat', 'Sans'], ['Poppins', 'Sans'], ['Raleway', 'Sans'],
  ['Oswald', 'Display'], ['Bebas Neue', 'Display'], ['Abril Fatface', 'Display'], ['Anton', 'Display'],
  ['Pacifico', 'Script'], ['Dancing Script', 'Script'], ['Great Vibes', 'Script'], ['Space Mono', 'Mono']
];
const DESIGN_GROUP = new Map(DESIGN);
const LICENCE = { OFL: 'OFL-1.1', APACHE2: 'Apache-2.0' };

const sri = (b) => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, as = 'buffer', tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return as === 'json' ? await r.json() : as === 'text' ? await r.text() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url}: ${e.message}`);
      await sleep(800 * (i + 1));
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let at = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (at < items.length) { const i = at++; out[i] = await fn(items[i], i); } }));
  return out;
}

/* ── TTF reader: head, hhea, OS/2, name ── */
export function readTtf(buf) {
  const b = Buffer.from(buf);
  const n = b.readUInt16BE(4);
  const t = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    t[b.toString('latin1', o, o + 4)] = { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) };
  }
  const upm = b.readUInt16BE(t.head.off + 18);
  const asc = b.readInt16BE(t.hhea.off + 4), desc = b.readInt16BE(t.hhea.off + 6);
  let cap = null, weightClass = 400, widthClass = 5;
  if (t['OS/2']) {
    const o = t['OS/2'].off, ver = b.readUInt16BE(o);
    weightClass = b.readUInt16BE(o + 4); widthClass = b.readUInt16BE(o + 6);
    if (ver >= 2 && t['OS/2'].len >= 90) cap = b.readInt16BE(o + 88);
  }
  // The cap height is the top of the "H" glyph (cmap format 4, loca, glyf) when the file has one:
  // some files carry a wrong OS/2 sCapHeight (Delius: 0.195 em), and an old OS/2 has none.
  const os2Cap = cap;
  const hTop = t.cmap && t.loca && t.glyf ? glyphTop(b, t, 0x48) : null;
  if (hTop != null && hTop > 0) cap = hTop;
  const names = {};
  if (t.name) {
    const o = t.name.off, count = b.readUInt16BE(o + 2), str = o + b.readUInt16BE(o + 4);
    for (let i = 0; i < count; i++) {
      const r = o + 6 + i * 12;
      const pid = b.readUInt16BE(r), eid = b.readUInt16BE(r + 2), lang = b.readUInt16BE(r + 4), id = b.readUInt16BE(r + 6);
      const len = b.readUInt16BE(r + 8), at = str + b.readUInt16BE(r + 10);
      if (![1, 2, 4, 6, 16, 17].includes(id)) continue;
      let s = null;
      if (pid === 3 && (eid === 1 || eid === 10) && (lang === 0x409)) {
        s = ''; for (let k = 0; k < len; k += 2) s += String.fromCharCode(b.readUInt16BE(at + k));
        names[id] = s;
      } else if (pid === 1 && eid === 0 && names[id] == null) {
        names[id] = b.toString('latin1', at, at + len);
      }
    }
  }
  return { upm, asc, desc, cap, os2Cap, names, weightClass, widthClass };
}

/**
 * The family name Typst 0.14 gives a font: name ID 1 (not 16) with style words trimmed from its
 * end ("Roboto Condensed SemiBold" → "Roboto", "Archivo Black" → "Archivo"); Typst then picks the
 * face by its OS/2 weight and width classes. Ported from typst-library text/font/book.rs
 * typographic_family(); tests/browser/cover/t-engine-real.mjs section E proves it on every face.
 */
export function typstFamily(name) {
  const SEP = [' ', '-', '_'];
  const MODIFIERS = ['extra', 'ext', 'ex', 'x', 'semi', 'sem', 'sm', 'demi', 'dem', 'ultra'];
  const SUFFIXES = ['normal', 'italic', 'oblique', 'slanted', 'thin', 'th', 'hairline', 'light', 'lt', 'regular', 'medium', 'med',
    'md', 'bold', 'bd', 'demi', 'extb', 'black', 'blk', 'bk', 'heavy', 'narrow', 'condensed', 'cond', 'cn', 'cd', 'compressed', 'expanded', 'exp'];
  let family = String(name).trim().replace(/^\.+/, '');
  const lower = family.toLowerCase();
  let len = Infinity, trimmed = lower;
  while (trimmed.length < len) {
    len = trimmed.length;
    let t = trimmed, shortened = false;
    for (;;) { const sfx = SUFFIXES.find((x) => t.endsWith(x)); if (!sfx) break; shortened = true; t = t.slice(0, -sfx.length); }
    if (!shortened) break;
    if (SEP.some((c) => t.endsWith(c))) { t = t.slice(0, -1); trimmed = t; }
    const mod = MODIFIERS.find((x) => t.endsWith(x));
    if (mod) { const u = t.slice(0, -mod.length); if (SEP.some((c) => u.endsWith(c))) trimmed = u.slice(0, -1); }
  }
  return family.slice(0, len);
}

/** yMax of the glyph for a BMP code point, or null. */
function glyphTop(b, t, cp) {
  const c = t.cmap.off;
  let sub = -1;
  for (let i = 0, n = b.readUInt16BE(c + 2); i < n; i++) {
    const r = c + 4 + i * 8, pid = b.readUInt16BE(r), eid = b.readUInt16BE(r + 2), off = c + b.readUInt32BE(r + 4);
    if (((pid === 3 && eid === 1) || pid === 0) && b.readUInt16BE(off) === 4) { sub = off; break; }
  }
  if (sub < 0) return null;
  const segX2 = b.readUInt16BE(sub + 6), ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  let gid = 0;
  for (let k = 0; k < segX2 / 2; k++) {
    const end = b.readUInt16BE(ends + 2 * k), start = b.readUInt16BE(starts + 2 * k);
    if (cp > end) continue;
    if (cp < start) break;
    const delta = b.readInt16BE(deltas + 2 * k), ro = b.readUInt16BE(ranges + 2 * k);
    if (!ro) gid = (cp + delta) & 0xffff;
    else { const g = b.readUInt16BE(ranges + 2 * k + ro + 2 * (cp - start)); gid = g ? (g + delta) & 0xffff : 0; }
    break;
  }
  if (!gid) return null;
  const long = b.readInt16BE(t.head.off + 50) === 1;
  const at = long ? b.readUInt32BE(t.loca.off + gid * 4) : b.readUInt16BE(t.loca.off + gid * 2) * 2;
  const next = long ? b.readUInt32BE(t.loca.off + gid * 4 + 4) : b.readUInt16BE(t.loca.off + gid * 2 + 2) * 2;
  return next > at ? b.readInt16BE(t.glyf.off + at + 8) : null;
}

async function main(exclude = new Map()) {
  fs.mkdirSync(CACHE, { recursive: true });
  let meta = await fetchRetry('https://fonts.google.com/metadata/fonts', 'text');
  if (meta.startsWith(")]}'")) meta = meta.slice(4);
  const list = JSON.parse(meta).familyMetadataList;
  const byName = new Map(list.map((f) => [f.family, f]));
  for (const [fam] of DESIGN) if (!byName.has(fam)) throw new Error(`design font missing on Google Fonts: ${fam}`);
  const sorted = list.slice().sort((a, b) => a.popularity - b.popularity);
  const dropped = [];
  const kept = [];

  async function consider(f) {
    const why = (w) => { dropped.push({ family: f.family, popularity: f.popularity, why: w }); return null; };
    if (!(f.subsets || []).includes('latin')) return why('no latin');
    if (exclude.has(f.family)) return why(`Typst cannot tell it from ${exclude.get(f.family)} (same family name, weight and width in the files)`);
    const dir = f.family.toLowerCase().replace(/[^a-z0-9]/g, '');
    let lic = null, licDir = null;
    for (const d of ['ofl', 'apache', 'ufl']) {
      const pb = await fetchRetry(`https://raw.githubusercontent.com/google/fonts/main/${d}/${dir}/METADATA.pb`, 'text');
      if (pb) { const m = /^license:\s*"([A-Z0-9]+)"/m.exec(pb); lic = m ? m[1] : 'unknown'; licDir = d; break; }
    }
    if (!lic) return why('no METADATA.pb');
    if (!LICENCE[lic]) return why(`licence ${lic}`);
    const slug = f.family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const reg = await fetchRetry(`https://registry.npmjs.org/@expo-google-fonts%2f${slug}/latest`, 'json');
    if (!reg || !reg.version) return why('not in @expo-google-fonts');
    const pkg = `@expo-google-fonts/${slug}@${reg.version}`;
    const listing = await fetchRetry(`https://data.jsdelivr.com/v1/packages/npm/@expo-google-fonts/${slug}@${reg.version}?structure=flat`, 'json');
    const files = (listing && listing.files || []).map((x) => x.name);
    const faces = {};
    for (const [w, name] of Object.entries(WEIGHTS)) {
      const hit = files.find((p) => p.startsWith(`/${name}/`) && p.endsWith(`_${name}.ttf`));
      if (hit) faces[w] = hit.slice(1);
    }
    if (!Object.keys(faces).length) return why('no 400, 600 or 700 TTF');
    if (MAX_BYTES) {
      const sizes = (listing.files || []).filter((x) => Object.values(faces).includes(x.name.slice(1))).map((x) => x.size || 0);
      if (Math.max(0, ...sizes) > MAX_BYTES && !DESIGN_GROUP.has(f.family)) return why(`file over ${MAX_BYTES} bytes`);
    }
    return { family: f.family, group: DESIGN_GROUP.get(f.family) || GROUPS[f.category] || 'Sans', popularity: f.popularity,
      licence: LICENCE[lic], licDir, pkg, faces, design: DESIGN_GROUP.has(f.family) };
  }

  // Walk the list in popularity order, 24 at a time, until LIMIT are kept; the 20 design fonts always.
  const designLeft = new Set(DESIGN.map((d) => d[0]));
  for (let i = 0; i < sorted.length && (kept.length < LIMIT || designLeft.size); i += 24) {
    const batch = sorted.slice(i, i + 24).filter((f) => kept.length < LIMIT || designLeft.has(f.family));
    const got = await pool(batch, 12, consider);
    for (const g of got) {
      if (!g) continue;
      if (kept.length >= LIMIT && !g.design) continue;
      kept.push(g); designLeft.delete(g.family);
    }
    process.stdout.write(`\rlooked at ${Math.min(i + 24, sorted.length)}, kept ${kept.length}   `);
  }
  console.log();
  for (const d of designLeft) throw new Error(`design font not kept: ${d} (${(dropped.find((x) => x.family === d) || {}).why})`);
  // A design font past the limit replaces the last non-design font, so the total stays LIMIT.
  while (kept.length > LIMIT) {
    const k = kept.map((x, i) => [x, i]).reverse().find(([x]) => !x.design);
    if (!k) break;
    dropped.push({ family: k[0].family, popularity: k[0].popularity, why: 'over the limit (a design font took its place)' });
    kept.splice(k[1], 1);
  }

  // Download, hash and read every face.
  const jobs = kept.flatMap((f) => Object.entries(f.faces).map(([w, p]) => ({ f, w, p })));
  let done = 0;
  await pool(jobs, 16, async (j) => {
    const local = path.join(CACHE, j.f.pkg, j.p);
    let b = fs.existsSync(local) ? fs.readFileSync(local) : null;
    if (!b) {
      b = await fetchRetry(`https://cdn.jsdelivr.net/npm/${j.f.pkg}/${j.p}`);
      if (!b) throw new Error(`missing ${j.f.pkg}/${j.p}`);
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, b);
    }
    const t = readTtf(b);
    const r = (v) => Math.round(v / t.upm * 10000) / 10000;
    j.f.faces[j.w] = {
      path: j.p, bytes: b.length, sri: sri(b),
      cap: t.cap != null && t.cap > 0 ? r(t.cap) : null, asc: r(t.asc), desc: r(-t.desc),
      family: typstFamily(t.names[1] || t.names[16] || j.f.family), sub: t.names[17] || t.names[2] || '', ps: t.names[6] || '',
      weightClass: t.weightClass, widthClass: t.widthClass,
      capNote: t.os2Cap != null && t.cap != null && Math.abs(t.os2Cap - t.cap) / t.cap > 0.05 ? `OS/2 ${r(t.os2Cap)} vs H ${r(t.cap)}` : null
    };
    process.stdout.write(`\rfiles ${++done}/${jobs.length}   `);
  });
  console.log();

  // The catalog: compact rows, in popularity order.
  const rows = kept.map((f) => {
    const faces = {};
    for (const [w, x] of Object.entries(f.faces)) faces[w] = [x.path, x.bytes, x.sri, x.ps, x.family, x.cap, x.asc, x.desc, x.weightClass, x.widthClass];
    return [f.family, f.group, f.licence, f.pkg, faces];
  });
  const groups = {}; for (const f of kept) groups[f.group] = (groups[f.group] || 0) + 1;
  const files = jobs.length;
  const bytes = kept.reduce((n, f) => n + Object.values(f.faces).reduce((m, x) => m + x.bytes, 0), 0);
  const src = `/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the font catalog (E16 Part 2, plan §8)
   /js/cover/font-catalog.js   (GENERATED by tools/cover-fonts.mjs; do not edit;
                                checked by tools/check-cover-fonts.mjs and
                                tests/cover-fonts.test.js)

   ${kept.length} Google Fonts families: licence OFL 1.1 or Apache 2.0 only (the
   METADATA.pb licence field), Latin, static TTFs from @expo-google-fonts${MAX_BYTES ? `, no file
   over ${(MAX_BYTES / 1048576).toFixed(0)} MB` : ''}, not confused with a more popular family by Typst, top
   ${LIMIT} by Google Fonts popularity, with the 20 design fonts. Weights: 400,
   600 and 700 where the family has its own file. ${files} files, ${(bytes / 1048576).toFixed(1)} MB.
   Groups: ${Object.entries(groups).map(([g, n]) => `${g} ${n}`).join(', ')}.
   Made ${new Date().toISOString().slice(0, 10)}.

   Row: [family, group, licence, npm package@version, { weight: face }]
   Face: [path in the package, bytes, sha384, PostScript name, the family name Typst
          gives the file (name ID 1, style words trimmed), cap height, hhea ascender,
          hhea descender (these 3 in em; cap = the top of "H", else OS/2 sCapHeight,
          null when the file has neither), OS/2 weight
          class, OS/2 width class] (Typst picks a face by family, weight and width)
═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  C.fontCatalog = ${JSON.stringify(rows)};
})(globalThis);
`;
  fs.writeFileSync(path.join(REPO, 'js/cover/font-catalog.js'), src.replace(/\],\[/g, '],\n[').replace('= [[', '= [\n['));
  // Two faces Typst cannot tell apart (same family, weight and width): a cover using both would get
  // one of them. The less popular family is dropped and the walk runs again (--keep-collisions: kept).
  const seenKey = new Map(), collisions = [];
  for (const f of kept) for (const [w, x] of Object.entries(f.faces)) {
    const k = `${x.family.toLowerCase()}|${x.weightClass}|${x.widthClass}`;
    if (seenKey.has(k)) collisions.push({ keep: seenKey.get(k).family, drop: f.family, text: `${seenKey.get(k).family} ${seenKey.get(k).w} = ${f.family} ${w} (${k})` });
    else seenKey.set(k, { family: f.family, w });
  }
  if (collisions.length && !process.argv.includes('--keep-collisions')) {
    for (const c of collisions) if (!exclude.has(c.drop) && !DESIGN_GROUP.has(c.drop)) exclude.set(c.drop, c.keep);
    if (collisions.some((c) => !DESIGN_GROUP.has(c.drop) && kept.some((f) => f.family === c.drop))) {
      console.log(`Typst name collisions: ${collisions.map((c) => c.text).join('; ')}; walking again without ${[...exclude.keys()].join(', ')}`);
      return main(exclude);
    }
  }
  fs.writeFileSync(path.join(REPO, 'docs/reviews/e16-fonts.json'), JSON.stringify({
    date: new Date().toISOString(), limit: LIMIT, maxBytes: MAX_BYTES || null, kept: kept.length, files, bytes, groups,
    licences: kept.reduce((o, f) => (o[f.licence] = (o[f.licence] || 0) + 1, o), {}),
    capNotes: kept.flatMap((f) => Object.entries(f.faces).filter(([, x]) => x.capNote).map(([w, x]) => `${f.family} ${w}: ${x.capNote}`)),
    collisions: collisions.map((c) => c.text), excludedForCollisions: Object.fromEntries(exclude),
    lastPopularity: kept.length ? Math.max(...kept.map((f) => f.popularity)) : null,
    dropped
  }, null, 1));
  writeNotices(kept);
  console.log(`kept ${kept.length} families, ${files} files, ${(bytes / 1048576).toFixed(1)} MB; dropped ${dropped.length}`);
}

/** THIRD-PARTY-NOTICES.md: the cover font list between its two markers (replaced on each run). */
function writeNotices(kept) {
  const p = path.join(REPO, 'THIRD-PARTY-NOTICES.md');
  const A = '<!-- cover-fonts:start (written by tools/cover-fonts.mjs) -->', B = '<!-- cover-fonts:end -->';
  const lines = kept.slice().sort((a, b) => a.family.localeCompare(b.family)).map((f) =>
    `- ${f.family}: ${f.licence === 'OFL-1.1' ? 'SIL Open Font License 1.1' : 'Apache License 2.0'}; \`${f.pkg}\`, weights ${Object.keys(f.faces).join(', ')}; https://fonts.google.com/specimen/${f.family.replace(/ /g, '+')}`);
  const block = `${A}
## Cover fonts (09 Cover, E16)

${kept.length} font families for the cover editor (plan §8). Each is under the
SIL Open Font License 1.1 or the Apache License 2.0 (the \`license\` field of
its google/fonts METADATA.pb). The static TTFs load from jsdelivr or unpkg at
the pinned \`@expo-google-fonts\` versions, each checked against its sha384
(\`js/cover/font-catalog.js\`). Only the fonts a cover uses are embedded in its
PDF (as subsets), which both licences allow, also on books that are sold.
OFL 1.1: https://openfontlicense.org. Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0

${lines.join('\n')}
${B}`;
  let s = fs.readFileSync(p, 'utf8');
  const i = s.indexOf(A), j = s.indexOf(B);
  s = i >= 0 && j > i ? s.slice(0, i) + block + s.slice(j + B.length) : `${s.trimEnd()}\n\n${block}\n`;
  fs.writeFileSync(p, s);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
