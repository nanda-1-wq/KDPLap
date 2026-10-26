/* ═══════════════════════════════════════════════════
   KDP Lab — Export dialog (design 24b)
   /js/export-dialog.js   (used by app/book.html and app/dashboard.html;
                           needs js/supabase.js, js/ui.js, js/markdown-lite.js,
                           js/sentences.js, js/word-budget.js, js/text-checks.js,
                           js/export-rules.js, js/export-build.js)

   kdpExport.open(bookId, { opener, returnFocus, onRecorded })
     returnFocus() replaces opener.focus() when the page may redraw the opener
     (the Books card menu); onRecorded(bookId, format) after a recorded export.

   States (24b): ready (1), marks with a required tick (2a, 2b), Final only
   (3), Markdown (4), empty (5), locked: a section is being written (6,
   rechecked every 5 s), building (7), error with retry (8a library, 8b
   read, build), success (9). No AI call; nothing is counted.

   The file is built in the browser. The Word tool (docx 9.5.1, pinned with
   SRI) loads only when you export a .docx, once per page. Right before the
   build the book is read again, and the file and the export record use
   that read: the record's versions are exactly the file's sections, in book
   order, chosen by kdpExportRules (the same rule as export_badges), so the
   Books badge is fresh right after an export.
═══════════════════════════════════════════════════ */

(function () {
  // tests/browser/run.sh checks its cached copy against this hash.
  const DOCX_SRC = 'https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js';
  const DOCX_SRI = 'sha384-HWC8sFPgg/WYrr43jIR6e0YIKgPkS3VLdteGgh9MFlUet3xdAVEM8YS69xP4Puse';
  const RECHECK_MS = 5000;
  const GUIDELINES = 'https://kdp.amazon.com/en_US/help/topic/G200672390';

  const { esc, ICON } = kdpUi;
  const R = () => window.kdpExportRules;
  const B = () => window.kdpExportBuild;
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : (many || `${one}s`)}`;
  const trimText = (t) => `${String(t || '6x9').replace('x', ' × ')} in`;
  const svg = (body, size = 16, stroke = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const IC = {
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    down: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 18),
    doc: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>', 26, 1.8),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 18)
  };

  let d = null;       // the <dialog>
  let st = null;      // the open dialog's state

  /* ── The Word tool ────────────────────── */

  let docxLoad = null;
  function loadDocx() {
    if (window.docx && window.docx.Packer) return Promise.resolve(window.docx);
    if (docxLoad) return docxLoad;
    docxLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = DOCX_SRC;
      s.integrity = DOCX_SRI;
      s.crossOrigin = 'anonymous';
      const fail = () => { s.remove(); docxLoad = null; reject(new Error('docx_load')); };
      const timer = setTimeout(fail, 30000);
      s.onload = () => { clearTimeout(timer); if (window.docx && window.docx.Packer) resolve(window.docx); else fail(); };
      s.onerror = () => { clearTimeout(timer); fail(); };
      document.head.append(s);
    });
    return docxLoad;
  }

  /* ── Building blocks ──────────────────── */

  function build() {
    d = document.createElement('dialog');
    d.className = 'dialog exp-dialog';
    d.setAttribute('aria-labelledby', 'expTitle');
    d.innerHTML = `
      <div class="dialog-inner exp-inner">
        <div class="dialog-head exp-head">
          <div class="exp-who">
            <div class="cover-ph mini" aria-hidden="true"><div class="cover-ph-title" data-cover-title></div><div class="cover-ph-rule"></div><div class="cover-ph-pen" data-cover-pen></div></div>
            <div><h2 id="expTitle">Export book</h2><p data-exp-sub></p></div>
          </div>
          <button type="button" class="icon-btn" data-exp-close aria-label="Close">${ICON.close}</button>
        </div>
        <div class="exp-body" data-exp-body></div>
        <div class="dialog-foot exp-foot" data-exp-foot></div>
      </div>`;
    document.body.append(d);
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', onClosed);
    d.addEventListener('click', onClick);
    d.addEventListener('change', onChange);
    d.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const list = [...d.querySelectorAll('a[href], button, input, select')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  const $ = (sel) => d.querySelector(sel);
  const body = () => $('[data-exp-body]');
  const foot = () => $('[data-exp-foot]');
  const sectionHref = (id) => `book.html?id=${encodeURIComponent(st.bookId)}&step=6&section=${encodeURIComponent(id)}`;

  function setHead(title) {
    const b = (st.data && st.data.book) || {};
    const t = (b.title || '').trim() || 'Untitled book';
    $('#expTitle').textContent = title;
    $('[data-exp-sub]').textContent = b.pen_name ? `${t} · ${b.pen_name}` : t;
    $('[data-cover-title]').textContent = t;
    $('[data-cover-pen]').textContent = b.pen_name || '';
  }

  const exportLabel = (m) => {
    if (m.running.length === 1) return `Export with v${m.running[0].versionNo}`;
    if (m.running.length > 1) return 'Export with saved versions';
    return st.opts.format === 'md' ? 'Export .md' : 'Export .docx';
  };

  /** [n, title] from "2.1 Shoulder rolls"; ["", "Introduction"]. */
  function splitLabel(label) {
    const m = String(label).match(/^(\d+\.\d+) (.*)$/);
    return m ? [m[1], m[2]] : ['', label];
  }
  const shortLabel = (x) => splitLabel(x.label)[0] || x.label;
  const listWords = (items) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

  /* ── Ready (states 1 to 6) ────────────── */

  function formatHtml() {
    const md = st.opts.format === 'md';
    const choice = (value, name, sub, on) => `<label class="choice exp-choice${on ? ' is-on' : ''}"><input type="radio" name="expFormat" value="${value}"${on ? ' checked' : ''} data-exp-format />
      <span class="choice-body"><span class="choice-title">${name}</span><span class="field-hint">${sub}</span></span></label>`;
    return `<fieldset class="choice-group exp-group"><legend class="chip-label choice-legend">FORMAT</legend>
      ${choice('docx', 'Word document (.docx)', 'Opens in Word, Google Docs and Pages. KDP accepts it for ebooks and paperbacks.', !md)}
      ${choice('md', 'Markdown (.md)', 'Plain text backup with headings.', md)}
      <div class="choice exp-soon" aria-disabled="true"><span class="choice-body"><span class="choice-title">Print PDF, EPUB, Google Drive</span></span><span class="version-tag">Coming in v2</span></div>
    </fieldset>`;
  }

  function includeHtml(m) {
    const all = m.withText, fin = m.status.final;
    const counts = [m.status.final && `${fmt(m.status.final)} Final`, m.status.reviewed && `${fmt(m.status.reviewed)} Reviewed`, m.status.draft && `${fmt(m.status.draft)} Draft`].filter(Boolean);
    return `<div class="field"><label class="field-label" for="expInclude">Include</label>
      <select class="select select-block" id="expInclude" data-exp-include aria-describedby="expIncludeHelp">
        <option value="all"${st.opts.include === 'all' ? ' selected' : ''}>All sections with text (${fmt(all)})</option>
        <option value="final"${st.opts.include === 'final' ? ' selected' : ''}>Final only (${fmt(fin)} of ${fmt(all)})</option>
      </select>
      <p class="field-hint" id="expIncludeHelp">${counts.length ? `${counts.join(', ')}.` : 'No section has text yet.'}</p></div>`;
  }

  function partsHtml() {
    const a = R().available(st.data);
    const p = st.opts.parts;
    const year = new Date().getFullYear();
    const pen = (st.data.book.pen_name || '').trim();
    const nSec = (kind) => (st.data.chapters.find((c) => c.kind === kind) || { sections: [] }).sections.length;
    const row = (key, name, sub, side, locked) => `<label class="exp-tick${locked ? ' is-locked' : ''}">
        <input type="checkbox"${p[key] || locked ? ' checked' : ''}${locked ? ' disabled' : ` data-exp-part="${key}"`} />
        <span class="exp-tick-name">${name}${sub ? `<span class="field-hint">${sub}</span>` : ''}</span>
        <span class="field-hint exp-side">${side || ''}</span></label>`;
    return `<fieldset class="choice-group exp-group"><legend class="chip-label choice-legend">BOOK PARTS</legend><div class="exp-ticks">
      ${row('title', 'Title page', 'Title, subtitle and pen name')}
      ${row('copyright', 'Copyright page', `"Copyright © ${year}${pen ? ` ${esc(pen)}` : ''}. All rights reserved." and a short disclaimer. Edit it in Word.`)}
      ${row('contents', 'Contents', 'A linked list of chapters. No page numbers.')}
      ${a.intro ? row('intro', 'Introduction', '', plural(nSec('intro'), 'section')) : ''}
      ${row('chapters', 'Chapters', 'Always in the file', plural(st.data.chapters.filter((c) => c.kind === 'chapter').length, 'chapter'), true)}
      ${a.conclusion ? row('conclusion', 'Conclusion', '', plural(nSec('conclusion'), 'section')) : ''}
      ${a.about ? row('about', 'About the author', `${esc(pen || 'The pen name')}'s bio from Pen Names`, p.about ? 'On' : 'Off') : ''}
    </div></fieldset>`;
  }

  /** The page strip: which pages get a number (estimates by words, 250 a page at 6 × 9). */
  function stripHtml(m) {
    const p = m.parts;
    const [w, h] = String(m.book.trim || '6x9').split('x').map(Number);
    const perPage = 250 * ((w * h) || 54) / 54;
    const sheet = (cap, front, no, lines) => `<span class="exp-pg"><span class="exp-sheet${front ? ' is-front' : ''}">${'<i></i>'.repeat(lines)}${no ? `<span class="exp-no">${no}</span>` : ''}</span><span class="exp-pg-cap">${cap}</span></span>`;
    const out = [];
    if (p.title) out.push(sheet('Title', true, '', 1));
    if (p.copyright) out.push(sheet('©', true, '', 2));
    if (p.contents) out.push(sheet('Contents', true, '', 4));
    let page = 1;
    const capOf = (c) => (c.kind === 'intro' ? 'Intro' : c.kind === 'conclusion' ? 'End' : `Ch ${c.fileNumber}`);
    m.chapters.slice(0, 2).forEach((c) => {
      out.push(sheet(capOf(c), false, page, 4));
      page += Math.max(1, Math.ceil(c.sections.reduce((s, x) => s + x.words, 0) / perPage));
    });
    if (m.chapters.length > 2) {
      const total = m.chapters.reduce((s, c) => s + Math.max(1, Math.ceil(c.sections.reduce((a, x) => a + x.words, 0) / perPage)), 0);
      out.push('<span class="exp-pg exp-gap">…</span>', sheet('End', false, total, 3));
    }
    return `<div class="exp-pages" aria-hidden="true">${out.join('')}</div>`;
  }

  function layoutHtml(m) {
    const fact = (k, v) => `<div class="exp-fact"><span class="exp-k">${k}</span><span class="exp-v">${v}</span></div>`;
    if (st.opts.format === 'md') {
      return `<div class="exp-group"><span class="chip-label">LAYOUT</span><div class="exp-facts">
        ${fact('File', 'One .md file, same order and same book parts as the Word file.')}
        ${fact('Headings', '<span class="exp-mono"># Title</span>, then <span class="exp-mono">#</span> for each chapter and <span class="exp-mono">##</span> for each section. Headings inside a section become <span class="exp-mono">###</span>.')}
        ${fact('Pages', 'No page size and no page numbers in Markdown.')}
      </div></div>`;
    }
    const first = m.chapters[0];
    const from = !first ? 'the first chapter' : first.kind === 'intro' ? 'the Introduction' : (first.kind === 'conclusion' ? 'the Conclusion' : 'Chapter 1');
    const front = [m.parts.title && 'title', m.parts.copyright && 'copyright', m.parts.contents && 'contents'].filter(Boolean);
    const none = front.length ? ` The ${listWords(front)} page${front.length === 1 ? ' has' : 's have'} none.` : '';
    return `<div class="exp-group"><span class="chip-label">LAYOUT</span><div class="exp-facts">
      ${fact('Page size', `<strong>${esc(trimText(m.book.trim))}</strong>, from the Brief <a class="text-link exp-link" href="book.html?id=${encodeURIComponent(st.bookId)}&step=1">Change in Brief</a>`)}
      ${fact('Chapters', 'Each chapter starts on a new page. Chapter title, then its sections as headings.')}
      ${fact('Page numbers', `Centered in the footer, from 1 on ${from}.${none}${stripHtml(m)}`)}
      ${fact('Margins', '0.75 in on every side.')}
      ${fact('Text', 'Georgia 11 pt, 1.15 lines, first-line indent. Word styles for title and headings, so KDP and Word read the structure.')}
    </div></div>`;
  }

  function marksHtml(m) {
    if (!m.openMarks) return '';
    const rows = m.marks.sections.map((x) => {
      const [n, t] = splitLabel(x.label);
      const cnt = [x.marks && plural(x.marks, 'mark'), x.numbers && `${plural(x.numbers, 'number')}${x.marks ? '' : ', no mark'}`].filter(Boolean).join(', ');
      return `<li><a class="exp-sec" href="${sectionHref(x.id)}">${n ? `<span class="exp-n">${n}</span>` : ''}<span class="exp-t">${esc(t)}</span></a><span class="field-hint exp-cnt">${cnt}</span></li>`;
    }).join('');
    const n = m.openMarks;
    return `<div class="alert alert-warning exp-alert" role="group" aria-labelledby="expMarksTitle">${ICON.warn(16)}<div class="alert-text">
        <p id="expMarksTitle"><strong>Warning: ${plural(n, 'open Verify mark')}.</strong> These sentences have a number or claim with no source in your Research.</p>
        <ul class="exp-marks" aria-label="Sections with open marks">${rows}</ul>
        <p>Each link opens the section in 06 Write. In the file the marks are removed and the sentences stay.</p></div></div>
      <label class="exp-ack"><input type="checkbox" data-exp-ack${st.ack ? ' checked' : ''} /><span>Export with ${plural(n, 'open mark')}. I will check them before I publish.</span></label>`;
  }

  function notesHtml(m) {
    const out = [];
    const row = (icon, html, sub) => `<div class="exp-crow">${icon}<span>${html}${sub ? `<span class="field-hint exp-crow-sub">${sub}</span>` : ''}</span></div>`;
    if (m.include === 'all' && (m.status.draft || m.status.reviewed)) {
      const parts = [m.status.draft && `${plural(m.status.draft, 'section')} ${m.status.draft === 1 ? 'is' : 'are'} Draft`, m.status.reviewed && `${fmt(m.status.reviewed)} ${m.status.reviewed === 1 ? 'is' : 'are'} Reviewed`].filter(Boolean);
      out.push(row(IC.info, `${parts.join(' and ')}. They are in the file.`, 'Choose "Final only" to leave them out.'));
    }
    if (m.noText.length) out.push(row(IC.info, `${plural(m.noText.length, 'section has', 'sections have')} no text: ${esc(listWords(m.noText.map(shortLabel)))}. ${m.noText.length === 1 ? 'It is' : 'They are'} left out.`));
    if (m.needsReview.length) out.push(row(`<span class="exp-warn">${ICON.warn(16)}</span>`, `Needs review: ${esc(listWords(m.needsReview.map((x) => x.chapter ? x.label : shortLabel(x))))}. The positioning changed after it was written.`));
    if (m.unsaved.length === 1) out.push(row(IC.info, `${esc(shortLabel(m.unsaved[0]))} has unsaved edits. The file uses v${m.unsaved[0].versionNo}, its last saved version.`));
    else if (m.unsaved.length > 1) out.push(row(IC.info, `${esc(listWords(m.unsaved.map(shortLabel)))} have unsaved edits. The file uses their last saved versions.`));
    if (m.partial.length) out.push(row(IC.info, `${esc(listWords(m.partial.map(shortLabel)))} ${m.partial.length === 1 ? 'ends' : 'end'} where a Generate was stopped (partial text).`));
    return out.length ? `<div class="exp-notes" role="group" aria-label="Other notes">${out.join('')}</div>` : '';
  }

  function finalOnlyHtml(m) {
    if (m.include !== 'final' || (!m.notFinal.length && !m.droppedChapters.length)) return '';
    const names = { draft: 'Draft', reviewed: 'Reviewed', not_started: 'Not started' };
    const list = m.notFinal.map((x) => `${esc(x.label)} (${names[x.status] || 'Draft'})`).join(' · ');
    // Owner, STOP 3 review: say how the chapters in the file are numbered.
    const inFile = m.chapters.filter((c) => c.kind === 'chapter').length;
    const numbered = inFile ? ` Chapters in the file are numbered 1 to ${inFile}.` : '';
    const dropped = m.droppedChapters.length
      ? `<p>${esc(listWords(m.droppedChapters.map((c) => c.label)))} ${m.droppedChapters.length === 1 ? 'has' : 'have'} no Final section, so ${m.droppedChapters.length === 1 ? 'it is' : 'they are'} left out with ${m.droppedChapters.length === 1 ? 'its title' : 'their titles'}. The contents list follows.${numbered}</p>` : '';
    return `<div class="alert exp-info" role="status">${IC.info}<div class="alert-text">
      ${m.notFinal.length ? `<p><strong>Left out: ${plural(m.notFinal.length, 'section')} that ${m.notFinal.length === 1 ? 'is' : 'are'} not Final.</strong></p><p>${list}</p>` : ''}${dropped}</div></div>`;
  }

  function runningHtml(m) {
    if (!m.running.length) return '';
    const one = m.running.length === 1;
    const who = one ? esc(m.running[0].label) : esc(listWords(m.running.map(shortLabel)));
    return `<div class="alert alert-warning exp-alert" role="status">${IC.clock}<div class="alert-text">
      <p><strong>Writing now: ${who}.</strong> Generate is still running for ${one ? 'this section' : 'these sections'}.</p>
      <p>Wait for it to finish, or export now with ${one ? `v${m.running[0].versionNo}, its last saved version` : 'their last saved versions'}. The new text will not be in the file.</p>
      <span class="exp-busy"><span class="spinner" aria-hidden="true"></span>Checking again in a few seconds</span></div></div>`;
  }

  function aiHtml(m) {
    const total = m.ai.words.draft + m.ai.words.edits + m.ai.words.own;
    if (!total) return '';
    const pct = (x) => Math.round((x / total) * 100);
    const a = pct(m.ai.words.draft), b = pct(m.ai.words.edits), own = Math.max(0, 100 - a - b);
    return `<div class="exp-ai">${IC.info}<div>
      <p><strong>For KDP's AI question</strong> <span class="exp-ai-tag">Advice only</span></p>
      <div class="exp-split" role="img" aria-label="AI first draft ${a}% of words, AI edits only ${b}%, your own text ${own}%"><span class="a" style="width:${a}%"></span><span class="b" style="width:${b}%"></span></div>
      <div class="exp-key"><span><i class="exp-sw a"></i>AI first draft: ${plural(m.ai.draft, 'section')}</span><span><i class="exp-sw b"></i>AI edits only: ${fmt(m.ai.edits)}</span><span><i class="exp-sw c"></i>Your own text: ${fmt(m.ai.own)}</span></div>
      <p>KDP asks if your book has AI-generated content. Text an AI wrote counts, even after your edits. AI edits of your own text are AI-assisted, which KDP does not ask about. This is a help, not legal advice.</p>
      <p><a class="text-link exp-link" href="${GUIDELINES}" target="_blank" rel="noopener">KDP content guidelines</a></p></div></div>`;
  }

  /** The parts of the ready view that change with the choices. */
  function dynamicHtml(m) {
    const ready = !m.empty && !m.openMarks;
    const allFinal = m.sections.every((s) => s.status === 'final');
    const readyLine = ready ? `<div class="exp-crow">${`<span class="save-ok">${ICON.check(16)}</span>`}<span>Ready. ${allFinal ? `All ${plural(m.sections.length, 'section')} ${m.sections.length === 1 ? 'is' : 'are'} Final.` : `${plural(m.sections.length, 'section')} in the file.`} No open Verify marks.</span></div>` : '';
    const emptyFinal = m.empty && m.include === 'final'
      ? `<div class="alert exp-info" role="status">${IC.info}<div class="alert-text"><p><strong>No section is Final yet.</strong> Choose All sections with text, or mark sections Final in 06 Write.</p></div></div>` : '';
    return `${emptyFinal}${finalOnlyHtml(m)}${layoutHtml(m)}${runningHtml(m)}${marksHtml(m)}${readyLine}${notesHtml(m)}${aiHtml(m)}`;
  }

  function readyFoot(m) {
    let why = '';
    if (m.empty) why = m.include === 'final' ? 'Choose All sections with text first.' : 'Write a section first.';
    else if (m.openMarks && !st.ack) why = 'Tick the box above to export.';
    return `${why ? `<span class="exp-why" id="expWhy">${IC.info}<span>${why}</span></span>` : ''}
      <button type="button" class="btn btn-secondary" data-exp-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-exp-go${why ? ' disabled aria-describedby="expWhy"' : ''}>${IC.down}${esc(exportLabel(m))}</button>`;
  }

  function renderReady(focusSel) {
    const m = st.model = R().model(st.data, st.opts);
    setHead('Export book');
    // Book with no text at all (any status, any part): one clear next step (24b, 5).
    if (emptyBook()) {
      body().innerHTML = `<div class="exp-empty"><div class="state-icon" aria-hidden="true">${IC.doc}</div>
        <h3>Nothing to export yet</h3><p>No section has saved text. Write at least one section in 06 Write, then come back.</p>
        <a class="btn btn-secondary" href="book.html?id=${encodeURIComponent(st.bookId)}&step=6">Go to 06 Write${IC.arrow}</a></div>`;
      foot().innerHTML = `<span class="exp-why" id="expWhy">${IC.info}<span>Write a section first.</span></span>
        <button type="button" class="btn btn-secondary" data-exp-close>Cancel</button>
        <button type="button" class="btn btn-primary" disabled aria-describedby="expWhy">${IC.down}Export .docx</button>`;
      st.view = 'empty';
      return;
    }
    if (st.view !== 'ready') {
      body().innerHTML = `${formatHtml()}${includeHtml(m)}${partsHtml()}<div data-exp-dyn>${dynamicHtml(m)}</div>`;
    } else {
      body().querySelector('[data-exp-include]').closest('.field').outerHTML = includeHtml(m);
      body().querySelector('[data-exp-dyn]').innerHTML = dynamicHtml(m);
    }
    st.view = 'ready';
    foot().innerHTML = readyFoot(m);
    if (focusSel) { const el = d.querySelector(focusSel); if (el) el.focus(); }
    scheduleRecheck(m);
  }

  /** True when no section of the book has saved text (any part, any status). */
  function emptyBook() {
    return !st.data.chapters.some((c) => (c.sections || []).some((s) => s.version && !R().isBlank(s.version.content)));
  }

  function scheduleRecheck(m) {
    clearTimeout(st.recheck);
    if (!m.running.length) return;
    st.recheck = setTimeout(async () => {
      if (!st || st.view !== 'ready' || !d.open) return;
      let res;
      try { res = await kdp.getExportData(st.bookId); } catch (e) { res = { error: e }; }
      if (!st || st.view !== 'ready') return;
      if (!res.error && res.data) st.data = res.data;
      const active = document.activeElement;
      const key = active && active.matches('[data-exp-ack]') ? '[data-exp-ack]' : active && active.matches('[data-exp-go]') ? '[data-exp-go]' : null;
      renderReady(key);
    }, RECHECK_MS);
  }

  /* ── Loading, errors, building, done ──── */

  function renderLoading() {
    st.view = 'loading';
    setHead('Export book');
    body().innerHTML = `<p class="sr-only" role="status">Reading your book…</p>
      <div class="skel skel-line skel-w30"></div><div class="skel skel-choice"></div><div class="skel skel-choice"></div>
      <div class="skel skel-line skel-w40"></div><div class="skel skel-btn"></div>`;
    foot().innerHTML = `<button type="button" class="btn btn-secondary" data-exp-close>Cancel</button>
      <button type="button" class="btn btn-primary" disabled>${IC.down}Export .docx</button>`;
  }

  function renderError(kind) {
    st.view = 'error';
    const lib = kind === 'lib';
    const title = lib ? "Error: we couldn't load the Word tool." : kind === 'read' ? "Error: we couldn't read your book." : "Error: we couldn't build the file.";
    const text = lib ? 'Check your connection and try again.' : kind === 'read' ? 'Check your connection and try again.' : 'Try again. If it keeps failing, export Markdown.';
    const sub = lib ? 'Your book is safe. Markdown export still works without it.' : 'Your text is safe. Nothing was exported.';
    body().innerHTML = `<div class="alert alert-error" role="alert">${ICON.x(16)}<div class="alert-text">
      <p><strong>${title}</strong> ${text}</p><p>${sub}</p>
      <div class="exp-acts"><button type="button" class="btn btn-secondary btn-sm" data-exp-retry="${kind}">Try again</button>
      ${lib || kind === 'build' ? '<button type="button" class="btn btn-sm link-btn exp-textbtn" data-exp-md>Export .md instead</button>' : ''}</div></div></div>`;
    foot().innerHTML = `<button type="button" class="btn btn-secondary" data-exp-close>Cancel</button>
      <button type="button" class="btn btn-primary" disabled>${IC.down}${st.opts && st.opts.format === 'md' ? 'Export .md' : 'Export .docx'}</button>`;
    d.querySelector('[data-exp-retry]').focus();
  }

  const STEPS = (md, n) => [
    !md && ['lib', 'Loading the Word tool'],
    ['read', `Reading ${plural(n, 'section')}`],
    ['build', 'Building the file'],
    ['save', 'Saving to your downloads']
  ].filter(Boolean);

  function renderBuilding(now) {
    const md = st.opts.format === 'md';
    const steps = STEPS(md, st.model.sections.length);
    const at = steps.findIndex((s) => s[0] === now);
    body().innerHTML = `<ol class="exp-steps" role="status" aria-label="Export progress">${steps.map(([k, t], i) => {
      const state = i < at ? 'done' : i === at ? 'now' : 'todo';
      const mark = state === 'done' ? `<span class="save-ok">${ICON.check(16)}</span>` : state === 'now' ? '<span class="spinner" aria-hidden="true"></span>' : '<span></span>';
      return `<li class="is-${state}">${mark}<span>${t}</span><span class="field-hint">${state === 'done' ? 'Done' : ''}</span></li>`;
    }).join('')}</ol>
      <div class="bar" role="img" aria-label="Step ${at + 1} of ${steps.length}"><span style="width: ${Math.round(((at + 0.5) / steps.length) * 100)}%"></span></div>`;
    if (st.view !== 'building') {
      foot().innerHTML = `<button type="button" class="btn btn-secondary" data-exp-cancel>Cancel</button>
        <button type="button" class="btn btn-primary" aria-disabled="true" aria-busy="true"><span class="spinner" aria-hidden="true"></span>Building…</button>`;
      foot().querySelector('[data-exp-cancel]').focus();
    }
    st.view = 'building';
    d.setAttribute('aria-busy', 'true');
  }

  function renderDone() {
    st.view = 'done';
    d.removeAttribute('aria-busy');
    setHead('Book exported');
    const r = st.result;
    const md = r.format === 'md';
    const meta = [md ? 'Markdown' : trimText(r.trim), plural(r.sections, 'section'), plural(r.words, 'word'), r.marks ? `${plural(r.marks, 'open mark')} removed` : ''].filter(Boolean).join(' · ');
    const when = new Date(r.at || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const help = md ? 'Markdown exports are a backup. The Books badge follows Word exports.'
      : `The Books page now shows "DOCX exported ${when}". If you change the text later, it shows "Changed since export".`;
    body().innerHTML = `<div class="alert exp-success" role="status"><span class="save-ok">${ICON.check(16)}</span><div class="alert-text"><p><strong>Done.</strong> The file is in your downloads.</p></div></div>
      <div class="exp-file"><span class="exp-doc" aria-hidden="true">${md ? 'MD' : 'DOCX'}</span>
        <span><span class="exp-file-name">${esc(r.name)}</span><span class="field-hint">${esc(meta)}</span></span></div>
      ${r.recordError ? `<div class="alert alert-warning" role="alert">${ICON.warn(16)}<div class="alert-text"><p>We couldn't record this export, so the Books badge may be missing.</p>
        <div class="exp-acts"><button type="button" class="btn btn-secondary btn-sm" data-exp-record>Try again</button></div></div></div>`
        : `<p class="field-hint">${help}</p>`}`;
    foot().innerHTML = `<button type="button" class="btn btn-secondary" data-exp-again>Export again</button>
      <button type="button" class="btn btn-primary" data-exp-done>Done</button>`;
    (d.querySelector('[data-exp-record]') || foot().querySelector('[data-exp-done]')).focus();
  }

  /* ── The export ───────────────────────── */

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function record() {
    const r = st.result;
    let res;
    try { res = await kdp.recordExport({ bookId: st.bookId, format: r.format, include: r.include, parts: r.parts, versionIds: r.versionIds }); } catch (e) { res = { error: e }; }
    if (!st) return;
    r.recordError = !!res.error;
    if (!res.error) { r.at = res.data && res.data.created_at; if (st.onRecorded) st.onRecorded(st.bookId, r.format); }
  }

  async function run() {
    const token = st.run = {};
    const live = () => st && st.run === token;
    const md = st.opts.format === 'md';
    clearTimeout(st.recheck);
    try {
      let lib = null;
      if (!md) {
        renderBuilding('lib');
        try { lib = await loadDocx(); } catch (e) { if (live()) renderError('lib'); return; }
        if (!live()) return;
      }
      renderBuilding('read');
      let res;
      try { res = await kdp.getExportData(st.bookId); } catch (e) { res = { error: e }; }
      if (!live()) return;
      if (res.error || !res.data) { renderError('read'); return; }
      st.data = res.data;
      // The file and the record use this read.
      const m = st.model = R().model(st.data, st.opts);
      if (m.empty) { st.view = null; renderReady(); return; }
      renderBuilding('build');
      const year = new Date().getFullYear();
      let blob;
      try {
        blob = md
          ? new Blob([B().toMarkdown(m, { year })], { type: 'text/markdown;charset=utf-8' })
          : await lib.Packer.toBlob(B().toDocx(m, lib, { year }));
      } catch (e) { if (live()) renderError('build'); return; }
      if (!live()) return;
      renderBuilding('save');
      const name = R().fileName(m.book.title, st.opts.format);
      download(blob, name);
      st.result = { format: st.opts.format, include: m.include, parts: { ...m.parts }, versionIds: R().versionIds(m), name,
        trim: m.book.trim, sections: m.sections.length, words: m.words, marks: m.marks.total };
      await record();
      if (live()) renderDone();
    } finally {
      if (st && st.run === token) st.run = null;
    }
  }

  /* ── Events ───────────────────────────── */

  function onChange(e) {
    if (!st || st.view !== 'ready') return;
    const t = e.target;
    if (t.matches('[data-exp-format]')) {
      st.opts.format = t.value;
      d.querySelectorAll('.exp-choice').forEach((c) => c.classList.toggle('is-on', c.querySelector('input').checked));
      renderReady(`[data-exp-format][value="${t.value}"]`);
    } else if (t.matches('[data-exp-include]')) {
      st.opts.include = t.value;
      renderReady('[data-exp-include]');
    } else if (t.matches('[data-exp-part]')) {
      st.opts.parts[t.dataset.expPart] = t.checked;
      const side = t.closest('.exp-tick').querySelector('.exp-side');
      if (t.dataset.expPart === 'about') side.textContent = t.checked ? 'On' : 'Off';
      renderReady(`[data-exp-part="${t.dataset.expPart}"]`);
    } else if (t.matches('[data-exp-ack]')) {
      st.ack = t.checked;
      foot().innerHTML = readyFoot(st.model);
    }
  }

  function onClick(e) {
    if (!st) return;
    const t = e.target;
    if (t.closest('[data-exp-close]')) { close(); return; }
    if (t.closest('[data-exp-go]')) { run(); return; }
    if (t.closest('[data-exp-cancel]')) { st.run = null; d.removeAttribute('aria-busy'); st.view = null; renderReady('[data-exp-go]'); return; }
    const retry = t.closest('[data-exp-retry]');
    if (retry) { if (retry.dataset.expRetry === 'read' && !st.data) load(); else run(); return; }
    if (t.closest('[data-exp-md]')) { st.opts.format = 'md'; run(); return; }
    if (t.closest('[data-exp-record]')) { record().then(() => { if (st) renderDone(); }); return; }
    if (t.closest('[data-exp-again]')) { st.ack = false; st.view = null; load(); return; }
    if (t.closest('[data-exp-done]')) { close(); }
  }

  function close() {
    if (!d || !d.open) return;
    if (st) { st.run = null; clearTimeout(st.recheck); }
    d.close();
  }

  function onClosed() {
    const s = st;
    st = null;
    d.removeAttribute('aria-busy');
    if (s && s.returnFocus) s.returnFocus();
    else if (s && s.opener && s.opener.isConnected) s.opener.focus();
  }

  async function load() {
    renderLoading();
    let res;
    try { res = await kdp.getExportData(st.bookId); } catch (e) { res = { error: e }; }
    if (!st) return;
    if (res.error || !res.data) { st.data = null; renderError('read'); return; }
    st.data = res.data;
    st.opts = st.opts || R().defaults(st.data);
    renderReady('[data-exp-format]:checked');
  }

  /** Open the dialog for a book. The tick resets every time (owner decision 1). */
  function open(bookId, { opener, returnFocus, onRecorded } = {}) {
    if (!d) build();
    if (d.open) return;
    st = { bookId, opener: opener || document.activeElement, returnFocus, onRecorded, data: null, opts: null, ack: false, view: null, run: null, recheck: null };
    d.showModal();
    load();
  }

  window.kdpExport = { open, DOCX_SRC, DOCX_SRI };
})();
