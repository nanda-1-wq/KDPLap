/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the Export dialog (E16 Part 10, plan §5, designs 71,
   71b, 73d)
   /js/cover/export-dialog.js   (browser; needs js/cover/export.js and its
                                 modules, zip.js, js/format/engine.js and
                                 js/supabase.js; the editor calls it)

   The dialog (design S12):
   - Ready: Print cover PDF (always), Full cover image (PNG or JPG, on by
     default), Kindle front cover (on by default). Any Must fix blocks it
     (the list and "Open Checks"), and so does being offline.
   - Busy: the design's step list with a dot per step, and Stop. Stop (and
     the ×, Escape, or leaving 09) ends the run between steps: the files
     made so far are let go and nothing is recorded.
   - Failed (design 73d): "Export stopped." with the reason, Close and Try again.
   - Done (design 71b): the files with their real sizes, Download for each,
     "Download all (.zip)" (our own store-only zip), the KDP lines, Done.

   The run (one token per run; every await checks it):
   1. Autosave flushed: the export is built from the saved design only
      (offline, failed or a conflict stops it). cover_json read: its row must
      be this tab's (rev), else another tab saved a newer design: stopped.
   2. The pictures at full size (the screen keeps 4,096 px copies): the
      stored files, Unsplash at its own size. One that does not load stops it.
   3. Print cover PDF (export.print: Typst, the patches, the KDP rule check).
   4. Full image, Kindle JPG (read back: 1600 × 2560, plain sRGB).
   5. Saving: the key read again (another tab changed it: stopped); the
      cover_exports rows in ONE insert (all or nothing); then My layouts
      (a new entry; the last 5 of each book are kept, E16.2) and a history snapshot (reason export).
      After the rows are in, Stop is off: the files are recorded.

   kdpCover.exportDialog.open(E, opener)   kdpCover.exportDialog.close(E, refocus)
   kdpCover.exportDialog.hostHtml(E)       kdpCover.exportDialog.bindHost(host, E)
   kdpCover.exportDialog.escape(E)         → true when the dialog took the Escape
   kdpCover.exportDialog.stepsFor(E)       → the step texts
   kdpCover.exportDialog.errorText(err)    → the words after "Export stopped."
   kdpCover.exportDialog.sizeText(bytes)   → "6.1 MB", "820 KB"
   kdpCover.exportDialog.engineFor(E)      → the editor's one engine (made on the first export)
   kdpCover.exportDialog.leave(E)          → ends a run and the engine (leaving 09)
   kdpCover.exportDialog.test              → tests only: { hold, fail } hooks between steps
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = {
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    down14: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></svg>',
    ok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    tick: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };
  // cover_exports.engine: the Typst version (js/format/files.js) and the cover template (js/cover/typst.js).
  const ENGINE = {
    get print() { const F = root.kdpFormatFiles; return `typst ${(F && F.TYPST_VERSION) || '?'} · ${(C.typst && C.typst.TEMPLATE) || 'c'}`; },
    image: 'browser canvas', kindle: 'browser canvas'
  };
  const THUMB_H = 180, THUMB_MAX = 20000;
  const STOPPED = { stopped: true };
  // Tests only: hold(step) → a Promise the run waits on before that step; fail(step) → an error to throw there.
  const test = { hold: null, fail: null };

  /* ── Words ── */
  function sizeText(n) {
    if (!(n > 0)) return '';
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  const CODE_TEXT = {
    cover_stale: 'Your cover changed in another tab while the files were made, so nothing was saved. Export again.',
    cover_resized: 'The book size changed in 08 Format, so nothing was saved. Open 09 Cover again so your design moves to the new size, then export.',
    cover_pdf_missing: 'Your Print PDF in 08 Format is not current, so nothing was saved. Export the Print PDF in 08 first.',
    cover_rights: 'A picture on your cover has no rights tick or stock source, or it was removed from Uploads, so nothing was saved. Check your pictures in Checks.',
    cover_trim: 'This trim size has no cover yet, so nothing was saved. Pick 5 × 8, 5.25 × 8, 5.5 × 8.5, 6 × 9, 8 × 10 or 8.5 × 11 in in 01 Brief.',
    cover_size: 'The file size did not match the book size, so nothing was saved. Reload the page, then export again.',
    cover_missing: 'Your cover is not saved yet, so nothing was exported. Reload the page, then export again.'
  };
  /** The words after "Export stopped." (design 73d). err: { kind, code, detail, name, size, checks }. */
  function errorText(err) {
    const e = err || {};
    switch (e.kind) {
      case 'engine': return 'The PDF engine did not start, so nothing was made and nothing was saved. Check your connection and try again. If it happens again, reload the page.';
      case 'crash': return 'The PDF engine stopped, so nothing was saved. Try again. If it happens again, reload the page.';
      case 'font': return `A font on your cover did not load${e.detail ? ` (${e.detail})` : ''}, so nothing was saved. Check your connection and try again.`;
      case 'picture': return `A picture on your cover did not load${e.name ? ` (${e.name})` : ''}, so nothing was saved. Check your connection and try again.`;
      case 'canvas': return `This device cannot paint the full image as one JPG (${e.size || 'the full size'} is more than its browser can draw at once), so nothing was saved. Pick "PNG, best quality", which is made in parts, and try again, or export on a computer.`;
      case 'checks': return 'The print PDF did not pass the KDP checks, so nothing was saved. Fix what is listed below, or try again.';
      case 'kindle': return `The Kindle JPG did not come out as KDP needs it (${e.detail || 'size or color'}), so nothing was saved. Try again.`;
      case 'otherTab': return 'Your cover was changed in another tab, so nothing was exported. Reload this page to see the newest version, then export again.';
      case 'notSaved': return 'Your latest change is not saved yet, so nothing was exported. Check your connection, then try again.';
      case 'offline': return 'The connection went, so nothing was saved. Try again when you are back online.';
      case 'record': return CODE_TEXT[e.code] || 'The files were made, but we couldn’t record them, so nothing was saved. Check your connection, then try again.';
      default: return 'Something went wrong, so nothing was saved. Try again. If it happens again, reload the page.';
    }
  }

  /** The design's exportSteps(), with this book's wrap size. */
  function stepsFor(E) {
    const X = E.ex, g = C.geo.geo(E.cover.fmt), L = C.names.labels(g);
    const out = [['print', `Building the print cover PDF (${L.wrap}, bleed included)`], ['check', 'Checking it against KDP rules']];
    if (X.img) out.push(['image', `Making the full cover image (${X.imgFmt === 'png' ? 'PNG' : 'JPG'}, 300 DPI)`]);
    if (X.kindle) out.push(['kindle', 'Making the Kindle front cover (JPG, 1600 × 2560 px)']);
    out.push(['save', 'Saving this design to My layouts']);
    return out;
  }

  /* ── The dialog ── */
  function state(E) {
    if (!E.ex) E.ex = { open: false, phase: 'ready', img: true, imgFmt: 'png', kindle: true, step: 0, run: 0, err: null, files: [], myErr: '', saving: false, opener: null, zip: false };
    return E.ex;
  }
  function open(E, opener) {
    const X = state(E);
    if (X.open) return;
    Object.assign(X, { open: true, phase: 'ready', step: 0, err: null, files: [], myErr: '', saving: false, zip: false,
      opener: opener && opener.getAttribute ? (opener.getAttribute('data-k') || (opener.hasAttribute('data-export') ? 'header' : null)) : null });
    E.renderExport();
    focusFirst(E);
  }
  function focusFirst(E) {
    const host = E.root.querySelector('[data-ex-host]'); if (!host) return;
    const X = E.ex;
    const want = X.phase === 'done' ? '[data-ex-dl]' : X.phase === 'failed' ? '[data-ex-retry]' : X.phase === 'busy' ? '[data-ex-stop]'
      : host.querySelector('[data-ex-checks]') ? '[data-ex-checks]' : '[data-ex-img]';
    const f = host.querySelector(want) || host.querySelector('[data-ex-close]');
    if (f) f.focus({ preventScroll: true });
  }
  /** Close (×, Cancel, Done, Close, Escape). While busy it is Stop: the run is let go, nothing is recorded. */
  function close(E, refocus = true) {
    const X = E.ex; if (!X || !X.open) return;
    if (X.phase === 'busy' && X.saving) return;   // the rows are on their way: they finish first
    X.open = false; X.run++; X.phase = 'ready'; X.files = []; X.saving = false;
    E.renderExport();
    if (!refocus) return;
    const sel = X.opener === 'header' ? '[data-export]' : X.opener ? `[data-k="${CSS.escape(X.opener)}"]` : '[data-export]';
    const o = document.querySelector(sel);
    if (o) o.focus({ preventScroll: true });
  }
  function escape(E) {
    if (!E.ex || !E.ex.open) return false;
    close(E, true);
    return true;
  }

  function hostHtml(E) {
    const X = E.ex;
    if (!X || !X.open) return '';
    const g = C.geo.geo(E.cover.fmt), L = C.names.labels(g);
    const items = C.checks.run(E.cover, E.checkOpt ? E.checkOpt() : {});
    const errs = items.filter((c) => c.sev === 'error'), warns = items.filter((c) => c.sev === 'warn');
    const offline = !!E.offline;
    const blocked = X.phase === 'ready' && (errs.length > 0 || offline);
    let body = '', foot = '';
    if (X.phase === 'ready') {
      if (blocked) {
        body += `<div class="cv-ex-alert" role="alert" data-ex-blocked>${I.warn}<div class="cv-ex-alert-t">
          <strong>${offline ? 'You are offline. Export needs a connection.' : `${errs.length} problem${errs.length === 1 ? '' : 's'} must be fixed first`}</strong>
          ${offline ? '' : errs.map((c) => `<div class="cv-ex-li">• ${esc(c.msg)}</div>`).join('')}
          ${offline ? '' : '<button type="button" class="cv-ex-chk" data-k="ex-checks" data-ex-checks>Open Checks</button>'}</div></div>`;
      }
      body += `<div class="cv-ex-opts">
        <div class="cv-ex-opt is-fixed"><input type="checkbox" checked disabled aria-label="Print cover PDF, always included">
          <div class="cv-ex-ot"><span class="cv-ex-on">Print cover PDF <span class="cv-ex-al">(always included)</span></span><span class="cv-ex-od">For KDP Paperback. Full wrap ${esc(L.wrap)} with bleed. Fonts embedded, see-through parts flattened, one sRGB color space. No template lines.</span></div></div>
        <div class="cv-ex-opt"><label class="cv-ex-box"><input type="checkbox" data-k="ex-img" data-ex-img${X.img ? ' checked' : ''} aria-label="Full cover image"></label>
          <div class="cv-ex-ot"><span class="cv-ex-on">Full cover image</span><span class="cv-ex-od">The same wrap as a picture, 300 DPI (${esc(L.px)}). For your records, ads or a print shop.</span>
            <span class="cv-ex-fmts" role="group" aria-label="Image file type"><button type="button" class="cv-ex-fmt${X.imgFmt === 'png' ? ' is-on' : ''}" data-k="ex-png" data-ex-fmt="png" aria-pressed="${X.imgFmt === 'png'}"${X.img ? '' : ' aria-disabled="true"'}>PNG, best quality</button><button type="button" class="cv-ex-fmt${X.imgFmt === 'jpg' ? ' is-on' : ''}" data-k="ex-jpg" data-ex-fmt="jpg" aria-pressed="${X.imgFmt === 'jpg'}"${X.img ? '' : ' aria-disabled="true"'}>JPG, smaller file</button></span></div></div>
        <label class="cv-ex-opt is-label"><span class="cv-ex-box"><input type="checkbox" data-k="ex-kindle" data-ex-kindle${X.kindle ? ' checked' : ''}></span>
          <span class="cv-ex-ot"><span class="cv-ex-on">Kindle front cover</span><span class="cv-ex-od">For KDP eBook. JPG, 1600 × 2560 px, made from your print front. Turn it off if this book has no eBook.</span></span></label>
        ${warns.length ? `<p class="cv-ex-warn">${I.warn}<span>${warns.length} item(s) in Checks are worth a look. They do not block export.</span></p>` : ''}
        <p class="cv-ex-my">This design is also saved to Layouts, My layouts (the last 5 of each book), so you can reuse it for your next book or a series.</p></div>`;
      foot = `<button type="button" class="cv-ex-sec" data-k="ex-cancel" data-ex-close>Cancel</button><button type="button" class="cv-ex-go" data-k="ex-go" data-ex-go${blocked ? ' aria-disabled="true"' : ''}>${I.down}Export</button>`;
    } else if (X.phase === 'busy') {
      const steps = stepsFor(E);
      body = `<div class="cv-ex-steps" role="status" aria-live="polite" data-ex-steps>${steps.map(([k, t], i) => {
        const st = i < X.step ? 'done' : i === X.step ? 'now' : 'todo';
        return `<div class="cv-ex-step is-${st}" data-ex-step="${k}"><span class="cv-ex-dot" aria-hidden="true">${st === 'done' ? I.tick : ''}</span><span>${esc(t)}</span><span class="sr-only">${st === 'done' ? ', done' : st === 'now' ? ', working' : ''}</span></div>`;
      }).join('')}
        <p class="cv-ex-note">You can keep this window open. It takes under a minute.</p></div>`;
      foot = `<button type="button" class="cv-ex-sec" data-k="ex-stop" data-ex-stop${X.saving ? ' aria-disabled="true" title="Saving your files: almost done"' : ''}>Stop</button>`;
    } else if (X.phase === 'failed') {
      const e = X.err || {};
      body = `<div class="cv-ex-alert" role="alert" data-ex-failed>${I.warn}<div class="cv-ex-alert-t"><span><strong>Export stopped.</strong> ${esc(errorText(e))}</span>
        ${e.kind === 'checks' && Array.isArray(e.checks) ? e.checks.map((c) => `<div class="cv-ex-li">• ${esc(c.name)}: ${esc(c.detail || '')}</div>`).join('') : ''}</div></div>`;
      foot = `<button type="button" class="cv-ex-sec" data-k="ex-close2" data-ex-close>Close</button><button type="button" class="cv-ex-go" data-k="ex-retry" data-ex-retry>Try again</button>`;
    } else if (X.phase === 'done') {
      body = `<div class="cv-ex-ok" role="status" data-ex-done>${I.ok}<span><strong>Your cover files are ready.</strong> ${X.myErr ? '' : 'The design is saved to My layouts.'}</span></div>
        ${X.myErr ? `<p class="cv-ex-warn" data-ex-myerr>${I.warn}<span>${esc(X.myErr)}</span></p>` : ''}
        <div class="cv-ex-files">${X.files.map((f, i) => `<div class="cv-ex-file" data-ex-file="${f.kind}"><span class="cv-ex-ft"><span class="cv-ex-fn cv-mono">${esc(f.name)}</span><span class="cv-ex-fw">${esc(f.what)} · ${esc(sizeText(f.bytes.length))}</span></span><button type="button" class="cv-ex-dl" data-k="ex-dl-${f.kind}" data-ex-dl="${i}" aria-label="Download ${esc(f.name)}">${I.down14}Download</button></div>`).join('')}</div>
        <div class="cv-ex-kdp" data-ex-kdp><strong>Where they go on KDP</strong><br>Paperback: Content, Cover, "Upload a cover you already have", then the PDF.${X.files.some((f) => f.kind === 'kindle') ? '<br>Kindle eBook: Content, Kindle eBook Cover, "Upload your cover file", then the JPG.' : ''}<br>Check it in the KDP Previewer before you publish.</div>`;
      foot = `<button type="button" class="cv-ex-sec" data-k="ex-zip" data-ex-zip${X.zip ? ' aria-disabled="true"' : ''}>${X.zip ? 'Making the zip…' : 'Download all (.zip)'}</button><button type="button" class="cv-ex-go" data-k="ex-done" data-ex-close>Done</button>`;
    }
    return `<div class="cv-ex-wrap" data-exdlg>
      <div class="cv-ex" role="dialog" aria-modal="true" aria-labelledby="cv-ex-h" aria-describedby="cv-ex-sub" data-ex-phase="${X.phase}">
        <div class="cv-ex-head"><div><h2 id="cv-ex-h">Export cover</h2><p id="cv-ex-sub">${esc(L.line)}</p></div>
          <button type="button" class="cv-ex-x" data-k="ex-x" data-ex-close aria-label="${X.phase === 'busy' ? 'Stop and close' : 'Close'}">${I.x}</button></div>
        <div class="cv-ex-body">${body}</div>
        <div class="cv-ex-foot">${foot}</div>
      </div></div>`;
  }

  function bindHost(host, E) {
    host.addEventListener('click', (e) => {
      const X = E.ex; if (!X || !X.open) return;
      if (e.target === host.querySelector('[data-exdlg]')) { if (X.phase !== 'busy') close(E); return; }   // the gray around it
      const b = e.target.closest('button');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      if (b.hasAttribute('data-ex-close') || b.hasAttribute('data-ex-stop')) close(E);
      else if (b.hasAttribute('data-ex-go') || b.hasAttribute('data-ex-retry')) run(E);
      else if (b.dataset.exFmt) { X.imgFmt = b.dataset.exFmt; E.renderExport(); }
      else if (b.hasAttribute('data-ex-checks')) { close(E, false); E.openChecks(); }
      else if (b.dataset.exDl != null) download(X.files[Number(b.dataset.exDl)]);
      else if (b.hasAttribute('data-ex-zip')) downloadZip(E);
    });
    host.addEventListener('change', (e) => {
      const X = E.ex; if (!X || !X.open || X.phase !== 'ready') return;
      if (e.target.matches('[data-ex-img]')) { X.img = e.target.checked; E.renderExport(); }
      else if (e.target.matches('[data-ex-kindle]')) { X.kindle = e.target.checked; E.renderExport(); }
    });
    // Tab stays inside the dialog (aria-modal).
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...host.querySelectorAll('button, input:not([disabled])')].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ── Downloads ── */
  function save(name, bytes, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function download(f) { if (f) save(f.name, f.bytes, f.type); }
  async function downloadZip(E) {
    const X = E.ex; if (!X.files.length || X.zip) return;
    X.zip = true; E.renderExport();
    await new Promise((r) => setTimeout(r, 30));   // the button's words paint first
    try {
      const zip = C.zip.make(X.files.map((f) => ({ name: f.name, bytes: f.bytes })), new Date());
      save(X.base + '_cover_files.zip', zip, 'application/zip');
    } finally {
      X.zip = false;
      if (X.open) { E.renderExport(); const b = E.root.querySelector('[data-ex-zip]'); if (b) b.focus({ preventScroll: true }); }
    }
  }

  /* ── The engine: one per visit of 09, made on the first export, ended on leave ── */
  function engineFor(E) {
    if (!E.exEngine) E.exEngine = root.kdpFormatEngine.create({});
    return E.exEngine;
  }
  function leave(E) {
    if (E.ex) { E.ex.run++; E.ex.open = false; E.ex.files = []; }
    if (E.exEngine) { try { E.exEngine.terminate(); } catch (e) { /* already gone */ } E.exEngine = null; }
  }

  /* ── The thumbnail (cover_exports.thumb, cover_my_layouts.thumb): the front at the trim, a JPEG data URL ≤ 20,000 characters ── */
  function thumb(cover, images) {
    const g = C.geo.geo(cover.fmt);
    for (const [h, q] of [[THUMB_H, 0.8], [THUMB_H, 0.6], [140, 0.6], [110, 0.5]]) {
      const k = h / g.trimH, w = Math.max(1, Math.round(g.trimW * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { alpha: false });
      ctx.fillStyle = cover.bg; ctx.fillRect(0, 0, w, h);
      C.render.paint(ctx, cover, { scale: k, x0: g.foldR, y0: g.b, images });
      const url = cv.toDataURL('image/jpeg', q);
      cv.width = 0;
      if (url.startsWith('data:image/jpeg;base64,') && url.length <= THUMB_MAX) return url;
    }
    return null;
  }

  /* ── The run ── */
  const round4 = (v) => Math.round(v * 10000) / 10000;
  const sig = (c) => JSON.stringify({ l: c.layers, b: c.bg, f: c.fmt });
  function classify(e) {
    if (e === STOPPED || (e && e.stopped)) return STOPPED;
    if (e && e.exKind) return { kind: e.exKind, code: e.code, detail: e.detail, name: e.name, size: e.size, checks: e.checks };
    if (e && e.kind === 'canvas') { const m = /\((\d[\d,]* × \d[\d,]* px)\)/.exec(String(e.message)); return { kind: 'canvas', size: m ? m[1] : '' }; }
    if (e && e.kind === 'font') return { kind: 'font', detail: String(e.message || '').replace(/^Font not available:\s*/, '') };
    if (e && (e.kind === 'download' || e.phase === 'load' || /download|did not load|failed to fetch|networkerror|load failed|import/i.test(String(e.message)))) return { kind: 'engine' };
    if (e && (e.phase || e.kind === 'engine' || e.kind === 'crash')) return { kind: 'crash' };
    return { kind: 'other' };
  }
  const fail = (exKind, more) => Object.assign(new Error(exKind), { exKind }, more || {});

  async function run(E) {
    const X = E.ex; if (!X || !X.open || X.phase === 'busy') return;
    const items = C.checks.run(E.cover, E.checkOpt ? E.checkOpt() : {});
    if (items.some((c) => c.sev === 'error') || E.offline) { X.phase = 'ready'; E.renderExport(); return; }
    const token = ++X.run, me = E;
    const alive = () => me.live() && X.open && X.run === token;
    const check = () => { if (!alive()) throw STOPPED; };
    const steps = stepsFor(E).map((s) => s[0]);
    const go = async (k) => {
      check();
      X.step = steps.indexOf(k); E.renderExport();
      if (test.hold) await test.hold(k);
      check();
      if (test.fail) { const f = test.fail(k); if (f) throw f; }
    };
    Object.assign(X, { phase: 'busy', step: 0, err: null, files: [], myErr: '', saving: false });
    E.renderExport(); focusFirst(E);
    const bookId = E.bookId, title = (E.data && E.data.book && E.data.book.title) || '';
    let pics = null;
    try {
      // 1. The saved design only.
      if (C.offline.isOffline()) throw fail('offline');
      const saved = await E.saver.flush(); check();
      if (C.offline.isOffline()) throw fail('offline');
      if (!saved || E.saver.state() !== 'saved' || E.saver.pending()) throw fail('notSaved');
      // The saved row and its key together: this tab's design must be that row (another tab may have saved a
      // newer one; then this tab's layers are old and must not be recorded under the newer key).
      const cj = await root.kdp.getCover(bookId); check();
      if (cj.error || !cj.data) throw fail(C.offline.isOffline() ? 'offline' : 'record');
      if (!cj.data.design || !cj.data.key) throw fail('record', { code: 'cover_missing' });
      if (cj.data.design.rev !== E.saver.rev()) throw fail('otherTab');
      const k1 = { data: cj.data.key };
      const cover = JSON.parse(JSON.stringify({ fmt: E.cover.fmt, bg: E.cover.bg, layers: E.cover.layers, layout: E.cover.layout == null ? null : E.cover.layout }));
      const g = C.geo.geo(cover.fmt), names = C.names.files(title, cover.fmt);
      X.base = names.base;
      // 2. The pictures at full size.
      await go('print');
      pics = await C.images.full(E, cover.layers, check);
      check();
      // 3. Print cover PDF and its KDP check.
      let pr;
      try {
        pr = await C.export.print(cover, { engine: engineFor(E), images: pics.get, bookId, onStep: (s) => { check(); if (s === 'check') { X.step = steps.indexOf('check'); E.renderExport(); } } });
      } catch (e) { if (e === STOPPED) throw e; check(); throw e; }
      await go('check');
      if (!pr.ok) throw fail('checks', { checks: pr.checks.filter((c) => !c.pass) });
      const files = [{ kind: 'print', name: names.pdf, type: 'application/pdf', bytes: pr.pdf, what: 'Paperback cover for KDP, full wrap with bleed, fonts embedded, one sRGB color space' }];
      // 4. The full image and the Kindle JPG.
      let im = null, kd = null;
      if (X.img) {
        await go('image');
        im = await C.export.image(cover, { format: X.imgFmt, images: pics.get });
        check();
        files.push({ kind: 'image', name: X.imgFmt === 'png' ? names.png : names.jpg, type: im.type, bytes: im.bytes, what: `The same full cover as an image, 300 DPI (${im.w} × ${im.h} px)` });
      }
      if (X.kindle) {
        await go('kindle');
        kd = await C.export.kindle(cover, { images: pics.get });
        check();
        if (!(kd.w === 1600 && kd.h === 2560 && kd.size && kd.size.w === 1600 && kd.size.h === 2560)) throw fail('kindle', { detail: 'size' });
        if (!kd.color || !kd.color.ok) throw fail('kindle', { detail: (kd.color && kd.color.why) || 'color' });
        files.push({ kind: 'kindle', name: names.kindle, type: 'image/jpeg', bytes: kd.bytes, what: 'Kindle eBook cover, 1600 × 2560 px, made from your front' });
      }
      // 5. Saving: the key again, then the rows in one insert (all or nothing).
      await go('save');
      if (C.offline.isOffline()) throw fail('offline');
      const k2 = await root.kdp.getCoverKey(bookId); check();
      if (k2.error) throw fail(C.offline.isOffline() ? 'offline' : 'record');
      if (k2.data !== k1.data) throw fail('record', { code: 'cover_stale' });
      const th = thumb(cover, pics.get);
      const rows = [{ kind: 'print', settingsKey: k1.data, engine: ENGINE.print, widthIn: round4(g.W / g.I), heightIn: round4(g.H / g.I), spineIn: round4(g.sp), thumb: th }];
      if (im) rows.push({ kind: 'image', settingsKey: k1.data, engine: ENGINE.image, widthPx: im.w, heightPx: im.h });
      if (kd) rows.push({ kind: 'kindle', settingsKey: k1.data, engine: ENGINE.kindle, widthPx: 1600, heightPx: 2560 });
      X.saving = true; E.renderExport();
      const rec = await root.kdp.recordCoverExports(bookId, rows);
      X.saving = false;
      if (!me.live()) return;
      if (rec.error) throw fail(C.offline.isOffline() && !rec.error.code ? 'offline' : 'record', { code: rec.error.message && CODE_TEXT[rec.error.message] ? rec.error.message : rec.error.code });
      // Recorded: from here the export is done, whatever My layouts says.
      const mine = cover.layout && String(cover.layout).startsWith('my:') ? (E.my || []).find((m) => 'my:' + m.id === cover.layout) : null;
      const lname = mine ? mine.name : ((C.layouts.LIST.find((x) => x[0] === cover.layout) || [])[1] || 'My cover');
      let my;
      try {
        my = await root.kdp.saveMyLayout({ bookId, name: String(lname).trim().slice(0, 80) || 'My cover', fromTitle: title ? String(title).slice(0, 200) : null, fmt: cover.fmt, bg: cover.bg, layers: cover.layers, thumb: th });
      } catch (e) { my = { error: e }; }
      if (!me.live()) return;
      if (my.error) X.myErr = /my_layouts_full/.test(String(my.error.message || '')) ? 'Your files are ready, but My layouts is full (100 layouts), so this design was not saved there. Remove one in Layouts, then export again to save it.'
        : 'Your files are ready, but this design was not saved to My layouts. Check your connection, then export again to save it.';
      else E.myChanged({ id: my.data && my.data.id, name: lname, from_book_id: bookId, from_title: title || null, fmt: cover.fmt, bg: cover.bg, thumb: th, exported_at: (my.data && my.data.exported_at) || new Date().toISOString() });
      root.kdp.addCoverSnapshot(bookId, 'export', { layers: cover.layers, bg: cover.bg, fmt: cover.fmt, layout: cover.layout }).catch(() => {});
      E.exported({ key: k1.data, sig: sig(cover), at: (rec.data && rec.data[0] && rec.data[0].created_at) || new Date().toISOString() });
      if (!alive()) return;   // closed while the rows went in: the files are recorded, the header says Done
      X.files = files; X.phase = 'done'; X.step = steps.length;
      E.renderExport(); focusFirst(E);
    } catch (e) {
      X.saving = false;
      const c = classify(e);
      if (c === STOPPED || !alive()) return;   // Stop: nothing recorded, the dialog is already closed
      X.err = c; X.phase = 'failed';
      E.renderExport(); focusFirst(E);
    } finally {
      if (pics) pics.close();
    }
  }

  C.exportDialog = { open, close, escape, hostHtml, bindHost, run, stepsFor, errorText, sizeText, engineFor, leave, thumb, test, ENGINE };
})(globalThis);
