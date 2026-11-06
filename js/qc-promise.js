/* ═══════════════════════════════════════════════════
   NicheInk · Step 07: the promise check (designs 54, 55 D, group 6 of 53; plan 6.1)
   /js/qc-promise.js   (used by js/book-qc.js; needs js/qc-promise-key.js,
                        js/qc-rules.js, js/usage-rules.js, js/word-budget.js)

   One paid AI call per chapter, never by itself: the cost shows first (54 A).
   The server reads the saved text and writes book_checks; the browser only
   reads the rows. A chapter is Out of date when its key on screen differs from
   the saved one (plan 4.9).

   The loop lives in this page, not in the step, so 06 or any other step can
   open while it runs (54 B). One chapter at a time. Stop ends it after the
   chapter in flight, even when that chapter fails. A failure pauses it on
   55 D: Try again goes on from that chapter, Close ends it. A lost connection reads qc_json again first, because
   the server may have saved the chapter, and never pays twice for one it finds.

   Replies are kept in `seen`: a qc_json read that started before a reply must
   not take the reply off the screen (the read in load() when 07 opens again).

   Group 6 rows come from items(), in the shape of a run's items, so Mark as OK,
   Undo and Open in 06 work as in the other groups. Rows are never saved in
   qc_runs. A row's ref is "d:" + the chapter id: it holds still when a new
   reply adds a row.

   kdpQcPromise.create(host) → { card, adopt, items, item, summary, emptyLine,
                                 verify, click, close }
     host: book, qc, setQc, read, paint, focus(selector), okState(x), ui
     card(wide): the promise card in its state. wide = the card of design 52.
═══════════════════════════════════════════════════ */

(function () {
  const { esc, ICON } = kdpUi;
  const LABEL = '6 · PROMISE CHECK · AI';
  const NOTE = 'The book result comes from the chapter results. No extra AI call. A chapter edited after its check shows "Out of date" and can be checked alone.';

  const fmt = (n) => Number(n).toLocaleString('en-US');
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  const about = (cost) => { const t = kdpUsage.costText(cost); return t.charAt(0).toLowerCase() + t.slice(1); };

  /** "Chapters 1 to 4 are saved." "Chapter 2 is saved." "Chapters 1 to 3, 5 and 7 are saved." */
  function savedWords(nums) {
    if (!nums.length) return '';
    if (nums.length === 1) return `Chapter ${nums[0]} is saved.`;
    const list = [...nums].sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < list.length; i++) {
      let j = i;
      while (list[j + 1] === list[j] + 1) j++;
      if (j - i >= 2) parts.push(`${list[i]} to ${list[j]}`);
      else parts.push(...list.slice(i, j + 1).map(String));
      i = j;
    }
    const last = parts.pop();
    return `Chapters ${parts.length ? `${parts.join(', ')} and ${last}` : last} are saved.`;
  }

  function create(host) {
    let job = null;              // the run: { rows, at, done, skip, stopping, fail }
    const seen = new Map();      // chapter id → the newest reply of this page
    const failed = new Set();    // chapters whose last try failed: Check again shows
    const counted = new Map();   // version id → words (a row list is read on every paint)
    let d = null;                // the confirm dialog
    let ask = 0;                 // the open dialog, so an old usage read is dropped

    const { chip, CHECK, WARN } = host.ui;
    const qc = () => host.qc();
    const lim = () => kdpQcPromiseKey.LIMITS;
    const locked = () => { const q = qc(); return !!(q && q.positioning && q.positioning.locked_at); };

    const wordsOf = (v) => {
      if (!counted.has(v.id)) counted.set(v.id, kdpWords.count(v.content));
      return counted.get(v.id);
    };

    /** Characters of what the server sends for this chapter, for the estimate. */
    function charsOf(c, withText) {
      return withText.reduce((a, s) => a + String(s.title || '').length + s.version.content.length, String(c.title || '').length + String(c.objective || '').length);
    }

    function positioningChars() {
      const p = qc().positioning || {};
      return [p.one_sentence, p.reader_promise, p.approach, p.lacks, p.selling_points, p.focus_tags].flat(2).filter((v) => typeof v === 'string').join('').length;
    }

    /** Every chapter of the book today, with its status. */
    function rowsNow() {
      const q = qc();
      if (!q || !q.data) return [];
      const saved = new Map((q.promise || []).map((r) => [r.chapter_id, r]));
      let n = 0;
      return (q.data.chapters || []).filter((c) => c.kind === 'chapter').map((c) => {
        n++;
        const ids = new Set(kdpQcPromiseKey.versionIds(c));
        const withText = (c.sections || []).filter((s) => s.version && ids.has(s.version.id));
        const words = withText.reduce((a, s) => a + wordsOf(s.version), 0);
        const row = saved.get(c.id) || null;
        const current = !!row && !!withText.length && kdpQcPromiseKey.ofChapter(c, q.positioning) === row.inputs_key;
        const why = !withText.length ? 'No text'
          : words < lim().minWords ? `Under ${fmt(lim().minWords)} words`
            : words > lim().maxWords ? `Over ${fmt(lim().maxWords)} words` : '';
        const status = current ? row.verdict : why ? 'skipped' : row ? 'stale' : 'none';
        return { c, n, title: String(c.title || '').trim() || 'Untitled chapter', row, status, why, first: withText[0] ? withText[0].id : null, chars: charsOf(c, withText) };
      });
    }

    const queued = (x) => x.status === 'stale' || x.status === 'none';
    const estimate = (list, usage) => kdpUsage.promiseEstimate(usage || null, list.map((x) => x.chars), positioningChars());

    /* ── What js/book-qc.js reads ───────────── */

    /** Keeps the replies of this page on a fresh read, unless the read is newer. */
    function adopt(q) {
      const list = (q.promise || []).filter((r) => { const s = seen.get(r.chapter_id); return !s || Date.parse(r.checked_at) >= Date.parse(s.checked_at); });
      for (const [id, s] of seen) if (!list.some((r) => r.chapter_id === id)) list.push(s);
      q.promise = list;
    }

    function itemOf(x) {
      return {
        g: 6, rule: 'promise_drift', key: kdpQcRules.driftKey(x.row), section_id: x.row.section_id || null, version_id: null, start: null, end: null,
        quote: x.row.quote || '', message: x.row.reason, unsourced: x.row.unsourced || [], chapter_id: x.c.id, open_id: x.row.section_id || x.first
      };
    }

    /** The drifting chapters with a current check, as run items, in book order. */
    const items = () => rowsNow().filter((x) => x.status === 'drifts').map(itemOf);
    const item = (chapterId) => items().find((x) => x.chapter_id === chapterId) || null;

    function summary() {
      const rows = rowsNow();
      const count = (...s) => rows.filter((x) => s.includes(x.status)).length;
      return { current: count('keeps', 'drifts'), keeps: count('keeps'), stale: count('stale'), none: count('none') };
    }

    const hasResult = () => { const s = summary(); return s.current + s.stale > 0 || failed.size > 0; };

    /** Group 6 with no open row. */
    function emptyLine() {
      const s = summary();
      if (s.current) return 'No drift to fix.';
      return s.stale ? 'These checks are out of date. Check the chapters again.' : 'Not run yet. The promise check is optional.';
    }

    const verify = (nums) => (nums && nums.length
      ? ` <span class="check-badge warn">${ICON.warn()}Verify: no source for ${esc(nums.join(', '))}</span>` : '');

    /* ── The card ───────────────────────────── */

    function checkButton(text = 'Check the promise') {
      return `<button type="button" class="btn btn-secondary" data-pr-check>${esc(text)}</button>`;
    }

    /** Why the button is off today, or '' when it is on. */
    function offWhy(rows) {
      if (!locked()) return 'Lock 03 Positioning to check the promise.';
      if (!rows.some((x) => x.first)) return 'No chapter has text yet.';
      if (rows.some(queued)) return '';
      if (rows.some((x) => x.status === 'keeps' || x.status === 'drifts')) return 'The chapters are up to date.';
      return `No chapter has ${fmt(lim().minWords)} to ${fmt(lim().maxWords)} words.`;
    }

    function idleCard(wide, rows) {
      const why = offWhy(rows);
      const cost = why ? 0 : estimate(rows.filter(queued)).cost;
      const off = '<button type="button" class="btn btn-secondary" disabled>Check the promise</button>';
      if (wide) {
        return `<section class="qc-card qc-promise-wide" data-pr-card>
            <div class="qc-promise-text">
              <p class="chip-label">${LABEL}</p>
              <p class="qc-lead">Compares each chapter with your locked promise in 03 Positioning. One AI call per chapter. You see the cost before it runs.</p>
            </div>
            ${why ? `<div class="qc-off">${off}<p class="qc-note">${esc(why)}</p></div>` : checkButton(`Check the promise · ${about(cost)}`)}
          </section>`;
      }
      return `<section class="qc-card qc-side-card" data-pr-card>
          <p class="chip-label">${LABEL}</p>
          <p class="qc-fact">Checks each of the ${plural(rows.length, 'chapter', 'chapters')} against your locked promise. One call per chapter.</p>
          ${why ? `<div class="qc-off">${off}<p class="qc-note">${esc(why)}</p></div>`
            : `<div class="qc-off">${checkButton()}<p class="qc-note">${esc(kdpUsage.costText(cost))}. You confirm before it runs.</p></div>`}
        </section>`;
    }

    /* 54 B */

    function runTitle() {
      const total = job.rows.length;
      if (total === 1) return `Checking chapter ${job.rows[0].n}`;
      return `Checking chapter ${Math.min(job.at + 1, total)} of ${total}`;
    }

    function runRows() {
      return job.rows.map((r, i) => {
        const tag = job.skip.has(r.id) ? chip('info', 'Skipped')
          : job.done.has(r.id) ? chip('ok', 'Done', CHECK(14, 2.4))
            : i === job.at ? chip('info', 'Checking…') : chip('info', 'Waiting');
        const waiting = i > job.at && !job.done.has(r.id);
        return `<li class="qc-pr-row"><span class="qc-pr-num">${r.n}</span><span class="qc-pr-name${waiting ? ' is-wait' : ''}">${esc(r.title)}</span>${tag}</li>`;
      }).join('');
    }

    const runPct = () => Math.round((job.at / job.rows.length) * 100);

    function runCard() {
      return `<section class="qc-card qc-side-card qc-pr" data-pr-card>
          <p class="chip-label">${LABEL}</p>
          <h2 class="qc-pr-title" tabindex="-1" data-pr-title>${esc(runTitle())}</h2>
          <div class="qc-bar is-full" role="progressbar" aria-valuenow="${runPct()}" aria-valuemin="0" aria-valuemax="100" aria-label="Promise check progress" data-pr-bar><i style="width:${runPct()}%"></i></div>
          <ul class="qc-pr-rows" aria-live="off" data-pr-rows>${runRows()}</ul>
          <p class="qc-note">You can open other steps. Finished chapters are saved.</p>
          <button type="button" class="btn btn-secondary qc-self" data-pr-stop${job.stopping ? ' disabled' : ''}>${job.stopping ? 'Stopping…' : 'Stop'}</button>
        </section>`;
    }

    /** One chapter moved on: only what changed, so the focus stays and the live area says little. */
    function syncRun() {
      const q = document.querySelector('[data-pr-card]');
      if (!job || !q || !q.querySelector('[data-pr-rows]')) return;
      q.querySelector('[data-pr-title]').textContent = runTitle();
      const bar = q.querySelector('[data-pr-bar]');
      bar.setAttribute('aria-valuenow', runPct());
      bar.firstElementChild.style.width = `${runPct()}%`;
      q.querySelector('[data-pr-rows]').innerHTML = runRows();
    }

    /* 55 D */

    function failText(f) {
      const n = job.rows[job.at] ? job.rows[job.at].n : job.rows[job.rows.length - 1].n;
      const saved = savedWords(job.rows.filter((r) => job.done.has(r.id)).map((r) => r.n));
      const shortLine = (title) => ({ warn: true, title, sub: saved, button: 'Try again' });
      switch (f.code) {
        case 'network': return { title: `We lost the connection during chapter ${f.n}.`, sub: 'Finished chapters are saved.', button: 'Try again' };
        case 'rate_limited': return shortLine(kdpUi.aiMessage('rate_limited')[1]);
        case 'monthly_limit': return shortLine(kdpUi.aiMessage('monthly_limit')[1]);
        case 'positioning_not_locked': return shortLine('Lock 03 Positioning to check the promise.');
        case 'run_in_progress': return shortLine(`Chapter ${n} is being written in 06. Wait for it to finish.`);
        case 'unauthorized': return shortLine('Your session ended. Sign in again, then try again.');
        default: return { title: `The AI did not answer for chapter ${n}.`, sub: `${saved ? `${saved} ` : ''}This attempt was not counted in your usage.`, button: `Try chapter ${n} again` };
      }
    }

    function failCard() {
      const t = failText(job.fail);
      return `<section class="qc-card qc-side-card qc-pr" data-pr-card>
          <p class="chip-label">${LABEL}</p>
          <div class="qc-box ${t.warn ? 'is-warning' : 'is-danger'}" role="alert" data-pr-fail>
            <strong>${WARN(16)}${esc(t.title)}</strong>
            ${t.sub ? `<span class="qc-sub">${esc(t.sub)}</span>` : ''}
            <div class="qc-btns"><button type="button" class="btn btn-primary" data-pr-retry${job.fail.busy ? ' disabled' : ''}>${esc(t.button)}</button><button type="button" class="btn btn-secondary" data-pr-close${job.fail.busy ? ' disabled' : ''}>Close</button></div>
          </div>
        </section>`;
    }

    /* 54 C */

    function chipOf(x) {
      switch (x.status) {
        case 'keeps': return chip('ok', 'Keeps it', CHECK(14, 2.4));
        case 'drifts': return chip('warn', 'Drifts', WARN(14));
        case 'stale': return chip('info', 'Out of date');
        case 'skipped': return chip('info', 'Skipped');
        default: return chip('info', 'Not checked');
      }
    }

    function driftActs(x) {
      const it = itemOf(x);
      const ok = host.okState(it);
      const err = ok.err ? `<p class="qc-row-err" role="alert">${ICON.warn(14)}<span>${esc(ok.err)}</span></p>` : '';
      if (ok.row) {
        return `<div class="qc-pr-acts"><span class="qc-note">Marked as OK.</span><button type="button" class="qc-undo" data-undo="${esc(ok.row.id || '')}"${ok.row.id && !ok.off ? '' : ' disabled'}>Undo</button></div>${err}`;
      }
      const href = `?id=${encodeURIComponent(host.book().id)}&step=6&section=${encodeURIComponent(it.open_id)}`;
      return `<div class="qc-pr-acts"><a class="qc-lk" href="${esc(href)}" data-pr-open="${esc(x.c.id)}">Open in 06</a><button type="button" class="qc-lk2" data-pr-ok="${esc(x.c.id)}"${ok.off ? ' disabled' : ''}>Mark as OK</button></div>${err}`;
    }

    function resultRow(x) {
      const again = locked() && (x.status === 'stale' || (x.status === 'none' && failed.has(x.c.id)));
      const lines = [];
      if (x.status === 'drifts') lines.push(`<p class="qc-pr-why">${esc(`"${x.row.reason}"`)}${verify(x.row.unsourced)}</p>`, driftActs(x));
      if (x.status === 'skipped') lines.push(`<p class="qc-pr-why">${esc(x.why)}</p>`);
      if (again) lines.push(`<div class="qc-pr-acts"><button type="button" class="qc-lk" data-pr-again="${esc(x.c.id)}">Check again · ${esc(about(estimate([x]).cost))}</button></div>`);
      return `<li class="qc-pr-row" tabindex="-1" data-pr-row="${esc(x.c.id)}"><span class="qc-pr-num">${x.n}</span><span class="qc-pr-name">${esc(x.title)}</span>${chipOf(x)}${lines.join('')}</li>`;
    }

    function resultCard(rows) {
      const m = rows.filter((x) => x.status === 'keeps' || x.status === 'drifts').length;
      const n = rows.filter((x) => x.status === 'keeps').length;
      const good = m > 0 && n === m;
      const head = m ? `${fmt(n)} of ${plural(m, 'chapter keeps', 'chapters keep')} the promise.` : 'No chapter has a current check.';
      const more = rows.filter(queued);
      return `<section class="qc-card qc-side-card qc-pr" data-pr-card>
          <p class="chip-label">${LABEL}</p>
          <div class="qc-pr-banner${good ? ' is-ok' : ''}" role="status" tabindex="-1" data-pr-result>${good ? CHECK(14) : WARN(14)}<span>${esc(head)}</span></div>
          <ul class="qc-pr-rows is-result">${rows.map(resultRow).join('')}</ul>
          <p class="qc-note">${esc(NOTE)}</p>
          ${locked() && more.length ? `<div class="qc-off">${checkButton()}<p class="qc-note">${esc(`${kdpUsage.costText(estimate(more).cost)}. You confirm before it runs.`)}</p></div>` : ''}
        </section>`;
    }

    function card(wide) {
      if (job) return job.fail ? failCard() : runCard();
      const rows = rowsNow();
      return hasResult() ? resultCard(rows) : idleCard(wide, rows);
    }

    /* ── The run ────────────────────────────── */

    function start(ids) {
      if (job) return;
      const now = rowsNow();
      const rows = ids.map((id) => now.find((x) => x.c.id === id)).filter(Boolean).map((x) => ({ id: x.c.id, n: x.n, title: x.title }));
      if (!rows.length) return;
      job = { rows, at: 0, done: new Set(), skip: new Set(), stopping: false, fail: null };
      host.focus('[data-pr-stop]');
      host.paint();
      loop();
    }

    async function finish() {
      const reread = job.skip.size > 0;
      job = null;
      // A chapter the server refused changed after the confirm: show it as it is now.
      if (reread) { const res = await host.read(); if (!res.error) host.setQc(res.data); }
      host.focus('[data-pr-result], [data-pr-check]');
      host.paint();
    }

    function nextChapter(id, data) {
      if (data) { seen.set(id, data); adopt(qc()); job.done.add(id); failed.delete(id); }
      else job.skip.add(id);
      job.at++;
      syncRun();
    }

    /** After a lost connection: did the server save it? Moves on when it did. */
    async function recheck() {
      const f = job.fail;
      const res = await host.read();
      if (res.error) { f.read = false; return; }
      f.read = true;
      host.setQc(res.data);
      const row = rowsNow().find((x) => x.c.id === f.id);
      if (row && (row.status === 'keeps' || row.status === 'drifts')) {
        job.done.add(f.id);
        failed.delete(f.id);
        job.at++;
      }
    }

    async function loop() {
      while (job.at < job.rows.length && !job.stopping) {
        const { id, n } = job.rows[job.at];
        syncRun();
        let res;
        try { res = await kdp.promiseCheck({ bookId: host.book().id, chapterId: id }); } catch (e) { res = { error: { code: 'network' } }; }
        if (!res.error) { nextChapter(id, res.data); continue; }
        const code = res.error.code;
        // The chapter changed after the confirm. Nothing was spent: go on.
        if (['not_found', 'nothing_to_check', 'check_too_short', 'check_too_long'].includes(code)) { nextChapter(id, null); continue; }
        failed.add(id);
        job.fail = { code, id, n, read: false, busy: false };
        if (code === 'network') {
          await recheck();
          if (job.at >= job.rows.length) { await finish(); return; }
        }
        // Stop stays stopped: the result shows, with Check again on this chapter.
        if (job.stopping) break;
        host.focus('[data-pr-retry]');
        host.paint();
        return;
      }
      await finish();
    }

    async function tryAgain() {
      const f = job.fail;
      if (f.busy) return;
      // No paid call until the read shows what the server saved.
      if (f.code === 'network' && !f.read) {
        f.busy = true;
        host.paint();
        await recheck();
        f.busy = false;
        if (job.at >= job.rows.length) { await finish(); return; }
        if (!f.read) { host.focus('[data-pr-retry]'); host.paint(); return; }
      }
      job.fail = null;
      job.stopping = false;
      host.focus('[data-pr-stop]');
      host.paint();
      loop();
    }

    function closeFail() {
      if (job.fail.busy) return;
      job = null;
      host.focus('[data-pr-result], [data-pr-check]');
      host.paint();
    }

    function stop() {
      if (!job || job.stopping) return;
      job.stopping = true;
      host.focus('[data-pr-title]');
      host.paint();
    }

    /* ── 54 A: the confirm ──────────────────── */

    const close = () => { if (d && d.open) d.close(); };

    function buildDialog() {
      d = document.createElement('dialog');
      d.className = 'dialog qc-pr-dialog';
      d.setAttribute('aria-labelledby', 'qcPrTitle');
      d.innerHTML = `
        <div class="dialog-inner">
          <h2 id="qcPrTitle">Check the promise?</h2>
          <p class="qc-lead">The AI compares each chapter with your locked promise and the chapter's objective from 05 Outline.</p>
          <dl class="qc-pr-facts" data-pr-facts></dl>
          <div data-pr-warn></div>
          <p class="qc-note">Counts in your AI usage in Settings. Chapters with no text are skipped.</p>
          <div class="qc-pr-skips" data-pr-skips></div>
          <div class="qc-btns"><button type="button" class="btn btn-primary" data-pr-go></button><button type="button" class="btn btn-secondary" data-pr-cancel>Cancel</button></div>
        </div>`;
      document.body.append(d);
      d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
      d.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t || t.disabled) return;
        if (t.matches('[data-pr-cancel]')) close();
        else if (t.matches('[data-pr-go]')) { const ids = d.ids; close(); start(ids); }
      });
      d.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const list = [...d.querySelectorAll('button')].filter((b) => !b.disabled);
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }

    function factsHtml(list, e, room) {
      const row = (a, b) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`;
      return row('Chapters', fmt(list.length)) + row('AI calls', `${fmt(list.length)}, one per chapter`) + row('Estimated cost', about(e.cost)) + row('Room this month', room);
    }

    function fillRoom(list, usage, failedRead) {
      const e = estimate(list, usage);
      const room = failedRead ? "We couldn't read it" : usage ? `${kdpUsage.tokensText(e.left)} tokens left` : 'Reading…';
      d.querySelector('[data-pr-facts]').innerHTML = factsHtml(list, e, room);
      const warn = d.querySelector('[data-pr-warn]');
      warn.innerHTML = e.none
        ? `<div class="alert alert-warning" role="alert">${ICON.warn(16)}<p class="alert-text"><strong>You have used this month's AI allowance.</strong> It resets on ${esc(e.resets)}.</p></div>`
        : e.over
          ? `<div class="alert alert-warning" role="alert">${ICON.warn(16)}<p class="alert-text"><strong>This may pass your monthly AI allowance.</strong> It needs about ${esc(kdpUsage.tokensText(e.tokens))} tokens. You have about ${esc(kdpUsage.tokensText(e.left))} left. It resets on ${esc(e.resets)}.</p></div>`
          : '';
      d.querySelector('[data-pr-go]').disabled = (!usage && !failedRead) || e.none;
    }

    function skipsHtml(rows) {
      const fresh = rows.filter((x) => x.status === 'keeps' || x.status === 'drifts').length;
      const others = rows.filter((x) => x.status === 'skipped');
      if (!fresh && !others.length) return '';
      const up = fresh ? `<li>${esc(fresh === 1 ? '1 chapter is up to date and is skipped' : `${fmt(fresh)} chapters are up to date and are skipped`)}</li>` : '';
      return `<p class="chip-label">SKIPPED</p><ul>${up}${others.map((x) => `<li><span>${esc(`Chapter ${x.n}`)}</span><span>${esc(x.why)}</span></li>`).join('')}</ul>`;
    }

    async function openConfirm() {
      const rows = rowsNow();
      const list = rows.filter(queued);
      if (job || !locked() || !list.length) return;
      if (!d) buildDialog();
      d.ids = list.map((x) => x.c.id);
      const seq = ++ask;
      d.querySelector('[data-pr-go]').textContent = `Check ${plural(list.length, 'chapter', 'chapters')}`;
      d.querySelector('[data-pr-skips]').innerHTML = skipsHtml(rows);
      fillRoom(list, null, false);
      d.showModal();
      let res;
      try { res = await kdp.getUsageMonth(); } catch (e) { res = { error: e }; }
      if (seq === ask && d.open) fillRoom(list, res.data || null, !res.data);
    }

    /* ── Events ─────────────────────────────── */

    /** A click on the card. True when it was handled here. */
    function click(t) {
      if (t.matches('[data-pr-check]')) openConfirm();
      else if (t.matches('[data-pr-stop]')) stop();
      else if (t.matches('[data-pr-retry]')) tryAgain();
      else if (t.matches('[data-pr-close]')) closeFail();
      else if (t.dataset.prAgain) start([t.dataset.prAgain]);
      else return false;
      return true;
    }

    return { card, adopt, items, item, summary, emptyLine, verify, click, close };
  }

  window.kdpQcPromise = { create };
})();
