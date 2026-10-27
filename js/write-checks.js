/* ═══════════════════════════════════════════════════
   KDP Lab — Step 06 Write: the Checks tab (E10.4, PRODUCE G5; designs 22, 22c, 22d)
   /js/write-checks.js   (used by js/book-write.js, loaded before it;
                          tested by tests/browser/write/t-checks.js, t-fix.js, t-queue.js)

   Two groups. "In your text": code checks (js/text-checks.js) on the editor
   text, 400 ms after typing stops: open source marks, numbers with no source,
   sources with no name, sentences also in another section (the other
   sections' saved texts, read when a section opens), repeated phrases, the
   same opener, words vs the target. Free, never the AI.
   "AI check": the last saved result of the section (0022 section_checks), or
   a button. One call (stage section_check) on the saved current version:
   unsaved typing is saved as a version first, with autosave paused until the
   call is sent (extra fix A). Checks are advice only: they never block Final
   or Next (owner, E10.4 decision 6).

   G5 (design 22d, rules in js/finding-rules.js): severity from the type
   (drift and objective major, voice minor; minor folds into one row). "Fix"
   selects the quote and opens Improve on Custom, pre-filled with the finding
   (nothing is sent until Send). "Keep as is" saves the finding in 0024
   kept_findings: it stays hidden on later checks (a gap: for this check
   only), with Undo in the kept list. "Fix major (N)" runs the major findings
   one at a time in Improve's card (js/write-improve.js queue).

   const chk = kdpWriteChecks.create(host)   host: see book-write.js
   chk.panelHtml() · chk.count() · chk.open(sectionId) · chk.onInput()
   chk.loadResearch() · chk.run() · chk.refresh() · chk.handleClick(target)
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const MD = kdpMarkdown;
  const W = kdpWords;
  const T = kdpTextChecks;
  const R = kdpFindingRules;

  // Same numbers as generate/lib/limits.ts CHECK and 0022 (tests/limits-parity.test.js).
  const LIMITS = { minWords: 50, maxWords: 6000 };
  const DEBOUNCE_MS = 400;
  const svg = (size, body) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const SPARKLE = (s = 16) => svg(s, '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>');
  const INFO = (s = 16) => svg(s, '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>');
  const LOCK = (s = 16) => svg(s, '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
  const CLOCK = (s = 16) => svg(s, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
  const EYE_OFF = (s = 16) => svg(s, '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9 6-.3.8-1.2 2.3-2.6 3.6M6.4 7.6C4.6 8.9 3.4 10.7 3 12c.5 1.5 4 6 9 6 1.6 0 3-.4 4.2-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');
  const TYPE = { objective: 'Objective', voice: 'Voice', drift: 'Drift' };
  const PASS = { objective: 'No objective problems found', voice: 'No voice problems found', drift: 'No drift found' };
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const listWords = (items) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

  function create(host) {
    const saved = {};        // section id → { state: 'loading' | 'ready' | 'error', row }
    const running = {};      // section id → true while its AI call is out
    const failed = {};       // section id → { title, line, retry, warn }
    const kept = {};         // section id → { state: 'loading' | 'ready' | 'error', rows } (0024)
    const folds = {};        // section id → { minor, kept }: open or closed while the page is open (22d, 2)
    const keeping = {};      // section id → finding index or kept id while its save or delete is out
    const keepErr = {};      // section id → { at: finding index or kept id, text }
    let fixing = null;       // { sid, i }: the finding whose Fix opened the Improve menu (shown pressed while it is open)
    let research = null;     // listResearch data, or null (not loaded or failed)
    let others = { seq: 0, id: null, list: [] };   // the other sections' saved texts [{ label, text }] for section id (fix batch 2, item 11 A)
    let othersToken = 0;
    let memo = { key: null, out: null };
    let timer = 0;

    const cur = () => host.cur();
    const book = () => host.book();
    const ready = () => !!cur() && cur().state === 'ready';
    const fold = () => (folds[cur().id] = folds[cur().id] || { minor: false, kept: false });

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
      const title = hit ? hit.s.title || '' : '';
      const key = `${cur().text}\u0000${k}\u0000${target}\u0000${title}\u0000${others.seq}`;
      // Only the list read for this section (never one that holds its own text).
      const list = others.id === cur().id ? others.list : [];
      if (memo.key !== key) memo = { key, out: T.check(cur().text, { known: k, target, title, others: list }) };
      return memo.out;
    }

    /**
     * The other sections' saved texts, for "Also in another section" (fix batch 2,
     * item 11 A). Read each time a section opens. A failed read shows no row.
     */
    async function loadOthers(id) {
      const token = ++othersToken;
      const list = [];
      for (const c of host.chapters()) for (const s of c.sections || []) if (s.id !== id && s.current_version_id) list.push({ label: host.number(c, s), vid: s.current_version_id });
      let res = { data: [] };
      if (list.length) { try { res = await kdp.getSectionTexts(list.map((x) => x.vid)); } catch (err) { res = { error: err }; } }
      if (token !== othersToken) return;   // a newer section opened meanwhile: its read wins
      const text = new Map((res.error ? [] : res.data || []).map((v) => [v.id, v.content || '']));
      others = { seq: others.seq + 1, id, list: list.filter((x) => text.has(x.vid)).map((x) => ({ label: x.label, text: text.get(x.vid) })) };
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
        lockedAt: pos.locked_at || null, penName: pen.name || null, voice: pen.voice,
        // G3 P10: the word target and the chapter's other sections, as the prompt sends them.
        wordTarget: hit.s.word_target, siblings: kdpSectionCheckKey.siblings(hit.c.kind, hit.c.sections, hit.s.id)
      });
    }

    /** The saved row of the open section, or null. */
    const row = () => (ready() && saved[cur().id] && saved[cur().id].state === 'ready' ? saved[cur().id].row : null);
    /** Out of date: the text on screen is not the version checked, or a part of the key changed. */
    const outOfDate = (r) => !!r && (host.dirty() || keyNow() !== r.inputs_key);
    /** The kept rows of the open section (none while loading or after a load error: nothing is hidden then). */
    const keptRows = () => (ready() && kept[cur().id] && kept[cur().id].state === 'ready' ? kept[cur().id].rows : []);
    /** What the tab shows for the saved check (js/finding-rules.js). */
    const viewNow = (r) => R.view(r, keptRows(), cur().text, outOfDate(r));

    async function open(id) {
      if (!id) return;
      saved[id] = { state: 'loading', row: saved[id] && saved[id].row };
      const keptLoad = loadKept(id);
      const othersLoad = loadOthers(id);
      let res;
      try { res = await kdp.getSectionCheck(id); } catch (err) { res = { error: err }; }
      saved[id] = res.error ? { state: 'error', row: null } : { state: 'ready', row: res.data || null };
      await keptLoad;
      await othersLoad;
      refresh();
    }

    async function loadKept(id) {
      kept[id] = { state: 'loading', rows: kept[id] ? kept[id].rows : [] };
      let res;
      try { res = await kdp.listKeptFindings(id); } catch (err) { res = { error: err }; }
      kept[id] = res.error ? { state: 'error', rows: [] } : { state: 'ready', rows: res.data || [] };
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
      checking: 'The AI check is running.',
      // A new check would replace the one the Fix major queue came from (G5 live note 3).
      queue: 'Finish or stop Fix major first.'
    };

    /** Why the AI check is off for the open section ('' when it can run), and the words for it. */
    function aiWhy() {
      if (!ready()) return ['loading', WHY.loading];
      const w = host.why();
      if (w === 'conflict' || w === 'gen_here' || w === 'other_tab' || w === 'loading') return [w, WHY[w]];
      if (!host.posLocked()) return ['positioning', WHY.positioning];
      if (running[cur().id]) return ['checking', WHY.checking];
      if (queueNow()) return ['queue', WHY.queue];
      const n = W.count(cur().text);
      if (n < LIMITS.minWords) return ['short', 'Write at least 50 words to run the AI check.'];
      if (n > LIMITS.maxWords) return ['long', `The AI check reads up to ${fmt(LIMITS.maxWords)} words. This section has ${fmt(n)}.`];
      return ['', ''];
    }

    /** The Fix major queue of the open section while it runs (not its end card), or null. */
    function queueNow() {
      const q = host.imp().queue();
      return q && ready() && q.sid === cur().id && q.state !== 'end' ? q : null;
    }

    /* ── Run ──────────────────────────────────── */

    const ERR = {
      ai_unavailable: 'The AI service did not respond.',
      server_error: 'The AI service did not respond.',
      network: 'The AI service did not respond.',
      ai_stopped: 'The AI service stopped.',
      ai_declined: 'The AI service declined this text.'
    };

    const MAY_COUNT = 'If the AI had already finished, this call may still count.';

    function errorOf(e) {
      const code = e.code;
      // A lost connection may have reached the server, which then counts the call (G3 P8, as 05 after Stop).
      if (code === 'network') return { title: ERR.network, line: MAY_COUNT, retry: true, warn: false };
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
        // checked_at stays the database's string (microseconds): a kept gap sends it back as it is.
        saved[id] = { state: 'ready', row: { version_id: d.version_id, findings: d.findings || [], areas: d.areas, words: d.words, inputs_key: d.inputs_key, checked_at: d.checked_at } };
        delete keepErr[id];
        const v = R.view(saved[id].row, kept[id] && kept[id].state === 'ready' ? kept[id].rows : [], cur().text, false);
        const n = v.major.length + v.minor.length;
        host.announce(n ? `AI check done. ${n === 1 ? '1 point' : `${n} points`} to look at.` : 'AI check done. No problems found.');
      }
      refresh();
    }

    /* ── Show, Fix, Keep as is, Fix major ─────── */

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

    /** Fix (22d, 5): the quote selected, Improve open on Custom with the finding's words. No AI call. */
    function fix(i) {
      const r = row();
      const f = r && r.findings[i];
      if (!f || !f.quote) return;
      const at = cur().text.indexOf(f.quote);
      if (at < 0) { refresh(); return; }
      const why = host.imp().openFor(at, at + f.quote.length, { ask: f.message });
      if (why) host.announce(host.imp().offText() || 'This text is no longer in the section.');
      else { fixing = { sid: cur().id, i }; refresh(); }
    }

    /** Keep as is (22d, 3a and 11): a save, not an AI call. */
    async function keep(i) {
      const r = row();
      const f = r && r.findings[i];
      const id = cur().id;
      if (!f || keeping[id] != null) return;
      keeping[id] = i;
      delete keepErr[id];
      refresh();
      let res;
      try {
        // A gap sends its check's checked_at exactly as the database sent it (never rebuilt with Date).
        res = await kdp.keepFinding({ sectionId: id, type: f.type, message: f.message, quote: f.quote, checkAt: f.quote ? null : r.checked_at });
      } catch (err) { res = { error: err }; }
      delete keeping[id];
      if (res.error) {
        const m = res.error.message || '';
        keepErr[id] = { at: i, text: m === 'kept_limit' ? `You have kept ${R.KEPT_MAX} findings in this section. Undo one to keep another.`
          : m === 'kept_gap_not_in_check' ? 'This check was replaced. Check again, then keep it.'
          : 'We couldn’t save this. Try again.' };
        if (ready() && cur().id === id) { refresh(); host.announce(keepErr[id].text); }
        return;
      }
      if (res.data) kept[id] = { state: 'ready', rows: [res.data, ...(kept[id] ? kept[id].rows : [])] };
      else await loadKept(id);   // already kept (another tab): read the list again
      // A waiting Fix major item leaves the queue ("1 of 2", 22d 7a).
      host.imp().queueRemove(i);
      if (!ready() || cur().id !== id) return;
      refresh();
      const b = host.els() && host.els().side.querySelector('[data-chk-fold="kept"]');
      if (b) b.focus();
      host.announce(f.quote ? 'Kept. It stays hidden on later checks.' : 'Kept for this check only.');
    }

    /** Undo a keep (22d, 3b): the finding comes back in its place and in the count. */
    async function undo(kid) {
      const id = cur().id;
      const list = kept[id] && kept[id].rows;
      const k = list && list.find((x) => x.id === kid);
      if (!k || keeping[id] != null) return;
      keeping[id] = kid;
      delete keepErr[id];
      refresh();
      let res;
      try { res = await kdp.unkeepFinding(kid); } catch (err) { res = { error: err }; }
      delete keeping[id];
      if (res.error) {
        keepErr[id] = { at: kid, text: 'We couldn’t undo this. Try again.' };
        if (ready() && cur().id === id) { refresh(); host.announce(keepErr[id].text); }
        return;
      }
      kept[id] = { state: 'ready', rows: kept[id].rows.filter((x) => x.id !== kid) };
      if (!ready() || cur().id !== id) return;
      refresh();
      const r = row();
      const i = r ? r.findings.findIndex((f) => R.keptOf(f, [k], r.checked_at)) : -1;
      const side = host.els() && host.els().side;
      // The finding's own button; when it is folded away, the fold row it is in (G5 live note 2).
      const back = side && (side.querySelector(`[data-chk-keep="${i}"]`) || (i >= 0 && side.querySelector('[data-chk-fold="minor"]'))
        || side.querySelector('[data-chk-fold="kept"]') || side.querySelector('[data-tab="checks"]'));
      if (back) back.focus();
      host.announce('Keep undone. The finding is back.');
    }

    /** Fix major (22d, 6): the queue starts in Improve's card. */
    function fixMajor() {
      const r = row();
      if (!r || outOfDate(r)) return;
      const items = R.fixMajor(r, keptRows(), cur().text, false);
      if (items.length < R.QUEUE_MIN) return;
      const why = host.imp().queueStart(items.map((x) => ({ i: x.i, type: x.f.type, message: x.f.message, quote: x.f.quote })));
      if (why) host.announce(host.imp().offText());
      refresh();
    }

    /** Clicks inside the Checks panel. True when handled. */
    function handleClick(t) {
      if (t.hasAttribute('data-chk-run') || t.hasAttribute('data-chk-retry')) { run(); return true; }
      if (t.hasAttribute('data-chk-reload')) { if (ready()) open(cur().id); return true; }
      if (t.hasAttribute('data-chk-kept-reload')) { if (ready()) { const id = cur().id; loadKept(id).then(refresh); refresh(); } return true; }
      if (t.dataset.chkShow) { const [a, b] = t.dataset.chkShow.split(':').map(Number); show(a, b); return true; }
      if (t.dataset.chkFix) { fix(Number(t.dataset.chkFix)); return true; }
      if (t.dataset.chkKeep) { keep(Number(t.dataset.chkKeep)); return true; }
      if (t.dataset.chkUndo) { undo(t.dataset.chkUndo); return true; }
      if (t.hasAttribute('data-chk-fixmajor')) { fixMajor(); return true; }
      if (t.dataset.chkFold) {
        const f = fold();
        f[t.dataset.chkFold] = !f[t.dataset.chkFold];
        refresh();
        return true;
      }
      return false;
    }

    /* ── Count and render ─────────────────────── */

    /** The tab count: code warnings (never the words row) + open major findings of a current check (22d, Q1). */
    function count() {
      if (!ready()) return 0;
      const r = row();
      return R.tabCount(codeChecks().warnings, r ? viewNow(r) : null, !r || outOfDate(r));
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

    const FOCUS_ATTRS = ['data-chk-run', 'data-chk-retry', 'data-chk-reload', 'data-chk-kept-reload', 'data-chk-fixmajor'];
    const focusKey = (el) => FOCUS_ATTRS.map((a) => (el.hasAttribute(a) ? `[${a}]` : '')).find(Boolean)
      || ['chkFix', 'chkShow', 'chkKeep', 'chkUndo', 'chkFold'].map((k) => (el.dataset[k] != null ? `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${el.dataset[k]}"]` : '')).find(Boolean)
      || null;

    const icon = { warn: () => `<span class="wr-chk-ico is-warn">${ICON.warn(16)}</span>`, ok: () => `<span class="wr-chk-ico is-ok">${ICON.check(16)}</span>`, info: () => `<span class="wr-chk-ico">${INFO(16)}</span>` };
    const showBtn = (g, label = 'Show') => `<button type="button" class="wr-chk-link" data-chk-show="${g.start}:${g.end}">${label}</button>`;
    const HELP = '<p class="wr-chk-help wr-chk-help-last">Checks are advice, not a score. They never block Final or Next.</p>';

    function codeHtml() {
      const out = codeChecks();
      if (out.empty) return '<p class="wr-chk-help">Nothing to check yet. Start writing this section.</p>';
      const rows = out.rows.map((r) => {
        let extra = '';
        if (r.sents.length) {
          const sent = (s) => (s.where
            ? `<span class="wr-chk-sent-wrap"><span class="wr-chk-sent">${esc(s.text)}</span><span class="wr-chk-where">Also in ${esc(listWords(s.where))}</span></span>`
            : `<span class="wr-chk-sent">${esc(s.text)}</span>`);
          const items = r.sents.slice(0, 10).map((s) => `<li>${sent(s)}${showBtn(s)}</li>`).join('');
          const more = r.sents.length > 10 ? `<li class="wr-chk-more">+${fmt(r.sents.length - 10)} more</li>` : '';
          extra = `<ul class="wr-chk-sents">${items}${more}</ul>`;
        } else if (r.ranges.length) extra = showBtn(r.ranges[0]);
        return `<div class="wr-crow" data-chk-row="${r.code}">${r.kind === 'warn' ? icon.warn() : icon.info()}<div class="wr-crow-body"><span class="wr-crow-text">${esc(r.text)}</span>${r.sub ? `<span class="wr-crow-sub">${esc(r.sub)}</span>` : ''}${extra}</div></div>`;
      });
      if (!out.warnings) rows.unshift(`<div class="wr-crow" data-chk-row="clear">${icon.ok()}<div class="wr-crow-body"><span class="wr-crow-text">No issues in your text.</span></div></div>`);
      return rows.join('');
    }

    /** "Drift · Major" with the warning icon; "Voice · Minor" with the gray info icon (22d, 2). */
    function typeLine(type) {
      const minor = R.severity(type) === 'minor';
      return `<span class="wr-chk-type${minor ? ' is-minor' : ''}">${minor ? INFO(14) : ICON.warn(14)}${TYPE[type]} · ${minor ? 'Minor' : 'Major'}</span>`;
    }

    /** The quote as plain text (it is Markdown, exact for the match), as Compare does. */
    const quoteText = (q) => `“${esc(MD.toPlain(q).replace(/\s+/g, ' ').trim())}”`;

    function keepBtn(f, i) {
      const busy = keeping[cur().id] != null;
      return `<button type="button" class="link-btn wr-chk-keep" data-chk-keep="${i}"${busy ? ' disabled' : ''}>${keeping[cur().id] === i ? 'Keeping…' : 'Keep as is'}</button>`;
    }

    function keepErrHtml(at) {
      const e = keepErr[cur().id];
      return e && e.at === at ? `<p class="wr-chk-note wr-chk-err" role="alert">${ICON.x(16)}<span>${esc(e.text)}</span></p>` : '';
    }

    /**
     * One finding. queue: during Fix major, 'now' (the item open: no quote, no
     * buttons, 22d 7a), 'wait' (Fix off with the queue's reason), 'gone' (muted).
     */
    function findingHtml(f, i, old, queue) {
      // G3 P4: numbers in the message with no source, with the step 05 badge.
      const nums = Array.isArray(f.unsourced) ? f.unsourced : [];
      const badge = nums.length ? `<span class="check-badge warn">${ICON.warn()}Verify: no source for ${esc(nums.join(', '))}</span>` : '';
      const head = `${typeLine(f.type)}<p class="wr-chk-msg">${esc(f.message)}</p>${badge}`;
      const cls = `wr-chk-find${old || queue === 'gone' ? ' is-old' : ''}${queue === 'now' ? ' is-now' : ''}`;
      if (queue === 'now') return `<div class="${cls}" data-chk-finding="${i}"><span class="wr-chk-now">Fixing now</span>${head}</div>`;
      if (!f.quote) {
        // An objective gap (decision 1): nothing to select, no Fix; Keep as is for this check only (22d, 11).
        return `<div class="${cls}" data-chk-finding="${i}">${head}<span class="wr-chk-gap">Missing from the text</span>
          <p class="wr-chk-note">${INFO(16)}<span>Nothing to select. Add this part yourself.</span></p>
          <div class="wr-chk-facts">${keepBtn(f, i)}</div>${keepErrHtml(i)}</div>`;
      }
      const gone = cur().text.indexOf(f.quote) < 0;
      const off = gone || queue === 'gone' ? 'This text is no longer in the section.' : queue ? 'Finish or stop Fix major first.' : host.imp().offText();
      const noteId = `wrChkFix${i}`;
      const quote = queue ? '' : `<p class="wr-chk-quote">${quoteText(f.quote)}</p>`;
      const pressed = !off && !!fixing && fixing.sid === cur().id && fixing.i === i && host.imp().fixMenuOpen();
      return `<div class="${cls}" data-chk-finding="${i}">${head}${quote}
        <div class="wr-chk-facts"><button type="button" class="btn btn-secondary btn-sm wr-chk-fix${pressed ? ' is-pressed' : ''}" data-chk-fix="${i}" aria-label="Fix with AI: ${f.type}" aria-expanded="${pressed}"${off ? ` disabled aria-describedby="${noteId}"` : ''}>${SPARKLE()}Fix</button>${keepBtn(f, i)}</div>
        ${off ? `<p class="wr-chk-note" id="${noteId}">${INFO(16)}<span>${esc(off)}</span></p>` : ''}${keepErrHtml(i)}</div>`;
    }

    /** A fold row: "2 minor (voice) · Show", "1 kept · Show" (22d, 1 to 3b). */
    function foldHtml(key, text, ico) {
      const open = fold()[key];
      return `<div class="wr-chk-fold">${ico}<span class="wr-chk-fold-text">${esc(text)}</span>
        <button type="button" class="wr-chk-link" data-chk-fold="${key}" aria-expanded="${open}"><span class="lbl">${open ? 'Hide' : 'Show'}</span></button></div>`;
    }

    /** "Kept today", "Kept yesterday", "Kept on Oct 12". */
    function keptWhen(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return 'Kept';
      const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const days = Math.round((day(new Date()) - day(d)) / 86400e3);
      if (days <= 0) return 'Kept today';
      if (days === 1) return 'Kept yesterday';
      return `Kept on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }

    function keptHtml(v) {
      const list = v.kept;
      const s = kept[cur().id];
      if (s && s.state === 'error') {
        return `<div class="alert alert-error wr-chk-alert" role="alert">${ICON.x(16)}<div><p class="alert-text"><strong>We couldn’t load the kept findings.</strong> They show as open for now.</p>
          <div class="wr-chk-acts"><button type="button" class="btn btn-secondary btn-sm" data-chk-kept-reload>Try again</button></div></div></div>`;
      }
      if (!list.length) return '';
      const parts = [foldHtml('kept', `${fmt(list.length)} kept`, `<span class="wr-chk-ico">${EYE_OFF(16)}</span>`)];
      if (fold().kept) {
        const onlyGaps = list.every((k) => !k.quote);
        const busy = keeping[cur().id] != null;
        const items = list.map((k) => `<div class="wr-chk-kept-item" data-chk-kept="${esc(k.id)}">${typeLine(k.type)}<p class="wr-chk-msg">${esc(k.message)}</p>
            ${k.quote ? `<p class="wr-chk-quote">${quoteText(k.quote)}</p>` : '<span class="wr-chk-gap">Missing from the text</span>'}
            <div class="wr-chk-kept-row"><span class="wr-chk-help">${k.quote ? keptWhen(k.created_at) : 'For this check only'}</span>
              <button type="button" class="wr-chk-link" data-chk-undo="${esc(k.id)}" aria-label="Undo keep: ${k.type}"${busy ? ' disabled' : ''}><span class="lbl">Undo</span></button></div>${keepErrHtml(k.id)}</div>`).join('');
        parts.push(`<div class="wr-chk-kept" role="group" aria-labelledby="wrChkKeptH"><span class="chip-label" id="wrChkKeptH">${onlyGaps ? 'KEPT' : 'KEPT: HIDDEN ON LATER CHECKS'}</span>${items}</div>`);
      }
      return parts.join('');
    }

    /** The pass rows, unclear and skipped (owner, G5 STOP 1: a type quiet only by Keep shows its pass row). */
    function areaHtml(r, v) {
      const parts = [];
      if (v.noneOpen) parts.push(`<div class="wr-crow" data-chk-area="none">${icon.ok()}<div class="wr-crow-body"><span class="wr-crow-text">No open AI findings</span></div></div>`);
      for (const t of R.TYPES) {
        const a = r.areas && r.areas[t];
        if (v.pass.includes(t)) { if (!v.noneOpen) parts.push(`<div class="wr-crow" data-chk-area="${t}">${icon.ok()}<div class="wr-crow-body"><span class="wr-crow-text">${PASS[t]}</span></div></div>`); }
        else if (a === 'unclear') parts.push(`<div class="wr-crow" data-chk-area="${t}">${icon.info()}<div class="wr-crow-body"><span class="wr-crow-text">${TYPE[t]}: the AI could not point to the text.</span><span class="wr-crow-sub">Check again.</span></div></div>`);
        else if (a === 'skipped') {
          parts.push(`<div class="wr-crow" data-chk-area="${t}">${icon.info()}<div class="wr-crow-body"><span class="wr-crow-text">Voice not checked</span>
            <span class="wr-crow-sub">No voice set for this pen name. <a href="pen-name.html?id=${encodeURIComponent((one(book().pen_names) || {}).id || '')}">Add one in Pen Names</a> to check it.</span></div></div>`);
        }
      }
      return parts.join('');
    }

    /** The findings, folds, kept list and help line of a saved check (22d, 1 to 4, 9, 11, 12). */
    function findingsHtml(r, v) {
      const parts = [];
      const nMinor = v.minor.length;
      if (v.old) {
        // Out of date (22d, 9; owner G5 STOP 1): the first major shows, the rest fold into one row.
        const [first, ...rest] = v.major;
        const extra = first ? rest : [];
        if (first) parts.push(findingHtml(first.f, first.i, true));
        parts.push(areaHtml(r, v));
        const words = [extra.length ? `${fmt(extra.length)} more major` : '', nMinor ? `${fmt(nMinor)} minor (voice)` : ''].filter(Boolean).join(', ');
        if (words) {
          parts.push(foldHtml('minor', words, `<span class="wr-chk-ico">${INFO(16)}</span>`));
          if (fold().minor) extra.concat(v.minor).forEach((x) => parts.push(findingHtml(x.f, x.i, true)));
        }
      } else {
        v.major.forEach((x) => parts.push(findingHtml(x.f, x.i, false)));
        parts.push(areaHtml(r, v));
        if (nMinor) {
          parts.push(foldHtml('minor', `${fmt(nMinor)} minor (voice)`, `<span class="wr-chk-ico">${INFO(16)}</span>`));
          if (fold().minor) v.minor.forEach((x) => parts.push(findingHtml(x.f, x.i, false)));
        }
      }
      parts.push(keptHtml(v));
      return parts.join('');
    }

    /** During Fix major (22d, 7a and 8): the items not yet done, the open one marked. */
    function queueFindingsHtml(r, q) {
      const parts = [];
      for (const it of q.items) {
        const f = r.findings[it.i];
        if (!f || it.status === 'accepted' || R.keptOf(f, keptRows(), r.checked_at)) continue;
        const state = it.status === 'now' || it.status === 'failed' ? 'now' : it.status === 'skipped' && it.skip === 'gone' ? 'gone' : 'wait';
        parts.push(findingHtml(f, it.i, false, state));
      }
      return parts.join('');
    }

    /** The group head: the heading, the AI tag, and "Fix major (N)" or the queue's status (22d, 6 and 7a). */
    function aiHead(r, v) {
      const c = cur();
      const q = queueNow();
      let right = '';
      let below = '';
      if (q) {
        right = `<span class="wr-chk-busy" role="status">Fixing ${q.k + 1} of ${q.items.length}</span>`;
      } else if (r && !running[c.id] && !v.old) {
        const n = R.fixMajor(r, keptRows(), c.text, false).length;
        if (n >= R.QUEUE_MIN) {
          const off = host.imp().offText();
          right = `<button type="button" class="btn btn-secondary btn-sm wr-chk-fixmajor" data-chk-fixmajor aria-describedby="wrChkCost${off ? ' wrChkFixWhy' : ''}"${off ? ' disabled' : ''}>${SPARKLE()}Fix major (${n})</button>`;
          below = `<div class="wr-chk-cost" id="wrChkCost">${INFO(16)}<span>Up to ${fmt(n)} AI calls, about $0.01 to $0.02 each.</span></div>
            ${off ? `<p class="wr-chk-why" id="wrChkFixWhy">${INFO(16)}<span>${esc(off)}</span></p>` : ''}`;
        }
      }
      return `<div class="wr-chk-head"><span class="wr-chk-gh"><h3 class="chip-label wr-chk-h" id="wrChkAi">AI CHECK</h3><span class="wr-chk-ai">AI</span></span>${right}</div>${below}`;
    }

    function aiHtml() {
      const c = cur();
      const s = saved[c.id];
      const r = row();
      const [why, whyText] = aiWhy();
      const parts = [];
      const err = failed[c.id];
      const v = r ? viewNow(r) : null;
      const head = aiHead(r, v || { old: true });
      if (s && s.state === 'loading' && !s.row && !running[c.id]) {
        return `${head}<div class="skel skel-line" aria-hidden="true"></div><div class="skel skel-line skel-w40" aria-hidden="true"></div><p class="sr-only" role="status">Loading the last AI check…</p>`;
      }
      parts.push(head);
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
      // Fix major runs (22d, 7a and 8): the queue's items only; Out of date waits for the end.
      const q = queueNow();
      if (q) {
        parts.push(queueFindingsHtml(r, q));
        return parts.join('');
      }
      const old = v.old;
      const ver = (c.versions || []).find((x) => x.id === r.version_id);
      const when = host.relTime(r.checked_at);
      if (old) {
        parts.push(`<div class="alert alert-warning wr-chk-alert">${CLOCK(16)}<div><p class="alert-text"><strong>Out of date.</strong> The text, the chapter, the positioning or the voice changed since this check.</p>
          ${why ? '' : '<div class="wr-chk-acts"><button type="button" class="btn btn-secondary btn-sm" data-chk-run>Check again</button></div>'}</div></div>`);
        parts.push(`<div class="wr-chk-meta"><span>AI check${ver ? ` of v${ver.version_no}` : ''} · ${esc(when)}</span></div>`);
      } else {
        parts.push(`<div class="wr-chk-meta"><span>AI check${ver ? ` of v${ver.version_no}` : ''} · ${esc(when)}</span>${why ? '' : '<button type="button" class="wr-chk-link" data-chk-run>Check again</button>'}</div>`);
      }
      if (why && why !== 'checking') parts.push(`<p class="wr-chk-why">${why === 'positioning' ? LOCK(16) : INFO(16)}<span>${esc(whyText)}</span></p>`);
      parts.push(findingsHtml(r, v));
      parts.push(HELP);
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
        <section class="wr-chk-group" aria-labelledby="wrChkAi">${aiHtml()}</section>
      </div>`;
    }

    return { panelHtml, count, open, onInput, loadResearch, run, refresh, handleClick, aiWhy };
  }

  window.kdpWriteChecks = { create };
})();
