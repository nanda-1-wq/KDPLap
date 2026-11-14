// node tests/browser/cover/qa-files.mjs <folder> [--no-safari]   (from the repo root)
// 09 Cover, E16 Part 2: the files for the owner's KDP Print Previewer run (plan STOP 2, R10).
// The folder must be OUTSIDE git (the owner's private folder). Each file isolates one risk.
//   C-*  built in Chrome (patches are Chrome canvas JPEGs: ICC v4 "sRGB" inside)
//   S-*  built in Safari (patches are Safari canvas JPEGs: no ICC profile)
// Writes README.md (what each file tests, the trim and page count its manuscript needs, our own
// check result) and checks.json. Book: the design's sample book; pictures are synthetic.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { coverChrome, coverSafari, ensureServer, log, REPO } from './lib.mjs';

const DIR = path.resolve(process.argv[2] || '');
if (!process.argv[2] || DIR.startsWith(REPO)) { console.error('Give a folder outside the repo.'); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });
const noSafari = process.argv.includes('--no-safari');
const KEYS = ['blank', 'band', 'center', 'stack', 'corner', 'picfull', 'picband', 'framed', 'arch', 'circle', 'stripes', 'ribbon', 'bold'];
const NAMES = { blank: 'Blank', band: 'Band', center: 'Center', stack: 'Stack', corner: 'Corner', picfull: 'Picture full', picband: 'Picture band', framed: 'Framed', arch: 'Arch photo', circle: 'Big circle', stripes: 'Stripes', ribbon: 'Ribbon', bold: 'Bold type' };
const W54 = (trim) => ({ trim, pages: 54, paper: 'white' });
const rows = [];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

function write(name, b64) {
  const b = Buffer.from(b64, 'base64');
  fs.writeFileSync(path.join(DIR, name), b);
  return { bytes: b.length, sha: sha(b) };
}

/** The in-page builder: one cover → PDF + Kindle (+ checks). Same text for Chrome and Safari. */
const BUILD = `
  const [spec] = a;
  const H = kdpCoverHarness, cover = H.cover(spec);
  const p = await H.print(cover, { keep: true });
  const k = await H.kindle(cover, { keep: true });
  return { pdf: p.pdf, ok: p.ok, checks: p.checks.map((c) => (c.pass ? 'PASS ' : 'FAIL ') + c.key + ': ' + c.detail), patches: p.patches.length,
    patchIcc: p.patches.map((x) => x.color), fonts: p.fonts, kindle: k.b64, kindleColor: k.color, kindleMode: k.mode };
`;

const JOBS = [];
KEYS.forEach((key, i) => {
  for (const trim of ['6x9', '8.5x11']) {
    const n = String(i).padStart(2, '0');
    JOBS.push({ id: `L${n}-${key}-${trim}-54w`, spec: { layout: key, fmt: W54(trim) }, trim, pages: 54,
      what: `${NAMES[key]} layout, ${trim === '6x9' ? '6 × 9' : '8.5 × 11'}${key === 'blank' ? ' (no text: only the background; our "Fonts embedded" check fails by design, the app blocks it with C1)' : ''}${['picfull', 'picband', 'arch'].includes(key) ? ' with a picture patch' : ''}${trim === '8.5x11' ? '; Kindle uses kFit (background above and below)' : ''}` });
  }
});
JOBS.push({ id: 'S1-effects-6x9-54w', spec: { sheet: 'effects' }, trim: '6x9', pages: 54, what: 'All 9 text effects, curve, distortion, opacity 50, letter spacing, a turned shadowed text: effect patches under vector letters; hollow and distorted letters as patches' });
JOBS.push({ id: 'S2-pictures-6x9-54w', spec: { sheet: 'photos' }, trim: '6x9', pages: 54, what: 'Flattened pictures: full-bleed back with darken, arch mask + border, circle sepia, rounded B/W + blur, 60% picture turned 10°, flip + contrast + saturation, a transparent PNG on a gradient' });
JOBS.push({ id: 'S3-shapes-6x9-54w', spec: { sheet: 'shapes' }, trim: '6x9', pages: 54, what: 'The 27 shapes as vector curves (even-odd holes, dash and dot borders, flips, turns); 7 gradients and 2 see-through shapes as patches' });
JOBS.push({ id: 'S4-spine-6x9-120w', spec: { sheet: 'spine' }, trim: '6x9', pages: 120, what: 'Band layout with spine text by cap height (IBM Plex Sans 600 capitals, full title and pen name on one line). NEEDS a 120-page manuscript' });
const SAFARI = ['L01-band-6x9-54w', 'L05-picfull-8.5x11-54w', 'S1-effects-6x9-54w', 'S2-pictures-6x9-54w'];

await ensureServer();
async function runAll(browser, prefix, jobs, run) {
  for (const j of jobs) {
    log(prefix, j.id);
    const r = await run(j.spec);
    if (r.error) { rows.push({ file: `${prefix}-${j.id}.pdf`, error: r.error }); continue; }
    const pdf = write(`${prefix}-${j.id}.pdf`, r.pdf);
    const kin = write(`${prefix}-${j.id}-kindle.jpg`, r.kindle);
    rows.push({ prefix, id: j.id, browser, trim: j.trim, pages: j.pages, what: j.what, pdf, kindle: kin, ok: r.ok, checks: r.checks, patches: r.patches, patchIcc: [...new Set(r.patchIcc)],
      fonts: r.fonts, kindleColor: { ok: r.kindleColor.ok, icc: r.kindleColor.icc ? r.kindleColor.icc.desc : 'none' }, kindleMode: r.kindleMode });
  }
}

const c = await coverChrome();
try {
  await c.open();
  await runAll(`Chrome ${c.version}`, 'C', JOBS, (spec) => c.page.evaluate(new Function('a', `return (async () => { ${BUILD} })();`), [spec]));
} finally { await c.close(); }

if (!noSafari) {
  const s = await coverSafari();
  try {
    await s.open();
    await runAll(`Safari ${s.version}`, 'S', JOBS.filter((j) => SAFARI.includes(j.id)), (spec) => s.run(BUILD, [spec]));
  } finally { await s.close(); }
}

fs.writeFileSync(path.join(DIR, 'checks.json'), JSON.stringify(rows, null, 1));
const yes = (r) => (r.ok ? 'all pass' : r.id && r.id.includes('blank') ? 'all pass but Fonts embedded (no text, expected)' : `FAIL: ${r.checks.filter((x) => x.startsWith('FAIL')).join('; ')}`);
const t = (r) => `| \`${r.prefix}-${r.id}.pdf\` + \`-kindle.jpg\` | ${r.trim === '6x9' ? '6 × 9' : '8.5 × 11'}, ${r.pages} p, white | ${r.what} | ${r.patches} | ${yes(r)}; Kindle ${r.kindleColor.ok ? 'ok' : 'FAIL'} (ICC ${r.kindleColor.icc}) |`;
const readme = `# E16 STOP 2: files for the KDP Print Previewer

Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by \`tests/browser/cover/qa-files.mjs\` (branch e16-09-cover-design, not committed).
Book: the design's sample book ("Micro Study Habits for Busy Adult Learners", Adnan Haroun). Pictures are synthetic.
**Not in git.** Each file isolates one risk, so a Previewer fail points at one thing.

How to run: in a paperback draft, set the trim and paper as in the table, upload a manuscript with
**that page count** (white paper), then upload the cover PDF and open the Previewer. The Kindle JPGs
go in a Kindle eBook draft's cover upload (or Kindle Create) to see that KDP takes them.

Most important first:
1. \`C-S1-effects\`, \`C-S2-pictures\`, \`C-L05-picfull-6x9\` (Chrome patches: canvas JPEGs with ICC "sRGB" inside).
2. \`S-S1-effects\`, \`S-S2-pictures\`, \`S-L05-picfull-8.5x11\` (the same from Safari: JPEGs with no ICC).
3. \`C-S3-shapes\`, \`C-L01-band-6x9\` and \`C-L01-band-8.5x11\` (vector only).
4. The other layouts, if you have time. \`C-S4-spine\` needs a 120-page manuscript.

"Patches" = opaque 300 DPI JPEG pictures inside the PDF (flattened pictures, effects, gradients, see-through parts).
Our checks: one page, size to 0.001 in, fonts embedded, exactly one sRGB ICC profile, no OutputIntents, no transparency,
no security, every letter in its font, Typst line widths = the screen within 0.5%, only the chosen fonts, no font warning.

## Chrome-built (C-)

| Files | Trim, pages, paper | What it tests | Patches | Our checks |
|---|---|---|---|---|
${rows.filter((r) => r.prefix === 'C').map(t).join('\n')}

## Safari-built (S-)

| Files | Trim, pages, paper | What it tests | Patches | Our checks |
|---|---|---|---|---|
${rows.filter((r) => r.prefix === 'S').map(t).join('\n') || '| (not built: --no-safari) | | | | |'}

Please read back for each file you upload: PASS, or the Previewer's exact message.
`;
fs.writeFileSync(path.join(DIR, 'README.md'), readme);
const bad = rows.filter((r) => r.error || (!r.ok && !(r.id || '').includes('blank')) || !r.kindleColor.ok);
console.log(`${rows.length} covers (${rows.length * 2} files) in ${DIR}; problems: ${bad.length ? bad.map((r) => r.file || r.id).join(', ') : 'none'}`);
process.exit(bad.length ? 1 : 0);
