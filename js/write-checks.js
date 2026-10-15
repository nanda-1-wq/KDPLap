/* ═══════════════════════════════════════════════════
   KDP Lab — Step 06 Write: the Checks tab (E10.4, designs 22, 22c)
   /js/write-checks.js   (used by js/book-write.js, loaded before it;
                          tested by tests/browser/write/t-checks.js)

   Two groups. "In your text": code checks (js/text-checks.js) on the editor
   text, 400 ms after typing stops: open source marks, numbers with no source,
   repeated phrases, the same opener, words vs the target. Free, never the AI.
   "AI check": the last saved result of the section (0022 section_checks), or
   a button. One call (stage section_check) on the saved current version:
   unsaved typing is saved as a version first, with autosave paused until the
   call is sent (extra fix A). Each finding with a quote has "Fix with
   Improve": the quote is selected and the Improve menu opens (no AI call
   until an action is picked). Checks are advice only: they never block Final
   or Next (owner, E10.4 decision 6).

   const chk = kdpWriteChecks.create(host)   host: see book-write.js
   chk.panelHtml() · chk.count() · chk.open(sectionId) · chk.onInput()
   chk.loadResearch() · chk.run() · chk.refresh() · chk.handleClick(target)
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const MD = kdpMarkdown;
  const W = kdpWords;
  const T = kdpTextChecks;

  // Same numbers as generate/lib/limits.ts CHECK and 0022 (tests/limits-parity.test.js).
  const LIMITS = { minWords: 50, maxWords: 6000 };
  const DEBOUNCE_MS = 400;
  const svg = (size, body) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const SPARKLE = (s = 16) => svg(s, '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>');
  const INFO = (s = 16) => svg(s, '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>');
  const LOCK = (s = 16) => svg(s, '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
  const CLOCK = (s = 16) => svg(s, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
  const TYPE = { objective: 'OBJECTIVE', voice: 'VOICE', drift: 'DRIFT' };
  const PASS = { objective: 'No objective problems found', voice: 'No voice problems found', drift: 'No drift found' };
  const AREA_NAME = { objective: 'Objective', voice: 'Voice', drift: 'Drift' };
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;

  function create(host) {
    const saved = {};        // section id → { state: 'loading' | 'ready' | 'error', row }
    const running = {};      // section id → true while its AI call is out
    const failed = {};       // section id → { title, line, retry, warn }
    let research = null;     // listResearch data, or null (not loaded or failed)
    let memo = { key: null, out: null };
    let timer = 0;

    const cur = () => host.cur();
    const book = () => host.book();
    const ready = () => !!cur() && cur().state === 'ready';

    /* ── Code checks ──────────────────────────── */

    function known() {
      return T.knownOf(one(book().book_briefs) || {}, research || {}, host.chapters());
    }

    /** The code checks of the open section's text (memoized: text, sources, target). */
    function codeChecks() {
      if (!ready()) return { rows: [], warnings: 0, empty: true };
      const hit = host.findSection(cur().id);
      const target = hit ? hit.s.word_target || 0 : 0;
      const k = known();
      const key = `${cur().text}\u0000${k}\u0000${target}`;
      if (memo.key !== key) memo = { key, out: T.check(cur().text, { known: k, target }) };
      return memo.out;
    }

    /* ── The saved AI check ───────────────────── */

    function keyNow() {
      const c = cur();
      const hit = host.findSection(c.id);
      if (!hit || !c.base) return null;
      const pos = one(book().positioning) || {};
      const pen = one(book().pen_names) || {};
      return kdpSectionCheckKey({
        versionId: c.base, kind: hit.c.kind, chapterTitle: hit.c.title, objective: hit.c.objective, sectionTitle: hit.s.title,
        lockedAt: pos.locked_at || null, penName: pen.name || null, voice: pen.voice
      });
    }

    /** The saved row of the open section, or null. */
    const row = () => (ready() && saved[cur().id] && saved[cur().id].state === 'ready' ? saved[cur().id].row : null);
    /** Out of date: the text on screen is not the version checked, or a part of the key changed. */
    const outOfDate = (r) => !!r && (host.dirty() || keyNow() !== r.inputs_key);

    async function open(id) {
      if (!id) return;
      saved[id] = { state: 'loading', row: saved[id] && saved[id].row };
      let res;
      try { res = await kdp.getSectionCheck(id); } catch (err) { res = { error: err }; }
      saved[id] = res.error ? { state: 'error', row: null } : { state: 'ready', row: res.data || null };
      refresh();
    }

    async function loadResearch() {
      let res;
      try { res = await kdp.listResearch(book().id); } catch (err) { res = { error: err }; }
      // Without Research, numbers from it are flagged too; the next step open tries again.
      research = res.error ? null : res.data;
      memo = { key: null, out: null };
      refresh();
    }

    /* ── Gates ────────────────────────────────── */

    const WHY = {
      loading: 'The AI check turns on when the section is ready.',
      conflict: 'Choose which text to keep first.',
      gen_here: 'Wait for the section to finish writing.',
      other_tab: 'This section is being written in another tab or window.',
      positioning: 'Lock the positioning in 03 to run the AI check.',
      checking: 'The AI check is running.'
    };

    /** Why the AI check is off for the open section ('' when it can run), and the words for it. */
    function aiWhy() {
      if (!ready()) return ['loading', WHY.loading];
      const w = host.why();
      if (w === 'conflict' || w === 'gen_here' || w === 'other_tab' || w === 'loading') return [w, WHY[w]];
      if (!host.posLocked()) return ['positioning', WHY.positioning];
      if (running[cur().id]) return ['checking', WHY.checking];
      const n = W.count(cur().text);
      if (n < LIMITS.minWords) return ['short', 'Write at least 50 words to run the AI check.'];
      if (n > LIMITS.maxWords) return ['long', `The AI check reads up to ${fmt(LIMITS.maxWords)} words. This section has ${fmt(n)}.`];
      return ['', ''];
    }

    /* ── Run ──────────────────────────────────── */

    const ERR = {
      ai_unavailable: 'The AI service did not respond.',
      server_error: 'The AI service did not respond.',
      network: 'The AI service did not respond.',
      ai_stopped: 'The AI service stopped.',
      ai_declined: 'The AI service declined this text.'
    };

    function errorOf(e) {
      const code = e.code;
      if (ERR[code]) return { title: ERR[code], line: 'Nothing was counted in your usage.', retry: true, warn: false };
      if (code === 'monthly_limit' || code === 'rate_limited') {
        const [, text, retry] = kdpUi.aiMessage(code);
        return { title: text, line: '', retry, warn: true };
      }
      const map = {
        positioning_not_locked: [WHY.positioning, false],
        run_in_progress: [WHY.other_tab, false],
        unsaved_draft: ['Your newest typing reached the server first. Check again to save it and run the check.', true],
        version_conflict: ['This section was saved in another tab. Choose which text to keep, then check again.', false],
        check_too_short: [`Write at least 50 words to run the AI check.${e.words != null ? ` The saved version has ${fmt(e.words)}.` : ''}`, false],
        check_too_long: [`The AI check reads up to ${fmt(LIMITS.maxWords)} words. This section has ${fmt(e.words)}.`, false],
        nothing_to_check: ['Write at least 50 words to run the AI check.', false],
        not_found: ['This section was removed in 05 Outline.', false],
        unauthorized: ['Your session ended. Sign in again to run the AI check.', false]
      };
      const [title, retry] = map[code] || ['The AI service did not respond.', true];
      return { title, line: code in map ? '' : 'Nothing was counted in your usage.', retry, warn: code in map };
    }

    /**
     * The AI check. Unsaved typing first becomes a version ("Save a version
     * first?"); autosave stays paused from there until the call is sent, so
     * this tab's own draft cannot reach the server first (extra fix A).
     */
    async function run() {
      if (aiWhy()[0]) return;
      const id = cur().id;
      if (host.dirty()) {
        const next = (cur().version ? cur().version.version_no : 0) + 1;
        const yes = await host.confirm({
          title: 'Save a version first?',
          text: `The AI check reads the saved version. Your typing becomes v${next}, then the check runs on it.`,
          ok: 'Save and check', cancel: 'Cancel'
        });
        if (!yes || !ready() || cur().id !== id) return;
        // The editor is read only and autosave paused until the call is sent (extra fix A, G3 P3).
        host.pauseDrafts(true);
        const ok = await host.saveFirst();
        if (!ok || !ready() || cur().id !== id) { host.pauseDrafts(false); refresh(); return; }
      } else host.pauseDrafts(true);
      if (aiWhy()[0]) { host.pauseDrafts(false); refresh(); return; }
      running[id] = true;
      delete failed[id];
      refresh();
      host.announce('Checking the section…');
      let res;
      try {
        res = await kdp.sectionCheck({ stage: 'section_check', bookId: book().id, sectionId: id, baseVersionId: cur().base },
          { onSent: () => host.pauseDrafts(false) });
      } catch (err) { res = { error: { code: 'network' } }; }
      host.pauseDrafts(false);
      delete running[id];
      if (res.error) {
        failed[id] = errorOf(res.error);
        if (res.error.code === 'version_conflict') host.adoptRemote();
        host.announce(failed[id].title);
      } else {
        const d = res.data;
        saved[id] = { state: 'ready', row: { version_id: d.version_id, findings: d.findings || [], areas: d.areas, words: d.words, inputs_key: d.inputs_key, checked_at: d.checked_at } };
        const n = (d.findings || []).length;
        host.announce(n ? `AI check done. ${n === 1 ? '1 point' : `${n} points`} to look at.` : 'AI check done. No problems found.');
      }
      refresh();
    }

    /* ── Show and Fix ─────────────────────────── */

    /** Select md[start, end) in the editor (Show). */
    function show(start, end) {
      const e = host.els();
      const ed = e && e.main.querySelector('[data-editor]');
      if (!ed || !ready()) return;
      const map = MD.fromDomMap(ed);
      if (map.md !== cur().text || end > map.md.length) return;
      const p = map.domPoint(start, 'start'), q = map.domPoint(end, 'end');
      if (!p || !q) return;
      ed.focus({ preventScroll: true });
      try {
        const r = document.createRange();
        r.setStart(p.node, p.offset);
        r.setEnd(q.node, q.offset);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        const n = p.node.nodeType === 1 ? p.node : p.node.parentElement;
        if (n && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' });
      } catch (err) { /* nothing selected */ }
    }

    function fix(i) {
      const r = row();
      const f = r && r.findings[i];
      if (!f || !f.quote) return;
      const at = cur().text.indexOf(f.quote);
      if (at < 0) { refresh(); return; }
      const why = host.imp().openFor(at, at + f.quote.length);
      if (why) host.announce(host.imp().offText() || 'This text is no longer in the section.');
    }

    /** Clicks inside the Checks panel. True when handled. */
    function handleClick(t) {
      if (t.hasAttribute('data-chk-run') || t.hasAttribute('data-chk-retry')) { run(); return true; }
      if (t.hasAttribute('data-chk-reload')) { if (ready()) open(cur().id); return true; }
      if (t.dataset.chkShow) { const [a, b] = t.dataset.chkShow.split(':').map(Number); show(a, b); return true; }
      if (t.dataset.chkFix) { fix(Number(t.dataset.chkFix)); return true; }
      return false;
    }

    /* ── Count and render ─────────────────────── */

    /** The tab count: code warnings (never the words row) + AI findings of a current check (decision 6). */
    function count() {
      if (!ready()) return 0;
      const r = row();
      return codeChecks().warnings + (r && !outOfDate(r) ? r.findings.length : 0);
    }

    function onInput() {
      clearTimeout(timer);
      timer = setTimeout(refresh, DEBOUNCE_MS);
    }

    /** The panel (when the Checks tab shows) and the tab count. */
    function refresh() {
      const e = host.els();
      if (!e || !host.active()) return;
      const tab = e.side.querySelector('[data-tab="checks"]');
      if (tab) {
        const n = count();
        tab.innerHTML = n ? `Checks <span class="count" aria-hidden="true">${n}</span>` : 'Checks';
        tab.setAttribute('aria-label', n ? `Checks, ${n} to review` : 'Checks');
      }
      const panel = e.side.querySelector('[data-panel][data-panel-kind="checks"]');
      if (!panel) return;
      // Keep the focus where it was (a re-render replaces the buttons).
      const focused = document.activeElement && panel.contains(document.activeElement) ? focusKey(document.activeElement) : null;
      panel.innerHTML = panelHtml();
      if (focused) { const b = panel.querySelector(focused); if (b) b.focus(); }
    }

    const focusKey = (el) => ['data-chk-run', 'data-chk-retry', 'data-chk-reload'].map((a) => (el.hasAttribute(a) ? `[${a}]` : '')).find(Boolean)
      || (el.dataset.chkFix ? `[data-chk-fix="${el.dataset.chkFix}"]` : el.dataset.chkShow ? `[data-chk-show="${el.dataset.chkShow}"]` : null);

    const icon = { warn: () => `<span class="wr-chk-ico is-warn">${ICON.warn(16)}</span>`, ok: () => `<span class="wr-chk-ico is-ok">${ICON.check(16)}</span>`, info: () => `<span class="wr-chk-ico">${INFO(16)}</span>` };
    const showBtn = (g, label = 'Show') => `<button type="button" class="wr-chk-link" data-chk-show="${g.start}:${g.end}">${label}</button>`;

    function codeHtml() {
      const out = codeChecks();
      if (out.empty) return '<p class="wr-chk-help">Nothing to check yet. Start writing this section.</p>';
      const rows = out.rows.map((r) => {
        let extra = '';
        if (r.sents.length) {
          const items = r.sents.slice(0, 10).map((s) => `<li><span class="wr-chk-sent">${esc(s.text)}</span>${showBtn(s)}</li>`).join('');
          const more = r.sents.length > 10 ? `<li class="wr-chk-more">+${fmt(r.sents.length - 10)} more</li>` : '';
          extra = `<ul class="wr-chk-sents">${items}${more}</ul>`;
        } else if (r.ranges.length) extra = showBtn(r.ranges[0]);
        return `<div class="wr-crow" data-chk-row="${r.code}">${r.kind === 'warn' ? icon.warn() : icon.info()}<div class="wr-crow-body"><span class="wr-crow-text">${esc(r.text)}</span>${r.sub ? `<span class="wr-crow-sub">${esc(r.sub)}</span>` : ''}${extra}</div></div>`;
      });
      if (!out.warnings) rows.unshift(`<div class="wr-crow" data-chk-row="clear">${icon.ok()}<div class="wr-crow-body"><span class="wr-crow-text">No issues in your text.</span></div></div>`);
      return rows.join('');
    }

    function findingHtml(f, i, old) {
      // G3 P4: numbers in the message with no source, with the step 05 badge.
      const nums = Array.isArray(f.unsourced) ? f.unsourced : [];
      const badge = nums.length ? `<span class="check-badge warn">${ICON.warn()}Verify: no source for ${esc(nums.join(', '))}</span>` : '';
      const head = `<span class="wr-chk-type">${ICON.warn(14)}${TYPE[f.type]}</span><p class="wr-chk-msg">${esc(f.message)}</p>${badge}`;
      if (!f.quote) {
        // An objective gap (decision 1): nothing to select, no Fix.
        return `<div class="wr-chk-find${old ? ' is-old' : ''}" data-chk-finding="${i}">${head}<span class="wr-chk-gap">MISSING FROM THE TEXT</span>
          <p class="wr-chk-note">${INFO(16)}<span>Nothing to select. Add this part yourself.</span></p></div>`;
      }
      const gone = cur().text.indexOf(f.quote) < 0;
      const off = gone ? 'This text is no longer in the section.' : host.imp().offText();
      const noteId = `wrChkFix${i}`;
      // The quote is Markdown (exact, for the match); it shows as plain text, as Compare does.
      return `<div class="wr-chk-find${old ? ' is-old' : ''}" data-chk-finding="${i}">${head}<p class="wr-chk-quote">“${esc(MD.toPlain(f.quote).replace(/\s+/g, ' ').trim())}”</p>
        <button type="button" class="btn btn-secondary btn-sm wr-chk-fix" data-chk-fix="${i}"${off ? ` disabled aria-describedby="${noteId}"` : ''}>${SPARKLE()}Fix with Improve</button>
        ${off ? `<p class="wr-chk-note" id="${noteId}">${INFO(16)}<span>${esc(off)}</span></p>` : ''}</div>`;
    }

    function aiHtml() {
      const c = cur();
      const s = saved[c.id];
      const r = row();
      const [why, whyText] = aiWhy();
      const parts = [];
      const err = failed[c.id];
      if (s && s.state === 'loading' && !s.row && !running[c.id]) {
        return '<div class="skel skel-line" aria-hidden="true"></div><div class="skel skel-line skel-w40" aria-hidden="true"></div><p class="sr-only" role="status">Loading the last AI check…</p>';
      }
      if (s && s.state === 'error') {
        parts.push(`<div class="alert alert-error wr-chk-alert" role="alert">${ICON.x(16)}<div><p class="alert-text"><strong>We couldn’t load the last AI check.</strong></p>
          <div class="wr-chk-acts"><button type="button" class="btn btn-secondary btn-sm" data-chk-reload>Try again</button></div></div></div>`);
      }
      if (err) {
        parts.push(`<div class="alert ${err.warn ? 'alert-warning' : 'alert-error'} wr-chk-alert" role="alert">${err.warn ? ICON.warn(16) : ICON.x(16)}<div>
          <p class="alert-text"><strong>${esc(err.title)}</strong></p>${err.line ? `<p class="alert-text wr-chk-small">${esc(err.line)}</p>` : ''}
          ${err.retry && !why ? '<div class="wr-chk-acts"><button type="button" class="btn btn-secondary btn-sm" data-chk-retry>Try again</button></div>' : ''}</div></div>`);
      }
      if (running[c.id]) {
        parts.push(`<button type="button" class="btn btn-secondary wr-chk-run" disabled><span class="wr-imp-spin" aria-hidden="true"></span>Checking…</button>
          <div class="skel skel-line" aria-hidden="true"></div><div class="skel skel-line skel-w40" aria-hidden="true"></div>
          <p class="wr-chk-help" role="status">You can keep writing. The result is saved, so it shows here even if you leave the section.</p>`);
        return parts.join('');
      }
      if (!r) {
        if (!err) parts.push('<p class="wr-chk-help">Checks the saved version against the chapter objective, your pen name’s voice and the locked positioning.</p>');
        parts.push(runButton(why, whyText));
        return parts.join('');
      }
      const old = outOfDate(r);
      const v = (c.versions || []).find((x) => x.id === r.version_id);
      const when = host.relTime(r.checked_at);
      if (old) {
        parts.push(`<div class="alert alert-warning wr-chk-alert">${CLOCK(16)}<div><p class="alert-text"><strong>Out of date.</strong> The text, the chapter, the positioning or the voice changed since this check.</p>
          ${why ? '' : '<div class="wr-chk-acts"><button type="button" class="btn btn-secondary btn-sm" data-chk-run>Check again</button></div>'}</div></div>`);
        parts.push(`<div class="wr-chk-meta"><span>AI check${v ? ` of v${v.version_no}` : ''} · ${esc(when)}</span></div>`);
      } else {
        parts.push(`<div class="wr-chk-meta"><span>AI check${v ? ` of v${v.version_no}` : ''} · ${esc(when)}</span>${why ? '' : '<button type="button" class="wr-chk-link" data-chk-run>Check again</button>'}</div>`);
      }
      if (why && why !== 'checking') parts.push(`<p class="wr-chk-why">${why === 'positioning' ? LOCK(16) : INFO(16)}<span>${esc(whyText)}</span></p>`);
      r.findings.forEach((f, i) => parts.push(findingHtml(f, i, old)));
      for (const t of ['objective', 'voice', 'drift']) {
        const a = r.areas && r.areas[t];
        if (a === 'pass') parts.push(`<div class="wr-crow" data-chk-area="${t}">${icon.ok()}<div class="wr-crow-body"><span class="wr-crow-text">${PASS[t]}</span></div></div>`);
        else if (a === 'unclear') parts.push(`<div class="wr-crow" data-chk-area="${t}">${icon.info()}<div class="wr-crow-body"><span class="wr-crow-text">${AREA_NAME[t]}: the AI could not point to the text.</span><span class="wr-crow-sub">Check again.</span></div></div>`);
        else if (a === 'skipped') {
          parts.push(`<div class="wr-crow" data-chk-area="${t}">${icon.info()}<div class="wr-crow-body"><span class="wr-crow-text">Voice not checked</span>
            <span class="wr-crow-sub">No voice set for this pen name. <a href="pen-name.html?id=${encodeURIComponent((one(book().pen_names) || {}).id || '')}">Add one in Pen Names</a> to check it.</span></div></div>`);
        }
      }
      return parts.join('');
    }

    function runButton(why, whyText) {
      const icn = why === 'positioning' ? LOCK() : SPARKLE();
      return `<button type="button" class="btn btn-secondary wr-chk-run" data-chk-run${why ? ' disabled aria-describedby="wrChkWhy"' : ''}>${icn}Run AI check</button>
        ${why ? `<p class="wr-chk-why" id="wrChkWhy">${why === 'positioning' ? LOCK(16) : INFO(16)}<span>${esc(whyText)}${why === 'positioning' ? ` <a href="?id=${encodeURIComponent(book().id)}&step=3" data-go-step="3">Go to 03</a>` : ''}</span></p>` : ''}`;
    }

    function panelHtml() {
      if (!ready()) return '<div class="chip-label">CHECKS</div><p class="wr-soon">Open a section to check it.</p>';
      return `<div class="wr-chk">
        <section class="wr-chk-group" aria-labelledby="wrChkText"><h3 class="chip-label wr-chk-h" id="wrChkText">IN YOUR TEXT</h3>${codeHtml()}</section>
        <section class="wr-chk-group" aria-labelledby="wrChkAi"><div class="wr-chk-head"><h3 class="chip-label wr-chk-h" id="wrChkAi">AI CHECK</h3><span class="wr-chk-ai">AI</span></div>${aiHtml()}</section>
      </div>`;
    }

    return { panelHtml, count, open, onInput, loadResearch, run, refresh, handleClick, aiWhy };
  }

  window.kdpWriteChecks = { create };
})();
