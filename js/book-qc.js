/* ═══════════════════════════════════════════════════
   NicheInk · Step 07 Quality Control (designs 52, 53, 55; plan section 6.1)
   /js/book-qc.js   (used by app/book.html; needs js/qc-rules.js and its lists)

   Registers kdpBookSteps[7]. E14.3: the free checks. Run checks reads the
   whole book in one call (qc_json), runs the pure rules in the browser and
   saves the run (qc_runs). Free, no AI. QC never changes the text and never
   blocks: warnings do not change the 07 mark, and "done" = the last run is
   still current (qc_mark, read by js/book.js).

   Screens: 52 first visit. 53 results. 55 A running (only after 300 ms, no
   fake wait), B out of date, C no text, E all pass, F Mark as OK. Not drawn
   (V7): the load error, the save error, qc_stale, the unsaved note.

   Mark as OK writes qc_dismissed at once and hides the row. The key holds the
   text at the spot, so a changed spot brings the issue back.

   Open in 06 (E14.4, design 56) starts a QC session: the group and its open
   issues that open in 06. js/write-qc.js moves through them. Back to Quality
   Control comes back here with the groups and the scroll as left, the focus on
   that issue's row. Any other step change ends the session.

   Group 6 and the promise card (designs 53, 54, 55 D) are js/qc-promise.js. Its
   rows have the shape of a run's items, and a ref of "d:" + the chapter id in
   place of the item's index. They are never saved in a run.

   08 is not built: "Go to 08 Format" and "How to add one" show Coming next (V9).
═══════════════════════════════════════════════════ */

(function () {
  const { esc, ICON } = kdpUi;
  const STEP = 7;
  const SHOW_AFTER = 300;          // no flash: the running state shows only past this
  const LABEL_MAX = 300;           // qc_dismissed.label

  const GROUPS = [[1, 'Complete'], [2, 'Sources'], [3, 'Repeats'], [4, 'Pointers'], [5, 'Consistency'], [6, 'Promise'], [7, 'KDP rules']];
  // What runs next, and how far along, after each group of kdpQcRules.steps().
  const PROGRESS = {
    0: ['Complete…', 0.15], 1: ['Sources…', 0.3], 2: ['Repeats and pointers…', 0.45], 3: ['Repeats and pointers…', 0.6],
    4: ['Consistency…', 0.75], 5: ['KDP rules…', 0.85], 7: ['Saving the results…', 0.95]
  };

  const icon = (size, stroke, body) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const CHECK = (s, w = 2.2) => icon(s, w, '<path d="M5 12.5l4.5 4.5L19 7.5"/>');
  const WARN = (s, w = 2.2) => icon(s, w, '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>');
  const CHEV_OPEN = icon(18, 2, '<path d="M6 9l6 6 6-6"/>');
  const CHEV_SHUT = icon(18, 2, '<path d="M9 6l6 6-6 6"/>');

  let ctx = null, book = null, host = null;
  let state = 'idle';              // loading | error | ready
  let qc = null;                   // the qc_json reply
  let unsaved = null;              // a run the save refused: shown, with Retry
  let saving = false;              // Retry is running
  let banner = '';                  // stale | save | read: the line above the results
  let loadSeq = 0;
  const run = { on: false, shown: false, n: 0, text: '', part: 0 };
  let chosen = {};                 // group → open or shut: the writer's choice, kept while the page is open
  let openFirst = null;            // the group that opens by itself
  let openFor = null;              // the run openFirst was chosen for
  const justOk = new Set();        // issues marked on this visit: their line stays, with Undo
  const rowError = new Map();      // issue → the line under its row
  let focusAfter = null;
  let session = null;              // the QC session sent to 06 (js/write-qc.js writes index and back)
  let comeBack = null;             // the session Back to Quality Control returned with

  let P = null;                    // the promise check (js/qc-promise.js)

  const active = () => !!ctx && ctx.isActive(STEP);
  const plural = (n, one, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? one : many}`;
  const idOf = (x) => `${x.rule}\u0000${x.key}`;
  const idOfRow = (d) => `${d.rule}\u0000${d.issue_key}`;
  const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const stamp = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const tick = () => new Promise((r) => setTimeout(r, 0));   // lets the browser paint between groups
  const clip = (t) => { const c = Array.from(t); return c.length > LABEL_MAX ? `${c.slice(0, LABEL_MAX - 1).join('').trimEnd()}…` : t; };

  /* ── What the screen reads ──────────────── */

  const chaptersOf = () => (qc && qc.data && qc.data.chapters) || [];

  /** Today's outline: section id → "3.2 Title", "Introduction" or "Conclusion" (as 06 and Export). */
  function sectionLabels() {
    const out = new Map();
    let n = 0;
    for (const c of chaptersOf()) {
      if (c.kind === 'chapter') n++;
      (c.sections || []).forEach((s, i) => {
        const name = String(s.title || '').trim() || 'Untitled section';
        out.set(s.id, c.kind === 'intro' ? 'Introduction' : c.kind === 'conclusion' ? 'Conclusion' : `${n}.${i + 1} ${name}`);
      });
    }
    return out;
  }

  /** "Chapter 3", from the chapter id at the start of a chapter_review key. */
  function chapterName(key) {
    const id = key.split('|')[0];
    let n = 0;
    for (const c of chaptersOf()) {
      if (c.kind === 'chapter') n++;
      if (c.id === id) return c.kind === 'chapter' ? `Chapter ${n}` : c.kind === 'intro' ? 'Introduction' : 'Conclusion';
    }
    return 'Removed chapter';
  }

  /** The run on screen: a run not saved yet, else the last saved one. */
  function shownRun() {
    if (unsaved) return { ...unsaved.run, created_at: unsaved.at };
    return qc && qc.last_run;
  }

  const isStale = () => !unsaved && !!qc.last_run && !qc.current;
  const offKeys = () => new Set((qc.dismissed || []).map(idOfRow));
  const itemsOf = (r) => (r && r.results && r.results.items) || [];
  const refOfChapter = (id) => `d:${id}`;

  /** A row's item: its index in the run, or "d:" + the chapter of a drift. */
  function itemAt(ref) {
    const t = String(ref);
    return t.startsWith('d:') ? P.item(t.slice(2)) : itemsOf(shownRun())[Number(t)];
  }

  /** The ref of an issue, from its rule and key. */
  function refOf(key) {
    const drift = P.items().find((x) => idOf(x) === key);
    return drift ? refOfChapter(drift.chapter_id) : String(itemsOf(shownRun()).findIndex((x) => idOf(x) === key));
  }

  /** The text of 55 B: the first section changed since the run, or the inputs. */
  function staleText() {
    const lr = qc.last_run;
    const when = shortDate(lr.created_at);
    const before = new Set(lr.versions);
    const today = new Set(qc.versions);
    const labels = sectionLabels();
    const changed = [];
    for (const c of chaptersOf()) {
      for (const s of c.sections || []) {
        if (s.version && today.has(s.version.id) && !before.has(s.version.id)) changed.push(labels.get(s.id));
      }
    }
    if (!changed.length) return `Your outline, Brief, Research, a section's status or 08 settings changed after the last run on ${when}. These results may be wrong.`;
    const rest = changed.length - 1;
    return `You changed ${changed[0]}${rest ? ` and ${plural(rest, 'more section', 'more sections')}` : ''} after the last run on ${when}. These results may be wrong.`;
  }

  /** "QC checked saved text. 1 section has unsaved changes." */
  function noteText(notes) {
    const u = (notes && notes.unsaved) || 0, w = (notes && notes.running) || 0;
    if (!u && !w) return '';
    const parts = [];
    if (u) parts.push(`${plural(u, 'section has', 'sections have')} unsaved changes`);
    if (w) parts.push(`${plural(w, 'section is', 'sections are')} being written`);
    return `QC checked saved text. ${parts.join(' and ')}.`;
  }

  /* ── Pieces ─────────────────────────────── */

  const chip = (kind, text, ic = '') => `<span class="qc-chip is-${kind}">${ic}${esc(text)}</span>`;

  /** Group 6: drifts to check, then what is out of date or not checked yet. */
  function promiseChips(open) {
    const s = P.summary();
    const rest = (s.stale ? chip('info', `${s.stale.toLocaleString('en-US')} out of date`) : '')
      + (s.current && s.none ? chip('info', `${s.none.toLocaleString('en-US')} not checked`) : '');
    if (open) return chip('warn', `${open.toLocaleString('en-US')} to check`, WARN(14)) + rest;
    if (s.current) return chip('ok', 'All clear', CHECK(14, 2.4)) + rest;
    return rest || chip('info', 'Not run · AI, paid');
  }

  function chipsOf(g, items, more, sources) {
    if (g === 6) return promiseChips(items.length);
    const n = items.length + more;
    const named = g === 2 && sources.length ? chip('info', plural(sources.length, 'source named', 'sources named')) : '';
    if (!n) return chip('ok', 'All clear', CHECK(14, 2.4)) + named;
    const onlyMarks = g === 2 && !more && items.every((x) => x.rule === 'verify_mark');
    return chip('warn', onlyMarks ? `${plural(n, 'Verify mark', 'Verify marks')} left` : `${n.toLocaleString('en-US')} to check`, WARN(14)) + named;
  }

  /** The label of a row: a section, a chapter, or the whole book. */
  function whereOf(x, labels) {
    if (x.rule === 'chapter_review' || (x.rule === 'promise_drift' && !labels.has(x.section_id))) return chapterName(x.key);
    return !x.section_id ? 'Whole book' : labels.get(x.section_id) || 'Removed section';
  }

  /** The section an issue opens: a drift with no quote opens its chapter's first section with text. */
  const sectionToOpen = (x) => x.open_id || x.section_id;

  /** An issue of a section that still exists opens in 06. Chapter and book-wide issues do not. */
  const opensIn06 = (x, labels) => x.rule !== 'chapter_review' && x.rule !== 'disclaimer' && !!sectionToOpen(x) && labels.has(sectionToOpen(x));

  /** The link of one row: Open in 06, Open in 05, How to add one, or nothing. */
  function rowLink(x, labels) {
    if (x.rule === 'chapter_review') return `<a class="qc-lk" href="?id=${encodeURIComponent(book.id)}&step=5" data-go="5">Open in 05</a>`;
    if (x.rule === 'disclaimer') return '<span class="qc-lk is-off">How to add one</span><span class="version-tag">Coming next</span>';
    if (!opensIn06(x, labels)) return '';
    return `<a class="qc-lk" href="?id=${encodeURIComponent(book.id)}&step=6&section=${encodeURIComponent(sectionToOpen(x))}" data-open="${esc(sectionToOpen(x))}">Open in 06</a>`;
  }

  function rowOf(x, i, labels) {
    const err = rowError.get(idOf(x));
    return `<li class="qc-it" data-item="${i}">
        <span class="qc-sec">${esc(whereOf(x, labels))}</span><span class="qc-tx">${esc(x.message)}${x.rule === 'promise_drift' ? P.verify(x.unsourced) : ''}</span>
        ${rowLink(x, labels)}<button type="button" class="qc-lk2" data-ok="${i}"${run.on ? ' disabled' : ''}>Mark as OK</button>
        ${err ? `<p class="qc-row-err" role="alert">${ICON.warn(14)}<span>${esc(err)}</span></p>` : ''}
      </li>`;
  }

  /** 55 F: the row hides, this line stands in its place while the page is open. */
  function okRow(x, i, row, labels) {
    const err = rowError.get(idOf(x));
    return `<li class="qc-okrow" data-justok="${i}" tabindex="-1">
        <span class="qc-ok-was">${esc(`${whereOf(x, labels)} · ${x.message}`)}</span>
        <div class="qc-ok-line">${CHECK(16)}<span>Marked as OK. It stays hidden while this text stays the same.</span>
          <button type="button" class="qc-undo" data-undo="${esc(row.id || '')}"${row.id && !run.on ? '' : ' disabled'}>Undo</button></div>
        ${err ? `<p class="qc-row-err" role="alert">${ICON.warn(14)}<span>${esc(err)}</span></p>` : ''}
      </li>`;
  }

  /** A group's issues in row order, each with its index in the run. Book-wide ones come last (design 53). */
  function inRowOrder(r, g) {
    if (g === 6) return P.items().map((x) => [x, refOfChapter(x.chapter_id)]);
    const place = (x) => (x.section_id ? 0 : 1);
    return itemsOf(r).map((x, i) => [x, i]).filter(([x]) => x.g === g).sort(([a], [b]) => place(a) - place(b));
  }

  function groupOf(g, name, r, off, labels) {
    const all = inRowOrder(r, g);
    const open = all.filter(([x]) => !off.has(idOf(x)));
    const more = (r.results && r.results.more && r.results.more[g]) || 0;
    const sources = (r.results && r.results.sources) || [];
    const isOpen = g in chosen ? chosen[g] : g === openFirst;
    const rows = new Map((qc.dismissed || []).map((d) => [idOfRow(d), d]));
    const seen = new Set();
    const lines = all.flatMap(([x, i]) => {
      if (!off.has(idOf(x))) return [rowOf(x, i, labels)];
      if (!justOk.has(idOf(x)) || seen.has(idOf(x))) return [];
      seen.add(idOf(x));
      return [okRow(x, i, rows.get(idOf(x)), labels)];
    });
    const body = lines.length || more
      ? `<ul class="qc-items">${lines.join('')}${more ? `<li class="qc-more">and ${more.toLocaleString('en-US')} more</li>` : ''}</ul>`
      : `<p class="qc-empty">${esc(g === 6 ? P.emptyLine() : 'No issues here.')}</p>`;
    return `<div class="qc-g">
        <button type="button" class="qc-gb" aria-expanded="${isOpen}" aria-controls="qc-g${g}" data-group="${g}">${isOpen ? CHEV_OPEN : CHEV_SHUT}<span class="step-num">${g}</span><span class="qc-gt">${name}</span><span class="qc-chips">${chipsOf(g, open.map(([x]) => x), more, sources)}</span></button>
        <div class="qc-gbody" id="qc-g${g}"${isOpen ? '' : ' hidden'}>${body}</div>
      </div>`;
  }

  /* ── Parts of the page ──────────────────── */

  function runButton(kind, text, ic = '') {
    return `<button type="button" class="btn ${kind}" data-run${run.on ? ' disabled' : ''}>${ic}${text}</button>`;
  }

  function goodToKnow() {
    return `<aside class="qc-side qc-card is-first">
        <p class="chip-label">GOOD TO KNOW</p>
        <p class="qc-fact"><b>Never blocks.</b> You can go to 08 Format at any time. Warnings are advice.</p>
        <p class="qc-fact"><b>Fix in 06 Write.</b> Each problem opens its section with the spot marked.</p>
        <p class="qc-fact"><b>Not here:</b> spelling and grammar. Use Word or Grammarly on the exported file.</p>
        <p class="qc-fact"><b>Step 07 is done</b> when the checks ran and the text has not changed since.</p>
      </aside>`;
  }

  function firstCard() {
    const item = (n, title, text, tag = '') => `<li><span class="step-num">${n}</span><span><b>${title}</b> ${text}${tag}</span></li>`;
    return `<section class="qc-card qc-first">
        <p class="chip-label">CHECK THE WHOLE BOOK</p>
        <h2>Find problems before you format the book</h2>
        <p class="qc-lead">Quality Control reads every section that has text. It lists what to fix and links each problem to its place in 06 Write. It never changes your text.</p>
        <ul class="qc-list">
          ${item(1, 'Complete.', 'Sections not Final, empty, still "Needs review", or far under target.')}
          ${item(2, 'Sources.', '"Verify" marks left in the text, and the sources named.')}
          ${item(3, 'Repeats.', 'The same sentence twice, and words used too often.')}
          ${item(4, 'Pointers.', '"See Chapter 9" when there is no Chapter 9, and leftovers like [TODO].')}
          ${item(5, 'Consistency.', 'One word spelled two ways, US and UK spelling mixed.')}
          ${item(6, 'Promise.', "Does each chapter keep the book's promise?", ' <span class="qc-tag">AI · paid</span>')}
          ${item(7, 'KDP rules.', 'Links, emoji, missing characters, length, disclaimer.')}
          ${item(8, 'Result.', 'Ready for Format, or ready with warnings.')}
        </ul>
        <div class="qc-run">${runButton('btn-primary', 'Run checks', CHECK(18))}<p class="qc-note">Free. About 2 seconds. Runs groups 1 to 5 and 7.</p></div>
      </section>
      ${P.card(true)}`;
  }

  function noText() {
    return `<section class="qc-card qc-state-card"><div class="qc-box is-plain">
        <strong>Nothing to check yet</strong>
        <span class="qc-sub">Quality Control checks sections that have text. Write at least one section in 06 Write.</span>
        <a class="btn btn-secondary" href="?id=${encodeURIComponent(book.id)}&step=6" data-go="6">Go to 06 Write</a>
      </div></section>`;
  }

  function runningBox() {
    return `<section class="qc-card qc-state-card"><div class="qc-box is-plain" role="status" data-running>
        <strong data-run-title>Checking ${plural(run.n, 'section', 'sections')}</strong>
        <div class="qc-bar" aria-hidden="true"><i data-run-bar style="width:${Math.round(run.part * 100)}%"></i></div>
        <span class="qc-sub" data-run-text>${esc(run.text)}</span>
      </div></section>`;
  }

  function alertLine() {
    if (banner === 'stale') return `<div class="alert alert-warning" role="alert">${WARN(16)}<p class="alert-text">Your book changed while the checks ran. Run again.</p></div>`;
    if (banner === 'read') return `<div class="alert alert-error" role="alert">${ICON.warn(16)}<p class="alert-text">We couldn't read your book. Check your connection, then try again.</p></div>`;
    if (banner === 'save') {
      return `<div class="alert alert-error" role="alert">${ICON.warn(16)}<p class="alert-text">We couldn't save this run. Step 07 is not marked done. <button type="button" class="link-btn" data-retry-save${saving ? ' disabled' : ''}>Retry</button></p></div>`;
    }
    return '';
  }

  function verdictBox(r) {
    const v = kdpQcRules.verdict(r.results, qc);
    const note = noteText(r.results && r.results.notes);
    const noteLine = note ? `<p class="qc-note" data-qc-note>${esc(note)}</p>` : '';
    if (isStale()) {
      return `<div class="qc-box is-warning" role="status" tabindex="-1" data-verdict>
          <strong>${WARN(16)}Out of date</strong>
          <span class="qc-sub">${esc(staleText())}</span>
          ${runButton('btn-primary qc-self', 'Run again')}
        </div>${noteLine}`;
    }
    if (v.ready) {
      const ok = v.marked ? ` ${plural(v.marked, 'issue is', 'issues are')} marked as OK.` : '';
      return `<div class="qc-box is-success" role="status" tabindex="-1" data-verdict>
          <strong>${CHECK(16)}Ready for Format</strong>
          <span class="qc-sub">No problems found in ${plural(r.sections, 'section', 'sections')}.${ok}</span>
          <div class="qc-off"><button type="button" class="btn btn-primary" disabled>Go to 08 Format</button><span class="version-tag">Coming next</span></div>
        </div>
        ${P.summary().current ? '' : '<p class="qc-note">Promise check not run. It is optional.</p>'}${noteLine}`;
    }
    return `<div class="qc-verdict" role="status" tabindex="-1" data-verdict>
        ${WARN(22, 2)}
        <div class="qc-verdict-text"><strong>${esc(v.title)}</strong>
          <span>Checked ${plural(r.sections, 'section', 'sections')} with text · ${esc(stamp(r.created_at))} · Warnings never block 08.</span></div>
        ${runButton('btn-secondary', 'Run again')}
      </div>${noteLine}`;
  }

  function resultsSide(r) {
    const rows = new Map((qc.dismissed || []).map((d) => [idOfRow(d), d]));
    const marked = [...new Set([...itemsOf(r), ...P.items()].map(idOf))].map((k) => rows.get(k)).filter(Boolean);
    const list = marked.map((d) => `<div class="qc-it is-side"><span class="qc-tx">${esc(d.label)}</span><button type="button" class="qc-lk2" data-undo="${esc(d.id || '')}"${d.id && !run.on ? '' : ' disabled'}>Undo</button></div>`).join('');
    return `<aside class="qc-side">
        ${P.card(false)}
        ${marked.length ? `<section class="qc-card qc-side-card" data-marked>
          <p class="chip-label">MARKED AS OK · ${marked.length.toLocaleString('en-US')}</p>
          <p class="qc-note">These stay hidden on the next run. You can bring them back.</p>
          ${list}
        </section>` : ''}
        <section class="qc-card qc-side-card is-soft">
          <p class="chip-label">SOURCES NAMED IN THE TEXT</p>
          <p class="qc-note">Approximate. Built from source names found in the text, not from exact links.</p>
        </section>
      </aside>`;
  }

  function resultsMain(r) {
    const off = offKeys();
    const labels = sectionLabels();
    return `${alertLine()}${verdictBox(r)}
      <section class="qc-card qc-groups${isStale() ? ' is-old' : ''}">${GROUPS.map(([g, name]) => groupOf(g, name, r, off, labels)).join('')}</section>`;
  }

  /** 53 opens the first group with issues, once per run. */
  function chooseOpen(r) {
    const key = (r && r.id) || (r && r.created_at) || null;
    if (key === openFor) return;
    openFor = key;
    const off = offKeys();
    const hit = [...itemsOf(r), ...P.items()].filter((x) => !off.has(idOf(x))).sort((a, b) => a.g - b.g)[0];
    const more = Object.keys((r && r.results && r.results.more) || {}).map(Number).sort((a, b) => a - b)[0];
    openFirst = hit ? hit.g : more || null;
  }

  /** What holds the focus now, as a selector that finds it again after a repaint. */
  function focusMark() {
    const a = document.activeElement;
    if (!a || !host.contains(a)) return null;
    const attr = ['data-ok', 'data-group', 'data-justok', 'data-pr-ok', 'data-pr-open', 'data-pr-again', 'data-pr-row'].find((n) => a.hasAttribute(n));
    return attr ? `[${attr}="${a.getAttribute(attr)}"]` : null;
  }

  function paint() {
    if (!host || !active()) return;
    const held = focusMark();
    if (state === 'loading') {
      host.innerHTML = `<div class="qc-main"><div class="qc-card qc-first" aria-hidden="true"><div class="skel skel-title"></div><div class="skel skel-line"></div><div class="skel skel-line skel-w40"></div></div></div>
        <p class="sr-only" role="status">Loading Quality Control…</p>`;
      return;
    }
    if (state === 'error') {
      host.innerHTML = `<div class="center-state"><div class="state-box" role="alert">
          <div class="state-icon danger" aria-hidden="true">${WARN(26, 2)}</div>
          <h2>We couldn't load Quality Control</h2>
          <p>Check your connection, then try again.</p>
          <div class="state-actions"><button type="button" class="btn btn-primary" data-reload>Retry</button></div>
        </div></div>`;
      return;
    }
    const r = shownRun();
    const hasText = !!(qc.versions && qc.versions.length);
    if (run.on && run.shown) {
      host.innerHTML = `<div class="qc-main">${runningBox()}</div>${r ? resultsSide(r) : goodToKnow()}`;
    } else if (!hasText && !unsaved) {
      host.innerHTML = `<div class="qc-main">${alertLine()}${noText()}</div>${goodToKnow()}`;
    } else if (!r) {
      host.innerHTML = `<div class="qc-main">${alertLine()}${firstCard()}</div>${goodToKnow()}`;
    } else {
      chooseOpen(r);
      host.innerHTML = `<div class="qc-main">${resultsMain(r)}</div>${resultsSide(r)}`;
    }
    const el = focusAfter ? focusAfter() : held && host.querySelector(held);
    focusAfter = null;
    if (el) el.focus();
    if (comeBack && state === 'ready') backInPlace();
  }

  /** Back to Quality Control: the scroll as left, the focus on that issue's row. */
  function backInPlace() {
    const b = comeBack;
    comeBack = null;
    window.scrollTo(0, b.scroll);
    const r = shownRun();
    const at = b.items[b.index].i;
    // Drift rows do not belong to a run. A drift opened from the promise card goes back to its row there.
    const sel = b.card ? `[data-pr-row="${String(at).slice(2)}"]` : `[data-item="${at}"]`;
    const row = b.group === 6 || (r && r.id === b.runId) ? host.querySelector(sel) : null;
    if (!row) return;
    (row.querySelector('[data-open], [data-pr-open]') || row).focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  }

  /* ── Reading and running ────────────────── */

  async function read() {
    let res;
    try { res = await kdp.getQcData(book.id); } catch (e) { res = { error: e }; }
    if (!res.error) P.adopt(res.data);
    return res;
  }

  async function load() {
    const seq = ++loadSeq;
    state = 'loading';
    focusAfter = null;
    banner = banner === 'save' ? banner : '';
    if (!comeBack) justOk.clear();   // back from 06: the list stays as it was left
    rowError.clear();
    paint();
    // Coming from 06: the version it saves on leaving must be in first.
    await ctx.settled();
    const res = await read();
    if (seq !== loadSeq) return;
    if (res.error) {
      if (res.error.notFound) { if (active()) ctx.notFound(); return; }
      state = 'error';
      paint();
      return;
    }
    qc = res.data;
    // A run the save refused stays only while the book is the same.
    if (unsaved && (unsaved.inputs_key !== qc.inputs_key || unsaved.versions.join() !== qc.versions.join())) { unsaved = null; banner = ''; }
    state = 'ready';
    paint();
  }

  function setProgress(group) {
    const [text, part] = PROGRESS[group] || PROGRESS[0];
    run.text = text;
    run.part = part;
    if (!host || !active() || !run.shown) return;
    const t = host.querySelector('[data-run-text]'), b = host.querySelector('[data-run-bar]'), h = host.querySelector('[data-run-title]');
    if (t) t.textContent = text;
    if (b) b.style.width = `${Math.round(part * 100)}%`;
    if (h && run.n) h.textContent = `Checking ${plural(run.n, 'section', 'sections')}`;
  }

  async function saveRun(pack) {
    let res;
    try {
      res = await kdp.saveQcRun({ bookId: book.id, versions: pack.versions, inputsKey: pack.inputs_key, results: pack.run.results, sections: pack.run.sections, words: pack.run.words, style: pack.run.style });
    } catch (e) { res = { error: e }; }
    if (!res.error) {
      qc.last_run = { ...pack.run, id: res.data && res.data.id, created_at: (res.data && res.data.created_at) || pack.at, versions: pack.versions, inputs_key: pack.inputs_key };
      qc.versions = pack.versions;
      qc.inputs_key = pack.inputs_key;
      qc.current = true;
      unsaved = null;
      banner = '';
      focusAfter = () => host.querySelector('[data-verdict]');
      ctx.readQcMark();
      return;
    }
    if (/qc_stale/.test(res.error.message || '')) {
      // Nothing is saved: read the book again, so the screen shows today's state.
      unsaved = null;
      banner = 'stale';
      const again = await read();
      if (!again.error) qc = again.data;
      return;
    }
    unsaved = pack;
    banner = 'save';
    focusAfter = () => host.querySelector('[data-retry-save]');
  }

  async function runChecks() {
    if (run.on) return;
    Object.assign(run, { on: true, shown: false, n: qc.versions.length, text: 'Reading your book…', part: 0.1 });
    banner = '';
    host.querySelectorAll('[data-run], [data-ok], [data-undo]').forEach((b) => { b.disabled = true; });
    const slow = setTimeout(() => { run.shown = true; paint(); }, SHOW_AFTER);
    try {
      const res = await read();
      if (res.error) { banner = 'read'; return; }
      qc = res.data;
      unsaved = null;
      if (!qc.versions.length) return;   // 55 C: no run is saved
      run.n = qc.versions.length;
      setProgress(0);
      const it = kdpQcRules.steps(qc);
      let done;
      for (;;) {
        const s = it.next();
        if (s.done) { done = s.value; break; }
        setProgress(s.value.group);
        await tick();
      }
      if (!done.sections) return;
      justOk.clear();
      rowError.clear();
      openFor = null;
      await saveRun({
        run: { results: kdpQcRules.results(done), sections: done.sections, words: done.words, style: done.style },
        versions: qc.versions, inputs_key: qc.inputs_key, at: new Date().toISOString()
      });
    } catch (e) {
      banner = 'read';
    } finally {
      clearTimeout(slow);
      run.on = false;
      run.shown = false;
      paint();
    }
  }

  async function retrySave() {
    if (saving || !unsaved) return;
    saving = true;
    paint();
    await saveRun(unsaved);
    saving = false;
    paint();
  }

  /* ── Mark as OK ─────────────────────────── */

  /** qc_dismissed.section_id: only for an issue of one section that still exists. */
  function sectionFor(x, labels) {
    return x.section_id && labels.has(x.section_id) && x.key.startsWith(`${x.section_id}|`) ? x.section_id : null;
  }

  /** ref: the row's. card: Mark as OK was pressed in the promise card, so the focus stays there. */
  async function markOk(ref, card = false) {
    const x = itemAt(ref);
    if (!x) return;
    const key = idOf(x);
    if (offKeys().has(key)) return;
    const labels = sectionLabels();
    const label = clip(`${whereOf(x, labels)} · ${x.message}`);
    // The row hides at once.
    const row = { id: null, section_id: x.section_id, rule: x.rule, issue_key: x.key, label };
    qc.dismissed = [row, ...(qc.dismissed || [])];
    justOk.add(key);
    rowError.delete(key);
    const shown = card ? `[data-pr-row="${String(ref).slice(2)}"]` : `[data-justok="${ref}"]`;
    const button = card ? `[data-pr-ok="${String(ref).slice(2)}"]` : `[data-ok="${ref}"]`;
    focusAfter = () => host.querySelector(shown);
    paint();
    let res;
    try { res = await kdp.dismissQcIssue({ bookId: book.id, sectionId: sectionFor(x, labels), rule: x.rule, issueKey: x.key, label }); } catch (e) { res = { error: e }; }
    if (res.error || !res.data) {
      qc.dismissed = qc.dismissed.filter((d) => d !== row);
      justOk.delete(key);
      rowError.set(key, /qc_dismissed_limit/.test((res.error && res.error.message) || '')
        ? 'You marked 500 issues as OK in this book. Undo one first.'
        : "We couldn't save that. Try again.");
      focusAfter = () => host.querySelector(button);
      paint();
      return;
    }
    Object.assign(row, res.data);
    // Undo is ready. Focus moves to it only if the writer has not moved on.
    const here = document.activeElement && document.activeElement.closest && document.activeElement.closest(shown);
    if (here) focusAfter = () => host.querySelector(`${shown} [data-undo]`);
    paint();
  }

  async function undo(id, card = false) {
    const row = (qc.dismissed || []).find((d) => d.id === id);
    if (!row) return;
    const key = idOfRow(row);
    host.querySelectorAll(`[data-undo="${id}"]`).forEach((b) => { b.disabled = true; });
    let res;
    try { res = await kdp.undismissQcIssue(id); } catch (e) { res = { error: e }; }
    if (res.error) {
      rowError.set(key, "We couldn't save that. Try again.");
      paint();
      return;
    }
    qc.dismissed = qc.dismissed.filter((d) => d !== row);
    justOk.delete(key);
    rowError.delete(key);
    const ref = refOf(key);
    focusAfter = () => host.querySelector(card ? `[data-pr-ok="${ref.slice(2)}"]` : `[data-ok="${ref}"]`);
    paint();
  }

  /* ── Open in 06 (design 56) ─────────────── */

  /** Sets the QC session, tells 06 the section and the spot, then opens it. */
  function openIn06(ref, card = false) {
    const r = shownRun();
    const x = itemAt(ref);
    if (!x) return;
    const off = offKeys();
    const labels = sectionLabels();
    const items = inRowOrder(r, x.g).filter(([y]) => !off.has(idOf(y)) && opensIn06(y, labels)).map(([y, n]) => ({
      i: n, sectionId: sectionToOpen(y), message: y.message, quote: y.quote,
      spot: y.start == null ? null : { start: y.start, end: y.end, versionId: y.version_id }
    }));
    const index = items.findIndex((y) => String(y.i) === String(ref));
    if (index < 0) return;
    session = { group: x.g, name: GROUPS.find(([g]) => g === x.g)[1], items, index, runId: r && r.id, scroll: window.scrollY, back: false, card };
    const write = window.kdpBookSteps[6];
    write.qcSession(session);
    write.openSpot(items[index]);
    ctx.go(6);
  }

  /* ── Events ─────────────────────────────── */

  function onClick(e) {
    const t = e.target.closest('button, a');
    if (!t || !host.contains(t) || t.disabled) return;
    const plainClick = !(e.metaKey || e.ctrlKey || e.shiftKey);
    if (t.matches('[data-run]')) { runChecks(); return; }
    if (t.matches('[data-reload]')) { load(); return; }
    if (P.click(t)) return;
    if (t.matches('[data-retry-save]')) { retrySave(); return; }
    if (t.dataset.group) {
      const g = Number(t.dataset.group);
      chosen[g] = t.getAttribute('aria-expanded') !== 'true';
      focusAfter = () => host.querySelector(`[data-group="${g}"]`);
      paint();
      return;
    }
    if (t.dataset.ok !== undefined) { markOk(t.dataset.ok); return; }
    if (t.dataset.prOk) { markOk(refOfChapter(t.dataset.prOk), true); return; }
    if (t.dataset.undo) { undo(t.dataset.undo, !!t.closest('[data-pr-row]')); return; }
    if (t.dataset.go && plainClick) { e.preventDefault(); ctx.go(Number(t.dataset.go)); return; }
    if (t.dataset.open && plainClick) {
      e.preventDefault();
      openIn06(t.closest('[data-item]').dataset.item);
    }
    if (t.dataset.prOpen && plainClick) {
      e.preventDefault();
      openIn06(refOfChapter(t.dataset.prOpen), true);
    }
  }

  /* ── Step API for js/book.js ─────────────── */

  function render(root) {
    comeBack = session && session.back ? session : null;
    session = null;
    root.innerHTML = '<div class="qc" data-qc></div>';
    host = root.querySelector('[data-qc]');
    host.addEventListener('click', onClick);
    if (run.on && qc) { paint(); return; }
    load();
  }

  window.kdpBookSteps = window.kdpBookSteps || {};
  window.kdpBookSteps[STEP] = {
    init(b, c) {
      book = b;
      ctx = c;
      P = kdpQcPromise.create({
        book: () => book,
        qc: () => qc,
        setQc: (q) => { qc = q; },
        read,
        paint,
        focus: (sel) => { focusAfter = () => host.querySelector(sel); },
        okState: (x) => ({ row: (qc.dismissed || []).find((d) => idOfRow(d) === idOf(x)) || null, err: rowError.get(idOf(x)) || '', off: run.on }),
        ui: { chip, CHECK, WARN }
      });
    },
    render,
    async leave() { P.close(); },
    /** Done = the last run is still current. Warnings do not change it (design 57). */
    isDone: () => { const m = ctx && ctx.qcMark(); return !!(m && m.current); },
    blockers: () => 0
  };
})();
