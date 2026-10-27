/* ═══════════════════════════════════════════════════
   KDP Lab — Step 06 Write: Generate section (E10.2, design 23)
   /js/write-generate.js   (used by js/book-write.js, loaded before it;
                            tested by tests/browser/write/t-generate.js and t-gen-ends.js)

   Typed text is saved as a version first, then the server writes the section
   (or the rest of it) and streams the text. The editor is read only while it
   writes. The server saves the result: a full run is the new current
   version; Stop, a lost connection or a failure keeps the text so far as a
   partial version in Versions, which the writer can keep (a restore) or
   leave there. At or past the section's word target, Generate asks first
   (rule B). A run in another tab turns Generate off here. Moved out of
   book-write.js in G2 (P16), no change in behaviour.

   const G = kdpWriteGenerate.create(host)   host: see book-write.js
   G.render() · G.renderStream() · G.block() (why Generate is off, or '')
   G.busy() (saving, writing or stopping) · G.busyOn(id) · G.on(id) (a run or
   a result card for that section) · G.keptOn(id) (a failed save keeps the
   streamed text) · G.dropOther(id) · G.loadRun() · G.handleClick(target)
   G.leave() (Stop and leave while it writes; resolves false to stay)

   Generate chapter (E12 fix batch 2, design 23b, the button in the head): the
   open chapter's sections with no text, one Generate section at a time, in
   order. A confirm with the cost line first (kdpUsage.chapterEstimate); the
   open section follows the queue; Stop ends the section being written (its
   text so far is saved in Versions, as today) and cancels the rest. A
   section with text is skipped; "Generate the rest" writes again a section
   whose partial text was not kept. G.chapterButton() is the head's button.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const MD = kdpMarkdown;
  const W = kdpWords;

  const STOP_WAIT_MS = 10000;          // Stop: wait this long for "saved", then read the run row
  const LOST_POLL_MS = 1000;           // a lost stream: read the run row every second…
  const LOST_POLL_TRIES = 15;          // …for at most 15 s
  const INFO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
  const LAYERS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>';
  const SPARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>';
  const listWords = (items) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const str = (v) => (typeof v === 'string' ? v : '');

  function create(host) {
    /**
     * One run at a time:
     * { id, label, phase: 'saving' | 'writing' | 'stopping' | 'ended', runId, aim, target,
     *   text, done, saved, serverError, abort, recovered, outcome }.
     * outcome (phase 'ended'): what the card under the head shows until it is closed.
     */
    let gen = null;
    /**
     * Generate chapter (design 23b): { chapterId, num, title, items, k, state, stop, error }.
     * items: [{ id, n ("7.2"), title, target, status, words, versionNo }]; status:
     * 'wait' | 'now' | 'done' | 'stopped' | 'failed' | 'unsent' | 'unwritten'.
     * state: 'run' | 'done' | 'stopped' | 'failed' | 'limit'. Kept for the end card until Close.
     */
    let chap = null;
    let dlg = null;
    const chapRunning = () => !!chap && chap.state === 'run';
    const cur = () => host.cur();
    const els = () => host.els();
    const book = () => host.book();
    const genBusy = () => !!gen && gen.phase !== 'ended';

    const runFresh = (r) => r.state === 'running'
      && Date.now() - Date.parse(r.heartbeat_at) < host.runFresh.heartbeatMs
      && Date.now() - Date.parse(r.started_at) < host.runFresh.startedMs;

    /** The section's last run: a fresh one from another tab turns Generate off here. */
    async function loadRun() {
      if (!cur() || cur().state !== 'ready') return;
      const id = cur().id;
      let res;
      try { res = await kdp.getSectionRun(id); } catch (err) { return; }
      if (!cur() || cur().id !== id || res.error) return;
      const r = res.data;
      const mine = !!(gen && gen.runId && r && r.run_id === gen.runId);
      cur().otherRun = !!r && !mine && runFresh(r);
      if (host.active()) { host.renderHead(); renderGen(); host.imp().refresh(); }
    }

    /** Why Generate is off for the open section, or '' when it can run. */
    function genBlock(fromChapter) {
      if (!cur() || cur().state !== 'ready') return 'loading';
      if (genBusy() || (chapRunning() && !fromChapter)) return 'busy';
      if (host.imp().busy()) return 'improve';   // decision 8
      if (cur().conflict) return 'conflict';
      if (cur().busy || cur().saving) return 'busy';
      if (!host.posLocked()) return 'positioning';
      if (cur().otherRun) return 'other_tab';
      return '';
    }

    /** Section words and target, for rule B and the progress line. */
    function targetOf() {
      const hit = cur() && host.findSection(cur().id);
      return hit && hit.s.word_target > 0 ? hit.s.word_target : null;
    }

    /**
     * Generate section. more: the writer said "Write more anyway" (rule B).
     * Typed text becomes a version first (0019 rules), so the server writes
     * from what is on screen and nothing typed is lost.
     */
    async function generate(more, fromChapter) {
      if (genBlock(fromChapter)) return;
      const id = cur().id;
      const hit = host.findSection(id);
      const target = targetOf();
      const have = W.count(cur().text);
      if (!more && target && have >= target) {
        if (await confirmMore(have, target)) generate(true);
        return;
      }
      gen = { id, label: hit ? host.sectionLabel(hit.c, hit.s) : '', phase: 'saving', runId: null, aim: null, target, text: '', done: null, saved: null, serverError: null, abort: null, recovered: null, outcome: null, stopTimer: null };
      host.clearIdle();
      renderGenShell();
      host.announce('Saving your text first.');
      const ok = await host.makeVersion('generate');
      if (!gen || gen.id !== id) return;
      if (!ok || !cur() || cur().id !== id || cur().conflict || (host.note() && host.note().retry === 'version')) {
        // The save failed or another tab saved: its own message shows; nothing is sent.
        gen = null;
        if (host.active()) renderGenShell();
        return;
      }
      gen.phase = 'writing';
      gen.abort = new AbortController();
      renderGenShell();
      host.announce(`Writing ${gen.label}.`);
      const input = { stage: 'section_write', bookId: book().id, sectionId: id, baseVersionId: cur().base || null };
      if (more) input.more = true;
      let res;
      try {
        res = await kdp.generateStream(input, { onEvent: onGenEvent, signal: gen.abort.signal });
      } catch (err) {
        res = { error: { code: 'network', streamed: false } };
      }
      if (!gen || gen.id !== id) return;
      clearTimeout(gen.stopTimer);
      await endGen(res);
    }

    function onGenEvent(e) {
      if (!gen || gen.phase === 'ended') return;
      const d = e.data || {};
      if (e.event === 'start') {
        gen.runId = d.runId || null;
        gen.aim = Number.isInteger(d.aim) ? d.aim : null;
        gen.target = Number.isInteger(d.target) ? d.target : gen.target;
        gen.recovered = d.recovered && Number.isInteger(d.recovered.versionNo) ? d.recovered.versionNo : null;
        renderGen();
      } else if (e.event === 'text' && typeof d.t === 'string') {
        // Stopping: no more text is shown (the server keeps what it had).
        if (gen.phase !== 'writing') return;
        gen.text += d.t;
        renderStream();
      } else if (e.event === 'done') gen.done = d;
      else if (e.event === 'saved') gen.saved = d;
      else if (e.event === 'error') gen.serverError = typeof d.error === 'string' ? d.error : 'server_error';
    }

    /** Stop: ask the server (not an AI call); it saves the text so far. */
    async function stopGen() {
      if (!gen || gen.phase !== 'writing') return;
      gen.phase = 'stopping';
      renderGen();
      renderStream();
      host.announce('Stopping and saving.');
      const g = gen;
      // No "saved" in time: close the stream (the server treats it like Stop) and read the run row.
      g.stopTimer = setTimeout(() => { if (g.abort) g.abort.abort(); }, STOP_WAIT_MS);
      if (!g.runId) { g.abort.abort(); return; }
      let res;
      try { res = await kdp.requestSectionStop(g.runId); } catch (err) { res = { error: err }; }
      if (res.error && g.abort) g.abort.abort();
    }

    /** After the stream: what happened, from the server's events (or the run row when the stream was lost). */
    async function endGen(res) {
      const g = gen;
      const id = g.id;
      if (!g.runId && res.error && res.error.code === 'aborted') {
        // Stopped before the server said which run this is: it may have started, and it saves
        // whatever it wrote. Without the run id the row can't be told from an older run's.
        g.phase = 'ended';
        g.outcome = { kind: 'lost_unknown' };
        return afterRun(g);
      }
      if (res.error && !res.error.streamed && !g.runId) {
        // Refused before any AI call: nothing was written or counted.
        g.phase = 'ended';
        return refused(res.error);
      }
      if (!g.saved && !g.serverError) {
        // The stream broke or was closed. The run goes on on the server: read its row.
        g.phase = 'stopping';
        renderGen();
        const run = g.runId ? await pollRun(id, g.runId) : null;
        if (!gen || gen !== g) return;
        g.phase = 'ended';
        if (run && run.state === 'ended') {
          const counted = run.end_reason === 'user_stop' || run.end_reason === 'disconnect';
          g.outcome = { kind: run.version_id ? 'lost_saved' : 'lost_none', counted, reason: run.end_reason };
          if (run.version_id && run.end_reason === 'complete') g.outcome.kind = 'lost_complete';
        } else g.outcome = { kind: 'lost_unknown' };
        return afterRun(g);
      }
      g.phase = 'ended';
      if (g.serverError) {
        g.outcome = { kind: g.serverError === 'save_failed' ? 'save_failed' : 'interrupted' };
        return afterRun(g);
      }
      const done = g.done || { reason: 'ai_error' };
      const sv = g.saved;
      const words = Number.isInteger(sv.words) ? sv.words : W.count(g.text);
      if (sv.capped) {
        g.outcome = { kind: 'capped', versionId: sv.versionId, versionNo: sv.versionNo };
      } else if (done.reason === 'complete') {
        g.outcome = sv.conflict || !sv.current
          ? { kind: 'conflict', versionNo: sv.versionNo }
          : { kind: 'done', versionNo: sv.versionNo, flagged: sv.flagged || 0 };
      } else if (done.reason === 'user_stop' || done.reason === 'disconnect') {
        g.outcome = { kind: 'stopped', versionId: sv.versionId, versionNo: sv.versionNo, words };
      } else {
        g.outcome = { kind: 'failed', reason: done.reason, versionId: sv.versionId, versionNo: sv.versionNo, words };
      }
      return afterRun(g);
    }

    /** Reads the run row until it has ended (the server saves after a lost stream). */
    async function pollRun(id, runId) {
      for (let i = 0; i < LOST_POLL_TRIES; i++) {
        await new Promise((r) => setTimeout(r, LOST_POLL_MS));
        let res;
        try { res = await kdp.getSectionRun(id); } catch (err) { continue; }
        if (res.error || !res.data) continue;
        if (res.data.run_id !== runId) return null;
        if (res.data.state === 'ended') return res.data;
      }
      return null;
    }

    /** The section after a run: the new current text when there is one, the versions, the card. */
    async function afterRun(g) {
      const id = g.id;
      const o = g.outcome;
      const hit = host.findSection(id);
      const newCurrent = o.kind === 'done' || o.kind === 'lost_complete';
      if (newCurrent && hit && hit.s.status === 'not_started') hit.s.status = 'draft';
      // Writing only when the server saved a version (a partial only counts once kept: 0020).
      if (newCurrent && hit) Object.assign(hit.s, { has_writing: true });
      if (!cur() || cur().id !== id) { gen = null; return; }
      if (newCurrent) {
        await host.openSection(id, { keepNote: true });
        if (!gen || gen !== g) return;
      } else {
        host.loadVersions();
      }
      host.refresh();
      if (host.active()) { host.renderManuscript(); host.renderMainShell(); host.renderSide(); }
      host.announce(outcomeText(o).replace(/<[^>]+>/g, ''));
      const focus = els() && els().main.querySelector('[data-gen] [data-gen-focus]');
      if (focus) focus.focus();
    }

    /** A refusal before the stream: a message (and the right next step). */
    async function refused(err) {
      const code = err.code;
      const id = gen.id;
      if (code === 'target_reached') {
        gen = null;
        renderGenShell();
        if (await confirmMore(err.words || 0, err.target || targetOf() || 0)) generate(true);
        return;
      }
      if (code === 'version_conflict') { gen = null; renderGenShell(); await host.adoptRemote(id, null); return; }
      if (code === 'run_in_progress') { gen = null; if (cur() && cur().id === id) cur().otherRun = true; renderGenShell(); return; }
      if (code === 'not_found') { gen = null; host.loadOutline(true); return; }
      if (code === 'unsaved_draft') { gen = null; await host.openSection(id, { keepNote: true }); host.setNote({ kind: 'warning', text: 'This section has typing that is not saved as a version yet, maybe from another tab. Save it as a version, then generate.' }); return; }
      gen.outcome = { kind: 'refused', code };
      renderGenShell();
      host.announce(outcomeText(gen.outcome).replace(/<[^>]+>/g, ''));
    }

    /** Keep partial text: a restore of the partial version (0018, label "Kept partial text from vN"). */
    async function keepPartial() {
      if (!gen || !gen.outcome || !gen.outcome.versionId || !cur() || cur().id !== gen.id) return;
      const o = gen.outcome;
      o.busy = true;
      renderGen();
      let res;
      try { res = await kdp.restoreVersion(cur().id, o.versionId, cur().base); } catch (err) { res = { error: err }; }
      if (!cur() || !gen || gen.outcome !== o) return;
      o.busy = false;
      if (res.error) {
        if (res.error.message === 'version_conflict') { gen = null; await host.adoptRemote(cur().id, null); return; }
        o.error = 'We couldn’t keep the partial text. It is still in Versions.';
        renderGen();
        return;
      }
      gen = null;
      const hit = host.findSection(cur().id);
      if (hit && hit.s.status === 'not_started') hit.s.status = 'draft';
      await host.openSection(cur().id, { keepNote: true });
      host.announce(`Kept the partial text from v${o.versionNo}. It is now version ${res.data.version_no}.`);
    }

    /** Discard: nothing is written. The partial stays in Versions. */
    function discardPartial() {
      gen = null;
      renderGenShell();
      host.announce('The partial text stays in Versions. Your section did not change.');
      const b = els() && els().main.querySelector('[data-generate]');
      if (b && !b.disabled) b.focus();
    }

    async function copyGenText() {
      if (!gen) return;
      const box = els() && els().main.querySelector('[data-stream]');
      let ok = false;
      try { await navigator.clipboard.writeText(gen.text); ok = true; } catch (err) {
        // No clipboard permission: select the text so the writer can copy it.
        if (box) { const r = document.createRange(); r.selectNodeContents(box); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      }
      host.announce(ok ? 'The text is copied.' : 'The text is selected. Press Ctrl+C to copy it.');
    }

    /** Rule B (owner, E10.2): at or past the target, ask before writing more. */
    const confirmMore = (have, target) => host.confirm({
      title: 'Write more anyway?',
      text: `This section has ${fmt(have)} of ${fmt(target)} words. Write more anyway?`,
      ok: 'Write more', cancel: 'Cancel'
    });

    /** The card's text for an outcome (HTML; the numbers come from the server). */
    function outcomeText(o) {
      const v = (n) => (Number.isInteger(n) ? `v${n}` : 'a new version');
      const w = (n) => `${fmt(n)} word${n === 1 ? '' : 's'}`;
      const are = (n) => (n === 1 ? 'is' : 'are');
      switch (o.kind) {
        case 'done': return o.flagged
          ? `Saved as ${v(o.versionNo)}. ${o.flagged === 1 ? '1 claim needs' : `${o.flagged} claims need`} a source. Check the marked sentences.`
          : `Saved as ${v(o.versionNo)}.`;
        case 'capped': return 'This section reached its length limit. The text is saved in Versions.';
        case 'conflict': return `This section was saved in another tab while the AI was writing. The new text is saved in Versions as ${v(o.versionNo)}.`;
        case 'stopped': return o.versionId
          ? `Writing stopped. The ${w(o.words)} written so far ${are(o.words)} saved in Versions as ${v(o.versionNo)}. They are not in your section yet. The tokens used so far count toward your usage.`
          : 'Writing stopped before any text. Nothing was saved. The tokens used so far count toward your usage.';
        case 'failed': return o.versionId
          ? `Your text and versions are safe. This attempt was not counted in your usage. The ${w(o.words)} written so far ${are(o.words)} saved in Versions as ${v(o.versionNo)}.`
          : 'Your text and versions are safe. This attempt was not counted in your usage. Nothing was written.';
        case 'save_failed': return 'We couldn’t save the new text. Nothing was counted. The text is below. Copy it if you want to keep it.';
        case 'interrupted': return 'Writing was interrupted on the server. The text so far is saved in Versions.';
        case 'lost_complete': return 'The connection was lost, but the AI finished. The new text is your current version.';
        case 'lost_saved': return `The connection was lost. The text written so far is saved in Versions.${o.counted ? ' The tokens used so far count toward your usage.' : ' This attempt was not counted.'}`;
        case 'lost_none': return 'The connection was lost before any text. Nothing was saved.';
        case 'lost_unknown': return 'The connection was lost. Anything the AI wrote will be in Versions in a minute. Check again soon.';
        case 'refused': return refusedText(o.code);
        default: return '';
      }
    }

    function refusedText(code) {
      switch (code) {
        case 'positioning_not_locked': return 'Lock the positioning in 03 to generate.';
        case 'outline_not_approved': return 'Approve the outline in 05 to generate.';
        case 'not_enough_facts': return 'The Brief needs a topic before the AI can write. Fill it in 01 Brief.';
        case 'section_too_long': return `This section is close to the ${fmt(host.maxChars)} character limit. Shorten it or split it before you generate more.`;
        case 'unauthorized': return 'Your session ended. Sign in again, then try again.';
        case 'ai_unavailable': return 'The AI service did not answer. This try was not counted. Try again in a moment.';
        default: return kdpUi.aiMessage(code)[1];
      }
    }

    /** The failure line of design 23. */
    function failLine(reason) {
      switch (reason) {
        case 'timeout': return 'The AI service did not respond in time.';
        case 'max_tokens': return 'The AI reached the most it can write in one go.';
        case 'too_long': return 'The section reached its length limit.';
        case 'refusal': return 'The AI declined to write this section.';
        default: return 'The AI service stopped.';
      }
    }

    /** The Generate slot: the running panel (design 23 Generating), a result card, or why Generate is off. */
    function renderGen() {
      const box = els() && els().main.querySelector('[data-gen]');
      if (!box || !cur()) return;
      const here = chap && host.findSection(cur().id);
      if (here && here.c.id === chap.chapterId) {
        // A redraw (a run row read, the head) keeps the focus on the card's button.
        const a = document.activeElement;
        const keep = a && box.contains(a) ? ['data-chap-close', 'data-chap-rest', 'data-chap-retry', 'data-chap-stop'].find((x) => a.hasAttribute(x)) : null;
        box.innerHTML = chapterHtml();
        const b = keep && box.querySelector(`[${keep}]`);
        if (b && !b.disabled) b.focus();
        return;
      }
      const mine = gen && gen.id === cur().id;
      if (mine && gen.phase !== 'ended') { box.innerHTML = runningHtml(); return; }
      if (mine && gen.outcome) { box.innerHTML = outcomeHtml(gen.outcome); return; }
      const why = genBlock();
      if (why === 'positioning') box.innerHTML = `<p class="help-note wr-note">${INFO}<span>Generate section needs the positioning locked. <a href="?id=${encodeURIComponent(book().id)}&step=3" data-go-step="3">Lock it in 03</a>.</span></p>`;
      else if (why === 'other_tab') box.innerHTML = `<p class="help-note wr-note" role="status">${INFO}<span>This section is being written in another tab or window. <button type="button" class="link-btn" data-run-check>Check again</button></span></p>`;
      else box.innerHTML = '';
    }

    function runningHtml() {
      const n = W.count(gen.text);
      const goal = gen.aim;
      const pct = goal ? Math.min(100, Math.round((n / goal) * 100)) : 0;
      const stopping = gen.phase === 'stopping';
      const title = gen.phase === 'saving' ? 'Saving your text first…' : stopping ? 'Stopping and saving…' : `Writing ${esc(gen.label)}`;
      const count = goal ? `≈ ${fmt(n)} / ${fmt(goal)} words` : `≈ ${fmt(n)} words`;
      return `<section class="wr-gen" aria-labelledby="wrGenTitle">
          <div class="chip-label">GENERATING</div>
          <h3 id="wrGenTitle">${title}</h3>
          ${gen.recovered ? `<p class="wr-gen-meta">Text from an earlier try that stopped is saved in Versions as v${gen.recovered}.</p>` : ''}
          <div class="wr-gen-row">
            ${goal ? `<span class="wr-bar wr-gen-bar" aria-hidden="true"><span style="width: ${pct}%"></span></span>` : ''}
            <span class="wr-gen-count" data-gen-count>${count}</span>
          </div>
          ${gen.phase === 'saving' ? '' : `<button type="button" class="btn btn-secondary wr-gen-stop" data-gen-stop${stopping ? ' disabled' : ''}>${stopping ? 'Stopping…' : 'Stop'}</button>`}
        </section>`;
    }

    function outcomeHtml(o) {
      const text = outcomeText(o);
      const close = '<button type="button" class="link-btn" data-gen-close data-gen-focus>Close</button>';
      if (o.kind === 'done') {
        if (!o.flagged) return '';
        return `<div class="alert alert-warning wr-note" role="status">${ICON.warn(16)}<div><p class="alert-text">${text}</p><p class="alert-text">${close}</p></div></div>`;
      }
      if (o.kind === 'stopped' && o.versionId) {
        return `<div class="wr-out" role="status"><p>${text}</p>
            ${o.error ? `<p class="wr-out-err">${ICON.warn(14)}${esc(o.error)}</p>` : ''}
            <div class="wr-note-actions">
              <button type="button" class="btn btn-primary btn-sm" data-gen-keep data-gen-focus${o.busy ? ' disabled' : ''}>Keep partial text</button>
              <button type="button" class="btn btn-secondary btn-sm" data-gen-discard${o.busy ? ' disabled' : ''}>Discard</button>
            </div></div>`;
      }
      if (o.kind === 'failed') {
        return `<section class="wr-out" aria-labelledby="wrFailTitle">
            <div class="chip-label wr-out-label">${ICON.x(12)}FAILED</div>
            <h3 id="wrFailTitle">Generation stopped</h3>
            <div class="alert alert-error" role="alert">${ICON.x(16)}<p class="alert-text"><strong>${esc(failLine(o.reason))}</strong> ${text}</p></div>
            ${o.error ? `<p class="wr-out-err">${ICON.warn(14)}${esc(o.error)}</p>` : ''}
            <div class="wr-note-actions">
              <button type="button" class="btn btn-primary btn-sm" data-gen-retry data-gen-focus${genBlock() ? ' disabled' : ''}>Try again</button>
              ${o.versionId ? `<button type="button" class="btn btn-secondary btn-sm" data-gen-keep${o.busy ? ' disabled' : ''}>Keep partial text</button>
              <button type="button" class="link-btn" data-gen-discard>Discard</button>` : ''}
            </div></section>`;
      }
      if (o.kind === 'save_failed') {
        return `<div class="alert alert-error wr-note" role="alert">${ICON.warn(16)}<div><p class="alert-text">${text}</p>
            <div class="wr-note-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-gen-copy data-gen-focus>Copy text</button>
              <button type="button" class="btn btn-secondary btn-sm" data-gen-retry${genBlock() ? ' disabled' : ''}>Try again</button>
              <button type="button" class="link-btn" data-gen-close>Close</button>
            </div></div></div>`;
      }
      const warn = o.kind === 'refused' && !['positioning_not_locked', 'outline_not_approved', 'not_enough_facts', 'section_too_long'].includes(o.code);
      const retry = o.kind === 'refused' ? (warn && !['monthly_limit', 'unauthorized'].includes(o.code)) : !['lost_complete', 'capped'].includes(o.kind);
      const cls = o.kind === 'refused' && !warn ? 'alert-warning' : (o.kind === 'conflict' || o.kind === 'capped' || o.kind === 'stopped' || o.kind.startsWith('lost') || o.kind === 'interrupted') ? 'alert-warning' : 'alert-error';
      return `<div class="alert ${cls} wr-note" role="${cls === 'alert-error' ? 'alert' : 'status'}">${ICON.warn(16)}<div><p class="alert-text">${text}</p>
          <p class="alert-text">${retry ? `<button type="button" class="link-btn" data-gen-retry${genBlock() ? ' disabled' : ''}>Try again</button> · ` : ''}${close}</p></div></div>`;
    }

    /** The streamed text under the section's text, with a cursor (read only). Kept after a failed save. */
    function renderStream() {
      const box = els() && els().main.querySelector('[data-stream]');
      if (!box || !cur()) return;
      const mine = gen && gen.id === cur().id;
      const show = mine && (gen.phase === 'writing' || gen.phase === 'stopping' || (gen.outcome && gen.outcome.kind === 'save_failed'));
      box.hidden = !show || (!gen.text && gen.phase !== 'writing');
      if (box.hidden) { box.innerHTML = ''; return; }
      // Follow the new text while the writer is at the bottom; never pull them back when they scrolled up.
      const card = box.closest('.wr-card');
      const follow = !!card && card.scrollHeight - card.scrollTop - card.clientHeight < 80;
      const keptLabel = gen.outcome && gen.outcome.kind === 'save_failed' ? '<div class="chip-label wr-stream-label">NEW TEXT · NOT SAVED</div>' : '';
      box.innerHTML = keptLabel + MD.toHtml(gen.text) + (gen.phase === 'writing' ? '<span class="wr-cursor" aria-hidden="true"></span>' : '');
      if (follow && gen.phase === 'writing') card.scrollTop = card.scrollHeight;
      const count = els().main.querySelector('[data-gen-count]');
      if (count && gen.phase === 'writing') {
        const n = W.count(gen.text);
        count.textContent = gen.aim ? `≈ ${fmt(n)} / ${fmt(gen.aim)} words` : `≈ ${fmt(n)} words`;
        const bar = els().main.querySelector('.wr-gen-bar span');
        if (bar && gen.aim) bar.style.width = `${Math.min(100, Math.round((n / gen.aim) * 100))}%`;
      }
    }

    /** Phase changes: the editor's read-only state, the head, the foot and the panels. */
    function renderGenShell() {
      if (!host.active() || !cur() || cur().state !== 'ready') return;
      host.renderMainShell();
      host.renderSide();
      // Generate chapter: the manuscript list shows which section is being written (23b, 3).
      if (chap) host.renderManuscript();
    }

    /**
     * Leaving the section, the step or the page while the AI writes: ask first.
     * Stop and leave waits for the save (at most STOP_WAIT_MS and the poll).
     */
    async function leave() {
      if (chapRunning()) {
        const it = chap.items[chap.k];
        const rest = chap.items.slice(chap.k + 1).map((x) => x.n);
        const yes = await host.confirm({
          title: 'Stop and leave?',
          text: `The text written so far in ${it.n} is saved in Versions.${rest.length ? ` ${listWords(rest)} ${rest.length === 1 ? 'is' : 'are'} not written.` : ''}`,
          ok: 'Stop and leave', cancel: 'Keep writing'
        });
        if (!yes) return false;
        chap.stop = true;
        if (gen && gen.phase === 'writing') stopGen();
        await new Promise((resolve) => {
          const wait = () => (!chapRunning() ? resolve() : setTimeout(wait, 100));
          wait();
        });
        return true;
      }
      if (!genBusy()) return true;
      if (gen.phase === 'saving') return false;
      const yes = await host.confirm({
        title: 'Writing is in progress',
        text: 'Stop and leave? The text written so far is saved in Versions.',
        ok: 'Stop and leave', cancel: 'Keep writing'
      });
      if (!yes) return false;
      const g = gen;
      if (g.phase === 'writing') stopGen();
      await new Promise((resolve) => {
        const wait = () => (!gen || gen !== g || g.phase === 'ended' ? resolve() : setTimeout(wait, 100));
        wait();
      });
      return true;
    }

    /* ── Generate chapter (E12 fix batch 2, design 23b) ── */

    /** The sections of a chapter with no text yet (owner D8: a section with text is skipped). */
    const emptySections = (c) => (c.sections || []).filter((s) => !(host.sectionWords(s) > 0));
    const sectionNo = (c, s) => `${host.chapterNumber(c)}.${c.sections.indexOf(s) + 1}`;

    const CHAP_WHY = {
      full: 'Every section in this chapter has text.',
      busy: 'Wait for the section to finish writing.',
      queue: 'Finish or stop Fix major first.',
      improve: 'Accept or reject the suggestion first.',
      conflict: 'Choose which text to keep first.',
      positioning: 'Lock the positioning in 03 to generate.',
      outline: 'Approve the outline in 05 to generate.'
    };

    /** Why Generate chapter is off ('' when it can run); 'none': no button (the Introduction or the Conclusion). */
    function chapBlock() {
      const hit = cur() && host.findSection(cur().id);
      if (!hit || hit.c.kind !== 'chapter') return 'none';
      if (chapRunning()) return 'busy';
      const g = genBlock();
      if (g === 'improve') return host.imp().queue && host.imp().queue() ? 'queue' : 'improve';
      if (g === 'conflict' || g === 'positioning') return g;
      if (g) return 'busy';
      if (!book().outline_approved_at) return 'outline';
      if (!emptySections(hit.c).length) return 'full';
      return '';
    }

    /** The head's button and its line (design 23b, 1A), or '' for the Introduction and the Conclusion. */
    function chapterButton() {
      const why = chapBlock();
      if (why === 'none') return '';
      const hit = host.findSection(cur().id);
      const n = emptySections(hit.c).length;
      const line = why ? CHAP_WHY[why] : `Writes the ${n === 1 ? '1 section' : `${fmt(n)} sections`} of this chapter that ${n === 1 ? 'has' : 'have'} no text, in order.`;
      return `<button type="button" class="btn btn-secondary wr-chap-btn" data-gen-chapter aria-describedby="wrChapLine"${why ? ' disabled' : ''}>${LAYERS}Generate chapter</button>
        <p class="wr-chap-line" id="wrChapLine">${why ? INFO : ''}<span>${esc(line)}</span></p>`;   // inside .wr-gen-btns (book-write.js)
    }

    function buildDialog() {
      const d = document.createElement('dialog');
      d.className = 'dialog dialog-sm wr-chap-dlg';
      d.setAttribute('aria-labelledby', 'wrChapDlgTitle');
      d.innerHTML = '<form class="dialog-inner" novalidate data-chap-form></form>';
      document.body.append(d);
      d.addEventListener('click', (e) => {
        if (e.target.closest('[data-chap-cancel]')) d.close();
      });
      d.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const st = dlg.state;
        if (!st || st.busy || (st.est && st.est.none)) return;
        d.close();
        startChapter(st.c, st.items);
      });
      d.addEventListener('close', () => {
        if (chapRunning()) return;
        const b = els() && els().main.querySelector('[data-gen-chapter]');
        if (b && !b.disabled) b.focus();
      });
      dlg = { d, state: null };
    }

    /** The confirm (design 23b, 2 and 2b): the sections, the skipped ones, the cost line. */
    function dialogHtml(st) {
      const c = st.c;
      const rows = c.sections.map((s) => {
        const no = sectionNo(c, s);
        const title = esc(str(s.title).trim() || 'Untitled section');
        if (st.items.some((x) => x.id === s.id)) return `<li><span class="wr-q-n">${no}</span><span class="wr-q-what">${title}</span><span class="wr-q-st">${fmt(s.word_target > 0 ? s.word_target : 500)} words</span></li>`;
        return `<li class="is-skip"><span class="wr-q-n">${no}</span><span class="wr-q-what">${title}<span class="wr-q-sub">Has text, so it is skipped.</span></span><span class="wr-q-st">Skipped</span></li>`;
      }).join('');
      const n = st.items.length;
      let cost;
      if (st.busy) cost = '<span class="wr-imp-spin" aria-hidden="true"></span><span>Working out the cost…</span>';
      else {
        const e = st.est;
        const head = `<strong>${n === 1 ? '1 AI call' : `${fmt(n)} AI calls`}, about ${fmt(e.words)} words.</strong> ${kdpUsage.costText(e.cost)} and ${kdpUsage.tokensText(e.tokens)} tokens.`;
        cost = `${INFO}<span>${head}${e.left !== null && !e.over && !e.none ? ` You have ${kdpUsage.tokensText(e.left)} tokens left this month.` : ''}</span>`;
      }
      const e = st.est;
      const warn = !st.busy && e && e.none
        ? `<div class="alert alert-warning wr-chap-alert" role="alert">${ICON.warn(16)}<p class="alert-text">You have used this month’s AI allowance. It resets on ${esc(e.resets)}.</p></div>`
        : !st.busy && e && e.over
          ? `<div class="alert alert-warning wr-chap-alert" role="alert">${ICON.warn(16)}<p class="alert-text"><strong>This may pass your monthly AI allowance.</strong> You have about ${kdpUsage.tokensText(e.left)} tokens left. Writing stops at the limit, and the sections written so far stay.</p></div>`
          : '';
      const off = st.busy || (e && e.none);
      return `<div class="dialog-head"><h2 id="wrChapDlgTitle">Generate chapter ${host.chapterNumber(c)}?</h2></div>
        <p class="delete-text">The AI writes the empty sections of “${esc(str(c.title).trim() || 'Untitled chapter')}”, one at a time, in order. Each one is saved as a new version. You can stop at any time.</p>
        <ol class="wr-q-list wr-chap-list" aria-label="Sections to write">${rows}</ol>
        <div class="wr-q-cost wr-chap-cost" role="status">${cost}</div>
        ${warn}
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-chap-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary" data-chap-go${off ? ' disabled' : ''}>${SPARK}Generate ${n === 1 ? '1 section' : `${fmt(n)} sections`}</button>
        </div>`;
    }

    async function openChapterDialog() {
      if (chapBlock()) return;
      const hit = host.findSection(cur().id);
      const c = hit.c;
      const items = emptySections(c).map((s) => ({ id: s.id, n: sectionNo(c, s), title: str(s.title).trim() || 'Untitled section', target: s.word_target || 0 }));
      if (!items.length) return;
      if (!dlg) buildDialog();
      const st = { c, items, busy: true, est: null };
      dlg.state = st;
      const form = dlg.d.querySelector('form');
      form.innerHTML = dialogHtml(st);
      dlg.d.showModal();
      const cancel = form.querySelector('[data-chap-cancel]');
      if (cancel) cancel.focus();
      let res;
      try { res = await kdp.getUsageMonth(); } catch (err) { res = { error: err }; }
      if (dlg.state !== st) return;
      st.busy = false;
      // Without this month's usage the estimate uses the default input and says nothing about what is left.
      st.est = kdpUsage.chapterEstimate(res.error ? null : res.data, items.map((x) => x.target));
      form.innerHTML = dialogHtml(st);
      const go = form.querySelector('[data-chap-go]');
      (go && !go.disabled ? go : form.querySelector('[data-chap-cancel]')).focus();
    }

    function startChapter(c, items) {
      chap = { chapterId: c.id, num: host.chapterNumber(c), title: str(c.title).trim(), items: items.map((x) => ({ ...x, status: 'wait', words: 0, versionNo: null })), k: 0, state: 'run', stop: false, error: '' };
      runChapter();
    }

    /** One section after another; each is the existing Generate section call. */
    async function runChapter() {
      const c = chap;
      while (chap === c && c.state === 'run') {
        if (c.k >= c.items.length) { c.state = 'done'; break; }
        const it = c.items[c.k];
        if (c.stop) { c.state = 'stopped'; break; }
        it.status = 'now';
        if (!cur() || cur().id !== it.id) await host.openSection(it.id, { keepNote: true });
        if (chap !== c) return;
        if (!cur() || cur().id !== it.id || cur().state !== 'ready') { it.status = 'failed'; c.state = 'failed'; c.error = 'We couldn’t open this section. Try again.'; break; }
        renderGenShell();
        if (c.stop) { it.status = 'wait'; c.state = 'stopped'; break; }
        await generate(false, true);
        if (chap !== c) return;
        const o = gen && gen.id === it.id ? gen.outcome : null;
        if (o && (o.kind === 'done' || o.kind === 'lost_complete')) {
          it.status = 'done';
          it.words = cur() && cur().id === it.id ? W.count(cur().text) : 0;
          gen = null;
          host.announce(`${it.n} written, ${fmt(it.words)} words.`);
          c.k++;
          continue;
        }
        if (o && (o.kind === 'stopped' || ((o.kind === 'lost_saved' || o.kind === 'lost_none') && c.stop))) {
          it.status = 'stopped';
          it.versionNo = o.versionNo || null;
          it.words = o.words || 0;
          c.error = outcomeText(o);
          c.state = 'stopped';
        } else if (o && o.kind === 'refused' && o.code === 'monthly_limit') {
          it.status = 'unsent';
          c.state = 'limit';
        } else {
          it.status = 'failed';
          c.error = !o ? 'We couldn’t start writing this section. Try again.'
            : o.kind === 'failed' ? `${failLine(o.reason)} ${outcomeText(o)}` : outcomeText(o);
          c.state = c.stop ? 'stopped' : 'failed';
        }
        gen = null;
        break;
      }
      if (chap !== c) return;
      for (const x of c.items) if (x.status === 'wait') x.status = c.state === 'limit' ? 'unsent' : c.state === 'stopped' ? 'unwritten' : 'wait';
      const total = c.items.reduce((a, x) => a + (x.status === 'done' ? x.words : 0), 0);
      host.announce(c.state === 'done' ? `Chapter ${c.num} is written. ${c.items.length === 1 ? '1 section' : `${fmt(c.items.length)} sections`}, ${fmt(total)} words.`
        : c.state === 'limit' ? 'Writing stopped. You have used this month’s AI allowance.' : 'Writing stopped.');
      renderGenShell();
      const f = els() && els().main.querySelector('[data-chap-focus]');
      if (f) f.focus();
    }

    function stopChapter() {
      if (!chapRunning()) return;
      chap.stop = true;
      if (gen && gen.phase === 'writing') stopGen();
      renderGen();
    }

    /** The chapter's card (design 23b, 3 to 6b). */
    function chapterHtml() {
      const c = chap;
      const n = c.items.length;
      const k = Math.min(c.k, n - 1);
      const ok = (t) => `<span class="wr-q-st is-ok">${ICON.check(14)}${t}</span>`;
      const rows = c.items.map((it) => {
        let st;
        switch (it.status) {
          case 'done': st = ok(c.state === 'run' ? `Written · ${fmt(it.words)} words` : `${fmt(it.words)} words`); break;
          case 'now': st = '<span class="wr-q-st is-now"><span class="wr-imp-spin" aria-hidden="true"></span>Writing now</span>'; break;
          case 'stopped': st = '<span class="wr-q-st is-now">Stopped</span>'; break;
          case 'failed': st = `<span class="wr-q-st is-bad">${ICON.x(14)}Failed</span>`; break;
          case 'unsent': st = '<span class="wr-q-st">Not sent</span>'; break;
          case 'unwritten': st = '<span class="wr-q-st">Not written</span>'; break;
          default: st = '<span class="wr-q-st">Waiting</span>';
        }
        const sub = it.status === 'stopped' && it.versionNo ? '<span class="wr-q-sub">Partial text in Versions</span>' : '';
        const now = it.status === 'now' || it.status === 'stopped' || it.status === 'failed';
        return `<li${now ? ' class="is-now"' : ''} data-chap-item="${esc(it.n)}"><span class="wr-q-n">${esc(it.n)}</span><span class="wr-q-what">${esc(it.title)}${sub}</span>${st}</li>`;
      }).join('');
      const list = `<ol class="wr-q-list wr-chap-list" aria-label="Generate chapter progress">${rows}</ol>`;
      if (c.state === 'run') {
        const it = c.items[k];
        const g = gen && gen.id === it.id ? gen : null;
        const words = g ? W.count(g.text) : 0;
        const goal = g && g.aim;
        const pct = goal ? Math.min(100, Math.round((words / goal) * 100)) : 0;
        const stopping = c.stop || (g && g.phase === 'stopping');
        const title = stopping ? 'Stopping and saving…' : `Writing ${esc(it.n)} ${esc(it.title)}`;
        return `<section class="wr-gen wr-chap" aria-labelledby="wrChapTitle" data-chap="run">
            <div class="chip-label">GENERATE CHAPTER · ${k + 1} OF ${n}</div>
            ${list}
            <h3 id="wrChapTitle">${title}</h3>
            <div class="wr-gen-row">
              ${goal ? `<span class="wr-bar wr-gen-bar" aria-hidden="true"><span style="width: ${pct}%"></span></span>` : ''}
              <span class="wr-gen-count" data-gen-count>${goal ? `≈ ${fmt(words)} / ${fmt(goal)} words` : `≈ ${fmt(words)} words`}</span>
            </div>
            <button type="button" class="btn btn-secondary wr-gen-stop" data-chap-stop${stopping || !g || g.phase === 'saving' ? ' disabled' : ''}>${stopping ? 'Stopping…' : 'Stop'}</button>
            <p class="wr-chap-small">Stop ends this section's writing (its text so far is saved in Versions) and cancels the rest.</p>
          </section>`;
      }
      const close = (extra = '') => `<button type="button" class="${extra || 'btn btn-secondary btn-sm'}" data-chap-close${extra ? '' : ' data-chap-focus'}>Close</button>`;
      if (c.state === 'done') {
        const total = c.items.reduce((a, x) => a + x.words, 0);
        return `<section class="wr-gen wr-chap" role="status" aria-labelledby="wrChapTitle" data-chap="done">
            <div class="chip-label">GENERATE CHAPTER · DONE</div>
            <h3 id="wrChapTitle">Chapter ${c.num} is written</h3>
            ${list}
            <p class="wr-chap-text">${n === 1 ? '1 section' : `${fmt(n)} sections`}, ${fmt(total)} words. Each is a new version with the status Draft. Next, read each one and run its AI check.</p>
            <div class="wr-note-actions">${close()}</div>
          </section>`;
      }
      const label = c.state === 'stopped' ? 'GENERATE CHAPTER · STOPPED' : `GENERATE CHAPTER · ${k + 1} OF ${n}`;
      const it = c.items[k];
      let alert, actions;
      if (c.state === 'stopped') {
        const rest = c.chapterId && host.chapterById(c.chapterId) ? emptySections(host.chapterById(c.chapterId)).length : 0;
        alert = `<div class="alert alert-warning wr-chap-alert" role="alert">${ICON.warn(16)}<p class="alert-text">${c.error || 'Writing stopped.'}</p></div>`;
        actions = `${rest ? `<button type="button" class="btn btn-secondary btn-sm" data-chap-rest data-chap-focus>Generate the rest (${fmt(rest)})</button>` : ''}${close(rest ? 'link-btn' : '')}`;
      } else if (c.state === 'limit') {
        alert = `<div class="alert alert-warning wr-chap-alert" role="alert">${ICON.warn(16)}<p class="alert-text">You have used this month’s AI allowance. It resets on ${esc(kdpUsage.resetsText())}.</p></div>
          <p class="wr-chap-small">The server refused ${esc(it.n)} before any AI call. This refusal was not counted.</p>`;
        actions = close();
      } else {
        alert = `<div class="alert alert-error wr-chap-alert" role="alert">${ICON.x(16)}<p class="alert-text">${c.error}</p></div>`;
        actions = `<button type="button" class="btn btn-primary btn-sm" data-chap-retry data-chap-focus${genBlock() ? ' disabled' : ''}>Try again from ${esc(it.n)}</button><button type="button" class="link-btn" data-chap-close>Stop</button>`;
      }
      return `<section class="wr-gen wr-chap" aria-labelledby="wrChapTitle" data-chap="${c.state}">
          <div class="chip-label">${label}</div>
          <h3 id="wrChapTitle">Writing stopped</h3>
          ${alert}
          ${list}
          <div class="wr-note-actions">${actions}</div>
        </section>`;
    }

    function closeChapter() {
      chap = null;
      renderGenShell();
      const b = els() && els().main.querySelector('[data-gen-chapter]');
      if (b && !b.disabled) b.focus();
    }

    /** Clicks on the Generate button and the run's cards. True when handled. */
    function handleClick(t) {
      if (t.hasAttribute('data-gen-chapter')) { openChapterDialog(); return true; }
      if (t.hasAttribute('data-chap-stop')) { stopChapter(); return true; }
      if (t.hasAttribute('data-chap-close')) { closeChapter(); return true; }
      if (t.hasAttribute('data-chap-retry')) { if (chap && !genBlock()) { chap.state = 'run'; chap.stop = false; chap.error = ''; chap.items[chap.k].status = 'wait'; runChapter(); } return true; }
      if (t.hasAttribute('data-chap-rest')) { chap = null; renderGenShell(); openChapterDialog(); return true; }
      if (t.hasAttribute('data-generate') || t.hasAttribute('data-gen-retry')) { if (gen && gen.phase === 'ended') gen = null; generate(false); return true; }
      if (t.hasAttribute('data-gen-stop')) { stopGen(); return true; }
      if (t.hasAttribute('data-gen-keep')) { keepPartial(); return true; }
      if (t.hasAttribute('data-gen-discard')) { discardPartial(); return true; }
      if (t.hasAttribute('data-gen-copy')) { copyGenText(); return true; }
      if (t.hasAttribute('data-gen-close')) { gen = null; renderGenShell(); const b = els().main.querySelector('[data-generate]'); if (b && !b.disabled) b.focus(); return true; }
      if (t.hasAttribute('data-run-check')) { loadRun(); return true; }
      return false;
    }

    return {
      render: renderGen,
      renderStream,
      block: genBlock,
      // While Generate chapter runs, the whole step is busy (Generate section, Improve and the AI check are off).
      busy: () => genBusy() || chapRunning(),
      busyOn: (id) => (genBusy() && gen.id === id) || chapRunning(),
      chapterButton,
      chapterRunning: chapRunning,
      /** The section Generate chapter is writing now (the manuscript's "Writing…" pill). */
      writingNow: (id) => chapRunning() && chap.items[chap.k] && chap.items[chap.k].id === id,
      on: (id) => !!(gen && gen.id === id),
      keptOn: (id) => !!gen && gen.id === id && !!gen.outcome && gen.outcome.kind === 'save_failed',
      /** Opening another section: an old section's result card goes (a run in progress stays). */
      dropOther: (id) => { if (gen && gen.id !== id && !genBusy()) gen = null; },
      loadRun,
      handleClick,
      leave
    };
  }

  window.kdpWriteGenerate = { create };
})();
